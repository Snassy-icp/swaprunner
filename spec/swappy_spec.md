# Swaprunner - Multi-DEX Token Swapping Application

GLOBAL RULES, AI MUST FOLLOW THESE RULES:
FOR ALL EDITS, THE AI MUST ENUMERATE THE RELEVANT RULES IT HAS ADHERED TO, WHICH ONES IT HAS BROKEN, AND WHY. 
SWAPRUNNER IS A FINANCIAL APPLICATION, AND ALL TESTING IS DONE ON MAINNET, WITH REAL MONEY. THUS, ALL EDITS MUST BE EXTREMELY CONSERVATIVE AND THOUGHTFUL.
0. ALL EDITS MUST BE FOCUSED AND MINIMAL, AVOIDING MODIFYING OR DELETING CODE. ASSUME ALL CODE IS WELL TESTED AND EXPENSIVE. THE GOAL IS FOR EVERY GIT DIFF TO BE AS MINIMAL AS POSSIBLE WHEN WE COMMIT.
1. Before modifying or adding any code, make sure that the spec captures the new requirements/insights that led to the changes, and that the whole spec remains consistent. Pure, conflict free additions to the spec can just be added, but any modifications or additions to the spec that imply conflict with existing spec must be approved by the user.
2. NEVER use Tailwind for ANYTHING
3. Be extremely conservative with dependencies. All new dependencies MUST be explicitly approved before addition.
4. Null and Optional Handling in JavaScript-Motoko Interop:
   - Motoko `null` values are represented as empty arrays `[]` in JavaScript
   - Motoko optional values are wrapped in arrays `[value]` in JavaScript
   - Example: `?Text` in Motoko becomes `[]` (none) or `["my text"]` (some) in JavaScript
5. BigInt (Nat) Handling in JavaScript-Motoko Interop:
   - ALL numeric IDs from Motoko are BigInt (even if they look like regular numbers)
   - When sending IDs to Motoko: ALWAYS convert using `BigInt(value)`
   - When receiving IDs from Motoko: ALWAYS convert using `Number(value)` for display/comparison
   - When storing IDs in state: Store as strings to avoid precision loss
   - HTML form elements (like select) can only handle strings/numbers, not BigInt
6. Amount Notation Rule:
   - ALL parameters representing token amounts in base units (e.g. e8s for 8 decimalcn tokens) MUST use the suffix `_e8s`
   - This is the only Hungarian notation allowed in the codebase
   - This rule applies to ALL interfaces, types, and variable namesa
   - Example: `amount_e8s: bigint` for an amount in base units
   
7. Token Amount Handling Rule:
   - ALL token amounts MUST be stored and processed as e8s integers (bigint) throughout the application
   - Only convert to decimal representation when displaying to users
   - When converting for display:
     - Use the token's decimals from metadata
     - Format with appropriate decimal places
     - Remove trailing zeros
   - Example: Store 123456789 (e8s), display as "1.23456789" tokens
   
8. Token Metadata and Logo Loading Rules:
   A. Metadata Loading and Caching:
      - Single Source of Truth:
        * Backend whitelist + custom token list
        * ALL metadata loaded at startup (blocking)
        * App MUST wait for completion before UI render
      - Caching Requirements:
        * ALL metadata stored in localStorage during startup
        * Cache includes timestamp for 24-hour validity
        * Fresh backend fetch only on cache expiry during page refresh
      - Error Handling:
        * Missing cache entry = CRASH
        * Invalid metadata = CRASH
        * NO fallbacks or defaults allowed
        * NO background refresh mechanisms
   
   B. Logo Loading:
      - Single Source: Paginated logo loading at startup
      - Non-blocking: UI can proceed before completion
      - Components MUST handle logo loading state with placeholders
      - Background-only operation
   
   C. API Call Restrictions:
      - NO direct canister calls for metadata (icrc1_metadata)
      - NO direct canister calls for logos
      - NO ICPSwap getLogo calls
      - Token actor creation allowed ONLY for non-metadata operations
   
   D. Implementation Requirements:
      - Startup Sequence:
        1. Load & cache metadata (blocking)
        2. Start logo loading (non-blocking)
        3. Render UI
      - Cache Operations:
        * READ: Synchronous, crash on miss
        * WRITE: Only during startup metadata load
        * REFRESH: Only on cache expiry during page load

9. Token Metadata Handling Rule:
   - ALL token-specific parameters (decimals, fees, etc.) MUST be retrieved from token metadata
   - NO hardcoded values for token parameters anywhere in the codebase
   - ALL token metadata MUST be fetched via tokenService.getMetadata()
   - Token amount formatting MUST use the specific token's decimals from metadata
   - Caching of metadata is allowed but MUST have proper invalidation
   
10. Storage and State Management Rules:
   - Active distributions stored in Local Storage only
   - Transaction history stored in backend
   - User must keep browser open during distributions
   - Clear warning messages about browser-closure implications
   
11. Network and Timeout Rules:
   - Never implement custom timeouts for IC calls
   - Let Internet Computer handle all call timeouts natively
   - Show appropriate loading states during calls
   - Consider DEX "unavailable" only after IC reports actual failures
   
12. Token Management Rules:
   - Maintain internal list of supported ICRC-1 tokens
   - Support trading even if token only available on one DEX
   - Quote failures on one DEX don't prevent trading on the other
   - Token Sources and Priority:
     1. Custom Tokens (highest priority):
        * User-added tokens via admin interface
        * Stored in backend custom tokens list
     2. Whitelisted Tokens (medium priority):
        * Manually vetted tokens
        * Added through admin interface
        * Full metadata validation
     3. ICPSwap Trusted Tokens (lowest priority):
        * Bulk-copied from ICPSwap's trusted token list
        * Updated via admin interface
        * No duplicate display if token exists in higher priority list
   - ICPSwap Token Copy Feature:
     * Backend maintains separate map `tokenMetadataEntriesICPSwap`
     * Admin function `copy_icpswap_trusted_tokens` to bulk import
     * Query method to retrieve copied token list
     * Frontend merges all token sources with priority order
     * Duplicate tokens only shown from highest priority source
     * Admin UI includes button to trigger bulk copy
   
13. UI Layout Rules:
   - ICPSwap card always on left
   - Kong Swap card always on right
   - Better price visually highlighted
   - No swap/reorder functionality between cards
   
14. Token Selection and Balance Rules:
   - Single token pair selection at the top of UI, shared across both DEXes
   - Token swap button to quickly reverse token pair (e.g., ICP/DKP ↔ DKP/ICP)
   - Display user balance for both tokens
   - Balance fetched via icrc1_balance_of calls to respective token ledgers
   - Balance updates when:
     - User logs in/out
     - Token pair changes
     - After successful swaps
   - Balance display requires Internet Identity login
   
15. Environment Variable Rules:
    - Use process.env for environment variables
    - Add @types/node for TypeScript support
    - Do not use import.meta.env or other alternatives

16. All Token metadata in the frontend MUST be fetched via the centralized getMetadata method in token.ts!
   
