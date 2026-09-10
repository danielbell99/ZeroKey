import { randomUUID } from "node:crypto";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { CanonicalClientSchema } from "../domain/client.js";
import { defaultRegistry } from "../registry/providers.js";
import {
  BuildResultSchema,
  type Operation,
  type ProviderAdapter,
  type ProviderRegistry,
} from "../registry/registry.js";
import { PayloadValidationError, parseInput, type ValidationIssue } from "../shared/validation.js";

type AppEnv = {
  Variables: {
    requestId: string;
    provider: ProviderAdapter | undefined;
    operation: Operation | undefined;
  };
};
type ErrorStatus = 400 | 404 | 413 | 415 | 422 | 500;
export interface FailureEvent {
  event: "unexpected_error";
  requestId: string;
  provider: string | null;
  operation: Operation | null;
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
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    await next();
  });

  app.onError((error, c) => {
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
      });
    } catch {
      // A broken diagnostic sink must not replace a safe response with an unhandled error.
    }
    return errorResponse(c, 500, "internal_error", "An unexpected error occurred");
  });
  app.notFound((c) => errorResponse(c, 404, "not_found", "Route not found"));
  app.get("/v1/providers", (c) => c.json(registry.list()));

  const resolve: (operation: Operation) => MiddlewareHandler<AppEnv> =
    (operation) => async (c, next) => {
      const provider = registry.get(c.req.param("provider") ?? "");
      if (!provider) return errorResponse(c, 404, "unknown_provider", "Provider not found");
      c.set("provider", provider);
      c.set("operation", operation);
      if (operation === "normalise" ? !provider.normalise : !provider.buildRequest) {
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
    resolve("normalise"),
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
    resolve("build-request"),
    requireJson,
    limit,
    async (c) => {
      let input: unknown;
      try {
        input = await c.req.json<unknown>();
      } catch {
        return errorResponse(c, 400, "invalid_json", "Expected a non-empty valid JSON body");
      }
      const client = parseInput(CanonicalClientSchema, input);
      const build = c.get("provider")?.buildRequest;
      if (!build) throw new Error("Registry operation invariant failed");
      return c.json(BuildResultSchema.parse(build(client)));
    },
  );
  return app;
}
