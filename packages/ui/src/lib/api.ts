import type { ModuleManifest, LayoutConfig } from "@hub/sdk";

export interface HubConfig {
  familyName: string;
  showGreeting: boolean;
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
