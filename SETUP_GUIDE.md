# WawApp MCP Debug Server - Setup Guide

## Step 1: Install Dependencies

```bash
cd c:\Users\hp\Music\wawapp-mcp-debug-server
npm install
```

## Step 2: Configure Firebase Service Account

### Option A: Use Existing WawApp Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your WawApp project (or create a dev/staging project)
3. Navigate to: **Project Settings** → **Service Accounts** → **Generate New Private Key**
4. Save the downloaded JSON file as:
   ```
   c:\Users\hp\Music\wawapp-mcp-debug-server\config\dev-service-account.json
   ```

### Option B: Create Read-Only Service Account (Recommended)

If you want a dedicated read-only service account:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Navigate to: **IAM & Admin** → **Service Accounts** → **Create Service Account**
4. Name: `wawapp-mcp-debug-readonly`
5. Grant roles:
   - **Datastore Viewer** (for Firestore read-only)
   - **Logging Viewer** (for Cloud Logging read-only)
6. Create key (JSON format)
7. Save as `config/dev-service-account.json`

## Step 3: Verify Configuration

Check that `config/environments.json` has the correct project ID:

```json
{
  "dev": {
    "projectId": "YOUR_FIREBASE_PROJECT_ID",  ← Update this
    "serviceAccountPath": "./config/dev-service-account.json",
    "maxTimeRangeDays": 7,
    "rateLimit": { "perTool": 10, "global": 100 }
  }
}
```

## Step 4: Build and Test

```bash
# Build TypeScript
npm run build

# Test run (should show "MCP server running on stdio")
npm start
```

Expected output:

```
[Firebase] Initialized for project: your-project-id (dev)
[MCP] WawApp Debug Server running on stdio (env: dev, project: your-project-id)
[MCP] Tools registered: 3
```

**Press Ctrl+C to stop the server.**

## Step 5: Configure Claude Desktop

### Windows

1. Open: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add this configuration:

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

3. Save and **restart Claude Desktop**

### macOS

1. Open: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the configuration above (adjust path for macOS)
3. Save and **restart Claude Desktop**

## Step 6: Test in Claude

After restarting Claude Desktop, try this prompt:

```
Can you check if driver with ID "test123" is eligible to see nearby orders?
```

Claude should respond with:

```
I'll check the driver eligibility using the wawapp_driver_eligibility tool...
```

If you see an error like "Tool not found", check:

1. Did you restart Claude Desktop?
2. Is the path in `claude_desktop_config.json` correct and absolute?
3. Did `npm run build` complete successfully?

---

## Troubleshooting

### Error: "Service account file not found"

- Check that `config/dev-service-account.json` exists
- Verify the path in `config/environments.json`

### Error: "Permission denied (Firestore)"

- Ensure service account has `roles/datastore.viewer`
- Check that the Firebase project ID in `environments.json` matches your service account

### No tools showing in Claude

- Verify Claude Desktop config path is **absolute** (not relative)
- Check that `dist/index.js` exists after `npm run build`
- Look for errors in Claude Desktop logs:
  - Windows: `%APPDATA%\Claude\logs`
  - macOS: `~/Library/Logs/Claude`

### Rate limit errors

- Wait 1 minute for rate limit to reset
- Reduce concurrent queries

---

## Next Steps

Once the server is working:

1. **Test with real data**: Use actual driver IDs and order IDs from your Firestore
2. **Add more tools**: See the Phase 2 design doc for the full list of 26 tools
3. **Configure staging/prod**: Add service accounts for other environments
4. **Monitor audit logs**: Check `logs/audit.log` for tool execution history

---

## Security Reminders

✅ **DO**:

- Use read-only service accounts
- Test in dev environment first
- Monitor audit logs
- Keep service account JSON files secure

❌ **DON'T**:

- Commit service account JSON to git (already in .gitignore)
- Use production service accounts for testing
- Share service account credentials
- Grant write permissions to MCP service account

---

## Support

For issues or questions:

1. Check the README.md
2. Review context files in `context/`
3. Check audit logs in `logs/audit.log`
4. Review error messages in terminal output

**The server is designed to be safe and read-only. All tools enforce strict security boundaries.**
