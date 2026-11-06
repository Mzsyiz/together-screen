# Development

English | [简体中文](DEVELOPMENT.zh-CN.md)

## Stack

- React 19 and Vite for the web client;
- Fastify and WebSocket for API and signaling;
- SQLite through Node.js `DatabaseSync`;
- WebRTC, Volcengine RTC and WTN for screen sharing and voice;
- Vitest for server-side tests;
- TypeScript strict mode across client, server and shared protocols.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Fastify and Vite together |
| `npm run dev:server` | Run only the API/signaling server |
| `npm run dev:web` | Run only Vite |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run Vitest |
| `npm run build` | Build web assets and server output |
| `npm run check` | Type-check, test and build |
| `npm run user:add` | Add a user in development |
| `npm run user:list` | List users in development |

## Source layout

```text
src/
├── server/
│   ├── app.ts             Fastify HTTP and WebSocket routes
│   ├── auth.ts            password hashing and token helpers
│   ├── config.ts          environment and ICE server construction
│   ├── db.ts              SQLite schema and queries
│   ├── room-hub.ts        in-memory rooms and signaling relay
│   ├── rtc.ts             Volcengine RTC token generation
│   ├── wtn.ts             Volcengine WTN JWTs and resource URLs
│   └── cli/               admin CLI commands
├── shared/
│   └── types.ts           shared REST/WebSocket/media types
└── web/
    ├── App.tsx            application screens and room UI
    ├── useRoomSession.ts  WebRTC, signaling and voice lifecycle
    ├── volc-rtc-client.ts Volcengine RTC dual-stream client
    ├── wtn-client.ts      WTN WHIP/WHEP client
    ├── api.ts             browser API client and client ID
    └── styles.css         responsive application styles
```

## Protocol changes

When changing signaling:

1. Add or update the discriminated union in `src/shared/types.ts`.
2. Validate room membership on the server.
3. Preserve backward compatibility only when intentionally supported.
4. Add a server relay or state test.
5. Test the client with two independent browser contexts.

For sender-controlled media changes, use an acknowledgement path instead of changing only local UI state.

When adding a room media mode, update:

- `MediaMode` in `src/shared/types.ts`;
- the SQLite `room_media_settings` constraint and migration;
- `/api/config`, admin room responses and media-mode update routes;
- `useRoomSession.ts` and the matching media client;
- admin UI plus room-card and room-header labels;
- bilingual documentation, migration tests and a real two-browser test.

## WebRTC debugging

Useful browser tools:

- `chrome://webrtc-internals`;
- browser console;
- `RTCPeerConnection.getStats()`;
- `sender.getParameters()` and `track.getSettings()`.

Do not commit raw diagnostic dumps. They can contain real IP addresses and network metadata. Extract only the relevant metrics and redact identifiers.

Relevant metrics:

- selected candidate type;
- RTT;
- packet loss;
- jitter;
- frame dimensions and FPS;
- bitrate;
- decoder time;
- freeze count;
- quality limitation reason.

## UI testing

For layout changes, verify:

- 1440 px desktop width;
- 1024 px narrow desktop;
- 760 px tablet;
- 390 px mobile;
- settings popovers;
- long chat messages;
- multiple simultaneous shares;
- pointer move, pointer leave, window blur and tab return.

Screen and voice changes require two independent browser contexts with separate accounts.

Additional RTC checks:

- `/api/rtc/token` returns only short-lived tokens, never the AppKey;
- a new viewer receives an autoplaying preview;
- clicking switches to the main screen and unfocusing returns to preview;
- changing quality does not republish microphone audio;
- microphone mute does not mute shared system audio;
- with shared system audio disabled, neither preview nor HD plays it;
- with it enabled, preview remains silent and focused HD plays it.

## Data safety

Tests must use temporary database directories and must not modify a development or production database. Do not add seed users with real passwords.

## Documentation

Update the relevant file when behavior changes:

- `README.md`: user-facing overview and setup;
- `docs/MEDIA_TRANSPORTS.md`: transport selection, cost and audio rules;
- `docs/ARCHITECTURE.md`: topology and protocol;
- `docs/DEPLOYMENT.md`: production operations;
- `docs/TROUBLESHOOTING.md`: user-visible failure modes;
- `CHANGELOG.md`: notable changes.
