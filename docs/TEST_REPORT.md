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

## 2026-09-12 — P1-02 공통 TypeScript / 품질 설정

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0
- 대상 커밋: `102c0a7`
- 실행 명령: `pnpm check`
- 결과: PASS — ESLint, strict typecheck, Prettier 검사, 전체 build 성공
- 실행 명령: `packages/core/src/index.ts`에 문자열 변수로 숫자를 대입한 뒤 `pnpm typecheck`
- 결과: PASS — TypeScript TS2322와 종료 코드 1을 확인하고 즉시 원복
- 실행 명령: 임시 fresh clone에서 `pnpm install --frozen-lockfile`, `pnpm check`
- 결과: PASS — 97개 패키지를 lockfile로 설치하고 전체 품질 게이트 재현
- 회귀 확인: `.gitattributes` 적용 전 fresh clone의 CRLF가 Prettier에서 탐지됨
- 조치 및 결과: JS/JSON/TS/YAML을 LF로 고정한 뒤 같은 fresh clone 시나리오 PASS

## 2026-09-12 — P1-03 환경변수 / Config Loader

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0
- 대상 커밋: `9a43876`, 줄바꿈 보완 `15e82cb`
- 실행 명령: `pnpm check`
- 결과: PASS — lint, typecheck, config unit test, format check, build 성공
- 실행 명령: `node --test packages/core/test/config.test.mjs` (`pnpm test`에서 선행 build 후 실행)
- 결과: PASS — development valid, required value missing, production missing, production valid, invalid 값 비노출의 5개 case 통과
- 실행 명령: `rg -n "process\.env" -- apps packages`
- 결과: PASS — `packages/core/src/config/index.ts`의 명시적 process adapter 한 곳만 확인
- 실행 명령: 임시 fresh clone에서 `pnpm install --frozen-lockfile`, `pnpm check`
- 결과: PASS — 기존 환경 파일·산출물 없이 전체 검증 재현
- 회귀 확인: 첫 fresh clone에서 `.mjs`만 CRLF로 변환되어 format check 실패
- 조치 및 결과: `.gitattributes`에 MJS/CJS를 추가한 뒤 같은 시나리오 PASS

## 2026-09-12 — P1-08 API Contract / TypeBox

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0
- 대상 커밋: `8035fa8`, 오류 details 보완 `94c7b65`
- 실행 명령: `pnpm check`
- 결과: PASS — 10개 unit test, lint, typecheck, format check, build 성공
- 계약 검증: UUIDv7 publicId 허용, BIGINT/UUIDv4 거절, invalid request를 공통 400 envelope로 변환
- 응답 검증: 202 `{publicId,status,statusUrl}`와 `{error:{code,message,requestId,details?}}` schema 확인
- 경계 검증: error details의 비허용 key와 raw secret 형태를 schema가 거절
- 페이지 검증: 기본 limit 50 정규화, 최대 100 허용, 101 거절
- 소비 검증: Admin은 Static type을, API는 같은 runtime schema를 `@bros/contracts`에서 import해 build 성공
- 실행 명령: 임시 fresh clone에서 `pnpm install --frozen-lockfile`, `pnpm check`
- 결과: PASS — 최종 allowlist 보완을 포함한 전체 검증 재현

## 2026-09-12 — P1-13 SecretProvider / Sensitive Data Redaction Baseline

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0, Pino 10.3.1
- 대상 커밋: `d983030`
- 실행 명령: `pnpm check`
- 결과: PASS — 14개 unit test, lint, typecheck, format check, build 성공
- secret 검증: key→environment 이름 변환, browser profile key validation, EnvSecretProvider lookup, missing secret 오류 확인
- text masking 검증: Bearer, password, cookie, DB URL userinfo, signed query 값 비노출
- Pino 검증: root/nested token, request cookie/URL, database URL, Error message/stack을 실제 JSON line으로 직렬화하고 원문 secret 부재 확인
- 회귀 확인: Pino가 serializer 처리 전 `err.message`를 최상위 `msg`로 복사해 token을 재노출하는 실패 탐지
- 조치 및 결과: logger hook에서 문자열과 자동 Error message를 선행 마스킹하고 재실행 PASS
- 실행 명령: `rg -n "process\.env" -- apps packages`
- 결과: PASS — config process adapter 한 곳 외 직접 접근 없음
- 실행 명령: 임시 fresh clone에서 `pnpm install --frozen-lockfile`, `pnpm check`, `process.env` 경계 검색
- 결과: PASS — 전체 보안 baseline 재현
