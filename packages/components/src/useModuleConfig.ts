import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Read/write a module's (non-secret) config through the core's generic
 * `/api/m/<name>/config` endpoint.
 *
 * `useModuleConfig` powers panels: cached live values via react-query,
 * refetched automatically after a settings save.
 * `useConfigDraft` powers settings panes: a local editable copy, a `save()`
 * that PUTs it and invalidates the panel's cache, and a `saving` flag —
 * the loop every module was hand-rolling.
 */

const keyFor = (module: string) => [module, "config"] as const;

async function fetchModuleConfig<T>(module: string): Promise<T> {
  const r = await fetch(`/api/m/${module}/config`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<T>;
}

export function useModuleConfig<T extends object>(module: string, defaults: T): T {
  const { data } = useQuery({
    queryKey: keyFor(module),
    queryFn: () => fetchModuleConfig<Partial<T>>(module),
  });
  return { ...defaults, ...data };
}

export interface ConfigDraft<T> {
  /** The editable draft — `null` until the first fetch resolves. */
  draft: T | null;
  setDraft: (next: T) => void;
  /** Merge a partial patch into the draft. */
  patch: (fields: Partial<T>) => void;
  /** PUT the draft and invalidate the module's config cache. */
  save: () => Promise<void>;
  saving: boolean;
}

export function useConfigDraft<T extends object>(module: string, defaults: T): ConfigDraft<T> {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  // Defaults are usually an inline literal; keep the first one so the fetch
  // effect depends only on the module name.
  const defaultsRef = useRef(defaults);

  useEffect(() => {
    let alive = true;
    fetchModuleConfig<Partial<T>>(module)
      .then((cfg) => alive && setDraft({ ...defaultsRef.current, ...cfg }))
      .catch(() => alive && setDraft(defaultsRef.current));
    return () => {
      alive = false;
    };
  }, [module]);

  return {
    draft,
    setDraft,
    patch: (fields) => setDraft((prev) => (prev ? { ...prev, ...fields } : prev)),
    save: async () => {
      if (!draft) return;
      setSaving(true);
      try {
        await fetch(`/api/m/${module}/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        void qc.invalidateQueries({ queryKey: keyFor(module) });
      } finally {
        setSaving(false);
      }
    },
    saving,
  };
}
