import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import TrieMap "mo:base/TrieMap";
import Nat8 "mo:base/Nat8";
import Int "mo:base/Int";
import HashMap "mo:base/HashMap";

module {

    //--------------------------------  
    // Types for Main module
    //--------------------------------

    // Types
    public type TokenMetadata = {
        name: ?Text;
        symbol: ?Text;
        fee: ?Nat;
        decimals: ?Nat8;
        hasLogo: Bool;
        standard: Text;
    };

    public type PoolMetadata = {
        fee: Nat;
        key: Text;
        token0: Token;
        token1: Token;
    };

    public type Token = {
        address: Text;
        standard: Text;
    };

    public type ICPSwapPoolInterface = actor {
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

    public type FetchMetadataResult = {
        name: ?Text;
        symbol: ?Text;
        fee: ?Nat;
        decimals: ?Nat8;
        hasLogo: Bool;
        foundLogo: ?Text;
        standard: Text;
    };

    public type AddTokenArgs = {
        canisterId: Principal;
        metadata: TokenMetadata;
        logo: ?Text;
    };

    // Statistics types
    public type GlobalStats = {
        total_swaps: Nat;
        icpswap_swaps: Nat;
        kong_swaps: Nat;
        split_swaps: Nat;
        total_sends: Nat;           // New: Track total successful sends
        total_deposits: Nat;        // New: Track total successful ICPSwap deposits
        total_withdrawals: Nat;     // New: Track total successful ICPSwap withdrawals
    };

    public type TokenStats = {
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

    // New: Track savings per token
    public type TokenSavingsStats = {
        icpswap_savings_e8s: Nat;  // Amount saved when using ICPSwap vs Kong
        kong_savings_e8s: Nat;     // Amount saved when using Kong vs ICPSwap
        split_savings_e8s: Nat;    // Amount saved when using split vs best direct
    };

    public type UserStats = {
        total_swaps: Nat;
        icpswap_swaps: Nat;
        kong_swaps: Nat;
        split_swaps: Nat;
        total_sends: Nat;           // New: Track sends by this user
        total_deposits: Nat;        // New: Track deposits by this user
        total_withdrawals: Nat;     // New: Track withdrawals by this user
    };

    // ICRC-1 interfaces
    public type MetadataValue = {
        #Text : Text;
        #Nat : Nat;
        #Nat8 : Nat8;
        #Int : Int;
        #Map : [(Text, MetadataValue)];
    };

    public type ICRC1Metadata = [(Text, MetadataValue)];

    public type StandardRecord = {
        url: Text;
        name: Text;
    };

    public type ICRC1Interface = actor {
        icrc1_metadata : shared query () -> async ICRC1Metadata;
        icrc1_name : shared query () -> async ?Text;
        icrc1_symbol : shared query () -> async ?Text;
        icrc1_fee : shared query () -> async ?Nat;
        icrc1_decimals : shared query () -> async ?Nat8;
        icrc1_supported_standards : shared query () -> async [StandardRecord];
    };

    public type Account = {
        owner: Principal;
        subaccount: ?[Nat8];
    };

    public type TransferArgs = {
        from_subaccount: ?[Nat8];
        to: Account;
        amount: Nat;
        fee: ?Nat;
        memo: ?[Nat8];
        created_at_time: ?Nat64;
    };

    public type TransferError = {
        #BadFee: { expected_fee: Nat };
        #BadBurn: { min_burn_amount: Nat };
        #InsufficientFunds: { balance: Nat };
        #TooOld;
        #CreatedInFuture: { ledger_time: Nat64 };
        #Duplicate: { duplicate_of: Nat };
        #TemporarilyUnavailable;
        #GenericError: { error_code: Nat; message: Text };
    };

    public type ICPSwapInterface = actor {
        getLogo : shared query (Text) -> async {#ok : Text; #err : Text};
    };

    // Types for ICPSwap List
    public type Config = {
        name: Text;
        value: Text;
    };

    public type Media = {
        link: Text;
        mediaType: Text;
    };

    public type ICPSwapToken = {
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

    public type GetListResult = {
        #ok: [ICPSwapToken];
        #err: Text;
    };

    public type ICPSwapListInterface = actor {
        getList : shared query () -> async GetListResult;
        getLogo : shared query (Text) -> async Result.Result<Text, Text>;
    };

    // Import progress tracking
    public type ImportProgress = {
        last_processed: ?Text;
        total_tokens: Nat;
        processed_count: Nat;
        imported_count: Nat;
        skipped_count: Nat;
        failed_count: Nat;
        is_running: Bool;
    };

    // User-Token statistics type
    public type UserTokenStats = {
        // Input stats by swap type
        swaps_as_input_icpswap: Nat;
        swaps_as_input_kong: Nat;
        swaps_as_input_split: Nat;
        input_volume_e8s_icpswap: Nat;  // Volume sent when used as input
        input_volume_e8s_kong: Nat;
        input_volume_e8s_split: Nat;

        // Output stats by swap type
        swaps_as_output_icpswap: Nat;
        swaps_as_output_kong: Nat;
        swaps_as_output_split: Nat;
        output_volume_e8s_icpswap: Nat;  // Volume received when used as output
        output_volume_e8s_kong: Nat;
        output_volume_e8s_split: Nat;

        // Savings stats
        savings_as_output_icpswap_e8s: Nat; // Amount saved when using ICPSwap vs Kong for output
        savings_as_output_kong_e8s: Nat;    // Amount saved when using Kong vs ICPSwap for output
        savings_as_output_split_e8s: Nat;   // Amount saved when using split vs best direct for output

        // Other operations (unchanged)
        total_sends: Nat;
        total_deposits: Nat;
        total_withdrawals: Nat;
    };


    // Add new type for metadata refresh progress
    public type MetadataRefreshProgress = {
        total_tokens: Nat;
        processed_count: Nat;
        updated_count: Nat;
        skipped_count: Nat;
        failed_count: Nat;
        is_running: Bool;
        last_processed: ?Principal;
    };

    // Add type for metadata discrepancies
    public type MetadataDiscrepancy = {
        ledger_id: Principal;
        old_metadata: TokenMetadata;
        new_metadata: TokenMetadata;
        timestamp: Int;
    };

    // Modify the return type to include logo
    public type RegisterTokenResponse = {
        metadata: TokenMetadata;
        logo: ?Text;
    };


    // Modify the type definition
    public type PaginatedLogosResponse = {
        items: [(Principal, ?Text)]; // Only Principal and optional logo URL
        total: Nat;
        start_index: Nat;
    };


    // DIP20 interface
    public type DIP20Interface = actor {
        getMetadata : shared query () -> async DIP20Metadata;
        name : shared query () -> async Text;
        symbol : shared query () -> async Text;
        decimals : shared query () -> async Nat8;
        fee : shared query () -> async Nat;
    };

    public type DIP20Metadata = {
        logo: Text;
        name: Text;
        symbol: Text;
        decimals: Nat8;
        totalSupply: Nat;
        owner: Principal;
        fee: Nat;
    };

    // Named subaccount types
    public type NamedSubaccount = {
        name: Text;
        subaccount: [Nat8];  // 32-byte array
        created_at: Int;     // Timestamp when created
    };

    public type UserTokenSubaccounts = {
        token_id: Principal;
        subaccounts: [NamedSubaccount];
    };

    public type AddSubaccountArgs = {
        token_id: Principal;
        name: Text;
        subaccount: [Nat8];
    };

    public type RemoveSubaccountArgs = {
        token_id: Principal;
        subaccount: [Nat8];
    };

    public type WithdrawSubaccountArgs = {
        token_id: Principal;
        subaccount: [Nat8];
        amount_e8s: ?Nat;  // If null, withdraw entire balance
    };

    //--------------------------------  
    // Types for Achievement module
    //--------------------------------

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
        parameters: [{  // Now an array of variants
            #Principal: Principal;
            #Nat: Nat;
            #Text: Text;
        }];
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
        achievements: HashMap.HashMap<Text, Achievement>;
        conditions: HashMap.HashMap<Text, Condition>;
        global_stats: GlobalStats;
        token_stats: HashMap.HashMap<Text, TokenStats>;
        user_achievements: HashMap.HashMap<Text, [UserAchievement]>;
        user_stats: HashMap.HashMap<Text, UserStats>;
        user_token_stats: HashMap.HashMap<Text, UserTokenStats>;
    };

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

}