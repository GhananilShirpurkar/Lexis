import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { optimisticUpdate } from '../utils/optimistic';
import apiClient from '../api/client';
import { 
  Terminal, Plus, MessageSquare, Paperclip, ArrowRight, Upload, X, Pencil,
  FileText, AlertTriangle, Trash2, CheckCircle, ChevronLeft, ChevronRight,
  Globe, ExternalLink, FolderPlus, Folder, ChevronDown, Sparkles
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

const getChatTitle = (chat) => {
  if (!chat) return 'New Chat';
  return chat.user_edited_title || chat.generated_title || chat.display_name || chat.title || 'New Chat';
};

const DocumentOverview = ({ activeChat, onRegenerate }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const status = activeChat.summary_status || 'pending';
  const summary = activeChat.generated_summary;
  const title = activeChat.generated_title;

  if (status === 'not_applicable') return null;

  return (
    <div 
      className="document-overview-card" 
      style={{
        margin: '16px 24px',
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div 
            style={{
              padding: '6px',
              borderRadius: '8px',
              backgroundColor: 'rgba(246, 141, 31, 0.1)',
              color: '#f68d1f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FileText className="icon-small" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-ink)' }}>
              Document Overview
            </div>
            {title && (
              <div style={{ fontSize: '11px', color: 'var(--color-body-mid)', marginTop: '2px' }}>
                AI Refined Title: <span style={{ fontWeight: '500', color: 'var(--color-ink)' }}>{title}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={e => e.stopPropagation()}>
          {status === 'generating' && (
            <span 
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(246, 141, 31, 0.15)',
                color: '#f68d1f',
                fontWeight: '500'
              }}
            >
              <div 
                className="pulse-dot" 
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#f68d1f'
                }}
              />
              Generating Summary...
            </span>
          )}
          {status === 'completed' && (
            <span 
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--color-accent-green)',
                fontWeight: '500'
              }}
            >
              Ready
            </span>
          )}
          {status === 'failed' && (
            <span 
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--color-error)',
                fontWeight: '500'
              }}
            >
              Generation Failed
            </span>
          )}
          {status === 'pending' && (
            <span 
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--color-canvas-soft)',
                color: 'var(--color-body-mid)',
                fontWeight: '500'
              }}
            >
              Queued
            </span>
          )}

          <button 
            className="btn-ghost" 
            style={{ padding: '4px', color: 'var(--color-body-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? <ChevronDown className="icon-small" /> : <ChevronLeft className="icon-small" style={{ transform: 'rotate(-90deg)' }} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div 
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: '12px',
            fontSize: '13px',
            lineHeight: '1.6',
            color: 'var(--color-body)'
          }}
        >
          {status === 'generating' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ height: '14px', width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', animation: 'skeleton-pulse 1.5s infinite' }}></div>
              <div style={{ height: '14px', width: '85%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', animation: 'skeleton-pulse 1.5s infinite' }}></div>
              <div style={{ height: '14px', width: '60%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', animation: 'skeleton-pulse 1.5s infinite' }}></div>
            </div>
          )}
          {status === 'pending' && (
            <div style={{ color: 'var(--color-body-mid)', fontStyle: 'italic' }}>
              Summary request has been queued and will begin shortly...
            </div>
          )}
          {status === 'failed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: 'var(--color-error)' }}>
                {summary || "An error occurred while generating the document overview summary."}
              </div>
              <button 
                className="btn-ghost"
                onClick={onRegenerate}
                style={{
                  alignSelf: 'flex-start',
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--color-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Sparkles className="icon-tiny" />
                Retry Summary Generation
              </button>
            </div>
          )}
          {status === 'completed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-body)' }}>{summary}</div>
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  paddingTop: '10px',
                  marginTop: '4px'
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--color-body-mid)' }}>
                  Auto-named based on analyzed themes.
                </span>
                <button 
                  className="btn-ghost"
                  onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    color: 'var(--color-body-mid)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                  title="Regenerate the overview summary and chat title using LLM"
                >
                  <Sparkles className="icon-tiny" />
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { user, token } = useAuth();
  const { toast } = useToast();

  // Relative time helper
  const formatRelativeTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  // Core data states
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [citations, setCitations] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Workspace states
  const [workspaces, setWorkspaces] = useState([]);
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState(new Set());
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);
  const [showEditWorkspaceModal, setShowEditWorkspaceModal] = useState(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [isSubmittingWorkspace, setIsSubmittingWorkspace] = useState(false);

  // New session upload modal state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionDragging, setNewSessionDragging] = useState(false);

  // Sidebar inline rename state
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renamingValue, setRenamingValue] = useState('');

  // Right panel citation state
  const [citationPanel, setCitationPanel] = useState(null); // null or citation object

  // Form states
  const [queryText, setQueryText] = useState('');
  const [provider, setProvider] = useState('gemini');

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
  const newSessionFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const newChatBtnRef = useRef(null);
  const sidebarSessionListRef = useRef(null);
  const alertsDropdownRef = useRef(null);

  // Load initial data
  useEffect(() => {
    fetchChats();
    fetchNotifications();
    fetchWorkspaces();
    fetchSettings();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedResponse]);

  // Handle mobile screen resize auto-collapsing sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    handleResize(); // run initially
    window.addEventListener('resize', handleResize);
  }, []);

  // SSE Event Listener for Active Chat Summary & Status Updates
  useEffect(() => {
    if (!activeChat || !activeChat.id || !activeChat.current_doc_id) return;
    
    let isSubscribed = true;
    let controller = new AbortController();
    
    const connectToEvents = async () => {
      try {
        const response = await fetch(`/api/chats/${activeChat.id}/events`, {
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to subscribe to chat events');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        
        while (isSubscribed) {
          const { value, done } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Save the last partial line back to the buffer
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(trimmed.substring(6));
                if (eventData.type === 'summary_ready' || eventData.type === 'initial') {
                  if (!isSubscribed) break;
                  
                  // Update activeChat summary and title fields in state
                  setActiveChat(prev => {
                    if (!prev || prev.id !== activeChat.id) return prev;
                    return {
                      ...prev,
                      summary_status: eventData.summary_status,
                      generated_summary: eventData.generated_summary,
                      generated_title: eventData.generated_title
                    };
                  });
                  
                  // Also update it in the sidebar list of chats
                  setChats(prevChats => 
                    prevChats.map(c => 
                      c.id === activeChat.id 
                        ? {
                            ...c,
                            summary_status: eventData.summary_status,
                            generated_summary: eventData.generated_summary,
                            generated_title: eventData.generated_title
                          }
                        : c
                    )
                  );
                }
              } catch (e) {
                console.error('Error parsing SSE event data:', e);
              }
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('SSE Connection Error:', err);
          // Retry after 5 seconds if still subscribed
          setTimeout(() => {
            if (isSubscribed) connectToEvents();
          }, 5000);
        }
      }
    };
    
    connectToEvents();
    
    return () => {
      isSubscribed = false;
      controller.abort();
    };
  }, [activeChat?.id, activeChat?.current_doc_id, token]);

  const handleRegenerateSummary = async () => {
    if (!activeChat) return;
    try {
      // Set status to generating locally for immediate UI feedback
      setActiveChat(prev => ({ ...prev, summary_status: 'generating' }));
      setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, summary_status: 'generating' } : c));

      await apiClient.post(`/chats/${activeChat.id}/regenerate-summary`);
      toast?.success?.('Summary regeneration triggered.');
    } catch (err) {
      console.error('Error regenerating summary:', err);
      toast?.error?.(err.response?.data?.detail?.error?.message || 'Failed to regenerate summary');
      fetchChats();
    }
  };

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
    if (window.innerWidth < 640) {
      setSidebarOpen(false);
    }
    setRenamingChatId(null);
    setMessages([]);
    setCitations([]);
    setStreamedResponse('');
    setCitationPanel(null);

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
   * Action 1: New Session — opens upload modal instead of blank chat
   */
  const handleCreateChat = () => {
    setShowNewSessionModal(true);
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
      errorMessage: `⚠️ Couldn't delete session "${getChatTitle(targetChat)}". Restored.`,
      targetRef: sidebarSessionListRef,
      toast
    });
  };

  /**
   * Sidebar inline rename
   */
  const startSidebarRename = (chat, e) => {
    e.stopPropagation();
    setRenamingChatId(chat.id);
    setRenamingValue(getChatTitle(chat));
  };

  const handleSidebarRename = async (chat, e) => {
    e?.preventDefault();
    const newName = renamingValue.trim();
    if (!newName || newName.length > 60) { setRenamingChatId(null); return; }

    const previousChats = [...chats];
    const previousActiveChat = activeChat;

    await optimisticUpdate({
      optimisticFn: () => {
        const updatedChat = { ...chat, display_name: newName };
        setChats(chats.map(c => c.id === chat.id ? updatedChat : c));
        if (activeChat?.id === chat.id) setActiveChat(updatedChat);
        setRenamingChatId(null);
      },
      apiCall: async () => {
        const res = await apiClient.patch(`/chats/${chat.id}`, { display_name: newName });
        setChats(prev => prev.map(c => c.id === chat.id ? res.data : c));
        if (activeChat?.id === chat.id) setActiveChat(res.data);
      },
      rollbackFn: () => {
        setChats(previousChats);
        setActiveChat(previousActiveChat);
      },
      errorMessage: `⚠️ Couldn't rename session. Restored.`,
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

  const processFileUpload = async (file) => {
    if (!file) return;

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');

    let targetChat;

    // Auto-create a chat session if none exists or none is selected
    if (!activeChat) {
      try {
        const createRes = await apiClient.post('/chats', { title: file.name || 'New Chat' });
        const newChat = createRes.data;
        setChats(prev => [newChat, ...prev]);
        setActiveChat(newChat);
        selectChat(newChat);
        targetChat = newChat;
      } catch (chatErr) {
        console.error('Failed to auto-create chat session:', chatErr);
        setUploadError(chatErr.response?.data?.detail?.error?.message || 'Could not create a chat session for upload.');
        setIsUploading(false);
        return;
      }
    } else {
      targetChat = activeChat;
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
      
      // Update active chat to reflect linked document — use doc filename as session name
      const updatedChatRes = await apiClient.get(`/chats/${targetChat.id}`);
      const updatedChat = {
        ...updatedChatRes.data,
        display_name: updatedChatRes.data.display_name || res.data.filename || updatedChatRes.data.title
      };
      setChats(prevChats => prevChats.map(c => c.id === targetChat.id ? updatedChat : c));
      setActiveChat(updatedChat);
      
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

  // New session flow: always creates a fresh chat then uploads
  const handleNewSessionUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');

    let newChat;
    try {
      const createRes = await apiClient.post('/chats', { title: file.name || 'New Session' });
      newChat = createRes.data;
      setChats(prev => [newChat, ...prev]);
      setActiveChat(newChat);
      selectChat(newChat);
    } catch (chatErr) {
      setUploadError(chatErr.response?.data?.detail?.error?.message || 'Could not create session.');
      setIsUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', newChat.id);

    try {
      const res = await apiClient.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const updatedChatRes = await apiClient.get(`/chats/${newChat.id}`);
      const updatedChat = {
        ...updatedChatRes.data,
        display_name: updatedChatRes.data.display_name || res.data.filename || updatedChatRes.data.title
      };
      setChats(prev => prev.map(c => c.id === newChat.id ? updatedChat : c));
      setActiveChat(updatedChat);
      setUploadSuccess(`${res.data.filename}`);
      setShowNewSessionModal(false);
      fetchNotifications();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setUploadError(typeof detail === 'string' ? detail : detail?.error?.message || 'Indexing failed.');
    } finally {
      setIsUploading(false);
      if (newSessionFileInputRef.current) newSessionFileInputRef.current.value = '';
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
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className={`workspace-layout ${activeChat ? 'has-active-chat' : ''}`}>
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div 
            className="sidebar-mobile-backdrop md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              top: '60px',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(2px)',
              zIndex: 85,
            }}
          />
        )}

        <aside className={`sidebar-panel ${sidebarOpen ? 'open-mobile' : 'collapsed'}`}>
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
                <div className="sidebar-empty">No sessions yet. Start with "+ New Session" above.</div>
              ) : (
                chats.filter(c => !c.is_workspace_chat).map(chat => (
                  <div
                    key={chat.id}
                    className={`sidebar-session-item ${activeChat?.id === chat.id ? 'active' : ''} ${chat.isOptimistic ? 'is-optimistic' : ''} sidebar-session-item-hoverable`}
                    onClick={() => renamingChatId !== chat.id && selectChat(chat)}
                  >
                    {renamingChatId === chat.id ? (
                      <form
                        onSubmit={(e) => handleSidebarRename(chat, e)}
                        style={{ flex: 1, display: 'flex', gap: '4px', alignItems: 'center' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          className="text-input"
                          value={renamingValue}
                          onChange={e => setRenamingValue(e.target.value)}
                          maxLength={60}
                          style={{ flex: 1, height: '26px', fontSize: '12px', padding: '2px 8px' }}
                          onBlur={() => setRenamingChatId(null)}
                          onKeyDown={e => e.key === 'Escape' && setRenamingChatId(null)}
                        />
                        <button type="submit" className="btn-ghost" style={{ color: 'var(--color-accent-green)', padding: '2px' }} title="Save">✓</button>
                      </form>
                    ) : (
                      <>
                        <MessageSquare className="icon-small" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="session-item-name">{getChatTitle(chat)}</div>
                          {chat.created_at && (
                            <div style={{ fontSize: '10px', color: 'var(--color-body-mid)', marginTop: '1px' }}>
                              {formatRelativeTime(chat.created_at)}
                            </div>
                          )}
                        </div>
                        {chat.isOptimistic ? (
                          <span style={{ fontSize: '10px', opacity: 0.6, fontStyle: 'italic', flexShrink: 0 }}>creating...</span>
                        ) : (
                          <div className="sidebar-item-actions">
                            <button
                              className="btn-ghost"
                              onClick={(e) => startSidebarRename(chat, e)}
                              title="Rename"
                              style={{ padding: '2px', color: 'var(--color-body-mid)' }}
                            >
                              <Pencil className="icon-tiny" />
                            </button>
                            <button
                              className="btn-ghost"
                              onClick={(e) => onRequestDeleteChat(chat, e)}
                              title="Delete"
                              style={{ padding: '2px', color: 'var(--color-body-mid)' }}
                            >
                              <Trash2 className="icon-tiny" />
                            </button>
                          </div>
                        )}
                      </>
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
                  <div className="sidebar-empty">NO WORKSPACES ACTIVE</div>
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
                                  {getChatTitle(ws.workspace_chat)}
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
                                <span className="session-item-name">{getChatTitle(mChat)}</span>
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

        </aside>

        <main className="main-content-area">
          {/* Clean chat header — name only, attach doc in corner */}
          <div className="section-label-bar">
            {activeChat && (
              <button 
                type="button" 
                className="btn-ghost mobile-back-btn md:hidden"
                onClick={() => setActiveChat(null)}
                title="Back to session list"
                aria-label="Back to session list"
                style={{ marginRight: '8px', padding: '4px', color: 'var(--color-ink)', display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft className="icon" />
              </button>
            )}
            <div className="label-title" style={{ overflow: 'hidden' }}>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                fontFamily: 'var(--font-sans)',
                fontWeight: 400,
                fontSize: '14px',
                letterSpacing: 0,
                textTransform: 'none',
                color: 'var(--color-ink)',
              }}>
                {activeChat ? getChatTitle(activeChat) : 'Select or start a session'}
              </span>
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
            <div style={{ padding: '12px 24px', backgroundColor: 'var(--color-canvas-soft)', color: 'var(--color-body)', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', borderBottom: '1px solid var(--color-hairline)' }}>
              <div className="spinner"></div>
              <span>Indexing document — building vector embeddings...</span>
            </div>
          )}

          {uploadError && (
            <div style={{ padding: '12px 24px', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)', borderBottom: '1px solid rgba(239,68,68,0.25)', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle className="icon" />
              <span>Upload failed: {uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div style={{ padding: '12px 24px', backgroundColor: 'rgba(16,185,129,0.08)', color: 'var(--color-accent-green)', borderBottom: '1px solid rgba(16,185,129,0.25)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle className="icon" />
              <span>Document indexed: {uploadSuccess}</span>
            </div>
          )}

          {/* Empty State Hero - shown only if no messages and no document has been uploaded yet */}
          {!activeChat?.current_doc_id && messages.length === 0 && !streamedResponse && (
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

          {/* Chat Feed Area - shown if there are messages or a document has been uploaded */}
          {(messages.length > 0 || streamedResponse || activeChat?.current_doc_id) && (
            <div className="chat-feed">
              {activeChat?.current_doc_id && (
                <DocumentOverview 
                  activeChat={activeChat} 
                  onRegenerate={handleRegenerateSummary}
                />
              )}

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
                      onCitationClick={(cit) => setCitationPanel(cit)} 
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
                    onCitationClick={(cit) => setCitationPanel(cit)} 
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

        {/* ── Citation Sibling Panel (compresses chat feed on desktop) ──────── */}
        <aside
          className={`citation-panel ${citationPanel ? 'open-mobile' : 'collapsed'}`}
          role="complementary"
          aria-label="Citation source panel"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-hairline)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText className="icon-small" style={{ color: 'var(--color-body-mid)' }} />
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-ink)' }}>Source</span>
            </div>
            <button className="btn-ghost" onClick={() => setCitationPanel(null)} aria-label="Close source panel">
              <X className="icon-small" />
            </button>
          </div>

          {citationPanel && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--color-ink)', wordBreak: 'break-word' }}>
                  {citationPanel.doc_filename || citationPanel.document_name || 'Source Document'}
                </p>
                {citationPanel.page_number && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-body-mid)', fontFamily: 'var(--font-mono)' }}>
                    Page {citationPanel.page_number}
                  </p>
                )}
              </div>
              <div style={{
                backgroundColor: 'var(--color-canvas-soft)',
                border: '1px solid var(--color-hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '13px',
                color: 'var(--color-body)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {citationPanel.excerpt || citationPanel.content || 'No excerpt available for this citation.'}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile-only citation backdrop overlay with blur/dim */}
      {citationPanel && (
        <div
          className="citation-mobile-backdrop md:hidden"
          style={{
            position: 'fixed',
            inset: 0,
            top: '60px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 92,
          }}
          onClick={() => setCitationPanel(null)}
          aria-hidden="true"
        />
      )}

      {/* Desktop click-outside overlay */}
      {citationPanel && (
        <div
          className="citation-desktop-backdrop hidden md:block"
          style={{ position: 'fixed', inset: 0, zIndex: 39 }}
          onClick={() => setCitationPanel(null)}
          aria-hidden="true"
        />
      )}

      {/* ── New Session Upload Modal ─────────────────────────────────────── */}
      {showNewSessionModal && (
        <div className="modal-backdrop" onClick={() => !isUploading && setShowNewSessionModal(false)}>
          <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Upload className="icon text-muted" />
                <h3 className="modal-title">New Session</h3>
              </div>
              <button className="modal-close-btn" onClick={() => !isUploading && setShowNewSessionModal(false)}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-body)', lineHeight: 1.5 }}>
                Upload a document to start a new session. The document will be indexed for semantic search and cited answers.
              </p>

              <div
                className="empty-state-upload-zone"
                style={{ padding: '32px 24px', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.6 : 1 }}
                onClick={() => !isUploading && newSessionFileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setNewSessionDragging(true); }}
                onDragLeave={() => setNewSessionDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setNewSessionDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && !isUploading) handleNewSessionUpload(file);
                }}
              >
                {isUploading ? (
                  <>
                    <div className="spinner" style={{ marginBottom: '8px' }} />
                    <div className="upload-zone-text">Indexing document…</div>
                  </>
                ) : (
                  <>
                    <div className="upload-zone-icon">
                      <Upload className="icon-large" />
                    </div>
                    <div className="upload-zone-text">Drag & drop or click to browse</div>
                    <div className="upload-zone-hint">PDF, DOCX, TXT · up to 50 MB</div>
                  </>
                )}
              </div>

              {uploadError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--color-error)' }}>
                  <AlertTriangle className="icon-small" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-lg) var(--space-xl)', borderTop: '1px solid var(--color-hairline)' }}>
              <button className="btn outline-btn" onClick={() => !isUploading && setShowNewSessionModal(false)} disabled={isUploading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <input
        type="file"
        ref={newSessionFileInputRef}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleNewSessionUpload(f); }}
        accept=".pdf,.docx,.txt"
      />

      {/* ── Workspace Modal ──────────────────────────────────────────────── */}
      {(showCreateWorkspaceModal || showEditWorkspaceModal) && (
        <div className="modal-backdrop" onClick={() => { setShowCreateWorkspaceModal(false); setShowEditWorkspaceModal(null); }}>
          <div className="modal-container modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <FolderPlus className="icon" />
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '16px' }}>
                    {showEditWorkspaceModal ? 'Edit Workspace' : 'Create Workspace'}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-body-mid)' }}>
                    Combine up to 4 sessions into a unified knowledge base
                  </span>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => { setShowCreateWorkspaceModal(false); setShowEditWorkspaceModal(null); }}>
                <X className="icon" />
              </button>
            </div>

            <form onSubmit={showEditWorkspaceModal ? handleUpdateWorkspace : handleCreateWorkspace}>
              <div className="modal-body">
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: 'var(--space-xs)' }}>Workspace name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Q3 Financial Audit"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                    required
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                    <label className="form-label">Sessions ({selectedChatIds.length}/4)</label>
                    {selectedChatIds.length >= 4 && <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>Max reached</span>}
                  </div>
                  <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-hairline-translucent)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-canvas-soft)', padding: 'var(--space-xs)' }}>
                    {chats.filter(c => !c.is_workspace_chat).length === 0 ? (
                      <div style={{ padding: 'var(--space-md)', textAlign: 'center', fontSize: '12px', color: 'var(--color-body-mid)' }}>
                        No sessions available yet.
                      </div>
                    ) : (
                      chats.filter(c => !c.is_workspace_chat).map(c => {
                        const isSelected = selectedChatIds.includes(c.id);
                        const isDisabled = !isSelected && selectedChatIds.length >= 4;
                        const toggle = () => {
                          if (isSelected) setSelectedChatIds(prev => prev.filter(id => id !== c.id));
                          else if (!isDisabled) setSelectedChatIds(prev => [...prev, c.id]);
                        };
                        return (
                          <div key={c.id} onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '8px 12px', marginBottom: 'var(--space-xxs)', borderRadius: 'var(--radius-pill)', backgroundColor: isSelected ? 'var(--color-hairline)' : 'transparent', border: `1px solid ${isSelected ? 'var(--color-hairline-translucent)' : 'transparent'}`, cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1, transition: 'all 150ms ease' }}>
                            <input type="checkbox" checked={isSelected} onChange={toggle} disabled={isDisabled} style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', color: isSelected ? 'var(--color-ink)' : 'var(--color-body)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getChatTitle(c)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn outline-btn" onClick={() => { setShowCreateWorkspaceModal(false); setShowEditWorkspaceModal(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!workspaceName.trim() || isSubmittingWorkspace}>
                  <FolderPlus className="icon-small" />
                  <span>{isSubmittingWorkspace ? 'Saving…' : (showEditWorkspaceModal ? 'Update' : 'Create Workspace')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Session Modal ─────────────────────────────────────────── */}
      {deleteTargetChat && (
        <div className="modal-backdrop" onClick={() => setDeleteTargetChat(null)}>
          <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle className="icon text-danger" />
                <h3 className="modal-title">Delete Session</h3>
              </div>
              <button className="btn-icon text-btn" onClick={() => setDeleteTargetChat(null)}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, color: 'var(--color-body)', fontSize: '13px', lineHeight: 1.6 }}>
                Are you sure you want to permanently delete this session?
              </p>
              <div style={{ background: 'var(--color-canvas-soft)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <p style={{ margin: 0, color: 'var(--color-ink)', fontWeight: 500, fontSize: '13px' }}>
                  {getChatTitle(deleteTargetChat)}
                </p>
              </div>
              <p style={{ margin: 0, color: 'var(--color-body-mid)', fontSize: '12px', lineHeight: 1.5 }}>
                All message history will be permanently removed. This cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: 'var(--space-lg) var(--space-xl)', borderTop: '1px solid var(--color-hairline)' }}>
              <button className="btn outline-btn" onClick={() => setDeleteTargetChat(null)}>Cancel</button>
              <button className="btn danger-btn" onClick={confirmDeleteChat} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 className="icon-sm" />
                <span>Delete Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer-bar">
        <div>© 2026 LEXIS CORP • SOC 2 TYPE II • 256-BIT AES</div>
      </footer>
    </div>
  );
};

export default Dashboard;
