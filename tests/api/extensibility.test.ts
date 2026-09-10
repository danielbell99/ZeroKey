import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/http/app.js";
import { defaultRegistry } from "../../src/registry/providers.js";
import { createRegistry, type ProviderAdapter } from "../../src/registry/registry.js";
import { parseInput } from "../../src/shared/validation.js";
import { minimalClient } from "../helpers/client.js";

const DeltaInput = z.object({ externalId: z.string().min(1), givenName: z.string().min(1) });
const delta = {
  slug: "delta",
  normalise: (raw: unknown) => {
    const input = parseInput(DeltaInput, raw);
    return minimalClient({
      id: input.externalId,
      first_name: input.givenName,
      full_name: input.givenName,
    });
  },
  buildRequest: (client) => ({
    request: { ExternalId: client.id },
    response: { status: "created", clientRef: client.id, simulated: true },
  }),
} satisfies ProviderAdapter<{ ExternalId: string }>;

describe("additive fourth-provider proof", () => {
  it("adds both capabilities to the unchanged HTTP application by registration alone", async () => {
    const existing = defaultRegistry();
    const adapters = existing.list().map(({ slug }) => {
      const adapter = existing.get(slug);
      if (!adapter) throw new Error("Production registry unexpectedly missing adapter");
      return adapter;
    });
    const app = createApp({ registry: createRegistry([...adapters, delta]) });
    expect(await (await app.request("/v1/providers")).json()).toEqual([
      ...existing.list(),
      { slug: "delta", supports: ["normalise", "build-request"] },
    ]);
    const normalised = await app.request("/v1/delta/clients/normalise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: "d-1", givenName: "Priya" }),
    });
    expect(normalised.status).toBe(200);
    const canonical: unknown = await normalised.json();
    expect(canonical).toEqual(
      minimalClient({ id: "d-1", first_name: "Priya", full_name: "Priya" }),
    );
    const built = await app.request("/v1/delta/clients/build-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(canonical),
    });
    expect(built.status).toBe(200);
    expect(await built.json()).toEqual({
      request: { ExternalId: "d-1" },
      response: { status: "created", clientRef: "d-1", simulated: true },
    });
    expect(existing.get("delta")).toBeUndefined();
  });
  it("uses the same errors for a new provider's invalid input and unsupported operation", async () => {
    const app = createApp({
      registry: createRegistry([{ slug: delta.slug, normalise: delta.normalise }]),
    });
    const invalid = await app.request("/v1/delta/clients/normalise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(invalid.status).toBe(422);
    const unsupported = await app.request("/v1/delta/clients/build-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: { code: "unsupported_operation" } });
  });
});
