# Supabase Email Templates Configuration

## XST-757: Configure Supabase Email Templates

### Prerequisites
- Supabase Dashboard admin access
- Chrome extension ID (production build)

### Location
Supabase Dashboard > Authentication > Email Templates

---

## 1. Confirm Signup Template

**Subject**: `Xác nhận tài khoản ChatGPT Assistant`

**Body (HTML)**:
```html
<h2>Chào mừng bạn đến với ChatGPT Assistant!</h2>

<p>Cảm ơn bạn đã đăng ký tài khoản. Vui lòng xác nhận email để kích hoạt tài khoản.</p>

<p>
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
    Xác nhận email
  </a>
</p>

<p style="color: #6b7280; font-size: 14px;">
  Nếu bạn không đăng ký tài khoản, vui lòng bỏ qua email này.
</p>

<p style="color: #9ca3af; font-size: 12px;">
  Link xác nhận có hiệu lực trong 24 giờ.
</p>
```

---

## 2. Reset Password Template

**Subject**: `Đặt lại mật khẩu ChatGPT Assistant`

**Body (HTML)**:
```html
<h2>Đặt lại mật khẩu</h2>

<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>

<p>
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
    Đặt lại mật khẩu
  </a>
</p>

<p style="color: #6b7280; font-size: 14px;">
  Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Mật khẩu hiện tại vẫn giữ nguyên.
</p>

<p style="color: #9ca3af; font-size: 12px;">
  Link đặt lại có hiệu lực trong 1 giờ.
</p>
```

---

## 3. Magic Link Template (Optional)

**Subject**: `Đăng nhập ChatGPT Assistant`

**Body (HTML)**:
```html
<h2>Đăng nhập nhanh</h2>

<p>Nhấn vào nút bên dưới để đăng nhập vào ChatGPT Assistant:</p>

<p>
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
    Đăng nhập
  </a>
</p>

<p style="color: #9ca3af; font-size: 12px;">
  Link đăng nhập có hiệu lực trong 1 giờ.
</p>
```

---

## Redirect URL Configuration

### Supabase Dashboard > Authentication > URL Configuration

1. **Site URL**: `chrome-extension://<EXTENSION_ID>/settings.html`
   - Replace `<EXTENSION_ID>` with your production extension ID
   
2. **Redirect URLs** (whitelist):
   - `chrome-extension://<EXTENSION_ID>/settings.html#email-confirmed`
   - `chrome-extension://<EXTENSION_ID>/settings.html#reset-password`
   - `https://<EXTENSION_ID>.chromiumapp.org/` (for `chrome.identity` OAuth)

### Finding Your Extension ID
1. Build production: `npm run build`
2. Load in Chrome: `chrome://extensions` → "Load unpacked" → select `dist/`
3. Copy the extension ID shown

---

## Email Delivery Configuration

### Default (Supabase built-in SMTP)
- Rate limit: ~4 emails/hour per user
- Suitable for development and small teams

### Custom SMTP (Recommended for production)
Configure in: Supabase Dashboard > Settings > Auth > SMTP Settings

Recommended providers:
- **Resend**: Free tier 100 emails/day
- **SendGrid**: Free tier 100 emails/day
- **Mailgun**: 5,000 emails/month free for 3 months

### Configuration:
```
Host: smtp.resend.com (example)
Port: 465
Username: resend
Password: re_xxxxx (API key)
Sender email: noreply@yourdomain.com
Sender name: ChatGPT Assistant
```

---

## Testing Checklist

- [ ] Signup confirmation email received (< 30s)
- [ ] Confirmation link opens extension correctly
- [ ] Password reset email received (< 30s)
- [ ] Reset link opens extension with reset form
- [ ] Emails NOT going to spam folder
- [ ] Vietnamese content renders correctly
- [ ] CTA buttons are clickable and styled
- [ ] Links expire after specified timeout
- [ ] Test on Gmail, Outlook, Yahoo

---

## Supabase Auth Settings

### Authentication > Settings
- [x] Enable email confirmations
- [x] Enable password recovery
- [ ] Enable magic link (optional)
- Minimum password length: 8
- Password requirements: uppercase, lowercase, digit, special character

### Rate Limiting
- Max emails per hour: 4 (default)
- Signup rate limit: 10 per hour per IP
