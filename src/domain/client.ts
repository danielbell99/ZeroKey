import { z } from "@hono/zod-openapi";
import { CanonicalCountryCodeSchema } from "./countries.js";

/** Date-only values never pass through a timezone-dependent Date constructor. */
export const IsoDateSchema = z.iso.date().refine((value) => !value.startsWith("0000-"), {
  message: "Expected a calendar date with a year from 0001 to 9999",
});

export const TextSchema = z.string().trim().min(1);
export const NullableTextSchema = TextSchema.nullable();
export const NiNumberSchema = TextSchema.refine(
  (value) => value === value.toUpperCase() && !/\s/u.test(value),
  { message: "Expected an uppercase NI number without whitespace" },
);

export const LegalSexSchema = z.enum(["male", "female", "other", "unspecified"]);
export const MaritalStatusSchema = z.enum([
  "single",
  "married",
  "civil-partner",
  "cohabiting",
  "engaged",
  "separated",
  "divorced",
  "widowed",
  "unknown",
]);

/**
 * Identifies the canonical client contract, independently of the HTTP route
 * prefix and the application release version.
 */
export const CANONICAL_V1_VERSION = "v1" as const;
export const CanonicalVersionSchema = z.literal(CANONICAL_V1_VERSION);

export const CanonicalAddressSchema = z
  .strictObject({
    primary: z.boolean(),
    line1: NullableTextSchema,
    line2: NullableTextSchema,
    town_city: NullableTextSchema,
    county: NullableTextSchema,
    postcode: NullableTextSchema,
    // Syntax only: supported country conversions are explicitly bounded by the adapters.
    country: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .nullable(),
    move_in_date: IsoDateSchema.nullable(),
  })
  .openapi("CanonicalAddress");

export const CanonicalContactDetailSchema = z
  .strictObject({
    type: z.enum(["email", "mobile", "telephone", "other"]),
    value: TextSchema,
    primary: z.boolean(),
  })
  .superRefine((contact, context) => {
    const schema =
      contact.type === "email"
        ? z.email()
        : contact.type === "mobile" || contact.type === "telephone"
          ? z.e164()
          : null;
    if (schema && !schema.safeParse(contact.value).success) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Expected a valid contact format",
      });
    }
  })
  .openapi("CanonicalContactDetail");

const CanonicalClientFields = {
  id: TextSchema,
  title: NullableTextSchema,
  first_name: NullableTextSchema,
  middle_names: NullableTextSchema,
  last_name: NullableTextSchema,
  full_name: NullableTextSchema,
  date_of_birth: IsoDateSchema.nullable(),
  // Formatting is not verification of issuance; the brief deliberately uses QQ.
  ni_number: NiNumberSchema.nullable(),
  legal_sex: LegalSexSchema.nullable(),
  marital_status: MaritalStatusSchema.default("unknown"),
  nationality: CanonicalCountryCodeSchema.nullable(),
  addresses: z.array(CanonicalAddressSchema),
  contact_details: z.array(CanonicalContactDetailSchema),
} as const;

/** Strict canonical output. Adapters must always declare the contract they produce. */
export const CanonicalClientSchema = z
  .strictObject({ ...CanonicalClientFields, schema_version: CanonicalVersionSchema })
  .openapi("CanonicalClientV1");

/**
 * Compatibility boundary for callers created before the explicit v1 field.
 * The default belongs here only: generated adapter output is validated above.
 */
export const CanonicalClientInputSchema = z
  .strictObject({
    ...CanonicalClientFields,
    schema_version: CanonicalVersionSchema.default(CANONICAL_V1_VERSION),
  })
  .openapi("CanonicalClientV1Input");

export type CanonicalClient = z.infer<typeof CanonicalClientSchema>;
export type CanonicalClientInput = z.input<typeof CanonicalClientInputSchema>;
export type CanonicalAddress = z.infer<typeof CanonicalAddressSchema>;
export type CanonicalContactDetail = z.infer<typeof CanonicalContactDetailSchema>;
export type LegalSex = z.infer<typeof LegalSexSchema>;
export type MaritalStatus = z.infer<typeof MaritalStatusSchema>;
