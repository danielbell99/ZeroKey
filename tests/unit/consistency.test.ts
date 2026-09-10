import { describe, expect, it } from "vitest";
import {
  type CanonicalAddress,
  type CanonicalClient,
  CanonicalClientSchema,
  type CanonicalContactDetail,
} from "../../src/domain/client.js";
import { normaliseAcorn } from "../../src/providers/acorn/normalise.js";
import { normaliseBeacon } from "../../src/providers/beacon/normalise.js";
import { deepFreeze, fixture } from "../helpers/fixtures.js";

type SharedClient = Omit<
  CanonicalClient,
  "id" | "nationality" | "addresses" | "contact_details"
> & {
  addresses: Array<Omit<CanonicalAddress, "move_in_date">>;
  contact_details: CanonicalContactDetail[];
};

function sharedClient(client: CanonicalClient): SharedClient {
  const { id: _id, nationality: _nationality, addresses, contact_details, ...shared } = client;
  return {
    ...shared,
    addresses: addresses.map(({ move_in_date: _moveInDate, ...address }) => address),
    contact_details: contact_details.filter((contact) => contact.primary),
  };
}

const expectedSharedClient = {
  title: "Mrs",
  first_name: "Priya",
  middle_names: null,
  last_name: "Chandra-Bose",
  full_name: "Priya Chandra-Bose",
  date_of_birth: "1985-07-02",
  ni_number: "QQ123456C",
  legal_sex: "female",
  marital_status: "cohabiting",
  addresses: [
    {
      primary: true,
      line1: "Flat 4",
      line2: "12 Vereker Road",
      town_city: "London",
      county: "Greater London",
      postcode: "W14 9JR",
      country: "GB",
    },
  ],
  contact_details: [
    { type: "email", value: "priya.cb@example.co.uk", primary: true },
    { type: "mobile", value: "+447700900123", primary: true },
  ],
} satisfies SharedClient;

function normaliseSampleClients() {
  const acornInput = fixture("acorn-client");
  const beaconInput = fixture("beacon-client");
  const acornOriginal = structuredClone(acornInput);
  const beaconOriginal = structuredClone(beaconInput);
  deepFreeze(acornInput);
  deepFreeze(beaconInput);
  const acorn = normaliseAcorn(acornInput);
  const beacon = normaliseBeacon(beaconInput);
  return { acorn, beacon, acornInput, beaconInput, acornOriginal, beaconOriginal };
}

describe("sample cross-provider consistency", () => {
  it("normalises both supplied payloads to the exact same shared canonical data", () => {
    const { acorn, beacon, acornInput, beaconInput, acornOriginal, beaconOriginal } =
      normaliseSampleClients();

    expect(CanonicalClientSchema.parse(acorn)).toStrictEqual(acorn);
    expect(CanonicalClientSchema.parse(beacon)).toStrictEqual(beacon);
    expect(sharedClient(acorn)).toStrictEqual(expectedSharedClient);
    expect(sharedClient(beacon)).toStrictEqual(expectedSharedClient);
    expect(sharedClient(acorn)).toStrictEqual(sharedClient(beacon));
    expect(acornInput).toStrictEqual(acornOriginal);
    expect(beaconInput).toStrictEqual(beaconOriginal);
  });

  it("retains documented differences that are not evidence of a mapping disagreement", () => {
    const { acorn, beacon } = normaliseSampleClients();

    expect(acorn.id).toBe("90210");
    expect(beacon.id).toBe("c0ffee7a-1e4b-2c9d-3e00-000000000001");
    expect(acorn.nationality).toBe("United Kingdom");
    expect(beacon.nationality).toBe("British");
    expect(acorn.addresses[0]?.move_in_date).toBe("2016-03-01");
    expect(beacon.addresses[0]?.move_in_date).toBeNull();
    expect(acorn.contact_details.filter((contact) => !contact.primary)).toStrictEqual([
      { type: "email", value: "priya@oldmail.example", primary: false },
    ]);
    expect(beacon.contact_details.filter((contact) => !contact.primary)).toStrictEqual([]);
  });
});
