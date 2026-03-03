# Stock Research Pipeline — Message Schema & Output Contract

| Field        | Value                                        |
|-------------|----------------------------------------------|
| **Status**  | Accepted                                     |
| **Date**    | 2026-02-22                                   |
| **Ticket**  | XST-788                                      |
| **Epic**    | XST-781 — Architecture Alignment & ADR       |
| **ADR**     | docs/adr/ADR-001-unified-stock-research-pipeline.md |

---

## 1. Message Types

All new message types follow the existing `CATEGORY_ACTION` naming convention in `src/shared/messageSchema.js`.

### 1.1 Stock Research Pipeline Messages

| Message Type | Direction | Purpose | Trigger |
|-------------|-----------|---------|---------|
| `STOCK_RESEARCH_RUN` | UI → BG | Start research pipeline for a symbol | User clicks "Phân tích" |
| `STOCK_RESEARCH_STATUS` | BG → UI | Broadcast progress events | Each pipeline step completion |
| `STOCK_RESEARCH_DONE` | BG → UI | Research completed successfully | Pipeline finished |
| `STOCK_RESEARCH_FAILED` | BG → UI | Research failed | Unrecoverable error in pipeline |
| `STOCK_RESEARCH_GET_HISTORY` | UI → BG | Fetch past research runs | User opens history |
| `STOCK_RESEARCH_HISTORY_DATA` | BG → UI | Response with history data | Reply to GET_HISTORY |

### 1.2 Google Search Internal Messages

| Message Type | Direction | Purpose | Trigger |
|-------------|-----------|---------|---------|
| `SEARCH_GOOGLE_RUN` | Internal (BG) | Trigger Google Search via Edge Function | Orchestrator search step |
| `SEARCH_GOOGLE_RESULT` | Internal (BG) | Search results normalized | Search complete |

> Note: `SEARCH_GOOGLE_*` types are mostly internal to the orchestrator. They are defined in `MESSAGE_TYPES` for consistency and observability but may not be sent via `chrome.runtime.sendMessage`.

---

## 2. Payload Structures

### 2.1 STOCK_RESEARCH_RUN (Request)

```json
{
  "v": 1,
  "type": "STOCK_RESEARCH_RUN",
  "correlationId": "uuid-v4",
  "timestamp": 1740200000000,
  "symbol": "FPT",
  "mode": "stock-research",
  "options": {
    "provider": "gemini",
    "searchEnabled": true,
    "maxSources": 8,
    "recencyWindowDays": 14,
    "strictValidation": true,
    "trustedDomains": ["cafef.vn", "vietstock.vn"],
    "timeoutMs": 30000
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symbol` | string | ✅ | Stock ticker (e.g., "FPT", "VNM") |
| `mode` | string | ❌ | Pipeline mode: `"stock-research"` (default), `"watchlist-enrich"`, `"portfolio-eval"` |
| `options` | object | ❌ | Override settings defaults. Merged with user settings. |
| `options.provider` | string | ❌ | `"chatgpt"` \| `"gemini"` \| `"claude"`. Default from user settings. |
| `options.searchEnabled` | boolean | ❌ | Enable Google Search step. Default `true`. |
| `options.maxSources` | number | ❌ | Max search sources (1-20). Default `8`. |
| `options.recencyWindowDays` | number | ❌ | Only sources within N days. Default `14`. |
| `options.strictValidation` | boolean | ❌ | Strict JSON output validation. Default `true`. |
| `options.trustedDomains` | string[] | ❌ | Prioritize these domains. Default from settings. |
| `options.timeoutMs` | number | ❌ | Total pipeline timeout. Default `30000`. |

### 2.2 STOCK_RESEARCH_STATUS (Progress Event)

