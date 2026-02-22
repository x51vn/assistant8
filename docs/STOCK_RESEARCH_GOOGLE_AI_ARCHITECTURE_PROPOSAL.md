# Đề xuất Kiến trúc Thống nhất: Google Search → AI (ChatGPT/Gemini) cho Phân tích Cổ phiếu

> Ngày: 22/02/2026  
> Phạm vi: Review toàn bộ project + đề xuất thay đổi để triển khai luồng tìm kiếm thông tin mã cổ phiếu bằng Google Search trước khi đưa vào AI (ChatGPT/Gemini)

---

## 1) Tóm tắt điều hành

Dự án hiện đã có nền tảng rất tốt để mở rộng:
- MV3 message-driven architecture rõ ràng (UI → Background → Supabase)
- Nền tảng dữ liệu Supabase + RLS ổn định
- Đã có multi-LLM provider (`chatgpt`, `claude`, `gemini`)
- Đã có queue cho AI enrichment (`promptQueue`) phù hợp cho tác vụ dài

Tuy nhiên, để triển khai đúng mô hình yêu cầu (**Google Search trước, sau đó AI lọc/đánh giá cổ phiếu**), hiện còn thiếu lớp orchestration thống nhất. Luồng AI trong codebase đang tách thành 2 nhánh:
1. Nhánh legacy: `SEND_PROMPT`/`CHATGPT_SEND_INPUT` (DOM automation ChatGPT web)
2. Nhánh provider: `LLM_SEND_PROMPT` (Claude/Gemini/ChatGPT provider)

Nếu thêm tính năng mới trực tiếp lên 1 nhánh, hệ thống sẽ khó scale và khó bảo trì.  
**Khuyến nghị kiến trúc:** xây một pipeline chuẩn hóa duy nhất cho stock research:

**`Query Stock` → `Google Search Retrieval` → `Context Normalization` → `LLM Provider (ChatGPT/Gemini)` → `Structured Evaluation` → `Persist + UI`**

---

## 2) Review kiến trúc hiện tại (liên quan yêu cầu)

### 2.1 Điểm mạnh

- Có `LLMProviderFactory` + `GeminiProvider` + UI chọn provider (`LLMProviderSection`) → đã sẵn “Gemini as alternative”.
- Có watchlist enrichment queue-based (`WATCHLIST_AI_ENRICH_RUN`) → phù hợp chạy workflow nhiều bước.
- Có `settings` table JSONB, dễ mở rộng cấu hình search/provider per-user.
- Có Supabase Edge Functions, phù hợp proxy API keys và xử lý server-side cho external search.

### 2.2 Vấn đề cần xử lý

1. **Phân mảnh đường đi AI**
   - `watchlistEnrich.js`, `TeaStockModal.jsx`, `EvaluatePortfolioModal.jsx`, nhiều API UI vẫn gọi `SEND_PROMPT` trực tiếp.
   - Trong khi đó `LLM_SEND_PROMPT` đã tồn tại nhưng chưa là tuyến chính.

2. **ChatGPTProvider dùng dynamic import trong provider (`import(...)`)**
   - Không phù hợp triết lý MV3 background đang cố tránh dynamic import trong SW.
   - Cần chuyển về static dependency hoặc service adapter ổn định.

3. **Thiếu lớp Retrieval (Google Search)**
   - Chưa có message type, handler, schema, persistence cho search run/sources.
   - Chưa có chuẩn quality scoring, dedup, source credibility.

4. **Thiếu output contract chuẩn cho phân tích cổ phiếu**
   - Hiện parsing JSON ở watchlist enrich mang tính cục bộ.
   - Cần schema kết quả chung để dùng cho Watchlist/Portfolio/Research page.

5. **Compliance chưa cập nhật cho use case web search + AI**
   - Cần update docs CWS/privacy: thu thập gì từ query, lưu bao lâu, chia sẻ cho Google/LLM provider như thế nào.

---

## 3) Kiến trúc thống nhất đề xuất (Simple nhưng Scale tốt)

## 3.1 Design principles

