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

## DEC-20260914-014 — P6-01 인증 경계와 P5-06 durable 실행 연결

- 일자: 2026-09-14
- 종료 단계/분야: Caddy/API 인증 경계, Browser demo durable evidence, DB/Queue Worker 연결
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(추론 수준 미노출)
- 관련 WBS Task: P6-01, P5-06, P5-09, P5-10, P5-07 연결
- 검토 범위와 근거: AGENTS.md, DEC-20260914-013, `doc/BROS_구현_보완_명세_v0.2.md` 인증 기준, WBS P6-01, P5 Browser Track 구현, Fastify/pg-boss/ObjectStorage/Playwright 실제 실행 결과
- 상태: ACCEPTED
- supersedes: DEC-20260914-013의 P6-01 미해결 인증 fence 항목만 구현으로 대체한다. P2-14의 local 개발 fence와 import 계약은 유지한다.

### 확정 결정

- 인터넷 신뢰 경계는 Caddy다. `ops/Caddyfile`은 모든 browser-visible route를 Basic Auth로 보호하고, client actor/token header를 삭제한 뒤 인증 username과 host secret token만 loopback API로 전달한다. API proxy mode는 loopback bind, HTTPS public origin, 32자 이상 token을 강제한다.
- `/api/v1/*`는 Caddy token과 actor가 모두 유효할 때만 실행한다. state-changing request는 exact Origin과 JSON content type을 요구한다. local unauthenticated mode는 명시적 development/test loopback에만 남는다.
- Browser artifact preview는 인증된 actor가 strict automation artifact key에 대해서만 5분 이하 signed URL을 받는 API capability다. API는 Browser/Playwright runtime을 import하지 않고 storage port만 사용한다.
- `browser.run` payload는 public run UUID만 가진다. 수동 enqueue는 run row·request key·pg-boss receipt를 한 transaction에서 기록하고, Worker는 provider receipt ownership을 확인한 뒤 terminal status/evidence를 기록한다. scheduled delivery는 job UUID로 `SCHEDULED` run을 생성한다.
- demo browser flow는 실제 Chromium lifecycle에서 start/final 또는 failure screenshot, trace.zip, secret-redacted result.json을 같은 UUIDv7 prefix에 저장한다. R2 ObjectStorage adapter는 아직 없으므로 local driver만 이 durable path에서 실행 가능하다.

### 기각한 선택지와 이유

- API가 client 전달 actor header를 신뢰: 직접 API 포트나 forged header에서 감사 actor를 위조할 수 있어 기각했다.
- browser.run payload에 input·credential·artifact 내용을 넣기: provider/로그 노출 면적을 넓히므로 DB reference와 safe result 저장으로 제한했다.
- API가 Playwright/Browser artifact service를 import: API runtime에 browser dependency를 끌어오므로 storage capability adapter로 분리했다.
- R2 driver를 local adapter처럼 성공 처리: 실제 adapter가 없으므로 명시적으로 unavailable/unsupported 상태를 유지한다.

### 변경 파일

- `.env.example`, `ops/Caddyfile`, `pnpm-lock.yaml`
- `packages/core/src/config/index.ts`, `packages/core/test/config.test.mjs`
- `packages/browser/src/demo-flow.ts`, `packages/browser/src/index.ts`
- `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/artifact-preview.ts`, `apps/api/src/security.ts`, `apps/api/src/index.ts`
- `apps/worker/src/browser-run.ts`, `apps/worker/src/runtime.ts`, `apps/worker/src/index.ts`
- `tests/integration/api-security.integration.test.mjs`, `tests/integration/browser-demo.integration.test.mjs`, `tests/integration/browser-durable.integration.test.mjs`, `tests/integration/worker.integration.test.mjs`
- `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`

### 검증 증거

