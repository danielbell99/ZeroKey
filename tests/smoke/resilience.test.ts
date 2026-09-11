import { request as httpRequest } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/http/app.js";
import { startServer } from "../../src/http/listen.js";
import { defaultRegistry } from "../../src/registry/providers.js";
import { createRegistry } from "../../src/registry/registry.js";
import {
  BODY_LIMIT,
  expectHttpError,
  jsonRequest,
  PRIVATE_MARKER,
  postEndpoints,
  sizedJson,
  UUID,
} from "../helpers/http.js";

/** Node sends chunked transfer encoding when writes have no declared Content-Length. */
function chunkedPost(url: string, body: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("error", reject);
        incoming.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              headers.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
          resolve(
            new Response(Buffer.concat(chunks), { status: incoming.statusCode ?? 500, headers }),
          );
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(5000, () => request.destroy(new Error("Chunked request timed out")));
    const encoded = Buffer.from(body);
    expect(request.hasHeader("Content-Length")).toBe(false);
    for (let offset = 0; offset < encoded.length; offset += 65536)
      request.write(encoded.subarray(offset, offset + 65536));
    request.end();
  });
}

describe.each(postEndpoints)("real HTTP resilience: $provider", (endpoint) => {
  it.each([
    { name: "malformed JSON", body: "{", status: 400, code: "invalid_json" },
    { name: "schema failure", body: "null", status: 422, code: "validation_failed" },
    { name: "oversized body", body: null, status: 413, code: "payload_too_large" },
  ] as const)("recovers after $name on the same server", async ({ body, status, code }) => {
    const logFailure = vi.fn();
    const server = await startServer(0, createApp({ logFailure }));
    try {
      const url = `http://127.0.0.1:${server.port}${endpoint.path}`;
      const failed = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ?? sizedJson(endpoint, BODY_LIMIT + 1),
        signal: AbortSignal.timeout(5000),
      });
      const failedId = await expectHttpError(failed, status, code);
      const recovered = await fetch(url, {
        ...jsonRequest(endpoint.body()),
        signal: AbortSignal.timeout(5000),
      });
      expect(recovered.status).toBe(200);
      expect(recovered.headers.get("x-request-id")).toMatch(UUID);
      expect(recovered.headers.get("x-request-id")).not.toBe(failedId);
      await recovered.json();
      expect(logFailure).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
  it("rejects an oversized genuinely chunked UTF-8 request and remains healthy", async () => {
    const server = await startServer(0);
    try {
      const url = `http://127.0.0.1:${server.port}${endpoint.path}`;
      await expectHttpError(
        await chunkedPost(url, sizedJson(endpoint, BODY_LIMIT + 1)),
        413,
        "payload_too_large",
      );
      const recovered = await fetch(url, {
        ...jsonRequest(endpoint.body()),
        signal: AbortSignal.timeout(5000),
      });
      expect(recovered.status).toBe(200);
      await recovered.json();
    } finally {
      await server.close();
    }
  });
});

describe("real HTTP internal fault recovery", () => {
  it.each([
    "discovery",
    "acorn",
    "beacon",
    "cosper",
    "acorn-address",
    "beacon-address",
    "cosper-address",
  ] as const)("recovers from an injected %s failure", async (stage) => {
    const logFailure = vi.fn();
    const healthy = defaultRegistry();
    let registry = healthy;
    let path = "/v1/providers";
    let init: RequestInit = {};
    if (stage === "discovery") {
      registry = {
        ...healthy,
        list: vi.fn(healthy.list).mockImplementationOnce(() => {
          throw null;
        }),
      };
    } else {
      const addressStage = stage.endsWith("-address");
      const provider = addressStage ? stage.slice(0, -"-address".length) : stage;
      const resource = addressStage ? "addresses" : "clients";
      const endpoint = postEndpoints.find(
        (entry) => entry.provider === provider && entry.resource === resource,
      );
      const adapter = healthy.get(provider);
      if (!endpoint || !adapter) throw new Error("Missing test provider");
      path = endpoint.path;
      init = jsonRequest(endpoint.body());
      const fault = () => {
        throw PRIVATE_MARKER;
      };
      registry = createRegistry([
        {
          ...adapter,
          ...(endpoint.resource === "clients"
            ? endpoint.operation === "normalise"
              ? { normalise: vi.fn(adapter.normalise).mockImplementationOnce(fault) }
              : { buildRequest: vi.fn(adapter.buildRequest).mockImplementationOnce(fault) }
            : endpoint.operation === "normalise"
              ? { normaliseAddress: vi.fn(adapter.normaliseAddress).mockImplementationOnce(fault) }
              : {
                  buildAddressRequest: vi
                    .fn(adapter.buildAddressRequest)
                    .mockImplementationOnce(fault),
                }),
        },
      ]);
    }
    const server = await startServer(0, createApp({ registry, logFailure }));
    try {
      const url = `http://127.0.0.1:${server.port}${path}`;
      const id = await expectHttpError(
        await fetch(url, { ...init, signal: AbortSignal.timeout(5000) }),
        500,
        "internal_error",
      );
      expect(logFailure.mock.calls).toEqual([
        [
          {
            event: "unexpected_error",
            requestId: id,
            provider:
              stage === "discovery"
                ? null
                : stage.endsWith("-address")
                  ? stage.slice(0, -"-address".length)
                  : stage,
            operation:
              stage === "discovery" || stage === "acorn" || stage === "beacon"
                ? stage === "discovery"
                  ? null
                  : "normalise"
                : stage === "acorn-address" || stage === "beacon-address"
                  ? "normalise"
                  : "build-request",
            resource:
              stage === "discovery" ? null : stage.endsWith("-address") ? "addresses" : "clients",
          },
        ],
      ]);
      const recovered = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
      expect(recovered.status).toBe(200);
      expect(recovered.headers.get("x-request-id")).not.toBe(id);
      await recovered.json();
      expect(logFailure).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });
});
