/**
 * DeleteAccountSection.jsx - Account deletion with 2-step confirmation
 * XST-755: Account Deletion (GDPR Art. 17 - Right to Erasure)
 * 
 * Features:
 * - Danger zone styling
 * - 2-step confirmation: button → modal with text input
 * - Must type "XÓA TÀI KHOẢN" to confirm
 * - Cascade delete all user data
 * - Vietnamese messages
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useAuth } from '../../hooks/useAuth.js';
import { deleteAccount } from '../../api/authApi.js';
import { setGlobalLoading, hideLoading } from '../../state/appState.js';

const CONFIRM_TEXT = 'XÓA TÀI KHOẢN';

export function DeleteAccountSection() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const isConfirmValid = confirmInput === CONFIRM_TEXT;

  const handleOpenModal = () => {
    setShowModal(true);
    setConfirmInput('');
    setError('');
  };

  const handleCloseModal = () => {
    if (isDeleting) return; // Don't close during deletion
    setShowModal(false);
    setConfirmInput('');
    setError('');
  };

  const handleDelete = async () => {
    if (!isConfirmValid || isDeleting) return;

    setIsDeleting(true);
    setError('');
    setGlobalLoading(true, 'Đang xóa tài khoản...');

    try {
      const result = await deleteAccount(CONFIRM_TEXT);

      if (result.success) {
        // Account deleted - extension will reset
        // Auth state listener will handle redirect to login
        setShowModal(false);
      } else {
        setError(result.error || 'Không thể xóa tài khoản. Vui lòng thử lại.');
      }
    } catch (err) {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsDeleting(false);
      hideLoading();
    }
  };

  return (
    <section class="delete-account-section danger-zone">
      <h3 class="section-title danger-title">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        {' '}Vùng nguy hiểm
      </h3>
      
      <p class="danger-description">
        Xóa tài khoản sẽ xóa vĩnh viễn tất cả dữ liệu của bạn bao gồm: 
        portfolio, watchlist, lịch sử chat, cài đặt, và tất cả dữ liệu khác.
        Hành động này <strong>không thể hoàn tác</strong>.
      </p>
      
      <button
        type="button"
        class="btn btn-danger"
        onClick={handleOpenModal}
      >
        <i class="fas fa-trash-alt"></i> Xóa tài khoản
      </button>
      
      {/* Confirmation Modal */}
      {showModal && (
        <div class="modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) handleCloseModal();
        }}>
          <div class="modal-content danger-modal">
            <div class="modal-header">
              <h3>
                <i class="fas fa-exclamation-triangle"></i>
                {' '}Xác nhận xóa tài khoản
              </h3>
              <button
                type="button"
                class="modal-close-btn"
                onClick={handleCloseModal}
                disabled={isDeleting}
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
            
            <div class="modal-body">
              <div class="delete-warning">
                <p><strong>Bạn sắp xóa tài khoản:</strong> {user.email}</p>
                <p>Tất cả dữ liệu sau sẽ bị xóa vĩnh viễn:</p>
                <ul>
                  <li>Portfolio & Watchlist</li>
                  <li>Tài sản & Lịch sử tài sản</li>
                  <li>Lịch sử chat</li>
                  <li>Error tracking</li>
                  <li>Cài đặt & Prompts</li>
                  <li>Từ vựng tiếng Anh</li>
                </ul>
              </div>
              
              <div class="form-group">
                <label for="deleteConfirm">
                  Nhập <strong>{CONFIRM_TEXT}</strong> để xác nhận:
                </label>
                <input
                  type="text"
                  id="deleteConfirm"
                  value={confirmInput}
                  onInput={(e) => setConfirmInput(e.target.value)}
                  placeholder={CONFIRM_TEXT}
                  disabled={isDeleting}
                  class={`form-control ${confirmInput && !isConfirmValid ? 'input-error' : ''}`}
                  autocomplete="off"
                />
              </div>
              
              {error && (
                <div class="auth-error">
                  <i class="fas fa-exclamation-circle"></i> {error}
                </div>
              )}
            </div>
            
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                onClick={handleCloseModal}
                disabled={isDeleting}
              >
                Hủy
              </button>
              <button
                type="button"
                class="btn btn-danger"
                onClick={handleDelete}
                disabled={!isConfirmValid || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <i class="fas fa-spinner fa-spin"></i>{' '}Đang xóa...
                  </>
                ) : (
                  <>
                    <i class="fas fa-trash-alt"></i>{' '}Xóa vĩnh viễn
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