- 실행 명령 또는 수동 확인: `pnpm lint`, 변경 파일 `prettier --check`, `pnpm typecheck`, `pnpm build`, Node config/artifact/API security/Chromium demo test 21개.
- 결과: IMPLEMENTED_NOT_VALIDATED — lint/typecheck/build과 21개 test PASS. 실제 Chromium durable flow에서 PNG/ZIP signature와 result artifact를 확인했다. `TEST_DATABASE_URL` 및 Docker daemon 부재로 disposable PostgreSQL/pg-boss integration와 전체 `pnpm test`는 NOT_RUN이며, Caddy binary 부재로 Caddyfile runtime validation도 NOT_RUN이다.

### 미해결 사항 및 Blocker

- `tests/integration/browser-durable.integration.test.mjs`는 DB/pg-boss manual success/failure 및 receipt idempotency를 검증하도록 추가됐지만 이 환경에는 `TEST_DATABASE_URL`과 Docker daemon이 없어 실행하지 못했다.
- production Caddy deployment와 R2 adapter는 아직 실제 검증되지 않았다. `API_PROXY_AUTH_TOKEN`과 `BROS_PROXY_AUTH_TOKEN`의 host secret 동기화, Caddy password hash 주입, API 포트 firewall 차단이 배포 전 필수다.

### 다음 작업 인수 조건

- 작업 범위: disposable PostgreSQL/pg-boss durable integration 실행, Caddy `validate` 및 staging reverse-proxy smoke, R2 adapter 또는 production artifact storage 결정.
- 금지 변경: API 직접 노출, client actor header 신뢰, queue payload에 credential/input 원문 추가, artifact raw error/secret 저장, local unauthenticated mode의 production 허용.
- 완료 조건: `TEST_DATABASE_URL`로 P6 durable integration PASS, Caddy config validate 및 staging에서 spoofed actor/direct port/cross-origin mutation 거절, authenticated artifact preview와 manual/scheduled browser run evidence 확인.
- 재검토가 필요한 조건: 다중 role/RBAC, cookie session, 외부 artifact 공유, R2/S3 preview 방식, browser retry 또는 scheduled run deduplication 보장 수준이 바뀔 때.

## DEC-20260914-015 — P6-01 disposable DB/pg-boss와 Caddy staging 검증

- 일자: 2026-09-14
- 종료 단계/분야: P6-01 local runtime verification 및 Caddy upstream header transport 보정
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(추론 수준 미노출)
- 관련 WBS Task: P6-01, P5-06, P5-07, P5-09, P5-10
- 검토 범위와 근거: DEC-20260914-014, `tests/integration/browser-durable.integration.test.mjs`, `tests/integration/worker.integration.test.mjs`, `ops/Caddyfile`, 실제 Docker PostgreSQL 18.6·pg-boss·Caddy 2 staging 실행 결과
- 상태: ACCEPTED
- supersedes: DEC-20260914-014의 Caddy actor/token header transport 구성만 대체한다. P6-01의 loopback proxy trust boundary와 P5 durable 계약은 유지한다.

### 확정 결정

- Caddy upstream에서 `header_up X-BROS-Actor <authenticated-user>`와 `header_up X-BROS-Proxy-Token <host-secret>`만 사용한다. `header_up`의 set은 기존 client header를 overwrite하므로 같은 header의 delete와 set을 함께 두지 않는다.
- `Authorization` Basic Auth credential은 API upstream으로 전달하지 않는다. Caddy에서 `header_up -Authorization`으로 제거하고, API는 actor/token만 신뢰한다.
- P6 durable DB/Queue path는 disposable PostgreSQL 18.6과 실제 pg-boss consumer에서 수동 success/failure, receipt replay fencing, terminal `automation_run` evidence까지 검증됐다.

### 기각한 선택지와 이유

