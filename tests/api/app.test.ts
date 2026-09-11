import { describe, expect, it, vi } from "vitest";
import { CANONICAL_V1_VERSION } from "../../src/domain/client.js";
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
      { slug: "acorn", supports: ["normalise"], canonical_version: CANONICAL_V1_VERSION },
      { slug: "beacon", supports: ["normalise"], canonical_version: CANONICAL_V1_VERSION },
      {
        slug: "cosper",
        supports: ["build-request"],
        canonical_version: CANONICAL_V1_VERSION,
      },
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
  it("accepts an otherwise valid legacy v1 client and supplies its version before building", async () => {
    const { schema_version: _version, ...legacyClient } = expectedAcorn();
    const buildRequest = vi.fn((client) => ({
      request: { schemaVersionReceived: client.schema_version },
      response: { status: "created" as const, clientRef: client.id, simulated: true as const },
    }));
    const response = await createApp({
      registry: createRegistry([{ slug: "legacy", buildRequest }]),
    }).request("/v1/legacy/clients/build-request", json(legacyClient));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      request: { schemaVersionReceived: CANONICAL_V1_VERSION },
      response: { status: "created", clientRef: "90210", simulated: true },
    });
    expect(buildRequest).toHaveBeenCalledWith(expect.objectContaining({ schema_version: "v1" }));
  });
});

describe("API documentation contracts", () => {
  it("generates a safe OpenAPI contract for every public integration route", async () => {
    const response = await createApp().request("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f\d-]{36}$/u);

    const document = (await response.json()) as {
      components: { schemas: Record<string, unknown> };
      info: { title: string; version: string };
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document).toMatchObject({
      openapi: "3.0.0",
      info: { title: "ZeroKey client integrations", version: "0.1.0" },
      paths: {
        "/v1/providers": {
          get: { responses: { 200: expect.any(Object), 500: expect.any(Object) } },
        },
        "/v1/{provider}/clients/normalise": {
          post: {
            responses: {
              200: expect.any(Object),
              400: expect.any(Object),
              404: expect.any(Object),
              413: expect.any(Object),
              415: expect.any(Object),
              422: expect.any(Object),
              500: expect.any(Object),
            },
          },
        },
        "/v1/{provider}/clients/build-request": {
          post: {
            responses: {
              200: expect.any(Object),
              400: expect.any(Object),
              404: expect.any(Object),
              413: expect.any(Object),
              415: expect.any(Object),
              422: expect.any(Object),
              500: expect.any(Object),
            },
          },
        },
      },
    });
    expect(document.components.schemas).toMatchObject({
      AcornClient: expect.any(Object),
      BeaconClient: expect.any(Object),
      CanonicalClientV1: expect.any(Object),
      CanonicalClientV1Input: expect.any(Object),
      CosperBuildResult: expect.any(Object),
      ErrorEnvelope: expect.any(Object),
      ProviderCapability: expect.any(Object),
    });
    const serialised = JSON.stringify(document);
    expect(serialised).not.toContain("QQ123456C");
    expect(serialised).not.toContain("priya.cb@example.co.uk");
    const output = document.components.schemas.CanonicalClientV1 as {
      required?: string[];
      properties?: { schema_version?: { enum?: string[] } };
    };
    const input = document.components.schemas.CanonicalClientV1Input as {
      required?: string[];
      properties?: { schema_version?: { default?: string; enum?: string[] } };
    };
    expect(output.required).toContain("schema_version");
    expect(output.properties?.schema_version?.enum).toEqual([CANONICAL_V1_VERSION]);
    expect(input.required).not.toContain("schema_version");
    expect(input.properties?.schema_version).toMatchObject({
      default: CANONICAL_V1_VERSION,
      enum: [CANONICAL_V1_VERSION],
    });
  });

  it("serves Swagger UI against the same-origin OpenAPI document", async () => {
    const response = await createApp().request("/docs");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f\d-]{36}$/u);
    const body = await response.text();
    expect(body).toContain("ZeroKey API reference");
    expect(body).toContain("url: '/openapi.json'");
  });
});

describe("HTTP client errors", () => {
  it.each(["v2", "V1", " v1 ", null, 1, true, {}, []])(
    "rejects unsupported canonical version %j before the builder runs",
    async (schema_version) => {
      const buildRequest = vi.fn(() => ({
        request: { shouldNotRun: true },
        response: { status: "created" as const, clientRef: "unexpected", simulated: true as const },
      }));
      const response = await createApp({
        registry: createRegistry([{ slug: "versioned", buildRequest }]),
      }).request(
        "/v1/versioned/clients/build-request",
        json({ ...minimalClient(), schema_version }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "validation_failed", issues: [{ path: ["schema_version"] }] },
      });
      expect(buildRequest).not.toHaveBeenCalled();
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
          resource: null,
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
