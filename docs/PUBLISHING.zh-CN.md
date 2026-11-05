# 发布到 GitHub

[English](PUBLISHING.md) | 简体中文

当前仓库的早期本地提交可能包含私有部署笔记和 WebRTC 诊断，因此发布前必须执行本清单。

## 关键步骤：轮换已经暴露的凭证

如果 TURN 共享密钥、密码、会话 token 或 API key 曾经进入 commit 或上传：

1. 发布前先轮换凭证。
2. 更新 coturn 和应用环境变量。
3. 重启两个服务。
4. 确认旧凭证已经失效。

仅从最新 commit 删除文件，并不能从 Git 历史中移除数据。

## 禁止公开的文件

- `.env` 和所有本地环境副本；
- `data/` 和 SQLite 文件；
- `test/` 下的诊断 capture；
- 原始 WebRTC internals dump；
- 包含 IP 的本地部署笔记；
- 构建压缩包；
- Cookie、access token 和密码。

仓库的 `.gitignore` 和 `.dockerignore` 已覆盖这些路径。

## 推荐方式：发布干净历史

如果当前 Git 历史包含私有文件，建议创建新仓库，不要直接推送旧历史。

在项目目录中创建干净导出：

```bash
mkdir ../together-screen-public
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='data/' \
  --exclude='test/' \
  --include='.env.example' \
  --exclude='.env*' \
  --exclude='备注.md' \
  --exclude='together-screen-server.tar.gz' \
  ./ ../together-screen-public/
```

检查导出内容：

```bash
cd ../together-screen-public
find . -maxdepth 3 -type f | sort
rg -n -S "(BEGIN PRIVATE KEY|static-auth-secret=|TURN_SECRET=.+|WTN_APP_KEY=.+|password=.+|api[_-]?key)" .
```

初始化新仓库：

```bash
git init -b main
git add .
git commit -m "feat: publish Together Screen MVP"
git remote add origin git@github.com:YOUR_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

## 另一种方式：清理现有历史

只有完整备份后才能使用 `git filter-repo`：

```bash
git filter-repo \
  --path '备注.md' \
  --path 'test' \
  --path 'together-screen-server.tar.gz' \
  --path '.env copy.example' \
  --invert-paths
```

重写历史后强制推送可能影响协作者，操作前必须协调。

## GitHub 仓库设置

建议描述：

```text
Self-hosted WebRTC screen-sharing rooms with P2P voice and text chat for 2–6 friends.
```

建议 Topics：

```text
webrtc
screen-sharing
voice-chat
self-hosted
react
typescript
fastify
sqlite
video-conferencing
```

建议开启：

- Issues；
- Pull Requests；
- 私密漏洞报告；
- `main` 分支保护；
- 必选 CI 检查 `Typecheck, test and build`。

## 首次公开发布前

- [ ] 如果 TURN 密钥曾进入任何历史版本，已经轮换
- [ ] 已检查 `git status --ignored`
- [ ] `.env`、数据库、dump 和部署笔记没有被跟踪
- [ ] `rg` 密钥扫描干净
- [ ] `npm run check` 通过
- [ ] README 链接有效
- [ ] LICENSE 和 SECURITY 文件存在
- [ ] GitHub Actions 通过
- [ ] 示例中没有生产域名和公网 IP

## 检查已跟踪文件

```bash
git ls-files | sort
git status --short
git status --ignored --short
```

如果 `git ls-files` 仍包含私有文件，不要发布。
