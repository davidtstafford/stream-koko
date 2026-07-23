import tmi from 'tmi.js';
import { DatabaseService, ChatMessage, Viewer } from '../database/service';
import { CommandProcessor, CommandContext } from '../commands/commandProcessor';

interface TwitchServiceConfig {
  username: string;
  token: string;
  channels: string[];
}

type MessageCallback = (message: ChatMessage) => void;
type ConnectionCallback = (connected: boolean, error?: string) => void;
type ChatResponseCallback = (channel: string, response: string) => void;
type ClearQueueCallback = () => void;

export class TwitchService {
  private client: tmi.Client | null = null;
  private messageQueue: ChatMessage[] = [];
  private batchInterval: NodeJS.Timeout | null = null;
  private onMessageCallback?: MessageCallback;
  private onConnectionStatusCallback?: ConnectionCallback;
  private onChatResponseCallback?: ChatResponseCallback;
  private onClearQueueCallback?: ClearQueueCallback;
  private commandProcessor: CommandProcessor;

  constructor() {
    this.commandProcessor = new CommandProcessor();
    this.batchInterval = setInterval(() => this.flushMessageQueue(), 5000);
  }

  async connect(config: TwitchServiceConfig): Promise<void> {
    if (this.client) await this.disconnect();

    this.client = new tmi.Client({
      options: { debug: process.env.NODE_ENV === 'development' },
      connection: { reconnect: true, secure: true },
      identity: {
        username: config.username.toLowerCase(),
        password: config.token
      },
      channels: config.channels.map(ch => ch.toLowerCase())
    });

    this.setupEventHandlers();

    try {
      await this.client.connect();
      console.log('Connected to Twitch chat');
      this.onConnectionStatusCallback?.(true);
    } catch (error) {
      console.error('Failed to connect to Twitch:', error);
      this.onConnectionStatusCallback?.(false, String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    this.flushMessageQueue();
    try {
      await this.client.disconnect();
      this.client = null;
      this.onConnectionStatusCallback?.(false);
    } catch (err) {
      console.error('Error disconnecting from Twitch:', err);
    }
  }

  isConnected(): boolean {
    return this.client?.readyState() === 'OPEN';
  }

  onMessage(cb: MessageCallback): void  { this.onMessageCallback = cb; }
  onConnectionStatus(cb: ConnectionCallback): void { this.onConnectionStatusCallback = cb; }
  onChatResponse(cb: ChatResponseCallback): void { this.onChatResponseCallback = cb; }
  onClearQueue(cb: ClearQueueCallback): void { this.onClearQueueCallback = cb; }

  destroy(): void {
    if (this.batchInterval) clearInterval(this.batchInterval);
    this.disconnect().catch(() => {});
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('message', (channel, userstate, message, self) => {
      if (self) return;
      this.handleMessage(channel, userstate, message);
    });

    this.client.on('connected', () => {
      console.log('TMI.js connected');
      this.onConnectionStatusCallback?.(true);
    });

    this.client.on('disconnected', (reason) => {
      console.log('TMI.js disconnected:', reason);
      this.onConnectionStatusCallback?.(false);
    });

    this.client.on('error' as any, (err: any) => {
      console.error('TMI.js error:', err);
    });
  }

  private async handleMessage(channel: string, userstate: tmi.ChatUserstate, message: string): Promise<void> {
    const userId = userstate['user-id'];
    const username = userstate.username;
    const displayName = userstate['display-name'];
    if (!userId || !username) return;

    if (message.trim().startsWith('~')) {
      await this.handleCommand(channel, userstate, message);
      return;
    }

    const viewer: Viewer = {
      id: userId,
      username: username.toLowerCase(),
      display_name: displayName || username,
      is_moderator: userstate.mod || false,
      is_vip: userstate.badges?.vip === '1',
      is_subscriber: userstate.subscriber || false
    };

    DatabaseService.upsertViewer(viewer);
    DatabaseService.incrementViewerMessageCount(userId);

    const chatMessage: ChatMessage = {
      viewer_id: userId,
      username: username.toLowerCase(),
      display_name: displayName || username,
      message,
      timestamp: new Date().toISOString(),
      emotes: userstate.emotes ? JSON.stringify(userstate.emotes) : undefined,
      badges: userstate.badges ? JSON.stringify(userstate.badges) : undefined,
      was_read_by_tts: false
    };

    this.messageQueue.push(chatMessage);
    this.onMessageCallback?.(chatMessage);
  }

  private async handleCommand(channel: string, userstate: tmi.ChatUserstate, message: string): Promise<void> {
    const userId = userstate['user-id'];
    const username = userstate.username;
    const displayName = userstate['display-name'];
    if (!userId || !username) return;

    const broadcasterUsername = channel.replace('#', '');
    const ctx: CommandContext = {
      username: username.toLowerCase(),
      displayName: displayName || username,
      viewerId: userId,
      isModerator: userstate.mod || false,
      isBroadcaster: username.toLowerCase() === broadcasterUsername.toLowerCase(),
      isVip: userstate.badges?.vip === '1',
      isSubscriber: userstate.subscriber || false,
      message,
      channel: broadcasterUsername
    };

    const result = await this.commandProcessor.processMessage(ctx);
    if (!result) return;

    if (result.error === '__clearQueue') {
      this.onClearQueueCallback?.();
    }

    if (result.response) {
      try {
        await this.client?.say(channel, result.response);
        this.onChatResponseCallback?.(channel, result.response);
      } catch (err) {
        console.error('Failed to send chat response:', err);
      }
    }
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;
    const msgs = [...this.messageQueue];
    this.messageQueue = [];
    DatabaseService.insertChatMessages(msgs);
  }
}

let twitchService: TwitchService | null = null;

export function getTwitchService(): TwitchService {
  if (!twitchService) twitchService = new TwitchService();
  return twitchService;
}
