import { Principal } from '@dfinity/principal';
import { decodeIcrcAccount, encodeIcrcAccount } from "@dfinity/ledger-icrc";
import { principalToSubAccount } from "@dfinity/utils";

export interface ParsedAccount {
  original?: string; // Original long account string if provided
  principal: Principal;
  subaccount?: {
    type: 'hex' | 'bytes' | 'principal' | 'long_account';
    value: string;
    resolved: Uint8Array; // The actual subaccount bytes
  };
}

export class AccountParser {
  /**
   * Attempts to parse a string as a long account string.
   * Returns null if the string is not in valid long account format.
   */
  static parseLongAccountString(input: string): ParsedAccount | null {
    // Quick check - if it doesn't contain a separator, it's not a long account
    if (!input.includes('.')) {
      return null;
    }

    try {
      const decoded = decodeIcrcAccount(input);
      return {
        original: input,
        principal: decoded.owner,
        subaccount: decoded.subaccount ? {
          type: 'long_account',
          value: input,
          resolved: new Uint8Array(decoded.subaccount)
        } : undefined
      };
    } catch {
      return null;
    }
  }

  /**
   * Converts a hex string to Uint8Array
   * Returns null if invalid hex or exceeds 32 bytes
   * Pads with zeros if less than 32 bytes
   */
  static hexToBytes(hex: string): Uint8Array | null {
    try {
      hex = hex.replace(/^0x/, ''); // Remove 0x prefix if present
      if (!/^[0-9A-Fa-f]*$/.test(hex)) return null;
      
      // Check if hex string would exceed 32 bytes
      if (hex.length > 64) return null;
      
      // Pad with zeros if less than 32 bytes
      hex = hex.padEnd(64, '0');
      
      const bytes = new Uint8Array(32); // Always create 32-byte array
      for (let i = 0; i < 64; i += 2) {
        bytes[i/2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  /**
   * Converts a comma-separated byte string to Uint8Array
   * Returns null if invalid or exceeds 32 bytes
   * Pads with zeros if less than 32 bytes
   * Handles trailing commas gracefully
   */
  static parseByteString(input: string): Uint8Array | null {
    try {
      // Remove trailing comma(s) and any whitespace
      input = input.trim().replace(/,+$/, '');
      
      // Handle empty string case
      if (!input) {
        return new Uint8Array(32);
      }

      const bytes = input.split(',').map(b => parseInt(b.trim()));
      if (bytes.some(b => isNaN(b) || b < 0 || b > 255)) return null;
      
      // Check if input would exceed 32 bytes
      if (bytes.length > 32) return null;
      
      // Create 32-byte array and copy input bytes
      const result = new Uint8Array(32);
      result.set(bytes); // Remaining bytes will be 0 by default
      return result;
    } catch {
      return null;
    }
  }

  static parseSubaccount(subaccount: { type: 'hex' | 'bytes' | 'principal', value: string }): { type: 'hex' | 'bytes' | 'principal', value: string, resolved: Uint8Array } | undefined {
    // Parse subaccount based on type
    let resolved: Uint8Array | null = null;
    switch (subaccount.type) {
      case 'hex':
        resolved = AccountParser.hexToBytes(subaccount.value);
        break;
      case 'bytes':
        resolved = AccountParser.parseByteString(subaccount.value);
        break;
      case 'principal':
        try {
          const subPrincipal = Principal.fromText(subaccount.value);
          resolved = principalToSubAccount(subPrincipal);
        } catch {
          resolved = null;
        }
        break;
    }

    if (!resolved) return undefined;

    return {
      type: subaccount.type,
      value: subaccount.value,
      resolved
    };
  }

  /**
   * Main entry point for parsing an account with optional subaccount
   */
  static parseAccount(input: string, subaccountInput?: { type: 'hex' | 'bytes' | 'principal', value: string }): ParsedAccount | null {
    // First try to parse as a principal
    try {
      const principal = Principal.fromText(input);
      return {
        original: undefined,
        principal,
        subaccount: subaccountInput ? AccountParser.parseSubaccount(subaccountInput) : undefined
      };
    } catch {}

    // Then try as a long account string
    const longAccount = AccountParser.parseLongAccountString(input);
    if (longAccount) {
      return longAccount;
    }

    return null;
  }

  /**
   * Encodes a parsed account back to a long account string
   */
  static encodeLongAccount(account: ParsedAccount): string {
    return encodeIcrcAccount({
      owner: account.principal,
      subaccount: account.subaccount?.resolved
    });
  }
} 