# X-Neews: Hệ thống Xác thực và API Watchlist

## Mục lục
1. [Cơ chế Xác thực](#cơ-chế-xác-thực)
2. [API Xác thực](#api-xác-thực)
3. [API Watchlist - CRUD](#api-watchlist---crud)
4. [Pagination](#pagination)
5. [Xử lý Lỗi](#xử-lý-lỗi)
6. [Ví dụ Sử dụng](#ví-dụ-sử-dụng)

---

## Cơ chế Xác thực

### Tổng quan

X-Neews sử dụng hệ thống xác thực báo cáo dựa trên **JWT (JSON Web Tokens)** với các tính năng:

- **Access Token**: Token truy cập ngắn hạn, thời hạn **24 giờ**
- **Refresh Token**: Token làm mới token truy cập, thời hạn **365 ngày** (1 năm)
- **JWT Secret Key**: Được lưu trữ trong biến môi trường `JWT_SECRET_KEY`
- **Thuật toán**: HS256 (HMAC with SHA-256)

### Quy trình Xác thực

```
1. Người dùng đăng ký hoặc đăng nhập
   ↓
2. Hệ thống trả về Access Token + Refresh Token
   ↓
3. Client sử dụng Access Token trong header Authorization
   ↓
4. Khi Access Token hết hạn:
   - Client sử dụng Refresh Token để lấy Access Token mới
   - Không cần nhập lại mật khẩu
   ↓
5. Người dùng đăng xuất: Invalidate Refresh Token
```

### Cấu trúc Token

**Access Token:**
```json
{
  "sub": "user_id",
  "exp": "<expiration_timestamp>",
  "token_type": "access"
}
```

**Refresh Token:**
```json
{
  "sub": "user_id",
  "exp": "<expiration_timestamp>",
  "token_type": "refresh"
}
```

### Yêu cầu Bảo mật - Mật khẩu

Mật khẩu phải đáp ứng các tiêu chí sau:
- ✅ Ít nhất **8 ký tự**
- ✅ Ít nhất **1 ký tự chữ hoa** (A-Z)
- ✅ Ít nhất **1 ký tự chữ thường** (a-z)
- ✅ Ít nhất **1 chữ số** (0-9)
- ✅ Ít nhất **1 ký tự đặc biệt** (!@#$%^&*()_+-=[]{}|;:,.<>?)

Ví dụ mật khẩu hợp lệ: `SecurePass123!`

---

## API Xác thực

**Base URL**: `/api/v1/auth`

### 1. Đăng ký (Register)

**Endpoint**: `POST /register`

**Mô tả**: Tạo tài khoản người dùng mới

**Rate Limit**: 5 lần/giờ trên mỗi IP

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "Nguyễn Văn A",
  "language": "vi",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

**Tham số**:
- `email` (string, bắt buộc): Email đăng ký (phải là email duy nhất)
- `password` (string, bắt buộc): Mật khẩu (tối thiểu 8 ký tự, phải đáp ứng yêu cầu bảo mật)
- `name` (string, tùy chọn): Tên đầy đủ (tối đa 100 ký tự)
- `language` (string, tùy chọn): Ngôn ngữ ưu tiên. Mặc định: `en`. Hỗ trợ: `en, vi, ja, zh, ko, th, id, ms`
- `timezone` (string, tùy chọn): Múi giờ (định dạng IANA). Mặc định: `UTC`

**Response** (201 Created):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Status Codes**:
- `201`: Đăng ký thành công
- `400`: Email đã được đăng ký hoặc dữ liệu không hợp lệ
- `422`: Validation error (mật khẩu không đạt yêu cầu, ngôn ngữ không hỗ trợ, v.v.)

---

### 2. Đăng nhập (Login)

**Endpoint**: `POST /login`

**Mô tả**: Xác thực người dùng bằng email và mật khẩu

**Rate Limit**: 10 lần/15 phút trên mỗi IP

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Tham số**:
- `email` (string, bắt buộc): Email đã đăng ký
- `password` (string, bắt buộc): Mật khẩu

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Status Codes**:
- `200`: Đăng nhập thành công
- `401`: Email/mật khẩu không đúng hoặc người dùng không hoạt động
- `423`: Tài khoản bị khóa (rate limit vượt quá)

---

### 3. Làm Mới Token (Refresh Token)

**Endpoint**: `POST /refresh-token`

**Mô tả**: Lấy Access Token mới bằng Refresh Token

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Tham số**:
- `refresh_token` (string, bắt buộc): Refresh Token hợp lệ

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Status Codes**:
- `200`: Token được làm mới thành công
- `401`: Refresh Token không hợp lệ hoặc hết hạn

---

### 4. Lấy Thông Tin Người Dùng (Get Profile)

**Endpoint**: `GET /me`

**Mô tả**: Lấy thông tin chi tiết của người dùng đã xác thực

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "user",
  "name": "Nguyễn Văn A",
  "language": "vi",
  "timezone": "Asia/Ho_Chi_Minh",
  "subscription_plan": "free"
}
```

**Status Codes**:
- `200`: Lấy thông tin thành công
- `401`: Access Token không hợp lệ hoặc hết hạn
- `404`: Người dùng không tìm thấy

---

### 5. Tạo API Key

**Endpoint**: `POST /generate-api-key`

**Mô tả**: Tạo API Key mới để xác thực qua API (thay thế API Key cũ nếu có)

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "api_key": "cgpta_abc123xyz456...",
  "message": "API key generated successfully. Store it securely - it won't be shown again."
}
```

**Lưu ý**: 
- ⚠️ API Key chỉ được hiển thị một lần
- ⚠️ Tạo API Key mới sẽ thay thế API Key cũ
- Lưu trữ an toàn API Key (sử dụng trong biến môi trường)

**Status Codes**:
- `200`: API Key được tạo thành công
- `401`: Access Token không hợp lệ hoặc hết hạn
- `404`: Người dùng không tìm thấy

---

### 6. Đăng Xuất (Logout)

**Endpoint**: `POST /logout`

**Mô tả**: Đăng xuất bằng cách vô hiệu hóa tất cả Refresh Token

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "message": "Logged out successfully. All refresh tokens have been invalidated."
}
```

**Lưu ý**:
- Access Token vẫn có hiệu lực cho đến khi hết hạn (24 giờ)
- Client nên xóa Access Token khỏi bộ nhớ để hoàn toàn đăng xuất
- Refresh Token không thể sử dụng để lấy Access Token mới

**Status Codes**:
- `200`: Đăng xuất thành công
- `401`: Access Token không hợp lệ hoặc hết hạn

---

## API Watchlist - CRUD

**Base URL**: `/api/v1/watchlist`

Tất cả các endpoint Watchlist yêu cầu xác thực bằng Access Token

### Cấu trúc Dữ liệu Watchlist

**Watchlist Object**:
```json
{
  "symbol": "VNM",
  "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
  "risk": "Cao",
  "entry": 75.5,
  "target": 90.0,
  "stoploss": 68.0,
  "notes": "Theo dõi báo cáo quý 4",
  "created_at": "2026-02-09T10:30:00",
  "price": 78.50,
  "ediff": 0.0397,
  "highlighted": true
}
```

**Giải thích các trường**:
- `symbol` (string): Mã chứng chỉ (vd: VNM, FPT, TCB)
- `investment_thesis` (string, tùy chọn): Luận điểm đầu tư
- `risk` (string, tùy chọn): Mức rủi ro (Thấp, Trung bình, Cao)
- `entry` (decimal, tùy chọn): Giá nhập cuộc
- `target` (decimal, tùy chọn): Giá mục tiêu
- `stoploss` (decimal, tùy chọn): Giá dừng lỗ
- `notes` (string, tùy chọn): Ghi chú bổ sung
- `created_at` (datetime): Thời gian tạo (tự động)
- `price` (decimal, chỉ đọc): Giá đóng cửa mới nhất từ `tbl_price_board_day`
- `ediff` (decimal, chỉ đọc): Tỷ lệ: (price - entry) / price (sắp xếp tăng dần)
- `highlighted` (boolean): Đánh dấu quan trọng

---

### 1. Tạo Watchlist (CREATE)

**Endpoint**: `POST /`

**Mô tả**: Tạo mục watchlist mới hoặc cập nhật nếu đã tồn tại

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request Body**:
```json
{
  "symbol": "VNM",
  "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
  "risk": "Cao",
  "entry": 75.5,
  "target": 90.0,
  "stoploss": 68.0,
  "notes": "Theo dõi báo cáo quý 4",
  "highlighted": false
}
```

**Tham số**:
- `symbol` (string, bắt buộc): Mã chứng chỉ
- `investment_thesis` (string, tùy chọn): Luận điểm đầu tư
- `risk` (string, tùy chọn): Mức rủi ro
- `entry` (decimal, tùy chọn): Giá nhập cuộc
- `target` (decimal, tùy chọn): Giá mục tiêu
- `stoploss` (decimal, tùy chọn): Giá dừng lỗ
- `notes` (string, tùy chọn): Ghi chú
- `highlighted` (boolean, tùy chọn): Mặc định `false`

**Response** (201 Created):
```json
{
  "symbol": "VNM",
  "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
  "risk": "Cao",
  "entry": 75.5,
  "target": 90.0,
  "stoploss": 68.0,
  "notes": "Theo dõi báo cáo quý 4",
  "created_at": "2026-02-09T10:30:00",
  "price": 78.50,
  "ediff": 0.0397,
  "highlighted": false
}
```

**Status Codes**:
- `201`: Tạo thành công
- `400`: Dữ liệu không hợp lệ
- `401`: Không xác thực
- `500`: Lỗi máy chủ

---

### 2. Lấy Tất Cả Watchlist (READ - All)

**Endpoint**: `GET /`

**Mô tả**: Lấy tất cả mục watchlist của người dùng với pagination

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `page` (integer, tùy chọn): Số trang (1-based). Mặc định: `1`
- `size` (integer, tùy chọn): Số mục trên trang. Mặc định: `20`. Max: `100`

**Ví dụ**:
```
GET /api/v1/watchlist?page=1&size=10
```

**Response** (200 OK):
```json
{
  "data": [
    {
      "symbol": "VNM",
      "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
      "risk": "Cao",
      "entry": 75.5,
      "target": 90.0,
      "stoploss": 68.0,
      "notes": "Theo dõi báo cáo quý 4",
      "created_at": "2026-02-09T10:30:00",
      "price": 78.50,
      "ediff": 0.0397,
      "highlighted": true
    },
    {
      "symbol": "FPT",
      "investment_thesis": "Theo dõi tăng trưởng",
      "risk": "Trung bình",
      "entry": 85.0,
      "target": 100.0,
      "stoploss": 75.0,
      "notes": "Nút kháng cự ở 100",
      "created_at": "2026-02-08T14:15:00",
      "price": 88.30,
      "ediff": 0.0387,
      "highlighted": false
    }
  ],
  "total": 15,
  "page": 1,
  "size": 10,
  "total_pages": 2
}
```

**Tham số Response**:
- `data` (array): Danh sách watchlist entries
- `total` (integer): Tổng số mục
- `page` (integer): Trang hiện tại
- `size` (integer): Số mục trên trang
- `total_pages` (integer): Tổng số trang

**Lưu ý Sắp xếp**:
- Watchlist được sắp xếp theo `highlighted DESC, ediff ASC NULLS LAST`
- Các mục được đánh dấu nổi bật xuất hiện trước
- Các mục không được đánh dấu được sắp xếp theo ediff (tăng dần)
- Các mục không có ediff xuất hiện cuối

**Status Codes**:
- `200`: Lấy dữ liệu thành công
- `401`: Không xác thực
- `500`: Lỗi máy chủ

---

### 3. Lấy Watchlist Theo Symbol (READ - Single)

**Endpoint**: `GET /symbol/{symbol}`

**Mô tả**: Lấy một mục watchlist cụ thể theo mã chứng chỉ

**Headers**:
```
Authorization: Bearer <access_token>
```

**Path Parameters**:
- `symbol` (string, bắt buộc): Mã chứng chỉ (vd: VNM, FPT)

**Response** (200 OK):
```json
{
  "symbol": "VNM",
  "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
  "risk": "Cao",
  "entry": 75.5,
  "target": 90.0,
  "stoploss": 68.0,
  "notes": "Theo dõi báo cáo quý 4",
  "created_at": "2026-02-09T10:30:00",
  "price": 78.50,
  "ediff": 0.0397,
  "highlighted": true
}
```

**Status Codes**:
- `200`: Lấy dữ liệu thành công
- `401`: Không xác thực
- `404`: Watchlist entry không tìm thấy
- `500`: Lỗi máy chủ

---

### 4. Cập Nhật Watchlist (UPDATE)

**Endpoint**: `PUT /symbol/{symbol}`

**Mô tả**: Cập nhật mục watchlist theo mã chứng chỉ

**Headers**:
```
Authorization: Bearer <access_token>
```

**Path Parameters**:
- `symbol` (string, bắt buộc): Mã chứng chỉ

**Request Body** (tất cả trường tùy chọn):
```json
{
  "investment_thesis": "Cập nhật luận điểm đầu tư",
  "risk": "Trung bình",
  "entry": 76.0,
  "target": 95.0,
  "stoploss": 70.0,
  "notes": "Ghi chú cập nhật",
  "highlighted": true
}
```

**Tham số**:
- `investment_thesis` (string, tùy chọn): Luận điểm đầu tư
- `risk` (string, tùy chọn): Mức rủi ro
- `entry` (decimal, tùy chọn): Giá nhập cuộc
- `target` (decimal, tùy chọn): Giá mục tiêu
- `stoploss` (decimal, tùy chọn): Giá dừng lỗ
- `notes` (string, tùy chọn): Ghi chú
- `highlighted` (boolean, tùy chọn): Đánh dấu

**Response** (200 OK):
```json
{
  "symbol": "VNM",
  "investment_thesis": "Cập nhật luận điểm đầu tư",
  "risk": "Trung bình",
  "entry": 76.0,
  "target": 95.0,
  "stoploss": 70.0,
  "notes": "Ghi chú cập nhật",
  "created_at": "2026-02-09T10:30:00",
  "price": 78.50,
  "ediff": 0.0319,
  "highlighted": true
}
```

**Status Codes**:
- `200`: Cập nhật thành công
- `400`: Dữ liệu không hợp lệ
- `401`: Không xác thực
- `404`: Watchlist entry không tìm thấy
- `500`: Lỗi máy chủ

---

### 5. Xóa Watchlist (DELETE)

**Endpoint**: `DELETE /symbol/{symbol}`

**Mô tả**: Xóa một mục watchlist theo mã chứng chỉ

**Headers**:
```
Authorization: Bearer <access_token>
```

**Path Parameters**:
- `symbol` (string, bắt buộc): Mã chứng chỉ

**Response** (200 OK):
```json
{
  "message": "Watchlist entry for symbol VNM deleted successfully"
}
```

**Status Codes**:
- `200`: Xóa thành công
- `401`: Không xác thực
- `404`: Watchlist entry không tìm thấy
- `500`: Lỗi máy chủ

---

### 6. Bật/Tắt Đánh Dấu (Toggle Highlight)

**Endpoint**: `POST /symbol/{symbol}/toggle-highlight`

**Mô tả**: Bật/tắt trạng thái đánh dấu nổi bật cho mục watchlist

**Headers**:
```
Authorization: Bearer <access_token>
```

**Path Parameters**:
- `symbol` (string, bắt buộc): Mã chứng chỉ

**Response** (200 OK):
```json
{
  "symbol": "VNM",
  "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
  "risk": "Cao",
  "entry": 75.5,
  "target": 90.0,
  "stoploss": 68.0,
  "notes": "Theo dõi báo cáo quý 4",
  "created_at": "2026-02-09T10:30:00",
  "price": 78.50,
  "ediff": 0.0397,
  "highlighted": false
}
```

**Lưu ý**:
- Nếu watchlist không được đánh dấu → được đánh dấu (`highlighted: true`)
- Nếu watchlist được đánh dấu → không được đánh dấu (`highlighted: false`)

**Status Codes**:
- `200`: Toggle thành công
- `401`: Không xác thực
- `404`: Watchlist entry không tìm thấy
- `500`: Lỗi máy chủ

---

## Pagination

### Quy tắc Pagination

- **Cơ sở 1** (1-based): Trang dầu tiên là `page=1`
- **Kích thước mặc định**: 20 mục trên trang
- **Kích thước tối đa**: 100 mục trên trang

### Ví dụ Pagination

**Lấy trang 2, 10 mục trên trang**:
```
GET /api/v1/watchlist?page=2&size=10
```

**Response Header thường chứa**:
```json
{
  "total": 25,
  "page": 2,
  "size": 10,
  "total_pages": 3
}
```

### Tính toán Offset

```
offset = (page - 1) * size
```

Ví dụ: `page=3, size=10` → `offset = (3-1)*10 = 20` (bắt đầu từ mục thứ 21)

---

## Xử lý Lỗi

### Cấu trúc Lỗi

```json
{
  "detail": "Could not validate credentials",
  "status_code": 401,
  "error_code": "INVALID_CREDENTIALS"
}
```

### Các Lỗi Phổ Biến

| HTTP Status | Mô tả | Nguyên nhân |
|---|---|---|
| `401` | Unauthorized | Access Token không hợp lệ/hết hạn, không có xác thực |
| `403` | Forbidden | Người dùng không đủ quyền |
| `404` | Not Found | Tài nguyên không tìm thấy (watchlist entry, người dùng, v.v.) |
| `422` | Unprocessable Entity | Dữ liệu validation error (mật khẩu yếu, email sai định dạng) |
| `429` | Too Many Requests | Vượt quá rate limit |
| `500` | Internal Server Error | Lỗi máy chủ |

### Xử lý Token Hết Hạn

**Khi Access Token hết hạn**:

1. Nhận phản hồi `401 Unauthorized`
2. Sử dụng Refresh Token để lấy Access Token mới:
```bash
POST /api/v1/auth/refresh-token
{
  "refresh_token": "your_refresh_token"
}
```
3. Sử dụng Access Token mới cho yêu cầu tiếp theo

**Khi Refresh Token hết hạn**:
- Người dùng cần đăng nhập lại

---

## Ví dụ Sử dụng

### 1. Quy Trình Đăng Ký & Đăng Nhập

```bash
# Đăng ký
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "Nguyễn Văn A",
    "language": "vi",
    "timezone": "Asia/Ho_Chi_Minh"
  }'

# Phản hồi đăng ký
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}

# Lưu access_token và refresh_token
```

### 2. Tạo Watchlist

```bash
curl -X POST http://localhost:8000/api/v1/watchlist \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "VNM",
    "investment_thesis": "Cổ phiếu ưu tiên dài hạn",
    "risk": "Cao",
    "entry": 75.5,
    "target": 90.0,
    "stoploss": 68.0,
    "notes": "Theo dõi báo cáo quý 4",
    "highlighted": false
  }'
```

### 3. Lấy Tất Cả Watchlist với Pagination

```bash
# Lấy trang 1, 10 mục
curl -X GET "http://localhost:8000/api/v1/watchlist?page=1&size=10" \
  -H "Authorization: Bearer <access_token>"

# Lấy trang 2
curl -X GET "http://localhost:8000/api/v1/watchlist?page=2&size=10" \
  -H "Authorization: Bearer <access_token>"
```

### 4. Cập Nhật Watchlist

```bash
curl -X PUT http://localhost:8000/api/v1/watchlist/symbol/VNM \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "target": 95.0,
    "stoploss": 70.0,
    "highlighted": true
  }'
```

### 5. Bật/Tắt Đánh Dấu

```bash
curl -X POST http://localhost:8000/api/v1/watchlist/symbol/VNM/toggle-highlight \
  -H "Authorization: Bearer <access_token>"
```

### 6. Xóa Watchlist

```bash
curl -X DELETE http://localhost:8000/api/v1/watchlist/symbol/VNM \
  -H "Authorization: Bearer <access_token>"
```

### 7. Làm Mới Access Token

```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "<refresh_token>"
  }'

