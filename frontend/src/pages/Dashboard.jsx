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
    <div className="workspace-layout">
      {/* 1. Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-logo">
          <span>📚</span>
          <span>Lexis</span>
          <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ◀
          </button>
        </div>

        <button className="btn btn-primary btn-block" onClick={handleCreateChat}>
          <span>+</span> New Chat
        </button>

        {/* Notifications Alert Bell */}
        <div className="notification-bell-container">
          <button 
            className="btn btn-secondary btn-block notification-bell-btn" 
            onClick={() => setShowNotifications(!showNotifications)}
          >
            🔔 Notifications 
            {notifications.length > 0 && <span className="notification-badge-alert">{notifications.length}</span>}
          </button>

          {showNotifications && (
            <div className="notifications-dropdown">
              <div className="notifications-dropdown-header">
                <span>Impending Document Expirations</span>
                <button onClick={() => setShowNotifications(false)}>✕</button>
              </div>
              <div className="notifications-dropdown-list">
                {notifications.length === 0 ? (
                  <p className="no-notifications-text">No active alerts.</p>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="notification-item-card">
                      <p className="notification-item-message">{n.message}</p>
                      <button 
                        className="notification-dismiss-btn"
                        onClick={(e) => handleDismissNotification(n.id, e)}
                      >
                        Dismiss
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <nav className="sidebar-menu">
          <span className="sidebar-menu-title">Chat Session History</span>
          <div className="sidebar-scroll">
            {chats.map(chat => (
              <div 
                key={chat.id} 
                className={`sidebar-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => selectChat(chat)}
              >
                <span className="sidebar-item-icon">💬</span>
                <span className="sidebar-item-text">{chat.display_name || chat.title}</span>
                <button 
                  className="sidebar-delete-chat-btn" 
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              {user?.email ? user.email[0].toUpperCase() : 'U'}
            </div>
            <div className="user-info">
              <span className="user-email">{user?.email || 'Loading...'}</span>
              <span className="user-role">Workspace User</span>
            </div>
          </div>
          <Link to="/dev-console" className="btn btn-secondary btn-block dev-console-link-btn">
            ⚙️ Developer Console
          </Link>
          <button className="btn btn-secondary danger btn-block" onClick={logout}>
            Log Out
          </button>
        </div>
      </aside>

      {/* 2. Main Chat Area */}
      <main className="chat-area">
        <header className="chat-header">
          <div className="chat-title-section">
            {isRenaming ? (
              <form onSubmit={handleRenameChat} className="chat-rename-form">
                <input 
                  type="text" 
                  value={renameValue} 
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={60}
                  autoFocus
                />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setIsRenaming(false)}>Cancel</button>
              </form>
            ) : (
              <h2 className="chat-title-text" onClick={() => activeChat && setIsRenaming(true)}>
                {activeChat ? (activeChat.display_name || activeChat.title) : 'No Active Chat'}
                {activeChat && <span className="edit-icon-helper"> ✏️</span>}
              </h2>
            )}
          </div>

          <div className="provider-selector" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >
              {isUploading ? 'Uploading...' : '📎 Upload Doc'}
            </button>
            <div>
              <label htmlFor="llm-provider">Model: </label>
              <select 
                id="llm-provider" 
                value={provider} 
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="gemini">Gemini 1.5 Flash</option>
                <option value="groq">Groq Llama 3</option>
              </select>
            </div>
          </div>
        </header>

        <div className="chat-window">
          {/* Shared Hidden File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt"
          />

          {isUploading && (
            <div className="upload-progress-card" style={{ margin: '12px auto' }}>
              <div className="spinner"></div>
              <p>Uploading and compiling vector search index...</p>
            </div>
          )}

          {uploadError && <p className="upload-feedback error" style={{ margin: '8px auto' }}>{uploadError}</p>}
          {uploadSuccess && <p className="upload-feedback success" style={{ margin: '8px auto' }}>{uploadSuccess}</p>}

          {messages.length === 0 && !streamedResponse && (
            <div className="empty-state-workspace">
              <h3>Upload a Document to Begin</h3>
              <p>Ask questions naturally and the assistant will retrieve relevant information before generating an answer.</p>

              {/* Upload Zone */}
              <div 
                className="upload-dropzone" 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <span className="upload-icon">⬆</span>
                <p>Drag & Drop Files here or <strong>Browse Files</strong></p>
                <span className="upload-hint">Supports PDF, DOCX, TXT</span>
              </div>
            </div>
          )}

          {/* Messages Feed */}
          {messages.map((m, idx) => (
            <div key={idx} className={`message-bubble ${m.role}`}>
              <div className="message-content">{m.content}</div>
              <div className="message-meta-info">
                <span>{m.provider ? `${m.provider.toUpperCase()} • ` : ''}</span>
                <span>{new Date(m.created_at).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}

          {/* Live stream response bubble */}
          {streamedResponse && (
            <div className="message-bubble assistant streaming">
              <div className="message-content">{streamedResponse}</div>
              <span className="streaming-cursor">█</span>
            </div>
          )}

          {isGenerating && !streamedResponse && (
            <div className="message-bubble assistant loading">
              <div className="skeleton skeleton-paragraph" style={{ height: '40px', width: '200px' }}></div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chat input footer */}
        <div className="chat-input-container">
          <form onSubmit={handleSendQuery} className="chat-input-wrapper">
            <textarea 
              placeholder={activeChat?.current_doc_id ? "Ask anything about your documents..." : "Please upload a document to query..."}
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
              className="btn btn-primary send-btn"
              disabled={!queryText.trim() || isGenerating}
            >
              ➔
            </button>
          </form>
        </div>
      </main>

      {/* 3. Retrieved Context Panel */}
      <aside className="context-panel">
        <h3 className="context-header">Retrieved Context & Citations</h3>
        
        {citations.length === 0 ? (
          <div className="no-citations-state">
            <p>Once you submit a query, relevant snippets and matching source score percentages will be cited here.</p>
          </div>
        ) : (
          <div className="citations-list">
            {citations.map((c, idx) => (
              <div key={idx} className="citation-card">
                <div className="citation-file">📄 {c.doc_filename || 'source document'}</div>
                <div className="citation-meta">
                  {c.page_number && <span className="citation-badge">Page {c.page_number}</span>}
                  <span className="citation-badge success">Match verified</span>
                </div>
                <p className="citation-text">"{c.excerpt}"</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
};

export default Dashboard;
