import { useCallback, useEffect, useRef, useState } from "react";
import { SHARE_RESOLUTION_DETAILS } from "../shared/types";
import type {
  ActiveShare,
  ChatMessage,
  ClientEvent,
  MediaMode,
  Participant,
  PublicUser,
  QualityLevel,
  RtcIceServer,
  ServerEvent,
  ShareSettings,
  WtnStreamQuality,
} from "../shared/types";
import { api, CLIENT_ID } from "./api";
import {
  publishToWtn,
  subscribeToWtn,
  type WtnPublisher,
  type WtnSubscription,
} from "./wtn-client";

const DEFAULT_SETTINGS: ShareSettings = {
  frameRate: 30,
  bitrateKbps: 3000,
  resolution: "720p",
};

const PREVIEW_BITRATE = 300_000;
const REALTIME_DISCONNECT_GRACE_MS = 3000;
const SHARE_STOP_REMOVE_MS = 500;

interface OutgoingPeer {
  pc: RTCPeerConnection;
  quality: QualityLevel;
  pendingQualityAck?: {
    to: string;
    quality: QualityLevel;
  };
}

interface VoiceOutgoingPeer {
  pc: RTCPeerConnection;
}

interface VoiceIncomingPeer {
  pc: RTCPeerConnection;
  stream: MediaStream;
}

interface WtnScreenSubscriptionState {
  quality: WtnStreamQuality;
  subscription: WtnSubscription;
}

export interface VoiceInputDevice {
  deviceId: string;
  label: string;
}

interface RemoteVoiceAnalyser {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
}

function resolutionConstraints(resolution: ShareSettings["resolution"]) {
  const details = SHARE_RESOLUTION_DETAILS[resolution];
  if (details.width === null || details.height === null) {
    return {
      width: { max: 3840 },
      height: { max: 2160 },
    };
  }
  return {
    width: { ideal: details.width, max: details.width },
    height: { ideal: details.height, max: details.height },
  };
}

async function captureStartupSnapshot(stream: MediaStream): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("等待共享画面超时")),
      6000,
    );
    video.onloadeddata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("无法读取共享画面"));
    };
  });
  await video.play().catch(() => undefined);
  await new Promise<void>((resolve) => {
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => resolve());
    } else {
      window.setTimeout(resolve, 120);
    }
  });

  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const maxWidth = 720;
  const width = Math.min(maxWidth, sourceWidth);
  const height = Math.round((width / sourceWidth) * sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成共享启动快照");
  context.drawImage(video, 0, 0, width, height);
  video.pause();
  video.srcObject = null;
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function applySenderQuality(
  pc: RTCPeerConnection,
  quality: QualityLevel,
  settings: ShareSettings,
): Promise<boolean> {
  if (!pc.remoteDescription || pc.connectionState === "closed") return false;
  const sender = pc.getSenders().find((candidate) => candidate.track?.kind === "video");
  if (!sender) return false;
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) parameters.encodings = [{}];
  const sourceHeight = sender.track?.getSettings().height ?? 720;
  const previewScale = Math.max(
    1,
    Math.min(12, Math.round(sourceHeight / 360)),
  );
  parameters.encodings[0].maxBitrate =
    quality === "hd" ? settings.bitrateKbps * 1000 : PREVIEW_BITRATE;
  parameters.encodings[0].maxFramerate = quality === "hd" ? settings.frameRate : 15;
  parameters.encodings[0].scaleResolutionDownBy =
    quality === "hd" ? 1 : previewScale;
  parameters.encodings[0].priority = quality === "hd" ? "high" : "low";
  parameters.encodings[0].networkPriority = quality === "hd" ? "high" : "low";
  parameters.degradationPreference =
    quality === "hd" && settings.frameRate >= 60
      ? "maintain-framerate"
      : "maintain-resolution";
  try {
    await sender.setParameters(parameters);
    return true;
  } catch {
    delete parameters.encodings[0].scaleResolutionDownBy;
    try {
      await sender.setParameters(parameters);
      return true;
    } catch {
      return false;
    }
  }
}

function microphoneConstraints(deviceId: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: { ideal: 48_000 },
    ...(deviceId && deviceId !== "default"
      ? { deviceId: { exact: deviceId } }
      : {}),
  };
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "麦克风权限被拒绝，请在浏览器地址栏中允许麦克风访问";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "没有检测到可用麦克风";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "麦克风正被其他应用占用，请关闭占用程序后重试";
    }
    if (error.name === "OverconstrainedError") {
      return "所选麦克风不可用，请切换到其他输入设备";
    }
  }
  return error instanceof Error ? error.message : "无法打开麦克风";
}

