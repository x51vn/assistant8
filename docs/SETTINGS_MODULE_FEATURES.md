# Settings Module - Feature Documentation

> **Document Date**: January 31, 2026  
> **Module Location**: `src/ui/settings.js` (Legacy) → `src/ui-preact/settings/` (New)  
> **Backend Handler**: `src/background/handlers/settings.js`  
> **Supabase Table**: `settings`

---

## 📋 Overview

Settings Module quản lý tất cả cấu hình của extension, bao gồm 6 prompts đặc biệt hóa, 4 checkboxes automation, 1 số interval, và thông tin tài khoản người dùng. Tất cả settings được lưu trữ trên Supabase và đồng bộ theo user.

---

## 🎯 Core Features

### 1. **Prompt Templates Management**

Extension hỗ trợ 6 loại prompts khác nhau cho các tình huống cụ thể:

#### 1.1. Master Prompt (Main Evaluation)
- **Field ID**: `promptInput`
- **Signal**: `masterPrompt`
- **Label**: "1. Prompt đánh giá thị trường"
- **Purpose**: Prompt chính được gửi từ tab "Kết quả"
- **Required**: ✅ YES (form validation)
- **Default**: Empty string
- **Placeholder**: "Nhập prompt để gửi tới ChatGPT..."
- **Rows**: 3
- **Help Text**: "Prompt này sẽ được gửi trong tab Kết quả."

#### 1.2. Portfolio Evaluation Prompt
- **Field ID**: `portfolioPromptInput`
- **Signal**: `portfolioPrompt`
- **Label**: "2. Prompt đánh giá danh mục"
- **Purpose**: Đánh giá toàn bộ danh mục (tất cả mã + CASH)
- **Required**: ❌ NO (optional)
- **Default**: Empty string
- **Placeholder**: "Nhập prompt để ChatGPT đánh giá danh mục (gồm tất cả các mã và CASH)..."
- **Rows**: 15 (Large textarea)
- **Help Text**: "Prompt này sẽ được gửi kèm danh mục khi bạn bấm 'Đánh giá' trong tab Danh mục."
- **Auto-height**: YES (dynamic based on content, min 400px)

#### 1.3. Stock Evaluation Prompt
- **Field ID**: `stockEvalPromptInput`
- **Signal**: `stockEvalPrompt`
- **Label**: "3. Prompt đánh giá cổ phiếu"
- **Purpose**: Đánh giá từng mã cổ phiếu riêng lẻ
- **Required**: ❌ NO (has default)
- **Default**: `"Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị."`
- **Placeholder**: "Nhập prompt để ChatGPT đánh giá từng mã cổ phiếu...\nSử dụng {SYMBOL} để thay thế mã cổ phiếu"
- **Rows**: 3
- **Template Variable**: `{SYMBOL}` - Replaced với mã cổ phiếu cụ thể
- **Help Text**: "Prompt này sẽ được gửi khi bạn bấm 'Đánh giá' cho một mã cụ thể trong tab Danh mục. Dùng {SYMBOL} để tham chiếu tới mã."

#### 1.4. Tea Stock Prompt
- **Field ID**: `teaStockPromptInput`
- **Signal**: `teaStockPrompt`
- **Label**: "4. Prompt tìm cổ phiếu trà đá"
- **Purpose**: Tìm kiếm cổ phiếu "trà đá" có tiềm năng tăng mạnh
- **Required**: ❌ NO (optional)
- **Default**: Empty string
- **Placeholder**: "Nhập prompt để ChatGPT tìm kiếm cổ phiếu trà đá có tiềm năng tăng mạnh..."
- **Rows**: 3
- **Help Text**: "Prompt này sẽ được gửi khi bạn bấm nút '🍵 Cổ phiếu trà đá' trong tab Danh mục."

