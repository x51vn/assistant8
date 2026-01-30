# Preact UI Migration Plan - Settings Page First

> **Branch**: `feature/preact-ui-migration`  
> **Date**: January 30, 2026  
> **Status**: Planning Phase

## 🎯 Overview

Migrate ChatGPT Assistant UI từ vanilla JavaScript sang Preact, bắt đầu với **Settings Page** vì đây là trang đơn giản nhất với ít dependencies.

### Tại sao chọn Settings làm trang đầu tiên?

- ✅ **Đơn giản nhất**: Chỉ có form inputs, không có list/table phức tạp
- ✅ **Ít dependencies**: Không phụ thuộc vào realtime subscriptions
- ✅ **Dễ test**: Chỉ cần verify save/load data
- ✅ **Low risk**: Nếu fail, không ảnh hưởng critical features
- ✅ **Clear scope**: Form fields + save/load + status messages

---

## 📊 Current State Analysis

### Existing Settings Implementation

**File**: `src/ui/settings.js` (460 lines)

**Current Features**:
- Master prompt input (textarea)
- Sub-prompts: portfolio, stockEval, teaStock, contextMenu, english
- Auto-run checkbox
- Evaluate previous checkbox
- Review prompt checkbox
- Realtime enabled checkbox
- Interval input
- Save/Reset buttons
- User info display
- Logout functionality
- Status messages

**Current Data Flow**:
```
UI (settings.js)
  ↓ chrome.runtime.sendMessage
Background Handler (settings.js)
  ↓ Supabase Client
PostgreSQL (settings table)
```

**Current Dependencies**:
```javascript
import { setActivePage } from './pages.js';
import { showStatus } from './status.js';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
import { logout, checkAuthStatus } from './auth.js';
```

---

## 📋 Migration Plan - 3 Tasks

### TASK 1: Setup Preact + Build Config (1-2h)

#### Objective
Setup Preact environment, configure Vite build, và verify "Hello World" component renders successfully.

#### Steps

**1.1 Install Dependencies**
```bash
npm install preact @preact/signals htm
npm install -D @preact/preset-vite
```

**Dependencies Explained**:
- `preact`: Core framework (3KB alternative to React)
- `@preact/signals`: Reactive state management (giống Vue reactivity)
- `htm`: Tagged template literals for JSX-like syntax (no build transform needed)
- `@preact/preset-vite`: Vite plugin for Preact support

**1.2 Update `vite.config.js`**

```javascript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.js'),
        content: resolve(__dirname, 'src/content.js'),
        ui: resolve(__dirname, 'src/ui/index.js'),
        // NEW: Preact settings entry
        'settings-preact': resolve(__dirname, 'src/ui-preact/settings/index.jsx')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js'
      }
    },
    outDir: 'dist',
    emptyOutDir: false
  },
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat'
    }
  }
});
```

**1.3 Create Directory Structure**

```bash
mkdir -p src/ui-preact/settings
mkdir -p src/ui-preact/components
mkdir -p src/ui-preact/hooks
mkdir -p src/ui-preact/api
```

**1.4 Create Minimal Preact Component**

`src/ui-preact/settings/SettingsPage.jsx`:
```jsx
import { h } from 'preact';

export function SettingsPage() {
  return (
    <div class="settings-container">
      <h1>Hello Preact Settings</h1>
      <p>If you see this, Preact is working! 🎉</p>
    </div>
  );
}
```

`src/ui-preact/settings/index.jsx`:
```jsx
import { h, render } from 'preact';
import { SettingsPage } from './SettingsPage.jsx';

// Mount app
const root = document.getElementById('app');
if (root) {
  render(<SettingsPage />, root);
}
```

**1.5 Create New HTML Entry Point**

`sidepanel-preact.html`:
```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Assistant - Settings (Preact)</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./settings-preact.js"></script>
</body>
</html>
```

**1.6 Update `manifest.json`**