17. Type Conversion and Fixing Rules:
    - When fixing type errors, NEVER cascade changes through the codebase
    - Fix type mismatches at the boundary where they occur
    - Keep raw bigint values for all amount comparisons and calculations
    - Only convert amounts to strings for display purposes
    - When encountering type errors, prefer local fixes over systemic changes
    - Document clearly when type conversion is necessary (e.g. UI display)

18. Avoid using the "continue" keyword in Motoko.

## Overview
swaprunner is a user-friendly decentralized exchange (DEX) aggregator for the Internet Computer, focusing on providing users with the best token swap rates by comparing and utilizing ICPSwap and Kong Swap. The application emphasizes simplicity while offering powerful features for optimizing large trades through parallel or time-distributed swapping strategies.

## Core Features

### 1. Price Comparison and Trading Features
- Simple Swap:
  - Real-time price comparison between ICPSwap and Kong Swap
  - Automatic selection of best rate
  - Manual DEX selection with warning for suboptimal choice
  - Standard slippage protection
  - Basic price impact warnings

- ICPSwap Fee Mechanics and Quote Handling:
  1. Fee Application Rules:
     - Transfer Fee:
       * Applied ON TOP of the transfer amount
       * Example: To transfer 100 tokens with 1 token fee
       * User's wallet is debited 101 tokens
       * Full 100 tokens arrive in undeposited balance
     - Deposit Fee:
       * Deducted FROM the amount being deposited
       * Example: Depositing 100 undeposited tokens with 1 token fee
       * 99 tokens end up in deposited balance
       * 1 token is consumed by fee

  2. Quote Mechanics:
     - ICPSwap quotes assume deposited balance scenario
     - Quotes do not account for potential deposit fees
     - Example:
       * User requests quote for 100 tokens
       * Quote received for full 100 tokens
       * If deposit needed, only 99 tokens will be available for swap

  3. Minimum Amount Calculations:
     - Must account for deposit fee when no deposited balance exists
     - Calculation steps:
       1. Get quote for intended swap amount
       2. If deposit needed:
          * Adjust quote by (amount - fee)/amount ratio
          * Then apply slippage to adjusted amount
       3. If using existing deposited balance:
          * Apply slippage directly to quote
     - This ensures accurate minimum amounts regardless of deposit status

  4. Implementation Requirements:
     - Track deposited/undeposited balances separately
     - Check balances before calculating minimums
     - Use token metadata for accurate fee information
     - Apply fee adjustments before slippage calculations
     - Never assume quotes include fee impacts

- Kong Fee Mechanics and Quote Handling:
  1. Fee Application Rules:
     - Transfer Fee:
       * Applied ON TOP of the transfer amount
       * Example: To transfer 100 tokens with 1 token fee
       * User's wallet is debited 101 tokens
       * Full 100 tokens arrive at Kong
     - No deposit step required:
       * All 100 tokens are available for trading immediately
       * No additional fees taken from the transfer amount

  2. Quote Mechanics:
     - Kong quotes reflect exact swap amount
     - No need to adjust for fees as transfer amount is preserved
     - Example:
       * User requests quote for 100 tokens
       * Quote received for full 100 tokens
       * Full 100 tokens will be used in swap
     - Slippage handling:
       * Kong takes slippage tolerance parameter
       * No minimum amount needed (unlike ICPSwap)
       * Kong internally ensures slippage protection

- Kong Recovery System:
  1. Storage and Data Model:
     - Uses IndexedDB for local storage
     - Stores failed Kong swaps indefinitely
     - Data structure per failed swap:
       ```typescript
       interface KongFailedSwap {
         id: string;                    // Unique identifier
         status: 'pending' | 'failed';  // Pending = transferred but not yet attempted swap
         txId: string;                  // The Kong transfer block index
         fromToken: {
           canisterId: string;
           symbol: string;
           amount_e8s: string;
         };
         toToken: {
           canisterId: string;
           symbol: string;
           minAmount_e8s: string;      // Recalculated based on slippage
         };
         slippageTolerance: number;    // Adjustable
         attempts: number;             // Count of retry attempts
         lastAttempted?: number;       // Timestamp of last attempt
         error?: string;              // Last error message
         created: number;             // Creation timestamp
       }
       ```

  2. User Interface:
     - Collapsible "Kong Recovery" section after Pool Position panel
     - List of failed/pending Kong swaps with:
       * Token pair and amounts
       * Current market price vs original price
       * Error categorization and message
       * Adjustable slippage tolerance
       * Retry button per swap
     - Error categories:
       * Slippage too low
       * Price moved unfavorably
       * Insufficient liquidity
       * Technical error
     - Warning messages:
       * Market price deviation warnings
       * Slippage increase risk warnings

  3. Recovery Flow:
     - Automatic addition of swaps:
       * After successful transfer to Kong
       * Initial status = 'pending'
       * Before swap attempt
     - Failed swap handling:
       * Status updated to 'failed'
       * Error message stored
       * Error categorized
     - Retry mechanism:
       * Allows slippage adjustment
       * Shows current market conditions
       * Warns about significant price movement
     - Success handling:
       * Removes swap from recovery list
       * Updates UI immediately

  4. Implementation Requirements:
     - IndexedDB schema and migrations
     - Automatic error categorization
     - Market price monitoring
     - Slippage adjustment validation
     - Real-time UI updates
     - Error handling and recovery

- Advanced Trading Options:
  1. Parallel Swapping:
    - Split single trade between both DEXes
    - Adjustable distribution ratio
    - Combined price impact calculation
    - Unified transaction flow
    - Real-time output preview per DEX

  2. Time-Distributed Trading:
    - Split large trades into smaller transactions over time
    - Automatic best-price selection for each small swap
    - User-configurable parameters:
      - Total trade amount
      - Time period for distribution
      - Individual swap sizes
      - Minimum intervals between swaps
      - Target price threshold
      - Safety options
    - Anti-frontrunning features:
      - Random intervals between min/max limits
      - Random amounts between min/max limits
      - No maximum time restriction
    - Progress tracking and controls
    - Browser-based execution with clear warnings
    - Local storage for active distributions

### 2. Pool Integration
- Pool Balance Types:
  1. Undeposited Balance:
     - Held in user's pool subaccount
     - Must be deposited before withdrawal
     - Displayed separately initially
  2. Deposited Balance:
     - Already deposited in the pool
     - Available for immediate withdrawal
     - Displayed separately initially
  3. Total Balance:
     - Sum of undeposited and deposited balances
     - Will replace separate displays in future

- Balance Display:
  - Show balances for both tokens in selected pair
  - Auto-refresh balances:
    - After successful deposits/withdrawals
    - When token pair changes
    - On manual refresh
  - Loading states during balance fetches

- Deposit Functionality:
  - Separate deposit button for each token
  - Uses amount from swap interface "From" input
  - Two-step process:
    1. Transfer to pool subaccount
    2. Deposit from subaccount to pool
  - Shows confirmation modal
  - Clears amount after successful deposit
  - Updates balances automatically

- Withdraw Functionality:
  - Separate withdraw button for each token
  - Withdraws entire available balance
  - Two-step process:
    1. Deposit any undeposited balance first
    2. Withdraw total balance
  - No confirmation modal needed
  - Updates balances automatically

