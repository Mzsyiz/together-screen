import { createHmac } from "node:crypto";
import path from "node:path";
import type { RtcIceServer } from "../shared/types.js";

try {
  process.loadEnvFile();
} catch {
  // A .env file is optional.
}

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
const origins = (process.env.APP_ORIGIN ?? "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const stunUrls = (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const turnUrls = (process.env.TURN_URLS ?? process.env.TURN_URL ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const turnUsername = process.env.TURN_USERNAME?.trim();
const turnCredential = process.env.TURN_CREDENTIAL?.trim();
const turnSecret = process.env.TURN_SECRET?.trim();
const turnCredentialTtlSeconds = Math.max(
  300,
  Number(process.env.TURN_CREDENTIAL_TTL_SECONDS ?? 3600),
);
const wtnAppId = process.env.WTN_APP_ID?.trim() ?? "";
const wtnAppKey = process.env.WTN_APP_KEY?.trim() ?? "";
const wtnBusinessId = process.env.WTN_BUSINESS_ID?.trim() ?? "";
const wtnApiBaseUrl =
  process.env.WTN_API_BASE_URL?.trim() || "https://wtn.volcvideo.com/webrtc";
const wtnTokenTtlSeconds = Math.min(
  3600,
  Math.max(60, Number(process.env.WTN_TOKEN_TTL_SECONDS ?? 600)),
);
const wtnEnabled = Boolean(wtnAppId && wtnAppKey);

export const appConfig = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  isProduction: process.env.NODE_ENV === "production",
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
  trustProxy: process.env.TRUST_PROXY === "true",
  allowedOrigins: origins,
  dataDir,
  databasePath: path.join(dataDir, "app.sqlite"),
  webDistDir: path.resolve("./dist/web"),
  sessionDays: Math.max(1, Number(process.env.SESSION_DAYS ?? 30)),
  stunUrls,
  turnUrls,
  turnUsername,
  turnCredential,
  turnSecret,
  turnCredentialTtlSeconds,
  wtnEnabled,
  wtn: {
    appId: wtnAppId,
    appKey: wtnAppKey,
    businessId: wtnBusinessId,
    apiBaseUrl: wtnApiBaseUrl,
    tokenTtlSeconds: wtnTokenTtlSeconds,
  },
};

export function iceServersForUser(userId: string): RtcIceServer[] {
  const iceServers: RtcIceServer[] = [];
  if (appConfig.stunUrls.length) {
    iceServers.push({ urls: appConfig.stunUrls });
  }
  if (!appConfig.turnUrls.length) return iceServers;

  let username = appConfig.turnUsername;
  let credential = appConfig.turnCredential;
  if (appConfig.turnSecret) {
    username = `${Math.floor(Date.now() / 1000) + appConfig.turnCredentialTtlSeconds}:${userId}`;
    credential = createHmac("sha1", appConfig.turnSecret)
      .update(username)
      .digest("base64");
  }
  if (username && credential) {
    iceServers.push({
      urls: appConfig.turnUrls,
      username,
      credential,
    });
  }
  return iceServers;
}
