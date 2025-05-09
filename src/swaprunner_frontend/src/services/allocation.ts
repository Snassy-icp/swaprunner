import { Principal } from '@dfinity/principal';
import { backendService } from './backend';
import { ICRC1Service } from './icrc1_service';
import { encodeIcrcAccount } from "@dfinity/ledger-icrc";
import { formatHex } from '../utils/subaccounts';
import { principalToSubAccount } from '@dfinity/utils';
import { getCachedTokenMetadata } from '../utils/format';
export interface Allocation {
    id: string;
    creator: string;
    achievement_id: string;
    token: {
        canister_id: string;
        total_amount_e8s: bigint;
        per_user: {
            min_e8s: bigint;
            max_e8s: bigint;
        };
    };
    created_at: number;
}

export type AllocationStatus = 'Draft' | 'Funded' | 'Active' | 'Depleted' | 'Cancelled';

export interface AllocationWithStatus {
    allocation: Allocation;
    status: AllocationStatus;
}

export interface AllocationFeeConfig {
    icp_fee_e8s: bigint;
    cut_basis_points: number;
}

export interface CreateAllocationArgs {
    achievement_id: string;
    token_canister_id: Principal;
    total_amount_e8s: bigint;
    per_user_min_e8s: bigint;
    per_user_max_e8s: bigint;
}

export interface Achievement {
    id: string;
    name: string;
    description: string;
    criteria: string;
    logo_url?: string;
}

export interface PaymentStatus {
    current_balance_e8s: bigint;
    required_fee_e8s: bigint;
    is_paid: boolean;
}

interface AllocationClaim {
    allocation_id: string;
    user: string;
    amount_e8s: bigint;
    claimed_at: bigint;
}

export interface SponsorInfo {
    principal: string;
    name: string;
    logo_url: string | null;
}

export interface ClaimWithSponsor {
    achievement_id: string;
    allocation_id: string;
    token_canister_id: string;
    claimable_amount: {
        min_e8s: bigint;
        max_e8s: bigint;
    };
    sponsor: SponsorInfo;
}

export interface UserClaimWithSponsor {
    allocation: Allocation;
    claim: {
        allocation_id: string;
        user: string;
        amount_e8s: bigint;
        claimed_at: bigint;
    };
    sponsor: SponsorInfo;
}

class AllocationService {
    private icrc1Service = new ICRC1Service();

    /**
     * Create a new allocation
     */
    async createAllocation(args: CreateAllocationArgs): Promise<string> {
        const actor = await backendService.getActor();
        const result = await actor.create_allocation(args);
        
        if ('ok' in result) {
            return result.ok;
        } else {
            throw new Error(result.err);
        }
    }

    /**
     * Get all allocations created by the current user
     */
    async getMyCreatedAllocations(): Promise<AllocationWithStatus[]> {
        const actor = await backendService.getActor();
        const result = await actor.get_my_created_allocations();
        
        if ('ok' in result) {
            // Convert status variants to strings
            return result.ok.map((item: { allocation: Allocation; status: { [key: string]: null } }) => ({
                allocation: item.allocation,
                status: Object.keys(item.status)[0] as AllocationStatus
            }));
        } else {
            throw new Error(result.err);
        }
    }

    /**
     * Get the current allocation fee configuration
     */
    async getFeeConfig(): Promise<AllocationFeeConfig> {
        const actor = await backendService.getActor();
        return await actor.get_allocation_fee_config();
    }

    /**
     * Activate an allocation with the specified ID
     */
    async activateAllocation(allocationId: string): Promise<void> {
        const actor = await backendService.getActor();
        const result = await actor.activate_allocation(BigInt(allocationId));
        
        if ('err' in result) {
            throw new Error(result.err);
        }
    }

    /**
     * Claim from an allocation
     */
    async claimAllocation(achievementId: string, allocationId: string): Promise<bigint> {
        const actor = await backendService.getActor();
        const result = await actor.claim_allocation(BigInt(allocationId));
        
        if ('ok' in result) {
            return result.ok;
        } else {
            throw new Error(result.err);
        }
    }

    async claimAndWithdrawAllocation(allocationId: string): Promise<bigint> {
        const actor = await backendService.getActor();
        const result = await actor.claim_and_withdraw_allocation(BigInt(allocationId));
        
        if ('ok' in result) {
            return result.ok;
        } else {
            throw new Error(result.err);
        }
    }

