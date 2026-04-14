# HANDOFF.md — 옷장 앱 인수인계 문서

> 최종 업데이트: 2026-02-24
> 목적: 다음 에이전트(Codex / Claude Code)가 이 파일만 읽고 작업을 이어갈 수 있도록
> **변경사항이 생길 때마다 이 파일을 업데이트할 것**

---

## 프로젝트 한 줄 요약

**위치 기반 중고 의류 직거래 앱**.
React Native(Expo) + Cloudflare Workers + Supabase(PostGIS) + Cloudflare R2.

---

## 로컬 실행

```bash
# 터미널 1 — Workers API 서버
pnpm workers         # → http://localhost:8787

# 터미널 2 — 모바일 앱
cd apps/mobile && npm start   # → iOS 시뮬레이터 자동 실행

# 서버 상태 확인
curl http://localhost:8787/health
```

---

## 레포 구조

```
/
├── apps/mobile/
│   ├── app/
│   │   ├── _layout.tsx              # 루트 레이아웃. SafeAreaProvider + QueryClientProvider + AuthGuard
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx          # 탭 레이아웃 (홈 / 판매하기 / 마이)
│   │   │   ├── index.tsx            # 홈 피드. 비로그인 허용. GPS 없으면 서울 기본값 버튼
│   │   │   ├── upload.tsx           # 상품 등록. 비로그인 → 온보딩 유도. 이미지 R2 업로드 연동됨
│   │   │   └── mypage.tsx           # 마이페이지. 비로그인 → 온보딩 유도
│   │   ├── item/[id].tsx            # 상품 상세. 비로그인 허용
│   │   └── onboarding/index.tsx     # 전화번호 → OTP 2단계. 완료 시 자동 계정 생성 + 홈으로
│   ├── components/
│   │   ├── common/Button.tsx
│   │   ├── items/ItemCard.tsx       # 상품 카드 (2열 그리드)
│   │   └── items/ItemGrid.tsx       # FlatList 무한스크롤 래퍼
│   ├── lib/
│   │   ├── api.ts                   # fetch wrapper. mapUser/mapItem 타입 변환 포함
│   │   └── location.ts              # expo-location GPS 헬퍼
│   ├── stores/
│   │   ├── auth.store.ts            # Zustand. token/user/isLoading. updateUser 액션 포함
│   │   └── location.store.ts        # Zustand. lat/lng/locationName/radius
│   ├── types/index.ts               # User(rating: number), Item 인터페이스
│   ├── metro.config.js              # pnpm 모노레포 필수 설정
│   └── .env                         # EXPO_PUBLIC_API_URL=http://localhost:8787
│
├── workers/
│   ├── src/
│   │   ├── index.ts                 # Hono 앱 진입점. CORS + logger
│   │   ├── routes/
│   │   │   ├── auth.ts              # POST /auth/request-otp, /auth/verify
│   │   │   ├── items.ts             # GET /items, POST /items, GET /items/:id
│   │   │   ├── users.ts             # GET /users/:id, PATCH /users/me
│   │   │   └── upload.ts            # POST /upload/image, GET /upload/files/:key
│   │   ├── middleware/auth.ts       # Bearer JWT → supabase.auth.getUser()
│   │   └── lib/
│   │       ├── supabase.ts          # createClient 팩토리
│   │       ├── serializers.ts       # DB row → camelCase response 변환 함수
│   │       └── r2.ts                # (미사용. 삭제 가능)
│   ├── supabase/migration.sql       # 전체 DB 스키마. 한 번만 실행
│   ├── .dev.vars                    # 로컬 시크릿 (git 제외)
│   └── wrangler.toml                # port=8787, R2 바인딩, R2_PUBLIC_BASE_URL 옵션
│
├── package.json          # pnpm workspace 루트
├── pnpm-workspace.yaml
└── HANDOFF.md            # 이 파일
```

---

## 환경변수 / 인프라

### workers/.dev.vars (git 제외, 직접 생성)
```
SUPABASE_URL=https://vbrxromarpkdzbrggvyd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZicnhyb21hcnBrZHpicmdndnlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkxNjg0MiwiZXhwIjoyMDg3NDkyODQyfQ.lk0e1E-GgOeeSlYZvwCHXkUitjrAHkRJUnbfrjdmYEg
ENVIRONMENT=development
# R2_PUBLIC_BASE_URL=  ← R2 public 도메인 설정 시 추가
```

### apps/mobile/.env (git 제외, 직접 생성)
```
EXPO_PUBLIC_API_URL=http://localhost:8787
# 실기기 테스트 시: http://172.30.1.32:8787 (Mac 로컬 IP)
```

### Supabase
- Project URL: `https://vbrxromarpkdzbrggvyd.supabase.co`
- DB 비밀번호: `supabase7536464k`
- Phone Auth: Twilio 연동 설정됨 (대시보드 Authentication → Providers → Phone)
- migration.sql: 실행 완료

### Cloudflare
- Workers: 로컬만 확인. 프로덕션 배포 안 됨
- R2 버킷: `clothes-images` (프로덕션), `clothes-images-preview` (로컬 시뮬)

---

## DB 스키마

`workers/supabase/migration.sql` 실행 완료.

