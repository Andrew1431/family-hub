import type { ReactNode } from "react";

/**
 * The three states every panel and settings pane keeps re-implementing:
 * loading, empty (with direction), and error. Centralised so they read the
 * same everywhere — serif italic for the human sentence, spinner for waiting.
 */

export function LoadingState({ className }: { className?: string }) {
  return (
    <div className={`grid flex-1 place-items-center py-8 ${className ?? ""}`}>
      <span className="loading loading-spinner text-base-content/40" />
    </div>
  );
}

export function EmptyState({
  children,
  className,
}: {
  /** A short invitation to act ("No lists yet. Open settings to connect…"). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-1 items-center justify-center px-4 py-3 text-center
                  font-serif text-[clamp(13px,1.4vw,15px)] italic text-base-content/55 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function ErrorState({
  children,
  className,
}: {
  /** What went wrong, in plain words. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-1 items-center justify-center px-4 text-center text-xs text-error/80 ${className ?? ""}`}>
      {children}
    </div>
  );
}
