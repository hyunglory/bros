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

## 2026-09-12 — P1-14 Test Harness / CI Baseline

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0
- 대상 커밋: `fc3269c`
- 실행 명령: `pnpm check`
- 결과: PASS — unit 14개, workspace integration 1개, lint, typecheck, format check, build 성공
- discovery 검증: `scripts/run-tests.mjs`가 unit 3개 파일과 integration 1개 파일을 분리 발견하며 대상이 0개면 실패하도록 구성
- 의도적 lint 실패: unused variable 주입 → ESLint 종료 코드 1 확인 → 원복
- 의도적 type 실패: string에 number 대입 → TS2322와 종료 코드 1 확인 → 원복
- 의도적 test 실패: secret과 무관한 boolean assertion 반전 → Node test runner 종료 코드 1 확인 → 원복
- lockfile 검증: fresh clone에서 `pnpm install --frozen-lockfile` 성공
- clean pipeline 검증: fresh clone에서 install → lint → typecheck → unit/integration → format check → build 순서 PASS
- CI 정적 검증: workflow YAML을 Prettier parser로 확인하고 action release tag의 공식 commit SHA를 조회해 고정
- PostgreSQL lifecycle: GitHub Actions service에 PostgreSQL 18 healthcheck와 test 전용 DSN 구성
- 원격 GitHub Actions 실행: NOT_RUN — GitHub remote/repository가 없어 BLK-001로 기록
- merge/release required check 검증: NOT_RUN — branch protection 입력이 없어 BLK-001로 기록

## 2026-09-12 — P1-04 PostgreSQL 18 개발환경

- 환경: Windows, Docker Engine 29.7.2, Docker Compose v5.3.1, PostgreSQL 18.6
- 대상 커밋: `bc8c419`
- Compose 정적 검증: test 전용 `POSTGRES_PASSWORD`와 `POSTGRES_PORT=55432`를 process environment로 주입한 `docker compose config --quiet` PASS
- 포트 안전성: 호스트 5432가 `mygoal-postgres`에 이미 할당된 사실을 확인하고 기존 서비스를 변경하지 않은 채 BROS만 55432로 기동
- 실행 명령: `docker compose up -d postgres`, health 상태 poll, `docker compose ps postgres`
- 결과: PASS — `bros-postgres-1`이 `healthy`, host 55432 → container 5432 TCP 연결 성공
- DB 검증: `current_setting('server_version')`이 `18.6 (Debian 18.6-1.pgdg12+2)`, data directory가 `/var/lib/postgresql/18/docker`, `uuidv7()` 호출 성공
- 영속성 검증: probe row 생성 → `docker compose restart postgres` → healthy 대기 → 같은 row 조회 성공 → probe table 제거
- 정리: `docker compose stop postgres`로 service만 중지하고 `bros_postgres_data` named volume은 보존
- 회귀 검증: `pnpm check` PASS — unit 14개, integration 1개, lint, typecheck, format check, build 성공
- 이미지 재현성: `postgres:18.6-bookworm` multi-architecture digest `sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af`를 Compose와 CI에 동일하게 고정

## 2026-09-12 — P1-05 명세 및 구현 초안

- 대상: 아직 확정하지 않은 P1-05 working tree. BLK-002 정책 답변 대기.
- 환경: Node.js v24.14.1, pnpm 11.19.0, Kysely 0.29.5, pg 8.23.0, @types/pg 8.23.1.
- 명세 대조: 설계서 11·12장 + 보완 명세 2장/3.2에서 18개 테이블, 256개 컬럼, 26개 FK를 목록화했다.
- 정적 검사: `node --check`로 migration CLI와 DB fixture/schema test 문법 PASS. `pnpm lint` PASS.
- TypeScript: 최초 명시적 실행 차단 함수의 never 반환으로 unreachable 타입 오류 발생 → 반환 선언을 void로 바꾼 뒤 `pnpm --filter @bros/db build` PASS.
- 미실행: 실제 DB migration, rollback/forward, metadata 대조, constraint negative test, 전체 `pnpm check`는 NOT_RUN. 정책 미확정 baseline의 up은 명시적 오류로 차단되어 있다.
- 남은 테스트: 코드 정책 결정 후 MASTER/SKU 복합 FK, Identifier scope/primary, Import 최종 집계, Thumbnail 성공/검수 순번 사례를 추가하고 전체 DB 시나리오를 실행한다.

## 2026-09-12 — P1-05 구현 및 DB 검증 완료

