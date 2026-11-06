import type { RawData, WebSocket } from "ws";
import {
  ROOM_DEFINITIONS,
  isValidShareSettings,
  type ActiveShare,
  type ChatMessage,
  type ClientEvent,
  type MediaMode,
  type Participant,
  type PublicUser,
  type RoomId,
  type RoomSummary,
  type ServerEvent,
  type ShareSettings,
} from "../shared/types.js";

interface RoomMember {
  user: PublicUser;
  socket: WebSocket;
  joinedAt: string;
  isSharing: boolean;
  voiceEnabled: boolean;
  voiceMuted: boolean;
}

interface LiveShare {
  userId: string;
  user: PublicUser;
  poster: string;
  settings: ShareSettings;
  startedAt: string;
}

interface Connection {
  user: PublicUser;
  socket: WebSocket;
  roomId: RoomId | null;
  joinedAt: string;
}

const ROOM_IDS = new Set<string>(ROOM_DEFINITIONS.map((room) => room.id));

function roomDefinition(roomId: string) {
  return ROOM_DEFINITIONS.find((room) => room.id === roomId);
}

function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

export class RoomHub {
  private readonly connections = new Map<string, Connection>();
  private readonly members = new Map<RoomId, Map<string, RoomMember>>();
  private readonly shares = new Map<RoomId, Map<string, LiveShare>>();
  private readonly mediaModes = new Map<RoomId, MediaMode>();

  constructor(initialModes: Partial<Record<RoomId, MediaMode>> = {}) {
    for (const room of ROOM_DEFINITIONS) {
      this.members.set(room.id, new Map());
      this.shares.set(room.id, new Map());
      this.mediaModes.set(room.id, initialModes[room.id] ?? "p2p");
    }
  }

  roomSummaries(): RoomSummary[] {
    return ROOM_DEFINITIONS.map((room) => {
      const occupants = this.members.get(room.id)?.size ?? 0;
      return {
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        occupants,
        available: occupants < room.capacity,
        mediaMode: this.mediaModes.get(room.id) ?? "p2p",
      };
    });
  }

  setRoomMediaMode(roomId: RoomId, mode: MediaMode): boolean {
    if (!roomDefinition(roomId)) return false;
    this.mediaModes.set(roomId, mode);
    return true;
  }

  roomIdForUser(userId: string): RoomId | null {
    for (const [roomId, roomMembers] of this.members) {
      if (roomMembers.has(userId)) return roomId;
    }
    return null;
  }

  roomForUser(userId: string): RoomSummary | null {
    const roomId = this.roomIdForUser(userId);
    return roomId ? this.roomSummary(roomId) : null;
  }

  hasMember(roomId: RoomId, userId: string): boolean {
    return this.members.get(roomId)?.has(userId) === true;
  }

  isVoiceEnabled(roomId: RoomId, userId: string): boolean {
    return this.members.get(roomId)?.get(userId)?.voiceEnabled === true;
  }

  isSharing(roomId: RoomId, userId: string): boolean {
    return this.shares.get(roomId)?.has(userId) === true;
  }

  attach(user: PublicUser, socket: WebSocket) {
    const previous = this.connections.get(user.id);
    if (previous && previous.socket !== socket) {
      send(previous.socket, { type: "session.replaced" });
      this.removeConnection(previous);
      previous.socket.close(4001, "Session replaced");
    }

    const connection: Connection = {
      user,
      socket,
      roomId: null,
      joinedAt: new Date().toISOString(),
    };
    this.connections.set(user.id, connection);
    socket.on("message", (raw: RawData) => this.onMessage(connection, raw.toString()));
    socket.on("close", () => {
      if (this.connections.get(user.id)?.socket === socket) {
        this.removeConnection(connection);
      }
    });
    socket.on("error", () => {
      if (this.connections.get(user.id)?.socket === socket) {
        this.removeConnection(connection);
      }
    });
  }

  disconnectUser(userId: string) {
    const connection = this.connections.get(userId);
    if (!connection) return;
    send(connection.socket, { type: "session.replaced" });
    this.removeConnection(connection);
    connection.socket.close(4001, "Session replaced");
  }