```sql
-- Supabase 내장
auth.users (id, phone, ...)

-- 커스텀
public.profiles (
  id UUID PK → auth.users,
  nickname TEXT,
  avatar_url TEXT,
  location_name TEXT,
  location GEOMETRY(Point, 4326),  -- PostGIS
  rating NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ
)

public.items (
  id UUID PK,
  seller_id UUID → auth.users,
  title TEXT,
  description TEXT,
  category TEXT,    -- 상의|하의|아우터|신발|가방|기타
  size TEXT,        -- XS|S|M|L|XL|XXL|FREE
  brand TEXT,
  price INTEGER,
  condition TEXT,   -- 새상품|거의새것|상|중|하
  status TEXT DEFAULT 'selling',  -- selling|reserved|sold
  images TEXT[],
  location_name TEXT,
  location GEOMETRY(Point, 4326),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
)
```

### Supabase RPC 함수
```sql
-- 위치 기반 피드 (PostGIS ST_DWithin)
get_nearby_items(lat, lng, radius_meters, cursor_offset, category_filter)

-- 조회수 증가
increment_item_views(item_id)
```

### Trigger
- `on_auth_user_created`: 신규 가입 시 `profiles` 자동 생성 (nickname = `user_타임스탬프`)

### RLS
- profiles: SELECT 전체 / UPDATE 본인
- items: SELECT 전체 / INSERT·UPDATE 본인

---

## API 엔드포인트

```
GET  /health

POST /auth/request-otp  { phone }           → Supabase SMS OTP
POST /auth/verify       { phone, code }     → JWT + profile 반환

GET  /items?lat&lng&radius&cursor&category  → 위치기반 피드 (RPC)
POST /items             (auth)              → 상품 등록
GET  /items/:id                             → 상품 상세 + 조회수++

POST /upload/image      (auth, multipart)   → R2에 이미지 저장 → { key, url, size, contentType }
GET  /upload/files/:key                     → R2에서 이미지 서빙 (R2_PUBLIC_BASE_URL 없을 때)

GET  /users/:id                             → 프로필 (phone 제외)
PATCH /users/me         (auth)              → 닉네임/위치 수정
```

---

## 데이터 흐름: 이미지 업로드

```
앱 → 이미지 선택 (expo-image-picker)
   → 압축 (expo-image-manipulator, max 1200px, 80%)
   → POST /upload/image (multipart FormData)
   → Workers: R2_BUCKET.put(key, arrayBuffer)
   → 응답: { url: "http://localhost:8787/upload/files/items/userId/uuid.jpg" }
   → POST /items { images: [url, ...] }
```

R2_PUBLIC_BASE_URL 설정 시 URL이 CDN 도메인으로 변경됨.

---

## 인증 흐름

```
1. POST /auth/request-otp { phone }
   → normalizePhone: "01012345678" → "+821012345678"
   → supabase.auth.signInWithOtp({ phone })
   → Twilio SMS 발송

2. POST /auth/verify { phone, code }
   → supabase.auth.verifyOtp({ phone, token, type: 'sms' })
   → profiles 조회 (트리거로 자동 생성됨)
   → 응답: { token (JWT), user (camelCase), isNewUser }

3. 앱: SecureStore에 token + user 저장
4. AuthGuard: token 있으면 /(tabs), 없으면 /onboarding
```

---

## 타입 변환 규칙 (중요)

DB/API 응답은 snake_case → 앱은 camelCase.
변환은 두 곳에서 처리:

| 위치 | 파일 | 역할 |
|------|------|------|
| Workers | `src/lib/serializers.ts` | DB row → camelCase JSON 응답 |
| 앱 | `lib/api.ts` (mapUser, mapItem) | API 응답 → TypeScript 타입 |

`User.rating`은 `number` 타입 (DB는 NUMERIC → string으로 올 수 있어서 변환 필요).

---

## 완료된 것 ✅

- [x] pnpm 모노레포 (apps/mobile + workers)
- [x] Expo Router v6, SDK 54, iOS 시뮬레이터 실행
- [x] Cloudflare Workers + Hono API
- [x] Supabase Auth (Phone OTP) + Twilio SMS
- [x] Supabase DB 마이그레이션 (PostGIS, RPC, RLS, trigger)
- [x] JWT 인증 미들웨어
- [x] 위치 기반 피드 API + UI (2열 그리드, 카테고리 필터, 무한스크롤)
- [x] 온보딩 (전화번호 → OTP → 자동 계정 생성)
- [x] 비로그인: 홈 피드, 상품 상세 허용
- [x] 로그인 필요: 판매하기, 마이페이지 → 온보딩 유도
- [x] **이미지 업로드: R2 직접 저장 완성** (`POST /upload/image`)
- [x] **이미지 서빙: `GET /upload/files/:key`** (R2_PUBLIC_BASE_URL 없을 때)
- [x] Workers 타입 안전 직렬화 레이어 (`serializers.ts`)
- [x] 앱 타입 변환 (`mapUser`, `mapItem` in api.ts)
- [x] `auth.store.ts`에 `updateUser` 액션 추가
- [x] 마이페이지 위치 업데이트 → profile 서버 반영

---

## 미완성 / 다음 할 일 ❌

### 🔴 우선순위 1: 채팅

직거래 앱인데 연락 수단이 없음. `item/[id].tsx`의 "채팅하기" 버튼이 빈 함수.

