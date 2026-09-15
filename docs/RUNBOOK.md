# BROS 운영 Runbook

Phase 3 변경 묶음·commit/원격 CI 준비·migration 002~004 및 동일 revision 배포 순서는 [PHASE3_RELEASE_PREP.md](PHASE3_RELEASE_PREP.md)를 따른다. 이 준비 문서는 실제 운영 DB 적용 기록이 아니다.

P3-12 실행 capture 보관/export: [RESOLVER_CAPTURE.md](RESOLVER_CAPTURE.md). `pnpm resolver:capture:export <run-uuidv7> data/capture-<run-uuidv7>.json`으로 완료 실행의 capture를 새 로컬 파일에 기록한다. 기본 pipeline v2와 등록 CLI 버전을 일치시킨다. P3-14 실제 calibration은 사용자 보류/auto OFF를 유지한다.

## Resolver Batch Worker (P3-12)

- 실행·설정·멱등성·재시도·복구 계약: [RESOLVER_BATCH.md](RESOLVER_BATCH.md).
- migration 003 적용 후 `pnpm worker:start`, `pnpm worker:resolve <request-uuidv7> <source-uuidv7> [source-uuidv7 ...]`를 사용한다. 같은 요청 UUID로 부분 등록을 재시도한다. terminal run 재분석에는 새 요청 UUID를 사용한다.
- 기본 동시성 4, 활성 run 상한 1,000, 입력 목록 순회 chunk 100. 실운영 Provider 및 자동승격은 OFF다. 이번 migration 검증은 일회용 DB에서 수행했으며 실제 BROS DB 적용은 NOT_RUN이다.

## 개발 환경 시작

요구 버전:

- Node.js 24.x
- pnpm 11.x
- Docker Engine과 `docker compose` CLI

저장소 루트에서 실행한다.

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`check`는 lint, typecheck, unit/integration test, format check, build 순서로 실행한다. `typecheck`는 clean checkout에서도 동작하도록 공통 패키지 7개를 먼저 빌드한다.

개별 명령이 필요하면 다음을 사용한다.

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

## 환경 설정

로컬 실행 전 `.env.example`을 참고해 추적되지 않는 `.env`를 만든다. 앱 실행의 최소 필수값은 `DATABASE_URL`이고 Compose 기동에는 `POSTGRES_PASSWORD`도 필요하다.

DB integration test에는 `TEST_DATABASE_URL`도 필요하다. `.env`의 세 비밀번호와 포트는 같은 개발 PostgreSQL 설정에 맞춘다. `db:migrate`와 test runner는 루트 `.env`를 로드하며 이미 주입된 process 환경값을 우선한다.

- `APP_ENV=development` 또는 `test`: API host/port, Worker concurrency, local storage 경로에 개발 기본값을 적용한다.
- `APP_ENV=production`: `API_HOST`, `API_PORT`, `WORKER_CONCURRENCY`, `STORAGE_DRIVER`를 명시해야 한다. Local storage를 선택하면 `STORAGE_LOCAL_ROOT`도 필수다.
- 설정 오류는 환경변수 이름과 규칙만 출력하며 입력값은 출력하지 않는다.
- 업무 코드는 환경변수를 직접 읽지 않고 `@bros/core`의 typed config를 받는다.

## PostgreSQL 18 개발환경

`.env.example`을 복사해 `.env`를 만들고 placeholder인 `POSTGRES_PASSWORD`와 `DATABASE_URL` 비밀번호를 같은 로컬 개발값으로 바꾼다. 그 뒤 저장소 루트에서 실행한다.

```powershell
pnpm db:up
docker compose ps postgres
docker compose exec -T postgres psql -U bros -d bros -c "SELECT current_setting('server_version'), uuidv7();"
```

`postgres` 상태가 `healthy`이고 서버 버전이 18.x이며 `uuidv7()`이 UUID를 반환해야 한다. PostgreSQL 18 공식 이미지의 named volume `bros_postgres_data`는 `/var/lib/postgresql`에 연결되고 개발 network 이름은 `bros_dev`다.

호스트의 5432 포트를 다른 서비스가 사용 중이면 기존 서비스를 중지하지 말고 `.env`의 포트와 두 DB URL을 함께 바꾼다.

```dotenv
POSTGRES_PORT=55432
DATABASE_URL=postgresql://bros:<local-password>@localhost:55432/bros
TEST_DATABASE_URL=postgresql://bros:<local-password>@localhost:55432/bros
```

로그 확인과 일반 중지는 다음 명령을 사용한다. 일반 종료에 `docker compose down -v`를 사용하면 개발 DB volume이 삭제되므로 실행하지 않는다.

```powershell
pnpm db:logs
pnpm db:stop
```

## DB Migration — P1-05

PostgreSQL이 healthy인 상태에서 다음 명령을 실행한다.

```powershell
pnpm db:migrate
docker compose exec -T postgres psql -U bros -d bros -c "SELECT name FROM bros_migrations.kysely_migration;"
docker compose exec -T postgres psql -U bros -d bros -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'app';"
```

현재 최신 migration 실행 후 `001-baseline`, `002-identifier-compat-index`, `003-resolver-orchestration`, `004-provider-quota` 이력과 업무 테이블 18개가 보여야 한다. 004는 별도 `bros_provider` schema의 인프라 테이블 3개를 추가한다. platform seed는 MUSINSA·OLIVEYOUNG·COUPANG·NAVER 4개다. 재실행은 Kysely 이력을 보고 이미 적용한 migration을 건너뛴다. `pg_trgm` 설치 권한과 app/bros_migrations/bros_provider schema 생성 권한이 있는 migration용 계정을 사용한다. 운영 앱 계정의 최소 권한 구성은 P6 범위다.

전체 컬럼·타입·NULL·기본값·관계 계약은 `docs/DB_MIGRATION_SPEC.md`를 따른다. 다섯 미정 코드 필드의 확장 가능한 저장 정책은 DEC-20260912-010에 기록되어 있다. 이미 적용한 baseline을 수정하지 않고 새 파일을 추가한 뒤 migration provider에 등록한다.

운영 명령에는 down/reset을 제공하지 않는다. down/forward는 테스트가 직접 생성한 disposable DB에서만 검증한다. 운영 복구는 백업 복구 또는 검증한 forward-fix migration으로 처리한다. down은 공유 가능성이 있는 pg_trgm extension이나 migration 이력 schema를 삭제하지 않는다.

## DB Client / Repository — P1-06

API는 `createApiDataAccess`, Worker는 `createWorkerDataAccess`에 검증된 `config.database`를 전달한다. 각 프로세스가 독립 pool을 소유하고 종료 시 `database.close()`를 await한다. close는 중복 호출 가능하며 종료 후 query는 실패한다. 실제 signal 처리와 요청 drain은 P1-07/P1-10 bootstrap에서 연결한다.

| 환경변수 | 기본값 | 허용 범위 |
|---|---|---|
| DB_POOL_MAX | 5 | 1~50 |
| DB_CONNECTION_TIMEOUT_MS | 5000 | 1~300000 |
| DB_IDLE_TIMEOUT_MS | 30000 | 1~300000 |
| DB_STATEMENT_TIMEOUT_MS | 30000 | 1~300000 |

pool 한도는 프로세스별이다. 배포 시 API/Worker 인스턴스 수에 따른 합계에 migration/관리 연결 여유를 더해 PostgreSQL 한도에 맞춘다. connection timeout은 연결 생성 및 pool 대기를 제한하고 statement timeout은 개별 SQL을 제한한다. 전체 업무 transaction 실행 시간 제한이나 자동 재시도를 제공하지 않는다.

`database.transaction(async (tx) => ...)` 안에서는 `createPlatformRepository(tx)`처럼 동일 executor를 모든 repository에 전달한다. 루트 client로 query하면 transaction 밖에서 실행되므로 사용하지 않는다. callback 실패는 rollback하며 자동 재시도하지 않는다. 중첩 transaction은 거절하므로 기존 tx를 전달한다. 격리 수준은 PostgreSQL 기본 READ COMMITTED이며 업무별 CAS/잠금은 후속 service에서 명시한다.

typed schema는 `app.platform`처럼 schema-qualified table을 사용한다. BIGINT/NUMERIC은 string, TIMESTAMPTZ 조회는 Date다. JSON 쓰기는 `JSON.stringify`로 직렬화한 문자열을 전달한다. identity 입력과 public_id 변경은 타입 경계에서 차단하며 외부 응답에는 명시적인 publicId projection만 사용한다. TypeScript 타입이 HTTP 검증이나 인가를 대신하지 않는다.

