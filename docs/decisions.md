# Design decisions

## Core 1 — canonical boundary

The exercise's snake_case model is the public contract. Zod schemas define both runtime
validation and inferred TypeScript types. There is no independently maintained interface.

Provider adapters will absorb missing optional strings as null and absent collections as
empty arrays. The canonical API instead requires explicit nullable fields and arrays;
only omitted marital status defaults to unknown. Explicit null marital status is invalid.
Provider extras will be ignored; canonical extras are rejected to catch contract mistakes.

Dates are calendar dates, not timestamps. Years 0001–9999 are supported; leap days are
validated without timezone conversion. NI validation checks uppercase/space-free formatting,
not issuance, so the brief's fictional QQ number remains valid. Contact formats are checked
syntactically, without claiming deliverability or number ownership.

Source IDs remain provider IDs. No persistence, identity matching, authentication or frontend
is introduced. Node 24 LTS, strict TypeScript, Hono, Zod and Vitest retain the suggested stack.

This first milestone is a tested domain library. The runnable HTTP entry point arrives in
core 4; tests and documentation grow with each milestone rather than being deferred.

### Toolchain compatibility evidence

Vitest 5.0.0's published declarations reference missing `@vitest/expect` and browser
`MarkOptions` types, and its Vite augmentation conflicts under exact optional properties.
The test-inclusive compiler therefore skips checking third-party declaration bodies only.
All application and test code remains strictly checked, including use of library APIs.
The separate production compiler also checks dependency declarations (`skipLibCheck: false`).
No ambient shims, suppressed source errors or mixed Vitest package majors are introduced.

npm 12 blocks dependency install scripts by default. Only the reviewed esbuild 0.28.2
binary installation script is allowed; optional fsevents scripts remain denied.

## Core 2 — inbound adapters

Acorn and Beacon have separate tolerant input schemas and explicit enum tables. Unknown
provider fields are discarded. Known fields with incorrect types or non-empty invalid dates
fail atomically; unknown enum labels degrade to null legal sex or unknown marital status.
Missing optional strings become null, collections become empty arrays, and primary flags
default to false. Duplicate recognised Beacon bag keys fail with their original array index.

Names collapse whitespace; full_name excludes title. NI numbers uppercase and lose whitespace.
Provider IDs remain distinct. Nationality is free text: Acorn's name (or supplied code fallback)
and Beacon's label are not harmonised or inferred from residence.

Acorn address components remain ordered: first non-empty component in line1, the rest in line2.
Beacon's pre-concatenated line1 is split only at the first comma and only when line2 is empty.
All remaining commas/content are preserved. Empty addresses are omitted, but county-only or
move-in-only addresses retain their source information.

The bounded country lookup covers GB/GBR, IE/IRL, FR/FRA, DE/DEU, US/USA, CA/CAN, AU/AUS
and NZ/NZL, plus their English names. Unknown input countries become null, not guessed codes.

Recognised phones become compact international strings. An explicit GB assumption converts
11-digit local numbers starting with 0; + and 00 prefixes and presentation separators are
supported. Other formats fail with useful paths. This is syntactic validation, not global
number-plan validation. Emails retain case and are checked without DNS/network requests.
Unknown contact channels become other; empty values are omitted; all non-empty contacts,
primary flags and original order are retained for destination-specific selection.

The sample canonical outputs intentionally differ in ID, nationality, Acorn's extra email
and its move-in date. Their independently asserted shared fields agree. Original fixtures
remain unchanged and are never loaded by the application.

## Core 3 — Cosper outbound boundary

The canonical input is converted into a strict, runtime-validated Cosper request. Sex maps
male/female to 0/1; other, unspecified and absent map to 2. Engagement maps to marital code 0
(unknown), rather than inventing single or married status. All other codes follow the brief.
Optional destination strings remain explicit nulls; this is an assumption for the fictional
contract, not a claim about a real vendor API. Dates become DD/MM/YYYY without timezone logic.

The first usable primary address wins, otherwise the first usable address. Usable means at
least one field Cosper can represent; a county-only/move-in-only address cannot win selection.
An unsupported non-null selected country fails with a 422-compatible issue rather than losing
known information or inventing its full name.

The first primary email wins, otherwise the first email. Phone primary status outranks type;
within the primary group mobile wins over telephone, then original order breaks ties. Without
primaries, prefer mobile then telephone. Never reinterpret other contacts as phones. UK mobile
presentation matches the supplied +44 7700 900123 target; other international numbers stay compact.

Cosper cannot retain title, middle names, nationality, county, multiple addresses or secondary
contacts, and collapses some enums. These losses are intentional and local to this adapter.
The returned created response is deterministic and labelled simulated; no network call occurs.

## Core 4 — HTTP and process boundary

Three Hono routes dispatch through a registry, with no slug-specific route logic. The app
factory is separate from the listening process. Provider/operation lookup precedes body
parsing. JSON content type is required; bodies are limited to 1 MiB. Errors distinguish
unknown provider (404), unsupported operation (400), malformed JSON (400), size (413),
content type (415), caller validation (422) and internal/output-contract defects (500).

Every response has a generated X-Request-Id; errors include the same ID. Error issue paths
refer to original provider fields. Error messages do not interpolate raw values or unknown
keys. Unexpected errors log only a fixed event, correlation ID, registered provider and
operation. Logging failures cannot expose exceptions or break the safe response.

The server binds only to 127.0.0.1, defaults to port 3000 and validates PORT (1–65535).
Internal server tests use ephemeral port zero. SIGINT/SIGTERM close the listener and idle
connections, with a five-second bound for active connections. Occupied ports fail clearly;
no unrelated process is stopped. Smoke tests exercise both the real HTTP adapter and the
compiled command-line entry point, including startup failures and both shutdown signals.

## Core 5 — additive extension proof

A provider exports typed functions plus a slug. Its raw schema and mapping stay together;
the only production registration edit is in the composition module. Supported operations
are derived from actual methods, not a separately maintained capabilities list. No canonical
versioning system or second resource is added.

The registry snapshots and freezes registrations, returns fresh capability listings, and
fails early for duplicate/invalid slugs or providers with no operations. Tests register a
fourth, test-only adapter supporting both directions and exercise it through unchanged routes.
The same validation and unsupported-operation errors apply. Adding it does not mutate the
production registry, and concrete adapter request types remain exact at compile time.

## Core 6 — verification gates

Unit and in-process API suites are independently selectable from compiled-server smoke tests.
The quality gate runs strict source/test type checking, Biome, tests, V8 coverage, a production
build, real-server smoke tests and a high/critical dependency audit. Both Git hooks and CI use
that gate. Coverage includes all source files, including files not imported by unit/API tests.

The domain/provider/shared transformation group must meet 90% lines/statements/functions and
85% branches. Global coverage is reported honestly: the server entry point is tested in a
separate child process and is not counted as covered by the unit/API instrumentation. There
are no coverage ignore comments or source-file exclusions. Coverage supplements behavioural
assertions, including the unchanged PDF fixtures, every enum, source paths, unknown inputs,
selection precedence, generated-output defects, registration and privacy checks.

CI uses the verified stable official checkout/setup-node releases pinned to immutable commits,
with a Node 24 action runtime, read-only repository permissions, no persisted checkout token
and a bounded job timeout. No application credentials are required.
