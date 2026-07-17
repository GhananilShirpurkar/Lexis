import React, { useState, useEffect } from 'react';
import { 
  Sliders, Database, Key, Shield, Save, RotateCcw, 
  Check, AlertTriangle, Cpu, RefreshCw, Sparkles, HelpCircle, Copy, Eye, EyeOff
} from '../components/icons';
import apiClient from '../api/client';
import NavigationBar from '../components/NavigationBar';
import { useTheme } from '../context/ThemeContext';
import MessageContent from '../components/MessageContent';

const previewMarkdownContent = `### Sample Header
Here is a preview of the **Markdown rendering pipeline** inside Lexis:
- **Bold text** and *italicized emphasis*
- Interactive citations page references [p. 1] or web sources [Web 1](https://google.com)
- Inline code: \`const activeTheme = 'dark';\`

\`\`\`javascript
// Syntax Highlighting preview
function greetUser(theme) {
  console.log(\`Applying \${theme} theme...\`);
}
\`\`\`

| Feature | Theme-Aware | RAG-Compliant |
| :--- | :---: | :---: |
| Markdown | Yes | Yes |
| Citations | Yes | Yes |
`;

const SettingsPage = () => {
  const { setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('appearance');
  const [settings, setSettings] = useState(null);
  const [originalSettings, setOriginalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/users/me/settings');
      const loaded = res.data;
      const canonical = {
        default_model: loaded.default_model || loaded.defaultModel || 'gemini-1.5-flash',
        temperature: loaded.temperature ?? 0.7,
        max_tokens: loaded.max_tokens || loaded.maxTokens || 2048,
        top_p: loaded.top_p ?? loaded.topP ?? 0.9,
        top_k: loaded.top_k ?? loaded.topK ?? 40,
        response_style: loaded.response_style || loaded.responseStyle || 'balanced',
        citation_mode: loaded.citation_mode || loaded.citationMode || 'inline',
        chunk_size: loaded.chunk_size || loaded.chunkSize || 512,
        chunk_overlap: loaded.chunk_overlap ?? loaded.chunkOverlap ?? 128,
        embedding_model: loaded.embedding_model || loaded.embeddingModel || 'text-embedding-3-small',
        auto_index: loaded.auto_index ?? loaded.autoIndex ?? true,
        email_notifications: loaded.email_notifications ?? loaded.emailNotifications ?? true,
        theme: loaded.theme || 'system',
        font_size: loaded.font_size || loaded.fontSize || 'medium',
        density: loaded.density || 'comfortable'
      };
      setSettings(canonical);
      setOriginalSettings(JSON.parse(JSON.stringify(canonical)));
    } catch (err) {
      console.error('Failed to load settings:', err);
      const defaults = {
        default_model: 'gemini-1.5-flash',
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 0.9,
        top_k: 40,
        response_style: 'balanced',
        citation_mode: 'inline',
        chunk_size: 512,
        chunk_overlap: 128,
        embedding_model: 'text-embedding-3-small',
        auto_index: true,
        email_notifications: true,
        theme: 'system',
        font_size: 'medium',
        density: 'comfortable'
      };
      setSettings(defaults);
      setOriginalSettings(JSON.parse(JSON.stringify(defaults)));
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = settings && originalSettings && 
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await apiClient.patch('/users/me/settings', settings);
      setOriginalSettings(JSON.parse(JSON.stringify(settings)));
      // Keep local storage and class list in sync without firing another API call
      setTheme(settings.theme, false);
      setSaveStatus({ type: 'success', message: 'Settings saved successfully' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus({ 
        type: 'error', 
        message: err.response?.data?.detail?.error?.message || 'Failed to save settings' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalSettings) {
      setSettings(JSON.parse(JSON.stringify(originalSettings)));
      // Revert theme preview
      setTheme(originalSettings.theme, false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleThemeChange = (newTheme) => {
    updateSetting('theme', newTheme);
    setTheme(newTheme, false); // Real-time preview of layout theme changes
  };

  // Human-readable helpers
  const getToneLabel = (val) => {
    if (val <= 0.3) return { title: 'Strict & Factual', desc: 'Sticks strictly to document text with zero speculation.' };
    if (val <= 0.8) return { title: 'Balanced & Natural', desc: 'Recommended for clear, accurate, and conversational Q&A.' };
    return { title: 'Exploratory & Creative', desc: 'Expands analysis and provides broader conceptual synthesis.' };
  };

  const getLengthLabel = (val) => {
    if (val <= 512) return 'Short (~250 words max)';
    if (val <= 2048) return 'Medium (~750 words max)';
    return 'Long & Detailed (~1500+ words)';
  };

  if (loading) {
    return (
      <div className="app-layout">
        <NavigationBar />
        <main className="main-content settings-page-container">
          <div className="settings-header">
            <div className="settings-header-left">
              <h2 className="settings-title">Settings & Preferences</h2>
              <p className="settings-subtitle">Customize AI responses, search indexing, and account automation.</p>
            </div>
          </div>
          <div className="settings-layout">
            <div className="settings-tabs-card glass-panel skeleton">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="skeleton-line" style={{ height: 44, marginBottom: 8, borderRadius: 8 }} />
              ))}
            </div>
            <div className="settings-content-panel glass-panel">
              <div className="skeleton-line" style={{ height: 320, borderRadius: 12 }} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const models = [
    { 
      id: 'gemini-1.5-flash', 
      name: 'Gemini 1.5 Flash', 
      badge: 'Fast & Lightweight',
      desc: 'Optimized for rapid everyday document Q&A and instant summarization.' 
    },
    { 
      id: 'gemini-1.5-pro', 
      name: 'Gemini 1.5 Pro', 
      badge: 'Deep Reasoning',
      desc: 'Highest intelligence for complex legal contracts, multi-file research, and deep synthesis.' 
    },
    { 
      id: 'groq-llama-3', 
      name: 'Groq Llama 3', 
      badge: 'Ultra Fast Speed',
      desc: 'Sub-second inference speed for quick factual lookups.' 
    }
  ];

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Eye },
    { id: 'response', label: 'AI Intelligence & Response', icon: Sliders },
    { id: 'vector', label: 'Document Index & Search', icon: Database },
    { id: 'api', label: 'Developer API Keys', icon: Key },
    { id: 'system', label: 'Automation & Alerts', icon: Shield }
  ];

  const currentTone = getToneLabel(settings.temperature);

  return (
    <div className="app-layout">
      <NavigationBar />

      <main className="main-content settings-page-container">
        {/* Header Section */}
        <div className="settings-header">
          <div className="settings-header-left">
            <h1 className="settings-title">Settings & Preferences</h1>
            <p className="settings-subtitle">
              Customize how Lexis answers your questions, indexes documents, and manages API connections.
            </p>
          </div>

          {hasChanges && (
            <span className="unsaved-changes-badge animate-pulse">
              <Sparkles className="icon-xs" />
              <span>Unsaved Changes</span>
            </span>
          )}
        </div>

        {/* Main Settings Grid */}
        <div className="settings-layout">
          {/* Left Navigation Tabs */}
          <div className="settings-tabs-card glass-panel">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`settings-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <TabIcon className="icon tab-icon" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Content Panel */}
          <div className="settings-content-panel glass-panel">
            {/* APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="settings-section">
                <div className="section-title-box">
                  <h2>Appearance Settings</h2>
                  <p className="section-desc">Customize user interface theme, text sizing, and layout spacing.</p>
                </div>

                {/* Theme Selection */}
                <div className="settings-field-group">
                  <label className="field-label">Color Theme Mode</label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    {[
                      { id: 'system', label: 'System Default', icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                      ) },
                      { id: 'light', label: 'Light Mode', icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                      ) },
                      { id: 'dark', label: 'Dark Mode', icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                      ) }
                    ].map(t => (
                      <div
                        key={t.id}
                        className={`model-option-card flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-200 ${settings.theme === t.id ? 'active' : ''}`}
                        onClick={() => handleThemeChange(t.id)}
                      >
                        <div className={`mb-3 p-3 rounded-xl transition-colors duration-200 ${settings.theme === t.id ? 'text-[var(--color-primary)] bg-[var(--color-canvas-mid)]' : 'text-[var(--color-mute)]'}`}>
                          {t.icon}
                        </div>
                        <h4 className="font-semibold text-sm">{t.label}</h4>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Font Size Selection */}
                <div className="settings-field-group">
                  <label className="field-label">Font Sizing</label>
                  <span className="field-help-text">Adjust text legibility for search results and chat dialogue.</span>
                  <div className="segmented-control-bar mt-2">
                    {[
                      { id: 'small', label: 'Small (13px)' },
                      { id: 'medium', label: 'Medium (15px)' },
                      { id: 'large', label: 'Large (17px)' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        className={`segmented-btn ${settings.font_size === f.id ? 'active' : ''}`}
                        onClick={() => updateSetting('font_size', f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Density Selection */}
                <div className="settings-field-group">
                  <label className="field-label">Layout Spacing Density</label>
                  <span className="field-help-text">Adjust spacing density for layout margins and padding.</span>
                  <div className="segmented-control-bar mt-2">
                    {[
                      { id: 'compact', label: 'Compact' },
                      { id: 'comfortable', label: 'Comfortable' }
                    ].map(d => (
                      <button
                        key={d.id}
                        type="button"
                        className={`segmented-btn ${settings.density === d.id ? 'active' : ''}`}
                        onClick={() => updateSetting('density', d.id)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview Sandbox */}
                <div className="settings-field-group mt-6">
                  <label className="field-label mb-2 block">Markdown Preview Sandbox</label>
                  <div 
                    className="p-6 border border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50 dark:bg-gray-900/50 transition-all duration-200"
                    style={{
                      fontSize: settings.font_size === 'small' ? '13px' : settings.font_size === 'large' ? '17px' : '15px',
                      lineHeight: settings.font_size === 'small' ? '1.4' : settings.font_size === 'large' ? '1.8' : '1.6',
                      padding: settings.density === 'compact' ? '16px' : '24px'
                    }}
                  >
                    <MessageContent content={previewMarkdownContent} />
                  </div>
                </div>
              </div>
            )}

            {/* RESPONSE TAB */}
            {activeTab === 'response' && (
              <div className="settings-section">
                <div className="section-title-box">
                  <h2>AI Response & Intelligence</h2>
                  <p className="section-desc">Choose your preferred AI model, answer tone, and citation presentation.</p>
                </div>

                {/* Default Model */}
                <div className="settings-field-group">
                  <label className="field-label">Primary AI Intelligence Model</label>
                  <div className="model-cards-grid">
                    {models.map(model => (
                      <div
                        key={model.id}
                        className={`model-option-card ${settings.default_model === model.id ? 'active' : ''}`}
                        onClick={() => updateSetting('default_model', model.id)}
                      >
                        <div className="model-card-top">
                          <Cpu className="icon model-icon" />
                          <span className="model-badge">{model.badge}</span>
                          {settings.default_model === model.id && <Check className="icon check-icon" />}
                        </div>
                        <h4 className="model-name">{model.name}</h4>
                        <p className="model-desc">{model.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Response Tone (Temperature) */}
                <div className="settings-field-group">
                  <div className="field-header flex-between">
                    <div>
                      <label className="field-label">Response Tone & Creativity</label>
                      <span className="field-help-text">Controls how strictly Lexis follows exact document wording.</span>
                    </div>
                    <span className="tone-pill">{currentTone.title} ({settings.temperature})</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.1"
                    className="custom-range-slider"
                    value={settings.temperature}
                    onChange={e => updateSetting('temperature', parseFloat(e.target.value))}
                  />
                  <div className="slider-labels flex-between">
                    <span>Strict & Factual</span>
                    <span>Balanced</span>
                    <span>Exploratory</span>
                  </div>
                  <p className="tone-guidance-box">{currentTone.desc}</p>
                </div>

                {/* Maximum Answer Length (Max Tokens) */}
                <div className="settings-field-group">
                  <div className="field-header flex-between">
                    <div>
                      <label className="field-label">Maximum Answer Length</label>
                      <span className="field-help-text">Set the upper limit for generated response depth.</span>
                    </div>
                    <span className="length-pill">{getLengthLabel(settings.max_tokens)}</span>
                  </div>

                  <input
                    type="range"
                    min="256"
                    max="4096"
                    step="256"
                    className="custom-range-slider"
                    value={settings.max_tokens}
                    onChange={e => updateSetting('max_tokens', parseInt(e.target.value))}
                  />
                  <div className="slider-labels flex-between">
                    <span>Short (~250 words)</span>
                    <span>Medium (~750 words)</span>
                    <span>Detailed (~1500+ words)</span>
                  </div>
                </div>

                {/* Response Style */}
                <div className="settings-field-group">
                  <label className="field-label">Answer Structure Format</label>
                  <div className="segmented-control-bar">
                    {[
                      { id: 'concise', label: 'Concise (Key Points)' },
                      { id: 'balanced', label: 'Balanced (Standard)' },
                      { id: 'detailed', label: 'Detailed (Deep Breakdown)' }
                    ].map(style => (
                      <button
                        key={style.id}
                        type="button"
                        className={`segmented-btn ${settings.response_style === style.id ? 'active' : ''}`}
                        onClick={() => updateSetting('response_style', style.id)}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Citation Display */}
                <div className="settings-field-group">
                  <label className="field-label">Source Citation Style</label>
                  <div className="segmented-control-bar">
                    {[
                      { id: 'inline', label: 'Inline Badges [1]' },
                      { id: 'footnotes', label: 'Footnotes' },
                      { id: 'end', label: 'End of Answer' }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`segmented-btn ${settings.citation_mode === mode.id ? 'active' : ''}`}
                        onClick={() => updateSetting('citation_mode', mode.id)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VECTOR STORE TAB */}
            {activeTab === 'vector' && (
              <div className="settings-section">
                <div className="section-title-box">
                  <h2>Document Index & Search</h2>
                  <p className="section-desc">Configure how Lexis reads, breaks down, and indexes your documents for semantic search.</p>
                </div>

                {/* Chunk Size */}
                <div className="settings-field-group">
                  <div className="field-header flex-between">
                    <div>
                      <label className="field-label">Passage Reading Length</label>
                      <span className="field-help-text">Smaller passages pinpoint exact facts; larger passages preserve paragraph context.</span>
                    </div>
                    <span className="value-badge">{settings.chunk_size} tokens (~{Math.round(settings.chunk_size * 0.75)} words)</span>
                  </div>
                  <input
                    type="range"
                    min="128"
                    max="2048"
                    step="128"
                    className="custom-range-slider"
                    value={settings.chunk_size}
                    onChange={e => updateSetting('chunk_size', parseInt(e.target.value))}
                  />
                </div>

                {/* Chunk Overlap */}
                <div className="settings-field-group">
                  <div className="field-header flex-between">
                    <div>
                      <label className="field-label">Context Continuity Overlap</label>
                      <span className="field-help-text">Ensures important sentences are not split awkwardly between passages.</span>
                    </div>
                    <span className="value-badge">{settings.chunk_overlap} tokens overlap</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="512"
                    step="64"
                    className="custom-range-slider"
                    value={settings.chunk_overlap}
                    onChange={e => updateSetting('chunk_overlap', parseInt(e.target.value))}
                  />
                </div>

                {/* Embedding Model */}
                <div className="settings-field-group">
                  <label className="field-label">Search Index Precision</label>
                  <div className="segmented-control-bar">
                    {[
                      { id: 'text-embedding-3-small', label: 'Standard Search Index (Fast)' },
                      { id: 'text-embedding-3-large', label: 'High-Precision Index (Dense Text)' }
                    ].map(model => (
                      <button
                        key={model.id}
                        type="button"
                        className={`segmented-btn ${settings.embedding_model === model.id ? 'active' : ''}`}
                        onClick={() => updateSetting('embedding_model', model.id)}
                      >
                        {model.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* API KEYS TAB */}
            {activeTab === 'api' && (
              <div className="settings-section">
                <div className="section-title-box">
                  <h2>Developer API Keys</h2>
                  <p className="section-desc">Manage programmatic access tokens for connecting external tools to Lexis.</p>
                </div>
                <ApiKeyManager />
              </div>
            )}

            {/* SYSTEM TAB */}
            {activeTab === 'system' && (
              <div className="settings-section">
                <div className="section-title-box">
                  <h2>Automation & Alerts</h2>
                  <p className="section-desc">Manage document background processing and email notification preferences.</p>
                </div>

                <div className="toggles-group">
                  <ToggleField
                    label="Auto-Index Uploaded Documents"
                    hint="Automatically parse and vector-index documents as soon as they are uploaded in chat."
                    checked={settings.auto_index}
                    onChange={v => updateSetting('auto_index', v)}
                  />
                  
                  <ToggleField
                    label="Email Notifications & Expiry Alerts"
                    hint="Receive email alerts when documents are modified or approaching storage retention limits."
                    checked={settings.email_notifications}
                    onChange={v => updateSetting('email_notifications', v)}
                  />
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div className="settings-actions-bar">
              <button 
                type="button" 
                className="btn outline-btn" 
                onClick={handleReset} 
                disabled={!hasChanges || saving}
              >
                <RotateCcw className="icon-sm" />
                <span>Reset Changes</span>
              </button>

              <button 
                type="button" 
                className="btn primary-btn btn-glow" 
                onClick={handleSave} 
                disabled={!hasChanges || saving}
              >
                {saving ? <RefreshCw className="icon-sm animate-spin" /> : <Save className="icon-sm" />}
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Floating Toast Notification */}
        {saveStatus && (
          <div className={`settings-toast toast-${saveStatus.type} glass-panel`}>
            {saveStatus.type === 'success' ? <Check className="icon text-success" /> : <AlertTriangle className="icon text-danger" />}
            <span>{saveStatus.message}</span>
          </div>
        )}
      </main>
    </div>
  );
};

// Sub-components
const ToggleField = ({ label, hint, checked, onChange }) => (
  <div className="toggle-card-row">
    <div className="toggle-info">
      <label className="toggle-label">{label}</label>
      <span className="toggle-hint">{hint}</span>
    </div>
    <button 
      type="button"
      className={`toggle-switch-btn ${checked ? 'active' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <div className="toggle-knob-thumb" />
    </button>
  </div>
);

const ApiKeyManager = () => {
  const [keys, setKeys] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [copied, setCopied] = useState({});

  useEffect(() => {
    setKeys([
      { id: 'key_1', name: 'Production API Key', prefix: 'lx_prod_', created: '2026-07-01', last_used: '2026-07-17' }
    ]);
  }, []);

  const handleCopy = (id, val) => {
    navigator.clipboard.writeText(val);
    setCopied(p => ({ ...p, [id]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [id]: false })), 2000);
  };

  return (
    <div className="api-keys-container">
      {keys.map(key => (
        <div key={key.id} className="api-key-card">
          <div className="api-key-card-header">
            <div className="flex-align-gap">
              <Key className="icon text-accent" />
              <span className="key-name">{key.name}</span>
            </div>
            <span className="key-date">Last used: {key.last_used}</span>
          </div>

          <div className="api-key-val-box">
            <code className="key-code">
              {revealed[key.id] ? 'lx_prod_a1b2c3d4e5f67890' : 'lx_prod_••••••••••••••••'}
            </code>
            <div className="key-actions">
              <button 
                type="button"
                className="btn-icon text-btn" 
                title={revealed[key.id] ? 'Hide Key' : 'Reveal Key'}
                onClick={() => setRevealed(p => ({ ...p, [key.id]: !p[key.id] }))}
              >
                {revealed[key.id] ? <EyeOff className="icon-sm" /> : <Eye className="icon-sm" />}
              </button>
              <button 
                type="button"
                className="btn-icon text-btn" 
                title="Copy Key"
                onClick={() => handleCopy(key.id, 'lx_prod_a1b2c3d4e5f67890')}
              >
                {copied[key.id] ? <Check className="icon-sm text-success" /> : <Copy className="icon-sm" />}
              </button>
            </div>
          </div>
        </div>
      ))}

      <button 
        type="button"
        className="btn outline-btn mt-4" 
        onClick={() => alert('API key generation feature active for enterprise tier.')}
      >
        <Key className="icon-sm" />
        <span>Generate New API Key</span>
      </button>
    </div>
  );
};

export default SettingsPage;
