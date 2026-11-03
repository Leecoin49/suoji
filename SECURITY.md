# Security Policy

## Supported versions

Only the latest release receives fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a vulnerability

Please do not open a public issue for anything that could hurt someone before a
fix exists. Use GitHub's private channel instead:

**[Report a vulnerability](https://github.com/Leecoin49/suoji/security/advisories/new)**

If that is unavailable, mail <slkofficial@yeah.net> with `suoji security` in the
subject. A rough reproduction and the affected version are enough to start.

You can expect an acknowledgement within a few days. This is a small hobby
project without a paid on-call rotation, so please keep that in mind.

## Scope

Suoji is a local-only desktop app. It has no server, no account and no
analytics, and it never sends task data anywhere. Things worth reporting
include, but are not limited to:

- Code execution or a sandbox escape through the Tauri IPC surface
- Unexpected writes outside `%APPDATA%\com.tool.suoji`
- Leaks of task content into logs, notifications or crash reports
- Supply-chain problems in the dependencies we ship

Issues in the operating system, WebView2, or in a copy of Suoji that you did not
get from this repository or its releases are out of scope.
