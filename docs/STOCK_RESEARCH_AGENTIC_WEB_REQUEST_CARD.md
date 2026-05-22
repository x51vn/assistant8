# Stock Research Agentic Web Research — Request Card

| Field        | Value |
|-------------|-------|
| **Status**  | Proposed |
| **Date**    | 2026-03-07 |
| **Ticket**  | TBD |
| **Epic**    | Stock Research V2 / Agentic Retrieval Evolution |
| **Ref**     | `src/background/services/stock/stockResearchOrchestrator.js`, `src/background/services/search/googleSearchWebService.js`, `src/background/handlers/contextMenu.js`, `src/shared/llmClient.js` |

---

## 1. Request Summary

Mục tiêu của request này là nâng stock research pipeline từ mô hình:

```text
Google SERP snippet -> LLM -> JSON
```

thành mô hình:

```text
Google Web Search (DOM) -> URL discovery -> open valid pages -> content extraction
-> micro AI tasks -> bounded agent loop -> final synthesis with citations
```

### 1.1 Các yêu cầu bắt buộc

1. Mặc định bật `google web-search DOM`.
2. Mặc định mở các URL hợp lệ lấy được từ Google Search.
3. Hỗ trợ mở tuần tự danh sách website cấu hình trong Settings để lấy thêm thông tin.
4. Loại Google SERP khỏi reasoning path chính.
5. Tận dụng `llmClient` đã có cho các AI tasks nhỏ:
   - trích xuất keyword
   - tìm navigation
   - phân loại DOM/text
   - tóm tắt
   - phân loại văn bản
6. Đề xuất vòng lặp agent-agent có giới hạn để phân tích cổ phiếu.

---

## 2. Current State

### 2.1 Những gì repo đã có

1. `googleSearchWebService` đã tồn tại và đang dùng DOM automation trên Google Search để lấy kết quả organic:
   - `src/background/services/search/googleSearchWebService.js`
   - Service này normalize, dedup, rank và cache kết quả.

2. `stockResearchOrchestrator` đã có retrieval-first pipeline theo mức khái niệm:
   - `src/background/services/stock/stockResearchOrchestrator.js`
   - Bước search hiện đang gọi `searchGoogleWeb()`.

3. `contextMenu.js` đã có generic extractor cho bài viết/web page:
   - `src/background/handlers/contextMenu.js`
   - Logic hiện tại có thể tái sử dụng cho article/body extraction thay vì viết extractor mới từ đầu.

4. `llmClient` đã có các API public đủ để làm lightweight microtasks:
   - `chat()`
   - `streamChat()`
   - `summarize()`
   - file: `src/shared/llmClient.js`

5. `StockResearchSection` và `pipelinePresets` đã có settings/preset cho search pipeline:
   - `src/ui-preact/settings/StockResearchSection.jsx`
   - `src/shared/pipelinePresets.js`

### 2.2 Điểm yếu hiện tại

1. `stockResearchOrchestrator` mới đưa `title + url + snippet` vào prompt, chưa đọc nội dung bài nguồn.
2. Google SERP hiện đang đóng vai trò evidence chính, trong khi nó chỉ là discovery layer.
3. Chưa có cơ chế mở tuần tự danh sách site cấu hình bởi user.
4. Chưa có lớp microtask AI riêng cho keyword extraction / navigation detection / text classification.
5. Chưa có bounded multi-agent loop để tự kiểm tra thiếu bằng chứng và re-search có kiểm soát.

---

## 3. Goals

### 3.1 Goals

1. Mọi stock analysis mặc định đi qua `google DOM search`.
2. Kết quả cuối chỉ dựa trên nội dung đã fetch/extract từ page hợp lệ, không dựa trực tiếp vào SERP snippet.
3. Cho phép cấu hình danh sách website seed trong Settings và mở tuần tự để bổ sung nguồn.
4. Tách các micro AI tasks nhỏ ra khỏi main synthesis call để giảm prompt monolith.
5. Thiết kế bounded agent loop chạy được trong môi trường MV3 extension.
6. Giữ tính tương thích với settings/preset hiện có.

