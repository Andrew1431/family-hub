import { useEffect, type ReactNode } from "react";
import { ScrollView } from "@hub/components";

/**
 * Modal chrome owned by the shell: backdrop, centering, Esc-to-close, theme.
 * Module settings components are rendered as `children` — they never deal with
 * portals or backdrops themselves, so every module's settings look consistent.
 */
export function SettingsModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} settings`}
        className="panel relative z-[1] flex max-h-[85vh] w-[min(560px,96vw)] flex-col overflow-hidden p-0 shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
        style={{ animation: "settingsPop 0.22s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        <div className="flex items-center gap-3 border-b border-base-content/10 bg-primary/[0.06] p-4">
          <div className="flex-1">
            <div className="font-sans text-sm font-semibold text-base-content">{title}</div>
            <div className="panel-label normal-case tracking-normal">Settings</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-lg border border-base-content/10 bg-base-content/5 text-base-content/60 hover:text-base-content"
          >
            ✕
          </button>
        </div>

        <ScrollView className="flex-1 p-4">{children}</ScrollView>
      </div>

      <style>{`@keyframes settingsPop { from { opacity:0; transform: translateY(16px) scale(0.97);} to { opacity:1; transform: translateY(0) scale(1);} }`}</style>
    </div>
  );
}