idle 연결 오류는 `DB_IDLE_CONNECTION_ERROR`와 고정 메시지만 기록한다. query 오류는 호출자에게 전파되므로 후속 API error handler는 원문 SQL/row/DSN을 응답에 노출하지 않아야 한다. 런타임 client를 생성하거나 import해도 migration은 실행되지 않는다.

## API 실행·상태 확인·종료 — P1-07

루트 `.env` 설정과 PostgreSQL 준비 후 `pnpm api:start`로 빌드와 실행을 진행한다. 이미 빌드한 배포 환경에서는 `node --env-file-if-exists=.env apps/api/dist/main.js`를 직접 실행한다. API_HOST/API_PORT를 사용하며 개발 기본 주소는 `127.0.0.1:3000`이다. app import는 listen·signal 등록·migration을 실행하지 않는다.

| 경로 | 성공 | 실패 |
|---|---|---|
| GET /health | 200, `{ "status": "ok" }` | DB를 조회하지 않음 |
| GET /ready | 200, `{ "status": "ready" }` | DB query 실패/시간 초과 시 503 공통 오류 envelope |

상태 응답에는 `Cache-Control: no-store`가 붙는다. readiness는 migration 상태·업무 테이블 정합성까지 검사하지 않는다. DB 연결이 안 되어도 API listen은 가능하며 readiness가 이를 표시한다. `API_READINESS_TIMEOUT_MS` 기본 1000, 허용 1~30000ms다. HTTP probe의 대기 시간을 제한하고 아직 실행 중인 DB probe를 공유하여 대기열 누적을 막는다. HTTP 시간 초과가 SQL을 즉시 취소하지는 않으며 기존 DB 연결/statement timeout이 내부 작업을 제한한다.

`SIGTERM`/`SIGINT`는 새 요청 수락 차단 → 진행 중 HTTP 응답 완료 → DB pool 종료 순으로 처리한다. 종료 중 응답은 `Connection: close`를 사용한다. `API_SHUTDOWN_TIMEOUT_MS` 기본 10000, 허용 1~300000ms 내 완료되면 정상 종료하며 제한 초과 또는 종료 실패는 exit code 1이다. 강제 종료된 작업은 완료된 것으로 취급하지 않는다. 운영 프로세스 관리자의 종료 유예 시간을 이 값보다 길게 설정한다.

Windows에서는 콘솔 Ctrl+C(SIGINT)를 사용한다. Windows의 child.kill(SIGTERM)은 POSIX처럼 graceful signal을 전달하지 않으므로 테스트는 IPC로 등록된 SIGTERM handler를 호출한다. Linux CI에서는 같은 테스트가 실제 SIGTERM을 보낸다. 원격 Linux 실행 증거는 BLK-001 해소 시 확인한다.

오류는 형식/JSON/지원하지 않는 content type 400, 크기 초과 413, 없는 경로 404, 예기치 않은 예외 500, readiness/종료 중 503으로 고정 메시지를 반환한다. 요청마다 서버가 새 requestId를 생성하고 `x-request-id`로 반환하며 외부 입력 requestId를 신뢰하지 않는다. 완료 로그에는 requestId·statusCode·elapsedMs만 남기며 raw URL/body/header/SQL/DB 오류를 기록하지 않는다. 현재 공개 route는 두 probe뿐이며 업무 route의 인증·인가는 후속 구현 범위다.

## QueuePort / pg-boss — P1-09

`@bros/queue`의 `createPgBossQueue(config.database, overrides?)`로 adapter를 만들고 `start()` 후 `publish`/`work`를 호출한다. 종료 시 `stop()`을 await한다. import/생성만으로 DB에 접속하지 않는다. 같은 instance의 start/stop은 중복 호출 가능하며 종료·시작 실패 후에는 새 instance를 만든다. 동일 instance에서 같은 queue의 handler를 중복 등록하면 실패한다.

pg-boss 12.31.0의 자체 migration은 명시적인 `start()`에서 `bros_queue` schema에 실행된다. 최초 시작 계정에는 DB CONNECT 및 schema 생성 권한, 이후에는 pg-boss 객체 사용·migration 권한이 필요하다. `app`과 `bros_migrations` 및 적용된 baseline은 변경하지 않는다. 운영 migration 계정/최소권한 분리는 P6에서 확정한다. 이번 검증은 disposable DB에서 수행했으며 기존 개발 DB에는 아직 bros_queue를 설치하지 않았다.

큐 이름은 `system.test`, `product.import`, `identifier.resolve`, `thumbnail.generate`, `browser.run`이다. payload는 `{publicId: UUIDv7}` 참조만 허용하며 업무 원문·secret은 포함하지 않는다. 반환 `{provider,providerId}`의 ID는 string이다. provider 완료 상태를 업무 성공·감사 이력의 원천으로 사용하지 않는다.

| adapter 옵션 | 기본값 | 허용 범위 |
|---|---|---|
| retryLimit | 2회 재시도(최대 3회 실행) | 0~10 |
| retryDelay | 5초 | 1~3600 |
| retryDelayMax | 300초 | 1~86400, retryDelay 이상 |
| expireInSeconds | 900초 | 1~86400 |
| pollingIntervalSeconds | 1초 | 0.5~60 |
| superviseIntervalSeconds | 30초 | 1~3600 |
| stopTimeoutMs | 10000ms | 1000~300000 |

retry는 pg-boss의 jitter 포함 지수 backoff다. 외부 부작용 보호를 위해 browser.run은 위 옵션과 무관하게 자동 재시도 0회이며 P5에서 검증 후 변경한다. 각 publish에 유효한 옵션을 명시하므로 기존 queue의 생성 시 기본값이 달라도 새 job 설정은 현재 adapter를 따른다. 만료 후 회수는 감시 주기와 retry 지연이 추가로 걸릴 수 있다. 만료는 임의 JS/외부 작업을 강제로 중단하지 못하므로 handler는 전달된 AbortSignal을 준수하고 업무 중복을 방어해야 한다.

동시성 기본값은 instance당 queue별 1개, batch size 1이다. P1-10에서 localConcurrency 옵션(1~100)을 추가했으며 Worker는 WORKER_CONCURRENCY를 전달한다. 다른 instance와의 병렬 처리는 가능하며 전역 업무 멱등성은 별도다. queue 전용 pool의 max/connection timeout은 DatabaseConfig에서 가져오므로 API/Worker DB pool 외 연결 수를 추가 산정한다. DB_IDLE_TIMEOUT_MS/DB_STATEMENT_TIMEOUT_MS는 이 adapter의 provider pool에 적용하지 않는다. 스케줄러는 비활성화하며 P5 schedule reconciliation에서 확장한다.

업무 쓰기가 있으면 반드시 같은 DB의 `db.transaction(async (tx) => { ... await queue.publish(name, {publicId}, queueTransaction(tx)); ... })`로 기록한다. 공식 fromKysely bridge는 루트 DB를 거절하고 transaction executor를 요구한다. 반환 receipt는 outer transaction commit 전에는 잠정 값이다. enqueue 실패를 callback에서 삼켜 업무만 commit하지 않는다. 새 Outbox는 추가하지 않는다. 같은 publicId를 다시 publish하면 다른 provider job이 생성될 수 있으므로 request_key/업무 잠금으로 중복 소비를 제어한다.

stop은 새 publish/등록을 차단하고 수락한 호출 및 진행 중 handler 정리를 기다린다. 제한 시간 초과·handler 잔류 시 reject하므로 소유 프로세스는 정상 종료로 보고하지 말고 종료 절차를 완료해야 한다(P1-10). adapter 자체는 process.exit하지 않으며 지연된 정리 작업은 계속될 수 있다. 완료 job 보관은 1일, 대기/retry 보관은 14일이고 실제 삭제는 pg-boss maintenance 시점에 따른다. 업무 보존 정책은 업무 테이블에 적용한다.

handler 원문 예외는 provider에 넘기기 전에 고정 오류로 바꾸고 반환값은 저장하지 않는다. provider error/warning 로그도 고정 코드·메시지만 기록한다. 실패 원인 분류 및 업무 상태 기록은 후속 service의 책임이다.

## Worker / system.test — P1-10

