import { Principal } from '@dfinity/principal';

export type SubaccountType = 'hex' | 'bytes' | 'principal';

export function isValidHexString(value: string): boolean {
  // Allow partial hex strings, just validate characters
  return /^[0-9a-fA-F]*$/.test(value);
}

export function isValidByteArray(value: string): boolean {
  try {
    const bytes = value.split(',').map(b => parseInt(b.trim()));
    // Allow partial arrays, just check each byte is valid
    return bytes.every(b => !isNaN(b) && b >= 0 && b <= 255);
  } catch {
    return false;
  }
}

export function isValidPrincipal(value: string): boolean {
  try {
    Principal.fromText(value);
    return true;
  } catch {
    return false;
  }
}

export function hexToBytes(hex: string): number[] {
  // Pad hex string to 64 characters (32 bytes)
  hex = hex.padEnd(64, '0');
  
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i/2] = parseInt(hex.slice(i, i + 2) || '00', 16);
  }
  return Array.from(bytes);
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function principalToBytes(principal: string): number[] {
  const p = Principal.fromText(principal);
  const bytes = [...p.toUint8Array()];
  // Pad to 32 bytes
  return Array(32).fill(0).map((_, i) => bytes[i] || 0);
}

export function validateSubaccountValue(type: SubaccountType, value: string): string | null {
  switch (type) {
    case 'hex':
      if (!isValidHexString(value)) {
        return 'Invalid hex string. Must contain only hex digits (0-9, a-f).';
      }
      break;
    case 'bytes':
      if (!isValidByteArray(value)) {
        return 'Invalid byte array. Must be 32 comma-separated numbers between 0 and 255.';
      }
      break;
    case 'principal':
      if (!isValidPrincipal(value)) {
        return 'Invalid principal ID.';
      }
      break;
    default:
      return 'Invalid subaccount type.';
  }
  return null;
}

export function convertToBytes(type: SubaccountType, value: string): number[] {
  switch (type) {
    case 'hex':
      return hexToBytes(value);
    case 'bytes':
      return value.split(',').map(b => parseInt(b.trim()));
    case 'principal':
      return principalToBytes(value);
    default:
      throw new Error('Invalid subaccount type');
  }
}

export function formatBytes(bytes: number[]): string {
  return bytes.join(', ');
}

export function formatHex(bytes: number[]): string {
  return bytesToHex(bytes);
}

export function formatPrincipal(bytes: number[]): string {
  try {
    const principal = Principal.fromUint8Array(new Uint8Array(bytes));
    return principal.toText();
  } catch {
    return 'Invalid principal';
  }
}

export function parseByteString(input: string): number[] {
  try {
    // Remove trailing comma(s) and any whitespace
    input = input.trim().replace(/,+$/, '');
    
    // Handle empty string case
    if (!input) {
      return Array(32).fill(0);
    }

    const bytes = input.split(',').map(b => parseInt(b.trim()));
    if (bytes.some(b => isNaN(b) || b < 0 || b > 255)) {
      throw new Error('Invalid byte values');
    }
    
    // Create 32-byte array and copy input bytes
    const result = new Uint8Array(32);
    result.set(bytes); // Remaining bytes will be 0 by default
    return Array.from(result);
  } catch (error) {
    throw new Error('Failed to parse byte string');
  }
} 