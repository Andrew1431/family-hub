import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ── HotkeyContext (shell-owned) ───────────────────────────────────────────────

interface HotkeyContextValue {
  focusedId: string | null;
  focus: (id: string | null) => void;
  register: (id: string, bindings: Record<string, () => void>) => () => void;
}

const HotkeyCtx = createContext<HotkeyContextValue | null>(null);

export function useHotkey(): HotkeyContextValue {
  const ctx = useContext(HotkeyCtx);
  if (!ctx) throw new Error("useHotkey must be used inside HotkeyProvider");
  return ctx;
}

// ── CardContext (per-card) ────────────────────────────────────────────────────

export interface CardContextValue {
  instanceId: string;
  hotkey: string | undefined;
  focused: boolean;
}

export const CardCtx = createContext<CardContextValue | null>(null);

export function useCard(): CardContextValue {
  const ctx = useContext(CardCtx);
  if (!ctx) throw new Error("useCard must be used inside Card");
  return ctx;
}

// ── HotkeyProvider ────────────────────────────────────────────────────────────

export interface HotkeyProviderProps {
  /** instanceId → single-char hotkey (already lowercased). */
  hotkeys: Record<string, string>;
  /** Pause all handling while e.g. a screensaver overlay is active. */
  enabled?: boolean;
  children: ReactNode;
}

const IDLE_MS = 10_000;

export function HotkeyProvider({ hotkeys, enabled = true, children }: HotkeyProviderProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  focusedRef.current = focusedId;

  const registryRef = useRef<Map<string, Record<string, () => void>>>(new Map());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reverse map: lowercased key → instanceId (built from `hotkeys` prop).
  const keyToIdRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const [id, key] of Object.entries(hotkeys)) {
      const k = key.toLowerCase();
      if (k === " ") continue; // Space is reserved for the assistant
      if (k in map) {
        console.warn(`[HotkeyProvider] hotkey collision on "${k}": keeping first, ignoring "${id}"`);
      } else {
        map[k] = id;
      }
    }
    keyToIdRef.current = map;
  }, [hotkeys]);

  // Hard-unfocus: clears state AND blurs the active DOM element. Used by Escape
  // and the idle timer so inputs don't stay focused after the card deactivates.
  // NOT used by Card.onBlur — at that point focus has already moved to a new
  // element, and blurring document.activeElement would steal it away.
  const clearFocus = useCallback(() => {
    setFocusedId(null);
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  const resetIdleTimer = useCallback((id: string) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(clearFocus, IDLE_MS);
    focusedRef.current = id;
  }, [clearFocus]);

  const focus = useCallback(
    (id: string | null) => {
      setFocusedId(id);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (id !== null) {
        idleTimerRef.current = setTimeout(clearFocus, IDLE_MS);
      }
    },
    [clearFocus],
  );

  const register = useCallback(
    (id: string, bindings: Record<string, () => void>): (() => void) => {
      registryRef.current.set(id, bindings);
      return () => {
        registryRef.current.delete(id);
      };
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const current = focusedRef.current;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const isField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el?.isContentEditable ?? false);

      if (current === null) {
        // IDLE: try to focus a module
        if (isField) return;
        const id = keyToIdRef.current[key];
        if (!id) return;
        e.preventDefault();
        focus(id);
        // Dual-dispatch: also fire the module's own binding for this key
        // (enables "N = focus + create note" without special-casing).
        const bindings = registryRef.current.get(id);
        const handler = bindings?.[key];
        if (handler) handler();
      } else {
        // FOCUSED
        if (key === "escape") {
          // Escape always unfocuses — blurs the active element too so inputs
          // don't remain focused while the card glow disappears.
          e.preventDefault();
          clearFocus();
          return;
        }
        resetIdleTimer(current);
        if (isField) return;
        const bindings = registryRef.current.get(current);
        const handler = bindings?.[key];
        if (handler) {
          e.preventDefault();
          handler();
        }
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [enabled, focus, resetIdleTimer, clearFocus]);

  // Cleanup idle timer on unmount.
  useEffect(() => () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); }, []);

  const value: HotkeyContextValue = { focusedId, focus, register };
  return <HotkeyCtx.Provider value={value}>{children}</HotkeyCtx.Provider>;
}

// ── useModuleHotkeys ──────────────────────────────────────────────────────────

/**
 * Register in-card key bindings for the enclosing module.
 * Keys are lowercased automatically. Call from the module Panel component.
 * Unregisters automatically on unmount.
 *
 * @example
 * useModuleHotkeys({ a: () => setAdding(true) });
 */
export function useModuleHotkeys(bindings: Record<string, () => void>): void {
  const { instanceId } = useCard();
  const { register } = useHotkey();

  // Keep latest handlers in a ref so the stable wrappers always call the
  // current closure without triggering a re-registration.
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const keysKey = Object.keys(bindings).sort().join(",");

  useEffect(() => {
    const stable: Record<string, () => void> = {};
    for (const k of Object.keys(bindingsRef.current)) {
      const key = k.toLowerCase();
      stable[key] = () => bindingsRef.current[k]?.();
    }
    return register(instanceId, stable);
    // Re-register only when the set of keys changes or instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, register, keysKey]);
}
