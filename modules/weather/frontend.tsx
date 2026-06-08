import { useEffect, useState } from "react";
import { defineModule, type PanelProps } from "@hub/sdk";
import { manifest } from "./manifest";
import type { CurrentWeather } from "./backend";

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
            {data.tempF}°
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
      <div className="grid grid-cols-3 gap-2 border-t border-base-content/10 pt-2">
        {[
          { label: "High",     value: `${data.highF}°` },
          { label: "Low",      value: `${data.lowF}°` },
          { label: "Humidity", value: `${data.humidity}%` },
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

export default defineModule({ manifest, Panel: WeatherPanel });
