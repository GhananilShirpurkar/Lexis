import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="app-shell">
      {/* Carbon Top Nav */}
      <header className="nav-bar">
        <div className="nav-logo-area">
          <Link to="/" className="logo-pill">
            <span>📚</span>
            <span className="logo-wordmark">LEXIS</span>
          </Link>
          <nav className="nav-links">
            <Link to="/" className="nav-link-word">Query</Link>
            <Link to="/dev-console" className="nav-link-word active">Console</Link>
          </nav>
        </div>

        <div className="nav-utility-area">
          <span className="badge badge-amber">DEV MODE</span>
          <button className="btn btn-ghost" onClick={logout} style={{ fontSize: '10px' }}>EXIT</button>
        </div>
      </header>

      {/* Subnav Strip */}
      <div className="subnav-strip">
        <div className="subnav-links">
          <span>LEXIS DEVELOPER DIAGNOSTICS & STRESS TEST CONSOLE</span>
        </div>
        <div>
          <Link to="/" className="subnav-link">← RETURN TO WORKSPACE</Link>
        </div>
      </div>

      <div style={{ padding: 'var(--space-md)', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
          
          {/* Left Column: Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className="content-panel">
              <div className="section-label-bar" style={{ margin: '-12px -12px 12px -12px' }}>
                <div className="label-title">
                  <span>🔑</span>
                  <span>AUTHENTICATION DIAGNOSTICS</span>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-ink-soft)', marginBottom: '12px' }}>
                Verify JWT token payload validation and ping the active backend user endpoint (`GET /auth/me`).
              </p>
              <button className="btn btn-primary" onClick={testAuthMe}>
                EXECUTE /auth/me REQUEST
              </button>
            </div>

            <div className="content-panel">
              <div className="section-label-bar" style={{ margin: '-12px -12px 12px -12px' }}>
                <div className="label-title">
                  <span>⚡</span>
                  <span>RATE LIMITING STRESS TESTER</span>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-ink-soft)', marginBottom: '12px' }}>
                Dispatches 10 simultaneous authentication calls in sub-100ms intervals to verify sliding window HTTP 429 response rate limiting thresholds.
              </p>
              <button
                className="btn btn-submit"
                onClick={runRateLimitStressTest}
                disabled={testingRateLimit}
                style={{ marginBottom: '12px' }}
              >
                {testingRateLimit ? 'TEST IN PROGRESS...' : 'RUN 10-BURST LOGIN STRESS TEST ➔'}
              </button>

              <div className="dev-console-panel">
                {rateLimitLogs.length > 0
                  ? rateLimitLogs.join('\n')
                  : '// Ready to run stress test log execution...'}
              </div>
            </div>
          </div>

          {/* Right Column: Profile & Inspector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className="content-panel">
              <div className="section-label-bar" style={{ margin: '-12px -12px 12px -12px' }}>
                <div className="label-title">
                  <span>👤</span>
                  <span>ACTIVE USER PROFILE METADATA</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted var(--color-hairline)', paddingBottom: '4px' }}>
                  <span style={{ fontWeight: '700', color: 'var(--color-ink-soft)' }}>USER ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{user?.id || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted var(--color-hairline)', paddingBottom: '4px' }}>
                  <span style={{ fontWeight: '700', color: 'var(--color-ink-soft)' }}>EMAIL:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{user?.email || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: '700', color: 'var(--color-ink-soft)' }}>TOKEN STATE:</span>
                  <span className="badge badge-success">VALID JWT PRESENT</span>
                </div>
              </div>
            </div>

            <div className="content-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="section-label-bar" style={{ margin: '-12px -12px 12px -12px' }}>
                <div className="label-title">
                  <span>📡</span>
                  <span>LAST API RESPONSE JSON INSPECTOR</span>
                </div>
              </div>
              <div className="dev-console-panel" style={{ flex: 1 }}>
                {lastResponse ? JSON.stringify(lastResponse, null, 2) : '// Send an API request above to inspect response payload.'}
              </div>
            </div>
          </div>

        </div>
      </div>

      <footer className="footer-bar">
        <div>© 2026 LEXIS CORP • DEV DIAGNOSTIC CONSOLE</div>
        <div>
          <span className="esrb-badge">INTERNAL TOOLS</span>
        </div>
      </footer>
    </div>
  );
}

export default DevConsole;
