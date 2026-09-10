import { z } from "zod";

export type IssuePath = Array<string | number>;
export interface ValidationIssue {
  path: IssuePath;
  code: string;
  message: string;
}

/** Expected caller failure only. Generated-output Zod failures must not become 422s. */
export class PayloadValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super("Payload validation failed");
    this.name = "PayloadValidationError";
    this.issues = issues;
  }
}

const issueMessages: Readonly<Record<string, string>> = {
  invalid_type: "Missing field or incorrect value type",
  invalid_value: "Value is not supported by this contract",
  invalid_format: "Value has an invalid format",
  too_small: "Value is empty or below the permitted minimum",
  too_big: "Value exceeds the permitted maximum",
  unrecognized_keys: "Object contains unsupported fields",
};

/** Do not copy Zod messages: some contain rejected values or untrusted object keys. */
export function safeIssues(error: z.ZodError, prefix: IssuePath = []): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [
      ...prefix,
      ...issue.path.filter((part): part is string | number => typeof part !== "symbol"),
    ],
    code: issue.code,
    message: Object.hasOwn(issueMessages, issue.code)
      ? (issueMessages[issue.code] ?? "Invalid field value")
      : "Invalid field value",
  }));
}

export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
  prefix: IssuePath = [],
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new PayloadValidationError(safeIssues(result.error, prefix));
  return result.data;
}

export const OptionalTextSchema = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);

export const OptionalBooleanSchema = z
  .boolean()
  .nullish()
  .transform((value) => value ?? false);

export function optionalArray<S extends z.ZodType>(item: S) {
  return z
    .array(item)
    .nullish()
    .transform((value) => value ?? []);
}
