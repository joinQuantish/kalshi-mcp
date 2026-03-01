#!/bin/bash
set -e

echo "Starting Kalshi MCP Server..."

# Just start the server directly - database schema is already in sync
echo "Starting Node.js server..."
exec node dist/index.js
