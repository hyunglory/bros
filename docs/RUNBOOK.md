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

## 공통 API 계약

- 외부 리소스 ID는 UUIDv7 `publicId`만 사용한다. 내부 BIGINT ID를 요청·응답에 넣지 않는다.
- 비동기 작업 접수 응답은 HTTP 202와 `{publicId,status,statusUrl}`을 사용하며 접수 시 상태는 `QUEUED`다.
- 오류 본문은 `{error:{code,message,requestId,details?}}`를 사용한다.
- 오류 `details`에는 계약이 허용한 검증 issue, 버전 숫자, 재시도 초만 넣는다.
- 목록 limit 기본값은 50, 최대값은 100이다.

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
