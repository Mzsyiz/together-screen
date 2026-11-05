import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import type { PublicUser, ServerEvent } from "../shared/types.js";
import { RoomHub } from "./room-hub.js";

class FakeSocket {
  readyState = 1;
  readonly OPEN = 1;
  readonly sent: ServerEvent[] = [];
  private handlers = new Map<string, (...args: unknown[]) => void>();

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as ServerEvent);
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
  }

  close() {
    this.readyState = 3;
  }

  emit(event: string, payload: unknown) {
    this.handlers.get(event)?.(payload);
  }
}

function user(id: string): PublicUser {
  return { id, username: id, displayName: id, isAdmin: false };
}

describe("room hub", () => {
  it("creates all tier and capacity combinations", () => {
    const hub = new RoomHub();
    expect(hub.roomSummaries().map((room) => room.capacity)).toEqual([
      2, 3, 4, 5, 6,
      2, 3, 4, 5, 6,
      2, 3, 4, 5, 6,
    ]);
    expect(hub.roomSummaries().every((room) => room.mediaMode === "p2p")).toBe(
      true,
    );
  });

  it("stores an independent media mode for each room", () => {
    const hub = new RoomHub({ "room-2": "wtn", "advanced-2": "wtn" });
    expect(hub.roomSummaries()[0].mediaMode).toBe("p2p");
    expect(hub.roomSummaries()[5].mediaMode).toBe("wtn");
    expect(hub.roomSummaries()[6].mediaMode).toBe("p2p");

    expect(hub.setRoomMediaMode("room-2", "wtn")).toBe(false);
    expect(hub.setRoomMediaMode("advanced-3", "wtn")).toBe(true);
    expect(hub.roomSummaries()[0].mediaMode).toBe("p2p");
    expect(hub.roomSummaries()[6].mediaMode).toBe("wtn");
  });

  it("allows only one screen share per user and relays starts to others", () => {
    const hub = new RoomHub();
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    hub.attach(user("alice"), firstSocket as unknown as WebSocket);
    hub.attach(user("bob"), secondSocket as unknown as WebSocket);

    firstSocket.emit("message", JSON.stringify({ type: "room.join", roomId: "room-2" }));
    secondSocket.emit("message", JSON.stringify({ type: "room.join", roomId: "room-2" }));
    firstSocket.sent.length = 0;
    secondSocket.sent.length = 0;

    const event = {
      type: "share.started",
      poster: "data:image/jpeg;base64,AAAA",
      settings: {
        qualityMode: "hd",
        frameRate: 30,
        bitrateKbps: 3000,
        resolution: "720p",
        degradationPreference: "balanced",
      },
    };
    firstSocket.emit("message", JSON.stringify(event));
    firstSocket.emit("message", JSON.stringify(event));

    expect(secondSocket.sent.filter((message) => message.type === "share.started")).toHaveLength(1);
    expect(firstSocket.sent.filter((message) => message.type === "room.error")).toHaveLength(1);
  });

  it("accepts the standardized 4K profile and rejects a modified higher bitrate", () => {
    const hub = new RoomHub();
    const socket = new FakeSocket();
    const observer = new FakeSocket();
    hub.attach(user("alice"), socket as unknown as WebSocket);
    hub.attach(user("bob"), observer as unknown as WebSocket);
    socket.emit(
      "message",
      JSON.stringify({ type: "room.join", roomId: "ultimate-6" }),
    );
    observer.emit(
      "message",
      JSON.stringify({ type: "room.join", roomId: "ultimate-6" }),
    );
    socket.sent.length = 0;
    observer.sent.length = 0;

    socket.emit(
      "message",
      JSON.stringify({
        type: "share.started",
        poster: "data:image/jpeg;base64,AAAA",
        settings: {
          qualityMode: "fourK",
          frameRate: 30,
          bitrateKbps: 20_000,
          resolution: "2160p",
          degradationPreference: "maintain-resolution",
        },
      }),
    );
    expect(
      observer.sent.some((message) => message.type === "share.started"),
    ).toBe(true);

    observer.sent.length = 0;
    observer.emit(
      "message",
      JSON.stringify({
        type: "share.started",
        poster: "data:image/jpeg;base64,AAAA",
        settings: {
          qualityMode: "fourK",
          frameRate: 30,
          bitrateKbps: 20_500,
          resolution: "2160p",
          degradationPreference: "maintain-resolution",
        },
      }),
    );
    expect(observer.sent).toContainEqual({
      type: "room.error",
      message: "投屏参数不合法",
    });
  });

  it("rejects an extra participant when a capacity room is full", () => {
    const hub = new RoomHub();
    const sockets = Array.from({ length: 3 }, () => new FakeSocket());
    for (let index = 0; index < 3; index += 1) {
      hub.attach(user(`user-${index}`), sockets[index] as unknown as WebSocket);
      sockets[index].emit(
        "message",
        JSON.stringify({ type: "room.join", roomId: "room-2" }),
      );
    }

    expect(hub.roomSummaries()[0].occupants).toBe(2);
    expect(sockets[2].sent.at(-1)?.type).toBe("room.error");
  });

  it("broadcasts voice state and disconnects replaced sessions", () => {
    const hub = new RoomHub();
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    hub.attach(user("alice"), firstSocket as unknown as WebSocket);
    hub.attach(user("bob"), secondSocket as unknown as WebSocket);
    firstSocket.emit("message", JSON.stringify({ type: "room.join", roomId: "room-3" }));
    secondSocket.emit("message", JSON.stringify({ type: "room.join", roomId: "room-3" }));
    firstSocket.sent.length = 0;
    secondSocket.sent.length = 0;

    firstSocket.emit(
      "message",
      JSON.stringify({ type: "voice.updated", enabled: true, muted: false }),
    );
    expect(secondSocket.sent.find((message) => message.type === "voice.updated")).toMatchObject({
      userId: "alice",
      enabled: true,
      muted: false,
    });

    hub.disconnectUser("alice");
    expect(firstSocket.sent.some((message) => message.type === "session.replaced")).toBe(true);
    expect(firstSocket.readyState).toBe(3);
    expect(hub.roomSummaries()[1].occupants).toBe(1);
  });

  it("relays quality changes only after the sharer acknowledges the result", () => {
    const hub = new RoomHub();
    const sharerSocket = new FakeSocket();
    const viewerSocket = new FakeSocket();
    hub.attach(user("alice"), sharerSocket as unknown as WebSocket);
    hub.attach(user("bob"), viewerSocket as unknown as WebSocket);
    sharerSocket.emit(
      "message",
      JSON.stringify({ type: "room.join", roomId: "room-2" }),
    );
    viewerSocket.emit(
      "message",
      JSON.stringify({ type: "room.join", roomId: "room-2" }),
    );
    sharerSocket.emit(
      "message",
      JSON.stringify({
        type: "share.started",
        poster: "data:image/jpeg;base64,AAAA",
        settings: {
          qualityMode: "hd",
          frameRate: 30,
          bitrateKbps: 3000,
          resolution: "720p",
          degradationPreference: "balanced",
        },
      }),
    );
    sharerSocket.sent.length = 0;
    viewerSocket.sent.length = 0;

    viewerSocket.emit(
      "message",
      JSON.stringify({ type: "quality.request", to: "alice", quality: "hd" }),
    );
    expect(sharerSocket.sent).toContainEqual(
      expect.objectContaining({
        type: "quality.request",
        from: "bob",
        quality: "hd",
      }),
    );

    sharerSocket.emit(
      "message",
      JSON.stringify({
        type: "quality.ack",
        to: "bob",
        quality: "hd",
        applied: false,
      }),
    );
    expect(viewerSocket.sent).toContainEqual({
      type: "quality.confirmed",
      userId: "alice",
      quality: "hd",
      applied: false,
    });
  });

  it("relays voice offers and candidates to the selected room member", () => {
    const hub = new RoomHub();
    const aliceSocket = new FakeSocket();
    const bobSocket = new FakeSocket();
    hub.attach(user("alice"), aliceSocket as unknown as WebSocket);
    hub.attach(user("bob"), bobSocket as unknown as WebSocket);
    aliceSocket.emit(
      "message",
      JSON.stringify({ type: "room.join", roomId: "room-2" }),
    );
    bobSocket.emit(
      "message",
      JSON.stringify({ type: "room.join", roomId: "room-2" }),
    );
    aliceSocket.sent.length = 0;
    bobSocket.sent.length = 0;

    aliceSocket.emit(
      "message",
      JSON.stringify({
        type: "signal",
        to: "bob",
        shareOwner: "alice",
        media: "voice",
        data: { type: "offer", sdp: "voice-offer" },
      }),
    );
    aliceSocket.emit(
      "message",
      JSON.stringify({
        type: "signal",
        to: "bob",
        shareOwner: "alice",
        media: "voice",
        data: {
          type: "candidate",
          candidate: { candidate: "candidate:1", sdpMid: "0" },
        },
      }),
    );

    expect(bobSocket.sent).toContainEqual({
      type: "signal",
      from: "alice",
      shareOwner: "alice",
      media: "voice",
      data: { type: "offer", sdp: "voice-offer" },
    });
    expect(bobSocket.sent).toContainEqual(
      expect.objectContaining({
        type: "signal",
        from: "alice",
        media: "voice",
        data: expect.objectContaining({
          type: "candidate",
        }),
      }),
    );
  });
});
