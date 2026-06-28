# Widgets over the screensaver — feasibility

**Goal:** keep selected widgets (clock, notes, …) visible *on top of* the photo
screensaver, with the slideshow running behind them — configurable per widget
(opacity, readability), no module-specific hacks.

**Verdict: feasible, and it fits the architecture cleanly.** It reuses three
things the app already has — the generic overlay/idle plumbing, the per-instance
layout config, and each module's existing `Panel`. No new module code, no new
deps, no backend. Roughly a one-evening change in the shell + SDK.

---

## How the relevant pieces work today

- **The screensaver is just a module overlay.** `OverlayHost`
  (`packages/ui/src/components/OverlayHost.tsx`) mounts every module's optional
  `Overlay` permanently, owns one shared `idleMs` clock, and lets each overlay
  decide for itself when to take over. Photos' `PhotosOverlay`
  (`modules/photos-drive/frontend.tsx`) renders `fixed inset-0 z-[100] bg-black`
  with the `<Slideshow>` once idle passes its threshold. The shell has **zero**
  knowledge that it's photos — it just feeds idle and tracks "is some overlay
  active" in `activeNames`.

- **Widgets are config-placed, not module-special.** `DashboardGrid` reads
  `layout.local.json` and renders each `WidgetInstance` by calling that module's
  `Panel` inside a grid cell. Placement is pure CSS-grid math
  (`gridColumn`/`gridRow` from `col/row/w/h`). Each instance already carries
  `settings: Record<string, unknown>` for "per-appearance presentation"
  (`packages/sdk/src/layout.ts`).

- **The `Panel` is self-contained.** `ClockPanel` and `NotesPanel` render fine
  anywhere — clock is `surface:"bare"` (just big text), notes draws its own
  opaque colored cards. Nothing about them assumes the dashboard background.

So everything we need is already in place: a signal for "a screensaver is up", a
config slot per widget, and a reusable `Panel`. We just need a thin top layer
that re-renders the flagged widgets above the overlay.

## The design (no hacks)

### 1. A per-widget config field, in the layout

Add one optional typed field to `WidgetInstance` in `packages/sdk/src/layout.ts`
(rebuild the SDK after — consumers load `dist`):

```ts
export interface OverlayPlacement {
  /** Float this widget above the screensaver while it's running. */
  enabled: boolean;
  /** 0–1 widget opacity over the slideshow (default 1). */
  opacity?: number;
  /** Legibility backdrop behind the widget over bright photos. */
  scrim?: "none" | "dim" | "blur"; // default "none"
}

export interface WidgetInstance extends GridPlacement {
  // …existing…
  /** If set, the shell also floats this instance over an active screensaver. */
  overlay?: OverlayPlacement;
}
```

It's a dedicated field rather than a bag inside `settings` because this is
**cross-cutting shell behavior**, not a module's internal presentation — it
deserves a real type and shows up in one obvious place. Example
`layout.local.json`:

```jsonc
{ "id": "clock-main", "module": "clock", "col": 1, "row": 1, "w": 4, "h": 2,
  "overlay": { "enabled": true, "scrim": "dim" } },
{ "id": "notes-main", "module": "notes", "col": 9, "row": 1, "w": 4, "h": 5,
  "overlay": { "enabled": true, "opacity": 0.95 } }
```

Because the field lives on the existing per-instance placement, the floating copy
**keeps its grid position** — the clock stays top-left, notes stay in the right
column. The slideshow simply shows through the gaps.

### 2. Lift the "a screensaver is active" signal

`OverlayHost` already tracks `activeNames` internally. Surface a boolean up to
`App` (an `onOverlayActiveChange(active: boolean)` callback, or hoist the set
into App state). This stays generic — "**any** overlay active", never "photos".

### 3. A top layer that re-renders the flagged widgets

When an overlay is active, `App` renders an `OverlayWidgets` layer above it
(`z-[110]`, above the screensaver's `z-[100]`), built from the active
dashboard's widgets filtered to `overlay?.enabled`. It reuses the **exact** grid
placement math from `DashboardGrid` (extract the `span()` + grid-template setup
into a tiny shared helper so there's one source of truth) and renders the same
`entry.Panel`. Per-widget: apply `opacity`, and for `scrim` wrap in
`bg-black/30 rounded-[…]` (dim) or `backdrop-blur-sm` (blur) for legibility over
bright photos. Notes need no scrim (opaque cards); a bare clock benefits from
`dim`.

### 4. Make the floating copies display-only

Render the layer `pointer-events-none`. This resolves the one real interaction
question for free:

- `OverlayHost` already swallows the **first** interaction in the capture phase
  to *wake* the screen (so a tap doesn't also fire the assistant key or land on
  the dashboard). With the float layer non-interactive, a touch passes straight
  through to that waker → screensaver hides → the real, interactive dashboard is
  revealed **with the same widget in the same spot**. Seamless, and you can't get
  into a confusing "half-typing a note over a slideshow" state.

So: floated widgets are for *glanceable* info (clock, notes, weather). To
*edit*, you touch once to wake, then interact normally. Worth stating plainly to
your wife: the notes stay readable over the photos; tap to wake when she wants to
change one.

## Why this is the right altitude

- **Generic, not personal.** It's a layout capability any widget can opt into via
  config — not "clock + notes hardcoded for one household." Fits the modular ethos
  and the CLAUDE.md note about not bolting on person-specific behavior.
- **Reuses the spine.** Same overlay/idle plumbing, same per-instance config, same
  `Panel`. Zero module-specific shell code; modules stay decoupled (`ctx` only).
- **Warm/hearth-consistent.** The scrim is a soft dim/blur, not a hard dark-mode
  card; opacity lets the photos breathe behind serif text.
- **Honors the layout contract.** `layout.local.json` stays the single source of
  truth for placement; this is just more of the same per-instance vocabulary.

## Touch points (estimate)

| File | Change |
|---|---|
| `packages/sdk/src/layout.ts` | add `OverlayPlacement` + `WidgetInstance.overlay`; rebuild SDK |
| `packages/ui/src/components/DashboardGrid.tsx` | extract grid placement helper (shared) |
| `packages/ui/src/components/OverlayHost.tsx` | expose "an overlay is active" upward |
| `packages/ui/src/components/OverlayWidgets.tsx` *(new)* | float flagged Panels above the overlay |
| `packages/ui/src/App.tsx` | wire the active signal + mount `OverlayWidgets` |
| `config/layout.local.json` | opt clock/notes in (your wall hub only — it's gitignored) |

No backend, no new dependencies, no `node:sqlite` changes.

## Caveats / decisions to confirm

- **Display-only floats** (recommended above) vs. fully interactive over the
  slideshow. Interactive would mean *not* swallowing the wake event for those
  hit-regions and is materially more complex (focus, the assistant spacebar, the
  idle reset fighting a typing user). Recommend shipping display-only first.
- **Settings UI vs. hand-edited config.** Simplest first cut is editing
  `layout.local.json` (matches how every other placement is set today). A toggle
  in `HubSettings`/per-card cog can come later if you want it adjustable from the
  wall.
- **Burn-in:** a permanently-pinned bright clock on an always-on panel is mild
  OLED burn-in risk; the dim scrim + the photos changing behind it mitigate it.
  Optional later touch: a slow few-pixel "drift" of the float layer.
- The `layout.template.json` comment mentions auto-returning Home "after
  inactivity" — that isn't actually implemented in the shell today, so it doesn't
  interact with this. (Flagging so the doc isn't mistaken for it.)
