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
      <nav role="tablist" aria-label="Dashboards" className="flex items-center gap-4">
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
              className={`relative grid h-14 w-14 place-items-center rounded-2xl transition-colors duration-150 ${
                active
                  ? "bg-primary/12 text-primary"
                  : "text-base-content/40 hover:bg-base-content/5 hover:text-base-content/70"
              }`}
            >
              <DashboardIcon name={d.icon} size={30} />
              {/* Active marker: a small ember under the icon. */}
              <span
                aria-hidden
                className={`absolute bottom-1.5 h-1 w-1 rounded-full bg-primary transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </nav>
    </header>
  );
}
