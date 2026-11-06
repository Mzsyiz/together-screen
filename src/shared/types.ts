export const ROOM_DEFINITIONS = [
  { id: "room-1", name: "房间1", capacity: 10 },
  { id: "room-2", name: "房间2", capacity: 10 },
  { id: "room-3", name: "房间3", capacity: 10 },
  { id: "room-4", name: "房间4", capacity: 10 },
  { id: "room-5", name: "房间5", capacity: 10 },
  { id: "room-6", name: "房间6", capacity: 10 },
  { id: "room-7", name: "房间7", capacity: 10 },
  { id: "room-8", name: "房间8", capacity: 10 },
  { id: "room-9", name: "房间9", capacity: 10 },
  { id: "room-10", name: "房间10", capacity: 10 },
] as const;

export type RoomId = (typeof ROOM_DEFINITIONS)[number]["id"];
export type MediaMode = "p2p" | "wtn" | "rtc";
export type WtnMediaKind = "screen" | "voice";
export type WtnStreamQuality = "preview" | "hd";
export const RTC_PREVIEW_USER_SUFFIX = "_preview";

export const SHARE_RESOLUTION_DETAILS = {
  "360p": {
    width: 640,
    height: 360,
    display: "640×360",
  },
  "720p": {
    width: 1280,
    height: 720,
    display: "1280×720",
  },
  "1080p": {
    width: 1920,
    height: 1080,
    display: "1920×1080",
  },
  "1440p": {
    width: 2560,
    height: 1440,
    display: "2560×1440",
  },
  "2160p": {
    width: 3840,
    height: 2160,
    display: "3840×2160",
  },
  source: {
    width: null,
    height: null,
    display: "跟随屏幕",
  },
} as const;

export type ShareResolution = keyof typeof SHARE_RESOLUTION_DETAILS;

export type ShareDegradationPreference =
  | "maintain-resolution"
  | "balanced"
  | "maintain-framerate";

export const SHARE_QUALITY_MODES = {
  lite: {
    name: "轻量",
    description: "低带宽、弱网和临时查看",
    resolution: "360p",
    frameRate: 15,
    bitrateKbps: 800,
    degradationPreference: "balanced",
  },
  smooth: {
    name: "流畅",
    description: "聊天、普通浏览和低带宽网络",
    resolution: "720p",
    frameRate: 10,
    bitrateKbps: 1_500,
    degradationPreference: "balanced",
  },
  standard: {
    name: "标准",
    description: "办公、网页、文档和代码，默认推荐",
    resolution: "1080p",
    frameRate: 15,
    bitrateKbps: 2_500,
    degradationPreference: "maintain-resolution",
  },
  hd: {
    name: "高清",
    description: "软件演示、动画和视频播放",
    resolution: "1080p",
    frameRate: 30,
    bitrateKbps: 4_000,
    degradationPreference: "balanced",
  },
  ultra: {
    name: "超清",
    description: "高分辨率演示、精细画面和复杂桌面",
    resolution: "1440p",
    frameRate: 30,
    bitrateKbps: 8_000,
    degradationPreference: "maintain-resolution",
  },
  gaming: {
    name: "游戏",
    description: "高帧率动态画面，优先保持流畅",
    resolution: "1080p",
    frameRate: 60,
    bitrateKbps: 8_000,
    degradationPreference: "maintain-framerate",
  },
  fourK: {
    name: "4K",
    description: "4K 原始细节和高码率演示",
    resolution: "2160p",
    frameRate: 30,
    bitrateKbps: 20_000,
    degradationPreference: "maintain-resolution",
  },
} as const;

export type ShareQualityMode = keyof typeof SHARE_QUALITY_MODES;

export function shareSettingsForMode(
  mode: ShareQualityMode,
): ShareSettings {
  const profile = SHARE_QUALITY_MODES[mode];
  return {
    qualityMode: mode,
    resolution: profile.resolution,
    frameRate: profile.frameRate,
    bitrateKbps: profile.bitrateKbps,
    degradationPreference: profile.degradationPreference,
    systemAudioEnabled: false,
  };
}