루트 `.env` 설정 및 `pnpm db:up`, `pnpm db:migrate` 이후 두 터미널에서 다음 명령을 사용한다. 각 명령은 먼저 빌드한다.

```powershell
pnpm worker:start
pnpm worker:test
```

빌드가 준비되어 있으면 각각 `node --env-file-if-exists=.env apps/worker/dist/main.js`, `node --env-file-if-exists=.env apps/worker/dist/send-system-test.js`로 실행한다. Worker가 꺼져 있어도 접수 가능하며 재시작하면 소비한다. 접수 CLI는 매번 새로운 요청 키를 생성하므로 매 실행이 새 logical test다. 라이브러리 enqueueSystemTest에 같은 requestKey를 전달하면 같은 receipt를 반환한다.

Worker는 baseline 확인 → queue start → 등록된 handler 연결 → WORKER_READY 순서로 시작한다. 현재 registry는 system.test 하나다. DB와 초기화 상태를 조회하는 isReady 함수는 제공하지만 별도 HTTP 포트를 열지 않는다. Browser 스케줄 reconciliation·정기 heartbeat 등 P5/P6 준비 상태는 아직 포함하지 않는다. 다른 큐의 업무 handler를 임의로 성공 처리하지 않는다.

system.test는 automation_job의 예약 job_code/handler_key `system.test`, job_type INTERNAL을 사용한다. 최초 접수 시 enabled=false(정기 실행 없음), allow_manual_run=true, allow_parallel=true, cooldown=0, timeout=900초, max_retries=2인 정의를 만든다. 기존 정의가 여러 개거나 타입/handler/수동·병렬·cooldown 계약이 다르면 덮어쓰지 않고 거절한다. job_code는 baseline에서 UNIQUE가 아니므로 정의 생성과 중복 접수는 전용 transaction advisory lock `(0x42524f53,110)` 및 정의 row lock으로 직렬화한다. 다른 업무의 job_code 정책은 변경하지 않는다.

automation_run 생성과 enqueue 및 provider ID 저장은 같은 transaction이다. publicId는 run을 참조한다. 실행은 provider ID/정의/상태/attempt를 검증하고 RUNNING을 먼저 commit한다. 실제 동작은 platform count 조회이며 성공 시 SUCCESS, result_json.platformCount(string), 시작/종료 시각 및 SYSTEM_TEST_SUCCESS 로그를 남긴다. 일시 실패는 RETRY_WAIT, 마지막 시도 실패는 FAILED다. 마지막 시도 판정은 실제 queue job의 retryLimit을 사용한다.

성공 row의 같은 provider 재전달은 작업을 다시 수행하지 않는다. 결과 갱신은 provider ID·RUNNING 상태·attempt_no를 조건으로 하여 이전 시도가 최신 결과를 덮어쓰지 못하게 한다. 원문 오류는 업무 error_message나 로그에 저장하지 않는다. Worker crash로 남은 RUNNING은 큐 만료/재시도 후 더 높은 attempt가 이어받는다. 이 경로는 내부 읽기 smoke 전용이며 Browser 외부 클릭 복구·실행 취소·일반 automation 정책의 구현을 의미하지 않는다.

SIGTERM/SIGINT 처리 시 readiness를 해제하고 queue를 drain한 뒤 업무 DB pool을 닫는다. WORKER_SHUTDOWN_TIMEOUT_MS는 기본 15000ms, 허용 1000~300000ms다. 종료 성공은 WORKER_STOPPED/exit 0, deadline 또는 queue 정리 실패는 고정 오류 로그/exit 1이다. queue 정리가 실패한 상태에서 DB를 먼저 닫지 않는다. 라이브러리 createWorker.stop의 실패 처리는 소유 프로세스 책임이며 production bootstrap이 종료를 수행한다. Windows SIGTERM 검증 제한은 API 절차와 동일하다.

실행 결과는 다음 조회로 확인한다. queue 내부 completed는 업무 이력의 대체물이 아니다.

```sql
SELECT r.public_id, r.status, r.attempt_no, r.result_json, r.error_code
FROM app.automation_run r
JOIN app.automation_job j ON j.id = r.automation_job_id
WHERE j.job_code = 'system.test'
ORDER BY r.created_at DESC LIMIT 10;
```

## 공통 API 계약

- 외부 리소스 ID는 UUIDv7 `publicId`만 사용한다. 내부 BIGINT ID를 요청·응답에 넣지 않는다.
- 비동기 작업 접수 응답은 HTTP 202와 `{publicId,status,statusUrl}`을 사용하며 접수 시 상태는 `QUEUED`다.
- 오류 본문은 `{error:{code,message,requestId,details?}}`를 사용한다.
- 오류 `details`에는 계약이 허용한 검증 issue, 버전 숫자, 재시도 초만 넣는다.
- 목록 limit 기본값은 50, 최대값은 100이다.

## Admin 개발 서버 — P1-11

API를 `127.0.0.1:3000`에서 실행한 뒤 별도 터미널에서 다음 명령으로 Admin을 시작한다.

```powershell
pnpm admin:dev
```

브라우저에서 `http://127.0.0.1:5173/`에 접속한다. Dashboard는 same-origin `/health`를 요청하고 Vite 개발 프록시가 API로 전달한다. API가 정상 응답하면 `정상 운영 중`, 연결 실패·비정상 HTTP·계약 불일치이면 안전한 오류와 `다시 확인` 버튼을 표시한다.

API 포트를 로컬에서 바꾼 경우 Admin 시작 전에 `VITE_API_PROXY_TARGET`을 전체 origin으로 지정한다. 이 값은 개발 프록시에만 적용하며 프로덕션 빌드는 `/health` same-origin 경계를 유지한다.

```powershell
$env:VITE_API_PROXY_TARGET='http://127.0.0.1:3100'
pnpm admin:dev
```

프로덕션 정적 산출물은 `pnpm --filter @bros/admin build`의 `apps/admin/dist`에 생성된다. 실제 배포에서는 Admin origin의 `/health`와 `/api`를 API로 라우팅해야 한다. 배포 reverse proxy와 인증 경계는 후속 운영·인증 단계에서 확정한다.

## Local ObjectStorage — P1-12

`createObjectStorage(config.storage)`는 `STORAGE_DRIVER=local`일 때 `STORAGE_LOCAL_ROOT` 아래에 저장하는 `ObjectStorage`를 반환한다. 기본 개발 설정은 논리 bucket `local`, 실제 root `./storage`다. DB에는 반환된 `provider=LOCAL`, `bucket=local`, `objectKey`만 기록하고 절대 경로는 기록하지 않는다. `r2`는 P6-04 구현 전까지 `UNSUPPORTED_STORAGE_DRIVER`로 명시적으로 실패한다.

Object key는 `/`로 구분된 상대 ASCII 경로다. 전체 1~1024자, segment당 1~128자이며 영문자·숫자로 시작하고 끝나야 한다. 내부에는 영문자·숫자·점·밑줄·하이픈만 허용한다. 빈 segment, `.`/`..`, 역슬래시, 절대경로, percent/colon/control 문자와 Windows 예약명은 거절한다. source 원본 파일명이나 secret을 key에 사용하지 말고 public ID, content hash, revision과 고정된 artifact 이름으로 `buildObjectKey(...)`를 구성한다.

`putObject`는 대상 디렉터리 안의 임시 파일에 쓴 뒤 sync와 rename을 수행한다. 쓰기 실패 시 임시 파일을 지우고 기존 target을 보존한다. 같은 key 쓰기는 마지막으로 성공한 원자적 교체가 반영되므로, 업무 계층은 immutable key와 DB UNIQUE/잠금으로 중복 생성을 제어한다. `deleteObject`는 없는 key에도 성공한다. Local root는 BROS 프로세스만 쓸 수 있는 전용 디렉터리로 운영해야 하며 adapter는 root와 하위 경로의 symlink/junction을 거절한다.

`getSignedUrl(key, 1..86400)`은 절대 경로가 없는 `bros-local://local/...` HMAC URL을 반환한다. 브라우저가 직접 여는 URL은 아니며 같은 `LocalObjectStorage` instance의 `getObjectBySignedUrl`로 변조·만료를 검증한 뒤 API preview route가 스트림으로 전달해야 한다. 서명 key는 adapter instance에서 임시 생성되므로 프로세스 재시작 후 기존 Local URL은 무효다. 장기 유지되는 preview URL이나 HTTP route는 P5/P6에서 SecretProvider·인증과 함께 구현한다.

