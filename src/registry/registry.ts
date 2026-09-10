import { z } from "zod";
import type { CanonicalClient } from "../domain/client.js";

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export type Operation = "normalise" | "build-request";
export type BuildResult<TRequest extends JsonObject = JsonObject> = {
  request: TRequest;
  response: { status: "created"; clientRef: string; simulated: true };
};
export interface ProviderAdapter<TRequest extends JsonObject = JsonObject> {
  readonly slug: string;
  readonly normalise?: (raw: unknown) => CanonicalClient;
  readonly buildRequest?: (client: CanonicalClient) => BuildResult<TRequest>;
}

export const BuildResultSchema = z.strictObject({
  request: z.record(z.string(), z.json()),
  response: z.strictObject({
    status: z.literal("created"),
    clientRef: z.string().trim().min(1),
    simulated: z.literal(true),
  }),
});

export function createRegistry(adapters: readonly ProviderAdapter[]) {
  const providers = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    if (!/^[a-z][a-z0-9-]*$/u.test(adapter.slug)) throw new Error("Invalid provider slug");
    if (providers.has(adapter.slug)) throw new Error("Duplicate provider slug");
    if (!adapter.normalise && !adapter.buildRequest) throw new Error("Provider has no operations");
    providers.set(adapter.slug, Object.freeze({ ...adapter }));
  }
  return Object.freeze({
    get(slug: string): ProviderAdapter | undefined {
      return providers.get(slug);
    },
    list(): Array<{ slug: string; supports: Operation[] }> {
      return [...providers.values()].map((adapter) => ({
        slug: adapter.slug,
        supports: [
          ...(adapter.normalise ? ["normalise" as const] : []),
          ...(adapter.buildRequest ? ["build-request" as const] : []),
        ],
      }));
    },
  });
}
export type ProviderRegistry = ReturnType<typeof createRegistry>;
