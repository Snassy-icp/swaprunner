import Principal "mo:base/Principal";
import Array "mo:base/Array";
import Result "mo:base/Result";
import IC "mo:base/ExperimentalInternetComputer";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Error "mo:base/Error";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Nat16 "mo:base/Nat16";
import Debug "mo:base/Debug";
import Iter "mo:base/Iter";
import Timer "mo:base/Timer";
import Time "mo:base/Time";
import Buffer "mo:base/Buffer";
import Hash "mo:base/Hash";

actor {
    // Constants
    private let ICPSWAP_TOKEN_CANISTER_ID = "k37c6-riaaa-aaaag-qcyza-cai"; // ICPSwap trusted token list canister ID (contains getList() for trusted token list and getLogo() for token logos)
    let ICP_PRINCIPAL = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");

    // Add new constant at the top of the file, near other constants
    private let MAX_RESPONSE_SIZE_BYTES : Nat = 2_500_000; // Conservative limit below IC's max of ~3.1MB

    // Stable storage for admin list
    private stable var admins : [Principal] = [];

    // Stable storage for token whitelist
    private stable var tokenMetadataEntries : [(Principal, TokenMetadata)] = [];
    private stable var tokenLogoEntries : [(Principal, Text)] = [];
    private stable var userCustomTokenEntries : [(Principal, [Principal])] = [];  // New: Store user's custom tokens

    // User index mapping system
    private stable var nextUserIndex : Nat16 = 0;
    private stable var userIndexEntries : [(Principal, Nat16)] = [];
    private var principalToIndex = HashMap.HashMap<Principal, Nat16>(0, Principal.equal, Principal.hash);
    private var indexToPrincipal = HashMap.HashMap<Nat16, Principal>(0, Nat16.equal, func(x : Nat16) : Hash.Hash { Hash.hash(Nat16.toNat(x)) });

    // Wallet feature: Stable storage for user wallet tokens
    private stable var userWalletTokenEntries : [(Principal, [Nat16])] = [];

    // Add after other type definitions but before stable storage declarations

    // User-Token statistics type
    type UserTokenStats = {
        swaps_as_input: Nat;          // Times used as input token
        swaps_as_output: Nat;         // Times used as output token
        volume_in_e8s: Nat;           // Volume received
        volume_out_e8s: Nat;          // Volume sent
        total_sends: Nat;             // Direct sends
        total_deposits: Nat;          // DEX deposits
        total_withdrawals: Nat;       // DEX withdrawals
    };

    // Add with other stable storage declarations
    private stable var userTokenStatsEntries : [(Text, UserTokenStats)] = [];

    // Add with other runtime maps
    private var userTokenStats = HashMap.fromIter<Text, UserTokenStats>(
        userTokenStatsEntries.vals(),
        0,
        Text.equal,
        Text.hash
    );

    // Stable storage for statistics
    private stable var globalStats : GlobalStats = {
        total_swaps = 0;
        icpswap_swaps = 0;
        kong_swaps = 0;
        split_swaps = 0;
        total_sends = 0;
        total_deposits = 0;
        total_withdrawals = 0;
    };
    private stable var tokenStatsEntries : [(Text, TokenStats)] = [];
    private stable var userStatsEntries : [(Text, UserStats)] = [];
    private stable var userLoginEntries : [(Text, Nat)] = [];  // New: Store login counts

    // Stable storage for ICPSwap tokens
    private stable var tokenMetadataEntriesICPSwap : [(Principal, TokenMetadata)] = [];

    // Stable storage for custom tokens
    private stable var customTokenMetadataEntries : [(Principal, TokenMetadata)] = [];

    // Stable storage for pool metadata and user pools
    private stable var poolMetadataEntries : [(Principal, PoolMetadata)] = [];
    private stable var userPoolEntries : [(Principal, [Nat16])] = [];

    // Runtime maps - using HashMap for better performance with Principal keys
    private var tokenMetadata = HashMap.fromIter<Principal, TokenMetadata>(tokenMetadataEntries.vals(), 10, Principal.equal, Principal.hash);
    private var tokenLogos = HashMap.fromIter<Principal, Text>(tokenLogoEntries.vals(), 10, Principal.equal, Principal.hash);
    private var userCustomTokens = HashMap.fromIter<Principal, [Principal]>(userCustomTokenEntries.vals(), 10, Principal.equal, Principal.hash);  // New: Runtime map for custom tokens

    // Runtime maps for ICPSwap tokens
    private var tokenMetadataICPSwap = HashMap.fromIter<Principal, TokenMetadata>(tokenMetadataEntriesICPSwap.vals(), 10, Principal.equal, Principal.hash);

    // Runtime maps for statistics
    private var tokenStats = HashMap.fromIter<Text, TokenStats>(tokenStatsEntries.vals(), 0, Text.equal, Text.hash);
    private var userStats = HashMap.fromIter<Text, UserStats>(userStatsEntries.vals(), 0, Text.equal, Text.hash);
    private var userLogins = HashMap.fromIter<Text, Nat>(userLoginEntries.vals(), 0, Text.equal, Text.hash);  // New: Runtime map for logins

    // Runtime maps
    private var customTokenMetadata = HashMap.fromIter<Principal, TokenMetadata>(customTokenMetadataEntries.vals(), 0, Principal.equal, Principal.hash);

    // Runtime maps for pools
    private var poolMetadata = HashMap.fromIter<Principal, PoolMetadata>(poolMetadataEntries.vals(), 0, Principal.equal, Principal.hash);
    private var userPools = HashMap.fromIter<Principal, [Nat16]>(userPoolEntries.vals(), 0, Principal.equal, Principal.hash);

    // Wallet feature: Runtime map for user wallet tokens
    private var userWalletTokens = HashMap.fromIter<Principal, [Nat16]>(userWalletTokenEntries.vals(), 10, Principal.equal, Principal.hash);

    // Types
    type TokenMetadata = {
        name: ?Text;
        symbol: ?Text;
        fee: ?Nat;
        decimals: ?Nat8;
        hasLogo: Bool;
        standard: Text;
    };

    type PoolMetadata = {
        fee: Nat;
        key: Text;
        token0: Token;
        token1: Token;
    };

    type Token = {
        address: Text;
        standard: Text;
    };

    type ICPSwapPoolInterface = actor {
        metadata : shared query () -> async {
            #ok : {
                fee: Nat;
                key: Text;
                token0: Token;
                token1: Token;
                sqrtPriceX96: Nat;
                tick: Int;
                liquidity: Nat;
                maxLiquidityPerTick: Nat;
                nextPositionId: Nat;
            };
            #err : { message: Text };
        };
    };

    type FetchMetadataResult = {
        name: ?Text;
        symbol: ?Text;
        fee: ?Nat;
        decimals: ?Nat8;
        hasLogo: Bool;
        foundLogo: ?Text;
        standard: Text;
    };

    type AddTokenArgs = {
        canisterId: Principal;
        metadata: TokenMetadata;
        logo: ?Text;
    };

    // Statistics types
    type GlobalStats = {
        total_swaps: Nat;
        icpswap_swaps: Nat;
        kong_swaps: Nat;
        split_swaps: Nat;
        total_sends: Nat;           // New: Track total successful sends
        total_deposits: Nat;        // New: Track total successful ICPSwap deposits
        total_withdrawals: Nat;     // New: Track total successful ICPSwap withdrawals
    };

    type TokenStats = {
        total_swaps: Nat;
        icpswap_swaps: Nat;
        kong_swaps: Nat;
        split_swaps: Nat;
        volume_e8s: Nat;
        total_sends: Nat;           // New: Track sends for this token
        sends_volume_e8s: Nat;      // New: Track send volume for this token
        total_deposits: Nat;        // New: Track deposits for this token
        deposits_volume_e8s: Nat;   // New: Track deposit volume for this token
        total_withdrawals: Nat;     // New: Track withdrawals for this token
        withdrawals_volume_e8s: Nat; // New: Track withdrawal volume for this token
    };

    type UserStats = {
        total_swaps: Nat;
        icpswap_swaps: Nat;
        kong_swaps: Nat;
        split_swaps: Nat;
        total_sends: Nat;           // New: Track sends by this user
        total_deposits: Nat;        // New: Track deposits by this user
        total_withdrawals: Nat;     // New: Track withdrawals by this user
    };

    // ICRC-1 interfaces
    type MetadataValue = {
        #Text : Text;
        #Nat : Nat;
        #Nat8 : Nat8;
        #Int : Int;
        #Map : [(Text, MetadataValue)];
    };

    type ICRC1Metadata = [(Text, MetadataValue)];

    type StandardRecord = {
        url: Text;
        name: Text;
    };

    type ICRC1Interface = actor {
        icrc1_metadata : shared query () -> async ICRC1Metadata;
        icrc1_name : shared query () -> async ?Text;
        icrc1_symbol : shared query () -> async ?Text;
        icrc1_fee : shared query () -> async ?Nat;
        icrc1_decimals : shared query () -> async ?Nat8;
        icrc1_supported_standards : shared query () -> async [StandardRecord];
    };

    type ICPSwapInterface = actor {
        getLogo : shared query (Text) -> async {#ok : Text; #err : Text};
    };

    // Types for ICPSwap List
    type Config = {
        name: Text;
        value: Text;
    };

    type Media = {
        link: Text;
        mediaType: Text;
    };

    type ICPSwapToken = {
        canisterId: Text;
        configs: [Config];
        decimals: Nat;
        fee: Nat;
        introduction: Text;
        mediaLinks: [Media];
        name: Text;
        rank: Nat32;
        standard: Text;
        symbol: Text;
        totalSupply: Nat;
    };

    type GetListResult = {
        #ok: [ICPSwapToken];
        #err: Text;
    };

    type ICPSwapListInterface = actor {
        getList : shared query () -> async GetListResult;
        getLogo : shared query (Text) -> async Result.Result<Text, Text>;
    };

    // Import progress tracking
    type ImportProgress = {
        last_processed: ?Text;
        total_tokens: Nat;
        processed_count: Nat;
        imported_count: Nat;
        skipped_count: Nat;
        failed_count: Nat;
        is_running: Bool;
    };

    private var importProgress : ImportProgress = {
        last_processed = null;
        total_tokens = 0;
        processed_count = 0;
        imported_count = 0;
        skipped_count = 0;
        failed_count = 0;
        is_running = false;
    };

    // Add at the top level of the actor
    private var nextBatchSize: ?Nat = null;

    // Add new state variables for logo update progress
    private stable var logoUpdateProgress = {
        total_tokens: Nat = 0;
        processed_count: Nat = 0;
        updated_count: Nat = 0;
        skipped_count: Nat = 0;
        failed_count: Nat = 0;
        is_running: Bool = false;
        last_processed: ?Principal = null;
    };

    private var nextLogoBatchSize: ?Nat = null;

    // Add new type for metadata refresh progress
    private type MetadataRefreshProgress = {
        total_tokens: Nat;
        processed_count: Nat;
        updated_count: Nat;
        skipped_count: Nat;
        failed_count: Nat;
        is_running: Bool;
        last_processed: ?Principal;
    };

    // Add type for metadata discrepancies
    private type MetadataDiscrepancy = {
        ledger_id: Principal;
        old_metadata: TokenMetadata;
        new_metadata: TokenMetadata;
        timestamp: Int;
    };

    // Add stable storage for discrepancies
    private stable var metadataDiscrepancies : [MetadataDiscrepancy] = [];


    // Add stable variable for metadata refresh progress
    private stable var metadataRefreshProgress : MetadataRefreshProgress = {
        total_tokens = 0;
        processed_count = 0;
        updated_count = 0;
        skipped_count = 0;
        failed_count = 0;
        is_running = false;
        last_processed = null;
    };

    // Add variable for next batch size
    private var nextMetadataBatchSize : ?Nat = null;

    // Helper function to check if a token is whitelisted
    private func isWhitelisted(tokenId: Principal) : Bool {
        switch(tokenMetadata.get(tokenId)) {
            case (?_) true;
            case null false;
        }
    };

    // Helper function to check if a principal is a controller
    private func isController(caller : Principal) : Bool {
        Principal.isController(caller);
    };

    // Helper function to check if a principal is an admin
    private func isAdmin(caller : Principal) : Bool {
        if (isController(caller)) {
            return true;
        };
        
        // Check if caller is in admin list
        for (admin in admins.vals()) {
            if (admin == caller) return true;
        };
        false
    };

    // Public query to check if caller is admin
    public shared query({caller}) func is_admin() : async Bool {
        isAdmin(caller)
    };

    // Get list of admins (query function)
    public query func get_admins() : async [Principal] {
        admins
    };

    // Add a new admin (update function)
    public shared({caller}) func add_admin(principal : Principal) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };
        
        // Check if already an admin
        if (isAdmin(principal)) {
            return #err("Principal is already an admin");
        };

        // Add to admin list
        admins := Array.append(admins, [principal]);
        #ok()
    };

    // Remove an admin (update function)
    public shared({caller}) func remove_admin(principal : Principal) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        // Cannot remove if principal is not in list
        var found = false;
        for (admin in admins.vals()) {
            if (admin == principal) {
                found := true;
            };
        };
        if (not found) {
            return #err("Principal is not in admin list");
        };

        // Remove from admin list
        admins := Array.filter(admins, func(p : Principal) : Bool { p != principal });
        #ok()
    };

    // Initialize the first admin (can only be called once when admins list is empty)
    public shared({caller}) func init_admin() : async Result.Result<(), Text> {
        if (admins.size() > 0) {
            return #err("Admin list already initialized");
        };
        admins := [caller];
        #ok()
    };

    // System upgrade hooks
    system func preupgrade() {
        tokenMetadataEntries := Iter.toArray(tokenMetadata.entries());
        tokenLogoEntries := Iter.toArray(tokenLogos.entries());
        userCustomTokenEntries := Iter.toArray(userCustomTokens.entries());
        tokenStatsEntries := Iter.toArray(tokenStats.entries());
        userStatsEntries := Iter.toArray(userStats.entries());
        userLoginEntries := Iter.toArray(userLogins.entries());
        tokenMetadataEntriesICPSwap := Iter.toArray(tokenMetadataICPSwap.entries());
        customTokenMetadataEntries := Iter.toArray(customTokenMetadata.entries());
        userWalletTokenEntries := Iter.toArray(userWalletTokens.entries());
        poolMetadataEntries := Iter.toArray(poolMetadata.entries());
        userPoolEntries := Iter.toArray(userPools.entries());
        userIndexEntries := Iter.toArray(principalToIndex.entries());
        userTokenStatsEntries := Iter.toArray(userTokenStats.entries());
    };

    system func postupgrade() {
        tokenMetadataEntries := [];
        tokenLogoEntries := [];
        userCustomTokenEntries := [];  
        tokenStatsEntries := [];
        userStatsEntries := [];
        userLoginEntries := [];
        tokenMetadataEntriesICPSwap := [];
        customTokenMetadataEntries := [];
        userWalletTokenEntries := [];        
        poolMetadataEntries :=[];
        userPoolEntries := [];
        userTokenStatsEntries := [];

        principalToIndex := HashMap.fromIter<Principal, Nat16>(userIndexEntries.vals(), 0, Principal.equal, Principal.hash);
        indexToPrincipal := HashMap.HashMap<Nat16, Principal>(0, Nat16.equal, func(x : Nat16) : Hash.Hash { Hash.hash(Nat16.toNat(x)) });
        for ((principal, index) in userIndexEntries.vals()) {
            indexToPrincipal.put(index, principal);
        };        

        userIndexEntries := [];
    };


    // Helper function to extract value from ICRC1Metadata
    private func extractFromMetadata(metadata: ICRC1Metadata, key: Text) : ?MetadataValue {
        for ((k, v) in metadata.vals()) {
            if (k == key) return ?v;
        };
        null
    };

    // Helper function to extract text value from MetadataValue
    private func extractText(value: ?MetadataValue) : ?Text {
        switch(value) {
            case (null) null;
            case (?#Text(t)) ?t;
            case (_) null;
        }
    };

    // Helper function to extract nat value from MetadataValue
    private func extractNat(value: ?MetadataValue) : ?Nat {
        switch(value) {
            case (null) null;
            case (?#Nat(n)) ?n;
            case (_) null;
        }
    };

    // Helper function to extract nat8 value from MetadataValue
    private func extractNat8(value: ?MetadataValue) : ?Nat8 {
        switch(value) {
            case (null) null;
            case (?#Nat8(n)) ?n;
            case (_) null;
        }
    };

    // Helper function to fetch missing metadata from token ledger
    private func fetchMissingMetadata(canisterId: Principal, providedMetadata: TokenMetadata) : async FetchMetadataResult {
        let tokenActor = actor(Principal.toText(canisterId)) : ICRC1Interface;
        var name = providedMetadata.name;
        var symbol = providedMetadata.symbol;
        var fee = providedMetadata.fee;
        var decimals = providedMetadata.decimals;
        var hasLogo = providedMetadata.hasLogo;
        var foundLogo : ?Text = null;
        var standard = "ICRC1"; // Default to ICRC1

        try {
            // Try icrc1_metadata first
            let metadata = await tokenActor.icrc1_metadata();
            
            // Extract values if not provided
            if (name == null) {
                name := extractText(extractFromMetadata(metadata, "icrc1:name"));
            };
            if (symbol == null) {
                symbol := extractText(extractFromMetadata(metadata, "icrc1:symbol"));
            };
            if (fee == null) {
                fee := extractNat(extractFromMetadata(metadata, "icrc1:fee"));
            };
            if (decimals == null) {
                decimals := extractNat8(extractFromMetadata(metadata, "icrc1:decimals"));
            };

            // Check for logo in metadata
            let logoFromMetadata = extractText(extractFromMetadata(metadata, "icrc1:logo"));
            if (logoFromMetadata != null) {
                foundLogo := logoFromMetadata;
                hasLogo := true;
            };

            // Try individual methods for any still-missing values
            if (name == null) {
                name := await tokenActor.icrc1_name();
            };
            if (symbol == null) {
                symbol := await tokenActor.icrc1_symbol();
            };
            if (fee == null) {
                fee := await tokenActor.icrc1_fee();
            };
            if (decimals == null) {
                decimals := await tokenActor.icrc1_decimals();
            };

            // Check supported standards
            try {
                let standards = await tokenActor.icrc1_supported_standards();
                // Only check for ICRC2, default to ICRC1
                for (std in standards.vals()) {
                    if (std.name == "ICRC-2") {
                        standard := "ICRC2";
                    };
                };
            } catch (e) {
                // If icrc1_supported_standards fails, assume ICRC1
                standard := "ICRC1";
            };
        }
        catch (e) {
            // If any calls fail, we keep the null values
        };

        {
            name = name;
            symbol = symbol;
            fee = fee;
            decimals = decimals;
            hasLogo = hasLogo;
            foundLogo = foundLogo;
            standard = standard;
        }
    };

    // Helper function to fetch logo from ICPSwap
    private func fetchLogo(canisterId: Principal) : async ?Text {
        let icpSwap = actor(ICPSWAP_TOKEN_CANISTER_ID) : ICPSwapInterface;
        try {
            let result = await icpSwap.getLogo(Principal.toText(canisterId));
            switch(result) {
                case (#ok(logo)) ?logo;
                case (#err(_)) null;
            };
        }
        catch (e) {
            null
        };
    };

    // Helper function to validate logo URL against allowed domains
    private func isValidLogoUrl(url: Text) : Bool {
        if (Text.size(url) == 0) {
            return false;
        };

        true
    };

    // Token Whitelist Methods

    // Internal function to add token without admin check
    private func addTokenInternal(args: AddTokenArgs) : async Result.Result<(), Text> {
        // Fetch missing metadata from token ledger
        let fetchResult = await fetchMissingMetadata(args.canisterId, args.metadata);
        var metadata = {
            name = fetchResult.name;
            symbol = fetchResult.symbol;
            fee = fetchResult.fee;
            decimals = fetchResult.decimals;
            hasLogo = fetchResult.hasLogo;
            standard = fetchResult.standard;
        };
        
        // Handle logo: use provided logo, or found logo from metadata, or try ICPSwap
        switch(args.logo) {
            case (?logo) {
                if (isValidLogoUrl(logo)) {
                tokenLogos.put(args.canisterId, logo);
                metadata := {
                    name = metadata.name;
                    symbol = metadata.symbol;
                    fee = metadata.fee;
                    decimals = metadata.decimals;
                    hasLogo = true;
                        standard = metadata.standard;
                    };
                } else {
                    metadata := {
                        name = metadata.name;
                        symbol = metadata.symbol;
                        fee = metadata.fee;
                        decimals = metadata.decimals;
                        hasLogo = false;
                        standard = metadata.standard;
                    };
                };
            };
            case (null) {
                switch(fetchResult.foundLogo) {
                    case (?logo) {
                        if (isValidLogoUrl(logo)) {
                        tokenLogos.put(args.canisterId, logo);
                        metadata := {
                            name = metadata.name;
                            symbol = metadata.symbol;
                            fee = metadata.fee;
                            decimals = metadata.decimals;
                            hasLogo = true;
                                standard = metadata.standard;
                            };
                        } else {
                            metadata := {
                                name = metadata.name;
                                symbol = metadata.symbol;
                                fee = metadata.fee;
                                decimals = metadata.decimals;
                                hasLogo = false;
                                standard = metadata.standard;
                            };
                        };
                    };
                    case (null) {
                        // Try ICPSwap as last resort
                        let fetchedLogo = await fetchLogo(args.canisterId);
                        switch(fetchedLogo) {
                            case (?logo) {
                                if (isValidLogoUrl(logo)) {
                                tokenLogos.put(args.canisterId, logo);
                                metadata := {
                                    name = metadata.name;
                                    symbol = metadata.symbol;
                                    fee = metadata.fee;
                                    decimals = metadata.decimals;
                                    hasLogo = true;
                                        standard = metadata.standard;
                                    };
                                } else {
                                    metadata := {
                                        name = metadata.name;
                                        symbol = metadata.symbol;
                                        fee = metadata.fee;
                                        decimals = metadata.decimals;
                                        hasLogo = false;
                                        standard = metadata.standard;
                                    };
                                };
                            };
                            case (null) {
                                metadata := {
                                    name = metadata.name;
                                    symbol = metadata.symbol;
                                    fee = metadata.fee;
                                    decimals = metadata.decimals;
                                    hasLogo = false;
                                    standard = metadata.standard;
                                };
                            };
                        };
                    };
                };
            };
        };

        // Store the final metadata
        tokenMetadata.put(args.canisterId, metadata);
        #ok()
    };

    // Add or update a token in the whitelist
    public shared({caller}) func add_token(args: AddTokenArgs) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        // Add token to whitelist
        let result = await addTokenInternal(args);
        result
    };

    // Remove a token from the whitelist
    public shared({caller}) func remove_token(canisterId: Principal) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        tokenMetadata.delete(canisterId);
        tokenLogos.delete(canisterId);
        #ok()
    };

    // Get token metadata
    public query func get_token_metadata(canisterId: Principal) : async ?TokenMetadata {
        // First check whitelisted tokens
        let whitelistedMetadata = tokenMetadata.get(canisterId);
        switch (whitelistedMetadata) {
            case (?metadata) ?metadata;
            case null {
                // Then check ICPSwap tokens
                let icpswapMetadata = tokenMetadataICPSwap.get(canisterId);
                switch (icpswapMetadata) {
                    case (?metadata) ?metadata;
                    case null {
                        // Finally check custom tokens
                        customTokenMetadata.get(canisterId)
                    };
                };
            };
        };
    };

    // Get token logo
    public query func get_token_logo(canisterId: Principal) : async ?Text {
        tokenLogos.get(canisterId)
    };

    // Get all whitelisted tokens
    public query func get_whitelisted_tokens() : async [(Principal, TokenMetadata)] {
        Iter.toArray(tokenMetadata.entries())
    };

    // Statistics methods

    // Helper function to get or create token stats
    private func getOrCreateTokenStats(token_id: Text) : TokenStats {
        switch (tokenStats.get(token_id)) {
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
                tokenStats.put(token_id, newStats);
                newStats
            };
        }
    };

    // Helper function to get or create user stats
    private func getOrCreateUserStats(user: Text) : UserStats {
        switch (userStats.get(user)) {
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
                userStats.put(user, newStats);
                newStats
            };
        }
    };

    // Record completed ICPSwap swap
    public shared func record_icpswap_swap(
        user: Principal,
        token_in: Text,  // Canister ID
        amount_in_e8s: Nat,
        token_out: Text,  // Canister ID
        amount_out_e8s: Nat,
        pool_id: Principal,  // Add pool_id parameter
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps + 1;
            icpswap_swaps = globalStats.icpswap_swaps + 1;
            kong_swaps = globalStats.kong_swaps;
            split_swaps = globalStats.split_swaps;
            total_sends = globalStats.total_sends;
            total_deposits = globalStats.total_deposits;
            total_withdrawals = globalStats.total_withdrawals;
        };

        // Update token stats
        let token_in_stats = getOrCreateTokenStats(token_in);
        tokenStats.put(token_in, {
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

        let token_out_stats = getOrCreateTokenStats(token_out);
        tokenStats.put(token_out, {
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

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps + 1;
            icpswap_swaps = user_stats.icpswap_swaps + 1;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Add tokens to user's wallet
        if (token_in != Principal.toText(ICP_PRINCIPAL)) {
            var userTokens = switch (userWalletTokens.get(user)) {
                case (?tokens) tokens;
                case null [];
            };
            let tokenInPrincipal = Principal.fromText(token_in);
            let tokenInIndex = getOrCreateUserIndex(tokenInPrincipal);
            let existsIn = Array.find<Nat16>(userTokens, func(idx) = idx == tokenInIndex);
            if (existsIn == null) {
                userTokens := Array.append<Nat16>(userTokens, [tokenInIndex]);
                userWalletTokens.put(user, userTokens);
            };
        };

        if (token_out != Principal.toText(ICP_PRINCIPAL)) {
            var userTokens = switch (userWalletTokens.get(user)) {
                case (?tokens) tokens;
                case null [];
            };
            let tokenOutPrincipal = Principal.fromText(token_out);
            let tokenOutIndex = getOrCreateUserIndex(tokenOutPrincipal);
            let existsOut = Array.find<Nat16>(userTokens, func(idx) = idx == tokenOutIndex);
            if (existsOut == null) {
                userTokens := Array.append<Nat16>(userTokens, [tokenOutIndex]);
                userWalletTokens.put(user, userTokens);
            };
        };

        // Add pool to user's tracked pools
        ignore await add_pool_impl(user, pool_id);
    };

    // Record completed Kong swap
    public shared func record_kong_swap(
        user: Principal,
        token_in: Text,  // Canister ID
        amount_in_e8s: Nat,
        token_out: Text,  // Canister ID
        amount_out_e8s: Nat,
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps + 1;
            icpswap_swaps = globalStats.icpswap_swaps;
            kong_swaps = globalStats.kong_swaps + 1;
            split_swaps = globalStats.split_swaps;
            total_sends = globalStats.total_sends;
            total_deposits = globalStats.total_deposits;
            total_withdrawals = globalStats.total_withdrawals;
        };

        // Update token stats
        let token_in_stats = getOrCreateTokenStats(token_in);
        tokenStats.put(token_in, {
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

        let token_out_stats = getOrCreateTokenStats(token_out);
        tokenStats.put(token_out, {
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

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps + 1;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps + 1;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Add tokens to user's wallet
        if (token_in != Principal.toText(ICP_PRINCIPAL)) {
            var userTokens = switch (userWalletTokens.get(user)) {
                case (?tokens) tokens;
                case null [];
            };
            let tokenInPrincipal = Principal.fromText(token_in);
            let tokenInIndex = getOrCreateUserIndex(tokenInPrincipal);
            let existsIn = Array.find<Nat16>(userTokens, func(idx) = idx == tokenInIndex);
            if (existsIn == null) {
                userTokens := Array.append<Nat16>(userTokens, [tokenInIndex]);
                userWalletTokens.put(user, userTokens);
            };
        };

        if (token_out != Principal.toText(ICP_PRINCIPAL)) {
            var userTokens = switch (userWalletTokens.get(user)) {
                case (?tokens) tokens;
                case null [];
            };
            let tokenOutPrincipal = Principal.fromText(token_out);
            let tokenOutIndex = getOrCreateUserIndex(tokenOutPrincipal);
            let existsOut = Array.find<Nat16>(userTokens, func(idx) = idx == tokenOutIndex);
            if (existsOut == null) {
                userTokens := Array.append<Nat16>(userTokens, [tokenOutIndex]);
                userWalletTokens.put(user, userTokens);
            };
        };
    };

    // Record completed split swap
    public shared func record_split_swap(
        user: Principal,
        token_in: Text,  // Canister ID
        icpswap_amount_in_e8s: Nat,
        kong_amount_in_e8s: Nat,
        token_out: Text,  // Canister ID
        icpswap_amount_out_e8s: Nat,
        kong_amount_out_e8s: Nat,
        icpswap_pool_id: Principal,  // Add pool ID
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps + 1;
            icpswap_swaps = globalStats.icpswap_swaps;
            kong_swaps = globalStats.kong_swaps;
            split_swaps = globalStats.split_swaps + 1;
            total_sends = globalStats.total_sends;
            total_deposits = globalStats.total_deposits;
            total_withdrawals = globalStats.total_withdrawals;
        };

        // Update token stats
        let token_in_stats = getOrCreateTokenStats(token_in);
        tokenStats.put(token_in, {
            total_swaps = token_in_stats.total_swaps + 1;
            icpswap_swaps = token_in_stats.icpswap_swaps;
            kong_swaps = token_in_stats.kong_swaps;
            split_swaps = token_in_stats.split_swaps + 1;
            volume_e8s = token_in_stats.volume_e8s + icpswap_amount_in_e8s + kong_amount_in_e8s;
            total_sends = token_in_stats.total_sends;
            sends_volume_e8s = token_in_stats.sends_volume_e8s + icpswap_amount_in_e8s;
            total_deposits = token_in_stats.total_deposits;
            deposits_volume_e8s = token_in_stats.deposits_volume_e8s + icpswap_amount_in_e8s;
            total_withdrawals = token_in_stats.total_withdrawals;
            withdrawals_volume_e8s = token_in_stats.withdrawals_volume_e8s + icpswap_amount_in_e8s;
        });

        let token_out_stats = getOrCreateTokenStats(token_out);
        tokenStats.put(token_out, {
            total_swaps = token_out_stats.total_swaps + 1;
            icpswap_swaps = token_out_stats.icpswap_swaps;
            kong_swaps = token_out_stats.kong_swaps;
            split_swaps = token_out_stats.split_swaps + 1;
            volume_e8s = token_out_stats.volume_e8s + icpswap_amount_out_e8s + kong_amount_out_e8s;
            total_sends = token_out_stats.total_sends;
            sends_volume_e8s = token_out_stats.sends_volume_e8s + icpswap_amount_out_e8s;
            total_deposits = token_out_stats.total_deposits;
            deposits_volume_e8s = token_out_stats.deposits_volume_e8s + icpswap_amount_out_e8s;
            total_withdrawals = token_out_stats.total_withdrawals;
            withdrawals_volume_e8s = token_out_stats.withdrawals_volume_e8s + icpswap_amount_out_e8s;
        });

        // Update user stats
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps + 1;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps + 1;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Add tokens to user's wallet
        if (token_in != Principal.toText(ICP_PRINCIPAL)) {
            var userTokens = switch (userWalletTokens.get(user)) {
                case (?tokens) tokens;
                case null [];
            };
            let tokenInPrincipal = Principal.fromText(token_in);
            let tokenInIndex = getOrCreateUserIndex(tokenInPrincipal);
            let existsIn = Array.find<Nat16>(userTokens, func(idx) = idx == tokenInIndex);
            if (existsIn == null) {
                userTokens := Array.append<Nat16>(userTokens, [tokenInIndex]);
                userWalletTokens.put(user, userTokens);
            };
        };

        if (token_out != Principal.toText(ICP_PRINCIPAL)) {
            var userTokens = switch (userWalletTokens.get(user)) {
                case (?tokens) tokens;
                case null [];
            };
            let tokenOutPrincipal = Principal.fromText(token_out);
            let tokenOutIndex = getOrCreateUserIndex(tokenOutPrincipal);
            let existsOut = Array.find<Nat16>(userTokens, func(idx) = idx == tokenOutIndex);
            if (existsOut == null) {
                userTokens := Array.append<Nat16>(userTokens, [tokenOutIndex]);
                userWalletTokens.put(user, userTokens);
            };
        };

        // Add pools to user's tracked pools
        ignore await add_pool_impl(user, icpswap_pool_id);
    };

    // Record completed send
    public shared func record_send(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps;
            icpswap_swaps = globalStats.icpswap_swaps;
            kong_swaps = globalStats.kong_swaps;
            split_swaps = globalStats.split_swaps;
            total_sends = globalStats.total_sends + 1;
            total_deposits = globalStats.total_deposits;
            total_withdrawals = globalStats.total_withdrawals;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token);
        tokenStats.put(token, {
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
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends + 1;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });
    };

    // Record completed deposit
    public shared func record_deposit(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        pool_id: Principal,  // Add pool_id parameter
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps;
            icpswap_swaps = globalStats.icpswap_swaps;
            kong_swaps = globalStats.kong_swaps;
            split_swaps = globalStats.split_swaps;
            total_sends = globalStats.total_sends;
            total_deposits = globalStats.total_deposits + 1;
            total_withdrawals = globalStats.total_withdrawals;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token);
        tokenStats.put(token, {
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
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits + 1;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Add pools to user's tracked pools
        ignore await add_pool_impl(user, pool_id);
    };

    // Record completed withdrawal
    public shared func record_withdrawal(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        pool_id: Principal,  // Add pool_id parameter
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps;
            icpswap_swaps = globalStats.icpswap_swaps;
            kong_swaps = globalStats.kong_swaps;
            split_swaps = globalStats.split_swaps;
            total_sends = globalStats.total_sends;
            total_deposits = globalStats.total_deposits;
            total_withdrawals = globalStats.total_withdrawals + 1;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token);
        tokenStats.put(token, {
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
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals + 1;
        });

        // Add pools to user's tracked pools
        ignore await add_pool_impl(user, pool_id);
    };

    // Record completed transfer
    public shared func record_transfer(
        user: Principal,
        token: Text,  // Canister ID
        amount_e8s: Nat,
        pool_id: Principal,  // Add pool_id parameter
    ) : async () {
        // Update global stats
        globalStats := {
            total_swaps = globalStats.total_swaps;
            icpswap_swaps = globalStats.icpswap_swaps;
            kong_swaps = globalStats.kong_swaps;
            split_swaps = globalStats.split_swaps;
            total_sends = globalStats.total_sends + 1;
            total_deposits = globalStats.total_deposits;
            total_withdrawals = globalStats.total_withdrawals;
        };

        // Update token stats
        let token_stats = getOrCreateTokenStats(token);
        tokenStats.put(token, {
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
        let user_stats = getOrCreateUserStats(Principal.toText(user));
        userStats.put(Principal.toText(user), {
            total_swaps = user_stats.total_swaps;
            icpswap_swaps = user_stats.icpswap_swaps;
            kong_swaps = user_stats.kong_swaps;
            split_swaps = user_stats.split_swaps;
            total_sends = user_stats.total_sends + 1;
            total_deposits = user_stats.total_deposits;
            total_withdrawals = user_stats.total_withdrawals;
        });

        // Add pools to user's tracked pools
        ignore await add_pool_impl(user, pool_id);
    };

    // Query methods

    public query func get_global_stats() : async GlobalStats {
        globalStats
    };

    public query func get_token_stats(token_id: Text) : async ?TokenStats {
        tokenStats.get(token_id)
    };

    public query func get_user_stats(user: Principal) : async ?UserStats {
        userStats.get(Principal.toText(user))
    };

    public query func get_all_token_stats() : async [(Text, TokenStats)] {
        Iter.toArray(tokenStats.entries())
    };

    // Add method to get all user stats
    public query func get_all_user_stats() : async [(Text, UserStats)] {
        Iter.toArray(userStats.entries())
    };

    // New: Record a user login
    public shared func record_login(user: Principal) : async () {
        let userText = Principal.toText(user);
        let currentLogins = switch (userLogins.get(userText)) {
            case (?count) count;
            case null 0;
        };
        userLogins.put(userText, currentLogins + 1);
    };

    // New: Get all user login counts
    public query func get_all_user_logins() : async [(Text, Nat)] {
        Iter.toArray(userLogins.entries())
    };

    // New: Get total number of unique users who have logged in
    public query func get_unique_user_count() : async Nat {
        userLogins.size()
    };


    // New: Get total number of unique traders
    public query func get_unique_trader_count() : async Nat {
        userStats.size()
    };

    // Modify the return type to include logo
    type RegisterTokenResponse = {
        metadata: TokenMetadata;
        logo: ?Text;
    };

    // Custom token management methods
    public shared({caller}) func register_custom_token(token_canister_id: Principal) : async Result.Result<RegisterTokenResponse, Text> {
        // Verify caller is authenticated
        if (Principal.isAnonymous(caller)) {
            return #err("Authentication required");
        };

        // First check if token exists in main whitelist
        switch (tokenMetadata.get(token_canister_id)) {
            case (?existing) {
                // Add to user's custom tokens if not already there
                let userTokens = switch (userCustomTokens.get(caller)) {
                    case (?tokens) tokens;
                    case (null) [];
                };
                if (Array.filter<Principal>(userTokens, func(p) { p == token_canister_id }).size() == 0) {
                    userCustomTokens.put(caller, Array.append(userTokens, [token_canister_id]));
                };
                return #ok({
                    metadata = existing;
                    logo = tokenLogos.get(token_canister_id);
                });
            };
            case (null) {
                // Then check ICPSwap tokens
                switch (tokenMetadataICPSwap.get(token_canister_id)) {
                    case (?existing) {
                        // Add to user's custom tokens if not already there
                        let userTokens = switch (userCustomTokens.get(caller)) {
                            case (?tokens) tokens;
                            case (null) [];
                        };
                        if (Array.filter<Principal>(userTokens, func(p) { p == token_canister_id }).size() == 0) {
                            userCustomTokens.put(caller, Array.append(userTokens, [token_canister_id]));
                        };
                        return #ok({
                            metadata = existing;
                            logo = tokenLogos.get(token_canister_id);
                        });
                    };
                    case (null) {
                        // Then check if metadata already exists in custom tokens
                        switch (customTokenMetadata.get(token_canister_id)) {
                            case (?existing) {
                                // Add to user's custom tokens if not already there
                                let userTokens = switch (userCustomTokens.get(caller)) {
                                    case (?tokens) tokens;
                                    case (null) [];
                                };
                                if (Array.filter<Principal>(userTokens, func(p) { p == token_canister_id }).size() == 0) {
                                    userCustomTokens.put(caller, Array.append(userTokens, [token_canister_id]));
                                };
                                return #ok({
                                    metadata = existing;
                                    logo = tokenLogos.get(token_canister_id);
                                });
                            };
                            case (null) {};
                        };
                    };
                };
            };
        };

        // If we get here, we need to fetch the metadata from the token canister
        try {
            let token : ICRC1Interface = actor(Principal.toText(token_canister_id));
            let metadata = await token.icrc1_metadata();
            
            // Extract metadata values
            let name = switch (await token.icrc1_name()) {
                case (?n) ?n;
                case (null) extractText(extractFromMetadata(metadata, "icrc1:name"));
            };
            let symbol = switch (await token.icrc1_symbol()) {
                case (?s) ?s;
                case (null) extractText(extractFromMetadata(metadata, "icrc1:symbol"));
            };
            let fee = switch (await token.icrc1_fee()) {
                case (?f) ?f;
                case (null) extractNat(extractFromMetadata(metadata, "icrc1:fee"));
            };
            let decimals = switch (await token.icrc1_decimals()) {
                case (?d) ?d;
                case (null) switch (extractFromMetadata(metadata, "icrc1:decimals")) {
                    case (?#Nat8(d)) ?d;
                    case (_) null;
                }
            };

            // Check supported standards
            var standard = "ICRC1";
            try {
                let standards = await token.icrc1_supported_standards();
                // Only check for ICRC2, default to ICRC1
                for (std in standards.vals()) {
                    if (std.name == "ICRC-2") {
                        standard := "ICRC2";
                    };
                };
            } catch (e) {
                // If icrc1_supported_standards fails, assume ICRC1
                standard := "ICRC1";
            };

            // Check for logo in metadata first, then try ICPSwap as fallback
            var hasLogo = false;
            var logoUrl : ?Text = null;
            switch (extractText(extractFromMetadata(metadata, "icrc1:logo"))) {
                case (?logo) {
                    if (isValidLogoUrl(logo)) {
                        tokenLogos.put(token_canister_id, logo);
                        hasLogo := true;
                        logoUrl := ?logo;
                    };
                };
                case null {
                    try {
                        let icpswap : ICPSwapInterface = actor(ICPSWAP_TOKEN_CANISTER_ID);
                        switch (await icpswap.getLogo(Principal.toText(token_canister_id))) {
                            case (#ok(logoText)) { 
                                if (logoText != "" and isValidLogoUrl(logoText)) {
                                    tokenLogos.put(token_canister_id, logoText);
                                    hasLogo := true;
                                    logoUrl := ?logoText;
                                }
                            };
                            case (#err(_)) {};
                        };
                    }
                    catch (_e) {};
                };
            };

            let newMetadata : TokenMetadata = {
                name = name;
                symbol = symbol;
                fee = fee;
                decimals = decimals;
                hasLogo = hasLogo;
                standard = standard;
            };

            // Store metadata in custom tokens
            customTokenMetadata.put(token_canister_id, newMetadata);

            // Add to user's custom tokens
            let userTokens = switch (userCustomTokens.get(caller)) {
                case (?tokens) tokens;
                case (null) [];
            };
            userCustomTokens.put(caller, Array.append(userTokens, [token_canister_id]));

            #ok({
                metadata = newMetadata;
                logo = logoUrl;
            })
        }
        catch (e) {
            #err("Failed to fetch token metadata: " # Error.message(e))
        };
    };

    public shared({caller}) func remove_custom_token(token_canister_id: Principal) : async Bool {
        // Verify caller is authenticated
        if (Principal.isAnonymous(caller)) {
            return false;
        };

        // Remove from user's custom tokens
        switch (userCustomTokens.get(caller)) {
            case (?tokens) {
                let newTokens = Array.filter<Principal>(tokens, func(p) { p != token_canister_id });
                if (newTokens.size() < tokens.size()) {
                    userCustomTokens.put(caller, newTokens);
                    
                    // Check if any other users still have this token
                    var hasOtherUsers = false;
                    for ((user, userTokens) in userCustomTokens.entries()) {
                        if (user != caller) {
                            for (token in userTokens.vals()) {
                                if (token == token_canister_id) {
                                    hasOtherUsers := true;
                                };
                            };
                        };
                    };
                    
                    // If no other users have this token, remove it from custom metadata
                    if (not hasOtherUsers) {
                        customTokenMetadata.delete(token_canister_id);
                        tokenLogos.delete(token_canister_id);
                    };
                    
                    return true;
                };
            };
            case (null) {};
        };
        false
    };

    public query({caller}) func get_custom_tokens() : async [(Principal, TokenMetadata)] {
        // Return empty array for anonymous callers
        if (Principal.isAnonymous(caller)) {
            return [];
        };

        // Get user's custom tokens
        switch (userCustomTokens.get(caller)) {
            case (?tokens) {
                // Map each token to a tuple of (Principal, TokenMetadata)
                Array.mapFilter<Principal, (Principal, TokenMetadata)>(tokens, func(p) {
                    // First check main whitelist
                    switch (tokenMetadata.get(p)) {
                        case (?metadata) ?(p, metadata);
                        case null {
                            // Then check custom tokens
                            switch (customTokenMetadata.get(p)) {
                                case (?metadata) ?(p, metadata);
                                case (null) null;
                            };
                        };
                    };
                })
            };
            case (null) [];
        };
    };

    // Get popular tokens (ICP + top N most traded whitelisted tokens)
    public query func get_popular_tokens(n: Nat) : async [(Principal, TokenMetadata)] {
        // Get all token stats
        let stats = Iter.toArray(tokenStats.entries());
        
        // Sort tokens by total_swaps
        let sorted = Array.sort<(Text, TokenStats)>(stats, func(a, b) {
            if (a.1.total_swaps > b.1.total_swaps) { #less }
            else if (a.1.total_swaps < b.1.total_swaps) { #greater }
            else { #equal }
        });

        // Filter to only include whitelisted tokens and convert to Principal
        let filtered = Array.mapFilter<(Text, TokenStats), Principal>(sorted, func((id, _)) {
            let p = Principal.fromText(id);
            switch (tokenMetadata.get(p)) {
                case (?_) ?p;
                case (null) switch (tokenMetadataICPSwap.get(p)) {
                    case (?_) ?p;
                    case (null) null;
                };
            }
        });

        // Get ICP metadata
        let icpMetadata = switch (tokenMetadata.get(ICP_PRINCIPAL)) {
            case (?metadata) [(ICP_PRINCIPAL, metadata)];
            case (null) [];
        };

        // Add remaining top tokens (excluding ICP if it was in the filtered list)
        let remainingTokens = Array.filter<Principal>(filtered, func(p) { p != ICP_PRINCIPAL });
        let topN = Array.subArray<Principal>(remainingTokens, 0, Nat.min(n - 1, remainingTokens.size()));
        
        // Get metadata for top tokens
        let topTokensWithMetadata = Array.mapFilter<Principal, (Principal, TokenMetadata)>(topN, func(p) {
            switch (tokenMetadata.get(p)) {
                case (?metadata) ?((p, metadata));
                case (null) switch (tokenMetadataICPSwap.get(p)) {
                    case (?metadata) ?((p, metadata));
                    case (null) null;
                };
            };
        });

        // Combine ICP with top tokens
        Array.append(icpMetadata, topTokensWithMetadata)
    };

    // Start importing tokens from ICPSwap
    public shared({caller}) func start_icpswap_import(batch_size: Nat) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (importProgress.is_running) {
            return #err("Import already in progress");
        };

        // Reset progress
        importProgress := {
            last_processed = null;
            total_tokens = 0;
            processed_count = 0;
            imported_count = 0;
            skipped_count = 0;
            failed_count = 0;
            is_running = true;
        };

        // Start the first batch
        nextBatchSize := ?batch_size;
        ignore Timer.setTimer<system>(#seconds(0), processNextBatch);
        #ok()
    };

    // Get current import progress
    public query func get_import_progress() : async ImportProgress {
        importProgress
    };

    // Stop an in-progress import
    public shared({caller}) func stop_icpswap_import() : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (not importProgress.is_running) {
            return #err("No import in progress");
        };

        importProgress := {
            last_processed = importProgress.last_processed;
            total_tokens = importProgress.total_tokens;
            processed_count = importProgress.processed_count;
            imported_count = importProgress.imported_count;
            skipped_count = importProgress.skipped_count;
            failed_count = importProgress.failed_count;
            is_running = false;
        };

        #ok()
    };

    // Clear the entire token whitelist
    public shared({caller}) func clear_whitelist() : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        // Clear all token metadata and logos
        tokenMetadata := HashMap.HashMap<Principal, TokenMetadata>(10, Principal.equal, Principal.hash);
        tokenLogos := HashMap.HashMap<Principal, Text>(10, Principal.equal, Principal.hash);
        
        // Reset stable storage entries
        tokenMetadataEntries := [];
        tokenLogoEntries := [];

        Debug.print("Whitelist cleared");
        #ok()
    };

    // Helper function to check if a token standard is supported
    private func isSupportedStandard(standard: Text) : Bool {
        standard == "ICRC1" or standard == "ICRC2" or standard == "ICRC3"
    };

    // Add a system timer callback function
    // The proper syntax for this is private func processNextBatch<system>() : async ()
    private func processNextBatch<system>() : async () {
        Debug.print("Starting batch processing...");
        let nextBatchSize = 10;
        
        if (not importProgress.is_running) {
            Debug.print("Import not running, exiting");
            return;
        };

        try {
            let icpswap = actor(ICPSWAP_TOKEN_CANISTER_ID) : ICPSwapListInterface;
            let tokenListResult = await icpswap.getList();
            
            switch (tokenListResult) {
                case (#ok(tokenList)) {
                    Debug.print("Fetched token list of size: " # debug_show(tokenList.size()));
                    
                    // Only update total_tokens if it's not already set
                    if (importProgress.total_tokens == 0) {
                        importProgress := {
                            last_processed = importProgress.last_processed;
                            total_tokens = tokenList.size();
                            processed_count = importProgress.processed_count;
                            imported_count = importProgress.imported_count;
                            skipped_count = importProgress.skipped_count;
                            failed_count = importProgress.failed_count;
                            is_running = true;
                        };
                    };

                    // Find the index of the last processed token
                    var startIndex = 0;
                    switch (importProgress.last_processed) {
                        case (?lastId) {
                            label search for (i in Iter.range(0, tokenList.size() - 1)) {
                                if (tokenList[i].canisterId == lastId) {
                                    startIndex := i + 1;
                                    break search;
                                };
                            };
                        };
                        case null { };
                    };

                    // Get the next batch of tokens
                    let remainingTokens = tokenList.size() - startIndex;
                    let batchSize = Nat.min(nextBatchSize, remainingTokens);
                    let batch = Array.subArray<ICPSwapToken>(tokenList, startIndex, batchSize);
                    
                    Debug.print("Processing " # debug_show(batchSize) # " tokens starting from index " # debug_show(startIndex));
                    
                    // If no more tokens to process, mark import as complete
                    if (batchSize == 0) {
                        Debug.print("No more tokens to process, marking import as complete");
                        importProgress := {
                            last_processed = importProgress.last_processed;
                            total_tokens = importProgress.total_tokens;
                            processed_count = importProgress.processed_count;
                            imported_count = importProgress.imported_count;
                            skipped_count = importProgress.skipped_count;
                            failed_count = importProgress.failed_count;
                            is_running = false;
                        };
                        return;
                    };
                    
                    var batchProcessed = false;
                    
                    for (token in batch.vals()) {
                        Debug.print("Processing token: " # debug_show(token.canisterId));
                        batchProcessed := true;
                        
                        try {
                            if (not isSupportedStandard(token.standard)) {
                                Debug.print("Skipping token with unsupported standard: " # token.canisterId # " (standard: " # token.standard # ")");
                                importProgress := {
                                    last_processed = ?token.canisterId;
                                    total_tokens = importProgress.total_tokens;
                                    processed_count = importProgress.processed_count + 1;
                                    imported_count = importProgress.imported_count;
                                    skipped_count = importProgress.skipped_count + 1;
                                    failed_count = importProgress.failed_count;
                                    is_running = true;
                                }
                            } else if (isWhitelisted(Principal.fromText(token.canisterId))) {
                                Debug.print("Token already whitelisted, skipping: " # token.canisterId);
                                importProgress := {
                                    last_processed = ?token.canisterId;
                                    total_tokens = importProgress.total_tokens;
                                    processed_count = importProgress.processed_count + 1;
                                    imported_count = importProgress.imported_count;
                                    skipped_count = importProgress.skipped_count + 1;
                                    failed_count = importProgress.failed_count;
                                    is_running = true;
                                }
                            } else {
                                // Try to get the logo first
                                var hasValidLogo = false;
                                var logoUrl : ?Text = null;
                                try {
                                    let logoResult = await icpswap.getLogo(token.canisterId);
                                    switch (logoResult) {
                                        case (#ok(logo)) { 
                                            if (logo != "") {
                                                logoUrl := ?logo;
                                                hasValidLogo := true;
                                            }
                                        };
                                        case (#err(_)) { };
                                    };
                                } catch (e) {
                                    Debug.print("Failed to fetch logo for token: " # token.canisterId);
                                };

                                // Add token to whitelist with complete metadata from ICPSwap
                                let result = await addTokenInternal({
                                    canisterId = Principal.fromText(token.canisterId);
                                    metadata = {
                                        name = ?token.name;
                                        symbol = ?token.symbol;
                                        fee = ?token.fee;
                                        decimals = ?Nat8.fromNat(token.decimals);
                                        hasLogo = hasValidLogo;
                                        standard = token.standard;  // Use standard directly from ICPSwap
                                    };
                                    logo = logoUrl;
                                });

                                switch(result) {
                                    case (#ok()) {
                                        importProgress := {
                                            last_processed = ?token.canisterId;
                                            total_tokens = importProgress.total_tokens;
                                            processed_count = importProgress.processed_count + 1;
                                            imported_count = importProgress.imported_count + 1;
                                            skipped_count = importProgress.skipped_count;
                                            failed_count = importProgress.failed_count;
                                            is_running = true;
                                        };
                                    };
                                    case (#err(e)) {
                                        Debug.print("Failed to add token: " # token.canisterId # " Error: " # e);
                                        importProgress := {
                                            last_processed = ?token.canisterId;
                                            total_tokens = importProgress.total_tokens;
                                            processed_count = importProgress.processed_count + 1;
                                            imported_count = importProgress.imported_count;
                                            skipped_count = importProgress.skipped_count;
                                            failed_count = importProgress.failed_count + 1;
                                            is_running = true;
                                        };
                                    };
                                };
                            };
                        } catch (e) {
                            Debug.print("Error processing token: " # token.canisterId # " Error: " # Error.message(e));
                            importProgress := {
                                last_processed = ?token.canisterId;
                                total_tokens = importProgress.total_tokens;
                                processed_count = importProgress.processed_count + 1;
                                imported_count = importProgress.imported_count;
                                skipped_count = importProgress.skipped_count;
                                failed_count = importProgress.failed_count + 1;
                                is_running = true;
                            }
                        };
                    };

                    // Schedule next batch if there are more tokens to process
                    if (importProgress.processed_count < importProgress.total_tokens and batchProcessed) {
                        Debug.print("Scheduling next batch...");
                        // The proper syntax for this is ignore Timer.setTimer<system>(#seconds 1, processNextBatch);
                        ignore Timer.setTimer<system>(#seconds 1, processNextBatch);
                    } else {
                        Debug.print("Import completed!");
                        importProgress := {
                            last_processed = importProgress.last_processed;
                            total_tokens = importProgress.total_tokens;
                            processed_count = importProgress.processed_count;
                            imported_count = importProgress.imported_count;
                            skipped_count = importProgress.skipped_count;
                            failed_count = importProgress.failed_count;
                            is_running = false;
                        };
                    };
                };
                case (#err(error)) {
                    Debug.print("Error fetching token list: " # error);
                    importProgress := {
                        last_processed = importProgress.last_processed;
                        total_tokens = importProgress.total_tokens;
                        processed_count = importProgress.processed_count;
                        imported_count = importProgress.imported_count;
                        skipped_count = importProgress.skipped_count;
                        failed_count = importProgress.failed_count;
                        is_running = false;
                    };
                };
            };
        } catch (e) {
            Debug.print("Error in processNextBatch: " # Error.message(e));
            importProgress := {
                last_processed = importProgress.last_processed;
                total_tokens = importProgress.total_tokens;
                processed_count = importProgress.processed_count;
                imported_count = importProgress.imported_count;
                skipped_count = importProgress.skipped_count;
                failed_count = importProgress.failed_count;
                is_running = false;
            };
        };
    };

    // Copy trusted tokens from ICPSwap
    public shared({caller}) func copy_icpswap_trusted_tokens() : async Result.Result<Text, Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        try {
            let icpswapList = actor(ICPSWAP_TOKEN_CANISTER_ID) : ICPSwapListInterface;
            let result = await icpswapList.getList();
            
            switch(result) {
                case (#ok(tokens)) {
                    var imported = 0;
                    var skipped = 0;
                    var failed = 0;

                    for (token in tokens.vals()) {
                        try {
                            let canisterId = Principal.fromText(token.canisterId);
                            
                            // Create token metadata - always set hasLogo to false initially
                            let metadata : TokenMetadata = {
                                name = ?token.name;
                                symbol = ?token.symbol;
                                fee = ?token.fee;
                                decimals = ?Nat8.fromNat(token.decimals);
                                hasLogo = false;
                                standard = token.standard;
                            };

                            tokenMetadataICPSwap.put(canisterId, metadata);
                            imported += 1;
                        } catch (_e) {
                            failed += 1;
                        };
                    };

                    // Update stable storage
                    tokenMetadataEntriesICPSwap := Iter.toArray(tokenMetadataICPSwap.entries());

                    return #ok("Imported " # Nat.toText(imported) # " tokens, skipped " # Nat.toText(skipped) # ", failed " # Nat.toText(failed));
                };
                case (#err(e)) {
                    return #err("Failed to fetch ICPSwap token list: " # e);
                };
            };
        } catch (e) {
            return #err("Error copying ICPSwap tokens: " # Error.message(e));
        };
    };

    // Query ICPSwap tokens
    public query func get_icpswap_tokens() : async [(Principal, TokenMetadata)] {
        Iter.toArray(tokenMetadataICPSwap.entries())
    };

    // Update logo status for ICPSwap tokens with batching
    public shared({caller}) func update_icpswap_token_logos(batch_size: Nat) : async Result.Result<Text, Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (logoUpdateProgress.is_running) {
            return #err("Logo update already in progress");
        };

        // Reset progress
        logoUpdateProgress := {
            total_tokens = tokenMetadataICPSwap.size();
            processed_count = 0;
            updated_count = 0;
            skipped_count = 0;
            failed_count = 0;
            is_running = true;
            last_processed = null;
        };

        // Start the first batch
        nextLogoBatchSize := ?batch_size;
        ignore Timer.setTimer<system>(#seconds(0), processNextLogoBatch);
        #ok("Started logo update process")
    };

    // Get current logo update progress
    public query func get_logo_update_progress() : async {
        total_tokens: Nat;
        processed_count: Nat;
        updated_count: Nat;
        skipped_count: Nat;
        failed_count: Nat;
        is_running: Bool;
        last_processed: ?Principal;
    } {
        logoUpdateProgress
    };

    // Stop an in-progress logo update
    public shared({caller}) func stop_logo_update() : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (not logoUpdateProgress.is_running) {
            return #err("No logo update in progress");
        };

        logoUpdateProgress := {
            total_tokens = logoUpdateProgress.total_tokens;
            processed_count = logoUpdateProgress.processed_count;
            updated_count = logoUpdateProgress.updated_count;
            skipped_count = logoUpdateProgress.skipped_count;
            failed_count = logoUpdateProgress.failed_count;
            is_running = false;
            last_processed = logoUpdateProgress.last_processed;
        };

        #ok()
    };

    // Process next batch of logos
    private func processNextLogoBatch<system>() : async () {
        let batchSize = switch (nextLogoBatchSize) {
            case (null) return;
            case (?size) size;
        };

        try {
            let icpswap = actor(ICPSWAP_TOKEN_CANISTER_ID) : ICPSwapListInterface;
            var processed = 0;
            var lastProcessed: ?Principal = null;
            var currentProgress = logoUpdateProgress;

            label processing for ((canisterId, metadata) in tokenMetadataICPSwap.entries()) {
                // Skip tokens we've already processed in previous batches
                switch (logoUpdateProgress.last_processed) {
                    case (?last) {
                        if (not Principal.equal(last, canisterId)) {
                            continue processing;
                        } else {
                            currentProgress := {
                                total_tokens = currentProgress.total_tokens;
                                processed_count = currentProgress.processed_count;
                                updated_count = currentProgress.updated_count;
                                skipped_count = currentProgress.skipped_count;
                                failed_count = currentProgress.failed_count;
                                is_running = currentProgress.is_running;
                                last_processed = null;  // Reset so we start processing from next token
                            };
                            logoUpdateProgress := currentProgress;
                            continue processing;
                        };
                    };
                    case (null) {};
                };

                // Skip tokens that already have hasLogo = true
                if (metadata.hasLogo) {
                    currentProgress := {
                        total_tokens = currentProgress.total_tokens;
                        processed_count = currentProgress.processed_count + 1;
                        updated_count = currentProgress.updated_count;
                        skipped_count = currentProgress.skipped_count + 1;
                        failed_count = currentProgress.failed_count;
                        is_running = currentProgress.is_running;
                        last_processed = currentProgress.last_processed;
                    };
                    logoUpdateProgress := currentProgress;
                    lastProcessed := ?canisterId;
                    processed += 1;
                    if (processed >= batchSize) {
                        break processing;
                    };
                    continue processing;
                };

                try {
                    // Try to fetch logo from ICPSwap
                    let logoResult = await icpswap.getLogo(Principal.toText(canisterId));
                    switch (logoResult) {
                        case (#ok(logo)) {
                            if (logo != "" and isValidLogoUrl(logo)) {
                                // Store valid logo and update token
                                tokenLogos.put(canisterId, logo);
                                let updatedMetadata : TokenMetadata = {
                                    name = metadata.name;
                                    symbol = metadata.symbol;
                                    fee = metadata.fee;
                                    decimals = metadata.decimals;
                                    hasLogo = true;
                                    standard = metadata.standard;
                                };
                                tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                currentProgress := {
                                    total_tokens = currentProgress.total_tokens;
                                    processed_count = currentProgress.processed_count;
                                    updated_count = currentProgress.updated_count + 1;
                                    skipped_count = currentProgress.skipped_count;
                                    failed_count = currentProgress.failed_count;
                                    is_running = currentProgress.is_running;
                                    last_processed = currentProgress.last_processed;
                                };
                            } else {
                                // Try fetching logo from token metadata
                                try {
                                    let tokenActor = actor(Principal.toText(canisterId)) : actor {
                                        icrc1_metadata : shared query () -> async [(Text, MetadataValue)];
                                    };
                                    let tokenMetadata = await tokenActor.icrc1_metadata();
                                    var foundLogo : ?Text = null;
                                    
                                    label metadataSearch for ((key, value) in tokenMetadata.vals()) {
                                        if (key == "logo" or key == "icrc1:logo") {
                                            switch(value) {
                                                case (#Text(logoUrl)) {
                                                    if (logoUrl != "" and isValidLogoUrl(logoUrl)) {
                                                        foundLogo := ?logoUrl;
                                                        break metadataSearch;
                                                    };
                                                };
                                                case (_) {};
                                            };
                                        };
                                    };

                                    switch(foundLogo) {
                                        case (?logoUrl) {
                                            // Store valid logo from metadata and update token
                                            tokenLogos.put(canisterId, logoUrl);
                                            let updatedMetadata : TokenMetadata = {
                                                name = metadata.name;
                                                symbol = metadata.symbol;
                                                fee = metadata.fee;
                                                decimals = metadata.decimals;
                                                hasLogo = true;
                                                standard = metadata.standard;
                                            };
                                            tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                            currentProgress := {
                                                total_tokens = currentProgress.total_tokens;
                                                processed_count = currentProgress.processed_count;
                                                updated_count = currentProgress.updated_count + 1;
                                                skipped_count = currentProgress.skipped_count;
                                                failed_count = currentProgress.failed_count;
                                                is_running = currentProgress.is_running;
                                                last_processed = currentProgress.last_processed;
                                            };
                                        };
                                        case null {
                                            // Both ICPSwap and metadata attempts failed
                                            let updatedMetadata : TokenMetadata = {
                                                name = metadata.name;
                                                symbol = metadata.symbol;
                                                fee = metadata.fee;
                                                decimals = metadata.decimals;
                                                hasLogo = false;
                                                standard = metadata.standard;
                                            };
                                            tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                            currentProgress := {
                                                total_tokens = currentProgress.total_tokens;
                                                processed_count = currentProgress.processed_count;
                                                updated_count = currentProgress.updated_count;
                                                skipped_count = currentProgress.skipped_count;
                                                failed_count = currentProgress.failed_count;
                                                is_running = currentProgress.is_running;
                                                last_processed = currentProgress.last_processed;
                                            };
                                        };
                                    };
                                } catch (e) {
                                    // Failed to get logo from both sources
                                    let updatedMetadata : TokenMetadata = {
                                        name = metadata.name;
                                        symbol = metadata.symbol;
                                        fee = metadata.fee;
                                        decimals = metadata.decimals;
                                        hasLogo = false;
                                        standard = metadata.standard;
                                    };
                                    tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                    currentProgress := {
                                        total_tokens = currentProgress.total_tokens;
                                        processed_count = currentProgress.processed_count;
                                        updated_count = currentProgress.updated_count;
                                        skipped_count = currentProgress.skipped_count;
                                        failed_count = currentProgress.failed_count;
                                        is_running = currentProgress.is_running;
                                        last_processed = currentProgress.last_processed;
                                    };
                                };
                            };
                        };
                        case (#err(_)) {
                            // Try fetching logo from token metadata
                            try {
                                let tokenActor = actor(Principal.toText(canisterId)) : actor {
                                    icrc1_metadata : shared query () -> async [(Text, MetadataValue)];
                                };
                                let tokenMetadata = await tokenActor.icrc1_metadata();
                                var foundLogo : ?Text = null;
                                
                                label metadataSearch for ((key, value) in tokenMetadata.vals()) {
                                    if (key == "logo" or key == "icrc1:logo") {
                                        switch(value) {
                                            case (#Text(logoUrl)) {
                                                if (logoUrl != "" and isValidLogoUrl(logoUrl)) {
                                                    foundLogo := ?logoUrl;
                                                    break metadataSearch;
                                                };
                                            };
                                            case (_) {};
                                        };
                                    };
                                };

                                switch(foundLogo) {
                                    case (?logoUrl) {
                                        // Store valid logo from metadata and update token
                                        tokenLogos.put(canisterId, logoUrl);
                                        let updatedMetadata : TokenMetadata = {
                                            name = metadata.name;
                                            symbol = metadata.symbol;
                                            fee = metadata.fee;
                                            decimals = metadata.decimals;
                                            hasLogo = true;
                                            standard = metadata.standard;
                                        };
                                        tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                        currentProgress := {
                                            total_tokens = currentProgress.total_tokens;
                                            processed_count = currentProgress.processed_count;
                                            updated_count = currentProgress.updated_count + 1;
                                            skipped_count = currentProgress.skipped_count;
                                            failed_count = currentProgress.failed_count;
                                            is_running = currentProgress.is_running;
                                            last_processed = currentProgress.last_processed;
                                        };
                                    };
                                    case null {
                                        // Both ICPSwap and metadata attempts failed
                                        let updatedMetadata : TokenMetadata = {
                                            name = metadata.name;
                                            symbol = metadata.symbol;
                                            fee = metadata.fee;
                                            decimals = metadata.decimals;
                                            hasLogo = false;
                                            standard = metadata.standard;
                                        };
                                        tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                        currentProgress := {
                                            total_tokens = currentProgress.total_tokens;
                                            processed_count = currentProgress.processed_count;
                                            updated_count = currentProgress.updated_count;
                                            skipped_count = currentProgress.skipped_count;
                                            failed_count = currentProgress.failed_count;
                                            is_running = currentProgress.is_running;
                                            last_processed = currentProgress.last_processed;
                                        };
                                    };
                                };
                            } catch (e) {
                                // Failed to get logo from both sources
                                let updatedMetadata : TokenMetadata = {
                                    name = metadata.name;
                                    symbol = metadata.symbol;
                                    fee = metadata.fee;
                                    decimals = metadata.decimals;
                                    hasLogo = false;
                                    standard = metadata.standard;
                                };
                                tokenMetadataICPSwap.put(canisterId, updatedMetadata);
                                currentProgress := {
                                    total_tokens = currentProgress.total_tokens;
                                    processed_count = currentProgress.processed_count;
                                    updated_count = currentProgress.updated_count;
                                    skipped_count = currentProgress.skipped_count;
                                    failed_count = currentProgress.failed_count;
                                    is_running = currentProgress.is_running;
                                    last_processed = currentProgress.last_processed;
                                };
                            };
                        };
                    };
                } catch (e) {
                    currentProgress := {
                        total_tokens = currentProgress.total_tokens;
                        processed_count = currentProgress.processed_count;
                        updated_count = currentProgress.updated_count;
                        skipped_count = currentProgress.skipped_count;
                        failed_count = currentProgress.failed_count + 1;
                        is_running = currentProgress.is_running;
                        last_processed = currentProgress.last_processed;
                    };
                    Debug.print("Error updating logo for token " # Principal.toText(canisterId) # ": " # Error.message(e));
                };

                processed += 1;
                currentProgress := {
                    total_tokens = currentProgress.total_tokens;
                    processed_count = currentProgress.processed_count + 1;
                    updated_count = currentProgress.updated_count;
                    skipped_count = currentProgress.skipped_count;
                    failed_count = currentProgress.failed_count;
                    is_running = currentProgress.is_running;
                    last_processed = currentProgress.last_processed;
                };
                lastProcessed := ?canisterId;
                logoUpdateProgress := currentProgress;

                if (processed >= batchSize) {
                    break processing;
                };
            };

            // Schedule next batch if there are more tokens to process
            if (currentProgress.processed_count < currentProgress.total_tokens) {
                currentProgress := {
                    total_tokens = currentProgress.total_tokens;
                    processed_count = currentProgress.processed_count;
                    updated_count = currentProgress.updated_count;
                    skipped_count = currentProgress.skipped_count;
                    failed_count = currentProgress.failed_count;
                    is_running = currentProgress.is_running;
                    last_processed = lastProcessed;
                };
                logoUpdateProgress := currentProgress;
                ignore Timer.setTimer<system>(#seconds(1), processNextLogoBatch);
            } else {
                currentProgress := {
                    total_tokens = currentProgress.total_tokens;
                    processed_count = currentProgress.processed_count;
                    updated_count = currentProgress.updated_count;
                    skipped_count = currentProgress.skipped_count;
                    failed_count = currentProgress.failed_count;
                    is_running = currentProgress.is_running;
                    last_processed = currentProgress.last_processed;
                };
                logoUpdateProgress := currentProgress;
            };

        } catch (e) {
            Debug.print("Error in processNextLogoBatch: " # Error.message(e));
            logoUpdateProgress := {
                total_tokens = logoUpdateProgress.total_tokens;
                processed_count = logoUpdateProgress.processed_count;
                updated_count = logoUpdateProgress.updated_count;
                skipped_count = logoUpdateProgress.skipped_count;
                failed_count = logoUpdateProgress.failed_count;
                is_running = false;
                last_processed = logoUpdateProgress.last_processed;
            };
        };
    };


    // Get all tokens (custom tokens first, then whitelisted, then ICPSwap)
    public query func get_all_tokens() : async [(Principal, TokenMetadata)] {
        // Create a HashMap for deduplication and a Buffer for results
        var tokenSet = HashMap.HashMap<Principal, Bool>(100, Principal.equal, Principal.hash);
        let resultBuffer = Buffer.Buffer<(Principal, TokenMetadata)>(100);

        // Add whitelisted tokens with their metadata
        for ((principal, metadata) in tokenMetadata.entries()) {
            tokenSet.put(principal, true);
            resultBuffer.add((principal, metadata));
        };

        // Add ICPSwap tokens with their metadata if not already added
        for ((principal, metadata) in tokenMetadataICPSwap.entries()) {
            switch (tokenSet.get(principal)) {
                case (?true) { }; // Already seen this token
                case _ {
                    tokenSet.put(principal, true);
                    resultBuffer.add((principal, metadata));
                };
            };
        };

        Buffer.toArray(resultBuffer)
    };

    // Modify the type definition
    type PaginatedLogosResponse = {
        items: [(Principal, ?Text)]; // Only Principal and optional logo URL
        total: Nat;
        start_index: Nat;
    };

    // Helper function to estimate size of a logo entry
    private func estimateLogoEntrySize(principal: Principal, logo: ?Text) : Nat {
        let principalSize = 38; // Approximate size of Principal in bytes
        let logoSize = switch(logo) {
            case (null) 0;
            case (?l) l.size();
        };
        principalSize + logoSize
    };

    public query func get_paginated_logos(start_index: Nat) : async PaginatedLogosResponse {
        let totalLogos = tokenLogos.size();
        
        // Convert HashMap entries to array for pagination
        let allLogos = Iter.toArray(tokenLogos.entries());
        
        // Get the slice starting from start_index
        var currentSize : Nat = 0;
        let itemsBuffer = Buffer.Buffer<(Principal, ?Text)>(10);
        var hitSizeLimit = false;

        if (start_index < totalLogos) {
            label processing for (i in Iter.range(start_index, totalLogos - 1)) {
                let (principal, logo) = allLogos[i];
                let entrySize = estimateLogoEntrySize(principal, ?logo);
                
                // Check if adding this entry would exceed size limit
                if (currentSize + entrySize > MAX_RESPONSE_SIZE_BYTES and itemsBuffer.size() > 0) {
                    hitSizeLimit := true;
                    break processing;
                };
                
                // Add the entry and update size
                itemsBuffer.add((principal, ?logo));
                currentSize += entrySize;
            };
        };
        
        {
            items = Buffer.toArray(itemsBuffer);
            total = totalLogos;
            start_index = start_index;
        }
    };

    // Get the total number of cached logos
    public query func get_cached_logo_count() : async Nat {
        tokenLogos.size()
    };

    // Get the number of tokens in our ICPSwap copy
    public query func get_icpswap_token_count() : async Nat {
        tokenMetadataICPSwap.size()
    };

    // Clear the ICPSwap token list
    public shared({caller}) func clear_icpswap_tokens() : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        // Clear ICPSwap token metadata
        tokenMetadataICPSwap := HashMap.HashMap<Principal, TokenMetadata>(10, Principal.equal, Principal.hash);
        
        // Reset stable storage entries
        tokenMetadataEntriesICPSwap := [];

        Debug.print("ICPSwap token list cleared");
        #ok()
    };

    // Clear the logo cache
    public shared({caller}) func clear_logo_cache() : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        // Clear logo cache
        tokenLogos := HashMap.HashMap<Principal, Text>(10, Principal.equal, Principal.hash);
        
        // Reset stable storage entries for logos
        tokenLogoEntries := [];

        // Update hasLogo flag in all token metadata
        for ((principal, metadata) in tokenMetadata.entries()) {
            tokenMetadata.put(principal, {
                name = metadata.name;
                symbol = metadata.symbol;
                fee = metadata.fee;
                decimals = metadata.decimals;
                hasLogo = false;
                standard = metadata.standard;
            });
        };

        // Update hasLogo flag in ICPSwap token metadata
        for ((principal, metadata) in tokenMetadataICPSwap.entries()) {
            tokenMetadataICPSwap.put(principal, {
                name = metadata.name;
                symbol = metadata.symbol;
                fee = metadata.fee;
                decimals = metadata.decimals;
                hasLogo = false;
                standard = metadata.standard;
            });
        };

        Debug.print("Logo cache cleared");
        #ok()
    };

    // DIP20 interface
    type DIP20Interface = actor {
        getMetadata : shared query () -> async DIP20Metadata;
        name : shared query () -> async Text;
        symbol : shared query () -> async Text;
        decimals : shared query () -> async Nat8;
        fee : shared query () -> async Nat;
    };

    type DIP20Metadata = {
        logo: Text;
        name: Text;
        symbol: Text;
        decimals: Nat8;
        totalSupply: Nat;
        owner: Principal;
        fee: Nat;
    };

    // Refresh token metadata for a given token
    public shared({caller}) func refresh_token_metadata(ledger_id: Principal) : async Result.Result<TokenMetadata, Text> {
        Debug.print("Refreshing token metadata for " # Principal.toText(ledger_id));
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        await do_refresh_token_metadata(ledger_id);
    };

    private func do_refresh_token_metadata(ledger_id: Principal) : async Result.Result<TokenMetadata, Text> {
        Debug.print("Actually refreshing token metadata for " # Principal.toText(ledger_id));
        // First determine which map contains this token and get existing metadata
        let (sourceMap, existingMetadata) = switch (tokenMetadata.get(ledger_id)) {
            case (?metadata) { (#Whitelist, metadata) };
            case null {
                switch (tokenMetadataICPSwap.get(ledger_id)) {
                    case (?metadata) { (#ICPSwap, metadata) };
                    case null { return #err("Token not found in whitelist or ICPSwap copy"); };
                };
            };
        };

        try {
            if (Text.contains(Text.toLowercase(existingMetadata.standard), #text("dip20"))) {
                // DIP20 token, get metadata from DIP20
                let dip20Actor = actor(Principal.toText(ledger_id)) : DIP20Interface;
                let dip20Metadata = await dip20Actor.getMetadata();
                // If we get here, it's a DIP20 token
                var metadata : TokenMetadata = {
                    name = ?dip20Metadata.name;
                    symbol = ?dip20Metadata.symbol;
                    fee = ?dip20Metadata.fee;
                    decimals = ?dip20Metadata.decimals;
                    hasLogo = false; // Will be updated later if logo exists
                    standard = "DIP20";
                };

                // Check if we have a cached logo
                let hasExistingLogo = switch (tokenLogos.get(ledger_id)) {
                    case (?_) true;
                    case (null) false;
                };
                
                if (hasExistingLogo) {
                    metadata := {
                        name = metadata.name;
                        symbol = metadata.symbol;
                        fee = metadata.fee;
                        decimals = metadata.decimals;
                        hasLogo = true;
                        standard = metadata.standard;
                    };
                };


                let updatedMetadata : TokenMetadata = {
                    name = switch (metadata.name) {
                        case (?n) if (n == "") existingMetadata.name else metadata.name;
                        case null existingMetadata.name;
                    };
                    symbol = switch (metadata.symbol) {
                        case (?s) if (s == "") existingMetadata.symbol else metadata.symbol;
                        case null existingMetadata.symbol;
                    };
                    fee = metadata.fee;  // Always use the DIP20 fee value
                    decimals = switch (metadata.decimals) {
                        case (?d) if (d == 0) existingMetadata.decimals else metadata.decimals;
                        case null existingMetadata.decimals;
                    };
                    hasLogo = metadata.hasLogo;
                    standard = if (metadata.standard == "") existingMetadata.standard else metadata.standard;
                };
                
                // Check for discrepancies
                if (updatedMetadata.name != existingMetadata.name or 
                    updatedMetadata.symbol != existingMetadata.symbol or 
                    updatedMetadata.fee != existingMetadata.fee or 
                    updatedMetadata.decimals != existingMetadata.decimals or 
                    updatedMetadata.standard != existingMetadata.standard) {
                    metadataDiscrepancies := Array.append(metadataDiscrepancies, [{
                        ledger_id = ledger_id;
                        old_metadata = existingMetadata;
                        new_metadata = updatedMetadata;
                        timestamp = Time.now();
                    }]);
                };

                // Update the correct map
                switch (sourceMap) {
                    case (#Whitelist) tokenMetadata.put(ledger_id, updatedMetadata);
                    case (#ICPSwap) tokenMetadataICPSwap.put(ledger_id, updatedMetadata);
                };

                return #ok(updatedMetadata);                    
            } else {
                // ICRC1 token, get metadata from ICRC1
                let icrc1Actor = actor(Principal.toText(ledger_id)) : ICRC1Interface;
                let metadata = await icrc1Actor.icrc1_metadata();
                
                // First try to extract all values from metadata
                let nameFromMetadata = extractText(extractFromMetadata(metadata, "icrc1:name"));
                let symbolFromMetadata = extractText(extractFromMetadata(metadata, "icrc1:symbol"));
                let feeFromMetadata = extractNat(extractFromMetadata(metadata, "icrc1:fee"));
                let decimalsFromMetadata = switch (extractFromMetadata(metadata, "icrc1:decimals")) {
                    case (?#Nat8(d)) ?d;
                    case (_) null;
                };

                // Only make individual calls if metadata didn't have the values
                let name = switch (nameFromMetadata) {
                    case (?n) ?n;
                    case (null) switch (await icrc1Actor.icrc1_name()) {
                        case (?n) ?n;
                        case (null) null;
                    };
                };

                let symbol = switch (symbolFromMetadata) {
                    case (?s) ?s;
                    case (null) switch (await icrc1Actor.icrc1_symbol()) {
                        case (?s) ?s;
                        case (null) null;
                    };
                };

                let fee = switch (feeFromMetadata) {
                    case (?f) ?f;
                    case (null) switch (await icrc1Actor.icrc1_fee()) {
                        case (?f) ?f;
                        case (null) null;
                    };
                };

                let decimals = switch (decimalsFromMetadata) {
                    case (?d) ?d;
                    case (null) switch (await icrc1Actor.icrc1_decimals()) {
                        case (?d) ?d;
                        case (null) null;
                    };
                };

                // Check supported standards
                var standard = "ICRC1";
                try {
                    let standards = await icrc1Actor.icrc1_supported_standards();
                    for (std in standards.vals()) {
                        if (std.name == "ICRC-2") {
                            standard := "ICRC2";
                        };
                    };
                } catch (e) {
                    // If icrc1_supported_standards fails, keep existing standard if available
                    let existingMetadata = switch (sourceMap) {
                        case (#Whitelist) tokenMetadata.get(ledger_id);
                        case (#ICPSwap) tokenMetadataICPSwap.get(ledger_id);
                    };
                    switch (existingMetadata) {
                        case (?existing) { standard := existing.standard; };
                        case null { standard := "ICRC1"; };  // Default to ICRC1 only if no existing metadata
                    };
                };

                // Check if we have a cached logo
                let hasExistingLogo = switch (tokenLogos.get(ledger_id)) {
                    case (?_) true;
                    case (null) false;
                };

                let newMetadata : TokenMetadata = {
                    name = name;
                    symbol = symbol;
                    fee = fee;
                    decimals = decimals;
                    hasLogo = hasExistingLogo;
                    standard = standard;
                };

                let updatedMetadata : TokenMetadata = {
                    name = switch (newMetadata.name) {
                        case (?n) if (n == "") existingMetadata.name else newMetadata.name;
                        case null existingMetadata.name;
                    };
                    symbol = switch (newMetadata.symbol) {
                        case (?s) if (s == "") existingMetadata.symbol else newMetadata.symbol;
                        case null existingMetadata.symbol;
                    };
                    fee = newMetadata.fee;  // Always use the new fee value
                    decimals = switch (newMetadata.decimals) {
                        case (?d) if (d == 0) existingMetadata.decimals else newMetadata.decimals;
                        case null existingMetadata.decimals;
                    };
                    hasLogo = newMetadata.hasLogo;
                    standard = if (newMetadata.standard == "") existingMetadata.standard else newMetadata.standard;
                };
                
                // Check for discrepancies
                if (updatedMetadata.name != existingMetadata.name or 
                    updatedMetadata.symbol != existingMetadata.symbol or 
                    updatedMetadata.fee != existingMetadata.fee or 
                    updatedMetadata.decimals != existingMetadata.decimals or 
                    updatedMetadata.standard != existingMetadata.standard) {
                    metadataDiscrepancies := Array.append(metadataDiscrepancies, [{
                        ledger_id = ledger_id;
                        old_metadata = existingMetadata;
                        new_metadata = updatedMetadata;
                        timestamp = Time.now();
                    }]);
                };
                
                // Update the correct map
                switch (sourceMap) {
                    case (#Whitelist) tokenMetadata.put(ledger_id, updatedMetadata);
                    case (#ICPSwap) tokenMetadataICPSwap.put(ledger_id, updatedMetadata);
                };

                return #ok(updatedMetadata);
            }
        } catch (e) {
            return #err("Failed to refresh token metadata: " # Error.message(e));
        };
    };

    // Start metadata refresh process
    public shared({caller}) func start_metadata_refresh(batch_size: Nat) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (metadataRefreshProgress.is_running) {
            return #err("Metadata refresh already in progress");
        };

        // Reset progress
        metadataRefreshProgress := {
            total_tokens = tokenMetadataICPSwap.size();
            processed_count = 0;
            updated_count = 0;
            skipped_count = 0;
            failed_count = 0;
            is_running = true;
            last_processed = null;
        };

        // Start the first batch
        nextMetadataBatchSize := ?batch_size;
        ignore Timer.setTimer<system>(#seconds(0), processNextMetadataBatch);
        #ok()
    };

    // Resume metadata refresh process from last processed token
    public shared({caller}) func resume_metadata_refresh(batch_size: Nat) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (metadataRefreshProgress.is_running) {
            return #err("Metadata refresh already in progress");
        };

        // Keep existing progress but set is_running to true
        metadataRefreshProgress := {
            total_tokens = tokenMetadataICPSwap.size();
            processed_count = metadataRefreshProgress.processed_count;
            updated_count = metadataRefreshProgress.updated_count;
            skipped_count = metadataRefreshProgress.skipped_count;
            failed_count = metadataRefreshProgress.failed_count;
            is_running = true;
            last_processed = metadataRefreshProgress.last_processed;
        };

        // Start the next batch
        nextMetadataBatchSize := ?batch_size;
        ignore Timer.setTimer<system>(#seconds(0), processNextMetadataBatch);
        #ok()
    };

    // Get current metadata refresh progress
    public query func get_metadata_refresh_progress() : async MetadataRefreshProgress {
        metadataRefreshProgress
    };

    // Get metadata discrepancies
    public query func get_metadata_discrepancies() : async [MetadataDiscrepancy] {
        metadataDiscrepancies
    };

    // Clear metadata discrepancies
    public func clear_metadata_discrepancies() : async () {
        metadataDiscrepancies := [];
    };

    // Stop an in-progress metadata refresh
    public shared({caller}) func stop_metadata_refresh() : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        if (not metadataRefreshProgress.is_running) {
            return #err("No metadata refresh in progress");
        };

        // Fully reset progress when stopping
        metadataRefreshProgress := {
            total_tokens = 0;
            processed_count = 0;
            updated_count = 0;
            skipped_count = 0;
            failed_count = 0;
            is_running = false;
            last_processed = null;  // Reset last_processed to ensure fresh start
        };

        #ok()
    };

    // Process next batch of tokens for metadata refresh
    private func processNextMetadataBatch<system>() : async () {
        try {
            let batchSize = switch (nextMetadataBatchSize) {
                case (?size) size;
                case null return;
            };

            if (not metadataRefreshProgress.is_running) {
                return;
            };

            var currentProgress : MetadataRefreshProgress = metadataRefreshProgress;
            var processedInBatch : Nat = 0;
            var lastProcessed : ?Principal = null;
            var foundLastProcessed = currentProgress.last_processed == null;

            label batchLoop for ((canisterId, metadata) in tokenMetadataICPSwap.entries()) {
                // If we haven't found the last processed token yet, keep searching
                if (not foundLastProcessed) {
                    switch (currentProgress.last_processed) {
                        case (?lastId) {
                            if (Principal.equal(lastId, canisterId)) {
                                foundLastProcessed := true;
                            };
                            continue batchLoop;
                        };
                        case null {
                            foundLastProcessed := true;
                        };
                    };
                };

                // Process this token
                lastProcessed := ?canisterId;
                currentProgress := {
                    total_tokens = currentProgress.total_tokens;
                    processed_count = currentProgress.processed_count + 1;
                    updated_count = currentProgress.updated_count;
                    skipped_count = currentProgress.skipped_count;
                    failed_count = currentProgress.failed_count;
                    is_running = currentProgress.is_running;
                    last_processed = ?canisterId;
                };

                try {
                    // Try to refresh the token's metadata
                    let refreshResult = await do_refresh_token_metadata(canisterId);
                    switch (refreshResult) {
                        case (#ok(_)) {
                            currentProgress := {
                                total_tokens = currentProgress.total_tokens;
                                processed_count = currentProgress.processed_count;
                                updated_count = currentProgress.updated_count + 1;
                                skipped_count = currentProgress.skipped_count;
                                failed_count = currentProgress.failed_count;
                                is_running = currentProgress.is_running;
                                last_processed = ?canisterId;
                            };
                        };
                        case (#err(errorMsg)) {
                            Debug.print("Failed to refresh token " # Principal.toText(canisterId) # ": " # errorMsg);
                            currentProgress := {
                                total_tokens = currentProgress.total_tokens;
                                processed_count = currentProgress.processed_count;
                                updated_count = currentProgress.updated_count;
                                skipped_count = currentProgress.skipped_count;
                                failed_count = currentProgress.failed_count + 1;
                                is_running = currentProgress.is_running;
                                last_processed = ?canisterId;
                            };
                        };
                    };
                } catch (e) {
                    Debug.print("Error refreshing token " # Principal.toText(canisterId) # ": " # Error.message(e));
                    currentProgress := {
                        total_tokens = currentProgress.total_tokens;
                        processed_count = currentProgress.processed_count;
                        updated_count = currentProgress.updated_count;
                        skipped_count = currentProgress.skipped_count;
                        failed_count = currentProgress.failed_count + 1;
                        is_running = currentProgress.is_running;
                        last_processed = ?canisterId;
                    };
                };

                processedInBatch += 1;
                if (processedInBatch >= batchSize) {
                    break batchLoop;
                };
            };

            // Update progress and schedule next batch if needed
            if (currentProgress.processed_count < currentProgress.total_tokens) {
                currentProgress := {
                    total_tokens = currentProgress.total_tokens;
                    processed_count = currentProgress.processed_count;
                    updated_count = currentProgress.updated_count;
                    skipped_count = currentProgress.skipped_count;
                    failed_count = currentProgress.failed_count;
                    is_running = currentProgress.is_running;
                    last_processed = lastProcessed;
                };
                metadataRefreshProgress := currentProgress;
                ignore Timer.setTimer<system>(#seconds(1), processNextMetadataBatch);
            } else {
                currentProgress := {
                    total_tokens = currentProgress.total_tokens;
                    processed_count = currentProgress.processed_count;
                    updated_count = currentProgress.updated_count;
                    skipped_count = currentProgress.skipped_count;
                    failed_count = currentProgress.failed_count;
                    is_running = currentProgress.is_running;
                    last_processed = currentProgress.last_processed;
                };
                metadataRefreshProgress := currentProgress;
            };
        } catch (e) {
            Debug.print("Error in processNextMetadataBatch: " # Error.message(e));
            metadataRefreshProgress := {
                total_tokens = metadataRefreshProgress.total_tokens;
                processed_count = metadataRefreshProgress.processed_count;
                updated_count = metadataRefreshProgress.updated_count;
                skipped_count = metadataRefreshProgress.skipped_count;
                failed_count = metadataRefreshProgress.failed_count;
                is_running = false;
                last_processed = metadataRefreshProgress.last_processed;
            };
        };
    };

    // Wallet feature: Add token to user's wallet
    public shared(msg) func add_wallet_token(token_canister_id: Text) : async Bool {
        // Verify caller is authenticated
        let caller = msg.caller;
        if (Principal.isAnonymous(caller)) {
            throw Error.reject("Caller must be authenticated");
        };

        let tokenPrincipal = Principal.fromText(token_canister_id);
        let tokenIndex = getOrCreateUserIndex(tokenPrincipal);

        // Check if token exists in any of our token lists
        let tokenExists = switch (tokenMetadata.get(tokenPrincipal)) {
            case (?_) true;  // Token exists in whitelist
            case null {
                switch (tokenMetadataICPSwap.get(tokenPrincipal)) {
                    case (?_) true;  // Token exists in ICPSwap list
                    case null {
                        switch (customTokenMetadata.get(tokenPrincipal)) {
                            case (?_) true;  // Token exists in custom tokens
                            case null false;  // Token doesn't exist anywhere
                        };
                    };
                };
            };
        };

        if (not tokenExists) {
            throw Error.reject("Token not found in any supported token list");
        };

        // Get or initialize user's wallet tokens
        var userTokens = switch (userWalletTokens.get(caller)) {
            case (?tokens) tokens;
            case null [];
        };

        // Check if token is already in wallet
        let exists = Array.find<Nat16>(userTokens, func(idx) = idx == tokenIndex);
        switch (exists) {
            case (?_) return false; // Token already in wallet
            case null {
                // Add token to wallet
                userTokens := Array.append<Nat16>(userTokens, [tokenIndex]);
                userWalletTokens.put(caller, userTokens);
                return true;
            };
        };
    };

    // Wallet feature: Remove token from user's wallet
    public shared(msg) func remove_wallet_token(token_canister_id: Text) : async Bool {
        // Verify caller is authenticated
        let caller = msg.caller;
        if (Principal.isAnonymous(caller)) {
            throw Error.reject("Caller must be authenticated");
        };

        let tokenPrincipal = Principal.fromText(token_canister_id);
        let tokenIndex = getOrCreateUserIndex(tokenPrincipal);

        // Get user's wallet tokens
        switch (userWalletTokens.get(caller)) {
            case (?tokens) {
                // Filter out the token
                let newTokens = Array.filter<Nat16>(tokens, func(idx) = idx != tokenIndex);
                
                // Only update if token was actually removed
                if (newTokens.size() != tokens.size()) {
                    userWalletTokens.put(caller, newTokens);
                    return true;
                };
            };
            case null {};
        };
        return false;
    };

    // Wallet feature: Get user's wallet tokens
    public query(msg) func get_wallet_tokens() : async [Text] {
        // Verify caller is authenticated
        let caller = msg.caller;
        if (Principal.isAnonymous(caller)) {
            throw Error.reject("Caller must be authenticated");
        };

        // Create a HashMap for deduplication
        let tokenSet = HashMap.HashMap<Principal, Bool>(10, Principal.equal, Principal.hash);
        let resultBuffer = Buffer.Buffer<Principal>(10);

        // Always add ICP first
        tokenSet.put(ICP_PRINCIPAL, true);
        resultBuffer.add(ICP_PRINCIPAL);

        // Add wallet tokens if not already present
        switch (userWalletTokens.get(caller)) {
            case (?tokenIndexes) {
                for (tokenIndex in tokenIndexes.vals()) {
                    switch (indexToPrincipal.get(tokenIndex)) {
                        case (?principal) {
                            switch (tokenSet.get(principal)) {
                                case (null) {
                                    tokenSet.put(principal, true);
                                    resultBuffer.add(principal);
                                };
                                case (_) {}; // Token already exists
                            };
                        };
                        case (null) {}; // Invalid index, skip it
                    };
                };
            };
            case (null) {};
        };

        // Add custom tokens if not already present
        switch (userCustomTokens.get(caller)) {
            case (?tokens) {
                for (token in tokens.vals()) {
                    switch (tokenSet.get(token)) {
                        case (null) {
                            tokenSet.put(token, true);
                            resultBuffer.add(token);
                        };
                        case (_) {}; // Token already exists
                    };
                };
            };
            case (null) {};
        };

        // Convert to Text array
        return Array.map<Principal, Text>(Buffer.toArray(resultBuffer), Principal.toText);
    };

    // User index mapping methods
    private func getOrCreateUserIndex(principal: Principal) : Nat16 {
        switch (principalToIndex.get(principal)) {
            case (?index) { index };
            case null {
                let index = nextUserIndex;
                nextUserIndex += 1;
                principalToIndex.put(principal, index);
                indexToPrincipal.put(index, principal);
                index
            };
        }
    };

    private func getUserIndex(principal: Principal) : async Nat16 {
        getOrCreateUserIndex(principal)
    };

    private func getPrincipalByIndex(index: Nat16) : async Result.Result<Principal, Text> {
        switch (indexToPrincipal.get(index)) {
            case (?principal) { #ok(principal) };
            case null { #err("No principal found for index: " # Nat16.toText(index)) };
        }
    };

    public query func get_next_user_index() : async Nat16 {
        nextUserIndex
    };

    public shared({caller}) func add_pool(pool_canister_id: Principal) : async Result.Result<(), Text> {
        await add_pool_impl(caller, pool_canister_id);
    };

    public shared func add_pool_for(user: Principal, pool_canister_id: Principal) : async Result.Result<(), Text> {
        await add_pool_impl(user, pool_canister_id);
    };

    // Pool management methods
    private func add_pool_impl(caller: Principal, pool_canister_id: Principal) : async Result.Result<(), Text> {
        // Verify caller is authenticated
        if (Principal.isAnonymous(caller)) {
            return #err("Authentication required");
        };

        // Check if we already have metadata for this pool
        switch (poolMetadata.get(pool_canister_id)) {
            case (?_existing) {
                // Pool metadata exists, proceed with adding to user's list
            };
            case null {
                // Need to fetch metadata from pool
                try {
                    let poolActor : ICPSwapPoolInterface = actor(Principal.toText(pool_canister_id));
                    let response = await poolActor.metadata();
                    
                    switch (response) {
                        case (#ok(metadata)) {
                            // Store only the fields we need in our pruned PoolMetadata
                            let prunedMetadata : PoolMetadata = {
                                fee = metadata.fee;
                                key = metadata.key;
                                token0 = metadata.token0;
                                token1 = metadata.token1;
                            };
                            poolMetadata.put(pool_canister_id, prunedMetadata);
                        };
                        case (#err(e)) {
                            return #err("Failed to fetch pool metadata: " # e.message);
                        };
                    };
                } catch (e) {
                    return #err("Error calling pool metadata: " # Error.message(e));
                };
            };
        };

        // Get pool index
        let poolIndex = getOrCreateUserIndex(pool_canister_id);

        // Get or initialize user's pools
        var userPoolsList = switch (userPools.get(caller)) {
            case (?pools) pools;
            case null [];
        };

        // Check if pool is already in user's list
        let exists = Array.find<Nat16>(userPoolsList, func(idx) = idx == poolIndex);
        switch (exists) {
            case (?_) return #err("Pool already in user's list");
            case null {
                // Add pool to user's list
                userPoolsList := Array.append<Nat16>(userPoolsList, [poolIndex]);
                userPools.put(caller, userPoolsList);
                #ok()
            };
        };
    };

    public shared({caller}) func remove_pool(pool_canister_id: Principal) : async Result.Result<(), Text> {
        // Verify caller is authenticated
        if (Principal.isAnonymous(caller)) {
            return #err("Authentication required");
        };

        // Get pool index
        let poolIndex = getOrCreateUserIndex(pool_canister_id);

        // Get user's pools
        switch (userPools.get(caller)) {
            case (?pools) {
                // Filter out the pool
                let newPools = Array.filter<Nat16>(pools, func(idx) = idx != poolIndex);
                
                // Only update if pool was actually removed
                if (newPools.size() != pools.size()) {
                    userPools.put(caller, newPools);
                    #ok()
                } else {
                    #err("Pool not found in user's list")
                };
            };
            case null #err("No pools found for user");
        };
    };

    public query({caller}) func get_user_pools() : async [{
        canisterId: Principal;
        metadata: ?PoolMetadata;
    }] {
        // Verify caller is authenticated
        if (Principal.isAnonymous(caller)) {
            return [];
        };

        // Get user's pools
        switch (userPools.get(caller)) {
            case (?poolIndexes) {
                // Map pool indexes to principals and metadata
                Array.mapFilter<Nat16, {
                    canisterId: Principal;
                    metadata: ?PoolMetadata;
                }>(poolIndexes, func(idx) {
                    switch (indexToPrincipal.get(idx)) {
                        case (?principal) {
                            ?{
                                canisterId = principal;
                                metadata = poolMetadata.get(principal);
                            }
                        };
                        case null null;
                    };
                });
            };
            case null [];
        };
    };

    public query func get_pool_metadata(pool_canister_id: Principal) : async ?PoolMetadata {
        poolMetadata.get(pool_canister_id)
    };

    public shared({caller}) func update_pool_metadata(pool_canister_id: Principal, metadata: PoolMetadata) : async Result.Result<(), Text> {
        if (not isAdmin(caller)) {
            return #err("Unauthorized: Caller is not an admin");
        };

        poolMetadata.put(pool_canister_id, metadata);
        #ok()
    };
}
