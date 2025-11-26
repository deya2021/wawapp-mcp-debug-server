# MCP Server Security & Limitations

## Read-Only Guarantee

All tools are strictly read-only. No writes/deletes/updates.

## Rate Limits

- 10 requests per minute per tool
- 100 requests per minute globally
- Maximum time range: 7 days
- Maximum results per query: 500 (varies by tool)

## PII Masking

- Phone numbers: Masked as "+222 3\*\*\* \*\*\*\*"
- Names: First name + masked last (e.g., "Ahmed M\*\*\*")
- GPS coordinates: Rounded to 4 decimal places (~11m precision)

## Audit Logging

All tool executions logged with:

- Tool name
- Sanitized parameters (no PII)
- Execution timestamp
- Result size (not content)
- Execution duration

## Firebase Permissions Required

Service account needs:

- `roles/datastore.viewer` (Firestore read-only)
- `roles/logging.viewer` (Cloud Logging read-only)

## Supported Environments

- Default: wawapp-dev (development/staging)
- Configurable via ENVIRONMENT env var
- NOT recommended for production without additional safeguards
