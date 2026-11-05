# 开发指南

[English](DEVELOPMENT.md) | 简体中文

## 技术栈

- React 19 和 Vite：Web 客户端；
- Fastify 和 WebSocket：API 与信令；
- Node.js `DatabaseSync`：SQLite；
- WebRTC：屏幕共享和语音；
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
│   └── cli/               管理 CLI
├── shared/
│   └── types.ts           共享 REST/WebSocket/媒体类型
└── web/
    ├── App.tsx            页面和房间 UI
    ├── useRoomSession.ts  WebRTC、信令和语音生命周期
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

## 数据安全

测试必须使用临时数据库目录，不得修改开发或生产数据库。不要添加使用真实密码的种子用户。

## 文档

行为变化时同步更新：

- [README.zh-CN.md](../README.zh-CN.md)：用户概览和安装；
- [ARCHITECTURE.zh-CN.md](ARCHITECTURE.zh-CN.md)：拓扑和协议；
- [DEPLOYMENT.zh-CN.md](DEPLOYMENT.zh-CN.md)：生产运维；
- [TROUBLESHOOTING.zh-CN.md](TROUBLESHOOTING.zh-CN.md)：常见故障；
- [CHANGELOG.zh-CN.md](../CHANGELOG.zh-CN.md)：重要变化。
