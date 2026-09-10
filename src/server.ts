import { ConfigurationError, readConfig } from "./http/config.js";
import { startServer } from "./http/listen.js";

async function main() {
  const config = readConfig();
  const server = await startServer(config.port);
  console.info(
    JSON.stringify({ event: "listening", hostname: config.hostname, port: server.port }),
  );
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    void server.close().then(
      () => process.exit(0),
      () => {
        console.error(JSON.stringify({ event: "shutdown_failed" }));
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  const code =
    error instanceof ConfigurationError
      ? "invalid_configuration"
      : error instanceof Error && "code" in error && error.code === "EADDRINUSE"
        ? "port_in_use"
        : "startup_failed";
  const message =
    error instanceof ConfigurationError
      ? error.message
      : code === "port_in_use"
        ? "Configured port is already in use"
        : "Unable to start local server";
  console.error(JSON.stringify({ event: code, message }));
  process.exitCode = 1;
});
