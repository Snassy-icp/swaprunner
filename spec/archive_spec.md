# Archive Canister Specification

## Overview
The Archive canister serves as the event logging system for the SwapRunner platform. It maintains two types of logs:
1. An inflight event log for ongoing operations
2. A completed event log using the ICRC3 standard for permanent storage

## Event Hierarchy
Events in the system can have parent-child relationships:
- Each event has a unique ID
- Events can have a parent event ID
- Events maintain lists of child events and related events
- Events track their creator (user) and timestamp

## Event Types
All events come in three variants:
1. Started - When an operation begins
2. Completed - When an operation succeeds
3. Failed - When an operation fails (includes error message)

### High-Level Operations
1. **Split Swap**
   - Parent operation that splits a swap between multiple DEXes
   - Contains child DEX Swap events
   - Tracks token input/output and ratios for each DEX

2. **DEX Swap**
   - Represents a swap on a specific DEX
   - Can be child of Split Swap
   - Contains child events for component operations

### Wallet Operations
1. **Transfer**
   - Movement of tokens between ICRC1 Accounts
   - Can be child of Swap operations

2. **Approval**
   - Token approval for DEX contracts
   - Usually child of Swap operations

3. **DEX Deposit**
   - Token deposits into DEX contracts
   - Component of Swap operations
   - Tracks token amount and DEX details

4. **DEX Withdraw**
   - Token withdrawals from DEX contracts
   - Component of Swap operations
   - Tracks token amount and DEX details

5. **Wallet Deposit**
   - Deposits to named subaccounts in user's wallet
   - Independent operation (not part of swaps)
   - Tracks:
     - Source principal
     - Target subaccount name
     - Token amount

6. **Wallet Withdraw**
   - Withdrawals from named subaccounts in user's wallet
   - Independent operation (not part of swaps)
   - Tracks:
     - Source subaccount name
     - Target principal
     - Token amount

### Allocation Operations
1. **Allocation Creation**
   - Creating new token allocations
   - Links to achievement system

2. **Allocation Claim**
   - Users claiming from allocations
   - Links to achievement completion

## Token Value Tracking
Each event involving tokens tracks:
1. Token canister ID
2. Amount in e8s (token base units)
3. Value in ICP at event time
4. Value in USD at event time

## Storage Implementation
1. **Inflight Events**
   - Stored in a `TrieMap<Nat, InflightEvent>`
   - Temporary storage for ongoing operations
   - Includes operation status and error messages

2. **Completed Events**
   - Uses ICRC3 standard via `icrc3-mo` library
   - Configuration:
     - 2000 records max in main canister
     - Settles to 1000 records during cleanup
     - 1M records per archive instance
     - Up to 96GB stable memory per archive (as of Dec 2023)
       * Requires appropriate compiler flags for large stable memory
       * Default limit is 4GB (~62500 pages)
       * Set flags to allow up to 1,500,000 pages for 96GB
     - Archives 1000 records at a time
     - 10T cycles for new archive canisters

## Query Methods
1. `getEvent(id: Nat)`: Get specific event by ID
2. `getInflightEvent(id: Nat)`: Get ongoing event by ID
3. `getUserEvents(user: Principal)`: Get all events for a user
4. `get_transactions`: ICRC3 standard method for transaction history

## Event Logging Flow
1. Operation starts:
   - Generate new event ID
   - Create Started event
   - Link to parent if exists
   - Store in inflight events

2. Operation completes:
   - Create Completed/Failed event
   - Move from inflight to completed storage
   - Update parent-child relationships
   - Convert to ICRC3 format if completed

## Error Handling
1. All events can include error messages
2. Failed events are logged for audit purposes
3. Parent events fail if critical child events fail
4. Non-critical child failures don't fail parent events

## ICRC3 Integration
1. **Initialization Pattern**
   ```motoko
   // Stable state for ICRC3
   private stable var icrc3_migration_state = ICRC3.init(
       ICRC3.initialState(),
       #v0_1_0(#id),
       {
           maxActiveRecords = 2000;        // Keep 2000 records max in main canister
           settleToRecords = 1000;         // Settle to 1000 records during cleanup
           maxRecordsInArchiveInstance = 1_000_000; // 1M records per archive
           maxArchivePages = 1_500_000;    // ~96GB stable memory (as of Dec 2023)
           archiveIndexType = #Stable;     // Use stable memory for indexes without type tracking
           maxRecordsToArchive = 1000;     // Archive 1000 records at a time
           archiveCycles = 10_000_000_000_000; // 10T cycles for new archives
           archiveControllers = null;      // Use default controllers
       },
       Principal.fromActor(this)
   );
   ```

   **Index Type Choice**: We use `#Stable` because:
   - More scalable than `#Managed` which has upgrade limitations
   - More memory efficient than `#StableTyped` (saves 2 bytes per entry)
   - We don't need type tracking as our events have a fixed structure
   - Better suited for long-term archival storage

2. **Certification Support**
   ```motoko
   private func get_icrc3_environment() : ICRC3.Environment {
       ?{
           updated_certification = ?updated_certification;
           get_certificate_store = ?get_certificate_store;
       }
   };
   ```

3. **Transaction Management**
   - Automatic archival when maxActiveRecords (2000) is reached
   - Archives settle to 1000 records during cleanup
   - Archives are created with 10T cycles each
   - Each archive can hold up to 1M records
   - Uses StableWriteOnly pattern for memory efficiency

4. **Block Structure**
   - Each block contains:
     - Transaction data (event details)
     - Timestamp
     - Parent hash
     - Current block hash
   - SHA256 hashing for block chain integrity
   - Certified via the IC's data certification

5. **Query Interface**
   ```motoko
   public query func get_transactions(request: ICRC3.GetTransactionsRequest) 
       : async ICRC3.GetTransactionsResponse
   ```
   - Supports pagination
   - Returns blocks with transaction data
   - Includes archive callbacks for historical data

6. **Archive Management**
   - Automatic creation of archive canisters
   - Up to 96GB stable memory per archive (as of Dec 2023)
   - Archives 1000 records per batch
   - Silent failure if insufficient cycles
   - Uses StableWriteOnly pattern for efficient memory usage

7. **Best Practices**
   - Keep main canister light (2000 records max)
   - Frequent archival to maintain performance
   - Proper cycle management for archive creation
   - Use certification for data integrity
