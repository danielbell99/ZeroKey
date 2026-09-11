import { z } from "@hono/zod-openapi";
import { CanonicalAddressSchema, CanonicalVersionSchema, TextSchema } from "./client.js";

/**
 * A standalone address is a value owned by an opaque provider client reference.
 * It deliberately has no fabricated address ID or persistence semantics.
 */
export const CanonicalAddressResourceSchema = z
  .strictObject({
    schema_version: CanonicalVersionSchema,
    client_id: TextSchema,
    address: CanonicalAddressSchema,
  })
  .openapi("CanonicalAddressResourceV1");

export type CanonicalAddressResource = z.infer<typeof CanonicalAddressResourceSchema>;
