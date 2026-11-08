<p align="center"><img src="docs/brand/dmlockguard-logo.png" alt="DM LockGuard" width="560"></p>

# DM LockGuard

Secure, honest access control for the **Eufy Smart Lock C30 (T85D0)**. Decide who can open which door, when, and from which phone, with every attempt on the record.

- **Seven ready-made roles**, from Super Administrator to Temporary Guest
- **One registered phone per person** (device binding), two-step sign-in and step-up identity checks
- **Honest lock status**: a door shows *Locked* only after the lock itself confirms it
- **Email invitations** with an interactive, quiz-gated training tour guided by Pip the paperclip
- **Security center**: alerts, incidents and a tamper-evident audit log

## Documentation

| | |
|---|---|
| 📘 [User manual](docs/manual/index.html) | Setup, every role, how-tos, error codes, troubleshooting, glossary |
| 📣 [Launch campaign](docs/marketing/index.html) | Strategy, copy bank, timeline and mockups |
| 🎨 [Brand files](docs/brand/) | App icon and logo (SVG + PNG) |
| 🌉 [Eufy bridge](docs/EUFY_BRIDGE.md) | How LockGuard talks to Eufy |

The manual and campaign pages are also published with GitHub Pages at **https://sumproguy99.github.io/DMLockGate/**.

## Project layout

| Folder | What it is |
|---|---|
| `backend/` | Laravel (PHP 8) API: authentication, permissions, lock commands, audit |
| `frontend/` | React + TypeScript + Vite web and mobile app |
| `integrations/eufy/` | Node.js bridge to the Eufy cloud |
| `e2e/` | Isolated end-to-end checks against a fake lock |
| `scripts/` | Windows setup helpers (MySQL, audit protection) |

Quick start: see [Chapter 3 of the manual](docs/manual/index.html#setup).
