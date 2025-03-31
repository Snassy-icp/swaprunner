import { Principal } from '@dfinity/principal';
import { backendService } from './backend';

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
    logo_url?: string;
}

export interface PaymentStatus {
    current_balance_e8s: bigint;
    required_fee_e8s: bigint;
    is_paid: boolean;
}

class AllocationService {
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
        const result = await actor.activate_allocation(allocationId);
        
        if ('err' in result) {
            throw new Error(result.err);
        }
    }

    /**
     * Claim from an allocation
     */
    async claimAllocation(achievementId: string, allocationId: string): Promise<bigint> {
        const actor = await backendService.getActor();
        const result = await actor.claim_allocation(achievementId, allocationId);
        
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
        claimable_amount: {
            min_e8s: bigint;
            max_e8s: bigint;
        };
    }[]> {
        const actor = await backendService.getActor();
        const result = await actor.get_available_claims();
        return result;
    }

    /**
     * Get all available achievements
     */
    async getAllAchievements(): Promise<Achievement[]> {
        const actor = await backendService.getActor();
        return await actor.get_all_achievements();
    }

    /**
     * Derive the subaccount for an allocation's payment
     * Uses the last 3 bytes to encode the allocation ID
     */
    private derivePaymentSubaccount(allocationId: string): Uint8Array {
        // Create a 32-byte array filled with zeros
        const subaccount = new Uint8Array(32);
        
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
     * Get the payment status for an allocation
     */
    async getPaymentStatus(allocationId: string): Promise<PaymentStatus> {
        const actor = await backendService.getActor();
        const result = await actor.get_allocation_payment_status(allocationId);
        
        if ('ok' in result) {
            return {
                current_balance_e8s: result.ok.current_balance_e8s,
                required_fee_e8s: result.ok.required_fee_e8s,
                is_paid: result.ok.is_paid
            };
        } else {
            throw new Error(result.err);
        }
    }

    /**
     * Pay for an allocation by transferring ICP to its subaccount
     */
    async payForAllocation(allocationId: string): Promise<void> {
        const actor = await backendService.getActor();
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

        // Execute ICRC1 transfer to the backend's subaccount
        const result = await actor.pay_for_allocation({
            allocation_id: allocationId,
            amount_e8s: remainingAmount
        });

        if ('err' in result) {
            throw new Error(result.err);
        }
    }
}

export const allocationService = new AllocationService(); 