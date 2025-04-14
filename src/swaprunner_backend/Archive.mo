import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Error "mo:base/Error";
import HashMap "mo:base/HashMap";
import Hash "mo:base/Hash";
import Int "mo:base/Int";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Option "mo:base/Option";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import TrieSet "mo:base/TrieSet";

module {
    // Types for logging events
    public type EventType = {
        #SwapStarted;
        #SwapCompleted;
        #SwapFailed;
        #TransferStarted;
        #TransferCompleted;
        #TransferFailed;
        #ApprovalStarted;
        #ApprovalCompleted;
        #ApprovalFailed;
        #DepositStarted;
        #DepositCompleted;
        #DepositFailed;
        #WithdrawStarted;
        #WithdrawCompleted;
        #WithdrawFailed;
    };

    public type Event = {
        id: Text;  // UUID for the event
        event_type: EventType;
        timestamp: Int;  // Nanoseconds since 1970-01-01
        user: Principal;
        details: EventDetails;
        related_events: [Text];  // IDs of related events (e.g. all events in a swap)
    };

    public type EventDetails = {
        #SwapDetails: {
            dex: Text;  // "ICPSwap" or "Kong"
            token_in: Principal;
            amount_in_e8s: Nat;
            token_out: Principal;
            amount_out_e8s: ?Nat;  // None for started/failed, Some for completed
            error_message: ?Text;  // Only for failed events
        };
        #TransferDetails: {
            token: Principal;
            amount_e8s: Nat;
            to: Principal;
            error_message: ?Text;
        };
        #ApprovalDetails: {
            token: Principal;
            amount_e8s: Nat;
            spender: Principal;
            error_message: ?Text;
        };
        #DepositDetails: {
            token: Principal;
            amount_e8s: Nat;
            error_message: ?Text;
        };
        #WithdrawDetails: {
            token: Principal;
            amount_e8s: Nat;
            error_message: ?Text;
        };
    };

    // Actor class for the Archive canister
    public actor class Archive() = this {
        // Stable storage for events
        private stable var events: [(Text, Event)] = [];
        private stable var next_event_id: Nat = 0;

        // Runtime state
        private let eventStore = TrieMap.fromEntries<Text, Event>(
            events.vals(),
            Text.equal,
            Text.hash
        );

        // Helper to generate next event ID
        private func generateEventId() : Text {
            let id = next_event_id;
            next_event_id += 1;
            Nat.toText(id)
        };

        // Helper to get current time in nanoseconds
        private func now() : Int {
            Time.now()
        };

        // Pre-upgrade hook to save state
        system func preupgrade() {
            events := Iter.toArray(eventStore.entries());
        };

        // Post-upgrade hook to clear temporary state
        system func postupgrade() {
            events := [];
        };

        // Public methods for logging events
        
        // Log a swap event
        public shared({caller}) func logSwap(
            event_type: {#SwapStarted; #SwapCompleted; #SwapFailed},
            dex: Text,
            token_in: Principal,
            amount_in_e8s: Nat,
            token_out: Principal,
            amount_out_e8s: ?Nat,
            error_message: ?Text,
            related_events: [Text]
        ) : async Text {
            let id = generateEventId();
            let event: Event = {
                id;
                event_type;
                timestamp = now();
                user = caller;
                details = #SwapDetails({
                    dex;
                    token_in;
                    amount_in_e8s;
                    token_out;
                    amount_out_e8s;
                    error_message;
                });
                related_events;
            };
            eventStore.put(id, event);
            id
        };

        // Log a transfer event
        public shared({caller}) func logTransfer(
            event_type: {#TransferStarted; #TransferCompleted; #TransferFailed},
            token: Principal,
            amount_e8s: Nat,
            to: Principal,
            error_message: ?Text,
            related_events: [Text]
        ) : async Text {
            let id = generateEventId();
            let event: Event = {
                id;
                event_type;
                timestamp = now();
                user = caller;
                details = #TransferDetails({
                    token;
                    amount_e8s;
                    to;
                    error_message;
                });
                related_events;
            };
            eventStore.put(id, event);
            id
        };

        // Log an approval event
        public shared({caller}) func logApproval(
            event_type: {#ApprovalStarted; #ApprovalCompleted; #ApprovalFailed},
            token: Principal,
            amount_e8s: Nat,
            spender: Principal,
            error_message: ?Text,
            related_events: [Text]
        ) : async Text {
            let id = generateEventId();
            let event: Event = {
                id;
                event_type;
                timestamp = now();
                user = caller;
                details = #ApprovalDetails({
                    token;
                    amount_e8s;
                    spender;
                    error_message;
                });
                related_events;
            };
            eventStore.put(id, event);
            id
        };

        // Log a deposit event
        public shared({caller}) func logDeposit(
            event_type: {#DepositStarted; #DepositCompleted; #DepositFailed},
            token: Principal,
            amount_e8s: Nat,
            error_message: ?Text,
            related_events: [Text]
        ) : async Text {
            let id = generateEventId();
            let event: Event = {
                id;
                event_type;
                timestamp = now();
                user = caller;
                details = #DepositDetails({
                    token;
                    amount_e8s;
                    error_message;
                });
                related_events;
            };
            eventStore.put(id, event);
            id
        };

        // Log a withdraw event
        public shared({caller}) func logWithdraw(
            event_type: {#WithdrawStarted; #WithdrawCompleted; #WithdrawFailed},
            token: Principal,
            amount_e8s: Nat,
            error_message: ?Text,
            related_events: [Text]
        ) : async Text {
            let id = generateEventId();
            let event: Event = {
                id;
                event_type;
                timestamp = now();
                user = caller;
                details = #WithdrawDetails({
                    token;
                    amount_e8s;
                    error_message;
                });
                related_events;
            };
            eventStore.put(id, event);
            id
        };

        // Query methods

        // Get event by ID
        public query func getEvent(id: Text) : async ?Event {
            eventStore.get(id)
        };

        // Get all events for a user
        public query func getUserEvents(user: Principal) : async [Event] {
            let events = Buffer.Buffer<Event>(0);
            for ((_, event) in eventStore.entries()) {
                if (event.user == user) {
                    events.add(event);
                };
            };
            Buffer.toArray(events)
        };

        // Get all related events by event ID
        public query func getRelatedEvents(event_id: Text) : async [Event] {
            switch (eventStore.get(event_id)) {
                case (null) [];
                case (?event) {
                    let events = Buffer.Buffer<Event>(0);
                    for (id in event.related_events.vals()) {
                        switch (eventStore.get(id)) {
                            case (?related) events.add(related);
                            case null {};
                        };
                    };
                    Buffer.toArray(events)
                };
            }
        };

        // Get all events for a token
        public query func getTokenEvents(token: Principal) : async [Event] {
            let events = Buffer.Buffer<Event>(0);
            for ((_, event) in eventStore.entries()) {
                switch (event.details) {
                    case (#SwapDetails(details)) {
                        if (details.token_in == token or details.token_out == token) {
                            events.add(event);
                        };
                    };
                    case (#TransferDetails(details)) {
                        if (details.token == token) {
                            events.add(event);
                        };
                    };
                    case (#ApprovalDetails(details)) {
                        if (details.token == token) {
                            events.add(event);
                        };
                    };
                    case (#DepositDetails(details)) {
                        if (details.token == token) {
                            events.add(event);
                        };
                    };
                    case (#WithdrawDetails(details)) {
                        if (details.token == token) {
                            events.add(event);
                        };
                    };
                };
            };
            Buffer.toArray(events)
        };

        // Get all events between timestamps (inclusive)
        public query func getEventsBetween(start: Int, end: Int) : async [Event] {
            let events = Buffer.Buffer<Event>(0);
            for ((_, event) in eventStore.entries()) {
                if (event.timestamp >= start and event.timestamp <= end) {
                    events.add(event);
                };
            };
            Buffer.toArray(events)
        };

        // Get all events of a specific type
        public query func getEventsByType(event_type: EventType) : async [Event] {
            let events = Buffer.Buffer<Event>(0);
            for ((_, event) in eventStore.entries()) {
                if (event.event_type == event_type) {
                    events.add(event);
                };
            };
            Buffer.toArray(events)
        };
    };
};