```json
{
  "side_panel": {
    "default_path": "sidepanel-preact.html"
  }
}
```

**1.7 Verify Build**

```bash
npm run build

# Check output
ls -lh dist/settings-preact.js
# Should see file ~15-20KB (Preact is tiny!)
```

#### Acceptance Criteria

- [x] Preact dependencies installed successfully
- [x] `vite.config.js` has separate entry for Preact
- [x] "Hello Preact Settings" displays in sidepanel
- [x] No console errors in browser DevTools
- [x] Build output includes `settings-preact.js`
- [x] Hot reload works in development mode

#### Verification Steps

1. Run `npm run build:watch`
2. Load extension in Chrome (`chrome://extensions`)
3. Open side panel
4. Verify "Hello Preact Settings" text visible
5. Open DevTools Console → no errors
6. Check Network tab → `settings-preact.js` loaded

---

### TASK 2: Implement Settings Form với Preact Signals (2-3h)

#### Objective
Rebuild toàn bộ Settings form với Preact components, integrate với Background API (MESSAGE_TYPES), và implement load/save functionality.

#### Steps

**2.1 Create Settings State với Signals**

`src/ui-preact/settings/settingsState.js`:
```javascript
import { signal, computed } from '@preact/signals';

// Form field signals
export const masterPrompt = signal('');
export const portfolioPrompt = signal('');
export const stockEvalPrompt = signal('');
export const teaStockPrompt = signal('');
export const contextMenuPrompt = signal('');
export const englishPrompt = signal('');

export const autoRun = signal(false);
export const evaluatePrevious = signal(false);
export const reviewPrompt = signal(false);
export const realtimeEnabled = signal(false);
export const interval = signal(5);

// User info
export const userEmail = signal('');
export const userName = signal('');

// UI state
export const isLoading = signal(true);
export const isSaving = signal(false);

// Computed: check if form is valid
export const isFormValid = computed(() => {
  return masterPrompt.value.trim().length > 0;
});

// Computed: check if form has changes (need to compare with initial values)
export const hasChanges = signal(false);
```

**2.2 Create Settings API Module**

`src/ui-preact/api/settingsApi.js`:
```javascript
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Load settings from Supabase (via background handler)
 * @returns {Promise<Object>} Settings data
 */
export async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Failed to load settings');
    }

    // Response structure: { success: true, settings: {...} }
    return response.settings || {};
  } catch (error) {
    console.error('[SettingsAPI] Load failed:', error);
    throw error;
  }
}

/**
 * Save settings to Supabase (via background handler)
 * @param {Object} data - Settings data
 * @returns {Promise<Object>} Response
 */
export async function saveSettings(data) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_UPDATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data
    });

    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Failed to save settings');
    }

    return response;
  } catch (error) {
    console.error('[SettingsAPI] Save failed:', error);
    throw error;
  }
}
```

`src/ui-preact/api/authApi.js`:
```javascript
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

export async function checkAuthStatus() {
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });
  return response;
}

export async function logout() {
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });
  return response;
}
```

**2.3 Create Form Components**

`src/ui-preact/components/TextareaField.jsx`:
```jsx
import { h } from 'preact';

export function TextareaField({ label, value, onInput, placeholder, rows = 4 }) {
  return (
    <div class="form-field">
      <label class="form-label">{label}</label>
      <textarea
        class="form-textarea"
        value={value.value}
        onInput={(e) => onInput(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}
```

`src/ui-preact/components/CheckboxField.jsx`:
```jsx
import { h } from 'preact';

export function CheckboxField({ label, checked, onChange }) {
  return (
    <div class="form-field checkbox-field">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={checked.value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    </div>
  );
}
```

`src/ui-preact/components/NumberField.jsx`:
```jsx
import { h } from 'preact';

export function NumberField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div class="form-field">
      <label class="form-label">{label}</label>
      <input
        type="number"
        class="form-input"
        value={value.value}
        onInput={(e) => onChange(parseInt(e.target.value, 10))}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}
```