로컬 저장소 전용 검증:

```powershell
pnpm --filter @bros/storage run build
node --test packages/storage/test/storage.test.mjs
```

## Secret과 로그

- 외부 provider와 browser 자격증명은 `SecretProvider`를 통해 조회한다.
- 개발용 환경변수는 `BROS_SECRET_` prefix를 사용한다. 예: `provider.image.apiKey` → `BROS_SECRET_PROVIDER_IMAGE_API_KEY`.
- browser profile key는 소문자로 시작하는 영숫자 1~32자로 제한한다.
- 실제 secret은 `.env.example`, fixture, 로그, 오류 응답에 넣지 않는다.
- API와 Worker logger는 `createRedactedLogger`로 생성한다. 임의 Pino instance를 만들지 않는다.
- secret 누락 오류에는 secret key만 포함하고 값은 포함하지 않는다.

## 테스트와 CI

로컬 전체 검증:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

- unit test 파일은 `apps/**` 또는 `packages/**` 아래의 `*.test.mjs`를 사용한다.
- integration test 파일은 `tests/integration/**/*.integration.test.mjs`를 사용한다.
- DB test는 `TEST_DATABASE_URL`로 연결하여 매 실행마다 고유 `bros_test_<UUID>` DB를 `template0`에서 생성한다. 지정한 연결 대상 DB의 schema/data는 수정하지 않는다. CREATEDB 권한이 필요하며, 성공적으로 생성한 DB만 종료 시 삭제한다.
- `TEST_DATABASE_URL` 누락·접속 실패는 테스트 실패다. DB test를 자동 skip하지 않는다. 브라우저나 외부 provider 자격증명은 필요 없다.
- 비정상 프로세스 강제 종료로 `bros_test_` DB가 남을 수 있다. 진행 중인 테스트가 없는지와 실제 생성 주체를 확인한 후 해당 DB만 명시적으로 정리한다. 접두어만 보고 일괄 삭제하지 않는다.
- CI는 로컬 Compose와 같은 digest의 PostgreSQL 18.6 service가 healthy가 된 뒤 같은 명령 순서를 실행한다.
- GitHub repository는 `https://github.com/hyunglory/bros`이며 기본 브랜치는 `main`이다. repository ruleset `main required quality`(ID 23149676)가 `install / lint / typecheck / test / build`를 strict required check로 적용하고 bypass actor는 두지 않는다. ruleset이나 check 이름을 변경하면 정상 PR 성공과 실패 PR `mergeStateStatus=BLOCKED`를 다시 검증한다.

운영 절차는 해당 WBS Task가 구현되고 검증될 때 추가한다.

## Product Import Worker — P2-13

P2-04 validation으로 저장한 batch UUID를 접수하고 별도 터미널에서 Worker를 실행한다. 접수 CLI는 `IMPORT_MAX_QUEUED_BATCHES` 설정을 적용한다. XLSX 파일 업로드·새 batch 생성 API/UI는 P2-14 범위다.

```powershell
pnpm worker:import <batch-public-uuid>
pnpm worker:start
```

| 설정 | 기본값 | 범위/의미 |
|---|---|---|
| IMPORT_CHUNK_SIZE | 100 | 1~1000, 한 번에 읽는 item UUID/행 번호 수 |
| IMPORT_CONCURRENCY | 2 | 1~16, Worker 한 프로세스의 동시에 처리하는 item 수 |
| IMPORT_MAX_QUEUED_BATCHES | 32 | 1~1000, DB 전체의 접수·실행·재시도 대기 batch 상한 |
| DB_POOL_MAX | 5 | Import Worker는 최소 2; 잠금 전용 연결 1개 + stage 처리 연결 사용 |

`WORKER_CONCURRENCY`는 기존 queue 기본값이다. `product.import`는 프로세스당 batch 1개로 제한하고 item 수는 `IMPORT_CONCURRENCY`로 조절한다. 여러 Worker 프로세스를 켜면 서로 다른 batch를 나눠 처리한다. 같은 batch는 DB advisory lock으로 한 프로세스만 처리하며 브라우저 동시성 정책에 영향을 주지 않는다.

`import_batch.config_json.importQueue`의 status, attempt, progress.phase/chunks/visitedCount, checkpointAt, errorCode를 확인한다. 정상 로그는 `IMPORT_CHUNK_COMPLETED`/`IMPORT_PROCESSING_COMPLETED`, 실패는 `IMPORT_PROCESSING_FAILED`다. 진행 건수는 현재 시도의 방문 건수이고 실제 상품 결과는 `success_count/failed_count/skipped_count/review_count` 및 `config_json.pipelineTracking`을 조회한다. 처리 종료 `importQueue.status=SUCCESS`에도 개별 입력 실패가 있으면 batch 업무 상태는 `PARTIAL_FAILED` 또는 `FAILED`일 수 있다.

같은 UUID를 일반 접수하면 기존 receipt가 반환된다. Worker가 죽으면 pg-boss expiry와 남은 retry에 따라 자동 재전달되며 source/MASTER/SKU/image/item 결과를 재사용한다. 마지막 시도에서 죽거나 DB 장애가 겹치면 `importQueue`가 RUNNING/RETRY_WAIT에 남을 수 있다. Worker/DB 상태와 checkpoint 정지를 확인하고 다음 명령으로 복구한다.

```powershell
pnpm worker:import <batch-public-uuid> --resume
```

`--resume`은 새 receipt로 기존 작업을 차단하고 미완료 항목만 재개한다. 이미 SUCCESS인 batch는 일반 replay다. 이미 P2-12에서 확정한 FAILED item은 과거 결과를 유지하므로, 해당 상품을 다시 검증하려면 새 batch를 만든다. 취소·빈 batch는 접수 불가다. 접수 상한에 도달하면 생산자가 대기/재요청해야 하며 CLI는 실패 종료한다. 별도 자동 재조정 daemon은 아직 없다.

정상 종료는 활성 batch drain을 기다린다. 긴 batch가 종료 deadline을 넘으면 기존 P1-10 규칙대로 소유 프로세스를 종료하고 재전달로 복구한다. 잠금 연결 손실·DB 장애에서는 현재 진행 중인 stage가 commit됐을 수 있으며 재시도는 저장된 stage 결과를 기준으로 수행한다. 네트워크 fetch나 이미지 binary 저장은 이 Worker에 포함하지 않는다.

## Import 관리 UI/API — P2-14

업무 API는 기본적으로 비활성화되어 있다. 로컬 개발에서만 `.env`의 API host를 loopback으로 유지하고 다음 설정을 명시한다. production 또는 non-loopback host와 함께 사용하면 config validation이 실패한다.

```dotenv
API_HOST=127.0.0.1
API_LOCAL_UNAUTHENTICATED=true
```

PostgreSQL migration 후 API, Worker, Admin을 각각 시작하고 `http://127.0.0.1:5173/imports`에서 확인한다. API readiness는 이 모드에서 DB와 Queue producer가 모두 시작된 뒤에만 성공한다.

| Method / path | 용도 |
|---|---|
| `GET /api/v1/import-batches?status=&limit=&cursor=` | 최신 Batch 목록, 업무 상태/건수와 처리 상태 |
| `GET /api/v1/import-batches/:publicId?itemStatus=&itemLimit=&itemCursor=` | Batch 상세와 상품별 결과/오류 원인 |
| `POST /api/v1/import-batches/:publicId/retry` | 기존 접수 replay 또는 미완료 처리 resume |

retry는 `Content-Type: application/json`, `X-BROS-Operation: import-retry`와 `{ "mode": "replay" }` 또는 `{ "mode": "resume" }`를 요구한다. 새 접수는 202/QUEUED, 기존 receipt 재생은 200과 현재 processing status다. 접수 상한은 429 `IMPORT_BACKPRESSURE`와 `retryAfterSeconds`를 반환한다. 완료 item과 업무 실패 이력은 resume으로 초기화되지 않는다.

Admin에서 업무 상태는 실제 item 집계, Worker 처리는 Queue 실행 상태다. Worker 완료와 상품 전건 성공을 같은 의미로 읽지 않는다. raw row, Queue receipt와 내부 DB ID는 화면/API에 노출하지 않는다.

