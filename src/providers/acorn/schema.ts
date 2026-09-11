import { z } from "@hono/zod-openapi";
import { TextSchema } from "../../domain/client.js";
import { OptionalIsoDateSchema } from "../../shared/normalisation.js";
import {
  OptionalBooleanSchema,
  OptionalTextSchema,
  optionalArray,
} from "../../shared/validation.js";

export const AcornAddressSchema = z.object({
  isPrimary: OptionalBooleanSchema,
  buildingName: OptionalTextSchema,
  street: OptionalTextSchema,
  locality: OptionalTextSchema,
  town: OptionalTextSchema,
  region: OptionalTextSchema,
  postcode: OptionalTextSchema,
  countryName: OptionalTextSchema,
  movedIn: OptionalIsoDateSchema,
});
export type AcornAddress = z.infer<typeof AcornAddressSchema>;

export const AcornAddressEnvelopeSchema = z
  .strictObject({ client_id: TextSchema, address: AcornAddressSchema })
  .openapi("AcornAddressEnvelope");

export const AcornClientSchema = z
  .object({
    id: z.union([
      z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      z.string().trim().min(1),
    ]),
    person: z
      .object({
        title: OptionalTextSchema,
        firstName: OptionalTextSchema,
        middleName: OptionalTextSchema,
        lastName: OptionalTextSchema,
        dateOfBirth: OptionalIsoDateSchema,
        niNumber: OptionalTextSchema,
        gender: OptionalTextSchema,
        maritalStatus: OptionalTextSchema,
        nationalityCountry: z
          .object({ name: OptionalTextSchema, isoCode: OptionalTextSchema })
          .nullish(),
      })
      .nullish(),
    addresses: optionalArray(AcornAddressSchema),
    contactPoints: optionalArray(
      z.object({
        channel: OptionalTextSchema,
        detail: OptionalTextSchema,
        preferred: OptionalBooleanSchema,
      }),
    ),
  })
  .openapi("AcornClient");
