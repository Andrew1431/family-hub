import { useEffect, useState } from "react";
import type { ModuleManifest, LayoutConfig } from "@hub/sdk";
import { fetchModules, fetchLayout, fetchConfig, type HubConfig } from "./lib/api";
import { DashboardGrid } from "./components/DashboardGrid";
import { Header } from "./components/Header";
import { AssistantOrb } from "./components/AssistantOrb";
import { ChatModal } from "./components/ChatModal";
import { SettingsModal } from "./components/SettingsModal";
import { HubSettings } from "./components/HubSettings";
import { OverlayHost } from "./components/OverlayHost";

export default function App() {
  const [modules, setModules] = useState<ModuleManifest[] | null>(null);
  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("");

  const showAssistant = config?.showAssistant !== false; // default on for older configs
  const showOrb = config?.showOrb !== false; // default on; only meaningful when showAssistant

  useEffect(() => {
    Promise.all([fetchModules(), fetchLayout(), fetchConfig()])
      .then(([m, l, c]) => {
        setModules(m);
        setLayout(l);
        setConfig(c);
        setActiveId(l.dashboards[0]?.id ?? "");
        if (c.theme) document.documentElement.dataset.theme = c.theme;
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Spacebar opens the assistant — but never while typing in a field, and not
  // when the assistant is disabled.
  useEffect(() => {
    if (!showAssistant) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || chatOpen) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      setChatOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen, showAssistant]);

  if (error) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="panel p-8 max-w-md">
          <div className="panel-label mb-2">Can't reach the hub</div>
          <p className="text-base-content/70 text-sm">{error}</p>
          <p className="text-base-content/50 text-xs mt-3">
            Is the core server running? (<code>pnpm --filter @hub/core dev</code>)
          </p>
        </div>
      </div>
    );
  }

  if (!modules || !layout || !config) {
    return (
      <div className="grid h-full place-items-center">
        <span className="loading loading-ring loading-lg text-primary" />
      </div>
    );
  }

  const moduleMap = Object.fromEntries(modules.map((m) => [m.name, m]));
  const active = layout.dashboards.find((d) => d.id === activeId) ?? layout.dashboards[0];

  return (
    <div className="relative flex h-full flex-col gap-[clamp(16px,2.5vw,28px)] overflow-hidden p-[clamp(20px,4vw,48px)]">
      {/* Hub settings — dim corner gear, brightens on hover/focus (kept subtle for
          a wall display). Opens the shell SettingsModal with app-level toggles. */}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Hub settings"
        className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-lg
                   text-base-content/25 transition-colors duration-150
                   hover:bg-base-content/10 hover:text-base-content/70 focus-visible:text-base-content/70"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <Header dashboards={layout.dashboards} activeId={active?.id ?? ""} onSelect={setActiveId} />
      {active && (
        <DashboardGrid
          dashboard={active}
          modules={moduleMap}
          defaults={{ columns: layout.columns, ...(layout.rows ? { rows: layout.rows } : {}) }}
        />
      )}
      {showAssistant && showOrb && (
        <footer className="flex justify-center">
          <AssistantOrb onClick={() => setChatOpen(true)} />
        </footer>
      )}
      {showAssistant && chatOpen && <ChatModal onClose={() => setChatOpen(false)} />}
      {settingsOpen && (
        <SettingsModal title="Settings" onClose={() => setSettingsOpen(false)}>
          <HubSettings config={config} modules={modules} onChange={setConfig} />
        </SettingsModal>
      )}
      {/* Full-screen module overlays (e.g. the photos screensaver). Each decides
          when to show based on the global idle signal. */}
      <OverlayHost modules={modules} />
    </div>
  );
}
