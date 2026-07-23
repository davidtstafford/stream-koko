# Stream Koko — Copilot Agent Instructions

## Project Overview

**Stream Koko** is an Electron 34 desktop application that reads Twitch and Discord chat messages aloud using **Kokoro AI** — a fully offline, open-weight text-to-speech model. There are no cloud TTS providers, no API keys, and no per-character billing. The Kokoro ONNX model (~170 MB) downloads once from Hugging Face on first launch and runs entirely on the user's CPU thereafter.

Key integration points:
- **Twitch IRC** via `tmi.js` — reads incoming chat messages
- **Discord bot** via `discord.js v14` — lets viewers browse and discover voices in Discord before going live
- **Kokoro TTS** via `kokoro-js v1.2.1` — offline AI speech synthesis
- **SQLite** via `better-sqlite3` — stores settings, viewer preferences, chat history
- **OBS overlay** — WebSocket server serves a browser source at `/tts-overlay`
- **REST API** at `localhost:8766` — allows Stream Deck / external tools to toggle TTS

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js / CommonJS)                         │
│                                                                     │
│  main.ts ──── IPC handlers ──── preload.ts (contextBridge)         │
│      │                                                              │
│      ├── database/       (better-sqlite3, SQLite)                   │
│      ├── tts/            (kokoroService — Kokoro AI synthesis)      │
│      ├── twitch/         (twitchService, twitchApiService, oauth)   │
│      ├── discord/        (discordService, voiceDiscovery)           │
│      ├── commands/       (commandProcessor — Twitch chat commands)  │
│      ├── obs/            (obsServer — WebSocket + browser source)   │
│      └── api/            (apiServer — REST at :8766)                │
│                                                                     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │  IPC (ipcMain.handle / ipcRenderer.invoke)
┌──────────────────────▼──────────────────────────────────────────────┐
│  Electron Renderer Process (React 18 + TypeScript / ESNext)         │
│                                                                     │
│  App.tsx ──── React Router v7 ──── Pages                           │
│      │                                                              │
│      ├── services/ttsQueue.ts   (queues synthesis requests)         │
│      ├── services/ttsRules.ts   (message filter/transform rules)    │
│      └── pages/                 (one component per route)           │
└─────────────────────────────────────────────────────────────────────┘
```

### Process boundary rule
The main process **owns** all I/O: SQLite, Kokoro synthesis, Twitch, Discord, HTTP/WebSocket servers. The renderer **never** touches Node.js APIs directly. All cross-boundary communication goes through `window.api.invoke(channel, ...args)` (renderer → main) or `window.api.on(channel, cb)` (main → renderer push events).

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Electron | 34 |
| UI framework | React + React Router | 18 / 7 |
| Language | TypeScript | 5.7 |
| Bundler (main) | Webpack 5 — CommonJS output | |
| Bundler (renderer) | Webpack 5 — ESNext output | |
| TTS engine | kokoro-js (Kokoro-82M ONNX) | 1.2.1 |
| Database | better-sqlite3 | 11 |
| Twitch IRC | tmi.js | 1.8 |
| Discord bot | discord.js | 14 |
| OBS / HTTP | express + ws | 4 / 8 |

---

## Critical: Kokoro-js ESM/CJS Loading

`kokoro-js` is **ESM-only**. The main process webpack output is CommonJS. TypeScript with `"module": "commonjs"` downgrades `import()` to `Promise.resolve().then(() => require())`, which strips webpack magic comments and causes webpack to try to bundle the entire ESM + ONNX binary chain.

**The correct loading pattern** (used in `src/main/tts/kokoroService.ts`):

```typescript
// CORRECT — new Function is opaque to tsc and webpack.
// Node.js performs a true ESM dynamic import at runtime.
const { KokoroTTS } = await (new Function('m', 'return import(m)'))('kokoro-js') as { KokoroTTS: any };
```

**Never** use `import(/* webpackIgnore: true */ 'kokoro-js')` — TypeScript strips the magic comment before webpack sees it in CommonJS mode.

`kokoro-js`, `@huggingface/transformers`, and `onnxruntime-node` are listed in `webpack.main.config.js` `externals` so webpack never attempts to bundle them.

### Model cache
```typescript
// Set before importing kokoro-js so model files land in app data, not home dir
process.env['HF_HOME'] = path.join(app.getPath('userData'), 'hf-models');
process.env['TRANSFORMERS_CACHE'] = path.join(app.getPath('userData'), 'hf-models');
```

### WAV encoding
Kokoro returns a `RawAudio` instance with `{ audio: Float32Array, sampling_rate: number }` at 24 kHz mono. `float32ToWav()` in `kokoroService.ts` encodes this to a 44-byte RIFF header + Int16 PCM buffer. The result is base64-encoded and sent to the renderer via IPC, then played with `new Audio('data:audio/wav;base64,...')`.

---

## Database Schema

Database file: `<userData>/stream-koko.db` (created automatically).

### Tables

| Table | Purpose |
|---|---|
| `settings` | Key/value app settings |
| `viewers` | Twitch viewer records (id, username, flags) |
| `chat_messages` | Full chat history |
| `tts_voices` | All Kokoro voices — built-in and custom |
| `viewer_voice_preferences` | Per-viewer voice ID + speed override |
| `viewer_tts_restrictions` | Mutes and per-user cooldowns |
| `chat_commands` | Command definitions + usage tracking |
| `command_usage` | Command invocation log |

### `tts_voices` — no `provider` column
```sql
CREATE TABLE tts_voices (
  voice_id TEXT UNIQUE,   -- e.g. 'af_heart', 'am_adam'
  name TEXT,
  language_code TEXT,     -- 'en-US', 'en-GB'
  language_name TEXT,     -- 'American English', 'British English'
  gender TEXT,            -- 'female' | 'male'
  is_custom BOOLEAN,      -- user-added voices
  is_available BOOLEAN,
  description TEXT
);
```

### `viewer_voice_preferences` — no pitch, no provider
```sql
CREATE TABLE viewer_voice_preferences (
  viewer_id TEXT PRIMARY KEY,
  voice_id TEXT,   -- Kokoro voice ID
  speed REAL       -- 0.25 – 4.0, default 1.0
);
```

### Key settings keys
| Key | Default | Description |
|---|---|---|
| `tts_enabled` | `'true'` | Master TTS on/off |
| `tts_default_voice` | `'af_heart'` | Fallback voice for viewers without preference |
| `tts_default_speed` | `'1.0'` | Fallback speed |
| `tts_mute_in_app` | `'false'` | Silence in-app audio when OBS is playing |
| `kokoro_model_id` | `'onnx-community/Kokoro-82M-v1.0-ONNX'` | HuggingFace model repo |
| `kokoro_model_dtype` | `'q8'` | Quantisation: q4/q8/fp16/fp32 |
| `twitch_token` | — | OAuth access token |
| `twitch_username` | — | Broadcaster username |
| `discord_token` | — | Bot token |
| `discord_client_id` | — | Application client ID |
| `discord_guild_id` | — | Optional guild for instant slash command registration |
| `obs_browser_source_enabled` | `'false'` | Auto-start OBS server |

---

## IPC Channel Reference

All channels go through `window.api.invoke(channel, ...args)` from the renderer.

### Database
| Channel | Args | Returns |
|---|---|---|
| `db:getSetting` | `key` | `string \| null` |
| `db:setSetting` | `key, value` | `true` |
| `db:getAllSettings` | — | `Setting[]` |
| `db:getViewers` | — | `Viewer[]` |
| `db:getViewer` | `id` | `Viewer \| null` |
| `db:getChatHistory` | `limit?, offset?` | `ChatMessage[]` |
| `db:searchChatHistory` | `term, limit?` | `ChatMessage[]` |
| `db:clearChatHistory` | — | `true` |
| `db:getChatHistoryCount` | — | `number` |
| `db:getAllVoices` | — | `KokoroVoice[]` |
| `db:searchVoices` | `query` | `KokoroVoice[]` |
| `db:addCustomVoice` | `voice` | `true` |
| `db:removeCustomVoice` | `voiceId` | `true` |
| `db:getViewerVoicePreference` | `viewerId` | `{ voice_id, speed } \| null` |
| `db:setViewerVoicePreference` | `viewerId, voiceId, speed?` | `true` |
| `db:getAllViewerVoicePreferences` | — | rows |
| `db:query` | `sql, params?` | rows (read) |
| `db:run` | `sql, params?` | run result (write) |
| `db:updateLastTTSTime` | `viewerId` | `true` |

### Kokoro TTS
| Channel | Args | Returns |
|---|---|---|
| `tts:synthesize` | `{ text, voiceId, speed? }` | `{ success, audioData?: string, error?: string }` |
| `tts:isModelLoaded` | — | `boolean` |

### Twitch
| Channel | Args | Returns |
|---|---|---|
| `twitch:connect` | `{ username, token, channels }` | `{ success, error? }` |
| `twitch:disconnect` | — | `true` |
| `twitch:getStatus` | — | `{ connected, channel? }` |
| `twitch:getConfig` | — | config object |

### OBS / API / Discord
| Channel | Args | Returns |
|---|---|---|
| `obs:start` | — | `{ success, url }` |
| `obs:stop` | — | `true` |
| `obs:getStatus` | — | `{ running, url? }` |
| `api:getUrl` | — | `string` |
| `discord:connect` | `{ token, clientId, guildId? }` | `{ success, error? }` |
| `discord:disconnect` | — | `true` |
| `discord:getStatus` | — | `{ connected, error? }` |

### Push events (main → renderer via `window.api.on`)
| Event | Payload |
|---|---|
| `twitch:message` | `ChatMessage` |
| `twitch:connectionStatus` | `{ connected, error? }` |
| `tts:clearQueue` | — |
| `tts:status-changed` | `boolean` |
| `discord:connectionStatus` | `{ connected, error? }` |

---

## File Structure

```
stream-koko/
├── .github/
│   └── agents/
│       └── AGENTS.md              ← this file
├── src/
│   ├── main/                      ← Electron main process (CommonJS)
│   │   ├── main.ts                ← Entry point; IPC handlers; app lifecycle
│   │   ├── preload.ts             ← contextBridge: exposes window.api
│   │   ├── database/
│   │   │   ├── connection.ts      ← Opens/closes SQLite DB singleton
│   │   │   ├── schema.ts          ← SCHEMA_SQL DDL + BUILTIN_VOICES constant
│   │   │   ├── migrations.ts      ← Applies schema; seeds 54 built-in voices (8 languages)
│   │   │   ├── service.ts         ← DatabaseService (settings, viewers, chat)
│   │   │   └── voiceService.ts    ← VoiceService (voices, viewer prefs)
│   │   ├── tts/
│   │   │   └── kokoroService.ts   ← Kokoro model load + synthesize() function
│   │   ├── twitch/
│   │   │   ├── twitchService.ts   ← tmi.js IRC wrapper
│   │   │   ├── twitchApiService.ts ← Helix API (subs, mods, VIPs, bans)
│   │   │   └── oauthService.ts    ← OAuth 2 PKCE flow
│   │   ├── commands/
│   │   │   └── commandProcessor.ts ← Twitch chat command parsing (~setvoice etc.)
│   │   ├── discord/
│   │   │   ├── discordService.ts  ← Bot setup; slash command registration
│   │   │   ├── discordVoiceDiscovery.ts ← Voice search/filter helpers
│   │   │   └── discordPagination.ts ← Paginated embed utility
│   │   ├── obs/
│   │   │   └── obsServer.ts       ← Express + ws; serves /tts-overlay HTML
│   │   ├── api/
│   │   │   └── apiServer.ts       ← REST API at :8766 (Stream Deck integration)
│   │   └── types/
│   │       └── kokoro-js.d.ts     ← Type declarations for kokoro-js ESM module
│   └── renderer/                  ← React app (ESNext)
│       ├── index.html             ← Webpack HtmlPlugin template
│       ├── index.tsx              ← ReactDOM.createRoot entry
│       ├── App.tsx                ← Router shell + processMessageForTTS logic
│       ├── pages/
│       │   ├── Connection.tsx     ← Twitch + Discord connect/disconnect
│       │   ├── Chat.tsx           ← Live chat view
│       │   ├── ChatHistory.tsx    ← Searchable chat history
│       │   ├── TTS.tsx            ← TTS settings (5 tabs)
│       │   ├── Voices.tsx         ← Browse voices; add/remove custom voices
│       │   ├── KokoroSetup.tsx    ← Setup guide page
│       │   ├── Viewers.tsx        ← Viewer list and stats
│       │   ├── Commands.tsx       ← Command reference + enable/disable
│       │   └── DiscordBot.tsx     ← Discord bot configuration
│       ├── services/
│       │   ├── ttsQueue.ts        ← TTSQueue singleton; manages playback order
│       │   └── ttsRules.ts        ← Message preprocessing rules
│       ├── styles/
│       │   ├── global.css
│       │   └── App.css
│       └── types/
│           └── electron.d.ts      ← window.api type declarations
├── webpack.main.config.js         ← Main process bundle (target: electron-main)
├── webpack.renderer.config.js     ← Renderer bundle (target: electron-renderer)
├── tsconfig.json                  ← Base tsconfig
├── tsconfig.main.json             ← Main: module=commonjs, target=ES2020
├── tsconfig.renderer.json         ← Renderer: module=ESNext
└── package.json
```

---

## Voices

Stream Koko ships 54 built-in Kokoro voices across 8 languages, seeded at startup by `migrations.ts` (using `INSERT OR IGNORE`, so new voices appear automatically on next launch for existing installs):

| Prefix | Language | Gender | Example IDs |
|---|---|---|---|
| `af_` | American English | Female | `af_heart`, `af_bella`, `af_nicole`, `af_sarah`, `af_sky`, `af_alloy`, `af_aoede`, `af_jessica`, `af_kore`, `af_nova`, `af_river` |
| `am_` | American English | Male | `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa` |
| `bf_` | British English | Female | `bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily` |
| `bm_` | British English | Male | `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis` |
| `if_` / `im_` | Italian | F/M | `if_sara`, `im_nicola` |
| `ff_` | French | Female | `ff_siwis` |
| `hf_` / `hm_` | Hindi | F/M | `hf_alpha`, `hf_beta`, `hm_omega`, `hm_psi` |
| `ef_` / `em_` | Spanish | F/M | `ef_dora`, `em_alex`, `em_santa` |
| `pf_` / `pm_` | Portuguese | F/M | `pf_dora`, `pm_alex`, `pm_santa` |
| `jf_` / `jm_` | Japanese | F/M | `jf_alpha`, `jf_gongitsune`, `jf_nezumi`, `jf_tebukuro`, `jm_kumo` |
| `zf_` / `zm_` | Mandarin Chinese | F/M | `zf_xiaobei`, `zf_xiaoni`, `zf_xiaoxiao`, `zf_xiaoyi`, `zm_yunjian`, `zm_yunxi`, `zm_yunxia`, `zm_yunyang` |

**Default voice:** `af_heart`

Viewers set their voice in Twitch chat: `~setvoice af_heart`

Custom voices can be added via the Voices page. The only compatible format for drop-in custom voices is the `.bin` float32 style-vector files used by `kokoro-js`. The broader community primarily shares `.pt` (PyTorch) files which are **not** compatible. Voice blending (`af_heart:0.6+af_bella:0.4`) is the most practical way to create custom voice combinations without any external files.

---

## Twitch Chat Commands

All commands use the `~` prefix. Permission levels: `viewer` / `moderator`.

| Command | Permission | Description |
|---|---|---|
| `~hello` | viewer | Greeting + tip |
| `~voices [search]` | viewer | List voices, optional search |
| `~setvoice <voice_id>` | viewer | Set personal voice |
| `~setvoicespeed <0.25–4.0>` | viewer | Set personal speed |
| `~mutetts` | moderator | Pause global TTS |
| `~unmutetts` | moderator | Resume global TTS |
| `~clearqueue` | moderator | Flush TTS queue |
| `~mutevoice <user> [mins]` | moderator | Silence a viewer |
| `~unmutevoice <user>` | moderator | Unsilence a viewer |
| `~cooldownvoice <user> [secs]` | moderator | Add per-user TTS gap |
| `~uncooldownvoice <user>` | moderator | Remove per-user gap |

---

## Development Workflow

```bash
# Install dependencies
npm install

