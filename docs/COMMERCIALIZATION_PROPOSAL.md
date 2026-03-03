# ChatGPT Assistant — Đề xuất Tính năng Thương mại hóa

> **Ngày**: 21/02/2026  
> **Trạng thái hiện tại**: v1.0.0 — Internal/Personal Use  
> **Mục tiêu**: Thương mại hóa trên Chrome Web Store

---

## Tổng quan Đánh giá

### Điểm mạnh hiện tại
- Kiến trúc Supabase + RLS vững chắc, multi-user isolation tốt
- Message passing schema chuẩn với validation
- Platform abstraction layer dễ test
- Session management proactive (refresh trước 2 phút)
- 18 tính năng hoạt động ổn định
- Database schema có indexes + constraints đầy đủ

### Gaps nghiêm trọng cho thương mại hóa

| # | Gap | Mức độ |
|---|-----|--------|
| 1 | Không có hệ thống thanh toán/subscription | 🔴 Critical |
| 2 | Không có Password Reset | 🔴 Critical |
| 3 | Không có Email Verification | 🔴 Critical |
| 4 | Không có Analytics | 🔴 Critical |
| 5 | Không có Feature Gating theo plan | 🔴 Critical |
| 6 | Không có Privacy Policy / ToS | 🔴 Critical |
| 7 | Không có Data Export / Account Deletion (GDPR) | 🟠 High |
| 8 | Không có Error Reporting service (Sentry) | 🟠 High |
| 9 | UI chỉ tiếng Việt | 🟠 High |
| 10 | Không có Onboarding flow | 🟡 Medium |

---

## Phase 1: Nền tảng Thương mại (Must-Have) — ~6 tuần

> Mục tiêu: Có thể publish Chrome Web Store + thu phí cơ bản

### 1.1 🔐 Hoàn thiện Authentication

**Ưu tiên**: 🔴 Critical | **Effort**: 2 tuần

| Tính năng | Mô tả | Supabase Support |
|---|---|---|
| **Password Reset** | Flow "Quên mật khẩu" → email link → đặt lại | `supabase.auth.resetPasswordForEmail()` |
| **Email Verification** | Xác nhận email khi đăng ký | `supabase.auth.signUp()` có `emailRedirectTo` |
| **OAuth / Social Login** | Google, GitHub login | Supabase Auth Providers |
| **Change Password** | Đổi mật khẩu trong Settings | `supabase.auth.updateUser()` |
| **Account Deletion** | Tự xóa tài khoản (GDPR) | Supabase Edge Function + cascade delete |
| **Hợp nhất Auth Components** | Gộp `LoginForm.jsx` + `SupabaseAuthForm.jsx` thành 1 | Refactor |

**Database changes**:
```sql
-- Extend user profile
ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN locale TEXT DEFAULT 'vi';
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
```

---

### 1.2 💳 Hệ thống Subscription & Billing

**Ưu tiên**: 🔴 Critical | **Effort**: 3-4 tuần

#### Mô hình Freemium đề xuất

| | Free | Pro ($4.99/tháng) | Enterprise ($14.99/tháng) |
|---|---|---|---|
| Portfolio stocks | 5 mã | 50 mã | Unlimited |
| Watchlist items | 10 mã | 100 mã | Unlimited |
| AI Enrichment/tháng | 5 lần | 100 lần | Unlimited |
| Writing prompts/tháng | 10 lần | 200 lần | Unlimited |
| Context Menu/tháng | 10 lần | 200 lần | Unlimited |
| Asset types | 3 loại | 8 loại | 8 loại + custom |
| Chat History | 30 ngày | 1 năm | Unlimited |
| Jira Integration | ❌ | ✅ | ✅ |
| Confluence Upload | ❌ | ✅ | ✅ |
| Market Indices | ✅ | ✅ | ✅ |
| Commodity Prices | ✅ | ✅ | ✅ |
| Custom Prompts | 3 prompts | 13 prompts | Unlimited |
| Priority Support | ❌ | Email | Email + Chat |
| Team Workspace | ❌ | ❌ | ✅ (5 users) |
| Data Export | ❌ | CSV | CSV + JSON + API |

#### Triển khai kỹ thuật

