# ChatGPT Assistant — Tổng quan Dự án & Tính năng

> **Phiên bản**: 1.0.0  
> **Loại**: Chrome Extension (Manifest V3)  
> **Framework UI**: Preact + Signals + HTM  
> **Backend**: Supabase (PostgreSQL + Auth + RLS)  
> **Ngày review**: 21/02/2026

---

## 1. Tổng quan

**ChatGPT Assistant** là một Chrome Extension (MV3) hoạt động như trợ lý cá nhân đa năng, tích hợp sâu với ChatGPT thông qua DOM automation. Extension cung cấp side panel UI để quản lý portfolio chứng khoán, theo dõi tài sản, lịch sử chat, viết nội dung, và nhiều tính năng khác.

### Kiến trúc tổng thể

```
┌──────────────────────┐
│   UI (Side Panel)    │  ← Preact + Signals
│   8 trang chính      │
└──────────┬───────────┘
           │ chrome.runtime.sendMessage
┌──────────▼───────────┐
│  Background Service  │  ← Middleware (Stateless)
│  Worker (MV3)        │
│  20+ Message Handlers│
└──────────┬───────────┘
           │ Supabase JS Client
┌──────────▼───────────┐     ┌─────────────────┐
│  Supabase Cloud      │     │  External APIs   │
│  PostgreSQL + Auth   │     │  SSI iBoard      │
│  RLS Policies        │     │  Gold/Crypto     │
│  12 Tables           │     │  Atlassian       │
└──────────────────────┘     └─────────────────┘
           
┌──────────────────────┐
│  Content Script      │  ← ChatGPT DOM Automation
│  chatgpt.com only    │
└──────────────────────┘
```

### Nguyên tắc thiết kế

| Nguyên tắc | Mô tả |
|---|---|
| **Stateless SW** | Service Worker có thể bị terminate bất kỳ lúc nào → không lưu state in-memory |
| **Supabase-first** | TẤT CẢ business data lưu trên Supabase, không lưu locally |
| **User-based** | Mọi data gắn với `user_id`, bảo vệ bởi RLS policies |
| **Message-driven** | UI ↔ Background ↔ Content Script giao tiếp qua `chrome.runtime.sendMessage` |
| **Event-driven** | Background SW chỉ thức dậy khi có event (message, alarm, install) |

---

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ | Phiên bản |
|---|---|---|
| UI Framework | Preact + Signals | ^10.28.2 / ^1.3.3 |
| Template | HTM (Tagged Templates) | ^3.1.1 |
| Routing | Signal-based (không dùng router) | — |
| Backend | Supabase (PostgreSQL + Auth) | ^2.91.0 |
| Build Tool | Vite | ^5.0.0 |
| Task Queue | p-queue | ^9.1.0 |
| Test Unit | Vitest | ^2.1.9 |
| Test E2E | Playwright | ^1.48.0 |
| Chrome API | Manifest V3 | Chrome 114+ |

---

## 3. Cấu trúc thư mục

