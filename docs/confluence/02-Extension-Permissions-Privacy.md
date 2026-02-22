# Permissions, Privacy & Web Store Compliance

> **Last updated**: XST-809 — Added Stock Research Pipeline disclosures, multi-LLM provider host_permissions, commodity data providers, Limited-Use disclosure, CWS listing description, single purpose statement.

Tài liệu này mô tả **đúng hành vi thực tế** của extension: thu thập gì, vì sao, lưu ở đâu, chia sẻ thế nào.

## 1) Permissions (manifest.json)

File: `src/extension/manifest.json`

- `storage`
  - Dùng để lưu **Supabase auth session token** qua adapter (service worker không có `localStorage`).
  - Lưu **search result cache** (LRU, TTL 30 phút, tối đa 50 entries) và **rate limiter usage stats** tạm thời.
  - Không dùng để lưu business data (portfolio/history/errors/assets/settings đều ở Supabase Postgres).

- `tabs`
  - Tìm và quản lý tab `https://chatgpt.com/*` khi gửi prompt/lấy response.

- `scripting`
  - Inject/excute script (content extraction cho context menu trên trang hiện tại) và đảm bảo content script chạy.

- `alarms`
  - Chạy job định kỳ (vd: cập nhật giá cổ phiếu 5 phút/lần trong giờ thị trường).

- `sidePanel`
  - Hiển thị UI ở side panel (`sidepanel-preact.html`).

- `contextMenus`
  - Thêm menu “ChatGPT Assistant - Phân tích” khi right-click.

- `activeTab`
  - Cho phép chạy content extraction trên **tab hiện tại** khi user chủ động bấm context menu.

## 2) Host permissions

### AI Provider Domains (content script automation)

- `https://chatgpt.com/*`
  - Inject content script để tự động nhập prompt và đọc response (ChatGPT web automation).

- `https://gemini.google.com/*`
  - Inject content script cho Gemini web provider (Stock Research Pipeline — multi-LLM).

- `https://claude.ai/*`
  - Inject content script cho Claude web provider (Stock Research Pipeline — multi-LLM).

### Web Search Domains

- `https://www.google.com/*`
  - Google Search web automation: tự động tìm kiếm từ khoá và trích xuất kết quả cho Stock Research Pipeline.

### Market Data Providers

- `https://iboard-query.ssi.com.vn/*`, `https://iboard.ssi.com.vn/*`
  - Fetch giá cổ phiếu từ SSI iBoard API.

- `https://bgapidatafeed.vps.com.vn/*`
  - Market data provider (VPS API).

- `https://api.x51.vn/*`
  - Market data API bổ sung.

### Commodity & Crypto Data Providers

- `https://btmc.vn/*`, `https://www.btmc.vn/*`
  - Giá vàng BTMC (web scraping).

- `https://giavang.doji.vn/*`
  - Giá vàng DOJI (web scraping).

- `https://sjc.com.vn/*`
  - Giá vàng SJC (web scraping).

- `https://api.coingecko.com/*`
  - Giá crypto từ CoinGecko API (public, free tier).

- `https://api.binance.com/*`
  - Giá crypto từ Binance API (public, free tier).

### Backend & Infrastructure

- `https://*.supabase.co/*`
  - Supabase Auth + Postgres REST (backend duy nhất cho user data).

### AI API Domains (server-side fallback)

- `https://api.anthropic.com/*`
  - Anthropic API (Claude) — dự phòng server-side nếu web provider không khả dụng.

- `https://generativelanguage.googleapis.com/*`
  - Google Generative Language API (Gemini) — dự phòng server-side.

### External Services

- `https://*.atlassian.net/*`
  - Atlassian integration (Jira/Confluence — development tooling).

## 3) Dữ liệu được xử lý

### 3.1 Dữ liệu người dùng nhập trong UI
- Portfolio holdings (symbol, quantity, avg_price, current_price, notes)
- Assets (type, name, value/quantity/unit, notes…)
- Settings config (JSONB, gồm prompt templates và flags)
- Error tracking (title, description, severity, type, resolved/resolution_notes)
- English module (topic + prompt gắn với chat_id)

