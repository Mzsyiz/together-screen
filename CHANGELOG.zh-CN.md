# 更新日志

[English](CHANGELOG.md) | 简体中文

本文件记录项目的重要变化。

格式参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。项目达到稳定 `1.0` 后将遵循语义化版本。

## [未发布]

### 新增

- 管理员按房间选择自建 P2P/TURN 或火山引擎 WTN 媒体线路。
- 服务端签发短期 WTN JWT，浏览器通过 WHIP/WHEP 发布和订阅。
- 完整的 P2P 房间语音控制：设备、增益、电平、输出音量、说话状态和连接状态。
- 架构、部署、排障和开源贡献文档。
- GitHub CI、Issue 模板、Pull Request 模板和 Dependabot。

### 变更

- 空闲远端视频保持播放，并通过首帧覆盖，而不是暂停后黑屏。
- 设置弹层不再被底部控制栏裁切。
- Docker 配置支持 TURN 共享密钥、代理和会话设置。

### 修复

- P2P 连接协商完成前不再调用 `setParameters()`。
- 移除 Chromium WTN 不支持的 `sendEncodings.priority` 字段。
- WTN 使用兼容的 `Low` / `High` RID，并增加不带 RID 的订阅回退。
- WTN 回退为单一默认层后停止 RID 重试循环，避免观看端 React 状态溢出崩溃。
- 每次共享生成唯一 WTN 发布 StreamID，并阻止重复点击启动，修复 431 冲突。
- WTN 无 RID 回退改为静默兼容模式，不再打断观看。
- 完整错误信息固定显示在所有房间控件上方，并支持选择与复制。

### 安全

- Git 和 Docker 忽略运行诊断、私有部署笔记和发布压缩包。
- 从当前 Git 索引移除私有诊断和本地笔记，但保留本地文件。

## [0.1.0] - 2026-11-05

### 新增

- 固定 2～6 人房间。
- 多人 WebRTC 投屏、轻量预览和高清模式。
- 文字聊天和 SQLite 历史记录。
- 管理员创建账号和单活跃客户端会话。
- STUN、TURN 和 coturn 共享密钥支持。
- 桌面和窄屏布局。