```
src/
├── background/              # Service Worker (middleware)
│   ├── index.js             # Entry point, listener registration
│   ├── messageRouter.js     # Command pattern router
│   ├── handlers/            # 26 handler modules
│   │   ├── portfolio.js     # CRUD cổ phiếu
│   │   ├── assets.js        # CRUD tài sản
│   │   ├── netWorth.js      # Tổng tài sản ròng
│   │   ├── chatHistory.js   # Lịch sử chat
│   │   ├── errorTracking.js # Theo dõi lỗi
│   │   ├── settings.js      # Cấu hình
│   │   ├── english.js       # Học tiếng Anh
│   │   ├── commodity.js     # Giá vàng & crypto
│   │   ├── indices.js       # Chỉ số thị trường
│   │   ├── atlassian.js     # Jira & Confluence
│   │   ├── prompts.js       # Quản lý prompt
│   │   ├── supabaseWatchlist.js  # Watchlist CRUD
│   │   ├── watchlistEnrich.js    # AI enrichment
│   │   ├── alarms.js        # Tác vụ định kỳ
│   │   ├── contextMenu.js   # Right-click menu
│   │   └── ...
│   ├── services/            # Business logic services
│   └── utils/               # Auth, retry, SSI fetcher
├── content/                 # Content script modules
├── shared/                  # Shared constants & schemas
│   ├── messageSchema.js     # Message types & helpers
│   ├── systemPrompts.js     # 7 system prompts
│   ├── writingTemplates.js  # 6 writing templates
│   └── allPrompts.js        # Registry 13 prompts
├── ui-preact/               # Side Panel UI
│   ├── App.jsx              # Auth gate → MainApp
│   ├── pages/               # 8 page components
│   ├── components/          # 25+ reusable components
│   ├── settings/            # Settings form
│   ├── api/                 # 14 API wrappers
│   ├── state/               # 6 signal stores
│   ├── hooks/               # Custom hooks
│   ├── context/             # Auth context
│   └── styles/              # CSS
├── extension/               # Chrome extension assets
│   ├── manifest.json
│   ├── sidepanel-preact.html
│   └── styles-*.css
├── content.js               # Content script entry
├── supabaseConfig.js        # Supabase client setup
├── constants.js             # App constants
└── logger.js                # Structured logging
```

---

## 4. Tính năng chi tiết

### 4.1 📈 Quản lý Portfolio Chứng khoán

**Trang**: Portfolio | **Handler**: `portfolio.js` | **DB Table**: `portfolio`

Quản lý danh mục cổ phiếu với theo dõi lãi/lỗ real-time.

#### Chức năng
- **CRUD cổ phiếu**: Thêm/sửa/xóa cổ phiếu với mã, số lượng, giá mua trung bình
- **Cập nhật giá tự động**: Mỗi 5 phút trong giờ giao dịch (9:00–15:00, ngày thường) từ SSI iBoard API
- **P&L tracking**: Tính toán giá trị danh mục (NAV), lãi/lỗ, % lợi suất
- **Đánh giá danh mục AI**: Gửi dữ liệu portfolio tới ChatGPT để phân tích
- **Đánh giá cổ phiếu đơn lẻ**: Phân tích riêng từng mã
- **Tìm cổ phiếu trà đá**: Prompt đặc biệt tìm cổ phiếu giá thấp tiềm năng

#### UI Components
- `PortfolioSummary` — 4 thẻ thống kê: NAV, Giá trị đầu vào, P&L, P&L %
- `PortfolioTable` — Bảng cổ phiếu với sorting
- `StockModal` — Form thêm/sửa cổ phiếu
- `MarketIndices` — 4 chỉ số VNI, VN30, HNX, UPCOM
- `PortfolioActions` — Thanh hành động (prompt, đánh giá, refresh)

#### Database Schema
```sql
portfolio (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES auth.users,
  symbol      TEXT NOT NULL,          -- Mã cổ phiếu (VD: VNM, FPT)
  quantity    NUMERIC CHECK (> 0),    -- Số lượng
  avg_price   NUMERIC,               -- Giá mua trung bình
  current_price NUMERIC,             -- Giá hiện tại (tự động cập nhật)
  notes       TEXT,
  UNIQUE (user_id, symbol)
)
```

---

### 4.2 📋 Watchlist Chứng khoán

**Trang**: Watchlist | **Handler**: `supabaseWatchlist.js` | **DB Table**: `watchlist`

Danh sách theo dõi cổ phiếu quan tâm với tính năng AI enrichment.

