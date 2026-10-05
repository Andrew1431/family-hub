import { useEffect, useRef, useState } from "react";
import type { ModuleManifest } from "@hub/sdk";
import { moduleFrontends } from "../modules.generated";

/**
 * Mounts every module's optional full-screen `Overlay` and owns the one piece
 * of shared state they all need: how long the screen has been idle. Each module
 * decides for itself whether/when to take over (a screensaver, say) — the shell
 * has zero module-specific knowledge here.
 *
 * Idle is sampled on a 1s tick and reset to 0 on any interaction. While an
 * overlay reports itself active, the first interaction ONLY wakes the screen:
 * we swallow it in the capture phase so it can't also fire a global shortcut
 * (e.g. the assistant key) or land as a click on the dashboard underneath.
 */
export function OverlayHost({
  modules,
  onActiveChange,
  onBackdropChange,
}: {
  modules: ModuleManifest[];
  /** Called whenever the "any overlay active" state flips. */
  onActiveChange?: (anyActive: boolean) => void;
  /** Latest backdrop sampler from an active overlay (for floating widgets). */
  onBackdropChange?: (sample: ((rect: DOMRect) => number | null) | null) => void;
}) {
  const onBackdropRef = useRef(onBackdropChange);
  onBackdropRef.current = onBackdropChange;
  const setBackdrop = useRef((s: ((rect: DOMRect) => number | null) | null) => onBackdropRef.current?.(s)).current;
  const [idleMs, setIdleMs] = useState(0);
  const lastActivity = useRef(Date.now());
  const activeNames = useRef(new Set<string>());
  const keyHandlers = useRef(new Map<string, (e: KeyboardEvent) => boolean>());
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  // Stable per-module setters so an overlay's effect deps don't churn each tick.
  const setters = useRef(new Map<string, (active: boolean) => void>());
  function setterFor(name: string): (active: boolean) => void {
    let s = setters.current.get(name);
    if (!s) {
      s = (active: boolean) => {
        const was = activeNames.current.size > 0;
        if (active) activeNames.current.add(name);
        else activeNames.current.delete(name);
        const now = activeNames.current.size > 0;
        if (now !== was) onActiveChangeRef.current?.(now);
      };
      setters.current.set(name, s);
    }
    return s;
  }

  const keySetters = useRef(new Map<string, (h: ((e: KeyboardEvent) => boolean) | null) => void>());
  function keySetterFor(name: string): (h: ((e: KeyboardEvent) => boolean) | null) => void {
    let s = keySetters.current.get(name);
    if (!s) {
      s = (h) => {
        if (h) keyHandlers.current.set(name, h);
        else keyHandlers.current.delete(name);
      };
      keySetters.current.set(name, s);
    }
    return s;
  }

  // Coarse idle clock. Cheap: while idle, every overlay renders `null`.
  useEffect(() => {
    const id = window.setInterval(() => setIdleMs(Date.now() - lastActivity.current), 1000);
    return () => clearInterval(id);
  }, []);

  // Reset idle on interaction. When an overlay is up, the waking event is
  // swallowed here (capture phase, before any window/bubble shortcut listener).
  useEffect(() => {
    const onActivity = (e: Event) => {
      const waking = activeNames.current.size > 0;
      // An active overlay may claim a key (e.g. ←/→ in a slideshow): it's
      // handled there and does NOT count as activity, so the overlay stays up.
      if (waking && e.type === "keydown") {
        for (const [name, handle] of keyHandlers.current) {
          if (activeNames.current.has(name) && handle(e as KeyboardEvent)) {
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
          }
        }
      }
      lastActivity.current = Date.now();
      setIdleMs(0);
      if (waking) {
        e.stopImmediatePropagation();
        if (e.type === "keydown") (e as KeyboardEvent).preventDefault();
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { capture: true });
    }
    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity, { capture: true });
    };
  }, []);

  return (
    <>
      {modules.map((m) => {
        const Overlay = moduleFrontends[m.name]?.Overlay;
        if (!Overlay) return null;
        return (
          <Overlay
            key={m.name}
            moduleName={m.name}
            idleMs={idleMs}
            setActive={setterFor(m.name)}
            setKeyHandler={keySetterFor(m.name)}
            setBackdrop={setBackdrop}
          />
        );
      })}
    </>
  );
}
