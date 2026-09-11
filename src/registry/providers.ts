import { normaliseAcornAddress } from "../providers/acorn/address.js";
import { normaliseAcorn } from "../providers/acorn/normalise.js";
import { normaliseBeaconAddress } from "../providers/beacon/address.js";
import { normaliseBeacon } from "../providers/beacon/normalise.js";
import { buildCosperAddress, CosperAddressBuildResultSchema } from "../providers/cosper/address.js";
import { buildCosper } from "../providers/cosper/build-request.js";
import { CosperBuildResultSchema } from "../providers/cosper/schema.js";
import { createRegistry } from "./registry.js";

/** The only production composition point. Routes never branch on a provider slug. */
export function defaultRegistry() {
  return createRegistry([
    { slug: "acorn", normalise: normaliseAcorn, normaliseAddress: normaliseAcornAddress },
    { slug: "beacon", normalise: normaliseBeacon, normaliseAddress: normaliseBeaconAddress },
    {
      slug: "cosper",
      buildRequest: buildCosper,
      buildResultSchema: CosperBuildResultSchema,
      buildAddressRequest: buildCosperAddress,
      addressBuildResultSchema: CosperAddressBuildResultSchema,
    },
  ]);
}
