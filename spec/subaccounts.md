# Send Token Dialog - Subaccount Support Specification

This document describes how the Send Token dialog supports subaccounts for ICRC-1 token transfers on the Internet Computer.

## Overview

The Send Token dialog allows users to send tokens to:
1. A simple **Principal ID** (main account)
2. A **Principal ID + Subaccount** (to target a specific subaccount)

Subaccounts are 32-byte arrays that, combined with a principal, form a unique account identifier.

---

## Input Methods for Destination Account

### Method 1: Extended Address Format (Recommended)

The recipient input box accepts the **ICRC-1 Extended Address Format** - a single string that encodes both the principal and subaccount together.

**Format:** `{principal}.{checksum}{encoded_subaccount}`

**Example:**
```
k2t6j-2nvnp-4zjm3-25dtz-6xhaa-c7boj-5gayf-oj3xs-i43lp-teber-6ae.1
```

This format:
- Contains a `.` separator
- The part before the `.` is the principal ID
- The part after the `.` is a checksum followed by the encoded subaccount
- Is parsed using `decodeIcrcAccount()` from the `@dfinity/ledger-icrc` library
- Can be generated using `encodeIcrcAccount()` from the same library

**Auto-Detection:** When users paste an extended address string into the recipient input box, the dialog automatically:
1. Detects the format (by checking for `.` separator)
2. Parses it to extract the principal and subaccount
3. Displays a confirmation message: "Detected extended address format. Resolved to: Principal: {principal}, With subaccount: {hex}"

### Method 2: Principal ID Only

Users can enter a plain principal ID:
```
k2t6j-2nvnp-4zjm3-25dtz-6xhaa-c7boj-5gayf-oj3xs-i43lp-tebert-6ae
```

This sends to the principal's main account (no subaccount).

### Method 3: Principal ID + Manual Subaccount Entry

When "Advanced: Send To Subaccount" is enabled, users can specify a subaccount separately in one of three formats:

#### 3a. Hex String Format
A hexadecimal string representing the subaccount bytes.
- **Example:** `0A1B2C3D4E5F...` (up to 64 hex characters / 32 bytes)
- Shorter strings are **padded with zeros** on the right to reach 32 bytes
- `0x` prefix is optional and will be stripped

#### 3b. Byte Array Format
Comma-separated decimal byte values (0-255).
- **Example:** `1, 2, 3, 4, 5, 6, 7, 8` (up to 32 values)
- Shorter arrays are **padded with zeros** to reach 32 bytes
- Trailing commas are handled gracefully

#### 3c. Principal ID as Subaccount
A principal ID that gets converted to a 32-byte subaccount using `principalToSubAccount()` from `@dfinity/utils`.
- **Example:** `aaaaa-aa` (any valid principal)
- The principal's bytes are used as the subaccount value

---

## Converting to Extended Address Format

The dialog provides a **"Convert to Extended Address String"** button that:
1. Takes the current principal + subaccount combination
2. Encodes it into the extended address format
3. Replaces the recipient input with this single string
4. Hides the subaccount input section

This is useful for:
- Saving/sharing the full address
- Verifying the encoded format before sending

---

## Key Implementation Details

### AccountParser Class (`utils/account.ts`)

```typescript
interface ParsedAccount {
  original?: string;           // Original long account string if provided
  principal: Principal;
  subaccount?: {
    type: 'hex' | 'bytes' | 'principal' | 'long_account';
    value: string;
    resolved: Uint8Array;      // The actual 32-byte subaccount
  };
}

class AccountParser {
  // Parse any input format
  static parseAccount(input: string, subaccountInput?: {...}): ParsedAccount | null;
  
  // Parse extended address format specifically
  static parseLongAccountString(input: string): ParsedAccount | null;
  
  // Encode to extended address format
  static encodeLongAccount(account: ParsedAccount): string;
  
  // Convert hex to bytes (pads to 32 bytes)
  static hexToBytes(hex: string): Uint8Array | null;
  
  // Convert byte string to bytes (pads to 32 bytes)
  static parseByteString(input: string): Uint8Array | null;
}
```

### Parsing Flow

1. First, try to parse input as a plain Principal ID
2. If that fails, try to parse as an extended address format (check for `.`)
3. If subaccount input is provided separately, parse and resolve it based on type

### ICRC-1 Transfer Call

The actual transfer uses the ICRC-1 standard with separate fields:

```typescript
icrc1_transfer({
  to: { 
    owner: Principal,              // Destination principal
    subaccount: [] | [number[]]    // Optional 32-byte subaccount
  },
  amount: bigint,
  fee: [bigint],
  memo: [],
  from_subaccount: [] | [number[]], // Optional source subaccount
  created_at_time: [],
});
```

---

## Dependencies

```json
{
  "@dfinity/ledger-icrc": "^x.x.x",  // For decodeIcrcAccount, encodeIcrcAccount
  "@dfinity/utils": "^x.x.x",        // For principalToSubAccount
  "@dfinity/principal": "^x.x.x"     // For Principal class
}
```

### Key Functions from Libraries

- `decodeIcrcAccount(string)` - Parses extended address format, returns `{ owner: Principal, subaccount?: number[] }`
- `encodeIcrcAccount({ owner, subaccount })` - Creates extended address string
- `principalToSubAccount(Principal)` - Converts a principal to a 32-byte subaccount

---

## UI/UX Considerations

1. **Auto-detection feedback**: When an extended address is detected, show clear feedback about what was parsed
2. **Subaccount preview**: Show the resolved 32-byte hex value before sending
3. **Confirmation screen**: Display the full account breakdown (principal + subaccount separately)
4. **DIP20 warning**: If token is DIP20 standard, warn that subaccounts are not supported
5. **Validation**: Validate subaccount input in real-time and show appropriate error messages

---

## Token Standard Support

| Standard | Subaccount Support |
|----------|-------------------|
| ICRC-1   | ✅ Full support   |
| ICRC-2   | ✅ Full support   |
| DIP20    | ❌ Not supported (warn user) |

---

## Example Extended Addresses

| Description | Extended Address |
|-------------|-----------------|
| Principal with subaccount 1 | `k2t6j-2nvnp-4zjm3-25dtz-6xhaa-c7boj-5gayf-oj3xs-i43lp-tebet-cae.1` |
| Principal with hex subaccount | `k2t6j-2nvnp-4zjm3-25dtz-6xhaa-c7boj-5gayf-oj3xs-i43lp-tebet-cae.7f3c2a...` |

---

## Summary

To support subaccounts in a Send Token dialog:

1. **Accept multiple input formats** in the recipient field:
   - Plain principal ID
   - Extended address format (principal.checksum+subaccount)

2. **Provide optional manual subaccount entry** with support for:
   - Hex string
   - Byte array
   - Principal ID (converted to subaccount)

3. **Use the `@dfinity/ledger-icrc` library** for encoding/decoding the extended address format

4. **Validate and preview** the resolved account before sending

5. **Pass subaccount separately** in the ICRC-1 transfer call's `to.subaccount` field
