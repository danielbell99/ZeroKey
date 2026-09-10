# Challenge contract

This is a compact, code-generation-friendly reference for the ZeroKey take-home brief. Keep this document aligned with the brief; it describes the required contract, not implementation decisions.

## Canonical model

```ts
type LegalSex = 'male' | 'female' | 'other' | 'unspecified';

type MaritalStatus =
  | 'single'
  | 'married'
  | 'civil-partner'
  | 'cohabiting'
  | 'engaged'
  | 'separated'
  | 'divorced'
  | 'widowed'
  | 'unknown';

type CanonicalCountryCode = 'GB' | 'IE' | 'FR' | 'DE' | 'US' | 'CA' | 'AU' | 'NZ';

interface CanonicalClient {
  schema_version: 'v1'; // Canonical contract identifier, distinct from the HTTP route version.
  id: string;
  title: string | null;
  first_name: string | null;
  middle_names: string | null;
  last_name: string | null;
  full_name: string | null; // Composed; collapse missing parts cleanly.
  date_of_birth: string | null; // ISO 8601, YYYY-MM-DD.
  ni_number: string | null; // Normalised: upper-case, no spaces.
  legal_sex: LegalSex | null;
  marital_status: MaritalStatus; // Never null; default to unknown.
  nationality: CanonicalCountryCode | null; // Bounded normalisation; never inferred from residence.
  addresses: CanonicalAddress[];
  contact_details: CanonicalContactDetail[];
}

interface CanonicalAddress {
  primary: boolean;
  line1: string | null;
  line2: string | null;
  town_city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null; // ISO 3166-1 alpha-2, for example GB.
  move_in_date: string | null; // ISO 8601, YYYY-MM-DD.
}

interface CanonicalContactDetail {
  type: 'email' | 'mobile' | 'telephone' | 'other';
  value: string;
  primary: boolean;
}
```

## Provider responsibilities

| Provider | Direction | Required operation |
| --- | --- | --- |
| `acorn` | Inbound | Normalise its nested client payload to `CanonicalClient`. |
| `beacon` | Inbound | Normalise its attribute-bag client payload to `CanonicalClient`. |
| `cosper` | Outbound | Build its create-client request from `CanonicalClient`. |

## Required normalisation behaviours

- Empty, absent, or null optional values become `null` in the canonical model.
- Unknown gender and marital-status values must degrade safely; an unknown marital status becomes `unknown` rather than throwing.
- Acorn `Living Together` maps to `cohabiting`; `Engaged` maps to `engaged`; and `Unspecified` gender maps to `unspecified`.
- Beacon `Intend to Marry` maps to `engaged`; `Civil Partnership` maps to `civil-partner`; and `Non-Binary` maps to `other`.
- Beacon `DD/MM/YYYY` dates become ISO `YYYY-MM-DD`; its spaced NI number becomes upper-case without spaces; and its ISO-3 country code becomes ISO-2.
- Nationality names, codes and labels map through the same bounded country vocabulary; unsupported
  nationality becomes null and contradictory recognised Acorn values produce a validation error.
- Cosper requires a `DD/MM/YYYY` date, numeric sex and marital-status codes, one flattened address, a full country name, and one email and telephone number.

The implementation must document choices for `engaged` and a null legal sex because Cosper has no direct equivalent. It must also document primary-contact tie-break and fallback rules.

## Complete source vocabularies from the brief

Acorn gender labels: `Male`, `Female`, `Unspecified`. Marital labels: `Single`, `Married`,
`Civil Partner`, `Living Together`, `Engaged`, `Separated`, `Divorced`, `Widowed`, `Unknown`.
Contact channels: `EmailAddress`, `MobilePhone`, `Landline`, plus unrecognised values.

Beacon gender labels: `Male`, `Female`, `Non-Binary`, `Unknown`. Marital labels: `Single`,
`Married`, `Civil Partnership`, `Cohabiting`, `Intend to Marry`, `Separated`, `Divorced`,
`Widowed`, `Unknown`. Numeric contact codes: 1 email, 2 mobile, 3 telephone; other codes
must be handled gracefully. Beacon dates use DD/MM/YYYY, its country example uses GBR,
and its primary address flag is the string `"true"`.

The source enum vocabularies are explicitly non-exhaustive. `Betrothed` and other unknown
marital labels must become canonical `unknown` without throwing. Missing optional values
may be absent, blank or null. The sample records must agree on meaningful shared facts,
but legitimate source differences such as Acorn's secondary email must not be erased.

## Cosper target contract

The exact JSON example is preserved separately in the Cosper request fixture. Its fields are
`ClientRef`, `Forename`, `Surname`, `DateOfBirth`, `Sex`, `MaritalStatus`, `AddressLine1`,
`AddressLine2`, `Town`, `Postcode`, `Country`, `Email`, and `Telephone`.

| Canonical value | Cosper Sex code |
| --- | --- |
| male | 0 |
| female | 1 |
| other / unspecified | 2 |
| null | Implementation must decide and document |

| Canonical marital value | Cosper code |
| --- | --- |
| unknown | 0 |
| single | 1 |
| married | 2 |
| cohabiting | 3 |
| civil-partner | 4 |
| separated | 5 |
| divorced | 6 |
| widowed | 7 |
| engaged | No direct code; implementation must decide and document |

Cosper expects a DD/MM/YYYY date, the full country name and a single chosen email/telephone.
The brief does not fully define destination nullability or phone presentation beyond its
sample, so additional choices belong in the README/decision history, not in this contract.

## HTTP API

```text
GET  /v1/providers
POST /v1/:provider/clients/normalise
POST /v1/:provider/clients/build-request
```

Responses must use structured client-safe errors: unknown provider and unsupported operation errors are 4xx, invalid input produces useful validation detail, and unexpected errors are logged but return a safe 500 body.

## Implementation boundaries

- TypeScript with strict checking, Hono, Zod runtime validation, Vitest, and Node 20+.
- No database, authentication, deployment, or front end.
- Adding a provider should be a local registry/adaptor change rather than an edit scattered across the HTTP layer.
- Keep source, provider adaptors, registry/dispatch, HTTP layer, tests, and runnable examples clearly separated.
