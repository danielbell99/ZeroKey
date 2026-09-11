import { describe, expect, it } from "vitest";
import { CANONICAL_V1_VERSION } from "../../src/domain/client.js";
import { normaliseAcornAddress } from "../../src/providers/acorn/address.js";
import { normaliseBeaconAddress } from "../../src/providers/beacon/address.js";
import { buildCosperAddress } from "../../src/providers/cosper/address.js";
import { PayloadValidationError } from "../../src/shared/validation.js";
import { expectedAcorn, expectedBeacon, fixture } from "../helpers/fixtures.js";

function sourceAddress(name: "acorn-client" | "beacon-client") {
  const raw = fixture(name) as { addresses: unknown[] };
  return raw.addresses[0];
}

describe("standalone address resource", () => {
  it("normalises the Acorn sample with its client association and every address field", () => {
    expect(
      normaliseAcornAddress({ client_id: "90210", address: sourceAddress("acorn-client") }),
    ).toEqual({
      schema_version: CANONICAL_V1_VERSION,
      client_id: "90210",
      address: expectedAcorn().addresses[0],
    });
  });
  it("normalises Beacon's concatenated address without inventing its absent move-in date", () => {
    expect(
      normaliseBeaconAddress({ client_id: "90210", address: sourceAddress("beacon-client") }),
    ).toEqual({
      schema_version: CANONICAL_V1_VERSION,
      client_id: "90210",
      address: { ...expectedBeacon().addresses[0], primary: true },
    });
  });
  it("rejects an address containing only its primary marker", () => {
    expect(() =>
      normaliseAcornAddress({ client_id: "client-1", address: { isPrimary: true } }),
    ).toThrow(PayloadValidationError);
    try {
      normaliseBeaconAddress({ client_id: "client-1", address: { primary: "false" } });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PayloadValidationError);
      expect((error as PayloadValidationError).issues).toEqual([
        expect.objectContaining({ path: ["address"], code: "empty_address" }),
      ]);
    }
  });
  it("projects only representable fields to the exercise-only Cosper target", () => {
    const output = buildCosperAddress(
      normaliseAcornAddress({ client_id: "90210", address: sourceAddress("acorn-client") }),
    );
    expect(output).toEqual({
      request: {
        ClientRef: "90210",
        AddressLine1: "Flat 4",
        AddressLine2: "12 Vereker Road",
        Town: "London",
        Postcode: "W14 9JR",
        Country: "United Kingdom",
      },
      response: { status: "created", clientRef: "90210", simulated: true },
    });
  });
  it("does not silently project county-only data or unsupported destination countries", () => {
    expect(() =>
      buildCosperAddress({
        schema_version: "v1",
        client_id: "client-1",
        address: {
          primary: false,
          line1: null,
          line2: null,
          town_city: null,
          county: "Kent",
          postcode: null,
          country: null,
          move_in_date: null,
        },
      }),
    ).toThrow(PayloadValidationError);
    expect(() =>
      buildCosperAddress({
        schema_version: "v1",
        client_id: "client-1",
        address: {
          primary: false,
          line1: "1 Test Street",
          line2: null,
          town_city: null,
          county: null,
          postcode: null,
          country: "ES",
          move_in_date: null,
        },
      }),
    ).toThrow(PayloadValidationError);
  });
});