export function useRoomSession(
  user: PublicUser,
  roomId: Parameters<typeof api.messages>[0],
  mediaMode: MediaMode,
  onSessionReplaced?: () => void,
) {
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [shares, setShares] = useState<Record<string, ActiveShare>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [shareStarting, setShareStarting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceStreams, setVoiceStreams] = useState<Record<string, MediaStream>>({});
  const [voiceJoining, setVoiceJoining] = useState(false);
  const [voiceSwitching, setVoiceSwitching] = useState(false);
  const [voicePermission, setVoicePermission] = useState<
    PermissionState | "unknown"
  >("unknown");
  const [voiceInputDevices, setVoiceInputDevices] = useState<VoiceInputDevice[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [voiceInputGain, setVoiceInputGainState] = useState(1);
  const [voiceOutputVolume, setVoiceOutputVolumeState] = useState(1);
  const [voiceLevels, setVoiceLevels] = useState<Record<string, number>>({});
  const [voicePeerStates, setVoicePeerStates] = useState<
    Record<string, RTCPeerConnectionState>
  >({});
  const [confirmedQuality, setConfirmedQuality] = useState<
    Record<string, QualityLevel>
  >({});
  const [settings, setSettings] = useState<ShareSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const rtcConfigRef = useRef<RTCConfiguration>({ iceServers: [] });
  const localStreamRef = useRef<MediaStream | null>(null);
  const localSnapshotRef = useRef<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const voiceSendStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceInputGainNodeRef = useRef<GainNode | null>(null);
  const voiceInputAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceInputDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(
    null,
  );
  const remoteVoiceAnalysersRef = useRef(new Map<string, RemoteVoiceAnalyser>());
  const voiceInputGainRef = useRef(1);
  const voiceEnabledRef = useRef(false);
  const voiceMutedRef = useRef(false);
  const remoteVoiceEnabledRef = useRef(new Set<string>());
  const settingsRef = useRef(settings);
  const participantsRef = useRef(participants);
  const focusedRef = useRef(focusedUserId);
  const outgoingRef = useRef(new Map<string, OutgoingPeer>());
  const incomingRef = useRef(new Map<string, RTCPeerConnection>());
  const outgoingRetryTimersRef = useRef(new Map<string, number>());
  const shareStopTimersRef = useRef(new Map<string, number>());
  const participantLeaveTimersRef = useRef(new Map<string, number>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const voiceOutgoingRef = useRef(new Map<string, VoiceOutgoingPeer>());
  const voiceIncomingRef = useRef(new Map<string, VoiceIncomingPeer>());
  const voicePendingCandidatesRef = useRef(
    new Map<string, RTCIceCandidateInit[]>(),
  );
  const voiceOutgoingRetryTimersRef = useRef(new Map<string, number>());
  const wtnScreenPublishersRef = useRef<
    Partial<Record<WtnStreamQuality, WtnPublisher>>
  >({});
  const wtnScreenPublishGenerationRef = useRef(0);
  const wtnScreenPublishQueueRef = useRef<Promise<void>>(Promise.resolve());
  const wtnVoicePublisherRef = useRef<WtnPublisher | null>(null);
  const wtnScreenSubscriptionsRef = useRef(
    new Map<string, WtnScreenSubscriptionState>(),
  );
  const wtnVoiceSubscriptionsRef = useRef(
    new Map<string, WtnSubscription>(),
  );
  const wtnScreenDesiredRef = useRef(new Map<string, QualityLevel>());
  const wtnScreenTasksRef = useRef(new Map<string, Promise<void>>());
  const requestWtnScreenQualityRef = useRef<
    (ownerId: string, quality: QualityLevel) => void
  >(() => undefined);
  const wtnVoiceTasksRef = useRef(new Map<string, Promise<void>>());
  const reconnectTimerRef = useRef<number | null>(null);
  const stopShareRef = useRef<() => void>(() => undefined);
  const shareStartingRef = useRef(false);
  const onSessionReplacedRef = useRef(onSessionReplaced);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);
  useEffect(() => {
    focusedRef.current = focusedUserId;
  }, [focusedUserId]);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);
  useEffect(() => {
    voiceMutedRef.current = voiceMuted;
  }, [voiceMuted]);
  useEffect(() => {
    onSessionReplacedRef.current = onSessionReplaced;
  }, [onSessionReplaced]);

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }, []);

  const publishWtnScreenStreams = useCallback(
    async (stream: MediaStream, nextSettings: ShareSettings) => {
      const [previewResource, hdResource] = await Promise.all([
        api.wtnPublish("screen", "preview"),
        api.wtnPublish("screen", "hd"),
      ]);
      let preview: WtnPublisher | null = null;
      let hd: WtnPublisher | null = null;
      try {
        preview = await publishToWtn(
          stream,
          "screen",
          "preview",
          nextSettings,
          previewResource,
        );
        hd = await publishToWtn(
          stream,
          "screen",
          "hd",
          nextSettings,
          hdResource,
        );
        return { preview, hd };
      } catch (error) {
        await Promise.allSettled(
          [preview, hd]
            .filter((publisher): publisher is WtnPublisher => Boolean(publisher))
            .map((publisher) => publisher.close()),
        );
        throw error;
      }
    },
    [],
  );

  const closeWtnScreenPublishers = useCallback(async () => {
    wtnScreenPublishGenerationRef.current += 1;
    const publishers = wtnScreenPublishersRef.current;
    wtnScreenPublishersRef.current = {};
    await Promise.allSettled(
      Object.values(publishers)
        .filter((publisher): publisher is WtnPublisher => Boolean(publisher))
        .map((publisher) => publisher.close()),
    );
  }, []);

  const refreshVoiceInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `麦克风 ${index + 1}`,
        }));
      setVoiceInputDevices(inputs);
    } catch {
      // Device enumeration can fail before microphone permission is granted.
    }
  }, []);

  const ensureVoiceAudioContext = useCallback(async () => {
    let context = voiceAudioContextRef.current;
    if (!context || context.state === "closed") {
      context = new AudioContext({ latencyHint: "interactive" });
      voiceAudioContextRef.current = context;
    }
    if (context.state === "suspended") await context.resume();
    return context;
  }, []);

  const cleanupVoiceInputProcessing = useCallback(() => {
    voiceInputSourceRef.current?.disconnect();
    voiceInputSourceRef.current = null;
    voiceInputGainNodeRef.current?.disconnect();
    voiceInputGainNodeRef.current = null;
    voiceInputAnalyserRef.current?.disconnect();
    voiceInputAnalyserRef.current = null;
    voiceInputDestinationRef.current?.disconnect();
    voiceInputDestinationRef.current = null;
    const sendStream = voiceSendStreamRef.current;
    if (sendStream) for (const track of sendStream.getTracks()) track.stop();
    voiceSendStreamRef.current = null;
  }, []);

  const closeVoiceAudioContext = useCallback(() => {
    cleanupVoiceInputProcessing();
    for (const { source, analyser } of remoteVoiceAnalysersRef.current.values()) {
      source.disconnect();
      analyser.disconnect();
    }
    remoteVoiceAnalysersRef.current.clear();
    const context = voiceAudioContextRef.current;
    voiceAudioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
    setVoiceLevels({});
  }, [cleanupVoiceInputProcessing]);

  const configureVoiceInput = useCallback(
    async (stream: MediaStream, requestedDeviceId: string) => {
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("没有获取到麦克风");
      const context = await ensureVoiceAudioContext();
      const previousStream = micStreamRef.current;
      micStreamRef.current = stream;

      if (!voiceInputGainNodeRef.current || !voiceInputDestinationRef.current) {
        const gain = context.createGain();
        gain.gain.value = voiceInputGainRef.current;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.72;
        const destination = context.createMediaStreamDestination();
        gain.connect(analyser);
        gain.connect(destination);
        voiceInputGainNodeRef.current = gain;
        voiceInputAnalyserRef.current = analyser;
        voiceInputDestinationRef.current = destination;
        voiceSendStreamRef.current = destination.stream;
      }

      voiceInputSourceRef.current?.disconnect();
      const source = context.createMediaStreamSource(stream);
      source.connect(voiceInputGainNodeRef.current);
      voiceInputSourceRef.current = source;
      track.enabled = !voiceMutedRef.current;

      if (previousStream && previousStream !== stream) {
        for (const previousTrack of previousStream.getTracks()) previousTrack.stop();
      }

      track.addEventListener("ended", () => {
        if (micStreamRef.current === stream && voiceEnabledRef.current) {
          setNotice("麦克风已断开，请重新选择输入设备");
          void leaveVoiceRef.current();
        }
      });

      const settings = track.getSettings();
      setSelectedMicrophoneId(
        requestedDeviceId || settings.deviceId || "",
      );
      await refreshVoiceInputDevices();
    },
    [ensureVoiceAudioContext, refreshVoiceInputDevices],
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const onDeviceChange = () => void refreshVoiceInputDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    void refreshVoiceInputDevices();
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [refreshVoiceInputDevices]);

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let permission: PermissionStatus | null = null;
    const update = () => setVoicePermission(permission?.state ?? "unknown");
    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        permission = status;
        update();
        status.addEventListener("change", update);
      })
      .catch(() => setVoicePermission("unknown"));
    return () => permission?.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const context = voiceAudioContextRef.current;
    if (!context) return;
    const streams = new Set(Object.keys(voiceStreams));
    for (const [userId, entry] of remoteVoiceAnalysersRef.current) {
      if (streams.has(userId)) continue;
      entry.source.disconnect();
      entry.analyser.disconnect();
      remoteVoiceAnalysersRef.current.delete(userId);
    }
    for (const [userId, stream] of Object.entries(voiceStreams)) {
      if (remoteVoiceAnalysersRef.current.has(userId)) continue;
      try {
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        remoteVoiceAnalysersRef.current.set(userId, { source, analyser });
      } catch {
        // A stream can be replaced between ICE renegotiation and analyser setup.
      }
    }
  }, [voiceStreams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next: Record<string, number> = {};
      const measure = (analyser: AnalyserNode | null, muted: boolean) => {
        if (!analyser || muted) return 0;
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        return Math.min(1, Math.sqrt(energy / samples.length) * 3.2);
      };
      if (voiceEnabledRef.current && !voiceMutedRef.current) {
        next[user.id] = measure(voiceInputAnalyserRef.current, false);
      }
      for (const [userId, { analyser }] of remoteVoiceAnalysersRef.current) {
        const participant = participantsRef.current.find(
          (candidate) => candidate.id === userId,
        );
        next[userId] = measure(analyser, participant?.voiceMuted ?? false);
      }
      setVoiceLevels((current) => {
        const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
        const changed = [...keys].some(
          (key) => Math.abs((current[key] ?? 0) - (next[key] ?? 0)) > 0.008,
        );
        return changed ? next : current;
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [user.id]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((current) =>
      current.some((candidate) => candidate.id === message.id)
        ? current
        : [...current, message],
    );
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const result = await api.messages(roomId);
      setMessages(result.messages);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "聊天记录加载失败");
    }
  }, [roomId]);

  const closeWtnScreenSubscription = useCallback(
    (ownerId: string, clearMedia = true) => {
      const state = wtnScreenSubscriptionsRef.current.get(ownerId);
      wtnScreenSubscriptionsRef.current.delete(ownerId);
      wtnScreenDesiredRef.current.delete(ownerId);
      if (state) void state.subscription.close();
      if (clearMedia) {
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[ownerId];
          return next;
        });
        setConfirmedQuality((current) => {
          const next = { ...current };
          delete next[ownerId];
          return next;
        });
      }
    },
    [],
  );

  const closeWtnVoiceSubscription = useCallback((ownerId: string) => {
    const subscription = wtnVoiceSubscriptionsRef.current.get(ownerId);
    wtnVoiceSubscriptionsRef.current.delete(ownerId);
    if (subscription) void subscription.close();
    setVoiceStreams((current) => {
      const next = { ...current };
      delete next[ownerId];
      return next;
    });
  }, []);

  const closeWtnSubscriptions = useCallback(() => {
    for (const ownerId of wtnScreenSubscriptionsRef.current.keys()) {
      closeWtnScreenSubscription(ownerId);
    }
    for (const ownerId of wtnVoiceSubscriptionsRef.current.keys()) {
      closeWtnVoiceSubscription(ownerId);
    }
    wtnScreenDesiredRef.current.clear();
    wtnScreenTasksRef.current.clear();
    wtnVoiceTasksRef.current.clear();
  }, [closeWtnScreenSubscription, closeWtnVoiceSubscription]);

  const requestWtnScreenQuality = useCallback(
    (ownerId: string, quality: QualityLevel) => {
      wtnScreenDesiredRef.current.set(ownerId, quality);
      if (wtnScreenTasksRef.current.has(ownerId)) return;

      const task = (async () => {
        while (true) {
          const desired = wtnScreenDesiredRef.current.get(ownerId);
          if (!desired) return;
          const targetQuality: WtnStreamQuality =
            desired === "hd" ? "hd" : "preview";
          const active = wtnScreenSubscriptionsRef.current.get(ownerId);
          if (active?.quality === targetQuality) {
            setConfirmedQuality((current) =>
              current[ownerId] === desired
                ? current
                : { ...current, [ownerId]: desired },
            );
            return;
          }

          const resource = await api.wtnSubscribe(
            ownerId,
            "screen",
            targetQuality,
          );
          if (!wtnScreenDesiredRef.current.has(ownerId)) return;
          const nextSubscription = await subscribeToWtn("screen", resource);
          if (!wtnScreenDesiredRef.current.has(ownerId)) {
            await nextSubscription.close();
            return;
          }

          const previous =
            wtnScreenSubscriptionsRef.current.get(ownerId)?.subscription;
          wtnScreenSubscriptionsRef.current.set(ownerId, {
            quality: nextSubscription.quality,
            subscription: nextSubscription,
          });
          setRemoteStreams((current) => ({
            ...current,
            [ownerId]: nextSubscription.stream,
          }));
          if (previous) void previous.close();

          const latest = wtnScreenDesiredRef.current.get(ownerId);
          if (latest === desired) {
            setConfirmedQuality((current) => ({
              ...current,
              [ownerId]: desired,
            }));
            return;
          }
        }
      })()
        .catch((error) => {
          if (!wtnScreenDesiredRef.current.has(ownerId)) return;
          const active = wtnScreenSubscriptionsRef.current.get(ownerId);
          if (active) {
            wtnScreenDesiredRef.current.set(
              ownerId,
              active.quality === "hd" ? "hd" : "low",
            );
          } else {
            wtnScreenDesiredRef.current.delete(ownerId);
          }
          const fallback = active
            ? active.quality === "hd"
              ? "已继续使用高清流"
              : "已继续使用轻量预览"
            : "请稍后重试";
          setNotice(
            `${
              error instanceof Error ? error.message : "火山 WTN 订阅失败"
            }，${fallback}`,
          );
        })
        .finally(() => {
          wtnScreenTasksRef.current.delete(ownerId);
          const desired = wtnScreenDesiredRef.current.get(ownerId);
          const active = wtnScreenSubscriptionsRef.current.get(ownerId);
          const desiredQuality: WtnStreamQuality =
            desired === "hd" ? "hd" : "preview";
          if (desired && active?.quality !== desiredQuality) {
            requestWtnScreenQualityRef.current(ownerId, desired);
          }
        });
      wtnScreenTasksRef.current.set(ownerId, task);
    },
    [],
  );
  requestWtnScreenQualityRef.current = requestWtnScreenQuality;

  const ensureWtnVoiceSubscription = useCallback(
    (ownerId: string) => {
      if (
        !voiceEnabledRef.current ||
        !remoteVoiceEnabledRef.current.has(ownerId) ||
        wtnVoiceSubscriptionsRef.current.has(ownerId) ||
        wtnVoiceTasksRef.current.has(ownerId)
      ) {
        return;
      }
      const task = (async () => {
        const resource = await api.wtnSubscribe(ownerId, "voice");
        if (
          !voiceEnabledRef.current ||
          !remoteVoiceEnabledRef.current.has(ownerId)
        ) {
          return;
        }
        const subscription = await subscribeToWtn("voice", resource);
        if (
          !voiceEnabledRef.current ||
          !remoteVoiceEnabledRef.current.has(ownerId)
        ) {
          await subscription.close();
          return;
        }
        wtnVoiceSubscriptionsRef.current.set(ownerId, subscription);
        setVoiceStreams((current) => ({
          ...current,
          [ownerId]: subscription.stream,
        }));
      })()
        .catch((error) => {
          setNotice(
            error instanceof Error ? error.message : "火山 WTN 语音订阅失败",
          );
        })
        .finally(() => {
          wtnVoiceTasksRef.current.delete(ownerId);
        });
      wtnVoiceTasksRef.current.set(ownerId, task);
    },
    [],
  );

  const requestQuality = useCallback(
    (ownerId: string, quality: QualityLevel) => {
      if (ownerId === user.id) return;
      if (mediaMode === "wtn") {
        requestWtnScreenQuality(ownerId, quality);
      } else {
        send({ type: "quality.request", to: ownerId, quality });
      }
    },
    [mediaMode, requestWtnScreenQuality, send, user.id],
  );

  const closeVoicePeers = useCallback(() => {
    for (const timer of voiceOutgoingRetryTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    voiceOutgoingRetryTimersRef.current.clear();
    for (const { pc } of voiceOutgoingRef.current.values()) pc.close();
    for (const { pc } of voiceIncomingRef.current.values()) pc.close();
    voiceOutgoingRef.current.clear();
    voiceIncomingRef.current.clear();
    voicePendingCandidatesRef.current.clear();
    setVoiceStreams({});
    setVoicePeerStates({});
    if (mediaMode === "wtn") {
      for (const peerId of wtnVoiceSubscriptionsRef.current.keys()) {
        closeWtnVoiceSubscription(peerId);
      }
    }
  }, [closeWtnVoiceSubscription, mediaMode]);

  const closePeerMaps = useCallback(() => {
    for (const timer of outgoingRetryTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    outgoingRetryTimersRef.current.clear();
    for (const { pc } of outgoingRef.current.values()) pc.close();
    for (const pc of incomingRef.current.values()) pc.close();
    outgoingRef.current.clear();
    incomingRef.current.clear();
    pendingCandidatesRef.current.clear();
    setRemoteStreams({});
    closeVoicePeers();
    if (mediaMode === "wtn") closeWtnSubscriptions();
  }, [closeVoicePeers, closeWtnSubscriptions, mediaMode]);

  const createOutgoingPeer = useCallback(
    (viewerId: string) => {
      const stream = localStreamRef.current;
      const socket = socketRef.current;
      if (!stream || !socket || socket.readyState !== WebSocket.OPEN) return;
      if (outgoingRef.current.has(viewerId)) return;

      const pc = new RTCPeerConnection(rtcConfigRef.current);
      const outgoing: OutgoingPeer = { pc, quality: "low" };
      outgoingRef.current.set(viewerId, outgoing);

      for (const track of stream.getTracks()) {
        const transceiver = pc.addTransceiver(track, {
          direction: "sendonly",
          streams: [stream],
        });
        if (track.kind === "video") track.contentHint = "detail";
        transceiver.sender.track?.addEventListener("ended", () => pc.close());
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "signal",
            to: viewerId,
            shareOwner: user.id,
            media: "screen",
            data: { type: "candidate", candidate: event.candidate.toJSON() },
          });
        }
      };
      pc.onconnectionstatechange = () => {
        const current = outgoingRef.current.get(viewerId);
        if (!current || current.pc !== pc) return;
        if (pc.connectionState === "connected") {
          const timer = outgoingRetryTimersRef.current.get(viewerId);
          if (timer) window.clearTimeout(timer);
          outgoingRetryTimersRef.current.delete(viewerId);
          void applySenderQuality(
            pc,
            outgoing.quality,
            settingsRef.current,
          ).then((applied) => {
            const pending = outgoing.pendingQualityAck;
            if (!pending || outgoingRef.current.get(viewerId) !== outgoing) {
              return;
            }
            outgoing.pendingQualityAck = undefined;
            if (applied) outgoing.quality = pending.quality;
            send({
              type: "quality.ack",
              to: pending.to,
              quality: pending.quality,
              applied,
            });
          });
          return;
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          if (outgoingRetryTimersRef.current.has(viewerId)) return;
          const delay = pc.connectionState === "failed" ? 650 : 2500;
          const timer = window.setTimeout(() => {
            outgoingRetryTimersRef.current.delete(viewerId);
            const latest = outgoingRef.current.get(viewerId);
            if (!latest || latest.pc !== pc) return;
            if (pc.connectionState === "connected") return;
            pc.close();
            outgoingRef.current.delete(viewerId);
            if (
              localStreamRef.current &&
              socketRef.current?.readyState === WebSocket.OPEN
            ) {
              createOutgoingPeer(viewerId);
            }
          }, delay);
          outgoingRetryTimersRef.current.set(viewerId, timer);
        }
      };

      void (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({
          type: "signal",
          to: viewerId,
          shareOwner: user.id,
          media: "screen",
          data: { type: "offer", sdp: offer.sdp ?? "" },
        });
      })().catch(() => {
        pc.close();
        outgoingRef.current.delete(viewerId);
      });
    },
    [send, user.id],
  );

  const handleIncomingOffer = useCallback(
    async (from: string, shareOwner: string, sdp: string) => {
      let pc = incomingRef.current.get(shareOwner);
      if (pc) {
        pc.close();
        incomingRef.current.delete(shareOwner);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[shareOwner];
          return next;
        });
      }
      pc = new RTCPeerConnection(rtcConfigRef.current);
      incomingRef.current.set(shareOwner, pc);
      pendingCandidatesRef.current.delete(shareOwner);
      const stream = new MediaStream();
      pc.ontrack = (event) => {
        if (!stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        setRemoteStreams((current) => ({ ...current, [shareOwner]: stream }));
        if (focusedRef.current === shareOwner) {
          send({ type: "quality.request", to: shareOwner, quality: "hd" });
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "signal",
            to: from,
            shareOwner,
            media: "screen",
            data: { type: "candidate", candidate: event.candidate.toJSON() },
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (incomingRef.current.get(shareOwner) !== pc) return;
        if (pc.connectionState === "failed") {
          pc.close();
          incomingRef.current.delete(shareOwner);
          setRemoteStreams((current) => {
            const next = { ...current };
            delete next[shareOwner];
            return next;
          });
        }
      };

      await pc.setRemoteDescription({ type: "offer", sdp });
      const pending = pendingCandidatesRef.current.get(shareOwner) ?? [];
      pendingCandidatesRef.current.delete(shareOwner);
      for (const candidate of pending) await pc.addIceCandidate(candidate).catch(() => undefined);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({
        type: "signal",
        to: from,
        shareOwner,
        media: "screen",
        data: { type: "answer", sdp: answer.sdp ?? "" },
      });
    },
    [send],
  );

  const createVoiceOutgoing = useCallback(
    (listenerId: string) => {
      const micTrack =
        voiceSendStreamRef.current?.getAudioTracks()[0] ??
        micStreamRef.current?.getAudioTracks()[0];
      const socket = socketRef.current;
      if (
        !voiceEnabledRef.current ||
        !remoteVoiceEnabledRef.current.has(listenerId) ||
        !micTrack ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const existing = voiceOutgoingRef.current.get(listenerId);
      if (existing && existing.pc.connectionState !== "closed") return;
      if (existing) existing.pc.close();

      const pc = new RTCPeerConnection(rtcConfigRef.current);
      const peer: VoiceOutgoingPeer = { pc };
      voiceOutgoingRef.current.set(listenerId, peer);
      setVoicePeerStates((current) => ({
        ...current,
        [listenerId]: pc.connectionState,
      }));
      pc.addTransceiver(micTrack, {
        direction: "sendonly",
        streams: [voiceSendStreamRef.current ?? micStreamRef.current!],
      });
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "signal",
            to: listenerId,
            shareOwner: user.id,
            media: "voice",
            data: { type: "candidate", candidate: event.candidate.toJSON() },
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (voiceOutgoingRef.current.get(listenerId)?.pc !== pc) return;
        setVoicePeerStates((current) => ({
          ...current,
          [listenerId]: pc.connectionState,
        }));
        if (pc.connectionState === "connected") {
          const timer = voiceOutgoingRetryTimersRef.current.get(listenerId);
          if (timer) window.clearTimeout(timer);
          voiceOutgoingRetryTimersRef.current.delete(listenerId);
          return;
        }
        if (pc.connectionState !== "failed" && pc.connectionState !== "disconnected") {
          return;
        }
        if (voiceOutgoingRetryTimersRef.current.has(listenerId)) return;
        const timer = window.setTimeout(() => {
          voiceOutgoingRetryTimersRef.current.delete(listenerId);
          if (voiceOutgoingRef.current.get(listenerId)?.pc !== pc) return;
          if (pc.connectionState === "connected") return;
          pc.close();
          voiceOutgoingRef.current.delete(listenerId);
          setVoicePeerStates((current) => {
            const next = { ...current };
            delete next[listenerId];
            return next;
          });
          createVoiceOutgoing(listenerId);
        }, pc.connectionState === "failed" ? 650 : 2500);
        voiceOutgoingRetryTimersRef.current.set(listenerId, timer);
      };

      void (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({
          type: "signal",
          to: listenerId,
          shareOwner: user.id,
          media: "voice",
          data: { type: "offer", sdp: offer.sdp ?? "" },
        });
      })().catch(() => {
        pc.close();
        if (voiceOutgoingRef.current.get(listenerId)?.pc === pc) {
          voiceOutgoingRef.current.delete(listenerId);
          setVoicePeerStates((current) => {
            const next = { ...current };
            delete next[listenerId];
            return next;
          });
        }
      });
    },
    [send, user.id],
  );

  const syncVoicePeers = useCallback(() => {
    if (mediaMode === "wtn") {
      if (!voiceEnabledRef.current) {
        for (const peerId of wtnVoiceSubscriptionsRef.current.keys()) {
          closeWtnVoiceSubscription(peerId);
        }
        return;
      }
      for (const peerId of remoteVoiceEnabledRef.current) {
        ensureWtnVoiceSubscription(peerId);
      }
      for (const peerId of wtnVoiceSubscriptionsRef.current.keys()) {
        if (!remoteVoiceEnabledRef.current.has(peerId)) {
          closeWtnVoiceSubscription(peerId);
        }
      }
      return;
    }
    if (!voiceEnabledRef.current) {
      for (const { pc } of voiceOutgoingRef.current.values()) pc.close();
      for (const { pc } of voiceIncomingRef.current.values()) pc.close();
      voiceOutgoingRef.current.clear();
      voiceIncomingRef.current.clear();
      setVoiceStreams({});
      return;
    }
    for (const peerId of remoteVoiceEnabledRef.current) {
      createVoiceOutgoing(peerId);
    }
    for (const peerId of voiceOutgoingRef.current.keys()) {
      if (!remoteVoiceEnabledRef.current.has(peerId)) {
        voiceOutgoingRef.current.get(peerId)?.pc.close();
        voiceOutgoingRef.current.delete(peerId);
        setVoicePeerStates((current) => {
          const next = { ...current };
          delete next[peerId];
          return next;
        });
      }
    }
    for (const peerId of voiceIncomingRef.current.keys()) {
      if (!remoteVoiceEnabledRef.current.has(peerId)) {
        voiceIncomingRef.current.get(peerId)?.pc.close();
        voiceIncomingRef.current.delete(peerId);
        voicePendingCandidatesRef.current.delete(peerId);
        setVoiceStreams((current) => {
          const next = { ...current };
          delete next[peerId];
          return next;
        });
      }
    }
  }, [
    closeWtnVoiceSubscription,
    createVoiceOutgoing,
    ensureWtnVoiceSubscription,
    mediaMode,
  ]);

  const handleIncomingVoiceOffer = useCallback(
    async (from: string, sdp: string) => {
      if (!voiceEnabledRef.current) return;
      voiceIncomingRef.current.get(from)?.pc.close();
      const pc = new RTCPeerConnection(rtcConfigRef.current);
      const stream = new MediaStream();
      voiceIncomingRef.current.set(from, { pc, stream });
      pc.ontrack = (event) => {
        if (event.track.kind !== "audio") return;
        if (!stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        setVoiceStreams((current) => ({ ...current, [from]: stream }));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "signal",
            to: from,
            shareOwner: from,
            media: "voice",
            data: { type: "candidate", candidate: event.candidate.toJSON() },
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (voiceIncomingRef.current.get(from)?.pc !== pc) return;
        if (pc.connectionState === "failed") {
          pc.close();
          voiceIncomingRef.current.delete(from);
          setVoiceStreams((current) => {
            const next = { ...current };
            delete next[from];
            return next;
          });
        }
      };
      await pc.setRemoteDescription({ type: "offer", sdp });
      const pending = voicePendingCandidatesRef.current.get(from) ?? [];
      voicePendingCandidatesRef.current.delete(from);
      for (const candidate of pending) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({
        type: "signal",
        to: from,
        shareOwner: from,
        media: "voice",
        data: { type: "answer", sdp: answer.sdp ?? "" },
      });
    },
    [send],
  );

  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "room.snapshot": {
          setConfirmedQuality({});
          remoteVoiceEnabledRef.current = new Set(
            event.participants
              .filter(
                (participant) =>
                  participant.id !== user.id && participant.voiceEnabled,
              )
              .map((participant) => participant.id),
          );
          setParticipants(
            event.participants.map((participant) =>
              participant.id === user.id && localStreamRef.current
                ? {
                    ...participant,
                    isSharing: true,
                    voiceEnabled: voiceEnabledRef.current,
                    voiceMuted: voiceMutedRef.current,
                  }
                : participant.id === user.id
                  ? {
                      ...participant,
                      voiceEnabled: voiceEnabledRef.current,
                      voiceMuted: voiceMutedRef.current,
                    }
                  : participant,
            ),
          );
          setShares(Object.fromEntries(event.shares.map((share) => [share.userId, share])));
          setConnectionState("connected");
          void loadMessages();
          for (const participant of event.participants) {
            if (participant.id !== user.id && localStreamRef.current) {
              createOutgoingPeer(participant.id);
            }
          }
          syncVoicePeers();
          break;
        }
        case "participant.joined":
          if (participantLeaveTimersRef.current.has(event.participant.id)) {
            window.clearTimeout(participantLeaveTimersRef.current.get(event.participant.id));
            participantLeaveTimersRef.current.delete(event.participant.id);
          }
          setParticipants((current) =>
            current.some((participant) => participant.id === event.participant.id)
              ? current
              : [...current, event.participant],
          );
          if (event.participant.id !== user.id && event.participant.voiceEnabled) {
            remoteVoiceEnabledRef.current.add(event.participant.id);
            syncVoicePeers();
          }
          if (localStreamRef.current && event.participant.id !== user.id) {
            createOutgoingPeer(event.participant.id);
          }
          break;
        case "participant.left":
          if (shareStopTimersRef.current.has(event.userId)) {
            window.clearTimeout(shareStopTimersRef.current.get(event.userId));
            shareStopTimersRef.current.delete(event.userId);
          }
          if (!participantLeaveTimersRef.current.has(event.userId)) {
            const timer = window.setTimeout(() => {
              participantLeaveTimersRef.current.delete(event.userId);
              setParticipants((current) =>
                current.filter((participant) => participant.id !== event.userId),
              );
              outgoingRef.current.get(event.userId)?.pc.close();
              outgoingRef.current.delete(event.userId);
              incomingRef.current.get(event.userId)?.close();
              incomingRef.current.delete(event.userId);
              remoteVoiceEnabledRef.current.delete(event.userId);
              voiceOutgoingRef.current.get(event.userId)?.pc.close();
              voiceOutgoingRef.current.delete(event.userId);
              if (mediaMode === "wtn") {
                closeWtnScreenSubscription(event.userId);
                closeWtnVoiceSubscription(event.userId);
              }
              voiceIncomingRef.current.get(event.userId)?.pc.close();
              voiceIncomingRef.current.delete(event.userId);
              voicePendingCandidatesRef.current.delete(event.userId);
              setVoiceStreams((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              setVoicePeerStates((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              setShares((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              setRemoteStreams((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              setConfirmedQuality((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
            }, REALTIME_DISCONNECT_GRACE_MS);
            participantLeaveTimersRef.current.set(event.userId, timer);
          }
          break;
        case "share.started":
          setConfirmedQuality((current) => {
            const next = { ...current };
            delete next[event.share.userId];
            return next;
          });
          if (shareStopTimersRef.current.has(event.share.userId)) {
            window.clearTimeout(shareStopTimersRef.current.get(event.share.userId));
            shareStopTimersRef.current.delete(event.share.userId);
          }
          setShares((current) => ({ ...current, [event.share.userId]: event.share }));
          setParticipants((current) =>
            current.map((participant) =>
              participant.id === event.share.userId
                ? { ...participant, isSharing: true }
                : participant,
            ),
          );
          break;
        case "share.updated":
          setShares((current) => {
            const share = current[event.userId];
            return share
              ? { ...current, [event.userId]: { ...share, settings: event.settings } }
              : current;
          });
          if (mediaMode === "wtn" && event.userId !== user.id) {
            const desired = wtnScreenDesiredRef.current.get(event.userId);
            if (desired) {
              closeWtnScreenSubscription(event.userId);
              requestWtnScreenQuality(event.userId, desired);
            }
          }
          break;
        case "voice.updated":
          if (event.enabled) {
            remoteVoiceEnabledRef.current.add(event.userId);
          } else {
            remoteVoiceEnabledRef.current.delete(event.userId);
          }
          setParticipants((current) =>
            current.map((participant) =>
              participant.id === event.userId
                ? {
                    ...participant,
                    voiceEnabled: event.enabled,
                    voiceMuted: event.muted,
                  }
                : participant,
            ),
          );
          if (!event.enabled) {
            voiceOutgoingRef.current.get(event.userId)?.pc.close();
            voiceOutgoingRef.current.delete(event.userId);
            voiceIncomingRef.current.get(event.userId)?.pc.close();
            voiceIncomingRef.current.delete(event.userId);
            voicePendingCandidatesRef.current.delete(event.userId);
            setVoiceStreams((current) => {
              const next = { ...current };
              delete next[event.userId];
              return next;
            });
            setVoicePeerStates((current) => {
              const next = { ...current };
              delete next[event.userId];
              return next;
            });
            if (mediaMode === "wtn") {
              closeWtnVoiceSubscription(event.userId);
            }
          } else {
            syncVoicePeers();
          }
          break;
        case "share.stopped":
          if (!shareStopTimersRef.current.has(event.userId)) {
            const timer = window.setTimeout(() => {
              shareStopTimersRef.current.delete(event.userId);
              setShares((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              setParticipants((current) =>
                current.map((participant) =>
                  participant.id === event.userId
                    ? { ...participant, isSharing: false }
                    : participant,
                ),
              );
              incomingRef.current.get(event.userId)?.close();
              incomingRef.current.delete(event.userId);
              if (mediaMode === "wtn") {
                closeWtnScreenSubscription(event.userId);
              }
              setRemoteStreams((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              setConfirmedQuality((current) => {
                const next = { ...current };
                delete next[event.userId];
                return next;
              });
              if (focusedRef.current === event.userId) setFocusedUserId(null);
            }, SHARE_STOP_REMOVE_MS);
            shareStopTimersRef.current.set(event.userId, timer);
          }
          break;
        case "signal":
          if (event.media === "voice") {
            if (event.data.type === "offer") {
              void handleIncomingVoiceOffer(event.from, event.data.sdp);
            } else if (event.data.type === "answer") {
              const voicePeer = voiceOutgoingRef.current.get(event.from);
              if (voicePeer) {
                void voicePeer.pc.setRemoteDescription({
                  type: "answer",
                  sdp: event.data.sdp,
                });
              }
            } else {
              if (event.shareOwner === user.id) {
                const voicePeer = voiceOutgoingRef.current.get(event.from);
                if (voicePeer?.pc.remoteDescription) {
                  void voicePeer.pc
                    .addIceCandidate(event.data.candidate)
                    .catch(() => undefined);
                }
              } else {
                const voicePeer = voiceIncomingRef.current.get(event.shareOwner);
                if (voicePeer?.pc.remoteDescription) {
                  void voicePeer.pc
                    .addIceCandidate(event.data.candidate)
                    .catch(() => undefined);
                } else {
                  const pending =
                    voicePendingCandidatesRef.current.get(event.shareOwner) ?? [];
                  pending.push(event.data.candidate);
                  voicePendingCandidatesRef.current.set(event.shareOwner, pending);
                }
              }
            }
          } else if (event.data.type === "offer") {
            void handleIncomingOffer(event.from, event.shareOwner, event.data.sdp);
          } else if (event.data.type === "answer") {
            const outgoing = outgoingRef.current.get(event.from);
            if (outgoing && event.shareOwner === user.id) {
              void outgoing.pc.setRemoteDescription({
                type: "answer",
                sdp: event.data.sdp,
              });
            }
          } else {
            const candidate = event.data.candidate;
            if (event.shareOwner === user.id) {
              const outgoing = outgoingRef.current.get(event.from);
              if (outgoing) void outgoing.pc.addIceCandidate(candidate).catch(() => undefined);
            } else {
              const incoming = incomingRef.current.get(event.shareOwner);
              if (incoming?.remoteDescription) {
                void incoming.addIceCandidate(candidate).catch(() => undefined);
              } else {
                const pending =
                  pendingCandidatesRef.current.get(event.shareOwner) ?? [];
                pending.push(candidate);
                pendingCandidatesRef.current.set(event.shareOwner, pending);
              }
            }
          }
          break;
        case "quality.request": {
          const outgoing = outgoingRef.current.get(event.from);
          if (outgoing) {
            if (
              !outgoing.pc.remoteDescription ||
              outgoing.pc.connectionState !== "connected"
            ) {
              outgoing.quality = event.quality;
              outgoing.pendingQualityAck = {
                to: event.from,
                quality: event.quality,
              };
              break;
            }
            void (async () => {
              const applied = await applySenderQuality(
                outgoing.pc,
                event.quality,
                settingsRef.current,
              );
              if (outgoingRef.current.get(event.from) === outgoing && applied) {
                outgoing.quality = event.quality;
              }
              send({
                type: "quality.ack",
                to: event.from,
                quality: event.quality,
                applied,
              });
            })();
          }
          break;
        }
        case "quality.confirmed":
          setConfirmedQuality((current) => {
            if (event.applied) {
              return { ...current, [event.userId]: event.quality };
            }
            const next = { ...current };
            delete next[event.userId];
            return next;
          });
          if (!event.applied && event.quality === "hd") {
            setNotice("对方的网络或浏览器暂时无法切换到高清，已继续使用轻量预览");
          }
          break;
        case "chat.message":
          appendMessage(event.message);
          break;
        case "room.error":
          setNotice(event.message);
          break;
        case "session.replaced":
          setNotice("此账号已在另一个窗口登录");
          onSessionReplacedRef.current?.();
          break;
        case "pong":
          break;
      }
    },
    [
      appendMessage,
      closeWtnScreenSubscription,
      closeWtnVoiceSubscription,
      createOutgoingPeer,
      handleIncomingOffer,
      handleIncomingVoiceOffer,
      loadMessages,
      mediaMode,
      requestWtnScreenQuality,
      send,
      syncVoicePeers,
      user.id,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    let localSocket: WebSocket | null = null;

    const connect = async () => {
      try {
        const clientConfig = await api.config();
        if (cancelled) return;
        rtcConfigRef.current = {
          iceServers: clientConfig.iceServers as RtcIceServer[],
          iceCandidatePoolSize: 4,
        };
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(
          `${protocol}//${location.host}/ws?clientId=${encodeURIComponent(CLIENT_ID)}`,
        );
        localSocket = socket;
        socketRef.current = socket;
        socket.onopen = () => {
          setConnectionState("connected");
          socket.send(JSON.stringify({ type: "room.join", roomId } satisfies ClientEvent));
          if (localStreamRef.current && localSnapshotRef.current) {
            socket.send(
              JSON.stringify({
                type: "share.started",
                poster: localSnapshotRef.current,
                settings: settingsRef.current,
              } satisfies ClientEvent),
            );
          }
          if (voiceEnabledRef.current) {
            socket.send(
              JSON.stringify({
                type: "voice.updated",
                enabled: true,
                muted: voiceMutedRef.current,
              } satisfies ClientEvent),
            );
          }
        };
        socket.onmessage = (messageEvent) => {
          try {
            handleServerEvent(JSON.parse(messageEvent.data) as ServerEvent);
          } catch {
            setNotice("收到无法解析的房间消息");
          }
        };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          closePeerMaps();
          if (cancelled) return;
          setConnectionState("disconnected");
          reconnectTimerRef.current = window.setTimeout(() => void connect(), 1200);
        };
        socket.onerror = () => setConnectionState("disconnected");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "无法连接房间服务");
        if (!cancelled) {
          reconnectTimerRef.current = window.setTimeout(() => void connect(), 1800);
        }
      }
    };

    void connect();
    const heartbeat = window.setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "ping" } satisfies ClientEvent));
      }
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      for (const timer of shareStopTimersRef.current.values()) window.clearTimeout(timer);
      for (const timer of participantLeaveTimersRef.current.values()) window.clearTimeout(timer);
      shareStopTimersRef.current.clear();
      participantLeaveTimersRef.current.clear();
      localSocket?.close();
      socketRef.current = null;
      closePeerMaps();
      const stream = localStreamRef.current;
      if (stream) for (const track of stream.getTracks()) track.stop();
      localStreamRef.current = null;
      localSnapshotRef.current = null;
      const micStream = micStreamRef.current;
      micStreamRef.current = null;
      if (micStream) for (const track of micStream.getTracks()) track.stop();
      const voicePublisher = wtnVoicePublisherRef.current;
      wtnVoicePublisherRef.current = null;
      void closeWtnScreenPublishers();
      if (voicePublisher) void voicePublisher.close();
      closeVoiceAudioContext();
    };
  }, [
    closePeerMaps,
    closeVoiceAudioContext,
    closeWtnScreenPublishers,
    handleServerEvent,
    roomId,
  ]);

  const startShare = useCallback(async () => {
    if (shareStartingRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice("当前浏览器不支持屏幕共享，请使用最新版 Chrome、Edge 或 Safari");
      return;
    }
    shareStartingRef.current = true;
    setShareStarting(true);
    let acquiredStream: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          ...resolutionConstraints(settingsRef.current.resolution),
          frameRate: {
            ideal: settingsRef.current.frameRate,
            max: settingsRef.current.frameRate,
          },
        },
        audio: true,
      });
      acquiredStream = stream;
      const video = stream.getVideoTracks()[0];
      if (!video) throw new Error("没有获取到屏幕视频");
      video.contentHint = "detail";
      await video
        .applyConstraints({
          ...resolutionConstraints(settingsRef.current.resolution),
          frameRate: {
            ideal: settingsRef.current.frameRate,
            max: settingsRef.current.frameRate,
          },
        })
        .catch(() => undefined);
      const poster = await captureStartupSnapshot(stream);
      if (mediaMode === "wtn") {
        await wtnScreenPublishQueueRef.current;
        wtnScreenPublishersRef.current = await publishWtnScreenStreams(
          stream,
          settingsRef.current,
        );
      }
      localStreamRef.current = stream;
      localSnapshotRef.current = poster;
      setLocalStream(stream);
      setParticipants((current) =>
        current.map((participant) =>
          participant.id === user.id ? { ...participant, isSharing: true } : participant,
        ),
      );
      video.addEventListener("ended", () => stopShareRef.current(), { once: true });
      send({
        type: "share.started",
        poster,
        settings: settingsRef.current,
      });
      if (mediaMode === "p2p") {
        for (const participant of participantsRef.current) {
          if (participant.id !== user.id) createOutgoingPeer(participant.id);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      if (acquiredStream) {
        for (const track of acquiredStream.getTracks()) track.stop();
      }
      setNotice(error instanceof Error ? error.message : "屏幕共享启动失败");
    } finally {
      shareStartingRef.current = false;
      setShareStarting(false);
    }
  }, [createOutgoingPeer, mediaMode, publishWtnScreenStreams, send, user.id]);

  const stopShare = useCallback(() => {
    send({ type: "share.stopped" });
    for (const { pc } of outgoingRef.current.values()) pc.close();
    outgoingRef.current.clear();
    void closeWtnScreenPublishers();
    const stream = localStreamRef.current;
    if (stream) for (const track of stream.getTracks()) track.stop();
    localStreamRef.current = null;
    localSnapshotRef.current = null;
    setLocalStream(null);
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === user.id ? { ...participant, isSharing: false } : participant,
      ),
    );
  }, [closeWtnScreenPublishers, send, user.id]);
  useEffect(() => {
    stopShareRef.current = stopShare;
  }, [stopShare]);

  const updateSettings = useCallback(
    async (next: ShareSettings) => {
      setSettings(next);
      settingsRef.current = next;
      const stream = localStreamRef.current;
      if (!stream) return;
      const video = stream.getVideoTracks()[0];
      if (video) {
        await video
          .applyConstraints({
            ...resolutionConstraints(next.resolution),
            frameRate: { ideal: next.frameRate, max: next.frameRate },
          })
          .catch(() => undefined);
      }
      if (mediaMode === "wtn") {
        const generation = ++wtnScreenPublishGenerationRef.current;
        const task = wtnScreenPublishQueueRef.current.then(async () => {
          if (generation !== wtnScreenPublishGenerationRef.current) return;
          try {
            const previous = wtnScreenPublishersRef.current;
            const publishers = await publishWtnScreenStreams(stream, next);
            if (generation !== wtnScreenPublishGenerationRef.current) {
              await Promise.allSettled(
                Object.values(publishers).map((publisher) =>
                  publisher.close(),
                ),
              );
              return;
            }
            wtnScreenPublishersRef.current = publishers;
            send({ type: "share.updated", settings: next });
            await Promise.allSettled(
              Object.values(previous)
                .filter(
                  (publisher): publisher is WtnPublisher => Boolean(publisher),
                )
                .map((publisher) => publisher.close()),
            );
          } catch (error) {
            if (generation === wtnScreenPublishGenerationRef.current) {
              setNotice(
                `${
                  error instanceof Error
                    ? error.message
                    : "火山 WTN 重新发布失败"
                }，已保留原共享参数`,
              );
            }
          }
        });
        wtnScreenPublishQueueRef.current = task.catch(() => undefined);
        await task;
        return;
      }
      send({ type: "share.updated", settings: next });
      for (const outgoing of outgoingRef.current.values()) {
        await applySenderQuality(outgoing.pc, outgoing.quality, next);
      }
    },
    [mediaMode, publishWtnScreenStreams, send],
  );

  const joinVoice = useCallback(async () => {
    if (voiceEnabledRef.current || voiceJoining) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("当前浏览器不支持麦克风语音");
      return;
    }
    setVoiceJoining(true);
    try {
      await ensureVoiceAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints(selectedMicrophoneId),
        video: false,
      });
      await configureVoiceInput(stream, selectedMicrophoneId);
      if (mediaMode === "wtn") {
        const resource = await api.wtnPublish("voice");
        wtnVoicePublisherRef.current = await publishToWtn(
          voiceSendStreamRef.current ?? stream,
          "voice",
          undefined,
          settingsRef.current,
          resource,
        );
      }
      voiceEnabledRef.current = true;
      voiceMutedRef.current = false;
      setVoiceEnabled(true);
      setVoiceMuted(false);
      send({ type: "voice.updated", enabled: true, muted: false });
      setParticipants((current) =>
        current.map((participant) =>
          participant.id === user.id
            ? { ...participant, voiceEnabled: true, voiceMuted: false }
            : participant,
        ),
      );
      syncVoicePeers();
    } catch (error) {
      const stream = micStreamRef.current;
      if (stream && !voiceEnabledRef.current) {
        for (const track of stream.getTracks()) track.stop();
        micStreamRef.current = null;
      }
      closeVoiceAudioContext();
      setNotice(microphoneErrorMessage(error));
    } finally {
      setVoiceJoining(false);
    }
  }, [
    closeVoiceAudioContext,
    configureVoiceInput,
    ensureVoiceAudioContext,
    mediaMode,
    selectedMicrophoneId,
    send,
    syncVoicePeers,
    user.id,
    voiceJoining,
  ]);

  const leaveVoice = useCallback(() => {
    send({ type: "voice.updated", enabled: false, muted: false });
    voiceEnabledRef.current = false;
    voiceMutedRef.current = false;
    setVoiceEnabled(false);
    setVoiceMuted(false);
    const stream = micStreamRef.current;
    micStreamRef.current = null;
    if (stream) for (const track of stream.getTracks()) track.stop();
    const wtnPublisher = wtnVoicePublisherRef.current;
    wtnVoicePublisherRef.current = null;
    if (wtnPublisher) void wtnPublisher.close();
    closeVoicePeers();
    closeVoiceAudioContext();
    setVoiceJoining(false);
    setVoiceSwitching(false);
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === user.id
          ? { ...participant, voiceEnabled: false, voiceMuted: false }
          : participant,
      ),
    );
  }, [closeVoiceAudioContext, closeVoicePeers, send, user.id]);
  const leaveVoiceRef = useRef(leaveVoice);
  useEffect(() => {
    leaveVoiceRef.current = leaveVoice;
  }, [leaveVoice]);

  const toggleVoiceMute = useCallback(() => {
    if (!voiceEnabledRef.current) return;
    const nextMuted = !voiceMutedRef.current;
    voiceMutedRef.current = nextMuted;
    setVoiceMuted(nextMuted);
    const micTrack = micStreamRef.current?.getAudioTracks()[0];
    if (micTrack) micTrack.enabled = !nextMuted;
    const sendTrack = voiceSendStreamRef.current?.getAudioTracks()[0];
    if (sendTrack) sendTrack.enabled = !nextMuted;
    send({ type: "voice.updated", enabled: true, muted: nextMuted });
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === user.id
          ? { ...participant, voiceMuted: nextMuted }
          : participant,
      ),
    );
  }, [send, user.id]);

  const switchMicrophone = useCallback(
    async (deviceId: string) => {
      if (!voiceEnabledRef.current || voiceSwitching) return;
      setVoiceSwitching(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneConstraints(deviceId),
          video: false,
        });
        await configureVoiceInput(stream, deviceId);
      } catch (error) {
        setNotice(microphoneErrorMessage(error));
      } finally {
        setVoiceSwitching(false);
      }
    },
    [configureVoiceInput, voiceSwitching],
  );

  const setVoiceInputGain = useCallback((value: number) => {
    const next = Math.max(0.2, Math.min(2, value));
    voiceInputGainRef.current = next;
    setVoiceInputGainState(next);
    const gain = voiceInputGainNodeRef.current;
    const context = voiceAudioContextRef.current;
    if (gain && context) {
      gain.gain.setTargetAtTime(next, context.currentTime, 0.03);
    }
  }, []);

  const setVoiceOutputVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVoiceOutputVolumeState(next);
  }, []);

  const focusShare = useCallback(
    (ownerId: string | null) => {
      const previous = focusedRef.current;
      if (previous && previous !== ownerId) {
        requestQuality(previous, "low");
      }
      setFocusedUserId(ownerId);
      focusedRef.current = ownerId;
      if (ownerId) requestQuality(ownerId, "hd");
    },
    [requestQuality],
  );

  const sendText = useCallback(
    async (text: string) => {
      const result = await api.sendText(roomId, text);
      appendMessage(result.message);
    },
    [appendMessage, roomId],
  );

  return {
    mediaMode,
    connectionState,
    participants,
    shares,
    remoteStreams,
    localStream,
    shareStarting,
    voiceEnabled,
    voiceMuted,
    voiceStreams,
    voiceJoining,
    voiceSwitching,
    voicePermission,
    voiceInputDevices,
    selectedMicrophoneId,
    voiceInputGain,
    voiceOutputVolume,
    voiceLevels,
    voicePeerStates,
    confirmedQuality,
    settings,
    messages,
    focusedUserId,
    notice,
    clearNotice: () => setNotice(null),
    startShare,
    stopShare,
    updateSettings,
    joinVoice,
    leaveVoice,
    toggleVoiceMute,
    switchMicrophone,
    setVoiceInputGain,
    setVoiceOutputVolume,
    refreshVoiceInputDevices,
    focusShare,
    requestQuality,
    sendText,
  };
}
