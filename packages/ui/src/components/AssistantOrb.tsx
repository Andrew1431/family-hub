/**
 * Entry point for the family assistant: the copper orb plus a hint that the
 * Spacebar opens it. The chat modal itself is rendered by App.
 */
export function AssistantOrb({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="font-serif text-[13px] italic text-base-content/65">
        Ask your family assistant · press{" "}
        <kbd className="kbd kbd-sm">space</kbd>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label="Open family assistant"
        className="orb-pulse grid h-[72px] w-[72px] place-items-center rounded-full bg-gradient-to-br from-primary via-warning to-primary
                   text-3xl text-primary-content transition-transform duration-200 hover:scale-105
                   shadow-[0_0_28px_color-mix(in_oklab,var(--color-primary)_30%,transparent)]"
      >
        ✦
      </button>
      <style>{`
        /* Transform/opacity pulse only — animating box-shadow/blur every frame
           tanks Chromium on the Pi, so the glow stays static. */
        @keyframes orbPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .orb-pulse { animation: orbPulse 2.6s ease-in-out infinite; }
        .orb-pulse:hover { animation: none; }
      `}</style>
    </div>
  );
}
