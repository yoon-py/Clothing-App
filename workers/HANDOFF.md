# workers/HANDOFF.md

Workers 영역 인수인계는 루트 메인 문서를 기준으로 합니다.

## Primary Handoff

- `.claude/HANDOFF.md`

## Workers 작업 시 체크

1. `wrangler.toml`/`.dev.vars`/R2 바인딩 상태 확인
2. 변경 후 최소 `pnpm --filter workers exec tsc --noEmit` 실행
3. 작업 내역은 `.claude/HANDOFF.md` 로그 섹션에 기록
