# BROS 검증 기록

## 2026-09-12 — 구현 전 기준선

- 관련 Task: P1-01
- 실행 명령: 없음
- 결과: NOT_RUN
- 비고: workspace 구현 전이므로 설치·빌드·타입 검사 결과가 없다.

## 2026-09-12 — P1-01 Monorepo / pnpm Workspace

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0
- 대상 커밋: `3eeec09`
- 실행 명령: `pnpm install --frozen-lockfile`
- 결과: PASS — 11개 workspace project(root 포함) 인식, lockfile 변경 없음
- 실행 명령: 앱·패키지의 `dist`를 제거한 뒤 `pnpm typecheck`
- 결과: PASS — 공통 패키지 7개 선행 build 후 10개 workspace typecheck 성공
- 실행 명령: `pnpm build`
- 결과: PASS — 의존관계 순서로 10개 workspace build 성공
- 실행 명령: `pnpm list -r --depth -1 --json`
- 결과: PASS — 앱 3개와 공통 패키지 7개 확인
- 실행 명령: 빌드된 `apps/api/dist/index.js`, `apps/worker/dist/index.js`를 Node.js ESM으로 import
- 결과: PASS — `@bros/*` workspace 의존성을 컴파일 산출물에서 해석
- 실행 명령: `git check-ignore -v --no-index storage/runtime.db`, `git check-ignore -v --no-index packages/storage/src/index.ts`
- 결과: PASS — 루트 `/storage/`는 제외되고 `packages/storage`는 추적 가능
- 실행 명령: 임시 fresh clone에서 `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, Node.js ESM import
- 결과: PASS — 기존 `node_modules`와 `dist` 없이 전체 Acceptance Criteria 재현
- 비고: 첫 C: 임시 복제에서 샌드박스 네트워크 접근이 차단되었고, D: 임시 fresh clone에서 동일 lockfile을 사용해 설치 및 검증을 완료했다. 제품 결함으로 분류하지 않는다.
