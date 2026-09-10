import {
  CANONICAL_V1_VERSION,
  type CanonicalClient,
  CanonicalClientSchema,
  type CanonicalContactDetail,
  type LegalSex,
  type MaritalStatus,
} from "../../domain/client.js";
import { countryCode, normaliseNationality } from "../../shared/countries.js";
import {
  enumKey,
  fullName,
  hasAddressData,
  normaliseContact,
  normaliseName,
  normaliseNi,
} from "../../shared/normalisation.js";
import { parseInput } from "../../shared/validation.js";
import { AttributesSchema, BeaconClientSchema, FormattedValuesSchema, parseBag } from "./schema.js";

const sexes = new Map<string, LegalSex>([
  ["male", "male"],
  ["female", "female"],
  ["non-binary", "other"],
]);
const maritalStatuses = new Map<string, MaritalStatus>([
  ["single", "single"],
  ["married", "married"],
  ["civil partnership", "civil-partner"],
  ["cohabiting", "cohabiting"],
  ["intend to marry", "engaged"],
  ["separated", "separated"],
  ["divorced", "divorced"],
  ["widowed", "widowed"],
  ["unknown", "unknown"],
]);
const channels = new Map<number, CanonicalContactDetail["type"]>([
  [1, "email"],
  [2, "mobile"],
  [3, "telephone"],
]);

export function normaliseBeacon(input: unknown): CanonicalClient {
  const raw = parseInput(BeaconClientSchema, input);
  const attributes = parseBag(AttributesSchema, raw.attributes, "attributes");
  const formatted = parseBag(FormattedValuesSchema, raw.formattedValues, "formattedValues");
  const first_name = normaliseName(attributes.firstname);
  const middle_names = normaliseName(attributes.middlename);
  const last_name = normaliseName(attributes.lastname);
  const client: CanonicalClient = {
    schema_version: CANONICAL_V1_VERSION,
    id: raw.recordId,
    title: normaliseName(formatted.title),
    first_name,
    middle_names,
    last_name,
    full_name: fullName(first_name, middle_names, last_name),
    date_of_birth: attributes.birthdate,
    ni_number: normaliseNi(attributes.t4a_ninumber),
    legal_sex: sexes.get(enumKey(formatted.gendercode)) ?? null,
    marital_status: maritalStatuses.get(enumKey(formatted.familystatuscode)) ?? "unknown",
    nationality: normaliseNationality(attributes.t4a_nationality),
    addresses: raw.addresses
      .map((address) => {
        let line1 = address.line1;
        let line2 = address.line2;
        const comma = line1?.indexOf(",") ?? -1;
        if (line1 !== null && line2 === null && comma >= 0) {
          line2 = line1.slice(comma + 1).trim() || null;
          line1 = line1.slice(0, comma).trim() || null;
        }
        return {
          primary: address.primary,
          line1,
          line2,
          town_city: address.city,
          county: address.county,
          postcode: address.postcode,
          country: countryCode(address.country),
          move_in_date: null,
        };
      })
      .filter(hasAddressData),
    contact_details: raw.contacts.flatMap((contact, index) =>
      normaliseContact(
        contact.type == null ? "other" : (channels.get(contact.type) ?? "other"),
        contact.value,
        contact.isPrimary,
        ["contacts", index],
      ),
    ),
  };
  return CanonicalClientSchema.parse(client);
}
