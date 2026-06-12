// Backend / core entry. No React here — the settings component lives at
// `@hub/google/connect` so module backends can import this without pulling React.
export type { Creds, TokenSet } from "./auth.js";
export {
  getCreds,
  authUrl,
  exchangeCode,
  accessTokenFor,
  clearTokenCache,
  revokeToken,
  AccountAuthError,
} from "./auth.js";
export type { GoogleOAuthOptions } from "./routes.js";
export {
  registerGoogleOAuthRoutes,
  handleGoogleOAuthCallback,
  GOOGLE_OAUTH_MODULE,
} from "./routes.js";
