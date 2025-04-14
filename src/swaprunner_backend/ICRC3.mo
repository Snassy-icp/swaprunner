import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Array "mo:base/Array";

module {
    public type Value = {
        #Map: [(Text, Value)];
        #Text: Text;
        #Nat: Nat;
        #Int: Int;
        #Blob: Blob;
        #Array: [Value];
        #Null;
    };

    public type Block = {
        id: Nat;
        block: Value;
    };

    public type GetBlocksResult = {
        log_length: Nat;
        blocks: [Block];
        archived_blocks: [(Nat, [Block])];
    };

    public type State = {
        var log_length: Nat;
        var blocks: [Block];
        var archived_blocks: [(Nat, [Block])];
    };

    public type ArchiveIndexType = {
        #Stable;
    };

    public type Config = {
        maxActiveRecords: Nat;
        settleToRecords: Nat;
        maxRecordsInArchiveInstance: Nat;
        maxArchivePages: Nat;
        archiveIndexType: ArchiveIndexType;
        maxRecordsToArchive: Nat;
        archiveCycles: Nat;
        archiveControllers: ?[Principal];
    };

    public func initialState() : State {
        {
            var log_length = 0;
            var blocks = [];
            var archived_blocks = [];
        }
    };

    public class ICRC3(
        initial_state: ?State,
        config: Config,
        canister_id: Principal
    ) {
        private var state: State = switch(initial_state) {
            case (?s) s;
            case null initialState();
        };

        public func append(block: Value) : Nat {
            let id = state.log_length;
            state.blocks := Array.append(state.blocks, [{id; block}]);
            state.log_length += 1;
            id
        };

        public func get_blocks(ranges: [{start: Nat; length: Nat}]) : GetBlocksResult {
            {
                log_length = state.log_length;
                blocks = state.blocks;
                archived_blocks = state.archived_blocks;
            }
        };

        public func get_log_length() : Nat {
            state.log_length
        };
    };
}
