import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";

import T "./Types";

module {

    // Condition Registry
    // Note: These are non-stable let bindings that will be recreated on init/upgrade
    private let TRADES_ABOVE_AMOUNT : T.Condition = {
        key = "trades_above_amount";
        name = "Large Trade Achievement";
        description = "Execute trades above specified amount";
        parameter_specs = [{
            name = "min_amount_e8s";
            type_ = #Nat;
            default_value = null;
        }];
    };

    private let TOTAL_TRADES_COUNT : T.Condition = {
        key = "total_trades_count";
        name = "Trade Count Achievement";
        description = "Execute a certain number of trades";
        parameter_specs = [{
            name = "min_trades";
            type_ = #Nat;
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
                type_ = #Text;
                default_value = null;
            },
            {
                name = "min_volume_e8s";
                type_ = #Nat;
                default_value = null;
            }
        ];
    };
    private let registry : TrieMap.TrieMap<Text, T.Condition> = TrieMap.empty();
    // Registry map
    
    private let registry : TrieMap.TrieMap<Text, Condition> = do {
        let map = TrieMap.TrieMap<Text, Condition>(Text.equal, Text.hash);
        ignore map.put(TRADES_ABOVE_AMOUNT.key, TRADES_ABOVE_AMOUNT);
        ignore map.put(TOTAL_TRADES_COUNT.key, TOTAL_TRADES_COUNT);
        ignore map.put(TOKEN_TRADE_VOLUME.key, TOKEN_TRADE_VOLUME);
        map
    };

    // Public methods
    public func get_condition(key: Text) : ?T.Condition {
        registry.map.get(key);
    };

    public func get_all_conditions() : [T.Condition] {
        Buffer.toArray(Buffer.fromIter(registry.map.vals()));
    };

    public func evaluate_condition(
        context: T.Context,
        user: Principal,
        usage: T.ConditionUsage
    ) : async Bool {
        let condition = switch (registry.map.get(usage.condition_key)) {
            case null return false; // Invalid condition key
            case (?c) c;
        };

        // Evaluate based on condition key
        switch (condition.key) {
            case "trades_above_amount" {
                switch (usage.parameters) {
                    case (#Nat(min_amount)) {
                        let stats = switch (context.user_stats.get(Principal.toText(user))) {
                            case null return false;
                            case (?s) s;
                        };
                        // TODO: Implement largest trade check when we add that stat
                        return false;
                    };
                    case _ return false; // Invalid parameter type
                };
            };

            case "total_trades_count" {
                switch (usage.parameters) {
                    case (#Nat(min_trades)) {
                        let stats = switch (context.user_stats.get(Principal.toText(user))) {
                            case null return false;
                            case (?s) s;
                        };
                        return stats.total_swaps >= min_trades;
                    };
                    case _ return false; // Invalid parameter type
                };
            };

            case "token_trade_volume" {
                switch (usage.parameters) {
                    case (#Text(token_id), #Nat(min_volume)) {
                        let stats = switch (context.user_token_stats.get(getUserTokenStatsKey(user, token_id))) {
                            case null return false;
                            case (?s) s;
                        };
                        let total_volume = s.input_volume_e8s_icpswap + 
                                         s.input_volume_e8s_kong +
                                         s.input_volume_e8s_split;
                        return total_volume >= min_volume;
                    };
                    case _ return false; // Invalid parameter types
                };
            };

            case _ return false; // Unknown condition
        };
    };

    // Helper functions
    private func getUserTokenStatsKey(user: Principal, token_id: Text) : Text {
        Principal.toText(user) # ":" # token_id;
    };
};
