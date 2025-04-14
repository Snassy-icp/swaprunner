import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

module {
    public type Value = {
        #Nat : Nat;
        #Int : Int;
        #Text : Text;
        #Blob : Blob;
        #Array : [Value];
        #Map : [(Text, Value)];
    };

    public type Block = {
        transaction: Value;
        timestamp: Int;
        parent_hash: ?[Nat8];
        hash: [Nat8];
    };

    public type GetTransactionsRequest = {
        start : Nat;
        length : Nat;
    };

    public type GetTransactionsResponse = {
        log_length : Nat;
        blocks : [Block];
        archived_blocks : [{
            start : Nat;
            length : Nat;
            callback : shared query GetTransactionsRequest -> async GetTransactionsResponse;
        }];
    };

    public type Interface = actor {
        get_transactions : shared query GetTransactionsRequest -> async GetTransactionsResponse;
    };
}
