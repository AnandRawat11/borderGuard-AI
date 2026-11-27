# MCP and External Connections

No MCP server or MCP client is currently implemented in the reviewed IBVAP source. The platform's external integrations are ordinary C2 HTTP webhooks and optional EVM JSON-RPC anchoring.

## Recommended future MCP boundary

If an MCP integration is introduced, expose read-only operational tools first: camera health, alert summaries, ledger verification, and model provenance. Mutation tools must require explicit operator confirmation, role checks, site scope, idempotency keys, and audit records.

## Testing

Use a local mock server in offline tests. Never expose surveillance evidence, raw coordinates, credentials, or private keys as MCP resources by default. Record provider name, request ID, timeout, retry count, and sanitized failure reason.
