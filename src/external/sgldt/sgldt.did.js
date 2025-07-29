export const idlFactory = ({ IDL }) => {
  const ArchivedTransactionResponse = IDL.Rec();
  const Value = IDL.Rec();
  const Value__1 = IDL.Rec();
  const Result_1 = IDL.Variant({ 'ok' : IDL.Nat, 'err' : IDL.Text });
  const Fee = IDL.Variant({ 'Environment' : IDL.Null, 'Fixed' : IDL.Nat });
  Value.fill(
    IDL.Variant({
      'Int' : IDL.Int,
      'Map' : IDL.Vec(IDL.Tuple(IDL.Text, Value)),
      'Nat' : IDL.Nat,
      'Blob' : IDL.Vec(IDL.Nat8),
      'Text' : IDL.Text,
      'Array' : IDL.Vec(Value),
    })
  );
  const Subaccount = IDL.Vec(IDL.Nat8);
  const Account = IDL.Record({
    'owner' : IDL.Principal,
    'subaccount' : IDL.Opt(Subaccount),
  });
  const UpdateLedgerInfoRequest__2 = IDL.Variant({
    'Fee' : Fee,
    'Metadata' : IDL.Tuple(IDL.Text, IDL.Opt(Value)),
    'Symbol' : IDL.Text,
    'Logo' : IDL.Text,
    'Name' : IDL.Text,
    'MaxSupply' : IDL.Opt(IDL.Nat),
    'MaxMemo' : IDL.Nat,
    'MinBurnAmount' : IDL.Opt(IDL.Nat),
    'TransactionWindow' : IDL.Nat64,
    'PermittedDrift' : IDL.Nat64,
    'SettleToAccounts' : IDL.Nat,
    'MintingAccount' : Account,
    'FeeCollector' : IDL.Opt(Account),
    'MaxAccounts' : IDL.Nat,
    'Decimals' : IDL.Nat8,
  });
  const Fee__1 = IDL.Variant({
    'ICRC1' : IDL.Null,
    'Environment' : IDL.Null,
    'Fixed' : IDL.Nat,
  });
  const MaxAllowance = IDL.Variant({
    'TotalSupply' : IDL.Null,
    'Fixed' : IDL.Nat,
  });
  const UpdateLedgerInfoRequest__1 = IDL.Variant({
    'Fee' : Fee__1,
    'MaxAllowance' : IDL.Opt(MaxAllowance),
    'MaxApprovalsPerAccount' : IDL.Nat,
    'MaxApprovals' : IDL.Nat,
    'SettleToApprovals' : IDL.Nat,
  });
  const UpdateLedgerInfoRequest = IDL.Variant({
    'Fee' : Fee__1,
    'MaxBalances' : IDL.Nat,
    'MaxTransfers' : IDL.Nat,
  });
  const Result = IDL.Variant({
    'ok' : IDL.Tuple(IDL.Nat, IDL.Nat),
    'err' : IDL.Text,
  });
  const Tip = IDL.Record({
    'last_block_index' : IDL.Vec(IDL.Nat8),
    'hash_tree' : IDL.Vec(IDL.Nat8),
    'last_block_hash' : IDL.Vec(IDL.Nat8),
  });
  const SupportedStandard = IDL.Record({ 'url' : IDL.Text, 'name' : IDL.Text });
  const Balance = IDL.Nat;
  const MetaDatum = IDL.Tuple(IDL.Text, Value);
  const Memo = IDL.Vec(IDL.Nat8);
  const Timestamp = IDL.Nat64;
  const TransferArgs = IDL.Record({
    'to' : Account,
    'fee' : IDL.Opt(Balance),
    'memo' : IDL.Opt(Memo),
    'from_subaccount' : IDL.Opt(Subaccount),
    'created_at_time' : IDL.Opt(Timestamp),
    'amount' : Balance,
  });
  const TxIndex = IDL.Nat;
  const TransferError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'BadBurn' : IDL.Record({ 'min_burn_amount' : Balance }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : TxIndex }),
    'BadFee' : IDL.Record({ 'expected_fee' : Balance }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : Timestamp }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : Balance }),
  });
  const TransferResult = IDL.Variant({ 'Ok' : TxIndex, 'Err' : TransferError });
  const AllowanceArgs = IDL.Record({
    'account' : Account,
    'spender' : Account,
  });
  const Allowance = IDL.Record({
    'allowance' : IDL.Nat,
    'expires_at' : IDL.Opt(IDL.Nat64),
  });
  const ApproveArgs = IDL.Record({
    'fee' : IDL.Opt(IDL.Nat),
    'memo' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'from_subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'created_at_time' : IDL.Opt(IDL.Nat64),
    'amount' : IDL.Nat,
    'expected_allowance' : IDL.Opt(IDL.Nat),
    'expires_at' : IDL.Opt(IDL.Nat64),
    'spender' : Account,
  });
  const ApproveError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'AllowanceChanged' : IDL.Record({ 'current_allowance' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'TooOld' : IDL.Null,
    'Expired' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const ApproveResponse = IDL.Variant({ 'Ok' : IDL.Nat, 'Err' : ApproveError });
  const TransferFromArgs = IDL.Record({
    'to' : Account,
    'fee' : IDL.Opt(IDL.Nat),
    'spender_subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'from' : Account,
    'memo' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'created_at_time' : IDL.Opt(IDL.Nat64),
    'amount' : IDL.Nat,
  });
  const TransferFromError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'InsufficientAllowance' : IDL.Record({ 'allowance' : IDL.Nat }),
    'BadBurn' : IDL.Record({ 'min_burn_amount' : IDL.Nat }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const TransferFromResponse = IDL.Variant({
    'Ok' : IDL.Nat,
    'Err' : TransferFromError,
  });
  const GetArchivesArgs = IDL.Record({ 'from' : IDL.Opt(IDL.Principal) });
  const GetArchivesResultItem = IDL.Record({
    'end' : IDL.Nat,
    'canister_id' : IDL.Principal,
    'start' : IDL.Nat,
  });
  const GetArchivesResult = IDL.Vec(GetArchivesResultItem);
  const TransactionRange = IDL.Record({
    'start' : IDL.Nat,
    'length' : IDL.Nat,
  });
  const GetBlocksArgs = IDL.Vec(TransactionRange);
  Value__1.fill(
    IDL.Variant({
      'Int' : IDL.Int,
      'Map' : IDL.Vec(IDL.Tuple(IDL.Text, Value__1)),
      'Nat' : IDL.Nat,
      'Blob' : IDL.Vec(IDL.Nat8),
      'Text' : IDL.Text,
      'Array' : IDL.Vec(Value__1),
    })
  );
  const GetTransactionsResult = IDL.Record({
    'log_length' : IDL.Nat,
    'blocks' : IDL.Vec(IDL.Record({ 'id' : IDL.Nat, 'block' : Value__1 })),
    'archived_blocks' : IDL.Vec(ArchivedTransactionResponse),
  });
  const GetTransactionsFn = IDL.Func(
      [IDL.Vec(TransactionRange)],
      [GetTransactionsResult],
      ['query'],
    );
  ArchivedTransactionResponse.fill(
    IDL.Record({
      'args' : IDL.Vec(TransactionRange),
      'callback' : GetTransactionsFn,
    })
  );
  const GetBlocksResult = IDL.Record({
    'log_length' : IDL.Nat,
    'blocks' : IDL.Vec(IDL.Record({ 'id' : IDL.Nat, 'block' : Value__1 })),
    'archived_blocks' : IDL.Vec(ArchivedTransactionResponse),
  });
  const DataCertificate = IDL.Record({
    'certificate' : IDL.Vec(IDL.Nat8),
    'hash_tree' : IDL.Vec(IDL.Nat8),
  });
  const BlockType = IDL.Record({ 'url' : IDL.Text, 'block_type' : IDL.Text });
  const BalanceQueryArgs = IDL.Record({ 'accounts' : IDL.Vec(Account) });
  const BalanceQueryResult = IDL.Vec(IDL.Nat);
  const TransferBatchArgs = IDL.Vec(TransferArgs);
  const TransferBatchError = IDL.Variant({
    'TooManyRequests' : IDL.Record({ 'limit' : IDL.Nat }),
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'BadBurn' : IDL.Record({ 'min_burn_amount' : IDL.Nat }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'GenericBatchError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const TransferBatchResult = IDL.Variant({
    'Ok' : IDL.Nat,
    'Err' : TransferBatchError,
  });
  const TransferBatchResults = IDL.Vec(IDL.Opt(TransferBatchResult));
  const Stats = IDL.Record({ 'totalSupply' : IDL.Nat, 'holders' : IDL.Nat });
  return IDL.Service({
    'admin_collect_fees' : IDL.Func([], [Result_1], []),
    'admin_update_authorized_fee_collector' : IDL.Func(
        [IDL.Principal],
        [IDL.Bool],
        [],
      ),
    'admin_update_fee_collector' : IDL.Func([IDL.Principal], [IDL.Bool], []),
    'admin_update_gldt_conversion_fee' : IDL.Func([IDL.Nat], [IDL.Bool], []),
    'admin_update_gldt_transaction_fee' : IDL.Func([IDL.Nat], [IDL.Bool], []),
    'admin_update_icrc1' : IDL.Func(
        [IDL.Vec(UpdateLedgerInfoRequest__2)],
        [IDL.Vec(IDL.Bool)],
        [],
      ),
    'admin_update_icrc2' : IDL.Func(
        [IDL.Vec(UpdateLedgerInfoRequest__1)],
        [IDL.Vec(IDL.Bool)],
        [],
      ),
    'admin_update_icrc4' : IDL.Func(
        [IDL.Vec(UpdateLedgerInfoRequest)],
        [IDL.Vec(IDL.Bool)],
        [],
      ),
    'admin_update_owner' : IDL.Func([IDL.Principal], [IDL.Bool], []),
    'clearLog' : IDL.Func([], [], []),
    'deposit' : IDL.Func([IDL.Opt(IDL.Vec(IDL.Nat8)), IDL.Nat], [Result], []),
    'deposit_cycles' : IDL.Func([], [], []),
    'getLastError' : IDL.Func([], [IDL.Text, IDL.Int], ['query']),
    'get_accumulated_fees' : IDL.Func([], [IDL.Nat], ['query']),
    'get_authorized_fee_collector' : IDL.Func([], [IDL.Principal], ['query']),
    'get_fee_breakdown' : IDL.Func(
        [],
        [
          IDL.Record({
            'sgldt_transfer_fee' : IDL.Nat,
            'gldt_ledger_fee' : IDL.Nat,
            'canister_withdraw_fee' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'get_fee_collector' : IDL.Func([], [IDL.Principal], ['query']),
    'get_fee_stats' : IDL.Func(
        [],
        [
          IDL.Record({
            'total_deposit_fees' : IDL.Nat,
            'total_withdraw_fees' : IDL.Nat,
            'total_ledger_fees' : IDL.Nat,
            'accumulated_fees' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'get_log' : IDL.Func([], [IDL.Vec(IDL.Text)], ['query']),
    'get_sgldt_balance' : IDL.Func([], [IDL.Nat], ['query']),
    'get_tip' : IDL.Func([], [Tip], ['query']),
    'holders' : IDL.Func(
        [
          IDL.Opt(IDL.Nat),
          IDL.Opt(IDL.Nat),
          IDL.Opt(Account),
          IDL.Opt(IDL.Nat),
        ],
        [IDL.Vec(IDL.Tuple(Account, IDL.Nat))],
        ['query'],
      ),
    'icrc10_supported_standards' : IDL.Func(
        [],
        [IDL.Vec(SupportedStandard)],
        ['query'],
      ),
    'icrc1_balance_of' : IDL.Func([Account], [Balance], ['query']),
    'icrc1_decimals' : IDL.Func([], [IDL.Nat8], ['query']),
    'icrc1_fee' : IDL.Func([], [Balance], ['query']),
    'icrc1_metadata' : IDL.Func([], [IDL.Vec(MetaDatum)], ['query']),
    'icrc1_minting_account' : IDL.Func([], [IDL.Opt(Account)], ['query']),
    'icrc1_name' : IDL.Func([], [IDL.Text], ['query']),
    'icrc1_supported_standards' : IDL.Func(
        [],
        [IDL.Vec(SupportedStandard)],
        ['query'],
      ),
    'icrc1_symbol' : IDL.Func([], [IDL.Text], ['query']),
    'icrc1_total_supply' : IDL.Func([], [Balance], ['query']),
    'icrc1_transfer' : IDL.Func([TransferArgs], [TransferResult], []),
    'icrc2_allowance' : IDL.Func([AllowanceArgs], [Allowance], ['query']),
    'icrc2_approve' : IDL.Func([ApproveArgs], [ApproveResponse], []),
    'icrc2_transfer_from' : IDL.Func(
        [TransferFromArgs],
        [TransferFromResponse],
        [],
      ),
    'icrc3_get_archives' : IDL.Func(
        [GetArchivesArgs],
        [GetArchivesResult],
        ['query'],
      ),
    'icrc3_get_blocks' : IDL.Func(
        [GetBlocksArgs],
        [GetBlocksResult],
        ['query'],
      ),
    'icrc3_get_tip_certificate' : IDL.Func(
        [],
        [IDL.Opt(DataCertificate)],
        ['query'],
      ),
    'icrc3_supported_block_types' : IDL.Func(
        [],
        [IDL.Vec(BlockType)],
        ['query'],
      ),
    'icrc4_balance_of_batch' : IDL.Func(
        [BalanceQueryArgs],
        [BalanceQueryResult],
        ['query'],
      ),
    'icrc4_maximum_query_batch_size' : IDL.Func(
        [],
        [IDL.Opt(IDL.Nat)],
        ['query'],
      ),
    'icrc4_maximum_update_batch_size' : IDL.Func(
        [],
        [IDL.Opt(IDL.Nat)],
        ['query'],
      ),
    'icrc4_transfer_batch' : IDL.Func(
        [TransferBatchArgs],
        [TransferBatchResults],
        [],
      ),
    'init' : IDL.Func([], [], []),
    'is_authorized_fee_collector' : IDL.Func(
        [IDL.Principal],
        [IDL.Bool],
        ['query'],
      ),
    'stats' : IDL.Func([], [Stats], ['query']),
    'withdraw' : IDL.Func([IDL.Opt(IDL.Vec(IDL.Nat8)), IDL.Nat], [Result], []),
  });
};
export const init = ({ IDL }) => { return []; };