**2.4 Create Settings Form Component**

`src/ui-preact/settings/SettingsForm.jsx`:
```jsx
import { h } from 'preact';
import { TextareaField } from '../components/TextareaField.jsx';
import { CheckboxField } from '../components/CheckboxField.jsx';
import { NumberField } from '../components/NumberField.jsx';
import {
  masterPrompt,
  portfolioPrompt,
  stockEvalPrompt,
  teaStockPrompt,
  contextMenuPrompt,
  englishPrompt,
  autoRun,
  evaluatePrevious,
  reviewPrompt,
  realtimeEnabled,
  interval
} from './settingsState.js';

export function SettingsForm() {
  return (
    <div class="settings-form">
      <h2>Cài đặt chính</h2>
      
      <TextareaField
        label="Master Prompt"
        value={masterPrompt}
        onInput={(val) => masterPrompt.value = val}
        placeholder="Nhập prompt chính..."
        rows={6}
      />

      <h3>Prompts phụ</h3>
      
      <TextareaField
        label="Portfolio Prompt"
        value={portfolioPrompt}
        onInput={(val) => portfolioPrompt.value = val}
        placeholder="Prompt cho portfolio..."
        rows={4}
      />

      <TextareaField
        label="Stock Evaluation Prompt"
        value={stockEvalPrompt}
        onInput={(val) => stockEvalPrompt.value = val}
        placeholder="Prompt đánh giá cổ phiếu..."
        rows={4}
      />

      <TextareaField
        label="Tea Stock Prompt"
        value={teaStockPrompt}
        onInput={(val) => teaStockPrompt.value = val}
        placeholder="Prompt tea stock..."
        rows={4}
      />

      <TextareaField
        label="Context Menu Prompt"
        value={contextMenuPrompt}
        onInput={(val) => contextMenuPrompt.value = val}
        placeholder="Prompt context menu..."
        rows={4}
      />

      <TextareaField
        label="English Learning Prompt"
        value={englishPrompt}
        onInput={(val) => englishPrompt.value = val}
        placeholder="Prompt học tiếng Anh..."
        rows={4}
      />

      <h3>Tùy chọn</h3>

      <CheckboxField
        label="Tự động chạy"
        checked={autoRun}
        onChange={(val) => autoRun.value = val}
      />

      <CheckboxField
        label="Đánh giá kết quả trước"
        checked={evaluatePrevious}
        onChange={(val) => evaluatePrevious.value = val}
      />

      <CheckboxField
        label="Review prompt"
        checked={reviewPrompt}
        onChange={(val) => reviewPrompt.value = val}
      />

      <CheckboxField
        label="Bật Realtime"
        checked={realtimeEnabled}
        onChange={(val) => realtimeEnabled.value = val}
      />

      <NumberField
        label="Interval (phút)"
        value={interval}
        onChange={(val) => interval.value = val}
        min={1}
        max={60}
      />
    </div>
  );
}
```

**2.5 Create Main Settings Page với Load/Save Logic**

