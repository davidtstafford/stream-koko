import React, { useState, useEffect } from 'react';

const Connection: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Check if already connected
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const token = await window.api.invoke('db:getSetting', 'twitch_token');
      const savedUsername = await window.api.invoke('db:getSetting', 'twitch_username');
      
      if (token && savedUsername) {
        // Validate token
        const result = await window.api.invoke('twitch:validateToken', token);
        if (result.success && result.valid) {
          setIsConnected(true);
          setUsername(savedUsername);
          setStatus(`Connected as ${savedUsername}`);
        } else {
          setStatus('Token expired or invalid');
        }
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setStatus('Error checking connection status');
    }
  };

  const handleOAuthLogin = async () => {
    setIsConnecting(true);
    setStatus('Opening browser for authentication...');

    try {
      const result = await window.api.invoke('twitch:authenticateOAuth');
      
      if (result.success) {
        setUsername(result.username);
        setStatus('Authenticated! Connecting to chat...');
        
        // Connect to Twitch chat
        await window.api.invoke('twitch:connect', {
          token: result.token,
          channels: [result.username]
        });
        
        setIsConnected(true);
        setStatus(`Connected as ${result.username}`);
      } else {
        setStatus(`Authentication failed: ${result.error}`);
      }
    } catch (error) {
      console.error('OAuth error:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.api.invoke('twitch:disconnect');
      setIsConnected(false);
      setUsername('');
      setStatus('Disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
      setStatus('Error disconnecting');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Twitch Connection</h1>
      
      <div style={{ 
        padding: '20px', 
        border: '1px solid #ccc', 
        borderRadius: '8px',
        maxWidth: '500px',
        marginTop: '20px'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <strong>Status:</strong> 
          <span style={{ 
            marginLeft: '10px',
            color: isConnected ? '#28a745' : '#6c757d'
          }}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>

        {username && (
          <div style={{ marginBottom: '20px' }}>
            <strong>Username:</strong> <span style={{ marginLeft: '10px' }}>{username}</span>
          </div>
        )}

        {status && (
          <div style={{ 
            marginBottom: '20px',
            padding: '10px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            fontSize: '14px',
            color: '#212529'
          }}>
            {status}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          {!isConnected ? (
            <button 
              onClick={handleOAuthLogin}
              disabled={isConnecting}
              style={{
                padding: '12px 24px',
                backgroundColor: '#9147ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isConnecting ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                opacity: isConnecting ? 0.6 : 1
              }}
            >
              {isConnecting ? '⏳ Authenticating...' : '🔐 Connect with Twitch'}
            </button>
          ) : (
            <button 
              onClick={handleDisconnect}
              style={{
                padding: '12px 24px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Disconnect
            </button>
          )}
        </div>

        <div style={{ 
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#e7f3ff',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#004085'
        }}>
          <strong>ℹ️ How OAuth works:</strong>
          <ul style={{ marginTop: '10px', marginBottom: 0, paddingLeft: '20px' }}>
            <li>A browser window will open to Twitch</li>
            <li>Log in and authorize Stream Yap Yap</li>
            <li>The browser will redirect back to the app</li>
            <li>You'll be automatically connected to chat</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Connection;
