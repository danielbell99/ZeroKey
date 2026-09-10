import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createApp } from "./app.js";

/** Port zero is an internal test facility, not an accepted PORT configuration value. */
export async function startServer(port: number, app = createApp(), shutdownTimeoutMs = 5000) {
  const server = createServer(getRequestListener(app.fetch, { overrideGlobalObjects: false }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an IP listening address");
  let closing: Promise<void> | undefined;
  function close(): Promise<void> {
    closing ??= new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => server.closeAllConnections(), shutdownTimeoutMs);
      deadline.unref();
      server.close((error) => {
        clearTimeout(deadline);
        if (error) reject(error);
        else resolve();
      });
      server.closeIdleConnections();
    });
    return closing;
  }
  return { port: address.port, close };
}