1. **Single orchestration path** cho tất cả AI stock analysis.
2. **Provider-agnostic**: ChatGPT/Gemini chỉ là plug-in phía cuối pipeline.
3. **Retrieval-first**: luôn có bước tìm kiếm + làm sạch context trước khi gọi AI.
4. **Structured output first**: AI trả JSON contract rõ ràng, giảm lỗi parse.
5. **Supabase-first persistence**: không lưu business data cố định ở local.
6. **MV3-safe**: background stateless, state tạm chỉ để job control TTL.

## 3.2 Target flow

```text
UI (Stock Research)
  -> MESSAGE_TYPES.STOCK_RESEARCH_RUN
Background handler (stockResearch.js)
  -> Search service (Google Search via Supabase Edge Function)
  -> Source ranking/dedup/chunking
  -> Prompt composer (query + market data + top sources)
  -> LLM service (provider: chatgpt|gemini)
  -> JSON validator (zod-like manual schema or strict parser)
  -> Persist (research_runs, research_sources, research_outputs)
  -> Broadcast progress events
UI renders result + source citations + confidence + actions
```

## 3.3 Logical components

### A. Retrieval Layer (mới)
- `src/background/services/search/googleSearchService.js`
- Thực thi qua **Supabase Edge Function proxy** để bảo vệ API key.
- Input: stock symbol + market + optional timeframe.
- Output: normalized list `{title, url, snippet, sourceType, publishedAt, score}`.

### B. Orchestrator Layer (mới)
- `src/background/handlers/stockResearch.js`
- Điều phối nhiều bước: validate → retrieval → LLM → parse → persist.
- Có trạng thái tiến trình: queued/running/retrieving/evaluating/done/failed.

### C. LLM Layer (chuẩn hóa)
- Tái dùng `LLMProviderFactory`, nhưng **tất cả flow stock analysis gọi qua 1 service chung**.
- `SEND_PROMPT` giữ cho backward compatibility; flow mới không phụ thuộc trực tiếp ChatGPT DOM.

### D. Output Contract
Chuẩn JSON output cho stock analysis:
```json
{
  "symbol": "FPT",
  "recommendation": "BUY|HOLD|SELL|WATCH",
  "confidence": 0.0,
  "targetPrice": 0,
  "stopLoss": 0,
  "timeHorizon": "1-3m",
  "thesis": ["...", "..."],
  "risks": ["..."],
  "catalysts": ["..."],
  "sources": [
    {"url":"...","reason":"...","credibility":"high|medium|low"}
  ]
}
```

---

## 4) Phản biện kiến trúc và quyết định thống nhất

## 4.1 Các phương án

### Phương án A — Giữ nguyên 2 luồng, thêm search vào từng luồng
- Ưu: nhanh cho bản đầu
- Nhược: duplicate logic, khó test, khó mở rộng, chi phí bảo trì cao

### Phương án B — Hợp nhất về `LLM_SEND_PROMPT` + thêm retrieval orchestration (khuyến nghị)
- Ưu: một chuẩn duy nhất, dễ scale provider/search source, dễ observability
- Nhược: cần refactor có kiểm soát các flow legacy

## 4.2 Quyết định kiến trúc đề xuất

**Chọn phương án B.**  
Đưa toàn bộ stock AI use case về 1 orchestration handler (`stockResearch.js`) và 1 adapter gọi LLM provider.  
Các flow cũ (`TeaStockModal`, `EvaluatePortfolioModal`, `watchlistEnrich`) migrate dần sang flow mới theo phase.

---

## 5) Thay đổi kỹ thuật cần thiết (chi tiết theo layer)

## 5.1 Message schema (`src/shared/messageSchema.js`)

Thêm message types mới:
- `STOCK_RESEARCH_RUN`
- `STOCK_RESEARCH_STATUS`
- `STOCK_RESEARCH_DONE`
- `STOCK_RESEARCH_FAILED`
- `STOCK_RESEARCH_GET_HISTORY`
- `STOCK_RESEARCH_HISTORY_DATA`

