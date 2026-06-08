/**
 * Entry point for the family assistant: the copper orb plus a hint that the
 * Spacebar opens it. The chat modal itself is rendered by App.
 */
export function AssistantOrb({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-serif text-[11px] italic text-base-content/50">
        Ask your family assistant · press{" "}
        <kbd className="kbd kbd-sm">space</kbd>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label="Open family assistant"
        className="orb-pulse grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary via-warning to-primary
                   text-2xl text-primary-content transition-transform duration-200 hover:scale-105
                   shadow-[0_0_32px_color-mix(in_oklab,var(--color-primary)_30%,transparent)]"
      >
        ✦
      </button>
      <style>{`
        @keyframes orbPulse {
          0%,100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-primary) 40%, transparent), 0 0 32px color-mix(in oklab, var(--color-primary) 25%, transparent); }
          50% { box-shadow: 0 0 0 10px transparent, 0 0 48px color-mix(in oklab, var(--color-primary) 45%, transparent); }
        }
        .orb-pulse { animation: orbPulse 2.5s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