- UI Elements:
  - Collapsible panel for pool positions
  - Clear loading states during operations
  - Error recovery focused design
  - Separate sections for each token
  - Balance refresh button

- Error Recovery:
  - Handles failed transfers to subaccount
  - Handles failed deposits
  - Handles failed withdrawals
  - Shows clear error messages
  - Provides retry options

### 3. Transaction Management
- Comprehensive transaction history
- Filtering and sorting options
- Detailed transaction information:
  - Token amounts and pairs
  - DEX allocation and rates
  - Price impact and slippage
  - Timestamps and status
  - Block explorer links
- Status tracking:
  - Pending transactions
  - Success/failure states
  - Error messages and solutions
- Export functionality (optional)

### 4. Authentication and Wallet Integration
- Internet Identity integration:
  - Login/logout functionality
  - Clear login status indicator
  - Principal ID display when logged in
  - Auto-fetch token balances on login
  - Clear balances on logout
- Principal ID-based wallet functionality:
  - Use II-provided principal for balance checks
  - Cache principal locally for session
  - Clear principal on logout
- Automatic principal detection and balance display
- Transaction signing using II-provided identity

### 5. User Interface
- Modern, minimalist design inspired by Uniswap
- Navigation:
  - Swap tab (default view)
  - Transactions tab (history view)
- Main Swap Interface:
  - Primary Swap Box:
    - Token input panel:
      - Amount input with MAX button
      - Token selector with logo, name, and dropdown
      - USD value equivalent display
    - Swap direction arrow button (↓)
    - Token output panel:
      - Token selector with logo, name, and dropdown
      - Price comparison display:
        - ICPSwap price
        - Kong Swap price
        - Visual indicator for better rate
      - DEX selector (radio buttons)
        - Best price pre-selected
        - Warning when selecting worse price
      - USD value equivalent display
    - Price Impact:
      - Impact calculation for selected DEX
      - Color-coded warning levels
    - Settings (gear icon):
      - Slippage tolerance configuration
      - Transaction deadline
      - Interface settings
    - Swap Button:
      - Dynamic states (Review/Swap/Approve)
      - Loading state during transactions
      - Error states with clear messages

  - Advanced Trading Panel (expandable section below):
    - Parallel Swap Mode:
      - Distribution slider (default 50/50)
      - Percentage display for each DEX
      - Split quotes display:
        - Left side (ICPSwap):
          - Amount going to ICPSwap (updates during slider drag)
          - Quote output amount (updates on slider release)
          - Price impact
        - Center:
          - Combined output amount from both DEXes
        - Right side (Kong):
          - Amount going to Kong (updates during slider drag)
          - Quote output amount (updates on slider release)
          - Price impact
      - Dedicated "Split Swap" button below quotes
      - Independent from main swap interface:
        - Uses From amount from main interface
        - Main interface quotes remain unchanged
        - Main Swap button only executes single-DEX swaps
      - Validation:
        - Prevent split swaps if either DEX doesn't support the pair
        - Allow any split percentage (0-100%)
        - No minimum amount threshold per DEX
    - Time Distribution Mode:
      - Time period input
      - Min/max interval sliders
      - Min/max amount per trade
      - Target price threshold
      - Safety controls:
        - Auto-halt on DEX unavailability
        - Browser closure warning
      - Progress tracking:
        - Completed/remaining amounts
        - Next scheduled trade preview
        - Random values display
      - Distribution controls:
        - Start/Pause/Resume buttons
        - Modify parameters mid-distribution
      - Preview panel:
        - Upcoming scheduled trades
        - Estimated completion time

  - Pool Position Panel:
    - "Keep tokens in Swap Pool" toggle
    - Current pool balances display
    - Deposit/Withdraw buttons for each token
    - Link to view all pool balances

- Transaction History Tab:
  - Chronological list of transactions
  - Filter by token/type/status
  - Transaction details:
    - Token amounts and symbols
    - DEX(es) used
    - Split percentages if applicable
    - Price impact
    - Status and timestamps
    - Links to block explorer

- Global Elements:
  - Network status indicator
  - Wallet connection button
  - Settings menu
  - USD/ICP price toggle
  - Theme switcher (light/dark)

- Responsive Design:
  - Mobile-first approach
  - Collapsible elements for small screens
  - Touch-friendly controls
  - Simplified views for complex features

### 6. Token Whitelist Management
- Backend Storage:
  1. Token Metadata Map:
     - Key: Ledger Principal ID
     - Value: Record containing:
       * name: Text
       * symbol: Text
       * fee: Nat
       * decimals: Nat8
       * hasLogo: Bool
  2. Logo Map:
     - Key: Ledger Principal ID
     - Value: Text (logo URL/data)

- Admin Interface (`/admin/tokens`):
  1. Token List Display:
     - Table showing all whitelisted tokens
     - Columns: Principal ID, Name, Symbol, Fee, Decimals, Has Logo
     - Edit and Remove buttons per token
     - Pagination if needed
  
  2. Add/Edit Token Form:
     - Principal ID field (required)
     - Optional metadata fields:
       * Name
       * Symbol
       * Fee
       * Decimals
       * Logo
     - Auto-fill functionality:
       1. When Principal ID entered, fetch metadata from token's icrc1_metadata
       2. For missing fields, fallback to individual icrc1_* methods
       3. For logo, try icrc1_metadata first, then ICPSwap's getLogo
     - Clear validation messages
     - Submit/Cancel buttons

- Backend Methods:
  1. Add Token:
     - Input: Principal ID and optional metadata
     - If metadata fields missing:
       1. Call icrc1_metadata
       2. Fallback to individual icrc1_* methods
       3. For logo, try icrc1_metadata then ICPSwap getLogo
     - Store metadata and hasLogo flag
     - Store logo in separate map if found
  
  2. Remove Token:
     - Remove from both metadata and logo maps
  
  3. Edit Token:
     - Update metadata fields
     - Update logo if provided
     - Update hasLogo flag accordingly
  
  4. Get Whitelist:
     - Return full metadata map
     - Logos fetched separately as needed

- Frontend Logo Handling:
  1. Display Flow:
     - Check hasLogo flag in metadata
     - If true, fetch from backend logo map
     - If false, try ICPSwap getLogo as fallback
     - Use default logo if all fails
  
  2. Performance Considerations:
     - Lazy load logos
     - Cache logos in frontend
     - Show loading state while fetching

### 7. Statistics System

#### Overview
Simple statistics tracking system for monitoring swap activity across the platform. All stats are public and stored in stable memory on the backend canister. Updates are fire-and-forget and error handling is minimal for initial implementation.

