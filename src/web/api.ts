import type {
  AuthResponse,
  ChatMessage,
  ClientConfig,
  MediaMode,
  PublicUser,
  RoomId,
  RoomSummary,
  WtnMediaKind,
  WtnPublishResource,
  WtnSubscribeResource,
} from "../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const CLIENT_ID = crypto.randomUUID();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const hasJsonBody =
    init?.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData);
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      "X-Client-Id": CLIENT_ID,
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    if (
      response.status === 401 &&
      !url.endsWith("/api/auth/login") &&
      !url.endsWith("/api/auth/me")
    ) {
      window.dispatchEvent(new Event("together:session-expired"));
    }
    throw new ApiError(body.error ?? "请求失败", response.status);
  }
  return body;
}

export const api = {
  me: () => request<AuthResponse>("/api/auth/me"),
  claim: () => request<AuthResponse>("/api/auth/claim", { method: "POST" }),
  login: (username: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  config: () => request<ClientConfig>("/api/config"),
  rooms: () => request<{ rooms: RoomSummary[] }>("/api/rooms"),
  messages: (roomId: RoomId) =>
    request<{ messages: ChatMessage[] }>(`/api/rooms/${roomId}/messages`),
  sendText: (roomId: RoomId, text: string) =>
    request<{ message: ChatMessage }>(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  adminUsers: () => request<{ users: PublicUser[] }>("/api/admin/users"),
  adminRooms: () =>
    request<{ rooms: RoomSummary[]; wtnEnabled: boolean }>("/api/admin/rooms"),
  updateRoomMedia: (roomId: RoomId, mode: MediaMode) =>
    request<{ room: RoomSummary }>(`/api/admin/rooms/${roomId}/media`, {
      method: "PUT",
      body: JSON.stringify({ mode }),
    }),
  createUser: (input: {
    username: string;
    displayName: string;
    password: string;
    isAdmin: boolean;
  }) =>
    request<{ user: PublicUser }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  wtnPublish: (kind: WtnMediaKind) =>
    request<WtnPublishResource>("/api/wtn/publish", {
      method: "POST",
      body: JSON.stringify({ kind }),
    }),
  wtnSubscribe: (
    ownerId: string,
    kind: WtnMediaKind,
    rid: "low" | "high",
  ) =>
    request<WtnSubscribeResource>("/api/wtn/subscribe", {
      method: "POST",
      body: JSON.stringify({ ownerId, kind, rid }),
    }),
};
