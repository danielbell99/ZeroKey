import { z } from "@hono/zod-openapi";
import {
  type CanonicalAddressResource,
  CanonicalAddressResourceSchema,
} from "../../domain/address.js";
import type { BuildResult } from "../../registry/registry.js";
import { countryName } from "../../shared/countries.js";
import { PayloadValidationError } from "../../shared/validation.js";

export const CosperAddressRequestSchema = z
  .strictObject({
    ClientRef: z.string().trim().min(1),
    AddressLine1: z.string().trim().min(1).nullable(),
    AddressLine2: z.string().trim().min(1).nullable(),
    Town: z.string().trim().min(1).nullable(),
    Postcode: z.string().trim().min(1).nullable(),
    Country: z.string().trim().min(1).nullable(),
  })
  .openapi("CosperAddressRequest");

export const CosperAddressBuildResultSchema = z
  .strictObject({
    request: CosperAddressRequestSchema,
    response: z.strictObject({
      status: z.literal("created"),
      clientRef: z.string().trim().min(1),
      simulated: z.literal(true),
    }),
  })
  .openapi("CosperAddressBuildResult");

export type CosperAddressRequest = z.infer<typeof CosperAddressRequestSchema>;
export type CosperAddressBuildResult = z.infer<typeof CosperAddressBuildResultSchema>;

function hasCosperAddressData(address: CanonicalAddressResource["address"]): boolean {
  return [address.line1, address.line2, address.town_city, address.postcode, address.country].some(
    (value) => value !== null,
  );
}

/**
 * Exercise-only projection of an address to the fields available in Cosper's
 * supplied client-create fixture. It is not presented as a real Cosper endpoint.
 */
export function buildCosperAddress(
  resource: CanonicalAddressResource,
): BuildResult<CosperAddressRequest> {
  const canonical = CanonicalAddressResourceSchema.parse(resource);
  if (!hasCosperAddressData(canonical.address)) {
    throw new PayloadValidationError([
      {
        path: ["address"],
        code: "unrepresentable_address",
        message: "Address has no fields representable by the destination",
      },
    ]);
  }
  let country: string | null = null;
  if (canonical.address.country !== null) {
    country = countryName(canonical.address.country) ?? null;
    if (country === null) {
      throw new PayloadValidationError([
        {
          path: ["address", "country"],
          code: "unsupported_country",
          message: "Country is not in the supported conversion lookup",
        },
      ]);
    }
  }
  return CosperAddressBuildResultSchema.parse({
    request: {
      ClientRef: canonical.client_id,
      AddressLine1: canonical.address.line1,
      AddressLine2: canonical.address.line2,
      Town: canonical.address.town_city,
      Postcode: canonical.address.postcode,
      Country: country,
    },
    response: { status: "created", clientRef: canonical.client_id, simulated: true },
  });
}
