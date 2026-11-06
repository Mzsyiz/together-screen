# Contributing to Together Screen

English | [简体中文](CONTRIBUTING.zh-CN.md)

Thank you for helping improve Together Screen.

## Before you start

- Search existing Issues and Pull Requests first.
- Open an Issue for significant behavior or architecture changes before implementation.
- Report security vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Development setup

Requirements:

- Node.js 22.13 or newer;
- npm;
- desktop Chrome or Edge;
- optional coturn for multi-network testing.

```bash
cp .env.example .env
npm install
npm run user:add -- \
  --username admin \
  --display Admin \
  --password "at-least-8-characters" \
  --admin
npm run dev
```

Open `http://localhost:5173`.

## Checks

Run the full local check before opening a Pull Request:

```bash
npm run check
```

This runs:

- TypeScript type checking;
- Vitest;
- production build.

For UI or WebRTC changes, also test with two independent browser contexts. When possible, verify:

- screen share start and stop;
- poster, preview and confirmed HD states;
- pointer leave and browser focus changes;
- simultaneous shares;
- RTC/WTN autoplay preview, click-to-HD and system-audio toggle;
- voice remaining connected while screen quality changes;
- voice join, mute, device state and reconnect;
- desktop and narrow layouts.

## Code guidelines

- Keep TypeScript strict and avoid `any` unless a browser API requires a narrow cast.
- Put shared protocol types in `src/shared/types.ts`.
- Keep server-only secrets and filesystem paths out of browser code.
- Preserve existing room and WebSocket message invariants.
- Prefer small focused functions and explicit cleanup for media resources.
- Stop both microphone and screen tracks when they are no longer used.
- Do not call `video.pause()` as an idle optimization for remote WebRTC streams.
- Add or update tests for server behavior and protocol changes.
- Keep comments useful; explain why rather than restating code.

## Commit messages

Conventional commit prefixes are recommended:

```text
feat: add room voice volume controls
fix: keep remote video playing when idle
docs: clarify TURN deployment
test: cover quality confirmation
refactor: simplify voice peer cleanup
```

## Pull Requests

Include:

- what changed;
- why it changed;
- user-visible impact;
- test evidence;
- screenshots or recordings for UI changes;
- migration or deployment notes when relevant.

Keep unrelated changes out of the same Pull Request.

## Privacy

Never commit:

- `.env` files;
- TURN shared secrets or static credentials;
- WTN/RTC AppKeys, full tokens or reusable JWTs;
- SQLite databases;
- cookies and session tokens;
- WebRTC diagnostic dumps;
- public or private IP addresses from real deployments;
- account passwords or personal information.

If private data is committed, rotate the affected credential immediately. Removing the file in a later commit does not remove it from Git history.

## License

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
