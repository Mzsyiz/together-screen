# 开发指南

[English](DEVELOPMENT.md) | 简体中文

## 技术栈

- React 19 和 Vite：Web 客户端；
- Fastify 和 WebSocket：API 与信令；
- Node.js `DatabaseSync`：SQLite；
- WebRTC、火山 RTC 和 WTN：屏幕共享和语音；
- Vitest：服务端测试；
- TypeScript strict：客户端、服务端和共享协议。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时运行 Fastify 和 Vite |
| `npm run dev:server` | 只运行 API/信令服务 |
| `npm run dev:web` | 只运行 Vite |
| `npm run typecheck` | 只做类型检查 |
| `npm test` | 运行 Vitest |
| `npm run build` | 构建前端和服务端 |
| `npm run check` | 类型检查、测试和构建 |
| `npm run user:add` | 开发环境添加用户 |
| `npm run user:list` | 开发环境列出用户 |

## 源码结构

```text
src/
├── server/
│   ├── app.ts             Fastify HTTP 和 WebSocket 路由
│   ├── auth.ts            密码哈希和 token
│   ├── config.ts          环境变量和 ICE 服务器
│   ├── db.ts              SQLite 表结构和查询
│   ├── room-hub.ts        内存房间和信令转发
│   ├── rtc.ts             火山 RTC Token 生成
│   ├── wtn.ts             火山 WTN JWT 和资源 URL
│   └── cli/               管理 CLI
├── shared/
│   └── types.ts           共享 REST/WebSocket/媒体类型
└── web/
    ├── App.tsx            页面和房间 UI
    ├── useRoomSession.ts  WebRTC、信令和语音生命周期
    ├── volc-rtc-client.ts 火山 RTC 双流客户端
    ├── wtn-client.ts      WTN WHIP/WHEP 客户端
    ├── api.ts             浏览器 API 客户端和 client ID
    └── styles.css         响应式样式
```

## 协议变更

修改信令时：

1. 在 `src/shared/types.ts` 中更新可辨识联合类型。
2. 服务端必须验证房间成员关系。
3. 只有明确支持时才保留向后兼容。
4. 为服务端转发或状态变化添加测试。
5. 使用两个独立浏览器环境测试客户端。

发送端控制媒体参数时，应使用确认链路，而不是只更新本地 UI。

新增房间媒体模式时，至少同步修改：

- `src/shared/types.ts` 中的 `MediaMode`；
- SQLite `room_media_settings` 约束和迁移；
- `/api/config`、管理员房间接口和媒体模式更新接口；
- `useRoomSession.ts` 和对应媒体客户端；
- 管理员界面、房间卡片和房间顶部线路标签；
- 中英文文档、迁移测试和两个真实浏览器测试。

## WebRTC 调试

常用工具：

- `chrome://webrtc-internals`；
- 浏览器 Console；
- `RTCPeerConnection.getStats()`；
- `sender.getParameters()` 和 `track.getSettings()`。

不要提交原始诊断 dump，其中可能包含真实 IP 和网络元数据。只提取相关指标并脱敏。

常用指标：

- 选中的 candidate 类型；
- RTT；
- 丢包；
- jitter；
- 分辨率和 FPS；
- 码率；
- 解码耗时；
- freeze 次数；
- quality limitation reason。

## UI 测试

布局改动至少测试：

- 1440 px 桌面宽度；
- 1024 px 窄桌面；
- 760 px 平板；
- 390 px 手机；
- 设置弹层；
- 长聊天消息；
- 多人同时投屏；
- 鼠标进入、离开、窗口失焦和标签页返回。

屏幕和语音改动必须使用两个独立浏览器环境和不同账号测试。

RTC 额外检查：

- `/api/rtc/token` 只返回短期 Token，不包含 AppKey；
- 新观看者先看到自动预览；
- 点击后切到主屏，取消聚焦后恢复预览；
- 切换清晰度不重建麦克风发布；
- 麦克风静音不关闭屏幕系统声音；
- 共享系统声音关闭时，预览和高清都不应出现系统音频；
- 共享系统声音开启时，预览仍无声，焦点高清才播放。

## 数据安全

测试必须使用临时数据库目录，不得修改开发或生产数据库。不要添加使用真实密码的种子用户。

## 文档

行为变化时同步更新：

- [README.zh-CN.md](../README.zh-CN.md)：用户概览和安装；
- [MEDIA_TRANSPORTS.zh-CN.md](MEDIA_TRANSPORTS.zh-CN.md)：线路选择、成本和音频规则；
- [ARCHITECTURE.zh-CN.md](ARCHITECTURE.zh-CN.md)：拓扑和协议；
- [DEPLOYMENT.zh-CN.md](DEPLOYMENT.zh-CN.md)：生产运维；
- [TROUBLESHOOTING.zh-CN.md](TROUBLESHOOTING.zh-CN.md)：常见故障；
- [CHANGELOG.zh-CN.md](../CHANGELOG.zh-CN.md)：重要变化。
