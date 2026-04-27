# Prompts Autoload & Cache

## Mục tiêu

Khi người dùng mở extension, toàn bộ prompts phải sẵn sàng trong state mà không cần vào riêng trang Settings hoặc Prompts. Prompts cũng phải được cache bền vững để lần mở extension tiếp theo có thể dùng dữ liệu local trước, tránh gọi Supabase lại mỗi lần mở.

## Bối cảnh hiện tại

Nguồn prompts hiện tại nằm trong hệ thống unified prompts:

- Registry mặc định: `src/shared/allPrompts.js`, `src/shared/systemPrompts.js`, `src/shared/writingTemplates.js`.
- Background handlers: `src/background/handlers/prompts.js`.
- UI API: `src/ui-preact/api/settingsApi.js`.
- UI state: `src/ui-preact/state/settingsState.js` với signal `allPrompts`.
- Trang quản lý prompts: `src/ui-preact/pages/PromptsPage.jsx`.
- Settings form cũng tự load prompts trong `src/ui-preact/settings/SettingsForm.jsx`.

Hành vi hiện tại:

1. `PromptsPage` gọi `initializeAllPrompts()` rồi `loadAllPrompts()` khi trang Prompts mount.
2. `SettingsForm` cũng gọi `initializeAllPrompts()` rồi `loadAllPrompts()` khi form mount.
3. `MainApp` không preload prompts khi extension vừa mở.
4. `Writing API` có cache in-memory cho writing templates trong 5 phút, nhưng cache này mất khi side panel reload hoặc context JS bị tạo lại.
5. Background handler `PROMPTS_GET_ALL` và `PROMPTS_GET_BY_TYPE` luôn đọc Supabase nếu có auth; fallback defaults chỉ dùng khi auth không khả dụng.

Kết luận: prompts chưa được auto-load ở lifecycle mở extension, và chưa có persistent cache.

## Yêu cầu chức năng

1. Khi extension mở và user đã đăng nhập, prompts phải được nạp tự động vào `allPrompts.value`.
2. Nếu có cache hợp lệ trong `chrome.storage.local`, UI phải dùng cache trước để render nhanh.
3. Không gọi Supabase lại ở mỗi lần mở extension nếu cache vẫn hợp lệ.
4. Nếu cache cũ hoặc thiếu, extension phải refresh từ Supabase ở background và cập nhật cache.
5. Khi user lưu prompts, cache phải được cập nhật ngay để các tính năng dùng prompt mới không cần reload.
6. Cache phải tách theo `user_id`, không dùng lẫn dữ liệu prompt giữa các tài khoản.
7. Khi logout hoặc đổi user, extension không được giữ prompts của user cũ trong UI state.

## Thiết kế đề xuất

### 1. Prompt cache service

Tạo service mới:

```text
src/background/services/promptCacheService.js
```

Service này chịu trách nhiệm:

- Đọc cache từ `chrome.storage.local`.
- Ghi cache sau khi fetch Supabase thành công.
- Validate cache theo user, schema version, registry version và TTL.
- Invalidate cache sau khi save prompts hoặc logout.
- Trả cache nhanh cho `PROMPTS_GET_ALL` và `PROMPTS_GET_BY_TYPE`.

Storage key đề xuất:

```text
x51labs_prompts_cache_v1:{userId}
```

Payload đề xuất:

```json
{
  "schemaVersion": 1,
  "registryVersion": 1,
  "userId": "supabase-user-id",
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
  },
  "cachedAt": 1777248000000,
  "source": "supabase"
}
```

### 2. Cache policy

Đề xuất MVP dùng cache-first với stale fallback có timeout:

- Cache hit và chưa quá TTL: trả ngay cache, không fetch Supabase.
- Cache hit nhưng đã stale: thử refresh Supabase với timeout ngắn; nếu refresh thành công thì trả dữ liệu mới và ghi cache, nếu lỗi thì trả stale cache.
- Cache miss: fetch Supabase; nếu fetch thất bại thì fallback defaults.
- Save prompts thành công: ghi cache ngay bằng dữ liệu mới.

