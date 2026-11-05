# Publishing to GitHub

English | [简体中文](PUBLISHING.zh-CN.md)

This checklist is written for the current repository because early local commits may contain private deployment notes and WebRTC diagnostics.

## Critical: rotate exposed credentials

If a TURN shared secret, password, session token or API key was ever committed or uploaded:

1. Rotate it before publishing.
2. Update coturn and the application environment.
3. Restart both services.
4. Verify the old credential no longer works.

Removing a file in the latest commit does not remove the value from Git history.

## Files that must not be published

- `.env` and all local environment copies;
- `data/` and SQLite files;
- `test/` diagnostic captures;
- raw WebRTC internals dumps;
- local deployment notes containing IP addresses;
- generated server archives;
- cookies, access tokens and passwords.

The repository `.gitignore` and `.dockerignore` cover these paths.

## Recommended approach: publish a clean history

If the existing Git history contains private files, create a clean repository rather than pushing the old history directly.

From the project directory, create a clean export while explicitly excluding private and generated paths:

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

Check the export:

```bash
cd ../together-screen-public
find . -maxdepth 3 -type f | sort
rg -n -S "(BEGIN PRIVATE KEY|static-auth-secret=|TURN_SECRET=.+|password=.+|api[_-]?key)" .
```

Then initialize a new repository:

```bash
git init -b main
git add .
git commit -m "feat: publish Together Screen MVP"
git remote add origin git@github.com:YOUR_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

## Alternative: clean existing history

Use `git filter-repo` only after making a complete backup:

```bash
git filter-repo \
  --path '备注.md' \
  --path 'test' \
  --path 'together-screen-server.tar.gz' \
  --path '.env copy.example' \
  --invert-paths
```

Force-pushing rewritten history can disrupt collaborators. Coordinate before doing it.

## Repository settings

Suggested GitHub description:

```text
Self-hosted WebRTC screen-sharing rooms with P2P voice and text chat for 2–6 friends.
```

Suggested topics:

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

Enable:

- Issues;
- Pull Requests;
- private vulnerability reporting;
- branch protection for `main`;
- required CI check `Typecheck, test and build`.

## Before the first public push

- [ ] TURN secret rotated if it appeared anywhere in history
- [ ] `git status --ignored` reviewed
- [ ] no `.env`, database, dump or deployment note is tracked
- [ ] `rg` secret scan is clean
- [ ] `npm run check` passes
- [ ] README links work
- [ ] LICENSE and SECURITY.md are present
- [ ] CI passes in GitHub Actions
- [ ] production domain and public IP are redacted from examples

## Verify tracked files

```bash
git ls-files | sort
git status --short
git status --ignored --short
```

Do not publish if any private file still appears in `git ls-files`.
