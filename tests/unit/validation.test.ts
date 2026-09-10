import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normaliseAcorn } from "../../src/providers/acorn/normalise.js";
import { normaliseBeacon } from "../../src/providers/beacon/normalise.js";
import { parseBag } from "../../src/providers/beacon/schema.js";
import { PayloadValidationError, parseInput, safeIssues } from "../../src/shared/validation.js";

describe("validation paths and privacy", () => {
  it("does not expose custom validation text or unknown object keys", () => {
    const schema = z.strictObject({
      known: z.string().refine(() => false, "SECRET_CUSTOM_MESSAGE"),
    });
    const result = schema.safeParse({ known: "SECRET_VALUE", SECRET_KEY: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = safeIssues(result.error, ["input"]);
      expect(issues.some((issue) => issue.path[0] === "input")).toBe(true);
      expect(JSON.stringify(issues)).not.toContain("SECRET");
    }
  });
  it("supports bag-level errors when a future bag schema requires an absent field", () => {
    try {
      parseBag(z.object({ required: z.string() }), [], "attributes");
      expect.fail("Expected missing required bag value");
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadValidationError);
      if (error instanceof PayloadValidationError)
        expect(error.issues[0]?.path).toEqual(["attributes"]);
    }
  });
  it("prefixes normal schema failures with the caller's source path", () => {
    try {
      parseInput(z.object({ name: z.string() }), { name: 42 }, ["records", 3]);
      expect.fail("Expected invalid name");
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadValidationError);
      if (error instanceof PayloadValidationError)
        expect(error.issues[0]?.path).toEqual(["records", 3, "name"]);
    }
  });
});

describe("remaining transform boundary regressions", () => {
  it("keeps address content on either side of Beacon's first comma", () => {
    const result = normaliseBeacon({
      recordId: "b",
      addresses: [{ line1: ", Road" }, { line1: "Road," }],
    });
    expect(result.addresses[0]).toMatchObject({ line1: null, line2: "Road" });
    expect(result.addresses[1]).toMatchObject({ line1: "Road", line2: null });
  });
  it("retains a county-only address even though Cosper cannot use it", () => {
    expect(normaliseAcorn({ id: 1, addresses: [{ region: "County" }] }).addresses).toHaveLength(1);
  });
  it("treats optional blank dates and NI strings as null", () => {
    expect(
      normaliseAcorn({
        id: 1,
        person: { dateOfBirth: "  ", niNumber: " \t " },
        addresses: [{ street: "Road", movedIn: "" }],
      }),
    ).toMatchObject({ date_of_birth: null, ni_number: null, addresses: [{ move_in_date: null }] });
  });
  it("validates known contacts before returning a client rather than silently keeping bad data", () => {
    expect(() =>
      normaliseBeacon({ recordId: "b", contacts: [{ type: 1, value: "not-an-email" }] }),
    ).toThrow(PayloadValidationError);
  });
});
