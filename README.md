# WawApp MCP Debug Server

Read-only debugging server for WawApp Firebase/Flutter ecosystem using Model Context Protocol (MCP).

## Quick Start

### Prerequisites

- Node.js 20+
- Firebase service account with `datastore.viewer` and `logging.viewer` roles
- Firebase project (dev/staging/prod)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set ENVIRONMENT=dev

# 3. Add Firebase service account
# Download service account JSON from Firebase Console → Project Settings → Service Accounts
# Save as config/dev-service-account.json

# 4. Build
npm run build

# 5. Run
npm start
```

---

## Configuration

### Multi-Environment Setup

Edit `config/environments.json`:

```json
{
  "dev": {
    "projectId": "wawapp-dev",
    "serviceAccountPath": "./config/dev-service-account.json",
    "maxTimeRangeDays": 7,
    "rateLimit": { "perTool": 10, "global": 100 }
  }
}
```

Set active environment in `.env`:

```bash
ENVIRONMENT=dev
```

---

## AI Client Setup (Claude Desktop)

Add to your Claude Desktop MCP configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wawapp-debug": {
      "command": "node",
      "args": [
        "C:\\Users\\hp\\Music\\wawapp-mcp-debug-server\\dist\\index.js"
      ],
      "env": {
        "ENVIRONMENT": "dev"
      }
    }
  }
}
```

**Restart Claude Desktop after adding this configuration.**

---

## Available Tools

### Kit 1: Order Lifecycle Inspector

**`wawapp_order_trace`** - Full order timeline
Trace complete lifecycle of an order including status transitions, driver assignments, and timeline.

```json
{
  "orderId": "order_abc123",
  "includeNotifications": true
}
```

---

### Kit 2: Driver Matching Diagnostics ⭐ CRITICAL

**`wawapp_driver_eligibility`** - Check driver requirements
Comprehensive check of driver eligibility for order matching: verification status, profile completeness, online status, location validity.

```json
{
  "driverId": "driver_xyz"
}
```

**`wawapp_driver_view_orders`** - Simulate driver's view
Simulate the exact orders a driver should see based on their current location and matching logic.

```json
{
  "driverId": "driver_xyz",
  "radiusKm": 6.0
}
```

---

## Example Usage

### Example 1: "Why can't driver see orders?"

**User prompt to AI**:

```
Driver with ID "driver_abc123" complains they can't see any nearby orders.
Can you diagnose why?
```

**AI will use**:

1. `wawapp_driver_eligibility` → Check all requirements
2. `wawapp_driver_view_orders` → Show what driver should see

**Expected output**:

```
The driver cannot see orders because:
- isVerified: false (driver not verified by admin)
- Profile incomplete: missing "city" and "region"

Action required:
1. Admin must set isVerified=true in /drivers/driver_abc123
2. Driver must complete onboarding (add city and region)
```

---

### Example 2: "Trace order lifecycle"

**User prompt to AI**:

```
Show me the complete timeline for order abc123
```

**AI will use**:

1. `wawapp_order_trace` → Get full timeline

**Expected output**:

```
Order abc123 Timeline:
1. [10:30:00] Order created (status: matching)
2. [10:32:15] Driver assigned (driver_yyy, status: accepted)
3. [10:35:00] Driver en route (status: onRoute)
4. [11:15:00] Trip completed (status: completed, rating: 5)

Duration:
- Total: 45m 0s
- matchingToAccepted: 2m 15s
- acceptedToCompleted: 42m 45s
```

---

## Security & Limitations

### Read-Only Guarantee

All tools are **strictly read-only**. No writes, updates, or deletes.

### Rate Limits

- 10 requests/minute per tool
- 100 requests/minute globally
- Configurable per environment

### Time Range Limits

- Default lookback: 24 hours
- Maximum range: 7 days (configurable)

### PII Masking

- Phone numbers: Masked as "+222 3\*\*\* \*\*\*\*"
- Names: First name + masked last ("Ahmed M\*\*\*")
- GPS: Rounded to 4 decimals (~11m precision)

---

## Troubleshooting

### Error: "Permission denied (Firestore)"

- Check service account has `roles/datastore.viewer`
- Verify service account path in `environments.json`

### Error: "Rate limit exceeded"

- Wait for rate limit window to reset
- Increase limits in `environments.json` (not recommended for prod)

### No tools showing in Claude Desktop

- Check MCP config path is absolute (not relative)
- Verify `npm run build` completed successfully
- Restart Claude Desktop

---

## Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Build
npm run build

# Lint
npm run lint
```

---

## Project Structure

```
wawapp-mcp-debug-server/
├── src/
│   ├── config/              # Environment & collection mappings
│   ├── security/            # Rate limiting, PII masking, audit logs
│   ├── data-access/         # Firestore & Cloud Logging clients
│   ├── server/              # MCP server core
│   ├── kits/                # Tool implementations by kit
│   ├── utils/               # Haversine, time helpers, error handlers
│   └── types/               # TypeScript interfaces
├── context/                 # Context files for AI agents
├── config/                  # Environment configs & service accounts
└── logs/                    # Audit logs
```

---

## License

MIT License

---

## Next Steps

1. Add more tools from Kits 3-7 (see Phase 2 design for complete list)
2. Add notification tracing (Kit 5)
3. Add Cloud Function observability (Kit 6)
4. Add system health dashboard (Kit 7)

For complete tool specifications, see `docs/PHASE_2_DESIGN.md`.
