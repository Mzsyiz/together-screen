# 部署指南

[English](DEPLOYMENT.md) | 简体中文

本文介绍以下生产环境：

- Node.js 22；
- Fastify 监听 `127.0.0.1:3000`；
- Nginx 或宝塔面板提供 HTTPS 反向代理；
- SQLite 使用持久化目录；
- 可选 coturn 处理严格 NAT；
- 使用 systemd 守护进程。

## 1. 创建服务账号和目录

```bash
sudo useradd --system --home /opt/together-screen --shell /usr/sbin/nologin together
sudo mkdir -p /opt/together-screen /var/lib/together-screen
sudo chown -R together:together /opt/together-screen /var/lib/together-screen
```

把项目放到 `/opt/together-screen`。

## 2. 配置环境变量

```bash
cd /opt/together-screen
cp .env.example .env
chmod 600 .env
```

生产示例：

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
```

生成新的 TURN 密钥：

```bash
openssl rand -hex 32
```

禁止复用曾进入 Git 或截图的密钥。

## 3. 安装、构建并创建管理员

```bash
cd /opt/together-screen
npm ci
npm run build
npm run user:add:prod -- \
  --username admin \
  --display Admin \
  --password "使用一个足够长且唯一的密码" \
  --admin
```

检查服务：

```bash
PORT=3000 HOST=127.0.0.1 npm start
curl http://127.0.0.1:3000/api/health
```

预期结果：

```json
{"ok":true}
```

## 4. 使用 systemd 运行

创建 `/etc/systemd/system/together-screen.service`：

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

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now together-screen
sudo systemctl status together-screen
```

## 5. Nginx 反向代理

先把 DNS 指向服务器并申请 TLS 证书，再启用 `COOKIE_SECURE=true`。

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

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

不要把 `3000` 端口直接暴露到公网。

## 6. 宝塔 / aaPanel

可以通过 Node 项目管理器运行：

1. 创建 Node 项目，目录指向 `/www/wwwroot/together-screen`。
2. 使用 Node.js 22。
3. 生产启动命令使用 `npm start`。
4. 项目端口设置为 `PORT`，通常为 `3000`。
5. 服务只监听 `127.0.0.1`。
6. 创建网站并反向代理到 `127.0.0.1:3000`。
7. 开启网站 SSL。
8. 确认反向代理支持 WebSocket Upgrade。
9. 设置 `APP_ORIGIN=https://你的域名`、`COOKIE_SECURE=true` 和 `TRUST_PROXY=true`。
10. 将 `DATA_DIR` 放在发布目录之外，避免更新覆盖数据。

如果更新只包含 `dist`，覆盖后重启 Node 项目即可。依赖变化时先运行 `npm ci --omit=dev`。

## 7. coturn

通过系统包管理器或面板安装 coturn。

示例 `/etc/turnserver.conf`：

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

把 `external-ip` 替换为：

```text
公网IP/内网IP
```

开放必要端口：

- `3478/tcp`
- `3478/udp`
- 使用 TURN TLS 时开放 `5349/tcp`
- 需要时开放 `5349/udp`
- 配置的中继端口范围，例如 `49160:49200/udp`

重启并检查：

```bash
sudo systemctl restart coturn
sudo systemctl status coturn
sudo ss -lunpt | grep 3478
```

测试 STUN：

```bash
turnutils_stunclient turn.example.com
```

应用和 coturn 必须使用相同的 `TURN_SECRET` / `static-auth-secret`。不要在浏览器代码或公开日志中暴露共享密钥。

## 8. Docker 部署

```bash
export APP_ORIGIN=https://screen.example.com
export COOKIE_SECURE=true
export TURN_URLS="turn:turn.example.com:3478?transport=udp"
export TURN_SECRET="your-generated-secret"
docker compose up -d --build
```

Compose volume 会把 SQLite 数据保存在容器外。

## 9. 备份

复制前停止写入：

```bash
sudo systemctl stop together-screen
sudo tar -czf together-screen-data-$(date +%F).tar.gz -C /var/lib/together-screen .
sudo systemctl start together-screen
```

也可以使用包含 WAL 状态的一致 SQLite 备份方式。

## 10. 部署检查清单

- [ ] 已安装 Node.js 22
- [ ] `APP_ORIGIN` 与 HTTPS Origin 完全一致
- [ ] `COOKIE_SECURE=true`
- [ ] 反向代理后设置 `TRUST_PROXY=true`
- [ ] HTTPS 证书有效
- [ ] WebSocket Upgrade 已测试
- [ ] `DATA_DIR` 持久化并已备份
- [ ] 已手动创建第一个管理员
- [ ] `.env` 权限为 `600`
- [ ] TURN 密钥随机且未进入 Git
- [ ] `3478/tcp` 和 `3478/udp` 可访问
- [ ] 中继端口范围可访问
- [ ] 内部应用端口未公开
- [ ] `/api/health` 返回 `{"ok":true}`
