import {
  type CanonicalCountryCode,
  CanonicalCountryCodes,
  CountryCatalogue,
} from "../domain/countries.js";
import { enumKey } from "./normalisation.js";

/** Bounded exercise lookup, not a claim of worldwide country coverage. */
const countryCodes = new Map<string, CanonicalCountryCode>();
const nationalityCodes = new Map<string, CanonicalCountryCode>();
for (const code of CanonicalCountryCodes) {
  const country = CountryCatalogue[code];
  for (const alias of [code, country.alpha3, country.name]) {
    countryCodes.set(enumKey(alias), code);
    nationalityCodes.set(enumKey(alias), code);
  }
  for (const nationality of country.nationalities) {
    nationalityCodes.set(enumKey(nationality), code);
  }
}

export function countryCode(value: string | null | undefined): CanonicalCountryCode | null {
  return countryCodes.get(enumKey(value)) ?? null;
}

export function countryName(code: string): string | undefined {
  return CountryCatalogue[code as CanonicalCountryCode]?.name;
}

export function normaliseNationality(
  value: string | null | undefined,
): CanonicalCountryCode | null {
  return nationalityCodes.get(enumKey(value)) ?? null;
}