    /**
     * Get all available claims for the current user
     */
    async getAvailableClaims(): Promise<{
        achievement_id: string;
        allocation_id: string;
        token_canister_id: string;
        claimable_amount: {
            min_e8s: bigint;
            max_e8s: bigint;
        };
    }[]> {
        const actor = await backendService.getActor();
        console.log('Getting available claims...');
        const claims = await actor.get_available_claims();
        console.log('Available claims:', claims);
        return claims;
    }

    /**
     * Get all available achievements
     */
    async getAllAchievements(): Promise<Achievement[]> {
        const actor = await backendService.getActor();
        return await actor.get_all_achievements();
    }

    private derivePaymentSubaccount(allocationId: string): Uint8Array {
        const principal = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'); // ICP ledger
        return this.deriveBackendSubaccount(principal, allocationId);
    }

    /**
     * Derive the subaccount for an allocation's payment
     * Uses the principal's bytes as the base subaccount, then modifies the last 3 bytes with the allocation ID
     */
    public deriveBackendSubaccount(principal: Principal, allocationId: string): Uint8Array {
        // Convert principal to bytes for the subaccount

        let principalBytes = principalToSubAccount(principal);

        const subaccount = new Uint8Array(32);
        
        // Copy principal bytes into subaccount
        subaccount.set(principalBytes.slice(0, 29), 0);
        // call service method to turn subaccount into hex
        let hex =  formatHex(Array.from(subaccount));
        // Convert allocation ID to number
        const idNum = parseInt(allocationId);
        if (isNaN(idNum)) {
            throw new Error('Invalid allocation ID format');
        }

        // Write the allocation ID to the last 3 bytes
        subaccount[29] = (idNum >> 16) & 0xFF;
        subaccount[30] = (idNum >> 8) & 0xFF;
        subaccount[31] = idNum & 0xFF;

        return subaccount;
    }

    /**
     * Get the payment status for an allocation by checking its subaccount balance on the ICP ledger
     */
    async getPaymentStatus(allocationId: string): Promise<PaymentStatus> {
        const feeConfig = await this.getFeeConfig();
        const allocation = await this.getAllocation(allocationId);
        if (!allocation) {
            throw new Error('Allocation not found');
        }
        
        // Get the subaccount for this allocation
        const subaccount = this.derivePaymentSubaccount(allocationId);

        // Get balance using ICRC1 service
        const { balance_e8s } = await this.icrc1Service.getOwnerBalanceWithSubaccount(
            'ryjl3-tyaaa-aaaaa-aaaba-cai', // ICP ledger
            Principal.fromText(process.env.CANISTER_ID_SWAPRUNNER_BACKEND!),
            Array.from(subaccount)
        );
        
        // For ICP allocations, cap the current balance at the platform fee
        const current_balance = allocation.token.canister_id.toString() === 'ryjl3-tyaaa-aaaaa-aaaba-cai'
            ? balance_e8s > feeConfig.icp_fee_e8s ? feeConfig.icp_fee_e8s : balance_e8s
            : balance_e8s;

        return {
            current_balance_e8s: current_balance,
            required_fee_e8s: feeConfig.icp_fee_e8s,
            is_paid: current_balance >= feeConfig.icp_fee_e8s
        };
    }

    /**
     * Get the payment account string for an allocation
     * Returns the long account string format that includes both the owner (ICP ledger) and subaccount
     */
    getPaymentAccount(allocationId: string): string {
        const subaccount = this.derivePaymentSubaccount(allocationId);
        return encodeIcrcAccount({
            owner: Principal.fromText(process.env.CANISTER_ID_SWAPRUNNER_BACKEND!),
            subaccount: Array.from(subaccount)
        });
    }

    /**
     * Get the funding account string for an allocation
     * Returns the long account string format that includes both the owner (token canister) and subaccount
     */
    getFundingAccount(allocationId: string, tokenId: string): string {
        const subaccount = this.deriveBackendSubaccount(Principal.fromText(tokenId), allocationId);
        return encodeIcrcAccount({
            owner: Principal.fromText(process.env.CANISTER_ID_SWAPRUNNER_BACKEND!),
            subaccount: Array.from(subaccount)
        });
    }

