import { describe, expect, it } from "vitest";
import { normaliseAcorn } from "../../src/providers/acorn/normalise.js";
import { normaliseBeacon } from "../../src/providers/beacon/normalise.js";
import { PayloadValidationError } from "../../src/shared/validation.js";
import { minimalClient } from "../helpers/client.js";
import { deepFreeze, expectedAcorn, expectedBeacon, fixture } from "../helpers/fixtures.js";

describe("unchanged source fixtures", () => {
  it("normalises Acorn exactly and preserves its secondary email and move-in date", () => {
    const input = fixture("acorn-client");
    const original = structuredClone(input);
    deepFreeze(input);
    expect(normaliseAcorn(input)).toEqual(expectedAcorn());
    expect(input).toEqual(original);
  });
  it("normalises Beacon exactly without inventing missing Acorn-only information", () => {
    const input = fixture("beacon-client");
    const original = structuredClone(input);
    deepFreeze(input);
    expect(normaliseBeacon(input)).toEqual(expectedBeacon());
    expect(input).toEqual(original);
  });
});

describe("all brief enum labels", () => {
  it.each([
    ["Single", "single"],
    ["Married", "married"],
    ["Civil Partner", "civil-partner"],
    ["Living Together", "cohabiting"],
    ["Engaged", "engaged"],
    ["Separated", "separated"],
    ["Divorced", "divorced"],
    ["Widowed", "widowed"],
    ["Unknown", "unknown"],
    ["Betrothed", "unknown"],
    ["__proto__", "unknown"],
    ["  LIVING   TOGETHER  ", "cohabiting"],
  ])("Acorn marital %s maps to %s", (maritalStatus, expected) => {
    expect(normaliseAcorn({ id: 1, person: { maritalStatus } }).marital_status).toBe(expected);
  });
  it.each([
    ["Single", "single"],
    ["Married", "married"],
    ["Civil Partnership", "civil-partner"],
    ["Cohabiting", "cohabiting"],
    ["Intend to Marry", "engaged"],
    ["Separated", "separated"],
    ["Divorced", "divorced"],
    ["Widowed", "widowed"],
    ["Unknown", "unknown"],
    ["Betrothed", "unknown"],
    ["constructor", "unknown"],
  ])("Beacon marital %s maps to %s", (value, expected) => {
    expect(
      normaliseBeacon({ recordId: "b", formattedValues: [{ key: "familystatuscode", value }] })
        .marital_status,
    ).toBe(expected);
  });
  it.each([
    ["Male", "male"],
    ["Female", "female"],
    ["Unspecified", "unspecified"],
    ["unexpected", null],
  ])("Acorn gender %s maps to %s", (gender, expected) => {
    expect(normaliseAcorn({ id: 1, person: { gender } }).legal_sex).toBe(expected);
  });
  it.each([
    ["Male", "male"],
    ["Female", "female"],
    ["Non-Binary", "other"],
    ["Unknown", null],
    ["unexpected", null],
  ])("Beacon gender %s maps to %s", (value, expected) => {
    expect(
      normaliseBeacon({ recordId: "b", formattedValues: [{ key: "gendercode", value }] }).legal_sex,
    ).toBe(expected);
  });
});