**A. Database Schema**:
```sql
-- Plans definition
CREATE TABLE plans (
  id TEXT PRIMARY KEY,              -- 'free', 'pro', 'enterprise'
  name TEXT NOT NULL,
  price_monthly NUMERIC,
  price_yearly NUMERIC,
  limits JSONB NOT NULL,            -- { "portfolio": 5, "watchlist": 10, ... }
  features JSONB NOT NULL,          -- { "jira": false, "confluence": false, ... }
  is_active BOOLEAN DEFAULT TRUE
);

-- User subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  plan_id TEXT REFERENCES plans NOT NULL,
  status TEXT CHECK (status IN ('active','trialing','past_due','canceled','expired')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  feature TEXT NOT NULL,            -- 'ai_enrichment', 'writing', 'context_menu'
  count INTEGER DEFAULT 0,
  period_start DATE NOT NULL,       -- Đầu tháng
  period_end DATE NOT NULL,         -- Cuối tháng
  UNIQUE (user_id, feature, period_start)
);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own subscriptions" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own usage" ON usage
  FOR ALL USING (auth.uid() = user_id);
```

**B. Stripe Integration** (via Supabase Edge Functions):
```
User clicks "Upgrade" → Stripe Checkout Session → Payment → Webhook → Update subscriptions table
```

**C. Feature Gating (Frontend)**:
```javascript
// New: SubscriptionContext.jsx
const { plan, limits, usage, canUse } = useSubscription();

// Usage check before action
if (!canUse('ai_enrichment')) {
  showUpgradeModal('Bạn đã hết lượt AI Enrichment tháng này. Nâng cấp Pro để tiếp tục.');
  return;
}
```

**D. Message Types mới**:
```javascript
SUBSCRIPTION_GET: 'SUBSCRIPTION_GET',
SUBSCRIPTION_DATA: 'SUBSCRIPTION_DATA',
SUBSCRIPTION_CREATE_CHECKOUT: 'SUBSCRIPTION_CREATE_CHECKOUT',
SUBSCRIPTION_CHECKOUT_URL: 'SUBSCRIPTION_CHECKOUT_URL',
USAGE_GET: 'USAGE_GET',
USAGE_DATA: 'USAGE_DATA',
USAGE_INCREMENT: 'USAGE_INCREMENT',
USAGE_INCREMENTED: 'USAGE_INCREMENTED',
```

---

### 1.3 📜 Privacy & Compliance (Chrome Web Store)

**Ưu tiên**: 🔴 Critical | **Effort**: 1 tuần

| Tài liệu | Mô tả |
|---|---|
| **Privacy Policy** | Trang web công khai mô tả data collection, usage, sharing |
| **Terms of Service** | Điều khoản sử dụng |
| **Data Disclosure** | Chrome Web Store data practices declaration |
| **GDPR Compliance** | Right to access, portability, erasure |
| **Cookie Policy** | (nếu dùng cookies trên landing page) |

**Yêu cầu Chrome Web Store**:
- Mô tả chính xác permissions và lý do cần
- Limited-use disclosure cho host_permissions
- Single-purpose justification
- Data handling transparency

**Tính năng cần implement**:
```
Settings → Privacy
├── "Tải dữ liệu của tôi" (Export JSON/CSV)
├── "Xóa tài khoản" (Hard delete + confirmation)
└── "Xem dữ liệu đã thu thập" (Summary view)
```

---

## Phase 2: Trải nghiệm Người dùng — ~4 tuần

> Mục tiêu: Giảm churn, tăng activation rate

### 2.1 🎯 Onboarding Flow

**Ưu tiên**: 🟡 Medium | **Effort**: 1 tuần

```
Đăng ký thành công
  → Step 1: Chào mừng + Chọn ngôn ngữ (Tiếng Việt / English)
  → Step 2: Chọn module quan tâm (Portfolio / Writing / Both)
  → Step 3: Thêm cổ phiếu đầu tiên HOẶC thử viết bài đầu tiên
  → Step 4: Tour tính năng (tooltip highlights)
  → Done: Dashboard chính
```

**Database**: `users.onboarding_completed`, `users.preferred_modules` (JSONB)

---

### 2.2 🌐 Đa ngôn ngữ (i18n)

**Ưu tiên**: 🟠 High | **Effort**: 2 tuần

| Ngôn ngữ | Ưu tiên | Lý do |
|---|---|---|
| Tiếng Việt (vi) | Mặc định | Thị trường chính |
| English (en) | Cao | Global reach, Chrome Web Store |
| 中文 (zh) | Trung bình | Thị trường lớn |
| 日本語 (ja) | Thấp | Tiềm năng |

**Triển khai**:
```javascript
// i18n/vi.json
{
  "portfolio.title": "Danh mục Đầu tư",
  "portfolio.add": "Thêm cổ phiếu",
  "portfolio.nav": "Giá trị Danh mục (NAV)",
  ...
}

// Hook: useTranslation()
const { t, locale, setLocale } = useTranslation();
return html`<h2>${t('portfolio.title')}</h2>`;
```