#### Backend State
```motoko
// Stable state for global statistics
stable var globalStats: {
    total_swaps: Nat;
    icpswap_swaps: Nat;
    kong_swaps: Nat;
    split_swaps: Nat;
    total_sends: Nat;           // New: Track total successful sends
    total_deposits: Nat;        // New: Track total successful ICPSwap deposits
    total_withdrawals: Nat;     // New: Track total successful ICPSwap withdrawals
};

// Per-token statistics (keyed by token canister ID)
stable var tokenStats: HashMap<Text, {
    total_swaps: Nat;
    icpswap_swaps: Nat;
    kong_swaps: Nat;
    split_swaps: Nat;
    volume_e8s: Nat;  // Native token base units
    total_sends: Nat;           // New: Track sends for this token
    sends_volume_e8s: Nat;      // New: Track send volume for this token
    total_deposits: Nat;        // New: Track deposits for this token
    deposits_volume_e8s: Nat;   // New: Track deposit volume for this token
    total_withdrawals: Nat;     // New: Track withdrawals for this token
    withdrawals_volume_e8s: Nat; // New: Track withdrawal volume for this token
}>;

// Per-user statistics (keyed by principal ID)
stable var userStats: HashMap<Text, {
    total_swaps: Nat;
    icpswap_swaps: Nat;
    kong_swaps: Nat;
    split_swaps: Nat;
    total_sends: Nat;           // New: Track sends by this user
    total_deposits: Nat;        // New: Track deposits by this user
    total_withdrawals: Nat;     // New: Track withdrawals by this user
}>;
```

#### Backend Methods

1. Event Recording Methods:
```motoko
// Record completed ICPSwap swap
public shared func record_icpswap_swap(
    user: Principal,
    token_in: Text,  // Canister ID
    amount_in_e8s: Nat,
    token_out: Text,  // Canister ID
    amount_out_e8s: Nat,
): async () {
    // Fire and forget - no error handling
    // Updates:
    // - globalStats (total_swaps, icpswap_swaps)
    // - tokenStats for both tokens
    // - userStats
};

// Record completed Kong swap
public shared func record_kong_swap(
    user: Principal,
    token_in: Text,  // Canister ID
    amount_in_e8s: Nat,
    token_out: Text,  // Canister ID
    amount_out_e8s: Nat,
): async () {
    // Fire and forget - no error handling
    // Updates:
    // - globalStats (total_swaps, kong_swaps)
    // - tokenStats for both tokens
    // - userStats
};

// Record completed split swap
public shared func record_split_swap(
    user: Principal,
    token_in: Text,  // Canister ID
    icpswap_amount_in_e8s: Nat,
    kong_amount_in_e8s: Nat,
    token_out: Text,  // Canister ID
    icpswap_amount_out_e8s: Nat,
    kong_amount_out_e8s: Nat,
): async () {
    // Fire and forget - no error handling
    // Updates:
    // - globalStats (total_swaps, split_swaps)
    // - tokenStats for both tokens
    // - userStats
};

// New record methods
public shared func record_send(
    user: Principal,
    token: Text,  // Canister ID
    amount_e8s: Nat,
): async () {
    // Fire and forget - no error handling
    // Updates:
    // - globalStats (total_sends)
    // - tokenStats (total_sends, sends_volume_e8s)
    // - userStats (total_sends)
};

public shared func record_deposit(
    user: Principal,
    token: Text,  // Canister ID
    amount_e8s: Nat,
): async () {
    // Fire and forget - no error handling
    // Updates:
    // - globalStats (total_deposits)
    // - tokenStats (total_deposits, deposits_volume_e8s)
    // - userStats (total_deposits)
};

public shared func record_withdrawal(
    user: Principal,
    token: Text,  // Canister ID
    amount_e8s: Nat,
): async () {
    // Fire and forget - no error handling
    // Updates:
    // - globalStats (total_withdrawals)
    // - tokenStats (total_withdrawals, withdrawals_volume_e8s)
    // - userStats (total_withdrawals)
};
```

2. Query Methods:
```motoko
// Get global statistics
public query func get_global_stats(): async {
    total_swaps: Nat;
    icpswap_swaps: Nat;
    kong_swaps: Nat;
    split_swaps: Nat;
};

// Get stats for specific token
public query func get_token_stats(token_id: Text): async ?{
    total_swaps: Nat;
    volume_e8s: Nat;
};

// Get stats for specific user
public query func get_user_stats(user: Principal): async ?{
    total_swaps: Nat;
    icpswap_swaps: Nat;
    kong_swaps: Nat;
    split_swaps: Nat;
};

// Get all token stats
public query func get_all_token_stats(): async [(Text, {
    total_swaps: Nat;
    volume_e8s: Nat;
})];
```

#### Frontend Integration

1. Stats Page Route:
   - Add `/stats` route to application
   - Simple table-based display of statistics
   - No authentication required (public access)

2. Stats Page Sections:
   ```typescript
   interface StatsPageLayout {
     globalStats: {
       title: "Global Statistics";
       display: [
         "Total Swaps",
         "ICPSwap Swaps",
         "Kong Swaps",
         "Split Swaps"
       ]
     };
     
     tokenStats: {
       title: "Per Token Statistics";
       columns: [
         "Token",
         "Total Swaps",
         "ICPSwap Swaps",
         "Kong Swaps",
         "Split Swaps",
         "Volume (in token's e8s)"
       ]
     };
     
     userStats: {
       title: "User Statistics";
       columns: [
         "User Principal",
         "Total Swaps",
         "ICPSwap Swaps",
         "Kong Swaps",
         "Split Swaps"
       ]
     };
   }
   ```

3. Data Fetching:
   - Fetch all stats on page load
   - No auto-refresh initially
   - Manual refresh button
   - Simple loading states

4. Event Recording:
   - Add stat recording calls after successful swaps
   - Fire-and-forget implementation
   - No retry logic
   - No error handling

#### Implementation Rules

1. Amount Handling:
   - ALL amounts must be in e8s (base units)
   - NO conversion to decimal representation in backend
   - Frontend handles display conversion using token metadata

2. Error Handling:
   - Minimal error handling for initial implementation
   - Ignore failed stat updates
   - No validation on inputs
   - No recovery mechanism

3. Storage:
   - No limits on storage growth
   - No pruning mechanism
   - No archival strategy
   - All data persists through upgrades

4. Privacy:
   - All stats are public
   - No anonymization of principals
   - No opt-out mechanism

## Technical Architecture

### Frontend (React)
- TypeScript-based React application
- Key components:
  - Price fetching service for both DEXes
    - Native IC timeout handling
    - Loading states for operations
    - Availability tracking based on IC response status
  - Swap execution service (ICRC-1 based)
  - Timer-based trade distribution manager
  - WebSocket/polling for price updates
  - Principal/Identity management
  - Local storage for:
    - Active distributions
    - User preferences
    - Current distribution parameters
    - Temporary state recovery data
  - Network status monitoring:
    - Track DEX response status
    - Track call success/failure rates
    - Update UI availability indicators

### Backend Architecture
swaprunner uses a single backend canister (`swaprunner_backend`) to handle all server-side functionality, including:
- Token metadata caching
- User preferences and settings
- Transaction history
- System configuration

This single-canister approach is chosen to:
- Minimize deployment and maintenance complexity
- Reduce cross-canister call overhead
- Simplify state management and updates
- Optimize cycles consumption

### External Integrations
1. DEX Integrations:
   - ICPSwap API integration
   - Kong Swap API integration
   - Price fetching
   - Swap execution
   
2. Internet Identity:
   - Authentication
   - Principal management
   - Transaction signing

### Swap Flow Sequences

#### ICPSwap Integration

