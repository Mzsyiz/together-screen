# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows semantic versioning when it reaches a stable `1.0` release.

## [Unreleased]

### Added

- Per-room administrator-selected P2P/TURN or Volcengine WTN media transport.
- Server-signed short-lived WTN JWTs and browser WHIP/WHEP publishing/subscribing.
- Complete P2P room voice controls, devices, gain, levels, output volume and speaking indicators.
- Architecture, deployment, troubleshooting and open-source contribution documentation.
- GitHub CI, Issue templates, Pull Request template and Dependabot configuration.

### Changed

- Idle remote video now remains playing and is covered by a poster instead of being paused.
- Settings popovers now escape the bottom control bar clipping context.
- Docker configuration now forwards TURN shared-secret and proxy/session settings.

### Fixed

- Deferred P2P `setParameters()` until negotiation completes.
- Removed unsupported WTN `sendEncodings.priority` fields for Chromium compatibility.
- Used WTN-compatible `Low`/`High` RID values and added a no-RID subscription fallback.
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
