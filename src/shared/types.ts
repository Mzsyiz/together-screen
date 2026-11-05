export const ROOM_DEFINITIONS = [
  { id: "room-2", name: "双人房", capacity: 2 },
  { id: "room-3", name: "三人房", capacity: 3 },
  { id: "room-4", name: "四人房", capacity: 4 },
  { id: "room-5", name: "五人房", capacity: 5 },
  { id: "room-6", name: "六人房", capacity: 6 },
] as const;

export type RoomId = (typeof ROOM_DEFINITIONS)[number]["id"];
export type MediaMode = "p2p" | "wtn";
export type WtnMediaKind = "screen" | "voice";
export type WtnStreamQuality = "preview" | "hd";

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
  frameRate: number;
  bitrateKbps: number;
  resolution: "720p" | "1080p" | "source";
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
