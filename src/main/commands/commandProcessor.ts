// Chat Command Processor — Kokoro-only build
// All voice references use Kokoro voice IDs (e.g. af_heart, am_adam)

import { DatabaseService } from '../database/service';
import { VoiceService } from '../database/voiceService';
import { getDatabase } from '../database/connection';

export interface CommandContext {
  username: string;
  displayName: string;
  viewerId: string;
  isModerator: boolean;
  isBroadcaster: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  message: string;
  channel: string;
}

export interface CommandResult {
  success: boolean;
  response?: string;
  error?: string;
}

interface CommandHandler {
  name: string;
  permission: 'viewer' | 'moderator' | 'broadcaster';
  handler: (ctx: CommandContext, args: string[]) => Promise<CommandResult>;
  rateLimit: number;
}

export class CommandProcessor {
  private commands = new Map<string, CommandHandler>();
  private readonly prefix = '~';

  constructor() {
    this.registerCommands();
  }

  private registerCommands(): void {
    // Viewer commands
    this.reg('hello',           'viewer',    5,  this.handleHello.bind(this));
    this.reg('voices',          'viewer',    10, this.handleVoices.bind(this));
    this.reg('setvoice',        'viewer',    5,  this.handleSetVoice.bind(this));
    this.reg('setvoicespeed',   'viewer',    5,  this.handleSetVoiceSpeed.bind(this));
    // Moderator commands
    this.reg('mutevoice',       'moderator', 0,  this.handleMuteVoice.bind(this));
    this.reg('unmutevoice',     'moderator', 0,  this.handleUnmuteVoice.bind(this));
    this.reg('cooldownvoice',   'moderator', 0,  this.handleCooldownVoice.bind(this));
    this.reg('uncooldownvoice', 'moderator', 0,  this.handleUncooldownVoice.bind(this));
    this.reg('mutetts',         'moderator', 0,  this.handleMuteTTS.bind(this));
    this.reg('unmutetts',       'moderator', 0,  this.handleUnmuteTTS.bind(this));
    this.reg('clearqueue',      'moderator', 0,  this.handleClearQueue.bind(this));
  }

  private reg(
    name: string,
    permission: 'viewer' | 'moderator' | 'broadcaster',
    rateLimit: number,
    handler: CommandHandler['handler']
  ): void {
    this.commands.set(name, { name, permission, handler, rateLimit });
  }

  async processMessage(ctx: CommandContext): Promise<CommandResult | null> {
    const msg = ctx.message.trim();
    if (!msg.startsWith(this.prefix)) return null;

    const parts = msg.slice(1).split(/\s+/);
    const name  = parts[0].toLowerCase();
    const args  = parts.slice(1);

    const cmd = this.commands.get(name);
    if (!cmd) return null;

    const enabled = DatabaseService.getSetting(`command_${name}_enabled`);
    if (enabled === 'false') return { success: false, error: 'Command is disabled' };

    if (!this.hasPermission(ctx, cmd.permission)) {
      return { success: false, error: `Requires ${cmd.permission} permission` };
    }

    if (cmd.rateLimit > 0 && !ctx.isModerator && !ctx.isBroadcaster) {
      const lastUsed = DatabaseService.getSetting(`cmd_lastused_${name}_${ctx.viewerId}`);
      if (lastUsed) {
        const elapsed = Date.now() - new Date(lastUsed).getTime();
        if (elapsed < cmd.rateLimit * 1000) {
          const wait = Math.ceil((cmd.rateLimit * 1000 - elapsed) / 1000);
          return { success: false, error: `Wait ${wait}s before using this command again` };
        }
      }
    }

    try {
      const result = await cmd.handler(ctx, args);
      if (cmd.rateLimit > 0) {
        DatabaseService.setSetting(`cmd_lastused_${name}_${ctx.viewerId}`, new Date().toISOString());
      }
      return result;
    } catch (err) {
      return { success: false, error: `Command error: ${err}` };
    }
  }

