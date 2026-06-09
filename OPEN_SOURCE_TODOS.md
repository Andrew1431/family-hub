# Open-Source Readiness TODOs

Tracking what's left before (and shortly after) making this repository public. Check items off as they land.

## ✅ Done
- [x] `LICENSE` (MIT) + `license` field in root `package.json`
- [x] `README.md` with a prominent "work in progress / no usage docs yet" banner, AI-assisted setup guidance, basic `.env` bootstrap, and module status (incl. `todo-google` marked real)
- [x] AI assistant documented as **optional** (stack + secrets sections)
- [x] Root `package.json` OSS metadata: `description`, `author`, `homepage`, `repository`, `bugs`, `keywords`, `version` → `0.1.0`
- [x] CI workflow (`.github/workflows/ci.yml`): install → seed + gen module registry → typecheck → build, on PRs and pushes to `main`
- [x] `ISSUES.md` drafted (translations; multi-provider AI) for opening as tracker issues
- [x] Security pass: no secrets in the working tree or git history, `.env` never committed, `.env.example` documents names only, `.gitignore` correct

## 👍 Nice-to-have — expected of a public repo
- [ ] `CONTRIBUTING.md` — point at the "Adding a module" recipe in `CLAUDE.md`; note the verify-against-live-endpoints + typecheck/build conventions.
- [ ] `SECURITY.md` — private vulnerability reporting (relevant: handles Google OAuth + Anthropic keys).
- [ ] `.github/ISSUE_TEMPLATE/` (bug + feature) and a PR template. Seed the tracker from `ISSUES.md`.
- [ ] README screenshot or short GIF (high impact for a visual project).
- [ ] Reconcile weather default location: template is `40.71,-74.01` (NYC) but `CLAUDE.md` says "Default Cambridge ON".
- [ ] Consider a `CODE_OF_CONDUCT.md` (e.g. Contributor Covenant).

## 🛠 Optional hardening / polish (later)
- [ ] Expand CI: lint/format check (if/when a formatter is adopted), and a matrix that also exercises the Bun runtime path.
- [ ] Dependabot or Renovate for dependency updates.
- [ ] Pi deployment docs (kiosk Chromium, screen-blank off, auto-restart, night-dim) — already on the project roadmap in `CLAUDE.md`.
- [ ] Per-module usage docs (the README explicitly defers these for now).