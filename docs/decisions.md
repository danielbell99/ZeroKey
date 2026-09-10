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