  private hasPermission(ctx: CommandContext, required: string): boolean {
    if (ctx.isBroadcaster) return true;
    if (required === 'viewer') return true;
    if (required === 'moderator') return ctx.isModerator;
    return false;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private async handleHello(ctx: CommandContext): Promise<CommandResult> {
    return { success: true, response: `@${ctx.displayName} Hello! Use ~voices to see available Kokoro voices.` };
  }

  private async handleVoices(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const filter = args[0]?.toLowerCase();
    const voices = filter
      ? VoiceService.searchVoices(filter)
      : VoiceService.getAllVoices().slice(0, 10);

    if (voices.length === 0) {
      return { success: true, response: `@${ctx.displayName} No voices found. Use ~setvoice <voice_id>` };
    }

    const list = voices.map(v => `${v.voice_id} (${v.name})`).join(', ');
    return {
      success: true,
      response: `@${ctx.displayName} Voices: ${list}. Full list: use /findvoice in Discord or check the app.`
    };
  }

  private async handleSetVoice(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const voiceId = args[0]?.toLowerCase();
    if (!voiceId) {
      return { success: false, error: `@${ctx.displayName} Usage: ~setvoice <voice_id>  (e.g. ~setvoice af_heart)` };
    }

    if (!VoiceService.isVoiceAvailable(voiceId)) {
      return {
        success: false,
        error: `@${ctx.displayName} Voice "${voiceId}" not found. Use ~voices to see options.`
      };
    }

    VoiceService.setViewerVoicePreference(ctx.viewerId, voiceId);
    const voice = VoiceService.getVoiceById(voiceId);
    return {
      success: true,
      response: `@${ctx.displayName} Your voice is now set to ${voice?.name ?? voiceId} (${voiceId}) 🎤`
    };
  }

  private async handleSetVoiceSpeed(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const speed = parseFloat(args[0] ?? '');
    if (isNaN(speed) || speed < 0.25 || speed > 4.0) {
      return { success: false, error: `@${ctx.displayName} Usage: ~setvoicespeed <0.25–4.0>` };
    }

    const pref = VoiceService.getViewerVoicePreference(ctx.viewerId);
    const voiceId = pref?.voice_id ?? DatabaseService.getSetting('tts_default_voice') ?? 'af_heart';
    VoiceService.setViewerVoicePreference(ctx.viewerId, voiceId, speed);
    return { success: true, response: `@${ctx.displayName} Speed set to ${speed}x` };
  }

  private async handleMuteVoice(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const target = args[0]?.toLowerCase().replace('@', '');
    if (!target) return { success: false, error: 'Usage: ~mutevoice <username> [minutes]' };

    const viewer = DatabaseService.getViewerByUsername(target);
    if (!viewer) return { success: false, error: `Viewer "${target}" not found` };

    const minutes = args[1] ? parseInt(args[1]) : null;
    const db = getDatabase();
    const now = new Date().toISOString();
    const expires = minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null;

    db.prepare(`
      INSERT INTO viewer_tts_restrictions (viewer_id, is_muted, mute_period_mins, muted_at, mute_expires_at, updated_at)
      VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(viewer_id) DO UPDATE SET
        is_muted = 1, mute_period_mins = excluded.mute_period_mins,
        muted_at = excluded.muted_at, mute_expires_at = excluded.mute_expires_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(viewer.id, minutes ?? null, now, expires);

    const durationStr = minutes ? ` for ${minutes} minutes` : ' permanently';
    return { success: true, response: `@${ctx.displayName} Muted TTS for ${target}${durationStr}` };
  }

  private async handleUnmuteVoice(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const target = args[0]?.toLowerCase().replace('@', '');
    if (!target) return { success: false, error: 'Usage: ~unmutevoice <username>' };

    const viewer = DatabaseService.getViewerByUsername(target);
    if (!viewer) return { success: false, error: `Viewer "${target}" not found` };

    getDatabase().prepare(`
      UPDATE viewer_tts_restrictions
      SET is_muted = 0, mute_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE viewer_id = ?
    `).run(viewer.id);

    return { success: true, response: `@${ctx.displayName} TTS unmuted for ${target}` };
  }

  private async handleCooldownVoice(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const target = args[0]?.toLowerCase().replace('@', '');
    const gapSecs = args[1] ? parseInt(args[1]) : 30;
    if (!target) return { success: false, error: 'Usage: ~cooldownvoice <username> [gap_seconds]' };

    const viewer = DatabaseService.getViewerByUsername(target);
    if (!viewer) return { success: false, error: `Viewer "${target}" not found` };

    getDatabase().prepare(`
      INSERT INTO viewer_tts_restrictions (viewer_id, has_cooldown, cooldown_gap_seconds, cooldown_set_at, updated_at)
      VALUES (?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(viewer_id) DO UPDATE SET
        has_cooldown = 1, cooldown_gap_seconds = excluded.cooldown_gap_seconds,
        cooldown_set_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).run(viewer.id, gapSecs);

    return { success: true, response: `@${ctx.displayName} Cooldown set for ${target}: ${gapSecs}s between TTS` };
  }

  private async handleUncooldownVoice(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const target = args[0]?.toLowerCase().replace('@', '');
    if (!target) return { success: false, error: 'Usage: ~uncooldownvoice <username>' };

    const viewer = DatabaseService.getViewerByUsername(target);
    if (!viewer) return { success: false, error: `Viewer "${target}" not found` };

    getDatabase().prepare(`
      UPDATE viewer_tts_restrictions
      SET has_cooldown = 0, cooldown_gap_seconds = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE viewer_id = ?
    `).run(viewer.id);

    return { success: true, response: `@${ctx.displayName} Cooldown removed for ${target}` };
  }

  private async handleMuteTTS(_ctx: CommandContext): Promise<CommandResult> {
    DatabaseService.setSetting('tts_enabled', 'false');
    return { success: true, response: 'TTS paused' };
  }

  private async handleUnmuteTTS(_ctx: CommandContext): Promise<CommandResult> {
    DatabaseService.setSetting('tts_enabled', 'true');
    return { success: true, response: 'TTS resumed' };
  }

  private async handleClearQueue(ctx: CommandContext): Promise<CommandResult> {
    // Signal the renderer to clear the queue via IPC event
    return { success: true, response: `@${ctx.displayName} TTS queue cleared`, error: '__clearQueue' };
  }
}
