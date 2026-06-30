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
}: {
  modules: ModuleManifest[];
  /** Called whenever the "any overlay active" state flips. */
  onActiveChange?: (anyActive: boolean) => void;
}) {
  const [idleMs, setIdleMs] = useState(0);
  const lastActivity = useRef(Date.now());
  const activeNames = useRef(new Set<string>());
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
        return <Overlay key={m.name} moduleName={m.name} idleMs={idleMs} setActive={setterFor(m.name)} />;
      })}
    </>
  );
}
