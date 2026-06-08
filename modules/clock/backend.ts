import { defineBackend } from "@hub/sdk";

/**
 * The clock is mostly a frontend concern, but its backend demonstrates the
 * full module surface: a capability (so the AI can answer "what time is it?")
 * and a route. Time itself is rendered client-side; this is authoritative
 * server time for cross-device consistency.
 */
export default defineBackend((ctx) => {
  ctx.capabilities.register({
    name: "clock_get_time",
    description: "Get the current server date and time (ISO 8601, with timezone).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true },
    handler: () => {
      const now = new Date();
      return {
        iso: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        epochMs: now.getTime(),
      };
    },
  });

  ctx.route("GET", "/now", () => ({ iso: new Date().toISOString() }));

  ctx.log.info("clock backend ready");
});
