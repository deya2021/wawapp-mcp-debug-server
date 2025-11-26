#!/usr/bin/env node

import { startMCPServer } from './server/mcp-server.js';
import { initializeFirebase } from './data-access/firebase-admin.js';

async function main() {
  try {
    // Initialize Firebase
    initializeFirebase();

    // Start MCP server
    await startMCPServer();
  } catch (error: any) {
    console.error('[FATAL] Failed to start MCP server:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