# Rebuild native modules for the installed Electron version
npm run rebuild     # electron-rebuild for better-sqlite3

# Development (hot reload)
npm run dev         # starts both webpack watchers concurrently

# Production build (required before npm start or package)
npm run build

# Run the built app
npm start           # or: npm run prod (build + start)

# Package distributable
npm run package:mac   # → release/*.dmg
npm run package:win   # → release/*.exe
npm run package:all   # mac + win
```

### First run
On first launch, the Kokoro model is downloaded automatically (~170 MB for `q8`). Subsequent launches use the cached model from `<userData>/hf-models/`. An internet connection is only required for this one-time download.

---

## Code Conventions

- **No cloud TTS providers.** Never add AWS Polly, GCP TTS, Azure Speech, or WebSpeech. Kokoro is the only TTS engine.
- **No `provider` column** in any database table. Voice identity is solely the Kokoro `voice_id` string.
- **No pitch control.** Kokoro does not expose a pitch parameter. Only `speed` (0.25–4.0) is a viewer-configurable parameter.
- **IPC channel naming:** `domain:action` e.g. `db:getSetting`, `tts:synthesize`, `obs:start`.
- **Renderer never uses Node APIs.** All file I/O, network, and database access goes through IPC.
- **`new Function` for kokoro-js.** Do not use static or dynamic `import()` for kokoro-js — use `(new Function('m', 'return import(m)'))('kokoro-js')` to bypass TypeScript CommonJS downgrade and webpack static analysis.
- **`// kokoro-js` and related packages are in webpack externals.** Do not remove them.
- **SQLite is synchronous** (better-sqlite3). IPC handlers in main.ts are synchronous for database operations; only TTS synthesis is async.
- **Styles:** Plain CSS in `src/renderer/styles/`. No CSS-in-JS, no Tailwind. Use `.card`, `.page`, `.primary`, `.secondary` classes from `global.css`.
- **TypeScript strict mode** is enabled in all tsconfigs.