#### Chức năng
- **CRUD watchlist**: Thêm/sửa/xóa mã cổ phiếu theo dõi
- **Tìm kiếm**: Filter theo mã chứng khoán (client-side)
- **Phân trang**: Hỗ trợ pagination cho danh sách lớn
- **Highlight**: Đánh dấu mã quan trọng
- **Cập nhật giá tự động**: Mỗi 5 phút (giờ giao dịch)
- **AI Enrichment**: Sử dụng ChatGPT phân tích từng mã cổ phiếu
  - Tự động điền: Entry price, Target, Stoploss, Investment thesis
  - Queue-based: Xử lý tuần tự, hỗ trợ cancel
  - JSON parsing với sanitization

#### Database Schema
```sql
watchlist (
  id                UUID PRIMARY KEY,
  user_id           UUID REFERENCES auth.users,
  symbol            TEXT NOT NULL,
  investment_thesis TEXT,          -- Luận điểm đầu tư (AI-generated)
  risk              TEXT,          -- Mức rủi ro
  entry             NUMERIC,      -- Giá vào (AI-suggested)
  target            NUMERIC,      -- Mục tiêu (AI-suggested)
  stoploss          NUMERIC,      -- Cắt lỗ (AI-suggested)
  notes             TEXT,
  price             NUMERIC,      -- Giá hiện tại
  ediff             NUMERIC,      -- Entry diff %
  highlighted       BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, symbol)
)
```

---

### 4.3 💰 Quản lý Tài sản (Assets)

**Trang**: Tài sản | **Handler**: `assets.js`, `netWorth.js` | **DB Tables**: `assets`, `asset_summaries`, `asset_history`

Quản lý tài sản đa loại với tính năng tổng tài sản ròng (net worth).

#### Chức năng
- **8 loại tài sản**: Tiền mặt, Tiết kiệm, Crypto, Vàng, Bất động sản, Xe cộ, Khoản nợ, Khác
- **CRUD tài sản**: Thêm/sửa/xóa tài sản với thông tin chi tiết
- **Lọc theo loại**: Filter buttons cho từng loại tài sản
- **Giá vàng & crypto real-time**: Cập nhật giá từ API bên ngoài
  - Vàng: Hỗ trợ đơn vị chỉ, lượng, gram, phân; loại SJC, 9999, 24K
  - Crypto: Giá USD → VND (tỷ giá mặc định 25,000)
- **Tổng tài sản ròng (Net Worth)**: 
  - Pre-computed via PostgreSQL triggers (`asset_summaries`)
  - Breakdown theo loại tài sản (thanh màu ngang)
  - Quick stats: Cổ phiếu, Tài sản, Nợ
- **Lịch sử tài sản**: Snapshots theo thời gian (7d, 30d, 90d, 1y, all)
- **Soft delete**: Đánh dấu `is_active = false` thay vì xóa hẳn

#### Database Schema
```sql
assets (
  id            UUID PRIMARY KEY,
  user_id       UUID REFERENCES auth.users,
  name          TEXT NOT NULL,
  asset_type    TEXT CHECK (IN cash, savings, real_estate, crypto, gold, vehicle, debt, other),
  current_value NUMERIC,           -- Giá trị hiện tại
  currency      TEXT DEFAULT 'VND',
  quantity      NUMERIC,           -- Số lượng (vàng: chỉ/lượng, crypto: coins)
  unit_price    NUMERIC,           -- Giá đơn vị
  liquidity     TEXT CHECK (IN high, medium, low),
  risk_level    TEXT CHECK (IN low, medium, high, very_high),
  institution   TEXT,              -- Ngân hàng, sàn giao dịch
  interest_rate NUMERIC,           -- Lãi suất (tiết kiệm)
  maturity_date DATE,              -- Ngày đáo hạn
  location      TEXT,              -- Vị trí (BĐS)
  notes         TEXT,
  is_active     BOOLEAN DEFAULT TRUE
)

asset_summaries (                  -- Pre-computed by DB triggers
  user_id            UUID PRIMARY KEY,
  total_portfolio    NUMERIC,
  total_assets       NUMERIC,
  total_net_worth    NUMERIC,
  portfolio_breakdown JSONB,
  assets_breakdown    JSONB
)

asset_history (                    -- Historical snapshots
  id            UUID PRIMARY KEY,
  user_id       UUID,
  snapshot_date DATE,
  total_value   NUMERIC,
  breakdown     JSONB,
  UNIQUE (user_id, snapshot_date)
)
```

