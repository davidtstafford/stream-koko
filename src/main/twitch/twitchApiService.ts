// Twitch API Service for moderation and viewer management
// Uses Twitch Helix API for mod/VIP/ban/subscriber operations

import { DatabaseService } from '../database/service';

interface TwitchApiConfig {
  clientId: string;
  accessToken: string;
  broadcasterId: string;
  broadcasterUsername: string;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
}

interface TwitchModerator {
  user_id: string;
  user_login: string;
  user_name: string;
}

interface TwitchVip {
  user_id: string;
  user_login: string;
  user_name: string;
}

interface TwitchBannedUser {
  user_id: string;
  user_login: string;
  user_name: string;
  expires_at: string;
  created_at: string;
  reason: string;
  moderator_id: string;
  moderator_login: string;
  moderator_name: string;
}

interface TwitchSubscriber {
  user_id: string;
  user_login: string;
  user_name: string;
  tier: string;
  is_gift: boolean;
}

export class TwitchApiService {
  private config: TwitchApiConfig | null = null;
  private baseUrl = 'https://api.twitch.tv/helix';

  /**
   * Initialize the API service with auth credentials
   */
  configure(config: TwitchApiConfig): void {
    this.config = config;
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Validate token and check scopes
   */
  async validateToken(): Promise<{ scopes: string[]; user_id: string; login: string }> {
    if (!this.config) throw new Error('Not configured');

    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Token validation failed');
    }

    return response.json() as Promise<{ scopes: string[]; user_id: string; login: string }>;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.config) {
      throw new Error('Twitch API not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Client-ID': this.config.clientId,
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitch API error (${response.status}): ${error}`);
    }

    // Handle empty responses (204 No Content, etc.)
    const text = await response.text();
    if (!text || text.length === 0) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<TwitchUser | null> {
    try {
      const data = await this.makeRequest<{ data: TwitchUser[] }>(
        `/users?login=${username.toLowerCase()}`
      );
      return data.data[0] || null;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  /**
   * Sync all moderators from Twitch API (with pagination)
   */
  async syncModerators(): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    try {
      let allModerators: TwitchModerator[] = [];
      let cursor: string | undefined = undefined;

      // Fetch all pages
      do {
        const url: string = cursor 
          ? `/moderation/moderators?broadcaster_id=${this.config.broadcasterId}&first=100&after=${cursor}`
          : `/moderation/moderators?broadcaster_id=${this.config.broadcasterId}&first=100`;
        
        const data: { data: TwitchModerator[]; pagination?: { cursor?: string } } = await this.makeRequest<{ data: TwitchModerator[]; pagination?: { cursor?: string } }>(url);
        allModerators.push(...data.data);
        cursor = data.pagination?.cursor;
      } while (cursor);

      // Upsert viewers with mod status
      for (const mod of allModerators) {
        DatabaseService.upsertViewer({
          id: mod.user_id,
          username: mod.user_login,
          display_name: mod.user_name,
          is_moderator: true
        });
      }

      console.log(`Synced ${allModerators.length} moderators`);
    } catch (error) {
      console.error('Error syncing moderators:', error);
      throw error;
    }
  }

  /**
   * Sync all VIPs from Twitch API (with pagination)
   */
  async syncVips(): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    try {
      let allVips: TwitchVip[] = [];
      let cursor: string | undefined = undefined;

      // Fetch all pages
      do {
        const url: string = cursor
          ? `/channels/vips?broadcaster_id=${this.config.broadcasterId}&after=${cursor}`
          : `/channels/vips?broadcaster_id=${this.config.broadcasterId}`;
        
        const data: { data: TwitchVip[]; pagination?: { cursor?: string } } = await this.makeRequest<{ data: TwitchVip[]; pagination?: { cursor?: string } }>(url);
        allVips.push(...data.data);
        cursor = data.pagination?.cursor;
      } while (cursor);

      // Upsert viewers with VIP status
      for (const vip of allVips) {
        DatabaseService.upsertViewer({
          id: vip.user_id,
          username: vip.user_login,
          display_name: vip.user_name,
          is_vip: true
        });
      }

      console.log(`Synced ${allVips.length} VIPs`);
    } catch (error) {
      console.error('Error syncing VIPs:', error);
      throw error;
    }
  }

  /**
   * Sync all banned users from Twitch API (with pagination)
   */
  async syncBannedUsers(): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    try {
      let allBanned: TwitchBannedUser[] = [];
      let cursor: string | undefined = undefined;

      // Fetch all pages
      do {
        const url: string = cursor
          ? `/moderation/banned?broadcaster_id=${this.config.broadcasterId}&after=${cursor}`
          : `/moderation/banned?broadcaster_id=${this.config.broadcasterId}`;
        
        const data: { data: TwitchBannedUser[]; pagination?: { cursor?: string } } = await this.makeRequest<{ data: TwitchBannedUser[]; pagination?: { cursor?: string } }>(url);
        allBanned.push(...data.data);
        cursor = data.pagination?.cursor;
      } while (cursor);

      // Upsert viewers with banned status
      for (const banned of allBanned) {
        DatabaseService.upsertViewer({
          id: banned.user_id,
          username: banned.user_login,
          display_name: banned.user_name,
          is_banned: true
        });
      }

      console.log(`Synced ${allBanned.length} banned users`);
    } catch (error) {
      console.error('Error syncing banned users:', error);
      throw error;
    }
  }

  /**
   * Sync all subscribers from Twitch API
   */
  async syncSubscribers(): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    try {
      const data = await this.makeRequest<{ data: TwitchSubscriber[] }>(
        `/subscriptions?broadcaster_id=${this.config.broadcasterId}`
      );

      // Update database with subscriber status
      for (const sub of data.data) {
        DatabaseService.updateViewerSubscriberStatus(sub.user_id, true);
      }

      console.log(`Synced ${data.data.length} subscribers`);
    } catch (error) {
      console.error('Error syncing subscribers:', error);
      throw error;
    }
  }

  /**
   * Sync all viewer statuses
   */
  async syncAllStatuses(): Promise<void> {
    // Reset all statuses first
    DatabaseService.resetViewerStatuses();

    // Sync each status type
    await Promise.all([
      this.syncModerators(),
      this.syncVips(),
      this.syncBannedUsers(),
      this.syncSubscribers()
    ]);
  }

  /**
   * Add moderator
   */
  async addModerator(username: string): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');

    console.log(`Adding moderator: ${username} (ID: ${user.id}) to channel ${this.config.broadcasterUsername} (ID: ${this.config.broadcasterId})`);

    try {
      await this.makeRequest(
        `/moderation/moderators?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`,
        { 
          method: 'POST',
          body: JSON.stringify({})
        }
      );
      console.log(`Successfully added ${username} as moderator`);
    } catch (error: any) {
      // If user is already a mod, treat as success and update database
      if (error.message && error.message.includes('user is already a mod')) {
        console.log(`${username} is already a moderator (updating database)`);
      } else {
        throw error;
      }
    }

    // Verify by checking if user is actually a mod now
    const verifyData = await this.makeRequest<{ data: TwitchModerator[] }>(
      `/moderation/moderators?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`
    );
    const isMod = verifyData.data.length > 0;
    console.log(`✓ Verified ${username} mod status: ${isMod}`);

    DatabaseService.updateViewerModStatus(user.id, isMod);
  }

  /**
   * Remove moderator
   */
  async removeModerator(username: string): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');

    console.log(`Removing moderator: ${username} (ID: ${user.id})`);

    await this.makeRequest(
      `/moderation/moderators?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`,
      { method: 'DELETE' }
    );

    console.log(`Successfully removed ${username} as moderator`);

    // Verify by checking if user is still a mod
    const verifyData = await this.makeRequest<{ data: TwitchModerator[] }>(
      `/moderation/moderators?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`
    );
    const isMod = verifyData.data.length > 0;
    console.log(`✓ Verified ${username} mod status: ${isMod}`);

    DatabaseService.updateViewerModStatus(user.id, isMod);
  }

  /**
   * Add VIP
   */
  async addVip(username: string): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');

    console.log(`Adding VIP: ${username} (ID: ${user.id})`);

    await this.makeRequest(
      `/channels/vips?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`,
      { method: 'POST' }
    );

    console.log(`Successfully added ${username} as VIP`);

    // Verify by checking if user is now a VIP
    const verifyData = await this.makeRequest<{ data: TwitchVip[] }>(
      `/channels/vips?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`
    );
    const isVip = verifyData.data.length > 0;
    console.log(`✓ Verified ${username} VIP status: ${isVip}`);

    DatabaseService.updateViewerVipStatus(user.id, isVip);
  }

  /**
   * Remove VIP
   */
  async removeVip(username: string): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');

    console.log(`Removing VIP: ${username} (ID: ${user.id})`);

    await this.makeRequest(
      `/channels/vips?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`,
      { method: 'DELETE' }
    );

    console.log(`Successfully removed ${username} as VIP`);

    // Verify by checking if user is still a VIP
    const verifyData = await this.makeRequest<{ data: TwitchVip[] }>(
      `/channels/vips?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`
    );
    const isVip = verifyData.data.length > 0;
    console.log(`✓ Verified ${username} VIP status: ${isVip}`);

    DatabaseService.updateViewerVipStatus(user.id, isVip);
  }

  /**
   * Ban user
   */
  async banUser(username: string, reason?: string, duration?: number): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');

    console.log(`Banning user: ${username} (ID: ${user.id}), reason: ${reason || 'none'}, duration: ${duration || 'permanent'}`);

    const body: any = {
      user_id: user.id,
      reason: reason || 'Banned via Stream Yap Yap'
    };

    if (duration) {
      body.duration = duration;
    }

    await this.makeRequest(
      `/moderation/bans?broadcaster_id=${this.config.broadcasterId}&moderator_id=${this.config.broadcasterId}`,
      {
        method: 'POST',
        body: JSON.stringify({ data: body })
      }
    );

    console.log(`Successfully banned ${username}`);

    // Verify by checking if user is actually banned
    const verifyData = await this.makeRequest<{ data: TwitchBannedUser[] }>(
      `/moderation/banned?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`
    );
    const isBanned = verifyData.data.length > 0;
    console.log(`✓ Verified ${username} ban status: ${isBanned}`);

    DatabaseService.updateViewerBannedStatus(user.id, isBanned);
  }

  /**
   * Unban user
   */
  async unbanUser(username: string): Promise<void> {
    if (!this.config) throw new Error('Not configured');

    const user = await this.getUserByUsername(username);
    if (!user) throw new Error('User not found');

    console.log(`Unbanning user: ${username} (ID: ${user.id})`);

    await this.makeRequest(
      `/moderation/bans?broadcaster_id=${this.config.broadcasterId}&moderator_id=${this.config.broadcasterId}&user_id=${user.id}`,
      { method: 'DELETE' }
    );

    console.log(`Successfully unbanned ${username}`);

    // Verify by checking if user is still banned
    const verifyData = await this.makeRequest<{ data: TwitchBannedUser[] }>(
      `/moderation/banned?broadcaster_id=${this.config.broadcasterId}&user_id=${user.id}`
    );
    const isBanned = verifyData.data.length > 0;
    console.log(`✓ Verified ${username} ban status: ${isBanned}`);

    DatabaseService.updateViewerBannedStatus(user.id, isBanned);
  }
}

// Singleton instance
let twitchApiService: TwitchApiService | null = null;

export function getTwitchApiService(): TwitchApiService {
  if (!twitchApiService) {
    twitchApiService = new TwitchApiService();
  }
  return twitchApiService;
}
