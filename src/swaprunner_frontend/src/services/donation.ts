import { Principal } from '@dfinity/principal';
import { backendService } from './backend';
import { authService } from './auth';

export interface DonationEvent {
  donor: string;
  token_ledger_id: string;
  amount_e8s: bigint;
  tx_id: string;
  usd_value: number;
  timestamp: bigint;
}

interface BackendDonationEvent {
  donor: Principal;
  token_ledger_id: string;
  amount_e8s: bigint;
  tx_id: string;
  usd_value: number;
  timestamp: bigint;
}

class DonationService {
  async getUserDonations(): Promise<DonationEvent[]> {
    try {
      const principal = authService.getPrincipal();
      if (!principal) {
        throw new Error('Principal not found');
      }
      const actor = await backendService.getActor();
      const donations = await actor.get_user_donations(principal);
      // Convert Principal to string in the donor field
      return donations.map((donation: BackendDonationEvent) => ({
        ...donation,
        donor: donation.donor.toString()
      }));
    } catch (error) {
      console.error('Failed to get user donations:', error);
      return [];
    }
  }
}

export const donationService = new DonationService(); 