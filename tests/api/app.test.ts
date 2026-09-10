import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/http/app.js";
import { createRegistry } from "../../src/registry/registry.js";
import { minimalClient } from "../helpers/client.js";
import { expectedAcorn, expectedBeacon, fixture } from "../helpers/fixtures.js";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

describe("HTTP success contracts", () => {
  it("lists only the registered capabilities and supplies a generated request ID", async () => {
    const response = await createApp().request("/v1/providers", {
      headers: { "X-Request-Id": "caller-controlled" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { slug: "acorn", supports: ["normalise"] },
      { slug: "beacon", supports: ["normalise"] },
      { slug: "cosper", supports: ["build-request"] },
    ]);
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f\d-]{36}$/u);
  });
  it.each(["acorn", "beacon"] as const)(
    "normalises %s through its actual adapter",
    async (provider) => {
      const response = await createApp().request(
        `/v1/${provider}/clients/normalise`,
        json(fixture(`${provider}-client`)),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        provider === "acorn" ? expectedAcorn() : expectedBeacon(),
      );
    },
  );
  it("builds the exact Cosper body inside the documented simulated result", async () => {
    const response = await createApp().request(
      "/v1/cosper/clients/build-request",
      json(expectedAcorn()),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      request: fixture("cosper-client-request"),
      response: { status: "created", clientRef: "90210", simulated: true },
    });
  });
});

describe("HTTP client errors", () => {
  it.each([
    ["/v1/missing/clients/normalise", 404, "unknown_provider"],
    ["/v1/cosper/clients/normalise", 400, "unsupported_operation"],
    ["/v1/acorn/clients/build-request", 400, "unsupported_operation"],
    ["/v1/beacon/clients/build-request", 400, "unsupported_operation"],
    ["/no-such-route", 404, "not_found"],
  ])("returns a consistent error for %s", async (route, status, code) => {
    const response = await createApp().request(route, json({}));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      error: { code, requestId: response.headers.get("x-request-id") },
    });
  });
  it.each([undefined, "text/plain", "application/xml"])(
    "rejects content type %s",
    async (contentType) => {
      const headers = contentType ? { "Content-Type": contentType } : {};
      const response = await createApp().request("/v1/acorn/clients/normalise", {
        method: "POST",
        headers,
        body: "{}",
      });
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
    },
  );
  it.each(["", "{broken", '{"id":1,}'])("rejects malformed or empty JSON", async (body) => {
    const response = await createApp().request("/v1/acorn/clients/normalise", {
      ...json({}),
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_json" } });
  });
  it("handles malformed JSON identically on build-request", async () => {
    const response = await createApp().request("/v1/cosper/clients/build-request", {
      ...json({}),
      body: "{",
    });
    expect(response.status).toBe(400);
  });
  it.each([null, [], {}, { id: 1, person: { firstName: 42 } }])(
    "returns useful validation issues for %j",
    async (input) => {
      const response = await createApp().request("/v1/acorn/clients/normalise", json(input));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: {
          code: "validation_failed",
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: expect.any(Array),
              code: expect.any(String),
              message: expect.any(String),
            }),
          ]),
        },
      });
    },
  );
  it("rejects non-canonical build input and strips sensitive values/unknown keys from errors", async () => {
    const response = await createApp().request(
      "/v1/cosper/clients/build-request",
      json({
        ...minimalClient(),
        legal_sex: "SECRET_SEX_VALUE",
        SECRET_KEY: "sensitive@example.com",
      }),
    );
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("sensitive@example.com");
  });
  it("returns a field-level unsupported-country error", async () => {
    const client = expectedAcorn();
    if (client.addresses[0]) client.addresses[0].country = "ES";
    const response = await createApp().request("/v1/cosper/clients/build-request", json(client));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { issues: [{ path: ["addresses", 0, "country"], code: "unsupported_country" }] },
    });
  });
  it("returns safe, original-path errors for conflicting Acorn nationality", async () => {
    const response = await createApp().request(
      "/v1/acorn/clients/normalise",
      json({
        id: 1,
        person: { nationalityCountry: { name: "British", isoCode: "FRA" } },
      }),
    );
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(text).not.toContain("British");
    expect(text).not.toContain("FRA");
    expect(JSON.parse(text)).toMatchObject({
      error: {
        code: "validation_failed",
        issues: [
          { path: ["person", "nationalityCountry", "name"], code: "conflicting_nationality" },
          { path: ["person", "nationalityCountry", "isoCode"], code: "conflicting_nationality" },
        ],
      },
    });
  });
  it.each([false, true])("limits oversized JSON (declared length: %s)", async (declared) => {
    const body = JSON.stringify({ id: 1, extra: "x".repeat(1024 * 1024) });
    const headers = new Headers({ "Content-Type": "application/json" });
    if (declared) headers.set("Content-Length", String(Buffer.byteLength(body)));
    const response = await createApp().request("/v1/acorn/clients/normalise", {
      method: "POST",
      headers,
      body,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });
});

describe("unexpected failures stay distinct from caller errors", () => {
  it("uses the default safe log sink and handles failures outside a provider operation", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const registry = {
        get: () => undefined,
        list: () => {
          throw new Error("SECRET_REGISTRY_FAILURE");
        },
      };
      const response = await createApp({ registry }).request("/v1/providers");
      expect(response.status).toBe(500);
      expect(spy).toHaveBeenCalledWith(
        JSON.stringify({
          event: "unexpected_error",
          requestId: response.headers.get("x-request-id"),
          provider: null,
          operation: null,
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });
  it("logs a safe correlated event without exception text or input", async () => {
    const logFailure = vi.fn();
    const registry = createRegistry([
      {
        slug: "broken",
        normalise: () => {
          throw new Error("SECRET: QQ123456C sensitive@example.com");
        },
      },
    ]);
    const response = await createApp({ registry, logFailure }).request(
      "/v1/broken/clients/normalise",
      json({ secret: "PRIVATE" }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred",
        requestId: response.headers.get("x-request-id"),
      },
    });
    expect(logFailure).toHaveBeenCalledWith({
      event: "unexpected_error",
      requestId: response.headers.get("x-request-id"),
      provider: "broken",
      operation: "normalise",
    });
    expect(JSON.stringify(logFailure.mock.calls)).not.toMatch(
      /SECRET|QQ123456C|sensitive|PRIVATE/u,
    );
  });
  it("treats an invalid generated canonical client as a 500 even if the logger also fails", async () => {
    const registry = createRegistry([
      { slug: "broken", normalise: () => minimalClient({ id: "" }) },
    ]);
    const response = await createApp({
      registry,
      logFailure: () => {
        throw new Error("sink failure");
      },
    }).request("/v1/broken/clients/normalise", json({}));
    expect(response.status).toBe(500);
  });
  it("rejects a generated non-JSON request as an internal defect", async () => {
    const registry = createRegistry([
      {
        slug: "broken",
        buildRequest: (client) => ({
          request: { invalid: Number.NaN },
          response: { status: "created", clientRef: client.id, simulated: true },
        }),
      },
    ]);
    const response = await createApp({ registry, logFailure: vi.fn() }).request(
      "/v1/broken/clients/build-request",
      json(minimalClient()),
    );
    expect(response.status).toBe(500);
  });
});
