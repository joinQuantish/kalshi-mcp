# @quantish/kalshi-sdk

<div align="center">
  <h3>🎯 Kalshi Prediction Market Trading SDK</h3>
  <p>Build AI-powered trading agents for Kalshi markets on Solana via DFlow</p>
  
  [![npm version](https://badge.fury.io/js/@quantish%2Fkalshi-sdk.svg)](https://www.npmjs.com/package/@quantish/kalshi-sdk)
  [![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-orange.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0)
</div>

---

## 🌟 Features

- **🔐 Secure Wallet Management**
  - Generate new Solana wallets with encrypted private key storage
  - **Bring Your Own Wallet (BYOW)** - Import existing wallets (Phantom, Solflare) with client-side encryption
  - Private keys are NEVER sent unencrypted over the network

- **📊 Kalshi Market Access**
  - Real-time market discovery via DFlow Prediction Market API
  - Access to all Kalshi events: Politics, Sports, Crypto, Weather, and more
  - Live pricing and volume data

- **💹 Trading Operations**
  - Buy YES/NO outcome tokens
  - Sell positions back to USDC
  - Redeem winnings from settled markets
  - Position and order tracking

- **💱 Token Swaps & Transfers**
  - Swap SOL ↔ USDC via Jupiter Aggregator
  - Send SOL and SPL tokens to any wallet
  - Withdraw funds to external wallets

- **🤖 AI Agent Integration**
  - Full MCP (Model Context Protocol) support
  - Works with Claude, Cursor IDE, and other MCP-compatible AI tools
  - 21 pre-built trading tools

- **🔑 Enterprise Security**
  - AES-256-GCM encryption for all sensitive data
  - PBKDF2 key derivation for imported wallets
  - API key authentication with optional HMAC signing
  - Access code system for controlled registration

---

## 📦 Installation

### For AI Agent Integration (Cursor/Claude)

No installation needed! Just configure your MCP settings.

### For Developers

```bash
npm install @quantish/kalshi-sdk
# or
yarn add @quantish/kalshi-sdk
```

---

## 🚀 Quick Start

### 1. Get Your API Key

Contact Quantish for an access code, then:

```bash
npx quantish-kalshi setup
```

Or via MCP:
```json
{
  "tool": "kalshi_request_api_key",
  "args": {
    "accessCode": "KALSHI-XXXX-XXXX-XXXX",
    "externalId": "your-unique-id"
  }
}
```

### 2. Configure MCP (Cursor IDE)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "quantish_kalshi": {
      "url": "https://kalshi-mcp-server-production.up.railway.app/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

### 3. Start Trading

```
"Search for election prediction markets"
"Buy $10 of YES on the NYC Mayor election"
"Show my current positions"
```

### 4. Pagination

Search results are paginated by default (10 results per page). To get more:

```
"Search for bitcoin markets"                    → First 10 results
"Get more bitcoin markets, offset 10"           → Next 10 results  
"Search for bitcoin with limit 25"              → First 25 results
```

The response includes pagination info:
```json
{
  "events": [...],
  "pagination": {
    "offset": 0,
    "limit": 10,
    "returned": 10,
    "hasMore": true,
    "nextOffset": 10
  }
}
```

---

## 🔐 Secure Wallet Import (BYOW)

Import your existing Phantom/Solflare wallet securely:

### Step 1: Export Your Private Key

In Phantom: Settings → Your Wallets → Export Private Key

### Step 2: Encrypt Locally

```javascript
const crypto = require('crypto');

const privateKey = 'YOUR_BASE58_PRIVATE_KEY';
const password = 'YourSecurePassword123!'; // min 12 chars

const salt = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);
const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');

const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
let encrypted = cipher.update(privateKey, 'utf8', 'hex');
encrypted += cipher.final('hex');
const authTag = cipher.getAuthTag().toString('hex');

console.log({
  encryptedKey: `${encrypted}:${authTag}`,
  salt: salt.toString('hex'),
  iv: iv.toString('hex')
});
```

### Step 3: Import to SDK

```json
{
  "tool": "kalshi_import_wallet",
  "args": {
    "encryptedKey": "...",
    "salt": "...",
    "iv": "...",
    "publicKey": "YOUR_PUBLIC_KEY",
    "password": "YourSecurePassword123!"
  }
}
```

> ⚠️ **Security Note**: Your raw private key NEVER leaves your machine. Only the encrypted bundle is sent to our servers, and we cannot decrypt it without your password.

---

## 🛠️ Available MCP Tools

> **Note:** All tool names are prefixed with `kalshi_` to avoid collisions with other MCPs (like Polymarket).

### Wallet Management
| Tool | Description |
|------|-------------|
| `kalshi_request_api_key` | Get API credentials (requires access code) |
| `kalshi_setup_wallet` | Generate a new Solana wallet |
| `kalshi_import_wallet` | Import existing wallet (encrypted) |
| `kalshi_get_wallet_info` | Get wallet public key and type |
| `kalshi_get_wallet_import_instructions` | Instructions for secure wallet export |
| `kalshi_get_balances` | Check SOL and USDC balances |
| `kalshi_get_token_holdings` | List all SPL token holdings |

### Market Discovery
| Tool | Description |
|------|-------------|
| `kalshi_search_markets` | Search Kalshi events by keyword (paginated, default 10 results) |
| `kalshi_get_market` | Get details for a specific market |
| `kalshi_get_events` | List events with filters (paginated) |
| `kalshi_get_live_data` | Get real-time pricing |

### Trading
| Tool | Description |
|------|-------------|
| `kalshi_get_quote` | Get a swap quote |
| `kalshi_buy_yes` | Buy YES outcome tokens |
| `kalshi_buy_no` | Buy NO outcome tokens |
| `kalshi_sell_position` | Sell outcome tokens |
| `kalshi_redeem_winnings` | Redeem settled positions |
| `kalshi_check_redemption_status` | Check if a market is settled and positions can be redeemed |
| `kalshi_get_redeemable_positions` | List all positions that can be claimed |
| `kalshi_redeem_all_positions` | Redeem all winning positions at once |

### Token Swaps (via Jupiter)
| Tool | Description |
|------|-------------|
| `kalshi_get_swap_quote` | Get a quote for swapping tokens (SOL ↔ USDC) |
| `kalshi_execute_swap` | Execute a token swap via Jupiter |
| `kalshi_swap_sol_to_usdc` | Swap SOL to USDC |
| `kalshi_swap_usdc_to_sol` | Swap USDC to SOL |

### Send/Withdraw Tokens
| Tool | Description |
|------|-------------|
| `kalshi_send_sol` | Send SOL to another wallet |
| `kalshi_send_usdc` | Send USDC to another wallet |
| `kalshi_send_token` | Send any SPL token to another wallet |

### Position Management
| Tool | Description |
|------|-------------|
| `kalshi_get_orders` | List your orders |
| `kalshi_get_positions` | List your positions |

### API Key Management
| Tool | Description |
|------|-------------|
| `kalshi_list_api_keys` | List your API keys |
| `kalshi_create_additional_api_key` | Create a new key |
| `kalshi_revoke_api_key` | Revoke an existing key |

---

## 🏗️ Architecture

<details>
<summary>Click to expand security architecture</summary>

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT (Your Machine)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────────────────────────────┐     │
│  │ Private Key │───▶│ PBKDF2 + AES-256-GCM Encryption    │     │
│  │ (Phantom)   │    │ (100,000 iterations)                │     │
│  └─────────────┘    └──────────────┬──────────────────────┘     │
│                                     │                            │
│                     ┌───────────────▼───────────────┐            │
│                     │ Encrypted Bundle (safe to send)│           │
│                     └───────────────┬───────────────┘            │
└─────────────────────────────────────┼────────────────────────────┘
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     QUANTISH KALSHI SDK                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐     │
│  │ Encrypted       │───▶│ Stored in PostgreSQL           │     │
│  │ Bundle Storage  │    │ (Cannot decrypt without password)│    │
│  └─────────────────┘    └─────────────────────────────────┘     │
│                                                                  │
│  At transaction time:                                            │
│  ┌─────────────────┐    ┌─────────────────────────────────┐     │
│  │ User Password   │───▶│ Decrypt in Memory → Sign → Wipe│     │
│  │ (per request)   │    │ (Private key never persisted)   │     │
│  └─────────────────┘    └─────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

</details>

---

## 🔗 Related Packages

| Package | Description | Blockchain |
|---------|-------------|------------|
| [@quantish/sdk](https://www.npmjs.com/package/@quantish/sdk) | Polymarket trading | Polygon |
| **@quantish/kalshi-sdk** | Kalshi trading | Solana |

---

## 📄 License

PolyForm Noncommercial License 1.0.0 © [Quantish](https://quantish.live)

Free for personal and noncommercial use. For commercial licensing, contact hello@quantish.live.

---

## 🤝 Support

- 📧 Email: hello@quantish.live
- 🐛 Issues: [GitHub Issues](https://github.com/quantish/kalshi-sdk/issues)
- 💬 Discord: Coming soon

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://quantish.live">Quantish</a></sub>
</div>
