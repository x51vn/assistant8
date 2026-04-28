# Trading Journal & Decision Loop — Research Notes

> Ngày: 2026-04-28  
> Loại: Exploration / Product Research  
> Phạm vi: Next major feature direction

---

## Bức tranh hiện tại

### Những gì đã có

```
PAGES                     DATA                          AI
─────────────────         ──────────────────────        ───────────────────────
Dashboard                 portfolio (holdings)          watchlist AI enrichment
Portfolio ──────────────▶ watchlist (entry/target/SL)  market assessment
Market                    market_assessment             stock research pipeline
Watchlist ──────────────▶ price_alerts                 prompt improvement
Assets                    assets (cash/gold/RE/crypto)
Alerts                    stock_research_runs
History                   chat_history
Writing                   billing / api_keys
```

**Watchlist đặc biệt giàu dữ liệu:**

| Column            | Ý nghĩa                        | Đã có |
|-------------------|-------------------------------|-------|
| entry             | Giá vào lệnh kế hoạch          | ✅    |
| target            | Giá mục tiêu                   | ✅    |
| stoploss          | Giá cắt lỗ                     | ✅    |
| investment_thesis | Luận điểm đầu tư               | ✅    |
| pprofit           | (target - entry) / entry       | ✅    |
| ediff             | (price - entry) / price        | ✅    |
| current_price     | Giá thị trường hiện tại        | ✅    |
| last_ai_analysis_at | Timestamp AI enrichment cuối | ✅    |
| highlighted       | Đánh dấu quan trọng            | ✅    |

**Market assessment:**

| Column                  | Ý nghĩa                     |
|-------------------------|-----------------------------|
| action                  | BUY / HOLD / SELL / WATCH   |
| market_regime_state     | ON / OFF                    |
| symbol_score            | 0–100                       |
| sector_score            | 0–100                       |
| market_regime_score     | 0–100                       |

---

### Khoảng trống lớn nhất

```
                    HIỆN TẠI                    THIẾU
                    ────────                    ──────
  Research ──────▶  Market Assessment
  Watchlist  ──────▶  AI Enrichment
                         │
                         │ ←── ĐIỂM DỪNG HIỆN TẠI
                         │
                         ▼
               ???  Decision / Entry
                         │
                         ▼
               ???  Position Sizing
                         │
                         ▼
               ???  Rule Checklist trước khi bấm
                         │
                         ▼
               ???  Trade Journal (ghi lại quyết định)
                         │
                         ▼
               ???  Post-trade Review
                         │
                         ▼
               ???  Weekly Lesson Summary
```

App đang cung cấp **data và signal**, nhưng chưa có nơi để trader:
- Ghi lại "tôi vào lệnh vì lý do này"
- Kiểm tra "tôi có tuân thủ rule không"
- Nhìn lại "tôi sai ở đâu"

---

## Phân tích từng ý tưởng trong bảng ưu tiên

### 1. Trading Journal + Post-trade Review ⭐⭐⭐⭐⭐

**Tại sao cao nhất:**  
Là nơi **tất cả dữ liệu hiện có hội tụ**. Watchlist cho setup, market assessment cho regime, portfolio cho vị thế, price alerts cho trigger. Journal biến chúng thành vòng phản hồi.

**DB gap:** Chưa có bảng nào. Cần thêm `trade_journal`.

