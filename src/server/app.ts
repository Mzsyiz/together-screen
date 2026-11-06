import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import type {
  MediaMode,
  PublicUser,
  RoomId,
  RtcTokenRole,
  WtnMediaKind,
  WtnStreamQuality,
} from "../shared/types.js";
import {
  ROOM_DEFINITIONS,
} from "../shared/types.js";
import {
  getRequestUser,
  hashPassword,
  newSessionToken,
  SESSION_COOKIE,
  tokenHash,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "./auth.js";
import { appConfig, iceServersForUser } from "./config.js";
import { AppDatabase } from "./db.js";
import { RoomHub } from "./room-hub.js";
import {
  createWtnPublishStreamId,
  createWtnResource,
} from "./wtn.js";
import { createRtcToken } from "./rtc.js";

const ROOM_IDS = new Set<string>(ROOM_DEFINITIONS.map((room) => room.id));
function isRoomId(roomId: string): roomId is RoomId {
  return ROOM_IDS.has(roomId);
}

function getClientId(
  request: FastifyRequest,
  override?: string,
): string | null {
  const header = request.headers["x-client-id"];
  const value = override ?? (Array.isArray(header) ? header[0] : header);
  return value?.trim() || null;
}

function requestUser(
  database: AppDatabase,
  request: FastifyRequest,
  activeClients: Map<string, string>,
  clientIdOverride?: string,
): PublicUser | null {
  const user = getRequestUser(database, request);
  if (!user) return null;
  const clientId = getClientId(request, clientIdOverride);
  const activeClient = activeClients.get(user.id);
  if (!clientId) return activeClient ? null : user;
  if (!activeClient) activeClients.set(user.id, clientId);
  if (activeClient && activeClient !== clientId) return null;
  return user;
}

function requireUser(
  database: AppDatabase,
  request: FastifyRequest,
  reply: FastifyReply,
  activeClients: Map<string, string>,
  clientIdOverride?: string,
): PublicUser | null {
  const user = requestUser(database, request, activeClients, clientIdOverride);
  if (!user) void reply.code(401).send({ error: "请先登录" });
  return user;
}

function requireAdmin(
  database: AppDatabase,
  request: FastifyRequest,
  reply: FastifyReply,
  activeClients: Map<string, string>,
): PublicUser | null {
  const user = requireUser(database, request, reply, activeClients);
  if (!user) return null;
  if (!user.isAdmin) {
    void reply.code(403).send({ error: "需要管理员权限" });
    return null;
  }
  return user;
}

export async function buildApp() {
  const database = new AppDatabase(appConfig.databasePath);
  const rooms = new RoomHub(database.getRoomMediaModes());
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const activeClients = new Map<string, string>();
  const wtnStreams = new Map<string, string>();
  const app = Fastify({
    logger: appConfig.isProduction,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: appConfig.trustProxy,
  });

  await app.register(cookie);
  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024,
    },
  });

  app.addHook("onClose", async () => database.close());

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/config", async (request, reply) => {
    const user = requireUser(database, request, reply, activeClients);
    if (!user) return reply;
    return {
      iceServers: iceServersForUser(user.id),
      wtnEnabled: appConfig.wtnEnabled,
      rtcEnabled: appConfig.rtcEnabled,
    };
  });

  app.post<{ Body: { username?: string; password?: string } }>(
    "/api/auth/login",
    async (request, reply) => {
      const now = Date.now();
      const attempt = loginAttempts.get(request.ip);
      if (attempt && attempt.resetAt > now && attempt.count >= 10) {
        return reply.code(429).send({ error: "登录尝试过多，请稍后再试" });
      }
      if (attempt && attempt.resetAt <= now) loginAttempts.delete(request.ip);

      const username = String(request.body?.username ?? "").trim();
      const password = String(request.body?.password ?? "");
      const userWithPassword = database.findUserWithPassword(username);
      if (!userWithPassword || !verifyPassword(password, userWithPassword.passwordHash)) {
        const current = loginAttempts.get(request.ip);
        loginAttempts.set(request.ip, {
          count: (current?.count ?? 0) + 1,
          resetAt: current?.resetAt ?? now + 5 * 60 * 1000,
        });
        return reply.code(401).send({ error: "账号或密码不正确" });
      }

      loginAttempts.delete(request.ip);
      database.purgeExpiredSessions();
      database.deleteSessionsForUser(userWithPassword.id);
      rooms.disconnectUser(userWithPassword.id);
      const token = newSessionToken();
      const expiresAt = new Date(
        Date.now() + appConfig.sessionDays * 24 * 60 * 60 * 1000,
      );
      database.createSession(tokenHash(token), userWithPassword.id, expiresAt.toISOString());
      const clientId = getClientId(request);
      if (clientId) activeClients.set(userWithPassword.id, clientId);
      reply.setCookie(SESSION_COOKIE, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: appConfig.cookieSecure,
        maxAge: appConfig.sessionDays * 24 * 60 * 60,
      });
      const { passwordHash: _passwordHash, ...user } = userWithPassword;
      return { user };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const currentUser = getRequestUser(database, request);
    const clientId = getClientId(request);
    if (currentUser && clientId && activeClients.get(currentUser.id) === clientId) {
      activeClients.delete(currentUser.id);
    }
    if (token) database.deleteSession(tokenHash(token));
    reply.clearCookie(SESSION_COOKIE, {
      path: "/",
      secure: appConfig.cookieSecure,
      sameSite: "lax",
    });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = getRequestUser(database, request);
    if (!user) return reply.code(401).send({ error: "请先登录" });
    return user ? { user } : reply;
  });

  app.post("/api/auth/claim", async (request, reply) => {
    const user = getRequestUser(database, request);
    if (!user) return reply.code(401).send({ error: "请先登录" });
    const clientId = getClientId(request);
    if (!clientId) return reply.code(400).send({ error: "缺少客户端标识" });
    const previous = activeClients.get(user.id);
    activeClients.set(user.id, clientId);
    if (previous && previous !== clientId) rooms.disconnectUser(user.id);
    return { user };
  });

  app.get("/api/rooms", async (request, reply) => {
    const user = requireUser(database, request, reply, activeClients);
    if (!user) return reply;
    return { rooms: rooms.roomSummaries() };
  });

  app.post<{
    Body: { kind?: WtnMediaKind; quality?: WtnStreamQuality };
  }>(
    "/api/wtn/publish",
    async (request, reply) => {
      const user = requireUser(database, request, reply, activeClients);
      if (!user) return reply;
      if (!appConfig.wtnEnabled) {
        return reply.code(503).send({ error: "火山 WTN 尚未配置" });
      }
      const room = rooms.roomForUser(user.id);
      if (!room || room.mediaMode !== "wtn") {
        return reply.code(409).send({ error: "当前房间未启用火山 WTN" });
      }
      const kind = request.body?.kind;
      if (kind !== "screen" && kind !== "voice") {
        return reply.code(400).send({ error: "媒体类型不合法" });
      }
      const quality = kind === "screen" ? request.body?.quality : undefined;
      if (
        kind === "screen" &&
        quality !== "preview" &&
        quality !== "hd"
      ) {
        return reply.code(400).send({ error: "屏幕画质不合法" });
      }
      const streamId = createWtnPublishStreamId(
        room.id,
        user.id,
        kind,
        quality,
      );
      const streamKey =
        kind === "screen"
          ? `${room.id}:${user.id}:screen:${quality}`
          : `${room.id}:${user.id}:voice`;
      wtnStreams.set(streamKey, streamId);
      return createWtnResource({
        config: appConfig.wtn,
        action: "pub",
        kind,
        roomId: room.id,
        ownerId: user.id,
        clientId: user.id,
        quality,
        streamId,
      });
    },
  );

  app.post<{
    Body: {
      ownerId?: string;
      kind?: WtnMediaKind;
      quality?: WtnStreamQuality;
    };
  }>("/api/wtn/subscribe", async (request, reply) => {
    const user = requireUser(database, request, reply, activeClients);
    if (!user) return reply;
    if (!appConfig.wtnEnabled) {
      return reply.code(503).send({ error: "火山 WTN 尚未配置" });
    }
    const room = rooms.roomForUser(user.id);
    if (!room || room.mediaMode !== "wtn") {
      return reply.code(409).send({ error: "当前房间未启用火山 WTN" });
    }
    const ownerId = String(request.body?.ownerId ?? "");
    const kind = request.body?.kind;
    if (
      !ownerId ||
      ownerId === user.id ||
      (kind !== "screen" && kind !== "voice") ||
      !rooms.hasMember(room.id, ownerId)
    ) {
      return reply.code(400).send({ error: "订阅目标不合法" });
    }
    if (
      (kind === "screen" && !rooms.isSharing(room.id, ownerId)) ||
      (kind === "voice" && !rooms.isVoiceEnabled(room.id, ownerId))
    ) {
      return reply.code(409).send({ error: "目标媒体尚未发布" });
    }
    const quality = kind === "screen" ? request.body?.quality : undefined;
    if (
      kind === "screen" &&
      quality !== "preview" &&
      quality !== "hd"
    ) {
      return reply.code(400).send({ error: "屏幕画质不合法" });
    }
    const streamKey =
      kind === "screen"
        ? `${room.id}:${ownerId}:screen:${quality}`
        : `${room.id}:${ownerId}:voice`;
    const streamId = wtnStreams.get(streamKey);
    if (!streamId) {
      return reply.code(409).send({ error: "该 WTN 媒体流尚未发布" });
    }
    return createWtnResource({
      config: appConfig.wtn,
      action: "sub",
      kind,
      roomId: room.id,
      ownerId,
      clientId: user.id,
      quality,
      streamId,
    });
  });

  app.post<{ Body: { role?: RtcTokenRole } }>(
    "/api/rtc/token",
    async (request, reply) => {
      const user = requireUser(database, request, reply, activeClients);
      if (!user) return reply;
      if (!appConfig.rtcEnabled) {
        return reply.code(503).send({ error: "火山 RTC 尚未配置" });
      }
      const room = rooms.roomForUser(user.id);
      if (!room || room.mediaMode !== "rtc") {
        return reply.code(409).send({ error: "当前房间未启用火山 RTC" });
      }
      const role = request.body?.role ?? "main";
      if (role !== "main" && role !== "preview") {
        return reply.code(400).send({ error: "RTC 凭证类型不合法" });
      }
      return createRtcToken({
        config: appConfig.rtc,
        roomId: room.id,
        userId: user.id,
        role,
      });
    },
  );

  app.get<{ Params: { roomId: string }; Querystring: { limit?: string } }>(
    "/api/rooms/:roomId/messages",
    async (request, reply) => {
      const user = requireUser(database, request, reply, activeClients);
      if (!user) return reply;
      if (!isRoomId(request.params.roomId)) {
        return reply.code(404).send({ error: "房间不存在" });
      }
      const limit = Number(request.query.limit ?? 100);
      return {
        messages: database.getMessages(
          request.params.roomId,
          Number.isFinite(limit) ? limit : 100,
        ),
      };
    },
  );

  app.post<{
    Params: { roomId: string };
    Body: { text?: string };
  }>("/api/rooms/:roomId/messages", async (request, reply) => {
    const user = requireUser(database, request, reply, activeClients);
    if (!user) return reply;
    const roomId = request.params.roomId;
    if (!isRoomId(roomId)) {
      return reply.code(404).send({ error: "房间不存在" });
    }
    const text = String(request.body?.text ?? "").trim();
    if (!text || text.length > 2000) {
      return reply.code(400).send({ error: "消息长度需为 1-2000 字" });
    }
    const message = database.createMessage({ roomId, userId: user.id, text });
    rooms.broadcastChat(roomId, message);
    return { message };
  });

  app.get("/api/admin/users", async (request, reply) => {
    const admin = requireAdmin(database, request, reply, activeClients);
    if (!admin) return reply;
    return { users: database.listUsers() };
  });

  app.get("/api/admin/rooms", async (request, reply) => {
    const admin = requireAdmin(database, request, reply, activeClients);
    if (!admin) return reply;
    return {
      rooms: rooms.roomSummaries(),
      wtnEnabled: appConfig.wtnEnabled,
      rtcEnabled: appConfig.rtcEnabled,
    };
  });

  app.put<{
    Params: { roomId: string };
    Body: { mode?: MediaMode };
  }>("/api/admin/rooms/:roomId/media", async (request, reply) => {
    const admin = requireAdmin(database, request, reply, activeClients);
    if (!admin) return reply;
    const roomId = request.params.roomId;
    const mode = request.body?.mode;
    if (!isRoomId(roomId) || (mode !== "p2p" && mode !== "wtn" && mode !== "rtc")) {
      return reply.code(400).send({ error: "房间或媒体模式不合法" });
    }
    if (mode === "wtn" && !appConfig.wtnEnabled) {
      return reply.code(409).send({ error: "火山 WTN 尚未配置" });
    }
    if (mode === "rtc" && !appConfig.rtcEnabled) {
      return reply.code(409).send({ error: "火山 RTC 尚未配置" });
    }
    const summary = rooms.roomSummaries().find((room) => room.id === roomId);
    if (!summary) {
      return reply.code(404).send({ error: "房间不存在" });
    }
    if (summary.occupants > 0) {
      return reply.code(409).send({ error: "请等待房间内用户离开后再切换媒体模式" });
    }
    database.setRoomMediaMode(roomId, mode);
    if (!rooms.setRoomMediaMode(roomId, mode)) {
      return reply.code(409).send({ error: "当前房间等级不允许使用该媒体线路" });
    }
    return {
      room: rooms.roomSummaries().find((room) => room.id === roomId),
    };
  });

  app.post<{
    Body: {
      username?: string;
      displayName?: string;
      password?: string;
      isAdmin?: boolean;
    };
  }>("/api/admin/users", async (request, reply) => {
    const admin = requireAdmin(database, request, reply, activeClients);
    if (!admin) return reply;

    const username = String(request.body?.username ?? "").trim();
    const displayName = String(request.body?.displayName ?? "").trim();
    const password = String(request.body?.password ?? "");
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    if (usernameError) return reply.code(400).send({ error: usernameError });
    if (passwordError) return reply.code(400).send({ error: passwordError });
    if (!displayName || displayName.length > 32) {
      return reply.code(400).send({ error: "昵称长度需为 1-32 字" });
    }
    try {
      const user = database.createUser({
        username,
        displayName,
        passwordHash: hashPassword(password),
        isAdmin: Boolean(request.body?.isAdmin),
      });
      return reply.code(201).send({ user });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("UNIQUE constraint") || error.message.includes("users.username"))
      ) {
        return reply.code(409).send({ error: "这个账号已经存在" });
      }
      throw error;
    }
  });

  app.get("/ws", { websocket: true }, (socket, request) => {
    const query = request.query as { clientId?: string };
    const user = requestUser(database, request, activeClients, query.clientId);
    if (!user) {
      socket.close(4401, "Unauthorized");
      return;
    }
    const origin = request.headers.origin;
    if (origin && appConfig.allowedOrigins.length && !appConfig.allowedOrigins.includes(origin)) {
      socket.close(4403, "Origin not allowed");
      return;
    }
    rooms.attach(user, socket);
  });

  if (fs.existsSync(path.join(appConfig.webDistDir, "index.html"))) {
    await app.register(fastifyStatic, {
      root: appConfig.webDistDir,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && request.headers.accept?.includes("text/html")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  }

  app.setErrorHandler((error: unknown, _request, reply) => {
    const maybeError = error as {
      code?: string;
      statusCode?: number;
      message?: string;
    };
    app.log.error(error);
    return reply.code(maybeError.statusCode ?? 500).send({
      error:
        maybeError.statusCode && maybeError.statusCode < 500
          ? maybeError.message
          : "服务器内部错误",
    });
  });

  return app;
}