---

### 4.4 💬 Lịch sử Chat (Chat History)

**Trang**: History | **Handler**: `chatHistory.js`, `chatHistoryAutoSave.js` | **DB Table**: `chat_history`

Lưu trữ và quản lý lịch sử hội thoại với ChatGPT.

#### Chức năng
- **Tự động lưu**: Content script capture prompt/response và gửi về background
- **Outbox pattern**: Nếu offline hoặc chưa login, lưu tạm → flush khi có kết nối
- **CRUD**: Xem, xóa từng mục, xóa tất cả
- **Expand/Collapse**: Mở rộng xem full prompt & response
- **Mở trong ChatGPT**: Link trực tiếp tới conversation gốc
- **Auto-trim**: Giữ tối đa 30 mục hiển thị (50 from DB)
- **Link transactions**: Gắn `prompt_id`, `run_id` cho tracing

#### Database Schema
```sql
chat_history (
  id        UUID PRIMARY KEY,
  user_id   UUID REFERENCES auth.users,
  chat_id   TEXT,                 -- ChatGPT conversation ID (nullable)
  chat_url  TEXT,                 -- URL conversation
  prompt    TEXT,                 -- Prompt đã gửi
  response  TEXT,                 -- Response từ ChatGPT
  prompt_id UUID,                -- Reference tới prompts table
  run_id    TEXT,                 -- Run tracking
  timestamp BIGINT,              -- Milliseconds
  metadata  JSONB,               -- Extra data (module, tags)
  UNIQUE (user_id, chat_id) WHERE chat_id IS NOT NULL
)
```

---

### 4.5 ✍️ Trợ lý Viết (Writing Assistant)

**Trang**: Writing | **Handler**: `prompts.js` + Content Script | **DB Tables**: `prompts`, `chat_history`

Công cụ viết nội dung đa dạng sử dụng ChatGPT.

#### 7 loại công việc viết

| Job Type | Mô tả | Inputs chính |
|---|---|---|
| `email` | Viết email | Nội dung chính, bối cảnh, tone, ngôn ngữ |
| `social` | Viết bài social media | Nội dung, nền tảng, tone, hashtag toggle |
| `summarize` | Tóm tắt văn bản | Nội dung gốc, độ dài, ngôn ngữ |
| `rewrite` | Viết lại văn bản | Nội dung gốc, phong cách, ngôn ngữ |
| `translate` | Dịch thuật | Nội dung, ngôn ngữ nguồn/đích |
| `outline` | Viết dàn ý | Chủ đề, số mục, ngôn ngữ |
| `english_learning` | Bài học tiếng Anh | Topic (hoặc AI auto-chọn) |

#### Chức năng
- **Dynamic form**: Form thay đổi theo job type (inputs + options)
- **Template engine**: Mustache-like syntax (`{{variable}}`, `{{#if}}`)
- **Output panel**: Xem kết quả + Copy clipboard + Insert vào active element
- **Upload Confluence**: Đẩy output lên Atlassian Confluence
- **Lịch sử viết**: Xem lại các bài đã viết, filter theo module
- **Auto poll**: Chờ response từ ChatGPT (3s intervals, max 3 phút)

---

### 4.6 🐛 Theo dõi Lỗi (Error Tracking)

**Trang**: Errors | **Handler**: `errorTracking.js` | **DB Table**: `errors`

Ghi nhận và theo dõi lỗi/bug retrospective.

#### Chức năng
- **CRUD lỗi**: Thêm/sửa/xóa/xóa tất cả
- **Phân loại lỗi**: 5 loại — Chung, Prompt, Response, Kết nối, Timeout
- **Mức độ nghiêm trọng**: 4 cấp — Thấp, Trung bình, Cao, Nghiêm trọng
- **Resolved tracking**: Đánh dấu đã giải quyết với timestamp
- **Color-coded**: CSS classes theo severity level