```json
{
  "v": 1,
  "type": "STOCK_RESEARCH_STATUS",
  "correlationId": "uuid-v4",
  "timestamp": 1740200001000,
  "inResponseTo": "STOCK_RESEARCH_RUN",
  "runId": "uuid-v4",
  "symbol": "FPT",
  "status": "retrieving",
  "step": 2,
  "totalSteps": 7,
  "message": "Đang tìm kiếm thông tin FPT..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `runId` | string (uuid) | Unique run identifier (matches `stock_research_runs.id`) |
| `symbol` | string | Stock symbol being researched |
| `status` | string | `"queued"` \| `"validating"` \| `"retrieving"` \| `"ranking"` \| `"evaluating"` \| `"validating_output"` \| `"persisting"` \| `"done"` \| `"failed"` |
| `step` | number | Current step number (1-based) |
| `totalSteps` | number | Total pipeline steps (7) |
| `message` | string | Vietnamese human-readable progress message |

### 2.3 STOCK_RESEARCH_DONE (Success Response)

```json
{
  "v": 1,
  "type": "STOCK_RESEARCH_DONE",
  "correlationId": "uuid-v4",
  "timestamp": 1740200010000,
  "inResponseTo": "STOCK_RESEARCH_RUN",
  "success": true,
  "runId": "uuid-v4",
  "symbol": "FPT",
  "output": { "...see Output Contract section 3..." },
  "sources": [
    {
      "title": "FPT báo lãi kỷ lục quý 4/2025",
      "url": "https://cafef.vn/fpt-bao-lai-ky-luc.html",
      "snippet": "FPT ghi nhận lợi nhuận...",
      "sourceType": "news",
      "publishedAt": "2026-02-20T00:00:00Z",
      "score": 0.92,
      "credibility": "high"
    }
  ],
  "metadata": {
    "provider": "gemini",
    "searchEnabled": true,
    "sourceCount": 8,
    "timing": {
      "search_ms": 2100,
      "analyze_ms": 5400,
      "validate_ms": 50,
      "persist_ms": 300,
      "total_ms": 8200
    }
  }
}
```

### 2.4 STOCK_RESEARCH_FAILED (Error Response)

```json
{
  "v": 1,
  "type": "STOCK_RESEARCH_FAILED",
  "correlationId": "uuid-v4",
  "timestamp": 1740200005000,
  "inResponseTo": "STOCK_RESEARCH_RUN",
  "success": false,
  "runId": "uuid-v4",
  "symbol": "FPT",
  "errorCode": "LLM_TIMEOUT",
  "errorMessage": "AI provider không phản hồi trong thời gian cho phép. Vui lòng thử lại.",
  "failedStep": "evaluating",
  "partialSources": []
}
```

### 2.5 STOCK_RESEARCH_GET_HISTORY (Request)

```json
{
  "v": 1,
  "type": "STOCK_RESEARCH_GET_HISTORY",
  "correlationId": "uuid-v4",
  "timestamp": 1740200020000,
  "symbol": "FPT",
  "limit": 10,
  "offset": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symbol` | string | ❌ | Filter by symbol. Omit for all symbols. |
| `limit` | number | ❌ | Max results. Default `10`. |
| `offset` | number | ❌ | Pagination offset. Default `0`. |

### 2.6 STOCK_RESEARCH_HISTORY_DATA (Response)

```json
{
  "v": 1,
  "type": "STOCK_RESEARCH_HISTORY_DATA",
  "correlationId": "uuid-v4",
  "timestamp": 1740200021000,
  "inResponseTo": "STOCK_RESEARCH_GET_HISTORY",
  "success": true,
  "items": [
    {
      "id": "uuid",
      "symbol": "FPT",
      "provider": "gemini",
      "status": "done",
      "recommendation": "BUY",
      "confidence": 78,
      "created_at": "2026-02-22T10:00:00Z",
      "finished_at": "2026-02-22T10:00:08Z"
    }
  ],
  "total": 25
}
```

### 2.7 SEARCH_GOOGLE_RUN (Internal)

```json
{
  "v": 1,
  "type": "SEARCH_GOOGLE_RUN",
  "correlationId": "uuid-v4",
  "timestamp": 1740200002000,
  "query": "FPT Vietnam stock price target 2026",
  "options": {
    "maxResults": 10,
    "locale": "vi",
    "market": "VN",
    "recencyWindowDays": 14,
    "timeoutMs": 15000
  }
}
```

### 2.8 SEARCH_GOOGLE_RESULT (Internal)

```json
{
  "v": 1,
  "type": "SEARCH_GOOGLE_RESULT",
  "correlationId": "uuid-v4",
  "timestamp": 1740200004000,
  "inResponseTo": "SEARCH_GOOGLE_RUN",
  "success": true,
  "items": [
    {
      "title": "string",
      "url": "string",
      "snippet": "string",
      "sourceType": "news|blog|forum|official|research",
      "publishedAt": "ISO 8601 string or null",
      "score": 0.0,
      "credibility": "high|medium|low"
    }
  ],
  "totalResults": 10,
  "searchDuration_ms": 2100
}
```

---

## 3. Output Contract — Stock Analysis Result

This JSON schema defines the structured output that LLM providers MUST return for stock analysis.

### 3.1 Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "StockAnalysisOutput",
  "type": "object",
  "required": ["symbol", "recommendation", "confidence", "thesis", "risks"],
  "properties": {
    "symbol": {
      "type": "string",
      "description": "Stock ticker symbol",
      "pattern": "^[A-Z0-9]{1,10}$"
    },
    "recommendation": {
      "type": "string",
      "enum": ["BUY", "HOLD", "SELL", "WATCH"],
      "description": "Investment recommendation"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "Confidence level (0-100%)"
    },
    "targetPrice": {
      "type": ["number", "null"],
      "minimum": 0,
      "description": "Target price in VND (thousands)"
    },
    "stopLoss": {
      "type": ["number", "null"],
      "minimum": 0,
      "description": "Stop loss price in VND (thousands)"
    },
    "timeHorizon": {
      "type": "string",
      "enum": ["1w", "1m", "1-3m", "3-6m", "6-12m", "1y+"],
      "description": "Investment time horizon"
    },
    "thesis": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 5,
      "description": "Investment thesis points (Vietnamese)"
    },
    "risks": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 5,
      "description": "Key risk factors (Vietnamese)"
    },
    "catalysts": {
      "type": "array",
      "items": { "type": "string" },
      "maxItems": 5,
      "description": "Upcoming catalysts (Vietnamese)"
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["url", "reason"],
        "properties": {
          "url": { "type": "string", "format": "uri" },
          "reason": { "type": "string" },
          "credibility": {
            "type": "string",
            "enum": ["high", "medium", "low"]
          }
        }
      },
      "description": "Referenced sources from search results"
    }
  }
}
```

### 3.2 Valid Example

```json
{
  "symbol": "FPT",
  "recommendation": "BUY",
  "confidence": 78,
  "targetPrice": 165000,
  "stopLoss": 125000,
  "timeHorizon": "3-6m",
  "thesis": [
    "Doanh thu AI/Cloud tăng 45% YoY, chiếm 25% tổng doanh thu",
    "Backlog đơn hàng nước ngoài đạt $1.2B, cao nhất lịch sử",
    "P/E trailing 18x, thấp hơn trung bình ngành CNTT ASEAN"
  ],
  "risks": [
    "Biên lợi nhuận gộp giảm do cạnh tranh gia công phần mềm",
    "Rủi ro tỷ giá VND/USD ảnh hưởng doanh thu ngoại tệ"
  ],
  "catalysts": [
    "Kết quả kinh doanh Q1/2026 công bố tháng 4",
    "Hợp đồng AI mới với đối tác Nhật Bản"
  ],
  "sources": [
    {
      "url": "https://cafef.vn/fpt-bao-lai-ky-luc.html",
      "reason": "Báo cáo KQKD chính thức",
      "credibility": "high"
    }
  ]
}
```

### 3.3 Invalid Example (missing required fields)

```json
{
  "symbol": "FPT",
  "recommendation": "STRONG_BUY",
  "confidence": 150,
  "thesis": []
}
```

Errors:
- `recommendation`: `"STRONG_BUY"` not in enum `["BUY", "HOLD", "SELL", "WATCH"]`
- `confidence`: `150` exceeds maximum `100`
- `thesis`: empty array violates `minItems: 1`
- `risks`: missing required field

---

## 4. Error Codes

| Error Code | HTTP-like | Description | User Message (Vietnamese) |
|------------|-----------|-------------|---------------------------|
| `SEARCH_FAILED` | 502 | Google Search proxy error | "Không thể tìm kiếm thông tin. Vui lòng thử lại sau." |
| `SEARCH_TIMEOUT` | 504 | Search request timed out | "Tìm kiếm quá thời gian cho phép. Vui lòng thử lại." |
| `SEARCH_QUOTA_EXCEEDED` | 429 | Daily search quota exhausted | "Đã hết lượt tìm kiếm hôm nay. Thử lại vào ngày mai hoặc tắt Search." |
| `LLM_TIMEOUT` | 504 | LLM provider response timeout | "AI provider không phản hồi trong thời gian cho phép. Vui lòng thử lại." |
| `LLM_ERROR` | 502 | LLM provider returned error | "Lỗi từ AI provider. Vui lòng thử provider khác hoặc thử lại sau." |
| `LLM_QUOTA_EXCEEDED` | 429 | LLM API quota exhausted | "Đã hết quota AI provider. Vui lòng kiểm tra API key hoặc thử provider khác." |
| `PARSE_ERROR` | 422 | LLM output doesn't match schema | "AI trả lời không đúng format. Đang thử lại..." |
| `VALIDATION_ERROR` | 400 | Invalid input (symbol, options) | "Dữ liệu đầu vào không hợp lệ: {details}" |
| `AUTH_ERROR` | 401 | User not authenticated | "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." |
| `PERSIST_ERROR` | 500 | Failed to save results to Supabase | "Không thể lưu kết quả. Dữ liệu vẫn hiển thị nhưng không được lưu." |

---

## 5. Compatibility Notes

### 5.1 createMessage / createResponse Pattern

All new messages use existing helpers from `src/shared/messageSchema.js`:

```javascript
// Request (UI → Background)
import { createMessage, MESSAGE_TYPES } from '../shared/messageSchema.js';

const msg = createMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, {
  symbol: 'FPT',
  mode: 'stock-research',
  options: { provider: 'gemini', searchEnabled: true }
});
const response = await chrome.runtime.sendMessage(msg);

// ✅ CORRECT: Direct property access (createResponse spreads payload)
const output = response.output;
const sources = response.sources;

// ❌ WRONG: No nested .data
const output = response.data?.output; // undefined!
```

### 5.2 Backward Compatibility

| Existing Type | Status | Notes |
|---------------|--------|-------|
| `SEND_PROMPT` | ✅ Unchanged | Kept for non-stock features |
| `CHATGPT_SEND_INPUT` | ✅ Unchanged | Kept for content script DOM |
| `LLM_SEND_PROMPT` | ✅ Unchanged | Orchestrator calls internally |
| `WATCHLIST_AI_ENRICH_RUN` | ✅ Unchanged | Will delegate to orchestrator behind flag |

No existing message types are modified or removed.

### 5.3 Field Naming Convention

Following project convention: **support both camelCase and snake_case** in handler updates.

- Payload fields from UI: `camelCase` (JavaScript convention)
- Database columns: `snake_case` (PostgreSQL convention)
- Handler must map both directions:
  ```javascript
  // UI sends: { targetPrice: 165000 }
  // DB stores: { target_price: 165000 }
  if (updates.targetPrice !== undefined) updateData.target_price = Number(updates.targetPrice);
  if (updates.target_price !== undefined) updateData.target_price = Number(updates.target_price);
  ```

---

## 6. Related Documents

- ADR: [docs/adr/ADR-001-unified-stock-research-pipeline.md](../adr/ADR-001-unified-stock-research-pipeline.md)
- Architecture Proposal: [docs/STOCK_RESEARCH_GOOGLE_AI_ARCHITECTURE_PROPOSAL.md](../STOCK_RESEARCH_GOOGLE_AI_ARCHITECTURE_PROPOSAL.md)
- Messaging Contract: [docs/confluence/04-Messaging-Contract.md](../confluence/04-Messaging-Contract.md)
- Existing Message Schema: `src/shared/messageSchema.js`
