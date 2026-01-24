# ChatGPT Assistant Extension

## 🎉 Version 2.0 - MV3 Architecture (2026)

A Chrome extension for automating ChatGPT interactions with cloud sync, portfolio management, and intelligent error tracking.

### ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (REQUIRED - X51LABS-130)
cp .env.example .env
# Edit .env and add your Supabase credentials from https://app.supabase.com/project/_/settings/api
# IMPORTANT: Use VITE_SUPABASE_ANON_KEY (not VITE_SUPABASE_KEY)

# 3. Build extension
npm run build
# ✅ Build will fail with clear error if env vars are missing

# 4. Load in Chrome
# Open chrome://extensions → Enable "Developer mode" → "Load unpacked" → Select dist/ folder
```

### 🔑 Environment Setup (Required)

Create `.env` file with your Supabase configuration:

```env
# Supabase Configuration (X51LABS-130)
# Get these values from: https://app.supabase.com/project/_/settings/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here  # ⚠️ Use ANON_KEY, not KEY!

# Optional: Environment mode
VITE_ENV=development
```

**⚠️ Common Issues**:
- **Build error "Missing environment variables"**: Ensure `.env` exists with both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- **Service Worker error "Supabase configuration missing"**: Your env vars were not injected. Check `.env` uses correct names (see above)

**Security Note**: Never commit `.env` to git. Use `.env.example` as template.

---

## ✨ Key Features

### 🎯 Core Functionality
- **Auto ChatGPT Integration**: Send prompts and retrieve responses automatically
- **Context Menu**: Right-click on any webpage to analyze selected content
- **Portfolio Tracking**: Manage stock portfolio with real-time evaluation
- **Smart History**: Save last 100 conversations with metadata

### 🔥 Cloud & Sync
- **Firebase Backup**: Automatic cloud sync of settings and history
- **Multi-Device**: Access your data from any browser
- **Restore Points**: Create and restore from backups

### 🧪 Developer Features  
- **MV3 Architecture**: Modern Chrome Extension Manifest V3
- **Modular Design**: Clean separation of concerns (handlers, services, UI)
- **Error Tracking**: CRUD system for debugging and monitoring
- **Source Maps**: Enabled for easy debugging (X51LABS-98)

---

## 📂 Project Structure

```
chatgpt-assistant/
├── src/
│   ├── background/          # Service Worker (MV3)
│   │   ├── index.js        # Entry point (top-level listeners)
│   │   ├── messageRouter.js # Message routing
│   │   └── handlers/       # Modular handlers
│   ├── content.js          # Content script (runs on chatgpt.com)
│   ├── ui/                 # Sidepanel UI modules
│   ├── platform/           # Chrome API adapters
│   ├── firebaseService.js  # Firebase operations
│   └── chatgptSession.js   # ChatGPT automation
├── dist/                   # Built extension (load this in Chrome)
├── .env                    # Firebase config (create from .env.template)
└── vite.config.js          # Build configuration
```

---

## 🛠️ Build Commands

```bash
npm install              # Install dependencies
npm run build           # Build extension to dist/
npm run build -- --watch # Watch mode (rebuild on file change)
```

**Load in Chrome**: chrome://extensions → "Developer mode" → "Load unpacked" → Select `dist/` folder

**Build Output**: background.js (~513 KB), content.js (~13 KB), ui.js (~67 KB) + source maps

---

## 📖 Documentation

See `docs/` folder for detailed guides:
- [Quick Start](docs/MV3_QUICK_START.md) | [User Guide](docs/USER_GUIDE_vi.md)
- [Architecture](docs/MV3_ARCHITECTURE_GUIDE.md) | [API Reference](docs/API.md)
- [Features](docs/FEATURES.md) | [Firebase Setup](docs/FIRESTORE_USAGE.md)

---

## 🔒 Security

- **Never commit `.env`** - Firebase credentials in environment variables only
- Deploy Firestore rules: `firebase deploy --only firestore:rules`
- Rotate exposed API keys (see `docs/CREDENTIAL_ROTATION.md`)

---

## 🐛 Troubleshooting

```bash
# Build issues
rm -rf node_modules && npm install && npm run build

# Firebase issues
# Check .env configuration and ensure Firestore is enabled

# Extension not loading
# Check chrome://extensions for errors, reload extension
```

---

**Built with ❤️ using Chrome Extension MV3, Firebase, and Vite**
