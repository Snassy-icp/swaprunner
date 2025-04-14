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

    // Helper to add a child event to a parent event
    private func linkChildToParent(child_id: Nat, parent_id: Nat) {
        switch (eventStore.get(parent_id)) {
            case (?parent) {
                let updated_parent: T.Event = {
                    parent with
                    child_events = Array.append(parent.child_events, [child_id]);
                };
                eventStore.put(parent_id, updated_parent);
            };
            case (null) {
                // Parent might be in inflight events
                switch (inflightEvents.get(parent_id)) {
                    case (?parent_inflight) {
                        let updated_event: T.Event = {
                            parent_inflight.event with
                            child_events = Array.append(parent_inflight.event.child_events, [child_id]);
                        };
                        inflightEvents.put(parent_id, {
                            event = updated_event;
                            status = parent_inflight.status;
                        });
                    };
                    case (null) {};
                };
            };
        };
    };

    // Split Swap methods
    public shared(msg) func logSplitSwapStarted(
        token_in: T.TokenValue,
        token_out: T.TokenValue,
        icpswap_ratio: Nat,
        kong_ratio: Nat,
    ) : async Nat {
        let id = generateEventId();
        let event: T.Event = {
            id;
            event_type = #SplitSwapStarted;
            timestamp = getCurrentTime();
            user = msg.caller;
            details = #SplitSwap({
                token_in;
                token_out;
                icpswap_ratio;
                kong_ratio;
                error_message = null;
            });
            parent_event = null;
            child_events = [];
            related_events = [];
        };
        
        inflightEvents.put(id, {
            event;
            status = #InProgress;
        });
        
        id
    };

    public shared(msg) func logSplitSwapCompleted(
        original_event_id: Nat,
        token_out: T.TokenValue,
    ) : async () {
        switch (inflightEvents.get(original_event_id)) {
            case (?inflight) {
                switch (inflight.event.details) {
                    case (#SplitSwap(details)) {
                        let completed_event: T.Event = {
                            id = generateEventId();
                            event_type = #SplitSwapCompleted;
                            timestamp = getCurrentTime();
                            user = msg.caller;
                            details = #SplitSwap({
                                token_in = details.token_in;
                                token_out;
                                icpswap_ratio = details.icpswap_ratio;
                                kong_ratio = details.kong_ratio;
                                error_message = null;
                            });
                            parent_event = null;
                            child_events = inflight.event.child_events;
                            related_events = [original_event_id];
                        };
                        
                        eventStore.put(completed_event.id, completed_event);
                        inflightEvents.delete(original_event_id);
                    };
                    case (_) {
                        throw Error.reject("Original event is not a split swap");
                    };
                };
            };
            case (null) {
                throw Error.reject("Original event not found");
            };
        };
    };

    // Regular Swap methods with parent linking
    public shared(msg) func logSwapStarted(
        dex: Text,
        token_in: T.TokenValue,
        token_out: T.TokenValue,
        parent_id: ?Nat,  // Optional ID of parent split swap
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
            parent_event = parent_id;
            child_events = [];
            related_events = [];
        };
        
        inflightEvents.put(id, {
            event;
            status = #InProgress;
        });

        // Link to parent if provided
        switch (parent_id) {
            case (?pid) { linkChildToParent(id, pid); };
            case (null) {};
        };
        
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
                            parent_event = inflight.event.parent_event;
                            child_events = inflight.event.child_events;
                            related_events = [original_event_id];
                        };
                        
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

    // Component operation methods (Transfer, Approval, etc.) with parent linking
    public shared(msg) func logTransferStarted(
        token: T.TokenValue,
        to: Principal,
        parent_id: ?Nat,  // Optional ID of parent swap
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
            parent_event = parent_id;
            child_events = [];
            related_events = [];
        };
        
        inflightEvents.put(id, {
            event;
            status = #InProgress;
        });

        // Link to parent if provided
        switch (parent_id) {
            case (?pid) { linkChildToParent(id, pid); };
            case (null) {};
        };
        
        id
    };

    // Enhanced query methods
    public query func getEventHierarchy(event_id: Nat) : async ?{
        event: T.Event;
        parent: ?T.Event;
        children: [T.Event];
        related: [T.Event];
    } {
        switch (eventStore.get(event_id)) {
            case (?event) {
                let parent = switch (event.parent_event) {
                    case (?pid) { eventStore.get(pid) };
                    case (null) { null };
                };

                let children = Buffer.Buffer<T.Event>(0);
                for (child_id in event.child_events.vals()) {
                    switch (eventStore.get(child_id)) {
                        case (?child) { children.add(child); };
                        case (null) {};
                    };
                };

                let related = Buffer.Buffer<T.Event>(0);
                for (related_id in event.related_events.vals()) {
                    switch (eventStore.get(related_id)) {
                        case (?rel) { related.add(rel); };
                        case (null) {};
                    };
                };

                ?{
                    event;
                    parent;
                    children = Buffer.toArray(children);
                    related = Buffer.toArray(related);
                }
            };
            case (null) { null };
        }
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
            ("parent_event", switch (event.parent_event) {
                case (?pid) #Nat(pid);
                case (null) #Text("");
            }),
            ("child_events", #Array(Array.map<Nat, ICRC3.Value>(
                event.child_events,
                func (id: Nat) : ICRC3.Value = #Nat(id)
            ))),
            ("related_events", #Array(Array.map<Nat, ICRC3.Value>(
                event.related_events,
                func (id: Nat) : ICRC3.Value = #Nat(id)
            )))
        ])
    };

    private func eventTypeToText(event_type: T.EventType) : Text {
        switch (event_type) {
            case (#SplitSwapStarted) "split_swap_started";
            case (#SplitSwapCompleted) "split_swap_completed";
            case (#SplitSwapFailed) "split_swap_failed";
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
            case (#SplitSwap(split)) {
                #Map([
                    ("type", #Text("split_swap")),
                    ("token_in", tokenValueToValue(split.token_in)),
                    ("token_out", tokenValueToValue(split.token_out)),
                    ("icpswap_ratio", #Nat(split.icpswap_ratio)),
                    ("kong_ratio", #Nat(split.kong_ratio)),
                    ("error_message", switch (split.error_message) {
                        case (?msg) #Text(msg);
                        case (null) #Text("");
                    })
                ])
            };
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
