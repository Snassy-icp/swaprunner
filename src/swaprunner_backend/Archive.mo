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

import T "./Types";
import ICRC3 "./ICRC3";

actor class Archive() = this {
    // Stable storage for events
    private stable var next_event_id: Nat = 0;
    private stable var stable_storage = {
        var events: [(Nat, T.Event)] = [];  // Completed events
        var inflight_events: [(Nat, T.InflightEvent)] = [];  // In-progress or failed events
    };

    // Runtime state
    private var eventStore = TrieMap.TrieMap<Nat, T.Event>(Nat.equal, Hash.hash);
    private var inflightEvents = TrieMap.TrieMap<Nat, T.InflightEvent>(Nat.equal, Hash.hash);

    // System functions for upgrades
    system func preupgrade() {
        stable_storage.events := Iter.toArray(eventStore.entries());
        stable_storage.inflight_events := Iter.toArray(inflightEvents.entries());
    };

    system func postupgrade() {
        eventStore := TrieMap.fromEntries(stable_storage.events.vals(), Nat.equal, Hash.hash);
        inflightEvents := TrieMap.fromEntries(stable_storage.inflight_events.vals(), Nat.equal, Hash.hash);
        stable_storage.events := [];
        stable_storage.inflight_events := [];
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

    // Public methods for logging events
    public shared(msg) func logSwapStarted(
        dex: Text,
        token_in: T.TokenValue,
        token_out: T.TokenValue,
    ) : async Nat {
        let id = generateEventId();
        let event: T.Event = {
            id;
            event_type = #SwapStarted;
            timestamp = getCurrentTime();
            user = msg.caller;
            details = #Swap({
                dex;
                token_in;
                token_out;
                error_message = null;
            });
            related_events = [];
        };
        
        inflightEvents.put(id, {
            event;
            status = #InProgress;
        });
        
        id
    };

    public shared(msg) func logSwapCompleted(
        original_event_id: Nat,
        token_out_amount: T.TokenValue,
    ) : async () {
        switch (inflightEvents.get(original_event_id)) {
            case (?inflight) {
                switch (inflight.event.details) {
                    case (#Swap(details)) {
                        let completed_event: T.Event = {
                            id = generateEventId();
                            event_type = #SwapCompleted;
                            timestamp = getCurrentTime();
                            user = msg.caller;
                            details = #Swap({
                                dex = details.dex;
                                token_in = details.token_in;
                                token_out = token_out_amount;
                                error_message = null;
                            });
                            related_events = [original_event_id];
                        };
                        
                        // Store completed event and remove from inflight
                        eventStore.put(completed_event.id, completed_event);
                        inflightEvents.delete(original_event_id);
                    };
                    case (_) {
                        throw Error.reject("Original event is not a swap");
                    };
                };
            };
            case (null) {
                throw Error.reject("Original event not found");
            };
        };
    };

    public shared(msg) func logSwapFailed(
        original_event_id: Nat,
        error_message: Text,
    ) : async () {
        switch (inflightEvents.get(original_event_id)) {
            case (?inflight) {
                switch (inflight.event.details) {
                    case (#Swap(details)) {
                        inflightEvents.put(original_event_id, {
                            event = inflight.event;
                            status = #Failed(error_message);
                        });
                    };
                    case (_) {
                        throw Error.reject("Original event is not a swap");
                    };
                };
            };
            case (null) {
                throw Error.reject("Original event not found");
            };
        };
    };

    // Similar patterns for Transfer, Approval, Deposit, and Withdraw events...
    // For brevity, I'll implement one more as an example:

    public shared(msg) func logTransferStarted(
        token: T.TokenValue,
        to: Principal,
    ) : async Nat {
        let id = generateEventId();
        let event: T.Event = {
            id;
            event_type = #TransferStarted;
            timestamp = getCurrentTime();
            user = msg.caller;
            details = #Transfer({
                token;
                from = msg.caller;
                to;
                error_message = null;
            });
            related_events = [];
        };
        
        inflightEvents.put(id, {
            event;
            status = #InProgress;
        });
        
        id
    };

    // Query methods
    public query func getEvent(id: Nat) : async ?T.Event {
        eventStore.get(id)
    };

    public query func getInflightEvent(id: Nat) : async ?T.InflightEvent {
        inflightEvents.get(id)
    };

    public query func getUserEvents(user: Principal) : async [T.Event] {
        let events = Buffer.Buffer<T.Event>(0);
        for ((_, event) in eventStore.entries()) {
            if (event.user == user) {
                events.add(event);
            };
        };
        Buffer.toArray(events)
    };

    public query func getRelatedEvents(event_id: Nat) : async [T.Event] {
        switch (eventStore.get(event_id)) {
            case (?event) {
                let related = Buffer.Buffer<T.Event>(0);
                for (related_id in event.related_events.vals()) {
                    switch (eventStore.get(related_id)) {
                        case (?related_event) related.add(related_event);
                        case (null) {};
                    };
                };
                Buffer.toArray(related)
            };
            case (null) { [] };
        }
    };

    // ICRC3 interface implementation
    public query func get_transactions(request: ICRC3.GetTransactionsRequest) : async ICRC3.GetTransactionsResponse {
        let blocks = Buffer.Buffer<ICRC3.Block>(0);
        var current = request.start;
        let end = current + request.length;

        while (current < end) {
            switch (eventStore.get(current)) {
                case (?event) {
                    blocks.add({
                        transaction = eventToValue(event);
                        timestamp = event.timestamp;
                        parent_hash = null; // For simplicity
                        hash = []; // For simplicity
                    });
                };
                case (null) {};
            };
            current += 1;
        };

        {
            log_length = next_event_id;
            blocks = Buffer.toArray(blocks);
            archived_blocks = []; // No archival implementation for now
        }
    };

    // Helper to convert our Event type to ICRC3.Value
    private func eventToValue(event: T.Event) : ICRC3.Value {
        #Map([
            ("id", #Nat(event.id)),
            ("type", #Text(eventTypeToText(event.event_type))),
            ("timestamp", #Int(event.timestamp)),
            ("user", #Text(Principal.toText(event.user))),
            ("details", eventDetailsToValue(event.details)),
            ("related_events", #Array(Array.map<Nat, ICRC3.Value>(
                event.related_events,
                func (id: Nat) : ICRC3.Value = #Nat(id)
            )))
        ])
    };

    private func eventTypeToText(event_type: T.EventType) : Text {
        switch (event_type) {
            case (#SwapStarted) "swap_started";
            case (#SwapCompleted) "swap_completed";
            case (#SwapFailed) "swap_failed";
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
        }
    };

    private func eventDetailsToValue(details: T.EventDetails) : ICRC3.Value {
        switch (details) {
            case (#Swap(swap)) {
                #Map([
                    ("type", #Text("swap")),
                    ("dex", #Text(swap.dex)),
                    ("token_in", tokenValueToValue(swap.token_in)),
                    ("token_out", tokenValueToValue(swap.token_out)),
                    ("error_message", switch (swap.error_message) {
                        case (?msg) #Text(msg);
                        case (null) #Text("");
                    })
                ])
            };
            case (#Transfer(transfer)) {
                #Map([
                    ("type", #Text("transfer")),
                    ("token", tokenValueToValue(transfer.token)),
                    ("from", #Text(Principal.toText(transfer.from))),
                    ("to", #Text(Principal.toText(transfer.to))),
                    ("error_message", switch (transfer.error_message) {
                        case (?msg) #Text(msg);
                        case (null) #Text("");
                    })
                ])
            };
            // Similar patterns for other event types...
            case (_) #Text("unsupported_event_type")
        }
    };

    private func tokenValueToValue(token: T.TokenValue) : ICRC3.Value {
        #Map([
            ("token_canister", #Text(Principal.toText(token.token_canister))),
            ("amount_e8s", #Nat(token.amount_e8s)),
            ("icp_value_e8s", #Nat(token.icp_value_e8s)),
            ("usd_value_e8s", #Nat(token.usd_value_e8s))
        ])
    };
};
