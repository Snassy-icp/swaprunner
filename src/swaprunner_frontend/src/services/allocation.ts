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
    token_canister_id: string;
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
            return result.ok;
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
}

export const allocationService = new AllocationService(); 