import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Debug "mo:base/Debug";
import Error "mo:base/Error";
import HashMap "mo:base/HashMap";
import T "./Types";

module {
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

    // Fund an allocation by verifying the transfer of tokens
    public func fund_allocation(
        caller: Principal,
        allocation_id: Text,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
    ) : Result.Result<(), Text> {
        // Get allocation
        let allocation = switch (allocations.get(allocation_id)) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify caller is creator
        if (caller != allocation.creator) {
            return #err("Only the creator can fund this allocation");
        };

        // Verify current status
        switch (allocation_statuses.get(allocation_id)) {
            case (?#Draft) {};  // This is the only valid state
            case (?status) return #err("Allocation is not in Draft status");
            case null return #err("Allocation status not found");
        };

        // Return success - actual token transfer verification will be done in main.mo
        #ok(())
    };

    // Activate an allocation to allow claims
    public func activate_allocation(
        caller: Principal,
        allocation_id: Text,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
    ) : Result.Result<(), Text> {
        // Get allocation
        let allocation = switch (allocations.get(allocation_id)) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify caller is creator
        if (caller != allocation.creator) {
            return #err("Only the creator can activate this allocation");
        };

        // Verify current status
        switch (allocation_statuses.get(allocation_id)) {
            case (?#Funded) {};  // This is the only valid state
            case (?status) return #err("Allocation must be in Funded status");
            case null return #err("Allocation status not found");
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