**권장 구현: Supabase Realtime**
```sql
-- 추가할 테이블
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id),
  buyer_id UUID REFERENCES auth.users(id),
  seller_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, buyer_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

앱에서 `supabase.channel('room:id').on('postgres_changes', ...)` 구독.
Workers를 거치지 않고 앱 → Supabase 직접 연결 권장 (Realtime은 Workers 불가).

### 🔴 우선순위 2: 닉네임 설정

가입 시 `user_1234567890` 자동 생성. 변경 UI 없음.

- `PATCH /users/me { nickname }` API는 있음
- `isNewUser === true`일 때 닉네임 입력 화면 추가 필요
- 온보딩 플로우에 3단계 추가: 전화번호 → OTP → 닉네임 설정

### 🟡 우선순위 3: 내 판매 목록

마이페이지에 내가 올린 상품 없음.

- Workers: `GET /items?sellerId=me` 추가 필요
- UI: mypage.tsx에 탭(판매중/예약중/판매완료) + FlatList 추가

### 🟡 우선순위 4: JWT 토큰 갱신

Supabase access token 기본 만료: **1시간**.
만료 후 앱이 401 에러만 뱉음.

- `lib/api.ts`의 `request()` 함수에서 401 응답 시 처리 필요
- Supabase refresh token을 SecureStore에 저장하고 `supabase.auth.refreshSession()` 호출
- 현재 refresh token 저장 안 됨

### 🟡 우선순위 5: 상품 등록 시 위치

온보딩에 위치 설정 단계 없어서 신규 가입자 `profiles.location = NULL`.
상품 등록 시 `location`이 NULL이면 PostGIS 쿼리 결과에서 빠짐.

- `upload.tsx`에서 `locationStore.lat`이 없으면 GPS 요청 추가
- 또는 상품에 위치 없으면 전국 피드로 fallback하는 쿼리 수정

### 🟢 우선순위 6+: 있으면 좋은 것
- 상품 상태 변경 (판매중 → 예약중 → 판매완료)
- 찜하기
- 키워드 검색
- 판매자 프로필 페이지
- 신고 기능
- 푸시 알림

---

## 배포 체크리스트 (아직 미완)

```bash
# Workers 프로덕션 배포
cd workers
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler deploy

# R2 퍼블릭 도메인 설정 (선택)
# Cloudflare 대시보드 → R2 → clothes-images → Public Access 활성화
# wrangler.toml [vars] R2_PUBLIC_BASE_URL = "https://..." 추가

