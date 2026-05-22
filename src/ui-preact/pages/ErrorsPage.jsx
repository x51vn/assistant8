/**
 * ErrorsPage.jsx - Error tracking page
 * Full CRUD operations for error tracking with retrospective analysis
 * 
 * Features:
 * - Add/Edit/Delete errors
 * - Error types: general, prompt, response, connection, timeout
 * - Severity levels: low, medium, high, critical
 * - Retrospective analysis (placeholder for future)
 * - Clear all errors
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';

// Type and severity labels
const TYPE_LABELS = {
  general: 'Chung',
  prompt: 'Prompt',
  response: 'Response',
  connection: 'Kết nối',
  timeout: 'Timeout'
};

const SEVERITY_LABELS = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng'
};

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
 * ErrorItem component - Display a single error
 */
function ErrorItem({ error, onEdit, onDelete }) {
  return (
    <div class={`error-item severity-${error.severity || 'medium'}`}>
      <div class="error-item-header">
        <div class="error-title">{error.title || 'Lỗi không xác định'}</div>
        <div class="error-actions">
          <button 
            class="error-action-btn edit-error" 
            title="Sửa"
            onClick={() => onEdit(error)}
          >
            <i class="fas fa-edit"></i>
          </button>
          <button 
            class="error-action-btn delete-error" 
            title="Xóa"
            onClick={() => onDelete(error.id)}
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="error-meta">
        <span class="error-type">{TYPE_LABELS[error.type] || 'Chung'}</span>
        <span class="error-severity">{SEVERITY_LABELS[error.severity] || 'Trung bình'}</span>
      </div>
      {error.description && (
        <div class="error-description">{error.description}</div>
      )}
      <div class="error-timestamp">{formatDate(error.timestamp)}</div>
    </div>
  );
}

/**
 * ErrorModal component - Add/Edit error modal
 */