- 대상 커밋: `6e3cd03` — DEC-20260912-010의 코드 정책을 반영한 baseline.
- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0, PostgreSQL 18.6, Kysely 0.29.5, pg 8.23.0, @types/pg 8.23.1.
- 실행 명령: `TEST_DATABASE_URL`을 개발 PostgreSQL 55432로 process 주입한 뒤 `pnpm check`.
- 결과: PASS — lint, typecheck, unit 14개, integration 22개(Node runner의 부모 test 포함), format check, build. Skip 0개.
- schema metadata: 18개 테이블 256개 컬럼의 타입·NULL·기본값·identity를 작성한 DB_MIGRATION_SPEC과 대조. 모든 테이블 PK/public UUID UNIQUE, 26개 FK의 RESTRICT/조회 B-tree, 문서 컬럼 CHECK 존재, 상품명 pg_trgm GIN과 raw GIN 부재 확인.
- migration: 빈 `template0` 기반 DB에서 실행; DDL 중간 충돌 시 앞선 생성도 rollback; 충돌 제거 후 재적용; 동시 재실행의 no-op; disposable DB에서 down→forward 성공. seed 4개 재현.
- ID/수치: UUIDv7 기본 생성, UUID 중복/NULL 및 임의 identity 입력 차단; BIGINT `9007199254740993`과 NUMERIC 소수의 string 정밀도 보존.
- 관계/유일성: global/platform alias 범위, MASTER/SKU 복합 FK, Identifier 범위·primary UNIQUE, 서로 다른 MASTER의 동일 식별자 허용, Source 외부 ID·옵션 key, 참조 중인 부모 삭제 차단.
- 이미지: 미매칭 Source 등록 허용, metadata 일부만 입력/미저장 STORED/비정상 hash·revision 거절, 원본 revision 구분, 같은 생성 hash의 동시 INSERT 중 하나만 성공.
- Import/후보: raw JSON null·배열·스칼라 보존과 SQL NULL 차단, 실패 원본·중복 외부 ID 행 보존, 행 번호 유일성, 종료 집계·상태 정합성, candidate rank/version/score와 evidence/conflict 배열 제약.
- Thumbnail/자동화: recipe 버전 유일성, 성공 hash/processing version 필수, 성공과 검수 분리, 동시 검수 순번 충돌; browser profile/IANA timezone, queue provider/job ID 쌍, 실행 request key 유일성 및 시간 순서 검증.
- 열린 코드 정책: 다섯 필드에 새로운 코드 값 허용, NULL·빈 문자열·공백/탭/개행만 있는 값·65자 입력 거절.
- CLI: 정상 migration 성공과 잘못된 설정의 exit 1 확인. 오류에 입력 연결정보나 민감 marker가 노출되지 않음.
- 초기 테스트 수정: 표 머리글을 컬럼으로 센 parser 수정, RESTRICT 삭제의 SQLSTATE `23001`과 FK 입력의 `23503` 구분, pg metadata의 `name[]`를 `text[]`로 변환. 수정 후 전체 PASS.
- 최종 명세 대조 보완: automation_run.trigger_type을 VARCHAR(16)으로 수정, 문자열 공백 검증에 탭/개행 포함, Import 종료 상태와 failed_count의 관계 CHECK 추가. 모두 최종 테스트에 반영.
- clean clone: `tmp/p105-clean-9e2c6343e8c14adda4a3157bf2a607b7`에 `6e3cd03`을 `git clone --no-local`로 복제 → `pnpm install --frozen-lockfile` → `pnpm check` PASS. 기존 node_modules/dist/.env 없이 재현, clone의 Git 변경 0건.
- 개발 DB: 적용 전 bros DB의 app/bros_migrations 업무 테이블 0개 확인 → `pnpm db:migrate` PASS → 업무 테이블 18개, 이력 001-baseline, platform seed 4개 확인. 잔여 `bros_test_` DB 0개.
- 종료 상태: `docker compose stop postgres` 실행. 개발 DB volume에 적용 결과 보존; 기존 다른 프로젝트 PostgreSQL은 변경하지 않음.
- 미검증 범위: P1-06 런타임 repository/transaction API, P2/P3/P4/P5 업무 상태 전이·승인·매핑 잠금, P1-14 원격 GitHub CI/required check(BLK-001). P1-05 결과와 구분한다.

## 2026-09-12 — P1-06 완료

- 결과: PASS. Node 24.14.1, pnpm 11.19.0, PostgreSQL 18.6 개발환경 사용.
- 실행: `node --test tests/integration/database-client.integration.test.mjs` 9개 PASS 후 `pnpm check` 전체 PASS. unit 15개, integration 31개(Node parent 포함), fail/skip 0개; lint/typecheck/format/build PASS.
- 최초 전체 검사에서 JsonObject index signature 표기가 lint에 실패했다. Record로 수정 후 전체 검사를 통과했다.
- API/Worker의 별도 pool이 동일 packages/db repository로 seed를 조회하고 내부 id를 projection에 노출하지 않음을 확인했다. 실제 BIGINT string, timestamp Date, JSON object 반환을 확인했다.
- transaction commit 전후 별도 연결의 가시성, callback 및 DB CHECK 실패 시 전체 rollback·연결 반환, callback 자동 재시도 없음, 중첩 transaction 차단을 검증했다.
- pool max=1 포화 대기 timeout, SQL statement timeout(SQLSTATE 57014) 이후 query 복구, 중복 close·종료 후 query 거절·미사용 pool 종료를 검증했다.
- 컴파일 검증은 잘못된 column/table/state, number BIGINT, identity 입력, public_id 수정, 미직렬화 JSON array 쓰기를 거절한다. 기존 18개 테이블·256개 컬럼 metadata 및 DB 제약 테스트도 통과했다.
- 종료 전 잔여 bros_test_ DB 0개, 기존 app 테이블 18개 확인. BROS postgres만 중지하고 volume 보존. baseline migration 변경 없음.
- P1-06 fresh clone 검사는 별도 실행하지 않았다. 이번 변경에는 dependency/lockfile 변경이 없다. P1-05 clean clone 증거를 P1-06의 실행 결과로 간주하지 않는다.
- 미검증: HTTP signal/drain은 P1-07, Worker bootstrap은 P1-10, 업무 CAS/잠금은 후속 업무 service. 원격 CI/required check는 BLK-001 유지.

