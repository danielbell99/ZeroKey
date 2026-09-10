import { z } from "@hono/zod-openapi";
import { NullableTextSchema, TextSchema } from "../../domain/client.js";
import { OptionalBritishDateSchema } from "../../shared/normalisation.js";

export const CosperRequestSchema = z
  .strictObject({
    ClientRef: TextSchema,
    Forename: NullableTextSchema,
    Surname: NullableTextSchema,
    DateOfBirth: z
      .string()
      .regex(/^\d{2}\/\d{2}\/\d{4}$/u)
      .refine((value) => OptionalBritishDateSchema.safeParse(value).success)
      .nullable(),
    Sex: z.literal([0, 1, 2]),
    MaritalStatus: z.literal([0, 1, 2, 3, 4, 5, 6, 7]),
    AddressLine1: NullableTextSchema,
    AddressLine2: NullableTextSchema,
    Town: NullableTextSchema,
    Postcode: NullableTextSchema,
    Country: NullableTextSchema,
    Email: z.email().nullable(),
    Telephone: TextSchema.refine(
      (value) => z.e164().safeParse(value.replace(/\s/gu, "")).success,
    ).nullable(),
  })
  .openapi("CosperRequest");

export const CosperBuildResultSchema = z
  .strictObject({
    request: CosperRequestSchema,
    response: z.strictObject({
      status: z.literal("created"),
      clientRef: TextSchema,
      simulated: z.literal(true),
    }),
  })
  .openapi("CosperBuildResult");

export type CosperRequest = z.infer<typeof CosperRequestSchema>;
export type CosperBuildResult = z.infer<typeof CosperBuildResultSchema>;
