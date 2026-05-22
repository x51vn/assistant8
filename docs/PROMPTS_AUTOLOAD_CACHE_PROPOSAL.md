# Đề xuất triển khai: Prompts Autoload & Persistent Cache

> Ngày: 27/04/2026  
> Nguồn đầu vào: `docs/PROMPTS_AUTOLOAD_CACHE.md`  
> Phạm vi: Chrome extension MV3, unified prompts, Preact side panel, Supabase-backed prompt storage

---

## 1) Tóm tắt

Nên triển khai autoload/cache prompts theo hướng **background-owned persistent cache + UI bootstrap hook**.

MVP không cần realtime sync, không cần preload từ service worker startup, và không cần cache riêng cho từng feature. Thay vào đó:

1. Background `prompts.js` vẫn là cổng truy cập duy nhất cho prompt data.
2. Thêm `promptCacheService` để đọc/ghi/validate cache trong `chrome.storage.local`.
3. `MainApp` gọi `usePromptsBootstrap()` ngay sau khi user đã authenticated.
4. `PROMPTS_GET_ALL` dùng cache nếu fresh; nếu cache stale thì refresh Supabase có timeout và fallback về stale cache khi lỗi.
5. `PROMPTS_UPSERT` cập nhật cache ngay sau khi save thành công.

Kết quả mong muốn: mở extension lần thứ hai trong TTL không gọi Supabase cho prompts, nhưng UI vẫn có `allPrompts.value` sẵn trước khi người dùng vào Settings/Prompts/Writing.

---

## 2) Quyết định kiến trúc

### 2.1 Chọn `chrome.storage.local`, không dùng memory cache

MV3 service worker và side panel đều có thể bị reload, nên cache trong biến module như `cachedTemplates` ở `writingApi.js` hoặc `_promptCache` ở `contextMenu.js` không đủ. Cache bền vững phải nằm ở `chrome.storage.local`.

Không dùng `chrome.storage.sync` vì prompt content có thể dài và không cần sync qua Chrome account.

### 2.2 Background là owner của cache

UI không nên tự đọc/ghi prompt cache trực tiếp. Nếu UI cache riêng, logic validate user/version/TTL sẽ bị nhân đôi và dễ lệch với background handlers.

Background handler nên trả metadata cache:

```json
{
  "success": true,
  "prompts": {},
  "cache": {
    "hit": true,
    "stale": false,
    "source": "chrome.storage.local",
    "cachedAt": 1777248000000
  }
}
```

### 2.3 MVP không dùng stale-while-revalidate fire-and-forget

Trong MV3, fire-and-forget refresh sau khi response đã trả có rủi ro service worker bị terminate trước khi fetch/cache xong. MVP nên dùng policy đơn giản hơn:

- Cache fresh: trả cache ngay.
- Cache stale: thử refresh Supabase với timeout ngắn; nếu refresh thành công thì trả fresh data, nếu lỗi thì trả stale cache.
- Cache miss: fetch Supabase; nếu lỗi thì fallback defaults.

SWR + broadcast `PROMPTS_CACHE_UPDATED` có thể là phase 2 nếu cần tối ưu cảm giác tức thì khi stale.

### 2.4 Cache tách theo user

Storage key:

```text
x51labs_prompts_cache_v1:{userId}
```

Không dùng một key global vì logout/login khác user có thể leak prompt cá nhân.

### 2.5 Registry version là điều kiện validate cache

Thêm registry version rõ ràng:

```js
export const PROMPT_REGISTRY_VERSION = 1;
```

Đặt trong `src/shared/allPrompts.js` và tăng version khi thêm/xóa/đổi key mặc định. Cache mismatch version phải được coi là invalid hoặc được refresh từ Supabase.

---

## 3) Phạm vi MVP

### Làm trong phase đầu

- Autoload prompts khi `MainApp` mount và user authenticated.
- Persistent cache all-prompts trong `chrome.storage.local`.
- `PROMPTS_GET_ALL` hỗ trợ `preferCache` và `forceRefresh`.
- `PROMPTS_GET_BY_TYPE` ưu tiên filter từ all-prompts cache.
- `PROMPTS_UPSERT` cập nhật hoặc invalidate cache.
- Logout/auth switch clear UI prompt state và không dùng nhầm cache user cũ.
- Prompts page refresh dùng `forceRefresh: true`.
- Settings form không fetch lại nếu bootstrap đã nạp prompts.
- Writing API bỏ cache riêng hoặc chuyển sang dùng background cached path.

### Không làm trong phase đầu

- Không thêm Supabase realtime/subscription cho prompts.
- Không thêm đồng bộ cache đa thiết bị.
- Không preload prompts ở service worker startup.
- Không thay đổi schema Supabase `prompts`.
- Không refactor toàn bộ Settings UI ngoài phần load/cache prompt.

---

## 4) File thay đổi dự kiến

### Tạo mới

- `src/background/services/promptCacheService.js`
  - Cache key, TTL, read/write/remove, validate payload, filter by type.

- `src/ui-preact/hooks/usePromptsBootstrap.js`
  - Load prompts once per authenticated user, set `allPrompts.value`, clear state on logout/user switch.

