import { normaliseAcorn } from "../providers/acorn/normalise.js";
import { normaliseBeacon } from "../providers/beacon/normalise.js";
import { buildCosper } from "../providers/cosper/build-request.js";
import { createRegistry } from "./registry.js";

/** The only production composition point. Routes never branch on a provider slug. */
export function defaultRegistry() {
  return createRegistry([
    { slug: "acorn", normalise: normaliseAcorn },
    { slug: "beacon", normalise: normaliseBeacon },
    { slug: "cosper", buildRequest: buildCosper },
  ]);
}
