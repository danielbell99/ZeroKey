# Exercise fixtures

These files preserve the sample payloads and expected Cosper create request supplied in the ZeroKey take-home brief.

Use them as immutable test inputs and expected outputs. They are not application configuration and must not be loaded by the production HTTP service.

- `acorn-client.json`: nested inbound CRM payload.
- `beacon-client.json`: attribute-bag inbound CRM payload for the same person.
- `cosper-client-request.json`: expected outbound cashflow-tool request.

The implementation should add focused edge-case fixtures alongside these samples where a test needs them.
