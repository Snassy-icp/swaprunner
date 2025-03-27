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
   * Returns null if invalid hex
   */
  static hexToBytes(hex: string): Uint8Array | null {
    try {
      hex = hex.replace(/^0x/, ''); // Remove 0x prefix if present
      if (hex.length % 2 !== 0) return null;
      if (!/^[0-9A-Fa-f]*$/.test(hex)) return null;
      
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i/2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  /**
   * Converts a comma-separated byte string to Uint8Array
   * Returns null if invalid
   */
  static parseByteString(input: string): Uint8Array | null {
    try {
      const bytes = input.split(',').map(b => parseInt(b.trim()));
      if (bytes.some(b => isNaN(b) || b < 0 || b > 255)) return null;
      return new Uint8Array(bytes);
    } catch {
      return null;
    }
  }

  /**
   * Main entry point for parsing an account with optional subaccount
   */
  static parseAccount(
    principalText: string, 
    subaccount?: { 
      type: 'hex' | 'bytes' | 'principal'; 
      value: string;
    }
  ): ParsedAccount | null {
    // First try parsing as long account string
    const longAccount = this.parseLongAccountString(principalText);
    if (longAccount) return longAccount;

    // Try parsing as regular principal
    let principal: Principal;
    try {
      principal = Principal.fromText(principalText);
    } catch {
      return null;
    }

    // If no subaccount provided, return just the principal
    if (!subaccount) {
      return { principal };
    }

    // Parse subaccount based on type
    let resolved: Uint8Array | null = null;
    switch (subaccount.type) {
      case 'hex':
        resolved = this.hexToBytes(subaccount.value);
        break;
      case 'bytes':
        resolved = this.parseByteString(subaccount.value);
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

    if (!resolved) return null;

    return {
      principal,
      subaccount: {
        type: subaccount.type,
        value: subaccount.value,
        resolved
      }
    };
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