TTL đề xuất:

```text
PROMPTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
```

Lý do: prompts là dữ liệu cấu hình ít thay đổi; 24h đủ giảm network call khi mở extension nhiều lần trong ngày. Người dùng vẫn có nút refresh ở Prompts page để force reload khi cần. Không dùng fire-and-forget refresh ở MVP vì MV3 service worker có thể bị terminate trước khi refresh hoàn tất.

### 3. Autoload khi mở extension

Thêm bootstrap ở UI sau khi auth pass, nên đặt gần `MainApp` hoặc một hook riêng:

```text
src/ui-preact/hooks/usePromptsBootstrap.js
```

Luồng:

1. `App` xác nhận `authenticated === true`.
2. `MainApp` mount.
3. `usePromptsBootstrap(user)` chạy một lần cho user hiện tại.
4. Hook gọi API mới hoặc `loadAllPrompts({ preferCache: true })`.
5. Kết quả được đưa vào `allPrompts.value`.
6. Nếu background refresh cache sau đó, UI nhận message update và sync lại `allPrompts.value`.

Không nên đặt autoload trong `SettingsForm` hoặc `PromptsPage` vì hai component này chỉ chạy khi người dùng mở đúng trang.

### 4. Message/API thay đổi

Mở rộng API hiện có:

```js
loadAllPrompts({
  preferCache: true,
  forceRefresh: false
})
```

Payload gửi background:

```json
{
  "type": "PROMPTS_GET_ALL",
  "data": {
    "preferCache": true,
    "forceRefresh": false
  }
}
```

Response nên có metadata:

```json
{
  "success": true,
  "prompts": {},
  "cache": {
    "hit": true,
    "stale": false,
    "cachedAt": 1777248000000,
    "source": "chrome.storage.local"
  }
}
```

Thêm message broadcast khi background refresh xong:

```text
PROMPTS_CACHE_UPDATED
```

Payload:

```json
{
  "prompts": {},
  "cachedAt": 1777248000000,
  "source": "supabase"
}
```

### 5. Handler behavior

`PROMPTS_GET_ALL`:

1. `requireAuth()` lấy `userId`.
2. Nếu `preferCache && !forceRefresh`, đọc cache theo `userId`.
3. Nếu cache valid và fresh, trả cache.
4. Nếu cache valid nhưng stale, refresh Supabase với timeout; refresh fail thì trả stale cache.
5. Nếu cache miss hoặc `forceRefresh`, fetch Supabase như hiện tại.
6. Merge DB prompts với defaults như logic hiện tại.
7. Ghi cache.
8. Trả response.

`PROMPTS_GET_BY_TYPE`:

1. Ưu tiên đọc all-prompts cache.
2. Nếu cache hợp lệ, filter theo `promptType`.
3. Nếu không có cache, fetch Supabase theo type như hiện tại.
4. Với writing templates, thay cache in-memory trong `writingApi.js` bằng persistent cache hoặc dùng chung `PROMPTS_GET_BY_TYPE` đã cache ở background.

`PROMPTS_UPSERT`:

1. Upsert Supabase như hiện tại.
2. Nếu toàn bộ save thành công, ghi cache bằng payload prompts vừa save.
3. Nếu partial success, không overwrite toàn bộ cache; có thể invalidate cache để lần sau refresh lại.
4. Broadcast `PROMPTS_CACHE_UPDATED` nếu cache được ghi thành công.

## Invalidation

Cache phải bị xóa hoặc bỏ qua trong các trường hợp:

- User logout.
- Auth state đổi sang user khác.
- `PROMPTS_UPSERT` partial failure.
- `registryVersion` thay đổi do thêm/xóa prompt key mặc định.
- User bấm refresh trên Prompts page với `forceRefresh: true`.

Không nên clear toàn bộ `chrome.storage.local`; chỉ xóa các key bắt đầu bằng namespace prompt cache hoặc key của user hiện tại.

## Fallback

Nếu Supabase lỗi và không có cache:

