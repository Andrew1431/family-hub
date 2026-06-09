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
    <header className="flex items-center justify-center">
      <nav
        role="tablist"
        aria-label="Dashboards"
        className="flex items-center gap-1 rounded-full bg-base-content/5 p-1"
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
              className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-base-content/45 hover:bg-base-content/10 hover:text-base-content/75"
              }`}
            >
              <DashboardIcon name={d.icon} />
            </button>
          );
        })}
      </nav>
    </header>
  );
}
