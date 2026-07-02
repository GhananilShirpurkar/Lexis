import React, { useState, useEffect } from 'react'

function App() {
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  
  const [token, setToken] = useState(localStorage.getItem('lexis_access_token') || '')
  const [authStatus, setAuthStatus] = useState('Logged Out')
  const [profile, setProfile] = useState(null)
  
  const [lastResponse, setLastResponse] = useState(null)
  const [rateLimitLogs, setRateLimitLogs] = useState([])
  const [testingRateLimit, setTestingRateLimit] = useState(false)

  // Sync token state with local storage and refresh active profile
  useEffect(() => {
    if (token) {
      localStorage.setItem('lexis_access_token', token)
      setAuthStatus('Logged In')
      fetchProfile()
    } else {
      localStorage.removeItem('lexis_access_token')
      setAuthStatus('Logged Out')
      setProfile(null)
    }
  }, [token])

  const handleRegister = async (e) => {
    e.preventDefault()
    setLastResponse(null)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword
        })
      })
      const data = await response.json()
      setLastResponse(data)
      if (response.ok && data.access_token) {
        setToken(data.access_token)
      }
    } catch (error) {
      setLastResponse({ error: error.message })
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLastResponse(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword
        })
      })
      const data = await response.json()
      setLastResponse(data)
      if (response.ok && data.access_token) {
        setToken(data.access_token)
      }
    } catch (error) {
      setLastResponse({ error: error.message })
    }
  }

  const handleLogout = () => {
    setToken('')
    setLastResponse({ status: 'Logged out successfully' })
  }

  const fetchProfile = async () => {
    if (!token) return
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      const data = await response.json()
      setLastResponse(data)
      if (response.ok) {
        setProfile(data)
      } else {
        if (response.status === 401) {
          setToken('')
        }
      }
    } catch (error) {
      setLastResponse({ error: error.message })
    }
  }

  const runRateLimitStressTest = async () => {
    setTestingRateLimit(true)
    setRateLimitLogs([])
    const logs = []
    
    // Target user account
    const testEmail = `brute_force_${Math.floor(Math.random() * 10000)}@example.com`
    
    logs.push(`[SYSTEM] Starting Rate Limiting Stress Test targeting email: ${testEmail}`)
    setRateLimitLogs([...logs])
    
    for (let i = 1; i <= 10; i++) {
      logs.push(`[REQ #${i}] Sending POST /auth/login...`)
      setRateLimitLogs([...logs])
      
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
        })
        const data = await res.json()
        
        if (res.ok) {
          logs.push(`[REQ #${i}] SUCCESS (HTTP ${res.status}) - Unexpected behavior.`)
        } else {
          const details = data?.detail?.error?.message || JSON.stringify(data)
          if (res.status === 429) {
            logs.push(`[REQ #${i}] RATE LIMITED (HTTP 429) 🔴 - ${details}`)
          } else {
            logs.push(`[REQ #${i}] FAILED (HTTP ${res.status}) ⚠️ - ${details}`)
          }
        }
      } catch (err) {
        logs.push(`[REQ #${i}] ERROR: ${err.message}`)
      }
      
      setRateLimitLogs([...logs])
      // Small pause to allow visual log updates
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    
    logs.push("[SYSTEM] Stress test completed.")
    setRateLimitLogs([...logs])
    setTestingRateLimit(false)
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">🛠️</span>
          <span className="logo-text">Lexis Dev Console</span>
          <span className="badge">v0.1.0-scaffold</span>
        </div>
        <nav className="nav-links">
          <div className="status-indicator-link">
            <span className={`status-dot ${authStatus === 'Logged In' ? 'active' : ''}`}></span>
            <span id="auth-status">{authStatus}</span>
          </div>
        </nav>
      </header>

      <main className="dev-console-layout">
        {/* Left Column - Forms & Actions */}
        <div className="console-panel left-panel">
          {/* Register Card */}
          <section className="form-card" id="register-card">
            <h2>User Registration</h2>
            <form id="register-form" onSubmit={handleRegister}>
              <div className="input-group">
                <label htmlFor="register-email">Email Address</label>
                <input
                  type="email"
                  id="register-email"
                  placeholder="test@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="register-password">Password</label>
                <input
                  type="password"
                  id="register-password"
                  placeholder="At least 8 characters"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" id="register-btn" className="btn btn-primary">
                Register Account
              </button>
            </form>
          </section>

          {/* Login Card */}
          <section className="form-card" id="login-card">
            <h2>User Login</h2>
            <form id="login-form" onSubmit={handleLogin}>
              <div className="input-group">
                <label htmlFor="login-email">Email Address</label>
                <input
                  type="email"
                  id="login-email"
                  placeholder="test@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="login-password">Password</label>
                <input
                  type="password"
                  id="login-password"
                  placeholder="At least 8 characters"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" id="login-btn" className="btn btn-primary">
                Log In
              </button>
            </form>
          </section>

          {/* Active Session Info */}
          <section className="form-card" id="session-card">
            <h2>Active Session Token</h2>
            <div className="token-wrapper">
              <textarea
                id="token-display"
                value={token || 'No active JWT token.'}
                readOnly
                placeholder="JWT bearer token details will appear here after login or registration."
              />
            </div>
            <div className="action-buttons-grid">
              <button
                id="check-auth-btn"
                className="btn btn-secondary"
                onClick={fetchProfile}
                disabled={!token}
              >
                Fetch profile (/auth/me)
              </button>
              <button
                id="logout-btn"
                className="btn btn-secondary danger"
                onClick={handleLogout}
                disabled={!token}
              >
                Clear Token (Logout)
              </button>
            </div>
          </section>

          {/* Rate Limiter Stress Test */}
          <section className="form-card" id="stress-test-card">
            <h2>Brute Force / Rate Limit Test</h2>
            <p className="description">
              Triggers 10 authentication requests in rapid succession to test the backend's sliding-window login rate limiting threshold.
            </p>
            <button
              id="rate-limit-test-btn"
              className="btn btn-secondary warning"
              onClick={runRateLimitStressTest}
              disabled={testingRateLimit}
            >
              {testingRateLimit ? 'Testing in progress...' : 'Simulate 10 Rapid Logins'}
            </button>
            <div className="log-window">
              <pre id="rate-limit-log">
                {rateLimitLogs.length > 0
                  ? rateLimitLogs.join('\n')
                  : 'No stress test events triggered yet.'}
              </pre>
            </div>
          </section>
        </div>

        {/* Right Column - Results and Metadata */}
        <div className="console-panel right-panel">
          {/* Profile Card */}
          <section className="form-card" id="profile-card">
            <h2>Authenticated User Profile</h2>
            <div className="profile-grid">
              <div className="profile-row">
                <span className="profile-label">User ID:</span>
                <span id="profile-id" className="profile-value">
                  {profile?.id || '—'}
                </span>
              </div>
              <div className="profile-row">
                <span className="profile-label">Email:</span>
                <span id="profile-email" className="profile-value">
                  {profile?.email || '—'}
                </span>
              </div>
              <div className="profile-row">
                <span className="profile-label">Account Created:</span>
                <span id="profile-created" className="profile-value">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </section>

          {/* Live Response Card */}
          <section className="form-card terminal-card" id="response-card">
            <h2>Last API HTTP Response</h2>
            <div className="terminal-body">
              <pre id="response-message">
                {lastResponse ? JSON.stringify(lastResponse, null, 2) : '// No requests sent in this session.'}
              </pre>
            </div>
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 Lexis Systems. Built with FastAPI and React.</p>
      </footer>
    </div>
  )
}

export default App