#### 1.5. Context Menu Prompt
- **Field ID**: `contextMenuPromptInput`
- **Signal**: `contextMenuPrompt`
- **Label**: "5. Prompt phân tích từ Context Menu"
- **Purpose**: Phân tích nội dung khi user right-click
- **Required**: ❌ NO (has default)
- **Default**: `"Hãy phân tích nội dung sau:\n\n{CONTENT}"`
- **Placeholder**: "Nhập prompt để ChatGPT phân tích nội dung bài viết...\nSử dụng {CONTENT} để thay thế nội dung được chọn"
- **Rows**: 3
- **Template Variable**: `{CONTENT}` - Replaced với nội dung được chọn
- **Help Text**: "Prompt này sẽ được gửi khi bạn bấm chuột phải và chọn \"ChatGPT Assistant - Phân tích\". Dùng {CONTENT} để tham chiếu tới nội dung bài viết."

#### 1.6. English Learning Prompt
- **Field ID**: `englishPromptInput`
- **Signal**: `englishPrompt`
- **Label**: "6. Prompt học Tiếng Anh"
- **Purpose**: Tạo bài tập học tiếng Anh theo topic
- **Required**: ❌ NO (has default)
- **Default**:
```
Teach me English about: {TOPIC}

Provide:
1. An English sentence/phrase
2. Vietnamese translation
3. Usage example
4. Common situations to use it
```
- **Placeholder**: "Nhập prompt để học Tiếng Anh...\nSử dụng {TOPIC} để thay thế chủ đề"
- **Rows**: 4
- **Template Variable**: `{TOPIC}` - Replaced với topic user nhập
- **Help Text**: "Prompt này sẽ được gửi từ tab English Learning. Dùng {TOPIC} cho chủ đề/keyword user nhập."

---

### 2. **Automation Settings (Checkboxes)**

#### 2.1. Auto-run on Startup
- **Field ID**: `autoRunCheckbox`
- **Signal**: `autoRun`
- **Label**: Không có (removed in legacy)
- **Default**: `false`
- **Purpose**: Tự động chạy khi extension khởi động
- **Note**: ❌ NOT displayed in current UI (removed)

#### 2.2. Evaluate Previous Results
- **Field ID**: `evaluatePreviousCheckbox`
- **Signal**: `evaluatePrevious`
- **Label**: "Đánh giá kết quả lần chạy trước (append vào prompt)"
- **Default**: `false`
- **Purpose**: Tự động thêm kết quả lần trước và yêu cầu ChatGPT đánh giá, cải thiện
- **Help Text**: "Tự động thêm kết quả lần trước và yêu cầu ChatGPT đánh giá, cải thiện code, đổi hướng nếu cần."

#### 2.3. Review Prompt Before Sending
- **Field ID**: `reviewPromptCheckbox`
- **Signal**: `reviewPrompt`
- **Label**: "Review Prompt (chỉ điền prompt, không gửi ngay)"
- **Default**: `false`
- **Purpose**: Chỉ điền prompt vào ChatGPT để review, không auto-send
- **Help Text**: "Chỉ điền prompt vào ChatGPT để bạn review, không tự động bấm gửi. Bạn sẽ tự bấm nút gửi sau khi kiểm tra."

#### 2.4. Realtime Updates
- **Field ID**: `realtimeEnabledCheckbox`
- **Signal**: `realtimeEnabled`
- **Label**: "Bật cập nhật giá realtime (mỗi 60 giây)"
- **Default**: `false`
- **Purpose**: Tự động cập nhật giá cổ phiếu từ SSI API
- **Help Text**: "Tự động cập nhật giá từ SSI API mỗi phút một lần."

---

### 3. **Timing Configuration**

#### 3.1. Update Interval
- **Field ID**: `intervalInput`
- **Signal**: `interval`
- **Type**: Number input
- **Label**: "Khoảng thời gian (phút):"
- **Default**: `5`
- **Min**: `1`
- **Max**: `1440` (24 hours)
- **Step**: `1`
- **Purpose**: Định kỳ cập nhật giá hoặc refresh data