현재 설정은 loopback 개발용 임시 인증 fence다. Caddy Basic Auth, 인증 actor 덮어쓰기, same-origin/CSRF 검증, 외부 API 포트 차단과 401 UX는 P6-01에서 완료해야 하며 그 전에는 업무 API를 외부 주소에 배포하지 않는다. XLSX 업로드와 새 batch 생성 endpoint도 아직 없으므로 P2-04 계약을 호출하는 내부/테스트 흐름에서 생성된 batch만 관리한다.

## MASTER 상품관리 API/UI — P2-15

P2-14와 같은 loopback 개발 설정에서 API와 Admin을 시작하고 `http://127.0.0.1:5173/products`로 접근한다. 목록은 생성시각과 공개 UUID 기반 cursor를 사용하며 임의 정렬은 받지 않는다.

| Method / path | 용도 |
|---|---|
| `GET /api/v1/products?query=&brand=&source=&status=&identifierStatus=&limit=&cursor=` | 상품명/품번 검색, 브랜드·Source·상태 filter와 최신 MASTER 목록 |
| `GET /api/v1/products/:publicId` | MASTER와 Brand/SKU/Identifier/Source/Source SKU/원본 이미지 관계 상세 |
| `PATCH /api/v1/products/:publicId` | 상품명·카테고리·상품 유형·MASTER 상태의 낙관적 잠금 수정 |

PATCH는 `Content-Type: application/json`, `X-BROS-Operation: product-update`, 현재 응답의 `expectedVersion`, 공백이 아닌 `changeReason`과 최소 한 개의 수정 필드를 요구한다. 허용 필드는 `productName`, `categoryKey`, `productType`, `status`뿐이다. 성공하면 version이 1 증가하며 다른 요청이 먼저 저장했으면 409 `PRODUCT_VERSION_CONFLICT`와 expected/actual version을 반환한다. 같은 값만 보낸 요청은 이력을 만들거나 version을 올리지 않는다.

변경 이력은 기존 `product_master.metadata_json`을 보존하면서 `managementChanges`에 시각, local actor source, 변경 사유, 필드별 이전값·이후값을 추가한다. 현재 actor source는 loopback 개발 fence를 뜻한다. P6-01 적용 시 proxy가 보증하는 사용자 actor로 확장해야 한다.

API와 화면에는 BIGINT PK, MASTER metadata, Source raw, Identifier evidence, storage bucket/object key가 나오지 않는다. Source 이미지는 자동 inline fetch 대신 원본 링크를 눌렀을 때만 연다. 브랜드 연결 변경과 Identifier 값/검증 상태 변경은 이 화면에서 하지 않으며 각각 P2-16과 Phase 3 검수 흐름을 사용한다.

## 미해결 브랜드 검수 — P2-16

P2-14와 같은 loopback 개발 설정에서 `http://127.0.0.1:5173/brand-reviews`로 접근한다. 기본 화면은 미결 건만 보여주며 상품·원본 브랜드와 플랫폼으로 검색할 수 있다.

| Method / path | 용도 |
|---|---|
| `GET /api/v1/brand-reviews?decision=&platform=&query=&limit=&cursor=` | unresolved brand 검수 목록과 결정 상태 조회 |
| `GET /api/v1/brands?query=&limit=` | 연결할 active 표준 BRAND 검색 |
| `POST /api/v1/brand-reviews/:publicId/approve` | alias 승인과 1건 재처리 batch의 원자적 Queue 접수 |
| `POST /api/v1/brand-reviews/:publicId/reject` | alias 없이 거절 결정 기록 |

승인은 `Content-Type: application/json`, `X-BROS-Operation: brand-review-approve`와 `{ expectedVersion, brandPublicId, scope, changeReason }`를 요구한다. scope는 현재 플랫폼만 적용하는 `PLATFORM`이 기본이며, 여러 플랫폼에서 같은 표기와 같은 BRAND임을 확인한 경우에만 `GLOBAL`을 선택한다. 거절은 `X-BROS-Operation: brand-review-reject`와 `{ expectedVersion, changeReason }`를 사용한다.

409는 다른 운영자가 먼저 결정했거나 같은 scope의 alias가 다른 BRAND에 이미 연결됐거나 platform/BRAND가 비활성 상태임을 뜻한다. 목록을 새로고침해 현재 결정을 확인한다. 429는 Import Queue 접수 상한이므로 실행 중 batch가 끝난 뒤 다시 승인한다. 503에서는 alias가 부분 저장되지 않으며 Queue/DB readiness를 복구한 뒤 같은 version으로 재시도한다.

승인 성공 응답의 `reprocessBatchPublicId`를 Import 관리 화면에서 조회한다. 원본 item은 `REVIEW_REQUIRED` 이력으로 남고 새 batch가 Source→MASTER→SKU→Image→Tracking 단계를 수행한다. 이미 다른 MASTER와 연결된 Source는 자동 교체되지 않고 재처리 결과가 다시 검수로 남을 수 있다. 거절은 재처리를 만들지 않는다.

현재 결정 actor는 `LOCAL_ADMIN`이며 사용자 신원을 뜻하지 않는다. 이 화면과 API도 P6-01의 Caddy 인증·Origin/CSRF·보증 actor가 적용되기 전에는 외부 주소에 배포하지 않는다.

## 실제 XLSX 재import 검증 — Phase 2 Gate

[Phase 2 Gate 보고서](PHASE2_GATE.md)의 재현 절차를 사용한다. `scripts/verify-phase2-sample.mjs`는 기존 대표 20행을 새 임시 DB에서 실제 Queue/Worker로 5회 처리하고 raw·Source/이미지 UUID·이력·집계·검수 API를 비교한다. 전체 XLSX의 영속화나 MASTER/SKU 양성 관계를 검증하는 스크립트로 해석하지 않는다.

사전 조건은 build 완료, 로컬 원본 XLSX, CREATEDB 가능한 일회용 `TEST_DATABASE_URL`이다. 출력은 집계/SHA/표본 locator로 제한하며 XLSX를 공개 CI fixture에 추가하지 않는다. 실행 완료 후 이 작업 전용 컨테이너만 종료한다. 서로 다른 batch의 검수 이력 증가는 정상이며 동일 Source/이미지의 중복 생성 여부와 구분한다. Phase 2 Gate current revision의 Linux CI 결과는 `PHASE2_GATE.md`와 DEC-20260914-017을 따른다.

## Resolve Input / Run Model — P3-01

`@bros/resolver`의 `createResolveRunService(database)`는 내부 orchestration 기반이다. API·Worker Queue·UI 연결은 후속 Task에서 추가한다.

1. `create({ sourceProductPublicId, resolverVersion })`로 새 QUEUED 실행을 만든다. 같은 Source에도 매번 새 run UUID를 발급하며 재요청 멱등성 키는 아직 제공하지 않는다.
2. `start(runPublicId)`가 RUNNING으로 바꾸고 저장된 `input`과 `resolverVersion`을 반환한다. Source를 재조회해 입력을 교체하지 않는다.
3. `succeed(runPublicId, candidates)`는 후보와 SUCCEEDED를 함께 저장한다. 빈 배열이면 `NOT_FOUND` 정상 결과다. 후보의 type/norm은 미리 정규화한 값을 전달하며 자동승인하지 않는다.
4. 실행 실패는 `fail(runPublicId, code)`로 기록한다. 허용 code는 `INVALID_SOURCE_DATA`, `EXTERNAL_SEARCH_FAILED`, `RATE_LIMIT`, `TIMEOUT`, `RESOLVER_FAILED`이며 메시지는 고정된다. 예외 원문/인증정보/Provider 응답을 전달하지 않는다.
5. `cancel(runPublicId)`는 QUEUED/RUNNING에서만 가능하다. terminal 실행은 재시작·수정하지 않고 새 run을 만든다. `get(runPublicId)`로 이력과 입력·후보를 조회한다.

입력 `schemaVersion=1`에는 공개 Source/연결 MASTER UUID, Source명·브랜드·URL·수집 시각·raw와 선택적 `import` provenance가 있다. Import의 explicit identifiers/options/images를 놓치지 않도록 현재 Source와 수집 시각·raw·identity가 맞는 mapped input을 고정한다. 직접 등록 Source 또는 일치하는 envelope가 없는 경우 `import=null`이며 raw만 사용한다. 기존 이력을 소급 수정하지 않는다. Provider 설정·Pattern/Scorer 버전은 후속 구현에서 resolverVersion 또는 별도 versioned 입력 계약으로 명시해야 한다.

