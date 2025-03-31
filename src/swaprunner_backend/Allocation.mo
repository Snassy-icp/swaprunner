import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Nat32 "mo:base/Nat32";
import Int "mo:base/Int";
import Debug "mo:base/Debug";
import Error "mo:base/Error";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Blob "mo:base/Blob";
import Iter "mo:base/Iter";
import T "./Types";
import Util "./Util";

module {
    // Helper function to derive subaccount for allocation
    public func derive_backend_subaccount(principal: Principal, allocation_id: Nat) : [Nat8] {
        let subaccount = Array.init<Nat8>(32, 0);
        
        // Convert principal to bytes for the base subaccount
        let principalBytes = Util.PrincipalToSubaccount(principal);
        
        // Copy principal bytes into first part of subaccount (up to 29 bytes)
        for (i in Iter.range(0, Int.min(28, principalBytes.size() - 1))) {
            subaccount[i] := principalBytes[i];
        };
        
        // Convert allocation ID to number using hash and write to last 3 bytes
        let idNum = Nat32.fromNat(allocation_id);
        subaccount[29] := Nat8.fromNat(Nat32.toNat((idNum >> 16) & 0xFF));
        subaccount[30] := Nat8.fromNat(Nat32.toNat((idNum >> 8) & 0xFF));
        subaccount[31] := Nat8.fromNat(Nat32.toNat(idNum & 0xFF));
        
        Array.freeze(subaccount)
    };

    // Create a new allocation in Draft status
    public func create_allocation(
        caller: Principal,
        args: T.CreateAllocationArgs,
        achievements: HashMap.HashMap<Text, T.Achievement>,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_id: Text,
    ) : Result.Result<T.Allocation, Text> {
        // Verify achievement exists
        switch (achievements.get(args.achievement_id)) {
            case null return #err("Achievement not found");
            case (?_) {};
        };

        // Verify amounts make sense
        if (args.per_user_min_e8s > args.per_user_max_e8s) {
            return #err("Minimum claim amount cannot be greater than maximum");
        };
        if (args.total_amount_e8s == 0) {
            return #err("Total amount must be greater than 0");
        };
        if (args.per_user_max_e8s > args.total_amount_e8s) {
            return #err("Per-user maximum cannot exceed total amount");
        };

        // Create allocation
        let allocation : T.Allocation = {
            id = allocation_id;
            creator = caller;
            achievement_id = args.achievement_id;
            token = {
                canister_id = args.token_canister_id;
                total_amount_e8s = args.total_amount_e8s;
                per_user = {
                    min_e8s = args.per_user_min_e8s;
                    max_e8s = args.per_user_max_e8s;
                };
            };
            created_at = Time.now();
        };

        #ok(allocation)
    };

    // Activate an allocation to allow claims
    public func activate_allocation(
        caller: Principal,
        allocation_id: Nat,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        fee_config: T.AllocationFeeConfig,
        this_canister_id: Principal,
    ) : async Result.Result<(), Text> {
        // Get allocation
        let allocation = switch (allocations.get(Nat.toText(allocation_id))) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify caller is creator
        if (caller != allocation.creator) {
            return #err("Only the creator can activate this allocation");
        };

        // Verify current status
        switch (allocation_statuses.get(Nat.toText(allocation_id))) {
            case (?#Draft) {};  // This is the only valid state
            case (?status) return #err("Allocation must be in Draft status");
            case null return #err("Allocation status not found");
        };

        // Get payment subaccount (derived from ICP ledger principal)
        let payment_subaccount = derive_backend_subaccount(
            Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"), // ICP ledger
            allocation_id
        );

        // Get funding subaccount (derived from token principal)
        let funding_subaccount = derive_backend_subaccount(
            allocation.token.canister_id,
            allocation_id
        );

        // Create ICRC1 actor for ICP ledger
        let icrc1_payment_actor = actor(Principal.toText(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"))) : T.ICRC1Interface;

        // Create ICRC1 actor for token
        let icrc1_funding_actor = actor(Principal.toText(allocation.token.canister_id)) : T.ICRC1Interface;

        // Check payment balance
        let payment_balance = await icrc1_payment_actor.icrc1_balance_of({ 
            owner = this_canister_id; 
            subaccount = ?payment_subaccount
        });

        // Check funding balance
        let funding_balance = await icrc1_funding_actor.icrc1_balance_of({ 
            owner = this_canister_id; 
            subaccount = ?funding_subaccount
        });

        // Verify payment is complete
        if (payment_balance < fee_config.icp_fee_e8s) {
            return #err("Allocation must be fully paid before activation");
        };

        // Verify funding is complete
        if (funding_balance < allocation.token.total_amount_e8s) {
            return #err("Allocation must be fully funded before activation");
        };

        // Return success - status update will be done in main.mo
        #ok(())
    };

    // Process a claim request
    public func process_claim(
        caller: Principal,
        allocation_id: Text,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        allocation_claims: HashMap.HashMap<Text, T.AllocationClaim>,
        user_achievements: HashMap.HashMap<Text, [T.UserAchievement]>,
    ) : Result.Result<Nat, Text> {
        // Get allocation
        let allocation = switch (allocations.get(allocation_id)) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify allocation is active
        switch (allocation_statuses.get(allocation_id)) {
            case (?#Active) {};
            case (?status) return #err("Allocation is not active");
            case null return #err("Allocation status not found");
        };

        // Verify user has the achievement
        let user_achievements_arr = switch (user_achievements.get(Principal.toText(caller))) {
            case null return #err("No achievements found for user");
            case (?ua) ua;
        };

        let has_achievement = Buffer.Buffer<T.UserAchievement>(0);
        for (achievement in user_achievements_arr.vals()) {
            if (achievement.achievement_id == allocation.achievement_id) {
                has_achievement.add(achievement);
            };
        };

        if (has_achievement.size() == 0) {
            return #err("User does not have the required achievement");
        };

        // Verify user hasn't already claimed
        let claim_key = Principal.toText(caller) # ":" # allocation_id;
        switch (allocation_claims.get(claim_key)) {
            case (?_) return #err("User has already claimed from this allocation");
            case null {};
        };

        // For now, just return the minimum amount
        // In future versions we could implement more sophisticated distribution logic
        #ok(allocation.token.per_user.min_e8s)
    };

    // Helper function to generate claim key
    public func get_claim_key(user: Principal, allocation_id: Text) : Text {
        Principal.toText(user) # ":" # allocation_id
    };

    // Cancel an allocation and return funds to caller
    public func cancel_allocation(
        caller: Principal,
        allocation_id: Nat,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        is_admin: Bool,
        this_canister_id: Principal,
    ) : async Result.Result<(), Text> {
        // Get allocation
        let allocation = switch (allocations.get(Nat.toText(allocation_id))) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify permissions
        if (not is_admin and allocation.creator != caller) {
            return #err("Only the creator or an admin can cancel this allocation");
        };

        // Get current status
        let current_status = switch (allocation_statuses.get(Nat.toText(allocation_id))) {
            case null return #err("Allocation status not found");
            case (?s) s;
        };

        // Non-admins can only cancel in Draft status
        if (not is_admin and current_status != #Draft) {
            return #err("Non-admin users can only cancel allocations in Draft status");
        };

        // Can't cancel cancelled allocations
        if (current_status == #Cancelled) {
            return #err("Allocation already cancelled");
        };

        // Get payment subaccount (derived from ICP ledger principal)
        let payment_subaccount = derive_backend_subaccount(
            Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"), // ICP ledger
            allocation_id
        );

        // Get funding subaccount (derived from token principal)
        let funding_subaccount = derive_backend_subaccount(
            allocation.token.canister_id,
            allocation_id
        );

        // Create ICRC1 actor for ICP ledger
        let icrc1_payment_actor = actor(Principal.toText(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"))) : T.ICRC1Interface;

        // Create ICRC1 actor for token
        let icrc1_funding_actor = actor(Principal.toText(allocation.token.canister_id)) : T.ICRC1Interface;

        // Check payment balance
        let payment_balance = await icrc1_payment_actor.icrc1_balance_of({ 
            owner = this_canister_id; 
            subaccount = ?payment_subaccount
        });

        // Check funding balance
        let funding_balance = await icrc1_funding_actor.icrc1_balance_of({ 
            owner = this_canister_id; 
            subaccount = ?funding_subaccount
        });

        // Return payment balance if any
        if (payment_balance > 0) {
            let payment_result = await icrc1_payment_actor.icrc1_transfer({
                from_subaccount = ?payment_subaccount;
                to = { owner = caller; subaccount = null };
                amount = payment_balance;
                fee = null;
                memo = null;
                created_at_time = null;
            });
            switch (payment_result) {
                case (#Err(e)) return #err("Failed to return payment: " # debug_show(e));
                case (#Ok(_)) {};
            };
        };

        // Return funding balance if any
        if (funding_balance > 0) {
            let funding_result = await icrc1_funding_actor.icrc1_transfer({
                from_subaccount = ?funding_subaccount;
                to = { owner = caller; subaccount = null };
                amount = funding_balance;
                fee = null;
                memo = null;
                created_at_time = null;
            });
            switch (funding_result) {
                case (#Err(e)) return #err("Failed to return funds: " # debug_show(e));
                case (#Ok(_)) {};
            };
        };

        // Return success - status update will be done in main.mo
        #ok(())
    };

    // Get all allocations created by a user
    public func get_user_created_allocations(
        creator: Principal,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
    ) : [{
        allocation: T.Allocation;
        status: T.AllocationStatus;
    }] {
        let results = Buffer.Buffer<{
            allocation: T.Allocation;
            status: T.AllocationStatus;
        }>(0);

        for ((id, allocation) in allocations.entries()) {
            if (allocation.creator == creator) {
                switch (allocation_statuses.get(id)) {
                    case (?status) {
                        results.add({
                            allocation = allocation;
                            status = status;
                        });
                    };
                    case null {}; // Skip if no status found (shouldn't happen)
                };
            };
        };

        Buffer.toArray(results)
    };
}