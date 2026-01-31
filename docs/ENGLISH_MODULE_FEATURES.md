# English Learning Module - Feature Documentation

> **Document Date**: January 31, 2026  
> **Module Location**: `src/ui/english.js` (Legacy) → `src/ui-preact/pages/EnglishPage.jsx` (New)  
> **Backend Handler**: `src/background/handlers/english.js`  
> **Supabase Table**: `english`

---

## 📋 Overview

English Learning Module là một chức năng giúp người dùng học tiếng Anh thông qua việc tạo các bài tập và câu mẫu bằng ChatGPT. Module này lưu trữ lịch sử học tập vào Supabase và cho phép người dùng quản lý các topic đã học.

---

## 🎯 Core Features

### 1. **Topic Input & Generation**

#### 1.1. Manual Topic Entry
- **Description**: User nhập topic muốn học
- **UI Element**: Text input field
- **Behavior**: 
  - Accept any text input (max recommended: 50 characters)
  - Placeholder: "Enter a topic (e.g., 'business meeting', 'travel')"
  - Not required (có thể để trống)

#### 1.2. Auto Topic Selection
- **Description**: Nếu không nhập topic, ChatGPT sẽ tự động chọn trending topic phổ biến nhất trong tuần
- **Trigger**: Click "Generate" button khi input trống
- **Behavior**:
  1. Hiển thị loading: "⏳ Yêu cầu ChatGPT chọn topic phổ biến nhất trong tuần..."
  2. Gửi prompt đặc biệt yêu cầu ChatGPT pick topic
  3. Nhận topic từ ChatGPT response
  4. Hiển thị: "📝 ChatGPT đã chọn topic: **{topic}**"
  5. Proceed với topic đã chọn

**Prompt Template cho Auto Selection**:
```
You are an assistant that picks the single most popular trending topic this week suitable for an English learning exercise. Reply with exactly one short topic phrase (max 6 words) and nothing else.
```

#### 1.3. Generate Button
- **Label**: "🚀 Generate & Learn"
- **States**:
  - Default: Enabled với icon
  - Processing: "⏳ Processing..." và disabled
  - After completion: Reset về default state
- **Behavior**: Trigger English exercise generation

---

### 2. **English Exercise Generation**

#### 2.1. Prompt Template
**Format**:
```
Create a meaningful English learning exercise about "{TOPIC}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.
```

**Variables**:
- `{TOPIC}`: Replaced với topic (manual input hoặc auto-selected)

#### 2.2. ChatGPT Integration
- **Action**: Gửi prompt đến ChatGPT
- **Options**:
  - `createNewChat: true` - Tạo chat mới cho mỗi exercise
  - `focusTab: true` - Focus vào ChatGPT tab
- **Message Type**: `MESSAGE_TYPES.SEND_PROMPT`

#### 2.3. Response Polling
- **Description**: Poll ChatGPT response sau khi gửi prompt
- **Polling Strategy**:
  - Interval: 3 seconds
  - Max attempts: 60 (total timeout: 3 minutes)
  - Message Type: `MESSAGE_TYPES.CHATGPT_GET_OUTPUT`
- **Loading Indicator**: "⏳ Đang chờ... ({elapsed}s)"
- **Success Condition**: Receive `CHATGPT_OUTPUT_READY` với output content

#### 2.4. Response Display
- **Success**:
  ```
  ✅ Đã lưu! (Chat: {chatId:8})
  
  Nhấn vào item để mở ChatGPT
  ```
- **Timeout**:
  ```
  ⏱️ Timeout
  ```
- **Error**:
  ```
  ❌ Lỗi: {error message}
  ```

---

### 3. **Data Persistence**

#### 3.1. Save to Supabase
- **Table**: `english`
- **Schema**:
  ```sql
  {
    id: UUID (primary key),
    user_id: UUID (foreign key to auth.users),
    chat_id: TEXT (ChatGPT conversation ID),
    topic: TEXT (topic name),
    prompt: TEXT (full prompt sent to ChatGPT),
    created_at: TIMESTAMPTZ (auto)
  }
  ```