1. Trả defaults từ `getAllDefaultPrompts()` + `getAllPromptMetadata()`.
2. Mark response:

```json
{
  "isDefaultFallback": true,
  "cache": {
    "hit": false,
    "source": "defaults"
  }
}
```

Nếu Supabase lỗi nhưng có stale cache:

1. Trả stale cache.
2. Mark warning metadata để UI có thể hiển thị nhẹ nếu cần.

## Các điểm cần sửa trong code

1. Tạo `src/background/services/promptCacheService.js`.
2. Sửa `src/background/handlers/prompts.js` để dùng cache service trong `PROMPTS_GET_ALL`, `PROMPTS_GET_BY_TYPE`, `PROMPTS_UPSERT`.
3. Thêm `PROMPTS_CACHE_UPDATED` vào `src/shared/messageSchema.js` nếu dùng broadcast.
4. Sửa `src/ui-preact/api/settingsApi.js` để hỗ trợ option `preferCache` và `forceRefresh`.
5. Tạo `src/ui-preact/hooks/usePromptsBootstrap.js`.
6. Gọi hook trong `src/ui-preact/components/MainApp.jsx` sau khi auth user có sẵn.
7. Sửa `src/ui-preact/pages/PromptsPage.jsx` để nút refresh gọi `forceRefresh: true`.
8. Sửa `src/ui-preact/settings/SettingsForm.jsx` để không tự initialize/fetch lại nếu `allPrompts.value` đã có dữ liệu từ bootstrap.
9. Sửa `src/ui-preact/api/writingApi.js` để không giữ cache riêng lệch với unified prompt cache.
10. Đưa `writing.english_learning` vào unified registry/UI vì default content và metadata đã tồn tại trong `writingTemplates.js`.

## Acceptance criteria

- Mở extension lần đầu sau login: prompts được fetch từ Supabase, ghi vào cache, và `allPrompts.value` có dữ liệu trước khi vào Settings/Prompts.
- Đóng và mở lại extension trong TTL: prompts được load từ `chrome.storage.local`, không gọi Supabase cho `PROMPTS_GET_ALL`.
- Vào Writing page ngay sau khi mở extension: templates dùng dữ liệu cache/custom prompt mới nhất.
- Save prompt ở Prompts page hoặc Settings: cache local được cập nhật ngay.
- Logout user A rồi login user B: UI không còn prompt của user A; cache của user B được dùng hoặc fetch riêng.
- Khi thêm prompt key mới trong registry, cache cũ bị coi là invalid hoặc được merge lại với default mới.

## Test plan

Unit tests:

- `promptCacheService` đọc/ghi/validate cache đúng user.
- Cache stale/fresh theo TTL.
- Registry version mismatch làm cache invalid.
- `PROMPTS_GET_BY_TYPE` filter đúng từ all-prompts cache.
- `PROMPTS_UPSERT` success cập nhật cache, partial failure invalidate cache.

Integration/manual tests:

1. Login, mở extension, kiểm tra `allPrompts.value` có dữ liệu dù chưa vào Settings/Prompts.
2. Reload side panel, xác nhận load từ cache.
3. Tắt network hoặc giả lập Supabase lỗi, xác nhận stale cache vẫn dùng được.
4. Sửa một prompt, save, mở lại extension, xác nhận nội dung mới còn trong cache.
5. Đổi account, xác nhận không leak prompts giữa user.

## Lưu ý kỹ thuật

- MV3 service worker có thể bị terminate, nên không dựa vào biến memory trong background.
- `chrome.storage.local` phù hợp hơn `chrome.storage.sync` vì prompt có thể dài và không cần sync qua Chrome account.
- Cache phải lưu metadata đủ để debug: `cachedAt`, `source`, `userId`, `schemaVersion`, `registryVersion`.
- Defaults vẫn là fallback cuối cùng để extension không bị blank khi offline hoặc auth chưa sẵn sàng.
- Registry hiện tại được chuẩn hóa là 8 system prompt + 7 writing templates, gồm `writing.english_learning`.
