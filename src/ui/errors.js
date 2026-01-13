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

  const clearErrorsBtn = document.getElementById('clearErrorsBtn');
  if (clearErrorsBtn) {
    clearErrorsBtn.addEventListener('click', () => {
      if (!confirm('Bạn có chắc muốn xóa toàn bộ danh sách lỗi?')) return;
      
      console.log('[Errors] Clearing all errors...');
      chrome.runtime.sendMessage({ action: 'clear_errors' }, (response) => {
        console.log('[Errors] Clear response:', response);
        if (chrome.runtime.lastError || !response || response.status !== 'ok') {
          alert('Lỗi khi xóa danh sách!');
          return;
        }
        loadErrors();
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
      
      retrospectiveBtn.disabled = false; // Keep enabled to allow stopping
      retrospectiveBtn.innerHTML = '⏳ Đang phân tích...';
      
      console.log('[Errors] Sending run_retrospective message...');
      chrome.runtime.sendMessage({ action: 'run_retrospective' }, (response) => {
        console.log('[Errors] run_retrospective response:', response);
        if (chrome.runtime.lastError || !response || response.status !== 'ok') {
          alert('Lỗi khi chạy retrospective!');
          retrospectiveBtn.disabled = false;
          retrospectiveBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Retrospective';
          return;
        }
        
        const runId = response.runId;
        console.log('[Errors] Starting retrospective poll for runId:', runId);
        
        // Poll for result (no timeout - wait indefinitely)
        let pollCount = 0;
        
        retrospectivePollInterval = setInterval(() => {
          pollCount++;
          const minutes = Math.floor(pollCount * 3 / 60);
          const seconds = (pollCount * 3) % 60;
          const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
          retrospectiveBtn.textContent = `⏳ ${timeStr} (Click để dừng)`;
          
          console.log('[Errors] Retrospective poll attempt', pollCount);
          chrome.runtime.sendMessage({ action: 'get_result' }, (pollResponse) => {
            console.log('[Errors] Poll response:', { hasResult: !!pollResponse?.result, source: pollResponse?.source });
            if (chrome.runtime.lastError) {
              clearInterval(retrospectivePollInterval);
              retrospectivePollInterval = null;
              retrospectiveBtn.disabled = false;
              retrospectiveBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Retrospective';
              return;
            }
            
            if (pollResponse && pollResponse.result && pollResponse.source === 'live') {
              console.log('[Errors] Got live retrospective result, stopping poll');
              clearInterval(retrospectivePollInterval);
              retrospectivePollInterval = null;
              retrospectiveBtn.disabled = false;
              retrospectiveBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Retrospective';
              
              // Save result as new error entry (type: retrospective)
              const timestamp = Date.now();
              const title = `Retrospective - ${new Date(timestamp).toLocaleString('vi-VN')}`;
              
              chrome.runtime.sendMessage({
                action: 'add_error',
                title: title,
                description: pollResponse.result,
                type: 'general',
                severity: 'low'
              }, () => {
                loadErrors();
                alert('Phân tích retrospective hoàn tất! Đã lưu vào danh sách lỗi.');
              });
            }
          });
        }, 3000);
      });
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
