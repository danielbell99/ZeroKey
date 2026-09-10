import { z } from "@hono/zod-openapi";
import { CANONICAL_V1_VERSION, type CanonicalClient } from "../domain/client.js";

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export const OperationSchema = z.enum(["normalise", "build-request"]);
export type Operation = z.infer<typeof OperationSchema>;
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

export const ProviderCapabilitySchema = z
  .strictObject({
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/u),
    supports: z.array(OperationSchema).min(1),
    canonical_version: z.literal(CANONICAL_V1_VERSION),
  })
  .openapi("ProviderCapability");
export const ProviderCapabilitiesSchema = z.array(ProviderCapabilitySchema);

export function createRegistry(adapters: readonly ProviderAdapter[]) {
  const providers = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    if (!/^[a-z][a-z0-9-]*$/u.test(adapter.slug)) throw new Error("Invalid provider slug");
    if (providers.has(adapter.slug)) throw new Error("Duplicate provider slug");
    if (!adapter.normalise && !adapter.buildRequest) throw new Error("Provider has no operations");
    if (adapter.normalise !== undefined && typeof adapter.normalise !== "function") {
      throw new Error("Provider normalise operation must be a function");
    }
    if (adapter.buildRequest !== undefined && typeof adapter.buildRequest !== "function") {
      throw new Error("Provider build-request operation must be a function");
    }
    providers.set(adapter.slug, Object.freeze({ ...adapter }));
  }
  return Object.freeze({
    get(slug: string): ProviderAdapter | undefined {
      return providers.get(slug);
    },
    list(): Array<z.output<typeof ProviderCapabilitySchema>> {
      return [...providers.values()].map((adapter) => ({
        slug: adapter.slug,
        canonical_version: CANONICAL_V1_VERSION,
        supports: [
          ...(adapter.normalise ? ["normalise" as const] : []),
          ...(adapter.buildRequest ? ["build-request" as const] : []),
        ],
      }));
    },
  });
}
export type ProviderRegistry = ReturnType<typeof createRegistry>;
