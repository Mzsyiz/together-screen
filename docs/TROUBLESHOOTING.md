# Troubleshooting

English | [简体中文](TROUBLESHOOTING.zh-CN.md)

## Cannot open the site or log in

Check the Node service:

```bash
curl http://127.0.0.1:3000/api/health
systemctl status together-screen
```

Check:

- `APP_ORIGIN` exactly matches scheme, host and port;
- HTTPS certificate is valid;
- `COOKIE_SECURE=true` is used only with HTTPS;
- the reverse proxy forwards `/api` and `/ws`;
- `TRUST_PROXY=true` when running behind Nginx or Baota.

## Login succeeds but rooms are unavailable

An account can have only one active browser client. Logging in from another browser, tab or device invalidates the previous page. Refresh the old page and log in again if necessary.

## Screen sharing is unavailable

`getDisplayMedia()` requires a secure context. Use:

- `https://` in production;
- `http://localhost` for local development.

Recommend desktop Chrome or Edge.

## Remote video is black

The current client caches the latest real decoded frame and uses it while a tile is idle. If video still turns black:

1. Confirm the tile shows “Preview · Autoplay” or “Connecting lightweight preview”.
2. Check whether the sender still shows “Stopping share” incorrectly.
3. Check browser console and `chrome://webrtc-internals`.
4. Verify that the shared window still exists and is not protected content.
5. Test with another browser or window source.

Do not upload a raw WebRTC dump publicly; it may contain IP addresses and network metadata.

## Video is blurry

Check the quality state:

- A “Latest frame” overlay should appear only briefly during connect, switch or reconnect.
- “Preview” is intentionally low bitrate and about 360p.
- “HD” appears only after the sharer confirms sender parameters.

If the card says “Switching to HD” for too long, the sender may not support the requested encoding parameters or the browser may be under load.

Static desktop content produces low measured bitrate because the encoder compresses unchanged frames efficiently. Test motion or gaming content separately before buying more bandwidth.

For higher quality over WTN, start with these ranges:

- 1080p / 30 FPS: 5-8 Mbps;
- 2K / 1440p / 30 FPS: 10-15 Mbps;
- 4K / 2160p / 30 FPS: 20-30 Mbps;
- gaming at 1080p / 60 FPS: 10-15 Mbps.

If the badge says 4K but the image is still soft, verify that the browser capture source is actually 4K instead of an upscaled low-resolution window. In P2P rooms, 4K significantly increases the sharer's upload to every viewer; WTN is primarily limited by sharer upload and Volcengine plan limits.

## Video is delayed or stutters

Possible causes:

- sender upload bandwidth;
- TURN relay throughput;
- Wi-Fi packet loss;
- browser encoding load;
- too many simultaneous high-quality shares.

Try:

- lower the resolution or use the省带宽 preset;
- request HD for one share at a time;
- close other tabs using video capture;
- use a wired connection;
- verify TURN relay ports and egress limits.

## Voice cannot join

Check browser permissions:

1. Click the site icon in the address bar.
2. Allow microphone access.
3. Ensure another application is not exclusively using the microphone.
4. Refresh after changing OS-level microphone permissions.

Use HTTPS. Microphone capture is blocked in insecure contexts outside localhost.

## Voice connects but no sound

Check:

- the room-sound button is not muted;
- “Voice output volume” is above zero;
- the remote participant is not muted;
- the browser output device is correct;
- remote audio is not blocked by OS application volume settings.

The voice settings panel shows participant connection state and speaking indicators.

## P2P fails

If ICE remains disconnected in restrictive networks, configure TURN. Public STUN only discovers addresses; it does not relay media.

Verify:

```bash
ss -lunpt | grep 3478
turnutils_stunclient turn.example.com
```

Also verify that UDP relay ports are allowed by both the OS firewall and the cloud security group.

## Volcengine WTN fails

Check:

- `WTN_APP_ID` and `WTN_APP_KEY` are configured on the server;
- the room is empty when changing its media mode;
- the room badge and room header show “Volcengine WTN”;
- publish and subscribe authentication are enabled in the WTN console;
- the AppKey used by the server matches the WTN application;
- the browser can access `wtn.volcvideo.com`;
- the server clock is accurate, because JWTs use Unix expiry timestamps;
- the room has not exceeded WTN billing or concurrency limits.

The browser must never receive `WTN_APP_KEY`. If a WTN request fails, use the response status and the browser Network panel; do not paste the full JWTs into public Issues.

WTN screen quality no longer depends on `RID`. Every share creates two independent StreamIDs; their request paths contain `_screen_preview` and `_screen_hd`. Entering the room should automatically show “Preview · Autoplay”; a click should show “Switching to HD”, and the HD badge should appear only after the independent HD subscription succeeds. If the HD subscription fails, the viewer remains on preview and receives the error. Server logs or the Network panel should show the HD publish and subscribe requests.

If preview works but HD never appears, check that the second screen publish request succeeded, that the WTN application permits two streams from the same user, and that the room has not reached a WTN concurrency limit. Do not paste full JWTs into public Issues.

## Settings popovers do not appear

Hard refresh after upgrading:

```text
Ctrl + Shift + R
```

The settings popovers must escape the bottom control bar's clipping context. Older cached CSS may continue to hide them.

## SQLite errors

- Ensure `DATA_DIR` exists and is writable by the service user.
- Do not run two application instances against the same SQLite directory.
- Back up `app.sqlite`, `app.sqlite-wal` and `app.sqlite-shm` together.
- Restore with the service stopped.

## Diagnostic guidance

For WebRTC issues, useful information includes:

- browser and version;
- number of room participants;
- direct P2P or TURN relay;
- RTT, packet loss, jitter, freeze count and codec;
- whether the content is static or moving;
- selected resolution, FPS and bitrate;
- server region and whether TURN is used.

Redact public IPs, private IPs, cookies, account names and TURN credentials before posting diagnostics.