후보는 type/value/norm, nullable decimal score, rank, evidence/conflicts를 보존하며 `CANDIDATE`, version 1로 시작한다. 정규화·Evidence 평가·Hard Gate·수동 승인 및 MASTER/identifier 쓰기는 아직 없다. 이 내부 조회는 raw를 포함하므로 공개 API 응답에 그대로 연결하지 않는다. 문법/JSON/secret/URL 검증은 저장 전에 실행하며 raw JSON 최대 깊이 32, 전체 방문 항목 100,000, JSON 직렬화 길이 8,000,000 문자와 후보 최대 1,000개를 허용한다. 초과 입력을 잘라 저장하지 않는다.

DB 작업 중 실패하면 트랜잭션이 rollback되어 RUNNING이 남을 수 있다. 호출자는 진단을 분류해 fail하거나 후속 Queue 정책에 따라 처리한다. 자동 retry/lease/crash recovery는 P3-01의 범위가 아니다. `RESOLVE_RUN_STATE_CONFLICT`는 다른 실행자가 먼저 시작/종료한 경우이므로 현재 상태를 조회한다. 후보 저장 실패 후 같은 run의 완료 작업은 RUNNING이 유지된 경우에만 가능하다.

전용 검증: 패키지 build 후 `node --test packages/contracts/test/identifier-resolve.test.mjs`, 일회용 PostgreSQL의 `TEST_DATABASE_URL`로 `node --test tests/integration/identifier-resolve.integration.test.mjs`. 전체 검증은 `pnpm check`를 사용한다. 실제 상품 XLSX나 외부 Provider 호출은 필요하지 않다.

## Brand Pattern Registry — P3-02

`createIdentifierPatternRegistry({ version, patterns })`는 배포 설정을 immutable registry snapshot으로 compile한다. pattern은 고유 대문자 ID, canonical brand key, `RAW`/`URL`/`TITLE`/`OPTION` source, 대상 identifier type, 정확히 하나의 `(?<identifier>...)` capture regex를 가진다. 실제 브랜드 규칙은 별도 승인·근거가 있을 때만 추가한다.

`registry.match(brandKey, source, text)`는 해당 brand와 source의 첫 match를 pattern 순서로 반환한다. 각 결과에는 candidate value/type, registry version, pattern ID, source, 전체 match의 start/end 위치만 있다. 이것은 후보 생성 근거 metadata이며 `CANDIDATE` row·score·evidence·결정을 직접 만들지 않는다. P3-03은 저장된 Resolve Input의 raw/URL/title/option 값을 source별로 전달하고 결과에 발견 위치·원문 근거를 붙인다.

등록은 고정 `u` regex mode를 사용하며 backreference, lookaround, 추가 named capture, 중첩 또는 alternation quantifier를 거부한다. 입력은 16,384자를 넘으면 regex를 실행하지 않고 빈 결과를 돌려준다. 설정을 수정하려면 새 registry version을 만들고 기존 실행 snapshot에 적용한 version을 소급 변경하지 않는다. P3-02는 DB 저장, runtime reload, Provider 호출, 자동승인을 다루지 않는다.

## Raw / URL / Text Extractors — P3-03

`createIdentifierExtractor(registry).extract({ brandKey, input })`는 P3-01 snapshot을 먼저 재검증한 뒤 P3-02 registry를 실행한다. `brandKey`는 P2-05 등의 확인된 canonical 값이어야 한다. null 또는 registry에 없는 key는 빈 후보 결과이며 raw brand name을 정규화하거나 추정하지 않는다.

추출 순서는 title, product URL의 path와 query value, raw JSON leaf, Import provenance option name이다. raw object key는 사전순, array는 원래 순서를 사용한다. 각 후보의 evidence는 source와 locator(`/raw/...`, `/productUrl/$url/path`, `/.../query/<index>/<key>`, option pointer), whole-regex matched text/offset, pattern ID/version을 보존한다. matched text는 bounded source surface에서 파생하며 raw 전체, URL authority, query 전체를 반환하지 않는다.

입력은 P3-01 contract를 통과해야 한다. secret field·sensitive query·잘못된 URL/JSON은 extractor를 시작하기 전에 `INVALID_RESOLVE_INPUT`으로 실패한다. raw depth 16/node 5,000, surface 1,000, candidate 200, surface text 16,384의 경계를 넘으면 결과의 `truncated`가 true다. 결과가 truncated이면 후속 흐름은 결과를 완전 탐색으로 해석하거나 자동확정하지 않는다.

P3-03은 후보의 type/value/provenance만 생성한다. CandidateNormalizer/Deduplicator, EvidenceCollector, candidate row persistence와 resolve run 완료, Provider, score/hard conflict/decision은 이 단계에 연결하지 않는다. 전용 검증은 `node --test packages/resolver/test/identifier-extractor.test.mjs`, 전체 회귀는 `pnpm check`다.

## Internal Catalog Provider — P3-04

`createInternalCatalogProvider(database).search(query)`는 external Provider보다 앞서 existing verified Catalog를 read-only로 조회한다. `IDENTIFIER` query는 `{ identifierType, identifierNorm }`의 exact match만 받으며 caller는 P3-07 등에서 type-specific norm을 이미 만들었어야 한다. Provider가 trim/case/punctuation을 추측하지 않는다.

`BRAND_NAME_VARIANT` query는 canonical `brandKey`, exact `productNameNorm`, 선택적 exact `optionKey`를 받는다. option key가 없으면 같은 brand/name의 MASTER가 여러 개일 수 있어 `AMBIGUOUS`가 정상이다. option key가 있으면 active SKU까지 exact match한다. verified catalog의 기준은 active BRAND, active MASTER, MASTER `identifier_status=VERIFIED`; identifier query에는 추가로 identifier `is_verified=true`가 필요하다.

반환은 `EXACT`, `AMBIGUOUS`, `MISS`와 public MASTER/SKU ID, 브랜드 key, 상품명, identifier query의 matched identifier, `truncated`다. 동일 MASTER의 여러 SKU identifier row는 하나의 MASTER match로 묶는다. provider는 DB row·resolve run·candidate·MASTER를 수정하지 않으며 auto accept나 score를 만들지 않는다. 최대 50 MASTER를 넘는 결과는 `truncated=true`이며 후속 흐름은 이를 완전한 후보 목록으로 해석하지 않는다.

전용 검증은 일회용 PostgreSQL의 `TEST_DATABASE_URL`로 `node --test tests/integration/internal-catalog-provider.integration.test.mjs`를 사용한다. 전체 parallel integration은 100ms DB timeout 검증과 장시간 1k Import가 겹치면 환경 부하로 flaky할 수 있다. 이 경우 timeout 또는 코드를 변경하지 말고 품질 명령을 분리 실행하고 `node --test --test-concurrency=1`으로 전체 integration을 순차 재검증한다.

## External Candidate Provider — P3-05

BLK-005 로컬 보완(DEC-20260915-029): [PROVIDER_QUOTA.md](PROVIDER_QUOTA.md)의 PostgreSQL 공유 예산/전역 간격 adapter를 구현·합성 검증했다. 사용 전 대상 DB migration 004와 동일 과금 계정/정책 주입이 필요하다. 실제 BROS DB에는 미적용이며 기본 Worker live 연결도 OFF다. ACTIVE는 자동 만료하지 않으므로 중단 시 inspect로 owner를 확인하고 실제 종료가 확인된 reservation만 감사 사유와 함께 recoverAbandoned로 복구한다. 비용 누계는 유지한다.

`createBraveSearchProvider({ registry })`는 기본 disabled다. 사용 조건·설정·공유 예산 포트 계약은 [EXTERNAL_PROVIDER_BRAVE.md](EXTERNAL_PROVIDER_BRAVE.md)를 따른다. `mode=fixture`는 주입 transport로만 실행하며 실제 운영 호출을 대신한 PASS 증거가 아니다.

live는 계약/저장 권한 승인, SecretProvider, timeout/rate/circuit 및 요청/일일 비용 설정, 운영 공유 예산 구현이 필수다. 메모리 fixture budget은 live에서 차단한다. 현재 BLK-005가 열려 있으며 환경변수 자동 설정이나 Worker 등록은 연결되지 않았다.