---

### 4. **Action Buttons**

#### 4.1. Save Settings Button
- **Button ID**: `saveBtn`
- **Class**: `primary-btn`
- **Text**: "Lưu cấu hình"
- **Icon**: `<i class="fas fa-save"></i>`
- **Behavior**:
  1. Validate master prompt not empty
  2. Show "Đang lưu..." status
  3. Send SETTINGS_UPDATE to background
  4. Save to Supabase
  5. Show success/error message
- **Disabled When**:
  - Form invalid (master prompt empty)
  - Currently saving (isSaving = true)

#### 4.2. Send Now Button
- **Button ID**: `sendBtn`
- **Class**: `secondary-btn`
- **Text**: "Gửi ngay"
- **Purpose**: Gửi master prompt ngay lập tức đến ChatGPT
- **Behavior**:
  1. Validate master prompt not empty
  2. Show "Đang gửi prompt..." status
  3. Send SEND_PROMPT to background
  4. Options: `createNewChat: true, focusTab: true`
  5. Show success/error message

#### 4.3. Reset Button
- **Button ID**: `resetBtn`
- **Class**: `secondary-btn`
- **Text**: "Reset"
- **Icon**: `<i class="fas fa-undo"></i>`
- **Purpose**: Reset tất cả settings về default
- **Behavior**:
  1. Show confirmation dialog: "Bạn có chắc muốn reset tất cả cài đặt về mặc định?"
  2. If confirmed:
     - Reset all fields to defaults (client-side)
     - Send SETTINGS_DELETE to background
     - Delete from Supabase
  3. Show success/warning message

---

### 5. **User Account Section**

#### 5.1. User Email Display
- **Element ID**: `userEmail`
- **Label**: "Email:"
- **Default Text**: "Loading..."
- **Purpose**: Hiển thị email của user đang đăng nhập
- **Behavior**:
  - On page load: Call `checkAuthStatus()` to get user info
  - Display email or "Not logged in" / "Error loading user"
- **Style**: Info box với purple border-left

#### 5.2. Logout Button
- **Button ID**: `logoutBtn`
- **Class**: `secondary-btn`
- **Text**: `<i class="fas fa-sign-out-alt"></i> Đăng xuất`
- **Full Width**: `style="width: 100%;"`
- **Behavior**:
  1. Show "Đang đăng xuất..." in button
  2. Disable button
  3. Call `logout()` API
  4. On success: Auth gate handles UI reload automatically
  5. On failure: Show error, re-enable button, reload user info

---

## 🔄 Complete User Flows

### Flow 1: Load Settings on Page Open
```
1. User clicks Settings tab
2. settingsBtn click event triggers loadAllSettingsAtOnce()
3. Send SETTINGS_GET to background
4. Background queries Supabase settings table
5. Normalize response (legacy config.prompt → config.prompts.master)
6. Populate all 6 prompts
7. Populate 4 checkboxes (autoRun, evaluatePrevious, reviewPrompt, realtimeEnabled)
8. Populate interval number
9. Apply auto-height to large textareas (portfolio prompt)
10. Load user info (email) from auth status
```

### Flow 2: Save Settings
```
1. User modifies prompts/checkboxes/interval
2. User clicks "Lưu cấu hình"
3. Validate master prompt not empty (client-side)
4. Show "Đang lưu..." status
5. Build config object with normalized structure:
   {
     autoRun: boolean,
     evaluatePrevious: boolean,
     reviewPrompt: boolean,
     realtimeEnabled: boolean,
     interval: number,
     prompts: {
       master: string,
       portfolio: string,
       stockEval: string,
       teaStock: string,
       contextMenu: string,
       english: string
     }
   }
6. Send SETTINGS_UPDATE to background
7. Background upserts to Supabase (user_id + config JSONB)
8. On success: Show "Lưu cấu hình thành công!"
9. On failure: Show "Lưu thất bại: {error}"
```

