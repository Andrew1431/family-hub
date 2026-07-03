import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — icon-only buttons must always say what they do. */
  label: string;
  /** Hit-target size. Default `md` (28px). */
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const SIZES = { sm: "h-6 w-6", md: "h-7 w-7", lg: "h-8 w-8" } as const;

/**
 * The hub's quiet icon button: dim until hovered/focused, then a soft pill.
 * Used for card cogs, refresh, add, month nav — anywhere an icon acts alone.
 */
export function IconButton({ label, size = "md", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid shrink-0 place-items-center rounded-lg text-base-content/45
                  transition-[color,background-color,opacity] duration-150 hover:bg-base-content/10 hover:text-base-content/80
                  focus-visible:bg-base-content/10 focus-visible:text-base-content/80
                  disabled:pointer-events-none disabled:opacity-40
                  ${SIZES[size]} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
