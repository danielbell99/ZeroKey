import { describe, expect, it } from "vitest";
import type {
  CanonicalAddress,
  CanonicalContactDetail,
  LegalSex,
  MaritalStatus,
} from "../../src/domain/client.js";
import { normaliseAcorn } from "../../src/providers/acorn/normalise.js";
import { buildCosper, buildCosperRequest } from "../../src/providers/cosper/build-request.js";
import { CosperRequestSchema } from "../../src/providers/cosper/schema.js";
import { PayloadValidationError } from "../../src/shared/validation.js";
import { minimalClient } from "../helpers/client.js";
import { deepFreeze, expectedAcorn, fixture } from "../helpers/fixtures.js";

function address(changes: Partial<CanonicalAddress> = {}): CanonicalAddress {
  return {
    primary: false,
    line1: null,
    line2: null,
    town_city: null,
    county: null,
    postcode: null,
    country: null,
    move_in_date: null,
    ...changes,
  };
}
function contact(
  type: CanonicalContactDetail["type"],
  value: string,
  primary = false,
): CanonicalContactDetail {
  return { type, value, primary };
}

describe("Cosper target contract", () => {
  it("matches the exact PDF target from an independent canonical input without mutation", () => {
    const input = expectedAcorn();
    const original = structuredClone(input);
    deepFreeze(input);
    expect(buildCosperRequest(input)).toEqual(fixture("cosper-client-request"));
    expect(input).toEqual(original);
  });
  it("also builds the exact PDF target from the Acorn adapter", () => {
    expect(buildCosperRequest(normaliseAcorn(fixture("acorn-client")))).toEqual(
      fixture("cosper-client-request"),
    );
  });
  it("returns an explicit deterministic simulation, with no real created record claimed", () => {
    expect(buildCosper(expectedAcorn())).toEqual({
      request: fixture("cosper-client-request"),
      response: { status: "created", clientRef: "90210", simulated: true },
    });
  });
  it("represents unavailable optional fields as null, including no usable contact or address", () => {
    expect(buildCosperRequest(minimalClient())).toEqual({
      ClientRef: "client-1",
      Forename: null,
      Surname: null,
      DateOfBirth: null,
      Sex: 2,
      MaritalStatus: 0,
      AddressLine1: null,
      AddressLine2: null,
      Town: null,
      Postcode: null,
      Country: null,
      Email: null,
      Telephone: null,
    });
  });
  it.each<[LegalSex | null, number]>([
    ["male", 0],
    ["female", 1],
    ["other", 2],
    ["unspecified", 2],
    [null, 2],
  ])("maps legal sex %s to %s", (legal_sex, code) => {
    expect(buildCosperRequest(minimalClient({ legal_sex })).Sex).toBe(code);
  });
  it.each<[MaritalStatus, number]>([
    ["unknown", 0],
    ["single", 1],
    ["married", 2],
    ["cohabiting", 3],
    ["civil-partner", 4],
    ["separated", 5],
    ["divorced", 6],
    ["widowed", 7],
    ["engaged", 0],
  ])("maps marital status %s to %s", (marital_status, code) => {
    expect(buildCosperRequest(minimalClient({ marital_status })).MaritalStatus).toBe(code);
  });
  it("formats a leap day without changing its calendar date", () => {
    expect(buildCosperRequest(minimalClient({ date_of_birth: "2024-02-29" })).DateOfBirth).toBe(
      "29/02/2024",
    );
  });
  it.each([
    { Sex: 3 },
    { MaritalStatus: 8 },
    { DateOfBirth: "29/02/2025" },
    { DateOfBirth: "" },
    { extra: true },
    { Telephone: "bad" },
  ])("rejects malformed generated request fields %j", (changes) => {
    const request = buildCosperRequest(minimalClient());
    expect(CosperRequestSchema.safeParse({ ...request, ...changes }).success).toBe(false);
  });
});

describe("Cosper stable selection and loss policy", () => {
  it("selects first usable primary address, then first usable address without mutating order", () => {
    const addresses = [
      address({ primary: true, county: "Unrepresentable alone" }),
      address({ line1: "Fallback" }),
      address({ primary: true, line1: "Primary" }),
      address({ primary: true, line1: "Later" }),
    ];
    expect(buildCosperRequest(minimalClient({ addresses })).AddressLine1).toBe("Primary");
    expect(
      buildCosperRequest(minimalClient({ addresses: addresses.slice(0, 2) })).AddressLine1,
    ).toBe("Fallback");
    expect(
      buildCosperRequest(minimalClient({ addresses: [address({ county: "Only county" })] }))
        .AddressLine1,
    ).toBeNull();
  });
  it.each([
    ["GB", "United Kingdom"],
    ["IE", "Ireland"],
    ["FR", "France"],
    ["DE", "Germany"],
    ["US", "United States"],
    ["CA", "Canada"],
    ["AU", "Australia"],
    ["NZ", "New Zealand"],
  ])("expands country %s", (country, name) => {
    expect(buildCosperRequest(minimalClient({ addresses: [address({ country })] })).Country).toBe(
      name,
    );
  });
  it("rejects unsupported selected country with its canonical source path", () => {
    try {
      buildCosperRequest(
        minimalClient({
          addresses: [address({ line1: "Fallback" }), address({ primary: true, country: "ES" })],
        }),
      );
      expect.fail("Expected unsupported country");
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadValidationError);
      if (error instanceof PayloadValidationError)
        expect(error.issues[0]).toMatchObject({
          path: ["addresses", 1, "country"],
          code: "unsupported_country",
        });
    }
  });
  it("selects the first primary email, or first email if none are primary", () => {
    const contacts = [
      contact("other", "other@example.com", true),
      contact("email", "first@example.com"),
      contact("email", "primary@example.com", true),
      contact("email", "later@example.com", true),
    ];
    expect(buildCosperRequest(minimalClient({ contact_details: contacts })).Email).toBe(
      "primary@example.com",
    );
    expect(buildCosperRequest(minimalClient({ contact_details: contacts.slice(0, 2) })).Email).toBe(
      "first@example.com",
    );
  });
  it("primary telephone outranks non-primary mobile", () => {
    const contacts = [
      contact("mobile", "+447700900123"),
      contact("telephone", "+442079460000", true),
    ];
    expect(buildCosperRequest(minimalClient({ contact_details: contacts })).Telephone).toBe(
      "+442079460000",
    );
  });
  it("prefers mobile among primaries, and preserves original order within that type", () => {
    const contacts = [
      contact("telephone", "+442079460000", true),
      contact("mobile", "+447700900123", true),
      contact("mobile", "+447700900124", true),
    ];
    expect(buildCosperRequest(minimalClient({ contact_details: contacts })).Telephone).toBe(
      "+44 7700 900123",
    );
  });
  it("falls back to mobile, then telephone, and never guesses other contact types", () => {
    const contacts = [contact("telephone", "+442079460000"), contact("mobile", "+12025550123")];
    expect(buildCosperRequest(minimalClient({ contact_details: contacts })).Telephone).toBe(
      "+12025550123",
    );
    expect(
      buildCosperRequest(minimalClient({ contact_details: contacts.slice(0, 1) })).Telephone,
    ).toBe("+442079460000");
    expect(
      buildCosperRequest(
        minimalClient({ contact_details: [contact("other", "+447700900123", true)] }),
      ).Telephone,
    ).toBeNull();
  });
});
