export const idlFactory = ({ IDL }) => {
    const TxReceipt = IDL.Variant({
        'Ok': IDL.Nat,
        'Err': IDL.Variant({
            'InsufficientAllowance': IDL.Null,
            'InsufficientBalance': IDL.Null,
            'ErrorOperationStyle': IDL.Null,
            'Unauthorized': IDL.Null,
            'LedgerTrap': IDL.Null,
            'ErrorTo': IDL.Null,
            'Other': IDL.Text,
            'BlockUsed': IDL.Null,
            'AmountTooSmall': IDL.Null
        })
    });

    const Metadata = IDL.Record({
        'logo': IDL.Text,
        'name': IDL.Text,
        'symbol': IDL.Text,
        'decimals': IDL.Nat8,
        'totalSupply': IDL.Nat,
        'owner': IDL.Principal,
        'fee': IDL.Nat
    });

    const TokenInfo = IDL.Record({
        'metadata': Metadata,
        'feeTo': IDL.Principal,
        'historySize': IDL.Nat,
        'deployTime': IDL.Nat,
        'holderNumber': IDL.Nat,
        'cycles': IDL.Nat
    });

    return IDL.Service({
        'allowance': IDL.Func([IDL.Principal, IDL.Principal], [IDL.Nat], ['query']),
        'approve': IDL.Func([IDL.Principal, IDL.Nat], [TxReceipt], []),
        'balanceOf': IDL.Func([IDL.Principal], [IDL.Nat], ['query']),
        'decimals': IDL.Func([], [IDL.Nat8], ['query']),
        'getAllowanceSize': IDL.Func([], [IDL.Nat], ['query']),
        'getHolders': IDL.Func(
            [IDL.Nat, IDL.Nat],
            [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat))],
            ['query']
        ),
        'getMetadata': IDL.Func([], [Metadata], ['query']),
        'getTokenInfo': IDL.Func([], [TokenInfo], ['query']),
        'getUserApprovals': IDL.Func(
            [IDL.Principal],
            [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat))],
            ['query']
        ),
        'historySize': IDL.Func([], [IDL.Nat], ['query']),
        'logo': IDL.Func([], [IDL.Text], ['query']),
        'name': IDL.Func([], [IDL.Text], ['query']),
        'owner': IDL.Func([], [IDL.Principal], ['query']),
        'setFee': IDL.Func([IDL.Nat], [TxReceipt], []),
        'setFeeTo': IDL.Func([IDL.Principal], [TxReceipt], []),
        'setLogo': IDL.Func([IDL.Text], [TxReceipt], []),
        'setName': IDL.Func([IDL.Text], [TxReceipt], []),
        'setOwner': IDL.Func([IDL.Principal], [TxReceipt], []),
        'symbol': IDL.Func([], [IDL.Text], ['query']),
        'totalSupply': IDL.Func([], [IDL.Nat], ['query']),
        'transfer': IDL.Func([IDL.Principal, IDL.Nat], [TxReceipt], []),
        'transferFrom': IDL.Func([IDL.Principal, IDL.Principal, IDL.Nat], [TxReceipt], []),
        'mint': IDL.Func([IDL.Principal, IDL.Nat], [TxReceipt], []),
        'burn': IDL.Func([IDL.Principal, IDL.Nat], [TxReceipt], [])
    });
}; 