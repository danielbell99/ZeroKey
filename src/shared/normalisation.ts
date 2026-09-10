import { z } from "zod";
import {
  type CanonicalAddress,
  type CanonicalContactDetail,
  CanonicalContactDetailSchema,
  IsoDateSchema,
} from "../domain/client.js";
import {
  type IssuePath,
  OptionalTextSchema,
  PayloadValidationError,
  safeIssues,
} from "./validation.js";

export const OptionalIsoDateSchema = OptionalTextSchema.pipe(IsoDateSchema.nullable());
export const OptionalBritishDateSchema = OptionalTextSchema.refine(
  (value) => value === null || /^\d{2}\/\d{2}\/\d{4}$/u.test(value),
)
  .transform((value) =>
    value === null ? null : `${value.slice(6, 10)}-${value.slice(3, 5)}-${value.slice(0, 2)}`,
  )
  .pipe(IsoDateSchema.nullable());

export function normaliseName(value: string | null | undefined): string | null {
  return value?.trim().replace(/\s+/gu, " ") || null;
}

export function fullName(...parts: Array<string | null>): string | null {
  return parts.filter((part) => part !== null).join(" ") || null;
}

export function normaliseNi(value: string | null | undefined): string | null {
  return value?.replace(/\s/gu, "").toUpperCase() || null;
}

export function enumKey(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/gu, " ").toLowerCase() ?? "";
}

export function hasAddressData(address: CanonicalAddress): boolean {
  return Object.entries(address).some(([key, value]) => key !== "primary" && value !== null);
}

/** Deliberately bounded GB default for these two fictional inbound providers. */
export function normalisePhone(value: string, path: IssuePath): string {
  const fail = () =>
    new PayloadValidationError([
      { path, code: "invalid_format", message: "Expected an international or 11-digit UK phone" },
    ]);
  if (!/^[+\d()\s-]+$/u.test(value)) throw fail();
  let compact = value.replace(/[()\s-]/gu, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  else if (/^0\d{10}$/u.test(compact)) compact = `+44${compact.slice(1)}`;
  if (!z.e164().safeParse(compact).success) throw fail();
  return compact;
}

export function normaliseContact(
  type: CanonicalContactDetail["type"],
  value: string | null,
  primary: boolean,
  path: IssuePath,
  valueField = "value",
): CanonicalContactDetail[] {
  if (value === null) return [];
  const formatted =
    type === "mobile" || type === "telephone"
      ? normalisePhone(value, [...path, valueField])
      : value;
  const result = CanonicalContactDetailSchema.safeParse({ type, value: formatted, primary });
  if (!result.success) {
    throw new PayloadValidationError(
      safeIssues(result.error).map((issue) => ({
        ...issue,
        path: [...path, ...issue.path.map((part) => (part === "value" ? valueField : part))],
      })),
    );
  }
  return [result.data];
}