- actor/token header를 delete 후 set으로 방어: 실제 Caddy runtime에서 final set 값까지 제거되어 인증된 upstream identity가 없어지므로 기각했다.
- Basic Auth Authorization을 upstream에 그대로 전달: API가 필요로 하지 않는 password-derived credential을 전달하므로 기각했다.
- static Caddyfile assertion만으로 header transport를 승인: handler operation 순서 문제를 발견하지 못했으므로 실제 proxy/upstream smoke를 필수 증거로 채택했다.

### 변경 파일

- `ops/Caddyfile`
- `tests/integration/api-security.integration.test.mjs`
- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_REPORT.md`

### 검증 증거

- 실행 명령 또는 수동 확인: disposable PostgreSQL 18.6 `--rm` container에서 browser durable integration 1개 및 Worker integration 9개, Caddy 2 `validate`, Basic Auth/reverse-proxy upstream reflection smoke, `pnpm lint`, API security regression 2개, `git diff --check`.
- 결과: IMPLEMENTED_NOT_VALIDATED — local DB/Queue/Caddy validation과 smoke는 PASS. remote CI, public HTTPS/DNS/firewall staging 및 R2 adapter는 NOT_RUN이다.

### 미해결 사항 및 Blocker

- 실제 public hostname의 certificate issuance, network firewall에 의한 API direct port 차단, production host secret injection은 local Docker smoke에서 확인할 수 없다.
- R2 ObjectStorage driver와 production artifact preview endpoint는 구현·검증되지 않았다.

### 다음 작업 인수 조건

- 작업 범위: public staging HTTPS/DNS/firewall smoke와 remote CI, R2 adapter 또는 storage provider 결정.
- 금지 변경: client actor/token header 신뢰, Basic Auth Authorization upstream 전달, queue payload에 secret/raw input 추가, local unauthenticated production 허용.
- 완료 조건: public staging에서 TLS, 401, spoofed header overwrite, direct API port 차단, authenticated artifact preview와 browser run evidence를 확인하고 remote CI를 통과한다.
- 재검토가 필요한 조건: Caddy auth 방식, API deployment topology, storage provider, multi-role/RBAC 요구가 변경될 때.

## DEC-20260914-016 — P6-04 SecretProvider 기반 private R2 ObjectStorage Adapter

- 일자: 2026-09-14
- 종료 단계/분야: Phase 6 P6-04 운영 ObjectStorage 구현 및 local contract 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(추론 수준 미노출)
- 관련 WBS Task: P6-04, P1-12, P1-13, P5-10, P6-01
- 검토 범위와 근거: AGENTS.md, DEC-20260913-004, DEC-20260912-006, DEC-20260914-014/015, WBS P6-04 acceptance/test, ObjectStorage port·Local adapter, API/Worker runtime 조립부, Cloudflare R2 S3 API/presigned URL 및 AWS SDK v3 공식 문서
- 상태: ACCEPTED
- supersedes: DEC-20260913-004와 DEC-20260914-014/015의 “R2 adapter 미구현” 상태만 대체한다. Local adapter 보안 계약, artifact authorization 및 P6-01 proxy trust boundary는 유지한다.

### 확정 결정

- `STORAGE_DRIVER=r2`는 HTTPS Cloudflare account S3 API origin(`STORAGE_R2_ENDPOINT`)과 portable private bucket(`STORAGE_R2_BUCKET`)을 모두 요구한다. custom/public domain, path/query/user-info endpoint는 config에서 거절한다.
- `createObjectStorage(config.storage, { secretProvider })`가 Local 또는 R2 adapter를 선택한다. R2 access key와 secret key는 기존 `SecretProvider`의 승인 key만으로 lazy resolve하며 config/DB/log/signed URL에 저장하지 않는다. API/Worker runtime 조립부만 `EnvSecretProvider(process.env)`를 주입하고 Browser/업무 코드는 provider 구현을 알지 못한다.
- R2 adapter는 S3-compatible `put/get/delete`와 GET presigned URL을 제공한다. PUT은 `contentType`과 호출자가 공급한 SHA-256을 object metadata로 전달하며, SDK의 최대 3회 transient retry를 사용한다. GET presigned URL은 1~604800초로 제한하고 artifact preview API는 기존 300초 authorization capability를 유지한다.
- Adapter는 public ACL을 설정하지 않는다. private bucket 생성/정책은 운영 배포 책임이며, missing/invalid credential은 stable `STORAGE_AUTH_FAILED`, missing object는 `OBJECT_NOT_FOUND`로 외부 세부 오류 없이 mapping한다.

### 기각한 선택지와 이유

- R2 credential을 typed config 또는 `.env.example` non-secret setting에 추가: P1-13 SecretProvider/redaction 경계를 위반하고 노출 면적을 넓힌다.
- R2 endpoint에 custom/public domain을 허용: presigned URL의 S3 API origin 요구와 private object boundary를 흐리므로 기각한다.
- API/Worker 업무 handler마다 R2 client를 직접 생성: Local↔R2 교체 acceptance 및 ObjectStorage port 분리를 훼손한다.
- R2 오류 원문, endpoint query, SigV4 signature를 그대로 surface: credential/signed URL 노출 위험이 있어 stable StorageError만 반환한다.

### 변경 파일

- `.env.example`, `pnpm-lock.yaml`
- `packages/core/src/config/index.ts`, `packages/core/test/config.test.mjs`
- `packages/storage/package.json`, `packages/storage/src/port.ts`, `packages/storage/src/local.ts`, `packages/storage/src/r2.ts`, `packages/storage/src/index.ts`, `packages/storage/test/storage.test.mjs`
- `packages/browser/src/artifact-service.ts`
- `apps/api/src/app.ts`, `apps/worker/src/runtime.ts`
- `docs/IMPLEMENTATION_STATUS.md`, `docs/RUNBOOK.md`, `docs/TEST_REPORT.md`, `docs/DECISIONS.md`

### 검증 증거

- 실행 명령 또는 수동 확인: core/storage/browser/API/Worker build, storage typecheck, core config/security 15개, storage 11개, browser artifact 6개, API security 2개, actual Chromium artifact integration 1개, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`(Admin 13개·Node 100개), 변경 파일 Prettier check, `git diff --check`.
- 결과: IMPLEMENTED_NOT_VALIDATED — mock S3 contract의 retry/metadata/stream/delete/presigned expiry와 missing credential mapping, existing artifact/API security/Chromium regression은 PASS. 실제 R2 account/bucket, wrong credential 401/403, remote CI와 public staging은 NOT_RUN이다.

