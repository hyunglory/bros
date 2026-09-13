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