- **Handler**: `ENGLISH_ADD`
- **Upsert Strategy**: Conflict on `(user_id, chat_id)`
- **Validation**:
  - Required: `chat_id`, `topic`, `prompt`
  - Auth check: User must be logged in

#### 3.2. Data Constraints
- **Max Saved Items**: 50 (documented but not enforced)
- **User Isolation**: RLS policy ensures users only see own data
- **Ordering**: Default order by `created_at DESC` (newest first)

---

### 4. **Saved Sentences List**

#### 4.1. Display Format
**Layout**: Card-based list similar to Results/History page

**Card Structure**:
```html
<div class="result-item english-item">
  <div class="flex-content">
    <div class="topic-title">📚 {topic}</div>
    <div class="metadata">
      Chat: {chatId:8} • {date time}
    </div>
  </div>
  <button class="delete-btn">✕</button>
</div>
```

**Visual Specs**:
- Padding: 12px
- Border: 1px solid #e0e0e0
- Border radius: 6px
- Margin bottom: 8px
- Topic color: #667eea (purple)
- Font weight: 600
- Hover: cursor pointer + transition effect

#### 4.2. Empty State
**Display**:
```
Chưa có câu nào
```
**Condition**: When `items.length === 0`

#### 4.3. Item Count
- **Location**: Next to "Saved Sentences" heading
- **Format**: `(count)`
- **Element**: `<span id="savedSentencesCount">`

---

### 5. **Item Interactions**

#### 5.1. Click to Open Chat
- **Trigger**: Click anywhere on card (except delete button)
- **Behavior**:
  1. Ensure ChatGPT tab is open (`ENSURE_CHATGPT_OPEN`)
  2. Navigate to specific chat: `https://chatgpt.com/c/{chat_id}`
  3. Update/focus existing tab or create new one
- **Chrome API**: `chrome.tabs.query` + `chrome.tabs.update`

#### 5.2. Delete Item
- **Trigger**: Click delete button (✕)
- **Event**: `stopPropagation()` to prevent card click
- **Confirmation**: Hiển thị confirm dialog
  - Title: "Xóa câu học?"
  - Message: "Bạn có chắc chắn muốn xóa câu này?"
  - Confirm: "Xóa"
  - Cancel: "Hủy"
- **Action**: Send `ENGLISH_DELETE` message
- **Post-Delete**: Refresh list từ Supabase

---

### 6. **State Management**

#### 6.1. Local State
```javascript
let currentPollInterval = null;  // Polling timer reference
let pollInFlight = false;        // Prevent concurrent polls
let currentEnglishList = [];     // Cached list for display
```

#### 6.2. Cleanup
- **Interval Cleanup**: `clearInterval(currentPollInterval)` on:
  - Successful response received
  - Timeout reached
  - Error occurred
  - User navigates away

---

## 🔄 Complete User Flow

### Flow 1: Manual Topic Entry
```
1. User nhập topic: "business negotiation"
2. Click "Generate & Learn"
3. Button → disabled, text: "⏳ Processing..."
4. Display: "⏳ Đang gửi..."
5. Send prompt với topic to ChatGPT (new chat, focus tab)
6. Display: "⏳ Đang chờ response..."
7. Poll every 3s cho đến khi có response
8. Save to Supabase:
   - chat_id: "abc123xyz..."
   - topic: "business negotiation"
   - prompt: (full prompt text)
9. Display: "✅ Đã lưu! (Chat: abc123xy)"
10. Refresh saved list
11. Button → enabled, text: "🚀 Generate & Learn"
```

