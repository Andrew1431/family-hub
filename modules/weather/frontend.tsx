import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import { manifest } from "./manifest";
import type { CurrentWeather } from "./backend";

interface WeatherConfig {
  lat: number;
  lon: number;
  units: "celsius" | "fahrenheit";
}

async function fetchCurrent(): Promise<CurrentWeather> {
  const r = await fetch("/api/m/weather/current");
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<CurrentWeather>;
}

function WeatherPanel(_props: PanelProps) {
  const { data, isError } = useQuery({
    queryKey: ["weather", "current"],
    queryFn: fetchCurrent,
    // Weather changes slowly; refetch in the background every 10 min.
    refetchInterval: 10 * 60_000,
  });

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="panel-label text-error">Unable to load weather</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="panel-label text-base-content/40">Loading…</span>
      </div>
    );
  }

  return (
    // justify-between + min-h-0 lets the panel absorb whatever height it's given
    // without ever clipping the stats row (the bottom High/Low/UV line was being
    // cut off at 1080p when the panel was short).
    <div className="flex h-full min-h-0 flex-col justify-between gap-2">
      <div className="panel-label">Weather</div>

      {/* Icon + temperature + condition */}
      <div className="flex min-h-0 flex-1 items-center gap-4">
        <span style={{ fontSize: "clamp(44px, 6vw, 68px)", lineHeight: 1 }}>
          {data.icon}
        </span>
        <div>
          <div
            className="font-mono font-light leading-none text-base-content"
            style={{ fontSize: "clamp(38px, 5vw, 60px)" }}
          >
            {data.temp}°{data.unit}
          </div>
          <div
            className="mt-1 font-serif italic text-base-content/70"
            style={{ fontSize: "clamp(13px, 1.6vw, 17px)" }}
          >
            {data.condition}
          </div>
        </div>
      </div>

      {/* High / Low / Humidity */}
      <div className="grid shrink-0 grid-cols-4 gap-2 border-t border-base-content/15 pt-2.5">
        {[
          { label: "High",     value: `${data.high}°` },
          { label: "Low",      value: `${data.low}°` },
          { label: "Humidity", value: `${data.humidity}%` },
          { label: "UV",       value: `${data.uvIndex}` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span
              className="font-mono text-base-content"
              style={{ fontSize: "clamp(15px, 1.8vw, 19px)" }}
            >
              {value}
            </span>
            <span
              className="font-serif italic text-base-content/65"
              style={{ fontSize: "clamp(11px, 1.2vw, 13px)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeatherSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<WeatherConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/m/weather/config")
      .then((r) => r.json() as Promise<WeatherConfig>)
      .then(setCfg)
      .catch(() => setCfg({ lat: 0, lon: 0, units: "celsius" }));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    await fetch("/api/m/weather/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: Number(cfg.lat), lon: Number(cfg.lon), units: cfg.units }),
    });
    setSaving(false);
    // New location/units → let the panel refetch fresh weather.
    void qc.invalidateQueries({ queryKey: ["weather", "current"] });
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
        <div className="panel-label mb-2">Units</div>
        <div className="join">
          {(["celsius", "fahrenheit"] as const).map((u) => (
            <button
              key={u}
              className={`btn btn-sm join-item ${cfg.units === u ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCfg({ ...cfg, units: u })}
            >
              °{u === "celsius" ? "C" : "F"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="panel-label">Latitude</span>
          <input
            type="number"
            step="any"
            className="input input-sm bg-base-content/5 border-base-content/10"
            value={cfg.lat}
            onChange={(e) => setCfg({ ...cfg, lat: e.target.value as unknown as number })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="panel-label">Longitude</span>
          <input
            type="number"
            step="any"
            className="input input-sm bg-base-content/5 border-base-content/10"
            value={cfg.lon}
            onChange={(e) => setCfg({ ...cfg, lon: e.target.value as unknown as number })}
          />
        </label>
      </div>
      <p className="font-serif italic text-xs text-base-content/45">
        Tip: find coordinates by searching your town on any maps site. (Open-Meteo needs no API key.)
      </p>

      <div className="flex justify-end gap-2 pt-1">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default defineModule({ manifest, Panel: WeatherPanel, Settings: WeatherSettings });