## 2026-09-12 — P1-07 완료

- 결과: PASS(로컬). Node 24.14.1, pnpm 11.19.0, Fastify 5.12.4, PostgreSQL 18.6.
- 실행: `pnpm check` 전체 PASS — unit 16개, integration 35개(Node parent 포함), fail/skip 0개, lint/typecheck/format/build 통과. `pnpm install --frozen-lockfile` PASS. 새 clean clone 검사는 별도 실행하지 않았다.
- HTTP: /health가 DB 연결 생성 없이 200, schema 기반 UUID 입력 거절 400, JSON 파싱 오류 400, body limit 413, 404/500 공통 envelope, 응답 serializer의 내부 필드 제거, 서버 requestId 및 오류·로그 민감정보 미노출 검증.
- DB: disposable DB 앞 TCP proxy에서 기존 소켓 단절 및 신규 연결 거절 → /ready 503, /health 200 → 연결 허용 후 /ready 200. 다른 DB/컨테이너를 중지하지 않고 실제 네트워크 장애를 주입했다.
- timeout: pool 1개를 transaction이 점유한 상태에서 8개 readiness 요청이 제한 시간에 503을 반환하고 DB 대기는 1개만 유지하며 연결 반환 후 200으로 복구했다.
- HTTP drain: 실제 TCP 요청이 transaction 안에서 대기하는 중 close 시작, 요청을 해제하면 Connection: close와 정상 body를 수신하고 pool 0개·listen 종료·이후 연결 거절 확인.
- 프로세스: 별도 Node child의 등록 SIGTERM handler, pool 정리 후 exit 0, 점유 transaction 미완료 시 종료 deadline으로 exit 1, CLI 설정 오류 시 안전한 출력과 exit 1을 검증했다. Windows에서는 IPC로 SIGTERM 이벤트를 dispatch했다. 실제 POSIX 신호 전달은 Linux CI 분기로 구현했지만 이번 환경에서는 실행하지 않았다.
- 발견·수정: checked-out pg Client의 별도 error 이벤트가 uncaughtException을 발생시키던 경로를 고정 메시지 listener로 처리했다. drain 중 keep-alive 연결이 종료를 지연시키던 경로는 응답 Connection: close로 해결했다. 타입·lint 및 초기 payload fixture 오류를 수정한 후 전체 검사를 다시 통과했다.
- 종료: 디버깅 강제 종료로 남은 두 고유 fixture DB는 소유자 bros·연결 0·업무 테이블 0을 확인하고 명시적인 이름으로 정리했다. 최종 잔여 bros_test_ DB 0개, 기존 app 테이블 18개. BROS postgres 중지, volume 보존.
- 미검증: Linux 실제 SIGTERM·원격 CI/required check(BLK-001), 운영 배포 환경, 후속 인증·업무 API·Queue/Worker. 테스트용 contract/failure/held route는 배포 app에 등록하지 않는다.
- 최종 정리 보완: 프로세스 테스트 실패 시에도 자식 종료를 DB 삭제보다 먼저 수행하도록 hook 순서를 보완했다. 해당 프로세스 테스트 2개 재실행 PASS, DB 재중지 완료.

## 2026-09-13 — P1-09 완료

- 결과: PASS. pg-boss 12.31.0을 정확히 고정했다. 기존 Node 24.14.1 / pnpm 11.19.0 / PostgreSQL 18.6 환경 사용.
- `pnpm check`: unit 18개, integration 43개(Node parent 포함), fail/skip 0개 및 lint/typecheck/format/build PASS. `pnpm install --frozen-lockfile` PASS. 이번 단계의 fresh clone은 별도 실행하지 않았다.
- 큐 단독 통합 검증 8개 PASS: 5개 이름·payload/ID 경계, browser 재시도 0, 업무+enqueue commit/rollback 가시성, 생산자 종료 후 보존, 두 소비자의 provider ID별 선점, retry/backoff/최종 실패·원문 예외 미보관, handler 완료를 기다리는 정상 stop.
- 실제 별도 프로세스를 SIGKILL로 종료했다. enqueue 직전 및 enqueue 후 commit 전의 crash에서 미커밋 업무·큐 row가 남지 않았다. active job의 소비자 crash 후 expiration/retry를 통해 새 소비자가 attempt 2로 완료했다. 업무의 exactly-once 보장을 의미하지 않는다.
- 타입 metadata generic 및 lint의 void 표기 문제를 수정한 후 전체 검사에 통과했다. timeout/옵션 범위와 미시작 adapter의 멱등 stop도 unit에서 검증했다.
- 종료 전 잔여 bros_test_ DB 0개, 개발 app 테이블 18개, 개발 bros_queue 테이블 0개 확인. 테스트 대상은 disposable DB이며 기존 개발 DB에 queue 설치는 하지 않았다. BROS postgres 중지, volume 보존.
- 미검증: stop deadline 초과 시 소유 Worker 프로세스 종료는 P1-10에서 검증한다. 업무 request_key/CAS/외부 부작용·스케줄은 후속 service 범위다. 원격 CI 및 P1-07 POSIX 실신호는 BLK-001 유지.

