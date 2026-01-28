/**
 * GPT-045: Settings Preact component
 * Displays prompts, settings toggles, and auth info
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export default function Settings() {
  const [settings, setSettings] = useState({
    promptInput: '',
    portfolioPromptInput: '',
    stockEvalPromptInput: '',
    teaStockPromptInput: '',
    contextMenuPromptInput: '',
    englishPromptInput: '',
    evaluatePrevious: false,
    reviewPrompt: false,
    realtimeEnabled: false,
    intervalInput: 5,
  });
  const [userEmail, setUserEmail] = useState('Loading...');
  const [saveStatus, setSaveStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    checkAuth();
  }, []);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_GET,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (!response.errorCode && response.data) {
        setSettings((prev) => ({ ...prev, ...response.data }));
      }
    } catch (error) {
      console.error('Load settings error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkAuth() {
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (response.data?.user?.email) {
        setUserEmail(response.data.user.email);
      }
    } catch (error) {
      console.error('Auth check error:', error);
    }
  }

  async function handleSave() {
    setSaveStatus('');
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: settings,
      });

      if (response.errorCode) {
        setSaveStatus('error: ' + response.errorMessage);
      } else {
        setSaveStatus('success: Đã lưu cấu hình');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (error) {
      setSaveStatus('error: ' + error.message);
    }
  }

  async function handleLogout() {
    if (!confirm('Đăng xuất?')) return;

    try {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  return (
    <div id="settings" className="page">
      <div className="content">
        <h2>Cấu hình</h2>

        {loading ? (
          <p className="empty-state">
            <i className="fas fa-spinner fa-spin"></i> Loading...
          </p>
        ) : (
          <>
            {/* Prompts Section */}
            <div style={{ borderBottom: '1px solid #eee', marginBottom: '24px', paddingBottom: '24px' }}>
              <h3 style={{ marginTop: 0 }}>Prompt Đánh giá</h3>

              <div className="form-group">
                <label htmlFor="promptInput">1. Prompt đánh giá thị trường:</label>
                <textarea
                  id="promptInput"
                  className="textarea-input"
                  value={settings.promptInput}
                  onChange={(e) => setSettings({ ...settings, promptInput: e.target.value })}
                  placeholder="Nhập prompt để gửi tới ChatGPT..."
                  rows={3}
                />
                <p className="help-text">Prompt này sẽ được gửi trong tab Kết quả.</p>
              </div>

              <div className="form-group">
                <label htmlFor="portfolioPromptInput">2. Prompt đánh giá danh mục:</label>
                <textarea
                  id="portfolioPromptInput"
                  className="textarea-input textarea-large"
                  value={settings.portfolioPromptInput}
                  onChange={(e) => setSettings({ ...settings, portfolioPromptInput: e.target.value })}
                  placeholder="Nhập prompt để ChatGPT đánh giá danh mục..."
                  rows={8}
                />
              </div>

              <div className="form-group">
                <label htmlFor="stockEvalPromptInput">3. Prompt đánh giá cổ phiếu:</label>
                <textarea
                  id="stockEvalPromptInput"
                  className="textarea-input"
                  value={settings.stockEvalPromptInput}
                  onChange={(e) => setSettings({ ...settings, stockEvalPromptInput: e.target.value })}
                  placeholder="Nhập prompt sử dụng {SYMBOL}..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="teaStockPromptInput">4. Prompt tìm cổ phiếu trà đá:</label>
                <textarea
                  id="teaStockPromptInput"
                  className="textarea-input"
                  value={settings.teaStockPromptInput}
                  onChange={(e) => setSettings({ ...settings, teaStockPromptInput: e.target.value })}
                  placeholder="Nhập prompt..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="englishPromptInput">5. Prompt học Tiếng Anh:</label>
                <textarea
                  id="englishPromptInput"
                  className="textarea-input"
                  value={settings.englishPromptInput}
                  onChange={(e) => setSettings({ ...settings, englishPromptInput: e.target.value })}
                  placeholder="Nhập prompt sử dụng {TOPIC}..."
                  rows={4}
                />
              </div>
            </div>

            {/* General Settings */}
            <div style={{ borderBottom: '1px solid #eee', marginBottom: '24px', paddingBottom: '24px' }}>
              <h3 style={{ marginTop: 0 }}>Cài đặt chung</h3>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.evaluatePrevious}
                    onChange={(e) => setSettings({ ...settings, evaluatePrevious: e.target.checked })}
                  />
                  Đánh giá kết quả lần chạy trước
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.reviewPrompt}
                    onChange={(e) => setSettings({ ...settings, reviewPrompt: e.target.checked })}
                  />
                  Review Prompt (chỉ điền, không gửi ngay)
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.realtimeEnabled}
                    onChange={(e) => setSettings({ ...settings, realtimeEnabled: e.target.checked })}
                  />
                  Bật cập nhật giá realtime
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="intervalInput">Khoảng thời gian (phút):</label>
                <input
                  id="intervalInput"
                  type="number"
                  className="number-input"
                  value={settings.intervalInput}
                  onChange={(e) => setSettings({ ...settings, intervalInput: parseInt(e.target.value) })}
                  min={1}
                  max={1440}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="button-group" style={{ marginTop: '24px' }}>
              <button className="primary-btn" onClick={handleSave}>
                Lưu cấu hình
              </button>
              <button className="secondary-btn" onClick={() => loadSettings()}>
                Reset
              </button>
            </div>

            {saveStatus && (
              <div className={`status-message ${saveStatus.includes('error') ? 'error' : 'success'}`}>
                {saveStatus}
              </div>
            )}

            {/* Auth Section */}
            <div style={{ borderTop: '1px solid #eee', marginTop: '24px', paddingTop: '16px' }}>
              <h3 style={{ marginTop: 0 }}>🔐 Tài khoản</h3>
              <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', borderLeft: '4px solid #667eea', padding: '12px', marginBottom: '12px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#333' }}>
                  <strong>Email:</strong> <span id="userEmail">{userEmail}</span>
                </p>
              </div>
              <button className="secondary-btn" onClick={handleLogout} style={{ width: '100%' }}>
                <i className="fas fa-sign-out-alt"></i> Đăng xuất
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
