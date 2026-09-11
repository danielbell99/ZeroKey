import {
  type CanonicalAddressResource,
  CanonicalAddressResourceSchema,
} from "../../domain/address.js";
import { CANONICAL_V1_VERSION, type CanonicalAddress } from "../../domain/client.js";
import { countryCode } from "../../shared/countries.js";
import { hasAddressData } from "../../shared/normalisation.js";
import { PayloadValidationError, parseInput } from "../../shared/validation.js";
import { type BeaconAddress, BeaconAddressEnvelopeSchema } from "./schema.js";

/** Pure provider mapping shared by embedded-client and standalone-address flows. */
export function mapBeaconAddress(address: BeaconAddress): CanonicalAddress {
  let line1 = address.line1;
  let line2 = address.line2;
  const comma = line1?.indexOf(",") ?? -1;
  if (line1 !== null && line2 === null && comma >= 0) {
    line2 = line1.slice(comma + 1).trim() || null;
    line1 = line1.slice(0, comma).trim() || null;
  }
  return {
    primary: address.primary,
    line1,
    line2,
    town_city: address.city,
    county: address.county,
    postcode: address.postcode,
    country: countryCode(address.country),
    move_in_date: null,
  };
}

export function normaliseBeaconAddress(input: unknown): CanonicalAddressResource {
  const raw = parseInput(BeaconAddressEnvelopeSchema, input);
  const address = mapBeaconAddress(raw.address);
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