### 3.2 Non-goals

1. Không xây visual workflow builder.
2. Không xây autonomous agent loop vô hạn.
3. Không thay toàn bộ provider stack hiện tại của `LLMProviderFactory`.
4. Không đưa browser automation ra khỏi extension ở phase này.

---

## 4. Decision Summary

| Request | Decision |
|--------|----------|
| Mặc định bật web-search DOM | `stock_research.searchProvider = "google_dom"` và `searchEnabled = true` là default |
| Mặc định mở URL valid trên Google | Sau khi rank xong, mở tuần tự top URLs hợp lệ để extract nội dung |
| Mở danh sách website cấu hình | Thêm `seedSites[]` trong Settings, chạy theo `pageOpenStrategy = sequential` |
| Xóa Google SERP | SERP chỉ còn là discovery metadata; không dùng snippet làm evidence chính, không đưa snippet vào final synthesis |
| Dùng `llmClient` cho simple AI tasks | Thêm wrapper `llmMicroTasks` dùng `llmClient.chat()` / `summarize()` cho task nhỏ, fallback về heuristic nếu không có key |
| Agent-agent loop | Dùng bounded loop gồm planner -> retriever -> extractor -> synthesizer -> critic -> optional re-search |

---

## 5. Proposed Architecture

## 5.1 High-level Flow

```text
UI
  -> STOCK_RESEARCH_RUN
  -> stockResearch handler
  -> agenticStockResearchOrchestrator
       1. Planner
       2. Google discovery
       3. URL validation
       4. Sequential page opening
       5. DOM/content extraction
       6. Micro AI tasks
       7. Evidence synthesis
       8. Critic/gap analysis
       9. Optional re-search
      10. Final stock analysis
      11. Persist
  -> STOCK_RESEARCH_DONE / FAILED
```

## 5.2 New Runtime Principle

Google Search không còn là nơi cung cấp "nội dung để LLM suy luận".

Google Search chỉ có 3 nhiệm vụ:

1. khám phá URL
2. xếp hạng candidate URLs
3. cung cấp metadata discovery ban đầu

Evidence hợp lệ để LLM phân tích phải đến từ:

1. page content đã được extract từ URL mở ra
2. structured summary từ page content
3. source metadata sau khi đã qua validation/classification

---

## 6. Component Design

## 6.1 Search Discovery Layer

### Reuse

- `src/background/services/search/googleSearchWebService.js`
- `src/background/services/search/searchUtils.js`
- `src/background/services/search/searchCache.js`

### Required Changes

1. Giữ `googleSearchWebService` làm default search provider.
2. Trả thêm metadata để phục vụ URL opening:
   - `domain`
   - `discoveryRank`
   - `isValidCandidate`
   - `searchRound`
3. Search result cache vẫn giữ nguyên vai trò.
4. Google tab phải luôn đóng sau extraction như hiện tại.

### Default behavior

- `searchEnabled = true`
- `searchProvider = "google_dom"`
- `maxResults = 8`
- `openValidUrls = true`

## 6.2 URL Validation Layer

Tạo một lớp validate URL trước khi mở page:

- reject `google.com`, `webcache`, redirect-only URLs
- reject unsupported protocols
- reject domains nằm ngoài allowlist nếu `strictDomainMode = true`
- ưu tiên:
  - `vietstock.vn`
  - `cafef.vn`
  - `vneconomy.vn`
  - `ssi.com.vn`
  - `fireant.vn`
  - `tinnhanhchungkhoan.vn`

### Proposed new service

- `src/background/services/search/urlCandidateValidator.js`

## 6.3 Page Retrieval Layer

### Requirement

Sau Google discovery, hệ thống phải mặc định mở top URL hợp lệ để lấy thông tin.