export function isValidShareSettings(settings: ShareSettings): boolean {
  const mode = SHARE_QUALITY_MODES[settings.qualityMode];
  if (!mode) return false;
  const expected = shareSettingsForMode(settings.qualityMode);
  return (
    settings.resolution === expected.resolution &&
    settings.frameRate === expected.frameRate &&
    settings.bitrateKbps === expected.bitrateKbps &&
    settings.degradationPreference === expected.degradationPreference &&
    typeof settings.systemAudioEnabled === "boolean"
  );
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

export interface RoomSummary {
  id: RoomId;
  name: string;
  capacity: number;
  occupants: number;
  available: boolean;
  mediaMode: MediaMode;
}

export interface Participant extends PublicUser {
  joinedAt: string;
  isSharing: boolean;
  voiceEnabled: boolean;
  voiceMuted: boolean;
}

export interface ShareSettings {
  qualityMode: ShareQualityMode;
  frameRate: number;
  bitrateKbps: number;
  resolution: ShareResolution;
  degradationPreference: ShareDegradationPreference;
  systemAudioEnabled: boolean;
}

export interface ActiveShare {
  userId: string;
  user: PublicUser;
  poster: string;
  settings: ShareSettings;
  startedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: RoomId;
  user: PublicUser;
  kind: "text";
  text: string;
  createdAt: string;
}

export interface RtcIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ClientConfig {
  iceServers: RtcIceServer[];
  wtnEnabled: boolean;
  rtcEnabled: boolean;
}

export interface WtnPublishResource {
  url: string;
  token: string;
  streamId: string;
  quality?: WtnStreamQuality;
}

export interface WtnSubscribeResource {
  url: string;
  token: string;
  streamId: string;
  quality?: WtnStreamQuality;
}

export type RtcTokenRole = "main" | "preview";

export interface RtcTokenResource {
  appId: string;
  businessId: string;
  roomId: string;
  userId: string;
  token: string;
  expiresAt: number;
}

export type QualityLevel = "low" | "hd";

export type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

export type ServerEvent =
  | {
      type: "room.snapshot";
      room: RoomSummary;
      participants: Participant[];
      shares: ActiveShare[];
    }
  | { type: "participant.joined"; participant: Participant }
  | { type: "participant.left"; userId: string }
  | { type: "share.started"; share: ActiveShare }
  | { type: "share.updated"; userId: string; settings: ShareSettings }
  | { type: "share.stopped"; userId: string }
  | {
      type: "signal";
      from: string;
      shareOwner: string;
      media: "screen" | "voice";
      data: SignalPayload;
    }
  | {
      type: "voice.updated";
      userId: string;
      enabled: boolean;
      muted: boolean;
    }
  | {
      type: "quality.request";
      from: string;
      quality: QualityLevel;
    }
  | {
      type: "quality.confirmed";
      userId: string;
      quality: QualityLevel;
      applied: boolean;
    }
  | { type: "chat.message"; message: ChatMessage }
  | { type: "room.error"; message: string }
  | { type: "session.replaced" }
  | { type: "pong" };

export type ClientEvent =
  | { type: "room.join"; roomId: RoomId }
  | { type: "room.leave" }
  | {
      type: "share.started";
      poster: string;
      settings: ShareSettings;
    }
  | { type: "share.updated"; settings: ShareSettings }
  | { type: "share.stopped" }
  | {
      type: "signal";
      to: string;
      shareOwner: string;
      media: "screen" | "voice";
      data: SignalPayload;
    }
  | { type: "voice.updated"; enabled: boolean; muted: boolean }
  | { type: "quality.request"; to: string; quality: QualityLevel }
  | {
      type: "quality.ack";
      to: string;
      quality: QualityLevel;
      applied: boolean;
    }
  | { type: "ping" };

export interface AuthResponse {
  user: PublicUser;
}
