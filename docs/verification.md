# Core implementation verification

Local verification was performed on 10 September 2026 with Node 24.21.0 and npm 12.0.2.
Remote GitHub checks remain the source of truth for pull-request status.

## Clean-checkout evidence

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

## Acceptance evidence

| Core requirement | Evidence |
| --- | --- |
| 1. Canonical types/schema | Schema suite and strict inferred-type checks |
| 2. Inbound adapters | Exact fixtures, every enum, invalid input and immutable transforms |
| 3. Cosper output | Exact target fixture, numeric mappings and selection precedence |
| 4. Hono API | Route/error tests, safe logs and compiled-server smoke tests |
| 5. Extensibility | Test-only Delta adapter registered through unchanged routes |
| 6. Meaningful testing | Unit/API/smoke suites, audit and enforced coverage gate |
| 7. Documentation | Clean installation and documented curl workflow |