    /**
     * Get the current funding balance for an allocation
     */
    async getFundingBalance(allocationId: string, topup?: boolean): Promise<bigint> {
        const allocation = await this.getAllocation(allocationId);
        if (!allocation) {
            throw new Error('Allocation not found');
        }

        const subaccount = this.deriveBackendSubaccount(
            Principal.fromText(allocation.token.canister_id.toString()),
            allocationId
        );

        const { balance_e8s } = await this.icrc1Service.getOwnerBalanceWithSubaccount(
            allocation.token.canister_id.toString(),
            Principal.fromText(process.env.CANISTER_ID_SWAPRUNNER_BACKEND!),
            Array.from(subaccount)
        );
        const token_metadata = getCachedTokenMetadata(allocation.token.canister_id.toString());
        const token_tx_fee = token_metadata?.fee || BigInt(0); // Default to 10000 e8s if fee not found
        
        // If this is an ICP allocation, subtract the platform fee from the available balance
        if (allocation.token.canister_id.toString() === 'ryjl3-tyaaa-aaaaa-aaaba-cai' && !topup) {
            const feeConfig = await this.getFeeConfig();
            console.log('XXXXXXXX balance_e8s', balance_e8s);
            const out = balance_e8s > feeConfig.icp_fee_e8s ? (balance_e8s > feeConfig.icp_fee_e8s + token_tx_fee ? balance_e8s - feeConfig.icp_fee_e8s - token_tx_fee : balance_e8s - feeConfig.icp_fee_e8s) : BigInt(0);
            console.log('YYYYYY balance_e8s', out);
            return out;
        }
        console.log('AAAAAAAA balance_e8s', balance_e8s);
        return balance_e8s > token_tx_fee ? balance_e8s - token_tx_fee : balance_e8s;
    }

    /**
     * Fund an allocation by transferring tokens to its subaccount
     */
    async fundAllocation(allocationId: string): Promise<void> {
        const allocation = await this.getAllocation(allocationId);
        if (!allocation) {
            throw new Error('Allocation not found');
        }

        const token_metadata = getCachedTokenMetadata(allocation.token.canister_id.toString());
        const token_tx_fee = token_metadata?.fee || BigInt(0); // Default to 10000 e8s if fee not found
        const currentBalance = await this.getFundingBalance(allocationId);
        const remainingAmount = allocation.token.total_amount_e8s + token_tx_fee - currentBalance;
        
        if (remainingAmount <= BigInt(0)) {
            throw new Error('Allocation is already fully funded');
        }

        const subaccount = this.deriveBackendSubaccount(
            Principal.fromText(allocation.token.canister_id.toString()),
            allocationId
        );

        await this.icrc1Service.transfer({
            tokenId: allocation.token.canister_id.toString(),
            to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
            amount_e8s: remainingAmount.toString(),
            subaccount: subaccount
        });
    }

    /**
     * Helper method to get a single allocation by ID
     */
    private async getAllocation(allocationId: string): Promise<Allocation | null> {
        try {
            const actor = await backendService.getActor();
            const result = await actor.get_allocation(allocationId);
            if ('ok' in result) {
                return result.ok.allocation;
            }
            return null;
        } catch (err) {
            console.error('Error getting allocation:', err);
            return null;
        }
    }

    /**
     * Pay for an allocation by transferring ICP to its subaccount
     */
    async payForAllocation(allocationId: string): Promise<void> {
        const paymentStatus = await this.getPaymentStatus(allocationId);
        
        if (paymentStatus.is_paid) {
            throw new Error('Allocation is already paid for');
        }

        const remainingAmount = paymentStatus.required_fee_e8s - paymentStatus.current_balance_e8s;
        if (remainingAmount <= BigInt(0)) {
            throw new Error('No payment required');
        }

        // Get the subaccount for this allocation
        const subaccount = this.derivePaymentSubaccount(allocationId);

        // Transfer ICP to the backend's subaccount using ICRC1 transfer
        await this.icrc1Service.transfer({
            tokenId: 'ryjl3-tyaaa-aaaaa-aaaba-cai', // ICP ledger
            to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
            amount_e8s: remainingAmount.toString(),
            subaccount: subaccount
        });
    }

    /**
     * Get the remaining balance for an allocation
     */
    async getAllocationBalance(allocationId: string): Promise<bigint> {
        const actor = await backendService.getActor();
        const allocation = await this.getAllocation(allocationId);
        if (!allocation) {
            throw new Error('Allocation not found');
        }
        return await actor.get_allocation_balance(BigInt(allocationId), Principal.fromText(allocation.token.canister_id.toString()));
    }

