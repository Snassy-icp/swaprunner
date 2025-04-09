export interface ClaimableReward {
    achievement_id: string;
    allocation_id: string;
    token_canister_id: string;
    claimable_amount: {
        min_e8s: bigint;
        max_e8s: bigint;
    };
    sponsor: {
        principal: string;
        name: string;
        logo_url: string | null;
    };
} 