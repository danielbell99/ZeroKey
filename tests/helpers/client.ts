import type { CanonicalClient } from "../../src/domain/client.js";

/** Independent input builder; deliberately does not call production normalisation. */
export function minimalClient(overrides: Partial<CanonicalClient> = {}): CanonicalClient {
  return {
    id: "client-1",
    title: null,
    first_name: null,
    middle_names: null,
    last_name: null,
    full_name: null,
    date_of_birth: null,
    ni_number: null,
    legal_sex: null,
    marital_status: "unknown",
    nationality: null,
    addresses: [],
    contact_details: [],
    ...overrides,
  };
}
