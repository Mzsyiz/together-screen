# Mainstream Screen-sharing Parameter Reference

English | [简体中文](SCREEN_SHARING_BENCHMARK.zh-CN.md)

This page records only parameters supported by public vendor documentation. Bitrates that a vendor does not publish are not presented as official values.

## Public parameter comparison

| Product | Published resolution/FPS | Published bandwidth or bitrate | Notes |
| --- | --- | --- | --- |
| Zoom | Meeting video up to 1080p; the bandwidth document does not specify a screen-sharing FPS | Group 1080p video recommends 3.8 Mbps up / 3.0 Mbps down; screen sharing alone recommends 50–75 Kbps, or 50–150 Kbps with a video thumbnail | These are Zoom network-planning recommendations, not fixed encoder settings |
| Microsoft Teams | Video and content up to 1080p at 30 FPS | Recommended meeting screen sharing is 2.5/2.5 Mbps; Best Performance is 4/4 Mbps; content FPS adapts from 7.5–30 | Teams explicitly prioritizes audio and adapts to network conditions |
| Discord | Free users up to 720p/30 FPS; Nitro and Nitro Classic up to 4K/60 FPS; iOS Nitro up to 1080p/60 FPS | Discord does not publish a standard bitrate | Community estimates of roughly 1.5–3 Mbps for 720p30 remain unofficial |
| Google Meet | Send/receive options up to 1080p, with 720p and 360p options | Google does not publish a screen-sharing-specific bitrate | 1080p sending depends on plan, browser, device and processing power |
| Tencent RTC / TRTC | The SDK allows screen-sharing resolution and frame-rate configuration | Substream bitrate is configurable | Tencent Meeting does not publish one universal consumer bitrate table; TRTC settings are not proof of current Tencent Meeting defaults |

## Lessons for this project

1. Mainstream products generally treat 1080p as the primary office-sharing tier and do not expose raw encoder controls.
2. Office/document content uses a lower frame rate; dynamic content raises it.
3. Under congestion, products reduce quality while protecting audio continuity.
4. Static screen content often uses far less than the bitrate cap because unchanged regions compress efficiently.
5. 4K/60 FPS is a premium or professional capability rather than a default.

## Current Together Screen profiles

| Mode | Parameters | Intended use |
| --- | --- | --- |
| Smooth | 720p / 10 FPS / 1.5 Mbps | Chat, browsing and constrained networks |
| Standard | 1080p / 15 FPS / 2.5 Mbps | Office, web, documents and code |
| HD | 1080p / 30 FPS / 4 Mbps | Software demos, animation and video |
| Ultra | 1440p / 30 FPS / 8 Mbps | Detailed desktops and high-resolution content |
| Gaming | 1080p / 60 FPS / 8 Mbps | Games and fast movement |
| 4K | 2160p / 30 FPS / 20 Mbps | 4K presentations |

## Official sources

- Zoom: <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060748>
- Microsoft Teams: <https://learn.microsoft.com/en-us/microsoftteams/prepare-network>
- Discord: <https://support.discord.com/hc/en-us/articles/360040816151-Go-Live-and-Screen-Share>
- Google Meet: <https://support.google.com/meet/answer/9302964>
- Tencent Cloud TRTC: <https://cloud.tencent.com/document/product/647>

Sources checked: 2026-11-06.