#### Database Schema
```sql
errors (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES auth.users,
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT CHECK (IN low, medium, high, critical),
  type            TEXT,           -- general, prompt, response, connection, timeout
  details         JSONB,         -- Chi tiết kỹ thuật
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolution_notes TEXT,
  timestamp       BIGINT
)
```

---

### 4.7 🎓 Học tiếng Anh (English Learning)

**Trang**: English (trong Writing) | **Handler**: `english.js` | **DB Table**: `english`

Module học tiếng Anh qua ChatGPT.

#### Chức năng
- **Tạo bài học**: Nhập topic hoặc để AI tự chọn topic trending
- **Auto topic**: ChatGPT chọn chủ đề phổ biến nhất trong tuần
- **Lưu bài học**: Gắn link tới ChatGPT conversation
- **Xem lại**: Click để mở conversation gốc
- **Prompt template**: Sử dụng `prompt.english` với placeholder `{TOPIC}`

#### Database Schema
```sql
english (
  id        UUID PRIMARY KEY,
  user_id   UUID REFERENCES auth.users,
  chat_id   TEXT,           -- ChatGPT conversation ID
  topic     TEXT,           -- Chủ đề bài học
  prompt    TEXT,           -- Prompt đã gửi
  UNIQUE (user_id, chat_id)
)
```

---

### 4.8 🔧 Jira & Confluence Integration

**Trang**: Jira | **Handler**: `atlassian.js` | **DB Table**: `settings` (credentials)

Tích hợp Atlassian cho quản lý issue và documentation.

#### Jira
- **Xem issues**: Lọc theo project hoặc JQL query
- **CRUD issue**: Tạo/sửa/xóa issue (summary, description, type, priority, assignee)
- **Status badges**: Color-coded theo category (to-do, in-progress, done)
- **Priority icons**: Hiển thị icon theo mức ưu tiên

#### Confluence
- **Upload nội dung**: Đẩy output viết lên Confluence page mới
- **Space Key**: Chọn Confluence space để publish

#### Cấu hình
- Base URL: `https://your-domain.atlassian.net`
- Email: Atlassian account email
- API Token: Atlassian API token
- Credentials lưu trong Supabase `settings.config.atlassian`

---

### 4.9 ⚙️ Cài đặt (Settings)

**Trang**: Settings | **Handler**: `settings.js` | **DB Table**: `settings`

Quản lý tất cả cấu hình người dùng.

#### Các nhóm cấu hình

**1. Prompt Management** (13 prompts)
- 7 System Prompts: Master, Portfolio, Stock Eval, Tea Stock, Context Menu, English, Watchlist Enrich
- 6 Writing Templates: Email, Social, Summarize, Rewrite, Translate, Outline
- Mỗi prompt có thể tùy chỉnh, reset về mặc định

**2. Automation Settings**
| Setting | Mô tả | Mặc định |
|---|---|---|
| Tự động chạy master prompt | Chạy prompt khi mở extension | OFF |
| Đánh giá kết quả trước | Xem kết quả lần chạy trước | OFF |
| Xem lại prompt trước khi gửi | Review prompt trước khi gửi đi | OFF |
| Realtime updates | Kích hoạt Supabase realtime | OFF |
| Update interval | Thời gian giữa các lần auto-update | 5 phút |

**3. Atlassian Integration**
- Base URL, Email, API Token
- Test Connection: Kiểm tra kết nối trước khi lưu

#### Database Schema
```sql
settings (
  user_id  UUID PRIMARY KEY REFERENCES auth.users,
  config   JSONB           -- Tất cả settings trong 1 JSONB object
)
-- config structure:
-- {
--   "prompts": { "master": "...", "portfolio": "...", ... },
--   "autoRun": false,
--   "evaluateResults": false,
--   "reviewPrompt": false,
--   "realtimeEnabled": false,
--   "interval": 5,
--   "atlassian": { "baseUrl": "...", "email": "...", "apiToken": "..." }
-- }
```

