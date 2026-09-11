import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CanonicalAddressResource } from "../../src/domain/address.js";
import type { CanonicalClient } from "../../src/domain/client.js";
import { createApp } from "../../src/http/app.js";
import { defaultRegistry } from "../../src/registry/providers.js";
import {
  type BuildResult,
  createRegistry,
  type ProviderRegistry,
} from "../../src/registry/registry.js";
import { minimalClient } from "../helpers/client.js";
import {
  BODY_LIMIT,
  expectHttpError,
  jsonRequest,
  type PostEndpoint,
  PRIVATE_MARKER,
  postEndpoints,
  publicPaths,
  sizedJson,
  UUID,
} from "../helpers/http.js";

function trackedApp(endpoint: PostEndpoint) {
  const original = defaultRegistry().get(endpoint.provider);
  if (!original) throw new Error("Missing test provider");
  const normalise =
    endpoint.resource === "clients" && original.normalise ? vi.fn(original.normalise) : undefined;
  const buildRequest =
    endpoint.resource === "clients" && original.buildRequest
      ? vi.fn(original.buildRequest)
      : undefined;
  const normaliseAddress =
    endpoint.resource === "addresses" && original.normaliseAddress
      ? vi.fn(original.normaliseAddress)
      : undefined;
  const buildAddressRequest =
    endpoint.resource === "addresses" && original.buildAddressRequest
      ? vi.fn(original.buildAddressRequest)
      : undefined;
  const invoke = normalise ?? buildRequest ?? normaliseAddress ?? buildAddressRequest;
  if (!invoke) throw new Error("Missing test operation");
  const logFailure = vi.fn();
  const registry = createRegistry([
    {
      ...original,
      ...(normalise ? { normalise } : {}),
      ...(buildRequest ? { buildRequest } : {}),
      ...(normaliseAddress ? { normaliseAddress } : {}),
      ...(buildAddressRequest ? { buildAddressRequest } : {}),
    },
  ]);
  return { app: createApp({ registry, logFailure }), invoke, logFailure };
}