# Phản hồi
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 8. Lấy Thông Tin Người Dùng

```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"

# Phản hồi
{
  "id": 1,
  "email": "user@example.com",
  "username": "user",
  "name": "Nguyễn Văn A",
  "language": "vi",
  "timezone": "Asia/Ho_Chi_Minh",
  "subscription_plan": "free"
}
```

### 9. Tạo API Key

```bash
curl -X POST http://localhost:8000/api/v1/auth/generate-api-key \
  -H "Authorization: Bearer <access_token>"

# Phản hồi
{
  "api_key": "cgpta_abc123xyz456...",
  "message": "API key generated successfully. Store it securely - it won't be shown again."
}
```

### 10. Đăng Xuất

```bash
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer <access_token>"

# Phản hồi
{
  "message": "Logged out successfully. All refresh tokens have been invalidated."
}
```

---

## JavaScript/TypeScript SDK Example

```typescript
class XNeewsClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string = 'http://localhost:8000/api/v1') {
    this.baseUrl = baseUrl;
  }

  // Đăng ký
  async register(email: string, password: string, name: string, language: string = 'en') {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, language })
    });
    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  // Đăng nhập
  async login(email: string, password: string) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  // Tạo watchlist
  async createWatchlist(symbol: string, data: any) {
    return this._request('POST', '/watchlist', data);
  }

  // Lấy watchlist
  async getWatchlist(page: number = 1, size: number = 20) {
    return this._request('GET', `/watchlist?page=${page}&size=${size}`);
  }

  // Cập nhật watchlist
  async updateWatchlist(symbol: string, data: any) {
    return this._request('PUT', `/watchlist/symbol/${symbol}`, data);
  }

  // Xóa watchlist
  async deleteWatchlist(symbol: string) {
    return this._request('DELETE', `/watchlist/symbol/${symbol}`);
  }

  // Helper method
  private async _request(method: string, endpoint: string, body?: any) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 401 && this.refreshToken) {
      // Refresh access token
      await this.refreshAccessToken();
      return this._request(method, endpoint, body);
    }

    return response.json();
  }

  private async refreshAccessToken() {
    const response = await fetch(`${this.baseUrl}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.refreshToken })
    });
    const data = await response.json();
    this.accessToken = data.access_token;
  }
}