---

### 4.10 📊 Chỉ số Thị trường (Market Indices)

**Component**: `MarketIndices` | **Handler**: `indices.js` | **API**: SSI iBoard

Hiển thị chỉ số thị trường chứng khoán Việt Nam real-time.

#### Chức năng
- **4 chỉ số**: VN-Index, VN30, HNX-Index, UPCOM
- **Thông tin**: Giá trị, thay đổi (điểm + %), khối lượng
- **Color-coded**: Xanh (tăng), Đỏ (giảm), Xám (không đổi)
- **Auto-refresh**: Polling trong giờ giao dịch
- **Collapsible**: Thu gọn/mở rộng

---

### 4.11 💎 Giá Vàng & Crypto (Commodity Prices)

**Handler**: `commodity.js` | **API**: Gold/Crypto data providers

Cập nhật giá vàng và tiền điện tử.

#### Chức năng
- **Giá vàng**: Hỗ trợ SJC, 9999, 24K và các loại khác
- **Đơn vị vàng**: chỉ (3.75g), lượng (37.5g), gram, phân (0.375g)
- **Giá crypto**: Bitcoin, Ethereum, và các coin khác qua CoinGecko/Binance
- **Chuyển đổi USD → VND**: Tỷ giá mặc định 25,000
- **Auto-update**: Mỗi 15 phút (24/7, không phụ thuộc giờ thị trường)
- **Tự động cập nhật tài sản**: Tính giá trị mới cho gold & crypto assets

---

### 4.12 🖱️ Context Menu (Right-click)

**Handler**: `contextMenu.js` | **DB Tables**: `prompts`, `chat_history`

Menu chuột phải với 6 chế độ phân tích AI.

#### 6 chế độ phân tích

| Chế độ | Mô tả |
|---|---|
| Tóm tắt | Summarize nội dung |
| Phân tích chi tiết | In-depth analysis |
| Trích xuất ý chính | Extract key points |
| Dịch | Translate content |
| Viết lại | Rewrite content |
| Tùy chỉnh | Custom analysis |

#### Chức năng
- **Context types**: Text selection, page, link, image
- **Prompt caching**: 5 phút TTL từ Supabase
- **Smart truncation**: Cắt văn bản theo ranh giới câu (max 10,000 chars)
- **Badge phản hồi**: Hiển thị badge trên icon extension
- **Side panel option**: Phân tích trong side panel thay vì tab mới
- **Continue chat**: Tiếp tục conversation hiện tại

---

### 4.13 🔐 Authentication & Session Management

**Handler**: `supabaseAuth.js`, `sessionManager.js` | **Service**: Supabase Auth

Xác thực và quản lý phiên người dùng.

#### Chức năng
- **Login/Logout**: Email + Password qua Supabase Auth
- **Session persistence**: Token lưu trong `chrome.storage.local` (via chromeStorageAdapter)
- **Auto-refresh**: Supabase tự động refresh token
- **Session check**: Alarm mỗi 1 phút kiểm tra session expiry
- **Session restoration**: Tự động restore session khi SW restart hoặc browser start
- **Auth state broadcast**: Thông báo UI khi auth state thay đổi
- **RLS enforcement**: Tất cả queries tự động filter theo `auth.uid()`

---

### 4.14 🤖 Prompt Queue System

**Component**: `PromptQueueSection` | **Service**: `promptQueue.js` (p-queue)

Hệ thống hàng đợi xử lý prompt tuần tự.