## 2026-09-13 — P1-10 완료

- 결과: PASS(로컬). `pnpm check` unit 18개·integration 52개(Node parent 포함), fail/skip 0, lint/typecheck/format/build PASS. 새 의존성 및 baseline 변경 없음.
- 실제 별도 Worker 프로세스: 미실행 상태 enqueue 후 SUCCESS 및 platformCount "4", 동시 동일 request_key의 동일 receipt, retry 시 RETRY_WAIT 후 attempt 2 SUCCESS, 끝까지 실패 시 attempt 3 FAILED, 원문 오류 미노출 검증.
- 프로세스 crash: RUNNING 중 SIGKILL → 새 Worker가 큐 만료/재시도 후 attempt 2로 성공. 종료 검증: 진행 작업 완료 후 정상 exit 0, 응답하지 않는 handler에서 1000ms 종료 deadline 후 exit 1.
- 경쟁·자원 경계: SUCCESS 재전달 시 action 재실행 없음, 오래된 attempt가 새로운 SUCCESS를 덮어쓰지 못함, 등록 실패 시 queue/DB 정리, queue stop 실패 시 소유자가 종료하기 전 DB를 유지, 미시작 Worker의 중복 stop 및 재시작 차단을 검증했다.
- 초기 enqueue에서 job_code UNIQUE를 잘못 가정한 쿼리가 실패했다. baseline 실제 제약을 확인하고 전용 transaction advisory lock과 모호한 정의 거절로 수정했다. 추가 회귀 테스트의 scope/lint 문제도 수정 후 전체 PASS.
- Windows에서는 SIGTERM handler를 IPC로 호출하고 crash는 실제 자식 프로세스 강제 종료를 사용했다. POSIX 실제 SIGTERM 분기는 Linux CI에서 확인해야 한다(BLK-001).
- 개발 DB smoke: send-system-test CLI 접수 → 실제 startWorker 실행 → publicId `01a09846-0c34-7e6d-bf7a-abd8dad5dac5`, provider ID `eb1d0f5f-b3f5-4950-84d9-dd14b99df537`, SUCCESS/attempt 1/result {platformCount:"4"} → WORKER_STOPPED 및 exit 0 확인. bros_queue 및 INTERNAL smoke 정의/성공 이력을 개발 DB에 보존했다.
- 최종 잔여 bros_test_ DB 0개, app 테이블 18개 유지, BROS postgres 중지 및 volume 보존. 새 clean clone 검사는 별도 실행하지 않았다.
- 미검증: P5 업무 자동화·Browser handler·schedule reconciliation, P6 운영 heartbeat/권한/배포, 원격 CI/required check. Phase 1 전체 완료로 간주하지 않는다.

## 2026-09-13 — P1-11 완료

- 결과: PASS(로컬). React 19.3.0, React Router 7.18.3, Vite 8.3.0, Vitest 5.0.0을 정확히 고정했다.
- `pnpm check`: Admin Vitest 6개, Node unit 19개, integration 53개, fail/skip 0개 및 lint/typecheck/format/build PASS. Admin production build는 JS 318.35 kB(gzip 98.35 kB), CSS 5.94 kB(gzip 2.05 kB)다.
- UI: `/` Dashboard, 공통 layout, 미등록 route 404 화면, `/health` 초기 loading·정상·안전한 오류·수동 retry를 렌더링 테스트로 확인했다. API client는 3초 timeout, 비정상 HTTP, 연결 실패, 공용 TypeBox 계약과 다른 200 응답을 구분한다.
- 개발 서버: 실제 Vite server와 로컬 health server를 함께 띄워 HTML 및 변환된 React entry 접근, same-origin `/health` 프록시 응답을 통합 테스트했다.
- 브라우저: `http://127.0.0.1:5173/`에서 실제 렌더링과 `정상 운영 중` 전환을 확인했고 console warning/error는 0건이었다. 확인 후 브라우저 탭과 3000/5173 개발 프로세스를 종료했다.
- 의존성: `CI=true pnpm install --frozen-lockfile` PASS. 최초 비대화형 실행은 pnpm의 modules purge 확인 정책으로 중단됐으며 CI 모드에서 lockfile 불일치 없이 재실행했다.
- DB 회귀: 기존 P1-05~10 통합 검사를 위해 BROS PostgreSQL만 기동했고 전체 PASS 후 중지했다. 개발 volume과 기존 업무 데이터는 보존했다.
- 미검증: 프로덕션 reverse proxy/정적 호스팅, Admin 인증·인가 및 업무 API는 후속 P6/업무 단계 범위다. 원격 CI/required check는 BLK-001 유지.

## 2026-09-13 — P1-12 완료