describe.each(postEndpoints)("transport and caller validation: $provider", (endpoint) => {
  it.each([
    { name: "absent", body: undefined },
    { name: "empty", body: "" },
    { name: "whitespace", body: " \n\t " },
    { name: "truncated", body: '{"id":' },
    { name: "trailing comma", body: '{"id":1,}' },
  ])("rejects $name JSON before invoking the adapter", async ({ body }) => {
    const test = trackedApp(endpoint);
    const response = await test.app.request(endpoint.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body }),
    });
    await expectHttpError(response, 400, "invalid_json");
    expect(test.invoke).not.toHaveBeenCalled();
    expect(test.logFailure).not.toHaveBeenCalled();
  });
  it.each([undefined, "text/plain", "application/xml"])(
    "rejects content type %s before parsing",
    async (contentType) => {
      const test = trackedApp(endpoint);
      // A byte array prevents fetch from implicitly adding a text/plain content type.
      const response = await test.app.request(endpoint.path, {
        method: "POST",
        headers: contentType ? { "Content-Type": contentType } : {},
        body: new TextEncoder().encode("{broken"),
      });
      await expectHttpError(response, 415, "unsupported_media_type");
      expect(test.invoke).not.toHaveBeenCalled();
      expect(test.logFailure).not.toHaveBeenCalled();
    },
  );
  it.each([null, [], PRIVATE_MARKER, 42, true, false, {}])(
    "rejects invalid root %j with safe issues",
    async (body) => {
      const test = trackedApp(endpoint);
      await expectHttpError(
        await test.app.request(endpoint.path, jsonRequest(body)),
        422,
        "validation_failed",
      );
      // Inbound schemas are intentionally owned by the normaliser; canonical input by HTTP.
      expect(test.invoke).toHaveBeenCalledTimes(endpoint.operation === "normalise" ? 1 : 0);
      expect(test.logFailure).not.toHaveBeenCalled();
    },
  );
  it.each(["application/json; charset=utf-8", "Application/JSON; charset=UTF-8"])(
    "accepts %s",
    async (contentType) => {
      const test = trackedApp(endpoint);
      const response = await test.app.request(endpoint.path, {
        ...jsonRequest(endpoint.body()),
        headers: { "Content-Type": contentType },
      });
      expect(response.status).toBe(200);
      expect(test.invoke).toHaveBeenCalledTimes(1);
      expect(test.logFailure).not.toHaveBeenCalled();
    },
  );
  describe.each([false, true])("accurate Content-Length supplied: %s", (declared) => {
    it.each([-1, 0, 1])("enforces 1 MiB %+i bytes including UTF-8", async (offset) => {
      const test = trackedApp(endpoint);
      const body = sizedJson(endpoint, BODY_LIMIT + offset);
      expect(Buffer.byteLength(body)).toBe(BODY_LIMIT + offset);
      expect(body.length).toBeLessThan(Buffer.byteLength(body));
      const headers = new Headers({ "Content-Type": "application/json" });
      if (declared) headers.set("Content-Length", String(Buffer.byteLength(body)));
      const response = await test.app.request(endpoint.path, { method: "POST", headers, body });
      if (offset > 0) await expectHttpError(response, 413, "payload_too_large");
      else expect(response.status).toBe(200);
      expect(test.invoke).toHaveBeenCalledTimes(offset > 0 ? 0 : 1);
      expect(test.logFailure).not.toHaveBeenCalled();
    });
  });
  it("returns a validation error then succeeds with fresh correlation state", async () => {
    const test = trackedApp(endpoint);
    const failedId = await expectHttpError(
      await test.app.request(endpoint.path, jsonRequest(null)),
      422,
      "validation_failed",
    );
    const response = await test.app.request(endpoint.path, jsonRequest(endpoint.body()));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(UUID);
    expect(response.headers.get("x-request-id")).not.toBe(failedId);
    expect(test.logFailure).not.toHaveBeenCalled();
  });
});

