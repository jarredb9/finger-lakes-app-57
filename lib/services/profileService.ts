import { createClient } from '@/utils/supabase/client';
import { User } from '@/lib/stores/userStore';

export class ProfileService {
  /**
   * Fetches the user profile from the profiles table.
   * Resolves email via supabase.auth.getUser() to respect column-level SELECT revocation on profiles.email.
   * Includes retry logic to handle potential race conditions during account creation.
   */
  static async fetchProfile(userId: string): Promise<User | null> {
    const supabase = createClient();
    let email = '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === userId && user.email) {
        email = user.email;
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user?.id === userId && sessionData.session.user.email) {
          email = sessionData.session.user.email;
        }
      }
    } catch {
      // Graceful degradation when offline or disconnected
    }

    let retries = 5;
    
    while (retries > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, privacy_level, ai_enabled')
        .eq('id', userId)
        .single();

      if (!error && data) {
        return {
          id: data.id,
          full_name: data.name || 'User',
          email,
          privacy_level: data.privacy_level ?? undefined,
          ai_enabled: data.ai_enabled ?? false,
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

  /**
   * Updates the user's AI enabled preference setting.
   */
  static async updateAIEnabled(enabled: boolean): Promise<void> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({ ai_enabled: enabled })
      .eq('id', user.id);

    if (error) throw error;
  }
}