- 결과: PASS(로컬). 새 외부 의존성이나 migration 변경 없이 `@bros/storage`의 ObjectStorage Port, Local adapter, object key validator/builder를 구현했다.
- `pnpm check`: Admin Vitest 6개, Node unit 28개, integration 53개, fail/skip 0개 및 lint/typecheck/format/build PASS.
- storage 단독 테스트 9개 PASS: portable key와 traversal 변형 차단, buffer/stream put 및 교체, get, 멱등 delete, missing 오류, ancestor junction 탈출 차단, signed URL 정상/변조/만료, provider-neutral Worker 소비, stream 실패 시 기존 target 보존·임시 파일 정리, 8개 동시 디렉터리 생성.
- 타입 검증: `ObjectStorage`만 받는 Worker artifact 함수가 put/get을 사용하도록 별도 typecheck를 추가했고 Local/R2 분기나 filesystem 경로 없이 컴파일됨을 확인했다.
- 저장 경계: 파일은 target과 같은 디렉터리의 exclusive 임시 파일에 쓰고 sync 후 rename한다. 반환 metadata와 signed URL에는 logical bucket/object key만 포함한다. 오류 메시지는 입력 key, root 절대경로, 원문 I/O/stream 오류를 포함하지 않는다.
- Local signed URL은 HMAC과 1~86400초 만료를 적용하고 같은 adapter instance에서 검증·조회한다. 임시 signing key이므로 프로세스 재시작 후 URL 지속성은 보장하지 않는다.
- 전체 회귀를 위해 BROS PostgreSQL만 기동했고 PASS 후 중지했다. 개발 volume은 보존했고 실제 `./storage`에는 파일을 생성하지 않았으며 테스트별 OS temp root를 정리했다.
- 미검증: POSIX mode 0700/0600과 symlink 동작은 Windows 환경에서 직접 검증하지 않았다. R2/S3, HTTP preview route, 인증·보존 정책, 이미지 다운로드 크기/MIME/decode 검사는 P2/P4/P5/P6 범위다. 원격 CI/required check는 BLK-001 유지.

## 2026-09-13 — Phase 1 Gate 재판정 / BLK-001 재확인

- 환경: Windows, Node.js v24.14.1, pnpm 11.19.0, PostgreSQL 18.6(BROS 전용 Compose)
- 대상: branch `codex/p1-foundation`, commit `b8bed87`
- 실행 명령: PostgreSQL healthy 확인 후 `CI=true`, `TEST_DATABASE_URL`을 테스트 DSN으로 설정하고 `pnpm check` 실행
- 결과: PASS — lint, typecheck, Admin Vitest 6개, Node unit 28개, integration, format check, build가 모두 성공했다. 테스트 종료 후 BROS PostgreSQL 컨테이너를 중지했고 volume은 보존했다.
- P1-14 원격 GitHub Actions: NOT_RUN — `git remote -v`가 비어 있으며 GitHub CLI 기본 계정 토큰이 무효여서 대상 repository와 인증 권한을 확인할 수 없다.
- required check 및 의도적 실패 PR merge 차단: NOT_RUN — branch protection 대상 repository·권한이 없다.
- Gate 판정: BLOCKED — WBS P1-14 Acceptance Criteria의 실제 CI failure/merge 차단 증거가 없으므로, 로컬 pipeline PASS를 Phase 1 Gate PASS로 전환하지 않는다. BLK-001을 유지한다.

## 2026-09-13 — P1-14 원격 CI / BLK-001 해소 / Phase 1 Gate 완료

- 원격: `https://github.com/hyunglory/bros`, 기본 브랜치 `main`, 검증 브랜치 `codex/p1-foundation`, 정상 PR #1.
- 최초 원격 CI: Actions run 34746278320이 Bash에서 인용되지 않은 `./packages/**` glob을 확장해 typecheck 단계에서 FAIL했다. `package.json`의 pnpm filter 패턴을 인용한 commit `5175a58`로 수정했다.
- 수정 후 로컬 회귀: BROS PostgreSQL 18.6을 기동하고 `CI=true`, 테스트 DSN으로 `pnpm check` PASS. Admin Vitest 6개, Node unit 28개, integration 53개, fail/skip 0개와 lint/typecheck/format/build가 성공했다. 이후 컨테이너를 중지하고 volume을 보존했다.
- 정상 원격 CI: PR #1 commit `5175a58`, Ubuntu 24.04, PostgreSQL 18.6에서 Actions run 34746426348의 `install / lint / typecheck / test / build`가 2분 37초에 SUCCESS. GitHub API는 PR #1을 `mergeStateStatus=CLEAN`으로 반환했다.
- 보호 규칙: repository ruleset `main required quality` ID 23149676, target branch `~DEFAULT_BRANCH`, enforcement `active`, strict required status check `install / lint / typecheck / test / build`, bypass actor 없음.
- 실패 차단: 임시 PR #2 commit `dc048c5`에 `@typescript-eslint/no-unused-vars` 오류를 의도적으로 추가했다. 로컬 lint FAIL 및 Actions run 34747040147 FAILURE를 확인했고, GitHub API는 `mergeable=MERGEABLE`이지만 `mergeStateStatus=BLOCKED`를 반환했다. 이는 충돌이 아니라 required check가 merge를 차단한 증거다.
- 정리: PR #2는 merge 없이 CLOSED하고 임시 원격·로컬 branch `ci/verify-required-check`를 삭제했다. 실패 PR과 Actions 기록은 GitHub에 유지된다. PR #1은 OPEN/CLEAN 상태다.
- 공개 범위 결정: GitHub Free private repository의 protection/ruleset API가 403을 반환해 사용자 승인 후 repository를 PUBLIC으로 전환했다.
- Gate 판정: PASS — P1-14 원격 CI와 실패 차단을 포함해 P1-01~P1-14 Acceptance 증거가 충족됐다. BLK-001은 RESOLVED다.