### 미해결 사항 및 Blocker

- Cloudflare account ID, private bucket 및 scoped API credential이 제공되지 않아 real R2 PUT/GET/DELETE, 401/403 credential failure, signed URL browser fetch는 실행하지 않았다.
- root `pnpm format:check`는 이번 변경과 무관한 `apps/admin` 11개 기존 formatting drift로 FAIL한다. P6-04 변경 파일은 formatter를 적용했고 lint/typecheck/unit은 PASS다.
- P6-05 retention cleanup은 R2 object metadata/listing 및 hold 정책의 상세 설계가 필요하다. P6-10 public Docker/HTTPS는 P6-02/P6-06과 external staging authority가 남아 있다.

### 다음 작업 인수 조건

- 작업 범위: P6-04 real R2 staging validation 또는 P6-05 artifact retention/cleanup 설계·구현. external R2 authority가 없으면 P6-05의 provider-neutral policy부터 진행한다.
- 금지 변경: R2 bucket public-read/ACL 설정, secret·presigned URL 로그/DB 저장, API/Worker 업무 코드의 provider 직접 의존, client actor/token 신뢰, local unauthenticated production 허용.
- 완료 조건: real private R2 bucket에서 put/get/delete, metadata, 300초 preview URL, wrong credential 401/403 mapping과 no-public-ACL를 확인하거나, P6-05의 retention/hold/delete audit 계약과 test를 완성한다.
- 재검토가 필요한 조건: custom domain artifact delivery, direct client upload, multipart large object, key rotation without restart, cross-region S3 provider 또는 object legal hold 요구가 생길 때.

