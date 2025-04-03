import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Time "mo:base/Time";
import Debug "mo:base/Debug";
import Error "mo:base/Error";
import Array "mo:base/Array";
import Int "mo:base/Int";
import Nat64 "mo:base/Nat64";

import T "./Types";

module {
    public type UserProfile = T.UserProfile;
    public type CreateUserProfileArgs = T.CreateUserProfileArgs;
    public type UpdateUserProfileArgs = T.UpdateUserProfileArgs;
    public type SocialLink = T.SocialLink;

    // Error types
    public type ProfileError = {
        #NotFound;
        #AlreadyExists;
        #NotAuthorized;
        #InvalidInput: Text;
    };

    public class UserProfileManager() {
        private let profiles = TrieMap.TrieMap<Principal, UserProfile>(Principal.equal, Principal.hash);

        // Create a new user profile (admin only)
        public func createProfile(is_admin: Bool, caller: Principal, args: CreateUserProfileArgs): async Result.Result<UserProfile, ProfileError> {
            if (not is_admin) {
                return #err(#NotAuthorized);
            };

            // Check if profile already exists
            switch (profiles.get(args.principal)) {
                case (?_) { return #err(#AlreadyExists); };
                case null { };
            };

            // Validate input
            if (Text.size(args.name) == 0) {
                return #err(#InvalidInput("Name cannot be empty"));
            };
            if (Text.size(args.description) == 0) {
                return #err(#InvalidInput("Description cannot be empty"));
            };

            // Create new profile
            let now = Time.now();
            let profile: UserProfile = {
                principal = args.principal;
                name = args.name;
                description = args.description;
                logo_url = args.logo_url;
                social_links = args.social_links;
                created_at = Nat64.fromNat(Int.abs(now));
                updated_at = Nat64.fromNat(Int.abs(now));
                created_by = caller;
            };

            profiles.put(args.principal, profile);
            #ok(profile)
        };

        // Update an existing profile (admin and profile owner only)
        public func updateProfile(is_admin: Bool, caller: Principal, userPrincipal: Principal, args: UpdateUserProfileArgs): async Result.Result<UserProfile, ProfileError> {
            if (not (is_admin or Principal.equal(caller, userPrincipal))) {
                return #err(#NotAuthorized);
            };

            switch (profiles.get(userPrincipal)) {
                case (null) { #err(#NotFound) };
                case (?existing) {
                    let updated: UserProfile = {
                        principal = existing.principal;
                        name = switch (args.name) {
                            case (?n) { 
                                if (Text.size(n) == 0) {
                                    return #err(#InvalidInput("Name cannot be empty"));
                                };
                                n 
                            };
                            case null { existing.name };
                        };
                        description = switch (args.description) {
                            case (?d) { 
                                if (Text.size(d) == 0) {
                                    return #err(#InvalidInput("Description cannot be empty"));
                                };
                                d 
                            };
                            case null { existing.description };
                        };
                        logo_url = switch (args.logo_url) {
                            case (?url) { ?url };
                            case null { existing.logo_url };
                        };
                        social_links = switch (args.social_links) {
                            case (?links) { links };
                            case null { existing.social_links };
                        };
                        created_at = existing.created_at;
                        updated_at = Nat64.fromNat(Int.abs(Time.now()));
                        created_by = existing.created_by;
                    };
                    profiles.put(userPrincipal, updated);
                    #ok(updated)
                };
            }
        };

        // Get a single profile
        public func getProfile(userPrincipal: Principal): Result.Result<UserProfile, ProfileError> {
            switch (profiles.get(userPrincipal)) {
                case (?profile) { #ok(profile) };
                case null { #err(#NotFound) };
            }
        };

        // List all profiles with optional pagination
        public func listProfiles(offset: Nat, limit: Nat): [UserProfile] {
            let buffer = Buffer.Buffer<UserProfile>(0);
            var count = 0;
            var skipped = 0;

            for ((_, profile) in profiles.entries()) {
                if (skipped >= offset and count < limit) {
                    buffer.add(profile);
                    count += 1;
                } else if (skipped < offset) {
                    skipped += 1;
                };
            };

            Buffer.toArray(buffer)
        };

        // Delete a profile (admin only)
        public func deleteProfile(is_admin: Bool, caller: Principal, userPrincipal: Principal): async Result.Result<(), ProfileError> {
            if (not is_admin) {
                return #err(#NotAuthorized);
            };

            switch (profiles.get(userPrincipal)) {
                case (null) { #err(#NotFound) };
                case (?_) {
                    profiles.delete(userPrincipal);
                    #ok(())
                };
            }
        };

        // Get total number of profiles
        public func getProfileCount(): Nat {
            profiles.size()
        };

        // Search profiles by name (case-insensitive partial match)
        public func searchProfiles(profile_query: Text): [UserProfile] {
            let buffer = Buffer.Buffer<UserProfile>(0);
            let queryLower = Text.toLowercase(profile_query);

            for ((_, profile) in profiles.entries()) {
                let nameLower = Text.toLowercase(profile.name);
                if (Text.contains(nameLower, #text queryLower)) {
                    buffer.add(profile);
                };
            };

            Buffer.toArray(buffer)
        };
    };
}; 