- ~500 strings UI cần dịch
- Prompt templates: giữ riêng theo locale
- Settings: chọn ngôn ngữ giao diện + ngôn ngữ prompt

---

### 2.3 🎨 Theme System (Dark/Light Mode)

**Ưu tiên**: 🟡 Medium | **Effort**: 3-5 ngày

```css
/* CSS Variables approach */
:root {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  --accent: #2563eb;
}
[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --text-primary: #e0e0e0;
  --accent: #60a5fa;
}
```

- Toggle trong Settings hoặc Navigation bar
- Lưu preference trong `settings.config.theme`
- Respect `prefers-color-scheme` system preference

---

### 2.4 🔔 Notification System

**Ưu tiên**: 🟡 Medium | **Effort**: 1 tuần

| Loại | Trigger | Kênh |
|---|---|---|
| **Price Alert** | Cổ phiếu đạt giá target/stoploss | Chrome notification + Side panel |
| **Session Expiry** | 5 phút trước khi hết phiên | Side panel toast |
| **AI Enrichment Done** | Hoàn tất phân tích | Chrome notification |
| **Market Open/Close** | 9:00 / 15:00 VN | Chrome notification |
| **Usage Limit Warning** | Sử dụng 80% quota | Side panel banner |
| **New Feature** | Có tính năng mới | Modal announcement |

**Database**:
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Phase 3: Tính năng Nâng cao — ~6 tuần

> Mục tiêu: Differentiation, user retention, enterprise readiness

### 3.1 📊 Dashboard & Analytics cá nhân

**Ưu tiên**: 🟠 High | **Effort**: 2 tuần

Trang Dashboard mới — landing page sau login, thay vì nhảy thẳng vào Portfolio.

```
Dashboard
├── 📈 Net Worth Overview (chart line 7d/30d/90d/1y)
├── 📊 Portfolio Performance (so với VN-Index)
├── 🔔 Notifications (unread count badge)
├── 📝 Recent Activity (5 mục gần nhất)
├── 💡 Quick Actions (Viết email, Đánh giá portfolio, AI Enrich)
├── 📰 Market Summary (indices + top movers)
└── 🎯 Usage This Month (quota bars)
```

**Components mới**:
- `DashboardPage.jsx` — Trang tổng hợp
- `NetWorthChart.jsx` — Line chart từ `asset_history`
- `PerformanceBenchmark.jsx` — So sánh NAV vs VN-Index
- `RecentActivity.jsx` — Timeline các hoạt động
- `QuotaUsageBar.jsx` — Thanh tiến trình usage

---

### 3.2 📱 Price Alerts & Watchlist Intelligence

**Ưu tiên**: 🟠 High | **Effort**: 2 tuần

| Tính năng | Mô tả |
|---|---|
| **Price Alerts** | Đặt alert khi cổ phiếu đạt giá nhất định (above/below) |
| **Target Hit Notification** | Thông báo khi giá đạt target/stoploss đã set |
| **Daily Summary** | Email tóm tắt portfolio cuối ngày (Supabase Edge Function) |
| **Weekly AI Report** | ChatGPT phân tích tuần tự (scheduler) |
| **Sector Analysis** | Phân tích theo ngành (Banking, Tech, Real Estate) |
| **Heatmap** | Bản đồ nhiệt thị trường VN |

**Database**:
```sql
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  symbol TEXT NOT NULL,
  condition TEXT CHECK (condition IN ('above','below','percent_change')),
  target_value NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.3 🤖 Multi-LLM Support

**Ưu tiên**: 🟡 Medium | **Effort**: 3 tuần

Hiện tại chỉ hỗ trợ ChatGPT qua DOM automation. Mở rộng sang:

| LLM | Phương thức | Ưu điểm |
|---|---|---|
| **ChatGPT** (hiện tại) | DOM automation | Free, tận dụng subscription user |
| **OpenAI API** | REST API direct | Ổn định, không phụ thuộc DOM |
| **Google Gemini** | REST API | Alternative provider |
| **Anthropic Claude** | REST API | Chất lượng phân tích |
| **Local LLM (Ollama)** | Local HTTP | Privacy, no cost |

**Kiến trúc**:
```javascript
// LLM Provider Interface
class LLMProvider {
  async sendPrompt(prompt, options) { /* returns response text */ }
  async isAvailable() { /* health check */ }
  getConfig() { /* provider-specific settings */ }
}

// Implementations
class ChatGPTDOMProvider extends LLMProvider { ... }  // Existing
class OpenAIAPIProvider extends LLMProvider { ... }   // New
class GeminiProvider extends LLMProvider { ... }      // New
class ClaudeProvider extends LLMProvider { ... }      // New
class OllamaProvider extends LLMProvider { ... }      // New

