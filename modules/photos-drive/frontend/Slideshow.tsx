import { useEffect, useRef, useState } from "react";
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

export function Slideshow({ photos, intervalSec }: { photos: PhotoRef[]; intervalSec: number }) {
  // A monotonic step counter — NOT an index. Keying each layer by `tick` means
  // every advance is a fresh mount that re-runs the fade, even in a 2-photo loop
  // where keying by photo id would just reorder two already-shown layers.
  const [tick, setTick] = useState(0);
  const len = photos.length;

  useEffect(() => {
    if (len < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), Math.max(2, intervalSec) * 1000);
    return () => clearInterval(t);
  }, [len, intervalSec]);

  // Preload the next image so the crossfade is instant.
  useEffect(() => {
    const next = photos[(tick + 1) % len];
    if (next) {
      const img = new Image();
      img.src = photoUrl(next.id);
    }
  }, [tick, photos, len]);

  if (len === 0) return null;
  const cur = photos[tick % len]!;
  const prevTick = tick - 1;
  const prev = prevTick >= 0 ? photos[prevTick % len] : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {prev && <Slide key={prevTick} id={prev.id} />}
      <Slide key={tick} id={cur.id} />
    </div>
  );
}
