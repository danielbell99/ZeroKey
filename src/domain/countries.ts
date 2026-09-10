import { z } from "@hono/zod-openapi";

/**
 * Deliberately bounded exercise vocabulary. A code represents nationality in the
 * canonical model; names and demonyms are provider-only input aliases.
 */
export const CanonicalCountryCodes = ["GB", "IE", "FR", "DE", "US", "CA", "AU", "NZ"] as const;

export const CanonicalCountryCodeSchema = z.enum(CanonicalCountryCodes);
export type CanonicalCountryCode = z.infer<typeof CanonicalCountryCodeSchema>;

export const CountryCatalogue = {
  GB: { alpha3: "GBR", name: "United Kingdom", nationalities: ["British"] },
  IE: { alpha3: "IRL", name: "Ireland", nationalities: ["Irish"] },
  FR: { alpha3: "FRA", name: "France", nationalities: ["French"] },
  DE: { alpha3: "DEU", name: "Germany", nationalities: ["German"] },
  US: { alpha3: "USA", name: "United States", nationalities: ["American"] },
  CA: { alpha3: "CAN", name: "Canada", nationalities: ["Canadian"] },
  AU: { alpha3: "AUS", name: "Australia", nationalities: ["Australian"] },
  NZ: { alpha3: "NZL", name: "New Zealand", nationalities: ["New Zealander"] },
} as const satisfies Record<
  CanonicalCountryCode,
  Readonly<{ alpha3: string; name: string; nationalities: readonly string[] }>
>;
