# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows semantic versioning when it reaches a stable `1.0` release.

## [Unreleased]

### Added

- Per-room administrator-selected P2P/TURN or Volcengine WTN media transport.
- Added 15 rooms covering every 2-6 capacity in Normal, Advanced and Ultimate tiers, with server-enforced transport and quality limits.
- Server-signed short-lived WTN JWTs and browser WHIP/WHEP publishing/subscribing.
- Complete P2P room voice controls, devices, gain, levels, output volume and speaking indicators.
- Standardized screen quality around 720p, 1080p, 2K/1440p and 4K/2160p profiles.
- Added Ultra, Gaming and 4K profiles where the room tier permits them.
- Replaced arbitrary encoder controls with Smooth, Standard, HD, Ultra, Gaming and 4K profiles; Standard is the default at 1080p/15 FPS/2.5 Mbps.
- Optimized voice with Opus preference, a 48 Kbps cap, real-time priority and automatic default-microphone recovery after device loss.
- Architecture, deployment, troubleshooting and open-source contribution documentation.
- GitHub CI, Issue templates, Pull Request template and Dependabot configuration.

### Changed

- Idle tiles now show the latest real decoded frame instead of the stale share-start poster.
- Remote shares now autoplay their lightweight preview on entry; the latest-frame cache is only a connection and switch fallback.
- Settings popovers now escape the bottom control bar clipping context.
- Docker configuration now forwards TURN shared-secret and proxy/session settings.

### Fixed

- Deferred P2P `setParameters()` until negotiation completes.
- Removed unsupported WTN `sendEncodings.priority` fields for Chromium compatibility.
- Replaced WTN RID switching with independently published and subscribed `preview` and `hd` streams.
- Kept the active preview stream when an HD switch fails, avoiding playback interruption and retry-loop crashes.
- Generated a unique WTN publish StreamID for every share attempt and blocked duplicate start clicks.
- Removed the misleading WTN RID compatibility notice; quality badges now reflect the actual subscription.
- Made full error details visible, selectable and copyable above every room control.

### Security

- Runtime diagnostics, private deployment notes and release archives are ignored by Git and Docker.
- Removed private diagnostic and local-note files from the current Git index while preserving local copies.

## [0.1.0] - 2026-11-05

### Added

- Fixed 2–6 person rooms.
- Multi-user WebRTC screen sharing with preview and HD quality modes.
- Text chat and persistent SQLite history.
- Administrator-created accounts and single-active-client sessions.
- STUN, TURN and coturn shared-secret support.
- Desktop and narrow-screen layouts.