**Sketch schema:**
```sql
trade_journal (
  id UUID PK,
  user_id UUID FK,
  watchlist_id UUID FK NULLABLE,    -- link ngược watchlist nếu entry từ watchlist
  symbol TEXT NOT NULL,

  -- Snapshot tại thời điểm quyết định
  setup TEXT,                        -- 'Breakout', 'Pullback to support', v.v.
  thesis_snapshot TEXT,              -- copy thesis từ watchlist lúc entry
  market_regime_snapshot TEXT,       -- ON/OFF lúc vào lệnh
  market_score_snapshot INTEGER,     -- điểm regime lúc vào lệnh

  -- Kế hoạch
  planned_entry DECIMAL(15,2),
  planned_target DECIMAL(15,2),
  planned_stoploss DECIMAL(15,2),
  planned_qty INTEGER,
  risk_per_trade_pct DECIMAL(5,2),   -- % tài khoản chấp nhận mất

  -- Thực tế
  actual_entry DECIMAL(15,2),
  actual_qty INTEGER,
  entry_date DATE,

  -- Checklist (JSONB, tuỳ chỉnh per user)
  checklist JSONB DEFAULT '{}',
  -- Ví dụ: { "regime_ok": true, "sector_ok": false, "entry_at_zone": true,
  --          "stoploss_set": true, "position_sized": true, "thesis_written": true }

  -- Trạng thái
  status TEXT CHECK IN ('planned', 'open', 'closed', 'reviewed'),

  -- Post-trade (điền khi đóng)
  exit_price DECIMAL(15,2),
  exit_date DATE,
  realized_pnl DECIMAL(15,2),
  pnl_pct DECIMAL(8,4),              -- realized_pnl / (actual_entry * actual_qty)
  followed_plan BOOLEAN,

  -- Review (điền khi review)
  lessons TEXT,
  error_category TEXT,               -- 'entry_too_early', 'ignored_stoploss', v.v.
  rating INTEGER CHECK BETWEEN 1 AND 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**UI flow:**

```
Watchlist item           Journal entry form
──────────────           ──────────────────────────────────
[VNM]                    Symbol: VNM
entry: 72,000   ──────▶  Planned entry: 72,000
target: 90,000           Target: 90,000
stoploss: 65,000         Stoploss: 65,000
thesis: "..."            Thesis snapshot: [auto-filled]
                         Setup: [dropdown]
                         Risk %: [input]
                         ────────────────
[Market Assessment]      Regime: ON (score 78) [auto-filled]
action: BUY     ──────▶  Market signal: BUY
                         ────────────────
                         ☑ Regime OK
                         ☑ Entry at planned zone
                         ☐ Sector trend confirmed
                         ☑ Stoploss set
                         ☑ Position sized
                         ☑ Thesis written
```

**Metrics dashboard nhỏ:**
```
┌─────────────────────────────────────────────────┐
│  JOURNAL STATS (last 30 trades)                 │
├───────────────┬───────────────┬─────────────────┤
│  Win rate     │  Average R    │  Rule adherence │
│  58%          │  +1.4R        │  72%            │
├───────────────┴───────────────┴─────────────────┤
│  Top errors:                                    │
│  • Entered without confirmation (8 times)       │
│  • Ignored stoploss (3 times)                   │
│  • Oversized position (5 times)                 │
└─────────────────────────────────────────────────┘
```

---

### 2. Risk & Position Sizing ⭐⭐⭐⭐

**Tại sao tốt:** Dữ liệu đã có (entry, stoploss, account value từ assets). Chỉ cần tính.

**Formula:**
```
Risk per trade (VND) = Account value × risk_pct / 100
Position size (qty)  = Risk per trade / (entry - stoploss)
Position value       = qty × entry
% of portfolio       = Position value / Account value
```

**Tích hợp tự nhiên:** Có thể là widget nhỏ trên Watchlist card hoặc trong Journal entry form. Không cần page riêng.

**Điều kiện:** Cần `assets.total_value` (đã có từ AssetsPage) và `watchlist.entry` + `watchlist.stoploss` (đã có).

---

### 3. Watchlist Decision Cards ⭐⭐⭐⭐

**Tại sao tốt:** Ít code nhất, giá trị UX cao nhất trong ngắn hạn.

**Ý tưởng:**  
Mỗi Watchlist item có thể "expand" thành Decision Card:

```
┌──────────────────────────────────────────────────────┐
│  VNM  ●  75,200                                      │
│                                                      │
│  Entry: 72,000  Target: 90,000  Stop: 65,000         │
│  Risk/Reward: 1:2.57  Potential: +25%                │
│  ediff: -4.2%  (giá đang dưới entry 4.2%)            │
│                                                      │
│  Market: ●ON (78)  Sector: ↑UP (65)  Signal: BUY    │
│                                                      │
│  Thesis: "Strong consumer staples..."                │
│                                                      │
│  [📓 Journal Entry]  [⚡ Set Alert]  [📊 Research]  │
└──────────────────────────────────────────────────────┘
```

**Điều này "đóng vòng" ngay trong Watchlist** mà không cần page mới.

---

### 4. Daily Market Brief ⭐⭐⭐⭐

**Tại sao tiếp theo sau Journal:**  
Dữ liệu đã có: market_assessment (regime + sectors + symbols), watchlist (my positions), price_alerts (triggers).

**Format đề xuất:**
```
📋 BRIEF — 28/04/2026