### Flow 3: Send Prompt Now
```
1. User enters master prompt
2. User clicks "Gửi ngay"
3. Validate master prompt not empty
4. Show "Đang gửi prompt..." status
5. Send SEND_PROMPT to background
6. Background orchestrates:
   - Ensure ChatGPT tab open
   - Create new chat
   - Focus tab
   - Send prompt to content script
7. Show "Prompt đã gửi!" or error
```

### Flow 4: Reset Settings
```
1. User clicks "Reset"
2. Show confirmation dialog
3. User confirms
4. Reset all UI fields to defaults:
   - masterPrompt: ''
   - portfolioPrompt: ''
   - stockEvalPrompt: default value
   - teaStockPrompt: ''
   - contextMenuPrompt: default value
   - englishPrompt: default value
   - autoRun: false
   - evaluatePrevious: false
   - reviewPrompt: false
   - realtimeEnabled: false
   - interval: 5
5. Send SETTINGS_DELETE to background
6. Background deletes row from Supabase
7. Show "Reset thành công! Tất cả cài đặt đã được xóa."
```

### Flow 5: Logout
```
1. User clicks "Đăng xuất"
2. Update userEmail: "Đang đăng xuất..."
3. Disable logout button
4. Call logout() API
5. Background calls supabase.auth.signOut()
6. Broadcast AUTH_STATE_CHANGED to all UIs
7. Auth gate detects logout → reload UI to login page
8. On error: Show error, re-enable button
```

### Flow 6: Auto-reload on Auth Change
```
1. Background broadcasts AUTH_STATE_CHANGED (user logged in)
2. Settings page listener catches message
3. Re-trigger loadAllSettingsAtOnce()
4. Reload all prompts/checkboxes/interval
5. User sees fresh data from new logged-in user
```

---

## 🎨 UI Layout Specifications

### Page Structure (Legacy)
```
┌─────────────────────────────────────────────┐
│  ⚙️ Cấu hình                                │
├─────────────────────────────────────────────┤
│  📝 Prompt Đánh giá                         │
│  ┌───────────────────────────────────────┐ │
│  │ 1. Prompt đánh giá thị trường        │ │
│  │ [Textarea 3 rows]                    │ │
│  │ Help: Sẽ gửi trong tab Kết quả      │ │
│  └───────────────────────────────────────┘ │
│  ┌───────────────────────────────────────┐ │
│  │ 2. Prompt đánh giá danh mục          │ │
│  │ [Textarea 15 rows - LARGE]           │ │
│  │ Help: Gửi kèm danh mục              │ │
│  └───────────────────────────────────────┘ │
│  ┌───────────────────────────────────────┐ │
│  │ 3. Prompt đánh giá cổ phiếu          │ │
│  │ [Textarea 3 rows - {SYMBOL}]         │ │
│  └───────────────────────────────────────┘ │
│  ┌───────────────────────────────────────┐ │
│  │ 4. Prompt tìm cổ phiếu trà đá        │ │
│  │ [Textarea 3 rows]                    │ │
│  └───────────────────────────────────────┘ │
│  ┌───────────────────────────────────────┐ │
│  │ 5. Prompt phân tích (Context Menu)   │ │
│  │ [Textarea 3 rows - {CONTENT}]        │ │
│  └───────────────────────────────────────┘ │
│  ┌───────────────────────────────────────┐ │
│  │ 6. Prompt học Tiếng Anh              │ │
│  │ [Textarea 4 rows - {TOPIC}]          │ │
│  └───────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│  ⚙️ Cài đặt chung                           │
│  ☐ Đánh giá kết quả lần chạy trước          │
│  ☐ Review Prompt (không gửi ngay)           │
│  ☐ Bật cập nhật giá realtime                │
│  Khoảng thời gian: [5] phút                 │
├─────────────────────────────────────────────┤
│  [💾 Lưu cấu hình] [📤 Gửi ngay] [🔄 Reset]│
│                                             │
│  ✅ Status message here                     │
├─────────────────────────────────────────────┤
│  🔐 Tài khoản                               │
│  ┌───────────────────────────────────────┐ │
│  │ Email: user@example.com              │ │
│  └───────────────────────────────────────┘ │
│  [🚪 Đăng xuất]                             │
└─────────────────────────────────────────────┘
```

