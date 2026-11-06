import VERTC, {
  AudioProfileType,
  AudioSourceType,
  ConnectionState,
  MediaType,
  RoomProfileType,
  StreamIndex,
  VideoSourceType,
  type IRTCEngine,
  type LocalAudioPropertiesInfo,
  type RemoteAudioPropertiesInfo,
} from "@volcengine/rtc";
import {
  RTC_PREVIEW_USER_SUFFIX,
  type ActiveShare,
  type QualityLevel,
  type RoomId,
  type RtcTokenResource,
  type RtcTokenRole,
  type ShareSettings,
} from "../shared/types";
import { api } from "./api";

const PREVIEW_ENCODER = {
  width: 640,
  height: 360,
  frameRate: 15,
  maxKbps: 300,
  contentHint: "detail" as const,
};

interface ScreenPublisherState {
  preview: boolean;
  main: boolean;
}

interface ActiveScreenSubscription {
  publisherUserId: string;
  quality: QualityLevel;
  mediaType: MediaType;
  stream: MediaStream;
  systemAudio: boolean;
}

export interface VolcRtcCallbacks {
  onRemoteScreen: (
    ownerId: string,
    stream: MediaStream | null,
    quality: QualityLevel,
  ) => void;
  onVoiceLevels: (levels: Record<string, number>) => void;
  onVoicePeerState: (userId: string, state: RTCPeerConnectionState) => void;
  onNotice: (message: string) => void;
  onConnectionState: (state: "connecting" | "connected" | "disconnected") => void;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function withRtcTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(message)),
      milliseconds,
    );
    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function ownerFromRtcUserId(userId: string): {
  ownerId: string;
  publisher: "preview" | "main";
} | null {
  if (userId.endsWith(RTC_PREVIEW_USER_SUFFIX)) {
    return {
      ownerId: userId.slice(0, -RTC_PREVIEW_USER_SUFFIX.length),
      publisher: "preview",
    };
  }
  return { ownerId: userId, publisher: "main" };
}

export function rtcScreenEncoderConfig(settings: ShareSettings) {
  const dimensions = {
    "360p": { width: 640, height: 360 },
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
    "1440p": { width: 2560, height: 1440 },
    "2160p": { width: 3840, height: 2160 },
    source: { width: 1920, height: 1080 },
  } as const;
  const dimensionsForMode = dimensions[settings.resolution];
  return {
    width: dimensionsForMode.width,
    height: dimensionsForMode.height,
    frameRate: settings.frameRate,
    maxKbps: settings.bitrateKbps,
    contentHint:
      settings.degradationPreference === "maintain-framerate"
        ? ("motion" as const)
        : ("detail" as const),
  };
}

export class VolcRtcClient {
  private mainEngine: IRTCEngine | null = null;
  private previewEngine: IRTCEngine | null = null;
  private mainToken: RtcTokenResource | null = null;
  private previewToken: RtcTokenResource | null = null;
  private refreshTimer: number | null = null;
  private readonly screenPublishers = new Map<string, ScreenPublisherState>();
  private readonly desiredQuality = new Map<string, QualityLevel>();
  private readonly shares = new Map<string, ActiveShare>();
  private readonly activeScreens = new Map<string, ActiveScreenSubscription>();
  private readonly screenTasks = new Map<string, Promise<void>>();
  private readonly voiceSubscriptions = new Set<string>();
  private readonly voiceTasks = new Map<string, Promise<void>>();
  private readonly remoteLevels = new Map<string, number>();
  private localLevel = 0;
  private voiceActive = false;
  private voiceMuted = false;
  private inputGain = 1;
  private outputVolume = 1;
  private outputMuted = false;
  private screenSharing = false;
  private currentScreenSettings: ShareSettings | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;
  private destroyed = false;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;

