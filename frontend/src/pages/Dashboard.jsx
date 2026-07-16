import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

const Dashboard = () => {
  const { user, logout, token } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [citations, setCitations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  
  // UI inputs
  const [queryText, setQueryText] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  
  // Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState('');
  
  // UI states
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Load initial data
  useEffect(() => {
    fetchChats();
    fetchNotifications();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedResponse]);

  const fetchChats = async () => {
    try {
      const res = await apiClient.get('/chats');
      setChats(res.data);
      if (res.data.length > 0 && !activeChat) {
        selectChat(res.data[0]);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/notifications');
      // Filter out read notifications
      setNotifications(res.data.filter(n => !n.is_read));
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const selectChat = async (chat) => {
    setActiveChat(chat);
    setRenameValue(chat.display_name || chat.title);
    setIsRenaming(false);
    setMessages([]);
    setCitations([]);
    setStreamedResponse('');

    try {
      const res = await apiClient.get(`/chats/${chat.id}/messages`);
      setMessages(res.data);
      
      // Extract citations from the messages
      const allCitations = res.data
        .filter(m => m.role === 'assistant' && m.citations)
        .flatMap(m => m.citations);
      setCitations(allCitations);
    } catch (err) {
      console.error('Error fetching message history:', err);
    }
  };

  const handleCreateChat = async () => {
    try {
      const res = await apiClient.post('/chats', { title: 'New Chat' });
      setChats([res.data, ...chats]);
      selectChat(res.data);
    } catch (err) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to create chat. Max 40 chats limit.');
    }
  };

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat session?')) return;
    
    try {
      await apiClient.delete(`/chats/${chatId}`);
      const remainingChats = chats.filter(c => c.id !== chatId);
      setChats(remainingChats);
      if (activeChat?.id === chatId) {
        setActiveChat(remainingChats.length > 0 ? remainingChats[0] : null);
        if (remainingChats.length > 0) selectChat(remainingChats[0]);
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  const handleRenameChat = async (e) => {
    e.preventDefault();
    if (!renameValue.trim() || renameValue.length > 60) return;

    try {
      const res = await apiClient.patch(`/chats/${activeChat.id}`, {
        display_name: renameValue.trim()
      });
      setChats(chats.map(c => c.id === activeChat.id ? res.data : c));
      setActiveChat(res.data);
      setIsRenaming(false);
    } catch (err) {
      console.error('Error renaming chat:', err);
    }
  };

  const handleDismissNotification = async (notifId, e) => {
    e.stopPropagation();
    try {
      await apiClient.patch(`/notifications/${notifId}`, { is_read: true });
      setNotifications(notifications.filter(n => n.id !== notifId));
    } catch (err) {
      console.error('Error dismissing notification:', err);
    }
  };

  const processFileUpload = async (file) => {
    if (!file) return;

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');

    let targetChat = activeChat;

    // Auto-create a chat session if none exists or none is selected
    if (!targetChat) {
      try {
        const createRes = await apiClient.post('/chats', { title: file.name || 'New Chat' });
        targetChat = createRes.data;
        setChats(prev => [targetChat, ...prev]);
        setActiveChat(targetChat);
      } catch (chatErr) {
        console.error('Failed to auto-create chat session:', chatErr);
        setUploadError(chatErr.response?.data?.detail?.error?.message || 'Could not create a chat session for upload.');
        setIsUploading(false);
        return;
      }
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', targetChat.id);

    try {
      const res = await apiClient.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setUploadSuccess(`Indexed successfully: ${res.data.filename}`);
      
      // Update active chat to reflect linked document
      const updatedChatRes = await apiClient.get(`/chats/${targetChat.id}`);
      setChats(prevChats => prevChats.map(c => c.id === targetChat.id ? updatedChatRes.data : c));
      setActiveChat(updatedChatRes.data);
      
      // Fetch fresh notifications in case there's warning update
      fetchNotifications();
    } catch (err) {
      console.error('Upload failed:', err);
      const detail = err.response?.data?.detail;
      setUploadError(typeof detail === 'string' ? detail : detail?.error?.message || 'File validation or indexing failed.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFileUpload(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFileUpload(file);
    }
  };

  const handleSendQuery = async (e) => {
    e?.preventDefault();
    if (!queryText.trim() || !activeChat || isGenerating) return;

    const userMessageText = queryText;
    setQueryText('');
    setMessages(prev => [...prev, { role: 'user', content: userMessageText, created_at: new Date() }]);
    setIsGenerating(true);
    setStreamedResponse('');

    try {
      const response = await fetch(`/api/chats/${activeChat.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: userMessageText,
          provider: provider
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.error?.message || 'Failed to submit query');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let tempAnswer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: !done });
        
        // SSE formatting parser: data: {...}\n\n
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'token') {
                tempAnswer += data.content;
                setStreamedResponse(tempAnswer);
              } else if (data.type === 'done') {
                setIsGenerating(false);
                // Refresh messages
                const res = await apiClient.get(`/chats/${activeChat.id}/messages`);
                setMessages(res.data);
                
                // Refresh citations
                const allCitations = res.data
                  .filter(m => m.role === 'assistant' && m.citations)
                  .flatMap(m => m.citations);
                setCitations(allCitations);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              // Ignore incomplete lines
            }
          }
        }
      }
    } catch (err) {
      console.error('Error during query:', err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message || 'Retrieval failed.'}`, is_error: true, created_at: new Date() }
      ]);
    } finally {
      setIsGenerating(false);
      setStreamedResponse('');
    }
  };

  return (
    <div className="app-shell">
      {/* 1. Carbon Top Nav Bar */}
      <header className="nav-bar">
        <div className="nav-logo-area">
          <Link to="/" className="logo-pill">
            <span style={{ fontSize: '14px' }}>📚</span>
            <span className="logo-wordmark">LEXIS</span>
          </Link>

          <nav className="nav-links">
            <Link to="/" className="nav-item active">Query</Link>
            <a href="#library" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Library view active"); }}>Library</a>
            <Link to="/dev-console" className="nav-item">Console</Link>
            <a href="#settings" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Settings active"); }}>Settings</a>
          </nav>
        </div>

        <div className="nav-utility-area">
          {/* Notifications Alert Bell */}
          <div className="notification-bell-container" style={{ position: 'relative' }}>
            <button 
              className="nav-badge nav-badge-alerts" 
              onClick={() => setShowNotifications(!showNotifications)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🔔 ALERTS 
              {notifications.length > 0 && (
                <span className="badge badge-error" style={{ borderRadius: '9999px', padding: '1px 5px' }}>
                  {notifications.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="notifications-dropdown" style={{
                position: 'absolute', right: 0, top: '40px', width: '280px',
                backgroundColor: '#ffffff', border: '1px solid #3d4f97',
                boxShadow: '0 4px 16px rgba(33,36,46,0.2)', padding: '16px', zIndex: 100, borderRadius: '4px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #5a5f8c', paddingBottom: '8px', marginBottom: '8px', fontWeight: '700', fontSize: '12px' }}>
                  <span>WORKSPACE ALERTS</span>
                  <button className="btn-ghost" onClick={() => setShowNotifications(false)}>✕</button>
                </div>
                {notifications.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#60619c' }}>No active document expirations.</p>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px dotted #5a5f8c' }}>
                      <p style={{ fontSize: '12px', marginBottom: '4px' }}>{n.message}</p>
                      <button className="btn btn-ghost" style={{ fontSize: '11px', color: '#e60012' }} onClick={(e) => handleDismissNotification(n.id, e)}>
                        Dismiss
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <span className="nav-badge nav-badge-model">
            {provider === 'gemini' ? 'Gemini 1.5 Flash' : 'Groq Llama 3'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="nav-avatar">
              {user?.email ? user.email[0].toUpperCase() : 'U'}
            </div>
            <button className="btn btn-ghost" onClick={logout} style={{ fontSize: '11px' }} title="Log Out">
              EXIT
            </button>
          </div>
        </div>
      </header>

      {/* 2. Secondary Subnav Strip */}
      <div className="subnav-strip">
        <div className="subnav-links" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className="subnav-item"><span className="label">SYSTEM:</span> <span className="value">READY</span></span>
          <span style={{ color: '#3d4f97' }}>|</span>
          <span className="subnav-item"><span className="label">SESSION:</span> <span className="value">{activeChat ? (activeChat.display_name || activeChat.title) : 'NONE'}</span></span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className="subnav-item"><span className="value online">● ONLINE</span></span>
          <Link to="/dev-console" className="subnav-item" style={{ textDecoration: 'none', color: '#f68d1f', fontWeight: '700' }}>DEV CONSOLE →</Link>
        </div>
      </div>

      {/* 3. Main Workspace Grid */}
      <div className="workspace-layout">
        {/* Sidebar Rail */}
        <aside className={`sidebar-panel ${sidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-section-header">
            <span>{sidebarOpen && "SESSION HISTORY"}</span>
            <button className="btn-ghost" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle Rail">
              {sidebarOpen ? "◀" : "▶"}
            </button>
          </div>

          <button className="sidebar-new-session-btn" onClick={handleCreateChat}>
            <span>+</span> NEW SESSION
          </button>

          {sidebarOpen && (
            <div className="sidebar-session-list">
              {chats.length === 0 ? (
                <div className="sidebar-empty">NO SESSIONS STORED</div>
              ) : (
                chats.map(chat => (
                  <div 
                    key={chat.id} 
                    className={`sidebar-session-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                    onClick={() => selectChat(chat)}
                  >
                    <span className="session-item-icon">💬</span>
                    <span className="session-item-name">
                      {chat.display_name || chat.title}
                    </span>
                    <button 
                      className="btn-ghost" 
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      style={{ fontSize: '11px', padding: '2px 4px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {sidebarOpen && (
            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #5a5f8c', fontSize: '11px', color: '#21242e', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: '700' }}>
              <div>USER: {user?.email}</div>
              <div style={{ marginTop: '4px', opacity: 0.8 }}>ROLE: WORKSPACE ADM</div>
            </div>
          )}
        </aside>

        {/* Central Chat Feed */}
        <main className="main-content-area">
          {/* Header Strip for Active Session */}
          <div className="section-label-bar">
            <div className="label-title">
              <span style={{ fontSize: '16px' }}>🖥️</span>
              {isRenaming ? (
                <form onSubmit={handleRenameChat} style={{ display: 'inline-flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="text-input"
                    value={renameValue} 
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={60}
                    style={{ height: '28px', fontSize: '12px' }}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-submit" style={{ padding: '4px 10px', fontSize: '11px' }}>SAVE</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setIsRenaming(false)}>CANCEL</button>
                </form>
              ) : (
                <span onClick={() => activeChat && setIsRenaming(true)} style={{ cursor: 'pointer' }}>
                  {activeChat ? (activeChat.display_name || activeChat.title) : 'SELECT OR CREATE SESSION'}
                  {activeChat && <span style={{ opacity: 0.6, marginLeft: '8px', fontSize: '11px' }}>✏️ RENAME</span>}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <select 
                className="select-dropdown" 
                value={provider} 
                onChange={(e) => setProvider(e.target.value)}
                style={{ height: '32px', fontSize: '11px', width: '150px' }}
              >
                <option value="gemini">Gemini 1.5 Flash</option>
                <option value="groq">Groq Llama 3</option>
              </select>

              <button 
                className="btn btn-primary" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                {isUploading ? 'INDEXING...' : '📎 ATTACH DOC'}
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt"
          />

          {/* Feedback Banners */}
          {isUploading && (
            <div style={{ padding: '12px 24px', backgroundColor: '#dedede', color: '#21242e', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', fontWeight: '700', borderBottom: '1px solid #3d4f97' }}>
              <div className="spinner"></div>
              <span>COMPILING VECTOR EMBEDDINGS & INDEXING SOURCE FILE...</span>
            </div>
          )}

          {uploadError && (
            <div style={{ padding: '12px 24px', backgroundColor: 'rgba(230,0,18,0.1)', color: '#e60012', borderBottom: '1px solid #e60012', fontWeight: '700', fontSize: '12px' }}>
              ⚠️ UPLOAD ERROR: {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div style={{ padding: '12px 24px', backgroundColor: 'rgba(22,163,74,0.1)', color: '#16a34a', borderBottom: '1px solid #16a34a', fontWeight: '700', fontSize: '12px' }}>
              ✓ INDEX VERIFIED: {uploadSuccess}
            </div>
          )}

          {/* Empty State Hero */}
          {messages.length === 0 && !streamedResponse && (
            <div className="empty-state-hero">
              <h1 className="empty-state-wordmark">LEXIS</h1>
              <p className="empty-state-tagline">
                Upload a document to generate embeddings and retrieve cited answers in real time.
              </p>

              <div 
                className="empty-state-upload-zone" 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="upload-zone-icon">
                  ▲
                </div>
                <div className="upload-zone-text">
                  DRAG & DROP PDF, DOCX, TXT FILES HERE OR <span style={{ color: '#f68d1f' }}>CLICK TO BROWSE</span>
                </div>
                <div className="upload-zone-hint">
                  Automatic chunking, vector embedding, and citation matching
                </div>
              </div>
            </div>
          )}

          {/* Messages Stream Feed */}
          {messages.length > 0 && (
            <div className="chat-feed">
              {messages.map((m, idx) => (
                <div 
                  key={idx} 
                  className={`message-bubble ${m.role === 'user' ? 'message-bubble-user' : m.is_error ? 'message-bubble-error' : 'message-bubble-assistant'}`}
                >
                  <div style={{ marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                    {m.provider ? `${m.provider.toUpperCase()} • ` : ''}
                    {new Date(m.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}

              {/* Streaming Live Response */}
              {streamedResponse && (
                <div className="message-bubble message-bubble-assistant">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{streamedResponse}</div>
                  <span className="streaming-cursor">█</span>
                </div>
              )}

              {isGenerating && !streamedResponse && (
                <div className="message-bubble message-bubble-assistant">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="spinner"></div>
                    <span style={{ fontSize: '12px', fontWeight: '700' }}>SEARCHING VECTOR INDEX & STREAMING RESPONSE...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Sticky Input Bar */}
          <div className="chat-input-bar">
            <form onSubmit={handleSendQuery} className="chat-input-wrapper">
              <textarea 
                className="chat-textarea"
                placeholder={activeChat?.current_doc_id ? "Type your query or instruction..." : "Attach a document to begin querying..."}
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={!activeChat?.current_doc_id || isGenerating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuery();
                  }
                }}
              />
              <button 
                type="submit" 
                className="chat-submit-btn"
                disabled={!queryText.trim() || isGenerating}
              >
                ➔
              </button>
            </form>
          </div>
        </main>

        {/* Right Rail: Citations & Context */}
        <aside className="right-rail-panel">
          <div className="right-rail-section">
            <div className="right-rail-section-header">
              <div className="section-header-title">
                <span>📑</span>
                <span>RETRIEVED CONTEXT</span>
              </div>
              <span className="section-header-badge">{citations.length} SNIPPETS</span>
            </div>

            <div className="right-rail-section-body">
              {citations.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#60619c', lineHeight: '1.5', margin: 0, fontStyle: 'italic' }}>
                  No search snippets retrieved yet. Submit a query to display page quotes and verbatim document excerpts.
                </p>
              ) : (
                citations.map((c, idx) => (
                  <div key={idx} className="citation-card">
                    <span className="citation-file">📄 {c.doc_filename || 'source document'}</span>
                    <div className="citation-meta">
                      {c.page_number && <span className="citation-badge citation-badge-page">PAGE {c.page_number}</span>}
                      <span className="citation-badge citation-badge-match">MATCH VERIFIED</span>
                    </div>
                    <p className="citation-excerpt">"{c.excerpt}"</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Info Explainer Card */}
          <div className="info-box" style={{ marginTop: 'auto' }}>
            <div className="info-box-header">
              SOURCE CITATION ENGINE
            </div>
            <div className="info-box-body">
              Lexis builds vector index embeddings for uploaded documents. Every LLM response is grounded with verbatim source excerpts to eliminate hallucination.
            </div>
          </div>
        </aside>
      </div>

      {/* 4. Footer Bar */}
      <footer className="footer-bar">
        <div>© 2026 LEXIS CORP • CONSOLE CHROME ENGINE</div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className="esrb-badge">SOC 2 TYPE II</span>
          <span className="esrb-badge">256-BIT AES</span>
          <Link to="/dev-console" style={{ color: '#ecab37', textDecoration: 'none', fontWeight: '700' }}>DEV CONSOLE</Link>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
