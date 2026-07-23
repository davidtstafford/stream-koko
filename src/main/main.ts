import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initializeDatabase } from './database/migrations';
import { closeDatabase, getDatabase } from './database/connection';
import { DatabaseService } from './database/service';
import { VoiceService } from './database/voiceService';
import { getTwitchService } from './twitch/twitchService';
import { TwitchOAuthService } from './twitch/oauthService';
import { getTwitchApiService } from './twitch/twitchApiService';
import { getOBSServer } from './obs/obsServer';
import { getApiServer } from './api/apiServer';
import { getDiscordService } from './discord/discordService';
import { synthesize, preloadModel, isModelLoaded, getModelError } from './tts/kokoroService';

console.log('Initializing database...');
initializeDatabase();
console.log('Database initialized');

let mainWindow: BrowserWindow | null = null;
const twitchService = getTwitchService();
const twitchApiService = getTwitchApiService();
const oauthService = new TwitchOAuthService();
const obsServer = getOBSServer();
const apiServer = getApiServer();
const discordService = getDiscordService();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Stream Koko'
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', () => {
  createWindow();

  // ── Twitch messages → renderer ────────────────────────────────────────────
  twitchService.onMessage((message) => {
    mainWindow?.webContents.send('twitch:message', message);
  });

  twitchService.onConnectionStatus((connected, error) => {
    mainWindow?.webContents.send('twitch:connectionStatus', { connected, error });
  });

  twitchService.onClearQueue(() => {
    mainWindow?.webContents.send('tts:clearQueue');
  });

  // ── Discord connection status → renderer ──────────────────────────────────
  discordService.onConnectionStatus((connected, error) => {
    mainWindow?.webContents.send('discord:connectionStatus', { connected, error });
  });

  // ── API server TTS toggle → renderer ─────────────────────────────────────
  apiServer.on('tts-toggled', (enabled: boolean) => {
    mainWindow?.webContents.send('tts:status-changed', enabled);
  });

  // ── Start always-on API server ────────────────────────────────────────────
  apiServer.start().catch(err => console.error('Failed to start API server:', err));

  // ── Auto-connect Twitch if credentials are saved ──────────────────────────
  const autoConnect    = DatabaseService.getSetting('auto_connect');
  const twitchToken    = DatabaseService.getSetting('twitch_token');
  const twitchUsername = DatabaseService.getSetting('twitch_username');

  if (autoConnect === 'true' && twitchToken && twitchUsername) {
    console.log('Auto-connecting to Twitch...');
    twitchService.connect({
      username: twitchUsername,
      token: twitchToken,
      channels: [twitchUsername]
    }).catch(err => console.error('Auto-connect failed:', err));
  }

  // ── Auto-connect Discord if enabled ──────────────────────────────────────
  const discordToken   = DatabaseService.getSetting('discord_token');
  const discordClientId = DatabaseService.getSetting('discord_client_id');
  const discordEnabled = DatabaseService.getSetting('discord_enabled');

  if (discordEnabled === 'true' && discordToken && discordClientId) {
    console.log('Auto-connecting to Discord...');
    discordService.connect({
      token: discordToken,
      clientId: discordClientId,
      guildId: DatabaseService.getSetting('discord_guild_id') ?? undefined
    }).catch(err => console.error('Discord auto-connect failed:', err));
  }

  // ── Auto-start OBS server ─────────────────────────────────────────────────
  if (DatabaseService.getSetting('obs_browser_source_enabled') === 'true') {
    obsServer.start().catch(err => console.error('Failed to start OBS server:', err));
  }

  // ── Background preload of Kokoro model ────────────────────────────────────
  // Start loading in background after a short delay so the UI can paint first.
  setTimeout(() => {
    console.log('[Main] Background preloading Kokoro model...');
    preloadModel();
  }, 2000);
});

