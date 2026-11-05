# Architecture

English | [简体中文](ARCHITECTURE.zh-CN.md)

## Goals

Together Screen is designed for a small, trusted group:

- fixed rooms of 2 to 6 people;
- one administrator-managed account per participant;
- multiple simultaneous screen shares;
- low-bandwidth previews and click-to-upgrade HD streams;
- peer-to-peer voice;
- persistent text chat;
- self-hosted deployment with no third-party SaaS dependency.

It deliberately does not attempt to be a large meeting platform or an SFU.

## High-level components

```text
React browser client
├── room and chat UI
├── WebRTC screen peers
├── WebRTC voice peers
└── WebSocket signaling client
          │
          ▼
Fastify application server
├── authentication and sessions
├── room membership and capacity
├── WebSocket signaling relay
├── quality request/confirmation relay
├── chat REST API
└── SQLite persistence

STUN / coturn
└── NAT discovery and optional media relay
```

## Media topology

The application uses a mesh topology:

```text
A sends screen and voice to B and C
B sends screen and voice to A and C
C sends screen and voice to A and B
```

For `N` participants, there can be up to `N × (N - 1)` directional media links. The browser performs encoding and decoding locally, so the application server only carries signaling and chat traffic.

This is a cost-effective choice for small rooms. It becomes inefficient when the room grows: sender upload, browser encoding load and TURN egress all increase rapidly.

## Screen sharing flow

### Start sharing

1. The sharer calls `getDisplayMedia()`.
2. The browser applies the configured resolution and frame-rate limits.
3. A low-resolution JPEG poster is captured for idle display.
4. The client sends `share.started` and the poster metadata through WebSocket.
5. The sharer creates one outgoing `RTCPeerConnection` per room member.
6. Offer, answer and ICE candidates are relayed by the server.

### Idle, preview and HD

Each outgoing video sender starts in preview mode:

- maximum bitrate: about 300 Kbps;
- maximum frame rate: 15 FPS;
- resolution scaled to approximately 360p;
- low network priority.

Idle viewers see the poster. Hovering reveals the live preview. Clicking requests HD:

1. Viewer sends `quality.request`.
2. Server validates room membership and that the target is sharing.
3. Sharer calls `RTCRtpSender.setParameters()`.
4. Sharer sends `quality.ack` only after checking the result.
5. Viewer receives `quality.confirmed` and only then displays the HD state.

If parameter application fails, the viewer remains in preview mode and receives an explanatory message.

### Reconnect behavior

- WebSocket disconnect: reconnect with a short backoff.
- Screen share stop: keep the last frame for a short grace period to avoid UI flashing.
- Participant disconnect: delay removal briefly to absorb transient network changes.
- Video element: continue playing in the background and cover idle video with the poster instead of calling `pause()`.

## Voice flow

Voice uses the same ICE server configuration as screen sharing but a separate `RTCPeerConnection` for each direction.

1. User clicks Join Voice.
2. Browser requests microphone permission.
3. Capture is processed through Web Audio for input gain and level metering.
4. Server broadcasts `voice.updated`.
5. Each voice-enabled participant creates outgoing voice offers to other voice-enabled participants.
6. Remote streams are attached to hidden audio elements and analyzed for speaking indicators.
7. Muting disables the outgoing media tracks without tearing down the peer connections.
8. Leaving voice closes voice peers and stops all microphone processing tracks.

Audio constraints request echo cancellation, noise suppression, automatic gain control, mono capture and a 48 kHz ideal sample rate. Browser and hardware support still vary.

## WebSocket protocol

### Client to server

| Event | Purpose |
| --- | --- |
| `room.join` | Join a fixed room |
| `room.leave` | Leave the current room |
| `share.started` | Publish a new screen share and poster |
| `share.updated` | Update resolution, FPS or bitrate |
| `share.stopped` | Stop the current screen share |
| `signal` | Relay screen or voice SDP/candidate data |
| `quality.request` | Request preview or HD from a sharer |
| `quality.ack` | Confirm whether sender parameters were applied |
| `voice.updated` | Publish voice participation and mute state |
| `ping` | Connection heartbeat |

### Server to client

| Event | Purpose |
| --- | --- |
| `room.snapshot` | Full room membership and active shares |
| `participant.joined` / `participant.left` | Membership changes |
| `share.started` / `share.updated` / `share.stopped` | Screen-share changes |
| `signal` | Screen or voice SDP/candidate relay |
| `quality.request` | HD/preview request delivered to sharer |
| `quality.confirmed` | Sharer result delivered to viewer |
| `voice.updated` | Voice participation and mute changes |
| `chat.message` | New chat message |
| `room.error` | User-readable room error |
| `session.replaced` | Another page/device claimed the account |
| `pong` | Heartbeat response |

Payload types are defined in `src/shared/types.ts`.

## Authentication and sessions

- Passwords are hashed with Node.js `scrypt` and a random salt.
- Login sessions use random HttpOnly cookies.
- Only a token hash is stored in SQLite.
- Sessions expire after `SESSION_DAYS`.
- Login attempts are rate-limited in memory by client IP.
- Each account has one active browser client ID.
- A new login or browser tab invalidates the previous active client and closes its WebSocket.

## Persistence

SQLite stores:

- users;
- sessions;
- text messages;
- legacy attachment tables retained only for database compatibility.

SQLite WAL mode allows normal reads while writes occur. Back up the database and its WAL files together.

## TURN credentials

When `TURN_SECRET` is configured:

```text
username = expiryTimestamp:userId
credential = HMAC-SHA1(sharedSecret, username), base64 encoded
```

coturn validates the same HMAC. Credentials are short-lived, so the browser does not receive a permanent TURN password.

The shared secret is server-only data and must never be shipped to the browser or committed to Git.

## Scalability boundaries

Use the current architecture when:

- rooms are small;
- screen-share senders have adequate upload bandwidth;
- most pairs can establish direct P2P connections;
- TURN traffic remains within server egress limits.

Consider introducing an SFU when:

- rooms regularly exceed 6 to 10 people;
- every participant shares high-resolution video;
- sender upload or browser encoding becomes the bottleneck;
- TURN egress becomes more expensive than selective forwarding.

## Browser support

Recommended:

- desktop Chrome;
- desktop Edge.

Partial support:

- Safari: screen and system-audio behavior varies by macOS version;
- Firefox: screen-share picker and system-audio behavior differ by platform;
- mobile browsers: suitable for watching and chat, not recommended for primary screen sharing.