`src/ui-preact/settings/SettingsPage.jsx`:
```jsx
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { SettingsForm } from './SettingsForm.jsx';
import { UserSection } from './UserSection.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { loadSettings, saveSettings } from '../api/settingsApi.js';
import {
  masterPrompt,
  portfolioPrompt,
  stockEvalPrompt,
  teaStockPrompt,
  contextMenuPrompt,
  englishPrompt,
  autoRun,
  evaluatePrevious,
  reviewPrompt,
  realtimeEnabled,
  interval,
  isLoading,
  isSaving,
  isFormValid
} from './settingsState.js';
import { showStatus } from '../components/StatusMessage.jsx';

export function SettingsPage() {
  // Load settings on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        isLoading.value = true;
        const data = await loadSettings();
        
        // Populate signals
        if (data.masterPrompt) masterPrompt.value = data.masterPrompt;
        if (data.portfolioPrompt) portfolioPrompt.value = data.portfolioPrompt;
        if (data.stockEvalPrompt) stockEvalPrompt.value = data.stockEvalPrompt;
        if (data.teaStockPrompt) teaStockPrompt.value = data.teaStockPrompt;
        if (data.contextMenuPrompt) contextMenuPrompt.value = data.contextMenuPrompt;
        if (data.englishPrompt) englishPrompt.value = data.englishPrompt;
        
        autoRun.value = !!data.autoRun;
        evaluatePrevious.value = !!data.evaluatePrevious;
        reviewPrompt.value = !!data.reviewPrompt;
        realtimeEnabled.value = !!data.realtimeEnabled;
        interval.value = data.interval || 5;
      } catch (error) {
        showStatus('Không thể tải cài đặt: ' + error.message, 'error');
      } finally {
        isLoading.value = false;
      }
    }

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!isFormValid.value) {
      showStatus('Vui lòng nhập master prompt!', 'error');
      return;
    }

    try {
      isSaving.value = true;
      
      const data = {
        masterPrompt: masterPrompt.value,
        portfolioPrompt: portfolioPrompt.value,
        stockEvalPrompt: stockEvalPrompt.value,
        teaStockPrompt: teaStockPrompt.value,
        contextMenuPrompt: contextMenuPrompt.value,
        englishPrompt: englishPrompt.value,
        autoRun: autoRun.value,
        evaluatePrevious: evaluatePrevious.value,
        reviewPrompt: reviewPrompt.value,
        realtimeEnabled: realtimeEnabled.value,
        interval: interval.value
      };

      await saveSettings(data);
      showStatus('Đã lưu cài đặt thành công!', 'success');
    } catch (error) {
      showStatus('Lỗi khi lưu: ' + error.message, 'error');
    } finally {
      isSaving.value = false;
    }
  };

  const handleReset = () => {
    if (confirm('Bạn có chắc muốn reset tất cả cài đặt?')) {
      masterPrompt.value = '';
      portfolioPrompt.value = '';
      stockEvalPrompt.value = '';
      teaStockPrompt.value = '';
      contextMenuPrompt.value = '';
      englishPrompt.value = '';
      autoRun.value = false;
      evaluatePrevious.value = false;
      reviewPrompt.value = false;
      realtimeEnabled.value = false;
      interval.value = 5;
      
      showStatus('Đã reset cài đặt', 'info');
    }
  };

  if (isLoading.value) {
    return (
      <div class="settings-container">
        <div class="loading">
          <i class="fas fa-spinner fa-spin"></i> Đang tải...
        </div>
      </div>
    );
  }

  return (
    <div class="settings-container">
      <UserSection />
      
      <SettingsForm />

      <div class="settings-actions">
        <button
          class="btn btn-primary"
          onClick={handleSave}
          disabled={isSaving.value || !isFormValid.value}
        >
          {isSaving.value ? (
            <><i class="fas fa-spinner fa-spin"></i> Đang lưu...</>
          ) : (
            <><i class="fas fa-save"></i> Lưu cài đặt</>
          )}
        </button>

        <button
          class="btn btn-secondary"
          onClick={handleReset}
          disabled={isSaving.value}
        >
          <i class="fas fa-undo"></i> Reset
        </button>
      </div>

      <StatusMessage />
    </div>
  );
}
```

#### Acceptance Criteria

- [x] All form fields render correctly
- [x] Load settings from Supabase on mount
- [x] Populate all signals with loaded data
- [x] Save settings to Supabase on button click
- [x] Show loading spinner during async operations
- [x] Disable buttons during save
- [x] Reset button clears all fields
- [x] Settings persist after page reload
- [x] Form validation (master prompt required)

#### Verification Steps

1. Open side panel
2. Verify all form fields visible
3. Type in master prompt → verify signal updates
4. Click Save → check Network tab for MESSAGE_TYPES.SETTINGS_UPDATE
5. Reload extension → verify data persists
6. Click Reset → verify fields clear
7. Try save without master prompt → verify error message

