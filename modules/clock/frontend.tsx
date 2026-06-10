import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import { manifest } from "./manifest";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ClockConfig {
  showSeconds: boolean;
  hour12: boolean;
}

const DEFAULTS: ClockConfig = { showSeconds: true, hour12: true };

async function fetchClockConfig(): Promise<ClockConfig> {
  const r = await fetch("/api/m/clock/config");
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<ClockConfig>;
}

function ClockPanel(_props: PanelProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data } = useQuery({ queryKey: ["clock", "config"], queryFn: fetchClockConfig });
  const showSeconds = data?.showSeconds ?? DEFAULTS.showSeconds;
  const hour12 = data?.hour12 ?? DEFAULTS.hour12;

  const h24 = now.getHours();
  const hr = hour12 ? h24 % 12 || 12 : String(h24).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ampm = h24 >= 12 ? "PM" : "AM";

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex items-end gap-3 leading-none">
        <span
          className="font-mono font-light tracking-tight text-base-content"
          style={{ fontSize: "clamp(56px, 9vw, 116px)" }}
        >
          {hr}:{m}
        </span>
        {(showSeconds || hour12) && (
          <span
            className="font-mono font-light text-base-content/70 pb-[0.12em]"
            style={{ fontSize: "clamp(20px, 3.2vw, 40px)" }}
          >
            {showSeconds && s}
            {hour12 && (
              <span className={(showSeconds ? "ml-1 " : "") + "text-[0.55em] tracking-wide"}>{ampm}</span>
            )}
          </span>
        )}
      </div>
      <div
        className="mt-2 font-serif italic text-base-content/70"
        style={{ fontSize: "clamp(15px, 2vw, 22px)" }}
      >
        {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
      </div>
    </div>
  );
}

function ClockSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<ClockConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchClockConfig()
      .then(setCfg)
      .catch(() => setCfg(DEFAULTS));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    await fetch("/api/m/clock/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showSeconds: cfg.showSeconds, hour12: cfg.hour12 }),
    });
    setSaving(false);
    void qc.invalidateQueries({ queryKey: ["clock", "config"] });
    onClose();
  }

  if (!cfg) {
    return (
      <div className="grid place-items-center py-8">
        <span className="loading loading-spinner text-base-content/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-label mb-2">Hour format</div>
        <div className="join">
          {([
            { v: true, label: "12-hour" },
            { v: false, label: "24-hour" },
          ] as const).map(({ v, label }) => (
            <button
              key={label}
              className={`btn btn-sm join-item ${cfg.hour12 === v ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCfg({ ...cfg, hour12: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="font-sans text-sm font-medium text-base-content">Show seconds</span>
        <input
          type="checkbox"
          className="toggle toggle-primary shrink-0"
          checked={cfg.showSeconds}
          onChange={(e) => setCfg({ ...cfg, showSeconds: e.target.checked })}
        />
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default defineModule({ manifest, Panel: ClockPanel, Settings: ClockSettings });