- `tests/unit/promptCacheService.test.js`
  - Unit tests cache fresh/stale/user mismatch/version mismatch/type filter.

- `tests/unit/hooks/usePromptsBootstrap.test.js`
  - Hook bootstrap behavior with mocked `loadAllPrompts`.

### Sửa

- `src/shared/allPrompts.js`
  - Export `PROMPT_REGISTRY_VERSION`.
  - Chuẩn hóa comment/count hiện tại. Code đang có 8 system prompts và `DEFAULT_WRITING_TEMPLATES` có thêm `writing.english_learning`; các comment “12 prompts / 6 system” đang sai.

- `src/shared/messageSchema.js`
  - Có thể chưa cần message mới ở MVP. Nếu phase 2 dùng broadcast thì thêm `PROMPTS_CACHE_UPDATED`.

- `src/background/handlers/prompts.js`
  - Dùng cache service trong `PROMPTS_GET_ALL`, `PROMPTS_GET_BY_TYPE`, `PROMPTS_UPSERT`.

- `src/background/handlers/supabaseAuth.js`
  - Khi `SIGNED_OUT`, invalidate cache user hiện tại nếu biết userId, hoặc chỉ clear UI state qua broadcast và để cache per-user nằm yên. MVP không nên xóa cache của user khác.

- `src/ui-preact/api/settingsApi.js`
  - `loadAllPrompts(options)` gửi `preferCache`/`forceRefresh`.
  - `saveAllPrompts()` clear writing template cache hoặc bỏ cache riêng.

- `src/ui-preact/components/MainApp.jsx`
  - Gọi `usePromptsBootstrap(user)`.

- `src/ui-preact/pages/PromptsPage.jsx`
  - Load thường dùng cache.
  - Nút refresh dùng `forceRefresh: true`.

- `src/ui-preact/settings/SettingsForm.jsx`
  - Nếu `allPrompts.value` đã có dữ liệu, dùng làm initial local state thay vì gọi `initializeAllPrompts()` + `loadAllPrompts()` ngay.

- `src/ui-preact/api/writingApi.js`
  - Dùng `PROMPTS_GET_BY_TYPE` cached path, bỏ TTL memory cache 5 phút hoặc chỉ giữ request-level memo rất ngắn và invalidate chắc chắn sau save.

---

## 5) Cache contract đề xuất

```js
const PROMPTS_CACHE_SCHEMA_VERSION = 1;
const PROMPTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
```

Payload:

```json
{
  "schemaVersion": 1,
  "registryVersion": 1,
  "userId": "supabase-user-id",
  "cachedAt": 1777248000000,
  "source": "supabase",
  "prompts": {
    "prompt.master": {
      "key": "prompt.master",
      "title": "Master Prompt",
      "content": "...",
      "tags": [],
      "promptType": "system",
      "isSystem": true,
      "updatedAt": "2026-04-27T00:00:00.000Z"
    }
  }
}
```

Validation:

- `schemaVersion === PROMPTS_CACHE_SCHEMA_VERSION`
- `registryVersion === PROMPT_REGISTRY_VERSION`
- `userId === currentUserId`
- `prompts` là object và có `prompt.master.content`
- Fresh khi `Date.now() - cachedAt < PROMPTS_CACHE_TTL_MS`

---

## 6) Luồng runtime

### Mở extension khi đã login

```text
App authenticated
  -> MainApp mount
  -> usePromptsBootstrap(user)
  -> loadAllPrompts({ preferCache: true })
  -> background PROMPTS_GET_ALL
  -> cache fresh? return cache
  -> allPrompts.value = prompts
```

### Cache stale

```text
PROMPTS_GET_ALL(preferCache=true)
  -> read stale cache
  -> fetch Supabase with short timeout
  -> success: merge defaults, write cache, return fresh
  -> failure: return stale cache with cache.stale=true
```

### User bấm refresh ở Prompts page

```text
PromptsPage refresh
  -> loadAllPrompts({ forceRefresh: true })
  -> ignore cache
  -> fetch Supabase
  -> write cache
  -> update page local state + allPrompts signal
```

### Save prompts

```text
saveAllPrompts()
  -> PROMPTS_UPSERT
  -> Supabase upsert
  -> full success: write cache with submitted/normalized prompts
  -> partial success: invalidate cache, return partial failure
```

### Logout hoặc đổi user

```text
AUTH_STATE_CHANGED authenticated=false
  -> usePromptsBootstrap clears allPrompts.value

AUTH_STATE_CHANGED authenticated=true with new user.id
  -> usePromptsBootstrap reloads prompts for new user
```

---

## 7) Triển khai theo phase

### Phase 0: Registry cleanup

Mục tiêu: giảm ambiguity trước khi cache theo registry version.

- Chuẩn hóa comment “12 prompts / 6 system” trong `allPrompts.js`, `prompts.js`, `AllPromptsSection.jsx`, `PromptsPage.jsx`.
- Quyết định rõ `writing.english_learning` có thuộc unified prompt UI không.
- Export `PROMPT_REGISTRY_VERSION`.

### Phase 1: Background cache