---

### TASK 3: Add Status Messages + User Section (1h)

#### Objective
Implement status message system, user info display, và logout functionality.

#### Steps

**3.1 Create Status Message Component**

`src/ui-preact/components/StatusMessage.jsx`:
```jsx
import { h } from 'preact';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

// Global status state
export const statusMessage = signal('');
export const statusType = signal('info'); // 'success' | 'error' | 'info' | 'warning'
export const statusVisible = signal(false);

let statusTimeout;

/**
 * Show status message with auto-hide
 * @param {string} message - Message text
 * @param {string} type - Message type
 * @param {number} duration - Auto-hide duration (ms)
 */
export function showStatus(message, type = 'info', duration = 3000) {
  statusMessage.value = message;
  statusType.value = type;
  statusVisible.value = true;

  // Clear previous timeout
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }

  // Auto-hide
  if (duration > 0) {
    statusTimeout = setTimeout(() => {
      statusVisible.value = false;
    }, duration);
  }
}

/**
 * Hide status message
 */
export function hideStatus() {
  statusVisible.value = false;
}

/**
 * Status Message Component
 */
export function StatusMessage() {
  if (!statusVisible.value) {
    return null;
  }

  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };

  const icon = iconMap[statusType.value] || iconMap.info;

  return (
    <div class={`status-message status-${statusType.value}`}>
      <i class={`fas ${icon}`}></i>
      <span class="status-text">{statusMessage.value}</span>
      <button class="status-close" onClick={hideStatus}>
        <i class="fas fa-times"></i>
      </button>
    </div>
  );
}
```

**3.2 Create User Section Component**

`src/ui-preact/settings/UserSection.jsx`:
```jsx
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { userEmail, userName } from './settingsState.js';
import { checkAuthStatus, logout } from '../api/authApi.js';
import { showStatus } from '../components/StatusMessage.jsx';

export function UserSection() {
  useEffect(() => {
    async function loadUserInfo() {
      try {
        const response = await checkAuthStatus();
        if (response.authenticated && response.user) {
          userEmail.value = response.user.email || '';
          userName.value = response.user.user_metadata?.full_name || '';
        }
      } catch (error) {
        console.error('[UserSection] Failed to load user info:', error);
      }
    }

    loadUserInfo();
  }, []);

  const handleLogout = async () => {
    if (!confirm('Bạn có chắc muốn đăng xuất?')) {
      return;
    }

    try {
      const result = await logout();
      
      if (result.success) {
        showStatus('Đăng xuất thành công', 'success');
        // Auth gate will handle reload automatically
      } else {
        showStatus('Đăng xuất thất bại', 'error');
      }
    } catch (error) {
      showStatus('Lỗi: ' + error.message, 'error');
    }
  };

  return (
    <div class="user-section">
      <div class="user-info">
        <i class="fas fa-user-circle"></i>
        <div class="user-details">
          {userName.value && <div class="user-name">{userName.value}</div>}
          <div class="user-email">{userEmail.value || 'Loading...'}</div>
        </div>
      </div>
      
      <button class="btn btn-logout" onClick={handleLogout}>
        <i class="fas fa-sign-out-alt"></i> Đăng xuất
      </button>
    </div>
  );
}
```

**3.3 Add CSS Styles**

