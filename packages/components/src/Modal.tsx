import { useEffect, type ReactNode } from "react";
import { ScrollView } from "./ScrollView.js";
import { IconX } from "./icons.js";

export interface ModalProps {
  title: string;
  /** Small dimmed line under the title (e.g. "Settings"). */
  subtitle?: string;
  /** Optional leading ornament in the header (e.g. the assistant's orb). */
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Optional pinned footer (action row) below the scrolling body. */
  footer?: ReactNode;
  /** CSS width of the dialog. Default `min(560px, 96vw)`. */
  width?: string;
  /** Vertical placement — `bottom` is used by the chat sheet. Default `center`. */
  align?: "center" | "bottom";
  /** Fixed CSS height (e.g. the chat sheet); otherwise the dialog hugs content. */
  height?: string;
  /** Extra classes for the scrolling body (e.g. `flex flex-col gap-3`). */
  bodyClassName?: string;
}

/**
 * The one modal. Backdrop, centering, Esc-to-close, pop-in animation, header
 * chrome with a close button, scrollable body, optional pinned footer. Both the
 * shell (settings, chat) and modules (event editor, day view) render through
 * this so every dialog in the hub looks and behaves identically.
 */
export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  width = "min(560px, 96vw)",
  align = "center",
  height,
  bodyClassName,
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-[1000] flex justify-center p-4 ${
        align === "bottom" ? "items-end pb-[100px]" : "items-center"
      }`}
    >
      <div onClick={onClose} className="absolute inset-0 bg-black/70" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="hub-modal panel relative z-[1] flex max-h-[85vh] flex-col overflow-hidden p-0
                   shadow-[0_32px_64px_rgba(0,0,0,0.45)]"
        style={{ width, ...(height ? { height } : {}) }}
      >
        <div className="flex items-center gap-3 border-b border-base-content/10 bg-primary/[0.06] p-4">
          {icon}
          <div className="min-w-0 flex-1">
            <div className="truncate font-sans text-sm font-semibold text-base-content">{title}</div>
            {subtitle && (
              <div className="panel-label normal-case tracking-normal">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-base-content/10
                       bg-base-content/5 text-base-content/60 transition-colors hover:text-base-content"
          >
            <IconX size={14} />
          </button>
        </div>

        <ScrollView className={`flex-1 p-4 ${bodyClassName ?? ""}`}>{children}</ScrollView>

        {footer && (
          <div className="shrink-0 border-t border-base-content/10 p-3">{footer}</div>
        )}
      </div>

      <style>{`
        .hub-modal { animation: hubModalPop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes hubModalPop {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hub-modal { animation: none; }
        }
      `}</style>
    </div>
  );
}
