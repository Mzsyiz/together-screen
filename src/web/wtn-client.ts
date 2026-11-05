import { SHARE_RESOLUTION_DETAILS } from "../shared/types";
import type {
  ShareSettings,
  WtnMediaKind,
  WtnPublishResource,
  WtnStreamQuality,
  WtnSubscribeResource,
} from "../shared/types";

export interface WtnPublisher {
  pc: RTCPeerConnection;
  streamId: string;
  resourceUrl: string;
  close: () => Promise<void>;
}

export interface WtnSubscription {
  pc: RTCPeerConnection;
  stream: MediaStream;
  streamId: string;
  resourceUrl: string;
  quality: WtnStreamQuality;
  close: () => Promise<void>;
}

export function wtnScreenSendEncoding(
  quality: WtnStreamQuality | undefined,
  settings: ShareSettings,
  sourceHeight: number,
) {
  return {
    scaleResolutionDownBy:
      quality === "preview"
        ? Math.max(1, Math.min(12, Math.round(sourceHeight / 360)))
        : 1,
    maxBitrate:
      quality === "preview" ? 300_000 : settings.bitrateKbps * 1000,
    maxFramerate: quality === "preview" ? 15 : settings.frameRate,
  };
}

async function exchangeSdp(
  pc: RTCPeerConnection,
  resource: { url: string; token: string },
): Promise<string> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  let response: Response;
  try {
    response = await fetch(resource.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resource.token}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp ?? "",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("火山 WTN 信令超时，请检查网络和 WTN 配置");
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 431) {
      throw new Error(
        "火山 WTN 发布资源仍被占用，请停止旧共享并等待约 30 秒后重试",
      );
    }
    throw new Error(
      `火山 WTN 信令失败 (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const location = response.headers.get("Location");
  if (!location) throw new Error("火山 WTN 未返回资源地址");
  const answer = await response.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  return new URL(location, resource.url).toString();
}

async function deleteResource(
  pc: RTCPeerConnection,
  resourceUrl: string,
): Promise<void> {
  pc.close();
  await fetch(resourceUrl, { method: "DELETE" }).catch(() => undefined);
}

export async function publishToWtn(
  media: MediaStream,
  kind: WtnMediaKind,
  quality: WtnStreamQuality | undefined,
  settings: ShareSettings,
  resource: WtnPublishResource,
): Promise<WtnPublisher> {
  const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  try {
    const audio = media.getAudioTracks()[0];
    if (audio && (kind === "voice" || quality === "hd")) {
      if (kind === "voice") audio.contentHint = "speech";
      pc.addTransceiver(audio, {
        direction: "sendonly",
        streams: [media],
        sendEncodings:
          kind === "voice" ? [{ maxBitrate: 48_000 }] : undefined,
      });
    }

    const video = media.getVideoTracks()[0];
    if (kind === "screen" && video) {
      video.contentHint = "detail";
      const configuredHeight =
        SHARE_RESOLUTION_DETAILS[settings.resolution].height;
      const sourceHeight = video.getSettings().height ?? configuredHeight ?? 1080;
      pc.addTransceiver(video, {
        direction: "sendonly",
        streams: [media],
        sendEncodings: [
          wtnScreenSendEncoding(quality, settings, sourceHeight),
        ],
      });
    }

    const resourceUrl = await exchangeSdp(pc, resource);
    if (kind === "screen") {
      const sender = pc
        .getSenders()
        .find((candidate) => candidate.track?.kind === "video");
      if (sender) {
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) parameters.encodings = [{}];
        parameters.degradationPreference =
          quality === "hd"
            ? settings.degradationPreference
            : "maintain-resolution";
        await sender.setParameters(parameters).catch(() => undefined);
      }
    }
    return {
      pc,
      streamId: resource.streamId,
      resourceUrl,
      close: () => deleteResource(pc, resourceUrl),
    };
  } catch (error) {
    pc.close();
    throw error;
  }
}

export async function subscribeToWtn(
  kind: WtnMediaKind,
  resource: WtnSubscribeResource,
): Promise<WtnSubscription> {
  const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  const stream = new MediaStream();
  let resolveExpectedTrack: (() => void) | undefined;
  const expectedKind = kind === "screen" ? "video" : "audio";
  const mediaReady = new Promise<void>((resolve) => {
    resolveExpectedTrack = resolve;
  });

  let mediaTimeout: number | null = null;
  let resourceUrl: string;
  try {
    pc.ontrack = (event) => {
      if (!stream.getTracks().some((track) => track.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      if (event.track.kind === expectedKind) resolveExpectedTrack?.();
    };

    pc.addTransceiver("audio", { direction: "recvonly" });
    if (kind === "screen") {
      pc.addTransceiver("video", { direction: "recvonly" });
    }

    resourceUrl = await exchangeSdp(pc, resource);
    await Promise.race([
      mediaReady,
      new Promise<never>((_, reject) => {
        mediaTimeout = window.setTimeout(
          () => reject(new Error("火山 WTN 媒体接收超时")),
          15_000,
        );
      }),
    ]);
  } catch (error) {
    if (mediaTimeout !== null) window.clearTimeout(mediaTimeout);
    pc.close();
    throw error;
  }
  if (mediaTimeout !== null) window.clearTimeout(mediaTimeout);

  return {
    pc,
    stream,
    streamId: resource.streamId,
    resourceUrl,
    quality: resource.quality ?? "preview",
    close: () => deleteResource(pc, resourceUrl),
  };
}