### Flow 2: Auto Topic Selection
```
1. User không nhập topic (input trống)
2. Click "Generate & Learn"
3. Display: "⏳ Yêu cầu ChatGPT chọn topic phổ biến nhất trong tuần..."
4. Send special prompt to ChatGPT
5. Poll for topic response (shorter timeout: ~30s)
6. Receive topic: "artificial intelligence"
7. Display: "📝 ChatGPT đã chọn topic: artificial intelligence"
8. Continue with Flow 1 starting from step 3
```

### Flow 3: View Saved Item
```
1. User clicks saved card "📚 travel phrases"
2. Background ensures ChatGPT tab open
3. Navigate to chat URL: chatgpt.com/c/{chat_id}
4. User sees original ChatGPT conversation
```

### Flow 4: Delete Item
```
1. User clicks ✕ button on "📚 travel phrases"
2. Show confirm dialog
3. User clicks "Xóa"
4. Send ENGLISH_DELETE to background
5. Background deletes from Supabase
6. Refresh list → item removed
7. Toast: "Đã xóa câu học" (optional)
```

---

## 🎨 UI Layout Specifications

### Page Structure
```
┌─────────────────────────────────────┐
│  English Learning                   │
├─────────────────────────────────────┤
│  Topic Input:                       │
│  ┌─────────────────────────────┐  │
│  │ Enter topic...              │  │
│  └─────────────────────────────┘  │
│                                     │
│  [🚀 Generate & Learn]              │
│                                     │
│  ┌─────────────────────────────┐  │
│  │ Result Area                 │  │
│  │ (Empty / Loading / Success) │  │
│  └─────────────────────────────┘  │
├─────────────────────────────────────┤
│  Saved Sentences (count)            │
├─────────────────────────────────────┤
│  ┌───────────────────────────┐    │
│  │ 📚 Business Meeting    ✕ │    │
│  │ Chat: abc12345 • 10:30   │    │
│  └───────────────────────────┘    │
│  ┌───────────────────────────┐    │
│  │ 📚 Travel Phrases      ✕ │    │
│  │ Chat: xyz67890 • 09:15   │    │
│  └───────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## 📊 Backend Integration

### Message Types

#### 1. ENGLISH_GET_ALL
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.ENGLISH_GET_ALL,
  correlationId: "uuid",
  timestamp: number
}
```

**Response**:
```javascript
{
  type: MESSAGE_TYPES.ENGLISH_DATA,
  items: [
    {
      id: "uuid",
      user_id: "uuid",
      chat_id: "abc123",
      topic: "business meeting",
      prompt: "Create a meaningful...",
      created_at: "2026-01-31T10:30:00Z"
    }
  ]
}
```