### Behavior

1. Lấy top `N` URLs sau ranking.
2. Mở tuần tự từng URL.
3. Inject extractor.
4. Lấy:
   - title
   - canonical URL
   - main content
   - meta description
   - published time
   - table-like text blocks nếu có
5. Chuẩn hóa và cắt bớt nội dung quá dài.
6. Đóng tab.

### Reuse

- Generic extractor từ `src/background/handlers/contextMenu.js`

### Proposed new service

- `src/background/services/retrieval/pageContentService.js`

### Important rule

`pageOpenStrategy = "sequential"` là default để:

1. tránh bùng nổ tab
2. dễ trace lỗi site-specific
3. phù hợp MV3/background lifecycle

## 6.4 Seed Site Sequential Opening

Ngoài URL discovery từ Google, hệ thống cho phép user cấu hình danh sách seed sites trong Settings.

### Purpose

1. ép hệ thống luôn kiểm tra các nguồn mà user tin tưởng
2. giảm phụ thuộc hoàn toàn vào ranking của Google
3. hỗ trợ các site có structure ổn định theo ngành/chứng khoán VN

### Proposed settings shape

```json
{
  "stock_research": {
    "seedSites": [
      {
        "domain": "vietstock.vn",
        "enabled": true,
        "mode": "google_site_search"
      },
      {
        "domain": "cafef.vn",
        "enabled": true,
        "mode": "google_site_search"
      },
      {
        "domain": "fireant.vn",
        "enabled": false,
        "mode": "direct_open"
      }
    ]
  }
}
```

### Execution modes

1. `google_site_search`
   - dùng query dạng `site:vietstock.vn FPT`
   - vẫn tuân thủ yêu cầu bắt buộc dùng Google websearch

2. `direct_open`
   - mở URL/path template cấu hình sẵn nếu có

### Proposed new service

- `src/background/services/retrieval/seedSiteWalker.js`

---

## 7. Remove Google SERP from Reasoning Path

## 7.1 Meaning of "xóa Google SERP"

Không có nghĩa là bỏ Google Search khỏi hệ thống.

Nó có nghĩa là:

1. bỏ SERP snippet khỏi final prompt context
2. bỏ SERP snippet khỏi final evidence pack
3. không xem SERP row là source "đã đọc"
4. chỉ giữ SERP như discovery/debug metadata

## 7.2 Required changes in orchestrator

Hiện tại `buildAnalysisPrompt()` đang ghép:

- source title
- source URL
- source snippet

Request mới yêu cầu:

1. `buildAnalysisPrompt()` không nhận raw SERP snippets nữa
2. prompt phải nhận `evidencePack` được build từ fetched page content
3. source record phải có `sourceStage`:
   - `discovered`
   - `fetched`
   - `summarized`
   - `final_cited`

## 7.3 Persistence impact

Không bắt buộc xóa cột `snippet` ngay trong DB ở phase đầu.

Nhưng:

1. `snippet` chỉ còn là debug field
2. không dùng `snippet` trong synthesis
3. UI không hiển thị `snippet` như bằng chứng chính

---

## 8. llmClient for Simple AI Tasks

## 8.1 Why use llmClient here

`src/shared/llmClient.js` đã có:

- `chat()`
- `streamChat()`
- `summarize()`

Điều này đủ để xây một lớp microtasks riêng thay vì nhồi tất cả vào final stock prompt.

## 8.2 Proposed microtasks

### 1. Keyword extraction

Input:
- symbol
- company name nếu có
- user intent/mode
- fetched headlines/titles

Output:
- primary keywords
- secondary keywords
- negative keywords
- suggested follow-up queries

### 2. Navigation detection

Input:
- DOM fragment/text blocks từ page/listing page

Output:
- page type: `article | listing | profile | search | navigation | noise`
- probable article selectors
- probable article links

### 3. DOM block classification

Input:
- normalized DOM blocks

