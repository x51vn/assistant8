/**
 * JiraPage.jsx - Jira Tickets management page
 * Read/write Jira issues with full CRUD operations
 * 
 * Features:
 * - List issues by project or JQL
 * - Create new issues
 * - Edit/Update issues
 * - Delete issues
 * - Project selector
 * - Status badges with colors
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  getJiraProjects,
  getJiraIssues,
  createJiraIssue,
  updateJiraIssue,
  deleteJiraIssue
} from '../api/atlassianApi.js';

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Status badge color mapping
 */
function getStatusColor(statusCategory) {
  switch (statusCategory) {
    case 'new': return '#4a9eff';
    case 'indeterminate': return '#f7a928';
    case 'done': return '#36b37e';
    default: return '#6b778c';
  }
}

/**
 * Issue type icons
 */
function getIssueIcon(issueType) {
  switch (issueType?.toLowerCase()) {
    case 'bug': return 'fas fa-bug';
    case 'story': return 'fas fa-bookmark';
    case 'epic': return 'fas fa-bolt';
    case 'sub-task': return 'fas fa-tasks';
    default: return 'fas fa-check-square';
  }
}

/**
 * Priority icons
 */
function getPriorityIcon(priority) {
  switch (priority?.toLowerCase()) {
    case 'highest': return { icon: 'fas fa-angle-double-up', color: '#d32f2f' };
    case 'high': return { icon: 'fas fa-angle-up', color: '#e65100' };
    case 'medium': return { icon: 'fas fa-equals', color: '#f9a825' };
    case 'low': return { icon: 'fas fa-angle-down', color: '#2196f3' };
    case 'lowest': return { icon: 'fas fa-angle-double-down', color: '#4caf50' };
    default: return { icon: 'fas fa-minus', color: '#9e9e9e' };
  }
}

/**
 * JiraIssueItem - Display a single Jira issue
 */
function JiraIssueItem({ issue, onEdit, onDelete }) {
  const priorityInfo = getPriorityIcon(issue.priority);
  const [expanded, setExpanded] = useState(false);

  return (
    <div class="jira-issue-item" onClick={() => setExpanded(!expanded)}>
      <div class="jira-issue-header">
        <div class="jira-issue-key">
          <i class={getIssueIcon(issue.issueType)} title={issue.issueType}></i>
          <span class="issue-key-text">{issue.key}</span>
        </div>
        <div class="jira-issue-actions">
          <button
            class="btn-icon"
            title="Sửa"
            onClick={(e) => { e.stopPropagation(); onEdit(issue); }}
          >
            <i class="fas fa-edit"></i>
          </button>
          <button
            class="btn-icon btn-delete"
            title="Xóa"
            onClick={(e) => { e.stopPropagation(); onDelete(issue.key); }}
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="jira-issue-summary">{issue.summary}</div>
      <div class="jira-issue-meta">
        <span
          class="jira-status-badge"
          style={{ backgroundColor: getStatusColor(issue.statusCategory) }}
        >
          {issue.status}
        </span>
        <span class="jira-priority" title={issue.priority}>
          <i class={priorityInfo.icon} style={{ color: priorityInfo.color }}></i>
        </span>
        {issue.assignee && (
          <span class="jira-assignee" title="Assignee">
            <i class="fas fa-user"></i> {issue.assignee}
          </span>
        )}
        <span class="jira-updated" title="Updated">
          {formatDate(issue.updated)}
        </span>
      </div>
      {expanded && issue.description && (
        <div class="jira-issue-description">
          <p>{issue.description}</p>
        </div>
      )}
    </div>
  );
}

/**
 * JiraIssueModal - Create/Edit issue modal
 */
