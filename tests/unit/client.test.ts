import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CANONICAL_V1_VERSION,
  CanonicalAddressSchema,
  type CanonicalClient,
  CanonicalClientInputSchema,
  CanonicalClientSchema,
  CanonicalContactDetailSchema,
  IsoDateSchema,
  LegalSexSchema,
  MaritalStatusSchema,
} from "../../src/domain/client.js";
import { CanonicalCountryCodeSchema } from "../../src/domain/countries.js";
import { minimalClient } from "../helpers/client.js";

describe("canonical contract", () => {
  it("accepts a minimal explicit nullable client and preserves its shape", () => {
    expect(CanonicalClientSchema.parse(minimalClient())).toEqual(minimalClient());
    expectTypeOf<CanonicalClient["legal_sex"]>().toEqualTypeOf<
      "male" | "female" | "other" | "unspecified" | null
    >();
    expectTypeOf<CanonicalClient["marital_status"]>()
      .exclude<undefined | null>()
      .toEqualTypeOf<CanonicalClient["marital_status"]>();
    expectTypeOf<CanonicalClient["nationality"]>().toEqualTypeOf<
      "GB" | "IE" | "FR" | "DE" | "US" | "CA" | "AU" | "NZ" | null
    >();
    expectTypeOf<CanonicalClient["schema_version"]>().toEqualTypeOf<"v1">();
  });

  it("defaults omitted marital status but does not accept null", () => {
    const { marital_status: _status, ...input } = minimalClient();
    expect(CanonicalClientSchema.parse(input).marital_status).toBe("unknown");
    expect(CanonicalClientSchema.safeParse({ ...input, marital_status: null }).success).toBe(false);
  });

  it("requires explicit v1 on generated output but accepts an untagged legacy v1 input", () => {
    const { schema_version: _version, ...legacy } = minimalClient();
    expect(CanonicalClientSchema.safeParse(legacy).success).toBe(false);
    expect(CanonicalClientInputSchema.parse(legacy)).toEqual(minimalClient());
    expect(CanonicalClientInputSchema.parse(minimalClient())).toEqual(minimalClient());
    for (const invalidVersion of ["v2", "V1", " v1 ", null, 1, true, {}, []]) {
      expect(
        CanonicalClientInputSchema.safeParse({ ...minimalClient(), schema_version: invalidVersion })
          .success,
      ).toBe(false);
    }
    expect(CanonicalClientSchema.parse(minimalClient()).schema_version).toBe(CANONICAL_V1_VERSION);
  });

  it.each(["id", "first_name", "nationality", "addresses", "contact_details"])(
    "requires %s",
    (field) => {
      const input: Record<string, unknown> = { ...minimalClient() };
      delete input[field];
      expect(CanonicalClientSchema.safeParse(input).success).toBe(false);
    },
  );

  it.each([
    { id: " " },
    { id: 1 },
    { first_name: "" },
    { legal_sex: "Female" },
    { marital_status: "Betrothed" },
    { ni_number: "qq123456c" },
    { ni_number: "QQ 123456C" },
    { nationality: "British" },
    { nationality: "gb" },
    { nationality: "GBR" },
    { nationality: "ES" },
    { addresses: null },
    { contact_details: "" },
    { unexpected: "ignored?" },
  ])("rejects invalid canonical values: %j", (changes) => {
    expect(CanonicalClientSchema.safeParse({ ...minimalClient(), ...changes }).success).toBe(false);
  });

  it("accepts all contracted enum values and a fictional NI number", () => {
    for (const legal_sex of LegalSexSchema.options) {
      for (const marital_status of MaritalStatusSchema.options) {
        expect(
          CanonicalClientSchema.safeParse(
            minimalClient({ legal_sex, marital_status, ni_number: "QQ123456C" }),
          ).success,
        ).toBe(true);
      }
    }
  });

  it("accepts every canonical nationality", () => {
    for (const nationality of CanonicalCountryCodeSchema.options) {
      expect(CanonicalClientSchema.safeParse(minimalClient({ nationality })).success).toBe(true);
    }
  });
});

describe("calendar dates", () => {
  it.each(["1985-07-02", "2000-02-29", "2024-02-29", "0001-01-01", "9999-12-31"])(
    "accepts %s",
    (value) => expect(IsoDateSchema.safeParse(value).success).toBe(true),
  );
  it.each([
    "1900-02-29",
    "2025-02-29",
    "2024-04-31",
    "0000-01-01",
    "2024-13-01",
    "2024-00-01",
    "2024-01-00",
    "02/07/1985",
    "1985-7-2",
    "1985-07-02T00:00:00Z",
  ])("rejects %s", (value) => expect(IsoDateSchema.safeParse(value).success).toBe(false));
});

describe("nested contract", () => {
  const address = {
    primary: false,
    line1: null,
    line2: null,
    town_city: null,
    county: null,
    postcode: null,
    country: "GB",
    move_in_date: null,
  };
  it("accepts explicit nullable address fields", () => {
    expect(CanonicalAddressSchema.parse(address)).toEqual(address);
  });
  it.each([{ primary: "false" }, { country: "GBR" }, { country: "gb" }, { extra: true }])(
    "rejects invalid addresses: %j",
    (changes) => {
      expect(CanonicalAddressSchema.safeParse({ ...address, ...changes }).success).toBe(false);
    },
  );
  it.each([
    ["email", "priya.cb@example.co.uk", true],
    ["mobile", "+447700900123", true],
    ["telephone", "+442079460000", true],
    ["other", "contact reference", true],
    ["email", "not-email", false],
    ["mobile", "07700900123", false],
    ["telephone", "", false],
    ["unknown", "value", false],
  ])("validates %s format %s", (type, value, success) => {
    expect(CanonicalContactDetailSchema.safeParse({ type, value, primary: false }).success).toBe(
      success,
    );
  });
});