## 2026-09-13 — P2-01 Discovery 입력 감사

- 대상: WBS P2-01, 설계서 14장, 보완 명세 5장 입력 의존성, 현재 저장소 파일 목록과 DB 물리 계약.
- 저장소 검색: 실제 상품 샘플, 원본 데이터 위치, Source fixture, Browser 대상 URL은 발견되지 않았다.
- 문서 대조: `SourceProductInput`의 기존 필드와 DB `source_product`/`source_sku`/`product_image` 경계를 매핑했다. 수집 시각·상품 재고 입력과 옵션/이미지 하위 타입이 P2-02에서 확정돼야 하는 계약 공백임을 확인했다.
- mapping dry-run: NOT_RUN — 실제 샘플 20건이 없다.
- 결과: BLOCKED_EXTERNAL_INPUT — Source Mapping Spec 골격은 작성했으나 P2-01 Acceptance Criteria는 미충족. BLK-003으로 추적한다.

## 2026-09-13 — P2-01 실제 샘플 20건 Mapping Dry-run

- 입력: `examples/더망고_상품정보_20260913.xlsx`, 5,002,588 bytes, SHA-256 `1C3D35AF15093510E613CF9504FAFD28E264B1D15AABB95B215DC564AC8E2FDE`.
- 원본 보호: workbook은 `read_only=True`, `data_only=True`로 열었으며 셀을 수정하거나 다시 저장하지 않았다. 재배포 가능 여부가 확인되지 않아 Git stage 대상에서도 제외했다.
- inventory: `상품 목록` 26,375건, MUSINSA 16,133건, OLIVEYOUNG 10,242건. 옵션 상품 3,722건, 재고상품 24,707건, 품절상품 1,668건.
- 표본: 원본 행 순서 기준 10개 변형 조건에서 각 2건을 선택해 정확히 20건을 mapping했다. source locator와 선정 규칙은 Source Mapping Spec 4~5장에 기록했다.
- mapping 결과: MAPPED 8건, MAPPED_WITH_REVIEW 8건, REJECTED 4건. REJECTED는 두 플랫폼에서 `externalProductId`가 비어 있는 의도된 필수값 실패다.
- identity 검증: 유효 `(platformCode, externalProductId)` 16건, 중복 0건. legacy `고유값`은 누락 ID 대체값으로 사용하지 않았다.
- 옵션/이미지 검증: 표본 옵션 20개에서 옵션명 20개와 옵션이미지 20개의 순서 pairing이 일치했다. mismatch 0건, 대표이미지 20/20건 존재.
- 가격 검증: 원본 0은 실제 가격이 아닌 export 한계이므로 `normalPrice`/`currentPrice`는 20/20건 null로 mapping했다. 통화도 추정하지 않았다.
- 보안 검사: 선택 20행의 field name/value에서 password, authorization, cookie, API key, token 의심값 0건. 이미지 URL query는 변환 파라미터이며 자격증명 파라미터는 확인되지 않았다.
- 미실행: 추정 상품 URL의 live 접속, 이미지 다운로드, DB insert, Adapter 코드 실행은 P2-01 범위가 아니므로 수행하지 않았다.
- 결과: PASS — 실제 필드표와 20건 row-level 결과가 작성돼 P2-01 Acceptance Criteria를 충족했다. P2-02 계약 결정은 별도 후속 작업이다.

## 2026-09-14 — P2-02 SourceProductInput 표준 계약

- 대상: `packages/contracts/src/source-product.ts`, public export, `packages/contracts/test/source-product.test.mjs`.
- 계약 검증: full 입력, partial 입력, 필수값·미정 필드, malformed URL, decimal 범위·통화 의존성, option/image/identifier 중복, raw JSON·민감정보, import timestamp의 8개 테스트 PASS.
- 보안 경계: raw의 비 JSON 값·cycle·secret key, URL userinfo와 credential/signature query를 거절하며 validation 결과에는 원본값 없이 issue code와 JSON pointer path만 반환함을 확인했다.
- 시간·금액 경계: 실제 달력 날짜와 RFC 3339 offset을 검사하고 `+14:00` 초과 offset을 거절한다. 금액은 DB `numeric(20,4)` 범위의 비음수 canonical decimal string이며 가격 존재 시 통화가 필수다.
- 실행 명령: contracts build/typecheck, 대상 Node test, 루트 `pnpm lint`, 기존 BROS PostgreSQL에 test DSN을 process 주입한 `pnpm check`.
- 전체 결과: PASS — Admin Vitest 6개, Node unit 36개, integration 53개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.
- 원격 결과: PR #1의 GitHub Actions run 34779705905에서 required check `install / lint / typecheck / test / build` PASS, 실행 시간 1분 39초.
- 입력 보호: `examples/더망고_상품정보_20260913.xlsx`는 읽거나 수정·stage하지 않았고 원본 Excel은 Git 외부에 유지했다.

## 2026-09-14 — P2-03 XlsxImportAdapter

