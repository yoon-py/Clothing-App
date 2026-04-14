# Clothes Workers Setup

Cloudflare Workers + R2 + Supabase 기반 백엔드 실행 가이드입니다.

## 1. 필수 준비물

- Supabase 프로젝트
- Cloudflare Workers 프로젝트
- Cloudflare R2 버킷 (`clothes-images` 권장)
- (선택) Twilio 계정

## 2. Supabase 설정

1. `workers/supabase/migration.sql` 전체 실행
2. `Authentication > Sign In / Providers > Phone` 활성화
3. 빠른 개발 테스트:
   - `SMS provider = No provider (Testing only)`
   - `Test Phone Numbers and OTPs` 예시: `+18005550123=123456`

Twilio 실운영을 쓸 때만 `Twilio Account SID/Auth Token/Message Service SID`를 입력합니다.

## 3. Cloudflare Workers/R2 설정

### 3-1. `wrangler.toml`

`workers/wrangler.toml`에 R2 바인딩이 있어야 합니다.

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "clothes-images"
preview_bucket_name = "clothes-images-preview"
```

선택: R2 Public Domain/CDN이 있으면 추가

```toml
[vars]
R2_PUBLIC_BASE_URL = "https://cdn.example.com"
```

없으면 Workers가 `/upload/files/*` 경로로 이미지를 직접 서빙합니다.

### 3-2. 시크릿/환경변수

```bash
cd workers
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

로컬 개발 시 `workers/.dev.vars` 사용:

```dotenv
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ENVIRONMENT=development
# 선택
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

## 4. 실행

루트에서:

```bash
pnpm workers
```

기본 포트: `http://localhost:8787`

헬스체크:

```bash
curl http://localhost:8787/health
```

## 5. 모바일 연결

`apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8787
```

실기기 테스트면 `localhost` 대신 PC의 LAN IP를 넣어야 합니다.

## 6. 현재 구현된 API

- `POST /auth/request-otp`
- `POST /auth/verify`
- `GET /items?lat=&lng=&radius=&cursor=&category=`
- `GET /items/:id`
- `POST /items` (인증 필요)
- `GET /users/:id`
- `PATCH /users/me` (인증 필요)
- `POST /upload/image` (인증 필요, multipart/form-data)
- `GET /upload/files/*` (R2 이미지 조회)

## 7. 운영 전 체크

- 노출된 Twilio/Auth/Supabase 키는 즉시 rotate
- CORS `origin='*'`은 운영 도메인으로 제한
- Supabase Service Role Key는 Workers 외부 유출 금지