## DEC-20260914-017 — P6-05 Browser Artifact Retention, Hold, Cleanup Audit

- 일자: 2026-09-14
- 종료 단계/분야: Phase 6 P6-05 artifact retention/cleanup 구현 및 disposable DB 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(추론 수준 미노출)
- 관련 WBS Task: P6-05, P5-10, P6-01, P6-04
- 검토 범위와 근거: AGENTS.md, DEC-20260913-004, DEC-20260914-014/015/016, WBS P6-05 acceptance/test, Browser artifact key/result contract, ObjectStorage port, automation_run schema, RUNBOOK 및 TEST_REPORT
- 상태: ACCEPTED
- supersedes: 없음

### 확정 결정

- 자동 cleanup은 terminal `automation_run`의 `screenshot_key`, `trace_key`, `result_json.artifact.resultKey`만 대상으로 한다. `finished_at` 기준 기본 14일이 지난 portable key를 하루 한 번 UTC 03:17에 최대 100개 처리한다. source original과 승인/생성 thumbnail은 후보 query에 포함하지 않아 보존한다.
- `app.artifact_retention_event`는 `HOLD_SET`, `HOLD_RELEASED`, `DELETED`, `DELETE_FAILED` append-only audit ledger다. 최신 hold가 무기한이거나 종료 시각보다 이르면 삭제하지 않으며, release는 기존 hold를 갱신하지 않고 새 event를 추가한다.
- 삭제 성공은 실행 시점의 current ObjectStorage provider/bucket과 함께 기록한다. provider 오류 원문은 DB/log에 저장하지 않고 `ARTIFACT_DELETE_FAILED` stable code만 기록한다. malformed DB key 및 이미 삭제된 key는 fail-closed로 skip한다.
- cleanup schedule key는 pg-boss 허용 문자만 사용한 `artifact-retention-daily`로 고정한다. queue payload에는 maintenance UUIDv7 reference만 담으며 object key·secret·run input은 담지 않는다.
- cleanup은 current configured storage adapter에만 호출한다. provider/bucket을 이전한 historical object를 목록 조회하거나 삭제하지 않으며, 해당 migration은 별도 운영 절차와 새 결정이 필요하다.

### 기각한 선택지와 이유

- product_image 또는 모든 storage object를 prefix/listing으로 일괄 삭제: source original·승인 thumbnail 보존 정책과 provider-independent DB ownership 경계를 위반한다.
- mutable hold table로 과거 hold/delete 상태를 덮어쓰기: 법적/운영 예외와 삭제 시점의 감사 증거를 보존하지 못한다.
- provider 오류/endpoint/signed URL을 event 또는 log에 그대로 기록: credential 및 capability 노출 위험이 있어 stable code로 제한한다.
- schedule key에 `:` 사용: pg-boss가 허용하지 않아 worker startup을 실패시킨다.

### 변경 파일

- packages/db/src/migrations/002-artifact-retention.ts, migration-runtime.ts, schema.ts
- packages/queue/src/port.ts
- apps/worker/src/artifact-retention.ts, runtime.ts, index.ts, test/artifact-retention.test.mjs
- tests/integration/artifact-retention.integration.test.mjs, database-schema.integration.test.mjs
- docs/DB_MIGRATION_SPEC.md, doc/README.md, doc/BROS_구현_보완_명세_v0.2.md, doc/brand_resell_os_design_v0.1.md
- docs/IMPLEMENTATION_STATUS.md, docs/TEST_REPORT.md, docs/RUNBOOK.md, docs/DECISIONS.md

### 검증 증거

