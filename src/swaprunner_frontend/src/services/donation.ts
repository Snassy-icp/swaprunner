import { Principal } from '@dfinity/principal';
import { backendService } from './backend';

export interface DonationEvent {
  donor: string;
  token_ledger_id: string;
  amount_e8s: bigint;
  tx_id: string;
  usd_value: number;
  timestamp: bigint;
}

class DonationService {
  async getUserDonations(): Promise<DonationEvent[]> {
    try {
      const actor = await backendService.getActor();
      const principal = await actor.get_principal();
      if (!principal) {
        throw new Error('Principal not found');
      }
      return actor.get_user_donations(principal);
    } catch (error) {
      console.error('Failed to get user donations:', error);
      return [];
    }
  }
}

export const donationService = new DonationService(); 