describe("missing, blank and invalid data", () => {
  it.each([
    {},
    { person: null },
    { person: {} },
    {
      person: { firstName: "", middleName: null, lastName: "  " },
      addresses: null,
      contactPoints: null,
    },
  ])("produces explicit absence for Acorn %j", (extra) => {
    expect(normaliseAcorn({ id: 0, ...extra })).toEqual(minimalClient({ id: "0" }));
  });
  it.each([
    {},
    { attributes: null, formattedValues: null, addresses: null, contacts: null },
    {
      attributes: [
        { key: "firstname", value: " " },
        { key: "lastname", value: null },
        { key: "middlename" },
      ],
    },
  ])("produces explicit absence for Beacon %j", (extra) => {
    expect(normaliseBeacon({ recordId: "opaque", ...extra })).toEqual(
      minimalClient({ id: "opaque" }),
    );
  });
  it("preserves opaque string IDs and normalises names without title or missing parts", () => {
    const client = normaliseAcorn({
      id: " 001 ",
      person: {
        title: "Dr",
        firstName: "  Zoë  ",
        middleName: "  Anne   Marie ",
        lastName: "O’Neil-Smith",
        niNumber: " qq\t12 34 56 c ",
      },
    });
    expect(client).toMatchObject({
      id: "001",
      full_name: "Zoë Anne Marie O’Neil-Smith",
      ni_number: "QQ123456C",
    });
  });
  it("keeps free-text nationality, including a supplied Acorn code fallback", () => {
    expect(
      normaliseAcorn({ id: 1, person: { nationalityCountry: { name: " ", isoCode: "GB" } } })
        .nationality,
    ).toBe("GB");
    expect(
      normaliseBeacon({
        recordId: "b",
        attributes: [{ key: "t4a_nationality", value: " British " }],
      }).nationality,
    ).toBe("British");
  });
  it.each([
    null,
    [],
    {},
    { id: "" },
    { id: -1 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { id: 1, person: "" },
    { id: 1, person: { firstName: 42 } },
    { id: 1, addresses: "" },
    { id: 1, addresses: [null] },
    { id: 1, contactPoints: [{ preferred: "false" }] },
  ])("rejects invalid Acorn input %j", (input) => {
    expect(() => normaliseAcorn(input)).toThrow(PayloadValidationError);
  });
  it.each([
    null,
    [],
    {},
    { recordId: 1 },
    { recordId: "b", attributes: {} },
    { recordId: "b", attributes: [{ key: "firstname", value: {} }] },
    { recordId: "b", addresses: [{ primary: "yes" }] },
    { recordId: "b", contacts: [{ type: "1", value: "a@example.com" }] },
  ])("rejects invalid Beacon input %j", (input) => {
    expect(() => normaliseBeacon(input)).toThrow(PayloadValidationError);
  });
  it("ignores unknown extras and bag keys without prototype assignment", () => {
    expect(
      normaliseAcorn({ id: 1, extra: { sensitive: "not copied" }, person: { arbitrary: true } }),
    ).toEqual(minimalClient({ id: "1" }));
    expect(
      normaliseBeacon({
        recordId: "b",
        attributes: [
          { key: "__proto__", value: { malicious: true } },
          { key: "new-provider-field", value: [1] },
        ],
      }),
    ).toEqual(minimalClient({ id: "b" }));
  });
  it.each(["attributes", "formattedValues"])(
    "rejects duplicate recognised %s entries with source paths",
    (bag) => {
      const key = bag === "attributes" ? "firstname" : "title";
      try {
        normaliseBeacon({
          recordId: "b",
          [bag]: [
            { key, value: "A" },
            { key, value: "A" },
          ],
        });
        expect.fail("Expected duplicate-key validation");
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadValidationError);
        if (error instanceof PayloadValidationError)
          expect(error.issues).toEqual([
            { path: [bag, 1, "key"], code: "duplicate_key", message: "Duplicate recognised key" },
          ]);
      }
    },
  );
});

describe("dates", () => {
  it.each([
    ["29/02/2024", "2024-02-29"],
    ["02/07/1985", "1985-07-02"],
    ["", null],
    [null, null],
  ])("converts Beacon %s to %s", (value, expected) => {
    expect(
      normaliseBeacon({ recordId: "b", attributes: [{ key: "birthdate", value }] }).date_of_birth,
    ).toBe(expected);
  });
  it.each(["29/02/2025", "31/04/2024", "2024-02-29", "1/2/2000", "00/12/2000", "01/01/0000"])(
    "rejects Beacon date %s with original path",
    (value) => {
      try {
        normaliseBeacon({ recordId: "b", attributes: [{ key: "birthdate", value }] });
        expect.fail("Expected a date validation error");
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadValidationError);
        if (error instanceof PayloadValidationError)
          expect(error.issues[0]?.path).toEqual(["attributes", 0, "value"]);
      }
    },
  );
  it.each(["2025-02-29", "02/07/1985", "2024-01-01T00:00:00Z"])(
    "rejects Acorn date %s",
    (dateOfBirth) => {
      expect(() => normaliseAcorn({ id: 1, person: { dateOfBirth } })).toThrow(
        PayloadValidationError,
      );
    },
  );
});

