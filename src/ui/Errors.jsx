/**
 * GPT-044: Errors/Retrospective Preact component
 * Displays error list with add/update/delete/resolve actions
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export default function Errors() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', severity: 'info', type: 'general' });

  useEffect(() => {
    loadErrors();
  }, []);

  async function loadErrors() {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.ERROR_GET_ALL,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (!response.errorCode) {
        setErrors(response.items || []);
      }
    } catch (error) {
      console.error('Load errors error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddError() {
    const { title, description, severity, type } = formData;
    if (!title) {
      alert('Vui lòng nhập tiêu đề lỗi');
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.ERROR_ADD,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {
          title,
          description,
          severity,
          type,
          timestamp: Date.now(),
        },
      });
      setShowModal(false);
      setFormData({ title: '', description: '', severity: 'info', type: 'general' });
      loadErrors();
    } catch (error) {
      console.error('Add error:', error);
    }
  }

  async function handleDeleteError(id) {
    if (!confirm('Xóa lỗi này?')) return;

    try {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.ERROR_DELETE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { id },
      });
      loadErrors();
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  async function handleClearErrors() {
    if (!confirm('Xóa tất cả lỗi? Không thể khôi phục.')) return;

    try {
      // Delete all errors one by one (or implement batch delete if available)
      for (const error of errors) {
        await chrome.runtime.sendMessage({
          v: 1,
          type: MESSAGE_TYPES.ERROR_DELETE,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          data: { id: error.id },
        });
      }
      loadErrors();
    } catch (error) {
      console.error('Clear errors error:', error);
    }
  }

  const getSeverityColor = (severity) => {
    const colors = {
      critical: '#dc3545',
      high: '#fd7e14',
      warning: '#ffc107',
      info: '#17a2b8',
    };
    return colors[severity] || '#6c757d';
  };

  return (
    <div id="errors" className="page">
      <div className="content">
        <div className="page-header">
          <h2 style={{ margin: 0 }}>Retrospective</h2>
          <div>
            <button className="icon-btn" onClick={handleClearErrors} title="Xóa tất cả lỗi">
              <i className="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <div className="error-list">
          {loading ? (
            <p className="empty-state">
              <i className="fas fa-spinner fa-spin"></i> Loading...
            </p>
          ) : errors.length === 0 ? (
            <p className="empty-state">Chưa có retrospective. Bấm '+ Thêm ghi chú' để tạo.</p>
          ) : (
            errors.map(error => (
              <div
                key={error.id}
                className={`error-item severity-${error.severity}`}
                style={{ borderLeftColor: getSeverityColor(error.severity) }}
              >
                <div className="error-item-header">
                  <div className="error-title">{error.title}</div>
                  <div className="error-actions">
                    <button className="icon-btn" onClick={() => handleDeleteError(error.id)} title="Xóa">
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div className="error-meta">
                  <span className="error-type">{error.type}</span>
                  <span className="error-severity">{error.severity}</span>
                </div>
                {error.description && <div className="error-description">{error.description}</div>}
                <div className="error-timestamp">
                  {new Date(error.timestamp).toLocaleString('vi-VN')}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '16px', textAlign: 'center' }}>
          <button className="primary-btn" onClick={() => setShowModal(true)}>
            + Thêm ghi chú
          </button>
        </div>

        {/* Add Error Modal */}
        {showModal && (
          <div className="modal" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Thêm Retrospective Item</h3>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Tiêu đề lỗi:</label>
                  <input
                    type="text"
                    className="text-input"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Nhập tiêu đề lỗi..."
                  />
                </div>
                <div className="form-group">
                  <label>Mô tả:</label>
                  <textarea
                    className="textarea-input"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Nhập mô tả chi tiết..."
                  />
                </div>
                <div className="form-group">
                  <label>Severity:</label>
                  <select
                    className="select-input"
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Loại:</label>
                  <select
                    className="select-input"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="prompt">Prompt</option>
                    <option value="response">Response</option>
                    <option value="connection">Connection</option>
                    <option value="timeout">Timeout</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="primary-btn" onClick={handleAddError}>Lưu</button>
                <button className="secondary-btn" onClick={() => setShowModal(false)}>Hủy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
