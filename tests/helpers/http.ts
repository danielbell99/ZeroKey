import { expect } from "vitest";
import { expectedAcorn, fixture } from "./fixtures.js";

export const BODY_LIMIT = 1024 * 1024;
export const PRIVATE_MARKER = "PRIVATE_TEST_VALUE_739@example.invalid";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const postEndpoints = [
  {
    provider: "acorn",
    operation: "normalise",
    path: "/v1/acorn/clients/normalise",
    body: () => fixture("acorn-client"),
  },
  {
    provider: "beacon",
    operation: "normalise",
    path: "/v1/beacon/clients/normalise",
    body: () => fixture("beacon-client"),
  },
  {
    provider: "cosper",
    operation: "build-request",
    path: "/v1/cosper/clients/build-request",
    body: () => expectedAcorn(),
  },
] as const;
export type PostEndpoint = (typeof postEndpoints)[number];

export const publicPaths = [
  "/v1/providers",
  ...postEndpoints.map(({ path }) => path),
  "/openapi.json",
  "/docs",
] as const;

export function jsonRequest(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

/** Valid JSON padded to a precise UTF-8 byte count, without changing its parsed fields. */
export function sizedJson(endpoint: PostEndpoint, bytes: number): string {
  const idField = endpoint.provider === "beacon" ? "recordId" : "id";
  const base = JSON.stringify({ ...(endpoint.body() as object), [idField]: "client-é-東京" });
  const remaining = bytes - Buffer.byteLength(base);
  if (remaining < 0) throw new Error("Requested body size is below fixture size");
  return base + " ".repeat(remaining);
}

const errorMessages = {
  unknown_provider: "Provider not found",
  not_found: "Route not found",
  unsupported_operation: "Provider does not support this operation",
  invalid_json: "Expected a non-empty valid JSON body",
  payload_too_large: "JSON body exceeds 1 MiB",
  unsupported_media_type: "Content-Type must be application/json",
  validation_failed: "Payload validation failed",
  internal_error: "An unexpected error occurred",
} as const;
type ErrorCode = keyof typeof errorMessages;

/** Independent assertions: do not validate an error using the production error schema. */
export async function expectHttpError(
  response: Response,
  status: number,
  code: ErrorCode,
  issuePath?: Array<string | number>,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  const requestId = response.headers.get("x-request-id");
  expect(requestId).toMatch(UUID);
  expect(requestId).not.toBe("caller-controlled");
  const text = await response.text();
  expect(text).not.toMatch(/PRIVATE_TEST|SECRET_TEST_KEY|stack|ZodError/u);
  const body = JSON.parse(text);
  expect(body).toEqual({
    error: {
      code,
      message: errorMessages[code],
      requestId,
      ...(code === "validation_failed" ? { issues: expect.any(Array) } : {}),
    },
  });
  if (code === "validation_failed") {
    expect(body.error.issues.length).toBeGreaterThan(0);
    for (const issue of body.error.issues) {
      expect(issue).toEqual({
        path: expect.any(Array),
        code: expect.any(String),
        message: expect.any(String),
      });
      expect(issue.code.length).toBeGreaterThan(0);
      expect(issue.message.length).toBeGreaterThan(0);
      for (const part of issue.path) {
        expect(typeof part === "string" || Number.isInteger(part)).toBe(true);
      }
    }
    if (issuePath) {
      expect(body.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: issuePath })]),
      );
    }
  }
  return requestId;
}
