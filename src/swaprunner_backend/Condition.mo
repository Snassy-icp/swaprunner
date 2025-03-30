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
        description = "Execute a certain number of trades";
        parameter_specs = [{
            name = "min_trades";
            param_type = #Nat;
            default_value = null;
        }];
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

    // Public setup function to initialize registry in main.mo
    public func setup_registry() : [(Text, T.Condition)] {
        [
            (TRADES_ABOVE_AMOUNT.key, TRADES_ABOVE_AMOUNT),
            (TOTAL_TRADES_COUNT.key, TOTAL_TRADES_COUNT),
            (TOKEN_TRADE_VOLUME.key, TOKEN_TRADE_VOLUME)
        ]
    };

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
                Debug.print("Evaluating trades_above_amount condition");
                let min_amount = switch (usage.parameters[0]) {
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

            case "total_trades_count" {
                Debug.print("Evaluating total_trades_count condition");
                let min_trades = switch (usage.parameters[0]) {
                    case (#Nat(trades)) {
                        Debug.print("Min trades parameter: " # Nat.toText(trades));
                        ?trades;
                    };
                    case _ {
                        Debug.print("Invalid min_trades parameter type");
                        null;
                    };
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
                                Debug.print("Found user stats with total_swaps: " # Nat.toText(s.total_swaps));
                                s;
                            };
                        };
                        let result = stats.total_swaps >= min;
                        Debug.print("Total trades condition result: " # Bool.toText(result) # 
                                  " (required: " # Nat.toText(min) # 
                                  ", actual: " # Nat.toText(stats.total_swaps) # ")");
                        return result;
                    };
                };
            };

            case "token_trade_volume" {
                Debug.print("Evaluating token_trade_volume condition");
                let token_id = switch (usage.parameters[0]) {
                    case (#Text(id)) {
                        Debug.print("Token ID parameter: " # id);
                        ?id;
                    };
                    case _ {
                        Debug.print("Invalid token_id parameter type");
                        null;
                    };
                };
                
                let min_volume = switch (usage.parameters[1]) {
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

            case _ {
                Debug.print("Unknown condition type: " # usage.condition_key);
                return false; // Unknown condition
            };
        };
    };

    // Helper functions
    private func getUserTokenStatsKey(user: Principal, token_id: Text) : Text {
        Principal.toText(user) # ":" # token_id;
    };
};
