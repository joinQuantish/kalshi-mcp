# @quantish/kalshi-server

Self-hosted Kalshi MCP server for trading on Kalshi markets via DFlow on Solana.

## Overview

This package provides an MCP (Model Context Protocol) server that enables AI agents to trade on Kalshi prediction markets through the DFlow protocol on Solana.

## Features

- **Full Kalshi Trading** - Buy/sell on any Kalshi market
- **Solana Wallet Management** - Generate and manage Solana wallets
- **DFlow Integration** - Trade via DFlow's Solana infrastructure
- **Jupiter Swaps** - Swap SOL/USDC via Jupiter Aggregator
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
| `DFLOW_API_KEY` | No | DFlow API key (optional, for authenticated endpoints) |
| `JUPITER_API_KEY` | No | Jupiter API key from [portal.jup.ag](https://portal.jup.ag) for swap tools |
| `SOLANA_RPC_URL` | No | Solana RPC endpoint (defaults to mainnet) |
| `ADMIN_API_KEY` | No | Admin API key for administrative endpoints |
| `PORT` | No | Server port (defaults to 3002) |

### Obtaining API Keys

**DFlow API Key:**
> DFlow access may require approval. Contact the DFlow team at [dflow.net](https://dflow.net) for API access.

**Jupiter API Key:**
> Get a free API key from [portal.jup.ag](https://portal.jup.ag) (Basic tier, 1 RPS). Required for swap functionality.

**Using Quantish's public servers?** You don't need your own keys - we handle this for you. Just use the default MCP endpoints provided by the Quantish Agent.

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
- `kalshi_request_api_key` - Request API key with access code
- `kalshi_get_wallet_info` - Get wallet address and type
- `kalshi_get_wallet_status` - Full wallet status including balances
- `kalshi_get_balances` - Get SOL and USDC balances
- `kalshi_get_deposit_address` - Get address for deposits
- `kalshi_export_private_key` - Export wallet private key
- `kalshi_import_private_key` - Import existing Solana wallet

### Market Discovery
- `kalshi_search_markets` - Search Kalshi markets by keyword
- `kalshi_get_market` - Get market details by ticker
- `kalshi_get_event` - Get event with all nested markets
- `kalshi_get_events` - Browse events with filters
- `kalshi_get_live_data` - Get live pricing data

### Trading
- `kalshi_get_quote` - Get quote for prediction market trade
- `kalshi_buy_yes` - Buy YES outcome tokens
- `kalshi_buy_no` - Buy NO outcome tokens
- `kalshi_sell_position` - Sell outcome tokens back to USDC
- `kalshi_get_positions` - View current positions
- `kalshi_get_orders` - View order history

### Swaps (SOL/USDC)
- `kalshi_get_swap_quote` - Get Jupiter swap quote
- `kalshi_execute_swap` - Execute token swap
- `kalshi_swap_sol_to_usdc` - Swap SOL to USDC
- `kalshi_swap_usdc_to_sol` - Swap USDC to SOL

### Transfers
- `kalshi_send_sol` - Send SOL to another wallet
- `kalshi_send_usdc` - Send USDC to another wallet
- `kalshi_send_token` - Send any SPL token

### Market Operations
- `kalshi_check_market_initialization` - Check if market is tokenized on-chain
- `kalshi_initialize_market` - Initialize market on-chain (pays SOL fee)
- `kalshi_check_redemption_status` - Check if market is settled
- `kalshi_get_market_by_mint` - Look up market by token mint

### Redemption
- `kalshi_get_redeemable_positions` - Find positions ready to claim
- `kalshi_redeem_winnings` - Redeem specific winning position
- `kalshi_redeem_all_positions` - Redeem all winning positions at once

### API Key Management
- `kalshi_list_api_keys` - List your API keys
- `kalshi_create_additional_api_key` - Create new API key
- `kalshi_revoke_api_key` - Revoke an API key

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
- **DFlow Docs**: [pond.dflow.net](https://pond.dflow.net)
- **Jupiter Portal**: [portal.jup.ag](https://portal.jup.ag)

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

**Free for personal use, research, and non-commercial purposes.** Commercial use requires explicit permission from Quantish Inc. Contact hello@quantish.live for commercial licensing.

---

Built by [Quantish Inc.](https://quantish.live)
