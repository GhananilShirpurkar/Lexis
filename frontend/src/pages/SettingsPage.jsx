import React, { useState, useEffect } from 'react';
import { 
  Sliders, Database, Key, Shield, Save, RotateCcw, 
  Check, AlertTriangle, Cpu, RefreshCw 
} from '../components/icons';
import apiClient from '../api/client';
import NavigationBar from '../components/NavigationBar';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('response');
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
      // Normalize snake_case or camelCase into canonical state
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
        email_notifications: loaded.email_notifications ?? loaded.emailNotifications ?? true
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
        email_notifications: true
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
      setSaveStatus({ type: 'success', message: 'Settings saved' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus({ 
        type: 'error', 
        message: err.response?.data?.detail || 'Failed to save' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalSettings) {
      setSettings(JSON.parse(JSON.stringify(originalSettings)));
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="app-shell">
        <NavigationBar />
        <div className="page-shell">
          <div className="page-header-bar">
            <Sliders className="icon" />
            <h1>SETTINGS</h1>
          </div>
          <div className="settings-layout">
            <div className="settings-tabs skeleton">
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-line" style={{ height: 40, marginBottom: 8 }} />)}
            </div>
            <div className="settings-content-panel">
              <div className="skeleton-line" style={{ height: 400 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const models = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tags: ['Fast', '128K context'] },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tags: ['Best quality', '2M context'] },
    { id: 'groq-llama-3', name: 'Groq Llama 3', tags: ['Fastest', '8K context'] }
  ];

  const tabs = [
    { id: 'response', label: 'Response', icon: Sliders },
    { id: 'vector', label: 'Vector Store', icon: Database },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'system', label: 'System', icon: Shield }
  ];

  return (
    <div className="app-shell">
      <NavigationBar />
      <div className="page-shell">
        <div className="page-header-bar">
          <Sliders className="icon" />
          <h1>SETTINGS</h1>
          {hasChanges && <span className="unsaved-badge">Unsaved Changes</span>}
        </div>

        <div className="settings-layout">
          <div className="settings-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon className="icon" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="settings-content-panel">
            {/* RESPONSE TAB */}
            {activeTab === 'response' && (
              <div className="settings-section">
                <h2>Response Parameters</h2>
                <p className="settings-desc">Configure how Lexis generates responses.</p>

                <div className="settings-field">
                  <label>Default Model</label>
                  <div className="model-selector-large">
                    {models.map(model => (
                      <button
                        key={model.id}
                        className={`model-option-card ${settings.default_model === model.id ? 'active' : ''}`}
                        onClick={() => updateSetting('default_model', model.id)}
                      >
                        <Cpu className="icon" />
                        <div className="model-info">
                          <span className="model-name">{model.name}</span>
                          <div className="model-tags">
                            {model.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
                          </div>
                        </div>
                        {settings.default_model === model.id && <Check className="icon check-icon" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field">
                  <div className="field-header">
                    <label>Temperature</label>
                    <span className="field-value">{settings.temperature}</span>
                  </div>
                  <input
                    type="range" min="0" max="2" step="0.1"
                    value={settings.temperature}
                    onChange={e => updateSetting('temperature', parseFloat(e.target.value))}
                  />
                  <div className="field-hint"><span>Deterministic</span><span>Creative</span></div>
                </div>

                <div className="settings-field">
                  <div className="field-header">
                    <label>Max Tokens</label>
                    <span className="field-value">{settings.max_tokens}</span>
                  </div>
                  <input
                    type="range" min="256" max="8192" step="256"
                    value={settings.max_tokens}
                    onChange={e => updateSetting('max_tokens', parseInt(e.target.value))}
                  />
                </div>

                <div className="settings-field">
                  <label>Response Style</label>
                  <div className="segmented-control">
                    {['concise', 'balanced', 'detailed'].map(style => (
                      <button
                        key={style}
                        className={settings.response_style === style ? 'active' : ''}
                        onClick={() => updateSetting('response_style', style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field">
                  <label>Citation Display</label>
                  <div className="segmented-control">
                    {['inline', 'footnotes', 'end'].map(mode => (
                      <button
                        key={mode}
                        className={settings.citation_mode === mode ? 'active' : ''}
                        onClick={() => updateSetting('citation_mode', mode)}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VECTOR STORE TAB */}
            {activeTab === 'vector' && (
              <div className="settings-section">
                <h2>Vector Store</h2>
                <p className="settings-desc">Control document chunking and embedding.</p>

                <div className="settings-field">
                  <div className="field-header">
                    <label>Chunk Size</label>
                    <span className="field-value">{settings.chunk_size} tokens</span>
                  </div>
                  <input
                    type="range" min="128" max="2048" step="128"
                    value={settings.chunk_size}
                    onChange={e => updateSetting('chunk_size', parseInt(e.target.value))}
                  />
                </div>

                <div className="settings-field">
                  <div className="field-header">
                    <label>Chunk Overlap</label>
                    <span className="field-value">{settings.chunk_overlap} tokens</span>
                  </div>
                  <input
                    type="range" min="0" max="512" step="64"
                    value={settings.chunk_overlap}
                    onChange={e => updateSetting('chunk_overlap', parseInt(e.target.value))}
                  />
                </div>

                <div className="settings-field">
                  <label>Embedding Model</label>
                  <div className="segmented-control">
                    {['text-embedding-3-small', 'text-embedding-3-large'].map(model => (
                      <button
                        key={model}
                        className={settings.embedding_model === model ? 'active' : ''}
                        onClick={() => updateSetting('embedding_model', model)}
                      >
                        {model.replace('text-embedding-', '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* API KEYS TAB */}
            {activeTab === 'api' && (
              <div className="settings-section">
                <h2>API Keys</h2>
                <p className="settings-desc">Manage programmatic access.</p>
                <ApiKeyManager />
              </div>
            )}

            {/* SYSTEM TAB */}
            {activeTab === 'system' && (
              <div className="settings-section">
                <h2>System Preferences</h2>
                
                <ToggleField
                  label="Auto-Index Documents"
                  hint="Automatically index uploaded documents"
                  checked={settings.auto_index}
                  onChange={v => updateSetting('auto_index', v)}
                />
                
                <ToggleField
                  label="Email Notifications"
                  hint="Alerts about document expiry and updates"
                  checked={settings.email_notifications}
                  onChange={v => updateSetting('email_notifications', v)}
                />
              </div>
            )}

            <div className="settings-actions">
              <button className="btn-secondary" onClick={handleReset} disabled={!hasChanges || saving}>
                <RotateCcw className="icon-small" />
                Reset
              </button>
              <button className="btn-submit" onClick={handleSave} disabled={!hasChanges || saving}>
                {saving ? <RefreshCw className="icon-small spin" /> : <Save className="icon-small" />}
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>

        {saveStatus && (
          <div className={`toast toast-${saveStatus.type}`}>
            {saveStatus.type === 'success' ? <Check className="icon-small" /> : <AlertTriangle className="icon-small" />}
            {saveStatus.message}
          </div>
        )}
      </div>
    </div>
  );
};

// Sub-components
const ToggleField = ({ label, hint, checked, onChange }) => (
  <div className="settings-field toggle-field">
    <div className="toggle-info">
      <label>{label}</label>
      <span className="field-hint">{hint}</span>
    </div>
    <button 
      className={`toggle-switch ${checked ? 'active' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <div className="toggle-knob" />
    </button>
  </div>
);

const ApiKeyManager = () => {
  const [keys, setKeys] = useState([]);
  const [revealed, setRevealed] = useState({});

  useEffect(() => {
    setKeys([
      { id: 'key_1', name: 'Production', prefix: 'lx_prod_', created: '2026-07-01', last_used: '2026-07-16' }
    ]);
  }, []);

  return (
    <div className="api-keys-list">
      {keys.map(key => (
        <div key={key.id} className="api-key-card">
          <div className="api-key-header">
            <Key className="icon" />
            <span>{key.name}</span>
          </div>
          <div className="api-key-value">
            <code>{revealed[key.id] ? 'lx_prod_a1b2c3d4e5f6' : 'lx_prod_••••••••••••'}</code>
            <button className="btn-ghost" onClick={() => setRevealed(p => ({...p, [key.id]: !p[key.id]}))}>
              {revealed[key.id] ? 'Hide' : 'Reveal'}
            </button>
          </div>
        </div>
      ))}
      <button className="btn-primary" style={{marginTop: 16}}>
        <Key className="icon-small" />
        Generate New Key
      </button>
    </div>
  );
};

export default SettingsPage;
