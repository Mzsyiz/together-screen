import { createHmac, randomInt } from "node:crypto";
import {
  RTC_PREVIEW_USER_SUFFIX,
  type RoomId,
  type RtcTokenResource,
  type RtcTokenRole,
} from "../shared/types.js";

export interface RtcServerConfig {
  appId: string;
  appKey: string;
  businessId: string;
  tokenTtlSeconds: number;
}

const TOKEN_VERSION = "001";
const PRIV_PUBLISH_STREAM = 0;
const PRIV_PUBLISH_AUDIO_STREAM = 1;
const PRIV_PUBLISH_VIDEO_STREAM = 2;
const PRIV_PUBLISH_DATA_STREAM = 3;
const PRIV_SUBSCRIBE_STREAM = 4;

function uint16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function sizedBytes(value: Buffer): Buffer {
  return Buffer.concat([uint16(value.length), value]);
}

function sizedString(value: string): Buffer {
  return sizedBytes(Buffer.from(value, "utf8"));
}

function privilegeMap(expiresAt: number): Buffer {
  const privileges = [
    [PRIV_PUBLISH_STREAM, expiresAt],
    [PRIV_PUBLISH_AUDIO_STREAM, expiresAt],
    [PRIV_PUBLISH_VIDEO_STREAM, expiresAt],
    [PRIV_PUBLISH_DATA_STREAM, expiresAt],
    [PRIV_SUBSCRIBE_STREAM, expiresAt],
  ] as const;
  return Buffer.concat([
    uint16(privileges.length),
    ...privileges.flatMap(([key, value]) => [uint16(key), uint32(value)]),
  ]);
}

export function rtcUserIdForRole(
  userId: string,
  role: RtcTokenRole,
): string {
  return role === "preview"
    ? `${userId}${RTC_PREVIEW_USER_SUFFIX}`.slice(0, 128)
    : userId.slice(0, 128);
}

export function createRtcToken(input: {
  config: RtcServerConfig;
  roomId: RoomId;
  userId: string;
  role: RtcTokenRole;
  nowSeconds?: number;
}): RtcTokenResource {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + input.config.tokenTtlSeconds;
  const rtcUserId = rtcUserIdForRole(input.userId, input.role);
  const nonce = randomInt(0, 0x1_0000_0000);
  const message = Buffer.concat([
    uint32(nonce),
    uint32(issuedAt),
    uint32(expiresAt),
    sizedString(input.roomId),
    sizedString(rtcUserId),
    privilegeMap(expiresAt),
  ]);
  const signature = createHmac("sha256", input.config.appKey)
    .update(message)
    .digest();
  const payload = Buffer.concat([sizedBytes(message), sizedBytes(signature)]);

  return {
    appId: input.config.appId,
    businessId: input.config.businessId,
    roomId: input.roomId,
    userId: rtcUserId,
    token: `${TOKEN_VERSION}${input.config.appId}${payload.toString("base64")}`,
    expiresAt,
  };
}
