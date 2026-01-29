import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
import { showConfirm } from './confirmDialog.js';

export function setupErrors(dom) {
  const { 
    errorsBtn, errorsPage, errorList, addErrorBtn,
    errorModal, errorModalTitle, closeErrorModal, cancelErrorBtn,
    errorTitleInput, errorDescInput, errorTypeInput, errorSeverityInput,
    saveErrorBtn, retrospectiveBtn
  } = dom;

  let currentErrorId = null;

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderErrorItem(error) {
    const div = document.createElement('div');
    div.className = `error-item severity-${error.severity || 'medium'}`;
    div.dataset.errorId = error.id;
    
    const typeLabels = {
      general: 'Chung',
      prompt: 'Prompt',
      response: 'Response',
      connection: 'Kết nối',
      timeout: 'Timeout'
    };

    const severityLabels = {
      low: 'Thấp',
      medium: 'Trung bình',
      high: 'Cao',
      critical: 'Nghiêm trọng'
    };
    
    div.innerHTML = `
      <div class="error-item-header">
        <div class="error-title">${error.title || 'Lỗi không xác định'}</div>
        <div class="error-actions">
          <button class="error-action-btn edit-error" title="Sửa"><i class="fas fa-edit"></i></button>
          <button class="error-action-btn delete-error" title="Xóa"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="error-meta">
        <span class="error-type">${typeLabels[error.type] || 'Chung'}</span>
        <span class="error-severity">${severityLabels[error.severity] || 'Trung bình'}</span>
      </div>
      ${error.description ? `<div class="error-description">${error.description}</div>` : ''}
      <div class="error-timestamp">${formatDate(error.timestamp)}</div>
    `;

    const editBtn = div.querySelector('.edit-error');
    const deleteBtn = div.querySelector('.delete-error');

    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(error);
    });

    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteError(error.id);
    });

    return div;
  }

  function openAddModal() {
    currentErrorId = null;
    if (errorModalTitle) errorModalTitle.textContent = 'Thêm Lỗi';
    if (errorTitleInput) errorTitleInput.value = '';
    if (errorDescInput) errorDescInput.value = '';
    if (errorTypeInput) errorTypeInput.value = 'general';
    if (errorSeverityInput) errorSeverityInput.value = 'medium';
    if (errorModal) errorModal.classList.remove('hidden');
  }

  function openEditModal(error) {
    currentErrorId = error.id;
    if (errorModalTitle) errorModalTitle.textContent = 'Sửa Lỗi';
    if (errorTitleInput) errorTitleInput.value = error.title || '';
    if (errorDescInput) errorDescInput.value = error.description || '';
    if (errorTypeInput) errorTypeInput.value = error.type || 'general';
    if (errorSeverityInput) errorSeverityInput.value = error.severity || 'medium';
    if (errorModal) {
      errorModal.classList.remove('hidden');
      // Remove old listeners from saveBtn to prevent multiple triggers
      const oldSaveBtn = errorModal.querySelector('#saveErrorBtn');
      if (oldSaveBtn) {
        const newSaveBtn = oldSaveBtn.cloneNode(true);
        oldSaveBtn.parentNode.replaceChild(newSaveBtn, oldSaveBtn);
        newSaveBtn.addEventListener('click', saveError);
      }
    }
  }

  function closeModal() {
    if (errorModal) errorModal.classList.add('hidden');
    currentErrorId = null;
  }

  function saveError() {
    const title = errorTitleInput?.value?.trim() || '';
    const description = errorDescInput?.value?.trim() || '';
    const type = errorTypeInput?.value || 'general';
    const severity = errorSeverityInput?.value || 'medium';

    if (!title) {
      alert('Vui lòng nhập tiêu đề lỗi');
      return;
    }

    const errorData = { title, description, type, severity };

    if (currentErrorId) {
      // Update existing error
      const message = {
        v: 1,
        type: MESSAGE_TYPES.ERROR_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          errorId: currentErrorId,
          ...errorData
        }
      };
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_UPDATED) {
          alert('Lỗi cập nhật!');
          return;
        }
        closeModal();
        loadErrors();
      });
    } else {
      // Add new error
      const message = {
        v: 1,
        type: MESSAGE_TYPES.ERROR_ADD,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: errorData
      };
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_ADDED) {
          alert('Lỗi thêm mới!');
          return;
        }
        closeModal();
        loadErrors();
      });
    }
  }

  function deleteError(errorId) {
    showConfirm({
      title: 'Xóa lỗi?',
      message: 'Bạn có chắc chắn muốn xóa lỗi này?',
      confirmText: 'Xóa',
      cancelText: 'Hủy'
    }).then(confirmed => {
      if (!confirmed) return;

      const message = {
        v: 1,
        type: MESSAGE_TYPES.ERROR_DELETE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: { errorId }
      };
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_DELETED) {
          alert('Lỗi xóa!');
          return;
        }
        loadErrors();
      });
    });
  }

  function loadErrors() {
    const message = {
      v: 1,
      type: MESSAGE_TYPES.ERROR_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {}
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_LIST) {
        if (errorList) {
          errorList.innerHTML = '<p class="empty-state">Lỗi tải danh sách.</p>';
        }
        return;
      }

      const errors = response.payload?.errors || [];
      
      if (!errorList) return;

      if (errors.length === 0) {
        errorList.innerHTML = '<p class="empty-state">Chưa có lỗi được ghi nhận.</p>';
        return;
      }

      errorList.innerHTML = '';
      errors.forEach(error => {
        const itemEl = renderErrorItem(error);
        errorList.appendChild(itemEl);
      });
    });
  }

  // Event listeners
  if (addErrorBtn) {
    addErrorBtn.addEventListener('click', openAddModal);
  }

  const clearErrorsBtn = document.getElementById('clearErrorsBtn');
  if (clearErrorsBtn) {
    clearErrorsBtn.addEventListener('click', () => {
      showConfirm({
        title: 'Xóa tất cả lỗi?',
        message: 'Hành động này không thể được hoàn tác. Bạn có chắc chắn?',
        confirmText: 'Xóa',
        cancelText: 'Hủy'
      }).then(confirmed => {
        if (!confirmed) return;
      
        console.log('[Errors] Clearing all errors...');
        const message = {
          v: 1,
          type: MESSAGE_TYPES.ERROR_CLEAR_ALL,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          payload: {}
        };
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError || !response || response.type !== MESSAGE_TYPES.ERROR_ALL_CLEARED) {
            alert('Lỗi khi xóa danh sách!');
            return;
          }
          loadErrors();
        });
      });
    });
  }

  if (retrospectiveBtn) {
    let retrospectivePollInterval = null;

    retrospectiveBtn.addEventListener('click', async () => {
      console.log('[Errors] Retrospective button clicked');
      // If currently polling, stop it
      if (retrospectivePollInterval) {
        console.log('[Errors] Stopping retrospective poll');
        clearInterval(retrospectivePollInterval);
        retrospectivePollInterval = null;
        retrospectiveBtn.disabled = false;
        retrospectiveBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Retrospective';
        alert('Đã dừng phân tích.');
        return;
      }

      if (!confirm('Bắt đầu phân tích retrospective? Điều này sẽ gửi lịch sử và lỗi đến ChatGPT để phân tích.')) return;
      
      retrospectiveBtn.disabled = true;
      retrospectiveBtn.innerHTML = '⏳ Đang phân tích...';
      
      console.log('[Errors] Retrospective feature temporarily disabled - needs migration to v1 schema');
      alert('Chức năng retrospective tạm thời bị vô hiệu hóa');
      retrospectiveBtn.disabled = false;
      retrospectiveBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Retrospective';
    });
  }

  if (closeErrorModal) {
    closeErrorModal.addEventListener('click', closeModal);
  }

  if (cancelErrorBtn) {
    cancelErrorBtn.addEventListener('click', closeModal);
  }

  if (saveErrorBtn) {
    saveErrorBtn.addEventListener('click', saveError);
  }

  // Close modal when clicking outside
  if (errorModal) {
    errorModal.addEventListener('click', (e) => {
      if (e.target === errorModal) {
        closeModal();
      }
    });
  }

  // Load errors when switching to errors page
  if (errorsBtn) {
    errorsBtn.addEventListener('click', () => {
      loadErrors();
    });
  }

  return { loadErrors, openAddModal };
}
