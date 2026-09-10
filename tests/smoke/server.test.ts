import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { startServer } from "../../src/http/listen.js";
import { fixture } from "../helpers/fixtures.js";

async function unusedPort(): Promise<number> {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Expected local address");
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe("real Node HTTP server", () => {
  it("applies the body limit to UTF-8 bytes over real HTTP", async () => {
    const server = await startServer(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/acorn/clients/normalise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, extra: "é".repeat(600000) }),
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
    } finally {
      await server.close();
    }
  });
  it("serves on an ephemeral loopback port and closes idempotently", async () => {
    const server = await startServer(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/providers`);
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveLength(3);
    } finally {
      await Promise.all([server.close(), server.close()]);
    }
  });

  it.each(["SIGTERM", "SIGINT"] as const)(
    "runs the compiled entry point and shuts down on %s",
    async (signal) => {
      const port = await unusedPort();
      const child = spawn(process.execPath, ["dist/server.js"], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      let errors = "";
      child.stderr.on("data", (chunk: Buffer) => {
        errors += chunk.toString();
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Server readiness timeout")), 8000);
          child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once("exit", () => {
            clearTimeout(timeout);
            reject(new Error(`Server exited before readiness: ${errors}`));
          });
          child.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
            if (output.includes('"event":"listening"')) {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
        const url = `http://127.0.0.1:${port}`;
        const normalised = await fetch(`${url}/v1/acorn/clients/normalise`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fixture("acorn-client")),
        });
        expect(normalised.status).toBe(200);
        const canonical: unknown = await normalised.json();
        const built = await fetch(`${url}/v1/cosper/clients/build-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(canonical),
        });
        expect(built.status).toBe(200);
        expect(await built.json()).toMatchObject({
          request: fixture("cosper-client-request"),
          response: { simulated: true },
        });
        const exited = once(child, "exit");
        child.kill(signal);
        expect((await exited)[0]).toBe(0);
        expect(errors).toBe("");
        expect(output).not.toMatch(/QQ123456C|priya/u);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
    },
  );

  it("fails safely for invalid configuration", () => {
    const result = spawnSync(process.execPath, ["dist/server.js"], {
      env: { ...process.env, PORT: "SECRET_BAD_PORT" },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid_configuration");
    expect(result.stderr).not.toContain("SECRET");
  });
  it("reports an occupied port without disturbing the existing listener", async () => {
    const server = await startServer(0);
    try {
      const result = spawnSync(process.execPath, ["dist/server.js"], {
        env: { ...process.env, PORT: String(server.port) },
        encoding: "utf8",
        timeout: 5000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("port_in_use");
      expect((await fetch(`http://127.0.0.1:${server.port}/v1/providers`)).status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
