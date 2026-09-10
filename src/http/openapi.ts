import { createRoute, z } from "@hono/zod-openapi";
import { CanonicalClientSchema } from "../domain/client.js";
import { AcornClientSchema } from "../providers/acorn/schema.js";
import { BeaconClientSchema } from "../providers/beacon/schema.js";
import { CosperBuildResultSchema } from "../providers/cosper/schema.js";
import { ProviderCapabilitiesSchema } from "../registry/registry.js";

const RequestIdHeadersSchema = z.object({
  "X-Request-Id": z.string().uuid(),
});

const ValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int()])),
    code: z.string(),
    message: z.string(),
  })
  .openapi("ValidationIssue");

const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "unknown_provider",
        "not_found",
        "unsupported_operation",
        "invalid_json",
        "payload_too_large",
        "unsupported_media_type",
        "validation_failed",
        "internal_error",
      ]),
      message: z.string(),
      requestId: z.string().uuid(),
      issues: z.array(ValidationIssueSchema).optional(),
    }),
  })
  .openapi("ErrorEnvelope");

const NormaliseProviderParamsSchema = z.object({
  provider: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/u)
    .openapi({
      param: { name: "provider", in: "path" },
      example: "acorn",
    }),
});

const BuildProviderParamsSchema = z.object({
  provider: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/u)
    .openapi({
      param: { name: "provider", in: "path" },
      example: "cosper",
    }),
});

const NormaliseInputSchema = z.union([AcornClientSchema, BeaconClientSchema]);

const CanonicalClientExample = {
  id: "example-client",
  title: null,
  first_name: "Example",
  middle_names: null,
  last_name: "Client",
  full_name: "Example Client",
  date_of_birth: "1990-01-01",
  ni_number: "QQ000000A",
  legal_sex: "female",
  marital_status: "married",
  nationality: "GB",
  addresses: [],
  contact_details: [],
};

const JsonErrorResponse = {
  content: { "application/json": { schema: ErrorEnvelopeSchema } },
  headers: RequestIdHeadersSchema,
} as const;

export const providersRoute = createRoute({
  method: "get",
  path: "/v1/providers",
  tags: ["Providers"],
  summary: "List registered providers and operations",
  responses: {
    200: {
      description: "Registered provider capabilities",
      content: { "application/json": { schema: ProviderCapabilitiesSchema } },
      headers: RequestIdHeadersSchema,
    },
    500: { description: "Unexpected internal failure", ...JsonErrorResponse },
  },
});

export const normaliseRoute = createRoute({
  method: "post",
  path: "/v1/{provider}/clients/normalise",
  tags: ["Clients"],
  summary: "Normalise a provider client into the canonical model",
  description:
    "The provider slug is resolved from the runtime registry. The examples cover the current Acorn and Beacon adapters; GET /v1/providers is the authoritative capability list.",
  request: {
    params: NormaliseProviderParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: NormaliseInputSchema,
          examples: {
            acorn: {
              summary: "Acorn client",
              value: { id: "example-client", person: { firstName: "Example", lastName: "Client" } },
            },
            beacon: {
              summary: "Beacon client",
              value: {
                recordId: "example-client",
                attributes: [{ key: "firstname", value: "Example" }],
              },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Canonical client",
      content: { "application/json": { schema: CanonicalClientSchema } },
      headers: RequestIdHeadersSchema,
    },
    400: { description: "Unsupported operation or malformed JSON", ...JsonErrorResponse },
    404: { description: "Unknown provider", ...JsonErrorResponse },
    413: { description: "JSON body exceeds 1 MiB", ...JsonErrorResponse },
    415: { description: "Content-Type is not application/json", ...JsonErrorResponse },
    422: { description: "Provider payload is invalid", ...JsonErrorResponse },
    500: { description: "Unexpected internal failure", ...JsonErrorResponse },
  },
});

export const buildRequestRoute = createRoute({
  method: "post",
  path: "/v1/{provider}/clients/build-request",
  tags: ["Clients"],
  summary: "Build a provider request from a canonical client",
  description:
    "The provider slug is resolved from the runtime registry. Cosper is the current build-request provider; GET /v1/providers is the authoritative capability list.",
  request: {
    params: BuildProviderParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CanonicalClientSchema,
          example: CanonicalClientExample,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Generated provider request and simulated response",
      content: { "application/json": { schema: CosperBuildResultSchema } },
      headers: RequestIdHeadersSchema,
    },
    400: { description: "Unsupported operation or malformed JSON", ...JsonErrorResponse },
    404: { description: "Unknown provider", ...JsonErrorResponse },
    413: { description: "JSON body exceeds 1 MiB", ...JsonErrorResponse },
    415: { description: "Content-Type is not application/json", ...JsonErrorResponse },
    422: { description: "Canonical client is invalid", ...JsonErrorResponse },
    500: { description: "Unexpected internal failure", ...JsonErrorResponse },
  },
});

export const OpenApiDocumentConfig = {
  openapi: "3.0.0" as const,
  info: {
    title: "ZeroKey client integrations",
    version: "0.1.0",
    description:
      "Local integration adapters that normalise Acorn or Beacon clients into a canonical model and build simulated Cosper requests.",
  },
};
