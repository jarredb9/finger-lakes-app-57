import { createClient } from '@/utils/supabase/client';
import { User } from '@/lib/stores/userStore';

export class ProfileService {
  /**
   * Fetches the user profile from the profiles table.
   * Includes retry logic to handle potential race conditions during account creation.
   */
  static async fetchProfile(userId: string): Promise<User | null> {
    const supabase = createClient();
    let retries = 5;
    
    while (retries > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, privacy_level')
        .eq('id', userId)
        .single();

      if (!error && data) {
        return {
          id: data.id,
          full_name: data.name || 'User',
          email: data.email || '',
          privacy_level: data.privacy_level
        };
      }
      
      if (retries > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      retries--;
    }

    return null;
  }

  /**
   * Updates the user's profile privacy level using the update_profile_privacy RPC.
   */
  static async updatePrivacyLevel(level: 'public' | 'friends_only' | 'private'): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.rpc('update_profile_privacy', {
      p_privacy_level: level
    });

    if (error) throw error;
  }
}