Output:
- `article_body`
- `headline`
- `table_like`
- `price_block`
- `sidebar`
- `noise`

### 4. Text summarization

Input:
- main article text

Output:
- short evidence summary
- facts
- numbers
- risks
- dates/events

### 5. Text relevance classification

Input:
- article text
- symbol

Output:
- `high_relevance | medium_relevance | low_relevance`
- `company_specific | sector | macro | rumor | unrelated`

## 8.3 Proposed service

- `src/background/services/microtasks/llmMicroTasks.js`

### Wrapper API

```js
extractKeywords(input, options)
detectNavigation(domBlocks, options)
classifyDomBlocks(domBlocks, options)
summarizeArticle(text, options)
classifyArticle(text, symbol, options)
```

### Implementation rule

1. Ưu tiên `llmClient.chat()` hoặc `llmClient.summarize()`.
2. Nếu không có API key cho `litellm`, fallback sang heuristic/local parser.
3. Failure của microtask không được chặn toàn bộ pipeline trừ khi task được đánh dấu là required.

## 8.4 Important note

`llmClient` hiện là API-key based path, khác với `LLMProviderFactory` đang dùng web/DOM providers.

Vì vậy request này chọn:

1. `LLMProviderFactory` tiếp tục xử lý final synthesis chính cho stock analysis
2. `llmClient` xử lý microtasks nhỏ, optional, bounded

Lý do:

1. microtasks cần output ngắn, deterministic hơn
2. microtasks có thể hưởng lợi từ `litellm` nếu key đã cấu hình
3. không phá flow provider hiện tại của main pipeline

---

## 9. Proposed Agent-Agent Loop

## 9.1 Principle

Không dùng autonomous loop vô hạn.

Dùng bounded multi-agent loop với số vòng hữu hạn:

- `maxRounds = 2`
- `maxCriticPasses = 1`
- `maxOpenedUrlsPerRound = 5`

## 9.2 Agent roles

### Agent A — Planner

Nhiệm vụ:

1. tạo search intents
2. tạo Google queries
3. quyết định có dùng seed sites hay không

Output:

- danh sách queries
- ưu tiên domain
- retrieval budget

### Agent B — Retriever

Nhiệm vụ:

1. gọi Google DOM search
2. validate URL
3. mở URL tuần tự
4. thu nội dung

Output:

- fetched pages
- fetch status
- extraction status

### Agent C — Evidence Processor

Nhiệm vụ:

1. classify text
2. summarize article
3. extract facts / catalysts / risks / numbers
4. drop noise pages

Output:

- normalized evidence pack

### Agent D — Synthesizer

Nhiệm vụ:

1. tạo stock analysis draft
2. map luận điểm tới evidence URLs
3. đánh confidence

Output:

- draft analysis JSON

### Agent E — Critic

Nhiệm vụ:

1. kiểm tra draft có thiếu bằng chứng không
2. kiểm tra contradiction giữa các nguồn
3. yêu cầu re-search nếu chưa đủ bằng chứng

Output:

- `accept`
- hoặc `retry_with_queries`

## 9.3 Loop Algorithm

```text
Round 1:
  Planner -> Retriever -> Evidence Processor -> Synthesizer -> Critic

If Critic says "insufficient evidence":
  Round 2:
    Planner(refine queries) -> Retriever -> Evidence Processor -> Synthesizer -> Critic

Stop after:
  - critic accepts
  - maxRounds reached
  - URL budget exhausted
```

## 9.4 Fail-safe

Nếu hết vòng lặp mà bằng chứng vẫn yếu:

1. trả kết quả với confidence thấp
2. ghi rõ `insufficientEvidence = true`
3. liệt kê nguồn đã đọc
4. không được bịa số liệu chưa có bằng chứng

---

## 10. Settings Contract Changes

## 10.1 Proposed settings shape

