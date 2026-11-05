import type {
  ShareSettings,
  WtnMediaKind,
  WtnPublishResource,
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
  rid: "low" | "high";
  updateRid: (rid: "low" | "high") => Promise<void>;
  close: () => Promise<void>;
}

async function exchangeSdp(
  pc: RTCPeerConnection,
  resource: { url: string; token: string },
): Promise<string> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const response = await fetch(resource.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resource.token}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp ?? "",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
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
) {
  pc.close();
  await fetch(resourceUrl, {
    method: "DELETE",
  }).catch(() => undefined);
}

export async function publishToWtn(
  media: MediaStream,
  kind: WtnMediaKind,
  settings: ShareSettings,
  resource: WtnPublishResource,
): Promise<WtnPublisher> {
  const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  try {
    const audio = media.getAudioTracks()[0];
    if (audio) {
      pc.addTransceiver(audio, {
        direction: "sendonly",
        streams: [media],
      });
    }

    const video = media.getVideoTracks()[0];
    if (kind === "screen" && video) {
      video.contentHint = "detail";
      const sourceHeight = video.getSettings().height ?? 720;
      const lowScale = Math.max(2, Math.min(6, Math.round(sourceHeight / 360)));
      pc.addTransceiver(video, {
        direction: "sendonly",
        streams: [media],
        sendEncodings: [
          {
            rid: "low",
            scaleResolutionDownBy: lowScale,
            maxBitrate: 300_000,
            maxFramerate: 15,
            priority: "low",
          },
          {
            rid: "high",
            scaleResolutionDownBy: 1,
            maxBitrate: settings.bitrateKbps * 1000,
            maxFramerate: settings.frameRate,
            priority: "high",
          },
        ],
      });
    }

    const resourceUrl = await exchangeSdp(pc, resource);
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
  const activeResourceUrl = resourceUrl;

  const updateRid = async (rid: "low" | "high") => {
    const response = await fetch(activeResourceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ RID: rid }),
    });
    if (!response.ok) {
      throw new Error(`火山 WTN 画质切换失败 (${response.status})`);
    }
  };

  return {
    pc,
    stream,
    streamId: resource.streamId,
    resourceUrl: activeResourceUrl,
    rid: resource.rid,
    updateRid,
    close: () => deleteResource(pc, activeResourceUrl),
  };
}