1. ICRC2 Swap Flow (preferred when token supports ICRC2):
   ```
   Prerequisites:
   - Quote already fetched from SwapPool
   - User has approved swap parameters
   
   Sequence:
   a. Approval Step:
      - User -> Token0: approve(SwapPool, amount)
      - Token0 -> User: approve result
   
   b. Deposit & Transfer Step:
      - User -> SwapPool: depositFrom()
      - SwapPool -> Token0: transferFrom()
      - Token0 -> SwapPool: transferFrom result
      - SwapPool -> User: depositFrom result
   
   c. Swap Step:
      - User -> SwapPool: swap()
      - SwapPool -> User: swap result
   
   d. Withdraw Step:
      - User -> SwapPool: withdraw()
      - SwapPool -> Token1: transfer()
      - Token1 -> SwapPool: transfer result
      - SwapPool -> User: withdraw result
   ```

2. ICRC1 Swap Flow (fallback for ICRC1-only tokens):
   ```
   Prerequisites:
   - Quote already fetched from SwapPool
   - User has approved swap parameters
   
   Sequence:
   a. Transfer Step:
      - User -> Token0: transfer(SwapPool subaccount)
      - Token0 -> User: transfer result
   
   b. Deposit Step:
      - User -> SwapPool: deposit()
      - SwapPool -> User: deposit result
   
   c. Swap Step:
      - User -> SwapPool: swap()
      - SwapPool -> User: swap result
   
   d. Withdraw Step:
      - User -> SwapPool: withdraw()
      - SwapPool -> Token1: transfer()
      - Token1 -> SwapPool: transfer result
      - SwapPool -> User: withdraw result
   ```

#### Kong Integration

1. ICRC2 Swap Flow (preferred when token supports ICRC2):
   ```
   Prerequisites:
   - Quote already fetched from Kong
   - User has approved swap parameters
   
   Sequence:
   a. Approval Step:
      - User -> Token0: approve(Kong, amount)
      - Token0 -> User: approve result
   
   b. Atomic Swap Step:
      - User -> Kong: swap()
      - Kong -> Token0: transferFrom()
      - Token0 -> Kong: transferFrom result
      - Kong -> Token1: transfer()
      - Token1 -> User: transfer result
      - Kong -> User: swap result
   ```

2. ICRC1 Swap Flow (fallback for ICRC1-only tokens):
   ```
   Prerequisites:
   - Quote already fetched from Kong
   - User has approved swap parameters
   
   Sequence:
   a. Transfer Step:
      - User -> Token0: transfer(Kong)
      - Token0 -> User: transfer result with block index
   
   b. Swap Step:
      - User -> Kong: swap(block_index)
      - Kong -> Token1: transfer()
      - Token1 -> User: transfer result
      - Kong -> User: swap result
   ```

Key Differences:
1. ICRC2 flows are more atomic as the DEX controls the token transfer via transferFrom
2. ICRC2 eliminates the need for intermediate deposit steps on ICPSwap
3. Kong's ICRC2 flow combines all steps into a single atomic swap operation
4. ICRC1 flows require separate transfer steps and block index tracking

## Token Support
- Support for both ICRC-1 and ICRC-2 token standards
  - Use ICRC-2 approval flow when supported by token
  - Fall back to ICRC-1 transfer flow for ICRC-1 only tokens
- Support for DIP20 tokens planned
- Initial focus on common ICP ecosystem tokens
- No NFT support

### Token Whitelist and Metadata Caching

#### Frontend Caching Strategy
1. Whitelist Management:
   - Cache entire whitelist in IndexedDB
   - Cache duration: 1 week
   - Include timestamp with whitelist cache
   - Refresh button in token selector panel forces whitelist update

2. Metadata Flow:
   ```typescript
   interface CachedMetadata {
     name: string;
     symbol: string;
     decimals: number;
     fee: bigint;
     logo?: string;
     hasLogo: boolean;
     timestamp: number;
     isWhitelisted: boolean;
   }
   ```

3. Whitelist Sync Process:
   a) Check IndexedDB for cached whitelist with timestamp
   b) If stale (>1 week) or missing, fetch fresh whitelist
   c) For each whitelisted token:
      - Update metadata cache with whitelist values
      - Set isWhitelisted = true
      - Preserve existing logo if present
      - Do NOT fetch icrc1_metadata during sync
      - Defer logo loading until needed

4. Centralized Metadata Access:
   - All frontend metadata requests MUST use centralized getMetadata
   - Flow:
     1. Check IndexedDB cache first
     2. If cached && !logo && hasLogo, fetch logo from backend
     3. If not in cache:
        - Fetch from ledger (icrc1_metadata)
        - Cache result with isWhitelisted = false
        - Include logo if found in icrc1_metadata

5. Logo Handling:
   - Load logos on-demand only
   - Cache logos indefinitely once loaded
   - Fetch from backend for whitelisted tokens
   - Accept logos from icrc1_metadata for non-whitelisted tokens

## Token Metadata Caching System

### Overview
Secure and efficient caching system for ICRC-1 token metadata with whitelisting and optimized refresh strategies.

### Backend State
```motoko
// Stable state
stable var whitelistedTokens: TrieSet<Text> = TrieSet.empty();
stable var tokenMetadataCache: TrieMap<Text, TokenMetadataEntry> = TrieMap.empty();
stable var tokenLogoCache: TrieMap<Text, Blob> = TrieMap.empty();

// Types
type TokenMetadataEntry = {
    metadata: TokenMetadata;
    lastUpdated: Nat64;  // Timestamp
    expiresAt: Nat64;    // Timestamp
};

type TokenStatus = {
    canisterId: Text;
    isWhitelisted: Bool;
    metadata: ?TokenMetadata;
    needsRefresh: Bool;
};

type BatchRefreshRequest = {
    tokenIds: [Text];  // Array of canister IDs to refresh
};
```

### Backend Methods
1. Admin Methods:
   ```motoko
   // Add token to whitelist (admin only)
   addToWhitelist: (tokenId: Text) -> async Bool;
   
   // Remove token from whitelist (admin only)
   removeFromWhitelist: (tokenId: Text) -> async Bool;
   
   // Get current whitelist
   getWhitelist: query () -> async [Text];
   ```

2. Public Methods:
   ```motoko
   // Query method to get metadata for multiple tokens
   getTokensMetadata: query (tokenIds: [Text]) -> 
     async [TokenStatus];
   
   // Update method to refresh metadata for multiple tokens
   refreshTokensMetadata: (request: BatchRefreshRequest) -> 
     async [TokenStatus];
   ```

### Security Features
1. Whitelist Protection:
   - Only whitelisted tokens can be cached
   - Admin control over whitelist
   - Public query access to whitelist

2. Rate Limiting:
   - Per-caller rate limiting on refresh calls
   - Configurable limits to prevent DDOS
   - Exponential backoff for excessive calls

3. Cache Integrity:
   - Backend fetches metadata directly from ledgers
   - No user-supplied metadata accepted
   - TTL-based expiration
   - Automatic version tracking