```json
{
  "stock_research": {
    "searchEnabled": true,
    "searchProvider": "google_dom",
    "openValidUrls": true,
    "pageOpenStrategy": "sequential",
    "maxSources": 8,
    "maxOpenedUrls": 5,
    "searchRoundsMax": 2,
    "recencyWindowDays": 14,
    "strictValidation": true,
    "trustedDomains": "cafef.vn, vietstock.vn, vneconomy.vn, fireant.vn, simplize.vn, tinnhanhchungkhoan.vn",
    "removeSerpFromContext": true,
    "seedSites": [
      { "domain": "vietstock.vn", "enabled": true, "mode": "google_site_search" },
      { "domain": "cafef.vn", "enabled": true, "mode": "google_site_search" },
      { "domain": "ssi.com.vn", "enabled": false, "mode": "google_site_search" }
    ],
    "microtasks": {
      "useLlmClient": true,
      "provider": "litellm",
      "keywordExtraction": true,
      "navigationDetection": true,
      "domClassification": true,
      "summarization": true,
      "textClassification": true
    },
    "agentLoop": {
      "enabled": true,
      "maxRounds": 2,
      "maxCriticPasses": 1
    }
  }
}
```

## 10.2 Default values

Các default mới cần là:

1. `searchEnabled = true`
2. `searchProvider = "google_dom"`
3. `openValidUrls = true`
4. `pageOpenStrategy = "sequential"`
5. `removeSerpFromContext = true`
6. `microtasks.useLlmClient = true`
7. `agentLoop.enabled = true`

---

## 11. Message / Status Contract Impact

## 11.1 Existing messages to keep

- `STOCK_RESEARCH_RUN`
- `STOCK_RESEARCH_STATUS`
- `STOCK_RESEARCH_DONE`
- `STOCK_RESEARCH_FAILED`

## 11.2 New recommended status values

Thêm trạng thái chi tiết hơn cho UI/progress:

- `planning`
- `discovering`
- `opening_urls`
- `extracting`
- `microtasks`
- `synthesizing`
- `critic_review`
- `re_retrieving`

## 11.3 Recommended metadata additions

`STOCK_RESEARCH_DONE.metadata` nên thêm:

- `searchProvider`
- `openedUrlCount`
- `fetchedPageCount`
- `searchRounds`
- `microtaskProvider`
- `insufficientEvidence`
- `criticDecision`

---

## 12. Data Model Changes

## 12.1 Recommended additions to `stock_research_sources`

Không bắt buộc migration ở phase đầu, nhưng strongly recommended:

- `discovery_method`
- `search_round`
- `fetch_status`
- `page_content_excerpt`
- `content_hash`
- `source_stage`
- `relevance_label`

## 12.2 Recommended metadata additions to `stock_research_runs`

- `planner_queries`
- `critic_feedback`
- `opened_urls`
- `seed_sites_used`
- `insufficient_evidence`

---

## 13. Implementation Plan

## Phase 1 — URL-first retrieval baseline

### Scope

1. Default `google_dom` on.
2. Default open valid URLs from Google.
3. Remove SERP snippet from final prompt context.

### Files

- update `src/background/services/stock/stockResearchOrchestrator.js`
- update `src/background/services/search/googleSearchWebService.js`
- add `src/background/services/search/urlCandidateValidator.js`
- add `src/background/services/retrieval/pageContentService.js`

## Phase 2 — Seed site sequential walker

### Scope

1. Add `seedSites` settings UI + persistence.
2. Open configured sites sequentially.
3. Merge site-walk results with Google-discovered URLs.

### Files

- update `src/ui-preact/settings/StockResearchSection.jsx`
- add `src/background/services/retrieval/seedSiteWalker.js`

## Phase 3 — llmClient microtasks

### Scope

1. Add `llmMicroTasks` wrapper.
2. Introduce keyword extraction / navigation detection / summarization / classification.
3. Add fallback heuristics when no `litellm` key exists.

