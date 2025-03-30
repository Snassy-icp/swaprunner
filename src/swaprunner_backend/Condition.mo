import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import HashMap "mo:base/HashMap";

import T "./Types";

module {
    // Static condition definitions
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
        let condition = switch (registry.get(usage.condition_key)) {
            case null return false; // Invalid condition key
            case (?c) c;
        };

        switch (usage.condition_key) {
            case "trades_above_amount" {
                let min_amount = switch (usage.parameters[0]) {
                    case (#Nat(amount)) ?amount;
                    case _ null;
                };
                
                switch (min_amount) {
                    case null return false;
                    case (?min) {
                        let stats = switch (context.user_stats.get(Principal.toText(user))) {
                            case null return false;
                            case (?s) s;
                        };
                        // TODO: Implement largest trade check when we add that stat
                        return false;
                    };
                };
            };

            case "total_trades_count" {
                let min_trades = switch (usage.parameters[0]) {
                    case (#Nat(trades)) ?trades;
                    case _ null;
                };
                
                switch (min_trades) {
                    case null return false;
                    case (?min) {
                        let stats = switch (context.user_stats.get(Principal.toText(user))) {
                            case null return false;
                            case (?s) s;
                        };
                        return stats.total_swaps >= min;
                    };
                };
            };

            case "token_trade_volume" {
                let token_id = switch (usage.parameters[0]) {
                    case (#Text(id)) ?id;
                    case _ null;
                };
                
                let min_volume = switch (usage.parameters[1]) {
                    case (#Nat(volume)) ?volume;
                    case _ null;
                };
                
                switch (token_id, min_volume) {
                    case (?id, ?min) {
                        let stats = switch (context.user_token_stats.get(getUserTokenStatsKey(user, id))) {
                            case null return false;
                            case (?stats) stats;
                        };
                        let total_volume = stats.input_volume_e8s_icpswap + 
                                         stats.input_volume_e8s_kong +
                                         stats.input_volume_e8s_split;
                        return total_volume >= min;
                    };
                    case _ return false;
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