### Client-Side Implementation
```typescript
interface TokenMetadataManager {
  // Get metadata for multiple tokens
  getTokensMetadata(tokenIds: string[]): Promise<TokenStatus[]>;
  
  // Optimized refresh for expired tokens
  refreshExpiredTokens(tokenIds: string[]): Promise<void> {
    // 1. Start parallel ledger calls
    const ledgerPromises = tokenIds.map(id => 
      this.getMetadataFromLedger(id));
    
    // 2. Send refresh request to backend (don't await)
    this.backend.refreshTokensMetadata({ tokenIds });
    
    // 3. Return ledger results immediately
    return Promise.all(ledgerPromises);
  }
}
```

### Performance Optimizations
1. Parallel Processing:
   - Direct ledger calls in parallel with backend refresh
   - No waiting for backend cache updates
   - Immediate metadata availability

2. Batch Operations:
   - Multiple tokens in single query
   - Batch refresh requests
   - Reduced network overhead

3. Smart Refresh:
   - Status tracking per token
   - Batch expired token updates
   - Background cache updates

### Cache Maintenance
1. TTL Management:
   - 30-day expiration default
   - Automatic expiration tracking
   - Status included in query results

2. Version Control:
   - Monotonic version numbers
   - Automatic version updates
   - Clean upgrade path

### Error Handling
1. Token Errors:
   - Invalid token ID handling
   - Non-whitelisted token rejection
   - Rate limit exceeded responses

2. Network Failures:
   - Ledger call timeouts
   - Retry strategies
   - Fallback handling

3. Cache Errors:
   - Version mismatch handling
   - Corruption recovery
   - Automatic repair

### Security Considerations
1. Whitelist Management:
   - Strict admin controls
   - Audit logging
   - Secure updates

2. Rate Protection:
   - Per-principal tracking
   - Configurable limits
   - Abuse prevention

3. Data Integrity:
   - Direct ledger verification
   - No user-supplied data
   - Consistent versioning

## Security Considerations
- Slippage protection implementation
- Transaction signing security
- Principal ID validation
- Error handling for failed swaps
- Network interruption handling
- Price impact warnings:
  - Visual indicators for high price impact trades
  - Warning thresholds:
    - Yellow warning: > 2% price impact
    - Red warning: > 5% price impact
  - Confirmation dialog for high impact trades
  - Real-time price impact calculation for both DEXes
- Price impact configuration:
  - User-configurable warning thresholds
  - Default thresholds (2% yellow, 5% red)
  - Per-DEX price impact display
  - Quick-select standard threshold values
- Slippage protection:
  - Per-DEX slippage tolerance settings
  - Independent slippage validation for each DEX
  - Applied to both direct and time-distributed trades

## Transaction History
- Group related trades together (e.g., all trades from one distribution)
- Collapsible view for trade groups
- Group header information:
  - Total amount traded
  - Number of trades in group
  - Start/end timestamps
- Individual trade details:
  - Amount
  - Price
  - DEX used
  - Random interval used
  - Random amount used
  - Timestamp

## Development Milestones

### Phase 1: Basic Infrastructure
- Project setup
- DEX API integrations
- Internet Identity integration
- Basic token swap functionality

### Phase 2: Core Features
- Price comparison implementation
- Parallel swap execution
- Basic UI implementation
- Transaction history

### Phase 3: Time Distribution
- Time-distributed trading implementation
- Advanced UI features
- Progress tracking
- Error handling

### Phase 4: Polish
- UI/UX improvements
- Performance optimization
- Testing and bug fixes
- Documentation

## Future Considerations
- Additional DEX integrations
- Price alerts
- Advanced analytics
- Mobile optimization
- Transaction history export
- Price charts (optional)

## Technical Requirements
- Node.js environment
- Internet Computer SDK
- React 18+
- TypeScript
- Internet Identity integration
- DEX API access

## Environment
- Mainnet only deployment
- No testnet support required

## Error Handling
- Clear user messaging for:
  - Browser closure warnings
  - Network interruptions
  - DEX availability issues
  - Long-running operation status
- Distribution safety features:
  - Optional automatic halt if any DEX becomes unavailable (based on IC response)
  - Automatic state saving in Local Storage
  - Clear status indicators for DEX availability
  - Visual feedback during long-running operations
- Error recovery:
  - Automatic local state recovery after page refresh
  - Clear messaging when distribution state is lost
  - Permanent transaction history available from backend
- Network resilience:
  - Graceful handling of long-running calls
  - Clear progress indicators for operations
  - Ability to retry failed operations
  - Detailed error messages for IC-reported failures


£ Useful info@

Twitter handle regex: ^@?(\w){1,15}$
var username = 'yourname';
if ( username.match( /^[A-Za-z0-9_]{1,15}$/ ) ) {
  /* Appears valid. Do you thing. */
}

Kong Swap Canister ID: = "2ipq2-uqaaa-aaaar-qailq-cai";
ICPSwap SwapFactory canister: 4mmnk-kiaaa-aaaag-qbllq-cai
ICPSwap ICP/ckUSDC pool: mohjv-bqaaa-aaaag-qjyia-cai

ICPSwap web site: https://app.icpswap.com/swap
Kong web site: https://www.kongswap.io/swap

// icrc1_ledgers
//   ICP: ryjl3-tyaaa-aaaaa-aaaba-cai
//   CHAT:          '2ouva-viaaa-aaaaq-aaamq-cai',
//   NAUT:          'u2mpw-6yaaa-aaaam-aclrq-cai',
//   DKP:           'zfcdd-tqaaa-aaaaq-aaaga-cai',
//   COW:           'sr5fw-zqaaa-aaaak-qig5q-cai',
//   WUMBO:         'wkv3f-iiaaa-aaaap-ag73a-cai',
//   KINIC:         '73mez-iiaaa-aaaaq-aaasq-cai',
//   GHOST:         '4c4fd-caaaa-aaaaq-aaa3a-cai',
//   HOT:           '6rdgd-kyaaa-aaaaq-aaavq-cai',
//   RICH:          '77xez-aaaaa-aaaar-qaezq-cai',
//   ALIEN:         '7tvr6-fqaaa-aaaan-qmira-cai',
//   ICX:           'rffwt-piaaa-aaaaq-aabqq-cai',
//   MOTOKO:        'k45jy-aiaaa-aaaaq-aadcq-cai',
//   MOD:           'xsi2v-cyaaa-aaaaq-aabfq-cai',
//   CHUGGA:        'epev2-gaaaa-aaaam-aci7a-cai',
//   DOBO:          'pksv5-aaaaa-aaaap-aha3q-cai',
//   ROS:           'a6a37-7yaaa-aaaai-qpeuq-cai',
//   WEN:           'hwr24-lyaaa-aaaap-ahbpa-cai',
//   BOOM:          'vtrom-gqaaa-aaaaq-aabia-cai',
//   CTZ:           'uf2wh-taaaa-aaaaq-aabna-cai',
//   SNEED:         'hvgxa-wqaaa-aaaaq-aacia-cai',
//   NUA:           'rxdbk-dyaaa-aaaaq-aabtq-cai',
//   INSANE:        'nwd3n-qaaaa-aaaak-afmda-cai',
//   PEPE:          'o2ul2-3aaaa-aaaak-afmja-cai',
//   TempleOS:      'nattc-jqaaa-aaaak-afl5q-cai',
//   MCS:           '67mu5-maaaa-aaaar-qadca-cai',
//   MacOS:         'dikjh-xaaaa-aaaak-afnba-cai',
//   UNIX:          'czaxy-piaaa-aaaak-afneq-cai',
//   RENEGADE:      'kttqw-5aaaa-aaaak-afloq-cai',
//   SDOGE:         'ghvlc-vqaaa-aaaan-qlsca-cai',
//   iVishnu:       'kz5t3-pyaaa-aaaap-ab2qq-cai',
//   CGST:          'mwgzv-jqaaa-aaaam-acfha-cai',
//   MIF:           'iczfn-iiaaa-aaaan-qltcq-cai',
//   DAMONIC:       'zzsnb-aaaaa-aaaap-ag66q-cai',

