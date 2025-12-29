#!/usr/bin/env node
/**
 * Quantish Kalshi SDK CLI
 * Easy setup and configuration for Kalshi prediction market trading
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';

const program = new Command();

const KALSHI_MCP_URL = 'https://kalshi-mcp-server-production.up.railway.app';

// ═══════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════

function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, KALSHI_MCP_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function mcpCall(toolName: string, args: any = {}, apiKey?: string) {
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  
  return makeRequest('POST', '/mcp', {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  }, headers);
}

// ═══════════════════════════════════════════════════════════════
// WALLET ENCRYPTION (Client-side)
// ═══════════════════════════════════════════════════════════════

interface WalletImportBundle {
  encryptedKey: string;
  salt: string;
  iv: string;
  version: string;
  publicKey?: string;
}

function encryptWalletForImport(privateKeyBase58: string, password: string): WalletImportBundle {
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }

  const salt = crypto.randomBytes(32);
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(privateKeyBase58, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = (cipher as any).getAuthTag().toString('hex');

  return {
    encryptedKey: `${encrypted}:${authTag}`,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    version: '1.0',
  };
}

// ═══════════════════════════════════════════════════════════════
// CLI COMMANDS
// ═══════════════════════════════════════════════════════════════

program
  .name('quantish-kalshi')
  .description('Quantish Kalshi SDK CLI - Prediction market trading on Solana')
  .version('1.0.0');

// SETUP command
program
  .command('setup')
  .description('Interactive setup wizard for Quantish Kalshi SDK')
  .action(async () => {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     QUANTISH KALSHI SDK - SETUP WIZARD                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query: string) =>
      new Promise<string>((resolve) => rl.question(query, resolve));

    try {
      // Step 1: Get access code
      console.log('Step 1: Access Code');
      console.log('─'.repeat(50));
      const accessCode = await question('Enter your access code (KALSHI-XXXX-XXXX-XXXX): ');
      
      if (!accessCode.startsWith('KALSHI-')) {
        console.error('❌ Invalid access code format');
        rl.close();
        return;
      }

      // Step 2: Get external ID
      console.log('\nStep 2: User Identification');
      console.log('─'.repeat(50));
      const externalId = await question('Enter a unique identifier for your account: ');
      
      if (!externalId || externalId.length < 3) {
        console.error('❌ External ID must be at least 3 characters');
        rl.close();
        return;
      }

      // Step 3: Request API key
      console.log('\n⏳ Requesting API credentials...');
      const result = await mcpCall('request_api_key', {
        accessCode,
        externalId,
        keyName: 'CLI Setup',
      });

      const content = JSON.parse(result.data.result?.content?.[0]?.text || '{}');
      
      if (!content.apiKey) {
        console.error('❌ Failed to get API key:', content.error || result.data.error?.message);
        rl.close();
        return;
      }

      console.log('\n✅ API credentials received!');
      console.log('─'.repeat(50));
      console.log('API Key:', content.apiKey);
      console.log('API Secret:', content.apiSecret);
      console.log('User ID:', content.userId);

      // Step 4: Setup wallet
      console.log('\nStep 3: Wallet Setup');
      console.log('─'.repeat(50));
      const walletChoice = await question('Create new wallet or import existing? (new/import): ');

      if (walletChoice.toLowerCase() === 'import') {
        console.log('\n📋 To import your wallet:');
        console.log('   1. Export your private key from Phantom/Solflare');
        console.log('   2. Run: quantish-kalshi import-wallet');
        console.log('   3. Follow the prompts to securely encrypt and import');
      } else {
        console.log('\n⏳ Creating new Solana wallet...');
        const walletResult = await mcpCall('setup_wallet', {}, content.apiKey);
        const walletContent = JSON.parse(walletResult.data.result?.content?.[0]?.text || '{}');
        
        if (walletContent.wallet) {
          console.log('\n✅ Wallet created!');
          console.log('Public Key:', walletContent.wallet.publicKey);
          console.log('\n💰 Fund this address with SOL and USDC to start trading');
        } else {
          console.log('❌ Failed to create wallet:', walletContent.message || walletContent.error);
        }
      }

      // Step 5: MCP Configuration
      console.log('\n' + '═'.repeat(60));
      console.log('MCP CONFIGURATION FOR CURSOR IDE');
      console.log('═'.repeat(60));
      console.log('\nAdd this to your ~/.cursor/mcp.json:\n');
      console.log(JSON.stringify({
        quantish_kalshi: {
          url: KALSHI_MCP_URL + '/mcp',
          headers: {
            'x-api-key': content.apiKey,
          },
        },
      }, null, 2));

      console.log('\n✅ Setup complete!');

    } catch (error: any) {
      console.error('❌ Setup failed:', error.message);
    } finally {
      rl.close();
    }
  });

// IMPORT-WALLET command
program
  .command('import-wallet')
  .description('Securely import an existing Solana wallet')
  .option('-k, --api-key <key>', 'Your Quantish Kalshi API key')
  .action(async (options) => {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     SECURE WALLET IMPORT                                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('⚠️  SECURITY NOTICE:');
    console.log('   • Your private key will be encrypted LOCALLY');
    console.log('   • Only the encrypted blob is sent to our servers');
    console.log('   • We CANNOT decrypt it without your password');
    console.log('   • You will need your password for every transaction\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query: string) =>
      new Promise<string>((resolve) => rl.question(query, resolve));

    try {
      // Get API key
      let apiKey = options.apiKey;
      if (!apiKey) {
        apiKey = await question('Enter your API key (pk_kalshi_...): ');
      }

      if (!apiKey.startsWith('pk_kalshi_')) {
        console.error('❌ Invalid API key format');
        rl.close();
        return;
      }

      // Get private key
      console.log('\n📝 Enter your Solana private key (Base58 format):');
      console.log('   (This is typically 87-88 characters long)\n');
      const privateKey = await question('Private Key: ');

      if (privateKey.length < 80) {
        console.error('❌ Invalid private key format');
        rl.close();
        return;
      }

      // Get public key for verification
      const publicKey = await question('Public Key (for verification): ');

      // Get password
      console.log('\n🔐 Create a strong password (min 12 characters):');
      console.log('   This password encrypts your private key locally.');
      console.log('   You will need it for EVERY transaction.\n');
      const password = await question('Password: ');

      if (password.length < 12) {
        console.error('❌ Password must be at least 12 characters');
        rl.close();
        return;
      }

      const confirmPassword = await question('Confirm Password: ');

      if (password !== confirmPassword) {
        console.error('❌ Passwords do not match');
        rl.close();
        return;
      }

      // Encrypt locally
      console.log('\n⏳ Encrypting private key locally...');
      const bundle = encryptWalletForImport(privateKey, password);
      bundle.publicKey = publicKey;

      console.log('✅ Private key encrypted (never sent unencrypted)');

      // Send encrypted bundle to server
      console.log('\n⏳ Importing encrypted wallet...');
      const result = await mcpCall('import_wallet', bundle, apiKey);
      const content = JSON.parse(result.data.result?.content?.[0]?.text || '{}');

      if (content.wallet) {
        console.log('\n✅ Wallet imported successfully!');
        console.log('Public Key:', content.wallet.publicKey);
        console.log('Type:', content.wallet.type);
        console.log('\n⚠️  Remember: You need your password for every transaction');
      } else {
        console.error('❌ Import failed:', content.error || result.data.error?.message);
      }

    } catch (error: any) {
      console.error('❌ Import failed:', error.message);
    } finally {
      rl.close();
    }
  });

// CONFIG command
program
  .command('config')
  .description('Generate MCP configuration for Cursor IDE')
  .option('-k, --api-key <key>', 'Your Quantish Kalshi API key')
  .action(async (options) => {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     MCP CONFIGURATION GENERATOR                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    let apiKey = options.apiKey;

    if (!apiKey) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      apiKey = await new Promise<string>((resolve) =>
        rl.question('Enter your API key (pk_kalshi_...): ', resolve)
      );
      rl.close();
    }

    if (!apiKey.startsWith('pk_kalshi_')) {
      console.error('❌ Invalid API key format');
      return;
    }

    console.log('\n📋 CURSOR IDE CONFIGURATION');
    console.log('═'.repeat(50));
    console.log('\nAdd this to ~/.cursor/mcp.json:\n');
    
    const config = {
      quantish_kalshi: {
        url: KALSHI_MCP_URL + '/mcp',
        headers: {
          'x-api-key': apiKey,
        },
      },
    };

    console.log(JSON.stringify(config, null, 2));

    console.log('\n📋 CLAUDE DESKTOP CONFIGURATION');
    console.log('═'.repeat(50));
    console.log('\nAdd this to claude_desktop_config.json:\n');

    const claudeConfig = {
      mcpServers: {
        quantish_kalshi: {
          command: 'curl',
          args: [
            '-X', 'POST',
            '-H', 'Content-Type: application/json',
            '-H', `x-api-key: ${apiKey}`,
            KALSHI_MCP_URL + '/mcp',
          ],
        },
      },
    };

    console.log(JSON.stringify(claudeConfig, null, 2));
  });

// ENABLE command - one-click setup
program
  .command('enable')
  .description('Automatically add Kalshi SDK to Cursor MCP config')
  .option('-k, --api-key <key>', 'Your Quantish Kalshi API key')
  .action(async (options) => {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     ONE-CLICK CURSOR INTEGRATION                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    let apiKey = options.apiKey;

    if (!apiKey) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      apiKey = await new Promise<string>((resolve) =>
        rl.question('Enter your API key (pk_kalshi_...): ', resolve)
      );
      rl.close();
    }

    if (!apiKey.startsWith('pk_kalshi_')) {
      console.error('❌ Invalid API key format');
      return;
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const cursorConfigPath = path.join(homeDir, '.cursor', 'mcp.json');

    try {
      // Read existing config
      let existingConfig: any = { mcpServers: {} };
      if (fs.existsSync(cursorConfigPath)) {
        const rawConfig = fs.readFileSync(cursorConfigPath, 'utf-8');
        existingConfig = JSON.parse(rawConfig);
        if (!existingConfig.mcpServers) {
          existingConfig.mcpServers = {};
        }
      }

      // Backup
      const backupPath = `${cursorConfigPath}.backup.${Date.now()}`;
      if (fs.existsSync(cursorConfigPath)) {
        fs.copyFileSync(cursorConfigPath, backupPath);
        console.log('✅ Backed up existing config to:', backupPath);
      }

      // Add Kalshi SDK
      existingConfig.mcpServers.quantish_kalshi = {
        url: KALSHI_MCP_URL + '/mcp',
        headers: {
          'x-api-key': apiKey,
        },
      };

      // Ensure directory exists
      const cursorDir = path.dirname(cursorConfigPath);
      if (!fs.existsSync(cursorDir)) {
        fs.mkdirSync(cursorDir, { recursive: true });
      }

      // Write config
      fs.writeFileSync(cursorConfigPath, JSON.stringify(existingConfig, null, 2));

      console.log('✅ Kalshi SDK added to Cursor MCP config!');
      console.log('   Config file:', cursorConfigPath);
      console.log('\n⚠️  IMPORTANT: Restart Cursor IDE to apply changes');

    } catch (error: any) {
      console.error('❌ Failed to update config:', error.message);
      console.log('\nManual configuration:');
      console.log(JSON.stringify({
        quantish_kalshi: {
          url: KALSHI_MCP_URL + '/mcp',
          headers: { 'x-api-key': apiKey },
        },
      }, null, 2));
    }
  });

// TEST command
program
  .command('test')
  .description('Test your Kalshi SDK connection and wallet')
  .option('-k, --api-key <key>', 'Your Quantish Kalshi API key')
  .action(async (options) => {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     KALSHI SDK CONNECTION TEST                                ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    let apiKey = options.apiKey;

    if (!apiKey) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      apiKey = await new Promise<string>((resolve) =>
        rl.question('Enter your API key (pk_kalshi_...): ', resolve)
      );
      rl.close();
    }

    console.log('⏳ Testing connection...\n');

    // Test 1: Health check
    console.log('1. Health Check...');
    try {
      const health = await makeRequest('GET', '/health');
      console.log('   Status:', health.status === 200 ? '✅ Healthy' : '❌ Failed');
    } catch (e: any) {
      console.log('   ❌ Error:', e.message);
    }

    // Test 2: MCP Protocol
    console.log('2. MCP Protocol...');
    try {
      const init = await makeRequest('POST', '/mcp', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      console.log('   Status:', init.data.result ? '✅ Working' : '❌ Failed');
    } catch (e: any) {
      console.log('   ❌ Error:', e.message);
    }

    // Test 3: API Key validation
    console.log('3. API Key Validation...');
    try {
      const result = await mcpCall('get_wallet_info', {}, apiKey);
      if (result.data.error?.message?.includes('Invalid')) {
        console.log('   ❌ Invalid API key');
      } else {
        console.log('   ✅ API key is valid');
      }
    } catch (e: any) {
      console.log('   ❌ Error:', e.message);
    }

    // Test 4: Wallet info
    console.log('4. Wallet Status...');
    try {
      const result = await mcpCall('get_wallet_info', {}, apiKey);
      const content = JSON.parse(result.data.result?.content?.[0]?.text || '{}');
      if (content.wallet) {
        console.log('   ✅ Wallet found:', content.wallet.publicKey.substring(0, 20) + '...');
        console.log('   Type:', content.wallet.type);
      } else {
        console.log('   ℹ️  No wallet setup yet');
      }
    } catch (e: any) {
      console.log('   ❌ Error:', e.message);
    }

    // Test 5: Balances
    console.log('5. Balances...');
    try {
      const result = await mcpCall('get_balances', {}, apiKey);
      const content = JSON.parse(result.data.result?.content?.[0]?.text || '{}');
      if (content.balances) {
        console.log('   SOL:', content.balances.sol);
        console.log('   USDC:', content.balances.usdc);
      } else {
        console.log('   ℹ️  No wallet to check balances');
      }
    } catch (e: any) {
      console.log('   ❌ Error:', e.message);
    }

    console.log('\n✅ Connection test complete!');
  });

// BALANCE command
program
  .command('balance')
  .description('Check your wallet balance')
  .option('-k, --api-key <key>', 'Your Quantish Kalshi API key')
  .action(async (options) => {
    let apiKey = options.apiKey;

    if (!apiKey) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      apiKey = await new Promise<string>((resolve) =>
        rl.question('Enter your API key: ', resolve)
      );
      rl.close();
    }

    try {
      const result = await mcpCall('get_balances', {}, apiKey);
      const content = JSON.parse(result.data.result?.content?.[0]?.text || '{}');
      
      if (content.balances) {
        console.log('\n💰 WALLET BALANCES');
        console.log('═'.repeat(30));
        console.log('Public Key:', content.publicKey);
        console.log('SOL:', content.balances.sol);
        console.log('USDC:', content.balances.usdc);
      } else {
        console.log('❌ Could not fetch balances');
      }
    } catch (e: any) {
      console.error('❌ Error:', e.message);
    }
  });

program.parse(process.argv);