function JiraIssueModal({ isOpen, issue, projects, onSave, onClose }) {
  const [projectKey, setProjectKey] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState('Task');
  const [priority, setPriority] = useState('Medium');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (issue) {
        // Edit mode - issue key is not editable
        setProjectKey(issue.key?.split('-')[0] || '');
        setSummary(issue.summary || '');
        setDescription(issue.description || '');
        setIssueType(issue.issueType || 'Task');
        setPriority(issue.priority || 'Medium');
        setAssignee(issue.assignee || '');
      } else {
        // Create mode
        setProjectKey(projects?.[0]?.key || '');
        setSummary('');
        setDescription('');
        setIssueType('Task');
        setPriority('Medium');
        setAssignee('');
      }
    }
  }, [isOpen, issue]);

  const handleSave = async () => {
    if (!summary.trim()) return;
    setSaving(true);
    try {
      await onSave({
        issueKey: issue?.key,
        projectKey,
        summary: summary.trim(),
        description: description.trim(),
        issueType,
        priority,
        assignee: assignee.trim() || undefined
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-content jira-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{issue ? `Sửa ${issue.key}` : 'Tạo Issue mới'}</h3>
          <button class="btn-icon" onClick={onClose}>
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          {!issue && (
            <div class="input-group">
              <label>Project <span class="required">*</span></label>
              <select
                class="input-field"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
              >
                {projects.map(p => (
                  <option key={p.key} value={p.key}>{p.key} - {p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div class="input-group">
            <label>Summary <span class="required">*</span></label>
            <input
              type="text"
              class="input-field"
              value={summary}
              onInput={(e) => setSummary(e.target.value)}
              placeholder="Mô tả ngắn gọn issue"
            />
          </div>
          <div class="input-group">
            <label>Description</label>
            <textarea
              class="input-field textarea-field"
              value={description}
              onInput={(e) => setDescription(e.target.value)}
              placeholder="Chi tiết issue"
              rows={4}
            />
          </div>
          <div class="input-group-row">
            <div class="input-group">
              <label>Type</label>
              <select
                class="input-field"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
              >
                <option value="Task">Task</option>
                <option value="Bug">Bug</option>
                <option value="Story">Story</option>
                <option value="Epic">Epic</option>
                <option value="Sub-task">Sub-task</option>
              </select>
            </div>
            <div class="input-group">
              <label>Priority</label>
              <select
                class="input-field"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="Highest">Highest</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Lowest">Lowest</option>
              </select>
            </div>
          </div>
          <div class="input-group">
            <label>Assignee (username)</label>
            <input
              type="text"
              class="input-field"
              value={assignee}
              onInput={(e) => setAssignee(e.target.value)}
              placeholder="Username hoặc để trống"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="secondary-btn" onClick={onClose}>Hủy</button>
          <button
            class="primary-btn"
            onClick={handleSave}
            disabled={saving || !summary.trim()}
          >
            {saving ? (
              <><i class="fas fa-spinner fa-spin"></i> Đang lưu...</>
            ) : (
              <><i class="fas fa-save"></i> {issue ? 'Cập nhật' : 'Tạo mới'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * JiraPage - Main Jira tickets page
 */
export function JiraPage() {
  const [issues, setIssues] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [jqlQuery, setJqlQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [total, setTotal] = useState(0);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load issues when project changes
  useEffect(() => {
    if (selectedProject) {
      loadIssues();
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getJiraProjects();
      if (result.error) {
        setError(result.error.message || 'Không thể tải projects. Kiểm tra cấu hình Atlassian trong Settings.');
        return;
      }
      setProjects(result.projects || []);
      if (result.projects?.length > 0) {
        setSelectedProject(result.projects[0].key);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const options = jqlQuery
        ? { jql: jqlQuery }
        : { projectKey: selectedProject };
      
      const result = await getJiraIssues(options);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setIssues(result.issues || []);
      setTotal(result.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadIssues();
  };

  const handleCreateIssue = () => {
    setEditingIssue(null);
    setShowModal(true);
  };

  const handleEditIssue = (issue) => {
    setEditingIssue(issue);
    setShowModal(true);
  };

  const handleSaveIssue = async (data) => {
    try {
      if (data.issueKey) {
        // Update
        const result = await updateJiraIssue(data);
        if (result.error) {
          showToast(`Lỗi: ${result.error.message}`, 'error');
          return;
        }
        showToast(`Đã cập nhật ${data.issueKey}`, 'success');
      } else {
        // Create  
        const result = await createJiraIssue(data);
        if (result.error) {
          showToast(`Lỗi: ${result.error.message}`, 'error');
          return;
        }
        showToast(`Đã tạo ${result.issue?.key || 'issue mới'}`, 'success');
      }
      await loadIssues();
    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  };

  const handleDeleteIssue = async (issueKey) => {
    setConfirmDelete(issueKey);
  };

  const confirmDeleteIssue = async () => {
    if (!confirmDelete) return;
    try {
      const result = await deleteJiraIssue(confirmDelete);
      if (result.error) {
        showToast(`Lỗi: ${result.error.message}`, 'error');
      } else {
        showToast(`Đã xóa ${confirmDelete}`, 'success');
        await loadIssues();
      }
    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div class="page-container jira-page">
      {/* Header */}
      <div class="page-header">
        <h2>
          <i class="fab fa-jira"></i> Jira Tickets
        </h2>
        <button class="primary-btn" onClick={handleCreateIssue}>
          <i class="fas fa-plus"></i> Tạo Issue
        </button>
      </div>

      {/* Filters */}
      <div class="jira-filters">
        <div class="filter-row">
          <div class="input-group">
            <label>Project</label>
            <select
              class="input-field"
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setJqlQuery('');
              }}
            >
              <option value="">-- Chọn project --</option>
              {projects.map(p => (
                <option key={p.key} value={p.key}>{p.key} - {p.name}</option>
              ))}
            </select>
          </div>
          <div class="input-group jql-input">
            <label>JQL Query (tùy chọn)</label>
            <input
              type="text"
              class="input-field"
              value={jqlQuery}
              onInput={(e) => setJqlQuery(e.target.value)}
              placeholder='VD: assignee = currentUser() AND status != "Done"'
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            class="secondary-btn search-btn"
            onClick={handleSearch}
            disabled={loading}
          >
            <i class={loading ? 'fas fa-spinner fa-spin' : 'fas fa-search'}></i> Tìm
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div class="error-banner">
          <i class="fas fa-exclamation-triangle"></i> {error}
        </div>
      )}

      {/* Issues List */}
      <div class="jira-issues-list">
        {loading && issues.length === 0 ? (
          <div class="empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải...</p>
          </div>
        ) : issues.length === 0 ? (
          <div class="empty-state">
            <i class="fab fa-jira"></i>
            <p>Không có issues</p>
            <small>
              {selectedProject
                ? 'Chọn project hoặc thay đổi JQL query'
                : 'Cấu hình Atlassian trong Settings để bắt đầu'}
            </small>
          </div>
        ) : (
          <>
            <div class="issues-count">
              Hiển thị {issues.length} / {total} issues
            </div>
            {issues.map(issue => (
              <JiraIssueItem
                key={issue.key}
                issue={issue}
                onEdit={handleEditIssue}
                onDelete={handleDeleteIssue}
              />
            ))}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      <JiraIssueModal
        isOpen={showModal}
        issue={editingIssue}
        projects={projects}
        onSave={handleSaveIssue}
        onClose={() => setShowModal(false)}
      />

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div class="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div class="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Xóa issue?</h3>
            <p>Bạn có chắc chắn muốn xóa <strong>{confirmDelete}</strong>?</p>
            <div class="modal-footer">
              <button class="secondary-btn" onClick={() => setConfirmDelete(null)}>Hủy</button>
              <button class="btn-danger" onClick={confirmDeleteIssue}>
                <i class="fas fa-trash"></i> Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div class={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
