# @quantish/kalshi-server

Self-hosted Kalshi MCP server for trading on Kalshi markets via DFlow on Solana.

## Overview

This package provides an MCP (Model Context Protocol) server that enables AI agents to trade on Kalshi prediction markets through the DFlow protocol on Solana.

## Features

- **Full Kalshi Trading** - Buy/sell on any Kalshi market
- **Solana Wallet Management** - Generate and manage Solana wallets
- **DFlow Integration** - Trade via DFlow's Solana infrastructure
- **MCP Compatible** - Works with Claude, Quantish Agent, and any MCP client
- **Self-Hostable** - Run on Railway, Fly.io, or any Node.js host

## Quick Start

```bash
git clone https://github.com/joinQuantish/kalshi-mcp
cd kalshi-mcp
npm install
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 64-character hex string for wallet encryption |
| `JWT_SECRET` | Yes | Secret for API key generation |
| `DFLOW_API_KEY` | Yes | DFlow API key (see below) |
| `SOLANA_RPC_URL` | No | Solana RPC endpoint (defaults to mainnet) |
| `PORT` | No | Server port (defaults to 3000) |

### Obtaining a DFlow API Key

> **Important:** DFlow access is **not permissionless**. To self-host this server, you must obtain an API key directly from the DFlow team.

1. Visit [dflow.net](https://dflow.net) and contact their team
2. Request API access for your organization/project
3. Once approved, you'll receive a `DFLOW_API_KEY`
4. Add this key to your environment variables

**Using Quantish's public servers?** You don't need your own DFlow key - we handle this for you. Just use the default MCP endpoints provided by the Quantish Agent.

### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database Setup

Any PostgreSQL database works. Options:

| Provider | Notes |
|----------|-------|
| **Railway** | Add PostgreSQL service, copy `DATABASE_URL` from variables |
| **Supabase** | Free tier at [supabase.com](https://supabase.com), copy connection string from Settings > Database |
| **Neon** | Serverless Postgres at [neon.tech](https://neon.tech), free tier available |
| **Local Docker** | `docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres` |

Set your `DATABASE_URL` then run:

```bash
# Generate Prisma client
npm run db:generate

# Create tables
npm run db:push
```

## Available Tools

### Account Management
- `kalshi_signup` - Create account with Solana wallet
- `kalshi_get_wallet_info` - Get wallet address and balances
- `kalshi_export_private_key` - Export wallet private key

### Market Discovery
- `kalshi_search_markets` - Search Kalshi markets
- `kalshi_get_market` - Get market details by ticker
- `kalshi_get_events` - Browse market categories
- `kalshi_get_live_data` - Get live market data

### Trading
- `kalshi_get_quote` - Get quote for trade
- `kalshi_place_order` - Execute trade on Solana
- `kalshi_get_positions` - View current positions

### Market Operations
- `kalshi_check_market_initialization` - Check if market is tokenized
- `kalshi_initialize_market` - Initialize market on-chain
- `kalshi_check_redemption_status` - Check if market can be redeemed

## API Format

The server exposes a JSON-RPC 2.0 endpoint at `/mcp`:

```bash
curl -X POST https://your-server.com/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "kalshi_get_positions",
      "arguments": {}
    },
    "id": 1
  }'
```

## Connecting to Quantish Agent

Configure the CLI to use your server:

```bash
export KALSHI_MCP_URL=https://your-server.com/mcp
export KALSHI_API_KEY=your-api-key
quantish
```

Or add to `~/.quantish/config.json`:

```json
{
  "kalshiMcpUrl": "https://your-server.com/mcp",
  "kalshiApiKey": "your-api-key"
}
```

## Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:push

# Start development server
npm run dev
```

## Resources

- **NPM**: [@quantish/kalshi-server](https://www.npmjs.com/package/@quantish/kalshi-server)
- **GitHub**: [joinQuantish/kalshi-mcp](https://github.com/joinQuantish/kalshi-mcp)
- **Quantish Agent**: [@quantish/agent](https://www.npmjs.com/package/@quantish/agent)
- **DFlow Docs**: [docs.dflow.net](https://docs.dflow.net)

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

**Free for personal use, research, and non-commercial purposes.** Commercial use requires explicit permission from Quantish Inc. Contact hello@quantish.live for commercial licensing.

---

Built by [Quantish Inc.](https://quantish.live)