function ErrorModal({ isOpen, error, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('general');
  const [severity, setSeverity] = useState('medium');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(error?.title || '');
      setDescription(error?.description || '');
      setType(error?.type || 'general');
      setSeverity(error?.severity || 'medium');
    }
  }, [isOpen, error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề lỗi');
      return;
    }
    
    onSave({
      id: error?.id,
      title: title.trim(),
      description: description.trim(),
      type,
      severity
    });
  };

  if (!isOpen) return null;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal error-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{error ? 'Sửa Lỗi' : 'Thêm Lỗi'}</h3>
          <button class="modal-close" onClick={onClose}>
            <i class="fas fa-times"></i>
          </button>
        </div>
        <form class="modal-body" onSubmit={handleSubmit}>
          <div class="form-group">
            <label for="error-title">Tiêu đề *</label>
            <input
              id="error-title"
              type="text"
              class="input-field"
              placeholder="Nhập tiêu đề lỗi..."
              value={title}
              onInput={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div class="form-group">
            <label for="error-description">Mô tả</label>
            <textarea
              id="error-description"
              class="input-field"
              placeholder="Mô tả chi tiết lỗi..."
              rows="3"
              value={description}
              onInput={(e) => setDescription(e.target.value)}
            />
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="error-type">Loại lỗi</label>
              <select
                id="error-type"
                class="input-field"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            
            <div class="form-group">
              <label for="error-severity">Mức độ</label>
              <select
                id="error-severity"
                class="input-field"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {Object.entries(SEVERITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div class="modal-footer">
            <button type="button" class="secondary-btn" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" class="primary-btn">
              <i class="fas fa-save"></i> Lưu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * ErrorsPage component
 */
export function ErrorsPage() {
  const [errors, setErrors] = useState([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingError, setEditingError] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Load errors on mount
  useEffect(() => {
    loadErrors();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadErrors = async () => {
    setGlobalLoading(true, 'Đang tải danh sách lỗi...');
    
    const message = {
      v: 1,
      type: MESSAGE_TYPES.ERROR_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {}
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      hideLoading();
      
      if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_LIST) {
        showToast('Lỗi tải danh sách', 'error');
        return;
      }
      
      const errorList = response.payload?.errors || [];
      // Sort by timestamp descending
      errorList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setErrors(errorList);
    });
  };

  const handleAdd = () => {
    setEditingError(null);
    setModalOpen(true);
  };

  const handleEdit = (error) => {
    setEditingError(error);
    setModalOpen(true);
  };

  const handleSave = (errorData) => {
    if (errorData.id) {
      // Update existing error
      const message = {
        v: 1,
        type: MESSAGE_TYPES.ERROR_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          errorId: errorData.id,
          title: errorData.title,
          description: errorData.description,
          type: errorData.type,
          severity: errorData.severity
        }
      };
      
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_UPDATED) {
          showToast('Lỗi cập nhật!', 'error');
          return;
        }
        setModalOpen(false);
        showToast('Đã cập nhật lỗi');
        loadErrors();
      });
    } else {
      // Add new error
      const message = {
        v: 1,
        type: MESSAGE_TYPES.ERROR_ADD,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          title: errorData.title,
          description: errorData.description,
          type: errorData.type,
          severity: errorData.severity
        }
      };
      
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_ADDED) {
          showToast('Lỗi thêm mới!', 'error');
          return;
        }
        setModalOpen(false);
        showToast('Đã thêm lỗi mới');
        loadErrors();
      });
    }
  };

  const handleDelete = (errorId) => {
    setConfirmDelete(errorId);
  };

  const confirmDeleteError = () => {
    const errorId = confirmDelete;
    setConfirmDelete(null);
    
    const message = {
      v: 1,
      type: MESSAGE_TYPES.ERROR_DELETE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: { errorId }
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_DELETED) {
        showToast('Lỗi xóa!', 'error');
        return;
      }
      showToast('Đã xóa lỗi');
      loadErrors();
    });
  };

  const handleClearAll = () => {
    setConfirmClearAll(true);
  };

  const confirmClearAllErrors = () => {
    setConfirmClearAll(false);
    
    const message = {
      v: 1,
      type: MESSAGE_TYPES.ERROR_CLEAR_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {}
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_ALL_CLEARED) {
        showToast('Lỗi khi xóa danh sách!', 'error');
        return;
      }
      showToast('Đã xóa tất cả lỗi');
      loadErrors();
    });
  };

  return (
    <div class="page-container errors-page">
      {/* Header */}
      <div class="page-header">
        <h2>
          <i class="fas fa-exclamation-triangle"></i> Error Tracking
        </h2>
        <div class="header-actions">
          <button
            class="btn-icon btn-refresh"
            title="Làm mới"
            onClick={loadErrors}
          >
            <i class="fas fa-sync-alt"></i>
          </button>
          <button
            class="btn-icon btn-add"
            title="Thêm lỗi"
            onClick={handleAdd}
          >
            <i class="fas fa-plus"></i>
          </button>
          {errors.length > 0 && (
            <button
              class="btn-icon btn-delete"
              title="Xóa tất cả"
              onClick={handleClearAll}
            >
              <i class="fas fa-trash"></i>
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div class={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Empty State */}
      {errors.length === 0 && (
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3>Chưa có lỗi</h3>
          <p>Các lỗi được ghi nhận sẽ hiển thị ở đây</p>
        </div>
      )}

      {/* Error List */}
      {errors.length > 0 && (
        <div class="error-list">
          {errors.map(error => (
            <ErrorItem
              key={error.id}
              error={error}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <ErrorModal
        isOpen={isModalOpen}
        error={editingError}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />

      {/* Confirm Clear All Dialog */}
      {confirmClearAll && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmClearAll(false)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xóa tất cả lỗi?</h3>
            <p>Hành động này không thể được hoàn tác. Bạn có chắc chắn?</p>
            <div class="confirm-buttons">
              <button class="btn-cancel" onClick={() => setConfirmClearAll(false)}>
                Hủy
              </button>
              <button class="btn-confirm-delete" onClick={confirmClearAllErrors}>
                Xóa tất cả
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xóa lỗi?</h3>
            <p>Bạn có chắc chắn muốn xóa lỗi này?</p>
            <div class="confirm-buttons">
              <button class="btn-cancel" onClick={() => setConfirmDelete(null)}>
                Hủy
              </button>
              <button class="btn-confirm-delete" onClick={confirmDeleteError}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