`src/ui-preact/styles/status.css`:
```css
/* Status Message Styles */
.status-message {
  position: fixed;
  top: 20px;
  right: 20px;
  min-width: 300px;
  max-width: 500px;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.status-message.status-success {
  background: #d4edda;
  border-left: 4px solid #28a745;
  color: #155724;
}

.status-message.status-error {
  background: #f8d7da;
  border-left: 4px solid #dc3545;
  color: #721c24;
}

.status-message.status-info {
  background: #d1ecf1;
  border-left: 4px solid #17a2b8;
  color: #0c5460;
}

.status-message.status-warning {
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  color: #856404;
}

.status-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
}

.status-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.status-close:hover {
  opacity: 1;
}

/* User Section Styles */
.user-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 24px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info .fa-user-circle {
  font-size: 32px;
  color: #6c757d;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 600;
  font-size: 14px;
  color: #212529;
}

.user-email {
  font-size: 13px;
  color: #6c757d;
}

.btn-logout {
  padding: 8px 16px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
}

.btn-logout:hover {
  background: #c82333;
}

.btn-logout:disabled {
  background: #6c757d;
  cursor: not-allowed;
}
```

#### Acceptance Criteria

- [x] Status messages show with correct colors
- [x] Status messages auto-hide after 3 seconds
- [x] Close button works on status messages
- [x] User email displays correctly
- [x] User name displays (if available)
- [x] Logout button works
- [x] Logout shows confirmation dialog
- [x] Success/error messages for logout

#### Verification Steps

1. Trigger save → verify green success message appears
2. Trigger error → verify red error message appears
3. Wait 3 seconds → verify message auto-hides
4. Click X button → verify message closes immediately
5. Check user section → verify email displayed
6. Click logout → verify confirmation dialog
7. Confirm logout → verify logout message + redirect

---

## 📊 Timeline & Resources

### Estimated Time

| Task | Duration | Developer |
|------|----------|-----------|
| TASK 1: Setup | 1-2 hours | 1 developer |
| TASK 2: Form + API | 2-3 hours | 1 developer |
| TASK 3: Status + User | 1 hour | 1 developer |
| **Total** | **4-6 hours** | |

### Dependencies

```
TASK 1 (Setup)
  ↓
TASK 2 (Form + API)
  ↓
TASK 3 (Status + User)
```

**Parallel Work Opportunities**: None - tasks are sequential

---

## 🧪 Testing Strategy

### Unit Tests (Vitest)

```javascript
// tests/unit/settings-state.test.js
import { describe, it, expect } from 'vitest';
import { masterPrompt, isFormValid } from '../src/ui-preact/settings/settingsState.js';

describe('Settings State', () => {
  it('should update master prompt signal', () => {
    masterPrompt.value = 'Test prompt';
    expect(masterPrompt.value).toBe('Test prompt');
  });

  it('should compute form validity', () => {
    masterPrompt.value = '';
    expect(isFormValid.value).toBe(false);

    masterPrompt.value = 'Valid prompt';
    expect(isFormValid.value).toBe(true);
  });
});
```

### Integration Tests

```javascript
// tests/integration/settings-page.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/preact';
import { SettingsPage } from '../src/ui-preact/settings/SettingsPage.jsx';

describe('SettingsPage', () => {
  beforeEach(() => {
    // Mock chrome.runtime.sendMessage
    global.chrome = {
      runtime: {
        sendMessage: vi.fn()
      }
    };
  });

  it('should render all form fields', () => {
    const { container } = render(<SettingsPage />);
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  it('should call loadSettings on mount', () => {
    render(<SettingsPage />);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SETTINGS_GET'
      })
    );
  });
});
```

### E2E Tests (Playwright)