### Visual Specs
- **Section Borders**: `border-bottom: 1px solid #eee`
- **Section Spacing**: `margin-bottom: 24px; padding-bottom: 24px`
- **Form Groups**: `margin-bottom: 16px`
- **Help Text**: `font-size: 12px; color: #666; margin-top: 4px`
- **Button Group**: `margin-top: 24px; gap: 8px`
- **Status Message**: Below buttons, auto-hide after 3s
- **User Info Box**: Purple left border (`#667eea`), light gray background

---

## 📊 Backend Integration

### Message Types

#### 1. SETTINGS_GET
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.SETTINGS_GET,
  correlationId: "uuid",
  timestamp: number
}
```

**Response**:
```javascript
{
  type: MESSAGE_TYPES.SETTINGS_DATA,
  config: {
    // Normalized structure (backend auto-migrates legacy)
    prompts: {
      master: "...",      // Master prompt (legacy: config.prompt)
      portfolio: "...",
      stockEval: "...",
      teaStock: "...",
      contextMenu: "...",
      english: "..."
    },
    autoRun: false,
    evaluatePrevious: false,
    reviewPrompt: false,
    realtimeEnabled: false,
    interval: 5
  }
}
```

**Error Handling**:
- No settings found (PGRST116): Return `{ config: {} }` (not an error)
- Auth error: `AUTH_REQUIRED`
- Network error: `NETWORK_ERROR`
- Database error: `SUPABASE_ERROR`

#### 2. SETTINGS_UPDATE
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.SETTINGS_UPDATE,
  correlationId: "uuid",
  timestamp: number,
  data: {
    config: {
      // Accepts both legacy (config.prompt) and new (config.prompts.master)
      // Backend auto-normalizes before saving
      prompts: {
        master: "...",
        portfolio: "...",
        stockEval: "...",
        teaStock: "...",
        contextMenu: "...",
        english: "..."
      },
      autoRun: false,
      evaluatePrevious: false,
      reviewPrompt: false,
      realtimeEnabled: false,
      interval: 5
    }
  }
}
```

**Response**:
```javascript
{
  type: MESSAGE_TYPES.SETTINGS_UPDATED,
  config: { /* saved config */ }
}
```

**Validation**:
- Config must be object
- Backend normalizes legacy `config.prompt` → `config.prompts.master`
- Upsert with `onConflict: 'user_id'`

#### 3. SETTINGS_DELETE
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.SETTINGS_DELETE,
  correlationId: "uuid",
  timestamp: number
}
```

**Response**:
```javascript
{
  type: MESSAGE_TYPES.SETTINGS_DELETED,
  success: true
}
```

**Behavior**: Deletes entire settings row for user

#### 4. SEND_PROMPT (from Settings page)
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.SEND_PROMPT,
  correlationId: "uuid",
  timestamp: number,
  payload: {
    prompt: "...",
    options: {
      createNewChat: true,
      focusTab: true
    }
  }
}
```

---

## 🗄️ Database Schema

### Supabase Table: `settings`
```sql
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy
CREATE POLICY "Users can manage own settings"
  ON settings
  FOR ALL
  USING (auth.uid() = user_id);
```

### Config Structure (JSONB)
```javascript
{
  // Prompts (6 fields)
  "prompts": {
    "master": "...",      // Main evaluation prompt
    "portfolio": "...",   // Portfolio analysis
    "stockEval": "...",   // Individual stock eval
    "teaStock": "...",    // Tea stock finder
    "contextMenu": "...", // Right-click analysis
    "english": "..."      // English learning
  },
  
  // Automation (4 booleans)
  "autoRun": false,           // NOT USED in current UI
  "evaluatePrevious": false,  // Append previous results
  "reviewPrompt": false,      // Don't auto-send
  "realtimeEnabled": false,   // SSI price updates
  
  // Timing (1 number)
  "interval": 5               // Update interval in minutes
}
```

