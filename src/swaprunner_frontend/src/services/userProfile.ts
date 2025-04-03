import { Principal } from '@dfinity/principal';
import { backendService } from './backend';

export interface UserProfile {
  principal: Principal;
  name: string;
  description: string;
  logo_url?: string;
  social_links: {
    platform: string;
    url: string;
  }[];
  created_at: number;
  updated_at: number;
  created_by: Principal;
  verified: boolean;
}

class UserProfileService {
  async getUserProfile(principal: Principal): Promise<UserProfile | null> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.getUserProfile(principal);
      if ('ok' in result) {
        return result.ok;
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  async isVerified(principal: Principal): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(principal);
      return profile?.verified ?? false;
    } catch (error) {
      console.error('Error checking verification status:', error);
      return false;
    }
  }
}

export const userProfileService = new UserProfileService(); 