**Lưu trữ**: Supabase Postgres tables (RLS theo `auth.uid() = user_id`).

### 3.2 Dữ liệu từ AI Provider tabs (ChatGPT / Gemini / Claude)
- Khi user chạy một chức năng cần AI:
  - Extension **điền prompt** vào editor của AI provider (ChatGPT, Gemini, hoặc Claude).
  - Extension **đọc response text** để hiển thị trong UI và (tuỳ workflow) lưu vào `chat_history` hoặc `stock_research_insights`.
- **Stock Research Pipeline** sử dụng multi-LLM: user chọn provider trong Settings, extension tự động dùng content script tương ứng.

**Lưu trữ**:
- Nếu workflow có lưu lịch sử: prompt/response/chat_id/chat_url được lưu ở Supabase `chat_history`.
- Stock Research: analysis results lưu vào Supabase `stock_research_insights` + `stock_research_sources`.
- Nếu chỉ gửi prompt (vd context menu) mà không có flow lưu: nội dung không bị tự động lưu, trừ khi user thực hiện thao tác lưu trong UI.

### 3.3 Dữ liệu Stock Research Pipeline
- **Google Search**: Extension tự động mở tab Google Search, nhập query về mã cổ phiếu, trích xuất kết quả (title, URL, snippet). Dữ liệu được cache trong `chrome.storage.local` (TTL 30 phút, LRU max 50 entries).
- **Source ranking**: Kết quả search được xếp hạng theo relevance score (tính toán local, không gửi ra ngoài).
- **Context building**: Nội dung từ các source được tổng hợp thành context cho AI analysis.
- **AI Analysis**: Context được gửi tới AI provider (ChatGPT/Gemini/Claude) dưới dạng prompt, response được parse và lưu.
- **Output validation**: Kết quả phân tích được validate format trước khi persist.

**Lưu trữ**: Supabase tables `stock_research_runs` (run metadata + timing), `stock_research_sources` (ranked sources), `stock_research_insights` (AI analysis results).

### 3.4 Dữ liệu từ trang web khi dùng context menu
- Nếu user chọn text: dùng `info.selectionText`.
- Nếu không chọn text: chạy hàm extract nội dung trang (đặc biệt có logic cho Facebook) để tạo prompt phân tích.

**Sử dụng**: Nội dung được chèn vào template `{CONTENT}` và gửi sang ChatGPT.

**Lưu trữ**: không có persistence riêng; chỉ trở thành một phần của prompt ChatGPT (có thể bị lưu bởi ChatGPT theo chính sách của OpenAI).

### 3.5 Telemetry kỹ thuật
- Content script có thể gửi `TELEMETRY_REPORT` chứa thống kê selector match + phiên bản UI ChatGPT (để debug selector).
- **Pipeline telemetry**: Mỗi Stock Research run ghi lại step timing (validate, search, rank, context, analyze, validate_output, persist), tổng thời gian, và status. Dữ liệu này được lưu trong `stock_research_runs.metadata` (JSONB) trên Supabase.
- Hiện không có handler xử lý/persist content script telemetry trong background (nếu không có receiver → message bị catch và log).

## 4) Chia sẻ dữ liệu

- Extension gửi dữ liệu tới:
  - **Supabase** (backend của sản phẩm) để lưu dữ liệu người dùng.
  - **AI Providers** (ChatGPT / Gemini / Claude — thông qua web automation hoặc API) khi user chạy các prompt hoặc Stock Research Pipeline.
  - **Google Search** (thông qua web automation trên `google.com`) để tìm kiếm thông tin cổ phiếu cho Stock Research Pipeline.
  - **Market data providers** (SSI/VPS/X51) để lấy giá cổ phiếu.
  - **Commodity data providers** (BTMC/DOJI/SJC/CoinGecko/Binance) để lấy giá vàng và crypto.

