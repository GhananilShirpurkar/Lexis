import React from 'react'

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">📚</span>
          <span className="logo-text">Lexis</span>
          <span className="badge">v0.1.0</span>
        </div>
        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#docs">API Docs</a>
          <a href="#status" className="status-indicator-link">
            <span className="status-dot"></span> System Operational
          </a>
        </nav>
      </header>

      <main className="hero-section">
        <div className="hero-glow"></div>
        <h1 className="hero-title">
          The Intelligent <span className="highlight-text">SaaS RAG</span> Platform
        </h1>
        <p className="hero-description">
          Secure, offline-first ready document intelligence. Upload PDFs, markdown, or plain text, build sub-second vector search indexes, and get instant answers with trace citations.
        </p>

        <div className="action-buttons">
          <button className="btn btn-primary">Launch Sandbox</button>
          <button className="btn btn-secondary">Read Documentation</button>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Isolated Tenants</h3>
            <p>Dynamic workspace scoping with secure JWT auth and sliding-window rate limiting.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Sub-second Ingest</h3>
            <p>Fast LlamaIndex vector compilations with auto-cleanup and storage namespace isolation.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3>SSE Streaming Chat</h3>
            <p>Real-time server-sent events for streaming chat completions using Gemini or Groq.</p>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 Lexis Systems. Built with FastAPI and React.</p>
      </footer>
    </div>
  )
}

export default App