#### Chức năng
- **Concurrency = 1**: Chỉ 1 prompt được xử lý tại 1 thời điểm
- **Queue management**: Theo dõi pending, active, completed, failed, cancelled jobs
- **Job types**: Watchlist enrichment, context menu analysis, writing, evaluation
- **Real-time status**: Auto-refresh mỗi 5 giây khi có active jobs
- **Clear completed**: Xóa jobs đã hoàn tất
- **Cancel support**: Hủy job đang chạy
- **State persistence**: Job state lưu trong `chrome.storage.local` (survive SW restart)

---

### 4.15 📊 Net Worth Dashboard

**Component**: `NetWorthSummary` | **Handler**: `netWorth.js`

Bảng tổng hợp tài sản ròng.

#### Chức năng
- **Tổng tài sản ròng**: Assets - Debts = Net Worth
- **Breakdown bar**: Thanh màu phân chia theo loại tài sản (proportional)
- **Quick stats**: Cổ phiếu, Tài sản, Nợ, thời gian cập nhật
- **Expandable detail**: Click để xem breakdown chi tiết
- **Fast path**: Đọc từ `asset_summaries` (pre-computed bởi DB triggers)
- **Fallback**: Tính on-the-fly nếu chưa có summary
- **Gold integration**: Gold portion tính giá trị mới từ live prices

---

## 5. Tác vụ định kỳ (Alarms)

| Alarm | Chu kỳ | Điều kiện | Mô tả |
|---|---|---|---|
| `CHECK` | 5 phút | Giờ giao dịch (9-15h, T2-T6) | Cập nhật giá cổ phiếu portfolio |
| `watchlistPriceUpdate` | 5 phút | Giờ giao dịch | Cập nhật giá watchlist |
| `updateCommodityPrices` | 15 phút | 24/7 | Cập nhật giá vàng & crypto |
| `SESSION_CHECK` | 1 phút | 24/7 | Kiểm tra session expiry |
| `AUTORUN` | Configurable | Nếu bật | Auto-run master prompt |

---

## 6. Message Schema

Tất cả messages tuân theo schema chuẩn:

```javascript
{
  v: 1,                          // Schema version
  type: 'PORTFOLIO_GET',         // Message type (from MESSAGE_TYPES)
  correlationId: 'uuid-...',     // Request tracing
  timestamp: 1708500000000,      // Unix timestamp ms
  // ... payload fields spread directly
}
```

**80+ message types** phân loại theo domain:
- Session (6 types)
- ChatGPT (5 types)
- Content Script (5 types)
- Portfolio (10 types)
- Watchlist (12 types)
- Assets & Net Worth (8 types)
- History (12 types)
- Errors (10 types)
- Settings (6 types)
- Prompts (8 types)
- English (6 types)
- Commodity (6 types)
- Market Indices (2 types)
- Atlassian (14 types)
- Prompt Queue (5 types)
- Auth (8 types)

---

## 7. Database Schema Summary

| Table | Mục đích | RLS |
|---|---|---|
| `portfolio` | Danh mục cổ phiếu | ✅ `auth.uid() = user_id` |
| `watchlist` | Danh sách theo dõi | ✅ |
| `assets` | Tài sản đa loại | ✅ |
| `asset_summaries` | Tổng tài sản (pre-computed) | ✅ |
| `asset_history` | Lịch sử tài sản | ✅ |
| `chat_history` | Lịch sử hội thoại | ✅ |
| `errors` | Theo dõi lỗi | ✅ |
| `settings` | Cấu hình (JSONB) | ✅ |
| `english` | Bài học tiếng Anh | ✅ |
| `prompts` | Templates prompt | ✅ |
| `runs` | Execution tracking | ✅ |
| `categories` | Categories (deprecated) | ✅ |

**12 migration files** quản lý schema evolution.

---

## 8. External API Integrations

