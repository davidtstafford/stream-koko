import React, { useState, useEffect } from 'react';
import { getTTSQueue, TTSQueueItem } from '../services/ttsQueue';

type TTSTab = 'main' | 'rules' | 'access' | 'voice-settings' | 'restrictions';

const TTS: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TTSTab>('main');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [defaultVoice, setDefaultVoice] = useState('af_heart');
  const [defaultSpeed, setDefaultSpeed] = useState(1.0);
  const [defaultVolume, setDefaultVolume] = useState(1.0);
  const [testText, setTestText] = useState('Hello! This is a test of the Kokoro voice.');
  const [queue, setQueue] = useState<TTSQueueItem[]>([]);
  const [currentItem, setCurrentItem] = useState<TTSQueueItem | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [obsRunning, setObsRunning] = useState(false);
  const [obsUrl, setObsUrl] = useState('');
  const [apiUrl, setApiUrl] = useState('http://localhost:8766');
  const [muteInApp, setMuteInApp] = useState(false);
  const [testing, setTesting] = useState(false);
  const [voices, setVoices] = useState<{voice_id: string; name: string; language_name: string}[]>([]);

  // Rules
  const [filterCommands, setFilterCommands] = useState(true);
  const [filterUrls, setFilterUrls] = useState(true);
  const [filterBots, setFilterBots] = useState(true);
  const [botList, setBotList] = useState('Nightbot,StreamElements,Streamlabs,Moobot,Fossabot');
  const [announceUsername, setAnnounceUsername] = useState(true);
  const [usernameStyle, setUsernameStyle] = useState('says');
  const [minLength, setMinLength] = useState(1);
  const [maxLength, setMaxLength] = useState(500);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [duplicateWindow, setDuplicateWindow] = useState(60);
  const [userCooldown, setUserCooldown] = useState(false);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(30);
  const [globalCooldown, setGlobalCooldown] = useState(false);
  const [globalCooldownSeconds, setGlobalCooldownSeconds] = useState(5);
  const [blockedWords, setBlockedWords] = useState<string[]>([]);
  const [newBlockedWord, setNewBlockedWord] = useState('');
  const [blockedWordReplacement, setBlockedWordReplacement] = useState('[censored]');

  // Access
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [allowSubs, setAllowSubs] = useState(false);
  const [allowVIPs, setAllowVIPs] = useState(false);
  const [allowMods, setAllowMods] = useState(false);
  const [allowRedeems, setAllowRedeems] = useState(false);
  const [redeemName, setRedeemName] = useState('Give Me TTS');
  const [redeemDuration, setRedeemDuration] = useState(30);

  // Voice settings per-viewer
  const [vsSearch, setVsSearch] = useState('');
  const [vsResults, setVsResults] = useState<any[]>([]);
  const [selectedViewer, setSelectedViewer] = useState<any | null>(null);
  const [viewerVoice, setViewerVoice] = useState('');
  const [viewerSpeed, setViewerSpeed] = useState(1.0);

  // Restrictions
  const [restrictSearch, setRestrictSearch] = useState('');
  const [mutedViewers, setMutedViewers] = useState<any[]>([]);
  const [cooldownViewers, setCooldownViewers] = useState<any[]>([]);

  const ttsQueue = getTTSQueue();

  useEffect(() => {
    loadSettings();
    checkObsStatus();
    loadApiUrl();
    loadRestrictions();

    ttsQueue.onQueueUpdate(setQueue);
    ttsQueue.onItemStart(setCurrentItem);
    ttsQueue.onItemComplete(() => setCurrentItem(null));

    const unsubStatus = window.api.on('tts:status-changed', setTtsEnabled);

    // Poll model loaded status
    const modelPoll = setInterval(async () => {
      const loaded = await window.api.invoke('tts:isModelLoaded');
      setModelLoaded(loaded);
    }, 3000);

    return () => { unsubStatus(); clearInterval(modelPoll); };
  }, []);

  const loadSettings = async () => {
    const [en, voice, speed, vol, mute,
      fCmd, fUrl, fBot, bots, ann, style,
      minL, maxL, skipD, dupW, uCool, uSecs, gCool, gSecs,
      bwords, bRep, acc, aSub, aVip, aMod, aRedm, rName, rDur
    ] = await Promise.all([
      window.api.invoke('db:getSetting', 'tts_enabled'),
      window.api.invoke('db:getSetting', 'tts_default_voice'),
      window.api.invoke('db:getSetting', 'tts_default_speed'),
      window.api.invoke('db:getSetting', 'tts_default_volume'),
      window.api.invoke('db:getSetting', 'tts_mute_in_app'),
      window.api.invoke('db:getSetting', 'tts_filter_commands'),
      window.api.invoke('db:getSetting', 'tts_filter_urls'),
      window.api.invoke('db:getSetting', 'tts_filter_bots'),
      window.api.invoke('db:getSetting', 'tts_bot_list'),
      window.api.invoke('db:getSetting', 'tts_announce_username'),
      window.api.invoke('db:getSetting', 'tts_username_style'),
      window.api.invoke('db:getSetting', 'tts_min_length'),
      window.api.invoke('db:getSetting', 'tts_max_length'),
      window.api.invoke('db:getSetting', 'tts_skip_duplicates'),
      window.api.invoke('db:getSetting', 'tts_duplicate_window'),
      window.api.invoke('db:getSetting', 'tts_user_cooldown'),
      window.api.invoke('db:getSetting', 'tts_user_cooldown_seconds'),
      window.api.invoke('db:getSetting', 'tts_global_cooldown'),
      window.api.invoke('db:getSetting', 'tts_global_cooldown_seconds'),
      window.api.invoke('db:getSetting', 'tts_blocked_words'),
      window.api.invoke('db:getSetting', 'tts_blocked_word_replacement'),
      window.api.invoke('db:getSetting', 'tts_access_restricted'),
      window.api.invoke('db:getSetting', 'tts_access_subscribers'),
      window.api.invoke('db:getSetting', 'tts_access_vips'),
      window.api.invoke('db:getSetting', 'tts_access_moderators'),
      window.api.invoke('db:getSetting', 'tts_access_redeems'),
      window.api.invoke('db:getSetting', 'tts_redeem_name'),
      window.api.invoke('db:getSetting', 'tts_redeem_duration'),
    ]);

    if (en)    setTtsEnabled(en === 'true');
    if (voice) setDefaultVoice(voice);
    if (speed) setDefaultSpeed(parseFloat(speed));
    if (vol)   setDefaultVolume(parseFloat(vol));
    if (mute)  setMuteInApp(mute === 'true');
    setFilterCommands(fCmd !== 'false');
    setFilterUrls(fUrl !== 'false');
    setFilterBots(fBot !== 'false');
    if (bots)  setBotList(bots);
    setAnnounceUsername(ann !== 'false');
    if (style) setUsernameStyle(style);
    if (minL)  setMinLength(parseInt(minL));
    if (maxL)  setMaxLength(parseInt(maxL));
    setSkipDuplicates(skipD === 'true');
    if (dupW)  setDuplicateWindow(parseInt(dupW));
    setUserCooldown(uCool === 'true');
    if (uSecs) setUserCooldownSeconds(parseInt(uSecs));
    setGlobalCooldown(gCool === 'true');
    if (gSecs) setGlobalCooldownSeconds(parseInt(gSecs));
    if (bwords) try { setBlockedWords(JSON.parse(bwords)); } catch {}
    if (bRep)  setBlockedWordReplacement(bRep);
    setAccessRestricted(acc === 'true');
    setAllowSubs(aSub === 'true');
    setAllowVIPs(aVip === 'true');
    setAllowMods(aMod === 'true');
    setAllowRedeems(aRedm === 'true');
    if (rName) setRedeemName(rName);
    if (rDur)  setRedeemDuration(parseInt(rDur));

    const loaded = await window.api.invoke('tts:isModelLoaded');
    setModelLoaded(loaded);

    const voiceData = await window.api.invoke('db:getAllVoices');
    setVoices(voiceData ?? []);
  };

  const checkObsStatus = async () => {
    const s = await window.api.invoke('obs:getStatus');
    setObsRunning(s.running);
    if (s.url) setObsUrl(s.url + '/tts-overlay');
  };

  const loadApiUrl = async () => {
    const url = await window.api.invoke('api:getUrl');
    if (url) setApiUrl(url);
  };

  const save = (key: string, value: string) => window.api.invoke('db:setSetting', key, value);

  const handleTtsToggle = async () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    await save('tts_enabled', next ? 'true' : 'false');
  };

  const handleTestVoice = async () => {
    if (!testText.trim() || testing) return;
    setTesting(true);
    ttsQueue.add({
      id: `test-${Date.now()}`,
      text: testText,
      voiceId: defaultVoice,
      speed: defaultSpeed,
      username: 'Test'
    });
    setTesting(false);
  };

  const handleStartObs = async () => {
    const r = await window.api.invoke('obs:start');
    if (r.success) { setObsRunning(true); setObsUrl(r.url + '/tts-overlay'); }
  };

  const handleStopObs = async () => {
    await window.api.invoke('obs:stop');
    setObsRunning(false);
    setObsUrl('');
  };

  const handleCopyObsUrl = () => navigator.clipboard.writeText(obsUrl);

  const loadRestrictions = async () => {
    try {
      const rows = await window.api.invoke('db:query', `
        SELECT r.*, v.username, v.display_name
        FROM viewer_tts_restrictions r
        JOIN viewers v ON r.viewer_id = v.id
        WHERE r.is_muted = 1 OR r.has_cooldown = 1
      `);
      setMutedViewers((rows ?? []).filter((r: any) => r.is_muted));
      setCooldownViewers((rows ?? []).filter((r: any) => r.has_cooldown));
    } catch {}
  };

  const searchVoiceSettings = async (q: string) => {
    if (!q.trim()) { setVsResults([]); return; }
    try {
      const viewers = await window.api.invoke('db:getViewers');
      const filtered = (viewers ?? []).filter((v: any) =>
        v.username.toLowerCase().includes(q.toLowerCase()) ||
        (v.display_name ?? '').toLowerCase().includes(q.toLowerCase())
      );
      setVsResults(filtered.slice(0, 10));
    } catch {}
  };

  const loadViewerPref = async (viewer: any) => {
    setSelectedViewer(viewer);
    const pref = await window.api.invoke('db:getViewerVoicePreference', viewer.id);
    const defVoice = await window.api.invoke('db:getSetting', 'tts_default_voice');
    setViewerVoice(pref?.voice_id ?? defVoice ?? 'af_heart');
    setViewerSpeed(pref?.speed ?? 1.0);
  };

  const saveViewerPref = async () => {
    if (!selectedViewer) return;
    await window.api.invoke('db:setViewerVoicePreference', selectedViewer.id, viewerVoice, viewerSpeed);
    alert(`Saved voice preference for ${selectedViewer.display_name ?? selectedViewer.username}`);
  };

  const removeViewerPref = async () => {
    if (!selectedViewer) return;
    await window.api.invoke('db:run', 'DELETE FROM viewer_voice_preferences WHERE viewer_id = ?', [selectedViewer.id]);
    setSelectedViewer(null);
    setVsResults([]);
    setVsSearch('');
  };

  const tabs: { key: TTSTab; label: string }[] = [
    { key: 'main',           label: 'Main' },
    { key: 'rules',          label: 'Rules' },
    { key: 'access',         label: 'Access' },
    { key: 'voice-settings', label: 'Voice Settings' },
    { key: 'restrictions',   label: 'Restrictions' },
  ];

  return (
    <div className="page">
      <h2>TTS Settings</h2>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Main tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'main' && (
        <>
          <div className="card">
            <h3>TTS Status</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: ttsEnabled ? '#00ff00' : '#ff0000' }} />
                <span>{ttsEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <button className={ttsEnabled ? 'secondary' : 'primary'} onClick={handleTtsToggle}>
                {ttsEnabled ? 'Disable TTS' : 'Enable TTS'}
              </button>
            </div>

            <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: modelLoaded ? '#00ff00' : '#ffaa00' }} />
              <span style={{ fontSize: 13, color: '#aaa' }}>
                {modelLoaded ? 'Kokoro model loaded — ready for TTS' : 'Kokoro model loading… (first run downloads ~170 MB)'}
              </span>
            </div>
          </div>

          <div className="card">
            <h3>Default Voice</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
              Used for viewers who have not set their own voice.
              Go to the <strong>Voices</strong> page to browse or add voices.
            </p>
            <select
              value={defaultVoice}
              onChange={e => { setDefaultVoice(e.target.value); save('tts_default_voice', e.target.value); }}
              style={{ width: 320 }}
            >
              {voices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.voice_id} — {v.name} ({v.language_name})
                </option>
              ))}
              {voices.length === 0 && (
                <option value={defaultVoice}>{defaultVoice}</option>
              )}
            </select>
          </div>

          <div className="card">
            <h3>Default Speed</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 14 }}>Speed: {defaultSpeed.toFixed(2)}x</label>
              <input
                type="range" min="0.25" max="4" step="0.05"
                value={defaultSpeed}
                onChange={e => { const v = parseFloat(e.target.value); setDefaultSpeed(v); save('tts_default_speed', v.toString()); }}
                style={{ width: '100%', marginTop: 5 }}
              />
            </div>
          </div>

          <div className="card">
            <h3>Test Voice</h3>
            <textarea
              value={testText}
              onChange={e => setTestText(e.target.value)}
              rows={3}
              style={{ marginBottom: 10, width: '100%' }}
            />
            <button className="primary" onClick={handleTestVoice} disabled={testing || !testText.trim()}>
              {testing ? '⏳ Generating…' : '🔊 Test Voice'}
            </button>
            {!modelLoaded && (
              <p style={{ fontSize: 12, color: '#ffaa00', marginTop: 8 }}>
                ⚠️ Model still loading — test will queue once ready.
              </p>
            )}
          </div>

          <div className="card">
            <h3>TTS Queue</h3>
            {currentItem && (
              <div style={{ padding: '10px', background: '#1a1a2e', borderRadius: 6, marginBottom: 10, borderLeft: '4px solid #9147ff' }}>
                🔊 <strong>{currentItem.username}</strong>: {currentItem.text}
              </div>
            )}
            {queue.filter(i => i.status === 'pending').length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>Queue is empty</p>
            ) : (
              <div>
                <p style={{ color: '#aaa', fontSize: 13, marginBottom: 8 }}>
                  {queue.filter(i => i.status === 'pending').length} message(s) pending
                </p>
                {queue.filter(i => i.status === 'pending').slice(0, 5).map(item => (
                  <div key={item.id} style={{ padding: '6px 10px', background: '#2a2a2a', borderRadius: 4, marginBottom: 4, fontSize: 13 }}>
                    <strong>{item.username}</strong>: {item.text.substring(0, 80)}
                  </div>
                ))}
              </div>
            )}
            <button className="secondary" onClick={() => getTTSQueue().clear()} style={{ marginTop: 10 }}>
              🗑️ Clear Queue
            </button>
          </div>

          <div className="card">
            <h3>OBS Browser Source</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 15 }}>
              Add the URL below as a Browser Source in OBS to show TTS messages on stream.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              {obsRunning
                ? <button className="secondary" onClick={handleStopObs}>⏹️ Stop Server</button>
                : <button className="primary"   onClick={handleStartObs}>▶️ Start Server</button>}
            </div>
            {obsRunning && (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <input type="text" value={obsUrl} readOnly style={{ flex: 1 }} />
                  <button className="primary" onClick={handleCopyObsUrl}>📋 Copy</button>
                </div>
                <div style={{ fontSize: 12, color: '#00ff00' }}>✅ Server running</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
                  <input type="checkbox" checked={muteInApp} onChange={e => {
                    setMuteInApp(e.target.checked);
                    save('tts_mute_in_app', e.target.checked ? 'true' : 'false');
                  }} />
                  🔇 Mute in-app audio when OBS is active (prevents echo)
                </label>
              </>
            )}
          </div>

          <div className="card">
            <h3>Stream Deck / Remote Control</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
              Send a POST to <code>{apiUrl}/toggle-tts</code> to toggle TTS (e.g. from a Stream Deck button).
            </p>
          </div>
        </>
      )}

      {/* ── Rules tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <>
          <div className="card">
            <h3>Message Filtering</h3>
            {[
              { label: 'Filter bot commands (messages starting with !)', val: filterCommands, set: setFilterCommands, key: 'tts_filter_commands' },
              { label: 'Filter URLs', val: filterUrls, set: setFilterUrls, key: 'tts_filter_urls' },
              { label: 'Filter known bots', val: filterBots, set: setFilterBots, key: 'tts_filter_bots' },
            ].map(({ label, val, set, key }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
                <input type="checkbox" checked={val} onChange={e => { set(e.target.checked); save(key, e.target.checked ? 'true' : 'false'); }} />
                {label}
              </label>
            ))}
            {filterBots && (
              <div>
                <label style={{ fontSize: 13 }}>Bot usernames (comma-separated):</label>
                <input type="text" value={botList} onChange={e => setBotList(e.target.value)} style={{ marginTop: 5 }} />
                <button className="secondary" style={{ marginTop: 5 }} onClick={() => save('tts_bot_list', botList)}>Save</button>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Username Announcement</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
              <input type="checkbox" checked={announceUsername} onChange={e => { setAnnounceUsername(e.target.checked); save('tts_announce_username', e.target.checked ? 'true' : 'false'); }} />
              Announce username before message
            </label>
            {announceUsername && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Username</span>
                <select value={usernameStyle} onChange={e => { setUsernameStyle(e.target.value); save('tts_username_style', e.target.value); }}>
                  <option value="says">says</option>
                  <option value="typed">typed</option>
                  <option value="wrote">wrote</option>
                </select>
                <span style={{ fontSize: 13 }}>message</span>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Message Length</h3>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <label style={{ fontSize: 13 }}>Min length: {minLength}</label>
                <input type="range" min="0" max="50" value={minLength} onChange={e => setMinLength(parseInt(e.target.value))} style={{ width: 150 }} />
                <button className="secondary" style={{ marginLeft: 8 }} onClick={() => save('tts_min_length', minLength.toString())}>Save</button>
              </div>
              <div>
                <label style={{ fontSize: 13 }}>Max length: {maxLength}</label>
                <input type="range" min="50" max="1000" value={maxLength} onChange={e => setMaxLength(parseInt(e.target.value))} style={{ width: 150 }} />
                <button className="secondary" style={{ marginLeft: 8 }} onClick={() => save('tts_max_length', maxLength.toString())}>Save</button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Cooldowns</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
              <input type="checkbox" checked={userCooldown} onChange={e => { setUserCooldown(e.target.checked); save('tts_user_cooldown', e.target.checked ? 'true' : 'false'); }} />
              Per-user cooldown
            </label>
            {userCooldown && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>Seconds between messages:</span>
                <input type="number" min="1" max="300" value={userCooldownSeconds} onChange={e => setUserCooldownSeconds(parseInt(e.target.value))} style={{ width: 70 }} />
                <button className="secondary" onClick={() => save('tts_user_cooldown_seconds', userCooldownSeconds.toString())}>Save</button>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
              <input type="checkbox" checked={globalCooldown} onChange={e => { setGlobalCooldown(e.target.checked); save('tts_global_cooldown', e.target.checked ? 'true' : 'false'); }} />
              Global TTS cooldown
            </label>
            {globalCooldown && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Seconds:</span>
                <input type="number" min="1" max="60" value={globalCooldownSeconds} onChange={e => setGlobalCooldownSeconds(parseInt(e.target.value))} style={{ width: 70 }} />
                <button className="secondary" onClick={() => save('tts_global_cooldown_seconds', globalCooldownSeconds.toString())}>Save</button>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Blocked Words</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>Words replaced with the placeholder below before TTS reads them.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input type="text" value={newBlockedWord} onChange={e => setNewBlockedWord(e.target.value)} placeholder="Add word..." style={{ flex: 1 }} />
              <button className="primary" onClick={() => {
                if (!newBlockedWord.trim()) return;
                const next = [...blockedWords, newBlockedWord.trim().toLowerCase()];
                setBlockedWords(next);
                save('tts_blocked_words', JSON.stringify(next));
                setNewBlockedWord('');
              }}>Add</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {blockedWords.map(w => (
                <span key={w} style={{ background: '#333', padding: '2px 8px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => { const next = blockedWords.filter(x => x !== w); setBlockedWords(next); save('tts_blocked_words', JSON.stringify(next)); }}>
                  {w} ✕
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>Replace with:</span>
              <input type="text" value={blockedWordReplacement} onChange={e => setBlockedWordReplacement(e.target.value)} style={{ width: 150 }} />
              <button className="secondary" onClick={() => save('tts_blocked_word_replacement', blockedWordReplacement)}>Save</button>
            </div>
          </div>
        </>
      )}

      {/* ── Access tab ────────────────────────────────────────────────────── */}
      {activeTab === 'access' && (
        <div className="card">
          <h3>TTS Access Control</h3>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 15 }}>
            By default everyone can use TTS. Enable restrictions to limit access.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15, fontSize: 14 }}>
            <input type="checkbox" checked={accessRestricted} onChange={e => { setAccessRestricted(e.target.checked); save('tts_access_restricted', e.target.checked ? 'true' : 'false'); }} />
            Restrict TTS access
          </label>
          {accessRestricted && (
            <>
              {[
                { label: 'Subscribers', val: allowSubs, set: setAllowSubs, key: 'tts_access_subscribers' },
                { label: 'VIPs',        val: allowVIPs, set: setAllowVIPs, key: 'tts_access_vips' },
                { label: 'Moderators',  val: allowMods, set: setAllowMods, key: 'tts_access_moderators' },
                { label: 'Channel Point Redeems', val: allowRedeems, set: setAllowRedeems, key: 'tts_access_redeems' },
              ].map(({ label, val, set, key }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
                  <input type="checkbox" checked={val} onChange={e => { set(e.target.checked); save(key, e.target.checked ? 'true' : 'false'); }} />
                  Allow {label}
                </label>
              ))}
              {allowRedeems && (
                <div className="card" style={{ background: '#2a2a2a' }}>
                  <h4 style={{ marginBottom: 10 }}>Redeem Settings</h4>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13 }}>Redeem name:</span>
                    <input type="text" value={redeemName} onChange={e => setRedeemName(e.target.value)} style={{ flex: 1 }} />
                    <button className="secondary" onClick={() => save('tts_redeem_name', redeemName)}>Save</button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>Duration (minutes):</span>
                    <input type="number" min="1" max="120" value={redeemDuration} onChange={e => setRedeemDuration(parseInt(e.target.value))} style={{ width: 70 }} />
                    <button className="secondary" onClick={() => save('tts_redeem_duration', redeemDuration.toString())}>Save</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Voice Settings tab ────────────────────────────────────────────── */}
      {activeTab === 'voice-settings' && (
        <div className="card">
          <h3>Viewer Voice Preferences</h3>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 15 }}>
            Override the voice and speed for a specific viewer. Viewers can also set their own voice via <code>~setvoice</code> in chat.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
            <input
              type="text" value={vsSearch}
              onChange={e => { setVsSearch(e.target.value); searchVoiceSettings(e.target.value); }}
              placeholder="Search viewer..."
              style={{ flex: 1 }}
            />
          </div>
          {vsResults.length > 0 && (
            <div style={{ marginBottom: 15 }}>
              {vsResults.map(v => (
                <div key={v.id} style={{ padding: '8px 12px', background: '#2a2a2a', borderRadius: 4, marginBottom: 4, cursor: 'pointer', fontSize: 13 }}
                  onClick={() => loadViewerPref(v)}>
                  {v.display_name ?? v.username}
                </div>
              ))}
            </div>
          )}
          {selectedViewer && (
            <div className="card" style={{ background: '#2a2a2a' }}>
              <h4>Preferences for {selectedViewer.display_name ?? selectedViewer.username}</h4>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, display: 'block', marginBottom: 5 }}>Voice ID:</label>
                <input type="text" value={viewerVoice} onChange={e => setViewerVoice(e.target.value)} placeholder="e.g. af_heart" />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ fontSize: 13 }}>Speed: {viewerSpeed.toFixed(2)}x</label>
                <input type="range" min="0.25" max="4" step="0.05" value={viewerSpeed} onChange={e => setViewerSpeed(parseFloat(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="primary" onClick={saveViewerPref}>💾 Save</button>
                <button className="secondary" onClick={removeViewerPref}>🗑️ Remove</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Restrictions tab ─────────────────────────────────────────────── */}
      {activeTab === 'restrictions' && (
        <>
          <div className="card">
            <h3>Muted Viewers</h3>
            {mutedViewers.length === 0
              ? <p style={{ color: '#888', fontSize: 13 }}>No muted viewers</p>
              : mutedViewers.map(r => (
                  <div key={r.viewer_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#2a2a2a', borderRadius: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>
                      {r.display_name ?? r.username}
                      {r.mute_expires_at ? ` (until ${new Date(r.mute_expires_at).toLocaleString()})` : ' (permanent)'}
                    </span>
                    <button className="secondary" onClick={async () => {
                      await window.api.invoke('db:run', 'UPDATE viewer_tts_restrictions SET is_muted = 0 WHERE viewer_id = ?', [r.viewer_id]);
                      loadRestrictions();
                    }}>Unmute</button>
                  </div>
                ))
            }
          </div>
          <div className="card">
            <h3>Viewers with Cooldown</h3>
            {cooldownViewers.length === 0
              ? <p style={{ color: '#888', fontSize: 13 }}>No cooldown restrictions</p>
              : cooldownViewers.map(r => (
                  <div key={r.viewer_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#2a2a2a', borderRadius: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>
                      {r.display_name ?? r.username} — every {r.cooldown_gap_seconds}s
                    </span>
                    <button className="secondary" onClick={async () => {
                      await window.api.invoke('db:run', 'UPDATE viewer_tts_restrictions SET has_cooldown = 0 WHERE viewer_id = ?', [r.viewer_id]);
                      loadRestrictions();
                    }}>Remove</button>
                  </div>
                ))
            }
          </div>
        </>
      )}
    </div>
  );
};

export default TTS;