```javascript
// tests/e2e/settings-preact.spec.js
import { test, expect } from '@playwright/test';

test('Settings page - full flow', async ({ page, context }) => {
  // Load extension
  const extensionId = await loadExtension(context, './dist');
  
  // Navigate to settings
  await page.goto(`chrome-extension://${extensionId}/sidepanel-preact.html`);

  // Verify page loaded
  await expect(page.locator('h1')).toContainText('Settings');

  // Fill master prompt
  await page.fill('textarea[name="masterPrompt"]', 'Test prompt');

  // Click save
  await page.click('button:has-text("Lưu cài đặt")');

  // Verify success message
  await expect(page.locator('.status-message')).toContainText('thành công');

  // Reload page
  await page.reload();

  // Verify data persisted
  const value = await page.inputValue('textarea[name="masterPrompt"]');
  expect(value).toBe('Test prompt');
});
```

---

## 🚧 Migration Strategy

### Phase 1: Parallel Development (Current)
- ✅ Keep existing vanilla JS Settings page (`src/ui/settings.js`)
- ✅ Build new Preact Settings page (`src/ui-preact/settings/`)
- ✅ Use separate HTML entry (`sidepanel-preact.html`)
- ✅ Test in isolation

### Phase 2: Beta Testing
- Switch extension to use `sidepanel-preact.html`
- Monitor for bugs
- Collect user feedback

### Phase 3: Full Migration
- Remove old `src/ui/settings.js`
- Rename `sidepanel-preact.html` → `sidepanel.html`
- Update manifest
- Delete vanilla JS code

### Phase 4: Scale to Other Pages
- Migrate Portfolio page
- Migrate History page
- Migrate Errors page
- Migrate English page

---

## 🎯 Success Criteria

### Functional Requirements
- [x] All settings fields work identically to vanilla JS version
- [x] Save/Load functionality works correctly
- [x] Status messages display properly
- [x] Logout functionality works
- [x] Data persists after reload
- [x] No regressions in existing features

### Non-Functional Requirements
- [x] Page loads < 100ms (Preact is 3KB)
- [x] No console errors
- [x] No memory leaks
- [x] Responsive on different screen sizes
- [x] Accessible (keyboard navigation, ARIA labels)

### Code Quality
- [x] Components < 100 lines each
- [x] State management clear and predictable
- [x] API layer separated from UI
- [x] Comprehensive error handling
- [x] Unit tests > 80% coverage

---

## 🔄 Rollback Plan

If Preact migration fails:

1. **Immediate Rollback** (< 5 minutes):
   ```json
   // manifest.json
   {
     "side_panel": {
       "default_path": "sidepanel.html"  // ← Back to vanilla JS
     }
   }
   ```

2. **Keep Both Versions**: Don't delete vanilla JS code until Preact version proven stable

3. **Feature Flag**: Add flag to switch between versions
   ```javascript
   const USE_PREACT = false; // Toggle in settings
   ```

---

## 📝 Notes & Considerations

### Why Preact over React?
- **Size**: 3KB vs 40KB (13x smaller)
- **Performance**: Same or better than React
- **Compatibility**: Same API as React (easy migration)
- **Chrome Extension Friendly**: No build transform needed with `htm`

### Why Signals over useState?
- **Simpler**: No hooks rules, no re-render gotchas
- **Faster**: Direct mutations, fine-grained reactivity
- **Less boilerplate**: No useCallback/useMemo needed
- **Better DX**: State updates are just assignments

### Alternative Approaches Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Preact + Signals** | Tiny, fast, simple | Learning curve | ✅ **CHOSEN** |
| Vue 3 | Great DX, mature | Larger bundle | ❌ Rejected |
| Svelte | Smallest bundle | Build complexity | ❌ Rejected |
| Vanilla JS | No dependencies | Maintenance hell | ❌ Current pain |
| React | Most popular | Too large (40KB) | ❌ Overkill |

---

## 🔗 References

- [Preact Documentation](https://preactjs.com/)
- [Preact Signals Guide](https://preactjs.com/guide/v10/signals/)
- [Vite Plugin Preact](https://github.com/preactjs/preset-vite)
- [Chrome Extension MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Current Settings Implementation](../../src/ui/settings.js)

---

## ✅ Ready to Start

**Next Command**:
```bash
# Start TASK 1
npm install preact @preact/signals htm
npm install -D @preact/preset-vite
```

**Verification**:
```bash
npm run build:watch
# Should complete without errors
```

**Success Indicator**: "Hello Preact Settings" visible in side panel

---

**Document Status**: ✅ Ready for Implementation  
**Branch**: `feature/preact-ui-migration`  
**Created**: January 30, 2026  
**Last Updated**: January 30, 2026
