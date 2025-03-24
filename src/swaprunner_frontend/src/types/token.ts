import { Principal } from '@dfinity/principal';

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  fee: bigint;
  logo?: string;
  hasLogo?: boolean;
  standard: string;
}

// This matches the Candid format from the ICRC1 ledger
export type MetadataValue = 
  | { Text: string }
  | { Nat: bigint }
  | { Int: bigint }
  | { Blob: number[] };

export type MetadataRecord = [string, MetadataValue];
export type MetadataResponse = MetadataRecord[];

export interface TokenInfo {
  canisterId: string;
  metadata?: TokenMetadata;
  isLoading?: boolean;
  error?: string;
} 