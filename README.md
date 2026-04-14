# 옷장 (Clothes)

위치 기반 **중고 의류 직거래** 앱. 당근마켓 방식의 근거리 C2C 거래를 의류 카테고리에 특화하고, 쇼핑몰 수준의 UI/UX를 목표로 합니다.

## ✨ 주요 기능

- 📍 **위치 기반 피드** — 현재 위치 반경 내 매물만 노출 (PostGIS)
- 📱 **SMS OTP 로그인** — 전화번호 인증 기반 온보딩
- 🖼 **이미지 업로드** — Cloudflare R2 Presigned URL
- 🛍 **상품 등록/조회** — 카테고리·커서 페이지네이션
- 💬 **채팅, 좋아요, 내 판매 목록** (진행 중)
- 🗺 **지도 기반 탐색**

## 🏗 기술 스택

**모바일**
- React Native + Expo (Managed Workflow)
- Expo Router v3 (파일 기반 라우팅)
- Zustand + TanStack Query
- expo-secure-store / expo-location / expo-image-picker

**백엔드**
- Cloudflare Workers + Hono.js
- Neon (Serverless Postgres) + PostGIS
- Drizzle ORM
- Cloudflare R2 (이미지 스토리지)
- JWT (jose) 인증

**모노레포**
- pnpm workspaces

## 📂 프로젝트 구조

```
/
├── apps/mobile/              # Expo Router 앱
│   ├── app/
│   │   ├── (tabs)/           # 홈 / 업로드 / 지도 / 채팅 / 마이페이지
│   │   ├── item/[id].tsx     # 상품 상세
│   │   ├── onboarding/       # 전화번호 → OTP → 닉네임 → 위치
│   │   └── chat/ likes/ post/ neighborhood/
│   ├── components/           # ItemCard, ItemGrid, Button
│   ├── lib/                  # api.ts, location.ts
│   ├── stores/               # auth.store.ts, location.store.ts
│   └── types/
└── workers/                  # Cloudflare Workers 백엔드
    ├── src/
    │   ├── routes/           # auth, items, users, upload
    │   ├── middleware/       # JWT auth
    │   ├── db/               # schema.ts + queries/
    │   └── lib/              # neon.ts, r2.ts
    └── drizzle/              # 마이그레이션 SQL
```

## 🔌 API 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/auth/request-otp` | OTP 발송 |
| POST | `/auth/verify` | OTP 검증 + JWT 발급 |
| GET  | `/items` | 위치 기반 피드 (`lat`, `lng`, `radius`, `cursor`, `category`) |
| POST | `/items` | 상품 등록 (auth) |
| GET  | `/items/:id` | 상품 상세 |
| POST | `/upload/presign` | R2 업로드용 Presigned URL (auth) |
| GET  | `/users/:id` | 유저 프로필 |
| PATCH| `/users/me` | 내 프로필 수정 (auth) |
| GET  | `/health` | 헬스체크 |

## 📸 스크린샷

> 앱 실행 후 캡처한 화면을 `docs/screenshots/` 에 추가 예정입니다.

| 홈 피드 | 상품 상세 | 업로드 | 마이페이지 |
| --- | --- | --- | --- |
| _TBD_ | _TBD_ | _TBD_ | _TBD_ |

## 🚀 시작하기

### 사전 요구사항
- Node.js 20+, pnpm 9+
- Expo 계정 / EAS CLI (선택)
- Neon, Cloudflare (Workers + R2) 계정

### 설치
```bash
pnpm install
```

### 환경 변수

`apps/mobile/.env`
```
EXPO_PUBLIC_API_URL=http://localhost:8787
```

Cloudflare Workers 시크릿
```bash
cd workers
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
```

### DB 마이그레이션
```bash
# Neon 프로젝트에서 PostGIS 활성화 후
psql $DATABASE_URL -f workers/drizzle/0000_initial.sql
```

### 로컬 실행
```bash
# 백엔드
pnpm --filter workers dev    # http://localhost:8787

# 모바일
pnpm --filter mobile start   # Expo Dev Client
```

## 📈 진행 상황

- [x] Phase 1 — 프로젝트 세팅
- [x] Phase 2 — 인증 (Supabase Auth + Twilio SMS)
- [x] Phase 3 — 피드 UI
- [ ] Phase 4 — 이미지 업로드 (R2) ⬅ 진행 중
- [ ] Phase 5 — 채팅, 닉네임, 내 판매 목록

## 📝 라이선스

Private / 비공개 프로젝트