  private onMessage(connection: Connection, raw: string) {
    let event: ClientEvent;
    try {
      event = JSON.parse(raw) as ClientEvent;
    } catch {
      send(connection.socket, { type: "room.error", message: "消息格式错误" });
      return;
    }

    if (event.type === "ping") {
      send(connection.socket, { type: "pong" });
      return;
    }

    if (event.type === "room.join") {
      this.join(connection, event.roomId);
      return;
    }

    if (!connection.roomId) {
      send(connection.socket, { type: "room.error", message: "请先进入房间" });
      return;
    }

    const roomId = connection.roomId;
    switch (event.type) {
      case "room.leave":
        this.leave(connection);
        break;
      case "share.started":
        this.startShare(connection, roomId, event.poster, event.settings);
        break;
      case "share.updated":
        this.updateShare(connection, roomId, event.settings);
        break;
      case "share.stopped":
        this.stopShare(connection, roomId);
        break;
      case "signal":
        this.relaySignal(
          connection,
          roomId,
          event.to,
          event.shareOwner,
          event.media,
          event.data,
        );
        break;
      case "quality.request":
        this.relayQuality(connection, roomId, event.to, event.quality);
        break;
      case "quality.ack":
        this.relayQualityAck(
          connection,
          roomId,
          event.to,
          event.quality,
          event.applied,
        );
        break;
      case "voice.updated":
        this.updateVoice(connection, roomId, event.enabled, event.muted);
        break;
      default:
        break;
    }
  }

  private join(connection: Connection, requestedRoomId: RoomId) {
    if (!ROOM_IDS.has(requestedRoomId)) {
      send(connection.socket, { type: "room.error", message: "房间不存在" });
      return;
    }

    if (connection.roomId === requestedRoomId) {
      this.sendSnapshot(connection, requestedRoomId);
      return;
    }

    const targetMembers = this.members.get(requestedRoomId);
    const definition = roomDefinition(requestedRoomId);
    if (!targetMembers || !definition) return;

    if (targetMembers.size >= definition.capacity) {
      send(connection.socket, { type: "room.error", message: "这个房间已经满员" });
      return;
    }

    if (connection.roomId) this.leave(connection);

    const member: RoomMember = {
      user: connection.user,
      socket: connection.socket,
      joinedAt: new Date().toISOString(),
      isSharing: false,
      voiceEnabled: false,
      voiceMuted: false,
    };
    targetMembers.set(connection.user.id, member);
    connection.roomId = requestedRoomId;
    connection.joinedAt = member.joinedAt;

    this.sendSnapshot(connection, requestedRoomId);
    this.broadcast(
      requestedRoomId,
      { type: "participant.joined", participant: this.participant(member) },
      connection.user.id,
    );
  }

  private sendSnapshot(connection: Connection, roomId: RoomId) {
    send(connection.socket, {
      type: "room.snapshot",
      room: this.roomSummary(roomId),
      participants: [...(this.members.get(roomId)?.values() ?? [])].map((member) =>
        this.participant(member),
      ),
      shares: [...(this.shares.get(roomId)?.values() ?? [])].map((share) =>
        this.share(share),
      ),
    });
  }

  private leave(connection: Connection) {
    if (!connection.roomId) return;
    const roomId = connection.roomId;
    const members = this.members.get(roomId);
    const member = members?.get(connection.user.id);
    if (!member || member.socket !== connection.socket) return;

    members?.delete(connection.user.id);
    connection.roomId = null;
    const shares = this.shares.get(roomId);
    if (shares?.delete(connection.user.id)) {
      this.broadcast(roomId, { type: "share.stopped", userId: connection.user.id });
    }
    this.broadcast(roomId, { type: "participant.left", userId: connection.user.id });
  }

  private removeConnection(connection: Connection) {
    this.leave(connection);
    if (this.connections.get(connection.user.id)?.socket === connection.socket) {
      this.connections.delete(connection.user.id);
    }
  }

  private startShare(
    connection: Connection,
    roomId: RoomId,
    poster: string,
    settings: ShareSettings,
  ) {
    if (!isValidShareSettings(settings)) {
      send(connection.socket, { type: "room.error", message: "投屏参数不合法" });
      return;
    }
    if (!poster.startsWith("data:image/") || poster.length > 800_000) {
      send(connection.socket, { type: "room.error", message: "共享启动快照不合法" });
      return;
    }
    const member = this.members.get(roomId)?.get(connection.user.id);
    if (!member) return;
    if (member.isSharing) {
      send(connection.socket, { type: "room.error", message: "每人只能共享一个屏幕" });
      return;
    }

    const share: LiveShare = {
      userId: connection.user.id,
      user: connection.user,
      poster,
      settings,
      startedAt: new Date().toISOString(),
    };
    this.shares.get(roomId)?.set(connection.user.id, share);
    member.isSharing = true;
    this.broadcast(
      roomId,
      { type: "share.started", share: this.share(share) },
      connection.user.id,
    );
  }

