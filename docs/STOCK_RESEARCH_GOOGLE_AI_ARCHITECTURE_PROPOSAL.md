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

**Thiết kế cân bằng đề xuất:**
- V1 dùng pipeline chuẩn cố định nhưng cho phép cấu hình tham số từng node (bật/tắt, top-k, timeout, model).
- Chưa triển khai node-editor kéo-thả tự do trong Settings ở giai đoạn đầu để tránh tăng độ phức tạp vận hành.
- Khi dữ liệu usage đủ lớn mới mở rộng sang preset nâng cao hoặc visual builder có guardrails.

---

## 2) Review kiến trúc hiện tại (liên quan yêu cầu)

### 2.1 Điểm mạnh

- Có `LLMProviderFactory` + `GeminiProvider` + UI chọn provider (`LLMProviderSection`) → đã sẵn “Gemini as alternative”.
- Có watchlist enrichment queue-based (`WATCHLIST_AI_ENRICH_RUN`) → phù hợp chạy workflow nhiều bước.
- Có `settings` table JSONB, dễ mở rộng cấu hình search/provider per-user.
- Có Supabase Edge Functions, phù hợp proxy API keys và xử lý server-side cho external search.

### 2.2 Trạng thái triển khai thực tế (As-is)

> Mục tiêu của phần này: làm rõ chính xác cái gì đã chạy production-ready, cái gì mới ở mức khung, và cái gì chưa làm.

| Hạng mục | Trạng thái | Ghi chú thực tế |
|---|---|---|
| `LLMProviderFactory` + provider metadata | ✅ Đã implement | Có `chatgpt`, `claude`, `gemini` trong shared layer |
| `GeminiProvider` class | ✅ Đã implement (core class) | Có gọi Google Generative Language API |
| `ClaudeProvider` class | ✅ Đã implement (core class) | Có gọi Anthropic Messages API |
| `llmProvider` handler (`LLM_GET_*`, `LLM_SET_PROVIDER`) | ✅ Đã implement | Có lưu provider/key/model vào `settings.config` |
| UI settings chọn provider (`LLMProviderSection`) | ✅ Đã implement | Có form chọn provider + nhập key/model |
| Áp dụng provider cho toàn bộ flow stock AI | ⚠️ Mới implement một phần | Các flow stock chính vẫn chủ yếu đi qua `SEND_PROMPT` (ChatGPT web path) |
| Google Search retrieval layer | ❌ Chưa implement | Chưa có `googleSearchService`, chưa có search handler/message/schema/persistence |
| Stock research unified orchestrator | ❌ Chưa implement | Chưa có `stockResearch.js` + `stockResearchOrchestrator.js` |
| Output contract chuẩn hóa toàn hệ | ⚠️ Mới implement cục bộ | Watchlist enrich có parse JSON cục bộ, chưa có contract thống nhất cho mọi use-case |
| Edge function `google-search-proxy` | ❌ Chưa implement | Chưa có function + secret/config vận hành |
| Bảng dữ liệu research (`runs/sources/insights`) | ❌ Chưa implement | Chưa có migration + RLS cho các bảng này |

### 2.3 Chưa implement (ưu tiên cao)

1. Retrieval-first pipeline (Google Search trước AI)
2. Unified orchestration dùng chung cho TeaStock/Watchlist/Portfolio
3. Bắt buộc structured output schema cho mọi stock analysis run
4. Persistence chuẩn cho research sources + run audit trail
5. End-to-end observability theo từng bước pipeline (retrieve/filter/llm/validate/persist)

### 2.4 Điểm yếu hiện tại

1. **Provider abstraction có nhưng chưa là đường chính**
   - Hệ thống có lớp provider nhưng phần lớn nghiệp vụ stock vẫn gọi luồng ChatGPT legacy.

2. **Rủi ro chất lượng đầu ra do thiếu retrieval + citation chuẩn**
   - Chưa có lớp thu thập/lọc nguồn trước AI, nên khó đảm bảo tính cập nhật và khả năng kiểm chứng.

3. **Thiếu cơ chế chuẩn hóa output liên use-case**
   - Mỗi feature có thể parse theo cách riêng, tăng rủi ro sai format khi mở rộng.

4. **Thiếu readiness cho scale thương mại ở tầng AI workflow**
   - Chưa có cost guardrails theo run/mode/user; chưa có SLO rõ cho pipeline AI.

### 2.5 Các vấn đề chưa consistency

1. **Inconsistency về đường đi AI**
   - Song song tồn tại `SEND_PROMPT` (legacy) và `LLM_SEND_PROMPT` (provider path), nhưng chưa có chiến lược route thống nhất theo use-case.

2. **Inconsistency về message contract sử dụng trong UI modules**
   - Một số chỗ vẫn ưu tiên legacy flow thay vì unified stock-research contract mới.

3. **Inconsistency về mức độ chuẩn hóa response parsing**
   - Có nơi parse tự do từ text, có nơi kỳ vọng JSON; chưa có shared validator bắt buộc.