describe("dispatch precedes body processing", () => {
  it.each([
    { path: "/v1/missing/clients/normalise", status: 404, code: "unknown_provider" },
    { path: "/v1/missing/clients/build-request", status: 404, code: "unknown_provider" },
    { path: "/v1/missing/addresses/normalise", status: 404, code: "unknown_provider" },
    { path: "/v1/missing/addresses/build-request", status: 404, code: "unknown_provider" },
    { path: "/v1/cosper/clients/normalise", status: 400, code: "unsupported_operation" },
    { path: "/v1/acorn/clients/build-request", status: 400, code: "unsupported_operation" },
    { path: "/v1/beacon/clients/build-request", status: 400, code: "unsupported_operation" },
    { path: "/v1/cosper/addresses/normalise", status: 400, code: "unsupported_operation" },
    { path: "/v1/acorn/addresses/build-request", status: 400, code: "unsupported_operation" },
    { path: "/v1/beacon/addresses/build-request", status: 400, code: "unsupported_operation" },
  ] as const)(
    "$path preserves $code even with an unreadable body",
    async ({ path, status, code }) => {
      const logFailure = vi.fn();
      const read = vi.fn();
      const body = new ReadableStream<Uint8Array>(
        {
          pull() {
            read();
            throw new Error("Must not read body");
          },
        },
        { highWaterMark: 0 },
      );
      const request = new Request(`http://localhost${path}`, {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit);
      await expectHttpError(await createApp({ logFailure }).request(request), status, code);
      expect(read).not.toHaveBeenCalled();
      expect(logFailure).not.toHaveBeenCalled();
      await body.cancel();
    },
  );
  it.each(publicPaths)("PUT %s remains a structured 404", async (path) => {
    const logFailure = vi.fn();
    await expectHttpError(
      await createApp({ logFailure }).request(path, { method: "PUT" }),
      404,
      "not_found",
    );
    expect(logFailure).not.toHaveBeenCalled();
  });
  it("handles an unmatched route without echoing its path", async () => {
    await expectHttpError(await createApp().request(`/PRIVATE_TEST/unknown`), 404, "not_found");
  });
});

describe("provider-specific invalid fields retain useful original paths", () => {
  const cases: Array<{
    name: string;
    provider: "acorn" | "beacon";
    body: unknown;
    path: Array<string | number>;
  }> = [
    { name: "Acorn missing ID", provider: "acorn", body: { person: {} }, path: ["id"] },
    {
      name: "Acorn nested type",
      provider: "acorn",
      body: { id: 1, person: { firstName: { secret: PRIVATE_MARKER } } },
      path: ["person", "firstName"],
    },
    {
      name: "Acorn calendar date",
      provider: "acorn",
      body: { id: 1, person: { dateOfBirth: "2025-02-29" } },
      path: ["person", "dateOfBirth"],
    },
    {
      name: "Acorn contact collection",
      provider: "acorn",
      body: { id: 1, contactPoints: {} },
      path: ["contactPoints"],
    },
    {
      name: "Acorn email",
      provider: "acorn",
      body: {
        id: 1,
        contactPoints: [{ channel: "EmailAddress", detail: "PRIVATE_TEST_BAD_EMAIL" }],
      },
      path: ["contactPoints", 0, "detail"],
    },
    {
      name: "Acorn phone",
      provider: "acorn",
      body: {
        id: 1,
        contactPoints: [{ channel: "MobilePhone", detail: "PRIVATE_TEST_BAD_PHONE" }],
      },
      path: ["contactPoints", 0, "detail"],
    },
    {
      name: "Acorn nationality conflict",
      provider: "acorn",
      body: { id: 1, person: { nationalityCountry: { name: "British", isoCode: "FRA" } } },
      path: ["person", "nationalityCountry", "isoCode"],
    },
    { name: "Beacon missing ID", provider: "beacon", body: { attributes: [] }, path: ["recordId"] },
    {
      name: "Beacon malformed bag",
      provider: "beacon",
      body: { recordId: "b", attributes: {} },
      path: ["attributes"],
    },
    {
      name: "Beacon duplicate bag key",
      provider: "beacon",
      body: {
        recordId: "b",
        attributes: [
          { key: "firstname", value: "A" },
          { key: "firstname", value: "B" },
        ],
      },
      path: ["attributes", 1, "key"],
    },
    {
      name: "Beacon recognised value",
      provider: "beacon",
      body: {
        recordId: "b",
        attributes: [
          { key: "ignored", value: null },
          { key: "firstname", value: { secret: PRIVATE_MARKER } },
        ],
      },
      path: ["attributes", 1, "value"],
    },
    {
      name: "Beacon formatted value",
      provider: "beacon",
      body: { recordId: "b", formattedValues: [{ key: "gendercode", value: 73 }] },
      path: ["formattedValues", 0, "value"],
    },
    {
      name: "Beacon calendar date",
      provider: "beacon",
      body: { recordId: "b", attributes: [{ key: "birthdate", value: "31/02/2026" }] },
      path: ["attributes", 0, "value"],
    },
    {
      name: "Beacon primary flag",
      provider: "beacon",
      body: { recordId: "b", addresses: [{ primary: "PRIVATE_TEST_YES" }] },
      path: ["addresses", 0, "primary"],
    },
    {
      name: "Beacon email",
      provider: "beacon",
      body: { recordId: "b", contacts: [{ type: 1, value: "PRIVATE_TEST_BAD_EMAIL" }] },
      path: ["contacts", 0, "value"],
    },
    {
      name: "Beacon phone",
      provider: "beacon",
      body: { recordId: "b", contacts: [{ type: 2, value: "PRIVATE_TEST_BAD_PHONE" }] },
      path: ["contacts", 0, "value"],
    },
  ];
  it.each(cases)("$name", async ({ provider, body, path }) => {
    const logFailure = vi.fn();
    await expectHttpError(
      await createApp({ logFailure }).request(
        `/v1/${provider}/clients/normalise`,
        jsonRequest(body),
      ),
      422,
      "validation_failed",
      path,
    );
    expect(logFailure).not.toHaveBeenCalled();
  });
  it.each([
    { name: "Acorn minimal", provider: "acorn", body: { id: "partial" } },
    {
      name: "Acorn nulls",
      provider: "acorn",
      body: { id: "partial", person: null, addresses: null, contactPoints: null },
    },
    {
      name: "Acorn blanks",
      provider: "acorn",
      body: {
        id: "partial",
        person: { firstName: " ", lastName: "", gender: "", maritalStatus: null },
      },
    },
    {
      name: "Acorn unknown enums",
      provider: "acorn",
      body: { id: "partial", person: { gender: "PRIVATE_TEST_ENUM", maritalStatus: "Betrothed" } },
    },
    { name: "Beacon minimal", provider: "beacon", body: { recordId: "partial" } },
    {
      name: "Beacon nulls",
      provider: "beacon",
      body: {
        recordId: "partial",
        attributes: null,
        formattedValues: null,
        addresses: null,
        contacts: null,
      },
    },
    {
      name: "Beacon blanks",
      provider: "beacon",
      body: {
        recordId: "partial",
        attributes: [
          { key: "firstname", value: " " },
          { key: "lastname", value: null },
        ],
      },
    },
    {
      name: "Beacon unknown enums",
      provider: "beacon",
      body: {
        recordId: "partial",
        formattedValues: [
          { key: "gendercode", value: "PRIVATE_TEST_ENUM" },
          { key: "familystatuscode", value: "Betrothed" },
        ],
      },
    },
  ])("accepts $name with deliberate absence/defaults", async ({ provider, body }) => {
    const logFailure = vi.fn();
    const response = await createApp({ logFailure }).request(
      `/v1/${provider}/clients/normalise`,
      jsonRequest({ ...body, SECRET_TEST_KEY: PRIVATE_MARKER }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(minimalClient({ id: "partial" }));
    expect(logFailure).not.toHaveBeenCalled();
  });
});

describe("canonical build input is validated before the builder", () => {
  it.each([
    { name: "missing ID", patch: { id: undefined }, path: ["id"] },
    { name: "wrong version", patch: { schema_version: "v2" }, path: ["schema_version"] },
    { name: "enum", patch: { legal_sex: PRIVATE_MARKER }, path: ["legal_sex"] },
    { name: "date", patch: { date_of_birth: "2025-02-29" }, path: ["date_of_birth"] },
    { name: "missing nullable field", patch: { first_name: undefined }, path: ["first_name"] },
    { name: "unknown fields", patch: { SECRET_TEST_KEY: PRIVATE_MARKER }, path: [] },
    { name: "address collection", patch: { addresses: null }, path: ["addresses"] },
    {
      name: "email",
      patch: {
        contact_details: [{ type: "email", value: "PRIVATE_TEST_BAD_EMAIL", primary: true }],
      },
      path: ["contact_details", 0, "value"],
    },
    {
      name: "phone",
      patch: {
        contact_details: [{ type: "mobile", value: "PRIVATE_TEST_BAD_PHONE", primary: true }],
      },
      path: ["contact_details", 0, "value"],
    },
  ])("rejects $name", async ({ patch, path }) => {
    const test = trackedApp(postEndpoints[2]);
    await expectHttpError(
      await test.app.request(postEndpoints[2].path, jsonRequest({ ...minimalClient(), ...patch })),
      422,
      "validation_failed",
      path,
    );
    expect(test.invoke).not.toHaveBeenCalled();
    expect(test.logFailure).not.toHaveBeenCalled();
  });
  it("reports an unsupported selected country from the actual Cosper adapter", async () => {
    const test = trackedApp(postEndpoints[2]);
    const client = postEndpoints[2].body();
    const address = client.addresses[0];
    if (!address) throw new Error("Expected fixture address");
    address.country = "ES";
    await expectHttpError(
      await test.app.request(postEndpoints[2].path, jsonRequest(client)),
      422,
      "validation_failed",
      ["addresses", 0, "country"],
    );
    expect(test.invoke).toHaveBeenCalledTimes(1);
    expect(test.logFailure).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "accepts nullable canonical data (explicit version: %s)",
    async (explicit) => {
      const test = trackedApp(postEndpoints[2]);
      const { schema_version, ...legacy } = minimalClient();
      const response = await test.app.request(
        postEndpoints[2].path,
        jsonRequest(explicit ? { ...legacy, schema_version } : legacy),
      );
      expect(response.status).toBe(200);
      expect(test.invoke).toHaveBeenCalledWith(minimalClient());
      expect(await response.json()).toMatchObject({
        request: { Forename: null, Country: null, Email: null },
        response: { simulated: true },
      });
    },
  );
});

const faultStages = [
  "discovery",
  "lookup-normalise",
  "lookup-build",
  "acorn",
  "beacon",
  "cosper",
  "acorn-address",
  "beacon-address",
  "cosper-address",
] as const;
type FaultStage = (typeof faultStages)[number];

function injectedFault(stage: FaultStage, fault: () => unknown, brokenLogger = false) {
  const healthy = defaultRegistry();
  const logFailure = vi.fn(() => {
    if (brokenLogger) throw PRIVATE_MARKER;
  });
  let registry: ProviderRegistry = healthy;
  let path = "/v1/providers";
  let request: RequestInit = {};
  let provider: string | null = null;
  let operation: "normalise" | "build-request" | null = null;
  let resource: "clients" | "addresses" | null = null;
  if (stage === "discovery") {
    registry = {
      ...healthy,
      list: vi.fn(healthy.list).mockImplementationOnce(fault as ProviderRegistry["list"]),
    };
  } else {
    const addressStage = stage.endsWith("-address");
    const providerSlug = addressStage ? stage.slice(0, -"-address".length) : stage;
    const endpoint =
      postEndpoints.find(
        (entry) =>
          entry.provider === providerSlug &&
          entry.resource === (addressStage ? "addresses" : "clients"),
      ) ?? (stage === "lookup-build" ? postEndpoints[2] : postEndpoints[0]);
    path = endpoint.path;
    request = jsonRequest(endpoint.body());
    if (stage.startsWith("lookup-")) {
      registry = {
        ...healthy,
        get: vi.fn(healthy.get).mockImplementationOnce(fault as ProviderRegistry["get"]),
      };
    } else {
      const adapter = healthy.get(endpoint.provider);
      if (!adapter) throw new Error("Missing test provider");
      registry = createRegistry([
        {
          ...adapter,
          ...(endpoint.resource === "clients"
            ? endpoint.operation === "normalise"
              ? {
                  normalise: vi
                    .fn(adapter.normalise)
                    .mockImplementationOnce(fault as () => CanonicalClient),
                }
              : {
                  buildRequest: vi
                    .fn(adapter.buildRequest)
                    .mockImplementationOnce(fault as () => BuildResult),
                }
            : endpoint.operation === "normalise"
              ? {
                  normaliseAddress: vi
                    .fn(adapter.normaliseAddress)
                    .mockImplementationOnce(fault as () => CanonicalAddressResource),
                }
              : {
                  buildAddressRequest: vi
                    .fn(adapter.buildAddressRequest)
                    .mockImplementationOnce(fault as () => BuildResult),
                }),
        },
      ]);
      provider = endpoint.provider;
      operation = endpoint.operation;
      resource = endpoint.resource;
    }
  }
  return {
    app: createApp({ registry, logFailure }),
    logFailure,
    path,
    request,
    provider,
    operation,
    resource,
  };
}

describe("internal failures resolve to a safe response and recover", () => {
  const thrownValues = [
    { name: "Error", value: () => new Error(PRIVATE_MARKER) },
    {
      name: "raw Zod error",
      value: () => {
        const parsed = z.string().safeParse({ secret: PRIVATE_MARKER });
        if (parsed.success) throw new Error("Expected invalid test input");
        return parsed.error;
      },
    },
    { name: "string", value: () => PRIVATE_MARKER },
    { name: "null", value: () => null },
    { name: "undefined", value: () => undefined },
    { name: "number", value: () => 73 },
    { name: "object", value: () => ({ secret: PRIVATE_MARKER }) },
  ];
  describe.each(faultStages)("%s", (stage) => {
    it.each(thrownValues)(
      "handles thrown $name without leaking or poisoning the next request",
      async ({ value }) => {
        const test = injectedFault(stage, () => {
          throw value();
        });
        const failed = await test.app.request(test.path, test.request);
        const requestId = await expectHttpError(failed, 500, "internal_error");
        expect(test.logFailure.mock.calls).toEqual([
          [
            {
              event: "unexpected_error",
              requestId,
              provider: test.provider,
              operation: test.operation,
              resource: test.resource,
            },
          ],
        ]);
        expect(JSON.stringify(test.logFailure.mock.calls)).not.toContain(PRIVATE_MARKER);
        const recovered = await test.app.request(test.path, test.request);
        expect(recovered.status).toBe(200);
        expect(recovered.headers.get("x-request-id")).not.toBe(requestId);
        expect(test.logFailure).toHaveBeenCalledTimes(1);
      },
    );
    it("still returns its safe response when logging throws", async () => {
      const test = injectedFault(
        stage,
        () => {
          throw new Error(PRIVATE_MARKER);
        },
        true,
      );
      await expectHttpError(await test.app.request(test.path, test.request), 500, "internal_error");
      expect(test.logFailure).toHaveBeenCalledTimes(1);
    });
  });
});

describe("generated data is an internal contract, never a caller error", () => {
  const capability = { slug: "acorn", supports: ["normalise"], canonical_version: "v1" };
  it.each([
    { name: "null", output: null },
    { name: "object instead of array", output: capability },
    { name: "invalid slug", output: [{ ...capability, slug: PRIVATE_MARKER }] },
    { name: "missing version", output: [{ slug: "acorn", supports: ["normalise"] }] },
    { name: "wrong version", output: [{ ...capability, canonical_version: "v2" }] },
    { name: "empty capabilities", output: [{ ...capability, supports: [] }] },
    { name: "unknown capability", output: [{ ...capability, supports: [PRIVATE_MARKER] }] },
    { name: "unexpected field", output: [{ ...capability, SECRET_TEST_KEY: PRIVATE_MARKER }] },
  ])("discovery rejects $name", async ({ output }) => {
    const test = injectedFault("discovery", () => output);
    await expectHttpError(await test.app.request(test.path), 500, "internal_error");
    expect(test.logFailure).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(test.logFailure.mock.calls)).not.toContain(PRIVATE_MARKER);
    expect((await test.app.request(test.path)).status).toBe(200);
  });
  describe.each(["acorn", "beacon"] as const)("%s canonical output", (stage) => {
    it.each([
      { name: "missing version", patch: { schema_version: undefined } },
      { name: "wrong version", patch: { schema_version: "v2" } },
      { name: "empty ID", patch: { id: "" } },
      { name: "nested collection", patch: { addresses: [{ primary: PRIVATE_MARKER }] } },
    ])("rejects $name even if the log sink fails", async ({ patch }) => {
      const test = injectedFault(stage, () => ({ ...minimalClient(), ...patch }), true);
      await expectHttpError(await test.app.request(test.path, test.request), 500, "internal_error");
      expect(test.logFailure).toHaveBeenCalledTimes(1);
      expect((await test.app.request(test.path, test.request)).status).toBe(200);
    });
  });
  const result = () => ({
    request: {},
    response: { status: "created", clientRef: "example", simulated: true },
  });
  it.each([
    { name: "missing envelope", output: () => ({}) },
    {
      name: "wrong status",
      output: () => ({
        ...result(),
        response: { status: "failed", clientRef: "example", simulated: true },
      }),
    },
    {
      name: "non-simulated response",
      output: () => ({
        ...result(),
        response: { status: "created", clientRef: "example", simulated: false },
      }),
    },
    {
      name: "invalid reference",
      output: () => ({
        ...result(),
        response: { status: "created", clientRef: "", simulated: true },
      }),
    },
    ...[NaN, Infinity, undefined, 1n].map((value) => ({
      name: `non-JSON ${String(value)}`,
      output: () => ({ ...result(), request: { nested: { value } } }),
    })),
  ])("build output rejects $name", async ({ output }) => {
    const test = injectedFault("cosper", output);
    await expectHttpError(await test.app.request(test.path, test.request), 500, "internal_error");
    expect(test.logFailure).toHaveBeenCalledTimes(1);
    expect((await test.app.request(test.path, test.request)).status).toBe(200);
  });
});

describe("documentation and correlation remain independent", () => {
  it.each(["/docs", "/openapi.json"])(
    "serves %s without consulting a faulty registry",
    async (path) => {
      const fault = vi.fn(() => {
        throw PRIVATE_MARKER;
      });
      const logFailure = vi.fn();
      const app = createApp({ registry: { get: fault, list: fault }, logFailure });
      const response = await app.request(path, {
        headers: { "X-Request-Id": "caller-controlled" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toMatch(UUID);
      if (path === "/docs") {
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toContain("url: '/openapi.json'");
      } else {
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(await response.json()).toMatchObject({
          openapi: "3.0.0",
          paths: { "/v1/providers": expect.any(Object) },
        });
      }
      expect(fault).not.toHaveBeenCalled();
      expect(logFailure).not.toHaveBeenCalled();
    },
  );
  it("keeps mixed concurrent successes and failures correlated on one application", async () => {
    const logFailure = vi.fn();
    const app = createApp({
      registry: createRegistry([
        {
          slug: "acorn",
          normalise: () => {
            throw PRIVATE_MARKER;
          },
        },
        {
          slug: "cosper",
          buildRequest: () => {
            throw new Error(PRIVATE_MARKER);
          },
        },
      ]),
      logFailure,
    });
    const requests = [
      {
        path: "/v1/acorn/clients/normalise",
        init: jsonRequest({}),
        status: 500,
        provider: "acorn",
        operation: "normalise",
      },
      {
        path: "/v1/cosper/clients/build-request",
        init: jsonRequest(minimalClient()),
        status: 500,
        provider: "cosper",
        operation: "build-request",
      },
      {
        path: "/v1/missing/clients/normalise",
        init: jsonRequest({}),
        status: 404,
        provider: null,
        operation: null,
      },
      ...["/v1/providers", "/docs", "/openapi.json"].map((path) => ({
        path,
        init: {},
        status: 200,
        provider: null,
        operation: null,
      })),
    ];
    const ids = await Promise.all(
      requests.map(async (test) => {
        const init: RequestInit = test.init;
        const headers = new Headers(init.headers);
        headers.set("X-Request-Id", "caller-controlled");
        const response = await app.request(test.path, {
          ...test.init,
          headers,
        });
        expect(response.status).toBe(test.status);
        const id = response.headers.get("x-request-id");
        expect(id).toMatch(UUID);
        if (test.status !== 200)
          await expectHttpError(
            response,
            test.status,
            test.status === 500 ? "internal_error" : "unknown_provider",
          );
        if (test.status === 500)
          expect(logFailure).toHaveBeenCalledWith({
            event: "unexpected_error",
            requestId: id,
            provider: test.provider,
            operation: test.operation,
            resource: "clients",
          });
        return id;
      }),
    );
    expect(new Set(ids).size).toBe(requests.length);
    expect(logFailure).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain(PRIVATE_MARKER);
  });
});
