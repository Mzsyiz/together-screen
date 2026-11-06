# Media Transport Guide

English | [简体中文](MEDIA_TRANSPORTS.zh-CN.md)

Together Screen always uses its application server for accounts, rooms, chat and media control. Screen and voice media can use different transports. The media mode is stored per room and can be changed only while the room is empty.

## Three transports

| Transport | Media path | Advantages | Main costs and limits | Recommended use |
| --- | --- | --- | --- | --- |
| `P2P` | Direct browser-to-browser, with coturn fallback | No third-party RTC dependency; low latency for small groups; media usually avoids the application server | One connection per direction; a ten-person room can reach 90 directional links; sender upload and browser encoding grow with each viewer; TURN consumes server egress | 2–4 people, few simultaneous sharers, healthy networks |
| `RTC` | Volcengine Real-Time Communication | More stable for multi-sharer ten-person rooms; independent microphone and screen streams; viewer-selectable preview and main screen; no self-hosted media egress | Requires AppID/AppKey; billed by actual audio/video minutes; depends on Volcengine availability and networks | Primary choice for multiple simultaneous shares and cross-carrier use |
| `WTN` | Volcengine WebRTC Transmission Network | Decoupled publishing and subscribing; useful for one-to-many distribution; preview and HD use independent StreamIDs | Separate WTN application required; cloud media and billing costs; publishers must create and destroy media resources | Rooms already designed around WTN publishing and subscriptions |

The application server remains required. It provides:

- accounts, sessions and authorization;
- fixed rooms, membership and chat;
- WebSocket signaling and quality requests;
- short-lived TURN credentials;
- RTC/WTN token signing;
- SQLite persistence.

This is therefore not a “serverless” application. P2P keeps media off the application server where possible; RTC/WTN move media forwarding to Volcengine.

## Choosing a transport

### Choose P2P when

- the room is small;
- normally only one person shares;
- participants can connect directly or have a reliable TURN service;
- minimizing third-party media cost is the priority.

### Choose RTC when

- multiple people share in a ten-person room;
- viewers should auto-play a lightweight preview and request HD on click;
- microphone voice must remain independent from screen quality;
- sender upload, TURN egress or signaling maintenance has become a bottleneck;
- per-minute cloud media billing is acceptable.

RTC is the recommended default for multi-sharer ten-person rooms. Each room is configured independently; unused rooms do not establish RTC connections.

### Choose WTN when

the Volcengine WTN application is already configured and the room should use WTN publishing/subscription resources. WTN and RTC use different AppID/AppKey pairs, SDK paths and billing products; their credentials are not interchangeable.

## Changing room mode

1. Confirm that the room has no online members.
2. Open Admin Center.
3. Change the room's media transport.
4. Re-enter the room; the card and room header show the new transport.

Switching is blocked while users are present to avoid interrupting active media. The selection is persisted in SQLite and survives restarts.

## Preview and HD behavior

All transports use the same preview-first interaction:

1. Entering a room automatically starts a lightweight preview.
2. The latest frame is used only during connection, switching or reconnect fallback.
3. Clicking a participant requests HD.
4. Leaving focus or selecting another participant returns to preview.

Users select a standardized use case rather than arbitrary encoder values:

| Mode | Profile | Intended content |
| --- | --- | --- |
| Lite | 360p / 15 FPS / 0.8 Mbps | Constrained networks and minimum bandwidth |
| Smooth | 720p / 10 FPS / 1.5 Mbps | Chat, web browsing and basic content |
| Standard | 1080p / 15 FPS / 2.5 Mbps | Default; office, documents and code |
| HD | 1080p / 30 FPS / 4 Mbps | Animation, software demos and video |
| Ultra | 1440p / 30 FPS / 8 Mbps | Detailed desktops and high-resolution content |
| Gaming | 1080p / 60 FPS / 8 Mbps | Games and fast motion |
| 4K | 2160p / 30 FPS / 20 Mbps | 4K sources and professional presentations |

Bitrates are caps. Congestion control, the capture source and network conditions determine actual sending bitrate.

## Microphone and shared system audio

These are separate audio paths:

| Audio | Default | Mute behavior | Transport |
| --- | --- | --- | --- |
| Microphone voice | Not joined | Mutes only the sender's voice without leaving voice chat | P2P voice, RTC main stream or WTN voice stream |
| Shared system audio | Off | Enabled by the sharer before screen capture | Travels with the HD screen stream; preview never carries it |

Rules:

- Microphone voice is always independent from screen quality.
- Changing 360p, 720p, 1080p, 2K or 4K must not reconnect voice.
- Shared system audio is off by default and must be explicitly enabled.
- Viewers on preview do not hear shared system audio.
- Shared system audio starts only after HD is selected and the main screen is subscribed.
- Microphone mute never stops movie, game or tab audio.

The operating system and browser determine what can be captured. Chrome/Edge on Windows commonly supports screen audio; macOS often limits capture to the selected tab. The audio decision must be made before `getDisplayMedia()` starts; changing it during an active share requires stopping and restarting the share.

## Cost and capacity

P2P costs are dominated by sender upload, viewer download, browser encoding load and optional TURN egress. Simultaneous HD shares multiply these costs.

RTC/WTN costs are dominated by cloud media minutes, sender upload and Volcengine plan limits. RTC generally bills each viewer's received media, so “one sharer and nine previews” is very different from “ten simultaneous HD sharers.”

Before launch, test a full day using the real participant count, real number of sharers and expected quality. Do not size capacity from a single-user test.

## Browser guidance

- Prefer desktop Chrome or Edge for sharing.
- Safari, Firefox and mobile browsers can often view and chat, but system-audio and high-resolution support varies.
- Do not sign into multiple participants using normal tabs in one browser profile; use separate browsers or isolated profiles for testing.
- Public deployments must use HTTPS/WSS.
