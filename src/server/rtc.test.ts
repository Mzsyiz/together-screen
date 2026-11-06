import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RTC_PREVIEW_USER_SUFFIX } from "../shared/types.js";
import {
  createRtcToken,
  rtcUserIdForRole,
  type RtcServerConfig,
} from "./rtc.js";

const config: RtcServerConfig = {
  appId: "test-app-id",
  appKey: "test-app-key",
  businessId: "together-screen",
  tokenTtlSeconds: 7200,
};

describe("Volcengine RTC tokens", () => {
  it("creates a signed room-scoped main token without exposing the AppKey", () => {
    const result = createRtcToken({
      config,
      roomId: "room-3",
      userId: "user-123",
      role: "main",
      nowSeconds: 1_800_000_000,
    });

    expect(result).toMatchObject({
      appId: "test-app-id",
      businessId: "together-screen",
      roomId: "room-3",
      userId: "user-123",
      expiresAt: 1_800_007_200,
    });
    expect(result.token.startsWith("001test-app-id")).toBe(true);
    expect(result.token).not.toContain("test-app-key");

    const payload = Buffer.from(result.token.slice(3 + config.appId.length), "base64");
    const messageLength = payload.readUInt16LE(0);
    const message = payload.subarray(2, 2 + messageLength);
    const signatureLength = payload.readUInt16LE(2 + messageLength);
    const signature = payload.subarray(4 + messageLength, 4 + messageLength + signatureLength);
    expect(
      createHmac("sha256", config.appKey).update(message).digest().equals(signature),
    ).toBe(true);
  });

  it("uses a separate preview identity for the automatic 360p stream", () => {
    expect(rtcUserIdForRole("user-123", "preview")).toBe(
      `user-123${RTC_PREVIEW_USER_SUFFIX}`,
    );
    expect(rtcUserIdForRole("user-123", "main")).toBe("user-123");
  });
});