    /**
     * Cancel an allocation
     */
    async cancelAllocation(allocationId: string): Promise<void> {
        const actor = await backendService.getActor();
        const result = await actor.cancel_allocation(BigInt(allocationId));
        
        if ('err' in result) {
            throw new Error(result.err);
        }
    }

    /**
     * Get all claims for the current user
     */
    async getUserClaims(): Promise<{
        allocation: Allocation;
        claim: {
            allocation_id: string;
            user: string;
            amount_e8s: bigint;
            claimed_at: bigint;
        };
    }[]> {
        const actor = await backendService.getActor();
        return actor.get_user_claims();
    }

    /**
     * Pay and fund an ICP allocation in one transaction
     */
    async payAndFundAllocation(allocationId: string): Promise<void> {
        const allocation = await this.getAllocation(allocationId);
        if (!allocation) {
            throw new Error('Allocation not found');
        }

        if (allocation.token.canister_id.toString() !== 'ryjl3-tyaaa-aaaaa-aaaba-cai') {
            throw new Error('This method is only for ICP allocations');
        }

        const paymentStatus = await this.getPaymentStatus(allocationId);
        const fundingBalance = await this.getFundingBalance(allocationId);
        const feeConfig = await this.getFeeConfig();
        const icp_tx_fee = BigInt(10000);
        const remainingPayment = paymentStatus.required_fee_e8s - paymentStatus.current_balance_e8s;
        const remainingFunding = allocation.token.total_amount_e8s + icp_tx_fee - fundingBalance;
        
        if (remainingPayment <= BigInt(0) && remainingFunding <= BigInt(0)) {
            throw new Error('Allocation is already fully paid and funded');
        }

        // Get the funding subaccount
        const subaccount = this.deriveBackendSubaccount(
            Principal.fromText(allocation.token.canister_id.toString()),
            allocationId
        );

        // Transfer total required amount (remaining payment + remaining funding)
        const totalRequired = remainingPayment + remainingFunding;
        console.log('payAndFundAllocation totalRequired', totalRequired);
        if (totalRequired > BigInt(0)) {
            await this.icrc1Service.transfer({
                tokenId: allocation.token.canister_id.toString(),
                to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
                amount_e8s: totalRequired.toString(),
                subaccount: subaccount
            });
        }
    }

    /**
     * Get all claims for a specific allocation
     */
    async getAllocationClaims(allocationId: string): Promise<{
        user: string;
        amount_e8s: bigint;
        claimed_at: bigint;
    }[]> {
        const actor = await backendService.getActor();
        return actor.get_allocation_claims(allocationId);
    }

    /**
     * Top up an allocation with additional funds
     */
    async topUpAllocation(allocationId: string, amount_e8s: bigint): Promise<void> {
        const actor = await backendService.getActor();
        const result = await actor.top_up_allocation(BigInt(allocationId), amount_e8s);
        
        if ('err' in result) {
            throw new Error(result.err);
        }
    }

    /**
     * Cancel a top-up and return funds to wallet
     */
    async cancelTopUp(allocationId: string): Promise<void> {
        const actor = await backendService.getActor();
        const result = await actor.cancel_top_up(BigInt(allocationId));
        
        if ('err' in result) {
            throw new Error(result.err);
        }
    }

    async getSponsorClaims(sponsorId: string): Promise<AllocationClaim[]> {
        const actor = await backendService.getActor();
        const claims = await actor.get_all_allocation_claims();
        return claims.filter((claim: AllocationClaim) => claim.user.toString() === sponsorId);
    }

    async getSponsorAllocations(sponsorId: string): Promise<{
        allocation: Allocation;
        status: string;
    }[]> {
        const actor = await backendService.getActor();
        const allAllocations = await actor.get_all_user_allocations();
        return allAllocations.filter((a: { allocation: Allocation }) => a.allocation.creator.toString() === sponsorId);
    }

    /**
     * Get all available claims with sponsor information for the current user
     */
    async getAvailableClaimsWithSponsors(): Promise<ClaimWithSponsor[]> {
        const actor = await backendService.getActor();
        console.log('Getting available claims with sponsors...');
        const claims = await actor.get_available_claims_with_sponsors();
        console.log('Available claims with sponsors:', claims);
        return claims;
    }

    /**
     * Get all claims with sponsor information for the current user
     */
    async getUserClaimsWithSponsors(): Promise<UserClaimWithSponsor[]> {
        const actor = await backendService.getActor();
        return actor.get_user_claims_with_sponsors();
    }
}

export const allocationService = new AllocationService(); 