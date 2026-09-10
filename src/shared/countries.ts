import { enumKey } from "./normalisation.js";

/** Bounded exercise lookup, not a claim of worldwide country coverage. */
const countries = [
  ["GB", "GBR", "United Kingdom"],
  ["IE", "IRL", "Ireland"],
  ["FR", "FRA", "France"],
  ["DE", "DEU", "Germany"],
  ["US", "USA", "United States"],
  ["CA", "CAN", "Canada"],
  ["AU", "AUS", "Australia"],
  ["NZ", "NZL", "New Zealand"],
] as const;

const codes = new Map<string, string>();
const names = new Map<string, string>();
for (const [alpha2, alpha3, name] of countries) {
  for (const alias of [alpha2, alpha3, name]) codes.set(enumKey(alias), alpha2);
  names.set(alpha2, name);
}

export function countryCode(value: string | null | undefined): string | null {
  return codes.get(enumKey(value)) ?? null;
}

export function countryName(code: string): string | undefined {
  return names.get(code);
}