결과는 CANDIDATES/NOT_FOUND 또는 ERROR+고정 code다. 장애를 NOT_FOUND로 바꾸지 않는다. SEARCH_RESULT/WEAK 근거와 truncated를 보존하고 자동확정하지 않는다. circuit open/cooldown 동안 반복 호출하거나 Provider를 매 요청 새로 생성하지 않는다. 실제 API 장애 원문이나 키를 로그하지 않는다.

패키지 빌드 후 전용 검증: `node --test packages/resolver/test/external-candidate-provider.test.mjs tests/integration/external-candidate-provider.integration.test.mjs`. 단위 테스트는 합성 transport, 통합 테스트는 loopback HTTP의 native fetch를 사용한다. 실제 Provider 키와 인터넷 API 호출은 필요하지 않다.

## Evidence Model / Collector — P3-06

`@bros/contracts`의 `IdentifierEvidence`는 schema version, identifier type, evidence type/source, strength, 0~100 source weight와 provenance만 보존한다. 현재 type은 SOURCE_FIELD/TITLE_MATCH/URL_MATCH/OPTION_MATCH, VERIFIED_INTERNAL_IDENTIFIER, EXTERNAL_CATALOG이다. strength는 WEAK 또는 VERIFIED다. weight는 P3-08 scoring 이전의 deterministic source hint이며 점수·rank·승인 규칙이 아니다.

`createEvidenceCollector().collect({ input, extracted, internalCatalogResults, externalResults })`는 P3-01 snapshot과 P3-03/04/05 결과를 받는다. 동일한 `identifierType`과 원문 `candidateValue`만 묶고, evidence는 canonical order로 immutable 배열에 유지한다. 표기 보정, candidateNorm, 서로 다른 값 merge, confidence/rank/conflict/decision, resolve run write는 하지 않는다.

P3-04 identifier query의 verified match는 VERIFIED_INTERNAL_IDENTIFIER candidate evidence가 된다. P3-04 brand/name/variant 결과는 식별자를 추측하지 않고 `internalCatalogReferences`에 public product ID·outcome·truncation으로 남긴다. P3-05 ERROR는 `providerFailures`로 남고 evidence/NOT_FOUND로 변환되지 않는다. 모든 upstream truncation은 collection의 `truncated`로 전파된다.

provenance는 source extractor의 locator/match/pattern version/capturedAt, external의 provider/safe URL/rank/retrievedAt, internal의 public product/SKU ID와 query locator를 보존한다. secret-like text·credential/signed URL·malformed metadata는 collector 전체 오류로 격리하며 partial result를 반환하지 않는다. Candidate store에 연결할 때는 P3-07이 만든 norm/rank와 함께 `evidence_json` 배열에 넣고 `validateResolveCandidates`를 다시 통과시킨다.

전용 검증은 `node --test packages/contracts/test/identifier-evidence.test.mjs packages/resolver/test/evidence-collector.test.mjs`다. 실제 Provider 호출, raw 응답 보존, DB write, auto accept는 이 단계에 없다.

## Candidate Normalizer / Deduplicator — P3-07

`createCandidateNormalizer().normalize(collection)`은 P3-06 EvidenceCollection을 받아 `identifier-normalizer/v1`의 `candidateNorm`을 만든다. type+norm이 같을 때만 하나의 후보로 합치고 모든 source candidate value와 Evidence provenance를 canonical order로 남긴다. display `candidateValue`는 input 순서가 아니라 code-unit lexical 최소 원문값이다.

| Identifier type | v1 normalization |
|---|---|
| MODEL_NO, STYLE_CODE, PRODUCT_NO, MPN | NFKC, trim, en-US uppercase 후 공백·underscore·ASCII/Unicode hyphen 제거 |
| GTIN | 위 separator 제거 후 ASCII 숫자 8·12·13·14자리만 허용 |
| EAN | 위 separator 제거 후 ASCII 숫자 8·13자리만 허용 |
| UPC | 위 separator 제거 후 ASCII 숫자 12자리만 허용 |
| BARCODE | NFKC, trim, en-US uppercase만 적용. issuer-specific non-numeric 형식을 보존 |
| BRAND_CODE | NFKC, trim, en-US uppercase만 적용. 내부 separator를 보존 |

슬래시·점 등 이 표에 없는 구두점은 제거하지 않는다. 같은 값이 되는 것을 추측해 merge하지 않는다. 형식에 맞지 않는 GTIN/EAN/UPC은 예외 또는 정상 후보가 아니라 `rejectedCandidates`의 `INVALID_IDENTIFIER_FORMAT`으로 근거와 함께 남긴다.

normalizer는 score/rank/conflict/decision, catalog 재조회, run/DB write를 수행하지 않는다. P3-06의 `internalCatalogReferences`, `providerFailures`, upstream `truncated`는 출력에 보존한다. P3-08 이후 orchestration은 이 output의 norm과 evidence를 P3-01 candidate store에 전달하기 전에 `validateResolveCandidates`를 통과시킨다.

전용 검증: `node --test packages/resolver/test/candidate-normalizer.test.mjs`. 실제 브랜드별 separator 정책이나 legacy catalog norm이 이 v1과 다르면 기존 policy를 덮어쓰지 않고 새 Decision과 forward migration/재처리 계획을 만든다.

## Candidate Scorer — P3-08

`createCandidateScorer().score(normalized)`는 `identifier-normalizer/v1`의 safe normalized output만 받아 `identifier-scorer/v1` score/rank를 계산한다. v1은 input Evidence의 runtime weight를 신뢰하지 않고 type·source·strength·fixed weight 조합을 재검증한다. 위조 또는 format이 맞지 않는 input은 `INVALID_SCORING_INPUT`으로 중단하며 raw/provider payload를 출력하지 않는다.

| Evidence type | Score contribution | Strong Evidence |
|---|---:|---|
| SOURCE_FIELD | 45 | 아니오 |
| TITLE_MATCH | 30 | 아니오 |
| URL_MATCH | 25 | 아니오 |
| OPTION_MATCH | 35 | 아니오 |
| VERIFIED_INTERNAL_IDENTIFIER | 100 | 예. `INTERNAL_CATALOG` + `VERIFIED`일 때만 |
| EXTERNAL_CATALOG | 15 | 아니오 |

후보별 서로 다른 Evidence type은 각각 한 번만 더하고 합계는 100으로 제한한다. 같은 type의 여러 provenance는 evidence 배열과 `scoreBreakdown.evidenceCount`에 남지만 추가 점수가 아니다. 동점 rank는 type+candidateNorm code-unit order로 결정한다.

`confidenceScore`는 two-decimal string이며 P3-01 candidate payload에 그대로 넣을 수 있다. scorer는 hard conflict, decision status, AUTO_ACCEPTED, catalog/provider 재호출, resolve run/DB write를 수행하지 않는다. 실제 holdout calibration 전에는 `RESOLVER_AUTO_ACCEPT_ENABLED=false`를 유지한다. 전용 검증: `node --test packages/resolver/test/candidate-scorer.test.mjs`.

## Hard Conflict Detector — P3-09

`createHardConflictDetector().detect(scoring, context)`는 `identifier-scorer/v1` output에 `hard-conflict-detector/v1` code-only conflicts와 `hasHardConflict`를 추가한다. score/rank/strong/evidence와 rejected/reference/failure/truncation은 유지하며 Decision, AUTO_ACCEPTED, catalog/provider 호출 또는 DB write를 하지 않는다.

| Conflict | v1 발생 조건 |
|---|---|
| CONFLICT_GTIN | GTIN/EAN/UPC family의 verified internal evidence가 두 개 이상의 product public ID를 가리킴 |
| CONFLICT_MODEL | MODEL_NO/MPN/STYLE_CODE family의 verified internal evidence가 두 개 이상의 product public ID를 가리킴 |
| CONFLICT_BRAND / VARIANT / VOLUME / COLOR | trusted caller가 source와 동일 candidate key에 모두 제공한 canonical fact가 exact하게 다름 |

여러 identifier value나 WEAK evidence만으로 conflict를 만들지 않는다. current resolver output은 brand/variant/volume/color fact를 생성하지 않으므로 raw/product name을 parsing하지 말고 확정된 adapter/catalog projection만 `HardConflictContext`로 전달한다. missing fact는 conflict 없음이며 match 근거도 아니다. output은 observed value를 복사하지 않는다.

