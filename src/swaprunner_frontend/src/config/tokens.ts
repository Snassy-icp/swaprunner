import { Principal } from '@dfinity/principal';

export interface Token {
  symbol: string;
  name: string;
  canisterId: string;
}
/*
export const KNOWN_TOKENS: Token[] = [
  {
    symbol: 'ICP',
    name: 'Internet Computer',
    canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai'
  },
  {
    symbol: 'CHAT',
    name: 'CHAT',
    canisterId: '2ouva-viaaa-aaaaq-aaamq-cai'
  },
  {
    symbol: 'DKP',
    name: 'Draggin Karma Points',
    canisterId: 'zfcdd-tqaaa-aaaaq-aaaga-cai'
  },
  {
    symbol: 'KINIC',
    name: 'KINIC',
    canisterId: '73mez-iiaaa-aaaaq-aaasq-cai'
  }
];
*/
export const isValidPrincipal = (text: string): boolean => {
  try {
    Principal.fromText(text);
    return true;
  } catch {
    return false;
  }
}; 