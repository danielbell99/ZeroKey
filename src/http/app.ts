import { randomUUID } from "node:crypto";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { CanonicalAddressResourceSchema } from "../domain/address.js";
import { CanonicalClientInputSchema, CanonicalClientSchema } from "../domain/client.js";
import { defaultRegistry } from "../registry/providers.js";
import {
  BuildResultSchema,
  type Operation,
  type ProviderAdapter,
  ProviderCapabilitiesSchema,
  type ProviderRegistry,
  type Resource,
  ResourceSchema,
} from "../registry/registry.js";
import { PayloadValidationError, parseInput, type ValidationIssue } from "../shared/validation.js";
import {
  addressBuildRequestRoute,
  addressNormaliseRoute,
  buildRequestRoute,
  normaliseRoute,
  OpenApiDocumentConfig,
  providersRoute,
} from "./openapi.js";

type AppEnv = {
  Variables: {
    requestId: string;
    provider: ProviderAdapter | undefined;
    operation: Operation | undefined;
    resource: Resource | undefined;
  };
};
type ErrorStatus = 400 | 404 | 413 | 415 | 422 | 500;
export interface FailureEvent {
  event: "unexpected_error";
  requestId: string;
  provider: string | null;
  operation: Operation | null;
  resource: Resource | null;
}
export interface AppOptions {
  registry?: ProviderRegistry;
  logFailure?: (event: FailureEvent) => void;
}

function errorResponse(
  c: Context<AppEnv>,
  status: ErrorStatus,
  code: string,
  message: string,
  issues?: ValidationIssue[],
) {
  return c.json(
    { error: { code, message, requestId: c.get("requestId"), ...(issues ? { issues } : {}) } },
    status,
  );
}

export function createApp(options: AppOptions = {}) {
  const registry = options.registry ?? defaultRegistry();
  const logFailure =
    options.logFailure ?? ((event: FailureEvent) => console.error(JSON.stringify(event)));
  const app = new OpenAPIHono<AppEnv>();

  const handleFailure = (error: unknown, c: Context<AppEnv>) => {
    if (error instanceof PayloadValidationError) {
      return errorResponse(c, 422, "validation_failed", "Payload validation failed", error.issues);
    }
    // No payload, client ID, exception text or stack enters operational logs.
    try {
      logFailure({
        event: "unexpected_error",
        requestId: c.get("requestId"),
        provider: c.get("provider")?.slug ?? null,
        operation: c.get("operation") ?? null,
        resource: c.get("resource") ?? null,
      });
    } catch {
      // A broken diagnostic sink must not replace a safe response with an unhandled error.
    }
    return errorResponse(c, 500, "internal_error", "An unexpected error occurred");
  };
  app.onError(handleFailure);
  app.use("*", async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    try {
      await next();
    } catch (error: unknown) {
      // Hono handles Error instances; JavaScript also permits throwing other values.
      // Those escape onError and must enter the same safe response/logging boundary.
      return handleFailure(error, c);
    }
  });
  app.notFound((c) => errorResponse(c, 404, "not_found", "Route not found"));
  // The routes retain their custom parser/error pipeline; these contracts generate the same API spec.
  app.openAPIRegistry.registerPath(providersRoute);
  app.openAPIRegistry.registerPath(normaliseRoute);
  app.openAPIRegistry.registerPath(buildRequestRoute);
  app.openAPIRegistry.registerPath(addressNormaliseRoute);
  app.openAPIRegistry.registerPath(addressBuildRequestRoute);
  app.get("/v1/providers", (c) => {
    const query = c.req.query("resource");
    const resource =
      query === undefined ? "clients" : parseInput(ResourceSchema, query, ["resource"]);
    return c.json(ProviderCapabilitiesSchema.parse(registry.list(resource)));
  });

  const resolve: (resource: Resource, operation: Operation) => MiddlewareHandler<AppEnv> =
    (resource, operation) => async (c, next) => {
      const provider = registry.get(c.req.param("provider") ?? "");
      if (!provider) return errorResponse(c, 404, "unknown_provider", "Provider not found");
      c.set("provider", provider);
      c.set("operation", operation);
      c.set("resource", resource);
      const supported =
        resource === "clients"
          ? operation === "normalise"
            ? provider.normalise
            : provider.buildRequest
          : operation === "normalise"
            ? provider.normaliseAddress
            : provider.buildAddressRequest;
      if (!supported) {
        return errorResponse(
          c,
          400,
          "unsupported_operation",
          "Provider does not support this operation",
        );
      }
      await next();
    };
  const requireJson: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return errorResponse(
        c,
        415,
        "unsupported_media_type",
        "Content-Type must be application/json",
      );
    }
    await next();
  };
  const limit = bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => errorResponse(c, 413, "payload_too_large", "JSON body exceeds 1 MiB"),
  });

  app.post(
    "/v1/:provider/clients/normalise",
    resolve("clients", "normalise"),
    requireJson,
    limit,
    async (c) => {
      let input: unknown;
      try {
        input = await c.req.json<unknown>();
      } catch {
        return errorResponse(c, 400, "invalid_json", "Expected a non-empty valid JSON body");
      }
      const normalise = c.get("provider")?.normalise;
      if (!normalise) throw new Error("Registry operation invariant failed");
      // Generated invalid data is an internal defect, never a caller-validation error.
      return c.json(CanonicalClientSchema.parse(normalise(input)));
    },
  );
  app.post(
    "/v1/:provider/clients/build-request",
    resolve("clients", "build-request"),
    requireJson,
    limit,
    async (c) => {
      let input: unknown;
      try {
        input = await c.req.json<unknown>();
      } catch {
        return errorResponse(c, 400, "invalid_json", "Expected a non-empty valid JSON body");
      }
      const client = parseInput(CanonicalClientInputSchema, input);
      const build = c.get("provider")?.buildRequest;
      if (!build) throw new Error("Registry operation invariant failed");
      const schema = c.get("provider")?.buildResultSchema ?? BuildResultSchema;
      return c.json(schema.parse(build(client)));
    },
  );
  app.post(
    "/v1/:provider/addresses/normalise",
    resolve("addresses", "normalise"),
    requireJson,
    limit,
    async (c) => {
      let input: unknown;
      try {
        input = await c.req.json<unknown>();
      } catch {
        return errorResponse(c, 400, "invalid_json", "Expected a non-empty valid JSON body");
      }
      const normalise = c.get("provider")?.normaliseAddress;
      if (!normalise) throw new Error("Registry operation invariant failed");
      return c.json(CanonicalAddressResourceSchema.parse(normalise(input)));
    },
  );
  app.post(
    "/v1/:provider/addresses/build-request",
    resolve("addresses", "build-request"),
    requireJson,
    limit,
    async (c) => {
      let input: unknown;
      try {
        input = await c.req.json<unknown>();
      } catch {
        return errorResponse(c, 400, "invalid_json", "Expected a non-empty valid JSON body");
      }
      const address = parseInput(CanonicalAddressResourceSchema, input);
      const provider = c.get("provider");
      const build = provider?.buildAddressRequest;
      const schema = provider?.addressBuildResultSchema;
      if (!build || !schema) throw new Error("Registry operation invariant failed");
      return c.json(schema.parse(build(address)));
    },
  );
  app.doc("/openapi.json", OpenApiDocumentConfig);
  app.get(
    "/docs",
    swaggerUI({
      title: "ZeroKey API reference",
      url: "/openapi.json",
      persistAuthorization: false,
    }),
  );
  return app;
}
