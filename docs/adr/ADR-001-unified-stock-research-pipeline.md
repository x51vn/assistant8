# ADR-001: Unified Stock Research Pipeline Architecture

| Field        | Value                                        |
|-------------|----------------------------------------------|
| **Status**  | Accepted                                     |
| **Date**    | 2026-02-22                                   |
| **Authors** | ChatGPT Assistant Team                       |
| **Ticket**  | XST-787                                      |
| **Epic**    | XST-781 — Architecture Alignment & ADR       |
| **Ref**     | docs/STOCK_RESEARCH_GOOGLE_AI_ARCHITECTURE_PROPOSAL.md |

---

## 1. Context

### 1.1 Current State

ChatGPT Assistant (Chrome MV3 extension) hiện có **hai luồng AI rời rạc** cho stock analysis:

| Luồng | Message Type | Mechanism | Files |
|-------|-------------|-----------|-------|
| **Legacy** | `SEND_PROMPT` / `CHATGPT_SEND_INPUT` | DOM automation trên ChatGPT web | `src/background/handlers/prompt.js`, `src/content.js` |
| **Provider** | `LLM_SEND_PROMPT` | API trực tiếp (Gemini/Claude/ChatGPT API) | `src/background/handlers/llmProvider.js`, `src/shared/llm/LLMProviderFactory.js` |

Cả hai luồng đều được sử dụng bởi các features stock analysis:
- `TeaStockModal.jsx` → `SEND_PROMPT` (legacy)
- `watchlistEnrich.js` → `ChatGPTSession.sendInput()` (legacy DOM)
- `EvaluatePortfolioModal.jsx` → `SEND_PROMPT` (legacy)

### 1.2 Problems

1. **Phân mảnh**: 3 features stock cùng mục đích nhưng mỗi cái có logic AI riêng, parse response riêng.
2. **Thiếu retrieval**: Không có bước tìm kiếm thông tin thực tế trước khi gọi AI → AI "hallucinate" dữ liệu tài chính.
3. **Thiếu output contract**: Watchlist enrich parse JSON cục bộ; TeaStockModal nhận text tự do; EvaluatePortfolioModal parse riêng → fragile.
4. **MV3 compliance risk**: `ChatGPTProvider` dùng `import()` dynamic → không ổn định trong Service Worker.
5. **Không scale**: Thêm tính năng mới (ví dụ: sector analysis) phải duplicate logic ở cả 2 luồng.

### 1.3 Requirements

- Cho phép **Google Search trước AI** để AI có dữ liệu thực tế.
- Cho phép **Gemini thay thế ChatGPT** (hoặc dùng song song) cho stock analysis.
- **Structured output**: JSON contract chuẩn cho mọi stock analysis result.
- **Backward compatible**: Legacy flow không bị break ngay lập tức.
- **MV3-safe**: Stateless background, no dynamic import, no WebSocket in SW.

---

## 2. Decision

### 2.1 Architecture Choice

**Chọn Phương án B: Hợp nhất về 1 pipeline orchestration duy nhất.**

Tất cả stock AI use-cases (research, watchlist enrich, portfolio evaluation) sẽ đi qua 1 orchestrator:

```
UI → STOCK_RESEARCH_RUN → Background Handler
  → stockResearchOrchestrator.runStockResearch()
    → Step 1: Input validation + config loading
    → Step 2: Google Search (via Supabase Edge Function proxy)
    → Step 3: Source ranking, dedup, filtering
    → Step 4: LLM Provider call (ChatGPT API / Gemini API)
    → Step 5: JSON output validation
    → Step 6: Persist to Supabase (runs/sources/insights)
  → STOCK_RESEARCH_DONE / STOCK_RESEARCH_FAILED → UI
```

### 2.2 Why Not Option A (giữ 2 luồng, thêm search vào mỗi luồng)?