  private updateShare(connection: Connection, roomId: RoomId, settings: ShareSettings) {
    if (!isValidShareSettings(settings)) {
      send(connection.socket, { type: "room.error", message: "投屏参数不合法" });
      return;
    }
    const share = this.shares.get(roomId)?.get(connection.user.id);
    if (!share) return;
    share.settings = settings;
    this.broadcast(
      roomId,
      { type: "share.updated", userId: connection.user.id, settings },
      connection.user.id,
    );
  }

  private stopShare(connection: Connection, roomId: RoomId) {
    const shares = this.shares.get(roomId);
    if (!shares?.delete(connection.user.id)) return;
    const member = this.members.get(roomId)?.get(connection.user.id);
    if (member) member.isSharing = false;
    this.broadcast(roomId, { type: "share.stopped", userId: connection.user.id });
  }

  private relaySignal(
    connection: Connection,
    roomId: RoomId,
    to: string,
    shareOwner: string,
    media: "screen" | "voice",
    data: Extract<ClientEvent, { type: "signal" }>["data"],
  ) {
    if (!this.sameRoom(roomId, connection.user.id, to)) return;
    const target = this.members.get(roomId)?.get(to);
    if (!target) return;
    send(target.socket, {
      type: "signal",
      from: connection.user.id,
      shareOwner,
      media,
      data,
    });
  }

  private relayQuality(
    connection: Connection,
    roomId: RoomId,
    to: string,
    quality: "low" | "hd",
  ) {
    if (!this.sameRoom(roomId, connection.user.id, to)) return;
    const target = this.members.get(roomId)?.get(to);
    const share = this.shares.get(roomId)?.get(to);
    if (!target || !share) return;
    send(target.socket, {
      type: "quality.request",
      from: connection.user.id,
      quality,
    });
  }

  private relayQualityAck(
    connection: Connection,
    roomId: RoomId,
    to: string,
    quality: "low" | "hd",
    applied: boolean,
  ) {
    if (!this.sameRoom(roomId, connection.user.id, to)) return;
    if (!this.shares.get(roomId)?.has(connection.user.id)) return;
    const target = this.members.get(roomId)?.get(to);
    if (!target) return;
    send(target.socket, {
      type: "quality.confirmed",
      userId: connection.user.id,
      quality,
      applied,
    });
  }

  private updateVoice(
    connection: Connection,
    roomId: RoomId,
    enabled: boolean,
    muted: boolean,
  ) {
    const member = this.members.get(roomId)?.get(connection.user.id);
    if (!member) return;
    member.voiceEnabled = enabled;
    member.voiceMuted = enabled ? muted : false;
    this.broadcast(
      roomId,
      {
        type: "voice.updated",
        userId: connection.user.id,
        enabled: member.voiceEnabled,
        muted: member.voiceMuted,
      },
      connection.user.id,
    );
  }

  broadcastChat(roomId: RoomId, message: ChatMessage) {
    this.broadcast(roomId, { type: "chat.message", message });
  }

  private sameRoom(roomId: RoomId, firstUserId: string, secondUserId: string): boolean {
    return (
      this.members.get(roomId)?.has(firstUserId) === true &&
      this.members.get(roomId)?.has(secondUserId) === true
    );
  }

  private roomSummary(roomId: RoomId): RoomSummary {
    return this.roomSummaries().find((room) => room.id === roomId) ?? {
      id: roomId,
      name: "",
      capacity: 0,
      occupants: 0,
      available: false,
      mediaMode: this.mediaModes.get(roomId) ?? "p2p",
    };
  }

  private participant(member: RoomMember): Participant {
    return {
      ...member.user,
      joinedAt: member.joinedAt,
      isSharing: member.isSharing,
      voiceEnabled: member.voiceEnabled,
      voiceMuted: member.voiceMuted,
    };
  }

  private share(share: LiveShare): ActiveShare {
    return {
      userId: share.userId,
      user: share.user,
      poster: share.poster,
      settings: share.settings,
      startedAt: share.startedAt,
    };
  }

  private broadcast(roomId: RoomId, event: ServerEvent, exceptUserId?: string) {
    for (const member of this.members.get(roomId)?.values() ?? []) {
      if (member.user.id !== exceptUserId) send(member.socket, event);
    }
  }
}