Và retrieval types nội bộ (nếu cần tách):
- `SEARCH_GOOGLE_RUN`
- `SEARCH_GOOGLE_RESULT`

## 5.2 Background handlers

### New: `src/background/handlers/stockResearch.js`
Chức năng:
1. Validate input
2. Fetch config/settings user
3. Call Google Search service
4. Compose prompt with sources + market snapshot
5. Call `LLMProviderFactory.create(config).sendPrompt(...)`
6. Parse/validate JSON result
7. Persist to Supabase
8. Broadcast status events

### Update: `src/background/handlers/index.js`
- Đăng ký `stockResearch.js`

### Update: `src/background/handlers/watchlistEnrich.js`
- Refactor để gọi shared orchestrator/service thay vì logic ChatGPT-only inline
- Hoặc giữ file nhưng delegate sang service dùng provider + retrieval option

### Update: `src/background/handlers/llmProvider.js`
- Chuẩn hóa response/error code bằng `MESSAGE_TYPES.*` (không hardcoded string)
- Bổ sung cấu hình per-feature: provider mặc định cho stock analysis

## 5.3 Shared services

### New: `src/background/services/search/googleSearchService.js`
- Gọi Supabase Edge Function
- Normalize/dedup/rank sources
- Retry/backoff + timeout policy

### New: `src/background/services/stock/stockResearchOrchestrator.js`
- Chứa business flow độc lập khỏi handler
- Cho phép tái dùng từ watchlist/portfolio/research page

### Update: `src/shared/llm/ChatGPTProvider.js`
- Loại bỏ dynamic import không cần thiết trong SW path
- Dùng static service adapter an toàn MV3

## 5.4 UI / UX

### Settings
`src/ui-preact/settings/LLMProviderSection.jsx` + settings page:
- Thêm lựa chọn mặc định provider cho “Stock Analysis” (`chatgpt`/`gemini`)
- Thêm toggle “Bật Google Search trước AI”
- Thêm số lượng nguồn tối đa (ví dụ 5/10)

### Stock research experience
- Nâng cấp `TeaStockModal.jsx` thành “Stock Research Modal”:
  - Input: mã cổ phiếu + tùy chọn provider
  - Hiển thị nguồn đã thu thập
  - Hiển thị đánh giá cấu trúc (recommendation/confidence/risk)

### Watchlist
`WatchlistPage`:
- Enrich mỗi mã dùng `STOCK_RESEARCH_RUN` (có `mode: watchlist-enrich`)
- Mapping output vào fields watchlist (`entry/target/stoploss/investment_thesis`)

## 5.5 Supabase (schema + functions)

### New tables

1) `stock_research_runs`
- id, user_id, symbol, provider, status
- query, options, started_at, finished_at
- confidence, recommendation, raw_output_json

2) `stock_research_sources`
- id, run_id, title, url, snippet
- source_type, score, published_at

3) `stock_research_insights`
- id, run_id, symbol
- target_price, stop_loss, horizon, thesis(jsonb), risks(jsonb), catalysts(jsonb)

RLS: `auth.uid() = user_id` (trực tiếp hoặc qua join run_id → user_id).

### Edge Function mới
`supabase/functions/google-search-proxy`
- Input: `{ query, locale, market }`
- Output: normalized search results
- Secret key ở Supabase secrets (không ở extension)

## 5.6 Compliance & docs

Cập nhật docs:
- `docs/CWS_LISTING.md`
- Privacy/Disclosure sections trong proposal/tài liệu public

Nội dung bắt buộc:
- Thu thập gì: stock symbol/query, prompt, nguồn tìm kiếm đã chọn
- Mục đích: phân tích cổ phiếu
- Chia sẻ: Google Search API provider + LLM provider theo user chọn
- Lưu trữ: runs/sources/outputs trên Supabase theo user_id
- Quyền user: xóa lịch sử research/export data

---

## 6) Roadmap triển khai (đề xuất)

## Phase 0 — Alignment & ADR (2-3 ngày)
- Chốt kiến trúc B (unified orchestrator)
- Viết ADR ngắn: vì sao không giữ 2 luồng
- Chốt API search provider (Google CSE/Serper/SerpAPI)