// Settings: chọn provider
settings.config.llmProvider = 'chatgpt_dom' | 'openai_api' | 'gemini' | 'claude' | 'ollama'
settings.config.llmApiKey = '...'  // Encrypted in Supabase
```

**Lợi ích thương mại**:
- Không bị phụ thuộc vào ChatGPT DOM (fragile selectors)
- User có thể dùng API key riêng → giảm chi phí vận hành
- API-based ổn định hơn, không cần content script

---

### 3.4 📤 Data Export & Import

**Ưu tiên**: 🟠 High | **Effort**: 1 tuần

| Format | Data | Plan |
|---|---|---|
| **CSV** | Portfolio, Watchlist, Assets, History | Pro+ |
| **JSON** | Full account data (GDPR) | Tất cả |
| **PDF Report** | Portfolio report, Net Worth summary | Pro+ |
| **Import CSV** | Bulk add stocks/assets | Pro+ |

**Triển khai**: Supabase Edge Function tạo file → signed URL → download.

---

### 3.5 🔗 Webhook & API Access

**Ưu tiên**: 🟡 Medium | **Effort**: 2 tuần

Dành cho Enterprise plan:

```
POST /api/v1/portfolio      → CRUD portfolio
GET  /api/v1/watchlist       → Read watchlist
POST /api/v1/prompts/send    → Send prompt to LLM
GET  /api/v1/net-worth       → Get net worth
```

- API Keys quản lý trong Settings
- Rate limiting per plan
- Webhook events: `price_alert.triggered`, `enrichment.completed`, `portfolio.updated`

---

## Phase 4: Growth & Ecosystem — ~4 tuần

> Mục tiêu: Viral growth, ecosystem lock-in

### 4.1 👥 Team Workspace (Enterprise)

**Effort**: 3 tuần

| Tính năng | Mô tả |
|---|---|
| **Shared Watchlist** | Team cùng theo dõi 1 danh sách |
| **Shared Prompts** | Chia sẻ prompt template trong team |
| **Role-based Access** | Owner, Admin, Member |
| **Activity Feed** | Xem hoạt động team members |
| **Shared Portfolio View** | View-only portfolio sharing |

**Database**:
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users,
  settings JSONB DEFAULT '{}'
);

CREATE TABLE team_members (
  team_id UUID REFERENCES teams,
  user_id UUID REFERENCES auth.users,
  role TEXT CHECK (role IN ('owner','admin','member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
```

---

### 4.2 🏪 Prompt Marketplace

**Effort**: 2 tuần

| Tính năng | Mô tả |
|---|---|
| **Browse Prompts** | Thư viện prompt community |
| **Publish Prompt** | Chia sẻ prompt cá nhân |
| **Rating & Reviews** | Đánh giá prompt |
| **Categories** | Phân loại: Finance, Writing, Learning, Analysis |
| **Clone & Customize** | Fork prompt về tài khoản |

**Database**:
```sql
CREATE TABLE marketplace_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES auth.users,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  downloads INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  is_published BOOLEAN DEFAULT TRUE
);
```

---

### 4.3 📊 Product Analytics (Internal)

**Effort**: 3-5 ngày

| Service | Mục đích | Plan |
|---|---|---|
| **Mixpanel / Amplitude** | User behavior analytics | Build/Buy |
| **Sentry** | Error monitoring & crash reporting | Buy |
| **PostHog** | Product analytics (self-hosted option) | Buy |
| **Supabase Analytics** | DB-level metrics | Existing |

**Events cần track**:
```javascript
track('page_view', { page: 'portfolio' });
track('feature_used', { feature: 'ai_enrichment', symbol: 'VNM' });
track('prompt_sent', { type: 'writing', subtype: 'email' });
track('subscription_upgraded', { from: 'free', to: 'pro' });
track('error_occurred', { code: 'NETWORK_ERROR', handler: 'portfolio' });
```

---

### 4.4 🌍 Multi-Market Support

**Effort**: 3 tuần

Mở rộng ngoài thị trường Việt Nam:

| Thị trường | API Provider | Currencies |
|---|---|---|
| **Việt Nam** (hiện tại) | SSI iBoard, VPS | VND |
| **US Stocks** | Alpha Vantage, Yahoo Finance | USD |
| **Crypto** (hiện tại) | CoinGecko, Binance | USD/VND |
| **Forex** | Exchange Rate API | Multi |

- Multi-currency portfolio support
- Exchange rate conversion
- Market hours per exchange

---

## Phase 5: Scaling & Infrastructure — Ongoing

