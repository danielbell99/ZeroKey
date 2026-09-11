import { describe, expect, it } from "vitest";
import { createApp } from "../../src/http/app.js";
import { CosperAddressBuildResultSchema } from "../../src/providers/cosper/address.js";
import { createRegistry } from "../../src/registry/registry.js";
import { expectedAcorn, expectedBeacon, fixture } from "../helpers/fixtures.js";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function sourceAddress(name: "acorn-client" | "beacon-client") {
  const raw = fixture(name) as { addresses: unknown[] };
  return raw.addresses[0];
}

describe("address resource HTTP contracts", () => {
  it("derives address capabilities from the registry without changing default client discovery", async () => {
    const app = createApp();
    expect(await (await app.request("/v1/providers?resource=addresses")).json()).toEqual([
      { slug: "acorn", supports: ["normalise"], canonical_version: "v1" },
      { slug: "beacon", supports: ["normalise"], canonical_version: "v1" },
      { slug: "cosper", supports: ["build-request"], canonical_version: "v1" },
    ]);
    const invalid = await app.request("/v1/providers?resource=contacts");
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: { code: "validation_failed", issues: [{ path: ["resource"] }] },
    });
  });
  it.each(["acorn", "beacon"] as const)(
    "normalises %s one address end-to-end",
    async (provider) => {
      const response = await createApp().request(
        `/v1/${provider}/addresses/normalise`,
        json({ client_id: "90210", address: sourceAddress(`${provider}-client`) }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        schema_version: "v1",
        client_id: "90210",
        address:
          provider === "acorn" ? expectedAcorn().addresses[0] : expectedBeacon().addresses[0],
      });
    },
  );
  it("builds the documented Cosper address projection", async () => {
    const response = await createApp().request(
      "/v1/cosper/addresses/build-request",
      json({ schema_version: "v1", client_id: "90210", address: expectedAcorn().addresses[0] }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      request: {
        ClientRef: "90210",
        AddressLine1: "Flat 4",
        AddressLine2: "12 Vereker Road",
        Town: "London",
        Postcode: "W14 9JR",
        Country: "United Kingdom",
      },
      response: { status: "created", clientRef: "90210", simulated: true },
    });
  });
  it("returns safe resource-specific validation errors", async () => {
    const response = await createApp().request(
      "/v1/acorn/addresses/normalise",
      json({ client_id: "client-1", address: { isPrimary: true } }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "validation_failed", issues: [{ path: ["address"], code: "empty_address" }] },
    });
  });
  it("treats a registered address builder's invalid generated result as a safe internal defect", async () => {
    const app = createApp({
      registry: createRegistry([
        {
          slug: "broken-address",
          buildAddressRequest: () => ({
            request: { ClientRef: "client-1" },
            response: { status: "created", clientRef: "client-1", simulated: true },
          }),
          addressBuildResultSchema: CosperAddressBuildResultSchema,
        },
      ]),
      logFailure: () => {},
    });
    const response = await app.request(
      "/v1/broken-address/addresses/build-request",
      json({ schema_version: "v1", client_id: "client-1", address: expectedAcorn().addresses[0] }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "internal_error" } });
  });
  it("publishes both new address routes and schemas in OpenAPI", async () => {
    const response = await createApp().request("/openapi.json");
    const document = (await response.json()) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(document.paths).toHaveProperty("/v1/{provider}/addresses/normalise");
    expect(document.paths).toHaveProperty("/v1/{provider}/addresses/build-request");
    expect(document.components.schemas).toMatchObject({
      CanonicalAddressResourceV1: expect.any(Object),
      AcornAddressEnvelope: expect.any(Object),
      BeaconAddressEnvelope: expect.any(Object),
      CosperAddressBuildResult: expect.any(Object),
    });
  });
});
