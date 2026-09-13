# BROS 운영 Runbook

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

`001-baseline` 이력과 업무 테이블 18개가 보여야 한다. platform seed는 MUSINSA·OLIVEYOUNG·COUPANG·NAVER 4개다. 재실행은 Kysely 이력을 보고 이미 적용한 migration을 건너뛴다. `pg_trgm` 설치 권한과 app/bros_migrations schema 생성 권한이 있는 migration용 계정을 사용한다. 운영 앱 계정의 최소 권한 구성은 P6 범위다.

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
- GitHub repository 연결 후 `install / lint / typecheck / test / build` job을 branch protection의 required check로 지정한다.

운영 절차는 해당 WBS Task가 구현되고 검증될 때 추가한다.