app.on('window-all-closed', () => {
  twitchService.destroy();
  discordService.destroy();
  obsServer.stop();
  apiServer.stop();
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Settings
ipcMain.handle('db:getSetting', (_e, key: string) => DatabaseService.getSetting(key));
ipcMain.handle('db:setSetting', (_e, key: string, value: string) => { DatabaseService.setSetting(key, value); return true; });
ipcMain.handle('db:getAllSettings', () => DatabaseService.getAllSettings());

// Viewers
ipcMain.handle('db:getViewers', () => DatabaseService.getAllViewers());
ipcMain.handle('db:getViewer', (_e, id: string) => DatabaseService.getViewerById(id));

// Chat history
ipcMain.handle('db:getChatHistory', (_e, limit?: number, offset?: number) => DatabaseService.getChatHistory(limit, offset));
ipcMain.handle('db:searchChatHistory', (_e, term: string, limit?: number) => DatabaseService.searchChatHistory(term, limit));
ipcMain.handle('db:clearChatHistory', () => { DatabaseService.clearChatHistory(); return true; });
ipcMain.handle('db:getChatHistoryCount', () => {
  const db = getDatabase();
  const r = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number };
  return r.count;
});

// Kokoro voices
ipcMain.handle('db:getAllVoices', () => VoiceService.getAllVoices());
ipcMain.handle('db:searchVoices', (_e, query: string) => VoiceService.searchVoices(query));
ipcMain.handle('db:getVoiceById', (_e, id: string) => VoiceService.getVoiceById(id));
ipcMain.handle('db:isVoiceAvailable', (_e, id: string) => VoiceService.isVoiceAvailable(id));
ipcMain.handle('db:addCustomVoice', (_e, voice: any) => { VoiceService.addCustomVoice(voice); return true; });
ipcMain.handle('db:removeCustomVoice', (_e, id: string) => { VoiceService.removeCustomVoice(id); return true; });
ipcMain.handle('db:getCustomVoices', () => VoiceService.getCustomVoices());

// Viewer voice preferences
ipcMain.handle('db:getViewerVoicePreference', (_e, viewerId: string) => VoiceService.getViewerVoicePreference(viewerId));
ipcMain.handle('db:setViewerVoicePreference', (_e, viewerId: string, voiceId: string, speed?: number) => {
  VoiceService.setViewerVoicePreference(viewerId, voiceId, speed);
  return true;
});
ipcMain.handle('db:getAllViewerVoicePreferences', () => VoiceService.getAllViewerVoicePreferences());

// Viewer TTS restrictions (raw DB queries)
ipcMain.handle('db:getViewerTTSRestrictions', (_e, viewerId: string) => {
  return getDatabase().prepare('SELECT * FROM viewer_tts_restrictions WHERE viewer_id = ?').get(viewerId);
});
ipcMain.handle('db:updateLastTTSTime', (_e, viewerId: string) => {
  getDatabase().prepare(`
    UPDATE viewer_tts_restrictions SET last_tts_at = ?, updated_at = CURRENT_TIMESTAMP WHERE viewer_id = ?
  `).run(new Date().toISOString(), viewerId);
  return true;
});

// Generic DB query/exec (used by Viewers page)
ipcMain.handle('db:query', (_e, sql: string, params: any[] = []) => {
  return getDatabase().prepare(sql).all(...params);
});
ipcMain.handle('db:run', (_e, sql: string, params: any[] = []) => {
  return getDatabase().prepare(sql).run(...params);
});

// ── Kokoro TTS ────────────────────────────────────────────────────────────────
ipcMain.handle('tts:synthesize', async (_e, opts: { text: string; voiceId: string; speed?: number }) => {
  return synthesize(opts.text, opts.voiceId, { speed: opts.speed });
});

ipcMain.handle('tts:isModelLoaded', () => isModelLoaded());
ipcMain.handle('tts:getModelError', () => getModelError());

// ── OBS Server ────────────────────────────────────────────────────────────────
ipcMain.handle('obs:start', async () => {
  try { await obsServer.start(); return { success: true, url: obsServer.getURL() }; }
  catch (err) { return { success: false, error: String(err) }; }
});
ipcMain.handle('obs:stop', async () => {
  try { await obsServer.stop(); return { success: true }; }
  catch (err) { return { success: false, error: String(err) }; }
});
ipcMain.handle('obs:getStatus', () => ({ running: obsServer.isRunning(), url: obsServer.getURL() }));
ipcMain.handle('obs:broadcastEvent', (_e, event: { type: string; item?: any }) => {
  obsServer.broadcast(event);
  return true;
});
ipcMain.handle('obs:waitForAudioComplete', () => new Promise(resolve => {
  const timeout = setTimeout(() => {
    obsServer.off('audioComplete', handler);
    resolve({ success: false, error: 'Timeout' });
  }, 30000);
  const handler = () => { clearTimeout(timeout); obsServer.off('audioComplete', handler); resolve({ success: true }); };
  obsServer.once('audioComplete', handler);
}));
ipcMain.handle('api:getUrl', () => apiServer.getURL());

// ── Twitch ────────────────────────────────────────────────────────────────────
ipcMain.handle('twitch:authenticateOAuth', async () => {
  try {
    const result = await oauthService.authenticate();
    const resp = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${result.token}`,
        'Client-Id': oauthService.getClientId()
      }
    });
    const userData = await resp.json() as { data: Array<{ id: string; login: string }> };
    const userId = userData.data[0].id;
    DatabaseService.setSetting('twitch_token', result.token);
    DatabaseService.setSetting('twitch_username', result.username);
    DatabaseService.setSetting('twitch_user_id', userId);
    DatabaseService.setSetting('twitch_client_id', oauthService.getClientId());
    return { success: true, token: result.token, username: result.username };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('twitch:validateToken', async (_e, token: string) => {
  try {
    const valid = await oauthService.validateToken(token);
    return { success: true, valid };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('twitch:connect', async (_e, params: { token: string; channels: string[] } | string, tokenArg?: string) => {
  try {
    let username: string, token: string, channels: string[];
    if (typeof params === 'string') {
      username = params; token = tokenArg as string; channels = [username];
    } else {
      token = params.token; channels = params.channels; username = channels[0];
    }
    await twitchService.connect({ username, token, channels });
    DatabaseService.setSetting('twitch_username', username.toLowerCase());
    DatabaseService.setSetting('twitch_token', token);
    DatabaseService.setSetting('twitch_connected', 'true');
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle('twitch:disconnect', async () => {
  try {
    await twitchService.disconnect();
    DatabaseService.setSetting('twitch_connected', 'false');
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle('twitch:isConnected', () => twitchService.isConnected());

ipcMain.handle('twitch:forgetCredentials', async () => {
  await twitchService.disconnect();
  DatabaseService.setSetting('twitch_username', '');
  DatabaseService.setSetting('twitch_token', '');
  DatabaseService.setSetting('twitch_connected', 'false');
  return { success: true };
});

// ── Discord ───────────────────────────────────────────────────────────────────
ipcMain.handle('discord:connect', async (_e, cfg: { token: string; clientId: string; guildId?: string }) => {
  try {
    await discordService.connect(cfg);
    DatabaseService.setSetting('discord_token', cfg.token);
    DatabaseService.setSetting('discord_client_id', cfg.clientId);
    if (cfg.guildId) DatabaseService.setSetting('discord_guild_id', cfg.guildId);
    DatabaseService.setSetting('discord_enabled', 'true');
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle('discord:disconnect', async () => {
  try {
    await discordService.disconnect();
    DatabaseService.setSetting('discord_enabled', 'false');
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle('discord:isConnected', () => discordService.isConnected());

ipcMain.handle('discord:forgetCredentials', async () => {
  await discordService.disconnect();
  ['discord_token', 'discord_client_id', 'discord_guild_id'].forEach(k => DatabaseService.setSetting(k, ''));
  DatabaseService.setSetting('discord_enabled', 'false');
  return { success: true };
});
