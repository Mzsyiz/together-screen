# 为 Together Screen 贡献代码

[English](CONTRIBUTING.md) | 简体中文

感谢你帮助改进 Together Screen。

## 开始之前

- 先搜索现有 Issue 和 Pull Request。
- 对重要行为或架构调整，请先创建 Issue 讨论方案。
- 安全问题请按 [SECURITY.zh-CN.md](SECURITY.zh-CN.md) 私下报告。
- 请遵守 [CODE_OF_CONDUCT.zh-CN.md](CODE_OF_CONDUCT.zh-CN.md)。

## 开发环境

要求：

- Node.js 22.13 或更高版本；
- npm；
- 桌面版 Chrome 或 Edge；
- 需要跨网络测试时，可准备 coturn。

```bash
cp .env.example .env
npm install
npm run user:add -- \
  --username admin \
  --display Admin \
  --password "至少8位密码" \
  --admin
npm run dev
```

打开 `http://localhost:5173`。

## 提交前检查

创建 Pull Request 前请运行：

```bash
npm run check
```

该命令会执行：

- TypeScript 类型检查；
- Vitest 自动测试；
- 生产构建。

涉及界面或 WebRTC 的改动，还应使用两个独立浏览器环境测试：

- 屏幕共享开始和停止；
- 首帧、轻量预览和高清确认；
- 鼠标离开以及浏览器焦点变化；
- 多人同时投屏；
- 语音加入、静音、设备状态和重连；
- 桌面和窄屏布局。

## 代码规范

- 保持 TypeScript strict，避免无必要的 `any`。
- 前后端共享协议类型放在 `src/shared/types.ts`。
- 服务端密钥和文件路径不得进入浏览器代码。
- 保持房间容量和 WebSocket 消息约束不被破坏。
- 媒体资源必须有明确的清理逻辑。
- 不再使用时停止麦克风和屏幕轨道。
- 不要通过 `video.pause()` 优化空闲的远端 WebRTC 视频。
- 服务端行为或协议调整需要增加测试。
- 注释应说明原因，而不是简单复述代码。

## 提交信息

推荐使用 Conventional Commit 前缀：

```text
feat: add room voice volume controls
fix: keep remote video playing when idle
docs: clarify TURN deployment
test: cover quality confirmation
refactor: simplify voice peer cleanup
```

## Pull Request

请包含：

- 修改内容；
- 修改原因；
- 对用户的影响；
- 测试证据；
- UI 改动的截图或录屏；
- 迁移和部署注意事项。

一个 Pull Request 只处理一个主题，不要把无关改动混在一起。

## 隐私

禁止提交：

- `.env` 文件；
- TURN 共享密钥或静态凭证；
- WTN `AppKey` 或可重复使用的 WTN JWT；
- SQLite 数据库；
- Cookie 和会话令牌；
- WebRTC 诊断 dump；
- 真实部署中的公网或内网 IP；
- 账号密码和个人信息。

如果误提交了隐私数据，应立即轮换对应凭证。仅通过新提交删除文件不会从 Git 历史中移除数据。

## 许可证

提交贡献即表示你同意该贡献按本仓库的 [MIT License](LICENSE) 授权。