- 대상: `@bros/importer` workspace의 `XlsxImportAdapter`, 비식별 XLSX fixture mapping test.
- adapter 경계: workbook buffer만 입력으로 받고 `상품 목록` 시트와 5행 header를 검증한다. 25MB와 100,000 data row 상한, formula/비 JSON cell 거절, platform host allowlist, option count/pairing, safe issue code를 적용한다.
- fixture 검증: full product/option/image/raw 변환, partial 입력, legacy ID fallback 거절, 20행 대표 집계(16 mapped/4 rejected), option·URL·price·formula 오류, sheet/header/size 경계를 검사한다.
- 실제 원본 read-only 실행: SHA-256 `1C3D35AF15093510E613CF9504FAFD28E264B1D15AABB95B215DC564AC8E2FDE`의 26,375행을 `MAPPED` 25,945행, `REJECTED` 430행으로 변환했다. 외부 ID 결측 issue 407회, option 이름 수 불일치 5회, option 이미지 수 불일치 24회다.
- 20행 재현: P2-01의 실제 locator 20개는 `MAPPED` 16행, `REJECTED` 4행이며 거절은 모두 외부 ID 결측이다. 원본 품질 상태는 raw에 보존하고 adapter의 accept/reject 결과와 혼합하지 않는다.
- 의존성 선택: 실제 원본을 해석하지 못한 `exceljs 4.4.0`은 제거했다. 공개 Apache-2.0 repository와 integrity가 확인된 `@e965/xlsx 0.20.3`을 고정했다.
- 전체 결과: PASS — Admin Vitest 6개, Node unit 41개(신규 adapter 5개 포함), integration 53개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.

## 2026-09-14 — P2-04 Import Validation / Raw 보존

- 대상: `createImportValidationService`, `import_batch`·`import_item`에 대한 mapped/rejected row 이력화와 raw secret 재검증.
- 수용 경계: `platformCode`, `externalProductId`, `productName`만 필수다. 브랜드·식별자·가격·이미지 결측이 있는 valid input은 `PENDING` item으로 보존하고, P2-06 전에는 `source_product`를 만들지 않는다.
- 거절 경계: Adapter 거절, 재검증 계약 실패, batch platform mismatch는 `FAILED` item과 안전한 code/path로 남긴다. raw에서 secret성 key가 나오면 `raw: null`을 저장하고 원문 secret·URL은 item/error message에 넣지 않는다.
- 통합 검증: 일회용 PostgreSQL DB에서 mapped/rejected row의 locator·context·raw·issue 보존, platform mismatch 거절, secret raw 미보존, source_product 0건을 확인했다.
- 전체 결과: PASS — Admin Vitest 6개, Node unit 42개, integration 55개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.

## 2026-09-14 — P2-06 Source Product Upsert

- 대상: `createSourceProductUpsertService`의 PENDING item 소비, `(platform_id, external_product_id)` idempotency, source freshness와 batch terminal aggregate.
- identity 검증: 첫 batch의 두 identity는 `CREATED`되고, 같은 identity의 새 `collectedAt` title·price·currency는 `UPDATED`된다. 같은 identity의 과거 입력은 최신 source 값을 보존하고 `MATCHED`된다.
- batch 검증: mapped/rejected mixed batch는 valid row를 `SUCCEEDED`, 기존 rejected row를 `FAILED`로 유지하고 `PARTIAL_FAILED` 및 count 합계·finished_at을 기록한다.
- 전체 결과: PASS — Admin Vitest 6개, Node unit 42개, integration 57개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.

## 2026-09-14 — P2-05 Brand Normalizer

- 대상: `normalizeBrandAliasName`, `createBrandNormalizer`의 승인 alias exact lookup과 platform/global 우선순위.
- 정규화 경계: Unicode NFKC, trim, 연속 공백 통합, 대소문자만 정규화한다. 구두점 삭제·부분일치·유사도 매칭은 승인하지 않은 alias를 표준 brand에 연결할 위험이 있으므로 수행하지 않는다.
- 전용 PostgreSQL 통합 검증: platform alias가 동일 normalized alias의 global alias보다 우선함, active brand의 한글 alias가 전역으로 연결됨, unknown/blank/unknown platform/inactive brand가 `UNRESOLVED`이며 brand를 생성하지 않음을 확인했다.
- 실행 결과: unit 44개 PASS, P2-05 전용 integration 1개 PASS, lint·typecheck·format check·production build PASS.
- 전체 결과: IMPLEMENTED_NOT_VALIDATED — 전체 `pnpm check`의 종료 증거와 원격 CI는 아직 PASS가 아니다. P2-06 원격 run `34795563889`는 `cancelled`로 종료되어 성공 근거로 사용하지 않는다.

## 2026-09-14 — P2-07 Embedded Identifier Extractor