---

## Adding a New Feature — Checklist

1. **Database change?** → Update `schema.ts` (DDL) and `migrations.ts` (seed/alter logic). Add static methods to `service.ts` or `voiceService.ts`.
2. **New IPC channel?** → Add `ipcMain.handle('domain:action', ...)` in `main.ts`, add to `preload.ts` allowlist if restricted, and update `src/renderer/types/electron.d.ts`.
3. **New page?** → Create `src/renderer/pages/MyPage.tsx`, add `import` and `<Route>` in `App.tsx`, add `<NavLink>` to the sidebar nav.
4. **New Twitch command?** → Add handler to `src/main/commands/commandProcessor.ts`. Follow the pattern of `handleSetVoice` for validation.
5. **New Discord slash command?** → Add to `discordService.ts` (command definition + handler) and `discordVoiceDiscovery.ts` (filter helpers if voice-related).
6. **New setting?** → Add a key to the settings table defaults in `migrations.ts` and document it in this file's Key settings keys table.

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| Kokoro first-synthesis latency | Model loads lazily on first `synthesize()` call if `preloadModel()` hasn't completed. Expect 5–30 s the very first time. |
| `onnxruntime-node` binary | Listed in `asarUnpack` in `package.json`. Do not remove — ASAR packaging breaks native `.node` binaries. |
| `better-sqlite3` after Electron upgrade | Run `npm run rebuild` to recompile native bindings against the new Electron Node.js ABI. |
| Discord global slash commands | Global slash commands take up to 1 hour to propagate. Set `discord_guild_id` in settings for instant registration during development. |
| OBS Browser Source audio | The overlay receives `audioData` (base64 WAV) over WebSocket and plays it via `<audio>`. Ensure "Mute in-app" is enabled when testing with OBS to avoid double audio. |
| Webpack `.node` files | `node-loader` handles native `.node` addon files. Do not remove from `webpack.main.config.js`. |
