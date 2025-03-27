import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";

import Types "./Types";

module {
    // Types for conditions
    public type Condition = {
        key: Text;
        name: Text;
        description: Text;
        parameter_specs: [{
            name: Text;
            type_: {#Principal; #Nat; #Text};
            default_value: ?Text;
        }];
    };

    public type ConditionUsage = {
        condition_key: Text;
        parameters: {
            #Principal: Principal;
            #Nat: Nat;
            #Text: Text;
        };
    };

    // Context type (same as in Achievement module)
    public type Context = {
        user_stats: TrieMap.TrieMap<Text, Types.UserStats>;
        user_token_stats: TrieMap.TrieMap<Text, Types.UserTokenStats>;
        token_stats: TrieMap.TrieMap<Text, Types.TokenStats>;
        global_stats: Types.GlobalStats;
    };

    // Condition Registry
    // Note: These are non-stable let bindings that will be recreated on init/upgrade
    private let TRADES_ABOVE_AMOUNT : Condition = {
        key = "trades_above_amount";
        name = "Large Trade Achievement";
        description = "Execute trades above specified amount";
        parameter_specs = [{
            name = "min_amount_e8s";
            type_ = #Nat;
            default_value = null;
        }];
    };

    private let TOTAL_TRADES_COUNT : Condition = {
        key = "total_trades_count";
        name = "Trade Count Achievement";
        description = "Execute a certain number of trades";
        parameter_specs = [{
            name = "min_trades";
            type_ = #Nat;
            default_value = null;
        }];
    };

    private let TOKEN_TRADE_VOLUME : Condition = {
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

    // Registry map
    private let registry = {
        var map = TrieMap.TrieMap<Text, Condition>(Text.equal, Text.hash);
        map.put(TRADES_ABOVE_AMOUNT.key, TRADES_ABOVE_AMOUNT);
        map.put(TOTAL_TRADES_COUNT.key, TOTAL_TRADES_COUNT);
        map.put(TOKEN_TRADE_VOLUME.key, TOKEN_TRADE_VOLUME);
        map;
    };

    // Public methods
    public func get_condition(key: Text) : ?Condition {
        registry.map.get(key);
    };

    public func get_all_conditions() : [Condition] {
        Buffer.toArray(Buffer.fromIter(registry.map.vals()));
    };

    public func evaluate_condition(
        context: Context,
        user: Principal,
        usage: ConditionUsage
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
