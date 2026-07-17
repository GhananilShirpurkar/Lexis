import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationBar from '../components/NavigationBar';
import apiClient from '../api/client';
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  Download,
  Pencil,
  Trash2,
  Eye,
  FileText,
  FileSpreadsheet,
  FileCode,
  Calendar,
  Upload,
  X,
  Check,
  Loader2,
  AlertTriangle,
  MessageSquare,
  ChevronRight
} from '../components/icons';

const LibraryPage = () => {
  const navigate = useNavigate();

  // State
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Modals / Drawers
  const [previewDoc, setPreviewDoc] = useState(null);
  const [renameDoc, setRenameDoc] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const [deleteDoc, setDeleteDoc] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/documents');
      setDocuments(res.data || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError(err.response?.data?.detail?.error?.message || 'Failed to load document library.');
    } finally {
      setLoading(false);
    }
  };

  // Helper: File Icon Resolver
  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return <FileText className="file-icon pdf" />;
    if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) return <FileText className="file-icon text" />;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="file-icon sheet" />;
    if (['json', 'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'cpp', 'c', 'rs', 'go'].includes(ext)) return <FileCode className="file-icon code" />;
    return <FileText className="file-icon generic" />;
  };

  // Helper: Format Bytes
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper: Format Relative Date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Date Group Categorizer
  const getDateGroup = (dateStr) => {
    if (!dateStr) return 'Older';
    const date = new Date(dateStr);
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(startOfMonth.getDate() - 30);

    if (date >= startOfToday) return 'Today';
    if (date >= startOfYesterday) return 'Yesterday';
    if (date >= startOfWeek) return 'Earlier this week';
    if (date >= startOfMonth) return 'Earlier this month';
    return 'Older';
  };

  // Filter & Sort Documents
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (doc) =>
          doc.filename.toLowerCase().includes(q) ||
          (doc.summary && doc.summary.toLowerCase().includes(q))
      );
    }

    // Type Filter
    if (typeFilter !== 'all') {
      result = result.filter((doc) => {
        const ext = doc.filename.split('.').pop().toLowerCase();
        if (typeFilter === 'pdf') return ext === 'pdf';
        if (typeFilter === 'text') return ['txt', 'md', 'rtf'].includes(ext);
        if (typeFilter === 'doc') return ['doc', 'docx'].includes(ext);
        if (typeFilter === 'sheet') return ['csv', 'xls', 'xlsx'].includes(ext);
        if (typeFilter === 'code') return ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css', 'rs', 'go'].includes(ext);
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.uploaded_at) - new Date(a.uploaded_at);
      if (sortBy === 'date_asc') return new Date(a.uploaded_at) - new Date(b.uploaded_at);
      if (sortBy === 'name_asc') return a.filename.localeCompare(b.filename);
      if (sortBy === 'name_desc') return b.filename.localeCompare(a.filename);
      if (sortBy === 'size_desc') return b.size_bytes - a.size_bytes;
      if (sortBy === 'size_asc') return a.size_bytes - b.size_bytes;
      return 0;
    });

    return result;
  }, [documents, searchQuery, typeFilter, sortBy]);

  // Grouped Documents by Date
  const groupedDocuments = useMemo(() => {
    const groups = {
      Today: [],
      Yesterday: [],
      'Earlier this week': [],
      'Earlier this month': [],
      Older: []
    };

    filteredDocuments.forEach((doc) => {
      const groupKey = getDateGroup(doc.uploaded_at);
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(doc);
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredDocuments]);

  // Download Handler
  const handleDownload = (doc, e) => {
    if (e) e.stopPropagation();
    const downloadUrl = `/api/documents/${doc.id}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', doc.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Rename Modal
  const openRenameModal = (doc, e) => {
    if (e) e.stopPropagation();
    setRenameDoc(doc);
    setRenameValue(doc.filename);
  };

  // Submit Rename
  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!renameValue.trim() || !renameDoc) return;
    setRenameLoading(true);
    try {
      const res = await apiClient.patch(`/documents/${renameDoc.id}`, {
        filename: renameValue.trim()
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === renameDoc.id ? res.data : d))
      );
      if (previewDoc?.id === renameDoc.id) {
        setPreviewDoc(res.data);
      }
      setRenameDoc(null);
    } catch (err) {
      console.error('Rename failed:', err);
      alert(err.response?.data?.detail?.error?.message || 'Failed to rename document.');
    } finally {
      setRenameLoading(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (doc, e) => {
    if (e) e.stopPropagation();
    setDeleteDoc(doc);
  };

  // Confirm Delete
  const handleDeleteConfirm = async () => {
    if (!deleteDoc) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/documents/${deleteDoc.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== deleteDoc.id));
      if (previewDoc?.id === deleteDoc.id) {
        setPreviewDoc(null);
      }
      setDeleteDoc(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert(err.response?.data?.detail?.error?.message || 'Failed to delete document.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Query in Dashboard
  const handleQueryWithLexis = (doc, e) => {
    if (e) e.stopPropagation();
    // Navigate to dashboard root
    navigate('/', { state: { selectDocId: doc.id } });
  };

  return (
    <div className="app-layout">
      <NavigationBar />

      <main className="main-content library-page-container">
        {/* Header Title Section */}
        <div className="library-header">
          <div className="library-header-left">
            <h1 className="library-title">Document Library</h1>
            <p className="library-subtitle">
              Manage, search, preview, and organize all documents indexed for Lexis RAG reasoning.
            </p>
          </div>

          <div className="library-header-right">
            <button
              className="btn primary-btn btn-glow upload-cta-btn"
              onClick={() => setUploadModalOpen(true)}
            >
              <Upload className="icon" />
              <span>Upload Document</span>
            </button>
          </div>
        </div>

        {/* Toolbar: Search, Filters, View Modes */}
        <div className="library-toolbar-card glass-panel">
          <div className="toolbar-search-group">
            <Search className="icon search-icon" />
            <input
              type="text"
              className="toolbar-search-input"
              placeholder="Search documents by name or summary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="btn-icon text-btn search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                <X className="icon-sm" />
              </button>
            )}
          </div>

          <div className="toolbar-controls">
            {/* Type Filter */}
            <div className="select-wrapper">
              <Filter className="icon select-icon" />
              <select
                className="toolbar-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All File Types</option>
                <option value="pdf">PDF Documents (.pdf)</option>
                <option value="text">Text & Markdown (.txt, .md)</option>
                <option value="doc">Word Documents (.docx)</option>
                <option value="sheet">Spreadsheets (.csv, .xlsx)</option>
                <option value="code">Source Code (.py, .js, .ts)</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="select-wrapper">
              <select
                className="toolbar-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="name_asc">Name (A - Z)</option>
                <option value="name_desc">Name (Z - A)</option>
                <option value="size_desc">Size (Largest)</option>
                <option value="size_asc">Size (Smallest)</option>
              </select>
            </div>

            {/* View Toggle */}
            <div className="view-mode-toggle-group">
              <button
                className={`btn-icon view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <LayoutGrid className="icon" />
              </button>
              <button
                className={`btn-icon view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <List className="icon" />
              </button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="library-error-banner glass-panel">
            <AlertTriangle className="icon error-icon" />
            <span>{error}</span>
            <button className="btn outline-btn btn-sm" onClick={fetchDocuments}>
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading ? (
          <div className={`doc-layout-${viewMode}`}>
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className="doc-card-skeleton glass-panel animate-pulse">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-meta" />
                <div className="skeleton-line skeleton-text" />
              </div>
            ))}
          </div>
        ) : filteredDocuments.length === 0 ? (
          /* Empty State */
          <div className="library-empty-state glass-panel">
            <div className="empty-icon-ring">
              {searchQuery || typeFilter !== 'all' ? (
                <Search className="icon-lg text-muted" />
              ) : (
                <Upload className="icon-lg text-accent" />
              )}
            </div>
            <h3 className="empty-title">
              {searchQuery || typeFilter !== 'all'
                ? 'No matching documents found'
                : 'No documents uploaded yet'}
            </h3>
            <p className="empty-desc">
              {searchQuery || typeFilter !== 'all'
                ? 'Try adjusting your search keywords or resetting file filters.'
                : 'Upload your first document on the Query Dashboard to start searching and reasoning with Lexis.'}
            </p>
            {searchQuery || typeFilter !== 'all' ? (
              <button
                className="btn outline-btn"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('all');
                }}
              >
                Clear Search & Filters
              </button>
            ) : (
              <button
                className="btn primary-btn btn-glow"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload className="icon" />
                <span>Upload First Document</span>
              </button>
            )}
          </div>
        ) : (
          /* Grouped Document Feed */
          <div className="library-feed">
            {groupedDocuments.map(([groupName, docs]) => (
              <div key={groupName} className="date-group-section">
                <div className="date-group-header">
                  <Calendar className="icon group-icon" />
                  <h2 className="date-group-title">{groupName}</h2>
                  <span className="date-group-badge">{docs.length}</span>
                </div>

                <div className={`doc-layout-${viewMode}`}>
                  {docs.map((doc) =>
                    viewMode === 'grid' ? (
                      /* Card Grid Item */
                      <div
                        key={doc.id}
                        className="doc-card glass-panel"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <div className="doc-card-top">
                          <div className="doc-type-badge-container">
                            {getFileIcon(doc.filename)}
                          </div>
                          <div className="doc-card-actions">
                            <button
                              className="doc-action-btn"
                              title="Download"
                              onClick={(e) => handleDownload(doc, e)}
                            >
                              <Download className="icon-sm" />
                            </button>
                            <button
                              className="doc-action-btn"
                              title="Rename"
                              onClick={(e) => openRenameModal(doc, e)}
                            >
                              <Pencil className="icon-sm" />
                            </button>
                            <button
                              className="doc-action-btn delete"
                              title="Delete"
                              onClick={(e) => openDeleteModal(doc, e)}
                            >
                              <Trash2 className="icon-sm" />
                            </button>
                          </div>
                        </div>

                        <div className="doc-card-body">
                          <h3 className="doc-filename" title={doc.filename}>
                            {doc.filename}
                          </h3>
                          <div className="doc-meta-row">
                            <span className="doc-size">{formatBytes(doc.size_bytes)}</span>
                            <span className="meta-dot">•</span>
                            <span className="doc-date">{formatDate(doc.uploaded_at)}</span>
                          </div>

                          <p className="doc-summary-preview">
                            {doc.summary ? doc.summary : 'No summary generated yet.'}
                          </p>
                        </div>

                        <div className="doc-card-footer">
                          <span className={`doc-status-pill status-${doc.status || 'completed'}`}>
                            <Check className="icon-xs" />
                            <span>Ready</span>
                          </span>

                          <button
                            className="btn-text doc-query-link"
                            onClick={(e) => handleQueryWithLexis(doc, e)}
                          >
                            <MessageSquare className="icon-xs" />
                            <span>Query</span>
                            <ChevronRight className="icon-xs" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Table List Row Item */
                      <div
                        key={doc.id}
                        className="doc-list-row glass-panel"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <div className="doc-list-col name-col">
                          {getFileIcon(doc.filename)}
                          <div className="doc-list-name-box">
                            <span className="doc-list-filename" title={doc.filename}>
                              {doc.filename}
                            </span>
                            <span className="doc-list-summary-snippet">
                              {doc.summary || 'Indexed in RAG index'}
                            </span>
                          </div>
                        </div>

                        <div className="doc-list-col size-col">
                          {formatBytes(doc.size_bytes)}
                        </div>

                        <div className="doc-list-col date-col">
                          {formatDate(doc.uploaded_at)}
                        </div>

                        <div className="doc-list-col status-col">
                          <span className={`doc-status-pill status-${doc.status || 'completed'}`}>
                            Ready
                          </span>
                        </div>

                        <div className="doc-list-col actions-col">
                          <button
                            className="doc-action-btn"
                            title="Preview Details"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewDoc(doc);
                            }}
                          >
                            <Eye className="icon-sm" />
                          </button>
                          <button
                            className="doc-action-btn"
                            title="Download"
                            onClick={(e) => handleDownload(doc, e)}
                          >
                            <Download className="icon-sm" />
                          </button>
                          <button
                            className="doc-action-btn"
                            title="Rename"
                            onClick={(e) => openRenameModal(doc, e)}
                          >
                            <Pencil className="icon-sm" />
                          </button>
                          <button
                            className="doc-action-btn delete"
                            title="Delete"
                            onClick={(e) => openDeleteModal(doc, e)}
                          >
                            <Trash2 className="icon-sm" />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Preview Modal / Drawer */}
      {previewDoc && (
        <div className="modal-backdrop" onClick={() => setPreviewDoc(null)}>
          <div className="modal-content glass-panel preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                {getFileIcon(previewDoc.filename)}
                <div>
                  <h3 className="modal-title">{previewDoc.filename}</h3>
                  <span className="modal-subtitle">Document Metadata & Analysis</span>
                </div>
              </div>
              <button className="btn-icon text-btn" onClick={() => setPreviewDoc(null)}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body">
              <div className="preview-meta-grid">
                <div className="preview-meta-item">
                  <span className="meta-label">File Size</span>
                  <span className="meta-val">{formatBytes(previewDoc.size_bytes)}</span>
                </div>
                <div className="preview-meta-item">
                  <span className="meta-label">Upload Time</span>
                  <span className="meta-val">{formatDate(previewDoc.uploaded_at)}</span>
                </div>
                <div className="preview-meta-item">
                  <span className="meta-label">RAG Status</span>
                  <span className="meta-val highlight-green">Vector Indexed</span>
                </div>
                <div className="preview-meta-item">
                  <span className="meta-label">Retention Expiry</span>
                  <span className="meta-val">{formatDate(previewDoc.expiry_at)}</span>
                </div>
              </div>

              <div className="preview-summary-box">
                <h4 className="summary-box-title">Document Summary</h4>
                <p className="summary-box-text">
                  {previewDoc.summary || 'No summary available.'}
                </p>
              </div>
            </div>

            <div className="modal-footer flex-between">
              <button
                className="btn primary-btn btn-glow"
                onClick={(e) => {
                  setPreviewDoc(null);
                  handleQueryWithLexis(previewDoc, e);
                }}
              >
                <MessageSquare className="icon" />
                <span>Query with Lexis</span>
              </button>

              <div className="modal-footer-actions">
                <button
                  className="btn outline-btn"
                  onClick={(e) => handleDownload(previewDoc, e)}
                >
                  <Download className="icon" />
                  <span>Download</span>
                </button>
                <button
                  className="btn danger-outline-btn"
                  onClick={(e) => {
                    const docToDelete = previewDoc;
                    setPreviewDoc(null);
                    openDeleteModal(docToDelete, e);
                  }}
                >
                  <Trash2 className="icon" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameDoc && (
        <div className="modal-backdrop" onClick={() => setRenameDoc(null)}>
          <div className="modal-content glass-panel modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Rename Document</h3>
              <button className="btn-icon text-btn" onClick={() => setRenameDoc(null)}>
                <X className="icon" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit}>
              <div className="modal-body">
                <label className="input-label">New Filename</label>
                <input
                  type="text"
                  className="modal-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn text-btn"
                  onClick={() => setRenameDoc(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary-btn"
                  disabled={renameLoading || !renameValue.trim()}
                >
                  {renameLoading ? <Loader2 className="icon animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteDoc && (
        <div className="modal-backdrop" onClick={() => setDeleteDoc(null)}>
          <div className="modal-content glass-panel modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group text-danger">
                <AlertTriangle className="icon" />
                <h3 className="modal-title">Delete Document</h3>
              </div>
              <button className="btn-icon text-btn" onClick={() => setDeleteDoc(null)}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body">
              <p className="delete-warning-text">
                Are you sure you want to delete <strong>{deleteDoc.filename}</strong>?
              </p>
              <p className="delete-subtext">
                This will permanently remove the file from cloud storage and remove its vectors from the search index.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn text-btn"
                onClick={() => setDeleteDoc(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger-btn"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader2 className="icon animate-spin" /> : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Guidance CTA Modal */}
      {uploadModalOpen && (
        <div className="modal-backdrop" onClick={() => setUploadModalOpen(false)}>
          <div className="modal-content glass-panel upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <Upload className="icon text-accent" />
                <h3 className="modal-title">Upload Documents</h3>
              </div>
              <button className="btn-icon text-btn" onClick={() => setUploadModalOpen(false)}>
                <X className="icon" />
              </button>
            </div>

            <div className="modal-body text-center py-4">
              <div className="upload-notice-icon-box">
                <MessageSquare className="icon-lg text-accent" />
              </div>
              <h4 className="upload-notice-heading">Upload via the Query Dashboard</h4>
              <p className="upload-notice-desc">
                Documents are uploaded directly in the Query Dashboard so that Lexis can immediately bind them to an active chat session and parse vector citations in real-time.
              </p>
            </div>

            <div className="modal-footer flex-center">
              <button
                className="btn primary-btn btn-glow"
                onClick={() => {
                  setUploadModalOpen(false);
                  navigate('/');
                }}
              >
                <span>Go to Query Dashboard</span>
                <ChevronRight className="icon" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
