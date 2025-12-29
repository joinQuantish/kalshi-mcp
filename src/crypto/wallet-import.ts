/**
 * Secure Wallet Import System for Kalshi SDK
 * 
 * Allows users to "bring their own wallet" (BYO) by:
 * 1. Encrypting their private key locally with their own password
 * 2. Sending us ONLY the encrypted blob (we never see the raw key)
 * 3. When trading, they provide password → we decrypt → sign → discard
 * 
 * This way users can use their existing Phantom/Solflare wallet while
 * still having agentic trading capabilities.
 */

import crypto from 'crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

export interface WalletImportBundle {
  encryptedKey: string;      // AES-256-GCM encrypted private key
  salt: string;              // Salt used for PBKDF2 key derivation
  iv: string;                // IV used for encryption
  publicKey: string;         // Public key for verification
  version: string;           // Format version for future compatibility
}

export interface DecryptedWallet {
  keypair: Keypair;
  publicKey: string;
}

/**
 * Client-side encryption helper (to be used in user's environment)
 * This generates the encrypted bundle that gets sent to our server
 */
export function encryptWalletForImport(
  privateKeyBase58: string,
  password: string
): WalletImportBundle {
  // Validate the private key
  let keypair: Keypair;
  try {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    keypair = Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    throw new Error('Invalid Solana private key format');
  }

  // Password requirements
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }

  // Generate salt for PBKDF2
  const salt = crypto.randomBytes(32);
  
  // Derive encryption key from password using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    100000, // iterations
    32,     // key length (256 bits for AES-256)
    'sha512'
  );

  // Generate random IV
  const iv = crypto.randomBytes(16);

  // Encrypt the private key
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv) as crypto.CipherGCM;
  let encrypted = cipher.update(privateKeyBase58, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedKey: `${encrypted}:${authTag}`,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    publicKey: keypair.publicKey.toBase58(),
    version: '1.0',
  };
}

/**
 * Server-side decryption (only when user provides password for trading)
 * The decrypted key is used immediately and then discarded from memory
 */
export function decryptImportedWallet(
  bundle: WalletImportBundle,
  password: string
): DecryptedWallet {
  // Parse the encrypted data
  const [encryptedHex, authTagHex] = bundle.encryptedKey.split(':');
  if (!encryptedHex || !authTagHex) {
    throw new Error('Invalid encrypted key format');
  }

  // Reconstruct the derived key
  const salt = Buffer.from(bundle.salt, 'hex');
  const iv = Buffer.from(bundle.iv, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    100000,
    32,
    'sha512'
  );

  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);

  let decrypted: string;
  try {
    decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
  } catch (error) {
    throw new Error('Decryption failed - incorrect password or corrupted data');
  }

  // Reconstruct keypair
  let keypair: Keypair;
  try {
    const privateKeyBytes = bs58.decode(decrypted);
    keypair = Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    throw new Error('Decrypted key is invalid');
  }

  // Verify public key matches
  if (keypair.publicKey.toBase58() !== bundle.publicKey) {
    throw new Error('Public key mismatch - data may be corrupted');
  }

  return {
    keypair,
    publicKey: keypair.publicKey.toBase58(),
  };
}

/**
 * Verify a wallet import bundle without decrypting
 * Used to confirm the bundle is valid before storing
 */
export function verifyWalletImportBundle(bundle: WalletImportBundle): boolean {
  try {
    // Check version
    if (bundle.version !== '1.0') {
      return false;
    }

    // Check all required fields exist
    if (!bundle.encryptedKey || !bundle.salt || !bundle.iv || !bundle.publicKey) {
      return false;
    }

    // Validate public key format
    const publicKeyBytes = bs58.decode(bundle.publicKey);
    if (publicKeyBytes.length !== 32) {
      return false;
    }

    // Validate hex formats
    Buffer.from(bundle.salt, 'hex');
    Buffer.from(bundle.iv, 'hex');
    
    // Validate encrypted key format
    const [encryptedHex, authTagHex] = bundle.encryptedKey.split(':');
    if (!encryptedHex || !authTagHex) {
      return false;
    }
    Buffer.from(encryptedHex, 'hex');
    Buffer.from(authTagHex, 'hex');

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate instructions for users on how to export their Phantom wallet
 */
export function getWalletExportInstructions(): string {
  return `
## How to Export Your Solana Wallet for Secure Import

### From Phantom Wallet:
1. Open Phantom wallet
2. Click the settings icon (gear) in the bottom right
3. Select your wallet
4. Click "Show Secret Recovery Phrase" or "Export Private Key"
5. Enter your password
6. Copy the private key (it's a long string of letters and numbers)

### From Solflare Wallet:
1. Open Solflare
2. Go to Settings → Security
3. Click "Export Private Key"
4. Authenticate with your password
5. Copy the private key

### Security Notes:
- NEVER share your raw private key with anyone
- Always encrypt it with a strong password before importing
- Use a unique password (at least 12 characters)
- Your encrypted key is safe to transmit - we cannot decrypt it without your password
- You'll need to provide your password each time you want to trade

### Encrypt and Import:
\`\`\`javascript
const { encryptWalletForImport } = require('@quantish/kalshi-sdk');

// On YOUR local machine (not on our servers)
const bundle = encryptWalletForImport(
  'your-private-key-here',
  'your-secure-password-12chars-minimum'
);

// Send this bundle to our API - it's safe, we can't decrypt it
console.log(bundle);
\`\`\`
`;
}