### Kong Swap Integration

#### Overview
Kong Swap uses a simpler two-step process for token swaps:
1. Transfer tokens to Kong's canister
2. Execute swap using the transfer's block index

#### Implementation Details

1. Kong Swap Service:
   ```typescript
   class KongSwapService {
     // Price and quote methods
     getPrice(params: { tokenA: string; tokenB: string }): Promise<number>;
     getQuote(params: { amountIn: bigint; tokenIn: string; tokenOut: string }): Promise<KongSwapQuote>;

     // Two-step swap execution
     transferToKong(params: { tokenId: string; amount_e8s: string }): Promise<ExecutionResult>;
     executeKongSwap(params: {
       fromToken: { canisterId: string; amount_e8s: string; txId: string };
       toToken: { canisterId: string; minAmount_e8s: string };
       slippageTolerance: number;
     }): Promise<ExecutionResult>;
   }
   ```

2. Swap Execution Flow:
   ```typescript
   // Step 1: Transfer tokens to Kong
   const transferResult = await kongSwapService.transferToKong({
     tokenId: fromToken.canisterId,
     amount_e8s: amount.toString(),
   });
   if (!transferResult.success) return transferResult;

   // Step 2: Execute swap using transfer's block index
   const swapResult = await kongSwapService.executeKongSwap({
     fromToken: {
       canisterId: fromToken.canisterId,
       amount_e8s: amount.toString(),
       txId: transferResult.txId!,  // Block index from transfer
     },
     toToken: {
       canisterId: toToken.canisterId,
       minAmount_e8s: minAmount.toString(),
     },
     slippageTolerance: 0.5,  // 0.5%
   });
   ```

3. Progress Tracking:
   - Each step reports its status via `ExecutionResult`
   - UI updates progress after each step
   - Clear error messages for failures
   - Manual retry support for failed steps

4. Error Handling:
   - Transfer failures (insufficient balance, etc.)
   - Swap failures (slippage exceeded, etc.)
   - Network errors
   - Detailed error messages from Kong

5. Security Features:
   - No approval needed (direct transfer)
   - Slippage protection
   - Minimum output amount validation
   - Transaction verification

6. UI Integration:
   - Progress indicator for each step
   - Status updates between steps
   - Error display and retry options
   - Balance updates after completion

#### Differences from ICPSwap
1. Simpler Process:
   - No deposit/withdraw steps
   - Direct token transfer to Kong
   - Single swap transaction
   
2. Token Handling:
   - Uses token symbols instead of canister IDs internally
   - Automatic symbol lookup from known tokens
   - No pool-specific subaccounts needed
   - Balance checking done through ICRC1 token service directly

3. Price Impact:
   - Uses Kong's native slippage calculation
   - No separate price impact calculation needed
   - Slippage included in quote response

4. Error Recovery:
   - Manual retry support
   - No automatic retries
   - Clear error messages from Kong

### Time Split Swap Implementation Plan

#### Phase 1: Core Infrastructure (Current)
1. Database Setup
   - Create IndexedDB schema for storing run configurations and state
   - Implement database service with CRUD operations
   - Add data migration support for schema updates
   - Add error recovery for database failures

2. Run Manager Service
   - Implement core RunManager class with state management
   - Add run lifecycle methods (start/pause/resume/stop)
   - Add run validation and safety checks
   - Implement progress tracking and status updates

3. Time Split UI Components
   - Create TimeSplitForm component for run configuration
   - Add form validation and error handling
   - Implement unit toggle buttons (%, token amounts, time units)
   - Add helper text and tooltips for user guidance

#### Phase 2: Execution Engine
1. Trade Scheduler
   - Implement random interval generation within min/max bounds
   - Add price range validation before trades
   - Create trade amount randomization within bounds
   - Add safety checks and circuit breakers

2. Quote Manager
   - Implement best price selection logic
   - Add price impact monitoring
   - Implement quote staleness checks
   - Add price range validation

3. Swap Executor
   - Create unified swap execution interface
   - Implement automatic DEX selection
   - Add transaction tracking and verification
   - Implement error recovery and retry logic

#### Phase 3: Progress Tracking
1. Run Status Display
   - Create progress bar component
   - Add detailed status information display
   - Implement real-time updates
   - Add estimated completion time calculation

2. Trade History
   - Create trade history component
   - Add filtering and sorting options
   - Implement export functionality
   - Add detailed trade information display

3. Analytics
   - Add price impact analysis
   - Implement savings calculation
   - Add performance metrics
   - Create summary statistics

#### Phase 4: State Management
1. Local Storage
   - Implement run state persistence
   - Add automatic state recovery
   - Implement clean state management
   - Add state validation and repair

2. Browser Integration
   - Add tab visibility handling
   - Implement browser close protection
   - Add network status monitoring
   - Implement state sync across tabs

3. Error Handling
   - Add comprehensive error tracking
   - Implement user-friendly error messages
   - Add automatic error recovery
   - Implement fallback mechanisms

#### Phase 5: Security & Testing
1. Security Features
   - Add input validation and sanitization
   - Implement rate limiting
   - Add transaction verification
   - Implement safety checks

2. Testing Suite
   - Create unit tests for core functionality
   - Add integration tests for UI components
   - Implement end-to-end testing
   - Add performance testing

#### Implementation Details

1. Database Schema:
```typescript
interface TimeSplitRun {
  id: string;                    // Unique run ID
  tokenPair: {
    fromToken: string;           // Canister ID
    toToken: string;            
    fromSymbol: string;         
    toSymbol: string;
  };
  amounts: {
    total_e8s: string;          // Total amount to trade
    min_e8s: string;            // Min per trade
    max_e8s: string;            // Max per trade
    isPercentage: boolean;      // Whether min/max are percentages
  };
  prices: {
    reference: number;          // Price when run started
    min: number;               
    max: number;
    isPercentage: boolean;      // Whether min/max are % deviations
  };
  intervals: {
    min: bigint;               // Nanoseconds
    max: bigint;
    unit: 'seconds' | 'minutes' | 'hours';  // UI only
  };
  limits: {
    maxTime?: bigint;          // Optional max duration in nanoseconds
    maxTrades?: number;        // Optional max number of trades
  };
  progress: {
    startTime: bigint;         // IC time in nanoseconds
    amountTraded_e8s: string;
    tradesExecuted: number;
    nextTradeTime: bigint;     // IC time in nanoseconds
    status: 'running' | 'paused' | 'completed' | 'stopped';
    pausedAt?: bigint;         // IC time when paused
    totalPausedTime: bigint;   // Total time spent in paused state
  };
}

interface TimeSplitDB {
  activeRuns: {
    [tokenPairKey: string]: TimeSplitRun;  // One active run per pair
  };
  historicalRuns: TimeSplitRun[];          // Completed/stopped runs
}
```

