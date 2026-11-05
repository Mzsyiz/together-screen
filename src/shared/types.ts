export const ROOM_DEFINITIONS = [
  { id: "room-2", name: "普通双人房", capacity: 2, tier: "normal" },
  { id: "room-3", name: "普通三人房", capacity: 3, tier: "normal" },
  { id: "room-4", name: "普通四人房", capacity: 4, tier: "normal" },
  { id: "room-5", name: "普通五人房", capacity: 5, tier: "normal" },
  { id: "room-6", name: "普通六人房", capacity: 6, tier: "normal" },
  { id: "advanced-2", name: "高级双人房", capacity: 2, tier: "advanced" },
  { id: "advanced-3", name: "高级三人房", capacity: 3, tier: "advanced" },
  { id: "advanced-4", name: "高级四人房", capacity: 4, tier: "advanced" },
  { id: "advanced-5", name: "高级五人房", capacity: 5, tier: "advanced" },
  { id: "advanced-6", name: "高级六人房", capacity: 6, tier: "advanced" },
  { id: "ultimate-2", name: "极致双人房", capacity: 2, tier: "ultimate" },
  { id: "ultimate-3", name: "极致三人房", capacity: 3, tier: "ultimate" },
  { id: "ultimate-4", name: "极致四人房", capacity: 4, tier: "ultimate" },
  { id: "ultimate-5", name: "极致五人房", capacity: 5, tier: "ultimate" },
  { id: "ultimate-6", name: "极致六人房", capacity: 6, tier: "ultimate" },
] as const;

export type RoomTier = (typeof ROOM_DEFINITIONS)[number]["tier"];
export type RoomId = (typeof ROOM_DEFINITIONS)[number]["id"];
export type MediaMode = "p2p" | "wtn";
export type WtnMediaKind = "screen" | "voice";
export type WtnStreamQuality = "preview" | "hd";

export const SHARE_RESOLUTION_DETAILS = {
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

export const ROOM_TIER_DETAILS = {
  normal: {
    name: "普通",
    description: "自建线路 · 最高 720p · 3 Mbps",
    mediaModes: ["p2p"] as const,
    maxWidth: 1280,
    maxHeight: 720,
    maxBitrateKbps: 3_000,
    allowNativeSource: false,
  },
  advanced: {
    name: "高级",
    description: "自建或 WTN · 最高 2K · 15 Mbps",
    mediaModes: ["p2p", "wtn"] as const,
    maxWidth: 2560,
    maxHeight: 1440,
    maxBitrateKbps: 15_000,
    allowNativeSource: false,
  },
  ultimate: {
    name: "极致",
    description: "自建或 WTN · 最高 4K · 30 Mbps",
    mediaModes: ["p2p", "wtn"] as const,
    maxWidth: 3840,
    maxHeight: 2160,
    maxBitrateKbps: 30_000,
    allowNativeSource: true,
  },
} as const;

export function mediaModeAllowedForTier(
  tier: RoomTier,
  mode: MediaMode,
): boolean {
  return (ROOM_TIER_DETAILS[tier].mediaModes as readonly MediaMode[]).includes(
    mode,
  );
}

export function shareSettingsAllowedForTier(
  tier: RoomTier,
  settings: ShareSettings,
): boolean {
  const tierDetails = ROOM_TIER_DETAILS[tier];
  const resolution = SHARE_RESOLUTION_DETAILS[settings.resolution];
  if (!resolution) return false;
  if (settings.resolution === "source" && !tierDetails.allowNativeSource) {
    return false;
  }
  const height = resolution.height ?? tierDetails.maxHeight;
  const width = resolution.width ?? tierDetails.maxWidth;
  return (
    [15, 30, 60].includes(settings.frameRate) &&
    Number.isFinite(settings.bitrateKbps) &&
    settings.bitrateKbps >= 300 &&
    settings.bitrateKbps <= tierDetails.maxBitrateKbps &&
    height <= tierDetails.maxHeight &&
    width <= tierDetails.maxWidth
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
  tier: RoomTier;
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
  frameRate: number;
  bitrateKbps: number;
  resolution: ShareResolution;
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
