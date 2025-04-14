import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Error "mo:base/Error";
import Hash "mo:base/Hash";
import Int "mo:base/Int";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Option "mo:base/Option";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import ICRC3 "ICRC3";
import Types "Types";

actor class Archive() {
    // Stable storage for event IDs
    private stable var next_event_id : Nat = 0;

    // Stable storage for completed and inflight events
    private stable var stable_storage : {
        completed_events : [(Nat, Types.Event)];
        inflight_events : [(Nat, Types.Event)];
    } = {
        completed_events = [];
        inflight_events = [];
    };

    // Runtime storage
    private var completed_events = TrieMap.fromEntries<Nat, Types.Event>(
        Iter.fromArray(stable_storage.completed_events), 
        Nat.equal, 
        Hash.hash
    );
    private var inflight_events = TrieMap.fromEntries<Nat, Types.Event>(
        Iter.fromArray(stable_storage.inflight_events),
        Nat.equal,
        Hash.hash
    );

    // System functions
    system func preupgrade() {
        stable_storage := {
            completed_events = Iter.toArray(completed_events.entries());
            inflight_events = Iter.toArray(inflight_events.entries());
        };
    };

    system func postupgrade() {
        stable_storage := {
            completed_events = [];
            inflight_events = [];
        };
    };

    // Helper functions
    private func generateEventId() : Nat {
        let id = next_event_id;
        next_event_id += 1;
        id
    };

    private func getCurrentTime() : Int {
        Time.now()
    };

    // Event logging functions
    public shared(msg) func logSwapStarted(
        input_token: Types.TokenValue,
        output_token: Types.TokenValue,
        dex: Text,
        parent_event: ?Nat
    ) : async Nat {
        let event_id = generateEventId();
        let event : Types.Event = {
            id = event_id;
            event_type = #SwapStarted;
            timestamp = getCurrentTime();
            user = msg.caller;
            details = #Swap({
                input_token = input_token;
                output_token = output_token;
                dex = dex;
                error_message = null;
            });
            parent_event = parent_event;
            child_events = [];
        };
        inflight_events.put(event_id, event);
        event_id
    };

    public shared(msg) func logSwapCompleted(
        event_id: Nat,
        input_token: Types.TokenValue,
        output_token: Types.TokenValue,
        dex: Text
    ) : async () {
        switch (inflight_events.get(event_id)) {
            case (?event) {
                let completed_event : Types.Event = {
                    id = event.id;
                    event_type = #SwapCompleted;
                    timestamp = getCurrentTime();
                    user = event.user;
                    details = #Swap({
                        input_token = input_token;
                        output_token = output_token;
                        dex = dex;
                        error_message = null;
                    });
                    parent_event = event.parent_event;
                    child_events = event.child_events;
                };
                completed_events.put(event_id, completed_event);
                inflight_events.delete(event_id);
                
                // Update parent event's child events if it exists
                switch (event.parent_event) {
                    case (?parent_id) {
                        switch (inflight_events.get(parent_id)) {
                            case (?parent_event) {
                                let updated_parent : Types.Event = {
                                    parent_event with
                                    child_events = Array.append(parent_event.child_events, [event_id]);
                                };
                                inflight_events.put(parent_id, updated_parent);
                            };
                            case null {};
                        };
                    };
                    case null {};
                };
            };
            case null {
                throw Error.reject("Event not found");
            };
        };
    };

    public shared(msg) func logSwapFailed(
        event_id: Nat,
        input_token: Types.TokenValue,
        output_token: Types.TokenValue,
        dex: Text,
        error_message: Text
    ) : async () {
        switch (inflight_events.get(event_id)) {
            case (?event) {
                let failed_event : Types.Event = {
                    id = event.id;
                    event_type = #SwapFailed;
                    timestamp = getCurrentTime();
                    user = event.user;
                    details = #Swap({
                        input_token = input_token;
                        output_token = output_token;
                        dex = dex;
                        error_message = ?error_message;
                    });
                    parent_event = event.parent_event;
                    child_events = event.child_events;
                };
                completed_events.put(event_id, failed_event);
                inflight_events.delete(event_id);
            };
            case null {
                throw Error.reject("Event not found");
            };
        };
    };

    // Split swap logging functions
    public shared(msg) func logSplitSwapStarted(
        input_token: Types.TokenValue,
        icpswap_output_token: Types.TokenValue,
        kong_output_token: Types.TokenValue,
        icpswap_ratio: Float,
        kong_ratio: Float
    ) : async Nat {
        let event_id = generateEventId();
        let event : Types.Event = {
            id = event_id;
            event_type = #SplitSwapStarted;
            timestamp = getCurrentTime();
            user = msg.caller;
            details = #SplitSwap({
                input_token = input_token;
                icpswap_output_token = icpswap_output_token;
                kong_output_token = kong_output_token;
                icpswap_ratio = icpswap_ratio;
                kong_ratio = kong_ratio;
                error_message = null;
            });
            parent_event = null;
            child_events = [];
        };
        inflight_events.put(event_id, event);
        event_id
    };

    // Query methods
    public query func getEvent(id: Nat) : async ?Types.Event {
        completed_events.get(id)
    };

    public query func getInflightEvent(id: Nat) : async ?Types.Event {
        inflight_events.get(id)
    };

    public query func getUserEvents(user: Principal) : async [Types.Event] {
        let events = Buffer.Buffer<Types.Event>(0);
        for ((_, event) in completed_events.entries()) {
            if (Principal.equal(event.user, user)) {
                events.add(event);
            };
        };
        Buffer.toArray(events)
    };

    // ICRC3 interface implementation
    public query func get_transactions(request: ICRC3.GetTransactionsRequest) : async ICRC3.GetTransactionsResponse {
        let blocks = Buffer.Buffer<ICRC3.Block>(0);
        let start = request.start;
        let length = request.length;
        
        var current_index = start;
        label l while (current_index < start + length) {
            switch (completed_events.get(current_index)) {
                case (?event) {
                    let block : ICRC3.Block = {
                        transaction = eventToValue(event);
                        timestamp = event.timestamp;
                        parent_hash = null; // For now, we're not implementing block chaining
                        hash = []; // Placeholder for hash implementation
                    };
                    blocks.add(block);
                };
                case null {
                    break l;
                };
            };
            current_index += 1;
        };

        {
            log_length = completed_events.size();
            blocks = Buffer.toArray(blocks);
            archived_blocks = []; // For now, we're not implementing archival
        }
    };

    // Helper function to convert Event to ICRC3.Value
    private func eventToValue(event: Types.Event) : ICRC3.Value {
        #Map([
            ("id", #Nat(event.id)),
            ("type", #Text(eventTypeToText(event.event_type))),
            ("timestamp", #Int(event.timestamp)),
            ("user", #Text(Principal.toText(event.user))),
            ("details", eventDetailsToValue(event.details)),
            ("parent_event", switch (event.parent_event) {
                case (?id) #Nat(id);
                case null #Array([]);
            }),
            ("child_events", #Array(Array.map<Nat, ICRC3.Value>(
                event.child_events,
                func (id: Nat) : ICRC3.Value = #Nat(id)
            )))
        ])
    };

    private func eventTypeToText(event_type: Types.EventType) : Text {
        switch (event_type) {
            case (#SwapStarted) "swap_started";
            case (#SwapCompleted) "swap_completed";
            case (#SwapFailed) "swap_failed";
            case (#SplitSwapStarted) "split_swap_started";
            case (#SplitSwapCompleted) "split_swap_completed";
            case (#SplitSwapFailed) "split_swap_failed";
            case (#TransferStarted) "transfer_started";
            case (#TransferCompleted) "transfer_completed";
            case (#TransferFailed) "transfer_failed";
            case (#ApprovalStarted) "approval_started";
            case (#ApprovalCompleted) "approval_completed";
            case (#ApprovalFailed) "approval_failed";
            case (#DepositStarted) "deposit_started";
            case (#DepositCompleted) "deposit_completed";
            case (#DepositFailed) "deposit_failed";
            case (#WithdrawStarted) "withdraw_started";
            case (#WithdrawCompleted) "withdraw_completed";
            case (#WithdrawFailed) "withdraw_failed";
            case (#AllocationStarted) "allocation_started";
            case (#AllocationCompleted) "allocation_completed";
            case (#AllocationFailed) "allocation_failed";
            case (#AllocationClaimStarted) "allocation_claim_started";
            case (#AllocationClaimCompleted) "allocation_claim_completed";
            case (#AllocationClaimFailed) "allocation_claim_failed";
            case (#AllocationTopUpStarted) "allocation_top_up_started";
            case (#AllocationTopUpCompleted) "allocation_top_up_completed";
            case (#AllocationTopUpFailed) "allocation_top_up_failed";
            case (#AllocationCancelStarted) "allocation_cancel_started";
            case (#AllocationCancelCompleted) "allocation_cancel_completed";
            case (#AllocationCancelFailed) "allocation_cancel_failed";
            case (#AllocationTransferStarted) "allocation_transfer_started";
            case (#AllocationTransferCompleted) "allocation_transfer_completed";
            case (#AllocationTransferFailed) "allocation_transfer_failed";
        }
    };

    private func eventDetailsToValue(details: Types.EventDetails) : ICRC3.Value {
        switch (details) {
            case (#Swap(swap)) {
                #Map([
                    ("type", #Text("swap")),
                    ("input_token", tokenValueToValue(swap.input_token)),
                    ("output_token", tokenValueToValue(swap.output_token)),
                    ("dex", #Text(swap.dex)),
                    ("error_message", switch (swap.error_message) {
                        case (?msg) #Text(msg);
                        case null #Array([]);
                    })
                ])
            };
            case (#SplitSwap(split)) {
                #Map([
                    ("type", #Text("split_swap")),
                    ("input_token", tokenValueToValue(split.input_token)),
                    ("icpswap_output_token", tokenValueToValue(split.icpswap_output_token)),
                    ("kong_output_token", tokenValueToValue(split.kong_output_token)),
                    ("icpswap_ratio", #Text(Float.toText(split.icpswap_ratio))),
                    ("kong_ratio", #Text(Float.toText(split.kong_ratio))),
                    ("error_message", switch (split.error_message) {
                        case (?msg) #Text(msg);
                        case null #Array([]);
                    })
                ])
            };
            // Add other event detail types as needed
            case _ #Map([("type", #Text("unknown"))])
        }
    };

    private func tokenValueToValue(token: Types.TokenValue) : ICRC3.Value {
        #Map([
            ("canister", #Text(Principal.toText(token.canister))),
            ("amount_e8s", #Nat(token.amount_e8s)),
            ("icp_value_e8s", #Nat(token.icp_value_e8s)),
            ("usd_value", #Text(Float.toText(token.usd_value)))
        ])
    };
};
