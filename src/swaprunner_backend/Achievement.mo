import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";

import Types "./Types";
import Condition "./Condition";

module {
    // Types for Achievement module
    public type Achievement = {
        id: Text;
        name: Text;
        description: Text;
        logo_url: ?Text;
        condition_usages: [ConditionUsage];
        predicate: ?PredicateExpression;
    };

    public type ConditionUsage = {
        condition_key: Text;
        parameters: {
            #Principal: Principal;
            #Nat: Nat;
            #Text: Text;
        };
    };

    public type PredicateExpression = {
        #AND: (PredicateExpression, PredicateExpression);
        #OR: (PredicateExpression, PredicateExpression);
        #NOT: PredicateExpression;
        #REF: Nat; // Index into condition_usages array
    };

    public type UserAchievement = {
        user: Principal;
        achievement_id: Text;
        discovered_at: Int; // Timestamp
    };

    // Context type containing all required state from main.mo
    public type Context = {
        achievements: TrieMap.TrieMap<Text, Achievement>;
        user_achievements: TrieMap.TrieMap<Text, [UserAchievement]>; // Key: user principal as text
        user_stats: TrieMap.TrieMap<Text, Types.UserStats>;
        user_token_stats: TrieMap.TrieMap<Text, Types.UserTokenStats>;
        token_stats: TrieMap.TrieMap<Text, Types.TokenStats>;
        global_stats: Types.GlobalStats;
    };

    // Static methods
    public func scan_for_new_achievements(
        context: Context,
        user: Principal,
    ) : async {
        new_achievements: [UserAchievement];
        available_claims: [{
            achievement_id: Text;
            allocation_id: Text;
            claimable_amount: {
                min_e8s: Nat;
                max_e8s: Nat;
            };
        }];
    } {
        let new_achievements = Buffer.Buffer<UserAchievement>(0);
        
        // Get existing user achievements
        let existing = switch (context.user_achievements.get(Principal.toText(user))) {
            case null [];
            case (?ua) ua;
        };
        
        // Check each achievement
        for ((id, achievement) in context.achievements.entries()) {
            // Skip if already earned
            if (Array.find<UserAchievement>(existing, func(ua) = ua.achievement_id == id) != null) {
                continue;
            };
            
            // Evaluate achievement conditions
            let is_earned = await evaluate_achievement(context, user, achievement);
            
            if (is_earned) {
                let user_achievement = {
                    user = user;
                    achievement_id = id;
                    discovered_at = Time.now();
                };
                new_achievements.add(user_achievement);
            };
        };
        
        // TODO: Implement available_claims logic
        
        return {
            new_achievements = Buffer.toArray(new_achievements);
            available_claims = [];
        };
    };

    // Helper function to evaluate an achievement's conditions
    private func evaluate_achievement(
        context: Context,
        user: Principal,
        achievement: Achievement
    ) : async Bool {
        switch (achievement.predicate) {
            // If no predicate, all conditions must be true
            case null {
                for (usage in achievement.condition_usages.vals()) {
                    let result = await Condition.evaluate_condition(context, user, usage);
                    if (not result) {
                        return false;
                    };
                };
                return true;
            };
            
            // If predicate exists, evaluate the expression tree
            case (?pred) {
                return await evaluate_predicate(context, user, pred, achievement.condition_usages);
            };
        };
    };

    // Helper function to evaluate a predicate expression
    private func evaluate_predicate(
        context: Context,
        user: Principal,
        pred: PredicateExpression,
        condition_usages: [ConditionUsage]
    ) : async Bool {
        switch (pred) {
            case (#AND(left, right)) {
                let left_result = await evaluate_predicate(context, user, left, condition_usages);
                // Short circuit if left is false
                if (not left_result) return false;
                return await evaluate_predicate(context, user, right, condition_usages);
            };
            case (#OR(left, right)) {
                let left_result = await evaluate_predicate(context, user, left, condition_usages);
                // Short circuit if left is true
                if (left_result) return true;
                return await evaluate_predicate(context, user, right, condition_usages);
            };
            case (#NOT(child)) {
                let child_result = await evaluate_predicate(context, user, child, condition_usages);
                return not child_result;
            };
            case (#REF(index)) {
                if (index >= condition_usages.size()) {
                    return false; // Invalid reference
                };
                return await Condition.evaluate_condition(context, user, condition_usages[index]);
            };
        };
    };
};
