import type { ModuleManifest, LayoutConfig } from "@hub/sdk";

export interface HubConfig {
  familyName: string;
  showGreeting: boolean;
  /** Show the AI assistant orb/chat bubble. When false the grid reclaims the space. */
  showAssistant: boolean;
  theme: string;
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