#### 2. ENGLISH_ADD
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.ENGLISH_ADD,
  correlationId: "uuid",
  timestamp: number,
  data: {
    chat_id: "abc123",
    topic: "business meeting",
    prompt: "Create a meaningful..."
  }
}
```

**Response**:
```javascript
{
  type: MESSAGE_TYPES.ENGLISH_ADDED,
  id: "uuid",
  chat_id: "abc123",
  topic: "business meeting",
  prompt: "...",
  created_at: "2026-01-31T10:30:00Z"
}
```

#### 3. ENGLISH_DELETE
**Request**:
```javascript
{
  v: 1,
  type: MESSAGE_TYPES.ENGLISH_DELETE,
  correlationId: "uuid",
  timestamp: number,
  data: {
    id: "uuid"
  }
}
```

**Response**:
```javascript
{
  type: MESSAGE_TYPES.ENGLISH_DELETED,
  id: "uuid"
}
```

---

## 🔒 Security & Validation

### Input Validation
- **Topic**: Any string, max 200 chars (not enforced UI-side)
- **Chat ID**: Required, must be from ChatGPT response
- **Prompt**: Required, generated from template

### Authentication
- All Supabase operations require logged-in user
- RLS policy: `auth.uid() = user_id`
- Auth check in handler: `supabase.auth.getUser()`

### Error Handling
- Network errors → "Không có kết nối internet"
- Auth errors → "Vui lòng đăng nhập để tiếp tục"
- Validation errors → Specific field errors
- Unknown errors → Technical error in details

---

## ⚡ Performance Considerations

### Polling Strategy
- **Interval**: 3 seconds (balance between responsiveness và load)
- **Max Duration**: 180 seconds (60 polls × 3s)
- **In-flight Check**: Prevent concurrent polls
- **Cleanup**: Always clear interval on completion/error

### List Rendering
- **Sort**: Client-side by `created_at DESC`
- **Limit**: Not enforced (relies on Supabase query)
- **Recommendation**: Implement pagination if > 100 items

### Caching
- **Current List**: Cached trong `currentEnglishList`
- **Refresh Strategy**: On add/delete operations
- **No Auto-refresh**: Manual refresh only (could add Realtime subscription)

---

## 🐛 Known Issues & Limitations

### 1. Polling Timeout
- **Issue**: 3-minute timeout có thể không đủ cho complex topics
- **Workaround**: User có thể refresh page và check saved list
- **Future**: Implement Realtime subscription thay vì polling

### 2. No Pagination
- **Issue**: Load all items at once
- **Impact**: Performance degradation với > 100 items
- **Future**: Add "Load More" button

### 3. No Search/Filter
- **Issue**: Không có cách search topics
- **Impact**: Khó tìm old exercises
- **Future**: Add search bar

### 4. Auto-Topic Quality
- **Issue**: ChatGPT topic selection có thể không stable
- **Workaround**: User nên input manual topic
- **Future**: Improve prompt hoặc use predefined topic list

---

## 🎯 Migration to ui-preact Requirements

### Must Maintain
1. ✅ All core features (topic input, generation, save, delete, open chat)
2. ✅ Supabase backend integration (same handlers)
3. ✅ Message types and schemas
4. ✅ Polling strategy
5. ✅ UI layout and card design
6. ✅ Error handling patterns

### Must Update
1. ✅ Use Preact hooks (`useState`, `useEffect`)
2. ✅ Use ui-preact API layer pattern (`englishApi.js`)
3. ✅ Use ui-preact component patterns (`ConfirmationDialog`)
4. ✅ Use ui-preact state management (signals if needed)
5. ✅ Match ui-preact styling conventions
6. ✅ Add TypeScript-like prop validation (JSDoc)

### Nice to Have (Future)
1. 🔄 Real-time subscription cho list updates
2. 🔄 Pagination
3. 🔄 Search/filter
4. 🔄 Export to PDF/CSV
5. 🔄 Statistics (topics learned, study streak)

---

## 📝 Code References

### Legacy Files
- **UI Logic**: `src/ui/english.js` (520 lines)
- **Backend Handler**: `src/background/handlers/english.js` (151 lines)
- **Message Schema**: `src/shared/messageSchema.js`

### New Files (To Create)
- **Page Component**: `src/ui-preact/pages/EnglishPage.jsx`
- **API Layer**: `src/ui-preact/api/englishApi.js`
- **Type Definitions**: JSDoc comments in files

---

## ✅ Implementation Checklist

### Phase 1: API Layer
- [ ] Create `englishApi.js`
- [ ] Implement `fetchEnglishList()`
- [ ] Implement `addEnglish(topic, chatId, prompt)`
- [ ] Implement `deleteEnglish(id)`
- [ ] Implement `openEnglishChat(chatUrl)`

### Phase 2: Page Component
- [ ] Create `EnglishPage.jsx` structure
- [ ] Implement topic input field
- [ ] Implement generate button với states
- [ ] Implement result area
- [ ] Implement saved list display

### Phase 3: ChatGPT Integration
- [ ] Implement auto-topic selection
- [ ] Implement prompt generation
- [ ] Implement polling logic
- [ ] Implement response handling

### Phase 4: Polish
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add confirmation dialogs
- [ ] Add toast notifications
- [ ] Style consistency check

---

**Document End**
