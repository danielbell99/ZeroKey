import { z } from "zod";
import { OptionalBritishDateSchema } from "../../shared/normalisation.js";
import {
  OptionalBooleanSchema,
  OptionalTextSchema,
  optionalArray,
  PayloadValidationError,
  safeIssues,
} from "../../shared/validation.js";

const BagEntrySchema = z.object({ key: z.string().min(1), value: z.unknown().optional() });
type BagEntry = z.infer<typeof BagEntrySchema>;

export const BeaconClientSchema = z.object({
  recordId: z.string().trim().min(1),
  attributes: optionalArray(BagEntrySchema),
  formattedValues: optionalArray(BagEntrySchema),
  addresses: optionalArray(
    z.object({
      line1: OptionalTextSchema,
      line2: OptionalTextSchema,
      city: OptionalTextSchema,
      county: OptionalTextSchema,
      postcode: OptionalTextSchema,
      country: OptionalTextSchema,
      primary: z
        .union([
          z.boolean(),
          z
            .string()
            .trim()
            .toLowerCase()
            .pipe(z.enum(["true", "false"]))
            .transform((value) => value === "true"),
        ])
        .nullish()
        .transform((value) => value ?? false),
    }),
  ),
  contacts: optionalArray(
    z.object({
      type: z.number().int().nullish(),
      value: OptionalTextSchema,
      isPrimary: OptionalBooleanSchema,
    }),
  ),
});

export const AttributesSchema = z.object({
  firstname: OptionalTextSchema,
  middlename: OptionalTextSchema,
  lastname: OptionalTextSchema,
  birthdate: OptionalBritishDateSchema,
  t4a_ninumber: OptionalTextSchema,
  t4a_nationality: OptionalTextSchema,
});
export const FormattedValuesSchema = z.object({
  title: OptionalTextSchema,
  gendercode: OptionalTextSchema,
  familystatuscode: OptionalTextSchema,
});

export function parseBag<S extends z.ZodObject>(
  schema: S,
  entries: BagEntry[],
  bag: string,
): z.output<S> {
  const known = new Set(Object.keys(schema.shape));
  const values = new Map<string, unknown>();
  const indices = new Map<string, number>();
  for (const [index, entry] of entries.entries()) {
    if (!known.has(entry.key)) continue;
    if (values.has(entry.key)) {
      throw new PayloadValidationError([
        { path: [bag, index, "key"], code: "duplicate_key", message: "Duplicate recognised key" },
      ]);
    }
    values.set(entry.key, entry.value);
    indices.set(entry.key, index);
  }
  const result = schema.safeParse(Object.fromEntries(values));
  if (!result.success) {
    throw new PayloadValidationError(
      safeIssues(result.error).map((issue) => {
        const key = issue.path[0];
        const index = typeof key === "string" ? indices.get(key) : undefined;
        return { ...issue, path: index === undefined ? [bag] : [bag, index, "value"] };
      }),
    );
  }
  return result.data;
}
