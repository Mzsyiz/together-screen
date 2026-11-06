# Security Policy

English | [简体中文](SECURITY.zh-CN.md)

## Supported versions

The project is currently in the `0.x` MVP stage. Security fixes are applied to the latest development version.

| Version | Supported |
| --- | --- |
| Latest `0.x` | Yes |
| Older snapshots | No |

## Reporting a vulnerability

Please use the repository's **GitHub Security Advisory** private reporting feature. Do not open a public Issue for:

- authentication or session bypass;
- exposed credentials;
- cross-room data access;
- arbitrary file access;
- denial-of-service conditions;
- XSS, CSRF or WebSocket origin bypass;
- TURN credential leakage.

Include:

- affected version or commit;
- deployment context;
- reproduction steps;
- impact;
- any suggested mitigation.

Do not include real passwords, cookies, TURN secrets or other users' personal data.

## If a secret is exposed

1. Revoke or rotate the secret immediately.
2. Restart the application and dependent services.
3. Remove the secret from active files.
4. Clean Git history if the repository was pushed.
5. Review logs for misuse.
6. Add prevention or detection if appropriate.

Rotating the secret is mandatory. Deleting the file from the latest commit alone is not sufficient.

## Security model

Together Screen assumes:

- an administrator creates trusted accounts;
- users connect over HTTPS/WSS;
- the application server and SQLite data directory are trusted;
- the TURN shared secret is available only to the application server and coturn;
- the WTN/RTC AppKeys are available only to the application server;
- P2P media connects directly where possible and falls back to TURN; RTC/WTN media is forwarded by the selected cloud service.

The project does not add end-to-end encryption beyond media transport encryption. TURN, RTC and WTN services can observe necessary network metadata and traffic characteristics; operators must evaluate the applicable data-processing and compliance requirements.

## Deployment responsibilities

Operators must:

- use strong unique passwords;
- keep Node.js and dependencies updated;
- protect `.env` with restrictive permissions;
- keep `WTN_APP_KEY` and `RTC_APP_KEY` server-side and return only expiring tokens;
- avoid exposing the internal Node port;
- use a valid TLS certificate;
- restrict firewall access to required TURN ports;
- back up SQLite safely;
- monitor login failures and unusual resource usage.
- remind sharers that captured system audio may contain copyrighted or private content and should be enabled only for trusted rooms.
