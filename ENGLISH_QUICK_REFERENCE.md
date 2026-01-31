# English Module - Quick Reference

## 📁 Files

### Documentation
- `docs/ENGLISH_MODULE_FEATURES.md` - Complete feature documentation

### Implementation
- `src/ui-preact/pages/EnglishPage.jsx` - Main page component
- `src/ui-preact/api/englishApi.js` - API communication layer
- `src/extension/styles-preact.css` - Styling (lines 1540-1870)

### Backend (Unchanged)
- `src/background/handlers/english.js` - Backend handler
- `src/shared/messageSchema.js` - Message types

---

## 🎯 Key Features

1. **Topic Input** - Manual or auto-selection
2. **Generate Exercise** - ChatGPT integration
3. **Save Records** - Supabase persistence
4. **View History** - Saved sentences list
5. **Open Chat** - Navigate to ChatGPT conversation
6. **Delete** - Remove records with confirmation

---

## 🔧 API Functions

```javascript
// Fetch all English records
fetchEnglishList()
  → { items: Array, error?: Object }

// Add new record
addEnglish(chatId, topic, prompt)
  → { success: boolean, data?: Object, error?: Object }

// Delete record
deleteEnglish(id)
  → { success: boolean, error?: Object }

// Open chat in ChatGPT
openEnglishChat(chatId)
  → { success: boolean, error?: Object }

// Send prompt to ChatGPT
sendPromptToChatGPT(prompt)
  → { success: boolean, error?: Object }

// Get ChatGPT output (polling)
getChatGPTOutput()
  → { output?: string, chatId?: string, error?: Object }

// Auto-select topic
autoSelectTopic()
  → { topic?: string, error?: Object }

// Get prompt template
getEnglishPromptTemplate(topic)
  → string
```

---

## 📊 Message Flow

### Generate Exercise
```
User Input Topic
  ↓
Click "Generate"
  ↓
sendPromptToChatGPT()
  ↓
Poll getChatGPTOutput() (3s intervals, max 3min)
  ↓
Response Ready
  ↓
addEnglish(chatId, topic, prompt)
  ↓
fetchEnglishList() (refresh)
```

### Auto Topic
```
Empty Input
  ↓
Click "Generate"
  ↓
autoSelectTopic()
  ↓
ChatGPT picks topic
  ↓
Continue with Generate Exercise flow
```

---

## 🎨 Component Structure

```
EnglishPage
├── Header
├── Generator Section
│   ├── Topic Input
│   ├── Generate Button
│   └── Result Message
└── Saved Section
    ├── Section Header (+ Refresh)
    └── English List
        └── EnglishItem (foreach)
            ├── Topic Title
            ├── Metadata
            ├── Delete Button
            └── Confirm Dialog
```

---

## 💾 Data Schema

### Supabase Table: `english`
```sql
{
  id: UUID PRIMARY KEY,
  user_id: UUID REFERENCES auth.users(id),
  chat_id: TEXT NOT NULL,
  topic: TEXT NOT NULL,
  prompt: TEXT NOT NULL,
  created_at: TIMESTAMPTZ DEFAULT NOW()
}
```

### RLS Policy
```sql
auth.uid() = user_id
```

---

## 🎨 Key CSS Classes

```css
.english-page              /* Page container */
.english-generator         /* Input section */
.english-generator .input-field
.english-generator .generate-btn
.result-message            /* Status messages */
.result-message.loading
.result-message.success
.result-message.error
.english-list              /* List container */
.english-item              /* Item card */
.english-topic             /* Topic title (purple) */
.english-meta              /* Metadata */
.english-item .btn-delete  /* Delete button */
```

---

## 🚀 Usage Examples

### In Component
```javascript
import { EnglishPage } from './pages/EnglishPage.jsx';

// Render
<EnglishPage />
```

### API Usage
```javascript
import { fetchEnglishList, addEnglish } from '../api/englishApi.js';

// Load list
const { items, error } = await fetchEnglishList();
if (error) {
  showToast(error.message, 'error');
} else {
  setEnglishList(items);
}

// Add record
const { success, data, error } = await addEnglish(
  'abc123',
  'business meeting',
  'Create a meaningful...'
);
```

---

## ⚙️ Configuration

### Polling Settings
- **Interval**: 3 seconds
- **Max Attempts**: 60 (180 seconds total)
- **Cleanup**: useEffect cleanup on unmount

### Prompt Template
```
Create a meaningful English learning exercise about "{TOPIC}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.
```

---

## 🐛 Troubleshooting

### Issue: Polling timeout
**Solution**: Check ChatGPT tab is open and responsive

### Issue: Delete doesn't work
**Solution**: Check user is authenticated

### Issue: Auto-topic fails
**Solution**: User can manually enter topic instead

### Issue: Styles not applied
**Solution**: Rebuild: `npm run build`

---

## 📚 Related Documentation

- [Feature Documentation](docs/ENGLISH_MODULE_FEATURES.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Implementation Summary](ENGLISH_IMPLEMENTATION_COMPLETE.md)

---

**Last Updated**: January 31, 2026
