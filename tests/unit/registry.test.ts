import { describe, expect, expectTypeOf, it } from "vitest";
import { CANONICAL_V1_VERSION } from "../../src/domain/client.js";
import { createRegistry, type ProviderAdapter } from "../../src/registry/registry.js";
import { minimalClient } from "../helpers/client.js";

describe("provider registry boundaries", () => {
  it("rejects duplicate, invalid and empty registrations", () => {
    const adapter = { slug: "delta", normalise: () => minimalClient() };
    expect(() => createRegistry([adapter, adapter])).toThrow("Duplicate provider slug");
    expect(() => createRegistry([{ ...adapter, slug: "../delta" }])).toThrow(
      "Invalid provider slug",
    );
    expect(() => createRegistry([{ slug: "delta" }])).toThrow("Provider has no operations");
    expect(() => createRegistry([{ slug: "delta", normalise: "not-a-function" } as never])).toThrow(
      "Provider normalise operation must be a function",
    );
    expect(() =>
      createRegistry([{ slug: "delta", buildRequest: "not-a-function" } as never]),
    ).toThrow("Provider build-request operation must be a function");
  });
  it("allows an empty registry and distinguishes missing providers", () => {
    const registry = createRegistry([]);
    expect(registry.list()).toEqual([]);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.get("__proto__")).toBeUndefined();
  });
  it("snapshots registrations and does not expose mutable listing internals", () => {
    const adapter = { slug: "delta", normalise: () => minimalClient() };
    const registry = createRegistry([adapter]);
    adapter.slug = "changed";
    const listing = registry.list();
    listing[0]?.supports.push("build-request");
    listing.push({
      slug: "invented",
      supports: [],
      canonical_version: CANONICAL_V1_VERSION,
    } as never);
    expect(registry.list()).toEqual([
      { slug: "delta", supports: ["normalise"], canonical_version: CANONICAL_V1_VERSION },
    ]);
    expect(registry.get("changed")).toBeUndefined();
    expect(Object.isFrozen(registry.get("delta"))).toBe(true);
  });
  it("preserves exact output types on concrete adapters", () => {
    const adapter = {
      slug: "delta",
      buildRequest: (client) => ({
        request: { ExternalId: client.id },
        response: { status: "created", clientRef: client.id, simulated: true },
      }),
    } satisfies ProviderAdapter<{ ExternalId: string }>;
    expectTypeOf(adapter.buildRequest(minimalClient()).request).toEqualTypeOf<{
      ExternalId: string;
    }>();
    expect(createRegistry([adapter]).list()).toEqual([
      { slug: "delta", supports: ["build-request"], canonical_version: CANONICAL_V1_VERSION },
    ]);
  });
});
