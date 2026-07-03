import type { ModuleManifest, LayoutConfig } from "@hub/sdk";

export interface HubConfig {
  familyName: string;
  showGreeting: boolean;
  /** Enable the AI assistant feature (orb + Spacebar + chat). When false the grid reclaims the space. */
  showAssistant: boolean;
  /** Show the orb itself. When false the orb is hidden but Spacebar still opens the chat (only applies when showAssistant). */
  showOrb: boolean;
  /** Theme name (single mode) — must match a theme block in theme.local.css. */
  theme: string;
  /** "single" (default) or "auto" — switch day/night themes on the wall clock. */
  themeMode?: "single" | "auto";
  themeDay?: string;
  themeNight?: string;
  /** "HH:MM" boundaries for auto mode. */
  dayStart?: string;
  nightStart?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchModules = () => getJson<ModuleManifest[]>("/api/modules");
export const fetchLayout = () => getJson<LayoutConfig>("/api/layout");
export const fetchConfig = () => getJson<HubConfig>("/api/config");

export async function updateConfig(patch: Partial<HubConfig>): Promise<HubConfig> {
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT /api/config -> ${res.status}`);
  return res.json() as Promise<HubConfig>;
}
