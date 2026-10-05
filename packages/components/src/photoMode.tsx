import { createContext, useContext, useEffect, useState, type RefObject } from "react";

/**
 * Average luminance (0 = black … 1 = white) of whatever full-screen backdrop is
 * showing under a viewport rect, or null if unknown. Provided by an overlay
 * (e.g. the photo screensaver) so floating widgets can pick legible ink.
 */
export type BackdropSampler = (rect: DOMRect) => number | null;

/**
 * Where a floating widget sits over the screensaver. "in-place" keeps its
 * dashboard cell; the rest pin it to a screen edge/corner ("bottom" is a
 * full-width strip). Modules read it to lay out sensibly (e.g. stack upward
 * when pinned to the bottom).
 */
export type PhotoAnchor =
  | "in-place"
  | "top-left"
  | "top"
  | "top-right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface PhotoModeValue {
  /** True while this card is floating over a full-screen overlay. */
  active: boolean;
  /** Changes identity whenever the backdrop changes (new photo) → re-sample. */
  sample: BackdropSampler | null;
  /** Where the shell placed this widget (meaningful only while active). */
  anchor: PhotoAnchor;
}

export const PhotoModeCtx = createContext<PhotoModeValue>({ active: false, sample: null, anchor: "in-place" });

/** Whether the current card is floating over the screensaver ("photo mode"). */
export function usePhotoMode(): PhotoModeValue {
  return useContext(PhotoModeCtx);
}

/**
 * In photo mode, which ink reads best over the backdrop behind `ref`:
 * "light" text for dark photos, "dark" text for bright ones. Defaults to
 * "light" (photos skew dark, and the overlay's ground is black).
 */
export function useBackdropInk(ref: RefObject<HTMLElement | null>): "light" | "dark" {
  const { active, sample } = usePhotoMode();
  const [ink, setInk] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (!active || !sample || !ref.current) {
      setInk("light");
      return;
    }
    const L = sample(ref.current.getBoundingClientRect());
    // Mid-grey in sRGB terms sits around 0.4–0.5; bias toward light text.
    setInk(L !== null && L > 0.55 ? "dark" : "light");
  }, [active, sample, ref]);
  return ink;
}
