import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function DevConsole() {
  const { token, logout, user } = useAuth();
  const [rateLimitLogs, setRateLimitLogs] = useState([]);
  const [testingRateLimit, setTestingRateLimit] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);

  const runRateLimitStressTest = async () => {
    setTestingRateLimit(true);
    setRateLimitLogs([]);
    const logs = [];
    
    const testEmail = `brute_force_${Math.floor(Math.random() * 10000)}@example.com`;
    
    logs.push(`[SYSTEM] Starting Rate Limiting Stress Test targeting email: ${testEmail}`);
    setRateLimitLogs([...logs]);
    
    for (let i = 1; i <= 10; i++) {
      logs.push(`[REQ #${i}] Sending POST /auth/login...`);
      setRateLimitLogs([...logs]);
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: testEmail,
            password: 'wrong_password_test_limiter'
          })
        });
        const data = await res.json();
        
        if (res.ok) {
          logs.push(`[REQ #${i}] SUCCESS (HTTP ${res.status}) - Unexpected behavior.`);
        } else {
          const details = data?.detail?.error?.message || JSON.stringify(data);
          if (res.status === 429) {
            logs.push(`[REQ #${i}] RATE LIMITED (HTTP 429) 🔴 - ${details}`);
          } else {
            logs.push(`[REQ #${i}] FAILED (HTTP ${res.status}) ⚠️ - ${details}`);
          }
        }
      } catch (err) {
        logs.push(`[REQ #${i}] ERROR: ${err.message}`);
      }
      
      setRateLimitLogs([...logs]);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    
    logs.push("[SYSTEM] Stress test completed.");
    setRateLimitLogs([...logs]);
    setTestingRateLimit(false);
  };

  const testAuthMe = async () => {
    try {
      const res = await apiClient.get('/auth/me');
      setLastResponse(res.data);
    } catch (err) {
      setLastResponse(err.response?.data || { error: err.message });
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Lexis Developer Console</h2>
        <button onClick={logout} className="btn btn-secondary danger">Log Out</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <section className="form-card">
            <h2>Authentication Testing</h2>
            <p className="description">Verify token validation and fetch personal user profile details from the database.</p>
            <div className="action-buttons-grid">
              <button className="btn btn-primary" onClick={testAuthMe}>
                Fetch /auth/me
              </button>
            </div>
          </section>

          <section className="form-card">
            <h2>Brute Force / Rate Limit Test</h2>
            <p className="description">
              Triggers 10 authentication requests in rapid succession to test the backend's sliding-window login rate limiting threshold.
            </p>
            <button
              className="btn btn-secondary warning"
              onClick={runRateLimitStressTest}
              disabled={testingRateLimit}
            >
              {testingRateLimit ? 'Testing in progress...' : 'Simulate 10 Rapid Logins'}
            </button>
            <div className="log-window">
              <pre>
                {rateLimitLogs.length > 0
                  ? rateLimitLogs.join('\n')
                  : 'No stress test events triggered yet.'}
              </pre>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <section className="form-card">
            <h2>Active User Profile</h2>
            <div className="profile-grid">
              <div className="profile-row">
                <span className="profile-label">User ID:</span>
                <span className="profile-value">{user?.id || '—'}</span>
              </div>
              <div className="profile-row">
                <span className="profile-label">Email:</span>
                <span className="profile-value">{user?.email || '—'}</span>
              </div>
            </div>
          </section>

          <section className="form-card terminal-card">
            <h2>Last API HTTP Response</h2>
            <div className="terminal-body">
              <pre>
                {lastResponse ? JSON.stringify(lastResponse, null, 2) : '// No requests sent in this session.'}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default DevConsole;
