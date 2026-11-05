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
  it("creates protocol-safe independent stream IDs for each screen quality", () => {
    expect(
      createWtnStreamId("room-2", "abc-def-123", "screen", "preview"),
    ).toBe(
      "room2_abcdef123_screen_preview",
    );
    expect(createWtnStreamId("room-2", "abc-def-123", "screen", "hd")).toBe(
      "room2_abcdef123_screen_hd",
    );
    expect(createWtnStreamId("room-6", "abc-def-123", "voice")).toBe(
      "room6_abcdef123_voice",
    );
  });

  it("creates a unique stream ID for every publish attempt", () => {
    const first = createWtnPublishStreamId(
      "room-4",
      "user-123",
      "screen",
      "preview",
    );
    const second = createWtnPublishStreamId(
      "room-4",
      "user-123",
      "screen",
      "preview",
    );
    expect(first).toMatch(/^[a-zA-Z0-9_]+$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(first).not.toBe(second);
    expect(first).toContain("room4_user123_screen_preview_");
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

  it("builds independent preview and HD resources without RID switching", () => {
    const publish = createWtnResource({
      config,
      action: "pub",
      kind: "screen",
      roomId: "room-3",
      ownerId: "user-123",
      clientId: "client-1",
      quality: "preview",
      streamId: "room3_user123_screen_preview_abcd1234",
    });
    const subscribe = createWtnResource({
      config,
      action: "sub",
      kind: "screen",
      roomId: "room-3",
      ownerId: "user-123",
      clientId: "client-2",
      quality: "hd",
      streamId: "room3_user123_screen_hd_abcd1234",
    });

    expect(publish.url).toContain(
      "/pub/app123/room3_user123_screen_preview_abcd1234",
    );
    expect(subscribe.url).toContain(
      "/sub/app123/room3_user123_screen_hd_abcd1234",
    );
    expect(subscribe.url).toContain("BusinessID=together-screen");
    expect(subscribe.url).toContain("ClientID=client-2");
    expect(subscribe.url).not.toContain("RID=");
    expect(publish.quality).toBe("preview");
    expect(subscribe.quality).toBe("hd");
    expect(publish.streamId).not.toBe(subscribe.streamId);
    expect(publish.token).not.toBe(subscribe.token);
  });

  it("keeps voice as a single resource and screen qualities isolated", () => {
    const voice = createWtnResource({
      config,
      action: "sub",
      kind: "voice",
      roomId: "room-3",
      ownerId: "user-123",
      clientId: "client-2",
      streamId: "room3_user123_voice_abcd1234",
    });
    expect(voice.url).toContain("/sub/app123/room3_user123_voice_abcd1234");
    expect(voice.url).not.toContain("RID=");
    expect(voice.quality).toBeUndefined();
  });
});
