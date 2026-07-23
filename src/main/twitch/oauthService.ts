import { BrowserWindow, shell } from 'electron';
import * as http from 'http';
import { URL } from 'url';

const TWITCH_CLIENT_ID = 'la400d26u2wzvw1kw1c1my0lx99rt0';
const REDIRECT_URI = 'http://localhost:3000/auth/callback';
const SCOPES = [
  'chat:read',
  'chat:edit',
  'channel:read:subscriptions',
  'channel:read:vips',
  'moderator:read:followers',
  'moderator:read:moderators',
  'moderation:read',
  'channel:manage:moderators',
  'channel:manage:vips',
  'moderator:manage:banned_users'
];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

interface UserInfo {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  email?: string;
  created_at: string;
}

export class TwitchOAuthService {
  private server: http.Server | null = null;
  private authWindow: BrowserWindow | null = null;

  /**
   * Start OAuth flow (using implicit grant)
   */
  async authenticate(): Promise<{ token: string; username: string }> {
    return new Promise((resolve, reject) => {
      // Start local server to receive callback
      this.startCallbackServer((token, error) => {
        if (error) {
          reject(new Error(error));
          return;
        }

        if (!token) {
          reject(new Error('No access token received'));
          return;
        }

        // Get user info
        this.getUserInfo(token)
          .then((userInfo) => {
            resolve({
              token: token,
              username: userInfo.login
            });
          })
          .catch(reject);
      });

      // Open browser to Twitch OAuth (implicit flow)
      const authUrl = this.getAuthUrl();
      shell.openExternal(authUrl);
    });
  }

  /**
   * Generate Twitch OAuth URL (implicit flow - returns token directly)
   */
  private getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'token', // Changed from 'code' to 'token' for implicit flow
      scope: SCOPES.join(' ')
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Start local HTTP server to receive OAuth callback
   */
  private startCallbackServer(callback: (token: string | null, error: string | null) => void): void {
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:3000`);
      
      if (url.pathname === '/auth/callback') {
        // Implicit flow returns token in URL fragment (hash)
        // We need to parse it with JavaScript on the page
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head>
              <title>Authentication</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #9147ff 0%, #6441a5 100%);
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: rgba(255, 255, 255, 0.1);
                  border-radius: 16px;
                  backdrop-filter: blur(10px);
                }
                h1 { margin: 0 0 20px 0; }
                p { margin: 0; opacity: 0.9; }
                .spinner {
                  border: 4px solid rgba(255,255,255,0.3);
                  border-top: 4px solid white;
                  border-radius: 50%;
                  width: 40px;
                  height: 40px;
                  animation: spin 1s linear infinite;
                  margin: 20px auto 0;
                }
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1 id="title">Processing Authentication...</h1>
                <p id="message">Please wait</p>
                <div class="spinner"></div>
              </div>
              <script>
                // Parse access token from URL fragment
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get('access_token');
                const error = params.get('error');
                
                if (error) {
                  document.getElementById('title').textContent = '❌ Authentication Failed';
                  document.getElementById('message').textContent = 'Error: ' + error;
                  fetch('/auth/result?error=' + encodeURIComponent(error));
                  setTimeout(() => window.close(), 3000);
                } else if (accessToken) {
                  document.getElementById('title').textContent = '✅ Authentication Successful';
                  document.getElementById('message').textContent = 'You can close this window';
                  // Send token to server
                  fetch('/auth/result?token=' + encodeURIComponent(accessToken))
                    .then(() => setTimeout(() => window.close(), 2000));
                } else {
                  document.getElementById('title').textContent = '❌ No Token Received';
                  document.getElementById('message').textContent = 'Something went wrong';
                  setTimeout(() => window.close(), 3000);
                }
              </script>
            </body>
          </html>
        `);
      } else if (url.pathname === '/auth/result') {
        const token = url.searchParams.get('token');
        const error = url.searchParams.get('error');
        
        res.writeHead(200);
        res.end('OK');

        // Close server
        this.stopCallbackServer();

        // Call callback
        callback(token, error);
      }
    });

    this.server.listen(3000, () => {
      console.log('OAuth callback server listening on port 3000');
    });
  }

  /**
   * Stop callback server
   */
  private stopCallbackServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Get user info from Twitch API
   */
  private async getUserInfo(token: string): Promise<UserInfo> {
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': TWITCH_CLIENT_ID
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    const data = await response.json() as { data: UserInfo[] };
    return data.data[0];
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return TWITCH_CLIENT_ID;
  }

  /**
   * Validate token
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: {
          'Authorization': `OAuth ${token}`
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get username from token
   */
  async getUsernameFromToken(token: string): Promise<string> {
    const userInfo = await this.getUserInfo(token);
    return userInfo.login;
  }
}

// Singleton instance
let twitchOAuthService: TwitchOAuthService | null = null;

export function getTwitchOAuthService(): TwitchOAuthService {
  if (!twitchOAuthService) {
    twitchOAuthService = new TwitchOAuthService();
  }
  return twitchOAuthService;
}