전용 검증: `node --test packages/resolver/test/hard-conflict-detector.test.mjs`. P3-10은 `hasHardConflict`가 true인 후보를 자동승인할 수 없지만, 실제 자동승인 활성화는 P3-14 holdout 기준을 만족할 때까지 OFF다.

## Decision Engine — P3-10

`createDecisionEngine().decide(detected)`는 95+ Strong+no conflict를 `AUTO_ACCEPTED` **권고**로, 80~94 또는 strong 없는 95+를 REVIEW_REQUIRED, 60~79를 CANDIDATE, 60 미만을 NOT_FOUND로 반환한다. hard conflict와 truncated input은 항상 REVIEW_REQUIRED다. empty result도 provider failure/rejected/truncated가 있으면 REVIEW_REQUIRED이며 정상 empty만 NOT_FOUND다.

이 output은 DB status나 실제 autoaccept가 아니다. `RESOLVER_AUTO_ACCEPT_ENABLED=false`는 P3-14 holdout 전까지 유지한다. engine은 provider/catalog 호출, run/candidate/identifier write, promotion을 하지 않는다. 전용 검증: `node --test packages/resolver/test/decision-engine.test.mjs`.

## Identifier Promotion / Audit — P3-11

`createIdentifierPromotionService(database).promoteManual({ candidatePublicId, actor, expectedVersionNo })`는 내부 수동 승인 서비스다. P3-13 API는 인증된 운영자 식별값을 actor로 전달해야 하며 임의 클라이언트 actor를 신뢰하면 안 된다. 현재 HTTP 승인 경로는 구현하지 않았다.

- SUCCEEDED run의 CANDIDATE/REVIEW_REQUIRED만 승인한다. run에 고정된 MASTER와 현재 source/snapshot이 일치해야 한다. unlinked run은 PRODUCT_NOT_FOUND, 재연결/재수집된 미승인 run은 SOURCE_STATE_CONFLICT이며 새 run으로 다시 검토한다.
- candidate의 type-specific norm, 근거 JSON, conflict 부재를 검증한다. 저장된 동일 norm이 다른 MASTER에 있으면 IDENTIFIER_CONFLICT다. GTIN/EAN/UPC는 동일 identity family로 검사한다. conflict override는 제공하지 않는다.
- source → P2 호환 identity advisory lock → MASTER → run/candidate를 잠근다. MASTER scope(sku_id IS NULL)만 upsert/primary 교체하고 SKU identifier는 그대로 둔다. verified와 원 confidence를 기록하며 MASTER version_no도 증가한다.
- identifier에는 candidate/run/product public ID, actor/time, 원 evidence/conflict와 previous evidence를 보존한다. candidate에는 identifier public ID를 포함한 MANUAL_REVIEW receipt를 append한다. 기존 evidence를 삭제하지 않는다.
- 같은 candidate/actor/입력 version의 완료 요청은 receipt에서 동일 결과를 반환하며 버전·시각·이력을 다시 갱신하지 않는다. 다른 version/actor/terminal 상태는 VERSION_CONFLICT 또는 CANDIDATE_STATE_CONFLICT다. 모든 변경은 하나의 트랜잭션으로 rollback된다.
- `promoteAuto()`는 DB 접근 전에 AUTO_PROMOTION_DISABLED로 거부한다. P3-10 AUTO_ACCEPTED 권고는 승인 기록이 아니며 P3-14 calibration 전 자동 승격을 활성화하지 않는다.

전용 검증: build 이후 `node --test tests/integration/identifier-promotion.integration.test.mjs` (TEST_DATABASE_URL 필요). fixture는 전용 임시 DB를 생성·삭제하고 지정된 원본 DB를 reset하지 않는다. 전체 DB 회귀는 기존 timeout 정책을 유지한 `--test-concurrency=1`로 실행한다.

운영 연결 제한: BLK-006은 DEC-20260915-021에서 로컬 해소됐다. current revision remote CI/Phase 3 Gate, BLK-005 live Provider, P3-12 orchestration/P3-13 review API는 별도 후속 검증이다.

## P2/P3 Identifier Compatibility — BLK-006

P2의 저장 `identifier_norm`과 P3 후보의 `candidate_norm`은 각 버전 그대로 유지한다. 조회·중복 검사에서 MODEL_NO/STYLE_CODE/PRODUCT_NO/MPN의 NFKC·대문자·공백/underscore/hyphen 제거와 유효한 GTIN/EAN/UPC의 digit/길이를 비교 키로 사용한다. BARCODE/BRAND_CODE 및 모델 코드의 slash/dot은 기존 exact 정책이다. 유효하지 않은 legacy GTIN은 기존 P2 norm을 유지한다.

P2 MASTER import와 P3 수동 승격은 저장 norm lock과 비교 norm lock을 중복 제거 후 bigint 순서로 얻는다. 따라서 `AB-123`과 `AB123`이 서로 다른 MASTER에 동시에 기록되지 않도록 직렬화한다. P2 matcher/P3 verified catalog는 비유일 002 비교 인덱스로 검색한다. 같은 MASTER의 기존 legacy 행은 P3 승격 시 동일 public ID로 갱신하고 이전 evidence를 보존한다. 이미 서로 다른 MASTER에 두 표현이 있다면 AMBIGUOUS/REVIEW_REQUIRED 또는 IDENTIFIER_CONFLICT로 멈춘다. 자동 병합·실데이터 재작성은 하지 않는다.

2026-09-15 중지된 BROS DB volume의 읽기 전용 사본에서는 MASTER/identifier/candidate/source/import가 모두 0행이었다. 원본 compose의 고정 이미지에서 collation 저장/현재 버전은 2.36/2.36으로 일치했다. 002 migration은 disposable fixture에서 왕복 검증했으며 실제 BROS DB에는 아직 적용하지 않았다. 운영 migration 전 current revision CI와 DB 재확인을 수행한다.

## 품번 검수 UI/API — P3-13

2026-09-15 P3-13에서 P3-11 내부 수동 승인 서비스를 공개 검수 API와 연결했다. 이 절은 앞선 P3-11 절의 HTTP 미구현/후속 검증 설명 이후의 현재 상태다. 경로·인증 포트·version·재시도·직접입력/재탐색 사용법은 [IDENTIFIER_REVIEW.md](IDENTIFIER_REVIEW.md)를 따른다.

- Admin `/identifier-reviews`에서 후보와 빈 실행을 조회하고 승인·거절·직접입력·재탐색한다. 운영 인증은 기본 닫힘이며 기존 local loopback 모드 또는 서버의 검증된 authorizer가 필요하다. 실제 Caddy 연결은 P6-01 후속이다.
- 직접입력은 MASTER version과 요청 UUIDv7, 후보 결정은 candidate version을 사용한다. 409이면 최신 상태/근거를 확인한다. 응답 불확실 시 동일 요청 ID로 재시도한다. 수동 감사 및 원본 Evidence를 삭제하지 않는다.
- Vite `/api`는 Host를 보존해야 Origin 검사와 일치한다. 브라우저용 공통 계약에서 Node 잠금 함수를 import하지 않는다. 서버는 `@bros/contracts/server`의 `compatibleIdentityLockKeys`를 사용한다.
- 기존 migration 003까지 필요하며 P3-13 추가 migration은 없다. 실제 DB는 이번에 기동/변경하지 않았다. 자동승격과 live Provider는 계속 OFF다.

## Resolver 평가 — P3-14

[RESOLVER_EVALUATION.md](RESOLVER_EVALUATION.md)에 입력 계약, 정답/금지 label, MASTER/SKU/image 분리, holdout/algorithm lock, `seal`/`evaluate` 명령, 분모와 결과 해석을 기록했다. 현재 보고서는 합성 회귀용 SYNTHETIC_ONLY다. 실제 정답 검수 데이터는 BLK-007 입력 대기이며 원본 XLSX를 정답으로 자동 변환하지 않는다.

`RESOLVER_AUTO_ACCEPT_ENABLED=false`를 유지한다. true는 승인된 calibration/활성화 구현이 없어 설정 검증에서 거부한다. 평가 실행기는 Identifier/DB/Queue를 변경하지 않는다. CLI exit 2는 보고서가 생성됐지만 calibration PASS가 아님을 뜻하며, exit 0 seal 성공도 calibration PASS가 아니다. 실제 운영 활성화는 별도 범위·버전·운영 책임자 결정과 end-to-end/CI 검증을 요구한다.
