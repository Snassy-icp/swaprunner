import { Principal } from '@dfinity/principal';
import { backendService } from './backend';
import { Account } from '../../../declarations/swaprunner_backend/swaprunner_backend.did';

export type { Account };

class AccountService {
    async getPaymentAccount(): Promise<Account | null> {
        const actor = await backendService.getActor();
        const result = await actor.get_payment_account();
        // Handle the optional Account from backend
        return result[0] ?? null;
    }

    async getCutAccount(): Promise<Account | null> {
        const actor = await backendService.getActor();
        const result = await actor.get_cut_account();
        // Handle the optional Account from backend
        return result[0] ?? null;
    }

    async updatePaymentAccount(owner: Principal, subaccount?: number[]): Promise<void> {
        const actor = await backendService.getActor();
        const result = await actor.update_payment_account({
            owner,
            'subaccount': subaccount ? [subaccount] : []
        });
        if ('err' in result) {
            throw new Error(result.err);
        }
    }

    async updateCutAccount(owner: Principal, subaccount?: number[]): Promise<void> {
        const actor = await backendService.getActor();
        const result = await actor.update_cut_account({
            owner,
            'subaccount': subaccount ? [subaccount] : []
        });
        if ('err' in result) {
            throw new Error(result.err);
        }
    }
}

export const accountService = new AccountService(); 