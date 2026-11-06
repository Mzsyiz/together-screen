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

This is a cost-effective choice for small rooms. A ten-person room can reach 90 directional links; sender upload, browser encoding load and TURN egress then increase rapidly. WTN is preferable when several people share at once.

## Per-room media modes

Each fixed room stores a persistent `mediaMode`:

- `p2p`: the existing browser mesh with STUN/TURN fallback;
- `wtn`: Volcengine WebRTC Transmission Network publish/subscribe transport.

Only an administrator can change the mode, and only while the room is empty. This avoids tearing down active media unexpectedly.

The application provides ten identical rooms with a capacity of 10 participants each. There are no room tiers. An administrator can independently choose P2P/TURN or WTN for every empty room.

The client exposes standardized usage profiles instead of arbitrary resolution, frame-rate and bitrate combinations:

| Mode | Target | Encoder strategy | Intended content |
| --- | --- | --- | --- |
| Smooth | 720p / 10 FPS / 1.5 Mbps | Balanced | Chat, basic browsing, low bandwidth |
| Standard | 1080p / 15 FPS / 2.5 Mbps | Resolution first | Default; office, web, documents and code |
| HD | 1080p / 30 FPS / 4 Mbps | Balanced | Software demos, animation and video |
| Ultra | 1440p / 30 FPS / 8 Mbps | Resolution first | High-resolution desktops and detail |
| Gaming | 1080p / 60 FPS / 8 Mbps | Frame rate first | Games and fast movement |
| 4K | 2160p / 30 FPS / 20 Mbps | Resolution first | 4K source and sufficient upload |

Every room exposes the same six profiles. WebRTC congestion control continues to adapt actual send bitrate.

### Volcengine WTN path

WTN rooms publish screen preview, screen HD and voice as three independent streams:

```text
screen preview: <room>_<user>_screen_preview_<unique>
screen HD:      <room>_<user>_screen_hd_<unique>
voice:          <room>_<user>_voice_<unique>
```

The publishing browser creates two WHIP-style `RTCPeerConnection` instances for the screen: a preview stream at roughly 360p / 15 FPS / 300 Kbps and an HD stream whose resolution, frame rate, bitrate and degradation strategy come from a standardized profile. Preview does not depend on simulcast RIDs, so the WTN application does not need to expose RID switching. Viewers automatically subscribe to and continuously play a preview for every visible share. A click replaces preview with an independent HD subscription. Moving focus or leaving HD re-subscribes preview; the cached latest frame is only a negotiation-time fallback.

The second stream adds roughly 300 Kbps to the sharer's upload, but makes preview and HD deterministic by using separate StreamIDs instead of a per-stream layer selector. Screen system audio is published with the HD stream only; microphone voice remains a separate voice stream.

The Fastify server:

- validates the user's room and media mode;
- records the latest preview, HD and voice StreamID independently;
- validates that the requested screen quality or voice stream is active before issuing a subscription resource;
- creates protocol-safe stream IDs;
- signs short-lived HS256 WTN JWTs;
- returns only the WTN URL and token to the browser.

`WTN_APP_KEY` remains server-only. Replacing or stopping a WTN publisher destroys its media resource; subscribers close their own resources when the preview is released or the participant leaves.

## Screen sharing flow

### Start sharing

1. The sharer calls `getDisplayMedia()`.
2. The browser applies the configured resolution and frame-rate limits.
3. A low-resolution startup snapshot is captured for protocol compatibility and connection-time fallback.
4. The client sends `share.started` and the startup snapshot metadata through WebSocket.
5. The sharer creates one outgoing `RTCPeerConnection` per room member.
6. Offer, answer and ICE candidates are relayed by the server.

### Automatic preview, HD and latest-frame fallback

Each outgoing video sender starts in preview mode:

- maximum bitrate: about 300 Kbps;
- maximum frame rate: 15 FPS;
- resolution scaled to approximately 360p;
- low network priority.

After entering a room, the viewer immediately requests a low-bitrate preview for every sharer and plays it continuously without hover or click. Each viewer also keeps a local latest-frame cache. The cached image covers subscription setup, preview/HD transitions and reconnects, then disappears as soon as a new video frame is available. Clicking requests HD:

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
- Automatically playing video updates the local latest-frame cache about once per second; switching tiles or leaving HD captures the current frame immediately.
- A healthy preview stays live; the latest frame never freezes normal low-bitrate playback.
- Clicking a frozen idle tile always re-requests preview or HD even though it currently has no `MediaStream`.
- A new share uses a new `startedAt` cache key, preventing stale frames from leaking across share sessions.

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

Audio constraints request echo cancellation, noise suppression, automatic gain control, mono capture and a 48 kHz ideal sample rate. The sender prefers Opus, applies an approximately 48 Kbps voice bitrate cap after negotiation and marks the track with a speech content hint. If the active microphone disconnects unexpectedly, the client attempts to switch to the system default input instead of dropping the entire voice session. Browser and hardware support still vary.

## WebSocket protocol

### Client to server

| Event | Purpose |
| --- | --- |
| `room.join` | Join a fixed room |
| `room.leave` | Leave the current room |
| `share.started` | Publish a new screen share and startup snapshot |
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
