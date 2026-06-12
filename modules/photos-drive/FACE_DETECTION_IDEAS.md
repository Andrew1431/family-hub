# Face-aware cropping — design notes / future work

Theoretical only. Nothing here is wired in. This captures where we left off so a
fresh chat can resume cold.

## Problem & current state

The screensaver/panel slideshow looked best with `object-cover` (fills the frame),
but `cover` crops portraits and decapitates people.

**Already shipped** (in `frontend.tsx`, `Slide` component): orientation-aware fit —
portraits render `object-contain` (whole photo, black bars from the existing
`bg-black` container), landscapes keep `object-cover`. Orientation is read from
`img.naturalHeight > naturalWidth` on load, defaulting to `cover` until known.
We deliberately rejected blurred-bar backgrounds: blur effects were tried before
and were not performant on the Pi. Black bars only.

This doc is the *next* step beyond that: actually centering the crop on faces so we
can go back to `cover` for portraits too (more immersive, no bars) without cutting
people off.

## The key insight (don't lose this)

The render side is one line. `object-cover` is just `object-position: center` under
the hood. To bias the crop toward the people you only need a single **focal point**
`{x, y}` in percent per photo:

```tsx
<img className="... object-cover" style={{ objectPosition: `${x}% ${y}%` }} />
```

You do NOT need bounding boxes, landmarks, or high accuracy — just "pull the crop
toward where the faces cluster." Very forgiving target. The whole feature reduces
to: *produce one `{x,y}` per photo, cache it, feed it to `object-position`.*

The expensive part is NOT the detection math — it's that any detector needs decoded
pixels, and decoding a full-res JPEG server-side on a Pi is the real cost.

## Project constraints that decide the approach

From `CLAUDE.md` (non-negotiable):
- **No native deps.** Rules out tfjs-node, opencv4nodejs, onnxruntime-node,
  sharp/smartcrop-sharp, smartcrop-gm. Anything with native bindings is out.
- **Runs under Bun on a Raspberry Pi.** Must be pure JS or WASM, offline, lean.
- Lean deps generally — add one only if it earns its weight.

There is currently **zero image tooling** in the dependency tree.

## Recommended architecture (detector-agnostic)

1. **Detect once per Drive file id, server-side, cache the result.** The photo proxy
   `GET /photo/:id` (`backend.ts:170`) is already the noted future disk-cache seam.
   Compute the focal point lazily on first sight, persist `{x,y}` keyed by file id
   in the KV config store, and include it in the `/photos` and
   `/photos/screensaver` list payloads. Inference then happens at most once per
   photo ever — never on a screensaver cycle.
2. **Detect on a Drive thumbnail, not the full image.** Drive file metadata exposes
   `thumbnailLink` (accepts a size param, e.g. `=s256`). Pull a ~256px thumbnail,
   run detection on that tiny image, map results to percentages. Percentages apply
   unchanged to the full-res image. Keeps both decode and inference cheap.
3. Frontend: add `focal?: {x,y}` to the `PhotoRef` shape, apply as `objectPosition`
   in `Slide`. When focal is known, portraits can use `cover` again instead of
   `contain`.

## Library options (ranked for our constraints)

| Lib | What | Verdict |
|---|---|---|
| **pico.js** | ~200 KB pure-JS Haar-style face detector, no deps, takes a grayscale pixel array | **Best lean fit.** Offline, no native, Bun-safe. Good frontal faces; weak on profiles/heavy tilt. |
| **smartcrop.js** | Pure-JS content-aware crop (saliency + skin-tone + edges), NOT face-specific | Good fallback if "crop toward interesting region" is acceptable. No model. |
| tfjs + BlazeFace / MediaPipe | Real ML via WASM | Most accurate but ~1–2 MB runtime+model, heaviest CPU. Against lean ethos. |
| Browser `FaceDetector` (Shape Detection API) | Native browser API | **Do not rely on it** — gated/unstable in Chromium, unreliable on Pi. |
| face-api.js / human / opencv4nodejs | Accurate | All pull native/tfjs-node. **Disqualified** by no-native rule. |

Shared cost for pico.js / smartcrop: a JPEG→pixels decode in Node. Use a WASM
decoder (`@jsquash/jpeg`) on the 256px thumbnail — lean, Bun-compatible. (pico.js
also needs grayscale; convert during/after decode.)

## Concrete implementation checklist (pico.js path)

- [ ] Add `@jsquash/jpeg` (WASM decode) + vendor/import pico.js + its face cascade.
- [ ] Backend helper `focalFor(fileId)`:
  - [ ] fetch `thumbnailLink` (or `?sz=`/`=s256`) for the file via Drive metadata,
        using `accessTokenFor` like the existing proxy.
  - [ ] decode → grayscale pixel array.
  - [ ] run pico → list of face boxes with confidences.
  - [ ] compute focal point: confidence-weighted centroid of face centers, then
        convert to percentages of image dims. **Clamp** (e.g. to 15–85%) so a face
        near an edge doesn't shove the crop to a weird extreme. No faces → `{50,50}`.
  - [ ] cache `{x,y}` in `ctx.config` under e.g. `focal:<fileId>` (or a dedicated
        store). Reuse the `listCache` pattern in `backend.ts:51`.
- [ ] Extend `PhotoRef` (in `google.ts` and the mirrored interface in
      `frontend.tsx:9`) with `focal?: { x: number; y: number }`.
- [ ] Populate `focal` in `photosFor` / the `/photos` + `/photos/screensaver`
      responses (lazily; don't block the list on detection — could compute in
      background and fill in on next poll, or compute on first `/photo/:id` hit).
- [ ] Frontend `Slide`: apply `style={{ objectPosition }}` from `focal`; once focal
      is available, allow portraits to use `cover` again.
- [ ] Tune & verify on real photos against live endpoints (per working agreements).

## Open questions / decisions for next time

- Eager vs lazy detection: compute on first `/photos` poll (simple, but first view
  may lack focal) vs precompute a folder on connect (heavier). Lazy + fill-on-next-
  poll is probably fine.
- Where to store focal cache — module config KV is easy; a dedicated table/disk
  cache aligns better with the planned `/photo/:id` disk-cache seam.
- Smoothing: clamp range and whether to also bias slightly upward (faces usually
  sit in the upper half of portraits).
- pico.js accuracy on profiles/tilt may disappoint; smartcrop.js is the no-ML
  fallback if so.

## Key file references

- `modules/photos-drive/frontend.tsx` — `Slide` (current orientation logic),
  `Slideshow`, `PhotosOverlay` (screensaver), `PhotoRef` mirror at top.
- `modules/photos-drive/backend.ts` — `/photo/:id` proxy (`:170`, cache seam),
  `photosFor` + `listCache` (`:51`), `/photos` (`:142`), `/photos/screensaver`
  (`:156`).
- `modules/photos-drive/google.ts` — Drive REST helpers (`listImages`,
  `downloadImage`, `PhotoRef` type); add thumbnail fetch here.
