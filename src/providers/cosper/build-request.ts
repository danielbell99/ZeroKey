import type {
  CanonicalAddress,
  CanonicalClient,
  CanonicalContactDetail,
  LegalSex,
  MaritalStatus,
} from "../../domain/client.js";
import { countryName } from "../../shared/countries.js";
import { PayloadValidationError } from "../../shared/validation.js";
import {
  type CosperBuildResult,
  CosperBuildResultSchema,
  type CosperRequest,
  CosperRequestSchema,
} from "./schema.js";

const sexCodes = { male: 0, female: 1, other: 2, unspecified: 2 } as const satisfies Record<
  LegalSex,
  CosperRequest["Sex"]
>;
const maritalCodes = {
  unknown: 0,
  single: 1,
  married: 2,
  cohabiting: 3,
  "civil-partner": 4,
  separated: 5,
  divorced: 6,
  widowed: 7,
  // Engagement does not establish one of Cosper's supported marital states.
  engaged: 0,
} as const satisfies Record<MaritalStatus, CosperRequest["MaritalStatus"]>;

function usableAddress(address: CanonicalAddress): boolean {
  return [address.line1, address.line2, address.town_city, address.postcode, address.country].some(
    (value) => value !== null,
  );
}

function selectPhone(contacts: CanonicalContactDetail[]): CanonicalContactDetail | undefined {
  const phones = contacts.filter(
    (contact) => contact.type === "mobile" || contact.type === "telephone",
  );
  const primaries = phones.filter((contact) => contact.primary);
  const pool = primaries.length > 0 ? primaries : phones;
  return pool.find((contact) => contact.type === "mobile") ?? pool[0];
}

export function buildCosperRequest(client: CanonicalClient): CosperRequest {
  let index = client.addresses.findIndex((address) => address.primary && usableAddress(address));
  if (index < 0) index = client.addresses.findIndex(usableAddress);
  const address = client.addresses[index];
  let country: string | null = null;
  if (address?.country) {
    const mapped = countryName(address.country);
    if (mapped === undefined) {
      throw new PayloadValidationError([
        {
          path: ["addresses", index, "country"],
          code: "unsupported_country",
          message: "Country is not in the supported conversion lookup",
        },
      ]);
    }
    country = mapped;
  }
  const email =
    client.contact_details.find((contact) => contact.type === "email" && contact.primary) ??
    client.contact_details.find((contact) => contact.type === "email");
  const phone = selectPhone(client.contact_details);
  const dob = client.date_of_birth;
  // UK mobile presentation matches the supplied target without changing its digits.
  const telephone = phone?.value.replace(/^\+44(7\d{3})(\d{6})$/u, "+44 $1 $2") ?? null;
  return CosperRequestSchema.parse({
    ClientRef: client.id,
    Forename: client.first_name,
    Surname: client.last_name,
    DateOfBirth: dob === null ? null : `${dob.slice(8, 10)}/${dob.slice(5, 7)}/${dob.slice(0, 4)}`,
    Sex: client.legal_sex === null ? 2 : sexCodes[client.legal_sex],
    MaritalStatus: maritalCodes[client.marital_status],
    AddressLine1: address?.line1 ?? null,
    AddressLine2: address?.line2 ?? null,
    Town: address?.town_city ?? null,
    Postcode: address?.postcode ?? null,
    Country: country,
    Email: email?.value ?? null,
    Telephone: telephone,
  });
}

export function buildCosper(client: CanonicalClient): CosperBuildResult {
  return CosperBuildResultSchema.parse({
    request: buildCosperRequest(client),
    response: { status: "created", clientRef: client.id, simulated: true },
  });
}
