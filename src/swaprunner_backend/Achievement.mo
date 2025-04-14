import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Bool "mo:base/Bool";
import T "./Types";
import Condition "./Condition";

module {
    // Static methods
    public func scan_for_new_achievements(
        context: T.Context,
        user: Principal,
    ) : async {
        new_achievements: [T.UserAchievement];
        available_claims: [{
            achievement_id: Text;
            allocation_id: Text;
            claimable_amount: {
                min_e8s: Nat;
                max_e8s: Nat;
            };
        }];
    } {
        //Debug.print("Starting achievement scan for user: " # Principal.toText(user));
        let new_achievements = Buffer.Buffer<T.UserAchievement>(0);
        
        // Get existing user achievements
        let existing = switch (context.user_achievements.get(Principal.toText(user))) {
            case null {
                //Debug.print("No existing achievements found for user");
                [];
            };
            case (?ua) {
                //Debug.print("Found " # Nat.toText(ua.size()) # " existing achievements");
                ua;
            };
        };
        
        // Check each achievement
        //Debug.print("Starting to check achievements...");
        label next_achievement for ((id, achievement) in context.achievements.entries()) {
            //Debug.print("Checking achievement: " # id);
            
            // Skip if already earned
            if (Array.find<T.UserAchievement>(existing, func(ua) = ua.achievement_id == id) != null) {
                //Debug.print("Achievement " # id # " already earned, skipping");
                continue next_achievement;
            };
            
            //Debug.print("Evaluating conditions for achievement: " # id);
            // Evaluate achievement conditions
            let is_earned = await evaluate_achievement(context, user, achievement);
            
            if (is_earned) {
                //Debug.print("Achievement " # id # " earned!");
                let user_achievement = {
                    user = user;
                    achievement_id = id;
                    discovered_at = Time.now();
                };
                new_achievements.add(user_achievement);
            } else {
                //Debug.print("Achievement " # id # " not earned");
            };
        };
        
        //Debug.print("Achievement scan complete. Found " # Nat.toText(new_achievements.size()) # " new achievements");
        // TODO: Implement available_claims logic
        
        return {
            new_achievements = Buffer.toArray(new_achievements);
            available_claims = [];
        };
    };

    // Helper function to evaluate an achievement's conditions
    private func evaluate_achievement(
        context: T.Context,
        user: Principal,
        achievement: T.Achievement
    ) : async Bool {
        //Debug.print("Evaluating achievement: " # achievement.name);
        
        switch (achievement.predicate) {
            // If no predicate, all conditions must be true
            case null {
                //Debug.print("No predicate, evaluating all conditions");
                for (usage in achievement.condition_usages.vals()) {
                    //Debug.print("Evaluating condition: " # usage.condition_key);
                    let result = await Condition.evaluate_condition(context, user, usage, context.conditions);
                    if (not result) {
                        //Debug.print("Condition " # usage.condition_key # " failed");
                        return false;
                    };
                    //Debug.print("Condition " # usage.condition_key # " passed");
                };
                //Debug.print("All conditions passed");
                return true;
            };
            
            // If predicate exists, evaluate the expression tree
            case (?pred) {
                //Debug.print("Evaluating predicate expression tree");
                return await evaluate_predicate(context, user, pred, achievement.condition_usages);
            };
        };
    };

    // Helper function to evaluate a predicate expression
    private func evaluate_predicate(
        context: T.Context,
        user: Principal,
        pred: T.PredicateExpression,
        condition_usages: [T.ConditionUsage]
    ) : async Bool {
        switch (pred) {
            case (#AND(left, right)) {
                //Debug.print("Evaluating AND predicate");
                let left_result = await evaluate_predicate(context, user, left, condition_usages);
                //Debug.print("AND left result: " # Bool.toText(left_result));
                // Short circuit if left is false
                if (not left_result) {
                    //Debug.print("AND short-circuit on false left result");
                    return false;
                };
                let right_result = await evaluate_predicate(context, user, right, condition_usages);
                //Debug.print("AND right result: " # Bool.toText(right_result));
                return right_result;
            };
            case (#OR(left, right)) {
                //Debug.print("Evaluating OR predicate");
                let left_result = await evaluate_predicate(context, user, left, condition_usages);
                //Debug.print("OR left result: " # Bool.toText(left_result));
                // Short circuit if left is true
                if (left_result) {
                    //Debug.print("OR short-circuit on true left result");
                    return true;
                };
                let right_result = await evaluate_predicate(context, user, right, condition_usages);
                //Debug.print("OR right result: " # Bool.toText(right_result));
                return right_result;
            };
            case (#NOT(child)) {
                //Debug.print("Evaluating NOT predicate");
                let child_result = await evaluate_predicate(context, user, child, condition_usages);
                //Debug.print("NOT result: " # Bool.toText(not child_result));
                return not child_result;
            };
            case (#REF(index)) {
                //Debug.print("Evaluating REF predicate at index: " # Nat.toText(index));
                if (index >= condition_usages.size()) {
                    //Debug.print("Invalid reference index");
                    return false; // Invalid reference
                };
                let result = await Condition.evaluate_condition(context, user, condition_usages[index], context.conditions);
                //Debug.print("REF result: " # Bool.toText(result));
                return result;
            };
        };
    };
};