### Files

- add `src/background/services/microtasks/llmMicroTasks.js`
- update orchestrator to call microtasks conditionally

## Phase 4 — bounded agent-agent loop

### Scope

1. Add planner / critic loop.
2. Support re-search with refined queries.
3. Persist critic decision and evidence gaps.

### Files

- refactor `src/background/services/stock/stockResearchOrchestrator.js`
- optionally add `src/background/services/stock/agentLoop.js`

---

## 14. Acceptance Criteria

## 14.1 Default search and URL opening

1. Khi user chạy stock research với settings mặc định, hệ thống luôn chạy Google DOM search trước.
2. Sau search, hệ thống mở tuần tự top URL hợp lệ mà không cần user bật thêm cờ khác.
3. Mỗi URL mở ra đều được đóng lại sau khi extract xong hoặc timeout.

## 14.2 SERP removal

4. Google SERP snippet không còn xuất hiện trong final synthesis prompt.
5. Final `sources[]` chỉ gồm nguồn đã fetch/extract hoặc được critic chấp nhận.

## 14.3 Seed sites

6. User có thể cấu hình danh sách seed sites trong Settings.
7. Hệ thống mở tuần tự các site đã bật theo thứ tự cấu hình.
8. Seed site retrieval không được phá retrieval từ Google; nó chỉ bổ sung evidence.

## 14.4 llmClient microtasks

9. Nếu `microtasks.useLlmClient = true` và có API key hợp lệ, hệ thống dùng `llmClient` cho microtasks.
10. Nếu `llmClient` không khả dụng, pipeline vẫn chạy với heuristic fallback.

## 14.5 Agent loop

11. Pipeline không chạy quá `maxRounds`.
12. Critic chỉ được phép yêu cầu re-search trong giới hạn cấu hình.
13. Khi bằng chứng yếu, output phải hạ confidence hoặc đánh dấu `insufficientEvidence`, không được bịa dữ liệu.

---

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mở nhiều URL làm chậm pipeline | High | Sequential strategy, URL budget, per-page timeout |
| Một số site chặn automation hoặc render phức tạp | Medium | Fallback meta/body extraction, domain-specific extractor dần dần |
| `llmClient` không có API key | Medium | Heuristic fallback, microtask optional |
| Critic loop làm chi phí/timing tăng | Medium | Hard cap rounds, cap URLs, telemetry |
| Search quality không đều giữa domain | Medium | trustedDomains + seedSites + critic re-search |

---

## 16. Testing Strategy

1. Unit test cho URL validation.
2. Unit test cho page content extraction normalization.
3. Unit test cho microtask wrappers.
4. Integration test cho orchestrator:
   - search -> open URLs -> build evidence pack
   - critic yêu cầu re-search
   - SERP snippet không lọt vào final prompt
5. Regression test cho settings defaults mới.

---

## 17. Recommended New Tests

- `tests/unit/urlCandidateValidator.test.js`
- `tests/unit/pageContentService.test.js`
- `tests/unit/llmMicroTasks.test.js`
- `tests/unit/agenticStockResearchOrchestrator.test.js`
- `tests/unit/stockResearchSettingsDefaults.test.js`

---

## 18. Final Recommendation

Request này nên được triển khai theo hướng:

1. **Google Search vẫn là entry point bắt buộc**
2. **Google SERP chỉ là discovery layer**
3. **Evidence thật đến từ các trang đã mở và extract**
4. **`llmClient` chỉ xử lý microtasks nhỏ, không thay thế final synthesis path**
5. **Agent loop phải bounded, deterministic, observable**

Đây là hướng phù hợp nhất với codebase hiện tại vì:

1. tái sử dụng được `googleSearchWebService`
2. tái sử dụng được extractor trong `contextMenu.js`
3. không phá `LLMProviderFactory`
4. tận dụng được `llmClient`
5. tăng chất lượng stock analysis mà không cần đổi platform