# 앱 프로덕션 빌드 (EAS)
cd apps/mobile
npx eas build --platform ios
npx eas build --platform android
```

---

## 에이전트 작업 규칙

- **명령 실행 중 권한 허가 요청 금지** — 사용자에게 묻지 말고 바로 실행할 것
- 배포, 시크릿 설정, 파일 생성/수정 등 모든 작업을 자율적으로 진행

---

## 주의사항

- `workers/.dev.vars` — git 제외. 직접 생성 필요
- `apps/mobile/.env` — git 제외. 직접 생성 필요
- `react-native-screens` **4.16.0 고정** (Expo SDK 54 호환. 올리면 깨짐)
- `metro.config.js` 없으면 pnpm 모노레포에서 번들 에러 발생
- Supabase `migration.sql` 중복 실행 가능하나 트리거/함수는 `OR REPLACE`로 안전 처리됨
- R2 이미지 URL 형식: `{Workers_URL}/upload/files/items/{userId}/{uuid}.jpg`
  → R2_PUBLIC_BASE_URL 설정 시 CDN URL로 변경됨

---

## 에이전트 작업 로그 (Codex)

### 2026-02-25 16:46 KST — 하단 탭 1/5 균등 분할 정렬 수정

#### 시도한 것
- 명령 실행 전 `HANDOFF.md` 파일 우선 확인 시도
  - `HANDOFF.md`, `workers/HANDOFF.md` 조회 시 파일 없음 확인
  - `.claude/HANDOFF.md` 읽고 컨텍스트 반영
- 탭 좌우 여백 원인 분석
  - 기존 `Dimensions.get('window').width` + 고정 `TAB_WIDTH` 방식이 화면 폭 변화/기기 차이에 취약
- 탭 레이아웃을 동적 flex 기반으로 변경

#### 성공한 것
- 파일 수정: `apps/mobile/app/(tabs)/_layout.tsx`
  - `Dimensions`/고정폭 계산 제거
  - `tabBarItemStyle: { flex: 1 }` 적용
  - 숨김 라우트 `upload`는 `tabBarButton` 해킹 대신 `href: null` 처리
- 결과: 가용 폭 기준으로 탭 아이템이 균등 분배되며, 5개 탭이 1/5 비율로 채워지도록 구조 개선

#### 실패/이슈
- 타입체크 실행 시 기존 코드에서 unrelated 오류 1건 확인
  - `app/(tabs)/chat.tsx(106,44)` 경로 타입 불일치
  - 이번 탭 레이아웃 변경과 직접 관련 없음

#### 다음 단계
1. 실제 기기/시뮬레이터에서 하단 탭 폭이 1/5로 렌더링되는지 확인
2. `chat.tsx`의 라우터 경로 타입 오류 정리 후 `pnpm --filter mobile exec tsc --noEmit` 재실행
3. 앞으로 모든 작업 시작 전 `.claude/HANDOFF.md`를 먼저 읽고, 작업 종료 시 이 로그 섹션에 인수인계 항목 추가

### 2026-02-25 17:06 KST — 홈 화면 쇼핑몰형 리디자인(A/BLY 참고형, MVP)

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트 포인터), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 기존 홈 구조 분석
  - `app/(tabs)/index.tsx`가 `ItemRow` 기반 리스트형임을 확인
  - 기존 `likesApi`/`likes` 라우트 재사용 가능 여부 확인
- 계획대로 홈 전면 리팩터링 진행

#### 성공한 것
- 신규 컴포넌트 추가: `apps/mobile/components/items/ShopProductCard.tsx`
  - 2열 카드 폭 기준 `4:5` 이미지 비율
  - 이미지 우상단 좋아요(하트) 오버레이 버튼
  - 카드 정보: 브랜드(없으면 `노브랜드`) → 제목 → 가격
- 홈 화면 교체: `apps/mobile/app/(tabs)/index.tsx`
  - `ItemRow` 리스트 제거, `FlatList` 2열 쇼핑 카드 그리드 적용
  - 상단 구성: 위치 헤더 → 카테고리 칩 탭 → `최신 등록 상품` 타이틀
  - 카테고리 탭 연동: `queryKey`에 카테고리 포함, `/items` 재조회
  - 위치 미설정 시 차단 화면 대신 `서울 전체` 기본 위치 자동 fallback
  - 좋아요 실동작: `likesApi.getMyLikedIds` + `likesApi.toggle` 연동
    - optimistic 업데이트
    - 비로그인 시 `/onboarding` 이동
    - 실패 시 rollback + Alert
  - 홈 FAB(상품등록) 유지

#### 실패/이슈
- `pnpm --filter mobile exec tsc --noEmit` 전체 타입체크는 기존 오류 1건으로 실패
  - `app/(tabs)/chat.tsx(106,44)` 라우터 경로 타입 불일치
  - 이번 홈 리디자인 작업과 직접 관련 없는 기존 이슈

#### 다음 단계
1. 시뮬레이터에서 홈 카드 이미지가 `4:5`로 노출되고 하트 오버레이가 정상 동작하는지 확인
2. 로그인/비로그인 각각에서 좋아요 토글 플로우 점검
3. 기존 `chat.tsx` 경로 타입 오류 수정 후 모바일 타입체크 재실행
4. 홈 UI 미세조정(칩 간격/폰트/가격 강조 톤) 필요 시 디자인 튜닝

### 2026-02-25 17:10 KST — 채팅 라우팅 타입 오류 수정

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 에러 지점 분석
  - `app/(tabs)/chat.tsx`의 `router.push(\`/chat/${room.id}\`)`가 타입 라우트에 없는 경로 호출임을 확인
  - 앱 라우트 트리에서 `app/chat/[id].tsx` 파일이 없어 타입 생성 대상에서 누락된 상태 확인

#### 성공한 것
- `apps/mobile/app/(tabs)/chat.tsx`
  - `ChatRoom` 타입 정의 추가
  - 채팅방 이동 코드를 typed route object 방식으로 변경
    - `router.push({ pathname: '/chat/[id]', params: { id: room.id } })`
- `apps/mobile/app/chat/[id].tsx` 신규 추가
  - 채팅방 상세 플레이스홀더 화면 구성
- `apps/mobile/app/_layout.tsx`
  - `Stack.Screen name="chat/[id]"` 추가 (헤더 제목: 채팅)
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 없음 (기존 chat 타입 오류 해소)

#### 다음 단계
1. 채팅 상세 플레이스홀더를 실제 메시지 목록/전송 UI로 확장
2. `/chat/rooms/:id` 조회 API 및 메시지 전송 API 연동
3. 필요 시 Supabase Realtime 구독으로 실시간 수신 추가

### 2026-02-25 17:17 KST — Invalid token UX 개선(자동 로그아웃)

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 인증 에러 경로 분석
  - Workers `authMiddleware`가 토큰 실패 시 `401 { error: 'Invalid token' }` 반환 확인
  - 앱 `lib/api.ts`는 401을 일반 에러로만 처리하고 세션 정리가 없는 상태 확인

#### 성공한 것
- `apps/mobile/lib/api.ts`
  - `401 + Invalid token/Unauthorized` 응답 시 `useAuthStore.getState().clearAuth()` 실행
  - 사용자 에러 메시지를 `세션이 만료됐어요. 다시 로그인해주세요.`로 통일
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 근본적으로는 refresh token 기반 자동 재발급이 아직 없음
  - 현재는 만료 시 “자동 로그아웃 → 재로그인” 방식

#### 다음 단계
1. Supabase refresh token 저장/재발급 플로우를 붙여 무중단 세션 유지 구현
2. 주요 작성 화면에서 세션 만료 시 온보딩으로 즉시 유도 UX 추가

### 2026-02-25 17:28 KST — 내 동네 인증 복구 + 2개 동네 + 지도 내 위치 버튼 + 관심목록 동작화

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 사용자 불만 지점 직접 반영
  - 홈의 서울시청 자동 fallback 제거
  - 동네 인증 UI/진입 경로 복구
  - 지도 화면에 명시적인 내 위치 찾기 버튼 추가
  - 마이페이지 관심 목록 메뉴를 실제 목록 화면으로 연결

#### 성공한 것
- `apps/mobile/stores/location.store.ts`
  - 위치 상태를 SecureStore에 영구 저장
  - 동네 최대 2개 관리 (`neighborhoods`, `activeNeighborhoodId`) 추가
  - 동네 추가/전환/삭제 액션 추가
- `apps/mobile/app/_layout.tsx`
  - 앱 시작 시 `loadLocation()` 호출로 위치 상태 복원
  - 신규 라우트 등록: `likes/index`, `neighborhood/index`
- `apps/mobile/app/neighborhood/index.tsx` 신규
  - 현재 위치 기반 내 동네 인증 화면 추가
  - 최대 2개 동네 등록/전환/삭제 UI 제공
- `apps/mobile/app/(tabs)/index.tsx`
  - 홈의 자동 `서울 전체` fallback 제거
  - `내 동네 인증하기` 진입 텍스트/배너 복구
- `apps/mobile/app/(tabs)/map.tsx`
  - `내 위치 찾기` 버튼(빈 상태 + 플로팅 버튼) 추가
  - 버튼 클릭 시 현재 위치로 지도 이동 및 동네 갱신
- `apps/mobile/app/(tabs)/mypage.tsx`
  - `관심 목록` 메뉴를 `/likes`로 연결
  - `내 동네 인증/관리` 메뉴를 `/neighborhood`로 연결
  - 등록된 동네 수(0~2) 표시
- `apps/mobile/app/likes/index.tsx` 신규
  - 찜 목록 조회/렌더링 화면 추가
  - 아이템 클릭 시 상세 이동
  - 하트 클릭 시 관심 해제 동작
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 백엔드 DB는 여전히 `profiles.location` 단일 필드 구조
  - 2개 동네는 현재 앱 로컬 저장소 기준으로 관리됨
  - 활성 동네만 서버 프로필 위치로 동기화

#### 다음 단계
1. 2개 동네를 서버(Supabase)에도 영구 저장하려면 `profile_locations` 테이블 추가 마이그레이션 진행
2. 관심 목록 성능 개선을 위해 `GET /likes/me/items` API 추가(현재는 id 후 상세 N회 호출)
3. 지도에서 상품 마커를 실제 좌표로 노출하려면 `/items` 응답에 좌표 필드 포함 확장

### 2026-02-25 17:35 KST — 찜 백엔드 스키마/에러처리 보강 + 동네 인증 만료 UX 보완

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 사용자 불만의 실제 원인 재점검
  - `likes` 라우트/마이그레이션/앱 화면을 함께 대조
  - 워커 타입체크와 모바일 타입체크 동시 검증

#### 성공한 것
- `workers/supabase/migration.sql`
  - `public.likes` 테이블/인덱스/RLS 정책 추가
- `workers/supabase/migration_likes.sql` 신규
  - 기존 프로젝트에 즉시 적용 가능한 likes 증분 SQL 패치 추가
- `workers/src/routes/likes.ts`
  - 찜 토글/상태 조회에서 DB 에러 무시하던 부분 수정
  - insert/delete/select 실패 시 올바른 에러 응답 반환
- `workers/src/routes/items.ts`
  - seller null 가능성으로 인한 타입 오류 수정
- `apps/mobile/app/neighborhood/index.tsx`
  - 동네 저장 자체는 성공했는데 토큰 만료로 서버 동기화 실패하는 케이스 분리 처리
  - 세션 만료 시 재로그인 유도 메시지로 변경
- `apps/mobile/app/(tabs)/map.tsx`
  - 상단 동네명 터치 시 `/neighborhood` 이동 연결
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과
  - `pnpm --filter workers exec tsc --noEmit` 통과

#### 실패/이슈
- `public.likes`는 DB에 아직 적용 전일 수 있음
  - 기존 Supabase 프로젝트에는 `workers/supabase/migration_likes.sql`을 SQL Editor에서 1회 실행해야 실제 동작
- 2개 동네는 여전히 앱 로컬 중심 저장이며, 서버는 활성 동네 1개만 `profiles.location`에 동기화

#### 다음 단계
1. Supabase SQL Editor에서 `workers/supabase/migration_likes.sql` 실행
2. 앱 재로그인 후 홈 하트 토글 → 마이 `관심 목록` 반영 확인
3. 필요하면 서버에 `profile_locations` 테이블을 추가해 동네 2개를 계정 단위 영구 저장으로 확장

### 2026-02-25 17:47 KST — 리로드 시 게시글/인증/동네 초기화 체감 이슈 원인 분석 및 안정화

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 증상 분해 점검
  - 앱 저장소(`SecureStore`) 복원 로직, 홈 피드 조회 조건(lat/lng 필수), 업로드 시 위치 전송 여부, 인증 만료 처리 흐름을 교차 확인
  - 환경값 확인: `apps/mobile/.env`가 `https://clothes.yoonpub0.workers.dev`를 바라보도록 설정된 상태 확인

#### 성공한 것
- 인증 세션 안정화
  - `workers/src/routes/auth.ts`
    - `POST /auth/refresh` 추가 (refresh token으로 access token 재발급)
    - `/auth/verify` 응답에 `refreshToken` 포함
  - `apps/mobile/stores/auth.store.ts`
    - `refreshToken` 영속 저장/복원 추가
    - `setTokens` 액션 추가
  - `apps/mobile/lib/api.ts`
    - 401(`Invalid token/Unauthorized`) 발생 시 자동 refresh 1회 시도 후 원요청 재시도
    - 실패 시에만 clearAuth
- 리로드 직후 "다시 인증해야 하는 것처럼 보이는" 문제 완화
  - `apps/mobile/stores/location.store.ts`: `isHydrating` 추가
  - `apps/mobile/app/(tabs)/index.tsx`, `map.tsx`, `mypage.tsx`, `chat.tsx`, `likes/index.tsx`, `upload.tsx`
    - 저장소 복원 중에는 로딩/대기 UI를 보여 초기 미복원 상태를 인증 만료로 오인하지 않도록 변경
- 게시글 "사라짐" 대응
  - `workers/src/routes/items.ts`
    - lat/lng 미전달 시에도 최신순 글로벌 피드 fallback 조회 추가(400 에러 대신 데이터 반환)
  - `apps/mobile/lib/api.ts`
    - `itemsApi.getFeed`에서 lat/lng optional 지원
  - `apps/mobile/app/(tabs)/index.tsx`
    - 위치 미복원/미설정이어도 피드 조회 가능하도록 연동
  - `apps/mobile/app/(tabs)/upload.tsx`
    - 업로드 전 동네 인증(lat/lng) 미설정 시 경고 + 제출 차단
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과
  - `pnpm --filter workers exec tsc --noEmit` 통과

#### 실패/이슈
- 현재 CLI 환경에서는 외부 DNS가 차단되어 `workers.dev` 직접 헬스체크는 미검증
- `apps/mobile/.env`가 원격 `workers.dev`를 가리키므로, 로컬 코드 수정과 실제 앱 동작이 어긋날 수 있음

#### 다음 단계
1. 개발 중에는 `apps/mobile/.env`를 `EXPO_PUBLIC_API_URL=http://localhost:8787`로 맞추고 로컬 workers와 함께 테스트
2. 배포 workers를 쓸 경우, 동일 코드(특히 `/auth/refresh`, `/items` fallback)가 배포된 상태인지 확인
3. 앱에서 "동네 인증 → 게시글 등록 → 앱 리로드" 순서로 재현 테스트해, 피드/세션 유지 여부 재확인

### 2026-02-25 17:52 KST — 상품등록 화면 입력값 잔존 이슈 수정

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 증상 분석
  - `apps/mobile/app/(tabs)/upload.tsx`에서 등록 성공 후 폼 상태 초기화 로직이 없음을 확인

#### 성공한 것
- `apps/mobile/app/(tabs)/upload.tsx`
  - `resetForm()` 추가
  - `onSuccess`에서 `resetForm()` 호출하도록 수정
  - 결과: 상품 등록 성공 후 다시 진입 시 이전 입력값(사진/제목/카테고리/가격 등)이 남지 않음
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 없음

#### 다음 단계
1. 앱에서 "상품 등록 완료 → 홈 이동 → 다시 상품등록 진입" 시 폼 초기화 확인
2. 필요 시 "임시저장" 기능 도입 시점에만 상태 유지하도록 분기 설계

### 2026-02-25 18:02 KST — 내 게시글 수정 기능 추가

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 현재 구조 분석
  - 상품 상세(`item/[id].tsx`)에서 소유자 분기가 없고, workers `items` 라우트에 수정 API(`PATCH /items/:id`)가 없는 상태 확인

#### 성공한 것
- 백엔드 수정 API 추가
  - `workers/src/routes/items.ts`
    - `PATCH /items/:id` 구현
    - 본인 글(`seller_id === auth user`)만 수정 가능하도록 권한 체크(403)
    - 입력값 검증(title/category/condition/price/status/images/좌표 등)
- 프론트 API 연결
  - `apps/mobile/lib/api.ts`
    - `itemsApi.update(id, data)` 추가
- 수정 화면 추가
  - `apps/mobile/app/item/edit/[id].tsx` 신규
    - 기존 상품 정보 prefill
    - 카테고리/상태/사이즈/브랜드/가격/설명 수정 가능
    - 저장 시 `PATCH /items/:id` 호출 후 상세 화면 복귀
- 상세 화면에서 수정 진입 연결
  - `apps/mobile/app/item/[id].tsx`
    - 로그인 유저가 작성자인 경우 하단 버튼을 `게시글 수정`으로 노출
    - `/item/edit/[id]` 라우트로 이동
- 라우트 등록
  - `apps/mobile/app/_layout.tsx`
    - `item/edit/[id]` 스택 스크린 추가
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과
  - `pnpm --filter workers exec tsc --noEmit` 통과

#### 실패/이슈
- 수정 화면에서는 이미지 교체/추가/삭제를 아직 지원하지 않고, 기존 이미지 목록 유지 형태로 동작

#### 다음 단계
1. 수정 화면에 이미지 편집(추가/삭제/재업로드) 기능 확장
2. 마이페이지 `판매 내역`에서 본인 게시글 리스트 + 수정 진입 링크 추가
3. 필요 시 게시글 상태(`selling/reserved/sold`) 변경 UI 추가

### 2026-02-25 18:22 KST — 좋아요 실패 원인 메시지 노출/진단 강화

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 증상 분석
  - 홈 하트 토글 실패 시 `catch`에서 원인 메시지를 버리고 고정 문구만 노출하는 코드 확인
  - likes 관련 서버 에러(테이블 미생성/미배포/권한) 구분 로직 부재 확인

#### 성공한 것
- `apps/mobile/lib/api.ts`
  - API 실패 메시지 파싱 강화(JSON/텍스트 모두 처리)
  - likes 경로 전용 친화 메시지 매핑 추가
    - `likes 테이블 없음(42P01)` → migration 실행 안내
    - `404 /likes` → workers 최신 코드 배포 안내
    - `permission denied` → RLS/권한 점검 안내
- `apps/mobile/app/(tabs)/index.tsx`
  - 좋아요 실패 시 실제 에러 메시지를 Alert로 노출하도록 변경
- `apps/mobile/app/likes/index.tsx`
  - 관심 해제 실패 시 실제 에러 메시지 노출하도록 변경
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 근본 에러가 서버 미배포/DB 미마이그레이션이면 메시지는 개선됐지만 운영 환경에서 추가 조치 필요

#### 다음 단계
1. 앱에서 하트 다시 눌러 실제 상세 원인 메시지 확인
2. 메시지가 migration/배포 안내라면 해당 조치 즉시 수행
3. 필요 시 workers 측 health/debug endpoint에 likes 준비 상태 체크 추가

### 2026-02-25 18:53 KST — 하단 탭 구성 변경 (홈/찜/커뮤니티/채팅/마이)

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 탭 라우팅 구조 점검
  - 기존 하단 탭이 `홈/코디/지도/채팅/마이`이고, `찜` 화면은 탭 바깥(`app/likes/index.tsx`)에 있음을 확인

#### 성공한 것
- `apps/mobile/app/likes/index.tsx` -> `apps/mobile/app/(tabs)/likes.tsx`로 이동
  - 찜 화면을 탭 그룹으로 편입
- `apps/mobile/app/(tabs)/_layout.tsx`
  - 탭 순서를 `홈(index) -> 찜(likes) -> 커뮤니티(content) -> 채팅(chat) -> 마이(mypage)`로 변경
  - `content` 라벨을 `커뮤니티`로 변경
  - `map` 탭은 `href: null`로 숨김 처리
- `apps/mobile/app/_layout.tsx`
  - 더 이상 존재하지 않는 `likes/index` 스택 등록 제거
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 없음

#### 다음 단계
1. 앱에서 하단 탭 순서/라벨이 요청대로 반영됐는지 확인
2. 필요 시 탭 아이콘(emoji) 디자인을 실제 아이콘 세트로 교체
3. 지도 기능을 별도 진입점(홈 버튼/커뮤니티 내 버튼)으로 유지할지 결정

### 2026-02-25 19:01 KST — 하단 탭 아이콘 스타일 교체 (홈/찜/마이페이지 요청 반영)

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 요청 반영 방식 검토
  - 사용자 제공 샘플과 유사한 라인 스타일 아이콘 적용 시도
  - `@expo/vector-icons` 패키지 설치는 네트워크/DNS 제한으로 실패

#### 성공한 것
- `apps/mobile/app/(tabs)/_layout.tsx`
  - 하단 탭 아이콘을 이모지에서 라인 아이콘 스타일로 교체
    - 홈: `home-outline`
    - 찜: `heart-outline`
    - 마이페이지: `person-outline`
  - 전체 탭 아이콘 톤을 회색 계열로 통일
- 환경 제약 대응
  - 네트워크 설치 없이, 로컬 pnpm store에 이미 존재하는 Expo vector-icons 모듈 경로를 직접 import하여 적용
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 외부 네트워크 차단으로 신규 npm 패키지 설치 불가
- 제공된 이미지 원본 파일 경로가 없어 실제 크롭 아이콘 파일 생성은 불가

#### 다음 단계
1. 가능하면 제공한 원본 아이콘 파일(PNG/SVG) 경로를 받으면 정확 크롭 자산으로 교체
2. 네트워크가 열리면 `@expo/vector-icons`를 모바일 의존성에 정식 추가하고 import 경로 정상화
3. 선택 상태 색상/크기(현재 회색) 미세조정

### 2026-02-25 19:03 KST — 하단 탭 가독성/간격 재조정 + 선택 아이콘 컬러 반영

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 사용자 피드백 반영
  - `커뮤니티` 라벨 잘림 문제
  - 하단 탭 전체 높이/여백 부족 문제
  - 선택 상태 아이콘 컬러 요구(찜=빨강, 커뮤니티=노랑)

#### 성공한 것
- `apps/mobile/app/(tabs)/_layout.tsx`
  - 탭 바 스타일을 레퍼런스에 가깝게 조정
    - 배경: 다크 톤(`TAB_BG`)
    - 높이: `82`, 상하 패딩 확대
  - 라벨 잘림 방지
    - `label` 폭 100% + 중앙 정렬
    - `adjustsFontSizeToFit`, `minimumFontScale`, `allowFontScaling={false}` 적용
  - 아이콘 선택 상태 반영
    - 홈/채팅/마이페이지: outline -> filled
    - 찜: `heart-outline` -> `heart` + 빨강(`#ff4d5d`)
    - 커뮤니티: `sparkles-outline` -> `sparkles` + 노랑(`#f6c744`)
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 없음

#### 다음 단계
1. 실제 기기에서 `마이페이지`/`커뮤니티` 텍스트가 완전히 보이는지 최종 확인
2. 필요 시 탭 바 높이(현재 82)와 폰트(현재 11) 미세 조정

### 2026-02-25 19:08 KST — 탭 배경 화이트 복원 + 좋아요 로컬 영속화 + 찜 탭 로컬 fallback

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 사용자 요청 반영
  - 하단 탭 배경을 검정 -> 흰색으로 복원
  - 좋아요가 리로드 후 초기화되는 문제 해결
  - 서버 좋아요 조회 실패 시에도 찜 탭에서 보이도록 fallback 설계

#### 성공한 것
- 탭 스타일 조정
  - `apps/mobile/app/(tabs)/_layout.tsx`
    - 배경: `#ffffff`
    - 상단 경계선 복원
    - 찜(빨강)/커뮤니티(노랑) 활성 아이콘 컬러는 유지
- 좋아요 로컬 저장 유틸 추가
  - `apps/mobile/lib/local-likes.ts` 신규
    - 유저별 SecureStore 키로 liked item ids 저장/조회/토글
- 홈 좋아요 로직 강화
  - `apps/mobile/app/(tabs)/index.tsx`
    - 서버 liked ids + 로컬 liked ids 병합 렌더
    - 하트 클릭 시 로컬 즉시 반영/저장
    - 서버 성공 시 동기화, 실패 시에도 로컬 유지
- 찜 탭 로직 강화
  - `apps/mobile/app/(tabs)/likes.tsx`
    - 서버 성공 시 서버 목록 우선 + 로컬 동기화
    - 서버 실패/지연 시 로컬 liked ids로 목록 표시(fallback)
    - 관심 해제도 로컬 즉시 반영
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 로컬/서버 동기화가 실패한 상태에선 기기 간 찜 목록 일치가 보장되지 않음(현재는 로컬 우선 유지 전략)

#### 다음 단계
1. 서버 likes 마이그레이션/배포 완료 후 로컬-서버 불일치 자동 정합 로직 보강
2. 찜 탭에서 로컬 저장 항목에 "오프라인/미동기화" 배지 표시 여부 검토

### 2026-02-25 19:09 KST — 하단 탭 라벨 폰트 크기 통일(자동 축소 제거)

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 원인 점검
  - 탭 라벨에 `adjustsFontSizeToFit`/`minimumFontScale`가 걸려 긴 라벨만 작아지는 구조 확인

#### 성공한 것
- `apps/mobile/app/(tabs)/_layout.tsx`
  - 라벨의 자동 축소 옵션 제거
    - `adjustsFontSizeToFit` 제거
    - `minimumFontScale` 제거
  - 결과: 홈/찜/커뮤니티/채팅/마이페이지 라벨이 동일 폰트 크기로 고정
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 없음

#### 다음 단계
1. 실제 디바이스에서 라벨 잘림 없는지 최종 확인
2. 필요 시 폰트 크기 자체(현재 11)를 일괄 상/하향 조정

### 2026-02-25 19:13 KST — 하단 탭 라벨 잘림 해소(커뮤니티/마이페이지) + 위치 보정

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 문제 분석
  - 기존 구현이 `tabBarIcon` 내부 커스텀 텍스트 방식이라 라벨 폭이 좁게 잡혀 `커뮤...`, `마이...` 형태로 잘릴 수 있는 구조 확인

#### 성공한 것
- `apps/mobile/app/(tabs)/_layout.tsx` 전면 재구성
  - 탭 라벨을 커스텀 Text에서 React Navigation 기본 라벨(`tabBarLabel`)로 전환
  - 라벨 폰트 사이즈/굵기를 모든 탭에 동일 적용
  - 탭바 내부 좌우 패딩 조정으로 라벨 가시 영역 확보
  - `mypage` 탭에 `marginLeft: -4` 보정 적용(오른쪽 가장자리 붙음 완화)
  - 아이콘 크기/정렬도 동일 규칙으로 재정렬
  - 선택 색상 유지
    - 찜: 빨강 채움
    - 커뮤니티: 노랑 채움
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 없음

#### 다음 단계
1. 실제 디바이스에서 `커뮤니티`, `마이페이지` 라벨 완전 노출 확인
2. 필요 시 `mypage`의 좌측 보정값(-4)을 -3~-6 범위에서 미세조정

### 2026-02-25 19:19 KST — 좋아요 → 찜 탭 실시간 반영 보강

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 원인 분석
  - 홈/찜이 같은 좋아요 상태를 즉시 공유하지 못하고
  - 서버 liked ids 성공 응답이 로컬 liked ids를 덮어쓰는 구조(불일치 시 누락 가능) 확인

#### 성공한 것
- `apps/mobile/app/(tabs)/index.tsx`
  - 하트 토글 시 `['likes','me',token]` query cache를 즉시 갱신하도록 추가
  - 서버/로컬 liked ids 동기화 시 replace가 아닌 union(merge)로 변경
- `apps/mobile/app/(tabs)/likes.tsx`
  - 찜 목록의 유효 liked ids를 `server ∪ local`로 계산
  - 관심 해제 시에도 query cache 즉시 갱신해 화면 반응성 개선
  - 서버 성공 시 로컬을 merge 방식으로 동기화
- 결과
  - 홈에서 좋아요 누른 항목이 찜 탭에서 즉시 보이는 흐름으로 개선
  - 서버 지연/불일치 상황에서도 로컬 찜 목록이 사라지지 않도록 보강
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- 서버 likes 저장 자체가 완전히 실패하는 환경(미배포/미마이그레이션)에서는 기기 로컬 중심 표시로 동작

#### 다음 단계
1. 홈에서 하트 누른 뒤 즉시 찜 탭 이동해 실시간 반영 확인
2. 서버 likes 정상화 후(마이그레이션/배포) 다기기 간 일관성 점검

### 2026-02-25 19:38 KST — 리로드 후 재인증 반복 완화(세션 자동 복구)

#### 시도한 것
- 명령 실행 전 인수인계 문서 확인
  - `HANDOFF.md`(루트), `.claude/HANDOFF.md`(메인), `workers/HANDOFF.md` 확인
- 원인 분석
  - 인증 토큰/유저 복원 실패 시(특히 `token` 누락, `refreshToken`만 남은 경우) 화면에서 다시 인증 유도될 수 있는 흐름 점검
  - 앱 시작 시 자동 세션 복구 흐름이 없던 점 확인

#### 성공한 것
- `apps/mobile/app/_layout.tsx`
  - 앱 시작 시 `refreshToken`이 있고 `token` 또는 `user`가 비어있으면 `/auth/refresh`를 자동 호출해 세션 복구하도록 추가
  - 복구 중에는 부트 로딩 화면을 보여 불필요한 재인증 화면 노출을 줄임
  - 복구 실패 시 강제 로그아웃하지 않고 기존 상태 유지
- `apps/mobile/lib/api.ts`
  - API 요청 직전 `token`이 없고 `refreshToken`이 있으면 선제적으로 refresh를 시도한 뒤 요청 재실행하도록 보강
- 검증
  - `pnpm --filter mobile exec tsc --noEmit` 통과

#### 실패/이슈
- `refreshToken` 자체가 만료/폐기된 경우에는 보안 정책상 재로그인이 필요함(완전 무인증 유지 불가)

#### 다음 단계
1. 실제 디바이스에서 `인증 완료 → 앱 리로드 3~5회` 반복 후 재인증 재발 여부 확인
2. 여전히 재발하면 Workers 로그에서 `/auth/refresh` 응답(401/400) 원인값을 확인해 refresh token 만료 정책 점검
