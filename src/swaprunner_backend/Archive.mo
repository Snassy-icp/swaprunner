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
import Types "./Types";
import ICRC3 "./ICRC3";

module {
    type Block = ICRC3.Block;

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
        id: Nat;
        event_type: EventType;
        timestamp: Int;
        user: Principal;
        status: EventStatus;
        details: EventDetails;
        related_events: [Nat];
    };

    public type SwapDetails = {
        input_token: Principal;
        output_token: Principal;
        input_amount: Nat;
        output_amount: Nat;
        dex: Text;
        error_message: ?Text;
    };

    public type TransferDetails = {
        token: Principal;
        from: Principal;
        to: Principal;
        amount: Nat;
        error_message: ?Text;
    };

    public type ApprovalDetails = {
        token: Principal;
        owner: Principal;
        spender: Principal;
        amount: Nat;
        error_message: ?Text;
    };

    public type DepositDetails = {
        token: Principal;
        amount: Nat;
        from: Principal;
        error_message: ?Text;
    };

    public type WithdrawDetails = {
        token: Principal;
        amount: Nat;
        to: Principal;
        error_message: ?Text;
    };

    public type EventDetails = {
        #Swap: SwapDetails;
        #Transfer: TransferDetails;
        #Approval: ApprovalDetails;
        #Deposit: DepositDetails;
        #Withdraw: WithdrawDetails;
    };

    // Actor class for the Archive canister
    public actor class Archive() = this {
        private let eventStore = TrieMap.TrieMap<Text, Event>(Text.equal, Text.hash);
        private var next_event_id: Nat = 0;

        type Event = Types.Event;
        type EventType = Types.EventType;
        type EventDetails = Types.EventDetails;

        // ICRC3 initialization
        private let _icrc3 = ICRC3.ICRC3(
            ?ICRC3.initialState(),
            {
                maxActiveRecords = 2000;
                settleToRecords = 1000;
                maxRecordsInArchiveInstance = 1_000_000;
                maxArchivePages = 62500;
                archiveIndexType = #Stable;
                maxRecordsToArchive = 1000;
                archiveCycles = 1_000_000_000_000;
                archiveControllers = null;
            },
            Principal.fromActor(this)
        );

        private stable var stable_storage = {
            var events: [(Text, Event)] = [];
            var next_event_id: Nat = 0;
        };

        system func preupgrade() {
            stable_storage.events := Iter.toArray(eventStore.entries());
            stable_storage.next_event_id := next_event_id;
        };

        system func postupgrade() {
            eventStore.clear();
            for ((k, v) in stable_storage.events.vals()) {
                eventStore.put(k, v);
            };
            next_event_id := stable_storage.next_event_id;
            stable_storage.events := [];
        };

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

        // Helper functions to create ICRC3 blocks
        private func makeSwapBlock(
            token_in: Principal,
            amount_in_e8s: Nat,
            token_out: Principal,
            amount_out_e8s: Nat,
            dex: Text,
            caller: Principal
        ) : ICRC3.Value {
            #Map([
                ("btype", #Text("swap")),
                ("ts", #Nat(Int.abs(Time.now()))),
                ("token_in", #Text(Principal.toText(token_in))),
                ("amount_in_e8s", #Nat(amount_in_e8s)),
                ("token_out", #Text(Principal.toText(token_out))),
                ("amount_out_e8s", #Nat(amount_out_e8s)),
                ("dex", #Text(dex)),
                ("caller", #Text(Principal.toText(caller)))
            ])
        };

        private func makeTransferBlock(
            token: Principal,
            amount_e8s: Nat,
            from: Principal,
            to: Principal
        ) : ICRC3.Value {
            #Map([
                ("btype", #Text("transfer")),
                ("ts", #Nat(Int.abs(Time.now()))),
                ("token", #Text(Principal.toText(token))),
                ("amount_e8s", #Nat(amount_e8s)),
                ("from", #Text(Principal.toText(from))),
                ("to", #Text(Principal.toText(to)))
            ])
        };

        private func makeApprovalBlock(
            token: Principal,
            amount_e8s: Nat,
            from: Principal,
            spender: Principal
        ) : ICRC3.Value {
            #Map([
                ("btype", #Text("approval")),
                ("ts", #Nat(Int.abs(Time.now()))),
                ("token", #Text(Principal.toText(token))),
                ("amount_e8s", #Nat(amount_e8s)),
                ("from", #Text(Principal.toText(from))),
                ("spender", #Text(Principal.toText(spender)))
            ])
        };

        private func makeDepositBlock(
            token: Principal,
            amount_e8s: Nat,
            user: Principal
        ) : ICRC3.Value {
            #Map([
                ("btype", #Text("deposit")),
                ("ts", #Nat(Int.abs(Time.now()))),
                ("token", #Text(Principal.toText(token))),
                ("amount_e8s", #Nat(amount_e8s)),
                ("user", #Text(Principal.toText(user)))
            ])
        };

        private func makeWithdrawBlock(
            token: Principal,
            amount_e8s: Nat,
            user: Principal
        ) : ICRC3.Value {
            #Map([
                ("btype", #Text("withdraw")),
                ("ts", #Nat(Int.abs(Time.now()))),
                ("token", #Text(Principal.toText(token))),
                ("amount_e8s", #Nat(amount_e8s)),
                ("user", #Text(Principal.toText(user)))
            ])
        };

        // Helper to clean up debug logs
        private func cleanupRelatedEvents(related_events: [Text], types_to_clean: [EventType]) {
            for (id in related_events.vals()) {
                switch (eventStore.get(id)) {
                    case (?event) {
                        if (Array.find<EventType>(types_to_clean, func(t) { t == event.event_type }) != null) {
                            eventStore.delete(id);
                        };
                    };
                    case null {};
                };
            };
        };

        // Add this helper function near the top with other private functions
        private func valueMatchesText(v: ICRC3.Value, text: Text) : Bool {
            switch(v) {
                case (#Text(t)) t == text;
                case _ false;
            }
        };

        // Add this helper function near the top with other private functions
        private func valueMatchesUser(v: ICRC3.Value, user_text: Text) : Bool {
            switch(v) {
                case (#Text(t)) { t == user_text };
                case _ { false };
            }
        };

        // Public methods for logging events
        
        // Completed events - these create ICRC3 records
        public shared({caller}) func logSwapCompleted(
            dex: Text,
            token_in: Principal,
            amount_in_e8s: Nat,
            token_out: Principal,
            amount_out_e8s: Nat,
            related_events: [Text]
        ) : async Text {
            // First log to debug store
            let debug_id = await logSwap(
                #SwapCompleted,
                dex,
                token_in,
                amount_in_e8s,
                token_out,
                ?amount_out_e8s,
                null,
                related_events
            );

            // Create ICRC3 permanent record
            let block = makeSwapBlock(
                token_in,
                amount_in_e8s,
                token_out,
                amount_out_e8s,
                dex,
                caller
            );
            ignore _icrc3.append(block);

            // Clean up debug logs
            cleanupRelatedEvents(related_events, [#SwapStarted, #SwapCompleted]);

            debug_id
        };

        public shared({caller}) func logTransferCompleted(
            token: Principal,
            amount_e8s: Nat,
            to: Principal,
            related_events: [Text]
        ) : async Text {
            let debug_id = await logTransfer(
                #TransferCompleted,
                token,
                amount_e8s,
                to,
                null,
                related_events
            );

            let block = makeTransferBlock(token, amount_e8s, caller, to);
            ignore _icrc3.append(block);

            cleanupRelatedEvents(related_events, [#TransferStarted, #TransferCompleted]);

            debug_id
        };

        public shared({caller}) func logApprovalCompleted(
            token: Principal,
            amount_e8s: Nat,
            spender: Principal,
            related_events: [Text]
        ) : async Text {
            let debug_id = await logApproval(
                #ApprovalCompleted,
                token,
                amount_e8s,
                spender,
                null,
                related_events
            );

            let block = makeApprovalBlock(token, amount_e8s, caller, spender);
            ignore _icrc3.append(block);

            cleanupRelatedEvents(related_events, [#ApprovalStarted, #ApprovalCompleted]);

            debug_id
        };

        public shared({caller}) func logDepositCompleted(
            token: Principal,
            amount_e8s: Nat,
            related_events: [Text]
        ) : async Text {
            let debug_id = await logDeposit(
                #DepositCompleted,
                token,
                amount_e8s,
                null,
                related_events
            );

            let block = makeDepositBlock(token, amount_e8s, caller);
            ignore _icrc3.append(block);

            cleanupRelatedEvents(related_events, [#DepositStarted, #DepositCompleted]);

            debug_id
        };

        public shared({caller}) func logWithdrawCompleted(
            token: Principal,
            amount_e8s: Nat,
            related_events: [Text]
        ) : async Text {
            let debug_id = await logWithdraw(
                #WithdrawCompleted,
                token,
                amount_e8s,
                null,
                related_events
            );

            let block = makeWithdrawBlock(token, amount_e8s, caller);
            ignore _icrc3.append(block);

            cleanupRelatedEvents(related_events, [#WithdrawStarted, #WithdrawCompleted]);

            debug_id
        };

        // Debug log methods for Started/Failed events - these remain unchanged
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

        // New ICRC3-specific query methods
        public query func getLastBlockIndex() : async Nat {
            _icrc3.get_log_length() - 1
        };

        public query func getBlocksByType(btype: Text, start: Nat, length: Nat) : async ICRC3.GetBlocksResult {
            let result = _icrc3.get_blocks([{start; length}]);
            let filtered = Buffer.Buffer<(Nat, ICRC3.Value)>(0);
            
            for ({id; block} in result.blocks.vals()) {
                switch (block) {
                    case (#Map(fields)) {
                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "btype" })) {
                            case (?(_, #Text(t))) {
                                if (t == btype) {
                                    filtered.add((id, block));
                                };
                            };
                            case _ {};
                        };
                    };
                    case _ {};
                };
            };

            {
                log_length = result.log_length;
                blocks = Buffer.toArray(filtered);
                archived_blocks = result.archived_blocks;
            }
        };

        public query func getBlocksByTimeRange(start_time: Nat, end_time: Nat, max_blocks: Nat) : async ICRC3.GetBlocksResult {
            let result = _icrc3.get_blocks([{start = 0; length = _icrc3.get_log_length()}]);
            let filtered = Array.mapFilter<Block, (Nat, ICRC3.Value)>(
                result.blocks,
                func(block) {
                    switch (block.block) {
                        case (#Map(fields)) {
                            switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "ts" })) {
                                case (?(_, #Nat(ts))) {
                                    if (ts >= start_time and ts <= end_time) {
                                        ?(block.id, block.block)
                                    } else {
                                        null
                                    };
                                };
                                case _ { null };
                            };
                        };
                        case _ { null };
                    };
                }
            );

            let limited = Array.subArray<(Nat, ICRC3.Value)>(filtered, 0, Nat.min(filtered.size(), max_blocks));

            {
                log_length = result.log_length;
                blocks = limited;
                archived_blocks = result.archived_blocks;
            }
        };

        public query func getBlocksByToken(token: Principal, start: Nat, length: Nat) : async ICRC3.GetBlocksResult {
            let result = _icrc3.get_blocks([{start; length}]);
            let filtered = Buffer.Buffer<(Nat, ICRC3.Value)>(0);
            let token_text = Principal.toText(token);
            
            for ({id; block} in result.blocks.vals()) {
                switch (block) {
                    case (#Map(fields)) {
                        let has_token = Array.find<(Text, ICRC3.Value)>(
                            fields,
                            func((k, v)) {
                                (k == "token" or k == "token_in" or k == "token_out") and
                                valueMatchesText(v, token_text)
                            }
                        );
                        switch (has_token) {
                            case (?_) { filtered.add((id, block)) };
                            case null {};
                        };
                    };
                    case _ {};
                };
            };

            {
                log_length = result.log_length;
                blocks = Buffer.toArray(filtered);
                archived_blocks = result.archived_blocks;
            }
        };

        public query func getBlocksByUser(user: Principal, start: Nat, length: Nat) : async ICRC3.GetBlocksResult {
            let result = _icrc3.get_blocks([{start; length}]);
            let filtered = Buffer.Buffer<(Nat, ICRC3.Value)>(0);
            let user_text = Principal.toText(user);
            
            for ({id; block} in result.blocks.vals()) {
                switch (block) {
                    case (#Map(fields)) {
                        let has_user = Array.find<(Text, ICRC3.Value)>(
                            fields,
                            func((k, v)) {
                                (k == "user" or k == "caller" or k == "from") and
                                valueMatchesUser(v, user_text)
                            }
                        );
                        switch (has_user) {
                            case (?_) { filtered.add((id, block)) };
                            case null {};
                        };
                    };
                    case _ {};
                };
            };

            {
                log_length = result.log_length;
                blocks = Buffer.toArray(filtered);
                archived_blocks = result.archived_blocks;
            }
        };

        public query func getTokenVolume(
            token: Principal,
            start_time: Nat,
            end_time: Nat
        ) : async {
            swap_volume: Nat;
            transfer_volume: Nat;
            deposit_volume: Nat;
            withdraw_volume: Nat;
        } {
            let result = _icrc3.get_blocks([{start = 0; length = _icrc3.get_log_length()}]);
            let token_text = Principal.toText(token);
            var swap_volume: Nat = 0;
            var transfer_volume: Nat = 0;
            var deposit_volume: Nat = 0;
            var withdraw_volume: Nat = 0;

            for ({id; block} in result.blocks.vals()) {
                switch (block) {
                    case (#Map(fields)) {
                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "ts" })) {
                            case (?(_, #Nat(ts))) {
                                if (ts >= start_time and ts <= end_time) {
                                    switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "btype" })) {
                                        case (?(_, #Text(btype))) {
                                            switch (btype) {
                                                case "swap" {
                                                    for ((k, v) in fields.vals()) {
                                                        if ((k == "token_in" or k == "token_out") and
                                                            valueMatchesText(v, token_text)) {
                                                            let amount_key = if (k == "token_in") "amount_in_e8s" else "amount_out_e8s";
                                                            switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == amount_key })) {
                                                                case (?(_, #Nat(amount))) { swap_volume += amount };
                                                                case _ {};
                                                            };
                                                        };
                                                    };
                                                };
                                                case "transfer" {
                                                    if (Array.find<(Text, ICRC3.Value)>(fields, func((k, v)) { 
                                                        k == "token" and valueMatchesText(v, token_text)
                                                    }) != null) {
                                                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "amount_e8s" })) {
                                                            case (?(_, #Nat(amount))) { transfer_volume += amount };
                                                            case _ {};
                                                        };
                                                    };
                                                };
                                                case "deposit" {
                                                    if (Array.find<(Text, ICRC3.Value)>(fields, func((k, v)) { 
                                                        k == "token" and valueMatchesText(v, token_text)
                                                    }) != null) {
                                                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "amount_e8s" })) {
                                                            case (?(_, #Nat(amount))) { deposit_volume += amount };
                                                            case _ {};
                                                        };
                                                    };
                                                };
                                                case "withdraw" {
                                                    if (Array.find<(Text, ICRC3.Value)>(fields, func((k, v)) { 
                                                        k == "token" and valueMatchesText(v, token_text)
                                                    }) != null) {
                                                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "amount_e8s" })) {
                                                            case (?(_, #Nat(amount))) { withdraw_volume += amount };
                                                            case _ {};
                                                        };
                                                    };
                                                };
                                                case _ {};
                                            };
                                        };
                                        case _ {};
                                    };
                                };
                            };
                            case _ {};
                        };
                    };
                    case _ {};
                };
            };

            {
                swap_volume;
                transfer_volume;
                deposit_volume;
                withdraw_volume;
            }
        };

        public query func getUserStats(
            user: Principal,
            start_time: Nat,
            end_time: Nat
        ) : async {
            total_swaps: Nat;
            total_transfers: Nat;
            total_deposits: Nat;
            total_withdraws: Nat;
            volume_by_token: [(Principal, Nat)];
        } {
            let result = _icrc3.get_blocks([{start = 0; length = _icrc3.get_log_length()}]);
            let user_text = Principal.toText(user);
            var total_swaps = 0;
            var total_transfers = 0;
            var total_deposits = 0;
            var total_withdraws = 0;
            let volume_map = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);

            for ({id; block} in result.blocks.vals()) {
                switch (block) {
                    case (#Map(fields)) {
                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "ts" })) {
                            case (?(_, #Nat(ts))) {
                                if (ts >= start_time and ts <= end_time) {
                                    let is_user_block = Array.find<(Text, ICRC3.Value)>(
                                        fields,
                                        func((k, v)) {
                                            (k == "user" or k == "caller" or k == "from") and
                                            valueMatchesUser(v, user_text)
                                        }
                                    ) != null;

                                    if (is_user_block) {
                                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "btype" })) {
                                            case (?(_, #Text(btype))) {
                                                switch (btype) {
                                                    case "swap" { 
                                                        total_swaps += 1;
                                                        // Add volumes for both tokens
                                                        for ((k, v) in fields.vals()) {
                                                            if (k == "token_in" or k == "token_out") {
                                                                switch(v) {
                                                                    case (#Text(t)) {
                                                                        let token = Principal.fromText(t);
                                                                        let amount_key = if (k == "token_in") "amount_in_e8s" else "amount_out_e8s";
                                                                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == amount_key })) {
                                                                            case (?(_, #Nat(amount))) {
                                                                                let current = Option.get(volume_map.get(token), 0);
                                                                                volume_map.put(token, current + amount);
                                                                            };
                                                                            case _ {};
                                                                        };
                                                                    };
                                                                    case _ {};
                                                                };
                                                            };
                                                        };
                                                    };
                                                    case "transfer" { 
                                                        total_transfers += 1;
                                                        // Add transfer volume
                                                        switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, v)) { k == "token" })) {
                                                            case (?(_, #Text(t))) {
                                                                let token = Principal.fromText(t);
                                                                switch (Array.find<(Text, ICRC3.Value)>(fields, func((k, _)) { k == "amount_e8s" })) {
                                                                    case (?(_, #Nat(amount))) {
                                                                        let current = Option.get(volume_map.get(token), 0);
                                                                        volume_map.put(token, current + amount);
                                                                    };
                                                                    case _ {};
                                                                };
                                                            };
                                                            case _ {};
                                                        };
                                                    };
                                                    case "deposit" { total_deposits += 1 };
                                                    case "withdraw" { total_withdraws += 1 };
                                                    case _ {};
                                                };
                                            };
                                            case _ {};
                                        };
                                    };
                                };
                            };
                            case _ {};
                        };
                    };
                    case _ {};
                };
            };

            {
                total_swaps;
                total_transfers;
                total_deposits;
                total_withdraws;
                volume_by_token = Iter.toArray(volume_map.entries());
            }
        };
    };
};

