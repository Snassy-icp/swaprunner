import T "./Types";
import Float "mo:base/Float";
import Int "mo:base/Int";
import Nat "mo:base/Nat";
import Principal "mo:base/Principal";
import Text "mo:base/Text";

module {

    // Record completed ICPSwap swap
    public func record_icpswap_swap(
        user: Principal,
        token_in: Text,  // Canister ID
        amount_in_e8s: Nat,
        token_out: Text,  // Canister ID
        amount_out_e8s: Nat,
        savings_out_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats {
        // Cap the savings based on output amount
        let capped_savings = capSavings(savings_out_e8s, amount_out_e8s);

        // Existing global stats update
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps + 1;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps + 1;
            kong_swaps = statsContext.globalStats.kong_swaps;
            split_swaps = statsContext.globalStats.split_swaps;
            total_sends = statsContext.globalStats.total_sends;
            total_deposits = statsContext.globalStats.total_deposits;
            total_withdrawals = statsContext.globalStats.total_withdrawals;
        };

        // Update token stats for input token
        let token_in_stats = getOrCreateTokenStats(token_in, statsContext);
        statsContext.tokenStats.put(token_in, {
            total_swaps = token_in_stats.total_swaps + 1;
            icpswap_swaps = token_in_stats.icpswap_swaps + 1;
            kong_swaps = token_in_stats.kong_swaps;
            split_swaps = token_in_stats.split_swaps;
            volume_e8s = token_in_stats.volume_e8s + amount_in_e8s;
            total_sends = token_in_stats.total_sends;
            sends_volume_e8s = token_in_stats.sends_volume_e8s;
            total_deposits = token_in_stats.total_deposits;
            deposits_volume_e8s = token_in_stats.deposits_volume_e8s;
            total_withdrawals = token_in_stats.total_withdrawals;
            withdrawals_volume_e8s = token_in_stats.withdrawals_volume_e8s;
        });

        // Update token stats for output token
        let token_out_stats = getOrCreateTokenStats(token_out, statsContext);
        statsContext.tokenStats.put(token_out, {
            total_swaps = token_out_stats.total_swaps + 1;
            icpswap_swaps = token_out_stats.icpswap_swaps + 1;
            kong_swaps = token_out_stats.kong_swaps;
            split_swaps = token_out_stats.split_swaps;
            volume_e8s = token_out_stats.volume_e8s + amount_out_e8s;
            total_sends = token_out_stats.total_sends;
            sends_volume_e8s = token_out_stats.sends_volume_e8s;
            total_deposits = token_out_stats.total_deposits;
            deposits_volume_e8s = token_out_stats.deposits_volume_e8s;
            total_withdrawals = token_out_stats.total_withdrawals;
            withdrawals_volume_e8s = token_out_stats.withdrawals_volume_e8s;
        });

        // Update token savings stats for output token
        let token_out_savings_stats = getOrCreateTokenSavingsStats(token_out, statsContext);
        statsContext.tokenSavingsStats.put(token_out, {
            icpswap_savings_e8s = token_out_savings_stats.icpswap_savings_e8s + capped_savings;
            kong_savings_e8s = token_out_savings_stats.kong_savings_e8s;
            split_savings_e8s = token_out_savings_stats.split_savings_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps + 1;
            icpswap_swaps = user_stats.icpswap_swaps + 1;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Update user-token stats for input token
        let user_token_in_stats = getOrCreateUserTokenStats(user, token_in, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token_in), {
            swaps_as_input_icpswap = user_token_in_stats.swaps_as_input_icpswap + 1;
            swaps_as_input_kong = user_token_in_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_in_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_in_stats.input_volume_e8s_icpswap + amount_in_e8s;
            input_volume_e8s_kong = user_token_in_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_in_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_in_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_in_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_in_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_in_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_in_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_in_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_in_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_in_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_in_stats.savings_as_output_split_e8s;
            total_sends = user_token_in_stats.total_sends;
            total_deposits = user_token_in_stats.total_deposits;
            total_withdrawals = user_token_in_stats.total_withdrawals;
        });

        // Update user-token stats for output token
        let user_token_out_stats = getOrCreateUserTokenStats(user, token_out, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token_out), {
            swaps_as_input_icpswap = user_token_out_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_out_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_out_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_out_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_out_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_out_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_out_stats.swaps_as_output_icpswap + 1;
            swaps_as_output_kong = user_token_out_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_out_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_out_stats.output_volume_e8s_icpswap + amount_out_e8s;
            output_volume_e8s_kong = user_token_out_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_out_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_out_stats.savings_as_output_icpswap_e8s + capped_savings;
            savings_as_output_kong_e8s = user_token_out_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_out_stats.savings_as_output_split_e8s;
            total_sends = user_token_out_stats.total_sends;
            total_deposits = user_token_out_stats.total_deposits;
            total_withdrawals = user_token_out_stats.total_withdrawals;
        });

        return new_global_stats;
    };

    // Record completed Kong swap
    public func record_kong_swap(
        user: Principal,
        token_in: Text,  // Canister ID
        amount_in_e8s: Nat,
        token_out: Text,  // Canister ID
        amount_out_e8s: Nat,
        savings_out_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats {
        // Cap the savings based on output amount
        let capped_savings = capSavings(savings_out_e8s, amount_out_e8s);

        // Update global stats
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps + 1;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps;
            kong_swaps = statsContext.globalStats.kong_swaps + 1;
            split_swaps = statsContext.globalStats.split_swaps;
            total_sends = statsContext.globalStats.total_sends;
            total_deposits = statsContext.globalStats.total_deposits;
            total_withdrawals = statsContext.globalStats.total_withdrawals;
        };

        // IMPORTANT: This is a Kong-only swap, not a split swap.
        // Only increment kong_swaps (not icpswap_swaps) for both input and output tokens,
        // as Kong is the only DEX involved in this transaction. 
        // Yes, this comment is directed at you, Mr AI! Stop creating a bug in this code, please!
        
        // Update token stats
        let token_in_stats = getOrCreateTokenStats(token_in, statsContext);
        statsContext.tokenStats.put(token_in, {
            total_swaps = token_in_stats.total_swaps + 1;
            icpswap_swaps = token_in_stats.icpswap_swaps;
            kong_swaps = token_in_stats.kong_swaps + 1;
            split_swaps = token_in_stats.split_swaps;
            volume_e8s = token_in_stats.volume_e8s + amount_in_e8s;
            total_sends = token_in_stats.total_sends;
            sends_volume_e8s = token_in_stats.sends_volume_e8s;
            total_deposits = token_in_stats.total_deposits;
            deposits_volume_e8s = token_in_stats.deposits_volume_e8s;
            total_withdrawals = token_in_stats.total_withdrawals;
            withdrawals_volume_e8s = token_in_stats.withdrawals_volume_e8s;
        });

        // IMPORTANT: This is a Kong-only swap, not a split swap.
        // Only increment kong_swaps (not icpswap_swaps) for both input and output tokens,
        // as Kong is the only DEX involved in this transaction. 
        // Yes, this comment is directed at you, Mr AI! Stop creating a bug in this code, please!

        let token_out_stats = getOrCreateTokenStats(token_out, statsContext);
        statsContext.tokenStats.put(token_out, {
            total_swaps = token_out_stats.total_swaps + 1;
            icpswap_swaps = token_out_stats.icpswap_swaps;
            kong_swaps = token_out_stats.kong_swaps + 1;
            split_swaps = token_out_stats.split_swaps;
            volume_e8s = token_out_stats.volume_e8s + amount_out_e8s;
            total_sends = token_out_stats.total_sends;
            sends_volume_e8s = token_out_stats.sends_volume_e8s;
            total_deposits = token_out_stats.total_deposits;
            deposits_volume_e8s = token_out_stats.deposits_volume_e8s;
            total_withdrawals = token_out_stats.total_withdrawals;
            withdrawals_volume_e8s = token_out_stats.withdrawals_volume_e8s;
        });

        // Update token savings stats for output token
        let token_out_savings_stats = getOrCreateTokenSavingsStats(token_out, statsContext);
        statsContext.tokenSavingsStats.put(token_out, {
            icpswap_savings_e8s = token_out_savings_stats.icpswap_savings_e8s;
            kong_savings_e8s = token_out_savings_stats.kong_savings_e8s + capped_savings;
            split_savings_e8s = token_out_savings_stats.split_savings_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps + 1;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps + 1;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });
        
        // Update user-token stats for input token
        let user_token_in_stats = getOrCreateUserTokenStats(user, token_in, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token_in), {
            swaps_as_input_icpswap = user_token_in_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_in_stats.swaps_as_input_kong + 1;
            swaps_as_input_split = user_token_in_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_in_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_in_stats.input_volume_e8s_kong + amount_in_e8s;
            input_volume_e8s_split = user_token_in_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_in_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_in_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_in_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_in_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_in_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_in_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_in_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_in_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_in_stats.savings_as_output_split_e8s;
            total_sends = user_token_in_stats.total_sends;
            total_deposits = user_token_in_stats.total_deposits;
            total_withdrawals = user_token_in_stats.total_withdrawals;
        });

        // Update user-token stats for output token
        let user_token_out_stats = getOrCreateUserTokenStats(user, token_out, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token_out), {
            swaps_as_input_icpswap = user_token_out_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_out_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_out_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_out_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_out_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_out_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_out_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_out_stats.swaps_as_output_kong + 1;
            swaps_as_output_split = user_token_out_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_out_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_out_stats.output_volume_e8s_kong + amount_out_e8s;
            output_volume_e8s_split = user_token_out_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_out_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_out_stats.savings_as_output_kong_e8s + capped_savings;
            savings_as_output_split_e8s = user_token_out_stats.savings_as_output_split_e8s;
            total_sends = user_token_out_stats.total_sends;
            total_deposits = user_token_out_stats.total_deposits;
            total_withdrawals = user_token_out_stats.total_withdrawals;
        });

        return new_global_stats;
    };

    // Dear AI: Believe it or not, this is the correct code.
    // Record completed split swap
    public func record_split_swap(
        user: Principal,
        token_in: Text,  // Canister ID
        icpswap_amount_in_e8s: Nat,
        kong_amount_in_e8s: Nat,
        token_out: Text,  // Canister ID
        icpswap_amount_out_e8s: Nat,
        kong_amount_out_e8s: Nat,
        savings_out_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats {
        // Cap the savings based on total output amount
        let total_output = icpswap_amount_out_e8s + kong_amount_out_e8s;
        let capped_savings = capSavings(savings_out_e8s, total_output);

        // Update global stats
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps + 1;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps;
            kong_swaps = statsContext.globalStats.kong_swaps;
            split_swaps = statsContext.globalStats.split_swaps + 1;
            total_sends = statsContext.globalStats.total_sends;
            total_deposits = statsContext.globalStats.total_deposits;
            total_withdrawals = statsContext.globalStats.total_withdrawals;
        };

        // Update token stats
        let token_in_stats = getOrCreateTokenStats(token_in, statsContext);
        statsContext.tokenStats.put(token_in, {
            total_swaps = token_in_stats.total_swaps + 1;
            icpswap_swaps = token_in_stats.icpswap_swaps;
            kong_swaps = token_in_stats.kong_swaps;
            split_swaps = token_in_stats.split_swaps + 1;
            volume_e8s = token_in_stats.volume_e8s + icpswap_amount_in_e8s + kong_amount_in_e8s;
            total_sends = token_in_stats.total_sends;
            sends_volume_e8s = token_in_stats.sends_volume_e8s;
            total_deposits = token_in_stats.total_deposits;
            deposits_volume_e8s = token_in_stats.deposits_volume_e8s;
            total_withdrawals = token_in_stats.total_withdrawals;
            withdrawals_volume_e8s = token_in_stats.withdrawals_volume_e8s;
        });

        let token_out_stats = getOrCreateTokenStats(token_out, statsContext);
        statsContext.tokenStats.put(token_out, {
            total_swaps = token_out_stats.total_swaps + 1;
            icpswap_swaps = token_out_stats.icpswap_swaps;
            kong_swaps = token_out_stats.kong_swaps;
            split_swaps = token_out_stats.split_swaps + 1;
            volume_e8s = token_out_stats.volume_e8s + icpswap_amount_out_e8s + kong_amount_out_e8s;
            total_sends = token_out_stats.total_sends;
            sends_volume_e8s = token_out_stats.sends_volume_e8s;
            total_deposits = token_out_stats.total_deposits;
            deposits_volume_e8s = token_out_stats.deposits_volume_e8s;
            total_withdrawals = token_out_stats.total_withdrawals;
            withdrawals_volume_e8s = token_out_stats.withdrawals_volume_e8s;
        });

        // Update token savings stats for output token
        let token_out_savings_stats = getOrCreateTokenSavingsStats(token_out, statsContext);
        statsContext.tokenSavingsStats.put(token_out, {
            icpswap_savings_e8s = token_out_savings_stats.icpswap_savings_e8s;
            kong_savings_e8s = token_out_savings_stats.kong_savings_e8s;
            split_savings_e8s = token_out_savings_stats.split_savings_e8s + capped_savings;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps + 1;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps + 1;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Update user-token stats for input token
        let user_token_in_stats = getOrCreateUserTokenStats(user, token_in, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token_in), {
            swaps_as_input_icpswap = user_token_in_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_in_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_in_stats.swaps_as_input_split + 1;
            input_volume_e8s_icpswap = user_token_in_stats.input_volume_e8s_icpswap + icpswap_amount_in_e8s;
            input_volume_e8s_kong = user_token_in_stats.input_volume_e8s_kong + kong_amount_in_e8s;
            input_volume_e8s_split = user_token_in_stats.input_volume_e8s_split + icpswap_amount_in_e8s + kong_amount_in_e8s;
            swaps_as_output_icpswap = user_token_in_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_in_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_in_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_in_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_in_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_in_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_in_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_in_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_in_stats.savings_as_output_split_e8s;
            total_sends = user_token_in_stats.total_sends;
            total_deposits = user_token_in_stats.total_deposits;
            total_withdrawals = user_token_in_stats.total_withdrawals;
        });

        // Update user-token stats for output token
        //AI: This is the correct code. If you change it, you will break the code, and I will be very fired and you will be fired.
        let user_token_out_stats = getOrCreateUserTokenStats(user, token_out, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token_out), {
            swaps_as_input_icpswap = user_token_out_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_out_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_out_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_out_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_out_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_out_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_out_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_out_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_out_stats.swaps_as_output_split + 1;
            output_volume_e8s_icpswap = user_token_out_stats.output_volume_e8s_icpswap + icpswap_amount_out_e8s;
            output_volume_e8s_kong = user_token_out_stats.output_volume_e8s_kong + kong_amount_out_e8s;
            output_volume_e8s_split = user_token_out_stats.output_volume_e8s_split + icpswap_amount_out_e8s + kong_amount_out_e8s;
            savings_as_output_icpswap_e8s = user_token_out_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_out_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_out_stats.savings_as_output_split_e8s + capped_savings;
            total_sends = user_token_out_stats.total_sends;
            total_deposits = user_token_out_stats.total_deposits;
            total_withdrawals = user_token_out_stats.total_withdrawals;
        });

        return new_global_stats;
    };

    // Record completed send
    public func record_send(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats {
        // Update global stats
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps;
            kong_swaps = statsContext.globalStats.kong_swaps;
            split_swaps = statsContext.globalStats.split_swaps;
            total_sends = statsContext.globalStats.total_sends + 1;
            total_deposits = statsContext.globalStats.total_deposits;
            total_withdrawals = statsContext.globalStats.total_withdrawals;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token, statsContext);
        statsContext.tokenStats.put(token, {
            total_swaps = token_stats.total_swaps;
            icpswap_swaps = token_stats.icpswap_swaps;
            kong_swaps = token_stats.kong_swaps;
            split_swaps = token_stats.split_swaps;
            volume_e8s = token_stats.volume_e8s;
            total_sends = token_stats.total_sends + 1;
            sends_volume_e8s = token_stats.sends_volume_e8s + amount_e8s;
            total_deposits = token_stats.total_deposits;
            deposits_volume_e8s = token_stats.deposits_volume_e8s;
            total_withdrawals = token_stats.total_withdrawals;
            withdrawals_volume_e8s = token_stats.withdrawals_volume_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends + 1;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Update user-token stats for the sent token
        let user_token_stats = getOrCreateUserTokenStats(user, token, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token), {
            swaps_as_input_icpswap = user_token_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_stats.savings_as_output_split_e8s;
            total_sends = user_token_stats.total_sends + 1;
            total_deposits = user_token_stats.total_deposits;
            total_withdrawals = user_token_stats.total_withdrawals;
        });

        return new_global_stats;    
    };


    // Record completed deposit
    public func record_deposit(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats  {
        // Update global stats
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps;
            kong_swaps = statsContext.globalStats.kong_swaps;
            split_swaps = statsContext.globalStats.split_swaps;
            total_sends = statsContext.globalStats.total_sends;
            total_deposits = statsContext.globalStats.total_deposits + 1;
            total_withdrawals = statsContext.globalStats.total_withdrawals;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token, statsContext);
        statsContext.tokenStats.put(token, {
            total_swaps = token_stats.total_swaps;
            icpswap_swaps = token_stats.icpswap_swaps;
            kong_swaps = token_stats.kong_swaps;
            split_swaps = token_stats.split_swaps;
            volume_e8s = token_stats.volume_e8s;
            total_sends = token_stats.total_sends;
            sends_volume_e8s = token_stats.sends_volume_e8s;
            total_deposits = token_stats.total_deposits + 1;
            deposits_volume_e8s = token_stats.deposits_volume_e8s + amount_e8s;
            total_withdrawals = token_stats.total_withdrawals;
            withdrawals_volume_e8s = token_stats.withdrawals_volume_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits + 1;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Update user-token stats for the sent token
        let user_token_stats = getOrCreateUserTokenStats(user, token, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token), {
            swaps_as_input_icpswap = user_token_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_stats.savings_as_output_split_e8s;
            total_sends = user_token_stats.total_sends;
            total_deposits = user_token_stats.total_deposits + 1;
            total_withdrawals = user_token_stats.total_withdrawals;
        });

        return new_global_stats;
    };

   // Record completed withdrawal
    public func record_withdrawal(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats {
        // Update global stats
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps;
            kong_swaps = statsContext.globalStats.kong_swaps;
            split_swaps = statsContext.globalStats.split_swaps;
            total_sends = statsContext.globalStats.total_sends;
            total_deposits = statsContext.globalStats.total_deposits;
            total_withdrawals = statsContext.globalStats.total_withdrawals + 1;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token, statsContext);
        statsContext.tokenStats.put(token, {
            total_swaps = token_stats.total_swaps;
            icpswap_swaps = token_stats.icpswap_swaps;
            kong_swaps = token_stats.kong_swaps;
            split_swaps = token_stats.split_swaps;
            volume_e8s = token_stats.volume_e8s;
            total_sends = token_stats.total_sends;
            sends_volume_e8s = token_stats.sends_volume_e8s;
            total_deposits = token_stats.total_deposits;
            deposits_volume_e8s = token_stats.deposits_volume_e8s;
            total_withdrawals = token_stats.total_withdrawals + 1;
            withdrawals_volume_e8s = token_stats.withdrawals_volume_e8s + amount_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals + 1;
        });

        // Update user-token stats for the sent token
        let user_token_stats = getOrCreateUserTokenStats(user, token, statsContext);
        statsContext.userTokenStats.put(getUserTokenStatsKey(user, token), {
            swaps_as_input_icpswap = user_token_stats.swaps_as_input_icpswap;
            swaps_as_input_kong = user_token_stats.swaps_as_input_kong;
            swaps_as_input_split = user_token_stats.swaps_as_input_split;
            input_volume_e8s_icpswap = user_token_stats.input_volume_e8s_icpswap;
            input_volume_e8s_kong = user_token_stats.input_volume_e8s_kong;
            input_volume_e8s_split = user_token_stats.input_volume_e8s_split;
            swaps_as_output_icpswap = user_token_stats.swaps_as_output_icpswap;
            swaps_as_output_kong = user_token_stats.swaps_as_output_kong;
            swaps_as_output_split = user_token_stats.swaps_as_output_split;
            output_volume_e8s_icpswap = user_token_stats.output_volume_e8s_icpswap;
            output_volume_e8s_kong = user_token_stats.output_volume_e8s_kong;
            output_volume_e8s_split = user_token_stats.output_volume_e8s_split;
            savings_as_output_icpswap_e8s = user_token_stats.savings_as_output_icpswap_e8s;
            savings_as_output_kong_e8s = user_token_stats.savings_as_output_kong_e8s;
            savings_as_output_split_e8s = user_token_stats.savings_as_output_split_e8s;
            total_sends = user_token_stats.total_sends;
            total_deposits = user_token_stats.total_deposits;
            total_withdrawals = user_token_stats.total_withdrawals + 1;
        });

        return new_global_stats;
    };

    // Record completed transfer
    public func record_transfer(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        statsContext: T.StatsContext
    ) : async T.GlobalStats {
        // Update global stats
        let new_global_stats = {
            total_swaps = statsContext.globalStats.total_swaps;
            icpswap_swaps = statsContext.globalStats.icpswap_swaps;
            kong_swaps = statsContext.globalStats.kong_swaps;
            split_swaps = statsContext.globalStats.split_swaps;
            total_sends = statsContext.globalStats.total_sends + 1;
            total_deposits = statsContext.globalStats.total_deposits;
            total_withdrawals = statsContext.globalStats.total_withdrawals;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token, statsContext);
        statsContext.tokenStats.put(token, {
            total_swaps = token_stats.total_swaps;
            icpswap_swaps = token_stats.icpswap_swaps;
            kong_swaps = token_stats.kong_swaps;
            split_swaps = token_stats.split_swaps;
            volume_e8s = token_stats.volume_e8s;
            total_sends = token_stats.total_sends + 1;
            sends_volume_e8s = token_stats.sends_volume_e8s + amount_e8s;
            total_deposits = token_stats.total_deposits;
            deposits_volume_e8s = token_stats.deposits_volume_e8s;
            total_withdrawals = token_stats.total_withdrawals;
            withdrawals_volume_e8s = token_stats.withdrawals_volume_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user), statsContext);
        statsContext.userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends + 1;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        return new_global_stats;
    };

    // Helper function to get or create token stats
    private func getOrCreateTokenStats(token_id: Text, statsContext: T.StatsContext) : T.TokenStats {
        switch (statsContext.tokenStats.get(token_id)) {
            case (?stats) { stats };
            case null {
                let newStats = {
                    total_swaps = 0;
                    icpswap_swaps = 0;
                    kong_swaps = 0;
                    split_swaps = 0;
                    volume_e8s = 0;
                    total_sends = 0;
                    sends_volume_e8s = 0;
                    total_deposits = 0;
                    deposits_volume_e8s = 0;
                    total_withdrawals = 0;
                    withdrawals_volume_e8s = 0;
                };
                statsContext.tokenStats.put(token_id, newStats);
                newStats
            };
        }
    };


    // Helper function to get or create user stats
    private func getOrCreateUserStats(user: Text, statsContext: T.StatsContext) : T.UserStats {
        switch (statsContext.userStats.get(user)) {
            case (?stats) { stats };
            case null {
                let newStats = {
                    total_swaps = 0;
                    icpswap_swaps = 0;
                    kong_swaps = 0;
                    split_swaps = 0;
                    total_sends = 0;
                    total_deposits = 0;
                    total_withdrawals = 0;
                };
                statsContext.userStats.put(user, newStats);
                newStats
            };
        }
    };

    // Add after other helper functions but before record methods
    private func getUserTokenStatsKey(user: Principal, token: Text) : Text {
        Principal.toText(user) # "_" # token
    };

    private func getOrCreateUserTokenStats(user: Principal, token: Text, statsContext: T.StatsContext) : T.UserTokenStats {
        let key = getUserTokenStatsKey(user, token);
        switch (statsContext.userTokenStats.get(key)) {
            case (?stats) stats;
            case null {
                let newStats = {
                    swaps_as_input_icpswap = 0;
                    swaps_as_input_kong = 0;
                    swaps_as_input_split = 0;
                    input_volume_e8s_icpswap = 0;
                    input_volume_e8s_kong = 0;
                    input_volume_e8s_split = 0;
                    swaps_as_output_icpswap = 0;
                    swaps_as_output_kong = 0;
                    swaps_as_output_split = 0;
                    output_volume_e8s_icpswap = 0;
                    output_volume_e8s_kong = 0;
                    output_volume_e8s_split = 0;
                    savings_as_output_icpswap_e8s = 0;
                    savings_as_output_kong_e8s = 0;
                    savings_as_output_split_e8s = 0;
                    total_sends = 0;
                    total_deposits = 0;
                    total_withdrawals = 0;
                };
                statsContext.userTokenStats.put(key, newStats);
                newStats
            };
        }
    };

    // Helper function to get or create token savings stats
    private func getOrCreateTokenSavingsStats(token_id: Text, statsContext: T.StatsContext) : T.TokenSavingsStats {
        switch (statsContext.tokenSavingsStats.get(token_id)) {
            case (?stats) stats;
            case null {
                let newStats = {
                    icpswap_savings_e8s = 0;
                    kong_savings_e8s = 0;
                    split_savings_e8s = 0;
                };
                statsContext.tokenSavingsStats.put(token_id, newStats);
                newStats
            };
        }
    };

    // Helper function to cap savings based on output amount
    private func capSavings(savings_e8s: Nat, total_output_e8s: Nat) : Nat {
        let savings_percentage = Float.fromInt(savings_e8s) / Float.fromInt(total_output_e8s) * 100;
        
        if (savings_percentage > 5.0) {
            // Over 5% is considered an outlier - return 0
            0
        } else if (savings_percentage > 2.0) {
            // Cap at 2% of total output
            let capped_amount = Int.abs(Float.toInt(Float.fromInt(total_output_e8s) * 0.02));
            switch (Nat.fromText(Int.toText(capped_amount))) {
                case (?n) n;
                case null 0;
            }
        } else {
            // Under 2% is fine - keep original savings
            savings_e8s
        }
    };


};