Mục tiêu: prompt handlers có persistent cache nhưng UI chưa đổi nhiều.

- Tạo `promptCacheService`.
- Sửa `PROMPTS_GET_ALL`.
- Sửa `PROMPTS_GET_BY_TYPE`.
- Sửa `PROMPTS_UPSERT`.
- Unit test cache service và handler behavior.

### Phase 2: UI bootstrap

Mục tiêu: prompts được load khi mở extension, không chờ Settings/Prompts page.

- Tạo `usePromptsBootstrap`.
- Gọi hook trong `MainApp`.
- Clear `allPrompts.value` khi logout/user switch.
- Sửa Prompts page refresh force reload.
- Sửa Settings form tránh double fetch.

### Phase 3: Feature cache consolidation

Mục tiêu: không còn cache prompt riêng lệch dữ liệu.

- Sửa Writing API để dùng background cached path.
- Đánh giá cache context menu prompt hiện có trong `contextMenu.js`; nếu giữ, cần invalidate cùng prompt cache hoặc chuyển sang cache service.
- Đảm bảo save prompt làm Writing/English/Context Menu dùng prompt mới ngay.

### Phase 4: Optional SWR broadcast

Chỉ làm nếu phase 1-3 cho thấy stale refresh blocking gây chậm UI.

- Thêm `PROMPTS_CACHE_UPDATED`.
- Background broadcast khi refresh xong.
- UI listener update `allPrompts.value` nếu userId khớp và local form không dirty.

---

## 8) Rủi ro và cách giảm

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Cache leak giữa user | Prompt cá nhân bị dùng sai tài khoản | Key theo userId, validate `userId`, clear UI state on logout |
| Cache stale sau save partial | UI dùng dữ liệu không đồng bộ | Full success mới overwrite cache; partial failure invalidate |
| Registry thay đổi làm thiếu prompt mới | UI thiếu prompt/default mới | `PROMPT_REGISTRY_VERSION` invalidates cache |
| Double fetch do SettingsForm/PromptsPage vẫn tự load | Mất lợi ích cache | Bootstrap + guard `allPrompts.value` trong SettingsForm |
| Writing API dùng memory cache cũ | Prompt save không có hiệu lực ngay | Bỏ/cache lại qua background, gọi invalidate sau save |
| Fire-and-forget refresh bị SW terminate | Cache không được refresh | MVP refresh blocking-with-timeout khi stale |

---

## 9) Acceptance criteria

- Mở extension sau login và chưa vào Settings/Prompts: `allPrompts.value` đã có prompts.
- Mở lại extension trong 24h: `PROMPTS_GET_ALL` trả cache fresh, không fetch Supabase.
- Cache stale + Supabase lỗi: extension vẫn dùng stale cache.
- Cache miss + Supabase lỗi: extension dùng defaults và không blank UI.
- Save prompts thành công: cache được cập nhật, Writing page dùng nội dung mới.
- Partial save failure: cache không bị overwrite bằng dữ liệu không hoàn chỉnh.
- Logout user A rồi login user B: UI không hiển thị prompt của user A.
- `forceRefresh: true` ở Prompts page bỏ qua cache và ghi lại cache mới.

---

## 10) Test plan

### Unit

- `promptCacheService.readPromptCache()` trả fresh hit khi user/version/schema đúng.
- Cache user mismatch trả miss.
- Cache registry mismatch trả miss.
- Cache stale trả payload kèm `stale=true`.
- `filterPromptsByType(cache.prompts, 'writing')` chỉ trả writing prompts.
- `PROMPTS_UPSERT` full success gọi write cache.
- `PROMPTS_UPSERT` partial failure gọi invalidate cache.

### UI/hook

- `usePromptsBootstrap` gọi `loadAllPrompts({ preferCache: true })` khi có user.
- Hook không reload lại nếu cùng user đã bootstrap.
- Hook clear `allPrompts.value` khi user null.
- Hook reload khi user id đổi.

### Manual

1. Login, mở side panel, không vào Prompts/Settings, kiểm tra prompt state đã có dữ liệu.
2. Reload side panel, xác nhận cache hit trong log.
3. Tắt network, reload side panel, xác nhận stale cache/default fallback hoạt động.
4. Sửa `prompt.english`, save, vào English/Writing flow xác nhận dùng prompt mới.
5. Logout/login account khác, xác nhận prompt không leak.

---

## 11) Khuyến nghị commit sequence

1. `chore: normalize prompt registry metadata`
2. `feat: add persistent prompt cache service`
3. `feat: serve prompts from cache-aware handlers`
4. `feat: bootstrap prompts on extension open`
5. `fix: consolidate writing prompt cache`
6. `test: cover prompt cache autoload behavior`

---

## 12) Kết luận

Đề xuất nên đi theo MVP nhỏ, ổn định: cache bền vững ở background, bootstrap ở `MainApp`, và force refresh rõ ràng ở Prompts page. Cách này xử lý đúng yêu cầu “tự load khi mở extension” và “không load lại mỗi lần mở”, nhưng vẫn giữ kiến trúc MV3 stateless và tránh tạo nhiều cache prompt rời rạc.
