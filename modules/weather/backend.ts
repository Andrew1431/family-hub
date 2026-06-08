import { defineBackend } from "@hub/sdk";

/*
 * Real data source (future): Open-Meteo — no API key required.
 * https://api.open-meteo.com/v1/forecast
 *   ?latitude=<lat>&longitude=<lon>
 *   &current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code
 *   &daily=temperature_2m_max,temperature_2m_min
 *   &temperature_unit=fahrenheit
 *   &wind_speed_unit=mph
 *   &timezone=auto
 *
 * Response fields used:
 *   current.temperature_2m        → tempF
 *   current.apparent_temperature  → feelsLikeF
 *   current.relative_humidity_2m  → humidity (%)
 *   current.weather_code          → WMO code → condition + icon
 *   daily.temperature_2m_max[0]   → highF
 *   daily.temperature_2m_min[0]   → lowF
 *
 * Config keys: "lat" (number), "lon" (number)
 * Unit option (°C vs °F) can be added later via config key "unit".
 */

// WMO weather interpretation codes → human label + emoji.
// Full table: https://open-meteo.com/en/docs#weathervariables
const WMO: Record<number, { label: string; emoji: string }> = {
  0:  { label: "Clear Sky",        emoji: "☀️"  },
  1:  { label: "Mainly Clear",     emoji: "🌤️" },
  2:  { label: "Partly Cloudy",    emoji: "⛅"  },
  3:  { label: "Overcast",         emoji: "☁️"  },
  45: { label: "Foggy",            emoji: "🌫️" },
  48: { label: "Icy Fog",          emoji: "🌫️" },
  51: { label: "Light Drizzle",    emoji: "🌦️" },
  53: { label: "Drizzle",          emoji: "🌦️" },
  55: { label: "Heavy Drizzle",    emoji: "🌧️" },
  61: { label: "Light Rain",       emoji: "🌧️" },
  63: { label: "Rain",             emoji: "🌧️" },
  65: { label: "Heavy Rain",       emoji: "🌧️" },
  71: { label: "Light Snow",       emoji: "🌨️" },
  73: { label: "Snow",             emoji: "❄️"  },
  75: { label: "Heavy Snow",       emoji: "❄️"  },
  77: { label: "Snow Grains",      emoji: "🌨️" },
  80: { label: "Light Showers",    emoji: "🌦️" },
  81: { label: "Showers",          emoji: "🌧️" },
  82: { label: "Heavy Showers",    emoji: "⛈️"  },
  85: { label: "Snow Showers",     emoji: "🌨️" },
  86: { label: "Heavy Snow Shower",emoji: "❄️"  },
  95: { label: "Thunderstorm",     emoji: "⛈️"  },
  96: { label: "Thunderstorm",     emoji: "⛈️"  },
  99: { label: "Thunderstorm",     emoji: "⛈️"  },
};

// Night-time icon overrides. Only the "sunny-ish" codes change after dark;
// rain/snow/fog look the same at night so they fall through to the day emoji.
const NIGHT_EMOJI: Record<number, string> = {
  0: "🌙",  // Clear Sky
  1: "🌙",  // Mainly Clear
  2: "☁️",  // Partly Cloudy (no good "moon + cloud" emoji; plain cloud reads better)
};

function wmoLookup(code: number, isDay: boolean): { label: string; emoji: string } {
  const base = WMO[code] ?? { label: "Unknown", emoji: "🌡️" };
  const night = !isDay ? NIGHT_EMOJI[code] : undefined;
  return { label: base.label, emoji: night ?? base.emoji };
}

// Temperatures are in whichever unit was requested; `unit` says which ("C"/"F")
// so the frontend can render "22°C" vs "72°F" without guessing.
export interface CurrentWeather {
  temp: number;
  feelsLike: number;
  condition: string;
  icon: string;
  high: number;
  low: number;
  humidity: number;
  uvIndex: number;
  unit: "C" | "F";
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    uv_index: number;
    is_day: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

async function fetchCurrentWeather(
  lat: number,
  lon: number,
  units: string,
): Promise<CurrentWeather> {
  const fahrenheit = units.toLowerCase() === "fahrenheit";
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,uv_index,is_day",
  );
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("temperature_unit", fahrenheit ? "fahrenheit" : "celsius");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = (await res.json()) as OpenMeteoResponse;
  const { label, emoji } = wmoLookup(j.current.weather_code, j.current.is_day === 1);

  return {
    temp: Math.round(j.current.temperature_2m),
    feelsLike: Math.round(j.current.apparent_temperature),
    condition: label,
    icon: emoji,
    high: Math.round(j.daily.temperature_2m_max[0] ?? j.current.temperature_2m),
    low: Math.round(j.daily.temperature_2m_min[0] ?? j.current.temperature_2m),
    humidity: Math.round(j.current.relative_humidity_2m),
    uvIndex: Math.round(j.current.uv_index),
    unit: fahrenheit ? "F" : "C",
  };
}

export default defineBackend((ctx) => {
  // Read config per-request so settings changes apply without a restart.
  const current = async (): Promise<CurrentWeather> => {
    const lat = Number(await ctx.config.get("lat"));
    const lon = Number(await ctx.config.get("lon"));
    const units = String((await ctx.config.get("units")) ?? "fahrenheit");
    return fetchCurrentWeather(lat, lon, units);
  };

  ctx.capabilities.register({
    name: "weather_current",
    description:
      "Get the current weather conditions: temperature, feels-like, condition, " +
      "daily high/low, and humidity (temperatures use the unit configured for the " +
      "hub; the returned `unit` field is 'C' or 'F'). Useful for answering questions " +
      "about today's weather.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true },
    handler: () => current(),
  });

  ctx.route("GET", "/current", () => current());

  ctx.log.info("weather backend ready");
});