**Deliverable:** ADR + spec message + schema draft

## Phase 1 — Foundation (1 tuần)
- Migration tạo 3 bảng research
- Edge Function `google-search-proxy`
- `googleSearchService` + retry/timeout/ranking
- Message types mới trong `messageSchema`

**Deliverable:** Retrieval hoạt động độc lập, có log + persisted sources

## Phase 2 — Unified orchestration + Gemini/ChatGPT switch (1 tuần)
- `stockResearchOrchestrator` + `stockResearch` handler
- Chuẩn output JSON + parser/validator
- Settings: chọn provider + bật/tắt retrieval

**Deliverable:** Chạy end-to-end symbol → search → AI → result JSON

## Phase 3 — UI integration (1 tuần)
- Nâng cấp TeaStock modal thành Stock Research modal
- Watchlist enrich migrate sang orchestration mới
- Hiển thị nguồn + confidence + recommendation

**Deliverable:** UX hoàn chỉnh cho người dùng cuối

## Phase 4 — Hardening & Scale (1 tuần)
- Rate limit, quota, caching theo symbol/time window
- Telemetry cho failure points (search fail, parse fail, provider fail)
- E2E + unit tests cho parser/orchestrator
- Cập nhật CWS/privacy docs

**Deliverable:** Sẵn sàng release beta thương mại

---

## 7) Kế hoạch migration từ code hiện tại

1. Không xóa ngay `SEND_PROMPT` (tránh phá tính năng khác)
2. Feature flag cho stock flow mới: `settings.config.stock_research_v2 = true`
3. Migrate theo thứ tự:
   - TeaStockModal
   - Watchlist enrichment
   - Portfolio evaluation
4. Sau khi ổn định, chuyển dần các flow AI còn lại sang orchestration chung

---

## 8) Rủi ro và biện pháp giảm thiểu

1. **Search API chi phí cao / quota thấp**
   - Mitigation: cache theo symbol+day, giới hạn max sources, plan gating

2. **AI output không đúng schema**
   - Mitigation: strict JSON schema prompt + auto-retry 1 lần + fallback partial parser

3. **MV3 SW lifecycle gây job dở dang**
   - Mitigation: persist trạng thái run trong Supabase + resume idempotent

4. **Compliance risk khi thêm external processing**
   - Mitigation: update disclosure + user control + data retention policy rõ ràng

---

## 9) Backlog/Jira gợi ý (Epic-level)

- EPIC A: Stock Research Retrieval Layer
  - A1: Google Search Proxy Edge Function
  - A2: Search service + source normalization
  - A3: Search persistence tables + RLS

- EPIC B: Unified AI Orchestration
  - B1: StockResearch handler + orchestrator
  - B2: LLM provider routing (chatgpt/gemini)
  - B3: Structured output validation

- EPIC C: UI/Settings Integration
  - C1: Provider/search settings for stock analysis
  - C2: Stock Research modal v2
  - C3: Watchlist enrich migration

- EPIC D: Reliability & Compliance
  - D1: Caching/rate limiting
  - D2: Observability dashboard (errors, latency, success rate)
  - D3: CWS privacy disclosure update

---

## 10) Kết luận

Để đáp ứng yêu cầu “Google Search trước AI” và “Gemini thay thế ChatGPT”, dự án **không cần viết lại từ đầu**; nền tảng hiện tại đã đủ mạnh.  
Điểm quyết định là **hợp nhất kiến trúc AI stock analysis về một pipeline orchestration duy nhất** thay vì tiếp tục thêm tính năng trên các luồng rời rạc.

Làm theo roadmap 4 phase ở trên sẽ đạt được:
- Tính năng đúng nhu cầu người dùng (search + AI evaluation)
- Kiến trúc đơn giản hơn ở cấp hệ thống (single path)
- Khả năng scale tốt hơn (nhiều provider, nhiều search source, nhiều use-case)
- Giảm rủi ro vận hành/compliance khi thương mại hóa.
