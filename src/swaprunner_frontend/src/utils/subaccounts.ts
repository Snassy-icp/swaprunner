import { Principal } from '@dfinity/principal';

export type SubaccountType = 'hex' | 'bytes' | 'principal' | 'text' | 'number';

// For text validation
const VALID_TEXT_CHARS = /^[a-zA-Z0-9\s\-_.,!@#$%^&*()+=]+$/;
const MAX_TEXT_LENGTH = 32;

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

export function isValidText(value: string): boolean {
  return value.length <= MAX_TEXT_LENGTH && VALID_TEXT_CHARS.test(value);
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

export function textToBytes(text: string): number[] {
  const bytes = new Uint8Array(32);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  bytes.set(encoded.slice(0, 32));
  return Array.from(bytes);
}

export function bytesToText(bytes: number[]): string | null {
  try {
    // Remove trailing zeros
    const nonZeroBytes = bytes.slice(0, bytes.findIndex(b => b === 0) + 1);
    if (nonZeroBytes.length === 0) return null;
    
    // Try to decode as text
    const decoder = new TextDecoder();
    const text = decoder.decode(new Uint8Array(nonZeroBytes));
    
    // Verify the decoded text matches our valid characters
    return VALID_TEXT_CHARS.test(text) ? text : null;
  } catch {
    return null;
  }
}

export function isValidNumber(value: string): boolean {
  try {
    if (!value || value === '0') return false;
    const num = BigInt(value);
    return num > 0 && num <= BigInt('0x' + 'ff'.repeat(32));
  } catch {
    return false;
  }
}

export function numberToBytes(value: string): number[] {
  const bytes = new Uint8Array(32);
  let num = BigInt(value);
  
  // Fill bytes from least significant to most significant
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(num & BigInt(0xff));
    num = num >> BigInt(8);
  }
  
  return Array.from(bytes);
}

export function bytesToNumber(bytes: number[]): string | null {
  try {
    let num = BigInt(0);
    // Convert bytes to BigInt, starting from most significant byte
    for (const byte of bytes) {
      num = (num << BigInt(8)) | BigInt(byte);
    }
    
    // Only return as number if it's non-zero and all leading bytes are zero
    // Find first non-zero byte
    const firstNonZero = bytes.findIndex(b => b !== 0);
    if (firstNonZero === -1 || firstNonZero > 24) { // Allow numbers that fit in last 8 bytes
      return num === BigInt(0) ? null : num.toString();
    }
    return null;
  } catch {
    return null;
  }
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
    case 'text':
      if (!isValidText(value)) {
        if (value.length > MAX_TEXT_LENGTH) {
          return `Text too long. Maximum length is ${MAX_TEXT_LENGTH} characters.`;
        }
        return 'Invalid text. Only alphanumeric characters and common punctuation are allowed.';
      }
      break;
    case 'number':
      if (!isValidNumber(value)) {
        return 'Invalid number. Must be a positive integer within the 32-byte range.';
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
    case 'text':
      return textToBytes(value);
    case 'number':
      return numberToBytes(value);
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

export function formatText(bytes: number[]): string | null {
  return bytesToText(bytes);
}

export function formatNumber(bytes: number[]): string | null {
  return bytesToNumber(bytes);
}

export function formatPrincipal(bytes: number[]): string {
  try {
    // Take first 29 bytes for principal
    const principalBytes = bytes.slice(0, 29);
    const indexBytes = bytes.slice(29);
    
    // Try to create principal from first 29 bytes
    const principal = Principal.fromUint8Array(new Uint8Array(principalBytes));
    
    // Convert index bytes to number
    const index = (indexBytes[0] << 16) | (indexBytes[1] << 8) | indexBytes[2];
    
    // Only show index if non-zero
    if (index > 0) {
      return `${principal.toText()} (index: ${index})`;
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