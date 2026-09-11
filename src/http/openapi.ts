import { createRoute, z } from "@hono/zod-openapi";
import { CanonicalAddressResourceSchema } from "../domain/address.js";
import { CanonicalClientInputSchema, CanonicalClientSchema } from "../domain/client.js";
import { AcornAddressEnvelopeSchema, AcornClientSchema } from "../providers/acorn/schema.js";
import { BeaconAddressEnvelopeSchema, BeaconClientSchema } from "../providers/beacon/schema.js";
import { CosperAddressBuildResultSchema } from "../providers/cosper/address.js";
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
const ResourceQuerySchema = z.object({
  resource: z.enum(["clients", "addresses"]).optional().openapi({ example: "addresses" }),
});

const NormaliseInputSchema = z.union([AcornClientSchema, BeaconClientSchema]);

const CanonicalClientExample = {
  schema_version: "v1",
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
  request: { query: ResourceQuerySchema },
  responses: {
    200: {
      description: "Registered provider capabilities",
      content: { "application/json": { schema: ProviderCapabilitiesSchema } },
      headers: RequestIdHeadersSchema,
    },
    500: { description: "Unexpected internal failure", ...JsonErrorResponse },
  },
});

const AddressNormaliseInputSchema = z.union([
  AcornAddressEnvelopeSchema,
  BeaconAddressEnvelopeSchema,
]);

export const addressNormaliseRoute = createRoute({
  method: "post",
  path: "/v1/{provider}/addresses/normalise",
  tags: ["Addresses"],
  summary: "Normalise one provider address into the canonical address resource",
  description:
    "The supplied client_id is an opaque association, not an identity-resolution claim. The address resource always declares canonical schema_version v1.",
  request: {
    params: NormaliseProviderParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: AddressNormaliseInputSchema } },
    },
  },
  responses: {
    200: {
      description: "Canonical address resource",
      content: { "application/json": { schema: CanonicalAddressResourceSchema } },
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

export const addressBuildRequestRoute = createRoute({
  method: "post",
  path: "/v1/{provider}/addresses/build-request",
  tags: ["Addresses"],
  summary: "Build a simulated provider request for one canonical address",
  description:
    "Cosper's address projection is an exercise extension derived only from fields in the supplied client-create fixture; no external request is made.",
  request: {
    params: BuildProviderParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: CanonicalAddressResourceSchema } },
    },
  },
  responses: {
    200: {
      description: "Generated provider request and simulated response",
      content: { "application/json": { schema: CosperAddressBuildResultSchema } },
      headers: RequestIdHeadersSchema,
    },
    400: { description: "Unsupported operation or malformed JSON", ...JsonErrorResponse },
    404: { description: "Unknown provider", ...JsonErrorResponse },
    413: { description: "JSON body exceeds 1 MiB", ...JsonErrorResponse },
    415: { description: "Content-Type is not application/json", ...JsonErrorResponse },
    422: { description: "Canonical address is invalid or unrepresentable", ...JsonErrorResponse },
    500: { description: "Unexpected internal failure", ...JsonErrorResponse },
  },
});

export const normaliseRoute = createRoute({
  method: "post",
  path: "/v1/{provider}/clients/normalise",
  tags: ["Clients"],
  summary: "Normalise a provider client into the canonical model",
  description:
    "The provider slug is resolved from the runtime registry. Successful responses explicitly declare canonical schema_version v1. The examples cover the current Acorn and Beacon adapters; GET /v1/providers is the authoritative capability list.",
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
    "The provider slug is resolved from the runtime registry. Cosper is the current build-request provider; GET /v1/providers is the authoritative capability list. Canonical v1 is the current contract; schema_version may be omitted only for compatibility with legacy v1 callers.",
  request: {
    params: BuildProviderParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CanonicalClientInputSchema,
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
