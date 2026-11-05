# Deployment

English | [简体中文](DEPLOYMENT.zh-CN.md)

This guide describes a production deployment with:

- Node.js 22;
- Fastify on `127.0.0.1:3000`;
- Nginx or a control-panel reverse proxy with HTTPS;
- persistent SQLite storage;
- optional coturn for restrictive NAT;
- systemd supervision.

## 1. Create a service account and directories

```bash
sudo useradd --system --home /opt/together-screen --shell /usr/sbin/nologin together
sudo mkdir -p /opt/together-screen /var/lib/together-screen
sudo chown -R together:together /opt/together-screen /var/lib/together-screen
```

Place the project in `/opt/together-screen`.

## 2. Configure environment variables

```bash
cd /opt/together-screen
cp .env.example .env
chmod 600 .env
```

Production example:

```dotenv
PORT=3000
HOST=127.0.0.1
APP_ORIGIN=https://screen.example.com
COOKIE_SECURE=true
TRUST_PROXY=true
DATA_DIR=/var/lib/together-screen
SESSION_DAYS=30

STUN_URLS=stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
TURN_SECRET=replace-with-a-long-random-secret
TURN_CREDENTIAL_TTL_SECONDS=3600

WTN_APP_ID=
WTN_APP_KEY=
WTN_BUSINESS_ID=
WTN_API_BASE_URL=https://wtn.volcvideo.com/webrtc
WTN_TOKEN_TTL_SECONDS=600
```

Generate a new TURN secret:

```bash
openssl rand -hex 32
```

Never reuse a secret that was committed to Git or shared in a screenshot.

## 2.1 Volcengine WTN

WTN is optional. To make it selectable in the room admin UI:

1. Create a WebRTC Transmission Network application in the Volcengine console.
2. Record its `AppID`, `AppKey` and optional `BusinessID`.
3. Put them in the server-side `.env`.
4. Enable publish and subscribe authentication in WTN for production.
5. Keep `WTN_APP_KEY` on the server; the browser receives only a short-lived JWT.
6. Restart the application and open Admin Center to select WTN for an empty room.

Rooms already containing users cannot change media mode. Switch the room while it is empty.

## 3. Install, build and create the admin

```bash
cd /opt/together-screen
npm ci
npm run build
npm run user:add:prod -- \
  --username admin \
  --display Admin \
  --password "use-a-long-unique-password" \
  --admin
```

Check the service:

```bash
PORT=3000 HOST=127.0.0.1 npm start
curl http://127.0.0.1:3000/api/health
```

Expected response:

```json
{"ok":true}
```

## 4. Run with systemd

Create `/etc/systemd/system/together-screen.service`:

```ini
[Unit]
Description=Together Screen
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=together
Group=together
WorkingDirectory=/opt/together-screen
EnvironmentFile=/opt/together-screen/.env
ExecStart=/usr/bin/node /opt/together-screen/dist/backend/server/index.js
Restart=always
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/together-screen

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now together-screen
sudo systemctl status together-screen
```

## 5. Nginx reverse proxy

Point DNS to the server and obtain a TLS certificate before enabling `COOKIE_SECURE=true`.

```nginx
server {
    listen 443 ssl http2;
    server_name screen.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Port `3000` should not be exposed directly to the public internet.

## 6. Baota / aaPanel

The project can run through the Node project manager:

1. Create a Node project pointing to `/www/wwwroot/together-screen`.
2. Use Node.js 22.
3. Production start command: `npm start`.
4. Project port: the value of `PORT`, commonly `3000`.
5. Bind the service to `127.0.0.1`.
6. Create a website and reverse proxy to `127.0.0.1:3000`.
7. Enable the website SSL certificate.
8. Ensure the reverse proxy forwards WebSocket Upgrade headers.
9. Set `APP_ORIGIN=https://your-domain.example`, `COOKIE_SECURE=true` and `TRUST_PROXY=true`.
10. Keep `DATA_DIR` outside release directories so updates do not overwrite data.

For updates that only contain `dist`, replace `dist` and restart the Node project. If dependencies changed, run `npm ci --omit=dev` before restarting.

## 7. coturn

Install coturn through the OS package manager or your control panel.

Example `/etc/turnserver.conf`:

```ini
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=REPLACE_WITH_THE_SAME_SECRET_AS_TURN_SECRET
realm=turn.example.com
min-port=49160
max-port=49200
stale-nonce=600
external-ip=203.0.113.10/10.0.0.10
no-cli
no-loopback-peers
no-multicast-peers
```

Replace `external-ip` with:

```text
PUBLIC_IP/PRIVATE_IP
```

Open the required firewall ports:

- `3478/tcp`
- `3478/udp`
- `5349/tcp` when using TURN over TLS
- `5349/udp` when required
- the configured relay range, for example `49160:49200/udp`

Restart coturn and confirm it listens:

```bash
sudo systemctl restart coturn
sudo systemctl status coturn
sudo ss -lunpt | grep 3478
```

Test STUN reachability:

```bash
turnutils_stunclient turn.example.com
```

The application and coturn must use the same `TURN_SECRET`/`static-auth-secret`. Do not expose the shared secret in browser code or public logs.

## 8. Docker deployment

```bash
export APP_ORIGIN=https://screen.example.com
export COOKIE_SECURE=true
export TURN_URLS="turn:turn.example.com:3478?transport=udp"
export TURN_SECRET="your-generated-secret"
export WTN_APP_ID="your-app-id"
export WTN_APP_KEY="your-app-key"
docker compose up -d --build
```

The Compose volume stores SQLite data outside the container.

## 9. Backup

Stop writes before a filesystem copy:

```bash
sudo systemctl stop together-screen
sudo tar -czf together-screen-data-$(date +%F).tar.gz -C /var/lib/together-screen .
sudo systemctl start together-screen
```

Alternatively use a SQLite-aware backup procedure that includes WAL state.

## 10. Deployment checklist

- [ ] Node.js 22 installed
- [ ] `APP_ORIGIN` exactly matches the HTTPS origin
- [ ] `COOKIE_SECURE=true`
- [ ] `TRUST_PROXY=true` behind a reverse proxy
- [ ] HTTPS certificate valid
- [ ] WebSocket Upgrade forwarding tested
- [ ] `DATA_DIR` is persistent and backed up
- [ ] First admin created manually
- [ ] `.env` mode is `600`
- [ ] TURN secret is random and not in Git
- [ ] `3478/tcp` and `3478/udp` reachable
- [ ] relay port range reachable
- [ ] internal application port is not public
- [ ] `/api/health` returns `{"ok":true}`
