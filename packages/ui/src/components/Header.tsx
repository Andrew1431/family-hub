import type { DashboardConfig } from "@hub/sdk";
import { DashboardIcon } from "./DashboardIcon";

export function Header({
  dashboards,
  activeId,
  onSelect,
  show = true,
}: {
  dashboards: DashboardConfig[];
  activeId: string;
  onSelect: (id: string) => void;
  show?: boolean;
}) {
  if (!show || dashboards.length < 2) return null;
  return (
    <header className="flex items-center justify-start">
      <nav
        role="tablist"
        aria-label="Dashboards"
        className="flex items-center gap-5"
      >
        {dashboards.map((d) => {
          const active = d.id === activeId;
          return (
            <button
              key={d.id}
              role="tab"
              type="button"
              aria-selected={active}
              aria-label={d.label ?? d.id}
              title={d.label ?? d.id}
              onClick={() => onSelect(d.id)}
              className={`grid h-14 w-14 place-items-center transition-all ${
                active
                  ? "text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]"
                  : "text-base-content/40 hover:text-base-content/70"
              }`}
            >
              <DashboardIcon name={d.icon} size={34} />
            </button>
          );
        })}
      </nav>
    </header>
  );
}