| API | Mục đích | Endpoint |
|---|---|---|
| **SSI iBoard** | Giá cổ phiếu VN + chỉ số thị trường | `iboard-query.ssi.com.vn` |
| **VPS** | Giá cổ phiếu (backup) | `bgapidatafeed.vps.com.vn` |
| **BTMC/DOJI/SJC** | Giá vàng | `btmc.vn`, `giavang.doji.vn`, `sjc.com.vn` |
| **CoinGecko** | Giá crypto | `api.coingecko.com` |
| **Binance** | Giá crypto (backup) | `api.binance.com` |
| **Atlassian** | Jira + Confluence | `*.atlassian.net` |
| **ChatGPT** | AI content generation | `chatgpt.com` (DOM) |
| **X51 API** | Nội bộ | `api.x51.vn` |

---

## 9. Chrome Extension Permissions

```json
{
  "permissions": [
    "storage",        // Supabase auth token + temp cache
    "tabs",           // ChatGPT tab management
    "scripting",      // Content script injection
    "alarms",         // Periodic tasks (giá cổ phiếu, session check)
    "sidePanel",      // UI chính
    "contextMenus",   // Right-click AI analysis
    "activeTab"       // URL reading
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://*.supabase.co/*",
    "https://iboard-query.ssi.com.vn/*",
    "https://iboard.ssi.com.vn/*",
    "https://bgapidatafeed.vps.com.vn/*",
    "https://btmc.vn/*", "https://www.btmc.vn/*",
    "https://giavang.doji.vn/*", "https://sjc.com.vn/*",
    "https://api.coingecko.com/*", "https://api.binance.com/*",
    "https://*.atlassian.net/*",
    "https://api.x51.vn/*"
  ]
}
```

---

## 10. Testing

| Loại | Tool | Command |
|---|---|---|
| Unit Test | Vitest + happy-dom | `npm run test:unit` |
| E2E Test | Playwright | `npm run test:e2e` |
| E2E (UI mode) | Playwright | `npm run test:e2e:ui` |
| E2E (headed) | Playwright | `npm run test:e2e:headed` |

---

## 11. Build & Deploy

```bash
# Development (watch mode)
npm run build:watch

# Production build
npm run build

# Output: dist/ directory
# Load in Chrome: chrome://extensions → Load Unpacked → dist/
```

**Yêu cầu**:
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Chrome 114+ (Side Panel API)
- Node.js (Vite build)

---

## 12. Tóm tắt tính năng

| # | Tính năng | Mô tả ngắn | Status |
|---|---|---|---|
| 1 | Portfolio | Quản lý danh mục cổ phiếu, P&L tracking | ✅ Active |
| 2 | Watchlist | Theo dõi cổ phiếu + AI enrichment | ✅ Active |
| 3 | Assets | Quản lý tài sản đa loại (8 types) | ✅ Active |
| 4 | Net Worth | Tổng tài sản ròng + lịch sử | ✅ Active |
| 5 | Chat History | Lưu lịch sử ChatGPT tự động | ✅ Active |
| 6 | Writing Assistant | 7 loại viết nội dung AI | ✅ Active |
| 7 | Error Tracking | Ghi nhận & theo dõi lỗi | ✅ Active |
| 8 | English Learning | Học tiếng Anh qua ChatGPT | ✅ Active |
| 9 | Jira Integration | Quản lý issues Jira | ✅ Active |
| 10 | Confluence Upload | Đẩy nội dung lên Confluence | ✅ Active |
| 11 | Market Indices | Chỉ số VNI, VN30, HNX, UPCOM | ✅ Active |
| 12 | Commodity Prices | Giá vàng & crypto real-time | ✅ Active |
| 13 | Context Menu | 6 chế độ phân tích AI | ✅ Active |
| 14 | Prompt Queue | Hàng đợi xử lý prompt tuần tự | ✅ Active |
| 15 | Auth & Session | Xác thực Supabase + auto-refresh | ✅ Active |
| 16 | Settings | Cấu hình prompts, automation, Atlassian | ✅ Active |
| 17 | Prompt Management | 13 prompts tùy chỉnh | ✅ Active |
| 18 | Categories | Phân loại (UI removed) | ⚠️ Deprecated |
