import { describe, expect, it } from "vitest";
import { CanonicalCountryCodeSchema, CanonicalCountryCodes } from "../../src/domain/countries.js";
import { countryCode, countryName, normaliseNationality } from "../../src/shared/countries.js";

const supportedCountries = [
  { code: "GB", alpha3: "GBR", name: "United Kingdom", nationality: "British" },
  { code: "IE", alpha3: "IRL", name: "Ireland", nationality: "Irish" },
  { code: "FR", alpha3: "FRA", name: "France", nationality: "French" },
  { code: "DE", alpha3: "DEU", name: "Germany", nationality: "German" },
  { code: "US", alpha3: "USA", name: "United States", nationality: "American" },
  { code: "CA", alpha3: "CAN", name: "Canada", nationality: "Canadian" },
  { code: "AU", alpha3: "AUS", name: "Australia", nationality: "Australian" },
  { code: "NZ", alpha3: "NZL", name: "New Zealand", nationality: "New Zealander" },
] as const;

describe("bounded country and nationality lookups", () => {
  it.for(supportedCountries)(
    "maps $code country aliases and the $nationality nationality alias",
    ({ code, alpha3, name, nationality }) => {
      expect(countryCode(code)).toBe(code);
      expect(countryCode(alpha3)).toBe(code);
      expect(countryCode(name)).toBe(code);
      expect(countryName(code)).toBe(name);
      for (const alias of [code, alpha3, name, nationality]) {
        expect(normaliseNationality(alias)).toBe(code);
      }
    },
  );

  it("normalises whitespace and case only at the provider boundary", () => {
    expect(normaliseNationality("  bRiTiSh  ")).toBe("GB");
    expect(normaliseNationality("New\t\nZealander")).toBe("NZ");
    expect(CanonicalCountryCodeSchema.safeParse("GB").success).toBe(true);
    expect(CanonicalCountryCodeSchema.safeParse("gb").success).toBe(false);
    expect(CanonicalCountryCodeSchema.safeParse("British").success).toBe(false);
  });

  it.each([null, undefined, "", " ", "Spain", "British citizen"])(
    "returns null for unsupported nationality %j",
    (value) => expect(normaliseNationality(value)).toBeNull(),
  );

  it("does not treat a nationality demonym as an address-country alias", () => {
    expect(countryCode("British")).toBeNull();
  });

  it("keeps the canonical schema aligned with the bounded catalogue", () => {
    expect(CanonicalCountryCodeSchema.options).toStrictEqual(CanonicalCountryCodes);
  });
});