- Extension **không** bán/chia sẻ dữ liệu người dùng cho bên thứ 3 ngoài các endpoint cần thiết ở trên.
- Dữ liệu chỉ được gửi tới các endpoint khi user chủ động thực hiện thao tác (không có background data collection tự động ngoài price updates).

### 4.1 Limited-Use Disclosure

Extension tuân thủ **Google API Services User Data Policy** (Limited-Use requirements):

1. **Chỉ sử dụng dữ liệu Google cho mục đích đã khai báo**: Kết quả Google Search chỉ dùng cho Stock Research Pipeline analysis.
2. **Không chuyển dữ liệu Google cho bên thứ 3** ngoài mục đích cung cấp/cải thiện tính năng cho user.
3. **Không sử dụng dữ liệu Google cho quảng cáo** hoặc profiling.
4. **Dữ liệu Google Search được cache tạm thời** (TTL 30 phút) trong `chrome.storage.local` và tự động xoá sau TTL hoặc khi cache đầy (LRU eviction).

## 5) Thời gian lưu trữ & quyền kiểm soát

- Dữ liệu lưu trong Supabase tuân theo chính sách của dự án.
- **Temporary data** trong `chrome.storage.local`:
  - Search result cache: TTL 30 phút, LRU max 50 entries, tự động evict.
  - Rate limiter usage stats: Session-scoped, reset khi extension reload.
  - Auth session token: Persist cho đến khi user đăng xuất.
- User có thể:
  - Xoá items (portfolio/assets/errors/english/history) thông qua UI (tuỳ module).
  - Xoá Stock Research history và insights qua UI.
  - Đăng xuất để kết thúc session (xoá auth token + temp data).

## 6) External resources trong UI

- Side panel HTML có load Font Awesome CSS từ CDN:
  - `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`

Nếu cần compliance nghiêm ngặt, cân nhắc bundle icon CSS locally để tránh phụ thuộc remote resource.

## 7) Single Purpose Statement

> ChatGPT Assistant là extension hỗ trợ quản lý tài chính cá nhân và phân tích chứng khoán, tích hợp AI (ChatGPT/Gemini/Claude) để cung cấp:
> - Quản lý portfolio chứng khoán với giá realtime từ SSI/VPS
> - Theo dõi tài sản (vàng, crypto) với giá tự động cập nhật
> - Phân tích cổ phiếu tự động qua Stock Research Pipeline (multi-LLM + web search)
> - Lịch sử chat và error tracking
> - Hỗ trợ học tiếng Anh qua AI
>
> Tất cả tính năng phục vụ một mục đích duy nhất: **hỗ trợ người dùng quản lý và phân tích đầu tư tài chính cá nhân với sự hỗ trợ của AI**.

## 8) CWS Listing Description (Suggested)

**Short description** (132 chars max):
> AI-powered personal finance assistant: stock portfolio tracking, research analysis, asset management with ChatGPT/Gemini/Claude.

**Detailed description**:
> ChatGPT Assistant helps you manage your personal investment portfolio with AI-powered analysis.
>
> **Features:**
> - 📈 Stock Portfolio: Track holdings, P&L, with real-time prices from Vietnamese market (SSI/VPS)
> - 🔍 Stock Research: Automated multi-step analysis pipeline using Google Search + AI (ChatGPT, Gemini, or Claude)
> - 💰 Asset Tracking: Gold prices (BTMC/DOJI/SJC) and crypto (CoinGecko/Binance) with auto-calculation
> - 💬 Chat History: Save and review AI conversations
> - 🐛 Error Tracking: Log and resolve issues
> - 📖 English Learning: Practice with AI-generated prompts
>
> **Privacy:** All user data stored in Supabase (cloud PostgreSQL). No data sold or shared with third parties. Google Search data used only for stock research and cached temporarily (30 min TTL).
>
> **Requires:** Supabase account for data storage. AI analysis uses your existing ChatGPT/Gemini/Claude sessions (no API keys required for web providers).