**Legacy Compatibility**:
- Old format: `config.prompt` (direct string)
- New format: `config.prompts.master`
- Backend auto-migrates on GET/UPDATE

---

## 🔒 Security & Validation

### Client-Side Validation
```javascript
// Master prompt required
if (!masterPrompt.value.trim()) {
  throw new Error('Master prompt cannot be empty');
}

// Form valid computed signal
export const isFormValid = computed(() => {
  return masterPrompt.value.trim().length > 0;
});
```

### Backend Validation
```javascript
// Config must be object
if (!config || typeof config !== 'object') {
  return createErrorResponse(message, 'INVALID_INPUT', 'Config không hợp lệ.');
}

// Auth required for all operations
const userId = await requireAuth(message);
```

### Authentication
- All operations require logged-in user
- RLS policy: `auth.uid() = user_id`
- Auth check in handler: `requireAuth(message)`

### Error Messages (User-Friendly Vietnamese)
- Network errors → "Không có kết nối internet"
- Auth errors → "Vui lòng đăng nhập để tiếp tục"
- Validation errors → Specific field errors
- Unknown errors → Technical error in details

---

## ⚡ Performance Considerations

### Textarea Auto-Height
```javascript
// Apply auto-height to large textareas (portfolio prompt)
setTimeout(() => {
  portfolioPromptInput.style.height = 'auto';
  portfolioPromptInput.style.height = Math.max(400, portfolioPromptInput.scrollHeight) + 'px';
}, 0);
```

### Load Optimization
- Single SETTINGS_GET loads all config at once (not individual fields)
- Avoid redundant loads: only reload on tab open or auth change
- Debounce not needed (explicit save button)

### Save Optimization
- Upsert strategy (INSERT or UPDATE in one operation)
- No optimistic UI updates (wait for confirmation)
- All prompts saved together in single JSONB column

---

## 🐛 Known Issues & Limitations

### 1. Auto-run Checkbox Hidden
- **Issue**: `autoRunCheckbox` loaded but not displayed in HTML
- **Impact**: User can't toggle this setting
- **Fix**: Either remove from backend or add to UI

### 2. Large Portfolio Prompt
- **Issue**: Portfolio prompt có thể rất dài (15+ rows)
- **Current**: Auto-height với min 400px
- **Future**: Consider collapsible section

### 3. No Prompt Preview
- **Issue**: User không xem preview của prompt với template variables replaced
- **Future**: Add preview pane cho {SYMBOL}, {CONTENT}, {TOPIC}

### 4. No Prompt Versioning
- **Issue**: Không có history của prompt changes
- **Future**: Add version control hoặc audit log

---

## 🎯 Migration to ui-preact Requirements

### Must Maintain (Legacy Features)
1. ✅ 6 Prompt textareas với đúng labels và help text
2. ✅ 4 Checkboxes (autoRun, evaluatePrevious, reviewPrompt, realtimeEnabled)
3. ✅ 1 Number input (interval)
4. ✅ 3 Action buttons (Save, Send Now, Reset)
5. ✅ User account section (email display + logout)
6. ✅ Auto-reload on auth change
7. ✅ Auto-reload on tab open
8. ✅ Portfolio prompt auto-height
9. ✅ Form validation (master prompt required)
10. ✅ Confirmation dialog for reset

### Must Add (Missing Features)
1. ❌ **MISSING**: "Send Now" button functionality
   - Legacy has this button
   - ui-preact SettingsForm KHÔNG có button này
   - Need to add!