4. **Inconsistency giữa năng lực cấu hình và năng lực thực thi**
   - UI đã cho chọn provider, nhưng hành vi runtime của các tính năng stock chưa đồng nhất theo provider đã chọn.

### 2.6 Vấn đề cần xử lý

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

## 3.4 Balanced Pipeline Design (khuyến nghị triển khai)

### V1 — Fixed Pipeline + Configurable Parameters

Pipeline lõi được cố định theo thứ tự để đảm bảo tính ổn định:

1. `InputNode` — chuẩn hóa symbol/query
2. `SearchNode` — gọi Google Search proxy
3. `FilterRankNode` — dedup + trust scoring + freshness
4. `ContextBuilderNode` — build context gọn cho AI
5. `LLMNode` — gọi provider (`chatgpt` hoặc `gemini`)
6. `ValidatorNode` — kiểm tra JSON contract
7. `PersistNode` — lưu run/sources/output

Người dùng chỉ cấu hình tham số node, không tự nối graph:
- `maxSources`
- `trustedDomains`
- `recencyWindowDays`
- `provider`
- `model`
- `strictValidation`
- `timeoutMs`

### V2 — Preset Pipelines

Thêm các preset thay vì graph editor:
- `Conservative`: ít nguồn, ưu tiên nguồn uy tín cao, strict validation cao
- `Balanced`: cân bằng coverage/chất lượng/chi phí
- `Aggressive`: nhiều nguồn hơn, độ bao phủ cao hơn, tốn chi phí hơn

### V3 — Visual Node Builder (chỉ khi cần)

Chỉ cân nhắc khi có bằng chứng nhu cầu (enterprise/power users) và có đủ guardrails:
- Không cho phép cycle
- Whitelist node types
- Runtime budget + timeout budget bắt buộc
- Validation compile-time trước khi activate pipeline

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

Thiết kế cân bằng cho Settings (không phải node editor tự do):
- `pipeline_mode`: `conservative | balanced | aggressive`
- `pipeline_overrides`: object chứa override tham số node (optional)
- `search_enabled`: boolean
- `max_sources`: number
- `strict_validation`: boolean
- `provider`: `chatgpt | gemini`

Ví dụ cấu hình lưu trong `settings.config`:
```json
{
   "stock_research": {
      "pipeline_mode": "balanced",
      "search_enabled": true,
      "max_sources": 8,
      "strict_validation": true,
      "provider": "gemini",
      "pipeline_overrides": {
         "recencyWindowDays": 14,
         "trustedDomains": ["cafef.vn", "vietstock.vn", "ssi.com.vn"]
      }
   }
}
```

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
- Chốt mô hình triển khai cân bằng: fixed pipeline + parameterized nodes (không visual builder ở V1)
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
- Settings: chọn provider + bật/tắt retrieval + pipeline mode + node parameter overrides

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
- Bổ sung preset tuning (`conservative/balanced/aggressive`) dựa trên dữ liệu thực tế

**Deliverable:** Sẵn sàng release beta thương mại

## Phase 5 — Advanced Workflow (Optional, sau beta)
- Chỉ cân nhắc visual node builder khi có nhu cầu enterprise rõ ràng
- Thêm pipeline compiler + graph validation + runtime guardrails
- A/B test so sánh với preset mode để chứng minh hiệu quả

**Deliverable:** Quyết định Go/No-Go cho node editor tự do

---

## 7) Kế hoạch migration từ code hiện tại

1. Không xóa ngay `SEND_PROMPT` (tránh phá tính năng khác)
2. Feature flag cho stock flow mới: `settings.config.stock_research_v2 = true`
3. Migrate theo thứ tự:
   - TeaStockModal
   - Watchlist enrichment
   - Portfolio evaluation
4. Sau khi ổn định, chuyển dần các flow AI còn lại sang orchestration chung
5. Chỉ mở rộng visual node builder sau khi preset mode đạt KPI ổn định

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

- EPIC E: Pipeline Presets & Controls
   - E1: Pipeline mode settings (`conservative/balanced/aggressive`)
   - E2: Parameter override engine + validation
   - E3: KPI dashboard cho quality/cost/latency theo mode

- EPIC F: Visual Builder (Optional)
   - F1: Node graph schema + validator
   - F2: Safe runtime executor (acyclic + budgets)
   - F3: Controlled rollout cho power users

---

## 10) Kết luận

Để đáp ứng yêu cầu “Google Search trước AI” và “Gemini thay thế ChatGPT”, dự án **không cần viết lại từ đầu**; nền tảng hiện tại đã đủ mạnh.  
Điểm quyết định là **hợp nhất kiến trúc AI stock analysis về một pipeline orchestration duy nhất** thay vì tiếp tục thêm tính năng trên các luồng rời rạc.

Làm theo roadmap 4 phase ở trên sẽ đạt được:
- Tính năng đúng nhu cầu người dùng (search + AI evaluation)
- Kiến trúc đơn giản hơn ở cấp hệ thống (single path)
- Khả năng scale tốt hơn (nhiều provider, nhiều search source, nhiều use-case)
- Giảm rủi ro vận hành/compliance khi thương mại hóa.
