# Chrome Web Store Listing — ChatGPT Assistant

**Ticket**: XST-767  
**Status**: Draft v1.0  
**Last updated**: 2025-01-01

---

## Store Metadata

### Name (max 45 chars, currently 19)
```
ChatGPT Assistant
```

### Short Description (max 132 chars)
```
Quản lý portfolio cổ phiếu, lưu lịch sử chat ChatGPT & tra cứu từ vựng tiếng Anh. Dữ liệu đồng bộ Supabase.
```
*(107 chars)*

### Category
**Productivity**

### Language
Vietnamese (primary), English (supported)

---

## Full Description

### Vietnamese (primary)

```
ChatGPT Assistant là trợ lý toàn diện tích hợp ngay trên ChatGPT, giúp bạn quản lý đầu tư, lưu trữ tri thức và học tiếng Anh hiệu quả hơn.

📈 QUẢN LÝ PORTFOLIO CHỨNG KHOÁN
• Theo dõi danh mục cổ phiếu yêu thích (watchlist)
• Cập nhật giá tự động mỗi 5 phút trong giờ giao dịch
• Tính toán P&L (lợi nhuận/thua lỗ) real-time
• Tích hợp dữ liệu từ SSI iBoard API
• Hỗ trợ phân tích vàng, crypto và hàng hóa

📚 LƯU LỊCH SỬ CHAT & PHÂN TÍCH
• Tự động lưu các cuộc hội thoại quan trọng
• Theo dõi lỗi kỹ thuật (error retrospective)
• Liên kết transactions với AI responses
• Analytics hiệu suất cá nhân

🌐 TIỆN ÍCH BỔ TRỢ
• Module học từ vựng tiếng Anh
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
ChatGPT Assistant is a productivity Chrome extension that integrates seamlessly with ChatGPT to help you manage investments, preserve knowledge, and learn English more effectively.

📈 STOCK PORTFOLIO MANAGEMENT
• Track your favorite stocks (watchlist)
• Auto-update prices every 5 minutes during market hours
• Real-time P&L calculation
• SSI iBoard API integration
• Gold, crypto, and commodity price support

📚 CHAT HISTORY & ANALYSIS
• Save important ChatGPT conversations automatically
• Error retrospective tracking
• Link transactions with AI responses
• Personal performance analytics

🌐 PRODUCTIVITY UTILITIES
• English vocabulary learning module
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
| 16×16    | `src/extension/icons/icon16.png`  | ✅ Exists |
| 32×32    | `src/extension/icons/icon32.png`  | ✅ Exists |
| 48×48    | `src/extension/icons/icon48.png`  | ✅ Exists |
| 128×128  | `src/extension/icons/icon128.png` | ✅ Exists |

### Screenshots (5 required, 1280×800 or 640×400 px)
| # | Description                              | Source              |
|---|------------------------------------------|---------------------|
| 1 | Portfolio dashboard with stock watchlist | Capture side panel  |
| 2 | Chat history saved conversations         | Capture history tab |
| 3 | Settings page with subscription info     | Capture settings    |
| 4 | English learning module                  | Capture english tab |
| 5 | ConsentDialog / privacy controls         | Capture on first login |

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

### Host Permissions
| Host                                | Justification |
|-------------------------------------|---------------|
| `https://chatgpt.com/*`             | Core integration — inject content script, detect chat sessions, capture conversations. |
| `https://*.supabase.co/*`           | Cloud database for all user data (portfolio, history, settings). User auth and RLS. |
| `https://iboard-query.ssi.com.vn/*` | Stock price data from SSI (Vietnam's largest brokerage). Used for real-time stock updates. |
| `https://iboard.ssi.com.vn/*`      | SSI iBoard websocket/REST endpoint for market data. |

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
This extension helps users manage their stock portfolio, save ChatGPT conversations, 
and learn English vocabulary — all integrated with the ChatGPT interface.
```

---

## Manifest Fields (confirm before submission)

From `src/extension/manifest.json`:
- `"name"`: Must match CWS name exactly
- `"description"`: This becomes the auto-generated store description fallback
- `"version"`: Must be incremented for each update (`"version": "1.0.0"`)
- `"homepage_url"`: Add your website URL

### Recommended manifest.json additions before submission:
```json
{
  "homepage_url": "https://your-website.com",
  "author": "Your Name / Company",
  "minimum_chrome_version": "116"
}
```

---

## Pre-submission Checklist

- [ ] All screenshots taken (5 minimum)
- [ ] Privacy policy hosted at public URL
- [ ] `homepage_url` added to manifest.json
- [ ] `minimum_chrome_version` set
- [ ] Build clean: `npm run build` → no errors
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