- 대상: `extractEmbeddedIdentifiers`의 explicit `identifiers[]`와 nested raw JSON allowlist key 후보화.
- 추출 경계: `MODEL_NO`, `STYLE_CODE`, `PRODUCT_NO`, `MPN`, `GTIN`, `EAN`, `UPC`, `BARCODE`, `BRAND_CODE`의 승인 raw key만 후보화한다. 임의 문자열/상품명/숫자 raw 값의 regex 추정은 하지 않는다.
- provenance: source field JSON pointer 또는 raw JSON pointer를 후보별로 모두 보존한다. 같은 type·normalized value는 하나의 후보로 합치며 provenance만 누적한다.
- 안전 경계: identifier value는 NFKC·trim·공백 통합·대문자 norm을 사용하고, traversal depth/node/candidate 상한에 걸리면 `truncated: true`로 이후 단계의 자동 확정을 막을 수 있게 한다.
- 실행 결과: nested raw JSON, 중복 provenance, unknown/numeric non-inference, traversal determinism/boundary를 포함한 Node unit 47개 PASS. importer build PASS.
- 전체 결과: IMPLEMENTED_NOT_VALIDATED — 전체 `pnpm check` 종료 증거와 원격 CI PASS는 P2-05와 함께 아직 없다.

## 2026-09-14 — P2-08 MASTER Matcher v1

- 대상: `matchMasterCandidates`, `createProductMatcher`의 existing MASTER 후보 조회와 결정적 evidence/conflict 평가. DB mutation과 MASTER 생성·source 연결은 범위에서 제외했다.
- 후보/강한 근거: `BRAND_CODE` 제외 identifier exact와 resolved-brand pg_trgm 후보를 합친다. verified GTIN/EAN/UPC 계열 exact, verified same-type model exact, resolved brand + same-type identifier exact만 강한 근거가 된다. title similarity는 조회·검수 근거일 뿐 자동 match 근거가 아니다.
- 차단 경계: strong 후보 복수, brand/GTIN/model/variant/inactive conflict, P2-07 truncation은 `REVIEW_REQUIRED`이며 selected MASTER를 반환하지 않는다. 기존 후보가 없을 때도 resolved brand와 상품 identifier가 함께 있어야 `NEW_MASTER_CANDIDATE`이며, identity 근거가 없으면 review다.
- unit: unique verified GTIN exact, ambiguous exact, exact+GTIN conflict, exact+model conflict, similar title/different variant, truncated extraction, new candidate, insufficient evidence의 8개 matcher 시나리오 PASS.
- PostgreSQL integration: 실제 baseline/pg_trgm에서 source GTIN과 verified EAN의 계열 exact 후보를 찾고 provenance·public identifier evidence를 반환하며 `source_product`를 쓰지 않음을 확인했다.
- 전체 결과: 최종 근거 규칙 직전 로컬 `pnpm check` PASS — Admin Vitest 6개, Node unit 54개, integration 59개, fail/skip 0개. 최종 변경 후 전체 unit을 다시 실행해 Admin 6개·Node 55개 PASS했고 importer lint/typecheck/build도 PASS했다. 원격 CI는 이번 공개 전송 미승인으로 NOT_RUN이므로 구현 상태는 `IMPLEMENTED_NOT_VALIDATED`를 유지한다.

## 2026-09-14 — P2-09 MASTER Creator / Race Control

- 대상: `createMasterService.process(itemPublicId)`의 READ COMMITTED transaction, identity advisory lock, lock 후 P2-08 재조회, atomic MASTER/identifier/source/item/batch 쓰기.
- 단위 검증: GTIN/EAN/UPC lock 동등성, model type 분리, BRAND_CODE 제외, 입력 순서 무관 lock 순서, 옵션 범위·public UUID 입력 거절 2개 PASS.
- 실제 PostgreSQL 18.6 통합 12개 시나리오 PASS(부모 test 포함 13개): 별도 batch 4개 동시 요청의 MASTER 1개 수렴/GTIN label 교차, 같은 item 4회 동시 replay, 역순 복수 identifier lock, 기존 링크 보존, 같은 시각·다른 explicit identifier 검수, identifier 없는 유사상품 검수/집계, SKU 전 옵션 충돌/브랜드 충돌, ambiguous master/truncation/복수 identity 검수, stale source skip, item update 강제 실패의 전체 rollback/재실행, lock 재시도 소진과 재호출, 실제 서로 다른 transaction의 lock 대기를 관찰한 뒤 해제하는 자동 retry.
- source 입력은 synthetic fixture만 사용했다. 신규 identifier는 미검증 상태이며 provenance, public ID, 원본 mappedInput 및 처리 이력을 확인했다. 운영 DB·실제 XLSX를 변경하지 않았다.
- 전체 `pnpm check` 최종 exit 0: Admin Vitest 6개, Node unit 57개, integration 72개, fail/skip 0개; lint/typecheck/format/build PASS.
- 초기 실패: 별도 `.worktrees/p5-browser`가 생성되어 루트 Prettier가 다른 checkout의 11개 파일을 검사했다. `.gitignore`와 `.prettierignore`에 `.worktrees/`를 추가한 뒤 해결했다. 다른 checkout의 코드는 수정하지 않았다.
- 중간 재실행에서 기존 API readiness 초기 50ms probe가 503을 반환해 1개 실패했다. 해당 API test 단독 2개 PASS 및 최종 전체 재실행 PASS; 타이밍 민감 가능성을 남기며 API/test 코드는 변경하지 않았다.
- 원격 push/CI: NOT_RUN. 구현 상태는 기존 기록 방식대로 `IMPLEMENTED_NOT_VALIDATED`이며 로컬 통과와 구분한다. 실데이터 recall/대량 처리 성능·임의 SQL writer와의 동시성은 이번 검증 범위 밖이다.
