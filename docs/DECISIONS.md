# BROS 결정 기록

이 문서는 확정된 프로젝트 결정을 추가 순서대로 보존한다. 기존 결정을 변경할 때는 원문을 수정하지 않고 새 Decision에서 `supersedes`를 지정한다.

## DEC-20260912-001 — P1-01 저장소 및 패키지 경계 기준

- 일자: 2026-09-12
- 종료 단계/분야: 구현 준비 설계 검토 및 P1-01 착수 기준 확정
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-01
- 검토 범위와 근거: `AGENTS.md`, `doc/README.md`, `doc/BROS_구현_보완_명세_v0.2.md`, `doc/BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md` P1-01, `doc/BROS_개발_운영_구성_지침_v0.1.md` 8장·23장, `doc/BROS_로컬_개발환경_구축_가이드_v0.1.md`의 `.gitignore` 예시
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- 현재 디렉터리 `D:\project\bros`를 저장소 루트로 사용하고 중첩 프로젝트 디렉터리를 만들지 않는다.
- pnpm workspace는 `apps/*`와 `packages/*`를 포함한다.
- 애플리케이션은 `admin`, `api`, `worker`, 공통 패키지는 `core`, `contracts`, `db`, `queue`, `storage`, `image`, `browser`로 구성한다.
- 모든 workspace는 ESM TypeScript 패키지로 시작한다.
- 공통 패키지의 공개 진입점은 컴파일된 `dist` 산출물을 가리킨다. 의존 패키지를 먼저 빌드하는 루트 스크립트로 clean checkout의 typecheck를 보장한다.
- Git 제외 대상인 런타임 데이터 디렉터리는 저장소 루트의 `/data/`, `/storage/`로 한정한다. `packages/storage`는 추적 대상이다.
- Node.js 24 계열과 pnpm 11.19.0을 P1-01 개발 기준으로 기록한다.

### 기각한 선택지와 이유
- 공통 패키지의 `exports`를 TypeScript 원본에 직접 연결: 패키지 소비 계약과 배포 산출물 경계가 흐려지고 실행 도구별 TypeScript 처리 차이가 생긴다.
- `data/`, `storage/`를 루트 고정 없이 제외: `packages/storage` 소스까지 무시될 수 있다.
- 저장소 안에 별도의 `brand-resell-os` 루트를 추가: 현재 운영 지침의 빈 폴더 초기화 규칙과 충돌하고 경로가 불필요하게 중첩된다.

### 변경 파일
- `.gitignore`
- `doc/BROS_로컬_개발환경_구축_가이드_v0.1.md`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/BLOCKERS.md`
- `docs/TEST_REPORT.md`
- `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: 문서 경로 및 현재 도구 버전 확인
- 결과: IMPLEMENTED_NOT_VALIDATED

### 미해결 사항 및 Blocker
- P1-01 구현과 fresh checkout 검증은 아직 수행하지 않았다.
- P1-02 이후의 lint, formatter, test runner, CI 세부 구성은 해당 Task에서 확정한다.
- 없음(Blocker).

### 다음 작업 인수 조건
- 작업 범위: P1-01 monorepo/workspace skeleton 구현과 검증
- 금지 변경: 도메인 모델, DB/API/인증 정책을 P1-01에서 임의 확정하지 않는다.
- 완료 조건: 루트 `pnpm install`, `pnpm build`, `pnpm typecheck` 성공 및 10개 workspace 인식 증거 확보
- 재검토가 필요한 조건: 패키지 빌드 순서가 clean checkout에서 재현되지 않거나 Node.js 24/pnpm 11 조합을 지원하지 않는 핵심 의존성이 확인될 때

## DEC-20260912-002 — P1-01 구현 완료

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-01 구현 및 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-01
- 검토 범위와 근거: DEC-20260912-001, P1-01 Acceptance Criteria, 커밋 `3eeec09`, `docs/TEST_REPORT.md`의 P1-01 검증 기록
- 상태: ACCEPTED
- supersedes: DEC-20260912-001의 작성 모델 메타데이터만 정정하며 설계 결정은 유지한다.

### 확정 결정
- 루트 workspace project를 제외한 앱 3개와 공통 패키지 7개를 pnpm workspace로 인식한다.
- 공통 패키지 `exports`, `main`, `types`는 `dist`를 가리키고 workspace 의존관계가 pnpm의 위상 순서를 결정한다.
- root `typecheck`는 clean checkout에서 공통 패키지 7개를 먼저 빌드한 뒤 전체 workspace를 검사한다.
- Windows의 pnpm script에서는 경로 filter를 작은따옴표로 감싸지 않는다. `./packages/**`를 그대로 전달한다.
- TypeScript 5.9.3과 pnpm lockfile을 저장소에 고정한다.

### 기각한 선택지와 이유
- 로컬 `dist`가 남은 상태의 typecheck 결과만 채택: 선행 빌드 필터 오류를 숨길 수 있어 fresh clone 재현 조건을 충족하지 않는다.
- 공통 패키지를 source path alias로 우회: DEC-20260912-001의 컴파일 산출물 경계 결정을 훼손한다.
- pnpm 필터의 작은따옴표 유지: Windows script runner가 따옴표를 패턴 일부로 전달해 package가 선택되지 않는다.

### 변경 파일
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- `apps/admin/**`, `apps/api/**`, `apps/worker/**`
- `packages/core/**`, `packages/contracts/**`, `packages/db/**`, `packages/queue/**`, `packages/storage/**`, `packages/image/**`, `packages/browser/**`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm install --frozen-lockfile`, clean 상태 `pnpm typecheck`, `pnpm build`, workspace 목록 확인, 빌드 산출물 ESM import, `.gitignore` 경계 확인, 임시 fresh clone 전체 재실행
- 결과: PASS

### 미해결 사항 및 Blocker
- P1-02의 lint, formatter, test runner와 CI 기준은 아직 구현하지 않았다.
- P1-03 이후의 서비스·인프라 구현은 시작하지 않았다.
- 없음(Blocker).

### 다음 작업 인수 조건
- 작업 범위: P1-02 개발 품질 기반 구성
- 금지 변경: P1-02에서 앱 프레임워크, DB 스키마, 인증 방식, 외부 서비스 구성을 선행 확정하지 않는다.
- 완료 조건: WBS P1-02의 lint, format check, 단위 테스트 공통 명령이 root와 모든 적용 workspace에서 재현 가능해야 한다.
- 재검토가 필요한 조건: 선택한 품질 도구가 Node.js 24, ESM 또는 workspace별 구성 상속을 지원하지 않을 때

## DEC-20260912-003 — P1-02 공통 품질 기준 완료

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-02 구현 및 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-02
- 검토 범위와 근거: DEC-20260912-002, P1-02 Acceptance Criteria, 커밋 `b0d838f`, 보완 커밋 `102c0a7`, `docs/TEST_REPORT.md`의 P1-02 검증 기록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- strict TypeScript 공통 기준은 루트 `tsconfig.base.json`에서 상속한다.
- ESLint 10 flat config와 typescript-eslint strict/stylistic 구성을 루트에서 앱·패키지 전체에 적용한다.
- Prettier는 루트 설정을 사용하고 기준 문서와 생성 산출물은 format 대상에서 제외한다.
- `pnpm check`는 lint → typecheck → format check → build를 순서대로 수행한다.
- JS, JSON, TS, YAML의 Git checkout 줄바꿈은 LF로 고정해 Windows와 CI 결과를 일치시킨다.

### 기각한 선택지와 이유
- workspace마다 ESLint/Prettier 설정 복제: 설정 차이를 막는 P1-02 목표에 맞지 않는다.
- 기존 문서 전체를 Prettier 대상으로 포함: 설계 문서에 대규모 비기능 변경을 만들고 검토 이력을 흐린다.
- Windows CRLF를 허용하면서 Prettier에서 자동 보정: fresh clone의 format check가 실패해 재현 가능한 게이트가 되지 않는다.

### 변경 파일
- `package.json`, `pnpm-lock.yaml`
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitattributes`
- Prettier로 정규화된 `packages/*/package.json`, `packages/image/src/index.ts`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm check`, 의도적 TS2322 삽입 후 `pnpm typecheck` 실패 확인·원복, 임시 fresh clone에서 고정 설치와 `pnpm check`
- 결과: PASS

### 미해결 사항 및 Blocker
- 단위·통합 test runner와 CI workflow는 P1-14 범위다.
- 애플리케이션별 실행 프레임워크는 아직 구성하지 않았다.
- 없음(Blocker).

### 다음 작업 인수 조건
- 작업 범위: P1-03 환경변수 / Config Loader
- 금지 변경: 실제 비밀값을 저장소에 기록하지 않고, SecretProvider/redaction의 P1-13 범위를 중복 구현하지 않는다.
- 완료 조건: typed config module, `.env.example`, 개발/운영 구분, 필수값 누락 시 명확한 시작 중단, valid/invalid env 검증을 제공한다.
- 재검토가 필요한 조건: P1-03에서 브라우저 자격증명이나 외부 provider secret을 직접 읽어야 하는 요구가 발견될 때

## DEC-20260912-004 — P1-03 typed config 완료

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-03 구현 및 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-03
- 검토 범위와 근거: DEC-20260912-003, P1-03 Acceptance Criteria, 마스터 프롬프트 P1-03, 커밋 `9a43876`, 보완 커밋 `15e82cb`, `docs/TEST_REPORT.md`의 P1-03 검증 기록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- typed config의 단일 구현 위치는 `packages/core/src/config`다.
- 공통 실행 설정은 `APP_ENV`, `DATABASE_URL`, `API_HOST`, `API_PORT`, `WORKER_CONCURRENCY`, `STORAGE_DRIVER`, `STORAGE_LOCAL_ROOT`로 제한한다.
- development/test는 로컬 기본값을 허용하고 production은 배포 환경에 종속되는 값을 명시하도록 강제한다.
- `DATABASE_URL`은 항상 필수이며 postgres/postgresql URL만 허용한다.
- `STORAGE_DRIVER`는 `local | r2` 판별 union으로 제공한다. R2 자격증명은 P1-13 SecretProvider 범위로 남긴다.
- `process.env` 접근은 config process adapter에만 두고 업무 로직에는 typed config를 주입한다.
- validation 오류에는 환경변수 이름과 규칙만 포함하고 입력값은 포함하지 않는다.
- P1-14 전까지 P1-03 unit test는 Node.js 내장 test runner로 실행한다.

### 기각한 선택지와 이유
- 앱마다 환경변수를 직접 읽고 검증: API와 Worker 설정이 달라지고 마스터 프롬프트의 공통 typed config 요구를 위반한다.
- config 오류에 실제 입력값 포함: URL의 비밀번호나 provider 값이 로그로 노출될 수 있다.
- R2 access key를 `.env.example`과 config에 선행 추가: P1-13의 secret naming과 provider 경계를 먼저 확정해야 한다.
- P1-03에서 별도 schema library 도입: 현재 설정 범위는 작은 parser로 명확히 검증할 수 있고 P1-08 TypeBox 계약과 불필요한 중복 의존성을 만들 수 있다.

### 변경 파일
- `.env.example`, `.gitattributes`
- `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json`
- `packages/core/src/config/index.ts`, `packages/core/src/index.ts`, `packages/core/test/config.test.mjs`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm check`, config 5개 unit case, `process.env` 사용 위치 검색, 임시 fresh clone에서 고정 설치와 전체 check
- 결과: PASS

### 미해결 사항 및 Blocker
- 실제 API/Worker 시작 시 config를 주입하는 bootstrap은 P1-07/P1-10 범위다.
- 자격증명 조회와 Pino redaction은 P1-13 범위다.
- 공통 test runner·CI workflow는 P1-14 범위다.
- 없음(Blocker).

### 다음 작업 인수 조건
- 작업 범위: Foundation Wave A의 P1-08 API Contract / TypeBox
- 금지 변경: 아직 결정되지 않은 다중 역할 권한, 도메인별 상세 API, DB 내부 식별자를 계약에 노출하지 않는다.
- 완료 조건: 공통 request/response schema와 TypeScript type이 같은 TypeBox 정의에서 생성되고, 공통 오류와 publicId 검증 규칙 및 invalid/response schema test가 통과한다.
- 재검토가 필요한 조건: publicId 형식이 UUIDv7 외 형식을 요구하거나 Fastify serializer/validator와 TypeBox 호환 문제가 확인될 때

## DEC-20260912-005 — P1-08 공통 API 계약 완료

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-08 구현 및 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-08
- 검토 범위와 근거: DEC-20260912-004, 구현 보완 명세 3.2, 설계서 21장, P1-08 Acceptance Criteria, 커밋 `8035fa8`, 보완 커밋 `94c7b65`, `docs/TEST_REPORT.md`의 P1-08 검증 기록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- API runtime schema와 TypeScript type의 단일 원천은 `packages/contracts`의 TypeBox 정의다.
- 공개 리소스 ID 입력은 UUIDv7 형식을 검사하며 숫자형 내부 ID와 다른 UUID version을 거절한다.
- 공통 요청 계약은 publicId params, expectedVersion, cursor/limit pagination을 제공한다.
- 비동기 접수 응답은 UUIDv7 publicId, `QUEUED`, `/api/v1/` status URL을 요구한다.
- 공통 오류 상태는 400/401/403/404/409/413/429/503으로 제한하고 body는 문서의 error envelope를 사용한다.
- 오류 details의 초기 allowlist는 validation issues, expected/actual version, retry seconds다. 새 필드는 계약 변경과 민감정보 검토 후 추가한다.
- validation issue는 path와 숫자 rule만 반환하며 거절된 실제 입력값은 error body에 포함하지 않는다.
- 목록 limit는 기본 50, 최소 1, 최대 100이다. cursor의 실제 인코딩은 목록 API 구현 Task에서 `(created_at,public_id)` 기준으로 확정한다.

### 기각한 선택지와 이유
- TypeScript interface와 JSON Schema 별도 작성: 요청/응답과 Admin type이 달라질 수 있어 P1-08 목표를 위반한다.
- `format: uuid`만 사용: UUID version을 구분하지 않아 DB `uuidv7()` 공개 ID 규칙을 입력 경계에서 보장하지 못한다.
- 오류 details를 임의 record로 허용: 원문 입력이나 비밀값이 응답에 섞일 수 있고 허용 필드 원칙을 강제하지 못한다.
- domain별 전체 API schema 선행 작성: DB와 상태 전이 구현 전 불필요하게 계약을 확정한다.

### 변경 파일
- `package.json`, `pnpm-lock.yaml`
- `packages/contracts/package.json`, `packages/contracts/src/http.ts`, `packages/contracts/src/index.ts`, `packages/contracts/test/contract.test.mjs`
- `apps/admin/src/index.ts`, `apps/api/src/index.ts`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm check`, TypeBox request/response/error/pagination 5개 unit case, API/Admin compile, 임시 fresh clone 전체 check
- 결과: PASS

### 미해결 사항 및 Blocker
- cursor encoding, 정렬·필터 allowlist는 실제 목록 API Task에서 정한다.
- Fastify와 실제 HTTP injection을 통한 400/response serializer 검증은 P1-07에서 연결한다.
- 인증·CSRF는 P6-01 범위이며 이번 계약은 상태 코드와 envelope만 제공한다.
- 없음(Blocker).

### 다음 작업 인수 조건
- 작업 범위: Foundation Wave A의 P1-13 SecretProvider / Sensitive Data Redaction Baseline
- 금지 변경: 자격증명 값을 DB·Git·오류 details에 저장하지 않고, 운영 secret backend 종류를 근거 없이 확정하지 않는다.
- 완료 조건: SecretProvider port, 개발용 EnvSecretProvider, key naming, Pino redaction path, 오류 masking과 관련 unit test가 통과한다.
- 재검토가 필요한 조건: Pino의 실제 직렬화 경로가 계약의 redact path와 일치하지 않거나 브라우저 profile이 문자열 secret으로 처리될 수 없을 때

## DEC-20260912-006 — P1-13 SecretProvider와 redaction baseline 완료

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-13 구현 및 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-13
- 검토 범위와 근거: DEC-20260912-005, 구현 보완 명세 3.2·5.2, 설계서 23.2·24장, P1-13 Acceptance Criteria, 커밋 `d983030`, `docs/TEST_REPORT.md`의 P1-13 검증 기록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- SecretProvider port와 개발용 EnvSecretProvider는 `packages/core/src/security`에 둔다.
- semantic secret key는 `storage.r2.*`, `provider.<provider>.apiKey`, `browser.profile.<profile>.*`로 제한하고 환경변수는 `BROS_SECRET_` prefix로 변환한다.
- browser profile key는 소문자로 시작하는 영숫자 1~32자로 제한해 환경변수 이름 충돌을 막는다.
- secret 조회는 비동기 port로 정의해 후속 운영 backend를 호출부 변경 없이 추가할 수 있게 한다.
- missing secret 오류는 semantic key만 포함하고 실제 값은 포함하지 않는다.
- 구조화 로그는 공통 Pino factory를 사용하고 token/cookie/password/API key/authorization/URL/DB DSN 경로를 `[REDACTED]`로 치환한다.
- Pino Error serializer와 log hook을 함께 사용해 Error가 최상위 `msg`로 복제되는 경로도 마스킹한다.
- 문자열 masking은 Bearer/Basic, 민감 key assignment, signed query, URL userinfo를 처리한다.
- `DATABASE_URL`은 config process adapter에서만 읽으며 업무 코드는 typed config를 주입받는다. logger는 `database.url`과 `config.database.url`을 항상 가린다.

### 기각한 선택지와 이유
- 업무 코드의 직접 `process.env` 조회: provider 교체와 감사 가능한 secret 경계를 무너뜨린다.
- 임의 문자열을 secret key로 허용: 환경변수 이름 충돌과 의도하지 않은 값 접근 가능성이 생긴다.
- Pino redact path만 사용하고 Error serializer/hook 생략: `err.message`가 최상위 `msg`에 복제되어 secret이 재노출됨을 실제 테스트에서 확인했다.
- 로그의 모든 object를 재귀 순회해 임의 값 패턴을 탐지: 비용과 오탐이 크므로 key/path redaction과 제한된 문자열 masking을 조합한다.
- 운영 secret backend 확정: 배포 환경과 운영자 입력이 아직 없어 결정 근거가 없다.

### 변경 파일
- `.env.example`
- `package.json`, `pnpm-lock.yaml`
- `packages/core/package.json`, `packages/core/src/security/index.ts`, `packages/core/src/index.ts`, `packages/core/test/security.test.mjs`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm check`, security 4개 unit case, 실제 Pino JSON 직렬화 원문 검색, 직접 `process.env` 경계 검색, 임시 fresh clone 전체 check
- 결과: PASS

### 미해결 사항 및 Blocker
- 운영 secret backend와 rotation 방식은 배포 환경 확정 후 결정한다.
- API/Worker가 공통 logger를 실제 bootstrap에서 사용하는 검증은 P1-07/P1-10 범위다.
- browser profile 디렉터리는 문자열 secret이 아니며 P5/P6에서 별도 접근제어·백업 정책을 적용한다.
- 없음(Blocker).

### 다음 작업 인수 조건
- 작업 범위: Foundation Wave A의 P1-14 Test Harness / CI Baseline
- 금지 변경: 실제 production secret, 외부 서비스 호출, 아직 없는 DB integration을 성공으로 가장하지 않는다.
- 완료 조건: clean checkout install→lint→typecheck→unit/integration→build 자동화, lockfile 검증, 의도적 lint/type/test 실패 탐지 증거를 제공한다.
- 재검토가 필요한 조건: CI provider가 GitHub Actions가 아니거나 PostgreSQL test lifecycle을 P1-04 이전에 실행해야 할 때

## DEC-20260912-007 — P1-14 test/CI baseline 구현

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-14 기반 구현 및 로컬 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-14
- 검토 범위와 근거: DEC-20260912-006, P1-14 Acceptance Criteria, 마스터 프롬프트 P1-14, Foundation Wave A의 “기반 먼저·전체 실행 후속” 조건, 커밋 `fc3269c`, `docs/TEST_REPORT.md`의 P1-14 검증 기록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- unit/integration test discovery와 실행은 Node.js 24 내장 test runner를 감싼 `scripts/run-tests.mjs`를 사용한다.
- unit은 앱·패키지의 `*.test.mjs`, integration은 `tests/integration/**/*.integration.test.mjs`로 구분하며 발견 파일이 없으면 성공으로 처리하지 않는다.
- root `pnpm test`는 unit 다음 integration을 실행한다. integration은 앱과 공통 패키지의 compiled public boundary를 사용한다.
- GitHub Actions workflow는 install → lint → typecheck → unit/integration → format check → build를 별도 단계로 실행한다.
- CI는 PostgreSQL 18 service/healthcheck와 test 전용 DSN을 미리 제공하며 실제 DB 연결·migration test는 P1-04/P1-05에서 추가한다.
- workflow 권한은 contents read로 제한하고 checkout credential을 보존하지 않으며 concurrency 중복 실행을 취소한다.
- 외부 GitHub action은 검증한 release의 전체 commit SHA로 고정한다.
- P1-14 task 상태는 원격 workflow와 required check가 검증될 때까지 `IMPLEMENTED_NOT_VALIDATED`다. 이는 P1-04 착수를 차단하지 않지만 Phase 1 Gate PASS를 차단한다.

### 기각한 선택지와 이유
- test 파일을 root script에 개별 열거: Task가 늘 때 script를 빠뜨리기 쉽고 integration 분리가 어렵다.
- integration test 0개를 성공 처리: Gate가 실제 검증 없이 통과하는 결과를 만든다.
- 실제 운영 secret을 CI에 사용: 테스트 격리 원칙과 P1-13 경계를 위반한다.
- action major tag만 참조: tag 이동 시 동일 commit 재현과 공급망 검토가 어렵다.
- 원격 실행 없이 P1-14를 PASS 처리: 구현 완료와 CI 실검증을 혼동한다.

### 변경 파일
- `.github/workflows/ci.yml`
- `package.json`, `eslint.config.js`
- `scripts/run-tests.mjs`
- `tests/integration/workspace-contract.integration.test.mjs`
- `packages/core/test/security.test.mjs`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/BLOCKERS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm check`, 의도적 lint/type/test 실패 3종과 원복, clean clone의 명시적 CI 명령열, workflow format parse, action tag SHA 조회
- 결과: IMPLEMENTED_NOT_VALIDATED

### 미해결 사항 및 Blocker
- BLK-001: GitHub remote, workflow 실실행, required status check 설정이 필요하다.
- PostgreSQL 실제 연결·migration integration은 P1-04/P1-05 이후 추가한다.
- GitHub Actions가 아닌 CI를 사용할 경우 workflow 결정을 재검토한다.

### 다음 작업 인수 조건
- 작업 범위: Foundation Wave A의 P1-04 PostgreSQL 18 개발환경
- 금지 변경: P1-05의 업무 테이블 migration을 선행 구현하지 않고, 실제 자격증명을 Compose 파일에 넣지 않는다.
- 완료 조건: Docker Compose PostgreSQL 18, healthcheck, persistent volume을 구성하고 DB 연결·uuidv7()·restart persistence를 검증한다.
- 재검토가 필요한 조건: 로컬 Docker Engine을 사용할 수 없거나 PostgreSQL 18 이미지에서 uuidv7() 호출이 지원되지 않을 때

## DEC-20260912-008 — P1-04 PostgreSQL 18 개발환경

- 일시: 2026-09-12 Asia/Seoul
- 종료 단계/분야: Phase 1 P1-04 구현 및 로컬 실기동 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-04
- 검토 범위와 근거: WBS v0.1 P1-04, 마스터 프롬프트 P1-04, PostgreSQL 공식 Docker image의 18+ PGDATA/volume 변경 안내, 구현 커밋 `bc8c419`, `docs/TEST_REPORT.md`의 P1-04 검증 기록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- 개발 DB service name은 `postgres`, Compose project name은 `bros`, 개발 network 이름은 `bros_dev`로 고정한다.
- 이미지는 `postgres:18.6-bookworm`과 검증한 multi-architecture digest를 함께 사용하고 CI service도 같은 image reference를 사용한다.
- PostgreSQL 18의 version-specific PGDATA 규칙에 맞춰 named volume `bros_postgres_data`를 `/var/lib/postgresql`에 mount한다.
- DB명과 사용자 기본값은 `bros`, host port 기본값은 5432로 두되 비밀번호에는 기본값을 두지 않고 추적되지 않는 `.env`를 요구한다.
- host port 충돌 시 기존 프로세스를 중지하지 않고 `POSTGRES_PORT`와 `DATABASE_URL`을 함께 변경한다.
- 일반 개발 종료는 service stop으로 처리하고 volume 삭제는 명시적 데이터 초기화 작업에서만 수행한다.

### 기각한 선택지와 이유
- 이동 가능한 `postgres:18` tag만 사용: patch image와 공급망 입력이 변해 동일 환경 재현이 어렵다.
- PostgreSQL 17 이하의 volume 경로 `/var/lib/postgresql/data` 사용: PostgreSQL 18 공식 image의 version-specific PGDATA layout과 맞지 않는다.
- Compose 파일에 개발 비밀번호 기본값 포함: 추적 파일에 credential 성격의 값을 고정하고 누락 설정을 숨긴다.
- 5432 충돌 서비스 자동 중지: 다른 프로젝트의 실행 상태와 데이터를 임의로 변경한다.
- 일반 종료에서 `down -v` 실행: 개발 데이터가 의도치 않게 삭제된다.

### 변경 파일
- `docker-compose.yml`
- `.env.example`, `.gitattributes`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`

### 검증 증거
- 실행 명령 또는 수동 확인: Compose config parse, service 기동 및 healthcheck, host TCP connection, PostgreSQL version/data directory/uuidv7 query, restart 후 probe row 조회, `pnpm check`
- 결과: PASS

### 미해결 사항 및 Blocker
- P1-04 범위의 blocker는 없다.
- P1-14의 원격 GitHub Actions/required check 검증은 BLK-001로 계속 추적한다.

### 다음 작업 인수 조건
- 작업 범위: P1-05 Kysely migration 기반과 MVP 18개 업무 테이블
- 금지 변경: P1-06 런타임 repository를 혼합하지 않고, 설계 문서에 없는 FK·NULL·삭제 정책을 임의로 확정하지 않는다.
- 완료 조건: 빈 disposable DB의 forward migration, down/forward 개발 검증, 18개 테이블 metadata와 FK/UNIQUE/CHECK/INDEX negative test를 통과한다.
- 재검토가 필요한 조건: 구현 보완 명세 2장과 DB 설계서가 충돌하거나 migration에서 요구 constraint를 PostgreSQL 18로 표현할 수 없을 때

## DEC-20260912-009 — P1-05 물리 명세 대조와 코드 정책 제안

- 일자: 2026-09-12
- 종료 단계/분야: P1-05 착수 명세 대조 및 독립 구현 초안 작성. Task는 미완료.
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-05
- 검토 범위와 근거: DEC-20260912-008, 설계서 11·12장/15.6, 구현 보완 명세 2장/3.2, WBS P1-05, 운영 지침 23.4, Kysely 0.29.5 설치본의 Migrator 계약.
- 상태: PROPOSED
- supersedes: 없음. 기존 폐쇄 코드 CHECK 요구를 아직 대체하지 않는다.

### 확정 결정
- 기존 승인 범위인 Kysely migration, PostgreSQL 18, app schema, 18개 업무 테이블을 유지한다.
- 원문에서 확인한 256개 컬럼과 추가 제약을 `docs/DB_MIGRATION_SPEC.md`로 정리했다.
- 코드 집합 정책은 미확정이다. product_type/created_method/import_type/evidence_type/reviewer_type에 열린 VARCHAR(64)·필수·공백 금지를 우선 적용하는 안을 사용자에게 제안했다. 답변 없이 승인으로 처리하지 않는다.
- DDL은 초안이며 up 가드로 실행을 차단한다. 실제 migration 완료로 기록하지 않는다.

### 기각한 선택지와 이유
- 문서에 없는 허용값 목록을 임의로 만들어 CHECK 적용: 향후 입력·검수 계약을 근거 없이 확정한다.
- 예시를 완전한 enum 목록으로 간주: 설계서 15.6의 예시 범위를 넘어선다.
- 열린 코드 정책을 조용히 적용: 보완 명세 2장의 CHECK 요구와 다르므로 승인 기록이 필요하다.

### 변경 파일
- `docs/DB_MIGRATION_SPEC.md`, `docs/DECISIONS.md`, `docs/BLOCKERS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`
- `package.json`, `packages/db/package.json`, `pnpm-lock.yaml`
- `packages/db/src/migration-runtime.ts`, `packages/db/src/migrations/001-baseline.ts`
- `scripts/migrate.mjs`
- `tests/integration/database-fixture.mjs`, `tests/integration/database-schema.integration.test.mjs`, `tests/integration/database-constraints.integration.test.mjs`

### 검증 증거
- 실행 명령 또는 수동 확인: 문서 컬럼 대조, npm 배포 버전과 설치본 API 확인, node 문법 검사, `pnpm lint`, `pnpm --filter @bros/db build`.
- 결과: IMPLEMENTED_NOT_VALIDATED — DB 실검증은 NOT_RUN. 정적 검사만 PASS.

### 미해결 사항 및 Blocker
- BLK-002: 다섯 코드 필드의 허용 집합 정책 사용자 답변이 필요하다.
- BLK-001 원격 CI 검증도 유지한다.
- 데이터 제약 테스트 추가와 metadata/negative/down-forward 전체 실행이 남아 있다.

### 다음 작업 인수 조건
- 작업 범위: 사용자 코드 정책 답변 반영 → ACCEPTED Decision 추가 → DDL 실행 가드 제거 → 테스트 완성 → disposable DB에서 P1-05 전체 검증.
- 금지 변경: PROPOSED를 승인으로 간주하지 않으며 사용자 기존 DB를 reset/drop하지 않는다. 테스트에서 성공적으로 생성한 고유 DB만 정리한다.
- 완료 조건: 18개 테이블 metadata와 필수 negative test, seed, migration 재실행, down/forward, lint/typecheck/test/format/build 통과.
- 재검토가 필요한 조건: 코드 목록 확정안이 API/업무 계약과 충돌하거나 기존 CHECK 범위를 변경하는 추가 요구가 있을 때.

## DEC-20260912-010 — P1-05 미정 코드 집합의 확장 가능한 저장 정책

- 일자: 2026-09-12
- 종료 단계/분야: P1-05 코드 정책 확정
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-05, 후속 P2/P3/P4 코드 집합 정의
- 검토 범위와 근거: DEC-20260912-009의 제안, BLK-002, 사용자의 “코드 정책 확정 후 P1-05 구현·DB 검증 진행해” 후속 지시. 직전 응답에서 제안한 다섯 코드 필드의 저장 정책을 적용한다.
- 상태: ACCEPTED
- supersedes: DEC-20260912-009의 미확정 제안. 보완 명세 2장의 허용 집합 CHECK 기본 규칙은 아래 다섯 필드에 한해 명시적으로 예외 처리한다.

### 확정 결정
- `product_master.product_type`, `product_master.created_method`, `import_batch.import_type`, `product_identifier.evidence_type`, `thumbnail_review.reviewer_type`은 VARCHAR(64), NOT NULL, 공백만 있는 값 금지로 구현한다.
- 이 다섯 필드에 문서에 없는 허용값 목록을 새로 만들어 적용하지 않는다. product_type의 미분류 기본값 UNKNOWN은 유지한다.
- created_method/import_type은 P2, evidence_type은 P3, reviewer_type은 P4에서 허용 집합을 확정한다. product_type 분류는 P2의 상품 정규화·생성 계약에서 결정한다.
- 향후 제한은 기존 저장값 분포 확인 → 변환/호환 정책 결정 → 별도 forward migration 순서로 적용한다. 이미 적용된 baseline 파일을 바꾸지 않는다.
- 원문에 허용값 목록이 명시된 모든 상태 및 타입 CHECK, FK, NULL, UNIQUE, 삭제 정책은 유지한다.
- BLK-002는 이 결정으로 해소한다. P1-05 DB 검증 완료와 정책 승인을 구분한다.

### 기각한 선택지와 이유
- 임의의 enum 값 생성: 문서에 없는 업무 분류를 DB 기반 단계에서 고정한다.
- 필수·길이·공백 검증도 해제: 승인된 유연성 범위를 넘어 유효하지 않은 행을 허용한다.
- 모든 코드/상태를 열린 문자열로 전환: 기존에 확정한 상태 계약을 불필요하게 약화한다.

### 변경 파일
- `docs/DECISIONS.md`, `docs/DB_MIGRATION_SPEC.md`, `docs/BLOCKERS.md`, `docs/IMPLEMENTATION_STATUS.md`
- `doc/BROS_구현_보완_명세_v0.2.md`
- `packages/db/src/migrations/001-baseline.ts`

### 검증 증거
- 실행 명령 또는 수동 확인: 사용자 후속 지시와 다섯 대상 컬럼의 타입·NULL·공백 CHECK 대조.
- 결과: NOT_RUN — 정책 확정이며 실제 DB 검증은 후속 구현 완료 기록에 남긴다.

### 미해결 사항 및 Blocker
- P1-05 실제 DB metadata/negative/down-forward 및 전체 품질 검증이 남아 있다.
- BLK-001 원격 CI 실행/required check 검증은 유지한다.

### 다음 작업 인수 조건
- 작업 범위: 실행 가드 제거, 테스트와 CLI 완성, disposable DB 검증 및 개발 DB forward migration.
- 금지 변경: P1-06 런타임 repository 범위 추가, 기존 운영/사용자 DB의 down/reset, 다섯 필드 외 CHECK 약화.
- 완료 조건: P1-05 WBS의 18개 테이블 metadata, seed, 재실행, down/forward, negative test와 전체 품질 검사 통과.
- 재검토가 필요한 조건: 이후 코드 집합 제한이 기존 데이터와 충돌할 때.

## DEC-20260912-011 — P1-05 DB baseline 구현·검증 완료

- 일자: 2026-09-12
- 종료 단계/분야: Phase 1 P1-05 Kysely migration 및 18개 업무 테이블 구현·검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-05
- 검토 범위와 근거: DEC-20260912-008/010, 설계서 11·12장, 구현 보완 명세 2장/3.2, WBS P1-05, `docs/DB_MIGRATION_SPEC.md`, 구현 커밋 `6e3cd03`, TEST_REPORT P1-05 완료 기록.
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260912-010의 정책을 구현한 완료 기록이다. DEC-20260912-009의 과거 NOT_RUN 기록을 현재 상태로 해석하지 않는다.

### 확정 결정
- Kysely 0.29.5, pg 8.23.0, @types/pg 8.23.1을 고정한다. Kysely Migrator의 PostgreSQL transaction/lock 및 이력 관리 계약을 사용한다.
- 업무 schema는 app, migration 이력 schema는 bros_migrations다. 001-baseline이 18개 테이블·256개 컬럼과 platform seed 4개를 생성한다.
- JSON raw는 원형을 허용하고 객체/배열 용도의 JSON은 해당 유형을 CHECK한다. 금액·점수·버전·시간 순서·저장 메타데이터·종료 집계·FK/UNIQUE를 DB에서 검증한다.
- 보완 명세에 따른 모든 FK는 RESTRICT이며 조회 B-tree를 제공한다. 복합 FK는 다른 MASTER의 SKU 연결을 차단한다. 원본 revision과 생성 hash의 부분 UNIQUE로 데이터 중복을 차단한다.
- IANA timezone은 pg_timezone_names를 조회하는 write trigger로 검증한다. 변경 가능한 catalogue를 IMMUTABLE 함수로 취급하지 않는다.
- migration용 연결은 별도 helper로 구성하고 P1-06 런타임 repository와 구분한다. BIGINT/NUMERIC의 pg 기본 string 반환을 유지한다.
- CLI는 forward migration만 제공하며 루트 `.env`를 지원한다. 오류 출력은 원문 DSN·SQL·row를 포함하지 않는 메시지로 제한한다.
- 테스트는 TEST_DATABASE_URL의 DB 자체를 변경하지 않고 새 고유 DB를 생성·검증·삭제한다. URL 누락이나 연결 실패를 skip으로 처리하지 않는다.
- down/forward는 disposable DB에서만 사용하며 down이 공유 extension이나 이력 schema를 cascade 삭제하지 않도록 한다. 운영 복구는 Backup/Forward-fix다.
- P1-05는 PASS다. 개발 DB에 001-baseline이 적용되어 있고 검증 후 서비스는 중지했으며 volume은 보존했다.

### 기각한 선택지와 이유
- app schema에 migration 관리 테이블 혼합: 18개 업무 테이블과 관리 테이블의 검증·권한 경계를 흐린다.
- DB 통합 테스트를 연결정보 누락 시 skip: CI가 실제 DB를 검증하지 않고 통과할 수 있다.
- 테스트에서 전달받은 개발 DB를 down/reset: 사용자의 데이터와 병행 테스트에 영향을 줄 수 있다.
- raw/연결 문자열을 migration 오류에 포함: 실패 진단 과정에서 민감정보가 노출될 수 있다.
- P1-05에서 P2/P3/P4/P5의 상태 전이·승인 서비스를 함께 구현: 물리 스키마 검증과 이후 업무 트랜잭션의 완료 범위를 혼동한다.

### 변경 파일
- `packages/db/src/migrations/001-baseline.ts`, `packages/db/src/migration-runtime.ts`, `packages/db/package.json`
- `scripts/migrate.mjs`, `scripts/run-tests.mjs`, `package.json`, `pnpm-lock.yaml`, `.env.example`
- `tests/integration/database-fixture.mjs`, `tests/integration/database-schema.integration.test.mjs`, `tests/integration/database-constraints.integration.test.mjs`
- `docs/DB_MIGRATION_SPEC.md`, `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/BLOCKERS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`
- `doc/README.md`, `doc/BROS_구현_보완_명세_v0.2.md`

### 검증 증거
- 실행 명령 또는 수동 확인: `pnpm check`, clean clone의 `pnpm install --frozen-lockfile`/`pnpm check`, `pnpm db:migrate`, PostgreSQL metadata·seed·잔여 테스트 DB 조회.
- 결과: PASS — unit 14개, integration 22개(Node runner 기준), skip 0개, 전체 정적 검사/build 및 clean clone 재현 통과. 상세 증거는 TEST_REPORT의 P1-05 완료 기록을 따른다.

### 미해결 사항 및 Blocker
- P1-05 blocker 없음. BLK-002는 DEC-20260912-010으로 해소했다.
- P1-14 원격 GitHub CI/required check는 BLK-001로 계속 추적한다. 로컬 DB 테스트 PASS로 원격 CI를 PASS 처리하지 않는다.
- 사용한 recipe 버전 불변성, 검수 append-only 업무 경로, 상태 전이/CAS, Source 재매핑 잠금은 명세대로 후속 업무 service 작업에서 검증한다.
- 다섯 열린 코드의 폐쇄 집합 추가는 DEC-20260912-010의 후속 P2/P3/P4 책임을 따른다.

### 다음 작업 인수 조건
- 작업 범위: P1-06 typed DB client, pool 설정, transaction helper, repository 기반과 API/Worker 공용 query 검증.
- 금지 변경: 이미 적용한 001-baseline을 수정하지 않는다. BIGINT/NUMERIC을 손실 가능한 number로 강제 변환하지 않는다. P1-07 HTTP server나 P1-09 Queue까지 범위를 확대하지 않는다.
- 완료 조건: API와 Worker가 같은 DB 패키지로 query를 수행하고 transaction commit/rollback, pool 종료, 타입 검사 및 DB integration을 통과한다.
- 재검토가 필요한 조건: 런타임 타입과 PostgreSQL 실제 반환 타입이 다르거나 pool/transaction 경계가 후속 queue 통합 계약과 충돌할 때.

## DEC-20260912-012 — P1-06 공용 DB client·transaction 기반 완료

- 일자: 2026-09-12
- 종료 단계/분야: P1-06 구현·DB 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-06
- 검토 범위와 근거: DEC-20260912-011, WBS P1-06/07, docs/DB_MIGRATION_SPEC.md, TEST_REPORT P1-06, packages/db 및 API/Worker 연결 코드.
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정
- 18개 업무 테이블의 typed Database를 schema-qualified 이름으로 제공한다. BIGINT/NUMERIC은 string, TIMESTAMPTZ 조회는 Date이며 JSON 쓰기는 직렬화한 문자열이다. identity 입력과 public_id 변경을 타입에서 차단한다.
- API/Worker factory는 검증된 DatabaseConfig를 주입받아 각자 pool을 소유한다. pool max 기본 5, 연결 timeout 5000ms, idle/statement timeout 30000ms이며 범위를 config loader에서 검증한다. pool 용량은 인스턴스별 합산한다.
- repository는 루트 DB 또는 transaction executor를 주입받는다. platform repository는 명시적인 publicId projection을 사용한다. 여러 repository의 원자적 작업에는 같은 tx를 전달한다.
- transaction helper는 기본 READ COMMITTED를 사용하고 commit/rollback을 Kysely에 위임한다. 중첩 transaction을 거절하며 callback을 자동 재시도하지 않는다.
- close는 await 가능한 멱등 종료다. idle 연결 오류 로그에는 고정 코드와 메시지만 남긴다. query 오류의 안전한 HTTP 변환은 P1-07에서 처리한다.
- 기존 migration·코드 집합 정책은 변경하지 않는다. 런타임 import/생성은 migration을 실행하지 않는다. P1-06은 PASS, P1-07은 READY다.

### 기각한 선택지와 이유
- 전역 singleton pool: API/Worker 및 테스트의 소유권·종료 경계가 불명확해진다.
- transaction 안에서 새 루트 repository 사용: 별도 연결에서 독립 commit할 위험이 있다.
- 자동 callback retry: 외부 부수효과가 중복될 수 있다.
- BIGINT/NUMERIC number 변환: 정밀도 손실 위험이 있다. JSON array를 pg에 그대로 전달하면 PostgreSQL array로 해석될 수 있어 명시적으로 직렬화한다.

### 변경 파일
- packages/db/src/schema.ts, packages/db/src/client.ts, packages/db/src/repositories/platform.ts, packages/db/src/index.ts
- packages/db/test/schema.typecheck.ts, packages/db/tsconfig.type-tests.json, packages/db/package.json
- packages/core/src/config/index.ts, packages/core/test/config.test.mjs, .env.example
- apps/api/src/database.ts, apps/api/src/index.ts, apps/worker/src/database.ts, apps/worker/src/index.ts
- tests/integration/database-client.integration.test.mjs
- docs/RUNBOOK.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/DECISIONS.md

### 검증 증거
- 실행 명령 또는 수동 확인: 단독 runtime DB integration, pnpm check, PostgreSQL 잔여 테스트 DB 및 app 테이블 조회.
- 결과: PASS — unit 15개, integration 31개, skip 0개와 lint/typecheck/format/build 통과. 상세 테스트 범위는 TEST_REPORT P1-06을 따른다. fresh clone은 이번 단계에서 별도 실행하지 않았다.
- 종료 시 테스트 DB 0개, 개발 app 테이블 18개 유지. BROS DB 중지, volume 보존.

### 미해결 사항 및 Blocker
- P1-06 blocker 없음. BLK-001 원격 CI/required check 미검증 유지.
- SIGTERM 및 진행 중 HTTP 요청 drain은 P1-07에서 검증한다. 업무 잠금/CAS·인가·오류 응답은 해당 service/API 단계에 남는다.

### 다음 작업 인수 조건
- 작업 범위: P1-07 Fastify app/logger/error handler, /health liveness, /ready DB readiness, graceful shutdown.
- 금지 변경: 적용한 baseline과 DEC-20260912-010 코드 정책을 변경하지 않는다. HTTP 경로에 browser/image 작업을 추가하거나 raw DB 오류를 노출하지 않는다. P1-09 Queue는 별도 단계다.
- 완료 조건: DB 장애와 무관한 /health 200, DB down/up을 반영하는 /ready, SIGTERM 종료·pool 정리, 공통 계약에 따른 invalid request 400/response serializer, 전체 품질 검사 PASS.
- 재검토가 필요한 조건: 종료 대기 시간/DB 장애 처리와 공통 오류·배포 계약의 충돌이 확인될 때.

## DEC-20260912-013 — P1-07 Fastify API·상태 확인·종료 구현 완료

- 일자: 2026-09-12
- 종료 단계/분야: P1-07 구현 및 HTTP·DB·프로세스 통합 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-07, P1-08 HTTP 연결 검증, P1-06 DB 오류 이벤트 보완
- 검토 범위와 근거: DEC-20260912-012, WBS P1-07, 구현 보완 명세 3.2/4장, packages/core/contracts/db와 apps/api, TEST_REPORT P1-07. Fastify 공식 Server reference 및 설치된 5.12.4 타입/종료 구현을 대조했다.
- 상태: ACCEPTED
- supersedes: 없음. 기존 계약의 후속 구체화이며 baseline/코드 집합을 변경하지 않는다.

### 확정 결정
- Fastify 5.12.4를 정확한 버전으로 고정하고 createApiApp과 startApi/main을 분리한다. import만으로 네트워크·signal·migration 부수효과가 발생하지 않는다.
- /health는 DB 독립 200, /ready는 제한 시간 내 DB query 성공 200, 실패 503이다. TypeBox 응답 schema와 no-store를 사용한다. readiness가 migration 완료를 의미하지는 않는다.
- readiness 기본 1000ms(1~30000), shutdown 기본 10000ms(1~300000)를 typed config로 제공한다. 진행 중인 DB probe를 공유해 HTTP timeout 이후 pool 대기열이 누적되지 않도록 한다. SQL 자체는 기존 DB timeout으로 제한한다.
- SIGTERM/SIGINT는 새 요청 차단, 현재 응답 drain, pool 종료를 수행한다. 종료 중 응답에 Connection: close를 명시한다. 종료는 멱등이며 deadline 또는 종료 실패 시 process exit 1이다.
- 공통 오류 상태에 500 INTERNAL_ERROR를 추가한다. validation/JSON/content-type 400, payload 413, 404, 500, 503은 고정 메시지 envelope를 사용한다. requestId는 서버가 생성하고 외부 header를 그대로 사용하지 않는다.
- 공통 redacted logger를 주입하며 요청 완료의 requestId/statusCode/elapsedMs와 고정 오류 코드만 기록한다. raw DB 오류·SQL·body·URL을 응답/로그에 넣지 않는다.
- 실제 네트워크 단절로 발견한 checked-out pg Client error 이벤트도 처리한다. P1-06 idle Pool 오류 처리만으로 충분하다고 간주하지 않는다.
- P1-07은 로컬 검증 PASS, 다음 P1-09 READY다. 원격 Linux signal 실행/CI 증거는 로컬 결과와 구분한다.

### 기각한 선택지와 이유
- /health에서 DB 조회: DB 장애를 프로세스 생존 실패와 혼동한다.
- readiness마다 새 대기 query 생성: 반복 timeout에서 pool 대기열이 누적된다.
- 종료 시작 시 모든 연결 즉시 파괴: 진행 중 응답과 transaction이 불필요하게 중단된다.
- 종료 무제한 대기: 복구/배포 시간이 무한히 지연될 수 있다.
- 외부 requestId 및 원문 예외 반환: 신뢰 경계와 민감정보 보호를 약화한다.

### 변경 파일
- apps/api/src/app.ts, apps/api/src/bootstrap.ts, apps/api/src/main.ts, apps/api/src/index.ts, apps/api/package.json
- packages/core/src/config/index.ts, packages/core/test/config.test.mjs, packages/contracts/src/http.ts, packages/db/src/client.ts
- package.json, pnpm-lock.yaml, .env.example
- tests/integration/api.integration.test.mjs, tests/integration/api-process.integration.test.mjs, tests/integration/api-process-fixture.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md, doc/BROS_구현_보완_명세_v0.2.md

### 검증 증거
- 실행 명령 또는 수동 확인: pnpm check, pnpm install --frozen-lockfile, disposable DB TCP 장애/복구, 실제 HTTP drain, 별도 Node 프로세스 종료 테스트, 잔여 테스트 DB 확인.
- 결과: PASS — unit 16개, integration 35개, skip 0개 및 전체 품질 검사. Windows SIGTERM handler dispatch·deadline 검증이며 POSIX OS 신호 검증은 이번 환경에서 NOT_RUN. 상세는 TEST_REPORT P1-07.
- 종료 시 테스트 DB 0개, 기존 app 테이블 18개. BROS DB 중지 및 volume 보존.

### 미해결 사항 및 Blocker
- P1-07 로컬 blocker 없음. BLK-001 원격 GitHub CI/required check 유지; Linux 실신호 분기의 실행 증거도 해당 CI에서 확인한다.
- 업무 인증·인가, Queue/Worker, 운영 프로세스 관리자 설정은 후속 단계다. API에 browser/image 경로는 추가하지 않았다.

### 다음 작업 인수 조건
- 작업 범위: P1-09 QueuePort, pg-boss adapter lifecycle, queue names/retry/backoff 기본값, system.test publish/consume 및 provider ID string 기록.
- 금지 변경: 적용된 baseline, DEC-20260912-010 코드 정책, API/Worker 처리 경계 및 자동승인 기본 OFF를 변경하지 않는다. P1-10 Worker bootstrap은 별도 단계다.
- 완료 조건: enqueue/consume/retry/restart recovery 통합 검증, 종료 및 자원 정리, 전체 품질 검사 PASS와 단계 기록.
- 재검토가 필요한 조건: queue 재시도와 업무 멱등성·외부 부작용 계약이 충돌하거나 pg-boss가 별도 schema/권한 결정을 요구할 때.

## DEC-20260913-001 — P1-09 QueuePort·pg-boss 구현 및 crash 복구 검증 완료

- 일자: 2026-09-13
- 종료 단계/분야: P1-09 구현·DB 통합 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-09
- 검토 범위와 근거: DEC-20260912-013, 설계서 13.2, WBS P1-09/10, 보완 명세 4장, 설치된 pg-boss 12.31.0 API/types/종료 구현, 공식 [트랜잭션 adapter 계약](https://pgboss.io/api/adapters), TEST_REPORT P1-09.
- 상태: ACCEPTED
- supersedes: 없음. 후속 구현 결정이며 baseline/기존 코드 정책은 유지한다.

### 확정 결정
- QueuePort는 start/publish/work/stop 및 string provider ID를 제공한다. pg-boss 12.31.0 adapter는 명시적 start에서 bros_queue schema의 vendor migration을 실행한다. 업무 app 및 baseline과 분리한다.
- 5개 문서상 queue 이름을 고정한다. payload는 UUIDv7 publicId 참조만 받고 원문 데이터·secret·handler 반환값을 provider에 저장하지 않는다. 원문 handler 예외도 고정 오류로 변환한다.
- 기본 retry 2회, 지연 5초, jitter 포함 exponential backoff cap 300초, active 만료 900초, polling 1초, 감시 30초, stop 대기 10000ms다. 검증된 adapter options로 조정하며 browser.run 자동 retry는 부작용 안전 경로가 생기기 전까지 0회다.
- queue별 instance 동시성 1/batch 1이다. 큐 pool은 별도 소유하며 DatabaseConfig의 max/connectionTimeoutMs를 사용한다. 완료 보관 1일·대기/retry 보관 14일, scheduler OFF다. 시간·SQL timeout 적용 범위 및 상세 한도는 RUNBOOK에 명시했다.
- 공식 fromKysely bridge로 업무 쓰기와 enqueue가 같은 tx에 참여한다. commit 전 receipt는 잠정 값이며 실패 시 둘 다 rollback한다. 신규 Outbox 또는 임의 재조정 로직을 추가하지 않는다.
- start/stop은 멱등, 종료/실패 instance는 재사용하지 않는다. stop은 새 호출 차단 후 진행 작업을 기다리고 deadline/잔류 handler 시 reject한다. 소유 Worker는 이를 정상 종료로 기록하지 않아야 한다.
- 작업 선점은 업무 exactly-once 보장이 아니다. 중복 publish·crash 재전달을 전제로 후속 service가 request_key/상태/외부 부작용을 검증한다.
- P1-09는 PASS, P1-10은 READY다. 개발 DB의 queue schema 설치는 Worker 시작 단계에서 수행하며 이번 검증은 disposable DB만 사용했다.

### 기각한 선택지와 이유
- 업무 commit과 별도 enqueue 또는 즉시 Outbox 추가: 설치 버전이 동일 tx를 지원하므로 유실 구간이나 새 업무 테이블을 만들 이유가 없다.
- queue ID를 UUID 타입으로 고정: provider 구현 세부를 업무 저장 계약에 강제한다.
- 큐 선점을 exactly-once로 해석: crash 후 외부 부작용은 DB transaction만으로 복원할 수 없다.
- browser.run에 일반 자동 retry 적용: 외부 클릭 결과 불명확 상태에서 중복 실행 위험이 있다.
- 원문 오류·payload 보관 및 무제한 종료 대기: 민감정보 노출 및 배포/복구 지연 위험이 있다.

### 변경 파일
- packages/queue/package.json, packages/queue/src/index.ts, packages/queue/src/port.ts, packages/queue/src/pg-boss.ts, packages/queue/test/queue.test.mjs
- pnpm-lock.yaml, tests/integration/queue.integration.test.mjs, tests/integration/queue-process-fixture.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거
- 실행 명령 또는 수동 확인: pnpm check, pnpm install --frozen-lockfile, disposable DB atomic enqueue/소비/retry/stop, 별도 프로세스 SIGKILL·재기동, 종료 전 metadata 조회.
- 결과: PASS — unit 18개, integration 43개, skip 0개와 전체 정적 검사/build. queue 단독 8개 PASS. fresh clone은 이번 단계 NOT_RUN.
- 최종 테스트 DB 0개, 개발 app 테이블 18개·bros_queue 테이블 0개. BROS DB 중지, volume 보존.

### 미해결 사항 및 Blocker
- P1-09 blocker 없음. BLK-001 원격 CI/required check 유지.
- Worker 프로세스 bootstrap·stop deadline 시 종료·성공 업무 로그/상태 기록은 P1-10에서 검증한다. 이번 소비 프로세스는 테스트 fixture다.
- 운영 schema migration 계정과 최소 권한 분리는 P6, 스케줄 및 browser 재시도 안전 조건은 P5에서 확정한다.

### 다음 작업 인수 조건
- 작업 범위: P1-10 Worker startup/shutdown, handler registry, system.test 성공 로그/상태 기록, 미실행 후 재기동 처리 및 실패 retry.
- 금지 변경: baseline, 열린 코드 정책, 자동승인 OFF, browser 자동 retry 0을 임의로 변경하지 않는다. API에 image/browser 처리나 새로운 업무 테이블을 추가하지 않는다.
- 완료 조건: 실제 Worker 프로세스로 system.test publish/consume/성공 기록, 실패/retry, DB+queue 자원 정리 및 stop deadline 실패 경로, 전체 품질 검사 PASS와 단계 기록.
- 재검토가 필요한 조건: 성공 상태 기록에 현재 업무 schema로 표현되지 않는 새 모델이 필요하거나 queue 만료/재시도가 업무·외부 부작용 계약과 충돌할 때.

## DEC-20260913-002 — P1-10 Worker·system.test 업무 이력 및 종료 검증 완료

- 일자: 2026-09-13
- 종료 단계/분야: P1-10 구현·실제 프로세스/DB 통합 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-10, P1-09 adapter 동시성/시도 metadata 연결
- 검토 범위와 근거: DEC-20260913-001, WBS P1-10, 설계서 12.17/12.18/13장, 보완 명세 3.2/4장, 기존 schema 및 Worker/Queue 구현, TEST_REPORT P1-10.
- 상태: ACCEPTED
- supersedes: 없음. P1-09의 instance 동시성 기본 1은 유지하며 configurable localConcurrency를 추가한다.

### 확정 결정
- Worker runtime과 process bootstrap/CLI를 분리한다. 명시적 시작에서 baseline 확인·queue 초기화·system.test handler 등록 후 ready가 된다. import는 프로세스 시작이나 signal 등록을 하지 않는다.
- system.test의 durable 이력은 기존 automation_job(INTERNAL)과 automation_run으로 기록한다. 신규 업무 테이블·baseline migration 변경은 없다. 예약 smoke 정의는 manual 허용/정기 비활성, parallel 허용, cooldown 0, timeout 900초, retry 기본 2다.
- job_code는 기존 schema에서 고유하지 않다. 전용 advisory transaction lock (0x42524f53,110)과 정의 row lock으로 smoke 정의 생성/중복 요청을 직렬화한다. 복수 또는 호환되지 않는 정의는 임의 선택/수정하지 않고 거절한다. P5의 일반 job_code 정책은 별도다.
- 실행 생성·enqueue·provider ID 저장은 같은 transaction이며 request_key 재요청은 기존 receipt를 반환한다. CLI 매 호출은 새 요청이다.
- handler는 일치하는 INTERNAL 정의·provider ID·진행 상태·attempt를 확인하고 RUNNING을 기록한다. platform count 조회 후 SUCCESS 및 안전한 로그/result를 남긴다. 일시 실패는 RETRY_WAIT, 실제 queue retryLimit을 소진하면 FAILED다.
- SUCCESS의 동일 provider 재전달은 no-op이다. 최종 갱신은 RUNNING/provider ID/attempt 조건으로 수행하여 늦은 시도의 덮어쓰기를 차단한다. crash 후 더 높은 attempt의 복구를 허용한다. 내부 smoke 이상의 외부 부작용 보장은 주장하지 않는다.
- WORKER_CONCURRENCY는 adapter localConcurrency(1~100)에 반영한다. QueueJob에 실제 retryLimit metadata를 제공해 업무 실패 상태와 provider retry 정책을 맞춘다.
- 종료는 readiness 해제 → queue drain → 업무 DB pool 순서다. WORKER_SHUTDOWN_TIMEOUT_MS 기본 15000(1000~300000) 내 완료되지 않거나 queue 정리가 실패하면 소유 bootstrap은 exit 1로 종료한다. 진행 handler 아래에서 DB만 먼저 닫지 않는다.
- P1-10은 로컬 PASS다. 개발 DB의 queue schema, smoke 정의 및 성공 이력을 보존하고 서비스는 중지했다. 다음은 P1-11 Admin Skeleton이다.

### 기각한 선택지와 이유
- provider completed만 성공 기록으로 사용: 업무 이력의 Source of Truth가 queue 내부 보존 정책에 종속된다.
- 새 smoke 업무 테이블 추가 또는 baseline 변경: 기존 INTERNAL/run 모델로 표현 가능하다.
- job_code UNIQUE 가정이나 임의 첫 정의 선택: 실제 schema에 없는 제약을 가정하고 동시 생성/복수 정의를 오인한다.
- 결과를 publicId만으로 갱신: 이전 attempt가 최신 성공을 덮어쓸 수 있다.
- queue drain 실패 후 DB만 닫고 정상 종료 보고: handler의 진행 상태를 손상시키고 실패를 숨긴다.

### 변경 파일
- apps/worker/src/runtime.ts, bootstrap.ts, main.ts, system-test.ts, send-system-test.ts, index.ts
- packages/core/src/config/index.ts, packages/core/test/config.test.mjs, packages/queue/src/pg-boss.ts, packages/queue/src/port.ts
- .env.example, package.json, tests/integration/worker.integration.test.mjs, tests/integration/worker-process-fixture.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거
- 실행 명령 또는 수동 확인: pnpm check, Worker 프로세스 통합 테스트, CLI enqueue 및 개발 DB startWorker smoke, 종료 전 잔여 테스트 DB/업무 테이블 조회.
- 결과: PASS — unit 18개, integration 52개, skip 0개 및 전체 정적 검사/build. 개발 smoke SUCCESS/attempt 1/정상 종료. 상세는 TEST_REPORT P1-10.
- 실제 POSIX SIGTERM 및 새 clean clone은 이번 단계 NOT_RUN. 테스트 DB 0개, app 테이블 18개, BROS DB 중지·volume 보존.

### 미해결 사항 및 Blocker
- P1-10 로컬 blocker 없음. BLK-001 원격 CI/required check 및 Linux 실제 SIGTERM 확인은 유지한다.
- 현재 registry는 system.test만 등록한다. P5 일반 automation·Browser·취소·schedule reconciliation 및 P6 정기 heartbeat/운영 계정은 미구현이다.
- P1-11/P1-12와 원격 CI가 남아 있으므로 Phase 1 Gate 전체 PASS는 아니다.

### 다음 작업 인수 조건
- 작업 범위: P1-11 React/Vite Admin Skeleton — routing, API client, layout, loading/error 처리, Dashboard placeholder와 /health 상태 표시.
- 금지 변경: baseline 및 기존 코드/재시도/자동승인 정책 변경, 업무 인증 기반을 우회하는 신규 변경 API, browser/image 처리를 API로 이동하지 않는다.
- 완료 조건: 실제 개발 서버에서 Admin 접근 및 /health 상태 표시, API 장애 UI, build/관련 UI 검증과 전체 품질 검사 PASS, 단계 기록.
- 재검토가 필요한 조건: Admin 접근 origin/인증·배포 경계가 기존 보완 명세와 충돌하거나 새로운 업무 API가 필요할 때.

## DEC-20260913-003 — P1-11 React/Vite Admin 기반과 health 경계 확정

- 일자: 2026-09-13
- 종료 단계/분야: P1-11 Admin Skeleton 구현·UI/개발 서버 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-11
- 검토 범위와 근거: DEC-20260913-002, WBS P1-11, 보완 명세의 인증/API 경계, P1-07 `/health`와 P1-08 TypeBox contract, 현재 workspace·품질 검사 구성, TEST_REPORT P1-11.
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- Admin은 React 19 + React Router 7 + Vite 8 정적 SPA로 구성한다. `/`는 Dashboard, 미등록 route는 명시적 404 화면이며 공통 sidebar/topbar layout을 사용한다.
- 브라우저 API client는 상대 경로 `/health`만 호출한다. 개발 중 Vite가 기본 `http://127.0.0.1:3000`으로 `/health`, `/ready`, `/api`를 프록시하고 필요할 때 `VITE_API_PROXY_TARGET`으로 개발 대상만 바꾼다. 프로덕션 배포는 같은 origin에서 해당 경로를 API로 라우팅해야 한다.
- Dashboard는 최초 loading, 정상 상태와 확인 시각, 오류 메시지와 수동 retry를 제공한다. health 요청은 3초 후 중단하며 HTTP 오류·연결 실패·계약 불일치를 구분하되 원문 response body나 내부 연결 정보를 UI에 노출하지 않는다.
- health 응답 판정은 `@bros/contracts`의 `isHealthResponse`가 공용 TypeBox schema를 사용한다. `{status:"ok"}` 외 추가 필드나 다른 상태는 정상으로 간주하지 않는다.
- Admin 테스트는 Vitest/jsdom으로 UI·API client를 검증하고 루트 `test:unit`에 포함한다. 별도 Node integration test는 실제 Vite 개발 서버의 SPA entry와 health proxy를 검증한다.
- P1-11은 로컬 PASS다. UI skeleton은 인증 없는 공개 probe만 읽으며 업무 API나 인증 우회를 추가하지 않았다.

### 기각한 선택지와 이유

- 브라우저에서 API 절대 URL 직접 호출: 환경별 CORS·origin 설정을 늘리고 이후 Admin 인증 경계를 복잡하게 한다.
- `/health`의 HTTP 200만으로 정상 표시: proxy 오응답이나 계약 drift를 정상으로 오판한다.
- 외부 웹폰트 runtime import: Admin 최초 렌더가 외부 네트워크와 제3자 요청에 종속된다.
- 오류 원문 또는 upstream body 표시: 내부 주소·실패 상세·민감정보가 운영 UI에 노출될 수 있다.

### 변경 파일

- apps/admin/package.json, apps/admin/tsconfig.json, apps/admin/index.html, apps/admin/vite.config.ts
- apps/admin/src/App.tsx, main.tsx, styles.css, api/health.ts, components/AppShell.tsx, pages/DashboardPage.tsx, pages/NotFoundPage.tsx 및 관련 Vitest 파일
- packages/contracts/src/http.ts, packages/contracts/test/contract.test.mjs
- tests/integration/admin-vite.integration.test.mjs, package.json, pnpm-lock.yaml, eslint.config.js
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거

- 실행 명령 또는 수동 확인: `pnpm check`, `CI=true pnpm install --frozen-lockfile`, `node --test tests/integration/admin-vite.integration.test.mjs`, 실제 `pnpm admin:dev` + 브라우저 렌더/console 확인.
- 결과: PASS — Admin Vitest 6개, Node unit 19개, integration 53개, fail/skip 0개와 lint/typecheck/format/build 성공. 실제 브라우저 health 정상 표시 및 warning/error 0건.
- 프로덕션 배포와 원격 CI는 NOT_RUN. 테스트 후 Admin/mock server와 BROS PostgreSQL을 중지했고 DB volume은 보존했다.

### 미해결 사항 및 Blocker

- P1-11 로컬 blocker 없음. BLK-001 원격 CI/required check는 유지한다.
- 프로덕션 정적 호스팅/reverse proxy, Admin 인증·인가, 업무 route는 후속 P6 및 각 업무 Task에서 구현·검증한다.
- Phase 1에는 P1-12 ObjectStorage Local Adapter와 원격 CI 검증이 남아 있다.

### 다음 작업 인수 조건

- 작업 범위: P1-12 ObjectStorage Port / Local Adapter — put/delete/signedUrl 계약, local adapter, object key 규칙과 Worker의 provider 비의존 경계.
- 금지 변경: baseline migration, 기존 UUID/상태/재시도/자동승인 정책, P1-11 same-origin 경계와 Admin에 업무 API·인증 우회를 임의로 추가하지 않는다. 저장 파일이나 URL에 secret·원본 파일명을 노출하지 않는다.
- 완료 조건: put/get 또는 signed URL 조회/delete lifecycle, path traversal와 root 탈출 차단, 원자적 write 및 실패 정리, provider 이름 없는 Worker 사용 예, 전체 품질 검사 PASS와 단계 기록.
- 재검토가 필요한 조건: 현재 image storage_key 모델이 안전한 object key를 표현하지 못하거나 local signedUrl 의미가 운영 provider 계약과 양립하지 않을 때.

## DEC-20260913-004 — P1-12 ObjectStorage Port와 안전한 Local Adapter 확정

- 일자: 2026-09-13
- 종료 단계/분야: P1-12 Storage 계약·Local filesystem 구현 및 보안/회귀 검증
- 작성 모델/추론 수준: gpt-5.6-sol / high (사용자 선택)
- 관련 WBS Task: P1-12, 후속 P2-11/P4-11/P5-13/P6-04 저장 경계
- 검토 범위와 근거: DEC-20260913-003의 인수 조건, WBS P1-12 Acceptance/Test, 설계서 17.9/19장, 보완 명세 2.2의 Local logical root/이미지 저장 metadata, 기존 StorageConfig와 Worker/Image package 의존 경계, TEST_REPORT P1-12.
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- `ObjectStorage`는 provider/bucket, `putObject`, `getObject`, 멱등 `deleteObject`, `getSignedUrl`만 공통 계약으로 노출한다. body와 read 결과는 Web `ReadableStream<Uint8Array>` 경계를 사용하며 저장 결과는 provider, logical bucket, objectKey, byte size다.
- Local adapter는 `StorageConfig.localRoot`를 절대 root로 고정하되 외부 결과에는 노출하지 않는다. 기본 logical bucket은 `local`, provider는 DB 코드와 같은 `LOCAL`이다. `createObjectStorage` 소비자는 driver/provider별 filesystem API를 알 필요가 없다. 미구현 R2 선택은 명시적 오류다.
- Object key는 최대 1024자의 `/` 구분 portable ASCII segment로 제한한다. segment는 최대 128자, 영숫자로 시작·종료하고 내부 `A-Za-z0-9._-`만 허용한다. 빈 segment, dot traversal, 역슬래시, URI escape/drive 표현, control 문자와 Windows 예약명은 거절한다. 호출자는 원본 파일명/secret 대신 public ID·hash·revision·고정 artifact 명을 사용한다.
- put은 target과 같은 parent의 exclusive 임시 파일에 stream을 기록하고 file sync 후 rename한다. 실패 시 임시 파일을 지우고 기존 target을 보존한다. 동시 parent 생성은 EEXIST를 재검증하며 target 교체는 원자적 가시성을 제공한다. 업무 immutable key·중복 수렴은 후속 service의 DB UNIQUE/잠금 책임이다.
- root 및 모든 ancestor는 실제 directory인지 확인하고 symlink/junction을 거절한다. read는 final target을 no-follow로 열고 regular file만 스트리밍한다. delete는 같은 경계를 적용하고 missing은 성공으로 처리한다. root는 BROS 전용 쓰기 디렉터리여야 하며 다른 로컬 프로세스와의 악의적 TOCTOU 경쟁까지 보장하지 않는다.
- Local signed URL은 `bros-local://<bucket>/<key>?expires=...&signature=...` 형식, HMAC-SHA256, 1~86400초 만료로 고정한다. 절대 root를 노출하지 않고 같은 adapter의 `getObjectBySignedUrl`에서 변조·만료를 검증한다. 브라우저 직접 URL은 아니며 후속 preview API가 스트림을 전달한다. instance 임시 key로 서명하므로 재시작 후 URL은 무효다.
- StorageError는 안정된 code/고정 message만 제공하고 원문 filesystem/stream error나 절대 경로를 cause에 보관하지 않는다.

### 기각한 선택지와 이유

- key를 단순 `resolve(root,key)`로만 검사: encoded traversal, 역슬래시와 symlink/junction ancestor를 충분히 차단하지 못한다.
- 원본 파일명 또는 절대경로를 object key/DB/signed URL에 사용: 개인정보·로컬 구조 노출과 provider 이식성 문제를 만든다.
- target에 직접 stream 쓰기: 중간 실패나 reader가 부분 파일을 관측할 수 있다.
- `file://` Local preview URL: 절대 root를 노출하고 만료·변조 검증을 제공하지 못한다.
- Local adapter 내부 HTTP server 자동 시작: storage import/생성이 port lifecycle과 인증되지 않은 네트워크 listener를 암묵적으로 추가한다.
- R2 요청을 Local로 자동 fallback: 운영 설정 오류를 숨기고 잘못된 저장 위치에 데이터를 쓴다.

### 변경 파일

- packages/storage/src/port.ts, object-key.ts, local.ts, index.ts
- packages/storage/test/storage.test.mjs, storage.typecheck.ts
- packages/storage/package.json, packages/storage/tsconfig.type-tests.json
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거

- 실행 명령 또는 수동 확인: `pnpm --filter @bros/storage run build`, `pnpm --filter @bros/storage run typecheck`, `node --test packages/storage/test/storage.test.mjs`, PostgreSQL healthy 상태에서 `pnpm check`.
- 결과: PASS — storage 9개, Admin Vitest 6개, 전체 Node unit 28개, integration 53개, fail/skip 0개와 lint/typecheck/format/build 성공.
- R2/S3, POSIX 권한/실 symlink, HTTP preview와 원격 CI는 NOT_RUN. 테스트는 OS temp root를 제거했고 BROS PostgreSQL은 중지·volume 보존했다.

### 미해결 사항 및 Blocker

- P1-12 로컬 blocker 없음. BLK-001 때문에 P1-14와 Phase 1 Gate는 아직 PASS가 아니다.
- Local signed URL은 process lifetime 범위다. 장기 URL 요구가 생기면 SecretProvider 기반 signing key와 rotation/expiry 정책을 새 결정으로 추가해야 한다.
- filesystem root에 다른 계정이 쓰기 가능한 환경의 적극적 race 공격은 범위 밖이다. 배포 권한·volume·retention 및 R2 adapter는 P6에서 검증한다.

### 다음 작업 인수 조건

- 작업 범위: Phase 1 Gate 최종 판정과 BLK-001 해소 — GitHub remote 연결, branch/PR에서 실제 CI 실행, `quality` required check 설정 및 실패 merge 차단 증거 기록.
- 금지 변경: 로컬 PASS를 원격 CI PASS로 간주하거나 BLK-001을 근거 없이 해소하지 않는다. baseline, Storage key/서명 계약, 자동승인 OFF와 기존 API/Queue/Worker 정책을 변경하지 않는다.
- 완료 조건: P1-01~14 Acceptance 증거 재대조, clean remote CI 성공, required check의 의도적 실패 차단 확인, blocker/status/test/decision 갱신 후 Phase 1 Gate 판정.
- 재검토가 필요한 조건: 사용할 GitHub repository/branch protection 권한이 없거나 CI 환경에서 Windows 전용으로 검증된 filesystem/signal 동작이 달라질 때.

## DEC-20260913-005 — Phase 1 Gate BLOCKED 판정 및 BLK-001 외부 입력 재확인

- 일자: 2026-09-13
- 종료 단계/분야: Phase 1 Gate 증거 재대조와 원격 CI/merge 차단 검증 시도
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P1-14, Phase 1 Gate
- 검토 범위와 근거: WBS P1-14 및 Phase 1 Gate, 마스터 프롬프트 21장, DEC-20260912-007, DEC-20260913-004, `.github/workflows/ci.yml`, `docs/IMPLEMENTATION_STATUS.md`, `docs/BLOCKERS.md`, `docs/TEST_REPORT.md`, 현재 branch `codex/p1-foundation` commit `b8bed87`
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- Phase 1 Gate는 `BLOCKED`다. P1-01~P1-13의 로컬 PASS와 현재 HEAD의 전체 품질 pipeline PASS는 확인했지만, P1-14의 실제 CI 실패 탐지와 merge/release 차단 가능 조건을 원격에서 검증하지 못했다.
- BLK-001은 `BLOCKED_EXTERNAL_INPUT`으로 유지한다. `git remote -v`가 비어 있고 GitHub CLI 기본 계정의 토큰이 무효여서, 임의 repository를 선택·생성하거나 branch protection을 설정하지 않는다.
- `.github/workflows/ci.yml`의 `quality` job은 원격 repository가 준비되면 required check 대상으로 사용한다. 해소 순서는 remote 연결, branch push/PR, 실제 `quality` 성공, protected base branch에 required check 설정, 의도적 lint/type/test 실패 PR의 merge 차단 증거 기록이다.

### 기각한 선택지와 이유

- 현재 로컬 `pnpm check` PASS만으로 P1-14 또는 Gate를 PASS 처리: WBS P1-14의 CI failure/merge 차단 요구와 DEC-20260912-007의 원격 검증 보류 결정을 충족하지 못한다.
- 계정이나 repository를 추정해 remote 생성·연결: 사용자가 지정하지 않은 외부 저장소와 권한을 변경하게 되며 branch protection 검증 대상도 불명확하다.

### 변경 파일

- docs/DECISIONS.md
- docs/IMPLEMENTATION_STATUS.md
- docs/BLOCKERS.md
- docs/TEST_REPORT.md

### 검증 증거

- 실행 명령 또는 수동 확인: BROS PostgreSQL healthy 확인 후 `CI=true` 및 테스트 DSN으로 `pnpm check`; `git remote -v`; `gh auth status`; `.github/workflows/ci.yml` 검토.
- 결과: 로컬 quality pipeline PASS — Admin Vitest 6개, Node unit 28개, integration, lint/typecheck/format/build 성공. 원격 GitHub Actions, required check, 의도적 실패 PR merge 차단은 대상 remote와 유효 권한 부재로 NOT_RUN.

### 미해결 사항 및 Blocker

- BLK-001: 사용할 GitHub repository URL과 branch protection 권한이 필요하다. GitHub CLI는 설치되어 있으나 현재 기본 계정 토큰이 무효다.
- Linux GitHub Actions에서 P1-07/P1-10의 실제 POSIX SIGTERM 분기와 P1-12 Windows 외 filesystem 차이를 함께 확인해야 한다.

### 다음 작업 인수 조건

- 작업 범위: 사용자가 지정한 GitHub repository를 `origin`으로 연결하고 유효한 GitHub 인증으로 현재 branch를 push한 뒤 P1-14 원격 검증을 완료한다.
- 금지 변경: 사용자가 지정하지 않은 repository 생성·사용, 실제 CI 증거 없는 PASS 선언, baseline 및 기존 계약 변경.
- 완료 조건: `quality` job 성공 URL/commit 기록, required check 설정 확인, 의도적으로 실패한 PR이 merge 불가임을 확인한 증거, BLK-001/P1-14/Gate 상태와 테스트·결정 기록 갱신.
- 재검토가 필요한 조건: repository의 기본 branch 이름, branch protection 정책 또는 GitHub Actions 실행 권한이 문서의 `main`/`quality` 전제와 다를 때.

## DEC-20260913-006 — P1-14 원격 CI 검증과 Phase 1 Gate PASS

- 일자: 2026-09-13
- 종료 단계/분야: GitHub repository 연결, P1-14 원격 CI, required check 실패 차단, Phase 1 Gate 최종 판정
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 기본(세부 모델·추론 수준 미노출)
- 관련 WBS Task: P1-14, Phase 1 Gate
- 검토 범위와 근거: DEC-20260912-007, DEC-20260913-005, WBS P1-14/Phase 1 Gate, `.github/workflows/ci.yml`, PR #1/#2, Actions run 34746278320/34746426348/34747040147, repository ruleset 23149676, 로컬 `pnpm check`
- 상태: ACCEPTED
- supersedes: DEC-20260913-005

### 확정 결정

- GitHub 원격은 `https://github.com/hyunglory/bros`이고 기본 브랜치는 `main`이다. 사용자가 공개 전환을 명시적으로 승인했으므로 repository visibility는 PUBLIC이다.
- Bash가 `./packages/**`를 shell glob으로 확장해 pnpm filter를 깨뜨린 최초 원격 CI 결함을 확인했다. `package.json`에서 filter 패턴을 따옴표로 고정한 commit `5175a58`을 공통 계약으로 채택한다.
- PR #1의 원격 Linux CI SUCCESS를 P1-14 정상 경로 증거로 채택한다. 같은 commit의 로컬 전체 품질 pipeline도 PASS했다.
- 기본 브랜치 보호는 classic protection 대신 repository ruleset `main required quality` ID 23149676으로 구현한다. ruleset은 기본 브랜치에 strict required check `install / lint / typecheck / test / build`만 적용하며 bypass actor가 없다.
- 임시 PR #2에서 의도적 lint FAILURE와 `mergeStateStatus=BLOCKED`를 확인했으므로 required check의 merge 차단은 재현됐다. PR #2는 merge하지 않고 닫고 임시 브랜치를 삭제했다.
- P1-14를 PASS, BLK-001을 RESOLVED, Phase 1 Gate를 PASS로 전환한다.

### 기각한 선택지와 이유

- GitHub Free private repository 유지: protection과 ruleset API가 모두 403을 반환해 required check를 적용할 수 없다. Pro 업그레이드 대신 사용자가 PUBLIC 전환을 승인했다.
- classic branch protection API: required check 외에 관리자 적용, PR 리뷰, 접근 제한 필드를 함께 갱신해야 해 변경 범위가 넓다. 기존 설정을 건드리지 않고 required check 하나만 추가하는 repository ruleset을 선택했다.
- 최초 원격 FAIL을 정상 검증으로 간주: 실제 shell 호환성 결함이므로 수정 후 전체 로컬·원격 SUCCESS를 별도로 확인했다.

### 변경 파일

- package.json
- docs/DECISIONS.md
- docs/IMPLEMENTATION_STATUS.md
- docs/BLOCKERS.md
- docs/TEST_REPORT.md
- docs/RUNBOOK.md
- 외부 상태: GitHub repository `hyunglory/bros`, PR #1/#2, ruleset 23149676

### 검증 증거

- 실행 명령 또는 수동 확인: `CI=true pnpm build:packages`; BROS PostgreSQL healthy 상태에서 테스트 DSN으로 `pnpm check`; `gh pr checks`; `gh pr view`; GitHub ruleset 적용 조회.
- 결과: PASS — 로컬 Admin 6개, Node unit 28개, integration 53개, fail/skip 0개와 lint/typecheck/format/build 성공. PR #1 Actions run 34746426348 SUCCESS/CLEAN. PR #2 Actions run 34747040147 FAILURE 및 `mergeStateStatus=BLOCKED`.

### 미해결 사항 및 Blocker

- Phase 1 blocker 없음. BLK-001은 해소했다.
- repository는 PUBLIC이다. 향후 private 전환이 필요하면 GitHub Pro 이상에서 동일 ruleset 기능과 required check 동작을 먼저 확인한다.

### 다음 작업 인수 조건

- 작업 범위: Phase 2의 P2-01 기존 수집 데이터 Discovery와 Phase 5의 P5-01 Browser Flow Discovery를 입력 준비 상황에 따라 착수한다.
- 금지 변경: ruleset 23149676의 required check를 검증 없이 완화하거나 우회하지 않는다. 실제 상품/화면 입력 없이 Discovery 결과를 추정해 확정하지 않는다.
- 완료 조건: P2-01은 실제 샘플 20건 mapping dry-run, P5-01은 실제 대상 화면의 prepare/authenticate/execute/verify/cleanup 수동 walkthrough와 명세 기록.
- 재검토가 필요한 조건: repository visibility를 private으로 되돌리거나 CI check 이름, 기본 브랜치, workflow event를 변경할 때.

## DEC-20260913-007 — P2-01 Source Discovery 입력 경계와 차단 상태

- 일자: 2026-09-13
- 종료 단계/분야: P2-01 착수 전 실제 입력 감사와 Source Mapping Spec 골격 작성
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 기본(세부 모델·추론 수준 미노출)
- 관련 WBS Task: P2-01, 선행 영향을 받는 P2-02/P2-03
- 검토 범위와 근거: DEC-20260913-006, WBS P2-01~P2-04와 9장 사용자 입력, 설계서 14.1~14.3, 보완 명세 2장/5장, `docs/DB_MIGRATION_SPEC.md`, 현재 저장소 파일 전수 목록
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- Phase 1 Gate 이후 첫 Discovery는 Phase 2 선행 체인을 여는 P2-01로 진행한다.
- 실제 저장 위치·형식과 비식별화된 샘플 최소 20건이 없으므로 P2-01은 `BLOCKED_EXTERNAL_INPUT`이다. Mapping Spec 골격을 작성한 사실을 sample mapping 완료나 PASS로 간주하지 않는다.
- 기존 `SourceProductInput` 필드와 DB 경계를 Source Mapping Spec에 정리하되 실제 원본 컬럼, Adapter 종류와 변환 규칙은 입력 증거 없이 확정하지 않는다.
- DB 필수 수집 시각, 상품 재고 입력, 금액 표현, `SourceOptionInput`/`SourceImageInput`, 식별자 type 변환은 실제 샘플을 확인한 뒤 P2-02에서 확정할 계약 공백이다.
- raw는 원래 업무 구조를 보존하지만 token/cookie/password/API key/signed query는 저장 전에 제거하거나 해당 입력을 거절한다.

### 기각한 선택지와 이유

- 임의 CSV fixture 20건을 만들어 dry-run PASS 처리: 실제 데이터 형식 기반이라는 P2-01 목적과 Acceptance Criteria를 충족하지 못한다.
- P5-01을 먼저 완료 처리: Browser 대상 URL·단계·로그인/2FA·성공 신호도 제공되지 않아 동일하게 실제 Flow PASS가 불가능하다.
- 설계 예시만으로 옵션·이미지 타입을 확정: 실제 Source 구조와 향후 Adapter 계약을 되돌릴 가능성이 크다.

### 변경 파일

- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/DECISIONS.md
- docs/IMPLEMENTATION_STATUS.md
- docs/BLOCKERS.md
- docs/TEST_REPORT.md

### 검증 증거

- 실행 명령 또는 수동 확인: `rg --files` 저장소 전수 목록; 요구사항·WBS·DB 명세의 source/import/option/image/identifier 필드 대조; Markdown format 검증.
- 결과: IMPLEMENTED_NOT_VALIDATED — Discovery 문서 골격 작성 완료. 실제 데이터 inventory와 20건 mapping dry-run은 NOT_RUN.

### 미해결 사항 및 Blocker

- BLK-003: 실제 원본 위치·형식, 비식별 샘플 20~100건, 옵션/이미지/품번 컬럼, 전체 상품·옵션 규모와 필드 의미가 필요하다.
- P5-01도 대상 URL·단계·입력값·실행 빈도·성공 신호·로그인/2FA 방식이 없어 실제 walkthrough를 수행할 수 없다.

### 다음 작업 인수 조건

- 작업 범위: 제공된 원본을 읽기 전용으로 inventory하고 최소 20건을 `docs/SOURCE_MAPPING_SPEC_v0.1.md`의 표에 mapping dry-run한다.
- 금지 변경: 실제 자격증명을 문서/fixture에 저장, 원본 외부 ID를 숫자로 변환, 통화·브랜드·품번·재고를 근거 없이 추정, 샘플 없이 P2-01 PASS 선언.
- 완료 조건: 원본 위치/형식/규모, 실제 컬럼 mapping, 결측·중복·옵션·이미지·품번 사례, 20건 row별 결과가 기록되고 P2-02 계약 입력이 확정된다.
- 재검토가 필요한 조건: 원본에 secret/개인정보가 포함되거나 API/DB live 접근, 재배포 제한 데이터, 여러 플랫폼 혼합 입력이 확인될 때.

## DEC-20260913-008 — 더망고 XLSX 20건 Mapping Dry-run과 P2-01 완료

- 일자: 2026-09-13
- 종료 단계/분야: P2-01 기존 수집 데이터 Discovery와 실제 샘플 mapping dry-run
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P2-01, 후속 P2-02/P2-03
- 검토 범위와 근거: `examples/더망고_상품정보_20260913.xlsx`, WBS P2-01/P2-02, 설계서 14.1~14.5, `docs/DB_MIGRATION_SPEC.md`, DEC-20260913-007
- 상태: ACCEPTED
- supersedes: DEC-20260913-007의 `BLOCKED_EXTERNAL_INPUT` 판정과 실제 입력 미제공 사실을 대체한다. 당시의 입력 안전·추정 금지 원칙은 유지한다.

### 확정 결정

- 첫 실제 입력은 XLSX이며 첫 Source Adapter 유형은 `XlsxImportAdapter`로 한다. 입력 시트는 `상품 목록`, header는 5행, 상품 데이터는 6행부터다.
- `원본사이트`는 현재 DB seed에 맞춰 `MUSINSA.com → MUSINSA`, `OliveYoung.co.kr → OLIVEYOUNG`으로 변환한다.
- `externalProductId`는 `원본상품코드` 문자열만 사용한다. 더망고 `고유값`은 legacy export 행 ID이므로 누락 외부 ID의 대체값으로 사용하지 않는다.
- 원가·판매가 0은 26,375건 전체에서 exporter 한계로 확인됐다. 실제 0원이나 KRW로 추정하지 않고 가격과 통화를 null로 mapping한다.
- 20건 표본은 플랫폼·재고·옵션·설명 결측·외부 ID 결측·검토 상태 10개 조건에서 원본 순서상 처음 2건씩 선택한다. 같은 파일 hash와 규칙으로 표본을 재현한다.
- dry-run 결과는 MAPPED 8건, MAPPED_WITH_REVIEW 8건, REJECTED 4건이다. 거절 4건은 필수 `externalProductId` 결측이며 예상한 validation 분기다.
- 유효 source identity 16건의 중복은 0건이다. 표본 옵션 20개에서 옵션명·옵션이미지 pairing mismatch도 0건이다.
- P2-01 Acceptance Criteria가 충족됐으므로 P2-01은 PASS, BLK-003은 RESOLVED로 변경한다.
- 원본 Excel의 재배포 가능 여부가 확인되지 않았으므로 원본 파일은 Git에 추가하지 않는다.

### 기각한 선택지와 이유

- 시트 첫 20행만 사용: OLIVEYOUNG의 단일 무옵션 유형만 포함해 옵션과 필수값 실패 경계를 검증하지 못한다.
- 누락 `externalProductId`를 더망고 `고유값`이나 이미지 경로 숫자로 대체: 플랫폼 원본 ID라는 의미와 멱등성 key를 훼손한다.
- 내보내기 가격 0과 통화 KRW를 그대로 저장: 원본 요약이 실제 가격 미제공이라고 명시하므로 잘못된 가격 사실을 만든다.
- 원본 Excel을 결과 증거로 commit: 재배포 권한이 확인되지 않았고 전체 운영 상품 데이터가 포함돼 있다.

### 변경 파일

- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/BLOCKERS.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- 원본 동일성: 5,002,588 bytes, SHA-256 `1C3D35AF15093510E613CF9504FAFD28E264B1D15AABB95B215DC564AC8E2FDE`.
- workbook read: bundled Python/openpyxl의 `read_only=True`, `data_only=True`; 원본 저장 동작 없음.
- inventory 결과: 26,375건, MUSINSA 16,133건, OLIVEYOUNG 10,242건, 옵션 상품 3,722건.
- 20건 dry-run: 표본 20, 유효 identity 16, identity 중복 0, 옵션 pairing mismatch 0, 대표이미지 20, 민감정보 의심 0.
- 결과: PASS — P2-01 field table과 실제 20건 row-level mapping 결과를 Source Mapping Spec에 기록했다.

### 미해결 사항 및 Blocker

- P2-02에서 `stockStatus`, `ImportContext.collectedAt`, decimal 표현, `SourceOptionInput`과 `SourceImageInput`을 확정해야 한다.
- 원본상품코드·추정 URL이 없는 전체 407건은 자동 import 대상이 아니며 별도 보강 또는 거절 경로가 필요하다.
- 실제 가격과 통화는 이 Excel에서 복구할 수 없다. 관리자 화면/API 등 별도 source가 필요하다.
- P5-01 Browser Flow Discovery 입력은 아직 제공되지 않았다.

### 다음 작업 인수 조건

- 작업 범위: P2-02 표준 계약을 실제 샘플에 맞춰 타입·validation·issue code로 구현하고 valid/partial/invalid fixture를 작성한다.
- 금지 변경: legacy `고유값`을 플랫폼 외부 ID로 승격, 원본 0을 실제 가격으로 저장, KRW 추정, 옵션 이름만으로 외부 SKU ID 생성, 재배포 확인 전 원본 Excel commit.
- 완료 조건: top-level/option/image 타입, 수집 시각과 재고 정책, decimal 표현, validation 결과가 문서와 코드에서 일치하고 valid/partial/invalid 테스트가 PASS한다.
- 재검토가 필요한 조건: 실제 가격 source, 행별 수집 시각, 외부 SKU ID, 옵션별 재고/가격 또는 상세 이미지가 추가 제공될 때.

## DEC-20260914-001 — P2-02 SourceProductInput 표준 계약 확정

- 일자: 2026-09-14
- 종료 단계/분야: P2-02 Source Product 표준 계약과 validation 경계 구현
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 추론 수준 미노출)
- 관련 WBS Task: P2-02, 후속 P2-03
- 검토 범위와 근거: DEC-20260913-008, `docs/SOURCE_MAPPING_SPEC_v0.1.md`, WBS P2-02/P2-03, `docs/DB_MIGRATION_SPEC.md`, TypeBox 공통 계약과 실제 XLSX 20건 dry-run 결과
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260913-008의 P2-02 미확정 항목을 해소한다.

### 확정 결정

- `SourceProductInput` 필수 필드는 `platformCode`, `externalProductId`, `productName`, `raw`다. brand, URL, price/currency, stock, identifier, option, image는 원본에 있을 때만 전달한다.
- 수집 시각은 제품마다 추정하지 않는다. `SourceImportContext.collectedAt`에 timezone이 명시된 RFC 3339 실행 시각을 필수 주입하고 파일명 등에서 확인된 source 기준일은 선택 `sourceAsOfDate`로 분리한다.
- 상품과 option 재고는 `UNKNOWN | IN_STOCK | OUT_OF_STOCK`만 사용한다. 이번 XLSX의 수량 31을 정확한 재고량으로 저장하지 않는다.
- 금액은 PostgreSQL `numeric(20,4)`에 손실 없이 들어가는 비음수 canonical decimal string으로 제한한다. top-level 또는 option 가격이 하나라도 있으면 대문자 3자 `currencyCode`가 필수다.
- option은 원문 이름, 0 기반 source 순서와 raw를 필수로 갖고 외부 SKU, 가격, 재고, option 이미지 URL은 선택이다. source별 이름에서 DB `option_key`를 안정화하는 책임은 Adapter가 아닌 Core Importer에 둔다.
- 상품 image는 `MAIN | DETAIL`, 역할별 0 기반 순서, URL과 raw를 갖는다. option 이미지는 `options[].imageUrl`에 직접 연결해 DB source SKU 경계와 맞춘다.
- identifier type은 현재 DB 계약의 9개 값만 허용한다. top-level과 하위 object의 미정 필드는 거절한다.
- raw는 JSON-compatible 값만 허용하며 cycle, 비정상 수, prototype object와 secret성 key를 거절한다. URL userinfo와 credential/signature query도 거절하고 validation 실패에는 code와 path만 반환해 원본값을 노출하지 않는다.
- option sourceOrder와 externalSkuId, image 역할/순서, identifier type/value 중복 및 복수 MAIN image는 명시적 issue code로 거절한다.

### 기각한 선택지와 이유

- 금액을 JavaScript number로 전달: `numeric(20,4)`의 큰 정수와 소수 정밀도를 Adapter 단계에서 잃을 수 있다.
- 파일 기준일을 모든 행의 수집 시각 자정으로 변환: 원본에 없는 timezone과 행별 수집 시각을 생성한다.
- legacy `고유값` 또는 option 이름으로 외부 ID를 생성: source identity와 재수집 멱등성을 훼손한다.
- source DTO에 DB `option_key`를 필수화: source 원문 보존과 Core 정규화 책임이 섞여 Adapter 간 계약이 불안정해진다.
- schema 구조 검사만 사용하거나 raw를 무제한 허용: JSON 저장 실패, 자격증명 보관, URL parser 예외와 중복 row를 Core/DB까지 늦게 전달한다.

### 변경 파일

- packages/contracts/src/source-product.ts
- packages/contracts/src/index.ts
- packages/contracts/test/source-product.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- 실행 명령 또는 수동 확인: `pnpm --filter @bros/contracts run build`, contracts typecheck, `node --test packages/contracts/test/source-product.test.mjs`, `pnpm lint`, 기존 BROS PostgreSQL에 test DSN을 process 주입한 `pnpm check`.
- 결과: PASS — 신규 계약 validation 8개, 전체 Admin Vitest 6개, Node unit 36개, integration 53개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.
- 원격 결과: 구현 commit `fdc3034`의 PR #1 GitHub Actions run 34779705905와 required check `install / lint / typecheck / test / build`가 1분 39초에 PASS했다.
- 원본 보호: `examples/`는 untracked 상태로 유지했고 Git 변경 집합에 포함하지 않았다.

### 미해결 사항 및 Blocker

- P2-02 blocker는 없다. P2-03 실제 XLSX parsing과 row-level mapping은 아직 구현하지 않았다.
- 원본상품코드·추정 URL이 없는 전체 407건은 P2-03에서도 자동 ID를 만들 수 없으며 reject 결과로 보존해야 한다.
- 실제 가격/통화, 행별 수집 시각, 외부 SKU ID와 option별 가격·재고는 이 XLSX에서 복구할 수 없다.
- 원본 Excel의 재배포 가능 여부는 확인되지 않았으므로 fixture는 원본 행 복제가 아닌 최소 비식별 계약 사례로 작성해야 한다.

### 다음 작업 인수 조건

- 작업 범위: `gpt-5.6-terra / medium`으로 P2-03 `XlsxImportAdapter`를 구현하고 실제 XLSX 구조를 표준 `SourceProductInput`과 row별 validation 결과로 변환한다.
- 금지 변경: P2-02 계약을 Adapter 편의로 재해석, legacy ID fallback, export 가격 0이나 KRW 추정, option 이름 기반 external SKU 생성, 원본 Excel 또는 운영 상품 원문을 Git에 추가.
- 완료 조건: sheet/header 검증, platform mapping, product/option/image/raw 변환, import context 주입, valid/partial/reject fixture와 실제 20건 기대 집계가 자동 테스트에서 재현되고 전체 `pnpm check`가 PASS한다.
- 재검토가 필요한 조건: Adapter 구현이 현 계약으로 표현할 수 없는 실제 필드를 발견하거나 XLSX parser 의존성·formula/date 처리에서 보안 또는 재현성 문제가 확인될 때. 이 경우 기존 결정을 덮어쓰지 않고 새 결정으로 변경 근거를 남긴다.

## DEC-20260914-002 — P2-03 XlsxImportAdapter 구현 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-03 첫 Source Adapter 구현과 실제 XLSX 변환 검증
- 작성 모델/추론 수준: gpt-5.6-terra / medium (사용자 지정)
- 관련 WBS Task: P2-03, 후속 P2-04/P2-05/P2-07
- 검토 범위와 근거: DEC-20260914-001, `docs/SOURCE_MAPPING_SPEC_v0.1.md`, WBS P2-03, `examples/더망고_상품정보_20260913.xlsx`의 read-only 결과, `packages/contracts/src/source-product.ts`
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260914-001의 P2-03 인수 조건을 구현으로 완료한다.

### 확정 결정

- 첫 Adapter는 새 `@bros/importer` workspace의 `XlsxImportAdapter`다. API는 workbook buffer만 받아 경로 권한과 파일 I/O를 caller에게 분리한다.
- `상품 목록` 시트와 5행 header, 25MB compressed input, 100,000 data row 상한을 검증한다. 읽기 과정은 원본을 쓰거나 Git에 추가하지 않는다.
- 파일명 `더망고_상품정보_YYYYMMDD.xlsx`의 날짜만 선택 `sourceAsOfDate`로 파생한다. `collectedAt`은 호출자가 주입하거나 adapter 실행 시각으로 만든다.
- `MUSINSA.com → MUSINSA`, `OliveYoung.co.kr → OLIVEYOUNG`만 허용한다. 외부 ID는 `원본상품코드` 문자열만 사용하며 legacy `고유값` fallback은 없다.
- A:U header와 cell value는 valid `SourceProductInput.raw`에 보존한다. formula와 비 JSON cell, unsupported platform, 잘못된 product URL, 손실성 option pairing, 가격 형식은 row-level safe issue code로 거절한다.
- 0 가격은 가격·통화 미제공으로 유지한다. 수집 가격이 nonzero인데 통화가 없으면 P2-02 계약 validation이 거절한다. 재고수는 stock status로만 변환한다.
- 실제 원본 26,375행은 `MAPPED` 25,945행, `REJECTED` 430행으로 변환됐다. 20행 대표 locator는 16 mapped/4 rejected이며 4건은 모두 외부 ID 결측이다.
- `exceljs 4.4.0`은 실제 workbook metadata를 해석하지 못해 제거했다. 공개 Apache-2.0 repository와 package integrity를 확인한 `@e965/xlsx 0.20.3`을 lockfile에 고정했다.

### 기각한 선택지와 이유

- `exceljs 4.4.0` 유지: 실제 원본을 읽을 때 workbook metadata 파싱 실패가 재현돼 P2-03 Acceptance Criteria를 충족하지 못한다.
- 원본 Excel을 test fixture로 commit: 재배포 권한이 확인되지 않았고 운영 상품 원문을 repository에 넣게 된다.
- 외부 ID·가격·통화를 추정해 reject를 줄이기: DEC-20260913-008과 DEC-20260914-001의 source identity와 가격 사실성 결정을 위반한다.
- formula 결과를 계산하거나 무시: adapter가 계산 엔진이 되거나 raw 보존을 훼손한다. 현재는 명시적으로 거절해 재현성을 유지한다.

### 변경 파일

- packages/importer/package.json
- packages/importer/tsconfig.json
- packages/importer/src/index.ts
- packages/importer/src/xlsx-import-adapter.ts
- packages/importer/test/xlsx-import-adapter.test.mjs
- pnpm-lock.yaml
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- fixture: full/partial product, product·option·image·raw mapping, legacy ID fallback 거절, 20행 대표 집계, option/URL/price/formula 오류, sheet/header/size 경계의 5개 unit test PASS.
- 실제 입력: SHA-256 `1C3D35AF15093510E613CF9504FAFD28E264B1D15AABB95B215DC564AC8E2FDE`를 read-only buffer로 변환했다. 총 26,375행, mapped 25,945행, rejected 430행이며 원본은 수정하거나 stage하지 않았다.
- 실행 명령: importer build, adapter unit test, BROS PostgreSQL에 test DSN을 process 주입한 `pnpm check`.
- 결과: PASS — Admin Vitest 6개, Node unit 41개, integration 53개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.

### 미해결 사항 및 Blocker

- P2-03 blocker는 없다. P2-04의 Import Validation/Raw 보존 persistence와 P2-06 upsert는 아직 구현하지 않았다.
- 전체 430개 rejected row 중 407개는 외부 ID 결측이다. 5회 option name count, 24회 option image count issue는 일부 행에 함께 발생할 수 있으며 자동 보정하지 않는다.
- workbook input은 25MB compressed size로 제한하지만 decompressed XML 크기와 ZIP entry count의 별도 상한은 아직 없다. 외부 비신뢰 workbook ingestion을 열기 전 별도 streaming/sandbox 정책을 결정해야 한다.

### 다음 작업 인수 조건

- 작업 범위: P2-04 Import Validation / Raw 보존에서 adapter result를 import row 이력과 raw persistence로 연결하고, 필수값 reject와 optional 결측 수용 정책을 DB 경계까지 검증한다.
- 금지 변경: P2-03 safe issue를 자동 수정, 원본 Excel commit, legacy ID fallback, 가격 0·KRW 추정, `MAPPED` row raw의 secret scan 우회.
- 완료 조건: adapter 결과의 accepted/rejected row가 원본 locator·raw·issue code와 함께 저장되고, 필수값 결측은 명확히 실패하며 브랜드/식별자/가격/이미지 결측은 수용하는 integration test와 전체 `pnpm check`가 PASS한다.
- 재검토가 필요한 조건: source workbook이 25MB 또는 100,000행을 넘거나, formula/rich-text/external link가 실제 source에 나타나거나, untrusted external upload를 지원해야 할 때.

## DEC-20260914-003 — P2-04 Import Validation / Raw 보존 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-04 source input validation 결과의 import 이력화와 safe raw persistence
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본
- 관련 WBS Task: P2-04, 후속 P2-05/P2-06
- 검토 범위와 근거: DEC-20260914-001/002, `docs/SOURCE_MAPPING_SPEC_v0.1.md`, WBS P2-04, `docs/DB_MIGRATION_SPEC.md` import_batch/import_item, `doc/BROS_구현_보완_명세_v0.2.md` 5장 raw 보존 규칙
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260914-002의 P2-04 인수 조건을 구현으로 완료한다.

### 확정 결정

- `createImportValidationService`는 한 source platform의 Adapter row 집합을 하나의 `import_batch`와 append-only `import_item`으로 원자적으로 저장한다. mixed-platform XLSX는 caller가 `platformCode`별 batch로 분리한다.
- `MAPPED` 행은 P2-02 계약을 다시 검증하고 batch platform과 일치할 때만 `PENDING` item으로 저장한다. `REJECTED` 행, contract 재검증 실패, platform mismatch는 `FAILED` item과 첫 safe error code로 기록하며 모든 issue code/path는 raw payload envelope에 보존한다.
- raw payload는 schema version, import context, source locator·row number, validation outcome, raw, valid row의 mapped input을 포함한다. raw secret 검사를 통과하지 못하면 raw와 mapped input을 저장하지 않고 `raw: null` 및 safe issue code/path만 남긴다.
- P2-04는 source_product/source_sku/product_image를 쓰지 않는다. 유효 item은 `PENDING`, batch는 `RUNNING`으로 남겨 P2-06이 `(platform_id, external_product_id)` upsert와 terminal aggregate를 원자적으로 완료한다.
- active `SOURCE` platform이 존재하지 않거나 source row number가 중복되거나 context/source name이 잘못되면 batch를 만들지 않고 safe domain error로 실패한다.

### 기각한 선택지와 이유

- 유효 행을 P2-04에서 `SUCCEEDED` 또는 `CREATED`로 표시: P2-06 upsert 전에는 source product 생성 여부가 확정되지 않아 이력을 거짓으로 만든다.
- raw secret을 mask한 뒤 저장: 제거 전 원문이 오류 경로나 메모리에 남을 수 있고 재현 가능성도 떨어진다. 현재는 해당 raw 전체를 저장하지 않는다.
- source_product를 validation 단계에서 함께 upsert: P2-06의 idempotency·last_seen·변경 필드 책임과 batch finalization을 앞당겨 경계를 흐린다.
- mixed platform 결과를 임의 플랫폼 batch 하나에 저장: platform FK와 import 이력의 의미를 훼손한다.

### 변경 파일

- packages/contracts/src/source-product.ts
- packages/contracts/test/source-product.test.mjs
- packages/importer/package.json
- packages/importer/src/import-validation.ts
- packages/importer/src/index.ts
- packages/importer/src/xlsx-import-adapter.ts
- tests/integration/import-validation.integration.test.mjs
- pnpm-lock.yaml
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- unit: raw-only validation을 포함한 SourceProductInput 계약 및 XLSX Adapter test PASS.
- integration: disposable PostgreSQL에서 valid/invalid row의 `import_batch`/`import_item` status·count·locator·context·raw·issue 저장, unsafe raw null replacement, platform mismatch, source_product 미생성을 확인했다.
- 실행 명령: 기존 BROS PostgreSQL을 health 상태로 시작하고 test DSN을 process에만 주입한 `pnpm check`.
- 결과: PASS — Admin Vitest 6개, Node unit 42개, integration 55개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.

### 미해결 사항 및 Blocker

- P2-04 blocker는 없다. P2-06 전까지 유효 import item과 batch는 의도적으로 pending/running이다.
- 실제 mixed-platform workbook을 실행하는 orchestration entry point는 아직 없다. P2-06 또는 import command에서 platform별 partition을 호출해야 한다.
- 외부 비신뢰 XLSX upload의 decompressed XML/ZIP entry 제한과 sandbox 정책은 P2-03의 미해결 사항으로 유지한다.

### 다음 작업 인수 조건

- 작업 범위: P2-06 Source Product Upsert에서 P2-04의 `PENDING` item을 소비하여 `(platform_id, external_product_id)` 멱등 upsert, last_seen/변경 필드, item action/status와 batch terminal aggregate를 하나의 transaction으로 구현한다.
- 금지 변경: legacy ID fallback, 가격 0·KRW 추정, raw secret 재보존, P2-04만으로 source_product 생성 완료 표시, batch platform 혼합.
- 완료 조건: 같은 import 재실행에서 source_product 중복이 없고 변경 title/price와 last_seen이 결정한 정책으로 반영되며, batch terminal counts와 row action/status가 PostgreSQL integration test 및 전체 `pnpm check`에서 검증된다.
- 재검토가 필요한 조건: importer가 한 batch에 여러 platform을 가져야 하거나 source raw retention 기간/삭제 요구가 확정되거나 untrusted upload를 지원해야 할 때.

## DEC-20260914-004 — P2-06 Source Product Upsert 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-06 source product idempotent upsert와 import batch completion
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본
- 관련 WBS Task: P2-06, 후속 P2-05/P2-07/P2-08
- 검토 범위와 근거: DEC-20260914-001~003, `docs/SOURCE_MAPPING_SPEC_v0.1.md`, WBS P2-06, `docs/DB_MIGRATION_SPEC.md` source_product/import_batch/import_item, baseline migration의 unique·status CHECK
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260914-003의 P2-06 인수 조건을 구현으로 완료한다.

### 확정 결정

- `createSourceProductUpsertService`는 public batch ID로 `RUNNING` batch를 row lock하고 PENDING item을 동일 transaction에서 처리한다. terminal batch는 재실행하지 않는다.
- source identity는 DB의 `(platform_id, external_product_id)` unique key다. insert conflict 후 생성 여부를 판정하고, 동시/반복 import가 source_product를 중복 생성하지 못하게 한다.
- input `collectedAt`이 기존 `source_product.collected_at`과 같거나 새 경우에만 product URL/name/brand/price/currency/stock/raw와 collected_at/last_seen_at을 갱신한다. 더 오래된 입력은 source 값·last_seen을 되돌리지 않고 `MATCHED` item으로만 기록한다.
- 유효 row는 `CREATED`, `UPDATED`, `MATCHED`와 `SUCCEEDED`로 완료한다. persisted mapped input/context/platform/identity가 일치하지 않으면 secret 값을 노출하지 않는 `PERSISTED_INPUT_INVALID` failed item으로 전환한다.
- PENDING 처리가 끝나면 모든 item status를 재집계하여 batch를 `SUCCEEDED`, `PARTIAL_FAILED`, `FAILED` 중 하나로 전이하고 count 합계와 finished_at을 기록한다.
- P2-06은 brand master, source SKU, product image, identifier, MASTER match를 만들지 않는다. source brand는 raw_brand_name에만 보존한다.

### 기각한 선택지와 이유

- application pre-read만으로 create/update 판정: concurrent import에서 두 caller가 모두 부재를 관찰할 수 있다. DB unique conflict가 identity의 최종 보호여야 한다.
- 더 오래된 source도 항상 덮어쓰기: 늦게 도착한 과거 export가 최신 상품명·가격·raw를 되돌린다.
- P2-04 실패 row를 P2-06에서 자동 보정: source identity 추정과 raw 안전 결정을 위반하며 item failure 이력을 훼손한다.
- P2-06에서 brand·SKU·image를 동시에 생성: P2-05/P2-07/P2-10의 독립 검증과 책임 경계를 흐린다.

### 변경 파일

- packages/importer/src/source-product-upsert.ts
- packages/importer/src/index.ts
- tests/integration/source-product-upsert.integration.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- integration: disposable PostgreSQL에서 첫 identity 2건 create, 새 timestamp title/price/currency update, 과거 timestamp MATCHED와 source preservation, source_product duplicate 0, mixed batch terminal count/finished_at을 확인했다.
- 실행 명령: 기존 BROS PostgreSQL을 health 상태로 시작하고 test DSN을 process에만 주입한 `pnpm check`.
- 결과: PASS — Admin Vitest 6개, Node unit 42개, integration 57개, fail/skip 0개. lint, typecheck, format check, 전체 build 성공.

### 미해결 사항 및 Blocker

- P2-06 blocker는 없다. 실제 mixed-platform XLSX orchestration entry point는 아직 없어 caller가 platform별 batch를 분리해야 한다.
- item별 DB write failure의 savepoint/retry policy와 source raw retention 기간은 후속 운영/ingestion 범위에서 결정한다.
- P2-05 Brand Normalizer, P2-07 Identifier Extractor, P2-08 MASTER Matcher는 아직 구현하지 않았다.

### 다음 작업 인수 조건

- 작업 범위: P2-05 Brand Normalizer 또는 P2-07 Embedded Identifier Extractor를 독립적으로 구현한다. P2-08은 두 결과와 P2-06 source_product를 읽기 전까지 착수하지 않는다.
- 금지 변경: legacy ID fallback, 가격 0·KRW 추정, source_product에 자동 MASTER 연결, 과거 source로 최신값 회귀, raw secret 재보존.
- 완료 조건: P2-05는 승인 alias만 brand에 연결하고 unknown brand를 자동 생성하지 않으며, P2-07은 source field/raw의 identifier 후보를 provenance와 함께 추출하는 테스트를 갖는다.
- 재검토가 필요한 조건: source freshness를 collectedAt이 아닌 sourceAsOfDate로 비교해야 하거나, parallel item failure를 계속 처리하는 savepoint policy가 필요하거나, multi-platform batch schema가 필요할 때.

## DEC-20260914-005 — P2-05 Brand Normalizer 구현 및 검증 상태 기록

- 일자: 2026-09-14
- 종료 단계/분야: P2-05 승인 brand alias의 deterministic normalization 및 resolution
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본
- 관련 WBS Task: P2-05, 후속 P2-08/P2-16/P3-01
- 검토 범위와 근거: DEC-20260914-004, `doc/brand_resell_os_design_v0.1.md` 14.4, WBS P2-05/P2-16, `docs/DB_MIGRATION_SPEC.md` brand/brand_alias scope unique, `docs/SOURCE_MAPPING_SPEC_v0.1.md` 11장
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- alias lookup key는 Unicode NFKC, trim, 연속 공백 통합, 대소문자 정규화만 적용한다. 이 key는 DB의 `brand_alias.alias_norm`과 정확히 비교한다.
- platform-scoped alias가 active platform에서 먼저 선택되고, 없을 때 active brand의 global alias를 선택한다. 이 순서는 `(COALESCE(platform_id, 0), alias_norm)` unique scope와 일치한다.
- 빈 raw brand, 미등록 또는 비활성 platform, 미등록 alias, 비활성 brand alias는 `UNRESOLVED`로 반환한다. P2-05는 brand/alias/source_product를 생성하거나 수정하지 않는다.
- `source_product.raw_brand_name`은 P2-06의 raw source 기록으로 유지한다. P2-08이 P2-05의 resolve 결과를 MASTER 후보 판단에 사용하며, P2-16이 사람의 alias 승인·재처리를 담당한다.

### 기각한 선택지와 이유

- 구두점 제거·부분 일치·유사도 기반 자동 alias 연결: 승인되지 않은 표기를 다른 brand에 잘못 연결할 수 있어 P2-05의 확실한 alias 경계를 위반한다.
- unknown brand 자동 생성: WBS P2-05/P2-16의 검수 경로를 우회하고 brand master를 오염시킨다.
- P2-05가 source_product를 MASTER에 연결: identifier와 MASTER matching이 없는 상태에서 제품 정체성을 확정하는 것이므로 P2-08 책임이다.

### 변경 파일

- packages/importer/src/brand-normalizer.ts
- packages/importer/src/index.ts
- packages/importer/test/brand-normalizer.test.mjs
- tests/integration/brand-normalizer.integration.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- unit: Unicode/case/whitespace normalization과 구두점 보존 test PASS — Node unit 총 44개 PASS.
- integration: PostgreSQL 18 일회용 DB에서 platform alias 우선, global Korean alias, unknown/blank/unknown platform/inactive brand의 unresolved 및 brand non-creation test PASS.
- 정적 검증: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` PASS.
- 결과: IMPLEMENTED_NOT_VALIDATED — 전체 `pnpm check` 종료 증거와 원격 CI PASS는 없다. P2-06 Actions run `34795563889`는 `cancelled`여서 성공 증거로 사용하지 않는다.

### 미해결 사항 및 Blocker

- P2-05 code/target test blocker는 없다. 전체 테스트 runner의 종료 코드와 원격 CI를 다시 확인해야 PASS 상태로 전이할 수 있다.
- P2-16의 alias 승인/거절 API와 unresolved source 재처리는 아직 구현하지 않았다.

### 다음 작업 인수 조건

- 작업 범위: P2-07 Embedded Identifier Extractor를 source field/raw에서 provenance와 함께 구현하거나, P2-16에서 unresolved brand 검수 경로를 구현한다.
- 금지 변경: unknown alias 자동 생성, fuzzy alias 자동연결, source_product에 MASTER 자동 연결, raw secret 재보존.
- 완료 조건: P2-07은 candidate value/norm/type/provenance를 안전하게 추출하고, P2-16은 승인 alias만 이후 resolve되며 재처리 이력을 보존한다.
- 재검토가 필요한 조건: alias의 언어별 transliteration 또는 punctuation-insensitive matching을 도입하려면 labeled data의 오매칭 기준과 human approval policy를 먼저 결정해야 한다.

## DEC-20260914-006 — P2-07 Embedded Identifier Extractor 구현 및 검증 상태 기록

- 일자: 2026-09-14
- 종료 단계/분야: P2-07 explicit/raw embedded identifier candidate extraction
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본
- 관련 WBS Task: P2-07, 후속 P2-08/P3-01
- 검토 범위와 근거: DEC-20260914-001/002/004/005, WBS P2-07, `packages/contracts/src/source-product.ts`, `docs/SOURCE_MAPPING_SPEC_v0.1.md` 3·12장, `docs/DB_MIGRATION_SPEC.md` identifier candidate schema
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- explicit `SourceProductInput.identifiers[]`와 nested raw JSON allowlist key에 붙은 string만 candidate로 추출한다. raw text 전체나 product name을 regex/fuzzy matching하지 않는다.
- raw key는 NFKC 및 공백/underscore/hyphen 차이를 정규화하여 MODEL_NO, STYLE_CODE, PRODUCT_NO, MPN, GTIN, EAN, UPC, BARCODE, BRAND_CODE에만 map한다.
- candidate norm은 NFKC, trim, 연속 공백 통합, 대문자화다. candidate type+norm이 같으면 하나의 candidate로 합치고 explicit field/raw JSON pointer provenance를 모두 유지한다.
- raw numeric identifier 값은 leading zero 손실을 안전하게 복원할 수 없으므로 후보로 사용하지 않는다. raw traversal은 depth 16, node 10,000, candidate 128 상한을 넘으면 `truncated: true`를 반환한다.
- P2-07은 product_identifier, identifier_resolve_run, identifier_candidate, source_product를 쓰지 않고 MASTER 연결이나 자동 승인도 수행하지 않는다.

### 기각한 선택지와 이유

- 상품명·free text에서 형식 추정: 문자열 우연 일치와 브랜드/모델 충돌을 candidate evidence로 오인할 수 있다.
- raw number를 string으로 변환: leading zero 및 원래 표기 손실을 되돌릴 수 없다.
- P2-07에서 identifier candidate DB row까지 생성: resolve run lifecycle·rank·decision/evidence schema는 P3 resolver 책임이며 source input extraction을 앞당겨 결합한다.

### 변경 파일

- packages/importer/src/embedded-identifier-extractor.ts
- packages/importer/src/index.ts
- packages/importer/test/embedded-identifier-extractor.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- unit: explicit/raw candidate, duplicate provenance, arbitrary/numeric raw non-inference, deterministic traversal/truncation을 포함한 Node unit 47개 PASS.
- build: `pnpm --filter @bros/importer run build` PASS.
- 결과: IMPLEMENTED_NOT_VALIDATED — P2-05와 함께 전체 `pnpm check`의 종료 증거 및 원격 CI PASS가 없다.

### 미해결 사항 및 Blocker

- P2-07 code/target test blocker는 없다. `truncated: true` 입력을 P2-08/P3 resolver가 자동 확정 금지 또는 review-required로 해석하는 정책은 그 단계에서 구현한다.
- 첫 실제 XLSX는 내부 상품코드가 모두 공란이므로 P2-07 후보 0건은 정상 결과이며, 새로운 source가 allowlist 밖의 identifier field를 제공하면 새 alias 결정이 필요하다.

### 다음 작업 인수 조건

- 작업 범위: P2-08 MASTER Matcher를 P2-05/P2-06/P2-07 결과 위에서 설계·구현하거나 P2-16 unresolved brand review를 구현한다.
- 금지 변경: free-text identifier 자동추정, numeric raw 복원, identifier 자동 승인, product_identifier/master 자동 생성.
- 완료 조건: P2-08은 hard conflict와 evidence 부족을 review로 남기고, candidate provenance 및 brand resolution을 재현 가능한 판단 입력으로 보존한다.
- 재검토가 필요한 조건: 실제 source가 barcode array/object 또는 새로운 identifier header를 제공하거나 candidate 제한을 넘는 raw payload가 확인될 때.

## DEC-20260914-007 — P2-08 MASTER Matcher v1 구현 및 검증 상태 기록

- 일자: 2026-09-14
- 종료 단계/분야: P2-08 existing MASTER candidate discovery와 evidence/conflict decision
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본
- 관련 WBS Task: P2-08, 후속 P2-09/P2-10/P2-16
- 검토 범위와 근거: DEC-20260914-004~006, WBS P2-08/P2-09, `doc/brand_resell_os_design_v0.1.md` 14.6/14.8, `doc/BROS_구현_보완_명세_v0.2.md` 5.1, `docs/SOURCE_MAPPING_SPEC_v0.1.md` 11~13장, baseline의 MASTER/identifier/SKU index와 pg_trgm
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- P2-08은 P2-05 brand result, P2-07 identifier candidate/provenance, product name과 source option name을 입력으로 기존 MASTER를 조회·평가한다. 결과는 권고이며 source link, match status, MASTER/SKU/identifier를 수정하지 않는다.
- 후보 pool은 `BRAND_CODE`를 제외한 normalized identifier exact와 resolved brand 내 pg_trgm similarity 0.3 이상 상위 20건을 합친다. 0.3은 후보 조회 recall 하한이며 승인 임계값이 아니다. title similarity만으로는 어떤 score에서도 기존 MASTER를 선택하지 않는다.
- verified GTIN/EAN/UPC 계열 exact, verified same-type MODEL_NO/MPN/STYLE_CODE exact, resolved brand와 same-type identifier exact는 strong evidence다. evidence에는 source JSON-pointer provenance와 기존 identifier public ID를 보존한다.
- strong 후보가 하나이고 hard conflict와 extraction truncation이 없을 때만 `MATCH_EXISTING`을 권고한다. strong 복수, resolved brand 불일치, GTIN 계열 불일치, 동일 model type 불일치, 명확한 option 비중첩, inactive MASTER, truncated extraction은 `REVIEW_REQUIRED`다.
- 기존 candidate evidence가 없고 resolved brand와 `BRAND_CODE`가 아닌 상품 identifier가 함께 있을 때만 `NEW_MASTER_CANDIDATE`를 반환한다. brand 또는 상품 identity 근거가 부족하면 review이며, P2-09는 신규 후보도 곧바로 생성 완료로 해석하지 않고 transaction/advisory lock 안에서 identifier를 재조회해야 한다.

### 기각한 선택지와 이유

- 상품명 유사도 기반 자동 연결: labeled holdout과 승인 임계값이 없고 WBS가 명시적으로 title-only 자동확정을 금지한다.
- `BRAND_CODE`를 상품 identifier로 exact match: 브랜드 식별자를 상품 identity로 오인해 같은 브랜드 전체에서 오매칭을 만들 수 있다.
- P2-08에서 source link 또는 MASTER를 즉시 생성: P2-09의 transaction, advisory lock, lock 후 재조회 경계를 우회해 병렬 import 중 중복 MASTER를 만들 수 있다.
- GTIN/EAN/UPC를 서로 다른 type으로만 비교: 동일한 국제 상품번호가 source와 MASTER에서 다른 GTIN 계열 label로 저장된 경우 기존 MASTER를 놓친다.

### 변경 파일

- packages/importer/src/master-matcher.ts
- packages/importer/src/index.ts
- packages/importer/package.json
- packages/importer/test/master-matcher.test.mjs
- tests/integration/master-matcher.integration.test.mjs
- pnpm-lock.yaml
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- unit: exact, ambiguous, conflicting GTIN/model, similar-title different variant, truncated extraction, new candidate, insufficient evidence의 matcher 8개 시나리오 PASS.
- integration: PostgreSQL 18.6 disposable DB에서 baseline/pg_trgm 후보 조회, GTIN↔verified EAN exact, provenance/public ID evidence, source_product non-write를 확인했다.
- 전체 실행: 최종 근거 규칙 직전 `TEST_DATABASE_URL`을 일회용 PostgreSQL에 process 주입한 `pnpm check` PASS — Admin Vitest 6개, Node unit 54개, integration 59개, fail/skip 0개; lint/typecheck/format/build PASS. 최종 근거 규칙 변경 후 전체 unit을 다시 실행해 Admin 6개·Node 55개 PASS했고 importer lint/typecheck/build도 PASS했다.
- 결과: IMPLEMENTED_NOT_VALIDATED — 최종 코드에 대한 공개 원격 CI는 이번 요청에서 전송 승인이 없어 NOT_RUN이다.

### 미해결 사항 및 Blocker

- P2-08 로컬 구현 blocker는 없다. name candidate threshold/limit은 auto-accept 기준이 아니며 실제 labeled import corpus의 recall·latency 측정 전까지 운영 승인 수치로 사용하지 않는다.
- 첫 실제 XLSX 20행은 identifier 후보가 0건이므로 P2-08 strong-match 실데이터 평가는 불가능하다. 실제 identifier 포함 source 표본이 확보되면 후보 recall과 false-review를 별도로 측정한다.
- P2-05/P2-07/P2-08 최종 공개 원격 CI PASS가 없어 구현 상태 표는 `IMPLEMENTED_NOT_VALIDATED`를 유지한다.

### 다음 작업 인수 조건

- 작업 범위: P2-09 MASTER Creator / Race Control. P2-08 결과를 소비해 기존 MASTER 연결 또는 신규 MASTER 생성 여부를 transaction에서 처리한다.
- 금지 변경: title-only 자동 연결, truncated/conflict/ambiguous 결과의 자동 처리, global identifier UNIQUE 추가, lock 밖 신규 MASTER 생성, source provenance 폐기.
- 완료 조건: 동일 strong identifier의 동시 요청이 `pg_advisory_xact_lock` 또는 동등 lock 안 재조회 후 하나의 MASTER로 수렴하고, review 결과는 source/import 상태에 보존되며, lock timeout/retry 및 identifier 없는 유사상품 동시 유입 integration test가 PASS한다.
- 재검토가 필요한 조건: verified identifier의 전역 소유권 제약을 추가하거나, title/option threshold를 자동승인에 사용하거나, 실제 데이터에서 GTIN type equivalence가 오매칭을 만든다는 증거가 확인될 때.

## DEC-20260914-008 — P2-09 MASTER Creator / Race Control 로컬 구현·검증 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-09 MASTER 생성·Source 연결·race control
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 모델 ID·추론 수준 미노출)
- 관련 WBS Task: P2-09, 후속 P2-10/P2-12/P2-16
- 검토 범위와 근거: AGENTS.md, 운영 지침 v0.3, DEC-20260914-004~007, WBS P2-09, 설계서 14.6~14.8, 구현 보완 명세 2장/5.1, `docs/SOURCE_MAPPING_SPEC_v0.1.md` 14장, 현재 DB schema/P2-04~08 구현.
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260914-007의 P2-09 인수 조건을 구체화한다. P2-08의 기존 strong/conflict 결정은 유지하고 SKU 생성 전 옵션 metadata 조회를 추가한다.

### 확정 결정

- 입력은 P2-06 완료 item public UUID이며 저장한 mappedInput/context를 재검증한다. P2-05/07/08을 transaction 내부에서 호출해 외부 caller가 보낸 match 권고만으로 생성하지 않는다.
- batch→item→source row lock 후 모든 상품 identity advisory transaction lock을 정렬해서 얻는다. GTIN/EAN/UPC는 같은 family, model은 같은 type 범위이며 BRAND_CODE는 제외한다. 브랜드를 lock key에서 제외해 같은 번호·다른 브랜드도 충돌 평가한다. `bros/master-identity/v1` namespace와 SHA-256 signed BIGINT key 규약은 판단 버전과 독립이다.
- READ COMMITTED에서 lock 대기 후 재조회하고 선택 MASTER row lock 후 다시 평가한다. 신규 MASTER·미검증 identifier·source link·item 처리 이력·batch terminal 집계는 하나의 transaction이다. 전역 identifier UNIQUE와 새 migration은 추가하지 않는다.
- 신규 MASTER는 IMPORT_STRONG_IDENTIFIER/REVIEW_REQUIRED/CANDIDATE, identifier는 is_verified=false/SOURCE_EMBEDDED다. source MATCHED는 제품 연결만 의미하며 Resolver 자동승인 설정·식별자 검증 상태를 승격하지 않는다.
- 같은 item 재요청은 raw_json.masterCreation의 결과를 반환한다. 원본 envelope와 P2-06 source action, 브랜드/추출 입력·match evidence/conflict·provenance를 보존한다. 검수 재처리는 새 item으로 한다.
- ambiguous/truncated/conflict/title-only/근거 부족은 검수다. 복수 identity 값은 SKU scope가 불명확해 기존 연결·신규 생성 모두 차단한다. 기존 다른 product_id는 보존한다. 오래된 source snapshot은 skip하고 동일 시각의 explicit identifiers/options 충돌은 검수한다.
- lock timeout 기본 1초·3회 시도이며 55P03/40P01/40001만 새 transaction에서 bounded retry한다. 다른 DB 오류의 원문은 노출하지 않고 commit 응답 불명확 시 동일 item 재호출로 복구한다.
- P2-06 batch 종료 이력은 유지하고 P2-09 item 결과에 맞춰 terminal 집계를 SQL로 재계산한다. pipeline 전체 완료의 표시·집계 통합은 P2-12가 인수한다. 신규 MASTER의 원본 옵션 metadata는 P2-10 전 variant 검수 근거다.
- 별도 P5 worktree가 작업 중 생성된 것을 확인했다. 현재 checkout의 검사가 다른 checkout에 영향을 받지 않도록 `.worktrees/`만 Git·Prettier 제외 경로로 추가했다.

### 기각한 선택지와 이유

- lock 이전 matcher 결과로 생성: 대기 중 다른 transaction의 신규 MASTER를 놓친다.
- 첫 identifier 하나만 잠금: 교집합이 있는 복수 identifier의 순서가 다르면 중복 생성 가능성이 있다.
- 신규 식별자를 verified로 저장: source 추출 근거를 승인으로 오인한다.
- 기존 연결 교체·검수 자동 병합: 기존 매핑과 variant/brand 검수 경계를 훼손한다.
- terminal batch를 RUNNING으로 회귀: 기존 P2-06 완료 이력을 덮어쓴다.
- 다른 worktree의 포맷 수정 또는 API의 50ms 제한 완화: P2-09 변경과 무관한 동시 작업/검증 계약에 영향을 준다.

### 변경 파일

- packages/importer/src/master-service.ts
- packages/importer/src/master-matcher.ts
- packages/importer/src/index.ts
- packages/importer/test/master-service.test.mjs
- tests/integration/master-service.integration.test.mjs
- .gitignore, .prettierignore
- docs/SOURCE_MAPPING_SPEC_v0.1.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/DECISIONS.md

### 검증 증거

- 실제 PostgreSQL 18.6 일회용 컨테이너에서 전용 통합 12개 시나리오(부모 포함 13개) PASS. 실제 lock 대기의 transaction 변경을 관찰하여 rollback/retry를 검증했고 강제 DB 실패 후 부분 쓰기가 없음을 확인했다.
- 최종 `pnpm check` exit 0: Admin 6개, Node unit 57개, integration 72개, fail/skip 0개 및 lint/typecheck/format/build PASS. `git diff --check` PASS.
- 초기 포맷 범위 실패와 중간 API readiness 타이밍 실패는 TEST_REPORT P2-09에 기록했다. API 단독 재현 및 최종 전체 검사는 통과했다.
- 결과: 로컬 PASS, 원격 CI NOT_RUN이므로 구현 현황은 IMPLEMENTED_NOT_VALIDATED.

### 미해결 사항 및 Blocker

- 로컬 P2-09 blocker 없음. 공개 원격 push/CI는 수행하지 않았다.
- 모든 MASTER/identifier writer가 동일 잠금 규약을 준수해야 한다. 임의 SQL, 공유 identifier가 없는 중복 상품, 운영 규모에서의 recall/성능은 보장하지 않는다.
- P2-12에서 P2-06 source 단계 완료와 MASTER/SKU/image를 포함한 전체 pipeline 완료를 통합해야 한다. P2-10은 원본 옵션 metadata와 정규화 SKU key의 비교 경계를 인수한다.
- 기존 API readiness test의 50ms 초기 연결 검증은 타이밍 민감 가능성이 있다. 재발 시 별도 test-harness 작업으로 다룬다.

### 다음 작업 인수 조건

- 작업 범위: P2-10 SKU Normalizer / Mapper의 deterministic option_key·option_json·source_sku 연결과 재import 멱등성.
- 금지 변경: identifier 자동 verified, title-only 병합, advisory lock namespace 무단 변경, 검수 결과 자동 승격, 기존 link/provenance 폐기, global identifier UNIQUE, 다른 worktree 코드 수정.
- 완료 조건: 동일 옵션의 재import가 동일 SKU에 연결되고 MASTER/SKU 소유권·옵션 충돌·원본 순서와 provenance 보존을 실제 PostgreSQL에서 검증한다. P2-09 메타데이터와 SKU 표준화 결과의 비교가 일관되어야 한다.
- 재검토가 필요한 조건: 상품 identifier를 SKU scope로 이동하거나 신규 writer를 추가하거나 lock namespace를 변경할 때. brand/title/variant 자동 판정 확대는 근거 데이터와 새 결정이 필요하다.

## DEC-20260914-009 — P2-10 SKU Normalizer / Mapper 로컬 구현·검증 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-10 deterministic SKU option normalization·canonical/source SKU mapping
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 기본(세부 모델 ID·추론 수준 미노출)
- 관련 WBS Task: P2-10, 후속 P2-11/P2-12/P2-16
- 검토 범위와 근거: AGENTS.md, DEC-20260914-001/004/007/008, WBS P2-10, `docs/SOURCE_MAPPING_SPEC_v0.1.md` 6·13~15장, `packages/contracts/src/source-product.ts`, DB baseline의 product_sku/source_sku 제약, P2-06/P2-09 구현.
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260914-008의 P2-10 인수 조건을 구체화하며 MASTER identity lock·생성 정책은 변경하지 않는다.

### 확정 결정

- option key는 `v1:` + Unicode NFKC/trim/연속 공백 통합/`en-US` 소문자 raw option name이다. punctuation·token order·external SKU ID·source order는 동치 판단에 넣지 않는다.
- `createSkuMapper.process`는 저장 item UUID만 입력으로 받고 mapped input/context·source snapshot을 재검증한다. source→MASTER row를 잠그고 `bros/sku-option/v1` SHA-256 signed BIGINT advisory transaction lock을 key 오름차순으로 얻는다. SQLSTATE 55P03/40P01/40001만 기본 1초·최대 3회 재시도한다.
- 신규 canonical SKU는 최초 raw display name, normalized name, key, source order와 `REVIEW_REQUIRED` 상태를 보존한다. 재import는 canonical SKU 표현을 바꾸지 않고 source SKU의 raw option, price, stock, raw provenance만 갱신한다. 같은 item replay는 `raw_json.skuMapping` 결과를 반환한다.
- 한 source item의 normalized option key 중복, source external SKU ID의 다른 option 재사용, 기존 source SKU의 다른 canonical SKU 연결은 자동 병합하지 않고 review 결과로 저장한다. 연결 MASTER 없음·옵션 없음·stale source는 안전한 skip이다.
- P2-08 variant 비교는 SKU가 생긴 뒤 `product_sku.option_json.rawOptionName`을 사용하고, SKU가 없을 때만 P2-09의 `importMatchOptionNames` metadata를 사용한다. 내부 versioned option key를 raw name으로 비교하지 않는다.
- P2-10은 MASTER/identifier/source product link·import item status/action·batch aggregate를 변경하지 않는다. pipeline 전체 상태 표시는 P2-12의 책임이다.

### 기각한 선택지와 이유

- 구두점 제거나 fuzzy option key: 실제 labeled variant 오류 기준이 없어 서로 다른 SKU 자동 병합 위험이 있다.
- external SKU ID 또는 source order를 canonical key에 포함: 외부 ID 변경·정렬 변경 때 동일 옵션의 재import 멱등성이 깨진다.
- review collision에서 첫 option을 선택해 계속 쓰기: source export의 두 variant를 한 SKU에 합치는 되돌림 비용이 크다.
- SKU 생성 뒤에도 P2-09 metadata를 우선 비교: source별 첫 raw 표기가 장기 canonical SKU 표현을 가리고 versioned key를 raw name과 혼동할 수 있다.

### 변경 파일

- packages/importer/src/sku-mapper.ts
- packages/importer/src/master-matcher.ts
- packages/importer/src/index.ts
- packages/importer/test/sku-mapper.test.mjs
- tests/integration/sku-mapper.integration.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- unit: NFKC/공백/대소문자 결정성, punctuation/token order 보존, lock key 결정성, option/UUID/재시도 예산 입력 거절 2개 PASS.
- integration: PostgreSQL 18.6 일회용 DB에서 P2-04→06→09→10 재import가 동일 canonical SKU public ID를 재사용하고 source 가격·재고·raw provenance를 갱신함을 확인했다. normalized collision과 기존 source SKU link conflict는 부분 쓰기 없이 review, MASTER 미연결/option 없음은 skip했다.
- 최종 `pnpm check` exit 0: Admin Vitest 6개, Node unit 59개, integration 77개(parent 포함), fail/skip 0개 및 lint/typecheck/format/build PASS.
- 결과: 로컬 PASS, 원격 CI NOT_RUN이므로 구현 현황은 `IMPLEMENTED_NOT_VALIDATED`다.

### 미해결 사항 및 Blocker

- 로컬 P2-10 blocker는 없다. public remote push/CI는 수행하지 않았다.
- option key 정책은 P2-02 contract가 허용하는 raw whitespace 경계와 현재 표본에만 근거한다. 다차원 option structure, SKU별 identifier 소유권, source별 option 삭제/비활성화 정책은 아직 결정되지 않았다.
- 임의 SQL writer, 서로 다른 identity로 같은 MASTER에 연결되는 대량 병렬 import, actual source의 option recall/latency는 이번 검증 범위 밖이다.

### 다음 작업 인수 조건

- 작업 범위: P2-11 Source Image Registrar 또는 P2-12 pipeline completion state를 구현한다.
- 금지 변경: identifier 자동 verified, title-only/option fuzzy 병합, P2-09 identity lock namespace 변경, source provenance 삭제, SKU status 자동 ACTIVE 승격, 다른 worktree 수정.
- 완료 조건: P2-11은 source image revision/idempotency와 object storage 경계를, P2-12는 source/MASTER/SKU/image 단계의 terminal aggregate와 재실행을 실제 PostgreSQL에서 검증한다.
- 재검토가 필요한 조건: option structured dimensions 또는 SKU-level identifier가 실제 source에 나타나거나, source option 삭제·판매중지의 보존 정책을 도입할 때.

## DEC-20260914-010 — P2-11 Source Image Registrar 로컬 구현·검증 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-11 source product/option image metadata registration과 immutable revision
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 기본(추론 수준 미노출)
- 관련 WBS Task: P2-11, 후속 P2-12/P4-03/P4-11
- 검토 범위와 근거: AGENTS.md, DEC-20260913-004, DEC-20260914-001/008/009, WBS P2-11, 설계서 product_image/원본 이미지 불변 규칙, 구현 보완 명세 2.1~2.2, DB baseline의 image 관계·상태·부분 UNIQUE, SourceProductInput image/option 계약.
- 상태: ACCEPTED
- supersedes: 없음. P1-12 ObjectStorage 계약과 P2-10 SKU ownership을 인수하며 fetch/storage 책임은 추가하지 않는다.

### 확정 결정

- P2-11은 URL과 provenance를 `product_image`에 `REGISTERED`로 기록하는 단계다. 네트워크 fetch, binary 저장, content metadata 계산, thumbnail 생성은 실행하지 않으며 storage 관련 8개 필드는 모두 NULL로 둔다.
- 상품 MAIN은 SOURCE_MAIN, 상품 DETAIL과 option image는 SOURCE_DETAIL이다. occurrence identity는 상품 role+source order 또는 option key+source order이며 URL 원문을 포함하지 않는다. 같은 occurrence+URL은 기존 image를 재사용하고 URL이 바뀌면 기존 row를 유지한 채 revision을 추가한다.
- 같은 URL이 여러 option occurrence에 쓰여도 SKU별 provenance를 합치지 않는다. `(source_product_id,image_type,source_url,source_revision)` DB UNIQUE를 만족하도록 URL과 occurrence history의 최대 revision 다음 값을 사용한다.
- metadata에는 stage, occurrence/scope/order/option key, collectedAt, 최초 item public ID와 이미 검증된 raw evidence를 저장한다. 같은 item은 `raw_json.imageRegistration` 결과를 replay한다.
- 미매칭 source는 source_product_id만으로 등록할 수 있다. 이후 같은 occurrence가 MASTER/SKU와 연결되면 null ownership만 보강한다. 기존 non-null ownership 충돌과 source_sku의 MASTER 불일치는 review이며 자동 교체하지 않는다.
- item→source row lock 안에서 기존 source images를 잠그고 등록한다. 동일 시각 image snapshot 충돌은 review, stale source와 missing images는 skip한다. 모든 image row와 item 이력은 단일 transaction이며 lock timeout/retry는 P2-09/P2-10과 같은 bounded policy다.

### 기각한 선택지와 이유

- Registrar에서 URL fetch와 ObjectStorage 저장까지 수행: import DB transaction에 외부 I/O를 넣고 P1-09 queue/재시도 경계를 우회한다.
- 같은 logical slot의 기존 row URL 덮어쓰기: 과거 원본과 이후 thumbnail provenance를 잃는다.
- URL만으로 모든 option 이미지를 한 row로 병합: 같은 binary URL을 공유하는 서로 다른 SKU ownership을 표현할 수 없다.
- source가 다른 MASTER로 연결됐을 때 기존 image ownership 자동 교체: 기존 derived image/검수 근거와 다른 MASTER를 조용히 결합할 수 있다.

### 변경 파일

- packages/importer/src/image-registrar.ts
- packages/importer/src/index.ts
- packages/importer/test/image-registrar.test.mjs
- tests/integration/image-registrar.integration.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- 실행 명령: importer typecheck/lint/build, image registrar unit, PostgreSQL 18.6 전용 integration, 최종 `pnpm check`, `git diff --check`.
- 전용 결과: unit 2개와 integration 8개(parent 포함) PASS. replay/revision/SKU ownership/unmatched enrichment/missing/ambiguous/concurrency/rollback을 실제 DB에서 확인했다.
- 최종 `pnpm check` exit 0: Admin Vitest 6개, Node unit 61개, integration 85개(parent 포함), fail/skip 0개 및 lint/typecheck/format/build PASS.
- 결과: 로컬 PASS, 원격 CI NOT_RUN이므로 구현 현황은 `IMPLEMENTED_NOT_VALIDATED`.

### 미해결 사항 및 Blocker

- 로컬 target test blocker는 없음. public remote push/CI는 수행하지 않았다.
- 실제 HTTP fetch, MIME/size/dimension/hash 검증, ObjectStorage write와 REGISTERED→FETCHING→STORED/FAILED 전이는 후속 P4-03 범위다.
- source에서 사라진 image의 비활성화/보존기간, URL query 변동의 semantic canonicalization은 근거와 정책이 없어 결정하지 않았다.

### 다음 작업 인수 조건

- 작업 범위: P2-12 Import Batch / Item Tracking에서 P2-06 source upsert와 P2-09~11 결과를 pipeline terminal 상태·집계로 통합한다.
- 금지 변경: source image row 덮어쓰기/삭제, Registrar 내부 외부 fetch, storage metadata 추정, SKU/MASTER 자동 활성화, 다른 worktree 수정.
- 완료 조건: 단건 단계 실패가 batch 전체 transaction을 rollback하지 않고 source/MASTER/SKU/image 결과·오류·skip/review count가 replay에도 정확히 유지된다.
- 재검토가 필요한 조건: P4-03이 content hash 기반 same-content dedupe 또는 source URL canonicalization을 도입하거나 source image 삭제 정책이 확정될 때.

## DEC-20260914-011 — P2-12 Import Batch / Item Tracking 로컬 구현·검증 완료

- 일자: 2026-09-14
- 종료 단계/분야: P2-12 item terminal result와 batch pipeline completion/aggregate tracking
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 기본(추론 수준 미노출)
- 관련 WBS Task: P2-12, 후속 P2-13/P2-14
- 검토 범위와 근거: AGENTS.md, DEC-20260914-003/004/008/009/010, WBS P2-12~13, `docs/SOURCE_MAPPING_SPEC_v0.1.md`, DB baseline의 import batch/item 상태·집계 CHECK, P2-04/P2-06/P2-09~11 구현과 테스트.
- 상태: ACCEPTED
- supersedes: 없음. P2-06 source upsert 종료 이력과 P2-09~11 stage 결과를 유지하면서 pipeline 전체 완료 의미를 구체화한다.

### 확정 결정

- `ImportResultRecorder`는 P2-04 거절 item 또는 P2-09~11이 모두 끝난 승인 item을 한 건씩 독립 transaction으로 확정한다. 승인 item의 stage evidence가 하나라도 없거나 형식이 잘못되면 쓰지 않고 거절한다.
- validation/명시적 실패, review, material skip, success 순으로 최종 결과를 정한다. `NO_SOURCE_OPTIONS`와 `NO_SOURCE_IMAGES`는 선택 입력 부재라 MASTER 성공을 유지하고, 성공 action은 P2-09의 CREATED/MATCHED를 보존한다.
- 명시적 stage 실패는 P2-09~11과 안정된 64자 error code만 허용한다. raw exception을 보존하지 않고, P2-04에서 이미 거절된 item의 구체적 validation code/message는 유지한다.
- 같은 batch의 동시 기록은 batch→item lock 순서로 직렬화하고 1초 lock timeout, 최대 3회, SQLSTATE 55P03/40P01/40001만 새 transaction에서 재시도한다. 마지막 item이 기록될 때만 batch pipeline을 완료한다.
- batch counts는 저장된 item 상태에서 매번 다시 계산한다. 전부 실패면 FAILED, 일부 실패면 PARTIAL_FAILED, 실패가 없으면 SUCCEEDED다. P2-06 `finished_at`은 바꾸지 않고 pipeline 완료·시각·recorded count는 `config_json.pipelineTracking`에 `P2-12/v1`로 기록한다.
- item의 최종 결과는 기존 raw envelope를 유지한 `raw_json.pipelineTracking`에 남긴다. 재호출은 저장 결과를 반환하며 batch 완료 시각과 집계를 증가시키지 않는다.

### 기각한 선택지와 이유

- batch 전체를 하나의 장기 transaction으로 처리: 단건 실패가 전체 결과를 rollback하고 P2-13 chunk/restart 복구 경계를 약화한다.
- P2-09~11 중 누락된 stage를 성공 또는 단순 skip으로 간주: 처리되지 않은 작업과 선택 입력 부재를 구분할 수 없다.
- 모든 skip/review를 실패로 집계: WBS가 요구한 성공/실패/스킵 구분과 DB의 독립 count를 훼손한다.
- P2-06 `finished_at`을 pipeline 완료 시각으로 덮어쓰기: source upsert 완료 이력의 의미를 바꾸고 기존 결정과 충돌한다.
- raw exception을 item error message에 저장: 비밀값·원본 데이터 노출 위험과 비결정적 운영 표시를 만든다.

### 변경 파일

- packages/importer/src/import-result-recorder.ts
- packages/importer/src/index.ts
- packages/importer/test/import-result-recorder.test.mjs
- tests/integration/import-result-recorder.integration.test.mjs
- docs/SOURCE_MAPPING_SPEC_v0.1.md
- docs/IMPLEMENTATION_STATUS.md
- docs/TEST_REPORT.md
- docs/DECISIONS.md

### 검증 증거

- 실행 명령: importer lint/typecheck/build, P2-12 unit, PostgreSQL 18.6 전용 integration, 최종 `pnpm check`, `git diff --check`.
- 전용 결과: unit 5개와 integration 4개(parent 포함) PASS. mixed outcome 동시 기록, 정확한 집계, failure isolation, stage completeness, evidence/timestamp 보존과 replay를 실제 DB에서 확인했다.
- 최종 `pnpm check` exit 0: Admin Vitest 6개, Node unit 66개, integration 89개(parent 포함), fail/skip 0개 및 lint/typecheck/format/build PASS.
- 결과: 로컬 PASS, 원격 CI NOT_RUN이므로 구현 현황은 `IMPLEMENTED_NOT_VALIDATED`.

### 미해결 사항 및 Blocker

- 로컬 target test blocker는 없다. public remote push/CI는 수행하지 않았다.
- P2-12는 stage 결과 기록기이며 XLSX 분할, queue dispatch, chunk backpressure, worker restart orchestration은 P2-13 범위다.
- item 수가 0인 batch의 pipeline 완료 호출은 현 WBS 입력 흐름에서 사용되지 않아 별도 API를 두지 않았다. 빈 import 허용 정책이 생기면 batch-only finalize 계약을 결정해야 한다.

### 다음 작업 인수 조건

- 작업 범위: P2-13 Product Import Queue / Chunk Processor에서 `product.import` job, 설정 가능한 chunk 100/concurrency 2 기본값, retry/idempotency/backpressure와 worker restart 복구를 구현한다.
- 금지 변경: P2-04 validation 원본 envelope 덮어쓰기, P2-09~11 결과 재해석, P2-12 item별 독립 transaction 제거, 임의 raw exception 저장, 다른 worktree 수정.
- 완료 조건: 1k synthetic import를 chunk 처리하고 worker restart와 일부 실패 뒤 재실행해도 source/MASTER/SKU/image 및 P2-12 집계가 중복되지 않으며 backpressure와 retry 한계가 관측된다.
- 재검토가 필요한 조건: queue job이 item이 아닌 batch 전체 원자성을 요구하거나, 운영자가 완료된 같은 item의 새 시도를 기존 row에 덮어써야 한다는 정책이 승인될 때.

## DEC-20260914-012 — P2-13 Import Queue·Chunk 처리와 재시작 복구 검증

- 일자: 2026-09-14
- 종료 단계/분야: P2-13 Product Import Queue / Chunk Processor 구현·로컬 검증
- 작성 모델/추론 수준: GPT-6 기반 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P2-13, P2-06/P2-12 호환 보완, 후속 P2-14
- 검토 범위와 근거: AGENTS.md, doc/README.md, 구현 보완 명세 2장·6장, WBS P2-13, 개발 운영 지침, DEC-20260913-001/002 및 DEC-20260914-003/004/008~011, Source Mapping Spec, QueuePort/설치된 pg-boss adapter, Worker lifecycle, DB baseline import CHECK, 기존 importer 단계 코드·통합 테스트.
- 상태: ACCEPTED
- supersedes: DEC-20260914-011의 “마지막 item에서만 batch status를 갱신한다” 부분과 빈 batch 미정 부분만 대체한다. 그 외 item별 transaction·원본 근거·finished_at·pipeline 완료 시각·재실행 불변성은 유지한다.

### 확정 결정

- P2-04가 저장한 batch UUID를 `enqueueProductImport`로 접수한다. batch row lock 안에서 `product.import` enqueue와 receipt/config 기록을 같은 DB transaction에 commit한다. 반복 접수는 같은 receipt이며 새 Import는 새 batch UUID다. 빈 batch와 CANCELLED batch는 접수 오류다. 큐에는 UUID 참조만 전송하고 업무 원문을 넣지 않는다.
- Worker 한 프로세스당 import batch 1개, item 동시성 기본 2(1~16), chunk 기본 100(1~1000)으로 동작한다. UUID·행 번호 keyset 조회와 현재 chunk drain 이후 다음 조회로 메모리·진행량을 제한한다. `QueuePort.work`의 선택적 concurrency 옵션은 기존 호출과 호환된다. 다른 queue의 기본 동시성은 유지한다.
- source upsert를 PENDING item별 transaction으로 처리하는 경로와 source 완료 집계를 추가한다. 기존 batch `process` API는 유지한다. 모든 source가 종료된 뒤 MASTER→SKU→image→recorder를 진행하며 각 단계의 기존 idempotency 결과를 재사용한다.
- retry가 남아 있으면 실패 항목을 미완료로 두고 다른 항목을 계속 처리한다. 마지막 시도에서는 source/MASTER/SKU/image 실패를 고정 code/message로 확정한다. DB 장애로 실패 기록 자체가 불가능하면 해당 item은 미완료로 유지하고 queue 처리 실패로 남긴다. 업무 item 실패가 있어도 전체 항목을 기록한 Worker 처리 자체는 SUCCESS일 수 있다.
- batch별 advisory transaction lock의 전용 연결을 유지하고, 매 stage 경계에서 취소 신호·잠금 연결·receipt/attempt 소유권을 검사한다. 이 transaction은 업무 쓰기를 포함하지 않으며 항목별 commit은 별도다. Worker DB pool 최소 2, 기본 5; item 동시성 2를 DB에서도 활용하려면 최소 3개 연결이 필요하다. 모든 in-flight stage를 drain한 뒤 lease를 해제한다.
- `config_json.importQueue`에 접수·실행 상태, receipt, attempt, 설정값, 단계별 chunk/visited count와 시각, 안전한 error code를 기록한다. 이전 receipt/attempt는 새 작업의 상태를 덮어쓸 수 없다. P2-12 결과가 확정된 item에는 하위 단계가 새 쓰기를 하지 못한다.
- 접수는 DB 전체 QUEUED/RUNNING/RETRY_WAIT batch 기본 32개(1~1000) 상한을 적용한다. 전역 admission lock 아래 상한을 검사하고 초과하면 enqueue 없이 IMPORT_BACKPRESSURE로 거절한다. `pnpm worker:import <batch UUID>`는 설정을 적용하는 접수 CLI다.
- crash/expiry는 pg-boss의 기존 bounded retry로 복구한다. 마지막 시도에서 죽거나 상태 기록이 실패하면 운영자가 `--resume`으로 새 receipt를 발급하고 미완료 항목을 재개한다. 기존 완료 item과 최종 실패 item을 덮어쓰지 않는다. 성공한 batch의 resume도 기존 receipt replay다.
- P2-12 중간 신규 실패에서 기존 SUCCEEDED 상태를 유지하면 DB CHECK가 거절한다는 회귀를 실제 DB에서 확인했다. 이제 매 기록의 status와 counts를 함께 갱신하고 전체 완료 판정은 오직 `pipelineTracking.completed`로 구분한다. 집계는 DB에서 count하여 전체 raw payload를 매번 읽지 않는다. P2-06 finished_at은 그대로 보존한다.

### 기각한 선택지와 이유

- 전체 batch 업무를 하나의 transaction에서 commit: 단건 오류와 crash에 대한 복구 비용이 커지고 P2-12 독립 commit 계약과 충돌한다.
- 모든 item job을 한꺼번에 enqueue: 초기 기본 청크 크기를 넘어 provider backlog를 늘리고 접수·처리 backpressure를 분리하기 어렵다. 한 batch reference job이 제한된 chunk를 순회하도록 선택했다.
- pg-boss 완료를 상품 import 성공으로 사용: 입력 검증 실패·검토·스킵을 구분할 수 없다.
- 완료 FAILED item을 resume에서 초기화: 이미 기록한 검수/원본 이력을 덮어쓴다. 재검수는 새 batch/item으로 처리한다.
- 마지막 시도의 프로세스 사망까지 자동 성공/실패 판정: 실행 증거가 없어 추정하지 않고 명시적 복구 경로를 둔다.

### 변경 파일

- apps/worker/src/product-import.ts, apps/worker/src/send-product-import.ts, apps/worker/src/runtime.ts, apps/worker/src/index.ts, apps/worker/package.json
- packages/importer/src/import-chunk-processor.ts, packages/importer/src/source-product-upsert.ts, packages/importer/src/import-result-recorder.ts, packages/importer/src/master-service.ts, packages/importer/src/sku-mapper.ts, packages/importer/src/image-registrar.ts, packages/importer/src/index.ts
- packages/queue/src/port.ts, packages/queue/src/pg-boss.ts
- packages/core/src/config/index.ts, packages/core/test/config.test.mjs
- packages/importer/test/import-chunk-processor.test.mjs, tests/integration/product-import.integration.test.mjs, tests/integration/product-import-process-fixture.mjs
- package.json, pnpm-lock.yaml, .env.example
- docs/SOURCE_MAPPING_SPEC_v0.1.md, docs/RUNBOOK.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/DECISIONS.md

### 검증 증거

- 실행: 기존 캐시의 offline install, package/Worker build, lint/typecheck, 신규 unit 및 PostgreSQL 전용 통합, 최종 `pnpm check`, `git diff --check`.
- 전용 integration 최종 7개 시나리오(parent 포함 8개) PASS. 1k synthetic actual Worker는 성공 900·검증 실패 100·recorded 1000, source/source SKU/image 각각 900개를 기록했으며 최종 55,568ms였다.
- 실제 PG 동시 작업 2개와 chunk 완료 전 다음 chunk 미처리, 중복 batch lease 거절, enqueue 롤백, 부분 실패 격리, resume receipt fencing, SIGKILL 뒤 재전달과 정확한 최종 집계를 확인했다.
- 전체 `pnpm check` exit 0: Admin 6개, Node unit 68개, integration 97개(parent 포함), fail/skip 0 및 lint/typecheck/format/build PASS.
- 결과: 로컬 PASS, 원격 CI NOT_RUN. 상태는 IMPLEMENTED_NOT_VALIDATED로 기록한다.

### 미해결 사항 및 Blocker

- 로컬 구현 blocker 없음. public remote push/CI는 수행하지 않았다.
- P6의 혼합 부하·API 5 RPS·30분·4 vCPU/8GB 성능 검증은 NOT_RUN이다. 현재 1k 측정을 운영 SLA로 사용하지 않는다.
- provider 최종 crash 또는 DB 장애 후 정지된 RUNNING/RETRY_WAIT의 자동 재조정 daemon은 없다. Runbook의 명시적 resume을 사용한다. 큰 batch가 반복 expiry되면 chunk/Worker 및 provider timeout 설정을 실측 후 조정한다.
- XLSX 업로드·batch 생성 API, batch 목록/상세·실패 재검수 화면은 P2-14 범위다. 원본 파일 업로드와 validation commit까지의 원자적 접수는 해당 API 경계에서 추가 설계한다.

### 다음 작업 인수 조건

- 작업 범위: P2-14 Import 관리 UI/API에서 batch 목록·상세·상태/건수·실패 원인·재실행 진입점과 pagination/filter/UI 오류 표시를 구현한다.
- 금지 변경: P2-12 완료 item 이력 초기화, raw exception/queue 원문 공개, provider SUCCESS와 업무 성공 혼동, source/MASTER/SKU/image identity 변경, 별도 P5 worktree 변경.
- 완료 조건: 운영자가 실제 저장된 결과와 processing 상태를 구분해 확인하고, 상한 초과·재시도·권한/검증 오류를 이해하며 기존 receipt replay와 명시적 resume을 API 테스트로 검증한다.
- 재검토 조건: 여러 Worker에 걸친 전역 item 동시성 상한, batch 취소 API, zero-row import 허용, 자동 최종 crash reconciliation, 대량 데이터의 chunk별 provider job 분리가 요구될 때.

## DEC-20260914-013 — P2-14 Import 관리 UI/API와 local 인증 fence 확정

- 일자: 2026-09-14
- 종료 단계/분야: P2-14 Import batch 조회·상품 결과·처리 재개 API 및 Admin UI 구현·로컬 검증
- 작성 모델/추론 수준: GPT-5 기반 Codex / 시스템 설정(추론 수준 미노출)
- 관련 WBS Task: P2-14, 후속 P2-15/P2-16/P6-01
- 검토 범위와 근거: AGENTS.md, WBS P2-14~16, 구현 보완 명세 3.1~3.2/상태 전이, 설계서 23.1, DEC-20260913-003 및 DEC-20260914-003/011/012, Source Mapping Spec 17~18, 현재 Fastify/Admin/QueuePort/import schema와 P2-13 admission 구현.
- 상태: ACCEPTED
- supersedes: DEC-20260914-012의 미해결 사항 중 “XLSX 업로드·batch 생성 API를 P2-14 범위로 둔다”는 부분만 대체한다. WBS P2-14의 명시 범위와 Acceptance Criteria는 기존 batch 목록/상세·상태/건수·실패 이유·재실행 진입점이며 binary 업로드는 원본 보존/인증/원자성 결정과 함께 별도 후속 범위로 둔다. P2-13의 retry·완료 item 보호 결정은 유지한다.

### 확정 결정

- `GET /api/v1/import-batches`는 batch 상태 filter와 `(created_at,public_id)` opaque cursor를 사용한다. `GET /api/v1/import-batches/:publicId`는 item 상태 filter와 독립 cursor를 사용한다. cursor 비교에는 Node Date로 잘리지 않은 PostgreSQL 원본 timestamp text를 사용해 같은 millisecond 안의 행도 건너뛰지 않는다. 두 limit은 기본 50, 최대 100이다.
- 응답은 UUIDv7 public ID만 사용한다. batch 업무 status/counts/pipeline completion과 Queue processing status/progress를 별도 필드로 반환한다. 내부 BIGINT, `raw_json`, provider/receipt, Queue 원문과 예외는 반환하지 않는다. item 오류는 안정된 code와 최대 512자 message만 반환한다.
- P2-13 admission을 `@bros/importer`로 이동해 API와 Worker가 같은 원자적 접수/상한/replay 규칙을 사용한다. Worker는 기존 public export를 유지한다. 상세 admission 결과만 API가 사용하여 새 접수는 202/QUEUED, 기존 receipt는 200/current processing status로 정확히 구분한다.
- retry의 `resume`은 새 receipt로 미완료 처리를 재개하고 이전 receipt를 차단한다. `replay`는 기존 상태만 돌려준다. P2-12에서 확정한 성공·실패·검수·스킵 item은 초기화하지 않는다. 확정 실패 상품 재검수는 새 batch/item으로 수행한다.
- 업무 API는 기본 disabled다. `API_LOCAL_UNAUTHENTICATED=true`와 development/test loopback host를 함께 명시한 경우만 활성화하며 production/non-loopback 조합은 config 단계에서 거절한다. 변경 요청은 JSON과 `X-BROS-Operation: import-retry`를 요구한다. 이 설정은 P6-01 인증을 대체하지 않는다.
- Admin `/imports`는 batch status filter, 목록/상세 cursor 다음 page, 업무/처리 상태, 건수, progress, item 실패 code/message, loading/empty/error/retry 상태를 제공한다. Queue SUCCESS를 상품 성공으로 표시하지 않는다.

### 기각한 선택지와 이유

- API가 Worker 앱의 admission 구현을 직접 import: app 간 역방향 결합과 runtime 경계를 만들므로 공유 importer service로 이동했다.
- offset pagination과 임의 sort: 동시 Import 중 중복/누락 가능성이 있고 공통 HTTP 계약의 cursor/allowlist를 위반한다.
- provider job 성공을 batch 성공으로 표시: validation 실패·검수·스킵이 있는 정상 Worker 완료를 전건 성공으로 오인한다.
- 완료 item을 retry에서 PENDING으로 초기화: 원본/판정 이력과 P2-12 replay 불변성을 훼손한다.
- 무인증 업무 API를 개발 기본값으로 활성화하거나 0.0.0.0에 바인딩: 보완 명세의 명시적 loopback local mode 조건을 충족하지 않는다.
- P2-14에서 binary XLSX upload를 함께 추가: WBS 명시 범위를 넘고, JSON-only 업무 API·25MB body·ObjectStorage 원본 보존·validation/enqueue transaction과 운영 인증을 먼저 함께 결정해야 한다.

### 변경 파일

- `.env.example`, `pnpm-lock.yaml`
- `packages/core/src/config/index.ts`, `packages/core/test/config.test.mjs`
- `packages/contracts/src/import-management.ts`, `packages/contracts/src/index.ts`, `packages/contracts/test/import-management.test.mjs`
- `packages/importer/src/product-import-admission.ts`, `packages/importer/src/index.ts`, `packages/importer/package.json`
- `apps/worker/src/product-import.ts`
- `apps/api/src/import-management.ts`, `apps/api/src/app.ts`, `apps/api/src/bootstrap.ts`, `apps/api/src/index.ts`, `apps/api/package.json`
- `apps/admin/src/api/imports.ts`, `apps/admin/src/api/imports.test.ts`, `apps/admin/src/pages/ImportsPage.tsx`, `apps/admin/src/pages/ImportsPage.test.tsx`, `apps/admin/src/App.tsx`, `apps/admin/src/App.test.tsx`, `apps/admin/src/components/AppShell.tsx`, `apps/admin/src/styles.css`
- `tests/integration/import-management-api.integration.test.mjs`
- `docs/SOURCE_MAPPING_SPEC_v0.1.md`, `docs/RUNBOOK.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/DECISIONS.md`

### 검증 증거

- 실행: package/API/Worker/Admin build·typecheck, Admin Vitest, P2-14 전용 PostgreSQL 18.0 API integration, 최종 `pnpm check`, `git diff --check`.
- P2-14 전용 integration 2개 PASS: batch/item cursor+filter, safe projection, invalid cursor/404, 명시적 resume와 기존 receipt replay, 429 backpressure, operation header, 기본 disabled fence를 실제 DB에서 확인했다.
- 전체 `pnpm check` exit 0: Admin Vitest 13개, Node unit 71개, integration 99개(parent 포함), fail/skip 0 및 lint/typecheck/format/build PASS. P2-13 1k import(50,058ms)와 실제 Worker crash 복구도 회귀 PASS했다.
- 결과: 로컬 PASS, 원격 CI NOT_RUN. 구현 현황은 `IMPLEMENTED_NOT_VALIDATED`.

### 미해결 사항 및 Blocker

- 로컬 구현 blocker 없음. public remote push/CI는 수행하지 않았다.
- 운영 인증(Caddy Basic Auth/actor), Origin·CSRF, 직접 API 포트 차단과 인증 실패 UX는 P6-01 전까지 NOT_RUN이다. `API_LOCAL_UNAUTHENTICATED`를 외부 배포에 사용하지 않는다.
- XLSX upload/new batch 운영 경계는 결정 필요다. binary 수신 또는 ObjectStorage 사전 업로드, 원본 file hash/보존, validation+enqueue 원자성, 실패 시 생성 batch의 재개 UX를 함께 정해야 한다.
- cursor는 현재 opaque encoding이며 서명하지 않는다. 허용 필드와 UUID/date를 재검증하므로 조회 범위 탈출은 없지만 장기 public API에서 변조 방지·만료가 필요하면 P6에서 서명 cursor를 추가한다.

### 다음 작업 인수 조건

- 작업 범위: 우선 P2-15 MASTER 상품관리 API/UI에서 목록/상세, Source/SKU/Identifier/Image 추적, match 상태, version 기반 안전한 기본정보 수정과 pagination/filter를 구현한다. P2-16 Brand Review도 P2-14를 선행 완료했으므로 병렬 가능한 후속 후보다.
- 금지 변경: Import raw/queue receipt 공개, 완료 item 초기화, MASTER/source/SKU/image identity 재해석, 자동승인 기본 OFF 변경, 인증 없는 non-loopback 업무 route, 별도 P5 worktree 수정.
- 완료 조건: 하나의 MASTER에서 모든 연결 근거를 public UUID로 추적하고, missing relation과 concurrent expectedVersion conflict를 포함한 API/UI 검증 및 전체 회귀가 통과한다.
- 재검토가 필요한 조건: P2-15 수정 대상 필드가 기존 version_no만으로 원자적 CAS를 표현하지 못하거나, P2-16 alias 승인과 MASTER 수정이 하나의 transaction/화면으로 결합되어야 할 때.

## DEC-20260914-014 — P2-15 MASTER 상품관리 공개 관계와 versioned 기본정보 수정 확정

- 일자: 2026-09-14
- 종료 단계/분야: P2-15 MASTER 상품 목록·상세·안전 수정 API와 Admin UI 구현·로컬 검증
- 작성 모델/추론 수준: GPT-6 기반 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P2-15, 후속 P2-16/Phase 2 Gate/P6-01
- 검토 범위와 근거: AGENTS.md, WBS P2-15~16 및 Phase 2 Gate, 구현 보완 명세 2.1~2.2/3.1~3.2, 설계서 12.4~12.9/21.2/22.3, DEC-20260914-008~013, 현재 baseline schema·MASTER/SKU/Image importer·Fastify/Admin 구현.
- 상태: ACCEPTED
- supersedes: DEC-20260914-013의 P2-15 인수 조건을 완료한다. P2-14의 local 인증 fence, Import raw/receipt 비공개, 완료 item 불변성과 P2-09~11 identity 결정은 유지한다.

### 확정 결정

- `GET /api/v1/products`는 `(created_at,public_id)` 내림차순 opaque cursor, 기본 limit 50/최대 100을 사용한다. 정렬 입력은 받지 않고 MASTER status, Identifier status, 브랜드, Source, 상품명/Identifier 값만 allowlist filter로 허용한다. 상품명 검색은 기존 `product_name_norm`과 pg_trgm 인덱스에 맞춘 NFKC/공백/case 정규화를 사용한다.
- `GET /api/v1/products/:publicId`는 MASTER에서 Brand, 표준 SKU, Identifier, Source Product, Source SKU, 원본 Image까지 공개 UUID로 추적한다. 관계가 없으면 오류나 추정값 대신 null/빈 배열을 반환한다. Source match 상태와 표준 SKU 연결 여부를 별도로 보여준다.
- 응답에서 BIGINT PK/FK, MASTER metadata, Source/Source SKU raw, Identifier evidence, image metadata와 storage provider/bucket/object key/hash를 제외한다. 저장 여부와 안전한 표시 필드만 반환하며 Admin은 외부 이미지를 자동 inline fetch하지 않고 명시적 링크로 연다.
- PATCH 허용 필드는 `productName`, `categoryKey`, `productType`, `status`다. 브랜드 재연결은 P2-16, Identifier 값과 검증 상태는 Phase 3 검수 경계이므로 제외한다. MASTER status를 ACTIVE로 바꾸는 것은 사람이 실행한 명시적 변경이며 자동승인 정책을 바꾸지 않는다.
- PATCH는 JSON, `X-BROS-Operation: product-update`, `expectedVersion >= 1`, 공백이 아닌 `changeReason`, 한 개 이상의 허용 필드를 요구한다. `WHERE public_id AND version_no` 조건부 UPDATE가 성공한 경우만 version을 증가시키고, stale version은 409와 expected/actual version을 반환한다. 정규화 후 실제 변경이 없으면 version과 감사 이력을 늘리지 않는다.
- 변경 시 기존 metadata를 보존하고 `managementChanges` 배열에 `LOCAL_ADMIN` actor source, 시각, 사유, 변경 필드별 이전값·이후값을 append한다. 이는 loopback 개발 단계의 actor 근거이며 P6-01에서 proxy 보증 사용자 actor로 확장한다.
- `/products` 화면은 검색/필터, cursor 다음 page, loading/empty/error, 상세 공개 관계, 기본정보 편집, 409 후 최신 상세 reload를 제공한다. 업무 route는 P2-14와 동일하게 명시적 non-production loopback 모드에서만 활성화한다.

### 기각한 선택지와 이유

- 목록에서 offset/임의 sort 사용: 동시 데이터 추가 시 중복·누락 가능성이 있고 공통 cursor/allowlist 계약과 맞지 않는다.
- 상세에 raw/evidence/metadata/storage 위치를 그대로 반환: 자격증명·원본 민감정보·내부 저장 구조 노출 위험이 있어 필요한 공개 projection만 정의했다.
- MASTER 화면에서 brand_id 또는 Identifier를 직접 수정: Source 재처리, alias precedence, SKU/이미지 소유권, 검수 이력을 하나의 단순 PATCH로 안전하게 보장할 수 없어 전용 흐름으로 분리했다.
- version 확인 뒤 무조건 UPDATE: 두 운영자의 마지막 저장이 앞선 변경을 덮어쓰므로 version 조건을 UPDATE 자체에 포함했다.
- 변경 사유만 저장하거나 애플리케이션 로그만 사용: 재구성 가능한 전후값과 DB 내 durable 근거가 없어 필드별 before/after를 기존 metadata에 append한다.
- 원본 URL을 `<img>`로 즉시 렌더링: 화면 진입만으로 외부 host에 요청과 추적 정보가 전달될 수 있어 명시적 링크를 사용한다.

### 변경 파일

- `packages/contracts/src/product-management.ts`, `packages/contracts/src/index.ts`, `packages/contracts/test/product-management.test.mjs`
- `apps/api/src/product-management.ts`, `apps/api/src/app.ts`
- `apps/admin/src/api/products.ts`, `apps/admin/src/api/products.test.ts`, `apps/admin/src/pages/ProductsPage.tsx`, `apps/admin/src/pages/ProductsPage.test.tsx`, `apps/admin/src/App.tsx`, `apps/admin/src/App.test.tsx`, `apps/admin/src/components/AppShell.tsx`, `apps/admin/src/styles.css`
- `tests/integration/product-management-api.integration.test.mjs`
- `docs/RUNBOOK.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/DECISIONS.md`

### 검증 증거

- 실행: package/API/Admin build·typecheck, contract/Admin unit, P2-15 전용 PostgreSQL 18.0 API integration, 최종 `pnpm check`, 변경 후 P2-15 integration/lint/typecheck/format/build 재검증, `git diff --check`.
- P2-15 전용 integration 2개 PASS: 같은 millisecond cursor pagination, 5종 filter, 모든 관계의 공개 UUID projection, missing relation, invalid cursor/UUID, operation header, 기본 disabled fence, 동시 PATCH의 1 success/1 conflict와 version/audit 전후값을 실제 DB에서 확인했다.
- 전체 `pnpm check` exit 0: Admin Vitest 20개, Node unit 73개, integration 101개(parent 포함), fail/skip 0 및 lint/typecheck/format/build PASS. P2-13 1k import와 실제 Worker crash 복구도 회귀 PASS했다.
- 감사 전후값 보강 뒤 전용 integration 2개와 lint/typecheck/format/build를 다시 PASS했다.
- 결과: 로컬 PASS, 원격 CI NOT_RUN. 구현 현황은 `IMPLEMENTED_NOT_VALIDATED`.

### 미해결 사항 및 Blocker

- 로컬 구현 blocker 없음. public remote push/CI는 이번 요청에서 수행하지 않았다.
- Caddy Basic Auth, 보증된 사용자 actor, Origin/CSRF, 직접 API 포트 차단과 인증 실패 UX는 P6-01까지 NOT_RUN이다. 현재 local actor source를 사용자 신원으로 해석하지 않는다.
- 한 MASTER의 상세 관계는 전부 반환한다. Pilot에서 단일 MASTER의 Source/SKU/Image가 비정상적으로 커지면 관계별 cursor endpoint와 응답 크기 목표를 P6 성능 측정에 근거해 추가한다.
- P2-16의 alias 승인/거절 및 영향 Source 재처리는 아직 구현하지 않았다. MASTER 브랜드 재연결은 그 흐름을 우회해 이 API로 수행할 수 없다.

### 다음 작업 인수 조건

- 작업 범위: P2-16 Brand Alias / Unresolved Brand Review API/UI에서 `import_item.REVIEW_REQUIRED`와 `raw_brand_name` 기반 목록, 기존 BRAND 연결, alias 승인/거절, 영향 Source 재처리를 구현한 뒤 Phase 2 Gate를 판정한다.
- 금지 변경: unknown/fuzzy alias 자동 승인·신규 BRAND 자동 생성, MASTER 직접 brand 변경, Source raw 삭제, alias source precedence 완화, 자동승인 기본 OFF 변경, 인증 없는 non-loopback route, 별도 P5 worktree 수정.
- 완료 조건: alias approve/reject, duplicate/race, platform-specific alias precedence, 승인된 alias만 이후 동일 표기를 resolve, 영향 Source 재처리 이력, 공개 UUID API/UI와 전체 회귀가 실제 PostgreSQL에서 통과한다.
- 재검토가 필요한 조건: alias 승인이 기존 MASTER/Source를 즉시 재매핑해야 하거나, P2-15의 metadata 감사 이력을 별도 append-only audit table로 옮겨야 할 때.

## DEC-20260914-015 — P2-16 승인 alias와 새 batch 재처리 경계 확정

- 일자: 2026-09-14
- 종료 단계/분야: P2-16 Brand Alias / Unresolved Brand Review API·Admin UI·로컬 검증
- 작성 모델/추론 수준: GPT-6 기반 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P2-16, 후속 Phase 2 Gate/P3-01/P6-01
- 검토 범위와 근거: AGENTS.md, WBS P2-16 및 Phase 2 Gate, 구현 보완 명세 2.1~2.2/3.1~3.2, 설계서 Brand/Import/권한 경계, DEC-20260914-005/008/012~014, baseline `brand_alias` unique scope와 기존 P2-05/P2-09/P2-13 구현.
- 상태: ACCEPTED
- supersedes: DEC-20260914-014의 P2-16 인수 조건을 완료한다. P2-05 exact alias/platform precedence, P2-09 완료 item 불변·기존 MASTER 링크 보호, P2-13 Queue receipt fence와 P2-14 local 인증 경계를 유지한다.

### 확정 결정

- 검수 대상 ID는 별도 review table ID가 아니라 `REVIEW_REQUIRED` import item의 공개 UUID다. 대상은 현재 Source가 존재하고 `raw_json.masterCreation.input.brand.status=UNRESOLVED`이며 공백이 아닌 `raw_brand_name`을 가진 item으로 제한한다. 목록은 `(created_at,public_id)` 내림차순 opaque cursor와 decision/platform/상품·브랜드 검색 allowlist를 사용한다.
- `brand_alias`는 승인된 alias만 담는 기존 물리 계약을 유지해 migration을 추가하지 않는다. 미결 상태는 P2-09 이력으로 표현하고 승인/거절은 기존 item envelope의 `brandReview`에 actor source `LOCAL_ADMIN`, version, 시각, 사유, 정규 alias와 선택 BRAND snapshot을 한 번만 추가한다. 결정 후 같은 item을 다시 변경하지 않는다.
- 승인은 기존 active BRAND만 선택한다. P2-05와 같은 NFKC·trim·연속 공백 통합·소문자 exact key를 사용하고 scope는 `PLATFORM` 또는 `GLOBAL`이다. 비활성 platform/BRAND를 차단하며 fuzzy/부분일치와 신규 BRAND 자동 생성은 없다. platform scope가 global보다 우선한다.
- 승인 transaction은 원본 item row lock, scope+alias advisory transaction lock, alias 재조회/생성, Queue backpressure 확인, 단일 item `BRAND_REVIEW_REPROCESS` batch 생성, `product.import` enqueue와 receipt 저장, 원본 item 결정 기록을 함께 commit한다. Queue 접수 실패를 포함한 어느 단계의 실패도 alias·결정·batch를 부분 저장하지 않는다.
- 같은 scope+alias가 같은 BRAND에 있으면 재사용하고 다른 BRAND면 409 `BRAND_ALIAS_CONFLICT`로 끝낸다. 서로 다른 review item의 동시 승인은 alias advisory lock 뒤 재조회하므로 한 alias가 두 BRAND로 갈라지지 않는다. 같은 review item의 stale `expectedVersion`도 409다.
- 재처리는 검수한 Source item 한 건마다 새 batch/item을 만든다. 검증된 envelope에서 과거 source/MASTER/SKU/image/tracking/review stage 결과만 제거하고 validation/context/mapped input/raw는 유지한다. 원본 item status와 판단 근거는 바꾸지 않는다. 새 item은 기존 P2-06~13 pipeline을 다시 거치며 현재 Source가 이미 다른 MASTER에 연결됐으면 P2-09 보호 규칙에 따라 자동 교체하지 않는다.
- 거절은 alias와 재처리 batch를 만들지 않고 사유·시각·version만 원본 item에 기록한다. 재검토가 필요하면 원본 결정을 덮어쓰지 않고 새 import batch/item을 사용한다.
- API는 review/Source/platform/BRAND/reprocess batch의 공개 UUID와 운영 판단 필드만 반환한다. BIGINT PK/FK, 원본 raw, Queue provider/receipt는 노출하지 않는다. Admin `/brand-reviews`는 기본 미결 목록, 검색/filter, active BRAND 검색, scope·사유 입력, 승인/거절과 409 새로고침을 제공한다.

### 기각한 선택지와 이유

- `brand_alias`에 PENDING/REJECTED row를 저장하거나 review table을 즉시 추가: 현재 테이블의 “존재하면 승인됨” 계약을 깨고 P2-05 조회 조건과 migration을 함께 바꿔야 한다. 불변 import item이 이미 판단 원인과 actor 결정을 보존하므로 P2-16 범위에서는 필요하지 않다.
- 승인 전에 alias만 저장한 뒤 별도 Queue 접수: Queue 실패 시 이후 입력은 resolve되지만 선택한 Source가 재처리되지 않는 부분 성공이 생긴다.
- 원본 `REVIEW_REQUIRED` item을 PENDING으로 되돌려 재사용: 완료 item 불변성, 당시 판단 재현성, batch 집계와 Worker replay fence를 훼손한다.
- 같은 표기의 모든 과거 item을 한꺼번에 재처리: scope가 다른 platform, 이미 결정된 item, 오래된 Source snapshot까지 의도 없이 포함할 수 있다. 운영자가 확인한 item만 새 batch로 만들고 나머지는 목록에서 독립 검수한다.
- 거절 alias 또는 blacklist를 `brand_alias`에 기록: 승인 alias만 자동 resolve한다는 테이블 의미와 충돌한다. 반복 오탐의 별도 차단 정책은 실데이터 근거가 생길 때 새 설계로 추가한다.
- MASTER 상품관리 PATCH로 brand_id 직접 변경: Source 재처리·alias precedence·기존 링크 충돌 보호와 불변 import 이력을 우회한다.

### 변경 파일

- `packages/contracts/src/brand-review.ts`, `packages/contracts/src/index.ts`, `packages/contracts/test/brand-review.test.mjs`
- `packages/importer/src/brand-review.ts`, `packages/importer/src/index.ts`, `packages/importer/test/brand-review.test.mjs`
- `apps/api/src/brand-review.ts`, `apps/api/src/app.ts`
- `apps/admin/src/api/brand-reviews.ts`, `apps/admin/src/api/brand-reviews.test.ts`, `apps/admin/src/pages/BrandReviewsPage.tsx`, `apps/admin/src/pages/BrandReviewsPage.test.tsx`, `apps/admin/src/App.tsx`, `apps/admin/src/App.test.tsx`, `apps/admin/src/components/AppShell.tsx`, `apps/admin/src/styles.css`
- `tests/integration/brand-review-api.integration.test.mjs`
- `docs/SOURCE_MAPPING_SPEC_v0.1.md`, `docs/RUNBOOK.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/DECISIONS.md`

### 검증 증거

- P2-16 전용 PostgreSQL 18 integration 9개(parent 포함) PASS: 안전한 cursor/filter projection과 기본 disabled fence, 승인 alias·불변 결정·Queue receipt·새 batch의 단일 transaction, 실제 재처리 pipeline 완료, duplicate 재사용, 서로 다른 item의 alias 경합, 비활성 platform, platform/global precedence, 거절, Queue 실패 rollback을 확인했다.
- 전체 순차 integration 21개 파일 110개(parent 포함), fail/skip 0 PASS. P2-13 1,000건 실제 Worker import, 실제 프로세스 강제 종료 후 provider 재전달, Queue crash/expiry, Worker 안전 종료를 포함한다.
- Admin Vitest 27개, Node unit 76개, fail/skip 0 PASS. 패키지/API/Admin build·typecheck, lint, format check PASS.
- 전체 병렬 integration은 Windows에서 프로세스 suite가 결과 출력 없이 장기 대기해 중단했다. 같은 21개 파일을 `--test-concurrency=1`로 모두 통과시켜 코드 실패와 구분했다.
- 결과: 로컬 PASS, 원격 CI NOT_RUN. 구현 현황은 `IMPLEMENTED_NOT_VALIDATED`.

### 미해결 사항 및 Blocker

- 로컬 구현 blocker 없음. public remote push/CI는 이번 요청에서 수행하지 않았다.
- Phase 2 Gate의 “실제 샘플 데이터 Import 성공”과 “재 Import 멱등성”은 P2-01 실제 XLSX discovery/mapping dry-run과 synthetic pipeline 증거를 구분해 별도 판정해야 한다. P2-16 완료만으로 Gate PASS를 선언하지 않는다.
- Caddy Basic Auth, 보증된 사용자 actor, Origin/CSRF, 직접 API 포트 차단과 인증 실패 UX는 P6-01까지 NOT_RUN이다. 현재 `LOCAL_ADMIN`을 사용자 신원으로 해석하지 않으며 업무 API를 외부 주소에 배포하지 않는다.
- 승인된 alias와 같은 표기의 다른 미결 item은 자동 bulk 재처리하지 않는다. Pilot에서 검수량과 반복 작업 비용을 측정한 뒤 scope·snapshot·결정 상태를 제한한 bulk 작업이 필요하면 별도 계약으로 추가한다.

### 다음 작업 인수 조건

- 작업 범위: Phase 2 Gate를 WBS 항목별 증거로 판정한다. 실제 XLSX sample의 validation→Source→MASTER→SKU→Image→Tracking 실행과 같은 파일 재import 멱등성을 격리 DB에서 검증하고, P2-05~16의 원격 CI 상태와 남은 운영 제한을 구분한다.
- 금지 변경: Gate 증거를 만들기 위해 실제 sample 원본 수정/저장소 추가, unknown/fuzzy 자동 승인, 자동 신규 BRAND 생성, 자동승인 기본 OFF 변경, 기존 MASTER 링크 강제 교체, 완료 item 이력 재사용, 별도 P5 worktree 수정.
- 완료 조건: 실제 sample import와 재import의 행 수·Source/Master/SKU/Image 수렴, unresolved 검수 분리, batch/item 집계와 raw/SHA 근거, 전체 회귀를 재현 가능한 명령으로 기록하고 Phase 2 Gate를 PASS/조건부/보류 중 하나로 판정한다.
- 재검토가 필요한 조건: Gate가 실제 sample의 누락된 platform seed/alias/identifier나 pipeline 성능 문제로 실패하거나, 여러 unresolved item의 bulk alias 재처리가 Pilot 필수 운영 조건으로 확인될 때.

## DEC-20260914-016 — Phase 2 Gate 조건부 판정과 실제 XLSX 재import 증거

- 일자: 2026-09-14
- 종료 단계/분야: Phase 2 Gate 검토·실제 XLSX end-to-end 재import 로컬 검증·인수 기록
- 작성 모델/추론 수준: GPT-6 기반 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P2-01~P2-16, Phase 2 Gate, 후속 P3/P4/P6
- 검토 범위와 근거: AGENTS.md, `doc/README.md`, `doc/BROS_구현_보완_명세_v0.2.md` 6장, `doc/BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md` Phase 2 Gate, `doc/BROS_개발_운영_구성_지침_v0.1.md` 12장, `docs/SOURCE_MAPPING_SPEC_v0.1.md` 5장, DEC-20260914-005~015, 현재 importer/Worker/API/Admin 구현과 integration, 구현 HEAD `646cb49c8217358f2075d8df746adf6d1bb404d0`.
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260914-015의 Gate 판정 인수 작업을 완료한다. 기존 P2 도메인 결정과 원격 검증 대기 상태를 유지하며 공식 Gate PASS로 대체하지 않는다.

### 확정 결정

- Phase 2 Gate는 **조건부 통과 — 공식 PASS 보류**, 상태 `IMPLEMENTED_NOT_VALIDATED`다. 실제 표본 재import와 전체 로컬 회귀는 PASS지만 현재 revision의 원격 CI 증거가 없어 BLK-004를 등록한다. Waiver나 배포 승인으로 해석하지 않는다.
- 실제 XLSX 검증은 이전 P2-01의 대표 20행을 유지한다. 전체 26,375행은 adapter mapping inventory이며 DB 영속화 검증 규모가 아니다. 원본 bytes/SHA와 모든 raw를 보존하고 상품명·브랜드를 임의 보완하지 않는다.
- `scripts/verify-phase2-sample.mjs`로 새 일회용 DB에서 실제 adapter→validation→pg-boss→Worker pipeline→조회 API를 실행한다. Worker runtime 2개는 같은 프로세스의 독립 pool/consumer다. 실제 별도 프로세스 crash 증거는 기존 integration으로 구분한다. 업로드 UI/API E2E로 주장하지 않는다.
- 최초·동일 수집 시각 재import·동시 두 reimport·새 수집 시각 reimport의 5회에서 Source 16·이미지 메타데이터 35와 공개 UUID가 수렴했다. 이전 완료 item은 불변이며 새로운 수집 시각은 Source freshness에 반영된다. 독립 batch/item/검수 이력의 증가는 정상이다. 같은 batch 반복 enqueue는 기존 receipt를 재사용한다.
- 실제 표본 16행은 승인 BRAND/명시 식별자 근거가 없어 REVIEW_REQUIRED로 분리됐다. 외부 상품 ID가 없는 4행은 FAILED이고 Source를 만들지 않는다. Queue SUCCESS와 batch PARTIAL_FAILED가 동시에 성립하며 이를 전건 상품 성공으로 해석하지 않는다.
- 실제 MASTER/SKU/Source SKU 0건은 안전한 미연결 결과다. WBS의 양성 관계 생성·경합·MASTER 관리 관계 추적은 합성 integration/API/Admin PASS로 별도 증명한다. 운영자가 확인한 브랜드·식별자가 있는 실제 추가 표본의 양성 검증은 현재 증거 제한으로 남긴다.
- 공개 CI에 원본 XLSX를 추가하지 않는다. 성공 출력은 집계·SHA·표본 locator만, 실패 출력은 checkpoint와 스크립트의 고정 code만 허용한다. 원본 행/상품 ID/상품명/URL/driver error를 출력하지 않는다.

### 기각한 선택지와 이유

- 실제 XLSX에 alias/품번을 만들어 MASTER/SKU 생성 성공을 얻기: 실제 샘플의 의미를 바꾸고 미확인 브랜드·식별자 오염을 일으킨다.
- Import Item/검수 row 증가를 도메인 멱등성 실패로 판정: 검수와 감사 단위가 독립 import item이며 완료 이력 불변 계약과 충돌한다. Source/이미지 identity 수렴과 batch receipt replay를 별도 검증한다.
- 이전 SHA의 CI PASS로 현재 Phase 2 PASS 선언: 현재 구현 SHA는 원격 조회에서 존재하지 않아 새 코드 검증 증거가 아니다.
- 20행 결과를 26,375행 전체 E2E 또는 P6 성능 PASS로 확장: 전체 파일은 mapping만 했고 운영 하드웨어·동시 Provider 부하·이미지 다운로드는 실행하지 않았다.
- MASTER/SKU 0건을 양성 관계 PASS로 표시: 실데이터 검증과 합성 관계 테스트를 혼동하므로 증거를 분리한다.

### 변경 파일

- `scripts/verify-phase2-sample.mjs`
- `docs/PHASE2_GATE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/BLOCKERS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`
- 도메인 코드/DB schema/원본 XLSX/별도 P5 worktree 변경 없음.

### 검증 증거

- `TEST_DATABASE_URL`을 loopback 55438의 이번 작업 전용 PostgreSQL 18.6에 지정해 `node scripts/verify-phase2-sample.mjs 'examples/더망고_상품정보_20260913.xlsx'` exit 0. 최종 완료 시각 2026-09-14T13:10:30.351Z, SHA와 수집 context/표본 locator/플랫폼별 결과는 `docs/PHASE2_GATE.md`에 기록했다.
- 5회 누적 10 batches/100 items/미결 검수 80 items, 도메인 Source 16/images 35/MASTER·SKU·Source SKU 0. input integrity/raw/image metadata/public UUID/same-time·concurrent·later reimport/prior item/repeated enqueue/aggregate/unknown non-creation/API trace 모두 PASS.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` 각각 exit 0. Admin Vitest 27·Node unit 76, fail/skip 0.
- integration 21개 파일을 `node --test --test-concurrency=1`로 실행해 110개(parent 포함) PASS, fail/skip 0, 147,423ms. 합성 1k Worker 처리 53,892ms와 실제 Worker crash/재전달·Queue·DB 제약·관계 경합 회귀 포함.
- 최종 실패 로그 제한 보완 뒤 실제 XLSX 스크립트, script Prettier check와 `pnpm lint`를 다시 PASS했다. `git diff --check` PASS.
- read-only `gh run list --repo hyunglory/bros --limit 5 --json databaseId,headSha,status,conclusion`: 최근 성공은 34794445556/P2-04 `8c799a3`. `gh api repos/hyunglory/bros/commits/646cb49/check-runs`는 HTTP 422 No commit found. 원격 CI 실행 NOT_RUN.
- 전용 컨테이너 내 잔존 `bros_test_*` DB count 0 확인 후 `docker stop bros-phase2-gate` 성공(`--rm`). 기존 DB/다른 컨테이너는 변경하지 않았다.
- 결과: 로컬 PASS, 공식 Gate `IMPLEMENTED_NOT_VALIDATED`.

### 미해결 사항 및 Blocker

- BLK-004 OPEN: 현재 구현과 검증 문서를 포함하는 원격 revision의 required check PASS 필요. 이번 요청에서 public push/CI 실행/branch protection 변경은 수행하지 않았다. Phase 1 BLK-001은 RESOLVED를 유지한다.
- 실제 샘플의 양성 MASTER/SKU 관계, 전체 파일 영속화, 이미지 다운로드/객체 저장, 브라우저 XLSX 업로드는 NOT_RUN이다. WBS 관계 검증에 사용한 합성 증거와 분리한다.
- P6 인증·actor·Origin/CSRF·직접 API 포트 차단 및 운영 성능은 기존 범위로 유지한다. 현재 로컬 업무 API를 외부에 배포하지 않는다.

### 다음 작업 인수 조건

- 작업 범위: 공개 변경 범위를 확인하고 현재 revision의 원격 CI/required check를 검증해 BLK-004를 해소한 뒤 P2 관련 Task와 Phase 2 Gate 상태를 새 Decision으로 확정한다.
- 금지 변경: 원본 XLSX/raw 출력 공개 추가, unknown 브랜드/식별자 추정 생성, 자동승인 기본 OFF 변경, 기존 완료 item 재사용, 기존 MASTER 링크 강제 교체, 별도 P5 worktree 변경, 과거 CI 결과로 현재 SHA PASS 선언.
- 완료 조건: 대상 revision의 required check `install / lint / typecheck / test / build` PASS와 결과 URL/SHA를 기록하고 BLK-004·Gate·관련 구현 상태를 일치시킨다. 코드 수정이 생기면 영향 회귀 및 실데이터 재검증 필요성을 판단한다.
- 재검토가 필요한 조건: Linux 병렬 integration 실패, 실제 양성 관계 샘플 제공, 전체 파일 처리에서 자원/성능 문제, 반복 검수량으로 bulk 작업이 필요할 때. Gate 확정 전에는 WBS가 허용한 병렬 Track만 독립 진행한다.

## DEC-20260914-017 — BLK-004 해소와 Phase 2 Gate PASS 확정

- 일자: 2026-09-14
- 종료 단계/분야: Phase 2 Gate 원격 CI 검증·최종 상태 확정
- 작성 모델/추론 수준: GPT-5 기반 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P2-05, P2-07~P2-16, Phase 2 Gate, 후속 P3/P4
- 검토 범위와 근거: AGENTS.md, `docs/PHASE2_GATE.md`, `docs/BLOCKERS.md` BLK-004, `docs/TEST_REPORT.md`, DEC-20260914-016, PR #1, GitHub Actions run 34849017954, ruleset 23149676.
- 상태: ACCEPTED
- supersedes: DEC-20260914-016의 BLK-004 원격 검증 대기 상태만 대체한다. 실제 XLSX 표본 범위와 P6 미완료 범위는 유지한다.

### 확정 결정

- `cc605d0c6bd51173da32ab3e08a145158de6fddc`를 `codex/p1-foundation` 원격 branch에 fast-forward push한 PR #1에서 GitHub Actions run 34849017954가 SUCCESS했다. current PR head와 run head SHA가 일치하고 PR은 `CLEAN`이다.
- required check `install / lint / typecheck / test / build`가 current SHA에서 SUCCESS했으며, main ruleset 23149676은 해당 strict check를 요구하고 bypass actor가 없다. 따라서 BLK-004를 RESOLVED로 전환한다.
- P2-05·P2-07~P2-16 및 Phase 2 Gate를 PASS로 전환한다. P2-01~04/P2-06의 기존 PASS와 함께 Phase 2 WBS Gate 조건의 구현·로컬 실데이터·합성 관계/경합·Linux CI 증거가 충족됐다.
- Gate PASS는 실제 표본의 브랜드·식별자 근거가 없는 MASTER/SKU 양성 관계, 전체 XLSX 영속화, 이미지 객체 저장, P6 인증·성능을 완료했다는 선언이 아니다. 해당 항목은 보고서의 명시된 제한으로 남긴다.

### 기각한 선택지와 이유

- P2-04 이하의 과거 성공 run으로 Gate PASS: current Phase 2 SHA와 일치하지 않아 증거가 될 수 없다.
- PR이 CLEAN이라는 사실만으로 PASS: required check의 current SHA SUCCESS와 strict ruleset 확인이 별도로 필요하다.
- 실제 XLSX 원본을 CI fixture에 포함: 공개 저장소의 raw 노출 위험이 있어 기존 opt-in 로컬 검증 경계를 유지한다.

### 변경 파일

- `docs/PHASE2_GATE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/BLOCKERS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`
- 도메인 코드, DB schema, 원본 XLSX, CI ruleset 변경 없음.

### 검증 증거

- `git push origin HEAD:codex/p1-foundation`: `811f4c4..cc605d0` fast-forward 성공.
- GitHub Actions run 34849017954: job `install / lint / typecheck / test / build`, current SHA `cc605d0c6bd51173da32ab3e08a145158de6fddc`, SUCCESS. install, lint, typecheck, unit/integration tests, format check, build 전체 성공.
- PR #1: `mergeStateStatus=CLEAN`, status check SUCCESS. ruleset API: id 23149676, active, default branch strict required check 동일, bypass actors 없음.
- 결과: PASS. BLK-004 RESOLVED.

### 미해결 사항 및 Blocker

- Phase 2 Gate blocker 없음.
- 실제 양성 MASTER/SKU 표본, 전체 XLSX 처리, 이미지 download/object storage, P6 인증·운영 성능은 NOT_RUN이며 Gate PASS를 대체하거나 훼손하는 blocker로 분류하지 않는다.

### 다음 작업 인수 조건

- 작업 범위: Phase 3 Identifier Resolver의 P3-01부터 계약·입력 경계·평가 기반을 구현한다.
- 금지 변경: 실제 XLSX/raw 공개 추가, 확인되지 않은 identifier/brand 자동 확정, 자동승인 기본 OFF 변경, Phase 2 PASS 근거를 전체 파일/P6 완료로 확대, 별도 P5 worktree 변경.
- 완료 조건: P3-01의 계약·validation·unit/integration 근거와 새 Decision을 남긴다.
- 재검토가 필요한 조건: 확인 가능한 identifier 정답 표본·외부 resolver credential·provider 정책이 필요하거나, Phase 2 실제 재import에서 새 입력 계약 문제가 발견될 때.

## DEC-20260915-001 — P3-01 입력·실행 기반 구현 경계

- 일자: 2026-09-15
- 종료 단계/분야: P3-01 착수 설계 검토
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-01
- 검토 범위와 근거: AGENTS.md, doc/README.md, 구현 보완 명세 v0.2 §2·상태 허용 집합, 설계서 §12.12~13·15, WBS P3-01, DEC-20260914-017, 현재 DB/schema·Import 구현. 기준 HEAD 968dfa7, branch codex/p1-foundation. 미추적 examples/ 보존.
- 상태: ACCEPTED
- supersedes: 없음. 초기 workspace 목록을 새 도메인 패키지로 확장하며 기존 패키지 의존 경계는 유지한다.

### 확정 결정

- `packages/contracts`에 버전이 있는 Resolve 입력과 후보 계약을 두고 `packages/resolver`에 DB orchestration 기반을 추가한다. core↔db 순환 의존을 만들지 않는다.
- 공개 UUID로 Source를 지정해 DB의 Source·현재 연결 MASTER·원본 raw 및 같은 수집 시각의 Import mapped input을 repeatable-read snapshot으로 고정한다. mapped input이 없는 직접 등록 Source도 raw 기반으로 실행 가능하며, Import provenance 부재를 null로 명시한다. 입력은 내부 처리용이며 API 공개 projection이 아니다.
- 실행마다 새 UUID와 resolver_version을 기록한다. QUEUED→RUNNING→SUCCEEDED/FAILED, QUEUED/RUNNING→CANCELLED만 허용하고 terminal 재실행은 새 run으로 남긴다.
- 후보 결과와 SUCCEEDED 전환은 같은 트랜잭션에 저장한다. run 내 type/norm 중복은 거부하며 후보는 CANDIDATE로 시작한다. 후보 0건은 SUCCEEDED/NOT_FOUND다. 실패는 고정 error code/message만 저장한다.
- 후보 정규화·점수 산정·승인/거절·MASTER 반영·외부 Provider·Queue/API/UI 연결은 후속 WBS 범위다. evidence/conflict JSON과 전달된 score/rank는 보존하되 자동확정하지 않는다.

### 기각한 선택지와 이유

- 라이브 Source를 실행 중 재조회: 재import에 따라 실행 입력이 바뀌므로 재현 불가능하다.
- 기존 run 재사용/terminal 덮어쓰기: 실행별 이력을 손상한다.
- DB에 의존하는 orchestration을 core에 추가: db가 이미 core를 사용하므로 순환 의존을 만든다.
- 기존 DB baseline migration 수정: 필요한 두 테이블과 상태·FK·UNIQUE가 이미 존재한다.

### 변경 파일

- docs/DECISIONS.md (이 기록)

### 검증 증거

- 문서 및 현재 코드/Git 읽기 전용 검토 완료. 구현·테스트 NOT_RUN.
- Phase 2 Gate PASS는 DEC-20260914-017의 기존 증거를 인수한 것이며 이번 작업에서 원격 CI를 재실행한 결과가 아니다.

### 미해결 사항 및 Blocker

- 구현 및 런타임 검증 대기. 설계 착수 blocker 없음.

### 다음 작업 인수 조건

- 작업 범위: 위 계약·서비스 및 validation/unit/DB integration 구현·검증.
- 금지 변경: 기존 Phase 2 결정·원본 XLSX·자동승인 OFF·별도 P5 worktree, 외부 호출/배포.
- 완료 조건: run create/success/fail, snapshot 불변, 후보 원자성·중복·상태 경합, 전체 품질 검사 증거와 새 종료 Decision.
- 재검토가 필요한 조건: source/raw와 Import provenance의 불일치 또는 후속 Provider가 snapshot에 없는 정보를 요구할 때.

## DEC-20260915-002 — P3-01 실행 이력·입력 snapshot 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-01 계약·서비스 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-01
- 검토 범위와 근거: DEC-20260915-001, WBS P3-01, 구현 보완 명세 v0.2, 신규 계약·run service·통합 테스트, TEST_REPORT의 2026-09-15 P3-01 기록.
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260915-001의 구현·검증 대기를 완료하며 설계 경계를 유지한다.

### 확정 결정

- Resolve 입력 schemaVersion 1과 resolverVersion을 저장한다. 공개 UUID를 받아 DB Source의 입력과 연결 MASTER UUID를 고정하며 생성 및 조회는 repeatable-read로 일관된 데이터를 읽는다. Source current 수집 시각·raw·identity에 맞는 Import envelope를 찾아 explicit identifier/options/images도 보존한다. 직접 Source 및 매칭 envelope 부재는 import=null이다.
- create/start/succeed/fail/cancel/get을 @bros/resolver로 제공한다. run 행 잠금으로 시작/종료의 단일 승자를 보장하고 terminal 덮어쓰기를 거부한다. 성공 후보와 run 상태는 한 트랜잭션으로 커밋한다. 후보가 없으면 SUCCEEDED/NOT_FOUND이며 오류가 아니다.
- 후보는 CANDIDATE/version 1로 시작한다. evidence/conflict/nullable decimal score/rank를 보존하고 type/norm 중복을 거부한다. 승인/점수/정규화 판단과 MASTER 쓰기는 후속 Task에 남긴다. 실패 메시지는 허용 error code의 고정 문구만 저장한다.
- 내부 snapshot은 raw를 포함하므로 공개 API DTO가 아니다. 검증은 secret-bearing 필드/URL, 비JSON 값, cycle/accessor, 깊이·방문 항목·직렬화 길이·후보 수 제한을 적용한다. 초과 payload를 조용히 잘라 저장하지 않는다.
- 로컬 WBS 검증은 PASS다. 원격 CI는 NOT_RUN이므로 상태는 IMPLEMENTED_NOT_VALIDATED로 기록하며 Phase 3 Gate PASS를 선언하지 않는다. P3-02는 착수 가능하다.

### 기각한 선택지와 이유

- 후보 생성 즉시 ACCEPTED/AUTO_ACCEPTED 또는 MASTER 반영: 후속 Evidence/Hard Gate/검수의 책임을 침범한다.
- Source raw만 snapshot: Import에서 별도로 주어진 명시 식별자·옵션·이미지를 잃으므로 맞는 mapped input을 함께 고정한다.
- 최근 Import row를 조건 없이 선택: 더 늦게 접수된 과거 수집 자료가 실행 입력을 바꾸므로 수집 시각·raw·identity를 대조한다.
- 로컬 PASS를 current Linux CI/Phase 3 Gate PASS로 확대: 원격 검증과 나머지 P3 작업은 수행하지 않았다.

### 변경 파일

- packages/contracts/src/identifier-resolve.ts, packages/contracts/src/index.ts, packages/contracts/test/identifier-resolve.test.mjs
- packages/resolver/package.json, packages/resolver/tsconfig.json, packages/resolver/src/index.ts, packages/resolver/src/run-service.ts
- pnpm-lock.yaml, tests/integration/identifier-resolve.integration.test.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/BLOCKERS.md, docs/RUNBOOK.md

### 검증 증거

- P3-01 단위 4개, 전용 DB 통합 11개(parent 포함) PASS. actual Import→snapshot, 재import/DB pool 재생성, terminal 경합, 후보 저장 이후 DB 오류 rollback 증거 포함.
- 최종 pnpm check exit 0: lint/typecheck/unit/integration/format/build PASS. Admin 27, Node unit 80, integration 121(parent 포함), fail/skip 0. 통합 실행 64,889.5708ms.
- 전용 임시 PostgreSQL 18.6 컨테이너 종료·자동 제거 완료. 새 registry dependency 버전, 기존 DB migration, UI 변경 없음.
- 결과: 로컬 PASS. 원격 push/CI NOT_RUN. 테스트 상세·재현 조건은 TEST_REPORT/RUNBOOK을 따른다.

### 미해결 사항 및 Blocker

- P3-01 착수·로컬 기능 blocker 없음. Phase 3 Gate에서 current revision 원격 CI 증거 필요.
- Provider/정답 표본·정확도·Pattern/Scorer 버전·Queue/crash recovery·공개 API/UI·수동 승인/MASTER 반영은 후속 WBS다. 실제 실행 이력의 품번 정확도를 이번 합성 테스트로 주장하지 않는다.

### 다음 작업 인수 조건

- 작업 범위: P3-02 Brand Pattern Registry의 type mapping/versioning/positive-negative fixtures. 그 후 P3-03은 저장된 입력을 사용해 후보 근거 위치를 추적한다.
- 금지 변경: snapshot 및 terminal 이력 덮어쓰기, 근거 없는 브랜드/품번 확정, 자동승인 OFF 변경, raw의 API 노출, 원본 XLSX 공개, 기존 Phase 2 결정·별도 P5 worktree 변경.
- 완료 조건: Registry match는 후보만 생성하고 brand/type/version과 긍정·부정 fixture 증거를 남긴다. 패턴 근거 부재는 임의 실제 브랜드 규칙으로 채우지 않는다.
- 재검토가 필요한 조건: Provider가 snapshot에 없는 입력 또는 버전 정책을 필요로 하거나, 새 Queue retry/수동검수에서 실행/후보 전이 확장이 필요할 때. 그 경우 새 Decision으로 변경 관계를 기록한다.

## DEC-20260915-003 — P3-02 Brand Pattern Registry 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-02 pattern registry/type mapping/versioning 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-02
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001/002, 설계서 §15.3~15.4, WBS P3-02, 신규 contracts/resolver registry와 fixture, TEST_REPORT 2026-09-15 P3-02 기록.
- 상태: ACCEPTED
- supersedes: 없음. P3-01 입력 snapshot·후보 미확정 정책을 유지하며 Pattern 생성 단계만 추가한다.

### 확정 결정

- pattern registry는 명시적 version 및 unique pattern ID를 가진 immutable configuration snapshot이다. pattern은 canonical brand key, RAW/URL/TITLE/OPTION 입력 출처, Source identifier type, 하나의 named `identifier` capture를 가져야 한다.
- match는 일치한 candidate value/type, pattern ID, registry version, brand/source, 원문 전체 match 위치만 반환한다. Regex 일치는 후보 생성일 뿐 후보 DB 저장, score, Evidence 평가, AUTO_ACCEPTED/ACCEPTED 결정, MASTER/identifier 변경을 하지 않는다.
- raw regex는 512자, 검사 입력은 16,384자로 제한한다. backreference, lookaround, 추가 named capture, 중첩 또는 alternation quantifier를 거부하고 `u` mode로 compile한다. 안전하지 않거나 잘못된 규칙은 등록 전체를 거부하며 입력을 잘라 match하지 않는다.
- 실제 브랜드 품번 규칙은 기준 문서에 없으므로 등록하지 않았다. positive/negative fixture에는 실제 브랜드 정책으로 오해되지 않는 fixture-brand/other-brand만 사용한다.
- 로컬 검증은 PASS다. 원격 CI는 NOT_RUN이므로 P3-02 상태는 IMPLEMENTED_NOT_VALIDATED이며 Phase 3 Gate PASS가 아니다.

### 기각한 선택지와 이유

- DB table/migration으로 registry를 조기 영속화: P3-02 WBS에는 runtime registry/type mapping/versioning만 있으며 운영 CRUD·reload/approval은 정의되지 않았다. 근거 없는 관리 surface를 만들지 않는다.
- wildcard brand pattern 또는 브랜드 불명 규칙 실행: P2-05의 승인 alias 경계와 충돌하고 오탐 범위를 넓힌다.
- regex match에서 CANDIDATE row/점수/자동승인을 생성: P3-03의 발견 근거와 후속 Evidence/Decision 책임을 침범한다.
- 실제 브랜드 규칙을 추정 seed: 문서·정답 표본이 없어 품번을 임의 생성하는 결과가 된다.

### 변경 파일

- packages/contracts/src/identifier-pattern.ts, packages/contracts/src/index.ts
- packages/resolver/src/pattern-registry.ts, packages/resolver/src/index.ts, packages/resolver/test/pattern-registry.test.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거

- P3-02 registry unit 5개 PASS: type mapping/positive-negative fixtures/unsafe regex/version snapshot.
- 최종 `pnpm check` exit 0: lint/typecheck/unit/integration/format/build PASS. Admin 27, Node unit 85, integration 121(parent 포함), fail/skip 0. 통합 22개 파일 61,580.6142ms.
- 작업 전용 PostgreSQL 18.6 container `bros-p3-02-test`로 통합 검증 후 `docker stop` exit 0; `--rm` 정리 완료. DB migration/실제 XLSX/외부 Provider 변경 없음.
- 결과: 로컬 PASS. 원격 push/CI, 실제 브랜드 pattern·정확도 평가, P3-03 연결은 NOT_RUN.

### 미해결 사항 및 Blocker

- P3-02 로컬 기능 blocker 없음. actual brand/type pattern은 확인 가능한 문서·정답 표본 및 version approval이 있어야 추가할 수 있다.
- Pattern 결과를 Resolve candidate/evidence로 바꾸는 P3-03, normalization, Provider, scoring/decision, Queue/API/UI 및 Phase 3 Gate CI는 후속 범위다.

### 다음 작업 인수 조건

- 작업 범위: P3-03 Raw / URL / Text Extractors에서 P3-01 snapshot과 P3-02 registry를 연결해 후보별 발견 위치·원문 근거를 저장 가능한 input으로 만든다.
- 금지 변경: 실제 브랜드 규칙 추정 seed, unknown brand wildcard, regex match 자동확정, snapshot/terminal 이력 변경, raw 공개 API 노출, 원본 XLSX 공개, 기존 Phase 2/P3-01 결정 변경.
- 완료 조건: raw/title/URL/option fixture에서 source locator·원문 근거·pattern metadata를 보존하고, duplicate/bounded traversal/secret-bearing input을 안전하게 처리한다. 후보 persistence·decision은 각 후속 책임 경계에 맞춰 연결한다.
- 재검토가 필요한 조건: 실제 브랜드 규칙/정답 표본 제공, registry 운영 CRUD/reload 요구, regex 안전성 정책의 확장, pattern version을 Resolve Input snapshot에 직접 기록해야 할 Provider/retry 요구가 생길 때.

## DEC-20260915-004 — P3-03 Raw / URL / Text Extractors 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-03 snapshot extractor·provenance 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-03
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~003, 설계서 §15.2~15.4, WBS P3-03, 신규 identifier extractor·fixture, TEST_REPORT 2026-09-15 P3-03 기록.
- 상태: ACCEPTED
- supersedes: 없음. P3-01 input/run·P3-02 registry 결정을 유지하고 발견 단계만 연결한다.

### 확정 결정

- extractor는 revalidated `IdentifierResolveInput`의 title, product URL path/query value, raw JSON string leaf, Import provenance option name을 registry에 전달한다. canonical brand key는 호출자가 제공하며 null/unknown key에서 후보를 만들지 않는다.
- 후보에는 type/value와 locator, whole-regex matched text/offset, pattern ID/version, source만 둔다. raw 전체 또는 URL authority/query 전체를 복사하지 않으며 normalization/dedup, DB row, score, EvidenceCollector, decision, MASTER/identifier write를 하지 않는다.
- raw traversal은 object key 사전순/array 순서로 결정적이다. depth 16, node 5,000, source surface 1,000, candidate 200, surface text 16,384 제한을 넘으면 `truncated=true`로 명시한다. 입력을 자르거나 발견 결과를 완전한 것으로 표시하지 않는다.
- extract 전에 P3-01 input contract를 다시 검증해 secret-bearing field/sensitive URL/비JSON 값이 evidence로 나가지 않도록 한다. malformed registry match도 거부한다.
- 로컬 검증은 PASS다. 원격 CI와 실제 브랜드/정답 데이터 검증은 NOT_RUN이므로 P3-03은 IMPLEMENTED_NOT_VALIDATED 상태다.

### 기각한 선택지와 이유

- raw brand name에서 brand key를 추정해 pattern 실행: P2-05의 승인 alias 정책을 우회하고 후보 오염을 만들 수 있다.
- raw/URL 전체를 evidence로 저장: 최소 근거 원칙과 secret-safe boundary를 훼손한다.
- extractor에서 candidate dedup/normalization 또는 row persistence: P3-06/07과 orchestration 책임을 앞당겨 각 근거를 잃는다.
- 경계 초과 입력을 잘라 정상 완료 처리: 후속 단계가 누락 후보를 모르게 되므로 truncation을 명시한다.

### 변경 파일

- packages/resolver/src/identifier-extractor.ts, packages/resolver/src/index.ts, packages/resolver/test/identifier-extractor.test.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거

- P3-03 unit fixture 4개 PASS: raw/URL/title/option provenance, secret guard, deterministic traversal, bounds/truncation.
- 최종 `pnpm check` exit 0: lint/typecheck/unit/integration/format/build PASS. Admin 27, Node unit 89, integration 121(parent 포함), fail/skip 0. 통합 22개 파일 59,198.7361ms.
- 작업 전용 PostgreSQL 18.6 container `bros-p3-03-test`로 통합 검증 후 `docker stop` exit 0; `--rm` 정리 완료. DB migration/실제 XLSX/외부 Provider 변경 없음.
- 결과: 로컬 PASS. 원격 push/CI, 실제 브랜드 pattern·정답/정확도, P3-06+ 연결은 NOT_RUN.

### 미해결 사항 및 Blocker

- P3-03 로컬 기능 blocker 없음. 실제 canonical brand pattern과 품번 정답 표본 없이 실제 정확도를 주장하지 않는다.
- Evidence 모델/collector, type-specific normalization/dedup, Provider, candidate persistence·run orchestration, scoring/decision, Queue/API/UI 및 Phase 3 Gate CI는 후속 범위다.

### 다음 작업 인수 조건

- 작업 범위: P3-04 Internal Catalog Provider 또는 P3-06 Evidence Model / Collector. P3-04는 verified identifier 재사용의 exact/ambiguous/miss를, P3-06은 P3-03 provenance를 구조적 evidence로 보존한다.
- 금지 변경: brand 추정/wildcard pattern, raw 공개 API 노출, extractor의 자동확정·MASTER write·dedup, input/run 이력 변경, 실제 브랜드 규칙 추정 seed, 원본 XLSX 공개, 기존 Phase 2/P3-01~02 결정 변경.
- 완료 조건: 선택 Task의 후보/근거가 P3-03 locator와 pattern version을 잃지 않고 명시적으로 이어지며, verified/inference 경계와 실패·경합 fixture 증거를 남긴다.
- 재검토가 필요한 조건: matcher가 한 source surface에서 여러 match를 반환해야 하거나, pattern version을 run snapshot에 직접 고정해야 하거나, evidence retention 정책이 matched text보다 엄격한 redaction을 요구할 때.

## DEC-20260915-005 — P3-04 Internal Catalog Provider 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-04 verified internal catalog provider 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-04
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~004, 설계서 §15.2~15.5, WBS P3-04, 신규 internal catalog contract/provider integration test, TEST_REPORT 2026-09-15 P3-04 기록.
- 상태: ACCEPTED
- supersedes: 없음. P3-01~03 경계를 유지하고 verified internal catalog 조회만 추가한다.

### 확정 결정

- provider는 external search 전에 verified internal catalog를 read-only로 exact 조회한다. identifier query는 type+already-normalized norm, brand/name/variant query는 canonical brand key+product name norm+optional option key만 받는다. canonicalization/normalization을 provider에서 추측하지 않는다.
- reuse 대상은 active BRAND와 active MASTER `identifier_status=VERIFIED`다. identifier query는 개별 identifier `is_verified=true`를 추가로 요구한다. inactive/review/unverified/type mismatch는 MISS다.
- 단일 MASTER는 EXACT, 여러 MASTER는 AMBIGUOUS, 없으면 MISS다. 동일 MASTER의 여러 identifier/SKU row는 하나의 MASTER match로 묶고 최대 50을 넘어선 결과에는 truncated를 표시한다. response는 public ID 및 안전한 catalog field만 포함한다.
- provider는 resolve run/candidate/identifier/MASTER를 쓰지 않고 auto accept, confidence, EvidenceCollector, external Provider 호출을 하지 않는다. 실제 data를 변경하지 않는 조회 결과는 후속 P3-05~10에서 추가 판단 근거로만 사용한다.
- local quality commands와 순차 integration은 PASS다. default parallel `pnpm check`의 integration은 기존 100ms statement timeout test가 concurrent long-running DB tests와 경합해 FAIL했으므로, 이를 P3-04 구현 실패나 정책 변경 근거로 취급하지 않는다. 원격 CI는 NOT_RUN이다.

### 기각한 선택지와 이유

- identifier value를 provider에서 normalize: P3-07 type-specific normalizer의 책임을 중복하고 audit 가능한 exact lookup을 흐린다.
- `is_verified` 또는 MASTER VERIFIED/status 조건 없이 internal identifier 재사용: 미검증/review Catalog를 강한 evidence로 승격한다.
- name similarity/trigram 또는 brand 없는 검색: WBS의 exact brand/name/variant lookup을 넘고 ambiguity/오매칭을 넓힌다.
- AMBIGUOUS 결과에서 임의 첫 MASTER를 선택하거나 자동승인: verified identifier 우선 재사용과 자동 결정은 별도 정책이며 후보/결정 경계를 위반한다.
- parallel timeout 실패를 고치려고 global DB timeout을 올림: P1 DB client timeout 검증을 약화하고 P3-04와 무관한 정책을 바꾼다.

### 변경 파일

- packages/contracts/src/internal-catalog.ts, packages/contracts/src/index.ts
- packages/resolver/src/internal-catalog-provider.ts, packages/resolver/src/index.ts
- tests/integration/internal-catalog-provider.integration.test.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md

### 검증 증거

- P3-04 DB integration 6개 PASS: verified exact/SKU, ambiguity, exact brand-name-variant, internal miss, invalid query, read-only.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` exit 0. Admin 27, Node unit 89, fail/skip 0.
- 전체 integration default parallel run은 127 중 123 PASS/4 FAIL. FAIL은 기존 `database-client.integration`의 statement timeout 및 그 이후 rollback assertion이고 P3-04는 PASS; 단독 test 9/9 PASS. `--test-concurrency=1` 전체 integration 23 files/127 PASS, fail/skip 0, 125,223.0558ms.
- 전용 PostgreSQL 18.6 `bros-p3-04-test` 종료·자동 제거 완료. DB migration/timeout 정책/실제 XLSX/외부 Provider 변경 없음.
- 결과: 로컬 품질 명령·순차 통합 PASS, default parallel 환경 회귀는 TEST_REPORT에 제한을 기록. 원격 CI NOT_RUN.

### 미해결 사항 및 Blocker

- P3-04 구현 blocker 없음. actual internal catalog verified identifier/brand-name-variant 정답 표본과 운영 cardinality 성능은 NOT_RUN이다.
- P3-04 result를 run candidate/evidence로 저장, external Provider, EvidenceCollector, normalizer/dedup, score/decision, Queue/API/UI, Phase 3 remote CI는 후속 범위다.
- 병렬 integration의 DB CPU contention은 기존 100ms timeout test의 환경 민감성으로 관찰됐으며 구현 blocker가 아니다. CI에서 재현되면 runner resource/parallelism을 별도 Decision으로 조사한다.

### 다음 작업 인수 조건

- 작업 범위: P3-05 External Candidate Provider Port 또는 P3-06 Evidence Model / Collector. P3-06은 P3-03 provenance와 P3-04 matched internal catalog field를 structured evidence로 결합한다.
- 금지 변경: unverified/review/inactive Catalog 재사용, fuzzy/brandless lookup, provider-side norm 추정, ambiguity 자동선택/auto accept, raw API 노출, DB timeout 임의 완화, existing run/candidate/MASTER write, 실제 XLSX 공개.
- 완료 조건: 선택 Task가 provider result의 query/match/truncated를 보존하고 internal/external evidence 강도와 failure boundary를 구분한다. full integration은 sequential evidence를 유지하며 parallel timeout 재현 여부를 분리 기록한다.
- 재검토가 필요한 조건: actual catalog가 동일 norm으로 50 MASTER를 넘거나, product/variant verified 상태가 현재 schema와 다르거나, CI 병렬 runner에서도 database-client timeout이 재현되면 cardinality/index 또는 test parallel policy를 별도 Decision으로 검토한다.

## DEC-20260915-006 — P3-05 외부 Provider 경계 설계

- 일자/종료 분야: 2026-09-15 / P3-05 설계
- 모델/추론: GPT-6 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 상태: ACCEPTED; supersedes: 없음.
- 검토 범위/근거: AGENTS.md, DEC-20260915-001~005, WBS P3-05, 구현 보완 명세 v0.2 §5, 설계서 §15, Brave 공식 Web Search API·rate limiting·사용약관(2026-09-15 열람).
- 확정 결정: 첫 어댑터는 Brave Web Search 공식 API. 공통 ExternalCandidateProvider는 versioned resolve input과 canonical brand key를 받아 후보/NOT_FOUND/ERROR를 구분한다. 검색 title·URL·description의 registry match는 SEARCH_RESULT/WEAK 근거이며 normalization, confidence, 자동결정, DB 저장은 후속 단계다.
- 장애 경계: secret lookup·예산 예약·HTTP·응답 읽기를 포함한 timeout, 단일 in-flight와 요청 간격, 429 cooldown, 연속 실패 circuit breaker/단일 복구 probe. 오류 원문·응답 원문·키를 반환/로그하지 않는다. 자동 재시도는 하지 않는다.
- 비용/사용 조건: disabled 기본값. fixture는 주입한 transport만 사용한다. live는 계약·저장 권한 확인, 요청별 최대 비용 및 일일 예산, timeout/rate limit과 SecretProvider, 재시작·다중 Worker에 걸친 원자적 공유 예산 예약 구현을 모두 요구한다. 메모리 예산은 fixture 전용이다. 공유 예산 구현과 운영 계약은 외부 입력/운영 통합 선행 조건이며 부재 시 live 차단을 유지한다.
- 기각: 비공식 검색 scraping(사용 조건 불명확), 검색 문구를 verified identifier로 승격(후보/결정 경계 위반), 원본 snapshot 전체 외부 전송(불필요한 raw 노출), 메모리 카운터를 운영 일일 예산으로 사용(재시작/다중 프로세스 우회).
- 변경 파일: docs/DECISIONS.md. 다음 구현 대상 packages/resolver, 관련 테스트 및 운영/Provider 조건 문서.
- 검증: 기준 문서·현재 코드·공식 문서 검토 완료. P3-05 구현/테스트/live 검증은 아직 NOT_RUN.
- 미해결/blocker: 운영 Provider 계약·저장 권한·가격/한도·키 및 공유 예산 저장소 통합 부재. mock/contract 구현 진행 가능, live 완료로 기록 금지.
- 다음 범위/금지/완료 조건: 공통 포트 및 Brave 어댑터 구현, timeout/429/malformed/복구/비용·키 guard 검증. P3-01~04 의미·DB schema·자동승인 정책 변경 금지. 로컬 증거와 live/원격 CI 미검증을 분리 기록한다.

## DEC-20260915-007 — P3-05 Provider 구현 및 로컬 검증 완료

- 일자/종료 분야: 2026-09-15 / External Candidate Provider Port와 첫 SearchEvidence provider 구현·검수
- 모델/추론: GPT-6 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 상태: ACCEPTED; supersedes: 없음. DEC-20260915-006의 설계를 구현하고 P3-01~04 경계를 유지한다.
- 검토 범위/근거: AGENTS.md, DEC-20260915-001~006, WBS P3-05, 구현 보완 명세 v0.2 §5, 설계서 §15, EXTERNAL_PROVIDER_BRAVE.md의 공식 API/사용약관/한도 문서, 신규 unit/HTTP integration 및 전체 회귀 증거.

### 확정 결정

- 공통 포트의 결과는 CANDIDATES/NOT_FOUND 또는 ERROR+고정 code다. 장애 원문을 반환/로그하거나 실패를 NOT_FOUND로 바꾸지 않는다. 전체 작업 timeout은 secret 조회·예산 예약·HTTP/body를 포함한다.
- Brave 어댑터는 고정 HTTPS endpoint, header 키, redirect 거부, query 600자/75단어, web 20개를 사용한다. brand/product name만 query로 보내며 raw/import/internal ID/source URL을 전송하지 않는다.
- P3-02 registry의 TITLE/URL pattern으로 검색 title/description/URL 후보를 만든다. SEARCH_RESULT/WEAK와 URL·시각·검색 순위·surface/locator·matched text/offset·pattern ID/version을 보존한다. description은 DESCRIPTION으로 구분하며 자동확정/정규화/중복제거/score/DB write는 하지 않는다.
- body 512 KiB, 후보 200개, 후보 value 512자 제한을 적용한다. malformed 주요 필드와 unsafe URL/secret은 전체 INVALID_SOURCE_DATA다. 결과/후보 초과는 truncated를 보존한다.
- 한 instance에서 단일 in-flight, 최소 요청 간격, 429 Retry-After/소진 quota window cooldown, 연속 실패 circuit와 단일 복구 probe를 적용한다. query 오류는 장애 횟수에서 제외하고 복구 실패는 다시 차단한다. 자동 재시도는 없다.
- 기본 disabled. fixture는 주입 transport만 사용하고 live는 terms/storage 승인·SecretProvider·모든 비용/한도 설정·SHARED_DURABLE budget을 요구한다. 명시적 true 예산 예약만 HTTP를 허용한다. timeout/실패 비용은 보수적으로 예약 유지한다.
- 운영 공유 예산 adapter는 아직 없고 fixture memory budget만 제공한다. SHARED_DURABLE은 포트 구현자의 보장 계약이다. 운영 다중 Worker rate limit/원자성/재시작 검증을 완료하기 전 live 활성화하지 않는다(BLK-005).

### 기각한 선택지와 이유

- 메모리 일일 카운터의 live 사용: 재시작과 다중 Worker에서 계정 전체 예산을 보장하지 못한다.
- 오류 본문/원본 API response 보존: 비밀 노출과 저장 권한 문제를 만들며 현재 후보 계약에 필요하지 않다.
- live 키 없이 API 검증 완료 표시: 명세가 mock/contract와 live 완료를 구분하도록 요구한다.
- 외부 검색 실패 시 throw/프로세스 종료 또는 빈 성공: 장애 격리와 정상 NOT_FOUND 의미를 깨뜨린다.
- 기본 병렬 테스트의 DB timeout 완화: 기존 검증 정책과 무관한 변경이다. 순차 전체 회귀 증거를 유지한다.

### 변경 파일

- packages/resolver/src/external-candidate-provider.ts, brave-search-provider.ts, index.ts
- packages/resolver/package.json, pnpm-lock.yaml (`@bros/core` SecretProvider/masking 의존성)
- packages/resolver/test/external-candidate-provider.test.mjs
- tests/integration/external-candidate-provider.integration.test.mjs
- docs/EXTERNAL_PROVIDER_BRAVE.md, BLOCKERS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md, DECISIONS.md

### 검증 증거

- 신규 unit 최종 20개, loopback/native HTTP integration 6개 PASS. timeout/429/malformed/복구/동시성/비용/키/근거/truncation을 검증했다.
- lint/typecheck/unit/format/build 명령 각각 PASS. 최종 unit은 packages 전체 build 포함, Admin 27개·Node 109개 PASS. 최종 query/예산 보강 후 HTTP integration 6개와 lint/format을 재검증했다.
- 전체 순차 integration 24 files/133개 PASS, fail/skip 0, 152,776.2065ms. 이 실행 뒤의 query/예산 보강은 영향 범위 unit/HTTP로 재검증했으며 전체 DB integration을 반복하지 않았다.
- 실제 결과와 초기 lint 수정 내역/로그 경로는 TEST_REPORT의 P3-05 기록에 있다. 작업 전용 PostgreSQL stop/--rm 정리 완료. 기존 미커밋 Phase 3 작업을 보존했고 commit/push/remote CI는 수행하지 않았다.

### 미해결 및 다음 인수 조건

- 로컬 구현 blocker 없음. BLK-005: 운영 계약·검색 결과 저장 권한·키·요금/한도와 공유 예산 adapter 통합 미완료. 운영 API/실제 후보 정확도/remote CI NOT_RUN. 구현 상태는 IMPLEMENTED_NOT_VALIDATED를 유지한다.
- 다음 범위: P3-06 Evidence Model / Collector. P3-03 provenance, P3-04 internal 결과, P3-05 SEARCH_RESULT/WEAK를 구조화하고 근거 merge/provenance 저장을 검증한다. live 해소는 별도 운영 입력과 검증이 필요하다.
- 금지 변경: 검색 결과의 verified/강한 근거 승격, 후보 실패를 NOT_FOUND로 숨김, truncated 제거, secret/raw 노출, 무승인 검색 결과 저장, 메모리 budget의 live 사용, 기존 run 상태·normalization·autoaccept 정책 임의 변경.
- 완료 조건: 후보별 왜 도출됐는지 source/locator/시각/패턴 version을 추적할 수 있고 internal/external 근거 강도와 중복 merge 규칙을 테스트한다. 운영 결과 보존은 계약 허용 범위 내에서만 연결한다.
- 다음 추천: gpt-5.6-terra / medium — 정의된 근거 계약과 collector 구현에 적합. 근거 병합/출처·저장 정책 충돌 또는 DB 원자성 설계 변경이 필요하면 gpt-6-astra / high로 전환 전에 새 결정을 기록한다.

## DEC-20260915-008 — P3-06 Evidence Model / Collector 설계

- 일자/종료 분야: 2026-09-15 / P3-06 설계
- 모델/추론: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 상태: ACCEPTED; supersedes: 없음.
- 검토 범위/근거: AGENTS.md, DEC-20260915-001~007, WBS P3-06, 설계서 §15.2·15.5~15.8, 구현 보완 명세 v0.2 §2, P3-03 extractor·P3-04 internal catalog·P3-05 external provider 현재 계약.
- 확정 결정: versioned Evidence는 type/source/strength/weight와 최소 provenance를 가진다. source extract는 locator·match·pattern version·snapshot collectedAt, external search는 provider·safe result URL·rank·retrievedAt, verified internal identifier는 catalog public ID·query·matched identifier를 남긴다. weight는 P3-08이 합산·정책화하기 전의 source별 deterministic hint이며 자동 승인/score가 아니다.
- collector는 type+원문 candidate value가 정확히 같은 항목만 evidence 배열로 합친다. candidateNorm 생성, 대소문자/구두점 보정, 서로 다른 값의 merge, rank·score·conflict·decision·DB write는 P3-07 이후 책임이다. 입력 순서에 영향받지 않게 canonical key/evidence order로 정렬한다.
- identifier query의 verified catalog match만 candidate evidence를 만든다. brand/name/variant query처럼 identifier candidate가 없는 결과는 CatalogReference로 별도 보존하고 식별자를 추측하지 않는다. Provider ERROR는 evidence 또는 NOT_FOUND로 변환하지 않는다.
- 모든 public collector output은 immutable, bounded, secret/unsafe URL 검사된 구조적 값이다. 기존 `identifier_candidate.evidence_json` 배열로 저장할 수 있도록 Evidence schema validator를 제공하지만 run persistence/orchestration 연결은 이번 범위에서 하지 않는다.
- 기각: external 결과를 verified로 승격, 모든 catalog match에서 임의 identifier 생성, raw/provider response 전체 저장, collector에서 score/normalization/DB write.
- 변경 예정: packages/contracts Evidence schema, packages/resolver collector와 tests, 결정·상태·운영·test 기록.
- 검증/Blocker: 구현 전이므로 NOT_RUN. BLK-005 live provider 계약은 fixture 기반 collector 구현을 막지 않는다.
- 다음 범위/완료 조건: P3-03·04·05 fixture를 merge하고 provenance/invalid/secret/truncation/determinism을 검증한다. P3-07 normalization, P3-08 scoring, run persistence·autoaccept를 변경하지 않는다.

## DEC-20260915-009 — P3-06 Evidence Model / Collector 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-06 structured Evidence contract와 Collector 구현·로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-06
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~008, 설계서 §15.2·15.5~15.8, 구현 보완 명세 v0.2 §2, P3-03/04/05 public result 계약, 신규 contracts/resolver tests 및 TEST_REPORT P3-06 기록.
- 상태: ACCEPTED
- supersedes: 없음. P3-01~05의 후보·실행·Provider 경계를 유지한다.

### 확정 결정

- Evidence v1은 identifier type, closed type/source/strength, 0~100 weight, bounded provenance만 가진다. supported source는 extractor/internal catalog/external provider, strength는 WEAK/VERIFIED다. weight는 P3-08 이전 source hint일 뿐 score/rank/auto accept가 아니다.
- Extractor evidence는 source surface별 type과 locator/match/pattern ID·version/snapshot collectedAt을, external evidence는 provider/safe URL/rank/retrievedAt을, verified internal identifier는 public product/SKU ID와 query locator를 보존한다. `validateIdentifierEvidence`는 version, strict object shape, date/range, JSON/size/depth, sensitive text·credential/signed URL을 검증한다.
- Collector는 정확히 동일한 identifier type과 원문 candidate value의 evidence만 merge한다. output/evidence/provenance는 immutable·canonical order다. 표기 차이 candidateNorm/normalization, dedup beyond exact raw identity, confidence/rank, score/conflict/decision은 만들지 않는다.
- identifier query의 verified internal match만 candidate evidence를 만든다. brand/name/variant match는 public product ID/outcome/truncation을 internalCatalogReferences로 보존한다. external ERROR는 providerFailures로 보존하며 evidence나 NOT_FOUND로 변환하지 않는다. 모든 upstream truncation과 collector bound를 output truncated으로 전파한다.
- 기존 P3-01 candidate store의 evidence array validation과 호환함을 확인했다. 이 task는 candidateNorm/rank가 없으므로 run service/DB write를 호출하지 않는다. P3-07이 norm을 만든 뒤 orchestration이 같은 structured evidence array를 write한다.

### 기각한 선택지와 이유

- 모든 catalog result에 identifier를 만들어 candidate화: brand/name result에서 실재하지 않는 품번을 만들 수 있다.
- provider error를 빈 evidence 또는 NOT_FOUND로 변환: 실패와 정상 검색 부재의 운영 의미를 잃는다.
- source raw/provider response 전체 보존: secret 노출 및 Provider 저장 권한 경계를 넘는다.
- collector에서 formatting variant를 merge하거나 score를 계산: P3-07/P3-08 책임과 audit trail을 섞는다.
- DB schema를 바꿔 별도 evidence table 생성: baseline의 identifier_candidate evidence_json 배열과 현재 Task의 candidateNorm 선행 조건을 불필요하게 변경한다.

### 변경 파일

- packages/contracts/src/identifier-evidence.ts, packages/contracts/src/index.ts
- packages/contracts/test/identifier-evidence.test.mjs
- packages/resolver/src/evidence-collector.ts, packages/resolver/src/index.ts
- packages/resolver/test/evidence-collector.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- 신규 Evidence contract/collector unit 8개 PASS: merge/provenance, safe validation, deterministic output, truncation, exact-only boundary, candidate-store payload compatibility.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` exit 0. Admin 27개와 Node unit 117개가 fail/skip 0으로 PASS했다. 첫 unit run의 resolver export import 오류 1건은 test import path 수정 후 재실행 PASS했으며 source implementation 오류가 아니다.
- 전체 integration 24 files/133개가 `--test-concurrency=1`에서 fail/skip 0, 148,579.2003ms PASS했다. 전용 PostgreSQL 18.6 `bros-p3-06-test` stop/--rm 정리 완료.
- migration/DB schema, P3-01 run status/write, P3-02 pattern, P3-03 extraction, P3-04 query semantics, P3-05 live Provider, 실제 XLSX는 변경하지 않았다. remote push/CI는 NOT_RUN이다.
- 결과: 로컬 구현·품질·순차 통합 PASS, remote CI/live Provider/후속 orchestration은 IMPLEMENTED_NOT_VALIDATED.

### 미해결 사항 및 다음 작업 인수 조건

- P3-06 로컬 구현 blocker 없음. BLK-005의 Provider 계약·저장 권한·key/cost/shared budget은 live Provider에 계속 적용한다. 실제 catalog/provider 정답률, external result 장기 보존 적법성, remote CI는 NOT_RUN이다.
- 다음 범위: P3-07 Candidate Normalizer / Deduplicator. type-specific explicit normalization policy로 raw formatting variant를 canonical candidate identity로 합치고, P3-06 evidence를 모두 유지한다. 이후 resolver orchestration이 norm/rank를 채워 candidate store에 atomic write한다.
- 금지 변경: verified internal evidence의 약화/외부 evidence의 verified 승격, raw/provider body 저장, provider ERROR 은닉, unapproved external 저장, score·conflict·decision/autoaccept 도입, catalog query norm 추측, DB timeout 완화.
- 완료 조건: normalization matrix가 type별 허용/비허용 표기 변형을 명시하고 exact raw candidate의 모든 P3-06 provenance가 한 canonical candidate에 남는다. ambiguity/truncation/error reference를 삭제하지 않는다.
- 재검토가 필요한 조건: type별 정규화가 P3-04의 already-normalized query와 다른 canonical form을 요구하거나, evidence 장기 보존 계약이 source URL/matched text의 추가 redaction을 요구하거나, candidate evidence 100개 한도가 실제 source에서 자주 잘릴 때.
- 다음 추천: gpt-5.6-terra / medium — P3-07은 결정된 Evidence contract 위의 bounded normalization matrix 작업이다. identifier type별 정규화 규칙이 실제 브랜드 데이터/정책과 충돌하거나 candidate persistence 원자성을 재설계해야 하면 gpt-6-astra / high로 전환 전에 새 결정을 기록한다.

## DEC-20260915-010 — P3-07 Candidate Normalizer / Deduplicator 설계

- 일자/종료 분야: 2026-09-15 / P3-07 설계
- 모델/추론: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 상태: ACCEPTED; supersedes: 없음.
- 검토 범위/근거: AGENTS.md, DEC-20260915-001~009, WBS P3-07, 설계서 §15.2·15.4·15.7, P3-01 candidate store contract, P2 embedded identifier normalizer, P3-06 EvidenceCollection.
- 확정 결정: `identifier-normalizer/v1`은 NFKC·trim·en-US uppercase를 공통 적용한다. MODEL_NO/STYLE_CODE/PRODUCT_NO/MPN은 공백·underscore·ASCII 및 Unicode hyphen만 제거한다. GTIN은 8/12/13/14자리, EAN은 8/13자리, UPC는 12자리 ASCII digit만 허용하며 같은 separator만 제거한다. BARCODE는 digit-only를 요구하지 않고 공통 canonical form만 적용한다. BRAND_CODE는 NFKC/trim/uppercase만 하고 내부 separator를 보존한다.
- Candidate는 type+candidateNorm으로만 merge한다. 서로 다른 원문 value와 모든 P3-06 evidence를 canonical order로 남기며, display candidateValue는 code-unit lexical 최소 원문값으로 정한다. candidateNorm/score/decision은 구분하고 normalizer는 rank·confidence·conflict·decision·DB write를 하지 않는다.
- 정상화할 수 없는 safe input은 throw/삭제하지 않고 `rejectedCandidates`에 original value/evidence와 `INVALID_IDENTIFIER_FORMAT`을 보존한다. input reference, provider failure, upstream truncation을 output에 그대로 보존하고 merge/evidence cap 초과는 truncated로 표시한다.
- 기각: 모든 type에서 모든 punctuation 삭제(의미 충돌), GTIN family 비숫자/길이 오류를 정상 candidate로 보존(verified lookup 오염), 임의 first value를 display representative로 선택(입력 순서 의존), normalizer의 score/DB write.
- 변경 예정: packages/resolver normalizer/test/export 및 결정·상태·운영·검증 기록.
- 검증/Blocker: 구현 전 NOT_RUN. 실제 브랜드별 separator 의미/legacy catalog representation은 확인되지 않아 v1 범위를 위 타입 정책으로 한정한다. BLK-005와 무관하다.
- 다음 범위/완료 조건: matrix, merge/provenance/rejected/truncation/determinism과 P3-01 store payload compatibility를 검증한다. P3-08 scorer와 run persistence 연결은 변경하지 않는다.

## DEC-20260915-011 — P3-07 Candidate Normalizer / Deduplicator 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-07 type-specific candidate normalization·deduplication 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-07
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~010, WBS P3-07, 설계서 §15.2·15.4·15.7, P2 embedded identifier normalization, P3-01 candidate contract, P3-06 EvidenceCollection, 신규 resolver unit 및 전체 integration evidence.
- 상태: ACCEPTED
- supersedes: 없음. P3-06 exact raw collection과 provenance 계약을 type+canonical norm 단계로 확장한다.

### 확정 결정

- `identifier-normalizer/v1`은 NFKC/trim/en-US uppercase를 공통 적용한다. MODEL_NO/STYLE_CODE/PRODUCT_NO/MPN은 공백·underscore·ASCII/Unicode hyphen만 제거한다. slash/dot 등 다른 구두점은 보존한다.
- GTIN은 8/12/13/14, EAN은 8/13, UPC은 12자리 ASCII digit만 candidateNorm으로 허용한다. BARCODE는 issuer-specific non-numeric form을 보존하고 BRAND_CODE는 내부 separator를 보존한다. 이 v1 범위를 넘는 형식 추정은 하지 않는다.
- type+candidateNorm으로만 merge한다. sourceCandidateValues와 Evidence를 모두 canonical order로 남기며, display candidateValue는 code-unit lexical 최소 원문값이다. input order에 의존하지 않는다.
- invalid typed candidate는 `INVALID_IDENTIFIER_FORMAT` rejectedCandidates로 evidence와 함께 남긴다. 정상 candidate/NOT_FOUND로 바꾸거나 exception으로 버리지 않는다. internal catalog reference, provider failure, upstream/merge truncation도 output에 보존한다.
- normalizer는 rank/confidence/score/conflict/decision, catalog query, resolver run/DB write를 수행하지 않는다. output은 existing `validateResolveCandidates` payload와 호환하지만 P3-08 및 orchestration이 norm/rank를 채울 때까지 쓰지 않는다.

### 기각한 선택지와 이유

- 모든 punctuation을 제거: slash/dot 등 의미 있는 모델 code를 잘못 같은 값으로 만든다.
- GTIN/EAN/UPC 형식 오류를 canonical 후보로 유지: verified internal lookup과 후속 score를 오염한다.
- 입력 첫 값으로 display representative 선택: provider/extractor 실행 순서에 따라 audit output이 바뀐다.
- rejected candidate/근거를 폐기: 왜 후보에서 제외됐는지 추적할 수 없다.
- normalizer에서 candidate row write 또는 score 도입: P3-08/09 책임과 run lifecycle 원자성을 앞당긴다.

### 변경 파일

- packages/resolver/src/candidate-normalizer.ts, packages/resolver/src/index.ts
- packages/resolver/test/candidate-normalizer.test.mjs, packages/resolver/test/evidence-collector.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- 신규 P3-07 unit 7개와 P3-06→07 연결 1개 PASS: normalization matrix, merge/provenance/display determinism, rejected candidate, context/truncation, candidate store payload, malformed guard, evidence cap.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` exit 0. Admin 27개와 Node unit 125개가 fail/skip 0으로 PASS했다. 최초 full unit에서 canonical reference ordering assertion 1건이 FAIL했으며 실제 참조 내용은 보존됐다. 순서 독립 assertion으로 수정 후 PASS했다.
- 전체 integration 24 files/133개가 `--test-concurrency=1`에서 fail/skip 0, 128,720.2182ms PASS했다. PostgreSQL 18.6 `bros-p3-07-test` stop/--rm 정리 완료. migration/DB schema/timeout 정책/실제 XLSX/외부 live Provider는 변경하지 않았다.
- 결과: 로컬 구현·품질·순차 통합 PASS, remote CI/live Provider/후속 orchestration은 IMPLEMENTED_NOT_VALIDATED.

### 미해결 사항 및 Blocker

- P3-07 로컬 구현 blocker 없음. actual brand-specific identifier separator semantics와 legacy catalog norm compatibility는 NOT_RUN이다. BLK-005는 live Provider 활성화에 계속 적용된다.
- remote CI, actual catalog correctness, resolver orchestration/candidate atomic write, P3-08 score, hard conflict, decision/autoaccept은 후속 범위다.

### 다음 작업 인수 조건

- 작업 범위: P3-08 Candidate Scorer. P3-06 weight/strength과 P3-07 normalized candidates를 versioned score로 계산하고 strong evidence/hard conflict의 경계를 명시한다.
- 금지 변경: norm v1을 넘어선 punctuation/fuzzy heuristic, evidence/reference/failure/truncation 삭제, invalid typed candidate 정상화, external evidence verified 승격, score/decision을 normalizer에 추가, run DB write, DB timeout 완화.
- 완료 조건: source evidence 조합에 대해 score가 deterministic·bounded이며 WEAK/VERIFIED evidence를 구분하고 P3-07 provenance를 그대로 전달한다. 자동승인 정책은 P3-09 결정 엔진 전까지 도입하지 않는다.
- 재검토가 필요한 조건: P3-04 catalog의 existing identifier_norm이 v1과 달라 exact lookup miss가 발생하거나, actual brand format에서 slash/dot이 separator라는 승인 근거가 생기거나, source candidate value 512/evidence 100 cap이 실측 입력에서 자주 truncated될 때.
- 다음 추천: gpt-5.6-terra / medium — P3-08은 확정된 strength/weight/norm 위의 deterministic scoring 작업이다. hard conflict와 autoaccept 임계값을 동시에 변경하거나 실제 catalog calibration이 필요하면 gpt-6-astra / high로 전환 전에 새 결정을 기록한다.

## DEC-20260915-012 — P3-08 Candidate Scorer 설계

- 일자: 2026-09-15
- 종료 단계/분야: P3-08 versioned candidate score policy 설계
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-08
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~011, WBS P3-08, 설계서 §15.2·15.6·15.7·15.8, 구현 보완 명세 v0.2 §2·§5, P3-06 Evidence v1 및 P3-07 normalized candidate contract.
- 상태: ACCEPTED
- supersedes: 없음. P3-06 Evidence weight hint와 P3-07 candidate identity를 score policy로 연결한다.

### 확정 결정

- `identifier-scorer/v1`은 Evidence type별 고정 weight를 사용한다: SOURCE_FIELD 45, TITLE_MATCH 30, URL_MATCH 25, OPTION_MATCH 35, VERIFIED_INTERNAL_IDENTIFIER 100, EXTERNAL_CATALOG 15. 후보의 score는 서로 다른 Evidence type의 weight 합을 100으로 cap한다. 같은 type의 여러 provenance는 audit을 위해 모두 보존하되 score에는 한 번만 기여한다.
- Strong Evidence flag는 `INTERNAL_CATALOG`의 `VERIFIED_INTERNAL_IDENTIFIER`와 `VERIFIED` strength가 함께 있는 경우에만 true다. SOURCE/외부 search evidence와 score 100 cap만으로 strong을 추론하지 않는다.
- scorer는 P3-07 `identifier-normalizer/v1` output을 다시 엄격히 검사하고, Evidence schema·type별 fixed weight·source/strength 조합이 v1 정책과 맞지 않으면 fixed `INVALID_SCORING_INPUT`으로 거부한다. candidate는 점수 내림차순 뒤 type+norm canonical key로 정렬하고 1부터 rank를 부여한다.
- output은 normalized candidate/evidence, rejectedCandidates, internal catalog references, provider failures, truncation을 보존하며 `confidenceScore`를 P3-01 candidate store가 받는 2-decimal string으로 제공한다. scoreBreakdown은 type·evidence count·한 번의 weight 기여를 보여 준다.
- 이 task는 Hard Conflict, decision/AUTO_ACCEPTED, resolver run/DB write, catalog/external 재조회, auto-accept 설정과 calibration을 수행하지 않는다. P3-09/10/14가 각각 맡는다.

### 기각한 선택지와 이유

- Evidence 배열의 weight를 그대로 합산: 반복 provenance나 forged weight가 점수를 임의로 올릴 수 있다.
- 동일 type Evidence마다 누적: 같은 source surface의 반복 match가 신뢰도를 부풀린다.
- score 100 또는 multiple weak evidence를 Strong으로 처리: 설계서의 verified strong boundary와 AI/external 약한 근거 원칙을 깨뜨린다.
- scorer에서 95점 자동승인: Hard Conflict detector, Decision Engine, default-off calibration 선행 조건을 건너뛴다.

### 변경 파일

- packages/resolver/src/candidate-scorer.ts, packages/resolver/src/index.ts, packages/resolver/test/candidate-scorer.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- 구현 중 `pnpm --filter @bros/resolver... run build` PASS, scorer golden unit 5개 PASS. 전체 품질·integration은 구현 완료 기록에서 갱신한다.
- 결과: IMPLEMENTED_NOT_VALIDATED. 실제 자동승인 calibration, remote CI, live Provider는 이 설계 증거에 포함하지 않는다.

### 미해결 사항 및 Blocker

- 실제 정답 dataset/holdout이 없으므로 v1 weight의 accuracy/coverage 및 auto accept 활성화 근거는 없다. `RESOLVER_AUTO_ACCEPT_ENABLED=false`를 유지한다.
- BLK-005의 live external Provider 조건은 계속 적용되며 scorer fixture 구현을 막지 않는다.

### 다음 작업 인수 조건

- 작업 범위: golden fixture, determinism, duplicate provenance cap, strong flag, malformed input, P3-01 candidate payload compatibility를 구현·검증한다.
- 금지 변경: conflict/decision/DB write, live Provider, autoaccept enable, actual score threshold tuning, P3-06/07 evidence/norm 정책의 재해석.
- 완료 조건: 같은 normalized input은 scorer version 내에 같은 score/rank/breakdown을 내고, score가 높아도 verified strong flag가 없으면 strong으로 표시되지 않음을 fixture로 증명한다.
- 재검토가 필요한 조건: 새로운 Evidence type/source가 추가되거나 actual holdout calibration이 weight/threshold 변경을 요구하거나, score representation이 DB NUMERIC과 호환되지 않을 때.

## DEC-20260915-013 — P3-08 Candidate Scorer 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-08 versioned deterministic candidate scoring 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-08
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~012, WBS P3-08, 설계서 §15.2·15.6·15.7·15.8, 구현 보완 명세 v0.2 §2·§5, P3-01 candidate contract, P3-06 Evidence v1, P3-07 normalizer v1, 신규 scorer golden fixtures 및 전체 integration evidence.
- 상태: ACCEPTED
- supersedes: 없음. P3-07 normalized candidate 결과에 scorer version·confidence/rank를 추가한다.

### 확정 결정

- `createCandidateScorer().score()`가 `identifier-normalizer/v1` input만 받고 `identifier-scorer/v1` 결과를 만든다. P3-06의 여섯 Evidence type에 고정 weight를 적용하며 유형별 중복 provenance는 score에 한 번만 반영하고, 합계는 100을 넘지 않는다.
- `hasStrongEvidence=true`는 verified internal identifier 하나 이상이 있을 때뿐이다. 여러 WEAK source evidence가 합쳐져 100점이 되더라도 strong으로 승격하지 않는다.
- scorer는 Evidence validator뿐 아니라 v1의 type/weight/source/strength 조합까지 재검증한다. forged weight, weak verified claim, noncanonical candidate display value, unknown normalizer version은 safe fixed error로 실패한다.
- 후보 rank는 score 내림차순, 동점이면 identifier type+candidateNorm code-unit order로 결정한다. scoreBreakdown은 각 type의 evidence count와 한 번의 contribution weight를 남긴다. normalized evidence, source values, rejected candidates, catalog references, provider failures, truncation은 immutable output에 보존한다.
- `confidenceScore`는 P3-01 `validateResolveCandidates`가 받는 fixed two-decimal string이며, scorer output은 conflicts 빈 배열을 붙이면 existing candidate store payload로 검증된다. 이 단계는 decision status를 만들거나 자동승인하지 않는다.

### 기각한 선택지와 이유

- runtime Evidence weight 신뢰: caller가 score를 임의 변경할 수 있어 scorer version policy가 감사 불가능해진다.
- provenance 개수별 누적: 같은 type의 duplicate extractor/provider match가 신뢰도 증폭으로 오해된다.
- strong flag를 score threshold로 추론: verified internal 근거와 weak evidence를 섞는다.
- scorer에서 hard conflict/decision/run write: P3-09/P3-10과 P3-01 transaction boundary를 침범한다.

### 변경 파일

- packages/resolver/src/candidate-scorer.ts, packages/resolver/src/index.ts
- packages/resolver/test/candidate-scorer.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- P3-08 golden unit 5개 PASS: fixed score matrix/cap, duplicate evidence type non-inflation, deterministic rank/context retention, rejected candidate와 P3-01 payload compatibility, forged/malformed input rejection.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` exit 0. Admin 27개와 Node unit 130개가 fail/skip 0으로 PASS했다. 첫 format check는 신규 scorer source/test 두 파일의 Prettier formatting만 FAIL했고, formatter 적용 뒤 format check/build/scorer unit을 재실행해 PASS했다.
- 전체 integration 24 files/133개가 `--test-concurrency=1`에서 fail/skip 0, 130,888.4259ms PASS했다. PostgreSQL 18.6 `bros-p3-08-test` stop/--rm 정리 완료. migration/DB schema/timeout policy/actual XLSX/live Provider는 변경하지 않았다.
- 결과: 로컬 구현·품질·순차 통합 PASS, remote CI/live Provider/actual score calibration/후속 orchestration은 IMPLEMENTED_NOT_VALIDATED.

### 미해결 사항 및 Blocker

- P3-08 로컬 구현 blocker 없음. 200+ actual resolver holdout, 100+ auto-accepted sample 및 오매칭 0건 기준을 채우지 않았으므로 `RESOLVER_AUTO_ACCEPT_ENABLED=false`를 유지한다. score v1은 accuracy/coverage 보증이 아니다.
- BLK-005는 live external Provider에 계속 적용된다. remote CI와 actual catalog/provider correctness는 NOT_RUN이다.

### 다음 작업 인수 조건

- 작업 범위: P3-09 Hard Conflict Detector. P3-08 score/strong flag와 candidate evidence를 읽어 CONFLICT_BRAND/GTIN/MODEL/VARIANT/VOLUME/COLOR를 구조적으로 판정하되 score, decision, DB write를 변경하지 않는다.
- 금지 변경: score weight/strong v1 변경, conflict를 score에 숨김, AUTO_ACCEPTED/ACCEPTED 생성, autoaccept enable/calibration 주장, run persistence, live Provider, DB timeout 완화.
- 완료 조건: conflict fixture가 deterministic하고 candidate/evidence의 provenance와 P3-08 score/rank를 보존하며, P3-10이 hard conflict를 자동승인 금지 조건으로 쓸 수 있는 closed output을 만든다.
- 재검토가 필요한 조건: actual calibration이 score weights를 바꾸거나, conflict field의 source contract가 부족하거나, new Evidence type/source가 scorer v1 밖으로 추가될 때.

## DEC-20260915-014 — P3-09 Hard Conflict Detector 설계

- 일자: 2026-09-15
- 종료 단계/분야: P3-09 deterministic hard conflict policy 설계
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-09
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~013, WBS P3-09, 설계서 §15.6~15.8, 구현 보완 명세 v0.2 §2·§5, P2 MASTER matcher conflict precedent, P3-06 Evidence v1, P3-07 normalizer, P3-08 scorer.
- 상태: ACCEPTED
- supersedes: 없음. P3-08 scored candidate에 conflict result만 추가한다.

### 확정 결정

- `hard-conflict-detector/v1`은 `identifier-scorer/v1` output을 읽어 candidate별 closed conflict code와 `hasHardConflict`를 계산한다. score, rank, strong flag, evidence, rejected/reference/failure/truncation은 보존하며 decision, autoaccept, DB write를 하지 않는다.
- GTIN family(GTIN/EAN/UPC)와 model family(MODEL_NO/MPN/STYLE_CODE)는 verified internal identifier provenance의 product public ID가 family 안에서 두 개 이상 경쟁할 때만 각각 `CONFLICT_GTIN`/`CONFLICT_MODEL`을 만든다. 여러 원문 value나 WEAK evidence만으로는 conflict를 추측하지 않는다.
- BRAND/VARIANT/VOLUME/COLOR는 P3-01 snapshot/raw text에서 추출하지 않는다. 호출자가 trusted adapter/catalog에서 이미 canonicalized 한 `sourceFacts`와 candidate key(type+norm)의 `candidateFacts`를 모두 제공한 경우에만 exact inequality로 `CONFLICT_BRAND`/`VARIANT`/`VOLUME`/`COLOR`를 만든다. 값이 없으면 conflict 없음이며 missing을 match로 취급하지 않는다.
- scorer version, candidate identity/rank/evidence, context fact schema와 candidate mapping은 bounded·strict validation한다. 안전하지 않거나 알 수 없는 input은 `INVALID_CONFLICT_INPUT`으로 partial output 없이 거부한다. conflict output은 code만 남겨 raw fact를 다시 노출하지 않는다.

### 기각한 선택지와 이유

- product name/raw text에서 색상·용량·brand/variant를 휴리스틱으로 추출: 현재 source contract/정답 표본 없이 false conflict를 만든다.
- GTIN/EAN/UPC 또는 model 값이 여러 개라는 사실만으로 conflict: 하나의 제품이 여러 identifier를 보유할 수 있다.
- score가 낮거나 provider failure를 hard conflict로 변환: evidence availability와 product identity 충돌을 혼동한다.
- detector가 review/auto accept/DB 상태를 변경: P3-10 decision 및 P3-01 transaction 책임을 침범한다.

### 변경 파일

- packages/resolver/src/hard-conflict-detector.ts, packages/resolver/src/index.ts
- packages/resolver/test/hard-conflict-detector.test.mjs, packages/resolver/test/evidence-collector.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- 구현 중 resolver build와 detector fixture를 실행했다. 전체 품질·integration 결과는 구현 완료 기록에서 갱신한다.
- 결과: IMPLEMENTED_NOT_VALIDATED. actual catalog/adapter fact population, autoaccept calibration, remote CI는 미검증이다.

### 미해결 사항 및 Blocker

- P3-03/04/05 current output에는 canonical brand/variant/volume/color fact가 없으므로 이 네 conflict는 caller가 명시적으로 전달한 값에서만 검출된다. 추가 extractor/catalog projection은 별도 contract 결정이 필요하다.
- `RESOLVER_AUTO_ACCEPT_ENABLED=false`와 BLK-005 live Provider 조건을 유지한다.

### 다음 작업 인수 조건

- 작업 범위: each-code/combinations/determinism/malformed input 및 P3-06→09 provenance handoff를 구현·검증한다.
- 금지 변경: fact 추론, score v1 변경, conflict를 score에 반영, decision/autoaccept/run write, live Provider, DB timeout policy.
- 완료 조건: six hard code fixture와 verified target 조건·false-positive guard를 보이고, P3-10이 `hasHardConflict`만으로 자동승인을 차단할 수 있는 closed output을 만든다.
- 재검토가 필요한 조건: canonical fact source가 확정되거나 actual catalog가 multi-identifier identity semantics를 바꾸거나, P3-10이 conflict evidence detail을 추가로 요구할 때.

## DEC-20260915-015 — P3-09 Hard Conflict Detector 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-09 structured hard conflict detection 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-09
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~014, WBS P3-09, 설계서 §15.6~15.8, 구현 보완 명세 v0.2 §2·§5, P2 matcher conflict behavior, P3-06~08 public contracts, 신규 detector 및 handoff fixtures.
- 상태: ACCEPTED
- supersedes: 없음. P3-08 output을 deterministic conflict layer로 확장한다.

### 확정 결정

- `createHardConflictDetector().detect(scoring, context)`가 `hard-conflict-detector/v1` 결과를 반환한다. six code는 immutable code-only conflicts와 `hasHardConflict`로 candidate에 붙고, scorer의 confidence/rank/strong/evidence와 P3-07 source values를 변경하지 않는다.
- verified internal target ID가 경쟁하는 GTIN/model family에만 해당 conflict를 부여해 valid multi-value identifier를 차단하지 않는다. explicit facts는 source와 exact candidate key 모두 있는 경우만 compare하여 brand/variant/volume/color conflict를 만든다.
- P3-06→P3-09 연결 fixture에서 collector provenance가 normalizer/scorer/detector를 지나도 유지되며, verified single target에 conflict가 만들어지지 않음을 확인했다.
- detector는 decision status를 만들지 않으며 `hasHardConflict`는 P3-10의 automatic acceptance guard input일 뿐 현재 운영 설정을 바꾸지 않는다.

### 기각한 선택지와 이유

- missing source/candidate fact를 conflict 또는 equality로 간주: 데이터 부재를 product mismatch로 오판한다.
- raw facts를 conflict output에 저장: 최소 evidence·secret-safe 경계를 불필요하게 넓힌다.
- P2 matcher의 DB candidate lookup을 그대로 재사용: P3-09는 scored resolver candidate의 pure evaluation이며 read/write orchestration이 아니다.

### 변경 파일

- packages/resolver/src/hard-conflict-detector.ts, packages/resolver/src/index.ts
- packages/resolver/test/hard-conflict-detector.test.mjs, packages/resolver/test/evidence-collector.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- P3-09 unit 5개와 P3-06→09 handoff 1개 PASS: explicit BRAND/VARIANT/VOLUME/COLOR, competing verified GTIN/model target, multiple-value false-positive guard, deterministic/no-decision output, malformed input rejection, provenance handoff.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` exit 0. Admin 27개와 Node unit 136개가 fail/skip 0으로 PASS했다.
- 전체 integration 24 files/133개가 `--test-concurrency=1`에서 fail/skip 0, 127,295.5803ms PASS했다. PostgreSQL 18.6 `bros-p3-09-test` stop/--rm 정리 완료. migration/DB schema/timeout policy/actual XLSX/live Provider는 변경하지 않았다.
- 결과: 로컬 구현·품질·순차 통합 PASS, remote CI/live Provider/actual canonical fact source·score calibration/후속 orchestration은 IMPLEMENTED_NOT_VALIDATED.

### 미해결 사항 및 Blocker

- canonical brand/variant/volume/color fact projection과 actual labeled conflict accuracy는 NOT_RUN이다. P3-10은 detector output을 사용하되 these facts가 missing일 때 absence of conflict를 autoaccept evidence로 읽으면 안 된다.
- autoaccept remains disabled until P3-14 holdout criteria; BLK-005 stays applicable to live Provider.

### 다음 작업 인수 조건

- 작업 범위: P3-10 Decision Engine. P3-08 confidence/strong과 P3-09 `hasHardConflict`를 closed input으로 받아 95/80/60 boundary 결과를 결정한다.
- 금지 변경: score/conflict v1 재정의, missing fact 추론, autoaccept enable/calibration claim, run/DB write, identifier promotion, live Provider, DB timeout 완화.
- 완료 조건: score boundaries 59/60/79/80/94/95/100, strong evidence, hard conflict guard, no-candidate/rejected/truncated behavior를 deterministic fixture로 검증하고 상태 write 없이 decision recommendation만 만든다.
- 재검토가 필요한 조건: P3-10의 NOT_FOUND semantics가 rejected/truncated/provider failure handling을 추가로 요구하거나, decision output persistence contract가 P3-01 candidate status와 충돌할 때.

## DEC-20260915-016 — P3-10 Decision Engine 설계

- 일자: 2026-09-15
- 종료 단계/분야: P3-10 deterministic decision policy 설계
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-10
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~015, WBS P3-10, 설계서 §15.7~15.9, 구현 보완 명세 v0.2 §5, P3-08 scorer 및 P3-09 detector contracts.
- 상태: ACCEPTED
- supersedes: 없음.

### 확정 결정

- `decision-engine/v1`은 95+ Strong+no hard conflict를 `AUTO_ACCEPTED` 권고, 80~94 및 95+ weak를 REVIEW_REQUIRED, 60~79를 CANDIDATE, 60 미만을 NOT_FOUND 권고로 결정한다. `AUTO_ACCEPTED`는 pure recommendation이며 DB status/write나 운영 autoaccept enable을 뜻하지 않는다.
- hard conflict와 truncated input은 점수/strong보다 우선하여 REVIEW_REQUIRED다. 후보 없음은 정상 NOT_FOUND이나 provider failure, truncation, rejected identifier가 있으면 incomplete 결과로 REVIEW_REQUIRED다.
- P3-14 holdout 전 `RESOLVER_AUTO_ACCEPT_ENABLED=false`를 유지한다. engine은 provider/catalog 호출, candidate/run/identifier write, promotion, config 변경을 하지 않는다.

### 기각한 선택지와 이유

- score 95만으로 auto accept: Strong/Conflict gate를 무시한다.
- empty failure를 NOT_FOUND: 검색 장애와 정상 부재를 섞는다.
- engine에서 AUTO_ACCEPTED DB 저장: P3-01 transaction과 P3-11 promotion, P3-14 activation을 앞당긴다.

### 변경 파일

- packages/resolver/src/decision-engine.ts, packages/resolver/src/index.ts
- packages/resolver/test/decision-engine.test.mjs, packages/resolver/test/evidence-collector.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- 구현 완료 기록에서 갱신.

### 미해결 사항 및 Blocker

- actual holdout/calibration, remote CI, orchestration/write는 NOT_RUN. BLK-005 live Provider 조건 유지.

### 다음 작업 인수 조건

- 작업 범위: P3-11 approved candidate promotion/audit.
- 금지 변경: autoaccept enable, decision policy 변경, live Provider, DB timeout policy.
- 완료 조건: P3-10 recommendation을 실제 DB transaction으로 연결하기 전 P3-11 승인/승격 경계를 명확히 한다.
- 재검토가 필요한 조건: P3-11 persistence status가 recommendation semantics와 충돌할 때.

## DEC-20260915-017 — P3-10 Decision Engine 로컬 구현·검증 완료

- 일자: 2026-09-15
- 종료 단계/분야: P3-10 decision recommendation 구현 및 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-10
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~016, WBS P3-10, P3-06~09 contracts와 신규 boundary/handoff fixtures.
- 상태: ACCEPTED
- supersedes: 없음.

### 확정 결정

- `createDecisionEngine().decide()`는 candidate별 `recommendedDecision`, `decisionReason`, `autoAcceptEligible`와 run-level outcome을 immutable하게 반환한다. 59/60/79/80/94/95/100 boundary, strong requirement, hard conflict/truncation override를 고정했다.
- provider failure/rejected/truncated empty result는 REVIEW_REQUIRED로, 아무 candidate/context failure가 없는 empty result만 NOT_FOUND로 구분한다. recommendation은 `decisionStatus`를 만들거나 DB를 쓰지 않는다.

### 기각한 선택지와 이유

- autoaccept eligibility를 운영 activation으로 해석: P3-14 calibration과 기본 OFF 정책을 위반한다.
- low score candidate를 삭제: audit 및 NOT_FOUND 판단 근거를 잃는다.

### 변경 파일

- packages/resolver/src/decision-engine.ts, packages/resolver/src/index.ts
- packages/resolver/test/decision-engine.test.mjs, packages/resolver/test/evidence-collector.test.mjs
- docs/DECISIONS.md, IMPLEMENTATION_STATUS.md, RUNBOOK.md, TEST_REPORT.md

### 검증 증거

- P3-10 unit 5개와 P3-06→10 handoff 1개 PASS: seven score boundaries, strong/hard conflict/truncation gates, empty outcome distinction, determinism/no persistence, malformed input, provenance handoff.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` exit 0. Admin 27개·Node unit 141개 PASS.
- 전체 순차 integration 24 files/133개 PASS, fail/skip 0, 138,451.3693ms. PostgreSQL 18.6 `bros-p3-10-test` stop/--rm 완료.
- 결과: 로컬 PASS; remote CI/live Provider/holdout calibration/orchestration DB write는 IMPLEMENTED_NOT_VALIDATED.

### 미해결 사항 및 Blocker

- `RESOLVER_AUTO_ACCEPT_ENABLED=false` 유지. actual canonical fact/holdout과 remote CI NOT_RUN, BLK-005 유지.

### 다음 작업 인수 조건

- 작업 범위: P3-11 PRODUCT_IDENTIFIER promotion/audit.
- 금지 변경: P3-10 policy/autoaccept enable, unapproved identifier promotion, live Provider, DB timeout 변경.
- 완료 조건: accepted/manual approval만 identifier에 반영하고 audit/race/rollback을 검증한다.
- 재검토가 필요한 조건: P3-11이 recommendation과 persisted decision status의 명시적 변환을 요구할 때.

## DEC-20260915-018 — P3-11 Identifier Promotion / Audit 구현 진행 기록

- 일자: 2026-09-15
- 종료 단계/분야: P3-11 manual identifier promotion transaction 구현
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-11
- 검토 범위와 근거: AGENTS.md, DEC-20260915-001~017, WBS P3-11, P3-01 run/candidate schema, product_identifier physical contract.
- 상태: ACCEPTED
- supersedes: 없음.

### 확정 결정

- `createIdentifierPromotionService().promoteManual()`은 candidate public ID·actor·expectedVersionNo를 검증하고 candidate를 lock한다. CANDIDATE 상태와 version을 확인한 뒤 동일 transaction에서 product identifier upsert/primary 교체/verified 표시, candidate ACCEPTED·actor·timestamp·version update, MASTER identifier_status VERIFIED를 수행한다.
- 동일 type+norm이 다른 MASTER에 있으면 promotion을 `IDENTIFIER_CONFLICT`로 거부한다. auto promotion은 P3-14 calibration 전 `AUTO_PROMOTION_DISABLED`로 차단한다.

### 기각한 선택지와 이유

- P3-10 AUTO_ACCEPTED 권고만으로 DB promotion: default-off calibration과 approval 경계를 우회한다.
- candidate 상태 변경과 identifier write 분리: partial promotion과 감사 불일치를 만든다.

### 변경 파일

- packages/resolver/src/identifier-promotion-service.ts, packages/resolver/src/index.ts, packages/resolver/test/identifier-promotion-service.test.mjs
- docs/DECISIONS.md

### 검증 증거

- resolver build PASS. auto disable 및 malformed manual request pre-transaction unit 2개 PASS.
- 전체 DB integration과 quality suite는 아직 NOT_RUN이다.

### 미해결 사항 및 Blocker

- manual promotion 성공/duplicate/race/rollback DB integration과 전체 회귀가 필요하다. remote CI/live Provider/holdout calibration도 NOT_RUN이다.

### 다음 작업 인수 조건

- 작업 범위: P3-11 DB integration fixture를 추가해 manual promotion, duplicate norm, version race, rollback을 검증하고 전체 quality/순차 integration을 실행한다.
- 금지 변경: autoaccept enable, unapproved promotion, DB timeout policy.
- 완료 조건: 실제 PostgreSQL에서 승인되지 않은 candidate가 identifier로 승격되지 않으며 transaction rollback과 경쟁 version이 증명된다.
- 재검토가 필요한 조건: candidate가 연결된 MASTER가 없는 resolver run을 promotion 대상으로 허용해야 할 때.

## DEC-20260915-019 — P3-11 검증 전 승인 경계 보정

- 일자: 2026-09-15
- 종료 단계/분야: P3-11 코드 검토 및 결함 수정 설계
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 검토 범위와 근거: AGENTS.md, 운영 지침 v0.3, 구현 보완 명세 v0.2의 동일 승인 replay/버전 충돌/원자적 promotion, WBS P3-11, P3-01/07/09/10 및 P2 MASTER identity lock 구현.
- 상태: ACCEPTED
- supersedes: DEC-20260915-018 중 승인 상태·중복 요청·lock/upsert/audit 세부 구현. 자동 승격 차단 결정은 유지.
- 확정 결정: 미결정 CANDIDATE/REVIEW_REQUIRED만 수동 승인한다. 동일 actor/candidate/입력 version의 완료 요청은 영속 receipt로 replay하고 다른 요청은 충돌 처리한다. source → identity advisory lock → MASTER → run/candidate 순서로 직렬화한다. identity lock은 P2 namespace/hash 및 GTIN/EAN/UPC family와 호환한다. run의 고정 MASTER와 현재 source/snapshot 일치, 성공 run, canonical norm, conflict 부재를 재검증한다. MASTER scope(sku_id IS NULL)만 upsert/primary 교체하고 SKU는 보존한다. 기존 identifier evidence와 candidate evidence에 승인 이력을 보존하며 MASTER version도 증가시킨다.
- 기각한 선택지와 이유: 현재 source의 새 MASTER에 과거 후보 승인(대상 변경), SKU primary 일괄 해제(별도 scope 훼손), 버전 불일치로 동일 replay 거부(보완 명세 위반), override 없는 hard conflict 승인 및 자동 승격 활성화(승인 경계 우회).
- 변경 파일: docs/DECISIONS.md. 다음 구현 대상은 identifier-promotion-service.ts 및 전용 unit/integration이다.
- 실행 검증과 결과: 코드/기준 문서 검토 완료. 신규 구현/DB 검증은 아직 NOT_RUN이며 PASS로 간주하지 않는다.
- 미해결 사항 및 blocker: 실제 PostgreSQL 경쟁/rollback 검증 필요. remote CI/live Provider/holdout 미실행. 재수집으로 snapshot이 달라진 미승인 후보는 새 run이 필요하다.
- 다음 작업 범위/금지 변경/완료 조건: 위 결함 수정, 실제 DB 성공/replay/race/rollback 및 전체 품질·순차 회귀를 실행한다. 자동 승격, global DB timeout, 기존 P3 score/decision 정책 변경 금지. 실제 결과와 잔여 제한을 별도 결정으로 기록한다.

## DEC-20260915-020 — P3-11 수동 승격 로컬 검증 완료 및 운영 연결 제한

- 일자: 2026-09-15
- 종료 단계/분야: P3-11 승인 서비스 결함 수정 및 PostgreSQL/전체 로컬 회귀 검증
- 작성 모델/추론 수준: GPT-6 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-11
- 검토 범위와 근거: AGENTS.md, 운영 지침 v0.3, 구현 보완 명세 v0.2 §2의 미결정·동일 요청 replay·원자적 승인, WBS P3-11, DEC-20260915-011/018/019, P2 identity lock, P3-01/07/09/10, 전용 PostgreSQL fixture 및 전체 순차 integration.
- 상태: ACCEPTED
- supersedes: 없음. DEC-20260915-019 구현·검증 증거를 확정하며 DEC-20260915-011의 legacy 호환 미검증 항목을 BLK-006으로 구체화한다.

### 확정 결정

- strict request를 await 전에 복사한다. SUCCEEDED run의 CANDIDATE/REVIEW_REQUIRED, 고정 MASTER 및 current source/snapshot 일치, canonical candidate norm, 안전한 evidence, conflict 부재를 승인 조건으로 한다. stale/unlinked/terminal/충돌 후보는 identifier를 변경하지 않는다.
- source → 동일 저장 norm의 P2 호환 identity advisory lock → MASTER → run/candidate 순서를 사용한다. GTIN/EAN/UPC는 family lock/중복 검사를 공유한다. MASTER scope만 upsert/primary 교체하며 SKU scope는 그대로 유지한다.
- identifier 이전 evidence와 candidate 원 evidence를 보존하고 public ID·actor·time·입력/결과 version을 가진 수동 승인 receipt를 기록한다. 같은 요청은 재접속/재수집 이후에도 무변경 replay한다. MASTER version도 증가한다. 모든 변경은 한 트랜잭션이다.
- 자동 승격은 DB 접근 전 AUTO_PROMOTION_DISABLED다. 이번 결과는 로컬 구현·검증 PASS이며 원격 CI 및 운영 연결을 포함한 최종 상태는 IMPLEMENTED_NOT_VALIDATED다.

### 기각한 선택지와 이유

- 동일 요청을 VERSION_CONFLICT로 처리하거나 identifier 근거를 덮어쓰기: replay 및 감사 인수 요구 위반.
- product scope와 SKU scope를 함께 변경: 기존 SKU 식별자 소유권/primary 훼손.
- 원자성 없는 충돌 preflight: concurrent approval이 두 MASTER를 같은 exact identifier로 승격할 수 있다.
- 검증을 위해 global DB timeout 완화: 기존 장애 경계의 의미를 변경한다. 기존 순차 회귀 방식으로 실행했다.
- legacy norm을 조용히 P3 정책으로 재작성: DEC-20260915-011의 보류된 브랜드별 의미 및 기존 lookup/matcher 정책을 변경한다. BLK-006 해소를 위한 별도 호환/migration 결정과 검증이 필요하다.

### 변경 파일

- packages/resolver/src/identifier-promotion-service.ts
- packages/resolver/test/identifier-promotion-service.test.mjs
- tests/integration/identifier-promotion.integration.test.mjs
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md, docs/BLOCKERS.md
- 기존 resolver export, P3-01~10 미커밋 변경 및 examples/는 유지했다. migration/timeout/score/decision 정책은 변경하지 않았다.

### 검증 증거

- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build`: 최종 PASS(exit 0). 최초 신규 lint 4건을 수정한 후 검증했다. Admin 27 / Node unit 145 PASS; 전용 promotion unit 4개 포함.
- `node --test tests/integration/identifier-promotion.integration.test.mjs`: PostgreSQL 전용 15개(parent 포함) PASS. 실제 replay/race/공유 lock waiter/late-trigger rollback을 확인했다.
- 전체 25 integration files를 `--test-concurrency=1`로 실행: 148 PASS, fail/skip 0, 131,013.2696ms. 상세 결과는 TEST_REPORT와 Git 제외 tmp/p3-11-*.log에 있다. 병렬 pnpm check/remote CI PASS로 해석하지 않는다.
- P2/P3 실제 normalizer 실행: MODEL_NO `AB-123` → P2 `AB-123`, P3 `AB123`. 이 차이와 관련 legacy catalog concurrency는 이번 exact norm 테스트 범위 밖이다.
- 검증 컨테이너 bros-p3-11-test는 stop/--rm 정리 완료. 각 disposable DB cleanup 완료.

### 미해결 사항 및 Blocker

- BLK-006: P2/P3 legacy norm 차이로 catalog miss/의미상 중복/상이한 advisory lock 위험. 운영 연결 전 호환 lookup·lock·write 또는 migration 정책과 실제 양방향 회귀를 검증해야 한다.
- BLK-005 live Provider, remote CI, holdout/calibration, 자동승격 success path, P3-12 orchestration 및 P3-13 인증된 actor 연결은 NOT_RUN. 자동승격은 OFF를 유지한다.

### 다음 작업 인수 조건

- 작업 범위: BLK-006 호환 정책/데이터 분포와 양방향 legacy fixture 검증을 우선 수행한 뒤 P3-12 batch Worker orchestration을 연결한다. P3-13 API에서 actor는 인증된 운영자 정보로 채운다.
- 금지 변경: 승인 없는 promotion, autoaccept enable, timeout 완화, 기존 norm/score/decision의 기록 없는 변경, audit/evidence 폐기, SKU scope 재해석.
- 완료 조건: legacy/P3 양쪽 norm에서 catalog 재사용·중복 방지·동시 import/promotion이 증명되고 run lifecycle과 Worker retry/restart 원자성이 유지된다. Phase 3 Gate에서 current revision remote CI 증거를 별도로 확보한다.
- 재검토가 필요한 조건: hard conflict override, unlinked run 수동 연결, 직접 식별자 입력 또는 automatic promotion을 실제 API/Worker에 도입할 때.

## DEC-20260915-021 — BLK-006 P2/P3 저장 norm 비교·경합 호환 로컬 해소

- 일자: 2026-09-15
- 종료 단계/분야: 기존 DB 조사, P2/P3 정규화 호환 정책 구현 및 PostgreSQL/전체 회귀 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(정확한 추론 수준 미노출)
- 관련 WBS Task: P3-04/07/11/12, Phase 3 Gate
- 검토 범위와 근거: AGENTS.md, 운영 지침 v0.3, 구현 보완 명세 v0.2, WBS P3-04/07/11, DEC-20260915-011/019/020, P2 extractor/matcher/MASTER lock, P3 normalizer/catalog/promotion, 001 migration, 중지된 BROS DB volume의 읽기 전용 사본, 신규 호환 fixture/전체 품질·순차 integration.
- 상태: ACCEPTED
- supersedes: DEC-20260915-011의 legacy catalog norm 호환 미검증·후속 범위와 DEC-20260915-020의 BLK-006 운영 연결 제한. 두 기록의 저장 정규화/수동 승인/자동승격 정책은 유지한다.

### 확정 결정

- P2 `identifier_norm`과 P3 `candidate_norm`을 재작성하지 않는다. MODEL_NO/STYLE_CODE/PRODUCT_NO/MPN의 v1 separator 정책, 유효한 GTIN/EAN/UPC의 digit/길이에만 version-bridging 비교 키를 적용한다. slash/dot, BARCODE/BRAND_CODE, invalid GTIN은 exact 또는 기존 유효성 경계를 유지한다.
- P2/P3 writer는 기존 namespace/hash의 저장 norm 키와 비교 키를 모두 중복 제거·bigint 순서로 잠근다. P2 matcher/P3 verified catalog/P3 promotion 충돌·upsert는 동일한 SQL 비교식을 사용한다. 002 비유일 인덱스로 이 조회를 지원한다. 기존 scope unique는 그대로 유지한다.
- 같은 MASTER의 legacy 행은 P3 승인에서 기존 public ID·previous evidence를 보존해 upsert한다. 이미 다른 MASTER에 의미상 같은 행이 있으면 조회는 AMBIGUOUS, 승인은 IDENTIFIER_CONFLICT가 된다. 기존 데이터를 자동 병합하지 않는다.
- BLK-006은 current BROS 데이터(기준 MASTER/identifier/candidate/source/import 각 0행)와 로컬 PostgreSQL fixture 범위에서 RESOLVED_LOCAL이다. 실제 DB 002 migration과 current revision remote CI/Phase 3 Gate는 별도 NOT_RUN이다.

### 기각한 선택지와 이유

- 001 baseline 또는 기존 저장 norm/유일성 규칙 덮어쓰기: DEC-20260912-010/DEC-20260915-011의 버전 의미와 원본 evidence를 깨뜨린다.
- 모든 punctuation·issuer code를 같은 값으로 간주: slash/dot/BRAND_CODE/BARCODE의 의미를 근거 없이 합친다.
- raw legacy GTIN을 길이·digit 검증 없이 canonical화: 기존 P2 exact 조회를 잃고 유효하지 않은 값을 P3 strong evidence로 오인한다.
- 동일 의미의 여러 기존 MASTER 자동 병합: 소유 관계와 검수 결정을 추정한다. AMBIGUOUS/충돌로 남긴다.
- 실행 중인 원본 DB/volume에 audit 마이그레이션 또는 카탈로그 재작성: 사용자 데이터에 불필요한 쓰기다. 중지된 원본을 읽기 전용으로 복사한 사본에서 집계만 확인했다.

### 변경 파일

- packages/contracts/src/identifier-compatibility.ts, packages/contracts/src/index.ts
- packages/db/src/identifier-compatibility.ts, packages/db/src/index.ts, packages/db/src/migration-runtime.ts, packages/db/src/migrations/002-identifier-compat-index.ts
- packages/importer/src/master-service.ts, packages/importer/src/master-matcher.ts
- packages/resolver/src/internal-catalog-provider.ts, packages/resolver/src/identifier-promotion-service.ts
- tests/integration/identifier-compatibility.integration.test.mjs, tests/integration/database-schema.integration.test.mjs
- docs/DECISIONS.md, docs/BLOCKERS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md
- 원본 BROS DB/volume, 001 baseline migration, P2/P3 저장 norm 정책, 자동승격·timeout은 변경하지 않았다.

### 검증 증거

- 실DB 사본: `bros` MASTER/identifier/candidate/source/import 각각 0행, migration 이력 001 한 건. 원본 compose pinned 이미지에서 collation 저장/현재 2.36/2.36. 원본 DB 미기동·미변경; 사본은 감사 후 삭제.
- 신규 compatibility integration 10개(parent 포함) PASS: 양방향 조회/재사용, P2/P3 실제 concurrent import/approval, shared advisory waiter, 다른 MASTER conflict 및 ambiguous, same MASTER legacy upsert/audit, Unicode/ASCII 비교 parity, invalid GTIN exact, 002 migration index. migration down/forward fixture PASS. 초기 단일 migration down 전제 테스트는 FAIL, 002→001 두 단계 테스트로 수정 후 PASS.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build` 최종 PASS(exit 0). Admin 27/Node unit 145 PASS. 전체 26 integration files `--test-concurrency=1`: 158 PASS, fail/skip 0, 133,651.777ms. 1k import elapsed 40,282ms. 상세 결과 TEST_REPORT 및 Git 제외 tmp/blk-006-*.log.
- 병렬 `pnpm check`, actual DB 002 migration, current revision remote CI/live Provider/holdout은 NOT_RUN으로 구분한다.

### 미해결 사항 및 Blocker

- BLK-006은 RESOLVED_LOCAL. 원격 CI·Phase 3 Gate·실DB migration 적용 증거는 없으므로 전체 운영 PASS로 확장하지 않는다. 이후 실제 catalog에 다중 MASTER 의미상 alias가 생기면 수동 소유 결정이 필요하다.
- BLK-005 live Provider 및 P3-12/13 orchestration·인증 actor, P3-14 holdout/자동승격 활성화는 후속 범위다.

### 다음 작업 인수 조건

- 작업 범위: P3-12 resolver batch Worker 연결 시 P2/P3 비교 키를 통해 기존 MASTER 조회·승인 경계를 유지한다. 운영 migration 전 BROS DB 재집계/current revision CI를 별도로 수행한다.
- 금지 변경: 승인 없는 promotion, 자동승격 enable, 기존 stored norm/001 baseline 재작성, slash/dot/issuer code heuristic 병합, invalid GTIN strong 승격, global timeout 완화, 감사 evidence 폐기.
- 완료 조건: Worker의 run/candidate 처리와 import/approval 경합·retry/restart가 안전하고 current revision CI/Phase 3 Gate 근거가 생긴다.
- 재검토가 필요한 조건: 실제 데이터에서 비교식과 다른 브랜드별 separator 의미, 다중 MASTER semantic duplicates, Unicode 대소문자/issuer code 차이 또는 인덱스 성능 병목이 확인될 때 새 결정으로 정책을 조정한다.

## DEC-20260915-022 — P3-12 Resolver Batch Worker 로컬 구현·검증

- 일자: 2026-09-15
- 종료 단계/분야: Resolver batch admission, Worker orchestration, retry/restart/reconciliation, 로컬 회귀 검증
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-12; 연결 범위 P3-01~P3-11, P1-03/05/09/10
- 검토 범위와 근거: AGENTS.md, doc/README.md, WBS P3-12, 구현 보완 명세 v0.2의 Queue 원자성·자동승인 OFF, DEC-20260915-001~021, 현재 Resolver/Worker/Queue/DB 코드와 PostgreSQL fixture
- 상태: ACCEPTED — 구현 정책 및 로컬 검증 범위. Task 상태는 IMPLEMENTED_NOT_VALIDATED이며 운영/Phase Gate PASS가 아니다.
- supersedes: 없음. 기존 저장 norm·score/threshold·자동승격 OFF 정책을 유지하고 Queue 관리 실행 계약을 추가한다.

### 확정 결정

- 요청 UUIDv7/source UUIDv7 조합을 unique admission key로 저장한다. 동일 요청/source는 기존 run을 replay하며 다른 resolverVersion은 conflict다. terminal 재분석은 새 요청 UUID다. 한 요청에서 중복 source는 제거한다.
- 최대 10,000개 source, 기본 100개 목록 chunk, 상품별 transaction으로 snapshot/run/Queue/receipt를 원자 저장한다. 실패 상품은 고정 code로 반환하고 성공한 형제는 보존한다. 기본 활성 run 상한 1,000과 admission advisory lock을 적용한다. Queue 메시지는 run publicId만 포함한다.
- 003 forward migration은 기존 run에 admission_key, queue_json, result_json 3개를 추가한다. 18개 업무 테이블과 001 baseline을 유지한다. 입력 snapshot은 immutable, 시도·결과 metadata는 별도다. snapshot 읽기는 source share lock으로 재수집과의 경계를 지킨다.
- Worker 기본 concurrency 4(1~16 설정), run timeout 120초다. receipt와 증가하는 attempt로 claim·모든 결과/실패 write를 확인한다. 외부 호출 중 transaction은 없다. 후보와 결과/완료는 한 transaction이며 후보는 CANDIDATE로 저장한다. 기존 service의 직접 start/succeed/fail은 Queue 관리 run에 사용할 수 없고 cancel은 허용한다.
- 승인 alias→추출→catalog→Evidence/정규화/scoring/conflict/decision을 연결한다. 명시적 import 식별자는 WEAK SOURCE_FIELD로 전달한다. P2 legacy norm은 DEC-021 비교 키로 Evidence에 연결한다. 내부 식별자 조회 최대 100개, 초과는 truncation이다. 브랜드 충돌은 승인 alias와 catalog fact를 사용하며 variant/color/volume은 추정하지 않는다.
- registry/provider ID digest를 resolverVersion에 넣어 배포 정의가 바뀐 실행을 거부한다. registry 미설정은 빈 패턴 목록이다. 내부의 모든 후보가 강한 근거로 auto eligible이면 external fallback은 생략하되 실제 승격은 하지 않는다.
- Provider 인스턴스와 throttle은 Worker 내에서 공유한다. 호출 완료 후 최소 간격을 두며 abort를 기존 timeout/429/circuit/budget 경계로 전달한다. transient Provider 오류는 Queue retry로 처리한다. 마지막 attempt의 정상 부분 결과는 실패 근거와 함께 저장하며 빈 실패 결과를 NOT_FOUND로 숨기지 않는다.
- 시작 및 10초 주기 reconciliation은 100개씩 keyset 조회한다. Queue가 FAILED인데 active run이면 FAILED로 정리하며 missing/completed-without-result도 별도 고정 오류로 남긴다. 재시작 시 아직 pending인 job은 pg-boss 만료/재시도로 복구한다. Queue 상태만으로 성공을 추정하거나 불명확한 유료 요청을 자동 재등록하지 않는다.
- BLK-005 live/shared durable account budget 및 전역 RPS 통합은 OPEN이다. 기본 Worker에는 live enable 환경변수가 없다. fixture throttle·비용 검증을 여러 Worker/재시작 간 Provider 계정 한도 보장으로 확대하지 않는다.
- 사용자의 명시적 보고 형식 `[추천모델과 추론수준]`과 필드 순서를 AGENTS.md에 저장한다. 과거 문서의 추천 항목 표기보다 최신 사용자 지시를 적용한다.

### 기각한 선택지와 이유

- raw/candidates를 Queue payload에 저장: reference-only 계약과 원본 보호를 깨뜨린다.
- 배치 전체 단일 transaction 또는 완료 형제 재실행: 대량 transaction/lock 수명과 실패 전파, 중복 비용을 늘린다.
- input_json에 retry metadata 혼합, 오래된 attempt 저장 허용: immutable 재현 입력 및 재시작 시 소유권을 잃는다.
- AUTO_ACCEPTED 추천을 곧바로 승인 상태로 저장: holdout/운영 활성화가 없으며 P3-11 수동 승인 경계를 우회한다.
- Worker 내부 throttle/메모리 budget을 global limit으로 선언: 다중 Worker·재시작에서는 보장되지 않는다.
- baseline 수정·실제 BROS DB에 바로 migration: additive fixture 검증으로 충분하며 운영 적용 증거와 분리한다.

### 변경 파일

- AGENTS.md, .env.example, package.json, pnpm-lock.yaml
- packages/core/src/config/index.ts, packages/core/test/config.test.mjs
- packages/db/src/schema.ts, packages/db/src/migration-runtime.ts, packages/db/src/migrations/003-resolver-orchestration.ts
- packages/queue/src/port.ts, packages/queue/src/pg-boss.ts
- packages/importer/src/master-matcher.ts(normalizeComparableText export)
- packages/resolver/package.json, packages/resolver/src/{index,run-service,evidence-collector,external-candidate-provider,batch-admission,pipeline,worker-handler,reconciliation}.ts, packages/resolver/test/orchestration.test.mjs
- apps/worker/package.json, apps/worker/src/{runtime,identifier-resolve,send-identifier-resolve}.ts
- tests/integration/{database-schema.integration.test,resolver-batch.integration.test,resolver-process-fixture}.mjs
- docs/{DB_MIGRATION_SPEC,RESOLVER_BATCH,RUNBOOK,DECISIONS,IMPLEMENTATION_STATUS,TEST_REPORT,BLOCKERS}.md

### 검증 증거

- PostgreSQL 18.6 pinned bookworm 일회용 컨테이너에서 migration metadata 18개 테이블/259개 컬럼·3건 이력·down/forward PASS.
- P3-12 전용 integration 10개(parent 포함) PASS. 실제 Worker 동시성 3/상한 4, 형제 성공 5/실패 1, 프로세스 강제 종료 후 같은 run UUID와 증가한 attempt로 복구, 후보 DB 실패 전체 rollback, 부분 Provider 실패 저장을 확인했다.
- Node unit 148/Admin 27 PASS. 전체 순차 integration 27 files/168개 PASS, 154,298.1648ms, fail/skip 0, 기존 1k import 42,871ms. 상세 초기 실패/수정과 명령은 TEST_REPORT에 기록했다.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, `git diff --check` PASS. Admin build의 기존 node:crypto 외부화 경고는 기록된 제한으로 유지한다.
- 실제 BROS DB, remote CI, live Provider, labeled holdout은 NOT_RUN이다. 전체 병렬 pnpm check를 실행했다고 기록하지 않는다.

### 미해결 사항 및 Blocker

- BLK-005 운영 Provider 계약/키/계정 durable budget/전역 RPS는 미해결. 승인된 실제 브랜드 registry도 별도 검증이 필요하다.
- 실제 DB는 이번에 기동하거나 migration을 적용하지 않았다. 002/003 배포 적용과 current revision remote CI/Phase 3 Gate는 후속이다.
- 승인·거절·직접입력·재분석의 공개 UI/API, 인증 actor, holdout/자동승격 활성화는 P3-13/14 범위다.

### 다음 작업 인수 조건

- 작업 범위: P3-13 품번 검수 UI/API. 공개 UUID 기반 목록/상세·evidence/conflict·accept/reject/manual/re-resolve와 수동 감사, auth actor/version CAS, 직접입력의 normalize/중복/hard-conflict 검사.
- 금지 변경: auto promotion enable, 기존 저장 norm/scoring/threshold 재해석, P2/P3 identity lock 제거, Queue raw payload, API raw/receipt 노출, timeout 완화, 감사 삭제.
- 완료 조건: permission/race/already-decided 회귀와 P3-11/12 경계 통합, 실제 UI/API 검증, 안전한 오류/공개 DTO, 단계 결정·검증 기록. 운영 Gate는 current revision CI와 별도 holdout 근거로 판정한다.
- 재검토가 필요한 조건: Provider 운영 계정/가격/한도 확정, 다중 Worker 전역 제한, registry/알고리즘 버전 변경 또는 실제 배치의 처리량·복구 병목이 확인될 때 새 결정으로 변경한다.

## DEC-20260915-023 — P3-13 품번 검수 UI/API 로컬 구현·검증

- 일자: 2026-09-15
- 종료 단계/분야: 후보/실행 공개 조회, 승인·거절·직접입력·재탐색, 수동 감사/권한 경계, UI 및 로컬 회귀
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-13; 연결 범위 P3-11/12, BLK-006, P2-09/14/15
- 검토 범위와 근거: AGENTS.md, 개발 운영 구성 지침 v0.1, WBS P3-13/14, 구현 보완 명세 v0.2, DEC-20260915-018~022, API/Resolver/Admin/Queue/계약 구현과 PostgreSQL fixture
- 상태: ACCEPTED — 구현 정책 및 로컬 검증 범위. Task 상태는 IMPLEMENTED_NOT_VALIDATED이며 운영/Phase Gate PASS가 아니다.
- supersedes: 없음. 기존 norm·hash/lock·scoring·threshold·자동승격 OFF 정책을 유지한다. DEC-022에서 기록한 browser/node:crypto 경고는 이번 서버 진입점 분리로 해소했다.

### 확정 결정

- `/api/v1/identifier` 후보/실행 목록·상세와 accept/reject/manual/re-resolve를 제공한다. public UUID와 명시적 DTO만 반환하고 raw/input/queue receipt/내부 ID를 노출하지 않는다. Evidence URL의 query/fragment를 제거하고 credential URL을 제외한다. 원 DB 근거는 보존한다.
- 기존 loopback 업무 API fence를 유지한다. 기본 503, trusted server authorizer의 null은 401이다. actor는 서버가 결정하고 클라이언트 actor를 받지 않는다. JSON/operation header, 동일 Origin/Host, cross-site 차단을 적용한다. 운영 Caddy 인증 구현 완료로 기록하지 않는다.
- accept는 기존 P3-11 원자 promotion을 재사용한다. reject는 후보 row lock/version/terminal 검사를 거쳐 사유·actor/time/version의 MANUAL_REVIEW를 append한다. 동일 결정 replay는 이력을 늘리지 않고 반대 결정 경합은 한 건만 성공한다.
- 직접입력은 원 실행을 보존하고 별도 manual-review/v1 run과 candidate를 만든다. 정규화·유효성·승인 brand alias/catalog/hard conflict 및 promotion의 P2/P3 중복 검사를 수행한다. MASTER expectedVersion을 잠금 후 확인한다. ACTIVE와 기존 P2 REVIEW_REQUIRED를 허용하고 INACTIVE는 막는다. 새 점수나 color/variant/volume을 추정하지 않는다.
- manual request UUID를 admission_key에 기록하고 새 실행/후보/SUBMITTED 감사/승격/MASTER/ACCEPTED 감사/receipt를 같은 transaction으로 확정한다. 요청 identity lock과 영속 receipt로 동시/불확실 응답 replay를 처리한다. 기존 snapshot이 달라졌더라도 이미 완료한 같은 요청은 원 결과를 반환한다.
- 재탐색은 P3-12 batch admission으로 새 실행/Queue를 원자 접수한다. queue_json의 reviewAudit에 서버 actor와 originRunPublicId를 저장하고 replay 시 검증한다. 202 응답은 해당 실행의 현재 상태이며 Worker 성공을 의미하지 않는다.
- 공통 `@bros/contracts`에서 Node SHA-256 잠금 함수를 분리해 `@bros/contracts/server`로 이동한다. P2/P3 writer import만 바꾸고 기존 key namespace/hash/dual representation/bigint 정렬을 유지한다. API/Worker는 Resolver의 configuredResolverPipeline을 공유한다.
- Admin은 후보/빈 실행 조회, 근거/충돌/감사, 4개 검수 동작, 중복 클릭 차단·요청 ID 유지·오류 표시를 제공한다. Vite `/api` 프록시는 Host를 보존해 Origin 검사를 통과한다.

### 기각한 선택지와 이유

- 직접입력을 기존 후보의 값/점수 덮어쓰기로 구현: 탐색 근거와 과거 판단을 잃는다.
- 수동 입력이므로 정규화/중복/conflict 검사를 생략하거나 다른 MASTER로 병합: BLK-006 및 승인 scope 원칙을 깨뜨린다.
- client actor 또는 새 RBAC/session 테이블을 도입: 기존 단일 관리자 운영 계약과 다르며 실제 인증되지 않은 actor를 신뢰할 수 없다. 서버 인증 포트와 기존 local fence로 연결 경계를 명시한다.
- same-origin 저장 실패를 해결하려고 Origin 차단을 해제: 프록시 Host 보존으로 해결할 수 있다.
- 브라우저에서 서버 crypto를 polyfill하거나 잠금 hash 변경: 서버 코드를 클라이언트 계약과 분리하면 되며 기존 writer 직렬화 규칙을 변경할 이유가 없다.
- 기존 REVIEW_REQUIRED MASTER를 직접입력에서 일괄 제외: P2 신규 MASTER의 기본 상태라서 품번 검수 목적과 충돌한다.

### 변경 파일

- packages/contracts/package.json, packages/contracts/src/{index,identifier-review,identifier-compatibility,server}.ts
- packages/resolver/src/{index,review-service,identifier-promotion-service,batch-admission,configuration}.ts, packages/importer/src/master-service.ts
- apps/api/package.json, apps/api/src/{app,identifier-review,identifier-review-management}.ts, pnpm-lock.yaml
- apps/worker/src/identifier-resolve.ts
- apps/admin/src/App.tsx, apps/admin/src/components/AppShell.tsx, apps/admin/src/styles.css, apps/admin/vite.config.ts
- apps/admin/src/api/identifier-reviews.ts, apps/admin/src/api/identifier-reviews.test.ts, apps/admin/src/pages/IdentifierReviewsPage.tsx, apps/admin/src/pages/IdentifierReviewsPage.test.tsx
- tests/integration/{identifier-review-api,identifier-compatibility,admin-vite}.integration.test.mjs
- docs/{IDENTIFIER_REVIEW,IMPLEMENTATION_STATUS,TEST_REPORT,RUNBOOK,DECISIONS}.md
- 신규 DB migration 없음. 원본 BROS DB/volume 변경 없음.

### 검증 증거

- PostgreSQL 18.6 일회용 fixture에서 API 전용 8개, 전체 순차 integration 28 files/176개 PASS(fail/skip 0, 179,006.5791ms). 전체 실행 후 browser 수정의 영향 범위 compatibility/promotion/API 33개와 Vite Origin proxy 1개를 다시 실행해 PASS했다.
- 최종 전체 Node unit 148/Admin 35 PASS. lint/typecheck/format/build/git diff --check PASS. 최종 Admin build에서 node:crypto 외부화 경고 없음.
- 실제 브라우저 + Vite/API/DB에서 후보 승인·거절/감사/terminal 버튼, 빈 실행의 직접입력 정규화·승인, 새 실행 재탐색 접수, 화면 여백·목록/상세 표시 PASS. Worker 완료는 P3-12 통합 회귀로 확인하며 이번 브라우저 접수만으로 추정하지 않는다.
- 최초 실패 원인과 수정, 전체/영향 범위 실행 순서, 테스트 DB 정리는 TEST_REPORT에 구분 기록했다. 운영 인증/실제 DB migration/current revision CI/live Provider/holdout은 NOT_RUN이다.

### 미해결 사항 및 Blocker

- BLK-005 live Provider 계약·계정 durable budget·전역 RPS OPEN. 기본 Provider disabled/자동승격 OFF 유지.
- 실제 DB 002/003 적용, current revision remote CI와 Phase 3 Gate, 운영 Caddy/auth actor 연결은 후속 검증이다. BLK-006 정책은 RESOLVED_LOCAL을 유지한다.
- labeled actual dataset/독립 holdout/운영 책임자와 활성화 범위 결정은 P3-14다. fixture 정답이나 OFF 설정으로 calibration PASS를 주장하지 않는다.

### 다음 작업 인수 조건

- 작업 범위: P3-14 Resolver Golden Dataset / Auto-Accept Calibration. 보완 명세 5장의 학습/조정·평가 분리, 최소 표본·false-pass 기준, 실제 label/근거, scorer/decision 버전별 보고서·회귀를 준비한다.
- 금지 변경: 근거 없는 정답 생성, holdout 누출, score/threshold/normalizer/lock/감사 임의 변경, 평가 미달/미평가 상태의 자동승격 활성화, local 테스트를 운영 CI/인증 PASS로 확대.
- 완료 조건: 대표 브랜드/카테고리 정답·근거, 분리된 평가셋과 실제 측정 결과·오매칭 분석, 버전/config 재현성, 미달 시 OFF 유지, 활성화 범위/버전/운영 책임자 결정. 외부 label이 없으면 개발 가능한 평가 harness와 미평가 상태를 명확히 구분한다.
- 재검토가 필요한 조건: 운영 인증 구조 확정, trusted proxy 설정, 실제 감사/PII 보존 요구, 브랜드별 정규화/의미상 중복 정책 변경, Provider/알고리즘 버전 변경.

## DEC-20260915-024 — P3-14 평가 harness·합성 회귀 완료와 실제 calibration 입력 대기

- 일자: 2026-09-15
- 종료 단계/분야: Golden Dataset 계약·Evidence replay 평가·고정 holdout/코드 lock·보고서·OFF flag·로컬 회귀
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-14, Phase 3 Gate; 연계 P3-07~13, P1-03
- 검토 범위와 근거: AGENTS.md, doc/README.md, 구현 보완 명세 v0.2 §5.1/5.2, WBS P3-14/Phase 3 Gate, DEC-20260915-018~023, 최신 상태/Blocker/테스트와 현재 Resolver 코드. examples에는 기존 수집 XLSX만 확인했으며 검수 label로 간주하지 않았다.
- 상태: ACCEPTED — 평가 도구 정책 및 로컬 검증. Task 전체는 BLOCKED_EXTERNAL_INPUT(BLK-007), 실제 calibration NOT_RUN이며 Gate PASS가 아니다.
- supersedes: 없음. 기존 normalizer/scorer/decision/identity lock/자동승격 OFF 정책을 유지한다.

### 확정 결정

- strict dataset 계약에 버전/출처/범위, case/MASTER/SKU/image, TUNING/HOLDOUT, challenge tags, 운영자 정답/금지 label/근거·검수자·시각, Collector capture/버전·비용·canonical facts를 저장한다. 원본 수집값과 운영자 정답을 구분한다. 잘못된 GTIN label, 비밀 텍스트, 입력 점수/decision 필드, 추가 필드와 중복 case ID를 거절한다.
- MASTER 또는 SKU/image hash가 tuning과 holdout에 겹치면 평가를 거절한다. label은 결과 비교에만 쓰고 생산 정책 입력은 capture만 사용한다. identity 비교는 기존 정규화와 GTIN/EAN/UPC family를 사용하며 저장 norm/승격 lock을 변경하지 않는다.
- 평가 범위는 COLLECTED_EVIDENCE_REPLAY다. Collector 이후 기존 Normalizer/Scorer/HardConflict/Decision을 실행한다. upstream extraction/검색/DB/Queue/Worker 실행의 대체로 주장하지 않는다. 실제 capture와 독립 truth를 연결해 현행 정책을 측정할 수 있다.
- 정답상 `autoAcceptForbidden`은 Detector 출력과 독립적으로 비교한다. 충돌/품번 없음/AI 단독 challenge에는 이 label이 필수다. 틀린 자동승인과 unsafe auto가 있으면 REAL 평가는 FAIL이다. false-review 분모는 정답상 자동승인이 허용되고 정답 후보를 찾은 case이며 의도된 검수 금지는 제외한다.
- 실제 정답 200개 distinct MASTER, holdout auto candidate 100건/오매칭 0/unsafe 0 규칙을 적용한다. 반복 사례로 수를 늘리지 못하도록 holdout auto MASTER도 100개를 요구하고 주요 브랜드/카테고리 20개를 holdout에서 확인하는 보수적 운영 전 제한을 둔다. 품번 없음·유사 모델·GTIN/색상/용량 충돌·AI 단독 challenge를 포함한다. 완화 시 별도 근거/결정이 필요하다.
- seal은 scope/holdout capture/label 및 contracts/resolver 빌드 JS hash를 고정하고 기존 lock을 덮어쓰지 않는다. 코드나 고정 입력이 바뀌면 실행을 거절한다. hash만으로 사전 검수/label 진실성/holdout 반복 열람을 증명하지 않으며 운영자가 사용 이력을 관리한다.
- 보고서는 dataset/holdout/algorithm digest, 원본 capture·정답 근거, 버전, 범위/분모/오류, precision/coverage/false-review, score bins, 실제 replay 시간·기록 비용을 제공한다. 비용 모름은 null이다. CLI exit 0/2/1로 성공·미통과 보고·입력 실패를 구분한다.
- `RESOLVER_AUTO_ACCEPT_ENABLED=false`를 명시적 기본 config로 추가한다. true는 현재 승인된 calibration/owner 결정/activation 구현이 없으므로 fail-closed한다. 기존 promoteAuto 차단도 유지한다. 평가 PASS가 자동 활성화를 만들지 않는다.
- 실제 label을 확인하지 못했으므로 합성 11건만 버전 고정 회귀로 평가했다. SYNTHETIC_ONLY를 제품 정확도/calibration PASS로 보고하지 않는다. BLK-007에 필요한 입력과 해소 조건을 기록한다.

### 기각한 선택지와 이유

- XLSX 품번 추출값/수동 후보를 그대로 정답으로 사용: 예측과 정답이 같은 근거라 정확도 평가가 순환한다.
- 합성 200건 복제로 실제 sample minimum 충족 주장: REAL provenance/대표성/독립 상품 기준의 증거가 아니다. 수치 경계 생성 데이터는 unit 내부에서만 사용한다.
- 기존 점수를 입력받아 precision만 계산: 정규화/scorer/충돌/decision 변경 회귀를 놓친다.
- Detector의 hasHardConflict만으로 unsafe 자동승인을 판정: 같은 누락 오류를 평가도 놓칠 수 있으므로 독립 금지 label을 추가한다.
- 현재 표본 없이 threshold를 조정하거나 true flag를 받아 활성 상태처럼 표시: 문서의 미평가 OFF 원칙을 위반한다.
- 여러 SKU/capture를 독립 상품으로 집계하거나 tuning 성적을 holdout과 합산: 최소 표본을 부풀리고 평가 누출을 가린다.

### 변경 파일

- packages/contracts/src/resolver-evaluation.ts, packages/contracts/src/index.ts
- packages/resolver/src/evaluation.ts, packages/resolver/src/index.ts
- packages/resolver/test/evaluation.test.mjs, packages/resolver/test/fixtures/golden-v1.json
- packages/core/src/config/index.ts, packages/core/test/config.test.mjs, .env.example
- scripts/evaluate-resolver.mjs, package.json
- docs/RESOLVER_EVALUATION.md, docs/evaluations/p314-golden-v1.lock.json, docs/evaluations/p314-golden-v1/report.json, docs/evaluations/p314-golden-v1/report.md
- docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/BLOCKERS.md, docs/RUNBOOK.md
- DB migration·API/UI 변경 없음. 원본 XLSX/DB·외부 서비스 변경 없음.

### 검증 증거

- Node unit 157/Admin 35 PASS, 평가/config 전용 19개 PASS, 최종 독립 금지 label 보강 후 평가 8개 PASS. lint/typecheck/format/build/git diff --check PASS.
- PostgreSQL 18.6 bookworm 전용 fixture 전체 순차 integration 28 files/176개 PASS, fail/skip 0, 155,523.6253ms. 기존 P2/P3 concurrency/identity/승인/Worker/API 회귀를 유지한다.
- CLI seal exit 0 / evaluate exit 2, 실제 합성 보고서 생성. 11건 중 holdout 10건/auto 1건, 오매칭/unsafe 0건. calibrationStatus SYNTHETIC_ONLY, automaticPromotionEnabled=false. 세부 수치/hash/초기 실패 및 수정은 TEST_REPORT에 기록했다.
- 실제 label dataset 및 end-to-end calibration, remote CI, live Provider, 운영 활성화는 NOT_RUN이다. 합성 회귀와 정책 가드 검증을 구분한다.

### 미해결 사항 및 Blocker

- BLK-007 OPEN: 운영자가 확인한 실제 정답/근거·주요 범위·독립 holdout 부재. 입력 경로/범위를 요청했으며 현재 확인되지 않았다.
- BLK-005 live 계약/키/공유 예산/RPS OPEN, BLK-006 RESOLVED_LOCAL 유지. 실제 DB 002/003 적용, current revision CI/운영 인증 및 Phase 3 Gate는 별도 후속이다.
- 현재 판정은 개발 가능한 harness/합성 회귀 완료이며 P3-14 전체 완료가 아니다. 실제 label 신뢰성·누락 자산/대표성은 운영자 검수가 필요하다.

### 다음 작업 인수 조건

- 작업 범위: P3-14 실제 label/capture 인수 및 calibration. 최초에는 정답·범위·MASTER/자산 분리·출처를 검토하고 고정 holdout lock 이후 실제 replay와 end-to-end 측정을 수행한다.
- 금지 변경: 합성/원본 추출값을 실제 정답으로 선언, 미검수 label 생성, holdout 누출/재사용 은폐, 기준 미달/미평가의 자동승격 활성화, 기존 norm/threshold/lock/감사 임의 변경, OFF를 Gate PASS로 해석.
- 완료 조건: 실제 200상품/대표 범위·독립 holdout 기준과 0 오매칭/unsafe 충족, 정답 근거/분모/비용/시간/버전 보고, 운영 범위/책임자 결정. 이후 current revision CI와 전체 Phase 3 Gate 검수로 이어간다.
- 재검토가 필요한 조건: label/capture 범위·알고리즘/registry/provider 변경, 데이터 분할 규칙/최소 표본 완화, 운영 자동승인 요구, 신규 conflict/issuer identity 정책.

## DEC-20260915-025 — P3-14 실제 데이터 재확인과 정답 검수 intake 준비

- 일자: 2026-09-15
- 종료 단계/분야: 실제 입력 inventory·검수 표본 준비·산출물 검증. 실제 정답 검수/calibration 단계는 미완료.
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-14, Phase 3 Gate
- 검토 범위와 근거: AGENTS.md, doc/README.md, DEC-20260915-024, RESOLVER_EVALUATION/IMPLEMENTATION_STATUS/BLOCKERS/TEST_REPORT, 현재 평가 계약 및 원본 수집 XLSX. project-resync와 spreadsheets, project-decision-log 스킬을 적용했다.
- 상태: ACCEPTED — 검수 준비 산출물과 현재 증거 범위. P3-14는 BLOCKED_EXTERNAL_INPUT, REAL calibration NOT_RUN.
- supersedes: 없음. DEC-024의 정답·분리·최소 표본·OFF 정책 유지.

### 확정 결정

- 원본 26,375행에서 내부 상품코드 비공란 0건을 확인했다. 별도 운영자 검수 dataset은 확인되지 않아 경로를 요청했다. 원본 수집값을 실제 정답으로 선언하지 않는다.
- 플랫폼별 행 수 상위 5개 브랜드에서 각 20개 고유 원본 상품 ID를 결정적으로 뽑아 200행의 검수 intake를 준비한다. 이는 임시 시작 표본이며 주요 운영 범위/독립 MASTER 200개/holdout 충족을 확정하지 않는다. 상세 선택 기준과 보완 절차는 docs/evaluations/p314-real-review-intake.md에 기록했다.
- 로컬 Git 제외 data/outputs/p314-real-review-20260915/에 XLSX·원본 참조 JSON·inventory·validation을 보관한다. 정답·근거·검수자·시각·MASTER/자산 관계·금지 label을 비워 두고 모든 행 PENDING, split UNASSIGNED로 둔다.
- 입력 칸 충족 표시 FIELDS_FILLED는 검수 PASS가 아니다. 독립 정답과 생산 Collector capture를 확보하고 관계/대표성을 검수한 다음 REAL 계약 변환·분할·lock·평가를 진행한다. 원본 상품/이미지 URL 접근과 실제 이미지 hash는 미검증이다.
- BLK-007 OPEN, auto OFF 유지. score/threshold/normalizer/동시성·DB 정책을 변경하지 않는다.

### 기각한 선택지와 이유

- 200개 원본 상품 ID를 200개 확정 MASTER나 검증된 정답으로 계산: 옵션·플랫폼 간 상품 관계와 독립 정답 근거가 없다.
- 원본 추출값 또는 수집 상태 확인 완료를 정답으로 사용: 예측과 정답의 순환 및 수집 품질/식별자 정답 혼동이다.
- 현재 표본을 바로 tuning/holdout으로 나누고 threshold 조정: MASTER/SKU/image 관계·capture와 대표성이 없어 누출/과적합을 평가할 수 없다.

### 변경 파일

- docs/evaluations/p314-real-review-intake.md, docs/RESOLVER_EVALUATION.md, docs/BLOCKERS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/DECISIONS.md
- 로컬 산출물: data/outputs/p314-real-review-20260915/{P3-14_실제상품_정답검수_대기.xlsx,intake-source.json,inventory.json,validation.json}. 임시 생성/검증 코드 및 렌더: tmp/p314-intake/.
- 애플리케이션 코드/DB/원본 XLSX/외부 서비스 변경 없음.

### 검증 증거

- bundled Python으로 tmp/p314-intake/prepare.py, verify.py 실행: 200개 고유 원본 키, 원본 행/상품명/ID/카테고리/URL 대조, 정답란 공란·PENDING 200·충족 0, 텍스트 ID/카테고리 보존, 원본 수식 없음, source hash 불변 PASS.
- bundled Node로 tmp/p314-intake/build.mjs 실행: 재계산·오류 검색 0건, 상태만 입력/필수 칸 충족/원복 시 집계 0→1→0과 상태 변경 PASS. 최종 임시 정답 제거 확인. 두 탭/오른쪽 입력란 렌더 확인. 긴 숫자 문자열의 렌더 지수 표시는 XLSX 원문 문자열 검사로 구분했다.
- 원본 SHA-256: 1c3d35af15093510e613cf9504fafd28e264b1d15aabb95b215dc564ac8e2fde. 산출물 digest와 상세 결과는 준비 기록/validation.json 참조.
- Git 제외 경로 확인. 변경 Markdown format 및 git diff --check 결과는 TEST_REPORT에 기록한다. 이번 단계 전체 unit/integration, Excel 앱 직접 검증, 실제 calibration/Provider/CI/운영 활성화 NOT_RUN.

### 미해결 사항 및 Blocker

- BLK-007 OPEN: 정답·독립 금지 label/근거/검수자·범위·MASTER/자산 관계·생산 capture 미확보. 준비 파일을 운영자 검수로 오인하지 않는다.
- BLK-005 OPEN, BLK-006 RESOLVED_LOCAL 유지. 실제 DB migration/운영 인증/current revision CI/Phase 3 Gate는 별도 후속.

### 다음 작업 인수 조건

- 작업 범위: 기존 운영자 검수 파일 또는 이번 작성된 intake 인수. 근거·정답·금지 label/관계·범위·생산 capture를 검증하고 REAL dataset으로 변환한 뒤 고정 holdout calibration 수행.
- 금지 변경: 미검수 정답 생성, 수집값/합성값을 실제 label로 선언, 품번 미확인을 품번 없음으로 치환, 관계 확인 전 split 확정, threshold/정규화/동시성 임의 변경, 미평가 자동승격 활성화.
- 완료 조건: DEC-024의 실제 독립 상품/주요 범위/holdout auto/challenge/오매칭·unsafe 기준 충족과 버전·비용·시간·운영 책임자 기록. 입력 부족 시 해당 사실과 OFF 유지.
- 재검토가 필요한 조건: 실제 정답 파일 또는 범위 제공, 상품 관계·추가 브랜드/challenge 확인, capture/알고리즘 버전 변경.

## DEC-20260915-026 — P3-14 정답·capture 인수 가능 여부 재검증

- 일자: 2026-09-15
- 종료 단계/분야: 사용자 재개 요청에 따른 실제 입력 인수 전 읽기 전용 검증. 정답 검수/calibration은 미완료.
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-14
- 검토 범위와 근거: AGENTS.md, doc/README.md, DEC-025, 최신 상태/Blocker/테스트 보고서, data/ 전체 파일 목록, 정답 검수 XLSX 실제 셀, packages/resolver/src/{configuration,pipeline,evidence-collector}.ts. branch codex/p1-foundation, HEAD 968dfa7.
- 상태: ACCEPTED — 현재 입력 부재 확인. 실제 calibration NOT_RUN / BLOCKED_EXTERNAL_INPUT.
- supersedes: 없음.

### 확정 결정

- 현재 로컬 검수 XLSX는 이전 산출물과 SHA-256이 동일하다. 200행 모두 PENDING, 정답 식별자·근거·검수자 입력 각각 0건이다. 미확인을 NO_IDENTIFIER로 바꾸지 않는다.
- 저장소 관련 파일 및 data/에서 실제 Collector capture를 확인하지 못했다. 별도 실제 정답 파일/capture 경로를 사용자에게 요청했다. 사용자 요청 자체를 입력 데이터가 추가됐다는 증거로 간주하지 않는다.
- 기본 pipeline의 registry는 unconfigured/v1 및 빈 patterns다. 기존 실제 실행 capture 없이 빈 기본 설정으로 만든 결과를 운영 capture로 대체하지 않는다. 실제 capture 인수 시 실행 당시 resolver/registry/provider 버전과 원본 근거를 확인한다.
- BLK-007 OPEN과 auto OFF를 유지하며 label/capture 확보 전 seal/evaluate 또는 threshold tuning을 실행하지 않는다. 기존 준비 파일을 덮어쓰거나 같은 표본을 새로 만들지 않는다.

### 기각한 선택지와 이유

- 미작성 워크북으로 REAL 평가 실행: 검수자·정답·근거·capture가 없어 실제 정확도 분모를 만들 수 없다.
- 재개 요청에 맞춰 가상의 label/capture를 생성: DEC-024/025의 독립 정답·생산 근거 원칙을 위반한다.

### 변경 파일

- docs/DECISIONS.md, docs/TEST_REPORT.md. 데이터/애플리케이션 코드/DB/외부 서비스 변경 없음.

### 검증 증거

- bundled Python openpyxl 읽기 전용 셀 검사: PENDING 200, 식별자/근거/검수자 입력 0/0/0. XLSX SHA-256 ed9f55aaf8d9a15f6347fb8177068d5b5e4a125d2abe02ec9ffa33313c95bbdc, DEC-025와 동일.
- data/ 파일 목록 및 저장소 capture/label/golden 파일 검색: 기존 intake와 합성 fixture/lock만 확인. 다른 경로의 존재 여부는 사용자의 입력이 필요하다.
- 문서 format/diff 검증은 TEST_REPORT 참조. 실제 정답 검수, capture replay, calibration, unit/integration 재실행 NOT_RUN.

### 미해결 사항 및 Blocker

- BLK-007 OPEN: 검수된 실제 정답 및 Collector capture의 위치/내용이 필요하다. BLK-005 OPEN, BLK-006 RESOLVED_LOCAL 유지.

### 다음 작업 인수 조건

- 작업 범위: 사용자가 제공한 실제 정답 파일/capture 경로를 읽고 연결·출처·버전·관계·대표성을 검증한 뒤 DEC-024 기준으로 분할/lock/evaluate.
- 금지 변경: 미검수 label 생성, 빈 설정 capture의 운영 결과 위장, threshold/정규화/동시성 정책 임의 변경, 미평가 자동승격 활성화.
- 완료 조건: 실제 검수 입력과 독립 holdout 기준에 따른 calibration 결과·오매칭 분석·버전/비용/시간 기록. 현재 요청은 입력 확보 전까지 미완료다.
- 재검토가 필요한 조건: 실제 정답 또는 capture 경로 제공, 기존 워크북 작성, 운영 패턴/Provider 설정 확정.

## DEC-20260915-027 — 사용자 요청 P3-14 보류와 Phase 3 Gate 사전검수

- 일자: 2026-09-15
- 종료 단계/분야: P3 작업 우선순위 조정, Gate 요구사항·증거 대조와 Resolver 관련 회귀.
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-01~14, Phase 3 Gate
- 검토 범위와 근거: 사용자 “다른 P3 작업 진행 후 실제 정답·capture 확보 시 P3-14 재개”, AGENTS.md, WBS P3-14/Phase 3 Gate, 구현 현황/Blocker/TEST_REPORT, DEC-024~026, pipeline/worker-handler/decision-engine/configuration와 evaluator 계약, CI workflow.
- 상태: ACCEPTED — 사용자 보류/우선순위 결정 및 사전검수 결과. Gate 전체 BLOCKED, 실제 calibration NOT_RUN.
- supersedes: DEC-20260915-026의 즉시 정답·capture 인수를 다음 작업으로 삼은 우선순위만 대체한다. 기존 입력 부재·자동승격 OFF·평가 기준은 유지한다.

### 확정 결정

- P3-14 실제 검수/calibration을 보류하고 다른 P3 보완을 먼저 진행한다. 실제 정답·capture 확보 또는 사용자 재개 요청 시 인수 검증부터 이어간다. 보류 중 같은 파일 경로 요청이나 미작성 표본 생성을 반복하지 않는다. 시간 기반 알림/자동화 요청으로 해석하지 않는다.
- P3-01~13 구현·로컬 회귀 증거는 있으나 current revision CI 및 운영 연결은 미완료다. WBS Gate 6개 조건에 현재 증거와 제한을 매핑한 docs/PHASE3_GATE.md를 생성한다. P3-14 보류를 Gate 면제나 PASS로 바꾸지 않는다.
- pipeline/worker-handler의 최종 결과 보존은 확인했지만, 정규화 전 Collector collection/conflict facts/수집 버전·비용을 evaluator에 넘길 전용 보관·export 경로는 없다. 다음 독립 구현은 P3-12 실행 capture 저장·내보내기 보완이다. 구체 저장 계약/DB 구조는 다음 구현에서 결정한다.
- BLK-005의 공유 durable budget/전역 RPS는 fixture로 개발 가능하고 실제 Provider 활성화는 운영 입력 확보 후 진행한다. 그다음 revision/CI·대상 DB 검증과 P3-14 재개 증거를 모아 Gate를 판정한다.
- 재개 시 사용자는 소수 상품의 품번·공식 근거·확인자부터 함께 검수한다. 에이전트가 실제 데이터로 MASTER/SKU 관계·이미지 hash·capture·분할을 확인하고 필요한 의미 판단만 사용자에게 묻는다. 식별자 확인만으로 autoAcceptForbidden=false를 확정하지 않는다.

### 기각한 선택지와 이유

- P3-01~13 구현을 다시 시작하거나 미확보 정답 경로를 반복 요청: 기존 증거가 있고 사용자가 보류를 요청했다.
- 모든 P3 완료 또는 Gate PASS 선언: 실제 calibration 및 current revision CI/운영 검증이 남아 있다.
- 저장된 최종 후보를 원본 Collector capture로 역변환: 정규화 전 상태·conflict facts·비용을 복원했다는 증거가 없다.
- 별도 요청 없이 Phase 4 구현 착수: 현재 요청은 다른 P3 작업이며 우선 그 범위의 보완을 진행한다.

### 변경 파일

- docs/PHASE3_GATE.md, docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/BLOCKERS.md, docs/RESOLVER_EVALUATION.md.
- 애플리케이션 코드/DB/Provider 설정/검수 워크북/원본 데이터 변경 없음.

### 검증 증거

- pnpm build:packages PASS. Resolver 11개 unit 파일과 config/identifier-evidence/identifier-resolve 3개 파일, 총 14 files/90 tests PASS(exit 0).
- WBS Gate 조건별 코드·이전 실행 증거 대조 완료. 전용 capture export 미구현 확인은 문서 검토 결과이며 새 기능 PASS가 아니다.
- 변경 Markdown Prettier 및 git diff --check PASS. 전체 integration/Admin browser/remote CI/운영 DB migration/live Provider/실제 calibration은 이번 단계 NOT_RUN.

### 미해결 사항 및 Blocker

- BLK-007 OPEN, 사용자 보류. 자동승격 OFF. BLK-005 OPEN, BLK-006 RESOLVED_LOCAL 유지.
- P3-12 capture 보관/export, 운영 shared budget/RPS, 배포 revision/CI와 대상 DB 검증이 남아 있다.

### 다음 작업 인수 조건

- 작업 범위: P3-12 실행 capture 저장·내보내기 보완. Collector 출력·canonical facts·버전/출처·실측 비용 보존, attempt/트랜잭션·실패·재현성·비밀정보 경계 회귀. 상세 계약은 구현 전 현재 schema와 함께 검토한다.
- 금지 변경: 미검수 label 생성, 최종 후보로 원본 capture 위장, 기존 정규화/승격/동시성/threshold 임의 변경, Provider·자동승격 활성화, 보류를 평가 PASS로 해석.
- 완료 조건: 합성 fixture로 capture 생성·영속성·export·재시도/실패 격리와 평가 계약 연결 가능성 검증. 실제 capture/label과 합성 검증을 구분하고 P3-14는 입력 확보 시 재개한다.
- 재검토가 필요한 조건: 사용자 P3-14 재개 요청, 실제 데이터/capture 확보, 운영 Provider 계약/한도 확정, capture 저장 계약/DB 구조 변경 필요.

## DEC-20260915-028 — P3-12 실행 capture 원자 저장과 로컬 export

- 일자: 2026-09-15
- 종료 단계/분야: capture 계약·pipeline/Worker 저장·운영자 export CLI·합성 회귀
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-12, 연계 P3-06~10/P3-13/P3-14
- 검토 범위와 근거: AGENTS.md, DEC-024~027, 현재 pipeline/worker-handler/003 JSONB/평가 계약/검수 DTO, RESOLVER_BATCH/PHASE3_GATE/TEST_REPORT. 사용자가 P3-12 실행 capture 저장·내보내기 보완을 지시했다.
- 상태: ACCEPTED — 구현·로컬 검증 완료. current revision CI/실제 calibration 미검증으로 P3-12 IMPLEMENTED_NOT_VALIDATED 유지.
- supersedes: 없음. DEC-027의 후속 구현을 완료하며 P3-14 보류·자동승격 OFF·정규화/동시성 정책 유지.

### 확정 결정

- pipeline v2에서 정규화 전 Collector 출력/effective truncation과 canonical conflict facts를 final decision과 함께 capture한다. 기존 정답·점수의 역변환은 사용하지 않는다. 입력 복사본·입력/판정 digest·시각·resolver/registry/provider 버전을 보존한다.
- captureSourceKind는 기본 UNCLASSIFIED, 합성 fixture는 SYNTHETIC을 명시한다. REAL 선언도 독립 정답/대표성 증명을 대체하지 않는다. 현재 production Evidence는 NON_AI이며 AI 경로 추가 시 출처 계약 재검토가 필요하다.
- 기존 migration 003의 result_json.executionCapture를 사용한다. run/source/attempt/reference/payload digest envelope와 후보/최종 결과/성공 상태를 동일 attempt fence·트랜잭션에서 기록한다. 새 DB migration은 없다.
- 저장 전 strict/secret/크기 guard와 입력·버전·판정 binding을 확인하고 collection/context를 현재 알고리즘으로 replay해 decision digest를 대조한다. production 필수 capture 누락/불일치는 INVALID_RESOLVER_CAPTURE terminal 실패다. legacy custom pipeline은 optional 계약을 유지한다.
- Provider port/source 결과에 기록 비용 costUsd 선택 필드를 추가한다. 미상은 null, Provider 생략 local 결과는 해당 attempt의 외부 비용 0이다. request price/예약 budget을 실측 청구로 추정하지 않는다. 현재 Brave 실측 비용은 null이다.
- 비용 범위는 COMPLETED_ATTEMPT_ONLY다. 완료 전 실패/중단 attempt의 capture를 보존하거나 전체 run 재시도 비용을 합산하지 않는다. 이는 BLK-005 durable account budget/과금 장부와 별도다.
- export는 SUCCEEDED만 읽고 저장된 input/decision/payload digest와 run/source/attempt/version/reference를 검증한다. 오늘의 알고리즘으로 과거 capture를 바꾸지 않는다. 동일 record는 동일 JSON/digest다. hash는 서명이 아니다.
- 권한 있는 운영자가 resolver:capture:export CLI로 새 로컬 파일에 기록한다. wx로 기존 파일을 거절하고 stdout은 digest, 오류는 고정 code만 출력한다. 전체 source input raw는 내보내지 않으며 Evidence의 상품별 정보는 Git 제외 경로에 보관한다. public 검수 DTO는 capture를 노출하지 않는다.
- v1 queued run은 v2 Worker에서 기존 version fence로 거절된다. Worker/접수 CLI 버전을 일치시키고 재분석은 새 요청 ID를 쓴다. contracts/resolver 변경에 따른 P3-14 algorithm lock 불일치는 새 평가 version/lock으로 처리하며 기존 보고서는 보존한다.

### 기각한 선택지와 이유

- 최종 후보만으로 원본 capture 생성: 정규화 전 값·canonical facts·수집 맥락을 잃는다.
- 별도 capture 테이블/migration 추가: 현재 단일 완료 attempt envelope는 기존 JSONB와 같은 트랜잭션에서 보존할 수 있다. 모든 attempt 이력/계정 비용 확장 시 별도 검토한다.
- 캡처 저장 실패를 무시하고 성공: 평가 재현성과 후보/원본 대응이 깨진다.
- 기본 REAL/추정 비용/자동 label 생성: 출처와 실제 비용/정답 근거가 없다.
- 검수 API에 전체 capture 또는 source raw 추가: 기존 공개 projection 범위를 넘는다.

### 변경 파일

- packages/contracts/src/{resolver-capture,resolver-evaluation,index}.ts
- packages/resolver/src/{capture,pipeline,worker-handler,external-candidate-provider,index}.ts
- packages/resolver/test/capture.test.mjs, tests/integration/resolver-batch.integration.test.mjs
- scripts/export-resolver-capture.mjs, package.json
- docs/{RESOLVER_CAPTURE,RESOLVER_BATCH,RESOLVER_EVALUATION,PHASE3_GATE,RUNBOOK,DB_MIGRATION_SPEC,IMPLEMENTATION_STATUS,BLOCKERS,TEST_REPORT,DECISIONS}.md
- 원본/검수 데이터·실제 DB·Provider 설정 변경 없음.

### 검증 증거

- capture unit 4, Resolver batch 전용 integration 13 PASS. 입력/판정·raw replay/digest·비밀 텍스트/비용·원본/정규화 구분·attempt fence·INSERT/UPDATE rollback·CLI 새 파일/동일 결과/평가 계약·public projection 비노출 검증.
- 최종 전체 Node unit 161/Admin 35, 전체 순차 integration 28 files/179 PASS(fail/skip 0, 145,558.4414ms). build/typecheck/lint/format 및 diff 확인 PASS. 최초 lint globals 실패와 수정, 세부 실행 순서는 TEST_REPORT에 기록했다.
- 전용 PostgreSQL 테스트 DB 잔존 0개 확인 후 컨테이너/익명 volume 정리. 원본 DB는 기동·수정하지 않았다.
- 실제 label/capture calibration, live Provider, current revision CI/운영 배포/실제 DB migration, 신규 브라우저 QA NOT_RUN.

### 미해결 사항 및 Blocker

- BLK-005 shared durable budget/전역 RPS와 운영 계약/키/실측 비용 OPEN. BLK-007 OPEN 및 P3-14 사용자 보류 유지. BLK-006 RESOLVED_LOCAL.
- 완료되지 않은 attempt 비용/전체 run 과금 합계는 이 capture가 제공하지 않는다. CLI 파일 쓰기 중 장치/프로세스 장애의 부분 파일은 JSON/digest 검증 전 사용하지 않는다.

### 다음 작업 인수 조건

- 작업 범위: BLK-005의 공유 durable budget/전역 RPS를 fixture 기반으로 구현·검증한다. 계정/UTC 일자 원자 예약·재시작·다중 Worker·불명확 호출 비용 보존을 검토한다.
- 금지 변경: P3-14 반복 입력 요청/미검수 label 생성, live/자동승격 임의 활성화, 기존 norm/identity lock/threshold 임의 변경, 완료 attempt 비용을 전체 비용으로 확대.
- 완료 조건: 운영 설정을 활성화하지 않은 상태에서 shared budget/한도 원자성·동시 실행·재시작·실패 회귀 증거. 실제 정답/capture 확보 또는 재개 요청 시 P3-14를 이어간다.
- 재검토가 필요한 조건: 전체 attempt 이력·비용 장부 요구, AI Evidence 지원, 운영 Provider 계약/가격/한도 확정, capture schema/저장 구조·알고리즘 버전 변경.

## DEC-20260915-029 — BLK-005 공유 예산과 계정 전체 호출 제한

- 일자: 2026-09-15
- 종료 단계/분야: 공유 quota 계약·PostgreSQL 구현·Brave 연결·로컬 동시성/재시작 회귀·운영 복구 문서
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-05, P3-12, BLK-005, Phase 3 운영 준비
- 검토 범위와 근거: AGENTS.md, 개발 운영 구성 지침, 구현 보완 명세 v0.2 §5, DEC-20260915-006/007/022/027/028, EXTERNAL_PROVIDER_BRAVE/RESOLVER_BATCH/BLOCKERS/DB_MIGRATION_SPEC, 기존 Provider timeout·예산 포트·Worker 공유 호출 경계. 사용자 요청: BLK-005 공유 예산·전역 호출 속도 제한 보완.
- 상태: ACCEPTED — 요청 범위 구현·로컬 검증 완료. BLK-005 전체 운영 해소/Phase 3 Gate PASS는 아님.
- supersedes: DEC-20260915-007의 live `SHARED_DURABLE budget` 주입 계약에 한정. 예산만 원자 예약하면 여러 Worker의 호출 간격을 보장하지 못하므로 `ProviderRequestQuota`의 예산+호출 admission 계약으로 대체한다. 기존 disabled·계약/저장 권한·secret·장애/후보 정책과 DEC-027/028의 P3-14 보류·capture 비용 범위는 유지한다.

### 확정 결정

- 신규 migration 004는 bros_provider 인프라 schema에 account/daily_budget/reservation을 생성한다. app 18개 테이블/259개 컬럼과 기존 001~003은 보존한다. 실제 BROS DB에는 적용하지 않았다.
- 같은 과금 계정은 동일 DB와 고정 providerKey/accountKey로 공유한다. adapter providerId는 reservation에 기록하며 버전 변경이 계정 한도를 초기화하지 않는다. ownerId는 실행 주체 식별용이고 정책 일치 검사에서는 제외한다. 비밀 키는 장부에 저장하지 않는다.
- 계정 행 잠금 뒤 DB wall clock UTC 날짜로 상한 검사·일일 비용 증가·ACTIVE reservation·계정 진행 중 표시를 한 transaction에서 commit한다. Worker 시각/날짜를 신뢰하지 않고 HTTP 동안 DB transaction을 유지하지 않는다. 모든 비용은 양의 safe integer microusd이며 운영 요청당 최대 과금액을 예약해야 한다.
- 계정당 실제 callback 하나와 완료 후 최소 간격을 적용한다. 다른 Worker는 대기/ACTIVE 중 비용 차감 없이 RATE_LIMIT을 받는다. 429의 긴 대기를 DB에 보존하며 timeout 이후 늦게 도착한 429도 반영한다. 자동 HTTP 재시도/미래 슬롯 선예약/burst 허용은 없다.
- callback이 실제로 종료해야 RELEASED와 next_allowed_at을 기록한다. 상위 deadline, 프로세스 종료, 불명확 commit, 완료 저장 실패로 남은 ACTIVE에는 자동 만료를 두지 않는다. 실패/취소/timeout 및 commit 뒤 미호출도 예약 비용을 환불하지 않는다.
- inspect로 실행 주체/예약/현재 일별 누계를 확인하고, owner 프로세스와 transport 또는 callback의 종료를 확인한 뒤에만 recoverAbandoned를 호출한다. 현재 reservation ID 일치 검사·RECOVERED/시각/actor/사유를 원자 저장하고 cooldown을 적용한다. stale ID는 거절하고 비용은 유지한다. 공개 API에는 연결하지 않는다.
- 저장된 계정 정책과 예산/가격/간격/cooldown이 다르면 거절한다. 자동 정책 갱신/누계 초기화 API는 제공하지 않는다. 운영 변경은 모든 호출 주체 종료 확인과 기존 누계 보존을 포함해 별도 검토한다.
- Brave는 quota가 있으면 이를 통해 한 번만 예약하며 fixture budget과 이중 차감하지 않는다. live에는 shared quota가 필수다. 기본 Worker Provider는 여전히 disabled이며 환경변수만으로 live를 켤 수 없다.
- 장부는 예약 비용이다. 실제 청구액, 전체 run 비용, capture의 COMPLETED_ATTEMPT_ONLY 비용을 대체하지 않는다. 외부 소비자/다른 DB·별칭은 공유되지 않으므로 실제 계정 매핑·가격/한도 확정이 필요하다.

### 기각한 선택지와 이유

- Worker 메모리 카운터/로컬 간격만 적용: 재시작과 여러 프로세스에서 계정 총량/간격을 우회할 수 있다.
- TTL 만료로 ACTIVE 자동 해제: 멈춰 있던 이전 프로세스/abort 무시 transport가 뒤늦게 실행되면 새 호출과 겹칠 수 있다.
- 미래 시작 시각 예약 후 Worker에서 기다리기: 여러 Worker가 늦게 깨어나면 실제 호출이 몰릴 수 있다.
- HTTP 전체를 DB transaction/연결 잠금으로 감싸기: 장시간 연결 점유와 장애 복구 비용이 커진다.
- 실패 비용 환불/정책 변경 시 일별 누계 초기화: 이미 과금됐을 불확실한 호출을 누락하거나 한도를 다시 사용할 수 있다.
- adapter 버전을 예산 계정 키로 사용: 업그레이드 때 같은 실제 계정 예산을 새로 사용할 수 있다.

### 변경 파일

- packages/db/src/migrations/004-provider-quota.ts, packages/db/src/migration-runtime.ts
- packages/resolver/src/provider-quota.ts, packages/resolver/src/external-candidate-provider.ts, packages/resolver/src/brave-search-provider.ts, packages/resolver/src/index.ts
- packages/resolver/test/provider-quota.test.mjs
- tests/integration/provider-quota.integration.test.mjs, tests/integration/provider-quota-process-fixture.mjs, tests/integration/database-schema.integration.test.mjs
- docs/PROVIDER_QUOTA.md, docs/EXTERNAL_PROVIDER_BRAVE.md, docs/RESOLVER_BATCH.md, docs/PHASE3_GATE.md, docs/BLOCKERS.md, docs/IMPLEMENTATION_STATUS.md, docs/RUNBOOK.md, docs/DB_MIGRATION_SPEC.md, docs/TEST_REPORT.md, docs/DECISIONS.md

### 검증 증거

- quota unit 2/integration 10 PASS. 독립 DB pool/실제 프로세스 경쟁, 예산 소진/버전 공유, DB UTC/계정 격리, 예약 rollback/취소, 완료 저장 실패, 공유 429/late-429, SIGKILL/재생성/감사 복구, abort 무시 transport, migration down/up 검증.
- 최종 영향 범위 Provider unit+quota+DB schema 40 PASS. 전체 Node unit 163/Admin 35 PASS. 최종 전체 순차 integration 29 files/189 PASS, fail/skip 0, 155,499.0184ms. build/typecheck/lint/format 및 diff 확인 PASS. 최종 late-429 순서 변경 뒤 packages build·관련 40개·전체 integration으로 재검증했다.
- 초기 lint 오류와 기존 migration down 횟수 누락의 실패/수정/재검증은 TEST_REPORT에 기록했다. 테스트 DB 잔존 0 확인 후 전용 컨테이너/익명 volume 정리 완료. 원본 DB는 중지 상태 유지.
- 실제 Provider/API/키·실측 비용, 실제 DB migration, current revision CI/배포, 실제 label/capture calibration, 브라우저 신규 QA는 NOT_RUN이다.

### 미해결 사항 및 Blocker

- BLK-005 공유 예산/전역 호출 제한은 RESOLVED_LOCAL. 실제 계약·저장 권한·가격/한도·공유 계정 매핑·secret·기본 Worker live 구성/배포·live smoke는 OPEN이다. 임의 운영값을 생성하거나 활성화하지 않았다.
- ACTIVE 자동 만료가 없으므로 비정상 종료 후 확인/복구 전까지 해당 계정 호출이 차단될 수 있다. DB 외부 소비자의 비용, 월/분 등 별도 계약 window, 정책 변경/장부 보존 기간은 운영 입력에 따라 후속 검토한다.
- BLK-006 RESOLVED_LOCAL, BLK-007 OPEN/사용자 보류, 자동승격 OFF 및 Phase 3 Gate BLOCKED를 유지한다. 기존 미커밋 작업을 보존했고 commit/push는 하지 않았다.

### 다음 작업 인수 조건

- 작업 범위: 현재 P3 변경 묶음/배포 revision 및 원격 CI 준비. 원본 XLSX/raw/검수 산출물 제외 범위, 전체 변경 diff, migration 002~004와 배포 순서를 정리한다. 운영 입력 확보 후 별도 구성으로 shared quota/SecretProvider를 연결하고 제한된 live 검증을 진행한다.
- 금지 변경: P3-14 반복 입력 요청/미검수 label 생성, live/자동승격 임의 활성화, 기존 norm/identity lock/threshold·capture 비용 범위 변경, 불확실 ACTIVE 자동 만료/환불, 계정 별칭 교체로 누계 초기화.
- 완료 조건: 다음 요청 범위의 구체적인 변경 묶음과 재현 가능한 검증/CI·배포 근거. 운영 연결은 계약·계정/한도·권한/키 주입과 대상 DB 확인을 먼저 충족한다. 실제 정답·capture 확보 또는 재개 요청이 오면 P3-14 인수 검증부터 이어간다.
- 재검토가 필요한 조건: 다중 과금 경로/서비스 계정, 별도 시간 window, 비용 정책 변경, burst 요구, 복구 자동화/TTL 요구, DB 역할 분리와 운영 장부 보존 정책, 실제 Provider 계약 확정.

## DEC-20260916-001 — Phase 3 변경 묶음과 원격 CI 준비

- 일자: 2026-09-16
- 종료 단계/분야: 변경 범위·공개 제외 자료 정리, CI 실행 경로 보완, PR/배포 인수 자료, 로컬 검증
- 작성 모델/추론 수준: Codex(GPT-6 기반). 정확한 실행 모델 ID와 추론 수준은 현재 세션에서 확인할 수 없어 추천 설정과 구분한다.
- 관련 WBS Task: P3-01~14 변경 인수, BLK-005/006/007, Phase 3 Gate 준비
- 검토 범위와 근거: AGENTS.md, doc/README 및 운영 지침 v0.3, DEC-20260915-021~029, 구현 현황/Blocker/Test Report, Git working tree·원격 PR/head/ruleset, workflow/test runner, migration 002~004. 사용자 요청은 Phase 3 변경 묶음 정리 및 원격 CI 준비다.
- 상태: ACCEPTED — 로컬 준비 완료. Phase 3 원격 CI/운영 배포 완료는 아니다.
- supersedes: 없음. 기존 순차 회귀 검증 방식을 공식 integration runner에 반영하며 norm/승격/공유 quota/capture·보류 정책은 유지한다.

### 확정 결정

- `codex/p1-foundation`의 기준 HEAD 968dfa7930c0ead33d89d47493091dd5aad04fc4 이후 현재 변경 123개 파일을 명시적 manifest에 기록한다. 계약/index/config/lockfile 의존성을 가진 완성 working tree를 하나의 통합 checkpoint로 준비하며, 검증되지 않은 P3 단계별 커밋으로 임의 분할하지 않는다.
- 원본·검수 workbook이 있던 /examples를 Git 제외에 추가한다. /data·/storage·환경별 .env 제외를 유지한다. public 변경 묶음에는 합성 golden/보고서와 집계·절차 문서만 포함하며 실제 상품별 원본/capture/검수 자료는 제외한다.
- publication:check는 index 경로를 확인하고 강제 추가한 비공개 자료도 실패시킨다. --worktree 모드는 현재 미추적 후보까지 점검한다. CI에 동일 guard를 추가하되 내용/전체 secret 검증을 대체하지 않는다.
- integration test 파일을 순차 실행해 기존 회귀 증거와 CI의 명령 경로를 일치시킨다. 테스트 내부의 병렬 요청·서로 다른 pool/프로세스·crash 검증과 기존 timeout은 유지한다.
- 기존 required job 이름/trigger/action 및 DB image pin/20분 timeout/ruleset을 유지한다. format 명령은 프로젝트의 명시적 root 설정과 소스 경로를 검사해 다른 worktree의 제한 폴더를 순회하지 않는다. 기존 doc/docs ignore 범위는 바꾸지 않는다.
- 기존 public PR #1의 head는 기준 HEAD와 같고 main을 대상으로 한다. PR에는 P1/P2도 누적되어 있어 로컬 PR 초안은 전체 범위를 설명한다. 기존 head check 성공은 이번 미커밋 P3 검증으로 재사용하지 않는다.
- 배포는 대상 DB/백업·기존 실행을 확인하고 API/Worker 쓰기·접수를 drain한 뒤 migration 002~004와 같은 revision의 P2 importer/P3 resolver/API/Worker/CLI를 함께 적용하는 절차로 인수한다. 과거 P2 프로세스와 새 호환 잠금이 섞이는 무조건 rolling 배포는 하지 않는다. 운영 down/reset을 제공하지 않는다.
- 원격 상태는 read-only로 확인했다. 현재 요청의 준비 산출물을 완성했으며 stage/commit/push/PR 수정/원격 dispatch/merge와 실제 DB migration은 수행하지 않았다.

### 기각한 선택지와 이유

- `git add .` 또는 examples까지 포함한 전체 폴더 stage: 공개 저장소에 원본·검수 자료가 들어갈 수 있다. 검토한 manifest 경로만 사용한다.
- 많은 Phase 3 변경을 의존성 검증 없이 단계별 커밋으로 분할: 공유 index/package/config와 잠금 계약 때문에 중간 revision이 빌드·동시성 계약을 깨뜨릴 수 있다.
- 기존 HEAD의 원격 성공을 신규 P3 성공으로 사용: 실제 변경 코드의 CI 증거가 아니다.
- 병렬 suite 과부하를 피하려고 DB timeout 확대/테스트 skip: 기존 검증 의미를 약화시킨다. 파일 간 순차 실행만 적용한다.
- 포맷 오류 해결을 위해 다른 worktree의 비밀 폴더 접근권한 확대: 현재 프로젝트 검증과 무관하다. 포맷 검색 범위를 명시한다.

### 변경 파일

- .gitignore, .github/workflows/ci.yml, package.json, scripts/run-tests.mjs, scripts/check-publication.mjs, tests/integration/publication.integration.test.mjs
- docs/PHASE3_RELEASE_PREP.md, docs/PHASE3_PR.md, docs/phase3-change-set.json
- docs/IMPLEMENTATION_STATUS.md, docs/PHASE3_GATE.md, docs/RUNBOOK.md, docs/TEST_REPORT.md, docs/DECISIONS.md
- manifest의 나머지 파일은 인수한 기존 P3 변경이다. 이번에 모두 신규 구현한 것으로 기록하지 않는다.

### 검증 증거

- frozen offline install PASS, publication path index/worktree PASS, 전용 guard 2개 PASS, 원본 XLSX/검수 자료 ignore 확인 PASS. manifest 123개와 실제 변경 경로 일치·존재·중복/비공개 경로 부재 및 diff 확인 PASS.
- `pnpm check`의 lint/typecheck·Node unit 163/Admin 35·integration 30 files/191 PASS(fail/skip 0, 157,423.7449ms). 이후 포맷 단계의 별도 worktree EPERM으로 composite command는 exit 2였다. format 경로 수정 뒤 format:check와 최종 build 각각 PASS. 전체 command를 다시 실행한 것으로 기록하지 않는다.
- 신규 문서 별도 Prettier PASS. 실행/초기 실패·수정·근거 URL은 TEST_REPORT와 PHASE3_RELEASE_PREP에 기록했다. 테스트 DB 잔존 0 확인 후 이번 전용 컨테이너/익명 volume 정리 완료.
- GitHub 저장소/PR/main/ruleset 및 기존 head check 조회 PASS. 기존 head는 success지만 Phase 3 신규 원격 CI는 NOT_RUN이다. 실제 운영 DB·Provider·자동승격·P3-14 검수는 실행하지 않았다.

### 미해결 사항 및 Blocker

- 신규 Phase 3 commit/push/정확한 SHA 원격 CI 증거는 다음 단계다. Ubuntu clean install/실행은 원격 결과로 확인해야 한다. 현재는 Windows 로컬·기존 cache 검증이다.
- BLK-005 운영 계약/가격/한도/계정·키·live 연결 OPEN, BLK-006 RESOLVED_LOCAL, BLK-007 사용자 보류, Phase 3 Gate BLOCKED 및 자동승격 OFF 유지.
- 다른 worktree가 존재하지만 해당 작업/비밀 폴더를 검사·변경하지 않았다. 이후 같은 branch/working tree가 바뀌면 manifest와 diff를 다시 대조한다.

### 다음 작업 인수 조건

- 작업 범위: manifest와 현재 diff 재검토 → 명시적 경로 stage/통합 commit → 현재 branch 일반 push → PR #1 전체 범위 설명 갱신 → 새 head SHA의 required CI 완료 확인과 증거 기록.
- 금지 변경: force push/기존 변경 삭제, 원본·검수 XLSX/raw/capture/비밀값 공개, old head의 CI를 새 revision 증거로 사용, live/자동승격/운영 migration 임의 실행, P3-14 반복 입력 요청.
- 완료 조건: 새 SHA와 해당 원격 workflow 결과·required check/protection 상태가 일치하고 제외 자료가 commit에 없음을 확인한다. CI 성공과 운영/Phase 3 Gate 상태는 별도 기록한다.
- 재검토가 필요한 조건: main/PR head 또는 working tree 변경, manifest 외 파일 추가, CI 실패, migration/identity 잠금 정책 변경, 실제 운영 입력·정답/capture 확보 또는 재개 요청.
