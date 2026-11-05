import { createHmac } from "node:crypto";
import type {
  RoomId,
  WtnMediaKind,
  WtnPublishResource,
  WtnSubscribeResource,
} from "../shared/types.js";

export type WtnAction = "pub" | "sub";

export interface WtnServerConfig {
  appId: string;
  appKey: string;
  businessId: string;
  apiBaseUrl: string;
  tokenTtlSeconds: number;
}

interface WtnResourceInput {
  config: WtnServerConfig;
  action: WtnAction;
  kind: WtnMediaKind;
  roomId: RoomId;
  ownerId: string;
  clientId: string;
  rid?: "low" | "high";
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createWtnStreamId(
  roomId: RoomId,
  ownerId: string,
  kind: WtnMediaKind,
): string {
  const roomPart = roomId.replace(/[^a-zA-Z0-9]/g, "");
  const ownerPart = ownerId.replace(/[^a-zA-Z0-9]/g, "");
  const kindPart = kind === "screen" ? "screen" : "voice";
  return `${roomPart}_${ownerPart}_${kindPart}`.slice(0, 64);
}

export function createWtnToken(input: {
  config: WtnServerConfig;
  action: WtnAction;
  streamId: string;
  nowSeconds?: number;
}): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    version: "1.0",
    appID: input.config.appId,
    exp:
      (input.nowSeconds ?? Math.floor(Date.now() / 1000)) +
      input.config.tokenTtlSeconds,
    action: input.action,
    streamID: input.streamId,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", input.config.appKey)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

export function createWtnResource(
  input: WtnResourceInput,
): WtnPublishResource | WtnSubscribeResource {
  const streamId = createWtnStreamId(input.roomId, input.ownerId, input.kind);
  const url = new URL(
    `${input.config.apiBaseUrl.replace(/\/$/, "")}/${input.action}/${encodeURIComponent(
      input.config.appId,
    )}/${encodeURIComponent(streamId)}`,
  );
  if (input.config.businessId) {
    url.searchParams.set("BusinessID", input.config.businessId);
  }
  url.searchParams.set("ClientID", input.clientId);

  const token = createWtnToken({
    config: input.config,
    action: input.action,
    streamId,
  });

  if (input.action === "pub") {
    return { url: url.toString(), token, streamId };
  }

  const rid = input.rid ?? "low";
  url.searchParams.set("RID", rid);
  return { url: url.toString(), token, streamId, rid };
}
