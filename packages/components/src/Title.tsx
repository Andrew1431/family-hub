import type { ReactNode } from "react";
import { useCard } from "./hotkeys.js";

interface TitleProps {
  children: ReactNode;
  className?: string;
}

/**
 * Card heading that renders the module name with a dim hotkey hint badge.
 * Reads the resolved hotkey and focused state from CardContext automatically —
 * the hint brightens when the card is focused.
 *
 * Drop-in for the ad-hoc `<span className="panel-label">` headers in module panels.
 */
export function Title({ children, className }: TitleProps) {
  const { hotkey, focused } = useCard();
  const base = "panel-label inline-flex items-baseline gap-1.5";
  return (
    <span className={className ? `${base} ${className}` : base}>
      {children}
      {hotkey && (
        <span className="hotkey-hint" data-focused={focused}>
          {hotkey.toUpperCase()}
        </span>
      )}
    </span>
  );
}
