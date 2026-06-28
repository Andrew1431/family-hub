# Emoji → SVG migration plan

**Status:** interim fix applied (color-emoji font on the Pi); SVG migration not yet executed.

## Why

On Raspberry Pi OS the kiosk had no color-emoji font, so every pictographic emoji
rendered as a tofu box. We took the quick win first and deferred the proper fix.

- **Interim fix (done):** `sudo apt-get install -y fonts-noto-color-emoji && fc-cache -f`
  on the Pi, then reload the kiosk. This makes emoji *render*, but glossy multicolor
  Noto emoji clash with the warm copper-on-dark-brown "hearth" aesthetic
  (`SAMPLE_UI.jsx` design north star). It's also a **per-device** dependency — not in
  the repo, so every new install must remember it.
- **Real fix (this plan):** replace pictographs with **self-hosted SVG icons** tinted via
  `currentColor` → copper, line-weight consistent. Offline, committed, deterministic
  across devices, on-brand. Then the font install becomes unnecessary.

Plain symbol glyphs (`✕ ✓ ✦ ↑ → ← ⚠ ·`) are **out of scope** — they live in basic
Unicode ranges, render from the normal text font, and look fine. Leave them.

## Target architecture: `<Icon name="..." />`

Add one shared, dependency-free icon component (likely in `@hub/components`, since it's
consumed across modules and the UI shell). It holds a small map of `name → SVG path`
geometry. Lift path data from **Lucide / Feather** (MIT) — copy the paths, **do not** add
`lucide-react` as a runtime dep (keeps the "lean deps" rule).

```tsx
// packages/components/src/Icon.tsx (sketch)
export type IconName =
  | "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-moon"
  | "cloud-rain" | "cloud-drizzle" | "cloud-snow" | "snowflake"
  | "cloud-fog" | "cloud-lightning"
  | "calendar" | "folder" | "home" | "wave" | "baby" | "pregnant"
  | /* fruit/size set, see below */ string;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  // <svg viewBox stroke="currentColor" fill="none" …>{PATHS[name]}</svg>
}
```

Render with palette via `className` (e.g. `text-[var(--copper)] w-8 h-8`). Build the
`@hub/components` dist after adding it (consumers load `dist`).

## Work items

### 1. Weather (also fixes a server-side coupling)

`modules/weather/backend.ts` currently maps WMO codes → **emoji character strings**
(`WMO[code].emoji`, plus the night-override table) and ships the literal emoji to the
frontend. That puts presentation in the backend and hardcodes the glyph.

**Refactor the seam:** backend emits a **semantic icon key**, frontend maps key → `<Icon>`.

- In `backend.ts`, replace each `emoji:` with `icon:` holding a stable key
  (`"clear-day"`, `"clear-night"`, `"partly-cloudy"`, `"overcast"`, `"fog"`,
  `"drizzle"`, `"rain"`, `"heavy-rain"`, `"snow"`, `"snow-showers"`, `"thunderstorm"`).
  Keep the night-override table but emit `*-night` keys (e.g. clear → `clear-night` =
  moon, partly-cloudy-night = `cloud-moon`).
- Update the weather response type / frontend (`modules/weather/frontend.tsx`) to render
  `<Icon name={w.icon} />` instead of printing the emoji.
- Icon set needed: sun, moon, cloud-sun, cloud-moon, cloud, cloud-fog, cloud-drizzle,
  cloud-rain (+ heavy), cloud-snow / snowflake, cloud-lightning, thermometer (unknown).

Distinct emoji in use today: `☀️ 🌤️ ⛅ ☁️ 🌫️ 🌦️ 🌧️ 🌨️ ❄️ ⛈️ 🌙 🌡️`.

### 2. UI shell + Google modules (decorative pictographs)

- `modules/calendar-google/frontend.tsx:525` — `📅` → `<Icon name="calendar" />`
- `modules/photos-drive/frontend.tsx:374` — `📁` → `<Icon name="folder" />`
- `packages/ui/src/components/ChatModal.tsx:54` — greeting `🏡` → `home` (or drop it)
- `SAMPLE_UI.jsx` `👋` `🏡` — reference mock only, **not wired in**; ignore / optional.
- `packages/google/src/routes.ts:95` — `✅ / ⚠️` in the OAuth callback HTML page. Edge
  case: this is a standalone server-rendered page, not React, so `<Icon>` doesn't apply.
  Either inline a small SVG string or leave it (the font fix covers it; low traffic).

### 3. Pregnancy tracker (largest set)

`modules/pregnancy-tracker/frontend.tsx` — the `SIZES` table (weeks 4–40) maps each week
to a **fruit/vegetable emoji** (`🌱 🫘 🫐 🍒 🍓 🍋 🍑 🍎 🥑 🍐 🫑 🍅 🍌 🥕 🥭 🌽 🍆 🥥
🍍 🍈 🥬 🍉 🎃`), plus `🤰` (header, line 130) and `👶` (line 180).

Notes for migration:
- Many weeks already use a `·` placeholder (no emoji) — those are fine as-is and show the
  fruit *name* text instead. The SVG set only needs the ~23 weeks that have a real emoji.
- This is the biggest icon set and the most whimsical; consider whether line-art fruit
  fits the aesthetic, or whether to drop the emoji entirely and lean on the existing
  `fruit:` text label (simplest, most on-brand). **Decide before drawing 23 fruit SVGs.**
- `🤰` → `pregnant`, `👶` → `baby`.

## Suggested order

1. Build `<Icon>` in `@hub/components` with the weather set first (highest value, central).
2. Do the weather backend key refactor + frontend swap; verify live.
3. Swap the handful of decorative UI/Google pictographs.
4. Pregnancy tracker last — first decide fruit-SVG vs. text-only.
5. Once nothing renders emoji, the `fonts-noto-color-emoji` install on the Pi is no longer
   required (can leave it or remove it).

## Out of scope

- Symbol glyphs `✕ ✓ ✦ ↑ → ← ⚠ ·` — render fine, leave them.
- `SAMPLE_UI.jsx` — reference-only mock, not part of the app.