### 5.1 🔧 Technical Debt

| Task | Mô tả |
|---|---|
| **Gộp Auth Components** | `LoginForm.jsx` + `SupabaseAuthForm.jsx` → 1 component |
| **Error Boundaries** | Preact error boundary cho từng page |
| **E2E Test Coverage** | Playwright tests cho critical flows |
| **CI/CD Pipeline** | GitHub Actions: lint → test → build → publish |
| **Chrome Web Store API** | Auto-publish new versions |
| **Monitoring Dashboard** | Uptime + error rate + API latency |

### 5.2 🌐 Multi-Browser

| Browser | Effort | Feasibility |
|---|---|---|
| **Chrome** (hiện tại) | Done | ✅ |
| **Edge** | 1 ngày | Gần như tương thích 100% (Chromium) |
| **Firefox** | 2 tuần | Cần WebExtension polyfill, sidebar API khác |
| **Safari** | 3 tuần | Web Extension API khác biệt nhiều |

### 5.3 📱 Mobile Companion (Tương lai)

- **PWA** từ Supabase data (read-only dashboard)
- **React Native** app (sử dụng lại Supabase backend)
- **Scope**: Xem portfolio, net worth, alerts trên mobile

---

## Roadmap Tổng hợp

```
Q1 2026 (Now → +6 tuần)
├── Phase 1: Nền tảng Thương mại
│   ├── ✅ Hoàn thiện Auth (Password Reset, OAuth, Email Verify)
│   ├── ✅ Subscription & Billing (Stripe + Plans)
│   ├── ✅ Privacy & Compliance (Chrome Web Store ready)
│   └── ✅ Publish Chrome Web Store (Free tier)

Q2 2026 (+6 → +10 tuần)
├── Phase 2: Trải nghiệm Người dùng
│   ├── ✅ Onboarding Flow
│   ├── ✅ i18n (Vietnamese + English)
│   ├── ✅ Dark/Light Theme
│   └── ✅ Notification System

Q2-Q3 2026 (+10 → +16 tuần)
├── Phase 3: Tính năng Nâng cao
│   ├── ✅ Dashboard & Personal Analytics
│   ├── ✅ Price Alerts
│   ├── ✅ Multi-LLM Support
│   ├── ✅ Data Export/Import
│   └── ✅ API Access (Enterprise)

Q3-Q4 2026 (+16 → +20 tuần)
├── Phase 4: Growth & Ecosystem
│   ├── ✅ Team Workspace
│   ├── ✅ Prompt Marketplace
│   ├── ✅ Product Analytics
│   └── ✅ Multi-Market Support

Q4 2026+ (Ongoing)
├── Phase 5: Scaling
│   ├── Multi-Browser (Edge, Firefox)
│   ├── Mobile Companion
│   └── Enterprise Features
```

---

## Ước tính Tổng Effort

| Phase | Thời gian | Priority |
|---|---|---|
| Phase 1: Nền tảng | ~6 tuần | 🔴 Must-Have |
| Phase 2: UX | ~4 tuần | 🟠 Should-Have |
| Phase 3: Nâng cao | ~6 tuần | 🟡 Nice-to-Have |
| Phase 4: Growth | ~4 tuần | 🟢 Future |
| Phase 5: Scaling | Ongoing | 🔵 Continuous |
| **Tổng đến MVP thương mại** | **~10 tuần** | Phase 1 + 2 |

---

## KPI Đề xuất

| Metric | Target Q2 2026 | Target Q4 2026 |
|---|---|---|
| Chrome Web Store Users | 500 | 5,000 |
| Pro Subscribers | 20 | 200 |
| Enterprise Subscribers | 0 | 10 |
| MRR (Monthly Recurring Revenue) | $100 | $1,500 |
| DAU (Daily Active Users) | 50 | 500 |
| Retention (30-day) | 30% | 50% |
| CSAT (Customer Satisfaction) | N/A | 4.0/5.0 |

---

## Khuyến nghị Ưu tiên Ngay

Nếu chỉ có thể chọn **5 việc** làm trước, tôi khuyến nghị:

1. **Password Reset + Email Verification** — Không có thì users bị lock out, Chrome Web Store sẽ reject
2. **Privacy Policy + Data Export** — Chrome Web Store yêu cầu bắt buộc
3. **Subscription System (Stripe)** — Monetization foundation
4. **i18n (English)** — Mở rộng thị trường gấp 100x
5. **Error Monitoring (Sentry)** — Không thể debug production issues nếu không có

Tổng effort 5 việc này: ~5-6 tuần, sau đó có thể publish Chrome Web Store với Free + Pro tier.
