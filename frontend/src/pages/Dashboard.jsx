import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { 
  BookOpen, Search, Library, Terminal, Settings as SettingsIcon,
  Plus, MessageSquare, Paperclip, ArrowRight, Upload, X, Pencil,
  FileText, AlertTriangle, Trash2, CheckCircle, ChevronLeft, ChevronRight
} from '../components/icons';

import ProfileDropdown from '../components/ProfileDropdown';
import AlertsDropdown from '../components/AlertsDropdown';
import ModelSelector from '../components/ModelSelector';
import NavigationBar from '../components/NavigationBar';

const FormattedMessage = ({ content, citations, onCitationClick }) => {
  if (!content) return null;

  const citationRegex = /\[(?:Page|page|p\.)\s*(\d+(?:\s*,\s*\d+)*)\]/g;

  const renderTextWithCitations = (textStr) => {
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(textStr)) !== null) {
      const pageStr = match[1];
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(textStr.substring(lastIndex, matchIndex));
      }

      const pageNums = pageStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      const targetPage = pageNums[0];

      // Flexible matching for numeric page comparison
      let matchedCitation = citations?.find(c => c.page_number !== null && Number(c.page_number) === Number(targetPage));
      
      // Fallback matching if page label formatting differs
      if (!matchedCitation && citations && citations.length > 0) {
        matchedCitation = citations[0];
      }

      const citationData = matchedCitation ? {
        ...matchedCitation,
        page_number: matchedCitation.page_number || targetPage
      } : {
        page_number: targetPage,
        doc_filename: 'Source Document',
        excerpt: `Full text excerpt retrieved for Page ${targetPage}.`
      };

      parts.push(
        <button
          key={`cit-${matchIndex}`}
          type="button"
          className="citation-pill"
          title="Click to view full retrieved context excerpt"
          onClick={() => onCitationClick(citationData)}
        >
          📍 Page {pageStr}
        </button>
      );

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < textStr.length) {
      parts.push(textStr.substring(lastIndex));
    }

    return parts;
  };

  const lines = content.split('\n');
  const renderedElements = [];
  let listItems = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      renderedElements.push(
        <ul key={`ul-${key}`} style={{ margin: '6px 0 10px 20px', padding: 0 }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{renderTextWithCitations(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      flushList(index);
      renderedElements.push(
        <h3 key={index} style={{ fontSize: '15px', marginTop: '10px', marginBottom: '4px', borderBottom: '1px solid rgba(61,79,151,0.2)', paddingBottom: '2px' }}>
          {renderTextWithCitations(trimmed.replace('### ', ''))}
        </h3>
      );
    } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      flushList(index);
      renderedElements.push(
        <h3 key={index} style={{ fontSize: '16px', marginTop: '12px', marginBottom: '4px' }}>
          {renderTextWithCitations(trimmed.replace(/^#+\s+/, ''))}
        </h3>
      );
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      listItems.push(trimmed.replace(/^[\*\-]\s+/, ''));
    } else if (trimmed.length === 0) {
      flushList(index);
    } else {
      flushList(index);
      renderedElements.push(
        <p key={index} style={{ margin: '4px 0', lineHeight: '1.5' }}>
          {renderTextWithCitations(trimmed)}
        </p>
      );
    }
  });

  flushList('final');

  return <div className="formatted-markdown">{renderedElements}</div>;
};

const Dashboard = () => {
  const { user, logout, token } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [citations, setCitations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedCitation, setSelectedCitation] = useState(null);
  
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

  const [deleteTargetChat, setDeleteTargetChat] = useState(null);

  const onRequestDeleteChat = (chat, e) => {
    e.stopPropagation();
    setDeleteTargetChat(chat);
  };

  const confirmDeleteChat = async () => {
    if (!deleteTargetChat) return;
    const chatId = deleteTargetChat.id;
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
    } finally {
      setDeleteTargetChat(null);
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
                const finalCitations = data.citations || [];
                
                // Immediately commit to local UI state to prevent disappearances/flicker
                setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: tempAnswer, citations: finalCitations, created_at: new Date() }
                ]);
                setStreamedResponse('');
                setIsGenerating(false);

                // Background sync with database
                try {
                  const res = await apiClient.get(`/chats/${activeChat.id}/messages`);
                  if (res.data && res.data.length > 0) {
                    setMessages(res.data);
                    const allCitations = res.data
                      .filter(m => m.role === 'assistant' && m.citations)
                      .flatMap(m => m.citations);
                    setCitations(allCitations);
                  }
                } catch (syncErr) {
                  console.error('Background sync failed:', syncErr);
                }
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              // Ignore incomplete lines
            }
          }
        }
      }

      setIsGenerating(false);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: accumulatedText, citations: citations, created_at: new Date().toISOString() }
      ]);
      setStreamedResponse('');
    } catch (err) {
      console.error('Streaming response failed', err);
      setIsGenerating(false);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: '⚠️ CONNECTION FAILURE: Unable to generate LLM response. Verify server status.', is_error: true, created_at: new Date().toISOString() }
      ]);
      setStreamedResponse('');
    }
  };

  return (
    <div className="app-shell">
      <NavigationBar currentModel={provider} onModelChange={setProvider} />

      <div className="subnav-strip">
        <div className="subnav-links" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className="subnav-item"><span className="label">SYSTEM:</span> <span className="value">READY</span></span>
          <span style={{ color: '#3d4f97' }}>|</span>
          <span className="subnav-item"><span className="label">SESSION:</span> <span className="value">{activeChat ? (activeChat.display_name || activeChat.title) : 'NONE'}</span></span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className="subnav-item"><span className="value online status-led online">● ONLINE</span></span>
          <Link to="/dev-console" className="subnav-item" style={{ textDecoration: 'none', color: '#f68d1f', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>DEV CONSOLE</span>
            <ArrowRight className="icon-small" />
          </Link>
        </div>
      </div>

      <div className="workspace-layout">
        <aside className={`sidebar-panel ${sidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-section-header">
            <span>{sidebarOpen && "SESSION HISTORY"}</span>
            <button className="btn-ghost" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle Rail">
              {sidebarOpen ? <ChevronLeft className="icon" /> : <ChevronRight className="icon" />}
            </button>
          </div>

          <button className="sidebar-new-session-btn" onClick={handleCreateChat}>
            <Plus className="icon-small" />
            <span>NEW SESSION</span>
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
                    <MessageSquare className="icon-small" />
                    <span className="session-item-name">
                      {chat.display_name || chat.title}
                    </span>
                    <button 
                      className="btn-ghost delete-session-btn" 
                      onClick={(e) => onRequestDeleteChat(chat, e)}
                      title="Delete Session"
                      style={{ padding: '2px 4px', opacity: 0.7, transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 className="icon-small" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>

        <main className="main-content-area">
          <div className="section-label-bar">
            <div className="label-title">
              <Terminal className="icon" />
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
                <span onClick={() => activeChat && setIsRenaming(true)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  {activeChat ? (activeChat.display_name || activeChat.title) : 'SELECT OR CREATE SESSION'}
                  {activeChat && (
                    <span style={{ opacity: 0.6, marginLeft: '8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Pencil className="icon-small" /> RENAME
                    </span>
                  )}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                style={{ fontSize: '11px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Paperclip className="icon-small" />
                <span>{isUploading ? 'INDEXING...' : 'ATTACH DOC'}</span>
              </button>
            </div>
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt"
          />

          {isUploading && (
            <div style={{ padding: '12px 24px', backgroundColor: '#dedede', color: '#21242e', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', fontWeight: '700', borderBottom: '1px solid #3d4f97' }}>
              <div className="spinner"></div>
              <span>COMPILING VECTOR EMBEDDINGS & INDEXING SOURCE FILE...</span>
            </div>
          )}

          {uploadError && (
            <div style={{ padding: '12px 24px', backgroundColor: 'rgba(230,0,18,0.1)', color: '#e60012', borderBottom: '1px solid #e60012', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle className="icon" />
              <span>UPLOAD ERROR: {uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div style={{ padding: '12px 24px', backgroundColor: 'rgba(22,163,74,0.1)', color: '#16a34a', borderBottom: '1px solid #16a34a', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle className="icon" />
              <span>INDEX VERIFIED: {uploadSuccess}</span>
            </div>
          )}

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
                  <Upload className="icon-large" />
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

          {messages.length > 0 && (
            <div className="chat-feed">
              {messages.map((m, idx) => (
                <div 
                  key={idx} 
                  className={`message-bubble ${m.role === 'user' ? 'message-bubble-user' : m.is_error ? 'message-bubble-error' : 'message-bubble-assistant'}`}
                >
                  {m.role === 'user' || m.is_error ? (
                    <div style={{ marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  ) : (
                    <FormattedMessage 
                      content={m.content} 
                      citations={m.citations || citations} 
                      onCitationClick={(cit) => setSelectedCitation(cit)} 
                    />
                  )}
                  <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase', textAlign: m.role === 'user' ? 'right' : 'left', marginTop: '6px' }}>
                    {m.provider ? `${m.provider.toUpperCase()} • ` : ''}
                    {new Date(m.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}

              {streamedResponse && (
                <div className="message-bubble message-bubble-assistant">
                  <FormattedMessage 
                    content={streamedResponse} 
                    citations={citations} 
                    onCitationClick={(cit) => setSelectedCitation(cit)} 
                  />
                  <span className="streaming-cursor">█</span>
                </div>
              )}

              {isGenerating && !streamedResponse && (
                <div className="message-bubble message-bubble-assistant">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="thinking-indicator">
                      <div className="thinking-dot"></div>
                      <div className="thinking-dot"></div>
                      <div className="thinking-dot"></div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px' }}>
                      SEARCHING VECTOR INDEX & GENERATING RESPONSE...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="chat-input-bar">
            <form onSubmit={handleSendQuery} className="chat-input-wrapper">
              <textarea 
                className="chat-textarea"
                placeholder={activeChat ? "Type your query or instruction..." : "Attach a document to begin querying..."}
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={!activeChat || isGenerating}
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
                <ArrowRight className="icon" />
              </button>
            </form>
          </div>
        </main>
      </div>

      {selectedCitation && (
        <div className="modal-backdrop" onClick={() => setSelectedCitation(null)}>
          <div className="modal-content major-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText className="icon-large" />
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#ffffff', textTransform: 'uppercase' }}>
                    {selectedCitation.doc_filename || 'Source Document'}
                  </h4>
                  {selectedCitation.page_number && (
                    <span className="citation-badge citation-badge-page" style={{ marginTop: '4px', display: 'inline-block' }}>
                      PAGE {selectedCitation.page_number}
                    </span>
                  )}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setSelectedCitation(null)} style={{ background: 'none', border: 'none', color: '#9fbee7', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px', backgroundColor: '#dedede', color: '#21242e', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '320px', overflowY: 'auto', border: '1px solid #3d4f97' }}>
              "{selectedCitation.excerpt || selectedCitation.content || 'Retrieved context node from vector index.'}"
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
              <span style={{ fontSize: '11px', color: '#9fbee7', fontFamily: 'VT323, monospace' }}>
                VERIFIED RAG SOURCE CONTEXT
              </span>
              <button className="nav-btn primary" onClick={() => setSelectedCitation(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTargetChat && (
        <div className="modal-backdrop" onClick={() => setDeleteTargetChat(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', border: '1px solid #e60012', boxShadow: '0 8px 32px rgba(230,0,18,0.25)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e60012', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle className="icon" style={{ color: '#e60012' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px', letterSpacing: '0.05em', color: '#e60012', fontWeight: '800' }}>CONFIRM SESSION DELETION</h3>
                  <span style={{ fontSize: '11px', color: '#9fbee7', textTransform: 'uppercase' }}>
                    SESSION ID: {deleteTargetChat.id.substring(0, 13)}...
                  </span>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setDeleteTargetChat(null)} style={{ background: 'none', border: 'none', color: '#9fbee7', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px 0', color: '#dedede', fontSize: '13px', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete session <strong style={{ color: '#ecab37' }}>"{deleteTargetChat.display_name || deleteTargetChat.title}"</strong>? All associated query message history will be removed from memory.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid #3d4f97' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTargetChat(null)} style={{ fontSize: '12px', padding: '6px 14px' }}>
                Cancel
              </button>
              <button 
                className="btn" 
                onClick={confirmDeleteChat}
                style={{ backgroundColor: '#e60012', color: '#ffffff', border: '1px solid #ff3344', fontWeight: '700', fontSize: '12px', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(230,0,18,0.4)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 className="icon-small" />
                <span>Delete Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