  constructor(
    private readonly roomId: RoomId,
    private readonly userId: string,
    private readonly callbacks: VolcRtcCallbacks,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = (async () => {
      this.callbacks.onConnectionState("connecting");
      this.mainToken = await api.rtcToken("main");
      this.mainEngine = await this.createJoinedEngine(this.mainToken, "main");
      this.bindEngineEvents(this.mainEngine, "main");
      this.mainEngine.enableAudioPropertiesReport({
        interval: 200,
        enableInBackground: true,
      });
      this.initialized = true;
      this.callbacks.onConnectionState("connected");
      for (const ownerId of this.shares.keys()) {
        void this.reconcileScreen(ownerId);
      }
    })().finally(() => {
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  private async createJoinedEngine(
    resource: RtcTokenResource,
    role: RtcTokenRole,
  ): Promise<IRTCEngine> {
    const engine = VERTC.createEngine(resource.appId);
    if (resource.businessId) engine.setBusinessId(resource.businessId);
    try {
      await withRtcTimeout(
        engine.joinRoom(
          resource.token,
          resource.roomId,
          {
            userId: resource.userId,
            extraInfo:
              role === "preview" ? "screen-preview" : "together-screen",
          },
          {
            isAutoPublish: false,
            isAutoSubscribeAudio: false,
            isAutoSubscribeVideo: false,
            roomProfileType: RoomProfileType.communication,
          },
        ),
        20_000,
        "火山 RTC 进房超时",
      );
      return engine;
    } catch (error) {
      engine.destroy();
      throw error;
    }
  }

  private bindEngineEvents(engine: IRTCEngine, role: RtcTokenRole) {
    engine.on(VERTC.events.onUserPublishScreen, (event) => {
      if (role !== "main") return;
      const publisher = ownerFromRtcUserId(event.userId);
      if (!publisher || publisher.ownerId === this.userId) return;
      const current = this.screenPublishers.get(publisher.ownerId) ?? {
        preview: false,
        main: false,
      };
      if (publisher.publisher === "preview") current.preview = true;
      else current.main = true;
      this.screenPublishers.set(publisher.ownerId, current);
      void this.reconcileScreen(publisher.ownerId);
    });

    engine.on(VERTC.events.onUserUnpublishScreen, (event) => {
      if (role !== "main") return;
      const publisher = ownerFromRtcUserId(event.userId);
      if (!publisher || publisher.ownerId === this.userId) return;
      const current = this.screenPublishers.get(publisher.ownerId);
      if (current) {
        if (publisher.publisher === "preview") current.preview = false;
        else current.main = false;
      }
      const active = this.activeScreens.get(publisher.ownerId);
      if (active?.publisherUserId === event.userId) {
        this.activeScreens.delete(publisher.ownerId);
        this.callbacks.onRemoteScreen(publisher.ownerId, null, "low");
      }
      void this.reconcileScreen(publisher.ownerId);
    });

    if (role === "main") {
      engine.on(VERTC.events.onUserPublishStream, (event) => {
        if (
          this.voiceActive &&
          !event.userId.endsWith(RTC_PREVIEW_USER_SUFFIX)
        ) {
          void this.subscribeVoice(event.userId);
        }
      });
      engine.on(VERTC.events.onUserUnpublishStream, (event) => {
        if (!event.userId.endsWith(RTC_PREVIEW_USER_SUFFIX)) {
          this.removeVoice(event.userId);
        }
      });
      engine.on(
        VERTC.events.onLocalAudioPropertiesReport,
        (reports: LocalAudioPropertiesInfo[]) => {
          const main = reports.find(
            (report) => report.streamIndex === StreamIndex.STREAM_INDEX_MAIN,
          );
          this.localLevel = main
            ? Math.min(1, main.audioPropertiesInfo.linearVolume / 255)
            : 0;
          this.emitVoiceLevels();
        },
      );
      engine.on(
        VERTC.events.onRemoteAudioPropertiesReport,
        (reports: RemoteAudioPropertiesInfo[]) => {
          for (const report of reports) {
            if (report.streamKey.streamIndex !== StreamIndex.STREAM_INDEX_MAIN) continue;
            this.remoteLevels.set(
              report.streamKey.userId,
              Math.min(1, report.audioPropertiesInfo.linearVolume / 255),
            );
          }
          this.emitVoiceLevels();
        },
      );
    }

    engine.on(VERTC.events.onConnectionStateChanged, (event) => {
      if (role !== "main") return;
      if (
        event.state === ConnectionState.CONNECTION_STATE_CONNECTED ||
        event.state === ConnectionState.CONNECTION_STATE_RECONNECTED
      ) {
        this.callbacks.onConnectionState("connected");
      } else if (
        event.state === ConnectionState.CONNECTION_STATE_DISCONNECTED ||
        event.state === ConnectionState.CONNECTION_STATE_LOST
      ) {
        this.callbacks.onConnectionState("disconnected");
      } else {
        this.callbacks.onConnectionState("connecting");
      }
    });

    engine.on(VERTC.events.onError, (event) => {
      this.callbacks.onNotice(`火山 RTC 连接异常（${event.errorCode}）`);
    });
    engine.on(VERTC.events.onTokenWillExpire, () => {
      void this.refreshToken(role);
    });
    engine.on(VERTC.events.onTokenPublishPrivilegeWillExpire, () => {
      void this.refreshToken(role);
    });
    engine.on(VERTC.events.onTokenSubscribePrivilegeWillExpire, () => {
      void this.refreshToken(role);
    });
  }

  private emitVoiceLevels() {
    const levels: Record<string, number> = {};
    if (this.voiceActive && !this.voiceMuted) levels[this.userId] = this.localLevel;
    for (const [userId, level] of this.remoteLevels) levels[userId] = level;
    this.callbacks.onVoiceLevels(levels);
  }

  private async refreshToken(role: RtcTokenRole) {
    if (this.destroyed) return;
    const engine = role === "main" ? this.mainEngine : this.previewEngine;
    if (!engine) return;
    try {
      const resource = await api.rtcToken(role);
      if (role === "main") this.mainToken = resource;
      else this.previewToken = resource;
      await engine.updateToken(resource.token);
    } catch (error) {
      this.callbacks.onNotice(
        error instanceof Error ? error.message : "火山 RTC Token 续期失败",
      );
    }
  }

  private startTokenRefresh() {
    if (this.refreshTimer !== null) return;
    this.refreshTimer = window.setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      if (this.mainToken && this.mainToken.expiresAt - now < 300) {
        void this.refreshToken("main");
      }
      if (this.previewToken && this.previewToken.expiresAt - now < 300) {
        void this.refreshToken("preview");
      }
    }, 60_000);
  }

  syncShares(shares: ActiveShare[]) {
    const nextIds = new Set(shares.map((share) => share.userId));
    for (const share of shares) {
      if (share.userId === this.userId) continue;
      this.shares.set(share.userId, share);
      if (!this.desiredQuality.has(share.userId)) {
        this.desiredQuality.set(share.userId, "low");
      }
      void this.reconcileScreen(share.userId);
    }
    for (const ownerId of this.shares.keys()) {
      if (nextIds.has(ownerId)) continue;
      this.shares.delete(ownerId);
      this.desiredQuality.delete(ownerId);
      this.clearScreen(ownerId);
    }
  }

  focusScreen(ownerId: string | null) {
    for (const [id, quality] of this.desiredQuality) {
      if (quality === "hd" && id !== ownerId) {
        this.desiredQuality.set(id, "low");
        void this.reconcileScreen(id);
      }
    }
    if (ownerId && this.shares.has(ownerId)) {
      this.desiredQuality.set(ownerId, "hd");
      void this.reconcileScreen(ownerId);
    }
  }

  syncVoice(userIds: Set<string>) {
    if (!this.voiceActive) {
      for (const userId of [...this.voiceSubscriptions]) this.removeVoice(userId);
      return;
    }
    const remoteIds = new Set(
      [...userIds].filter((userId) => userId !== this.userId),
    );
    for (const userId of remoteIds) void this.subscribeVoice(userId);
    for (const userId of [...this.voiceSubscriptions]) {
      if (!remoteIds.has(userId)) this.removeVoice(userId);
    }
  }

  private async reconcileScreen(ownerId: string) {
    if (this.screenTasks.has(ownerId)) return;
    const requestedQualityAtStart = this.desiredQuality.get(ownerId);
    const task = (async () => {
      const engine = this.mainEngine;
      if (!engine || this.destroyed || !this.shares.has(ownerId)) return;
      const publishers = this.screenPublishers.get(ownerId);
      const share = this.shares.get(ownerId);
      const desired = this.desiredQuality.get(ownerId) ?? "low";
      const previewUserId = `${ownerId}${RTC_PREVIEW_USER_SUFFIX}`;
      const candidates: Array<{
        publisherUserId: string;
        quality: QualityLevel;
        mediaType: MediaType;
        systemAudio: boolean;
      }> = [];
      if (desired === "hd") {
        if (publishers?.main !== false) {
          candidates.push({
            publisherUserId: ownerId,
            quality: "hd",
            mediaType: share?.settings.systemAudioEnabled
              ? MediaType.AUDIO_AND_VIDEO
              : MediaType.VIDEO,
            systemAudio: Boolean(share?.settings.systemAudioEnabled),
          });
        }
        if (publishers?.preview !== false) {
          candidates.push({
            publisherUserId: previewUserId,
            quality: "low",
            mediaType: MediaType.VIDEO,
            systemAudio: false,
          });
        }
      } else {
        if (publishers?.preview !== false) {
          candidates.push({
            publisherUserId: previewUserId,
            quality: "low",
            mediaType: MediaType.VIDEO,
            systemAudio: false,
          });
        }
        if (publishers?.main !== false) {
          candidates.push({
            publisherUserId: ownerId,
            quality: "low",
            mediaType: MediaType.VIDEO,
            systemAudio: false,
          });
        }
      }

      let selected:
        | {
            publisherUserId: string;
            quality: QualityLevel;
            mediaType: MediaType;
            systemAudio: boolean;
            stream: MediaStream;
          }
        | null = null;
      for (const candidate of candidates) {
        const active = this.activeScreens.get(ownerId);
        if (
          active?.publisherUserId === candidate.publisherUserId &&
          active.mediaType === candidate.mediaType
        ) {
          selected = { ...candidate, stream: active.stream };
          break;
        }
        try {
          await withRtcTimeout(
            engine.subscribeScreen(
              candidate.publisherUserId,
              candidate.mediaType,
            ),
            12_000,
            "火山 RTC 屏幕订阅超时",
          );
        } catch {
          continue;
        }
        let videoTrack =
          engine.getRemoteStreamTrack(
            candidate.publisherUserId,
            StreamIndex.STREAM_INDEX_SCREEN,
            "video",
          ) ?? null;
        for (let attempt = 0; !videoTrack && attempt < 12; attempt += 1) {
          await sleep(80);
          videoTrack =
            engine.getRemoteStreamTrack(
              candidate.publisherUserId,
              StreamIndex.STREAM_INDEX_SCREEN,
              "video",
            ) ?? null;
        }
        if (videoTrack) {
          selected = {
            ...candidate,
            stream: new MediaStream([videoTrack]),
          };
          break;
        }
        await engine
          .unsubscribeScreen(candidate.publisherUserId, candidate.mediaType)
          .catch(() => undefined);
      }
      if (!selected) return;
      const {
        publisherUserId,
        quality,
        mediaType,
        systemAudio,
        stream,
      } = selected;
      if (this.destroyed || !this.shares.has(ownerId)) {
        await engine
          .unsubscribeScreen(publisherUserId, mediaType)
          .catch(() => undefined);
        return;
      }
      const previous = this.activeScreens.get(ownerId);
      this.activeScreens.set(ownerId, {
        publisherUserId,
        quality,
        mediaType,
        stream,
        systemAudio,
      });
      this.callbacks.onRemoteScreen(ownerId, stream, quality);
      if (systemAudio) {
        await engine
          .play(ownerId, MediaType.AUDIO, StreamIndex.STREAM_INDEX_SCREEN)
          .catch(() => undefined);
      }
      if (previous && previous.publisherUserId !== publisherUserId) {
        await engine
          .unsubscribeScreen(previous.publisherUserId, previous.mediaType)
          .catch(() => undefined);
      } else if (
        previous?.mediaType === MediaType.AUDIO_AND_VIDEO &&
        mediaType === MediaType.VIDEO
      ) {
        await engine
          .unsubscribeScreen(publisherUserId, MediaType.AUDIO)
          .catch(() => undefined);
      }
      this.applyOutputVolumes();
    })()
      .catch(() => {
        // The other publisher may still be negotiating; its publish event retries.
      })
      .finally(() => {
        this.screenTasks.delete(ownerId);
        const active = this.activeScreens.get(ownerId);
        const desired = this.desiredQuality.get(ownerId);
        if (
          desired &&
          desired !== requestedQualityAtStart &&
          active?.quality !== desired &&
          this.screenPublishers.has(ownerId)
        ) {
          void this.reconcileScreen(ownerId);
        }
      });
    this.screenTasks.set(ownerId, task);
    await task;
  }

  private clearScreen(ownerId: string) {
    const active = this.activeScreens.get(ownerId);
    this.activeScreens.delete(ownerId);
    if (active && this.mainEngine) {
      void this.mainEngine
        .unsubscribeScreen(active.publisherUserId, active.mediaType)
        .catch(() => undefined);
    }
    this.callbacks.onRemoteScreen(ownerId, null, "low");
  }

  private async subscribeVoice(userId: string) {
    if (
      !this.mainEngine ||
      this.voiceSubscriptions.has(userId) ||
      this.voiceTasks.has(userId) ||
      userId === this.userId ||
      userId.endsWith(RTC_PREVIEW_USER_SUFFIX)
    ) {
      return;
    }
    const task = (async () => {
      await this.mainEngine!.subscribeStream(userId, MediaType.AUDIO);
      this.voiceSubscriptions.add(userId);
      await this.mainEngine
        ?.play(userId, MediaType.AUDIO, StreamIndex.STREAM_INDEX_MAIN)
        .catch(() => undefined);
      this.callbacks.onVoicePeerState(userId, "connected");
      this.applyOutputVolumes();
    })()
      .catch(() => undefined)
      .finally(() => {
        this.voiceTasks.delete(userId);
      });
    this.voiceTasks.set(userId, task);
    await task;
  }

  private removeVoice(userId: string) {
    this.voiceSubscriptions.delete(userId);
    this.remoteLevels.delete(userId);
    this.callbacks.onVoicePeerState(userId, "closed");
    if (this.mainEngine) {
      void this.mainEngine
        .unsubscribeStream(userId, MediaType.AUDIO)
        .catch(() => undefined);
    }
    this.emitVoiceLevels();
  }

  async startVoice(deviceId: string) {
    await this.initialize();
    const engine = this.mainEngine;
    if (!engine) throw new Error("火山 RTC 尚未连接");
    await withRtcTimeout(
      engine.setAudioProfile(AudioProfileType.standard),
      8_000,
      "火山 RTC 音频配置超时",
    );
    await withRtcTimeout(
      engine.setAudioCaptureConfig({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: { ideal: 48_000 },
      }),
      8_000,
      "火山 RTC 麦克风配置超时",
    );
    await withRtcTimeout(
      engine.startAudioCapture(deviceId || undefined),
      15_000,
      "火山 RTC 麦克风启动超时",
    );
    await withRtcTimeout(
      engine.publishStream(MediaType.AUDIO),
      15_000,
      "火山 RTC 麦克风发布超时",
    );
    this.voiceActive = true;
    this.voiceMuted = false;
    this.applyInputVolume();
  }

  async stopVoice() {
    const engine = this.mainEngine;
    this.voiceActive = false;
    this.voiceMuted = false;
    this.localLevel = 0;
    if (!engine) return;
    await engine.unpublishStream(MediaType.AUDIO).catch(() => undefined);
    await engine.stopAudioCapture().catch(() => undefined);
    this.emitVoiceLevels();
  }

  setVoiceMuted(muted: boolean) {
    this.voiceMuted = muted;
    this.applyInputVolume();
    this.emitVoiceLevels();
  }

  setInputGain(gain: number) {
    this.inputGain = gain;
    this.applyInputVolume();
  }

  private applyInputVolume() {
    this.mainEngine?.setCaptureVolume(
      StreamIndex.STREAM_INDEX_MAIN,
      this.voiceMuted ? 0 : Math.round(this.inputGain * 100),
    );
  }

  async switchMicrophone(deviceId: string) {
    const engine = this.mainEngine;
    if (!engine || !this.voiceActive) return;
    await engine.stopAudioCapture();
    await engine.startAudioCapture(deviceId || undefined);
    this.applyInputVolume();
  }

  setOutputVolume(volume: number) {
    this.outputVolume = Math.max(0, Math.min(1, volume));
    this.applyOutputVolumes();
  }

  setOutputMuted(muted: boolean) {
    this.outputMuted = muted;
    this.applyOutputVolumes();
  }

  private applyOutputVolumes() {
    const engine = this.mainEngine;
    if (!engine) return;
    const volume = this.outputMuted ? 0 : Math.round(this.outputVolume * 100);
    for (const userId of this.voiceSubscriptions) {
      engine.setPlaybackVolume(userId, StreamIndex.STREAM_INDEX_MAIN, volume);
    }
    for (const [ownerId, subscription] of this.activeScreens) {
      if (!subscription.systemAudio) continue;
      engine.setPlaybackVolume(ownerId, StreamIndex.STREAM_INDEX_SCREEN, volume);
    }
  }

  async startScreen(stream: MediaStream, settings: ShareSettings) {
    await this.initialize();
    const engine = this.mainEngine;
    if (!engine) throw new Error("火山 RTC 尚未连接");
    const video = stream.getVideoTracks()[0];
    if (!video) throw new Error("没有获取到屏幕视频");
    this.currentScreenSettings = settings;

    await withRtcTimeout(
      engine.setVideoSourceType(
        StreamIndex.STREAM_INDEX_SCREEN,
        VideoSourceType.VIDEO_SOURCE_TYPE_EXTERNAL,
      ),
      8_000,
      "火山 RTC 屏幕源配置超时",
    );
    await withRtcTimeout(
      engine.setScreenEncoderConfig(rtcScreenEncoderConfig(settings)),
      8_000,
      "火山 RTC 屏幕编码配置超时",
    );
    await withRtcTimeout(
      engine.setExternalVideoTrack(StreamIndex.STREAM_INDEX_SCREEN, video),
      8_000,
      "火山 RTC 屏幕轨道配置超时",
    );

    const audio = stream.getAudioTracks()[0];
    this.screenAudioTrack = audio ?? null;
    if (settings.systemAudioEnabled && audio) {
      await withRtcTimeout(
        engine.setAudioSourceType(
          StreamIndex.STREAM_INDEX_SCREEN,
          AudioSourceType.AUDIO_SOURCE_TYPE_EXTERNAL,
        ),
        8_000,
        "火山 RTC 系统声音源配置超时",
      );
      await withRtcTimeout(
        engine.setExternalAudioTrack(StreamIndex.STREAM_INDEX_SCREEN, audio),
        8_000,
        "火山 RTC 系统声音轨道配置超时",
      );
    }
    await withRtcTimeout(
      engine.publishScreen(
        settings.systemAudioEnabled && audio
          ? MediaType.AUDIO_AND_VIDEO
          : MediaType.VIDEO,
      ),
      15_000,
      "火山 RTC 主屏发布超时",
    );
    this.screenSharing = true;

    let previewEngine: IRTCEngine | null = null;
    try {
      this.previewToken = await api.rtcToken("preview");
      previewEngine = await this.createJoinedEngine(
        this.previewToken,
        "preview",
      );
      this.bindEngineEvents(previewEngine, "preview");
      await withRtcTimeout(
        previewEngine.setVideoSourceType(
          StreamIndex.STREAM_INDEX_SCREEN,
          VideoSourceType.VIDEO_SOURCE_TYPE_EXTERNAL,
        ),
        8_000,
        "火山 RTC 预览源配置超时",
      );
      await withRtcTimeout(
        previewEngine.setScreenEncoderConfig(PREVIEW_ENCODER),
        8_000,
        "火山 RTC 预览编码配置超时",
      );
      await withRtcTimeout(
        previewEngine.setExternalVideoTrack(
          StreamIndex.STREAM_INDEX_SCREEN,
          video,
        ),
        8_000,
        "火山 RTC 预览轨道配置超时",
      );
      await withRtcTimeout(
        previewEngine.publishScreen(MediaType.VIDEO),
        15_000,
        "火山 RTC 预览发布超时",
      );
      this.previewEngine = previewEngine;
    } catch (error) {
      previewEngine?.destroy();
      this.callbacks.onNotice(
        `${
          error instanceof Error ? error.message : "360p 预览流启动失败"
        }；已继续发布高清屏幕流`,
      );
    }
    this.startTokenRefresh();
  }

  async updateScreen(settings: ShareSettings) {
    const engine = this.mainEngine;
    if (!engine || !this.screenSharing) return;
    const previous = this.currentScreenSettings;
    this.currentScreenSettings = settings;
    await withRtcTimeout(
      engine.setScreenEncoderConfig(rtcScreenEncoderConfig(settings)),
      8_000,
      "火山 RTC 屏幕编码更新超时",
    );
    if (
      previous?.systemAudioEnabled === settings.systemAudioEnabled ||
      !this.previewEngine
    ) {
      return;
    }

    const audioTrack = this.screenAudioTrack;
    await withRtcTimeout(
      engine.unpublishScreen(MediaType.AUDIO_AND_VIDEO),
      8_000,
      "火山 RTC 屏幕切换超时",
    );
    if (settings.systemAudioEnabled && audioTrack) {
      await withRtcTimeout(
        engine.setAudioSourceType(
          StreamIndex.STREAM_INDEX_SCREEN,
          AudioSourceType.AUDIO_SOURCE_TYPE_EXTERNAL,
        ),
        8_000,
        "火山 RTC 系统声音源更新超时",
      );
      await withRtcTimeout(
        engine.setExternalAudioTrack(
          StreamIndex.STREAM_INDEX_SCREEN,
          audioTrack,
        ),
        8_000,
        "火山 RTC 系统声音轨道更新超时",
      );
      await withRtcTimeout(
        engine.publishScreen(MediaType.AUDIO_AND_VIDEO),
        15_000,
        "火山 RTC 系统声音重新发布超时",
      );
    } else {
      await withRtcTimeout(
        engine.publishScreen(MediaType.VIDEO),
        15_000,
        "火山 RTC 屏幕重新发布超时",
      );
      if (settings.systemAudioEnabled) {
        this.callbacks.onNotice(
          "当前屏幕源没有系统声音轨道，请停止共享、开启系统声音后重新共享",
        );
      }
    }
  }

  async stopScreen() {
    this.screenSharing = false;
    this.currentScreenSettings = null;
    const engine = this.mainEngine;
    if (engine) {
      await engine
        .unpublishScreen(MediaType.AUDIO_AND_VIDEO)
        .catch(() => undefined);
    }
    this.screenAudioTrack = null;
    const preview = this.previewEngine;
    this.previewEngine = null;
    this.previewToken = null;
    if (preview) {
      await preview
        .unpublishScreen(MediaType.AUDIO_AND_VIDEO)
        .catch(() => undefined);
      await preview.leaveRoom().catch(() => undefined);
      preview.destroy();
    }
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.refreshTimer !== null) window.clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    const preview = this.previewEngine;
    this.previewEngine = null;
    if (preview) {
      await preview.leaveRoom().catch(() => undefined);
      preview.destroy();
    }
    const main = this.mainEngine;
    this.mainEngine = null;
    if (main) {
      await main.leaveRoom().catch(() => undefined);
      main.destroy();
    }
  }
}
