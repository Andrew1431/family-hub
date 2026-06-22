import { startServer } from "./server.js";

const serveUi =
  process.argv.includes("--serve-ui") ||
  process.env.HUB_SERVE_UI === "1" ||
  process.env.NODE_ENV === "production";

startServer({ serveUi }).catch((err) => {
  console.error("Failed to start family-hub core:", err);
  process.exit(1);
});
