import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createWtnResource,
  createWtnPublishStreamId,
  createWtnStreamId,
  createWtnToken,
  type WtnServerConfig,
} from "./wtn.js";

const config: WtnServerConfig = {
  appId: "app123",
  appKey: "test-secret",
  businessId: "together-screen",
  apiBaseUrl: "https://wtn.example.test/webrtc",
  tokenTtlSeconds: 600,
};

describe("WTN helpers", () => {
  it("creates protocol-safe deterministic stream IDs", () => {
    expect(createWtnStreamId("room-2", "abc-def-123", "screen")).toBe(
      "room2_abcdef123_screen",
    );
    expect(createWtnStreamId("room-6", "abc-def-123", "voice")).toBe(
      "room6_abcdef123_voice",
    );
  });

  it("creates a unique stream ID for every publish attempt", () => {
    const first = createWtnPublishStreamId("room-4", "user-123", "screen");
    const second = createWtnPublishStreamId("room-4", "user-123", "screen");
    expect(first).toMatch(/^[a-zA-Z0-9_]+$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(first).not.toBe(second);
    expect(first).toContain("room4_user123_screen_");
  });

  it("creates an HS256 JWT with publish claims", () => {
    const token = createWtnToken({
      config,
      action: "pub",
      streamId: "room2_abcdef_screen",
      nowSeconds: 1_700_000_000,
    });
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      version: "1.0",
      appID: "app123",
      exp: 1_700_000_600,
      action: "pub",
      streamID: "room2_abcdef_screen",
    });
    const expected = createHmac("sha256", config.appKey)
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  it("builds separate publish and simulcast subscription URLs", () => {
    const publish = createWtnResource({
      config,
      action: "pub",
      kind: "screen",
      roomId: "room-3",
      ownerId: "user-123",
      clientId: "client-1",
    });
    const subscribe = createWtnResource({
      config,
      action: "sub",
      kind: "screen",
      roomId: "room-3",
      ownerId: "user-123",
      clientId: "client-2",
      rid: "high",
    });

    expect(publish.url).toContain("/pub/app123/room3_user123_screen");
    expect(subscribe.url).toContain("/sub/app123/room3_user123_screen");
    expect(subscribe.url).toContain("BusinessID=together-screen");
    expect(subscribe.url).toContain("ClientID=client-2");
    expect(subscribe.url).toContain("RID=High");
    expect(publish.token).not.toBe(subscribe.token);
  });
});