- 실행 명령 또는 수동 확인: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, 변경 파일 Prettier check, `git diff --check`; 별도 이름·포트의 disposable PostgreSQL 18.6에서 `node --test tests/integration/artifact-retention.integration.test.mjs tests/integration/browser-durable.integration.test.mjs tests/integration/database-schema.integration.test.mjs`.
- 결과: IMPLEMENTED_NOT_VALIDATED — Admin 13개와 Node unit 103개 PASS. P6-05 hold/delete audit 및 실제 Local object 삭제, 19 table/266 column migration/rollback, pg-boss browser durable 회귀를 포함한 대상 integration 10개 PASS. 전체 integration 24-file suite와 remote CI, real R2, public HTTPS staging은 NOT_RUN이다.

### 미해결 사항 및 Blocker

- Cloudflare account ID/private bucket/scoped credential이 제공되지 않아 real R2 cleanup과 historical provider migration은 NOT_RUN이다.
- 전체 integration suite는 최초 실행에서 pg-boss key 제약으로 durable startup FAIL을 발견해 수정했으나, 수정 후 전체 24-file suite를 다시 실행하지 않았다.
- root `pnpm format:check`는 P6-04에서 확인한 이번 범위와 무관한 `apps/admin` 11개 기존 formatting drift 때문에 아직 FAIL이다.

### 다음 작업 인수 조건

- 작업 범위: scoped credential이 제공되면 P6-04/P6-05 real private R2 staging validation을 수행하거나, 외부 staging 권한이 없으면 P6-10 public Docker/HTTPS deployment boundary를 준비한다.
- 금지 변경: source original/approved thumbnail 자동 삭제, R2 bucket public-read/ACL 설정, event/log/queue payload에 secret·presigned URL·raw input을 저장, current adapter 외 historical provider object의 무단 삭제.
- 완료 조건: real private R2에서 held/unheld artifact delete와 DELETED/DELETE_FAILED audit, 300초 authorized preview, wrong credential mapping을 확인하거나 public staging TLS/proxy/queue smoke를 증거로 남긴다.
- 재검토가 필요한 조건: object legal hold의 provider-native enforcement, retention 기간/대상 확대, provider/bucket migration, multi-region storage 또는 대량 backlog 처리 요구가 생길 때.

## DEC-20260915-001 — P6-04/P6-05 Private R2 실환경 검증

- 일자: 2026-09-15
- 종료 단계/분야: Phase 6 private Cloudflare R2 adapter, authorized preview, artifact hold/cleanup staging 검증
- 작성 모델/추론 수준: GPT-5 Codex / 시스템 설정(추론 수준 미노출)
- 관련 WBS Task: P6-04, P6-05, P5-10, P6-01
- 검토 범위와 근거: AGENTS.md, DEC-20260914-014/015/016/017, `packages/storage/src/r2.ts`, `packages/browser/src/artifact-service.ts`, `apps/api/src/artifact-preview.ts`, `apps/worker/src/artifact-retention.ts`, Cloudflare R2 private bucket·single-bucket API token, PostgreSQL 18.6 실환경 실행 결과
- 상태: ACCEPTED
- supersedes: DEC-20260914-016과 DEC-20260914-017의 실제 R2 account/bucket/credential 및 cleanup `NOT_RUN` 상태만 대체한다. public HTTPS·remote CI 미검증 상태와 기존 보안/보존 계약은 유지한다.

### 확정 결정