| Criteria | Option A (2 luồng) | Option B (unified) |
|----------|--------------------|--------------------|
| Development speed V1 | ⚡ Nhanh hơn ban đầu | 🐢 Cần refactor |
| Maintenance cost | ❌ Cao — duplicate logic | ✅ Thấp — single path |
| Testability | ❌ Khó — 2 code paths | ✅ Dễ — 1 code path |
| Provider flexibility | ⚠️ Phải thêm vào cả 2 | ✅ Thêm 1 lần, dùng everywhere |
| Output consistency | ❌ Mỗi nơi parse riêng | ✅ 1 JSON contract |
| Observability | ❌ Metrics phân tán | ✅ Single pipeline telemetry |
| Scale to new features | ❌ Phải modify 2 luồng | ✅ Thêm mode vào orchestrator |

**Kết luận**: Option A nhanh hơn ban đầu nhưng chi phí bảo trì tăng theo số features. Option B đầu tư upfront nhưng mọi feature mới chỉ cần thêm mode vào orchestrator.

### 2.3 Search API Provider Choice

| Provider | Free Tier | Paid Price | Rate Limit | Quality | Integration Complexity |
|----------|-----------|------------|------------|---------|----------------------|
| **Google Custom Search Engine (CSE)** | 100 queries/day | $5/1000 queries | 100/day free, 10K/day paid | ⭐⭐⭐⭐⭐ Google index | Medium — REST API + Supabase Edge Function proxy |
| **Serper.dev** | 2,500 queries (one-time) | $50/50K queries | 60 RPM | ⭐⭐⭐⭐ Google results | Low — simple REST API |
| **SerpAPI** | 100 searches/month | $50/5K searches | 30 RPM | ⭐⭐⭐⭐ Multi-engine | Medium — SDK available |

**Chọn: Google Custom Search Engine (CSE)**

Lý do:
1. **Chất lượng cao nhất**: Trực tiếp dùng Google index, kết quả tốt nhất cho tin tức chứng khoán Việt Nam.
2. **Minh bạch**: Là first-party Google product, không qua trung gian.
3. **Free tier đủ dùng**: 100 queries/day miễn phí, phù hợp cho beta.
4. **Scalable**: Có thể upgrade lên 10K/day với giá hợp lý ($5/1000).
5. **Proxy pattern**: API key sẽ nằm ở Supabase Edge Function secrets, không expose trong extension code.

### 2.4 Pipeline Design: Fixed Pipeline V1

V1 dùng **fixed pipeline** với configurable parameters (không visual node builder):

```
InputNode → SearchNode → FilterRankNode → ContextBuilderNode → LLMNode → ValidatorNode → PersistNode
```

User chỉ cấu hình tham số, không tự nối graph:
- `provider`: `chatgpt` | `gemini`
- `searchEnabled`: boolean
- `maxSources`: 1-20 (default 8)
- `recencyWindowDays`: 1-90 (default 14)
- `strictValidation`: boolean
- `trustedDomains`: string[]
- `timeoutMs`: number (default 30000)

Visual node builder chỉ cân nhắc ở V3 khi có nhu cầu enterprise rõ ràng.

---

## 3. Consequences

### 3.1 Positive

- **Single code path**: Mọi stock AI analysis đi qua 1 orchestrator → dễ debug, test, monitor.
- **Provider-agnostic**: Thay đổi LLM provider chỉ cần config, không sửa business logic.
- **Retrieval-first**: Google Search cung cấp dữ liệu thực tế → giảm hallucination.
- **Structured output**: JSON contract chuẩn → UI consistent, data queryable.
- **Future-proof**: Thêm modes mới (sector analysis, screener) chỉ cần thêm orchestrator mode.

### 3.2 Negative

- **Migration effort**: 3 features cần migrate sang orchestrator (TeaStockModal, watchlistEnrich, EvaluatePortfolio).
- **Feature flag complexity**: Cần `stock_research_v2` flag trong transition period.
- **Search API cost**: Google CSE có giới hạn 100 queries/day free → cần caching + rate limiting.
- **External dependency**: Thêm Google as external dependency → cần fallback nếu Google down.

