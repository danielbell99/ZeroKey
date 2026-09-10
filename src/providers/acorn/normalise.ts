import {
  type CanonicalClient,
  CanonicalClientSchema,
  type CanonicalContactDetail,
  type LegalSex,
  type MaritalStatus,
} from "../../domain/client.js";
import { countryCode } from "../../shared/countries.js";
import {
  enumKey,
  fullName,
  hasAddressData,
  normaliseContact,
  normaliseName,
  normaliseNi,
} from "../../shared/normalisation.js";
import { parseInput } from "../../shared/validation.js";
import { AcornClientSchema } from "./schema.js";

const sexes = new Map<string, LegalSex>([
  ["male", "male"],
  ["female", "female"],
  ["unspecified", "unspecified"],
]);
const maritalStatuses = new Map<string, MaritalStatus>([
  ["single", "single"],
  ["married", "married"],
  ["civil partner", "civil-partner"],
  ["living together", "cohabiting"],
  ["engaged", "engaged"],
  ["separated", "separated"],
  ["divorced", "divorced"],
  ["widowed", "widowed"],
  ["unknown", "unknown"],
]);
const channels = new Map<string, CanonicalContactDetail["type"]>([
  ["emailaddress", "email"],
  ["mobilephone", "mobile"],
  ["landline", "telephone"],
]);

export function normaliseAcorn(input: unknown): CanonicalClient {
  const raw = parseInput(AcornClientSchema, input);
  const person = raw.person;
  const first_name = normaliseName(person?.firstName);
  const middle_names = normaliseName(person?.middleName);
  const last_name = normaliseName(person?.lastName);
  const client: CanonicalClient = {
    id: String(raw.id),
    title: normaliseName(person?.title),
    first_name,
    middle_names,
    last_name,
    full_name: fullName(first_name, middle_names, last_name),
    date_of_birth: person?.dateOfBirth ?? null,
    ni_number: normaliseNi(person?.niNumber),
    legal_sex: sexes.get(enumKey(person?.gender)) ?? null,
    marital_status: maritalStatuses.get(enumKey(person?.maritalStatus)) ?? "unknown",
    nationality: person?.nationalityCountry?.name ?? person?.nationalityCountry?.isoCode ?? null,
    addresses: raw.addresses
      .map((address) => {
        const lines = [address.buildingName, address.street, address.locality].filter(
          (part) => part !== null,
        );
        return {
          primary: address.isPrimary,
          line1: lines[0] ?? null,
          line2: lines.slice(1).join(", ") || null,
          town_city: address.town,
          county: address.region,
          postcode: address.postcode,
          country: countryCode(address.countryName),
          move_in_date: address.movedIn,
        };
      })
      .filter(hasAddressData),
    contact_details: raw.contactPoints.flatMap((contact, index) =>
      normaliseContact(
        channels.get(enumKey(contact.channel)) ?? "other",
        contact.detail,
        contact.preferred,
        ["contactPoints", index],
        "detail",
      ),
    ),
  };
  return CanonicalClientSchema.parse(client);
}
