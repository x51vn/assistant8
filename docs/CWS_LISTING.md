# Chrome Web Store Listing — Assistant8

**Ticket**: XST-767  
**Status**: Draft v1.0  
**Last updated**: 2026-04-28

---

## Store Metadata

### Name (max 45 chars, currently 10)
```
Assistant8
```

### Short Description (max 132 chars)
```
Quản lý portfolio, watchlist, nhật ký giao dịch, AI writing/research và lịch sử ChatGPT. Đồng bộ Supabase.
```
*(109 chars)*

### Category
**Productivity**

### Language
Vietnamese (primary), English (supported)

---

## Full Description

### Vietnamese (primary)

```
Assistant8 (trước đây là ChatGPT Assistant) là trợ lý năng suất tích hợp với ChatGPT, giúp bạn quản lý đầu tư, lưu trữ tri thức và tạo nội dung hiệu quả hơn.

📈 QUẢN LÝ PORTFOLIO CHỨNG KHOÁN
• Theo dõi danh mục cổ phiếu yêu thích (watchlist)
• Cập nhật giá tự động mỗi 5 phút trong giờ giao dịch
• Tính toán P&L (lợi nhuận/thua lỗ) real-time
• Tích hợp dữ liệu từ SSI iBoard API
• Hỗ trợ phân tích vàng, crypto và hàng hóa

📚 LƯU LỊCH SỬ CHAT, JOURNAL & PHÂN TÍCH
• Tự động lưu các cuộc hội thoại quan trọng
• Ghi nhật ký giao dịch từ watchlist và portfolio
• Theo dõi lỗi kỹ thuật (error retrospective)
• Liên kết transactions với AI responses
• Analytics hiệu suất cá nhân

🌐 TIỆN ÍCH BỔ TRỢ
• Writing Assistant: email, social post, summary, rewrite, translate, outline
• English learning workflow trong Writing Assistant
• Quản lý prompt template tùy chỉnh
• Cài đặt đồng bộ qua Supabase Cloud
• Hỗ trợ đa tài khoản (Supabase Auth)

🔒 RIÊNG TƯ & BẢO MẬT
• Dữ liệu được mã hoá và lưu trữ trên Supabase (EU region)
• Row Level Security — mỗi người dùng chỉ thấy dữ liệu của mình
• Không bán dữ liệu cho bên thứ ba
• Tuân thủ GDPR: xuất/xoá dữ liệu theo yêu cầu

💎 GÓI DỊCH VỤ
• Free: Tính năng cơ bản, 50 lần lưu lịch sử/tháng
• Pro: Không giới hạn, real-time sync, priority support
• Enterprise: Team features (liên hệ)
```

### English (secondary)

```
Assistant8 (formerly ChatGPT Assistant) is a productivity Chrome extension that integrates with ChatGPT to help you manage investments, preserve knowledge, and create better writing/research workflows.

📈 STOCK PORTFOLIO MANAGEMENT
• Track your favorite stocks (watchlist)
• Auto-update prices every 5 minutes during market hours
• Real-time P&L calculation
• SSI iBoard API integration
• Gold, crypto, and commodity price support

📚 CHAT HISTORY, JOURNAL & ANALYSIS
• Save important ChatGPT conversations automatically
• Capture trade journal entries from watchlists and portfolio workflows
• Error retrospective tracking
• Link transactions with AI responses
• Personal performance analytics

🌐 PRODUCTIVITY UTILITIES
• Writing Assistant: email, social post, summary, rewrite, translate, outline
• English learning workflow inside Writing Assistant
• Custom prompt template management
• Settings synced via Supabase Cloud
• Multi-account support (Supabase Auth)

🔒 PRIVACY & SECURITY
• Data encrypted and stored on Supabase (EU region)
• Row Level Security — each user sees only their own data
• No data sold to third parties
• GDPR compliant: data export and deletion on request

💎 PRICING
• Free: Core features, 50 chat saves/month
• Pro: Unlimited, real-time sync, priority support
• Enterprise: Team features (contact us)
```

---

## Store Assets

### Icons Required
| Size     | File                           | Status    |
|----------|--------------------------------|-----------|
| 16×16    | `src/extension/images/icon-16.svg`  | Exists in manifest |
| 48×48    | `src/extension/images/icon-48.svg`  | Exists in manifest |
| 128×128  | `src/extension/images/icon-128.svg` | Exists in manifest |

Chrome Web Store upload assets may need PNG exports, but the current
extension manifest uses SVG assets only.

### Screenshots (5 required, 1280×800 or 640×400 px)
| # | Description                              | Source              |
|---|------------------------------------------|---------------------|
| 1 | Dashboard with portfolio, assets, journal summary | Capture side panel |
| 2 | Watchlist with AI enrichment / journal entry flow | Capture watchlist/journal |
| 3 | Writing Assistant workflow and prompt templates | Capture writing tab |
| 4 | Settings page with subscription and provider setup | Capture settings |
| 5 | ConsentDialog / privacy controls | Capture first-login privacy flow |

### Promotional Tile (optional but recommended)
- **Small**: 440×280 px
- **Marquee**: 1400×560 px

---

## Permissions Justification (CWS Privacy Policy)

The CWS listing requires justification for each permission. Enter these in the "Permissions" section of the Developer Dashboard:

| Permission        | Justification |
|-------------------|---------------|
| `storage`         | Required to cache Supabase auth session token across browser restarts. No business data stored locally. |
| `tabs`            | Required to detect when user is on chatgpt.com and inject the side panel interface. |
| `scripting`       | Required to inject content script into chatgpt.com for DOM interaction (sending prompts, reading responses). |
| `alarms`          | Required for scheduled tasks: auto-update stock prices every 5 minutes during market hours, daily usage counter reset. |
| `sidePanel`       | Required to display the main extension UI as a Chrome side panel alongside ChatGPT. |
| `contextMenus`    | Required to provide right-click "Send to ChatGPT" context menu on any selected text. |
| `activeTab`       | Required to read the current tab URL to detect chatgpt.com context. |
| `notifications`   | Required for price alert notifications and background job status notifications. |

### Host Permissions
| Host                                | Justification |
|-------------------------------------|---------------|
| `https://chatgpt.com/*`             | Core integration — inject content script, detect chat sessions, capture conversations. |
| `https://www.google.com/*`          | Stock research web search, when enabled by the user. |
| `https://gemini.google.com/*`       | Optional Gemini web provider automation. |
| `https://claude.ai/*`               | Optional Claude web provider automation. |
| `https://*.supabase.co/*`           | Cloud database for all user data (portfolio, history, settings). User auth and RLS. |
| `https://iboard-query.ssi.com.vn/*` | Stock price data from SSI (Vietnam's largest brokerage). Used for real-time stock updates. |
| `https://iboard.ssi.com.vn/*`       | SSI iBoard websocket/REST endpoint for market data. |
| `https://bgapidatafeed.vps.com.vn/*` | VPS market data fallback. |
| `https://btmc.vn/*`, `https://www.btmc.vn/*` | Gold price provider. |
| `https://giavang.doji.vn/*`         | Gold price provider. |
| `https://sjc.com.vn/*`              | Gold price provider. |
| `https://api.coingecko.com/*`       | Crypto price provider. |
| `https://api.binance.com/*`         | Crypto price provider/fallback. |
| `https://*.atlassian.net/*`         | Optional Jira/Confluence integration. |
| `https://api.x51.vn/*`, `https://lite.x51.vn/*` | Optional X51 API/LiteLLM integration endpoints. |
| `https://api.anthropic.com/*`       | Optional Anthropic API provider when configured. |
| `https://generativelanguage.googleapis.com/*` | Optional Google Gemini API provider when configured. |

---

## Privacy Policy URL

```
https://[YOUR-DOMAIN]/privacy-policy.html
```

Or use the extension's hosted version (web_accessible_resource):
```
chrome-extension://[EXTENSION-ID]/privacy-policy.html
```

**Recommended**: Host the privacy policy on a public domain for CWS compliance. 
Copy `src/extension/privacy-policy.html` to your website.

---

## Data Usage Disclosures

Answer these in CWS Developer Dashboard → Privacy practices:

| Question | Answer |
|----------|--------|
| Does the extension collect any user data? | **Yes** |
| What data is collected? | Portfolio holdings (stocks, prices), chat history (prompts & responses), user settings, payment information (via Stripe), error reports (via Sentry, anonymized) |
| Is collected data sold to third parties? | **No** |
| Is collected data used for purposes unrelated to the extension's single purpose? | **No** |
| Is collected data transferred to third parties? | **Yes** — to Supabase (data storage), Stripe (payment processing), Sentry (anonymized error monitoring) |

---

## Single Purpose Description (CWS Policy)

```
This extension helps users manage investing workflows, save ChatGPT conversations,
and run AI-assisted writing/research workflows from a Chrome side panel.
```

---

## Manifest Fields (confirm before submission)

From `src/extension/manifest.json`:
- `"name"`: Must match CWS name exactly
- `"description"`: This becomes the auto-generated store description fallback
- `"version"`: Must be incremented for each update (`"version": "1.0.0"`)
- `"minimum_chrome_version"`: Currently `"114"`
- `"side_panel.default_path"`: `sidepanel-preact.html`
- `"background.service_worker"`: `background.js`
- `"homepage_url"`: Add your website URL

### Recommended manifest.json additions before submission:
```json
{
  "homepage_url": "https://your-website.com",
  "author": "Your Name / Company"
}
```

---

## Pre-submission Checklist

- [ ] All screenshots taken (5 minimum)
- [ ] Privacy policy hosted at public URL
- [ ] `homepage_url` added to manifest.json
- [ ] `minimum_chrome_version` reviewed against the tested Chrome stable version
- [ ] Repository hygiene clean: `npm run check:repo-hygiene`
- [ ] Build clean: `npm run build` → no errors
- [ ] Unit suite clean: `npm run test:unit:run`
- [ ] OpenSpec clean: `npm run check:openspec`
- [ ] Extension smoke clean: `npm run smoke:extension`
- [ ] Manual QA on Chrome stable (not Dev/Beta)
- [ ] Supabase Edge Functions deployed to production
- [ ] Stripe webhooks pointed to production endpoint
- [ ] Sentry DSN set in production build env vars (`VITE_SENTRY_DSN`)
- [ ] Terms of Service page reviewed by legal
- [ ] GDPR data export tested (Settings → "Xuất toàn bộ dữ liệu")
- [ ] ConsentDialog shown on first login
- [ ] User consent stored in Supabase settings table

---

## CWS Developer Dashboard Links

- Listing: https://chrome.google.com/webstore/devconsole
- Policy: https://developer.chrome.com/docs/webstore/program-policies/
- Privacy FAQ: https://developer.chrome.com/docs/webstore/user_data/
