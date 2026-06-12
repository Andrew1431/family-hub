import { defineBackend } from "@hub/sdk";
import { handleGoogleOAuthCallback } from "@hub/google";

/*
 * The one shared OAuth callback for the whole hub. Every Google module's consent
 * flow redirects here (`/api/m/google-oauth/callback`); the handler reads the
 * `state` to find which module started it and finishes the exchange against that
 * module's own secret namespace. Register this one URI in Google Cloud and every
 * present-and-future Google module is covered.
 *
 * This module is just the mount point — all the logic lives in `@hub/google`.
 * Routes only exist by being mounted, and the loader only mounts modules/*, so a
 * shared route still needs a (tiny) module to host it.
 */
export default defineBackend((ctx) => {
  ctx.route("GET", "/callback", ({ query }) => handleGoogleOAuthCallback(query));
  ctx.log.info("shared Google OAuth callback ready at /api/m/google-oauth/callback");
});
