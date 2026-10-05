import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { photoUrl, type PhotoRef } from "./types";

/** One crossfading image layer; fades in once the bytes have loaded. */
function Slide({ id }: { id: string }) {
  const [shown, setShown] = useState(false);
  // Portrait photos get `contain` (black bars) so faces aren't cropped off;
  // landscape fills the frame with `cover`. Decided from natural dimensions on
  // load — default to `cover` until we know.
  const [portrait, setPortrait] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Defer the opacity flip two frames so the opacity-0 state actually paints
  // first — otherwise a preloaded (already-decoded) image skips the transition
  // and hard-cuts in. Double rAF guarantees a painted 0 frame to animate from.
  function reveal() {
    const img = ref.current;
    if (img && img.naturalHeight > img.naturalWidth) setPortrait(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }

  // A cached image can finish loading before React attaches onLoad; catch it.
  useEffect(() => {
    if (ref.current?.complete) reveal();
  }, []);

  // Backdrop + fade live on the wrapping div (not the <img>): a div's black
  // background reliably fills the `object-contain` letterbox and fully occludes
  // the slide beneath, where background on the replaced <img> element does not.
  return (
    <div
      className={`absolute inset-0 bg-black transition-opacity duration-700 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <img
        ref={ref}
        src={photoUrl(id)}
        alt=""
        onLoad={reveal}
        className={`h-full w-full ${portrait ? "object-contain" : "object-cover"}`}
      />
    </div>
  );
}

// One random seed per page load: the shuffle is stable for the session (so
// prev/next walk a fixed sequence and a 5-min list refetch doesn't reshuffle),
// but differs after a reload.
const SESSION_SEED = Math.floor(Math.random() * 0xffffffff);

/** FNV-1a over seed+id → a stable pseudo-random rank for each photo. */
function rank(id: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic shuffle: sort by hashed rank instead of Fisher–Yates. Adding or
 * removing a photo only slots it in/out — everything else keeps its relative
 * order, so the current position survives a refetch.
 */
export function shuffled(photos: PhotoRef[], seed = SESSION_SEED): PhotoRef[] {
  return photos
    .map((p) => ({ p, r: rank(p.id, seed) }))
    .sort((a, b) => a.r - b.r || (a.p.id < b.p.id ? -1 : 1))
    .map((x) => x.p);
}

// Where each slideshow (keyed by caller) left off, so the screensaver resumes
// from the same photo on its next activation instead of restarting the order.
const lastSeen = new Map<string, string>();

export interface SlideshowHandle {
  /** Step by ±1 (wraps). Restarts the auto-advance timer. */
  step: (dir: 1 | -1) => void;
}

interface Shown {
  key: number; // monotonic: every change is a fresh mount → re-runs the fade
  id: string;
}

export const Slideshow = forwardRef<
  SlideshowHandle,
  { photos: PhotoRef[]; intervalSec: number; resumeKey?: string }
>(function Slideshow({ photos, intervalSec, resumeKey }, ref) {
  const order = useMemo(() => shuffled(photos), [photos]);
  const len = order.length;

  // Track the current photo by ID, not index: if the list changes underneath
  // us we stay on the same photo (or fall back to the start).
  const [cur, setCur] = useState<Shown | null>(() => {
    const resume = resumeKey ? lastSeen.get(resumeKey) : undefined;
    const first = order.find((p) => p.id === resume) ?? order[0];
    return first ? { key: 0, id: first.id } : null;
  });
  const [under, setUnder] = useState<Shown | null>(null);
  const [timerEpoch, setTimerEpoch] = useState(0);

  const idx = cur ? order.findIndex((p) => p.id === cur.id) : -1;

  const go = useCallback(
    (dir: 1 | -1) => {
      if (len === 0) return;
      setCur((c) => {
        const i = c ? order.findIndex((p) => p.id === c.id) : -1;
        // A vanished current photo: "next" from -1 lands on 0, "prev" on the end.
        const ni = i < 0 ? (dir === 1 ? 0 : len - 1) : (i + dir + len) % len;
        const next = order[ni]!;
        if (c && c.id === next.id) return c;
        setUnder(c);
        return { key: (c?.key ?? 0) + 1, id: next.id };
      });
    },
    [order, len],
  );

  useImperativeHandle(
    ref,
    () => ({
      step: (dir) => {
        go(dir);
        setTimerEpoch((n) => n + 1); // manual nav gets a full interval
      },
    }),
    [go],
  );

  // Initial mount / list arrived after an empty start.
  useEffect(() => {
    if (!cur && len > 0) setCur({ key: 0, id: order[0]!.id });
  }, [cur, len, order]);

  useEffect(() => {
    if (resumeKey && cur) lastSeen.set(resumeKey, cur.id);
  }, [resumeKey, cur]);

  useEffect(() => {
    if (len < 2) return;
    const t = setInterval(() => go(1), Math.max(2, intervalSec) * 1000);
    return () => clearInterval(t);
  }, [len, intervalSec, go, timerEpoch]);

  // Preload both neighbours so a crossfade either way is instant.
  useEffect(() => {
    if (idx < 0 || len < 2) return;
    for (const d of [1, -1]) {
      const p = order[(idx + d + len) % len];
      if (p) new Image().src = photoUrl(p.id);
    }
  }, [idx, order, len]);

  if (!cur) return null;
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {under && <Slide key={under.key} id={under.id} />}
      <Slide key={cur.key} id={cur.id} />
    </div>
  );
});
