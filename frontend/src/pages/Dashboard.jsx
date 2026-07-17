import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { optimisticUpdate, shakeElement } from '../utils/optimistic';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { 
  BookOpen, Search, Library, Terminal, Settings as SettingsIcon,
  Plus, MessageSquare, Paperclip, ArrowRight, Upload, X, Pencil,
  FileText, AlertTriangle, Trash2, CheckCircle, ChevronLeft, ChevronRight,
  Globe, ExternalLink, FolderPlus, Users, Folder, ChevronDown, Sparkles
} from '../components/icons';

import ProfileDropdown from '../components/ProfileDropdown';
import AlertsDropdown from '../components/AlertsDropdown';
import ModelSelector from '../components/ModelSelector';
import NavigationBar from '../components/NavigationBar';
import SidebarNudgeBanner from '../components/SidebarNudgeBanner';
import MessageContent from '../components/MessageContent';

const FormattedMessage = ({ content, citations, onCitationClick }) => {
  return (
    <MessageContent
      content={content}
      citations={citations}
      onCitationClick={onCitationClick}
    />
  );
};

const Dashboard = () => {
  const { user, token } = useAuth();
  const { toast } = useToast();

  // Core data states
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [citations, setCitations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [projects, setProjects] = useState([]);

  // Workspace states
  const [workspaces, setWorkspaces] = useState([]);
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState(new Set());
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);
  const [showEditWorkspaceModal, setShowEditWorkspaceModal] = useState(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [isSubmittingWorkspace, setIsSubmittingWorkspace] = useState(false);

  // Active citation modal state
  const [selectedCitation, setSelectedCitation] = useState(null);

  // Form states
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

  // Web search state
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSourcesMap, setWebSourcesMap] = useState({});  // msgIndex -> web_sources[]
  const [webSearchCount, setWebSearchCount] = useState(0);

  // Sizing & density states
  const [fontSize, setFontSize] = useState('medium');
  const [density, setDensity] = useState('comfortable');

  // DOM Refs for target shake animations
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const newChatBtnRef = useRef(null);
  const sidebarSessionListRef = useRef(null);
  const alertsDropdownRef = useRef(null);
  const projectListRef = useRef(null);

  // Load initial data
  useEffect(() => {
    fetchChats();
    fetchNotifications();
    fetchProjects();
    fetchWorkspaces();
    fetchSettings();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedResponse]);

  const getBubblePadding = (role) => {
    if (density === 'compact') {
      return role === 'user' ? '8px 12px' : '12px 16px';
    }
    return role === 'user' ? '12px 24px' : '24px 32px';
  };

  const getBubbleFontSize = () => {
    if (fontSize === 'small') return '13px';
    if (fontSize === 'large') return '17px';
    return '15px';
  };

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/users/me/settings');
      if (res.data) {
        setFontSize(res.data.font_size || 'medium');
        setDensity(res.data.density || 'comfortable');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

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
      setNotifications(res.data.filter(n => !n.is_read));
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await apiClient.get('/projects');
      setProjects(res.data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await apiClient.get('/workspaces');
      setWorkspaces(res.data || []);
    } catch (err) {
      console.error('Error fetching workspaces:', err);
    }
  };

  const handleCreateWorkspace = async (e) => {
    e?.preventDefault();
    if (!workspaceName.trim()) return;
    setIsSubmittingWorkspace(true);
    try {
      const res = await apiClient.post('/workspaces', {
        name: workspaceName.trim(),
        chat_ids: selectedChatIds
      });
      const newWs = res.data;
      setWorkspaces(prev => [newWs, ...prev]);
      setShowCreateWorkspaceModal(false);
      setWorkspaceName('');
      setSelectedChatIds([]);
      toast?.success?.('Workspace created!');
      
      // Select newly created workspace chat
      if (newWs.workspace_chat) {
        selectChat(newWs.workspace_chat);
      }
    } catch (err) {
      console.error('Error creating workspace:', err);
      toast?.error?.(err.response?.data?.detail?.error?.message || 'Failed to create workspace');
    } finally {
      setIsSubmittingWorkspace(false);
    }
  };

  const handleUpdateWorkspace = async (e) => {
    e?.preventDefault();
    if (!workspaceName.trim() || !showEditWorkspaceModal) return;
    setIsSubmittingWorkspace(true);
    const wsId = showEditWorkspaceModal.id;
    try {
      const res = await apiClient.put(`/workspaces/${wsId}`, {
        name: workspaceName.trim(),
        chat_ids: selectedChatIds
      });
      setWorkspaces(prev => prev.map(w => w.id === wsId ? res.data : w));
      setShowEditWorkspaceModal(null);
      setWorkspaceName('');
      setSelectedChatIds([]);
      toast?.success?.('Workspace updated!');
    } catch (err) {
      console.error('Error updating workspace:', err);
      toast?.error?.(err.response?.data?.detail?.error?.message || 'Failed to update workspace');
    } finally {
      setIsSubmittingWorkspace(false);
    }
  };

  const handleDeleteWorkspace = async (wsId) => {
    try {
      await apiClient.delete(`/workspaces/${wsId}`);
      setWorkspaces(prev => prev.filter(w => w.id !== wsId));
      toast?.success?.('Workspace deleted');
      fetchChats();
    } catch (err) {
      console.error('Error deleting workspace:', err);
      toast?.error?.('Failed to delete workspace');
    }
  };

  const selectChat = async (chat) => {
    setActiveChat(chat);
    setRenameValue(chat.display_name || chat.title);
    setIsRenaming(false);
    setMessages([]);
    setCitations([]);
    setStreamedResponse('');

    if (chat.isOptimistic) return;

    try {
      const res = await apiClient.get(`/chats/${chat.id}/messages`);
      setMessages(res.data);
      
      const allCitations = res.data
        .filter(m => m.role === 'assistant' && m.citations)
        .flatMap(m => m.citations);
      setCitations(allCitations);
    } catch (err) {
      console.error('Error fetching message history:', err);
    }
  };

  /**
   * Action 1: New Chat Initialization (Optimistic)
   */
  const handleCreateChat = async () => {
    const tempId = `temp-chat-${crypto.randomUUID()}`;
    const previousChats = [...chats];
    const previousActiveChat = activeChat;
    const tempChat = {
      id: tempId,
      title: 'New Chat',
      display_name: 'New Chat',
      created_at: new Date().toISOString(),
      isOptimistic: true
    };

    await optimisticUpdate({
      optimisticFn: () => {
        setChats([tempChat, ...chats]);
        setActiveChat(tempChat);
        setMessages([]);
        setCitations([]);
        setStreamedResponse('');
      },
      apiCall: async () => {
        const res = await apiClient.post('/chats', { title: 'New Chat' });
        const realChat = res.data;
        setChats(prev => prev.map(c => c.id === tempId ? realChat : c));
        setActiveChat(realChat);
        return realChat;
      },
      rollbackFn: () => {
        setChats(previousChats);
        setActiveChat(previousActiveChat);
      },
      errorMessage: "⚠️ Couldn't create chat session. Please retry.",
      targetRef: newChatBtnRef,
      toast
    });
  };

  const [deleteTargetChat, setDeleteTargetChat] = useState(null);

  const onRequestDeleteChat = (chat, e) => {
    e.stopPropagation();
    setDeleteTargetChat(chat);
  };

  /**
   * Action 2: Chat Deletion (Optimistic)
   */
  const confirmDeleteChat = async () => {
    if (!deleteTargetChat) return;
    const targetChat = deleteTargetChat;
    const targetId = targetChat.id;
    const previousChats = [...chats];
    const previousActiveChat = activeChat;

    setDeleteTargetChat(null);

    await optimisticUpdate({
      optimisticFn: () => {
        const remainingChats = chats.filter(c => c.id !== targetId);
        setChats(remainingChats);
        if (activeChat?.id === targetId) {
          const nextActive = remainingChats.length > 0 ? remainingChats[0] : null;
          setActiveChat(nextActive);
          if (nextActive) selectChat(nextActive);
          else setMessages([]);
        }
      },
      apiCall: async () => {
        await apiClient.delete(`/chats/${targetId}`);
      },
      rollbackFn: () => {
        setChats(previousChats);
        setActiveChat(previousActiveChat);
      },
      errorMessage: `⚠️ Couldn't delete session "${targetChat.display_name || targetChat.title}". Restored.`,
      targetRef: sidebarSessionListRef,
      toast
    });
  };

  const handleRenameChat = async (e) => {
    e.preventDefault();
    if (!renameValue.trim() || renameValue.length > 60 || !activeChat) return;

    const previousChats = [...chats];
    const previousActiveChat = activeChat;
    const newName = renameValue.trim();

    await optimisticUpdate({
      optimisticFn: () => {
        const updatedChat = { ...activeChat, display_name: newName };
        setChats(chats.map(c => c.id === activeChat.id ? updatedChat : c));
        setActiveChat(updatedChat);
        setIsRenaming(false);
      },
      apiCall: async () => {
        const res = await apiClient.patch(`/chats/${activeChat.id}`, { display_name: newName });
        setChats(prev => prev.map(c => c.id === activeChat.id ? res.data : c));
        setActiveChat(res.data);
      },
      rollbackFn: () => {
        setChats(previousChats);
        setActiveChat(previousActiveChat);
      },
      errorMessage: `⚠️ Couldn't rename session. Restored original title.`,
      targetRef: sidebarSessionListRef,
      toast
    });
  };

  /**
   * Action 3: Notification Dismissal (Optimistic)
   */
  const handleDismissNotification = async (notifId, e) => {
    if (e) e.stopPropagation();
    const previousNotifications = [...notifications];

    await optimisticUpdate({
      optimisticFn: () => {
        setNotifications(notifications.filter(n => n.id !== notifId));
      },
      apiCall: async () => {
        await apiClient.patch(`/notifications/${notifId}`, { is_read: true });
      },
      rollbackFn: () => {
        setNotifications(previousNotifications);
      },
      errorMessage: "⚠️ Couldn't dismiss notification. Restored.",
      targetRef: alertsDropdownRef,
      toast
    });
  };

  /**
   * Action 4: Project Chat Membership Add/Remove (Optimistic)
   */
  const handleAddChatToProject = async (projectId, chatId) => {
    const previousProjects = [...projects];

    await optimisticUpdate({
      optimisticFn: () => {
        setProjects(prev => prev.map(p => {
          if (p.id === projectId) {
            return {
              ...p,
              chat_ids: p.chat_ids ? [...p.chat_ids, chatId] : [chatId]
            };
          }
          return p;
        }));
      },
      apiCall: async () => {
        const res = await apiClient.post(`/projects/${projectId}/chats`, { chat_id: chatId });
        setProjects(prev => prev.map(p => p.id === projectId ? res.data : p));
      },
      rollbackFn: () => {
        setProjects(previousProjects);
      },
      errorMessage: "⚠️ Couldn't add chat to project. Restored.",
      targetRef: projectListRef,
      toast
    });
  };

  const handleRemoveChatFromProject = async (projectId, chatId) => {
    const previousProjects = [...projects];

    await optimisticUpdate({
      optimisticFn: () => {
        setProjects(prev => prev.map(p => {
          if (p.id === projectId) {
            return {
              ...p,
              chat_ids: (p.chat_ids || []).filter(id => id !== chatId)
            };
          }
          return p;
        }));
      },
      apiCall: async () => {
        await apiClient.delete(`/projects/${projectId}/chats/${chatId}`);
      },
      rollbackFn: () => {
        setProjects(previousProjects);
      },
      errorMessage: "⚠️ Couldn't remove chat from project. Restored.",
      targetRef: projectListRef,
      toast
    });
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
          provider: provider,
          web_search: webSearchEnabled
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
      let pendingWebSources = [];
      let systemWarningText = null;

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
              } else if (data.type === 'web_search_status') {
                setWebSearchCount(data.count || 0);
                if (data.warning) {
                  systemWarningText = data.warning;
                }
              } else if (data.type === 'done') {
                const finalCitations = data.citations || [];
                pendingWebSources = data.web_sources || [];
                const msgId = data.message_id;
                if (data.system_warning) {
                  systemWarningText = data.system_warning;
                }
                
                // Immediately commit to local UI state
                const newMsgIndex = messages.length + 1;
                setMessages(prev => [
                  ...prev,
                  { 
                    role: 'assistant', 
                    content: tempAnswer, 
                    citations: finalCitations, 
                    created_at: new Date(),
                    had_web_search: webSearchEnabled,
                    web_source_count: pendingWebSources.length,
                    system_warning: systemWarningText
                  }
                ]);

                // Store web sources keyed by message index and message_id
                if (pendingWebSources.length > 0) {
                  setWebSourcesMap(prev => {
                    const newMap = { ...prev, [newMsgIndex]: pendingWebSources };
                    if (msgId) {
                      newMap[msgId] = pendingWebSources;
                    }
                    return newMap;
                  });
                }

                setStreamedResponse('');
                setIsGenerating(false);
                setWebSearchCount(0);

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
      setStreamedResponse('');
    } catch (err) {
      console.error('Streaming response failed', err);
      setIsGenerating(false);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ CONNECTION FAILURE: ${err.message || 'Unable to generate LLM response. Verify server status.'}`, is_error: true, created_at: new Date() }
      ]);
      setStreamedResponse('');
    }
  };

  return (
    <div className="app-shell">
      <NavigationBar 
        currentModel={provider} 
        onModelChange={setProvider} 
        customNotifications={notifications}
        onCustomDismiss={handleDismissNotification}
      />

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
            <button 
              className="sidebar-new-session-btn outline-btn" 
              style={{ backgroundColor: 'transparent', color: 'var(--color-ink)', border: '1px solid var(--color-hairline-translucent)' }}
              onClick={() => {
                setWorkspaceName('');
                setSelectedChatIds([]);
                setShowCreateWorkspaceModal(true);
              }}
              title="Create Workspace"
            >
              <FolderPlus className="icon-small" />
              {sidebarOpen && <span>NEW WORKSPACE</span>}
            </button>

            <button ref={newChatBtnRef} className="sidebar-new-session-btn" onClick={handleCreateChat} title="New Session">
              <Plus className="icon-small" />
              {sidebarOpen && <span>NEW SESSION</span>}
            </button>
          </div>

          {sidebarOpen && <SidebarNudgeBanner />}

          {sidebarOpen && (
            <div ref={sidebarSessionListRef} className="sidebar-session-list">
              {chats.filter(c => !c.is_workspace_chat).length === 0 ? (
                <div className="sidebar-empty">NO SESSIONS STORED</div>
              ) : (
                chats.filter(c => !c.is_workspace_chat).map(chat => (
                  <div 
                    key={chat.id} 
                    className={`sidebar-session-item ${activeChat?.id === chat.id ? 'active' : ''} ${chat.isOptimistic ? 'is-optimistic' : ''}`}
                    onClick={() => selectChat(chat)}
                  >
                    <MessageSquare className="icon-small" />
                    <span className="session-item-name">
                      {chat.display_name || chat.title}
                    </span>
                    {chat.isOptimistic ? (
                      <span style={{ fontSize: '10px', opacity: 0.6, fontStyle: 'italic', marginLeft: 'auto' }}>CREATING...</span>
                    ) : (
                      <button 
                        className="btn-ghost delete-session-btn" 
                        onClick={(e) => onRequestDeleteChat(chat, e)}
                        title="Delete Session"
                        style={{ padding: '2px 4px', opacity: 0.7, transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 className="icon-small" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {sidebarOpen && (
            <div style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--color-hairline)' }}>
              <div className="sidebar-section-header" style={{ marginBottom: 'var(--space-sm)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <FolderPlus className="icon-small" /> WORKSPACES ({workspaces.length})
                </span>
              </div>

              <div className="sidebar-session-list">
                {workspaces.length === 0 ? (
                  <div className="sidebar-empty">NO WORKSPACES CREATED</div>
                ) : (
                  workspaces.map(ws => {
                    const isCollapsed = collapsedWorkspaces.has(ws.id);
                    const toggleCollapse = () => {
                      setCollapsedWorkspaces(prev => {
                        const next = new Set(prev);
                        if (next.has(ws.id)) next.delete(ws.id);
                        else next.add(ws.id);
                        return next;
                      });
                    };

                    return (
                      <div key={ws.id} style={{ marginBottom: 'var(--space-xs)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-canvas-soft)', overflow: 'hidden' }}>
                        <div 
                          style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.02)' }}
                          onClick={toggleCollapse}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: '13px', color: 'var(--color-ink)', fontWeight: 400 }}>
                            <Folder className="icon-small" style={{ color: 'var(--color-body-mid)' }} />
                            <span>{ws.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-body-mid)' }}>({ws.member_chats?.length || 0}/4)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xxs)' }} onClick={e => e.stopPropagation()}>
                            <button 
                              className="btn-ghost"
                              style={{ padding: '2px 4px', color: 'var(--color-body-mid)' }}
                              onClick={() => {
                                setShowEditWorkspaceModal(ws);
                                setWorkspaceName(ws.name);
                                setSelectedChatIds(ws.member_chats?.map(c => c.id) || []);
                              }}
                              title="Edit Workspace"
                            >
                              <Pencil className="icon-tiny" />
                            </button>
                            <button 
                              className="btn-ghost"
                              style={{ padding: '2px 4px', color: 'var(--color-error)' }}
                              onClick={() => handleDeleteWorkspace(ws.id)}
                              title="Delete Workspace"
                            >
                              <Trash2 className="icon-tiny" />
                            </button>
                            <button className="btn-ghost" style={{ padding: '2px', color: 'var(--color-body-mid)' }} onClick={toggleCollapse}>
                              {isCollapsed ? <ChevronRight className="icon-tiny" /> : <ChevronDown className="icon-tiny" />}
                            </button>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div style={{ padding: '4px 6px', borderTop: '1px solid var(--color-hairline)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {ws.workspace_chat && (
                              <div 
                                className={`sidebar-session-item ${activeChat?.id === ws.workspace_chat.id ? 'active' : ''}`}
                                style={{ margin: '2px 0', borderLeft: '2px solid var(--color-primary)' }}
                                onClick={() => selectChat(ws.workspace_chat)}
                              >
                                <Sparkles className="icon-small" style={{ color: 'var(--color-ink)' }} />
                                <span className="session-item-name" style={{ color: 'var(--color-ink)' }}>
                                  {ws.workspace_chat.display_name || ws.workspace_chat.title}
                                </span>
                              </div>
                            )}

                            {ws.member_chats?.map(mChat => (
                              <div 
                                key={mChat.id}
                                className={`sidebar-session-item ${activeChat?.id === mChat.id ? 'active' : ''}`}
                                style={{ paddingLeft: '20px', fontSize: '12px' }}
                                onClick={() => selectChat(mChat)}
                              >
                                <FileText className="icon-tiny" style={{ color: 'var(--color-body-mid)' }} />
                                <span className="session-item-name">{mChat.display_name || mChat.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {sidebarOpen && (
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #3d4f97' }}>
              <div className="sidebar-section-header" style={{ marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#ecab37' }}>
                  <FolderPlus className="icon-small" /> PROJECTS ({projects.length})
                </span>
              </div>
              <div ref={projectListRef} className="sidebar-session-list">
                {projects.length === 0 ? (
                  <div className="sidebar-empty">NO PROJECTS ACTIVE</div>
                ) : (
                  projects.map(proj => {
                    const isChatMember = activeChat && proj.chat_ids && proj.chat_ids.includes(activeChat.id);
                    return (
                      <div key={proj.id} style={{ padding: '8px', marginBottom: '6px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', border: '1px solid rgba(61,79,151,0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: '700', color: '#9fbee7' }}>
                          <span>{proj.name}</span>
                          <span style={{ fontSize: '10px', opacity: 0.7 }}>{proj.chat_ids?.length || 0}/4 CHATS</span>
                        </div>
                        {activeChat && !activeChat.isOptimistic && (
                          <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                            {isChatMember ? (
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '10px', padding: '2px 6px', color: '#e60012', borderColor: '#e60012' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveChatFromProject(proj.id, activeChat.id);
                                }}
                              >
                                Remove Current Chat
                              </button>
                            ) : (
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '10px', padding: '2px 6px', color: '#ecab37', borderColor: '#ecab37' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddChatToProject(proj.id, activeChat.id);
                                }}
                              >
                                + Add Current Chat
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
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
                  style={{
                    padding: getBubblePadding(m.role),
                    fontSize: getBubbleFontSize(),
                    lineHeight: fontSize === 'small' ? '1.4' : fontSize === 'large' ? '1.8' : '1.6'
                  }}
                >
                  {m.system_warning && (
                    <div className="system-warning-pill">
                      <AlertTriangle className="icon-small" />
                      <span>⚠️ {m.system_warning}</span>
                    </div>
                  )}
                  {m.role === 'user' || m.is_error ? (
                    <div style={{ marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  ) : (
                    <FormattedMessage 
                      content={m.content} 
                      citations={m.citations || citations} 
                      onCitationClick={(cit) => setSelectedCitation(cit)} 
                    />
                  )}
                  <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase', textAlign: m.role === 'user' ? 'right' : 'left', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {(m.role === 'assistant' && m.provider) ? `${m.provider.toUpperCase()} • ` : ''}
                    {new Date(m.created_at).toLocaleTimeString()}
                    {m.had_web_search && (
                      <span className="web-search-indicator">
                        <Globe className="icon-tiny" /> Searched the web • {m.web_source_count} source{m.web_source_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Render web source cards if available for this message */}
                  {(() => {
                    const sources = (m.id && webSourcesMap[m.id]) || webSourcesMap[idx];
                    if (!sources || sources.length === 0) return null;
                    return (
                      <div className="web-sources-section">
                        <div className="web-sources-header">
                          <Globe className="icon-small" />
                          <span>Web Sources</span>
                        </div>
                        <div className="web-sources-grid">
                          {sources.map((ws, wsIdx) => (
                            <a 
                              key={wsIdx} 
                              href={ws.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="web-source-card"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="ws-card-title">
                                <span>{ws.title}</span>
                                <ExternalLink className="icon-tiny" />
                              </div>
                              <div className="ws-card-snippet">{ws.snippet}</div>
                              <div className="ws-card-url">{new URL(ws.url).hostname}</div>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}

              {streamedResponse && (
                <div 
                  className="message-bubble message-bubble-assistant"
                  style={{
                    padding: getBubblePadding('assistant'),
                    fontSize: getBubbleFontSize(),
                    lineHeight: fontSize === 'small' ? '1.4' : fontSize === 'large' ? '1.8' : '1.6'
                  }}
                >
                  <FormattedMessage 
                    content={streamedResponse} 
                    citations={citations} 
                    onCitationClick={(cit) => setSelectedCitation(cit)} 
                  />
                  <span className="streaming-cursor">█</span>
                </div>
              )}

              {isGenerating && !streamedResponse && (
                <div 
                  className="message-bubble message-bubble-assistant"
                  style={{
                    padding: getBubblePadding('assistant'),
                    fontSize: getBubbleFontSize(),
                    lineHeight: fontSize === 'small' ? '1.4' : fontSize === 'large' ? '1.8' : '1.6'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="thinking-indicator">
                      <div className="thinking-dot"></div>
                      <div className="thinking-dot"></div>
                      <div className="thinking-dot"></div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px' }}>
                      {webSearchEnabled 
                        ? (webSearchCount > 0 
                            ? `WEB SEARCH COMPLETE (${webSearchCount} sources) • GENERATING RESPONSE...`
                            : 'SEARCHING WEB & VECTOR INDEX...')
                        : 'SEARCHING VECTOR INDEX & GENERATING RESPONSE...'}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="chat-input-bar">
            <form onSubmit={handleSendQuery} className="chat-input-wrapper">
              <button
                id="web-search-toggle"
                type="button"
                className={`web-search-toggle ${webSearchEnabled ? 'active' : ''}`}
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                title="Enable web search to supplement your documents with real-time information"
              >
                <Globe className="icon-small" />
                {webSearchEnabled && <span className="ws-toggle-label">WEB</span>}
              </button>
              <textarea 
                className="chat-textarea"
                placeholder={activeChat ? (webSearchEnabled ? "Search the web and your documents..." : "Type your query or instruction...") : "Attach a document to begin querying..."}
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
          <div className="modal-container modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <FileText className="icon" style={{ color: 'var(--color-ink)' }} />
                <div>
                  <h4 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>
                    {selectedCitation.doc_filename || 'Source Document'}
                  </h4>
                  {selectedCitation.source_chat && (
                    <div style={{ fontSize: '11px', color: 'var(--color-body-mid)', fontWeight: 600, marginTop: '2px', letterSpacing: '0.5px' }}>
                      SOURCE CHAT: {selectedCitation.source_chat}
                    </div>
                  )}
                  {selectedCitation.page_number && (
                    <span className="citation-badge citation-badge-page" style={{ marginTop: '4px', display: 'inline-block' }}>
                      PAGE {selectedCitation.page_number}
                    </span>
                  )}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedCitation(null)}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body" style={{ padding: 'var(--space-md)', backgroundColor: 'var(--color-canvas-soft)', color: 'var(--color-ink)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--color-hairline-translucent)' }}>
              "{selectedCitation.excerpt || selectedCitation.content || 'Retrieved context node from vector index.'}"
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-body-mid)', fontFamily: 'var(--font-mono)' }}>
                VERIFIED RAG SOURCE CONTEXT
              </span>
              <button className="btn btn-primary" onClick={() => setSelectedCitation(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {(showCreateWorkspaceModal || showEditWorkspaceModal) && (
        <div className="modal-backdrop" onClick={() => { setShowCreateWorkspaceModal(false); setShowEditWorkspaceModal(null); }}>
          <div className="modal-container modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <FolderPlus className="icon" style={{ color: 'var(--color-ink)' }} />
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '16px', color: 'var(--color-ink)' }}>
                    {showEditWorkspaceModal ? 'EDIT WORKSPACE' : 'CREATE WORKSPACE'}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-body-mid)' }}>
                    Combine up to 4 chats into a unified knowledge base
                  </span>
                </div>
              </div>
              <button 
                type="button"
                className="modal-close-btn" 
                onClick={() => { setShowCreateWorkspaceModal(false); setShowEditWorkspaceModal(null); }}
              >
                <X className="icon" />
              </button>
            </div>

            <form onSubmit={showEditWorkspaceModal ? handleUpdateWorkspace : handleCreateWorkspace}>
              <div className="modal-body">
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: 'var(--space-xs)' }}>
                    WORKSPACE NAME
                  </label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Q3 Financial Audit" 
                    value={workspaceName} 
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    required
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                    <label className="form-label">
                      SELECT MEMBER CHATS ({selectedChatIds.length}/4)
                    </label>
                    {selectedChatIds.length >= 4 && (
                      <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>Max limit reached</span>
                    )}
                  </div>

                  <div style={{ 
                    maxHeight: '220px', 
                    overflowY: 'auto', 
                    border: '1px solid var(--color-hairline-translucent)', 
                    borderRadius: 'var(--radius-sm)', 
                    backgroundColor: 'var(--color-canvas-soft)', 
                    padding: 'var(--space-xs)' 
                  }}>
                    {chats.filter(c => !c.is_workspace_chat).length === 0 ? (
                      <div style={{ padding: 'var(--space-md)', textAlign: 'center', fontSize: '12px', color: 'var(--color-body-mid)' }}>
                        No chats available. Create individual chats first to add them to a workspace.
                      </div>
                    ) : (
                      chats.filter(c => !c.is_workspace_chat).map(c => {
                        const isSelected = selectedChatIds.includes(c.id);
                        const isDisabled = !isSelected && selectedChatIds.length >= 4;

                        const toggleSelect = () => {
                          if (isSelected) {
                            setSelectedChatIds(prev => prev.filter(id => id !== c.id));
                          } else if (!isDisabled) {
                            setSelectedChatIds(prev => [...prev, c.id]);
                          }
                        };

                        return (
                          <div 
                            key={c.id} 
                            onClick={toggleSelect}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justify: 'space-between', 
                              padding: '8px 12px', 
                              marginBottom: 'var(--space-xxs)', 
                              borderRadius: 'var(--radius-pill)', 
                              backgroundColor: isSelected ? 'var(--color-hairline)' : 'transparent',
                              border: '1px solid',
                              borderColor: isSelected ? 'var(--color-hairline-translucent)' : 'transparent',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              opacity: isDisabled ? 0.4 : 1,
                              transition: 'all 150ms ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                              <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={toggleSelect}
                                disabled={isDisabled}
                                style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', accentColor: 'var(--color-primary)' }}
                              />
                              <span style={{ fontSize: '13px', color: isSelected ? 'var(--color-ink)' : 'var(--color-body)', fontWeight: 400 }}>
                                {c.display_name || c.title}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--color-body-mid)' }}>
                              {c.current_doc_id ? '📄 Attached' : 'No doc'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn outline-btn" 
                  onClick={() => { setShowCreateWorkspaceModal(false); setShowEditWorkspaceModal(null); }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={!workspaceName.trim() || isSubmittingWorkspace}
                >
                  <FolderPlus className="icon-small" />
                  <span>{isSubmittingWorkspace ? 'SAVING...' : (showEditWorkspaceModal ? 'Update Workspace' : 'Create Workspace')}</span>
                </button>
              </div>
            </form>
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