describe("addresses", () => {
  it("preserves all Acorn components without manufacturing blank lines", () => {
    expect(
      normaliseAcorn({
        id: 1,
        addresses: [
          { street: "12 Road", locality: "Village", region: "County", movedIn: "2000-01-01" },
          {},
          { isPrimary: true },
        ],
      }).addresses,
    ).toEqual([
      {
        primary: false,
        line1: "12 Road",
        line2: "Village",
        town_city: null,
        county: "County",
        postcode: null,
        country: null,
        move_in_date: "2000-01-01",
      },
    ]);
  });
  it("splits Beacon only when line2 is absent, preserving remaining commas and false flags", () => {
    const addresses = normaliseBeacon({
      recordId: "b",
      addresses: [
        { line1: "Flat 4, 12 Road, Village", primary: "false" },
        { line1: "Flat 4, 12 Road", line2: "Village", primary: true },
        { line1: "12 Road", primary: null },
        {},
      ],
    }).addresses;
    expect(addresses).toHaveLength(3);
    expect(addresses[0]).toMatchObject({
      line1: "Flat 4",
      line2: "12 Road, Village",
      primary: false,
    });
    expect(addresses[1]).toMatchObject({
      line1: "Flat 4, 12 Road",
      line2: "Village",
      primary: true,
    });
    expect(addresses[2]).toMatchObject({ line1: "12 Road", line2: null, primary: false });
  });
  it.each([
    ["GBR", "GB"],
    [" irl ", "IE"],
    ["France", "FR"],
    ["DEU", "DE"],
    ["US", "US"],
    ["Canada", "CA"],
    ["AUS", "AU"],
    ["NZL", "NZ"],
    ["Atlantis", null],
  ])("normalises bounded country %s", (country, expected) => {
    expect(
      normaliseBeacon({ recordId: "b", addresses: [{ line1: "Road", country }] }).addresses[0]
        ?.country,
    ).toBe(expected);
  });
});

describe("contacts", () => {
  it.each([
    ["EmailAddress", "a@example.com", "email", "a@example.com"],
    ["MobilePhone", "07700900123", "mobile", "+447700900123"],
    ["Landline", "0044 (20) 7946-0000", "telephone", "+442079460000"],
    ["Fax", "reference", "other", "reference"],
    ["__proto__", "reference", "other", "reference"],
  ])("maps Acorn %s", (channel, detail, type, value) => {
    expect(normaliseAcorn({ id: 1, contactPoints: [{ channel, detail }] }).contact_details).toEqual(
      [{ type, value, primary: false }],
    );
  });
  it.each([
    [1, "a@example.com", "email"],
    [2, "+447700900123", "mobile"],
    [3, "+442079460000", "telephone"],
    [99, "reference", "other"],
    [null, "reference", "other"],
  ])("maps Beacon contact code %s", (type, value, expected) => {
    expect(
      normaliseBeacon({ recordId: "b", contacts: [{ type, value, isPrimary: true }] })
        .contact_details,
    ).toEqual([{ type: expected, value, primary: true }]);
  });
  it("omits blanks while preserving multiple primaries and original order", () => {
    const result = normaliseBeacon({
      recordId: "b",
      contacts: [
        { type: 1, value: " " },
        { type: 1, value: " First@example.com ", isPrimary: true },
        { type: 1, value: "second@example.com", isPrimary: true },
      ],
    });
    expect(result.contact_details).toEqual([
      { type: "email", value: "First@example.com", primary: true },
      { type: "email", value: "second@example.com", primary: true },
    ]);
  });
  it.each(["07700 letters", "12345", "++447700900123"])(
    "rejects malformed phones without silently dropping them: %s",
    (value) => {
      expect(() => normaliseBeacon({ recordId: "b", contacts: [{ type: 2, value }] })).toThrow(
        PayloadValidationError,
      );
    },
  );
  it("reports Acorn's original detail path and does not echo the rejected value", () => {
    try {
      normaliseAcorn({
        id: 1,
        contactPoints: [{ channel: "EmailAddress", detail: "SECRET_NOT_AN_EMAIL" }],
      });
      expect.fail("Expected invalid contact");
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadValidationError);
      if (error instanceof PayloadValidationError) {
        expect(error.issues[0]?.path).toEqual(["contactPoints", 0, "detail"]);
        expect(JSON.stringify(error.issues)).not.toContain("SECRET");
      }
    }
  });
});
