import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { CardCtx, useHotkey } from "./hotkeys.js";

export interface CardProps {
  instanceId: string;
  hotkey?: string;
  surface?: "panel" | "bare";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Focus-aware grid cell that replaces the raw <section> in DashboardGrid.
 * Reads HotkeyContext; syncs DOM focus with app focus state; provides CardContext
 * to children (Title, useModuleHotkeys).
 */
export function Card({ instanceId, hotkey, surface = "panel", className, style, children }: CardProps) {
  const { focusedId, focus } = useHotkey();
  const focused = focusedId === instanceId;
  const elRef = useRef<HTMLElement>(null);

  // Move DOM focus to the card when the hotkey system focuses it.
  useEffect(() => {
    if (focused && document.activeElement !== elRef.current) {
      elRef.current?.focus({ preventScroll: true });
    }
  }, [focused]);

  // Clicking / tabbing into the card also updates the hotkey focus state.
  const handleFocus = useCallback(
    (e: React.FocusEvent) => {
      // Ignore focus events from within the card (e.g. child inputs),
      // only react to focus arriving from outside.
      if (!elRef.current?.contains(e.relatedTarget as Node | null)) {
        focus(instanceId);
      }
    },
    [focus, instanceId],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      // Only clear when focus leaves the card entirely.
      if (!elRef.current?.contains(e.relatedTarget as Node | null)) {
        focus(null);
      }
    },
    [focus],
  );

  const cardCtx = { instanceId, hotkey, focused };

  const classes = [
    surface === "panel" ? "panel p-[clamp(14px,1.6vw,22px)]" : "",
    "group relative flex flex-col min-h-0 overflow-hidden outline-none",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <CardCtx.Provider value={cardCtx}>
      <section
        ref={elRef}
        tabIndex={-1}
        className={classes}
        style={style}
        data-focused={focused}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </section>
    </CardCtx.Provider>
  );
}