2. Run Manager Interface:
```typescript
interface RunManager {
  // Core lifecycle methods
  startRun(config: TimeSplitRunConfig): Promise<TimeSplitRun>;
  pauseRun(tokenPairKey: string): Promise<void>;
  resumeRun(tokenPairKey: string): Promise<void>;
  stopRun(tokenPairKey: string): Promise<void>;
  
  // State management
  getRunStatus(tokenPairKey: string): Promise<RunStatus>;
  saveRunState(run: TimeSplitRun): Promise<void>;
  loadRunState(tokenPairKey: string): Promise<TimeSplitRun>;
  
  // Trade execution
  scheduleNextTrade(run: TimeSplitRun): void;
  executeTrade(run: TimeSplitRun, amount: bigint): Promise<boolean>;
  
  // Progress tracking
  updateProgress(run: TimeSplitRun): Promise<void>;
  calculateEstimates(run: TimeSplitRun): RunEstimates;
}
```

3. Safety Features:
- Browser close protection:
  * Warn user about active runs on tab close
  * Save state before allowing close
  * Provide recovery instructions
- Network resilience:
  * Monitor connection status
  * Pause runs during disconnection
  * Resume automatically when connection restored
- Price protection:
  * Monitor price impact for each trade
  * Implement maximum price impact limits
  * Add circuit breaker for extreme price movements
- Error recovery:
  * Automatic retry for failed trades
  * State recovery after browser refresh
  * Clean error handling and user feedback

4. Progress Tracking:
```typescript
interface RunProgress {
  amountProgress: {
    traded: string;
    total: string;
    percentage: number;
  };
  tradeProgress: {
    executed: number;
    maximum?: number;
  };
  timeProgress: {
    elapsed: string;
    maximum?: string;
    pausedTime?: string;
  };
  nextTrade: {
    scheduledFor: string;
    estimatedAmount: string;
  };
  priceStatus: {
    current: number;
    min: number;
    max: number;
    isInRange: boolean;
  };
  runControl: {
    canPause: boolean;
    canResume: boolean;
    canStop: boolean;
  };
}
```

### Technical Architecture
```

### Custom Token Support

#### Overview
Users can register their own ICRC-1 token ledgers for trading. Custom tokens are managed per-user and follow the same metadata handling rules as whitelisted tokens.

#### Backend State
```motoko
// Per-user custom token registry
stable var userCustomTokens: HashMap<Principal, {
    tokens: TrieSet<Text>;  // Set of canister IDs
}>;

// Metadata storage (shared with whitelisted tokens)
stable var tokenMetadataCache: TrieMap<Text, TokenMetadataEntry>;
stable var tokenLogoCache: TrieMap<Text, Blob>;
```

#### Backend Methods
```motoko
// Register a custom token
public shared(msg) func register_custom_token(
    token_canister_id: Text
): async Result<TokenMetadata, Text> {
    // 1. Verify caller is authenticated
    // 2. Attempt to fetch ICRC-1 metadata from token ledger
    // 3. If successful:
    //    - Store metadata in tokenMetadataCache
    //    - Add to user's custom token set
    //    - Try to fetch logo if available
    // 4. Return metadata or error
};

// Remove a custom token
public shared(msg) func remove_custom_token(
    token_canister_id: Text
): async Bool;

// Get user's custom tokens
public query(msg) func get_custom_tokens(): async [Text];
```

#### Implementation Rules
1. Token Registration:
   - Only requires canister ID from user
   - Backend validates by fetching ICRC-1 metadata
   - No limit on number of custom tokens per user
   - Duplicate registrations allowed (whitelisted tokens can be registered)

2. Metadata Handling:
   - All metadata fetched automatically from ledger
   - Users cannot customize or override metadata
   - Logo handling identical to whitelisted tokens
   - Metadata cached in same store as whitelisted tokens

3. Frontend Integration:
   - Custom tokens appear first in token selectors
   - No visual distinction from whitelisted tokens
   - Use same centralized getMetadata method
   - Same balance fetching and display rules

4. Error Handling:
   - Standard error handling for invalid/inaccessible tokens
   - Failed metadata fetch prevents registration
   - No special handling for removed tokens

5. Security:
   - Only authenticated users can register tokens
   - Each user's custom token list is private
   - No sharing or public listing of custom tokens
   - Standard rate limiting applies to registration calls

### Wallet Feature

#### Overview
The wallet feature provides users with a personalized view of their token holdings and enables easy token transfers. Users can customize their wallet by adding/removing tokens they want to track. Custom tokens are automatically included in the wallet view.

#### Backend State
```motoko
// Per-user wallet token registry
stable var userWalletTokens: HashMap<Principal, {
    tokens: TrieSet<Text>;  // Set of canister IDs
}>;

// Default tokens that are automatically added to new users' wallets
let DEFAULT_WALLET_TOKENS: [Text] = [
    "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP
];
```

#### Backend Methods
```motoko
// Add token to user's wallet
public shared(msg) func add_wallet_token(
    token_canister_id: Text
): async Bool;

// Remove token from user's wallet
public shared(msg) func remove_wallet_token(
    token_canister_id: Text
): async Bool;

// Get user's wallet tokens (includes custom tokens)
public query(msg) func get_wallet_tokens(): async [Text];
```

#### Implementation Rules
1. Token Management:
   - Custom tokens automatically included in user's wallet view
   - ICP automatically added for new users
   - No limit on number of wallet tokens per user
   - Tokens can be added/removed individually
   - Custom tokens cannot be removed from wallet view

2. Metadata Handling:
   - Use existing token metadata system
   - No additional wallet-specific metadata
   - Same balance fetching and display rules as elsewhere
   - Centralized getMetadata method for consistency

3. Frontend Integration:
   - Vertical list layout similar to token select modal
   - Each token card shows:
     * Basic view: logo, symbol, and balance
     * Expanded view (when clicked):
       - Ledger canister ID
       - Token fee
       - Token decimals
       - Other metadata from token service
   - Balance updates:
     * On page load
     * Manual refresh button
     * After successful sends
   - Send functionality:
     * Uses existing Send modal
     * Integrates with current token transfer code
   - Token order:
     * Saved in localStorage only
     * Persists between sessions
     * Not synced to backend
   - Clear loading states for balance fetching

4. Error Handling:
   - Standard error handling for invalid/inaccessible tokens
   - Clear error states for failed balance fetches
   - Automatic retry for temporary failures
   - Graceful handling of localStorage failures

5. Security:
   - Only authenticated users can modify their wallet
   - Each user's wallet token list is private
   - Standard rate limiting applies to modification calls
   - No sharing or public listing of wallet tokens