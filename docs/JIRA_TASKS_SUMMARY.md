# Jira Tasks Summary - Commercialization Roadmap

> Created: 2026-02-21  
> Project: XST (X51 Simple Trade)  
> Total: 5 Epics + 30 Stories  
> Estimate: ~107 hours

---

## Epics Overview

| Epic | Key | Stories | Est. Hours |
|------|-----|---------|------------|
| Phase 1 — Hoàn thiện Authentication | XST-746 | 7 stories | ~21h |
| Phase 1 — Subscription & Billing System | XST-747 | 6 stories | ~22h |
| Phase 1 — Privacy, Compliance & CWS | XST-748 | 5 stories | ~16h |
| Phase 2 — User Experience Improvements | XST-749 | 6 stories | ~23h |
| Phase 3 — Advanced Features | XST-750 | 6 stories | ~24h |

---

## Epic 1: Authentication (XST-746)

| # | Key | Story | Est. |
|---|-----|-------|------|
| 1 | XST-751 | [Auth] Implement Password Reset Flow | 3h |
| 2 | XST-752 | [Auth] Implement Email Verification on Registration | 3h |
| 3 | XST-753 | [Auth] Implement Google OAuth Social Login | 4h |
| 4 | XST-754 | [Auth] Implement Change Password in Settings | 2-3h |
| 5 | XST-755 | [Auth] Implement Account Deletion (GDPR) | 4h |
| 6 | XST-756 | [Auth] Merge Duplicate Auth Components | 2-3h |
| 7 | XST-757 | [Auth] Configure Supabase Email Templates | 2h |

## Epic 2: Billing (XST-747)

| # | Key | Story | Est. |
|---|-----|-------|------|
| 1 | XST-758 | [Billing] Design Database Schema for Plans & Subscriptions | 3h |
| 2 | XST-759 | [Billing] Integrate Stripe Checkout for Subscription Payments | 4h |
| 3 | XST-760 | [Billing] Implement Usage Tracking Background Handler | 4h |
| 4 | XST-761 | [Billing] Build Feature Gating with SubscriptionContext | 4h |
| 5 | XST-762 | [Billing] Build Subscription Management UI Page | 4h |
| 6 | XST-763 | [Billing] Implement Stripe Webhook Event Handling | 3h |

## Epic 3: Compliance (XST-748)

| # | Key | Story | Est. |
|---|-----|-------|------|
| 1 | XST-764 | [Compliance] Create Privacy Policy Page | 3h |
| 2 | XST-765 | [Compliance] Implement User Data Export (GDPR Portability) | 3h |
| 3 | XST-766 | [Compliance] Integrate Sentry for Error Monitoring | 3h |
| 4 | XST-767 | [Compliance] Prepare Chrome Web Store Listing | 4h |
| 5 | XST-768 | [Compliance] Add Consent Management for Data Collection | 3h |

## Epic 4: UX Improvements (XST-749)

| # | Key | Story | Est. |
|---|-----|-------|------|
| 1 | XST-769 | [UX] Build Onboarding Wizard for New Users | 4h |
| 2 | XST-770 | [UX] Implement i18n Framework with English Translation | 4-6h |
| 3 | XST-771 | [UX] Implement Dark/Light Theme Toggle | 4h |
| 4 | XST-772 | [UX] Build Toast Notification System | 3h |
| 5 | XST-773 | [UX] Build Dashboard Overview Page | 4h |
| 6 | XST-774 | [UX] Implement Keyboard Shortcuts & Accessibility | 4h |

## Epic 5: Advanced Features (XST-750)

| # | Key | Story | Est. |
|---|-----|-------|------|
| 1 | XST-775 | [Advanced] Implement Multi-LLM Provider Interface | 4h |
| 2 | XST-776 | [Advanced] Build Price Alert System | 4h |
| 3 | XST-777 | [Advanced] Implement Data Import Feature | 4h |
| 4 | XST-778 | [Advanced] Build API Access for Enterprise Users | 4h |
| 5 | XST-779 | [Advanced] Implement Multi-Portfolio Support | 4h |
| 6 | XST-780 | [Advanced] Add Writing Assistant with Custom Prompts | 4h |

---

## Task Format (Each Story Contains)

Mỗi story đều được chuẩn hóa với format:

1. **Mô tả** — Tổng quan mục đích task
2. **Yêu cầu đầu vào** — Files, dependencies, access requirements
3. **Tasks cụ thể** — Numbered sub-tasks (actionable steps)
4. **Acceptance Criteria** — Checklist verification items
5. **Definition of Done** — Quality gates
6. **Cách Test** — Step-by-step test instructions
7. **Blockers** — Known dependencies/blockers
8. **Estimate** — 2-4 hours per task

---

## Recommended Execution Order

### Sprint 1 (Week 1-2): Foundation
1. XST-757 — Email Templates (2h) — prerequisite for auth flows
2. XST-751 — Password Reset (3h)
3. XST-752 — Email Verification (3h)
4. XST-756 — Merge Auth Components (3h)
5. XST-764 — Privacy Policy (3h)
6. XST-772 — Toast Notifications (3h) — used by all features

### Sprint 2 (Week 3-4): Billing Foundation
7. XST-758 — Billing DB Schema (3h)
8. XST-759 — Stripe Checkout (4h)
9. XST-763 — Stripe Webhooks (3h)
10. XST-760 — Usage Tracking (4h)
11. XST-761 — Feature Gating (4h)
12. XST-762 — Subscription UI (4h)

### Sprint 3 (Week 5-6): Compliance & UX
13. XST-753 — Google OAuth (4h)
14. XST-754 — Change Password (3h)
15. XST-755 — Account Deletion (4h)
16. XST-765 — Data Export (3h)
17. XST-766 — Sentry (3h)
18. XST-768 — Consent Management (3h)
19. XST-767 — CWS Listing (4h)

### Sprint 4 (Week 7-8): UX Polish
20. XST-769 — Onboarding Wizard (4h)
21. XST-770 — i18n Framework (6h)
22. XST-771 — Dark/Light Theme (4h)
23. XST-773 — Dashboard Page (4h)
24. XST-774 — Keyboard Shortcuts (4h)

### Sprint 5+ (Week 9+): Advanced Features
25. XST-776 — Price Alerts (4h)
26. XST-775 — Multi-LLM Provider (4h)
27. XST-780 — Writing Assistant (4h)
28. XST-777 — Data Import (4h)
29. XST-779 — Multi-Portfolio (4h)
30. XST-778 — API Access (4h)

---

## Links

- [Jira Board](https://x51labs.atlassian.net/jira/software/projects/XST/boards)
- [Project Review](./PROJECT_REVIEW.md)
- [Commercialization Proposal](./COMMERCIALIZATION_PROPOSAL.md)
