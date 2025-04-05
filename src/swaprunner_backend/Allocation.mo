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
import IC "mo:base/ExperimentalInternetComputer";
import Hash "mo:base/Hash";
import Stats "./Stats";

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
        payment_account: ?T.Account,
        cut_account: ?T.Account,
        getOrCreateUserIndex: (Principal) -> Nat16,
        addToAllocationBalance: (Nat, Nat16, Nat) -> (),
        addToServerBalance: (Nat16, Nat) -> (),
        getStatsContext: () -> T.StatsContext
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

        // Get tx fee for ICP and token
        let icp_tx_fee = switch (await icrc1_payment_actor.icrc1_fee()) {
            case null 0;
            case (?fee) fee;
        };
        let token_tx_fee = switch (await icrc1_funding_actor.icrc1_fee()) {
            case null 0;
            case (?fee) fee;
        };

        // Verify payment is complete
        if (payment_balance < fee_config.icp_fee_e8s) {
            return #err("Allocation must be fully paid before activation");
        };

        let isIcpAlloc = allocation.token.canister_id == Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");

        // Verify funding is complete
        let required_funding = if (isIcpAlloc) {
            // For ICP allocations, we need to have enough for both the platform fee and the allocation amount
            allocation.token.total_amount_e8s + fee_config.icp_fee_e8s + icp_tx_fee
        } else {
            allocation.token.total_amount_e8s + token_tx_fee
        };

        if (funding_balance < required_funding) {
            return #err("Allocation must be fully funded before activation");
        };

        // Get payment and cut accounts
        switch (payment_account) {
            case null return #err("Payment account not configured");
            case (?pa) {
                // Send ICP payment if amount > tx fee
                if (payment_balance > icp_tx_fee) {
                    let payment_result = await icrc1_payment_actor.icrc1_transfer({
                        from_subaccount = ?payment_subaccount;
                        to = pa;
                        amount = fee_config.icp_fee_e8s - icp_tx_fee;
                        fee = null;
                        memo = null;
                        created_at_time = null;
                    });
                    switch (payment_result) {
                        case (#Err(e)) return #err("Failed to transfer payment: " # debug_show(e));
                        case (#Ok(_)) {};
                    };
                };
            };
        };

        // Calculate cut amount (cut_basis_points is in basis points, i.e. 1/100th of a percent)
        var cut_amount = 0;

        // Send cut amount if configured and amount > tx fee
        switch (cut_account) {
            case (?ca) {
                cut_amount := (allocation.token.total_amount_e8s * fee_config.cut_basis_points) / 10000;
                if (cut_amount <= token_tx_fee) {
                    cut_amount := 0;
                };
                if (cut_amount > token_tx_fee) {
                    let cut_result = await icrc1_funding_actor.icrc1_transfer({
                        from_subaccount = ?funding_subaccount;
                        to = ca;
                        amount = cut_amount - token_tx_fee;
                        fee = null;
                        memo = null;
                        created_at_time = null;
                    });
                    switch (cut_result) {
                        case (#Err(e)) return #err("Failed to transfer cut: " # debug_show(e));
                        case (#Ok(_)) {};
                    };
                };
            };
            case null {}; // No cut account configured, skip cut transfer
        };

        // Calculate remaining amount after cut
        let remaining_amount = if (allocation.token.total_amount_e8s > cut_amount) { allocation.token.total_amount_e8s - cut_amount; } else { 0 };

        // Send remaining amount to server subaccount if amount > tx fee
        if (remaining_amount > token_tx_fee) {
            let server_subaccount = derive_backend_subaccount(allocation.token.canister_id, 0);
            let server_result = await icrc1_funding_actor.icrc1_transfer({
                from_subaccount = ?funding_subaccount;
                to = { owner = this_canister_id; subaccount = ?server_subaccount };
                amount = remaining_amount;  // we don't subtract tx fee because we have made room for one extra fee so the allocation.token.total_amount_e8s is what ends up in the allocation balance (minus cut)
                fee = null;
                memo = null;
                created_at_time = null;
            });
            switch (server_result) {
                case (#Err(e)) return #err("Failed to transfer to server: " # debug_show(e));
                case (#Ok(_)) {
                    let token_index = getOrCreateUserIndex(allocation.token.canister_id);
                    // Increase allocation balance
                    addToAllocationBalance(allocation_id, token_index, remaining_amount);
                    // Increase server balance
                    addToServerBalance(token_index, remaining_amount);

                    // Update allocation total amount
                    let updated_allocation = {
                        allocation with
                        token = {
                            allocation.token with
                            total_amount_e8s = remaining_amount;
                        }
                    };

                    allocations.put(Nat.toText(allocation_id), updated_allocation);
                    allocation_statuses.put(Nat.toText(allocation_id), #Active);

                    // Record allocation stats
                    await Stats.record_allocation_creation(
                        caller,
                        Principal.toText(allocation.token.canister_id),
                        remaining_amount,
                        fee_config.icp_fee_e8s,
                        cut_amount,
                        getStatsContext()
                    );
                };
            };
        };

        // Return success - status update will be done in main.mo
        #ok(())
    };

    // Check if a user is eligible to claim from an allocation
    public func check_claim_eligibility(
        caller: Principal,
        allocation_id: Nat,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        allocation_claims: HashMap.HashMap<Text, T.AllocationClaim>,
        user_achievements: HashMap.HashMap<Text, [T.UserAchievement]>,
    ) : Result.Result<T.Allocation, Text> {
        Debug.print("Checking claim eligibility for user: " # Principal.toText(caller));
        
        // Get allocation
        let allocation = switch (allocations.get(Nat.toText(allocation_id))) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify allocation is active
        switch (allocation_statuses.get(Nat.toText(allocation_id))) {
            case (?#Active) {};
            case (?status) return #err("Allocation is not active");
            case null return #err("Allocation status not found");
        };

        // Verify user has the achievement
        let user_key = Principal.toText(caller);
        Debug.print("Looking up achievements with key: " # user_key);
        
        let user_achievements_arr = switch (user_achievements.get(user_key)) {
            case null {
                Debug.print("No achievements found for key: " # user_key);
                Debug.print("Available achievement keys: " # debug_show(Iter.toArray(user_achievements.keys())));
                return #err("No achievements found for user");
            };
            case (?ua) {
                Debug.print("Found " # Nat.toText(ua.size()) # " achievements for user");
                ua;
            };
        };

        let has_achievement = Buffer.Buffer<T.UserAchievement>(0);
        for (achievement in user_achievements_arr.vals()) {
            if (achievement.achievement_id == allocation.achievement_id) {
                has_achievement.add(achievement);
            };
        };

        if (has_achievement.size() == 0) {
            Debug.print("User does not have achievement: " # allocation.achievement_id);
            Debug.print("User's achievements: " # debug_show(user_achievements_arr));
            return #err("User does not have the required achievement");
        };

        // Verify user hasn't already claimed
        let claim_key = get_claim_key(caller, Nat.toText(allocation_id));
        switch (allocation_claims.get(claim_key)) {
            case (?_) return #err("User has already claimed from this allocation");
            case null {};
        };

        #ok(allocation)
    };

    // Process a claim request
    public func process_claim(
        caller: Principal,
        allocation_id: Nat,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        allocation_claims: HashMap.HashMap<Text, T.AllocationClaim>,
        user_achievements: HashMap.HashMap<Text, [T.UserAchievement]>,
        get_allocation_balance: (Nat, Nat16) -> Nat,
        getOrCreateUserIndex: (Principal) -> Nat16,
    ) : Result.Result<Nat, Text> {
        // Check eligibility
        switch(check_claim_eligibility(
            caller,
            allocation_id,
            allocations,
            allocation_statuses,
            allocation_claims,
            user_achievements
        )) {
            case (#err(msg)) return #err(msg);
            case (#ok(allocation)) {
                // Get available balance
                let token_index = getOrCreateUserIndex(allocation.token.canister_id);

                let available_balance = get_allocation_balance(allocation_id, token_index);
                if (available_balance == 0) {
                    return #err("Allocation has no remaining balance");
                };

                // Constrain max by available balance
                let max_e8s = Nat.min(allocation.token.per_user.max_e8s, available_balance);
                if (max_e8s < allocation.token.per_user.min_e8s) {
                    return #ok(max_e8s);
                };

                var result_e8s = 0;
                if (max_e8s > allocation.token.per_user.min_e8s) {
                    // Generate pseudo-random number using Time.now()
                    let now = Int.abs(Time.now());
                    let hash = Hash.hash(now);
                    let range = max_e8s - allocation.token.per_user.min_e8s + 1;
                    let random_amount = allocation.token.per_user.min_e8s + (Nat32.toNat(hash) % range);
                    result_e8s := random_amount;
                } else {
                    result_e8s := max_e8s;
                };

                // If the remainder of the balance is less than the minimum claim amount, add the remainder
                let remainder = if (available_balance > result_e8s) { available_balance - result_e8s; } else { 0 };
                if (remainder < allocation.token.per_user.min_e8s) {
                    result_e8s += remainder;
                };

                #ok(result_e8s)

            };
        }
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

        // Get tx fee for ICP and token
        let icp_tx_fee = switch (await icrc1_payment_actor.icrc1_fee()) {
            case null 0;
            case (?fee) fee;
        };
        let token_tx_fee = switch (await icrc1_funding_actor.icrc1_fee()) {
            case null 0;
            case (?fee) fee;
        };

        // Return payment balance if bigger than tx fee
        if (payment_balance > icp_tx_fee) {
            let payment_result = await icrc1_payment_actor.icrc1_transfer({
                from_subaccount = ?payment_subaccount;
                to = { owner = caller; subaccount = null };
                amount = payment_balance - icp_tx_fee; // here we must subtract the ICP transaction fee
                fee = null;
                memo = null;
                created_at_time = null;
            });
            switch (payment_result) {
                case (#Err(e)) return #err("Failed to return payment: " # debug_show(e));
                case (#Ok(_)) {};
            };
        };

        // If this was an ICP allocation we have already returned the funds with the payment
        if (allocation.token.canister_id == Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")) {    
            return #ok(());
        };

        // Return funding balance if bigger than tx fee
        if (funding_balance > token_tx_fee) {
            let funding_result = await icrc1_funding_actor.icrc1_transfer({
                from_subaccount = ?funding_subaccount;
                to = { owner = caller; subaccount = null };
                amount = funding_balance - token_tx_fee; // here we must subtract the token transaction fee
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

    // Get all available claims for a user's achievements
    public func get_available_claims(
        caller: Principal,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        allocation_claims: HashMap.HashMap<Text, T.AllocationClaim>,
        user_achievements: HashMap.HashMap<Text, [T.UserAchievement]>,
    ) : [{
        achievement_id: Text;
        allocation_id: Text;
        token_canister_id: Principal;
        claimable_amount: {
            min_e8s: Nat;
            max_e8s: Nat;
        };
    }] {
        let results = Buffer.Buffer<{
            achievement_id: Text;
            allocation_id: Text;
            token_canister_id: Principal;
            claimable_amount: {
                min_e8s: Nat;
                max_e8s: Nat;
            };
        }>(0);

        // Get user's achievements
        let user_achievements_arr = switch (user_achievements.get(Principal.toText(caller))) {
            case null { [] };
            case (?ua) { ua };
        };

        // Create a set of achievement IDs for faster lookup
        let achievement_ids = HashMap.HashMap<Text, Bool>(user_achievements_arr.size(), Text.equal, Text.hash);
        for (achievement in user_achievements_arr.vals()) {
            achievement_ids.put(achievement.achievement_id, true);
        };

        // Check each allocation
        for ((id, allocation) in allocations.entries()) {
            // Check if user has the achievement
            switch (achievement_ids.get(allocation.achievement_id)) {
                case null {};
                case (?_) {
                    // Check if allocation is active
                    switch (allocation_statuses.get(id)) {
                        case (?#Active) {
                            // Check if user hasn't claimed yet
                            let claim_key = get_claim_key(caller, id);
                            switch (allocation_claims.get(claim_key)) {
                                case (?_) {};
                                case null {
                                    // All conditions met, add to results
                                    results.add({
                                        achievement_id = allocation.achievement_id;
                                        allocation_id = id;
                                        token_canister_id = allocation.token.canister_id;
                                        claimable_amount = allocation.token.per_user;
                                    });
                                };
                            };
                        };
                        case (?_) {};
                        case null {};
                    };
                };
            };
        };

        Buffer.toArray(results)
    };

    // Top up an allocation with additional funds
    public func top_up_allocation(
        caller: Principal,
        allocation_id: Nat,
        amount_e8s: Nat,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        allocation_statuses: HashMap.HashMap<Text, T.AllocationStatus>,
        fee_config: T.AllocationFeeConfig,
        this_canister_id: Principal,
        cut_account: ?T.Account,
        getOrCreateUserIndex: (Principal) -> Nat16,
        addToAllocationBalance: (Nat, Nat16, Nat) -> (),
        addToServerBalance: (Nat16, Nat) -> (),
        getStatsContext: () -> T.StatsContext,
    ) : async Result.Result<(), Text> {
        // Get allocation
        let allocation = switch (allocations.get(Nat.toText(allocation_id))) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify caller is creator
        if (caller != allocation.creator) {
            return #err("Only the creator can top up this allocation");
        };

        // Verify current status is Active
        switch (allocation_statuses.get(Nat.toText(allocation_id))) {
            case (?#Active) {};
            case (?#Depleted) {};  
            case (?status) return #err("Allocation must be in Active or Depleted status to top up");
            case null return #err("Allocation status not found");
        };

        // Get funding subaccount (derived from token principal)
        let funding_subaccount = derive_backend_subaccount(
            allocation.token.canister_id,
            allocation_id
        );

        // Create ICRC1 actor for token
        let icrc1_funding_actor = actor(Principal.toText(allocation.token.canister_id)) : T.ICRC1Interface;

        // Check funding balance
        let funding_balance = await icrc1_funding_actor.icrc1_balance_of({ 
            owner = this_canister_id; 
            subaccount = ?funding_subaccount
        });

        // Get tx fee for token
        let token_tx_fee = switch (await icrc1_funding_actor.icrc1_fee()) {
            case null 0;
            case (?fee) fee;
        };

        // Verify funding amount is sufficient
        if (funding_balance < amount_e8s + token_tx_fee) {
            return #err("Insufficient funds in funding subaccount");
        };

        var cut_amount = 0;
        // Calculate and transfer cut if configured
        switch (cut_account) {
            case (?ca) {
                cut_amount := (amount_e8s * fee_config.cut_basis_points) / 10000;
                if (cut_amount <= token_tx_fee) {
                    cut_amount := 0;
                };
                if (cut_amount > token_tx_fee) {
                    let cut_result = await icrc1_funding_actor.icrc1_transfer({
                        from_subaccount = ?funding_subaccount;
                        to = ca;
                        amount = cut_amount - token_tx_fee;
                        fee = null;
                        memo = null;
                        created_at_time = null;
                    });
                    switch (cut_result) {
                        case (#Err(e)) return #err("Failed to transfer cut: " # debug_show(e));
                        case (#Ok(_)) {};
                    };
                };
            };
            case null {}; // No cut account configured, skip cut transfer
        };

        // Calculate remaining amount after cut
        let remaining_amount = if (amount_e8s > cut_amount) { amount_e8s - cut_amount; } else { 0 };

        // Send remaining amount to server subaccount if amount > tx fee
        if (remaining_amount > token_tx_fee) {
            let server_subaccount = derive_backend_subaccount(allocation.token.canister_id, 0);
            let server_result = await icrc1_funding_actor.icrc1_transfer({
                from_subaccount = ?funding_subaccount;
                to = { owner = this_canister_id; subaccount = ?server_subaccount };
                amount = remaining_amount;
                fee = null;
                memo = null;
                created_at_time = null;
            });
            switch (server_result) {
                case (#Err(e)) return #err("Failed to transfer to server: " # debug_show(e));
                case (#Ok(_)) {
                    let token_index = getOrCreateUserIndex(allocation.token.canister_id);
                    // Increase allocation balance
                    addToAllocationBalance(allocation_id, token_index, remaining_amount);
                    // Increase server balance
                    addToServerBalance(token_index, remaining_amount);

                    // Update allocation total amount
                    let updated_allocation = {
                        allocation with
                        token = {
                            allocation.token with
                            total_amount_e8s = allocation.token.total_amount_e8s + remaining_amount;
                        }
                    };
                    
                    allocations.put(Nat.toText(allocation_id), updated_allocation);

                    // Record allocation stats
                    await Stats.record_allocation_top_up(
                        caller,
                        Principal.toText(allocation.token.canister_id),
                        remaining_amount,
                        cut_amount,
                        getStatsContext()
                    );

                    // If allocation was depleted, and we have enough funds (more than the allocation min_amount), set its status to active again
                    if (allocation_statuses.get(Nat.toText(allocation_id)) == ?#Depleted) {
                        let min_amount = allocation.token.per_user.min_e8s;
                        if (remaining_amount > min_amount) {
                            allocation_statuses.put(Nat.toText(allocation_id), #Active);
                        };
                    };
                };
            };
        };

        // Return success
        #ok(())
    };

    // Cancel a pending top-up and return funds to caller
    public func cancel_top_up(
        caller: Principal,
        allocation_id: Nat,
        allocations: HashMap.HashMap<Text, T.Allocation>,
        this_canister_id: Principal,
    ) : async Result.Result<(), Text> {
        // Get allocation
        let allocation = switch (allocations.get(Nat.toText(allocation_id))) {
            case null return #err("Allocation not found");
            case (?a) a;
        };

        // Verify caller is creator
        if (caller != allocation.creator) {
            return #err("Only the creator can cancel a top-up");
        };

        // Get funding subaccount (derived from token principal)
        let funding_subaccount = derive_backend_subaccount(
            allocation.token.canister_id,
            allocation_id
        );

        // Create ICRC1 actor for token
        let icrc1_funding_actor = actor(Principal.toText(allocation.token.canister_id)) : T.ICRC1Interface;

        // Check funding balance
        let funding_balance = await icrc1_funding_actor.icrc1_balance_of({ 
            owner = this_canister_id; 
            subaccount = ?funding_subaccount
        });

        // Get tx fee for token
        let token_tx_fee = switch (await icrc1_funding_actor.icrc1_fee()) {
            case null 0;
            case (?fee) fee;
        };

        // Return funding balance if bigger than tx fee
        if (funding_balance > token_tx_fee) {
            let funding_result = await icrc1_funding_actor.icrc1_transfer({
                from_subaccount = ?funding_subaccount;
                to = { owner = caller; subaccount = null };
                amount = funding_balance - token_tx_fee; // here we must subtract the token transaction fee
                fee = null;
                memo = null;
                created_at_time = null;
            });
            switch (funding_result) {
                case (#Err(e)) return #err("Failed to return funds: " # debug_show(e));
                case (#Ok(_)) {};
            };
        };

        // Return success
        #ok(())
    };
}