import { useEffect, useState } from "react";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import { manifest } from "./manifest";
import type { CurrentWeather } from "./backend";

interface WeatherConfig {
  lat: number;
  lon: number;
  units: "celsius" | "fahrenheit";
}

function WeatherPanel(_props: PanelProps) {
  const [data, setData] = useState<CurrentWeather | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/m/weather/current")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json() as Promise<CurrentWeather>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
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
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="panel-label">Weather</div>

      {/* Icon + temperature + condition */}
      <div className="flex items-center gap-4">
        <span style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1 }}>
          {data.icon}
        </span>
        <div>
          <div
            className="font-mono font-light leading-none text-base-content"
            style={{ fontSize: "clamp(32px, 4.5vw, 48px)" }}
          >
            {data.temp}°{data.unit}
          </div>
          <div
            className="mt-1 font-serif italic text-base-content/60"
            style={{ fontSize: "clamp(11px, 1.4vw, 14px)" }}
          >
            {data.condition}
          </div>
        </div>
      </div>

      {/* High / Low / Humidity */}
      <div className="grid grid-cols-4 gap-2 border-t border-base-content/10 pt-2">
        {[
          { label: "High",     value: `${data.high}°` },
          { label: "Low",      value: `${data.low}°` },
          { label: "Humidity", value: `${data.humidity}%` },
          { label: "UV",       value: `${data.uvIndex}` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span
              className="font-mono text-base-content"
              style={{ fontSize: "clamp(12px, 1.5vw, 15px)" }}
            >
              {value}
            </span>
            <span
              className="font-serif italic text-base-content/50"
              style={{ fontSize: "clamp(9px, 1vw, 11px)" }}
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