2. ❌ **INCOMPLETE**: Reset behavior
   - Legacy sends SETTINGS_DELETE to Supabase
   - ui-preact only resets UI (không xóa Supabase)
   - Need to call deleteSettings() API!

3. ❌ **MISSING**: Auto-reload on tab click
   - Legacy reloads when user clicks Settings tab
   - ui-preact only loads on mount
   - Need to add settingsBtn listener!

4. ❌ **MISSING**: Auto-reload on auth change
   - Legacy listens for AUTH_STATE_CHANGED
   - ui-preact không có listener
   - Need to add message listener!

### Must Update (Implementation Details)
1. ✅ Use Preact hooks (useState, useEffect)
2. ✅ Use Preact signals for state
3. ✅ Use ui-preact component patterns
4. ✅ Match ui-preact styling
5. ✅ Add proper error handling
6. ✅ Add loading states
7. ✅ Add confirmation dialogs

---

## 📝 Implementation Checklist

### Phase 1: API Layer ✅ (Already Complete)
- [x] settingsApi.js exists
- [x] loadSettings() function
- [x] saveSettings() function
- [ ] **ADD**: sendPromptNow() function (MISSING)
- [ ] **ADD**: deleteSettings() function (MISSING)

### Phase 2: State Management ✅ (Already Complete)
- [x] settingsState.js with all signals
- [x] 6 prompt signals
- [x] 4 boolean signals
- [x] 1 number signal
- [x] isFormValid computed signal
- [x] resetAllFields() function

### Phase 3: UI Components
- [x] SettingsPage.jsx container
- [x] SettingsForm.jsx with all fields
- [ ] **FIX**: Add "Send Now" button
- [ ] **FIX**: Reset button calls deleteSettings()
- [ ] **FIX**: Auto-reload on tab click
- [ ] **FIX**: Auto-reload on auth change

### Phase 4: Testing
- [ ] Load settings from Supabase
- [ ] Save settings to Supabase
- [ ] Send prompt now works
- [ ] Reset deletes from Supabase
- [ ] Logout works
- [ ] Auto-reload on tab click
- [ ] Auto-reload on auth change
- [ ] Form validation works
- [ ] All prompts display correctly
- [ ] Portfolio prompt auto-height

---

## 🚀 Usage Guide

### For Users
1. Click Settings tab
2. Edit any of 6 prompts
3. Toggle checkboxes as needed
4. Adjust interval
5. Click "Lưu cấu hình" to save
6. Or click "Gửi ngay" to send master prompt immediately
7. Click "Reset" to restore defaults (with confirmation)
8. Logout button at bottom

### For Developers
```javascript
// Import API
import { loadSettings, saveSettings } from '../api/settingsApi.js';

// Load settings (populates signals)
await loadSettings();

// Access signal values
console.log(masterPrompt.value);
console.log(autoRun.value);

// Modify signals
masterPrompt.value = "New prompt";

// Save settings
await saveSettings();
```

---

## 📚 Related Files

### Legacy
- `src/ui/settings.js` (460 lines)
- `src/extension/sidepanel.html` (Settings section lines 140-300)

### Backend
- `src/background/handlers/settings.js` (233 lines)
- `src/shared/messageSchema.js` (Message types)

### ui-preact (Current)
- `src/ui-preact/settings/SettingsPage.jsx` (81 lines)
- `src/ui-preact/settings/SettingsForm.jsx` (176 lines)
- `src/ui-preact/state/settingsState.js` (163 lines)
- `src/ui-preact/api/settingsApi.js` (171 lines)

---

## ✅ Summary

Settings module là trung tâm cấu hình của extension với:
- **6 prompts** cho các tình huống khác nhau
- **4 automation toggles**
- **1 timing interval**
- **User account management**
- **Complete Supabase integration**
- **Auto-reload on various events**

Legacy implementation đầy đủ và functional. ui-preact cần bổ sung một số features còn thiếu:
1. Send Now button
2. Delete settings on Reset
3. Auto-reload behaviors

---

**Document End**
