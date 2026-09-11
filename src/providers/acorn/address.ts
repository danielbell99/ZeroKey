import {
  type CanonicalAddressResource,
  CanonicalAddressResourceSchema,
} from "../../domain/address.js";
import { CANONICAL_V1_VERSION, type CanonicalAddress } from "../../domain/client.js";
import { countryCode } from "../../shared/countries.js";
import { hasAddressData } from "../../shared/normalisation.js";
import { PayloadValidationError, parseInput } from "../../shared/validation.js";
import { type AcornAddress, AcornAddressEnvelopeSchema } from "./schema.js";

/** Pure provider mapping shared by embedded-client and standalone-address flows. */
export function mapAcornAddress(address: AcornAddress): CanonicalAddress {
  const lines = [address.buildingName, address.street, address.locality].filter(
    (part) => part !== null,
  );
  return {
    primary: address.isPrimary,
    line1: lines[0] ?? null,
    line2: lines.slice(1).join(", ") || null,
    town_city: address.town,
    county: address.region,
    postcode: address.postcode,
    country: countryCode(address.countryName),
    move_in_date: address.movedIn,
  };
}

export function normaliseAcornAddress(input: unknown): CanonicalAddressResource {
  const raw = parseInput(AcornAddressEnvelopeSchema, input);
  const address = mapAcornAddress(raw.address);
  if (!hasAddressData(address)) {
    throw new PayloadValidationError([
      { path: ["address"], code: "empty_address", message: "Address contains no usable data" },
    ]);
  }
  return CanonicalAddressResourceSchema.parse({
    schema_version: CANONICAL_V1_VERSION,
    client_id: raw.client_id,
    address,
  });
}
