# Implementation verification

Evidence is recorded separately for the original core implementation and the local consistency
branch. Historical core results below are retained as recorded; they do not establish the runtime
or test count used for subsequent branch changes. GitHub checks apply only to published commits.

## Original core baseline — clean-checkout evidence

The original core record reports verification on 10 September 2026 with Node 24.21.0 and
npm 12.0.2. The branch-specific results are recorded under [cross-provider consistency](#cross-provider-consistency).

A fresh copy of the staged repository files, with no existing `node_modules`, passed:

```text
npm ci                         62 packages installed; 0 vulnerabilities; hooks installed by prepare
npm run typecheck              source/test and production checks passed
npm run lint                   Biome checks passed
npm test                       8 test files; 240 tests passed
npm run coverage               transformation thresholds passed
npm run test:smoke             production build; 6 real-server tests passed
npm audit --audit-level=high   0 vulnerabilities
```

The test-inclusive compiler's scoped third-party declaration compatibility setting is
documented in [decisions](decisions.md). It does not suppress errors in application or test code.

The global unit/API coverage report is 85.36% lines, 84.89% statements, 85.71% functions and
86.76% branches. The compiled server entry point is exercised in a separate process and is not
misrepresented as instrumented unit/API coverage.

## Coverage negative control

In the temporary verification copy only, an unimported transform module with 302 uncovered
statements was added. The 240 behavioural tests still passed, but coverage failed with exit code
1 because the transformation group fell below its 90% line/statement threshold. The probe was
removed immediately and was never added to this repository. This proves untested transformation
files are included and the threshold is enforced.

## Manual development-server checks

The documented `npm run dev` command was run from the clean copy on a non-default loopback port.
The README curl workflow was then exercised:

- provider discovery returned Acorn/Beacon normalise and Cosper build-request capabilities;
- both inbound fixtures returned independently expected canonical clients;
- Acorn normalisation piped into Cosper returned the exact supplied request fixture and a
  `simulated: true` result;
- invalid date `2025-02-29` returned HTTP 422, a generated request ID and the original
  `person.dateOfBirth` path without echoing the rejected value.

The temporary server was stopped after the check. The original PDF JSON fixtures remain unchanged.

## Cross-provider consistency

`consistency.test.ts` normalises both supplied inbound fixtures and compares the shared canonical
projection with strict equality. The projection includes all common personal fields, one complete
address without Acorn-only `move_in_date`, and the ordered primary email/mobile contacts. It is
also checked against an independently authored expected value from the exercise brief.

The test excludes only source IDs. Nationality now normalises to `GB` for both providers, while
Acorn retains its move-in date and non-primary email and Beacon correctly lacks them. This proves
equivalence without treating provider-specific detail as an inconsistency.

Both raw inputs and canonical outputs are deeply frozen. The shared projection only selects
fields, so mutation attempts fail without modifying the supplied fixtures or returned clients.

### Initial consistency verification

The initial consistency implementation passed 242 unit/API tests and 6 smoke tests under
Node 22.22.1 / npm 10.9.4. This is separate from the original 240-test core baseline above;
it did not meet the declared Node 24.21.0 / npm 12.0.2 verification target.

### Follow-up verification — declared runtime

On 10 September 2026, the follow-up changes were verified with **Node 24.21.0 and npm 12.0.2**.
The Node archive was verified against its official SHA-256 checksum. Both tools were installed
in an isolated temporary directory and selected for the verification session; the machine's
default Node/npm installation was not changed.

| Check | Observed result |
| --- | --- |
| `node --version` / `npm --version` | `v24.21.0` / `12.0.2` |
| `npm ci` | Clean lockfile install; 62 packages installed; local hooks installed automatically |
| `npm test -- tests/unit/consistency.test.ts` | 1 file, 2 tests passed with frozen inputs and outputs |
| `npm run typecheck` | Source/test and production type checks passed |
| `npm run lint` | 39 files checked; no changes required |
| `npm test` | 9 files, 242 unit/API tests passed |
| `npm run coverage` | 242 tests passed; transformation coverage thresholds passed |
| `npm run test:smoke` | Production build passed; 6 real-server tests passed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run check` | Complete aggregate gate passed |
| README / verification local links | 54 file and section links resolved |
| `git diff --check` | No whitespace errors |

The 242 unit/API tests include the two consistency tests; the six smoke tests are a separate
suite. Coverage percentages remain those recorded above because no production code changed.
The branch later passed GitHub QA and merged in [PR #2](https://github.com/danielbell99/ZeroKey/pull/2);
the measurements in this section remain local runner evidence.

## Nationality normalisation

The nationality stretch goal replaces free-text canonical nationality with a bounded alpha-2
country code or null. The shared country catalogue accepts the eight supported country codes,
alpha-3 codes, English names and documented demonyms. Both supplied fixtures now normalise to
`GB`; their original PDF data was not changed. Unsupported nationality becomes null, and
contradictory recognised Acorn name/code fields return safe, original-path 422 issues.

On 10 September 2026, the implementation passed the complete gate with **Node 24.21.0 and
npm 12.0.2**:

| Check | Observed result |
| --- | --- |
| Focused nationality suites | 5 files, 214 tests passed |
| `npm run typecheck` | Source/test and production checks passed |
| `npm run lint` | 41 files checked; no changes required |
| `npm test` | 10 files, 276 unit/API tests passed |
| `npm run coverage` | 276 tests passed; transformation thresholds passed |
| `npm run test:smoke` | Production build passed; 6 real-server tests passed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run check` | Complete aggregate gate passed |
| `git diff --check` | No whitespace errors |

The smoke suite now exercises both inbound providers through the compiled HTTP server and
confirms their canonical nationality is `GB`; it then verifies Acorn can still build the exact
Cosper target request. No deployment or external provider call is involved.

## API documentation tooling

The tooling stretch goal adds a generated OpenAPI 3.0 document at `/openapi.json` and a Swagger
reference at `/docs`. The specification exposes provider discovery, canonical normalisation and
Cosper request building; it documents all public success/error statuses, request IDs and named
runtime schema components. The Swagger page points to the relative document URL, so its requests
remain on the local loopback server.

On 10 September 2026, the implementation passed the complete gate with **Node 24.21.0 and npm
12.0.2**:

| Check | Observed result |
| --- | --- |
| OpenAPI/Swagger API contracts | 2 tests passed: generated paths, statuses, components, safe examples and same-origin UI |
| `npm run typecheck` | Source/test and production checks passed |
| `npm run lint` | 42 files checked; no changes required |
| `npm test` | 10 files, 278 unit/API tests passed |
| `npm run coverage` | 278 tests passed; transformation thresholds passed |
| `npm run test:smoke` | Production build passed; 6 real-server tests passed, including both documentation endpoints |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run check` | Complete aggregate gate passed |

The document uses named canonical/provider/Cosper schemas from the same runtime definitions.
Examples use synthetic values and the API tests assert that supplied fixture NI and email values
do not appear in the generated specification.

## Capability and canonical versioning

Canonical normalisation now emits the strict literal `schema_version: "v1"`. The registry-derived
provider list also reports `canonical_version: "v1"` beside operations derived from actual
adapter methods. Build-request accepts a legacy canonical v1 payload that omits the field, adds
the value during boundary validation, and rejects every explicit non-v1 value before provider
dispatch. The exact Cosper request remains unchanged because canonical metadata does not cross
the outbound provider boundary.

The implementation was verified on 10 September 2026 with **Node 24.21.0 and npm 12.0.2**:

| Check | Observed result |
| --- | --- |
| Canonical / registry / API checks | 289 unit/API tests passed, including explicit output version, legacy input, invalid versions, generated-output defects, provider discovery and generated OpenAPI contracts |
| `npm run check` | Complete aggregate gate passed: type checks, Biome, 289 unit/API tests, coverage thresholds, production build, six smoke tests and a zero-vulnerability audit |
| `git diff --check` | No whitespace errors |

The dedicated assertions distinguish caller errors from implementation defects: unsupported
versions return a safe 422 and never call a provider builder; an adapter that omits the version
returns a safe 500. Compiled-server smoke coverage confirms both inbound providers return v1.

## API resilience — 11 September 2026

Verified with Node 24.21.0 / npm 12.0.2. The new API suite covers all three POST endpoints,
discovery failures and the two documentation endpoints. The first regression run failed 30
non-Error exception cases; all now pass through the shared safe boundary. Existing overlapping
single-route cases were consolidated rather than counted twice.

| Command | Observed result |
| --- | --- |
| `npm run test:unit` | 246 passed in 8 files |
| `npm run test:api` | 216 passed in 3 files |
| `npm run test:resilience` | 195 passed; included in the API total |
| `npm run test:smoke` | 22 passed in 2 files; 16 dedicated resilience scenarios |
| `npm run format:check` | Passed without changes |
| `npm run check` | Type checking, linting, all tests, coverage thresholds, production build and audit passed; zero vulnerabilities |
| Coverage | 86.83% statements, 87.61% branches, 86.04% functions, 87.50% lines; HTTP application has 100% line/function coverage |
| `git diff --check` | Passed |

The total is **484 distinct tests**. The README lists every test file and commands for running
each folder, a single file or verbose individual test names. In-process cases assert exact
status/code/envelope, safe original issue paths, generated request IDs, no unexpected logging
for caller errors and one safe logging attempt for internal failures. Fault injection covers
malformed registry listings, ordinary/Zod/non-Error exceptions, invalid generated canonical or
build data, and a failing logger. Tests prove subsequent success and concurrent request isolation.

The byte-boundary matrix covers 1 MiB minus one, exactly 1 MiB and one byte over for every POST,
with accurate/absent Content-Length and multibyte text. Real HTTP verifies each POST's malformed,
schema-invalid and oversized requests plus genuinely chunked overflow. It also verifies internal
fault/recovery for discovery and each adapter. Compiled CLI smoke tests execute 422-then-200 calls
for all POST endpoints before checking clean shutdown on both signals.

Sandbox-only listener failures were environmental (loopback listen EPERM); rerunning with
loopback access passed. No test was skipped, silenced or weakened to accommodate that restriction.

## Second resource: addresses — 11 September 2026

Addresses extend the same boundary pattern without manufacturing an address identity: Acorn and
Beacon address envelopes normalise to a strict `CanonicalAddressResourceV1` associated with an
opaque client reference, and the exercise-only Cosper projection is built back from that resource.
The address mappers are reused by the existing client adapters, so the resource and embedded-client
representations cannot drift silently. Discovery is registry-derived per resource: the client list
and `GET /v1/providers?resource=addresses` each expose only handlers that are actually registered.

The final run used an SHA-256-verified, temporary **Node 24.21.0 / npm 12.0.2** toolchain, leaving
the machine-wide Node installation unchanged:

| Check | Observed result |
| --- | --- |
| `npm ci` | Clean lockfile install; 69 packages added; hooks installed automatically; audit found 0 vulnerabilities |
| `npm run format:check` | 51 files checked; no fixes needed |
| `npm run typecheck` | Test and production TypeScript checks passed |
| `npm run lint` | 51 files checked; no changes required |
| `npm run test:unit` | 9 files, 252 tests passed |
| `npm run test:api` | 4 files, 327 tests passed |
| `npm run test:resilience` | 1 focused file, 299 tests passed (included in the API total) |
| `npm run coverage` | 13 files, 579 tests passed; 87.72% statements, 87.45% branches, 87.75% functions and 88.91% lines; configured thresholds passed |
| `npm run test:smoke` | Production build and 2 real-server files, 37 tests passed |
| `npm run check` | Complete pre-push gate passed, including audit; 0 vulnerabilities |
| `git diff --check` | No whitespace errors |

The address-specific unit/API checks cover full Acorn/Beacon mappings, deliberate field loss on
Cosper output, invalid/empty payloads, unrepresentable addresses, dynamic capability filtering,
generated OpenAPI paths/schemas, invalid generated output, and safe structured error behaviour.
The compiled-server suite exercises all six POST operations, including address failure-and-recovery
paths, over real loopback HTTP.

## Acceptance evidence

| Core requirement | Evidence |
| --- | --- |
| 1. Canonical types/schema | Schema suite and strict inferred-type checks |
| 2. Inbound adapters | Exact fixtures, every enum, invalid input and immutable transforms |
| 3. Cosper output | Exact target fixture, numeric mappings and selection precedence |
| 4. Hono API | Route/error tests, safe logs and compiled-server smoke tests |
| 5. Extensibility | Test-only Delta adapter registered through unchanged routes |
| 6. Meaningful testing | Unit/API/smoke suites, strict cross-provider consistency proof, audit and enforced coverage gate |
| 7. Documentation | Clean installation, documented curl workflow, generated OpenAPI contract and Swagger UI |
