import { Principal } from '@dfinity/principal';

export type SubaccountType = 'hex' | 'bytes' | 'principal';

export function isValidHexString(value: string): boolean {
  // Allow partial hex strings, validate characters and max length
  return /^[0-9a-fA-F]*$/.test(value) && value.length <= 64;
}

export function isValidByteArray(value: string): boolean {
  try {
    // Remove trailing comma(s) and whitespace
    value = value.trim().replace(/,+$/, '');
    if (!value) return true; // Empty string is valid, will be padded with zeros
    
    const bytes = value.split(',').map(b => parseInt(b.trim()));
    // Check max length and byte validity
    return bytes.length <= 32 && bytes.every(b => !isNaN(b) && b >= 0 && b <= 255);
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
        if (value.length > 64) {
          return 'Hex string too long. Maximum length is 64 characters (32 bytes).';
        }
        return 'Invalid hex string. Must contain only hex digits (0-9, a-f).';
      }
      break;
    case 'bytes':
      if (!isValidByteArray(value)) {
        const bytes = value.trim().replace(/,+$/, '').split(',').filter(b => b.trim());
        if (bytes.length > 32) {
          return 'Byte array too long. Maximum length is 32 bytes.';
        }
        return 'Invalid byte array. Must be comma-separated numbers between 0 and 255.';
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
      return parseByteString(value);
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
    // Take first 29 bytes for principal
    const principalBytes = bytes.slice(0, 29);
    const indexBytes = bytes.slice(29);
    
    // Try to create principal from first 29 bytes
    const principal = Principal.fromUint8Array(new Uint8Array(principalBytes));
    
    // Check if any trailing bytes are non-zero
    const hasIndex = indexBytes.some(b => b !== 0);
    
    if (hasIndex) {
      // Format index bytes as hex
      const indexHex = indexBytes.map(b => b.toString(16).padStart(2, '0')).join('');
      return `${principal.toText()} (index: 0x${indexHex})`;
    } else {
      return principal.toText();
    }
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