### 3.3 Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Search API quota exceeded | Medium | Medium | Caching by symbol+day, rate limiting, graceful degradation (AI-only mode) |
| AI output không đúng schema | Medium | Low | Strict JSON schema prompt, auto-retry 1 lần, fallback partial parser |
| MV3 SW terminate mid-pipeline | Low | Medium | Persist run status to Supabase, idempotent resume |
| Google CSE quality kém cho VN stocks | Low | High | Configurable trusted domains, fall back to Serper if needed |

---

## 4. Impact on Existing Features

### 4.1 Files Affected (Migration Required)

| File | Current Behavior | Migration Plan |
|------|-----------------|----------------|
| `src/ui-preact/components/TeaStockModal.jsx` | `SEND_PROMPT` (legacy) | → `STOCK_RESEARCH_RUN` (behind flag) |
| `src/background/handlers/watchlistEnrich.js` | `ChatGPTSession.sendInput()` | → `orchestrator.runStockResearch(symbol, {mode: 'watchlist-enrich'})` |
| `src/ui-preact/components/EvaluatePortfolioModal.jsx` | `SEND_PROMPT` (legacy) | → `STOCK_RESEARCH_RUN` with `mode: 'portfolio-eval'` |
| `src/shared/llm/ChatGPTProvider.js` | `import()` dynamic | → Static import hoặc service adapter |

### 4.2 Files New (Foundation)

| File | Purpose |
|------|---------|
| `src/background/services/search/googleSearchService.js` | Google Search + dedup + ranking |
| `src/background/services/stock/stockResearchOrchestrator.js` | Pipeline orchestration |
| `src/background/handlers/stockResearch.js` | Message handler for STOCK_RESEARCH_* |
| `supabase/migrations/018_create_stock_research_tables.sql` | DB tables |
| `supabase/functions/google-search-proxy/index.ts` | Edge Function proxy |

### 4.3 Files Unchanged

- `src/shared/messageSchema.js` — additive only (new message types)
- `src/background/handlers/index.js` — additive only (new import)
- `src/background/handlers/prompt.js` — kept for backward compatibility
- `src/background/handlers/llmProvider.js` — reused by orchestrator

---

## 5. Migration Strategy

1. **Feature flag**: `settings.config.stock_research_v2 = true` (per-user)
2. **Migration order**: TeaStockModal → Watchlist Enrich → Portfolio Eval
3. **Backward compat**: `SEND_PROMPT` path preserved until all 3 features migrated
4. **Rollback**: Flag off → instant revert to legacy behavior
5. **Deprecation timeline**: Legacy path marked deprecated after 2 sprints of stable V2 usage

---

## 6. Alignment with MV3 Constraints

| MV3 Constraint | How ADR Complies |
|---------------|------------------|
| SW can terminate anytime | Pipeline state persisted to Supabase `stock_research_runs` |
| No in-memory state | Orchestrator is stateless; each run is independent Supabase call |
| No dynamic imports | ChatGPTProvider fix: static import or service adapter |
| Sync listener registration | Handler registered at top-level in `handlers/index.js` |
| No WebSocket in SW | Realtime subscriptions (if any) only in UI side panel |

---

## 7. Related Documents

- Architecture Proposal: [docs/STOCK_RESEARCH_GOOGLE_AI_ARCHITECTURE_PROPOSAL.md](../STOCK_RESEARCH_GOOGLE_AI_ARCHITECTURE_PROPOSAL.md)
- Message Schema Spec: [docs/specs/stock-research-message-schema.md](../specs/stock-research-message-schema.md)
- DB Migration: `supabase/migrations/018_create_stock_research_tables.sql`
- Jira Epic: XST-781 (Architecture Alignment & ADR)

---

## 8. Decision Record

| Date | Decision | By |
|------|----------|----|
| 2026-02-22 | ADR created, Option B accepted, Google CSE chosen | Team |
