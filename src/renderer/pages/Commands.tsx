import React, { useState, useEffect } from 'react';

interface Command {
  name: string;
  permission: string;
  description: string;
  usage: string;
  rateLimit: number;
}

const Commands: React.FC = () => {
  const [commands] = useState<Command[]>([
    {
      name: 'hello',
      permission: 'Viewer',
      description: 'Greet the user',
      usage: '~hello',
      rateLimit: 5
    },
    {
      name: 'voices',
      permission: 'Viewer',
      description: 'Show link to available TTS voices',
      usage: '~voices',
      rateLimit: 10
    },
    {
      name: 'setvoice',
      permission: 'Viewer',
      description: 'Set your TTS voice (case-insensitive)',
      usage: '~setvoice <voice_name>',
      rateLimit: 5
    },
    {
      name: 'setvoicepitch',
      permission: 'Viewer',
      description: 'Set your voice pitch',
      usage: '~setvoicepitch <0 to 2>',
      rateLimit: 5
    },
    {
      name: 'setvoicespeed',
      permission: 'Viewer',
      description: 'Set your voice speed',
      usage: '~setvoicespeed <0.5 to 2.0>',
      rateLimit: 5
    },
    {
      name: 'mutevoice',
      permission: 'Moderator',
      description: 'Mute a user from TTS',
      usage: '~mutevoice @username [minutes]',
      rateLimit: 0
    },
    {
      name: 'unmutevoice',
      permission: 'Moderator',
      description: 'Unmute a user from TTS',
      usage: '~unmutevoice @username',
      rateLimit: 0
    },
    {
      name: 'cooldownvoice',
      permission: 'Moderator',
      description: 'Apply TTS cooldown to a user',
      usage: '~cooldownvoice @username <seconds> [minutes]',
      rateLimit: 0
    },
    {
      name: 'uncooldownvoice',
      permission: 'Moderator',
      description: 'Remove TTS cooldown from a user',
      usage: '~uncooldownvoice @username',
      rateLimit: 0
    },
    {
      name: 'mutetts',
      permission: 'Moderator',
      description: 'Disable all TTS globally',
      usage: '~mutetts',
      rateLimit: 0
    },
    {
      name: 'unmutetts',
      permission: 'Moderator',
      description: 'Enable all TTS globally',
      usage: '~unmutetts',
      rateLimit: 0
    },
    {
      name: 'clearqueue',
      permission: 'Moderator',
      description: 'Clear the TTS queue',
      usage: '~clearqueue',
      rateLimit: 0
    }
  ]);

  const getPermissionColor = (permission: string) => {
    switch (permission.toLowerCase()) {
      case 'viewer':
        return '#28a745';
      case 'moderator':
        return '#ffc107';
      case 'broadcaster':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ color: '#fff' }}>Chat Commands</h1>

      <div style={{
        padding: '15px',
        backgroundColor: '#2a4a6a',
        borderRadius: '8px',
        marginBottom: '20px',
        color: '#a8d8ff'
      }}>
        <strong>ℹ️ Command Prefix:</strong> All commands use the <code>~</code> prefix (e.g., <code>~hello</code>)
        <br />
        <strong>📝 Note:</strong> All command arguments are case-insensitive (usernames, voice names, etc.)
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
        gap: '20px',
        marginTop: '20px'
      }}>
        {commands.map(cmd => (
          <div
            key={cmd.name}
            style={{
              border: '1px solid #444',
              borderRadius: '8px',
              padding: '15px',
              backgroundColor: '#2a2a2a'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>
                <code style={{ backgroundColor: '#1a1a1a', padding: '4px 8px', borderRadius: '4px', color: '#9147ff' }}>
                  {cmd.usage}
                </code>
              </h3>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: 'white',
                  backgroundColor: getPermissionColor(cmd.permission)
                }}
              >
                {cmd.permission}
              </span>
            </div>

            <p style={{ color: '#ccc', margin: '10px 0' }}>
              {cmd.description}
            </p>

            {cmd.rateLimit > 0 && (
              <div style={{
                fontSize: '12px',
                color: '#999',
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: '1px solid #444'
              }}>
                ⏱️ Rate limit: {cmd.rateLimit}s per user
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '30px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <h2 style={{ marginTop: 0 }}>Permission Levels</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '100px',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: getPermissionColor('viewer'),
              textAlign: 'center'
            }}>
              Viewer
            </span>
            <span>Anyone in chat can use these commands</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '100px',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: getPermissionColor('moderator'),
              textAlign: 'center'
            }}>
              Moderator
            </span>
            <span style={{ color: '#ccc' }}>Only moderators and the broadcaster can use these commands</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '100px',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: getPermissionColor('broadcaster'),
              textAlign: 'center'
            }}>
              Broadcaster
            </span>
            <span style={{ color: '#ccc' }}>Only the broadcaster can use these commands</span>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#3a3520',
        borderRadius: '8px',
        border: '1px solid #ffc107',
        color: '#ffd54f'
      }}>
        <strong>💡 Examples:</strong>
        <ul style={{ marginTop: '10px', marginBottom: 0 }}>
          <li><code>~setvoice Samantha</code> - Set voice to Samantha</li>
          <li><code>~setvoicepitch 5</code> - Increase pitch by 5</li>
          <li><code>~setvoicespeed 1.5</code> - Speed up voice to 1.5x</li>
          <li><code>~mutevoice @trolluser 30</code> - Mute user for 30 minutes</li>
          <li><code>~unmutevoice @trolluser</code> - Unmute user (also removes cooldown)</li>
          <li><code>~cooldownvoice @spammer 60 15</code> - 60s cooldown for 15 minutes</li>
          <li><code>~uncooldownvoice @spammer</code> - Remove cooldown</li>
        </ul>
      </div>
    </div>
  );
};

export default Commands;