// Sử dụng
const client = new XNeewsClient();

// Đăng nhập
await client.login('user@example.com', 'SecurePass123!');

// Tạo watchlist
await client.createWatchlist('VNM', {
  investment_thesis: 'Cổ phiếu ưu tiên dài hạn',
  risk: 'Cao',
  entry: 75.5,
  target: 90.0,
  stoploss: 68.0
});

// Lấy watchlist
const watchlists = await client.getWatchlist(1, 10);
```

---

## Python SDK Example

```python
import requests
from typing import Optional, Dict, Any

class XNeewsClient:
    def __init__(self, base_url: str = 'http://localhost:8000/api/v1'):
        self.base_url = base_url
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.session = requests.Session()

    def register(self, email: str, password: str, name: str, language: str = 'en') -> Dict[str, Any]:
        """Đặng ký người dùng mới"""
        response = self.session.post(
            f'{self.base_url}/auth/register',
            json={
                'email': email,
                'password': password,
                'name': name,
                'language': language
            }
        )
        data = response.json()
        self.access_token = data['access_token']
        self.refresh_token = data['refresh_token']
        return data

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Đăng nhập"""
        response = self.session.post(
            f'{self.base_url}/auth/login',
            json={'email': email, 'password': password}
        )
        data = response.json()
        self.access_token = data['access_token']
        self.refresh_token = data['refresh_token']
        return data

    def create_watchlist(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """Tạo watchlist entry"""
        return self._request('POST', '/watchlist', {
            'symbol': symbol,
            **kwargs
        })

    def get_watchlist(self, page: int = 1, size: int = 20) -> Dict[str, Any]:
        """Lấy tất cả watchlist"""
        return self._request('GET', f'/watchlist?page={page}&size={size}')

    def get_watchlist_by_symbol(self, symbol: str) -> Dict[str, Any]:
        """Lấy watchlist theo symbol"""
        return self._request('GET', f'/watchlist/symbol/{symbol}')

    def update_watchlist(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """Cập nhật watchlist"""
        return self._request('PUT', f'/watchlist/symbol/{symbol}', kwargs)

    def delete_watchlist(self, symbol: str) -> Dict[str, Any]:
        """Xóa watchlist"""
        return self._request('DELETE', f'/watchlist/symbol/{symbol}')

    def toggle_highlight(self, symbol: str) -> Dict[str, Any]:
        """Bật/tắt đánh dấu"""
        return self._request('POST', f'/watchlist/symbol/{symbol}/toggle-highlight')

    def get_me(self) -> Dict[str, Any]:
        """Lấy thông tin người dùng"""
        return self._request('GET', '/auth/me')

    def _request(self, method: str, endpoint: str, json: Optional[Dict] = None) -> Dict[str, Any]:
        """Helper method cho request"""
        headers = {}
        if self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'

        url = f'{self.base_url}{endpoint}'
        response = self.session.request(method, url, json=json, headers=headers)

        if response.status_code == 401 and self.refresh_token:
            self._refresh_access_token()
            return self._request(method, endpoint, json)

        return response.json()

    def _refresh_access_token(self):
        """Làm mới access token"""
        response = self.session.post(
            f'{self.base_url}/auth/refresh-token',
            json={'refresh_token': self.refresh_token}
        )
        data = response.json()
        self.access_token = data['access_token']

# Sử dụng
client = XNeewsClient()

# Đăng nhập
client.login('user@example.com', 'SecurePass123!')

# Tạo watchlist
client.create_watchlist(
    'VNM',
    investment_thesis='Cổ phiếu ưu tiên dài hạn',
    risk='Cao',
    entry=75.5,
    target=90.0,
    stoploss=68.0
)

# Lấy watchlist
watchlists = client.get_watchlist(page=1, size=10)
print(f"Tổng: {watchlists['total']}, Trang: {watchlists['page']}")

# Cập nhật
client.update_watchlist('VNM', target=95.0, highlighted=True)

# Xóa
client.delete_watchlist('VNM')
```

---

## API Response Code Examples

### Thành công
```
HTTP/1.1 200 OK
{
  "symbol": "VNM",
  ...
}
```

### Validation Error
```
HTTP/1.1 422 Unprocessable Entity
{
  "detail": [
    {
      "loc": ["body", "password"],
      "msg": "Password must contain at least 1 uppercase letter",
      "type": "value_error"
    }
  ]
}
```

### Unauthorized
```
HTTP/1.1 401 Unauthorized
{
  "detail": "Could not validate credentials"
}
```

### Not Found
```
HTTP/1.1 404 Not Found
{
  "detail": "Watchlist entry not found: VNM"
}
```

### Server Error
```
HTTP/1.1 500 Internal Server Error
{
  "detail": "An error occurred while deleting watchlist entry"
}
```

---

## Tài Liệu Tham Khảo

- **Swagger/OpenAPI**: `/api/docs` (khi server chạy)
- **ReDoc**: `/api/redoc`
- **Repository**: [x-neews](https://github.com/x51vn/x-neews)
- **JWT**:  https://jwt.io/
- **FastAPI**: https://fastapi.tiangolo.com/

---

## Ghi chú Bảo mật

✅ **Luôn**:
- Sử dụng HTTPS trong production
- Lưu trữ Access Token / Refresh Token an toàn (sessionStorage, secure cookies)
- Đặt thời hạn hợp lý cho tokens
- Validate dữ liệu từ server phía client

❌ **Không bao giờ**:
- Lưu mật khẩu trong local storage
- Gửi tokens qua URLs
- Hardcode API keys trong mã
- Sử dụng HTTP trong production
- Tin tưởng dữ liệu từ client mà không validate

---

**Phiên bản tài liệu**: 1.0  
**Cập nhật lần cuối**: 2026-02-09  
**Các thay đổi sắp tới**: Hỗ trợ OAuth2, Multi-factor authentication
