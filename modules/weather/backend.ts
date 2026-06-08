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

function wmoLookup(code: number): { label: string; emoji: string } {
  return WMO[code] ?? { label: "Unknown", emoji: "🌡️" };
}

export interface CurrentWeather {
  tempF: number;
  feelsLikeF: number;
  condition: string;
  icon: string;
  highF: number;
  lowF: number;
  humidity: number;
}

// Mock shaped identically to what the real Open-Meteo fetch + parse would return.
// Swap: replace this body with an actual fetch call using ctx.config lat/lon.
export function buildCurrentWeather(): CurrentWeather {
  const code = 2; // WMO 2 = Partly Cloudy
  const { label, emoji } = wmoLookup(code);
  // Temperatures are in °F. A "unit" config option can be added later.
  return {
    tempF: 72,
    feelsLikeF: 68,
    condition: label,
    icon: emoji,
    highF: 76,
    lowF: 58,
    humidity: 54,
  };
}

export default defineBackend((ctx) => {
  ctx.capabilities.register({
    name: "weather_current",
    description:
      "Get the current weather conditions: temperature (°F), feels-like, condition, " +
      "daily high/low, and humidity. Useful for answering questions about today's weather.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true },
    handler: () => buildCurrentWeather(),
  });

  ctx.route("GET", "/current", () => buildCurrentWeather());

  ctx.log.info("weather backend ready");
});