- `bros-p6-staging-artifacts`는 public access를 활성화하지 않은 private staging bucket으로 유지한다. 검증 credential은 해당 bucket 하나에 대한 `Object Read & Write`와 24시간 TTL로 제한했고 검증 직후 폐기했다.
- 실제 R2 adapter에서 PUT/GET, `content-type`과 SHA-256 metadata, unsigned access 거부, wrong-secret `STORAGE_AUTH_FAILED`, authorization 뒤 300초 presigned GET과 HTTP 200/body를 확인했다. secret과 presigned URL은 파일·명령행·로그·DB에 저장하지 않았다.
- 실제 PostgreSQL 18.6 terminal Browser run을 기준으로 active hold의 trace 1개는 보존하고 unheld screenshot/result 2개를 삭제했다. hold release 뒤 trace도 삭제했으며 `HOLD_SET`, `DELETED`, `HOLD_RELEASED` append-only audit과 삭제 시점 `provider=R2`/bucket 기록을 확인했다.
- 검증기는 생성에 성공한 임의 UUIDv7 key만 `finally`에서 정리한다. 실제 artifact 3개, 고유 test DB, disposable 컨테이너와 검증 token은 제거했고 private bucket만 후속 staging용으로 남겼다.

### 기각한 선택지와 이유

- bucket public-read 또는 custom public domain 활성화: 기존 private object와 authenticated preview 경계를 우회하므로 기각했다.
- account 전체 bucket 또는 장기 credential 사용: 실검증에 필요한 권한·시간 범위를 넘으므로 single-bucket 24시간 token으로 제한했다.
- credential을 `.env*`, 명령행 또는 검증 로그에 기록: secret 노출 면적을 넓히므로 일회성 메모리 전달만 사용했다.
- 브라우저 credential relay helper를 운영 스크립트로 유지: 이번 환경의 sandbox 경계 통과에만 필요하고 일반 운영 secret injection을 대체하면 안 되므로 실행 후 저장소에서 제거했다.

### 변경 파일

- `package.json`, `scripts/verify-r2-staging.mjs`
- `docs/IMPLEMENTATION_STATUS.md`, `docs/RUNBOOK.md`, `docs/TEST_REPORT.md`, `docs/DECISIONS.md`

### 검증 증거

- 실행 명령 또는 수동 확인: Cloudflare dashboard에서 private bucket·24시간 single-bucket token 확인 및 token 폐기, PostgreSQL 18.6 digest 고정 `--rm` container, 승인된 외부 프로세스의 `node scripts/verify-r2-staging.mjs`, `pnpm build`, 검증 스크립트 `node --check`/Prettier check, 검증 후 test DB/container 부재 확인.
- 결과: PASS — 실제 private R2의 put/get, metadata, unsigned denial, wrong credential mapping, 300초 authorized preview, held/unheld cleanup과 audit, artifact/token/DB/container 정리가 모두 PASS했다. 전체 integration suite·remote CI·public HTTPS staging은 NOT_RUN이다.

### 미해결 사항 및 Blocker

- public hostname의 TLS certificate issuance, DNS, firewall direct API port 차단과 production host secret injection은 아직 실제 staging에서 검증하지 않았다.
- 전체 integration suite와 remote CI는 이번 외부 R2 검증 범위에서 재실행하지 않았다.
- root `pnpm format:check`는 이번 변경과 무관한 `apps/admin` 기존 11개 파일의 formatting drift 때문에 FAIL한다. 이번 변경 파일은 formatter를 통과했다.

### 다음 작업 인수 조건

- 작업 범위: P6-10 public Docker/HTTPS staging에서 TLS·DNS·firewall·Caddy auth·R2-backed preview/browser run을 end-to-end 검증하거나, 먼저 전체 integration suite와 remote CI를 재실행한다.
- 금지 변경: R2 bucket public-read, broad/long-lived credential, secret·presigned URL 로그/DB 저장, client actor/token 신뢰, source original/approved thumbnail 자동 삭제, current adapter 외 historical provider object 무단 삭제.
- 완료 조건: public staging의 401/spoofed-header overwrite/direct-port 차단, authenticated R2 preview와 durable Browser run을 확인하고 전체 integration 및 required remote CI가 PASS한다.
- 재검토가 필요한 조건: custom domain delivery, direct client upload, provider-native legal hold, bucket/provider migration, multi-region storage 또는 key rotation without restart 요구가 생길 때.
