export function setupErrors(dom) {
  const { 
    errorsBtn, errorsPage, errorList, addErrorBtn,
    errorModal, errorModalTitle, closeErrorModal, cancelErrorBtn,
    errorTitleInput, errorDescInput, errorTypeInput, errorSeverityInput,
    saveErrorBtn
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
          <button class="error-action-btn edit-error" title="Sửa">✏️</button>
          <button class="error-action-btn delete-error" title="Xóa">🗑️</button>
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
    if (errorModal) errorModal.classList.remove('hidden');
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
      chrome.runtime.sendMessage({
        action: 'update_error',
        errorId: currentErrorId,
        ...errorData
      }, (response) => {
        if (chrome.runtime.lastError || !response || response.status !== 'ok') {
          alert('Lỗi cập nhật!');
          return;
        }
        closeModal();
        loadErrors();
      });
    } else {
      // Add new error
      chrome.runtime.sendMessage({
        action: 'add_error',
        ...errorData
      }, (response) => {
        if (chrome.runtime.lastError || !response || response.status !== 'ok') {
          alert('Lỗi thêm mới!');
          return;
        }
        closeModal();
        loadErrors();
      });
    }
  }

  function deleteError(errorId) {
    if (!confirm('Bạn có chắc muốn xóa lỗi này?')) return;

    chrome.runtime.sendMessage({
      action: 'delete_error',
      errorId: errorId
    }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== 'ok') {
        alert('Lỗi xóa!');
        return;
      }
      loadErrors();
    });
  }

  function loadErrors() {
    chrome.runtime.sendMessage({ action: 'get_errors' }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== 'ok') {
        if (errorList) {
          errorList.innerHTML = '<p class="empty-state">Lỗi tải danh sách.</p>';
        }
        return;
      }

      const errors = response.errors || [];
      
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