THDRG THTR TƯỢNG
Market Regime: ON (score 78 → tăng từ 65)

Sector đang dẫn: Tài chính ↑, BĐS ↓

Watchlist signal hôm nay:
• VNM: BUY (78) — đang dưới entry 4.2%
• FPT: HOLD (62) — đang trên entry 8%
• VIC: SELL (31) — xem xét thoát

Alerts cần theo dõi: 2 active
```

**Effort thật ra nhỏ** — chỉ cần aggregate + format + push notification.

---

### 5. Rule Checklist ⭐⭐⭐

**Tích hợp vào Journal:** Không cần tách riêng. Checklist là field JSONB trong `trade_journal`.

**Nhưng:** Cần UI để user **tuỳ chỉnh danh sách rule** của mình. Một bảng nhỏ:

```sql
checklist_templates (
  id UUID PK,
  user_id UUID FK,
  rule_key TEXT NOT NULL,    -- 'regime_ok', 'sector_ok', v.v.
  label TEXT NOT NULL,       -- 'Market regime phải ON'
  is_active BOOLEAN DEFAULT TRUE,
  order_num INTEGER DEFAULT 0
)
```

**Default rules:**
- Market regime ON
- Sector trend không DOWN
- Entry tại vùng kế hoạch
- Stoploss đã set
- Position size tính toán
- Thesis đã viết

---

### 6. Portfolio Exposure / Risk Dashboard

**Tại sao thú vị:**  
Dữ liệu portfolio hiện tại là **flat** — chỉ có symbol + qty + avg_price. Không có sector, không có phân loại. Để làm exposure dashboard cần enrich portfolio với sector data.

**Vấn đề:** portfolio không có `sector` column. Cần query market_assessment hoặc AI enrichment để biết sector của từng mã.

**Giải pháp tinh tế:**  
Join `portfolio.symbol` với `market_assessment.symbol` (latest run) để lấy `sector_name`. Dữ liệu đã có, chỉ cần query.

**Sketch:**
```
Portfolio Exposure:
████████████ Tài chính       45%
██████ BĐS                   22%
████ Tiêu dùng               16%
████ Công nghệ               17%
```

---

## Flow sản phẩm đề xuất (cụ thể hoá)

```
                              HIỆN NAY           SAU MVP JOURNAL
                              ─────────          ───────────────────

  Market Assessment     ───▶  Signal/Score  ───▶  Journal snapshot
         │                        │                     │
         ▼                        ▼                     ▼
  Watchlist Enrich      ───▶  AI thesis     ───▶  Journal pre-fill
         │                        │                     │
         ▼                        ▼                     ▼
  Price Alerts          ───▶  Notification  ───▶  Journal trigger
         │                        │                     │
         ▼                        ▼                     ▼
  Portfolio             ───▶  P&L tracking  ───▶  Exit → realized PnL
                                                        │
                                                        ▼
                                                   Review + Lessons
                                                        │
                                                        ▼
                                                   Weekly AI Review
```

**Điều này đặc biệt mạnh:** Mọi bước đã có dữ liệu — Journal chỉ là **glue layer** kết nối chúng lại và thêm bộ nhớ con người (ghi lý do quyết định, theo dõi kết quả).

---

## Thứ tự implementation đề xuất

### Phase 1 — Journal MVP (M effort)

1. **Migration:** `trade_journal` + `checklist_templates` tables
2. **Handler:** CRUD journal entries (background handler)
3. **Page:** JournalPage với danh sách entries
4. **Flow:** "Create journal entry" button trên Watchlist item
5. **Pre-fill:** Auto-populate từ watchlist (entry/target/SL/thesis) và market_assessment (regime/score/action)
6. **Status machine:** planned → open → closed → reviewed

### Phase 2 — Decision Card + Position Sizing (S effort)

1. **Widget:** Expand Watchlist item thành Decision Card
2. **Calculator:** Risk/Position sizing widget trong Journal form
3. **Quick checklist:** Inline checklist trong Card và Journal form

### Phase 3 — Review Dashboard (M effort)

1. **Metrics:** Win rate, avg R, rule adherence % 
2. **Error tracking:** Categorise mistakes, top repeat errors
3. **Weekly AI Review:** Aggregate journal → AI prompt → insight (tận dụng chatgptSession)

---

## Vấn đề kỹ thuật cần lưu ý

### watchlist ↔ portfolio disconnect

```
watchlist.symbol   portfolio.symbol
     "VNM"    ←??→   "VNM"
