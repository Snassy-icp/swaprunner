import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import HashMap "mo:base/HashMap";
import Debug "mo:base/Debug";
import Bool "mo:base/Bool";

import T "./Types";

module {
    // Static condition definitions
    private let TRADES_ABOVE_AMOUNT : T.Condition = {
        key = "trades_above_amount";
        name = "Large Trade Achievement";
        description = "Execute trades above specified amount";
        parameter_specs = [{
            name = "min_amount_e8s";
            param_type = #Nat;
            default_value = null;
        }];
    };

    private let TOTAL_TRADES_COUNT : T.Condition = {
        key = "total_trades_count";
        name = "Trade Count Achievement";
        description = "Execute a certain number of trades, optionally of a specific type (icpswap/kong/split)";
        parameter_specs = [
            {
                name = "min_trades";
                param_type = #Nat;
                default_value = null;
            },
            {
                name = "swap_type";
                param_type = #Text;
                default_value = null;  // null means any type
            }
        ];
    };

    private let TOKEN_TRADE_VOLUME : T.Condition = {
        key = "token_trade_volume";
        name = "Token Volume Achievement";
        description = "Trade a certain volume of a specific token";
        parameter_specs = [
            {
                name = "token_id";
                param_type = #Text;
                default_value = null;
            },
            {
                name = "min_volume_e8s";
                param_type = #Nat;
                default_value = null;
            }
        ];
    };

    private let LOGIN_COUNT : T.Condition = {
        key = "login_count";
        name = "Login Count Achievement";
        description = "Achieve a certain number of logins";
        parameter_specs = [{
            name = "min_logins";
            param_type = #Nat;
            default_value = null;
        }];
    };

    // Public setup function to initialize registry in main.mo
    public func setup_registry() : [(Text, T.Condition)] {
        [
            (TRADES_ABOVE_AMOUNT.key, TRADES_ABOVE_AMOUNT),
            (TOTAL_TRADES_COUNT.key, TOTAL_TRADES_COUNT),
            (TOKEN_TRADE_VOLUME.key, TOKEN_TRADE_VOLUME),
            (LOGIN_COUNT.key, LOGIN_COUNT)
        ]
    };

    // Helper functions
    private func getUserTokenStatsKey(user: Principal, token_id: Text) : Text {
        Principal.toText(user) # ":" # token_id;
    };

    // Condition evaluation helpers
    private func evaluate_trades_above_amount(
        context: T.Context,
        user: Principal,
        parameters: [{#Principal: Principal; #Nat: Nat; #Text: Text}]
    ) : async Bool {
        Debug.print("Evaluating trades_above_amount condition");
        let min_amount = switch (parameters[0]) {
            case (#Nat(amount)) {
                Debug.print("Min amount parameter: " # Nat.toText(amount));
                ?amount;
            };
            case _ {
                Debug.print("Invalid min_amount parameter type");
                null;
            };
        };
        
        switch (min_amount) {
            case null {
                Debug.print("No valid min_amount parameter");
                return false;
            };
            case (?min) {
                let stats = switch (context.user_stats.get(Principal.toText(user))) {
                    case null {
                        Debug.print("No user stats found");
                        return false;
                    };
                    case (?s) {
                        Debug.print("Found user stats");
                        s;
                    };
                };
                // TODO: Implement largest trade check when we add that stat
                Debug.print("trades_above_amount not yet implemented");
                return false;
            };
        };
    };

    private func evaluate_total_trades_count(
        context: T.Context,
        user: Principal,
        parameters: [{#Principal: Principal; #Nat: Nat; #Text: Text}]
    ) : async Bool {
        Debug.print("Evaluating total_trades_count condition");
        
        // Get min_trades parameter
        let min_trades = switch (parameters[0]) {
            case (#Nat(trades)) {
                Debug.print("Min trades parameter: " # Nat.toText(trades));
                ?trades;
            };
            case _ {
                Debug.print("Invalid min_trades parameter type");
                null;
            };
        };

        // Get optional swap_type parameter
        let swap_type = if (parameters.size() > 1) {
            switch (parameters[1]) {
                case (#Text(type_)) {
                    Debug.print("Swap type parameter: " # type_);
                    ?type_;
                };
                case _ {
                    Debug.print("Invalid swap_type parameter type");
                    null;
                };
            };
        } else {
            Debug.print("No swap_type specified, using any");
            null;
        };
        
        switch (min_trades) {
            case null {
                Debug.print("No valid min_trades parameter");
                return false;
            };
            case (?min) {
                let stats = switch (context.user_stats.get(Principal.toText(user))) {
                    case null {
                        Debug.print("No user stats found");
                        return false;
                    };
                    case (?s) {
                        Debug.print("Found user stats");
                        s;
                    };
                };

                // Get the appropriate trade count based on swap type
                let trade_count = switch (swap_type) {
                    case (?type_) {
                        switch (type_) {
                            case "icpswap" {
                                Debug.print("Checking ICPSwap trades: " # Nat.toText(stats.icpswap_swaps));
                                stats.icpswap_swaps;
                            };
                            case "kong" {
                                Debug.print("Checking Kong trades: " # Nat.toText(stats.kong_swaps));
                                stats.kong_swaps;
                            };
                            case "split" {
                                Debug.print("Checking split trades: " # Nat.toText(stats.split_swaps));
                                stats.split_swaps;
                            };
                            case _ {
                                Debug.print("Invalid swap type: " # type_ # ", using total trades");
                                stats.total_swaps;
                            };
                        };
                    };
                    case null {
                        Debug.print("No swap type specified, using total trades: " # Nat.toText(stats.total_swaps));
                        stats.total_swaps;
                    };
                };

                let result = trade_count >= min;
                let type_str = switch (swap_type) {
                    case (?type_) ", type: " # type_;
                    case null ", type: any";
                };
                Debug.print("Trade count condition result: " # Bool.toText(result) # 
                          " (required: " # Nat.toText(min) # 
                          ", actual: " # Nat.toText(trade_count) # 
                          type_str);
                return result;
            };
        };
    };

    private func evaluate_token_trade_volume(
        context: T.Context,
        user: Principal,
        parameters: [{#Principal: Principal; #Nat: Nat; #Text: Text}]
    ) : async Bool {
        Debug.print("Evaluating token_trade_volume condition");
        let token_id = switch (parameters[0]) {
            case (#Text(id)) {
                Debug.print("Token ID parameter: " # id);
                ?id;
            };
            case _ {
                Debug.print("Invalid token_id parameter type");
                null;
            };
        };
        
        let min_volume = switch (parameters[1]) {
            case (#Nat(volume)) {
                Debug.print("Min volume parameter: " # Nat.toText(volume));
                ?volume;
            };
            case _ {
                Debug.print("Invalid min_volume parameter type");
                null;
            };
        };
        
        switch (token_id, min_volume) {
            case (?id, ?min) {
                let stats = switch (context.user_token_stats.get(getUserTokenStatsKey(user, id))) {
                    case null {
                        Debug.print("No token stats found for token: " # id);
                        return false;
                    };
                    case (?stats) {
                        Debug.print("Found token stats");
                        stats;
                    };
                };
                let total_volume = stats.input_volume_e8s_icpswap + 
                                 stats.input_volume_e8s_kong +
                                 stats.input_volume_e8s_split;
                let result = total_volume >= min;
                Debug.print("Token volume condition result: " # Bool.toText(result) # 
                          " (required: " # Nat.toText(min) # 
                          ", actual: " # Nat.toText(total_volume) # ")");
                return result;
            };
            case _ {
                Debug.print("Missing token_id or min_volume parameter");
                return false;
            };
        };
    };

    private func evaluate_login_count(
        context: T.Context,
        user: Principal,
        parameters: [{#Principal: Principal; #Nat: Nat; #Text: Text}]
    ) : async Bool {
        Debug.print("Evaluating login_count condition");
        let min_logins = switch (parameters[0]) {
            case (#Nat(logins)) {
                Debug.print("Min logins parameter: " # Nat.toText(logins));
                ?logins;
            };
            case _ {
                Debug.print("Invalid min_logins parameter type");
                null;
            };
        };
        
        switch (min_logins) {
            case null {
                Debug.print("No valid min_logins parameter");
                return false;
            };
            case (?min) {
                let login_count = switch (context.user_logins.get(Principal.toText(user))) {
                    case null {
                        Debug.print("No login count found");
                        return false;
                    };
                    case (?count) {
                        Debug.print("Found login count: " # Nat.toText(count));
                        count;
                    };
                };
                let result = login_count >= min;
                Debug.print("Login count condition result: " # Bool.toText(result) # 
                          " (required: " # Nat.toText(min) # 
                          ", actual: " # Nat.toText(login_count) # ")");
                return result;
            };
        };
    };

    // Main condition evaluation function
    public func evaluate_condition(
        context: T.Context,
        user: Principal,
        usage: T.ConditionUsage,
        registry: HashMap.HashMap<Text, T.Condition>
    ) : async Bool {
        Debug.print("Evaluating condition: " # usage.condition_key # " for user: " # Principal.toText(user));
        
        let condition = switch (registry.get(usage.condition_key)) {
            case null {
                Debug.print("Invalid condition key: " # usage.condition_key);
                return false; // Invalid condition key
            };
            case (?c) c;
        };

        Debug.print("Found condition in registry: " # condition.name);
        Debug.print("Parameters received: " # debug_show(usage.parameters));

        switch (usage.condition_key) {
            case "trades_above_amount" {
                await evaluate_trades_above_amount(context, user, usage.parameters);
            };
            case "total_trades_count" {
                await evaluate_total_trades_count(context, user, usage.parameters);
            };
            case "token_trade_volume" {
                await evaluate_token_trade_volume(context, user, usage.parameters);
            };
            case "login_count" {
                await evaluate_login_count(context, user, usage.parameters);
            };
            case _ {
                Debug.print("Unknown condition type: " # usage.condition_key);
                return false; // Unknown condition
            };
        };
    };
};