```

Hai bảng hoàn toàn **độc lập** — không có FK, không có link. Khi user vào lệnh từ Watchlist, không có cơ chế tự động "chuyển" sang Portfolio.

**Implication cho Journal:** `trade_journal.watchlist_id` là nullable vì không phải trade nào cũng đến từ watchlist. Nhưng nếu có link, có thể:
- Auto-close journal entry khi portfolio P&L hit target/stop
- Auto-check exit price từ portfolio `current_price`

### Position sizing cần account value

Để tính `position_size = risk_amount / (entry - stop)`, cần biết tổng tài khoản. **Dữ liệu đã có** trong `assets` table (`current_value` aggregated). Nhưng cần user define "tài khoản giao dịch" trong settings hoặc tự nhập.

Đơn giản nhất: **user tự nhập account_size** khi tạo journal entry (hoặc từ settings). Không cần auto-calculate từ assets.

### R-multiple tracking

```
R = (actual_exit - actual_entry) / (actual_entry - stoploss)
```

Là metric quan trọng nhất với position traders. **Cần actual entry và actual exit** — không thể lấy từ portfolio `avg_price` vì portfolio có thể buy/sell nhiều lần.

**Journal cần ghi actual_entry riêng**, không map 1:1 với portfolio.

### Legal / Compliance

Bất kỳ feature nào hiển thị "BUY/SELL signal" hoặc "recommendation" đều cần disclaimer rõ ràng. Market assessment hiện đã dùng Action enum (BUY/HOLD/SELL/WATCH) — đây là AI-generated assessment, không phải financial advice.

**Rule đề xuất:**
- Journal và checklist: hoàn toàn an toàn (user tự ghi)
- Decision Card hiển thị signal: cần disclaimer "Not financial advice"
- Weekly AI Review: cần rõ ràng "Đây là tổng kết lịch sử, không phải khuyến nghị"

---

## Tóm tắt: "Closing the Decision Loop"

```
TRƯỚC (data viewer)         SAU (decision support)
────────────────────        ──────────────────────
"Mã VNM đang ở 75k"    →   "Bạn đã plan entry tại 72k, regime ON,
"AI: entry 72k"             thesis đã viết, checklist 5/6. Đây
"Target 90k"                là lần thứ 8 bạn delay entry sau khi
"Stop 65k"                  tất cả điều kiện đã met."
```

Câu chuyện sản phẩm chuyển từ **"phân tích thị trường"** sang **"gương phản chiếu quyết định đầu tư"**.

---

## Điểm còn mở

1. **Checklist có nên standard hay user-customizable?**  
   Standard làm MVP nhanh hơn, nhưng user-customizable đúng hơn với trading style khác nhau. Có thể default + cho phép edit.

2. **Liên kết portfolio ↔ journal thế nào?**  
   Khi user mua thực tế (reflected trong portfolio), có cần một cơ chế nhận diện và link vào open journal entry không? Hay luôn manual?

3. **Exit signal từ price alert?**  
   Khi price alert trigger (ví dụ: giá hit target), có auto-prompt user "Bạn muốn đóng journal entry VNM không?" Điều này rất tốt về UX nhưng tăng complexity.

4. **Multi-portfolio context?**  
   `portfolios` table đã có (migration 017). Journal entry thuộc về portfolio nào?

5. **Import CSV giao dịch?**  
   Cần thiết để journal "chuẩn" nhưng là scope lớn — nên defer sau MVP journal manual.

---

*Ghi chú: `io-contract-layer-standardization` đã hoàn thành 24/24 tasks trong session 2026-04-28. File `watchlistBgPriceFetch.js` được mở trong editor nhưng không tồn tại — logic tương đương là `supabasePriceUpdate.js`.*
