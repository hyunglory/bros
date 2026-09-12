## BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md

> **적용 개정: v0.2 (2026-09-11)** — 파일명의 v0.1은 참조 호환성을 위해 유지한다. 아래 v0.1 표기와 기존 검수 판정은 최초 작성 이력이며, 현재 적용 기준은 [구현 보완 명세 v0.2](BROS_구현_보완_명세_v0.2.md) 및 이 문서의 개정 내용이다. 현재 기준 문서는 `doc/`에서 관리한다. 문서 검토는 실제 구현·테스트 PASS를 의미하지 않는다. 변경 요약은 [문서 안내](README.md)를 참조한다.


# 브랜드 리셀 OS MVP 개발 WBS

- 문서 버전: **v0.1**

- 기준 설계서: **브랜드 리셀 OS 설계서 v0.1**

- 검수 상태: **상세 재검수 및 보완 반영**

- 목적: Architecture Baseline을 실제 구현 가능한 작업 단위로 분해

- 개발 원칙: Modular Monolith / API-Worker 분리 / Evidence-first / Safe Composite 우선 / Browser Flow Registry / 저비용 MVP

- 총 작업 수: **85 Tasks**

- Epic 체계: **Phase 1~6을 Epic으로 사용**

---

# 0. 상세 검수 결과

본 WBS는 최초 작성본을 기준 설계서 v0.1과 다시 대조하고, 실제 구현 가능성·선행관계·운영 안정성·테스트 가능성 관점에서 재검수했다. **문서 버전은 v0.1을 유지**하며 아래 보완을 같은 버전에 반영한다.

| 중요도 | 검수 항목 | 최초 WBS 문제 | 보완 결과 |
| --- | --- | --- | --- |
| Critical | Critical Path | Phase 1→2→3→4→5→6으로 직렬 표현되어 실제 병렬 가능성을 왜곡 | Phase 1→2 이후 Resolver/Thumbnail 병렬, Browser는 Phase 1 이후 별도 병렬 Track으로 수정 |
| Critical | MASTER 운영 화면 | 설계서의 MASTER 상품관리 UI/API Task 누락 | P2-15 추가 |
| Critical | 썸네일 제품 보존 | SAFE_COMPOSITE에 필요한 제품 Mask/Segmentation 구현 Task 누락 | P4-05 Product Mask/Segmentation 추가 |
| Critical | 운영 Object Storage | Local Adapter만 있고 Production R2 Adapter 구현 Task 누락 | P6-04 추가 |
| High | Browser Secret 보안 | 자격증명/Secret 보호가 Browser 구현보다 뒤인 Phase 6에만 존재 | P1-13 SecretProvider/Redaction baseline 추가, Phase 6은 운영 Hardening으로 변경 |
| High | Resolver 자동승인 | 95점 기준은 있으나 실데이터 Calibration Task 부재 | P3-14 Golden Dataset/Auto-Accept Calibration 추가 |
| High | Thumbnail QA | 제품변형 QA가 있으나 실제 Golden Set/오탐·미탐 Calibration Task 부재 | P4-15 QA Calibration 추가 |
| High | MASTER Race Control | 전역 Identifier UNIQUE가 없는 설계에서 단순 unique conflict만으로 동시 MASTER 생성 방지가 불충분 | P2-09에 PostgreSQL transaction advisory lock + 재조회 전략 명시 |
| Medium | Test/CI 기반 | 각 Task에 테스트는 있으나 공통 Test Harness/CI Task 누락 | P1-14 추가 |
| Medium | Health Check | /health 하나가 liveness/readiness를 동시에 담당 | /health와 /ready 역할 분리 |
| Medium | Brand 미해결 운영 | Brand Normalizer는 있으나 unresolved 브랜드 검수/alias 승인 경로 부족 | P2-16 추가 |
| Medium | 원본 이미지 보존 | source URL만 등록하면 URL 만료/삭제 시 원본 보존이 불완전 | 최초 처리 시 immutable source object 보존을 P4-03에 명시 |
| Medium | Browser Artifact | 스크린샷/Trace에 민감정보가 포함될 수 있으나 보존기간/접근제어 부족 | P5-10, P6-05에 private storage/retention 반영 |
| Medium | 첫 Sprint | 기존 권장 묶음이 일부 선행 Task를 생략 | Phase 1 전체 Foundation Gate 기준으로 수정 |
| Medium | WBS 필드 | 기준 설계서가 요구한 Epic 필드가 개별 Task에 없었음 | 각 Task에 Phase 기반 Epic 필드 추가 |

## 0.1 재검수 판정

- **설계서 v0.1 정합성:** 통과

- **업무 요구사항 커버리지:** 통과

- **구현 선행관계:** 보완 후 통과

- **데이터 정합성/멱등성:** 보완 후 통과

- **품번 자동확정 안전성:** Calibration Gate 추가 후 통과

- **썸네일 제품 보존 가능성:** Segmentation + QA Calibration 추가 후 조건부 통과

- **Browser 운영 보안:** Secret baseline 선행 배치 후 통과

- **운영 배포/복구:** R2 Adapter + Retention 보완 후 통과

> WBS의 Acceptance Criteria는 가능하면 자동 테스트 또는 명확한 수동 판정으로 Pass/Fail을 결정할 수 있는 표현을 사용한다. “잘 동작한다”, “적절하다”처럼 측정 불가능한 완료 기준은 허용하지 않는다.

---

# 1. WBS 운영 원칙

이 WBS는 설계를 다시 논의하기 위한 문서가 아니라, 확정된 설계를 실제 구현 Task로 변환한 문서다.

각 Task는 다음 필드를 가진다.

- **Task ID**: Phase 기반 고유 ID

- **작업명**: 구현 단위

- **목표**: 왜 필요한지

- **선행작업**: 먼저 완료되어야 하는 작업

- **구현 범위**: 이번 Task에서 구현할 내용

- **산출물**: 코드/DDL/UI/테스트 등 결과물

- **Acceptance Criteria**: 완료 판정 기준

- **테스트**: 최소 검증 항목

- **우선순위**: P0 / P1 / P2

- **난이도**: Low / Medium / High / Very High

- **병렬 가능**: Yes / Partial / No

## 우선순위 정의

- **P0**: 다음 Phase 또는 MVP 전체를 막는 필수 작업

- **P1**: MVP 운영에 필요한 핵심 작업

- **P2**: MVP 품질/운영성을 높이는 작업

## Critical Path / 병렬 경로

최초 WBS의 완전 직렬 경로는 실제 의존성과 맞지 않아 다음과 같이 수정한다.

```
┌→ Phase 3 Identifier Resolver ─┐
Phase 1 기반 → Phase 2 Importer                     ├→ Phase 6 안정화 / Release
                    └→ Phase 4 Thumbnail Engine ───┘
      └────────────────→ Phase 5 Browser Automation ┘
```

- Phase 2는 상품/이미지/Identifier의 기준 데이터를 만들기 때문에 Phase 3·4의 선행이다.

- Phase 3과 Phase 4는 Phase 2 Gate 이후 대부분 병렬 진행할 수 있다.

- Phase 5 Browser Automation은 상품 MASTER와 직접 의존하지 않으므로 Phase 1 Gate 이후 별도 Track으로 시작할 수 있다.

- Phase 6 Release Gate는 Phase 3·4·5의 MVP Gate가 모두 완료되어야 한다.

- UI, 테스트 데이터, 운영 문서화는 각 Core 구현과 가능한 범위에서 병렬 진행한다.

## Definition of Ready

Task를 `IN PROGRESS`로 시작하려면 다음이 충족되어야 한다.

- 선행작업이 완료되었거나 명시적으로 Mock/Stub으로 대체 가능하다.

- 필요한 실제 입력자료 또는 Fixture가 준비되어 있다.

- 외부 Provider가 필요한 Task는 API 계약/비용/Rate Limit/사용 가능 조건이 확인되어 있다.

- Acceptance Criteria가 Pass/Fail로 판정 가능하다.

- 데이터 마이그레이션 또는 파괴적 변경이 있으면 롤백이 아니라 **복구/Forward-fix 전략**이 정의되어 있다.

---

# 2. Phase 1 — 실행 가능한 Skeleton

## Phase 목표

```
PostgreSQL 시작
→ Migration 성공
→ API 시작
→ GET /health = 200
→ pg-boss 시작
→ system.test Job 생성
→ Worker 소비
→ SUCCESS 기록
→ Admin 기본 화면 접근
```

## P1-01 — Monorepo / pnpm Workspace 생성

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: 모든 앱과 공통 패키지를 하나의 저장소에서 관리한다.

- **선행작업**: 없음

- **구현 범위**: `apps/admin`, `apps/api`, `apps/worker`, `packages/core`, `packages/contracts`, `packages/db`, `packages/queue`, `packages/storage`, `packages/image`, `packages/browser` 기본 구조와 root scripts 구성

- **산출물**: pnpm workspace, root package.json, tsconfig base, .gitignore

- **Acceptance Criteria**: 루트에서 install/build/typecheck 명령이 실행되고 각 workspace가 인식된다.

- **테스트**: fresh clone 기준 `pnpm install`, workspace package resolution

- **우선순위**: P0

- **난이도**: Low

- **병렬 가능**: No

## P1-02 — 공통 TypeScript / 품질 설정

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: 앱별 타입 설정 차이로 인한 오류를 방지한다.

- **선행작업**: P1-01

- **구현 범위**: strict TypeScript, formatter/linter, 공통 scripts, Node 24 engine 고정

- **산출물**: 공통 tsconfig 및 코드 품질 설정

- **Acceptance Criteria**: 빈 프로젝트 상태에서 typecheck/lint가 통과한다.

- **테스트**: 의도적인 타입 오류가 CI/local typecheck에서 탐지된다.

- **우선순위**: P1

- **난이도**: Low

- **병렬 가능**: Yes

## P1-03 — 환경변수 / Config Loader

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: API, Worker, DB, Storage 설정을 코드와 분리한다.

- **선행작업**: P1-01

- **구현 범위**: `.env.example`, runtime validation, 개발/운영 설정 분리

- **산출물**: typed config module

- **Acceptance Criteria**: 필수 환경변수 누락 시 명확한 오류로 시작이 중단된다.

- **테스트**: valid/invalid env unit test

- **우선순위**: P0

- **난이도**: Low

- **병렬 가능**: Yes

## P1-04 — PostgreSQL 18 개발환경

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: 로컬에서 재현 가능한 DB 환경을 제공한다.

- **선행작업**: P1-01

- **구현 범위**: Docker Compose PostgreSQL, healthcheck, persistent volume

- **산출물**: `docker-compose.yml`

- **Acceptance Criteria**: `docker compose up` 후 DB connection과 `uuidv7()` 호출이 성공한다.

- **테스트**: DB healthcheck, restart 후 데이터 유지

- **우선순위**: P0

- **난이도**: Low

- **병렬 가능**: Yes

## P1-05 — DB Migration 기반 + MVP 18개 테이블

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: 설계서 v0.1의 물리 모델을 실제 DB에 구현한다.

- **선행작업**: P1-02, P1-03, P1-04. Kysely migration runner를 이 Task에서 구성하고 P1-06은 런타임 client/repository를 구성한다.

- **구현 범위**: schema/pg_trgm, platform, brand, brand_alias, product_master, product_sku, product_identifier, source_product, source_sku, product_image, import_batch, import_item, identifier_resolve_run, identifier_candidate, thumbnail_recipe, thumbnail_job, thumbnail_review, automation_job, automation_run

- **산출물**: Kysely migrations 및 seed

- **Acceptance Criteria**: 빈 DB에서 18개 테이블 Migration이 성공한다. 구현 보완 명세 2장의 공개 UUID, 타입/NULL/default, FK/Unique/Check/Index와 관계 정합성을 metadata 및 negative test로 검증한다.

- **테스트**: migrate from zero, disposable DB에서 down/forward migration 검증, constraint negative test. 운영 rollback은 자동 down migration에 의존하지 않고 Backup/Forward-fix 절차로 다룬다.

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Partial

## P1-06 — Kysely DB Client / Repository 기반

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: API/Worker가 같은 DB 접근 규칙을 사용한다.

- **선행작업**: P1-05

- **구현 범위**: typed DB client, pool 설정, transaction helper, repository base pattern

- **산출물**: `packages/db`

- **Acceptance Criteria**: API와 Worker 양쪽에서 동일 패키지를 통해 DB query가 가능하다.

- **테스트**: connection lifecycle, transaction commit/rollback

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P1-07 — API Bootstrap / Liveness / Readiness

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: Fastify 기반 최소 API를 실행하고 프로세스 생존과 의존성 준비 상태를 구분한다.

- **선행작업**: P1-03, P1-06, P1-08, P1-13

- **구현 범위**: Fastify app, logger, error handler, `/health` liveness, `/ready` DB readiness, graceful shutdown

- **산출물**: `apps/api`

- **Acceptance Criteria**: `/health`는 프로세스가 정상일 때 외부 DB 장애와 무관하게 200을 반환하고, `/ready`는 DB 연결 가능 여부를 반영한다.

- **테스트**: API integration test, DB down/up readiness test, SIGTERM shutdown

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P1-08 — API Contract / TypeBox 기반

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: Admin과 API 계약을 단일 원천으로 관리한다.

- **선행작업**: P1-01

- **구현 범위**: 공통 request/response schema, 공통 error contract, publicId 규칙

- **산출물**: `packages/contracts`

- **Acceptance Criteria**: API schema와 TypeScript type이 같은 정의에서 생성/사용된다.

- **테스트**: invalid request 400, response schema test

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P1-09 — Queue Port + pg-boss Adapter

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: Queue 기술을 업무 코드에서 분리한다.

- **선행작업**: P1-03, P1-04

- **구현 범위**: `QueuePort`, pg-boss lifecycle, queue names, retry/backoff 기본값

- **산출물**: `packages/queue`

- **Acceptance Criteria**: `system.test` Job publish/consume가 가능하며 queue provider ID를 문자열로 기록할 수 있다.

- **테스트**: enqueue/consume/retry, restart recovery

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P1-10 — Worker Bootstrap / system.test

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: API와 분리된 Worker 프로세스를 검증한다.

- **선행작업**: P1-06, P1-09, P1-13

- **구현 범위**: Worker startup/shutdown, handler registry, `system.test`

- **산출물**: `apps/worker`

- **Acceptance Criteria**: Job 생성 → Worker 소비 → 성공 로그/상태 기록이 완료된다.

- **테스트**: Worker 미실행 후 재기동 시 처리, 실패 handler retry

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P1-11 — Admin React/Vite Skeleton

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: 이후 관리 기능을 붙일 수 있는 관리자 UI 기반을 만든다.

- **선행작업**: P1-01, P1-08

- **구현 범위**: routing, API client, layout, error/loading handling, Dashboard placeholder

- **산출물**: `apps/admin`

- **Acceptance Criteria**: 개발 서버에서 Admin 접근 및 `/health` 상태 표시가 가능하다.

- **테스트**: build, API error rendering

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P1-12 — ObjectStorage Port / Local Adapter

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: R2/S3에 종속되지 않는 저장 계층을 만든다.

- **선행작업**: P1-03

- **구현 범위**: put/delete/signedUrl 계약, Local adapter, object key 규칙

- **산출물**: `packages/storage`

- **Acceptance Criteria**: Worker가 provider 이름을 몰라도 파일 저장/조회가 가능하다.

- **테스트**: put/get/delete, path traversal 방지

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P1-13 — SecretProvider / Sensitive Data Redaction Baseline

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: Browser 자격증명과 외부 Provider Key를 기능 개발 전에 안전한 경계로 분리한다.

- **선행작업**: P1-03

- **구현 범위**: SecretProvider port, 개발용 EnvSecretProvider, secret key naming, Pino redaction rule, 오류 응답 masking

- **산출물**: `packages/core/security`의 secret contract + 개발 adapter

- **Acceptance Criteria**: 업무 코드가 `process.env`에서 자격증명을 직접 읽지 않고 SecretProvider를 사용하며, 지정 secret/token/cookie 값이 로그와 오류 응답에 평문으로 출력되지 않는다.

- **테스트**: secret lookup, missing secret, structured log redaction test

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P1-14 — Test Harness / CI Baseline

- **Epic**: Phase 1 — 실행 가능한 Skeleton / Platform Foundation

- **목표**: 이후 모든 Task의 Acceptance Criteria를 반복 실행 가능한 자동 검증으로 연결한다.

- **선행작업**: P1-01, P1-02

- **구현 범위**: unit/integration test runner, test DB lifecycle, lint/typecheck/test/build CI, dependency lockfile validation

- **산출물**: 공통 test config + CI workflow

- **Acceptance Criteria**: clean checkout에서 install → lint → typecheck → unit/integration → build가 자동 수행되고 실패 시 merge/release가 차단될 수 있다.

- **테스트**: 의도적 lint/type/test failure가 CI에서 각각 탐지된다.

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

### Phase 1 Gate

- P1-01~P1-14 각각의 Acceptance Criteria 검증 완료. 우선순위 P0만 완료하고 전체 Phase 1 PASS로 선언하지 않는다.

- 빈 환경에서 DB/API/Worker/Admin이 실행됨

- `/health` / `/ready` 역할 분리 검증

- `system.test` E2E 통과

- Secret/로그 redaction baseline 통과

- CI 또는 동일한 로컬 검증 파이프라인 통과

---

# 3. Phase 2 — Existing Product Importer

## P2-01 — 기존 수집 데이터 Discovery

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 실제 데이터 형식에 근거해 첫 Adapter 범위를 확정한다.

- **선행작업**: Phase 1 Gate

- **구현 범위**: 저장 위치, 파일/DB 형식, 샘플 20~100건, 옵션/이미지/품번 필드, 총 건수 확인

- **산출물**: Source Mapping Spec v0.1

- **Acceptance Criteria**: `SourceProductInput`으로 매핑 가능한 필드표가 작성된다.

- **테스트**: 샘플 데이터 20건 mapping dry-run

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P2-02 — SourceProductInput 표준 계약

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 수집처와 Core Importer를 분리한다.

- **선행작업**: P2-01

- **구현 범위**: Product/Option/Image/Identifier 입력 DTO 및 validation contract

- **산출물**: contracts/core types

- **Acceptance Criteria**: 첫 Adapter와 향후 CSV/XLSX/API Adapter가 같은 계약을 사용할 수 있다.

- **테스트**: valid/partial/invalid samples

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P2-03 — 첫 Import Adapter 구현

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 실제 기존 상품 데이터를 표준 입력으로 변환한다.

- **선행작업**: P2-02

- **구현 범위**: 실제 데이터 형식에 맞는 Legacy/CSV/XLSX/JSON 중 1개 Adapter 구현

- **산출물**: 첫 Source Adapter

- **Acceptance Criteria**: 샘플 데이터가 손실 없이 `SourceProductInput`으로 변환된다.

- **테스트**: fixture 기반 mapping test

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Partial

## P2-04 — Import Validation / Raw 보존

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 불완전한 상품도 수용하되 최소 식별성은 보장한다.

- **선행작업**: P2-02

- **구현 범위**: platformCode/externalProductId/productName 필수검증, raw JSON 보존

- **산출물**: InputValidator

- **Acceptance Criteria**: 브랜드/품번/가격/이미지 결측은 허용하고 필수값 결측만 명확히 실패한다.

- **테스트**: field matrix test

- **우선순위**: P0

- **난이도**: Low

- **병렬 가능**: Yes

## P2-05 — Brand Normalizer

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 브랜드 표기 변형을 하나의 BRAND로 연결한다.

- **선행작업**: P1-05

- **구현 범위**: normalize, brand_alias lookup, unresolved 처리, 수동 alias 확장 기반

- **산출물**: BrandNormalizer

- **Acceptance Criteria**: NIKE/Nike/나이키 같은 승인 Alias가 동일 brand_id로 매핑되고 불확실 브랜드를 자동 생성하지 않는다.

- **테스트**: alias exact/normalized/unknown

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P2-06 — Source Product Upsert

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 재 Import 멱등성을 보장한다.

- **선행작업**: P2-04

- **구현 범위**: `(platform_id, external_product_id)` upsert, last_seen, price/update fields

- **산출물**: SourceProductRepository

- **Acceptance Criteria**: 같은 원본을 반복 Import해도 source_product가 중복 생성되지 않는다.

- **테스트**: repeat import, changed price, changed title

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Partial

## P2-07 — Embedded Identifier Extractor

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 원본 데이터에 이미 있는 품번/바코드를 선제적으로 후보화한다.

- **선행작업**: P2-03

- **구현 범위**: 명시 필드와 raw JSON에서 identifier 후보 추출

- **산출물**: IdentifierExtractor

- **Acceptance Criteria**: 원본 필드가 있으면 출처와 함께 후보가 전달된다.

- **테스트**: nested raw JSON fixtures

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P2-08 — MASTER Matcher v1

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 기존 MASTER 연결과 신규 생성 여부를 안전하게 판단한다.

- **선행작업**: P2-05, P2-06, P2-07

- **구현 범위**: verified GTIN/model exact, brand+identifier, brand+name similarity, option metadata, hard conflict

- **산출물**: ProductMatcher

- **Acceptance Criteria**: 상품명 유사도만으로 자동확정하지 않고 conflict 시 review/new 경로로 빠진다.

- **테스트**: exact match, ambiguous match, conflicting identifier, similar-title different variant

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P2-09 — MASTER Creator / Race Control

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 병렬 Import 중 동일 MASTER 중복 생성을 최소화한다.

- **선행작업**: P2-08

- **구현 범위**: transaction, 강한 identifier 기반 `pg_advisory_xact_lock` 또는 동등한 DB lock, lock 획득 후 재조회, created_method 기록. 전역 Identifier UNIQUE에 의존하지 않는다.

- **산출물**: MasterService

- **Acceptance Criteria**: 동일한 verified/strong identifier 후보가 동시에 들어와도 lock 내부 재조회 후 하나의 MASTER로 수렴한다. 상품명 유사도만 있는 경우에는 무리한 자동 병합 대신 Review 경로를 사용한다.

- **테스트**: concurrent integration test, lock timeout/retry, identifier 없는 유사상품 동시 유입

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P2-10 — SKU Normalizer / Mapper

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: Source 옵션을 내부 SKU로 표준화한다.

- **선행작업**: P2-09

- **구현 범위**: option_json, deterministic option_key, source_sku mapping

- **산출물**: SkuMapper

- **Acceptance Criteria**: 동일 옵션은 재 Import 시 동일 SKU로 연결된다.

- **테스트**: 패션 size/color, 화장품 volume/shade fixtures

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Partial

## P2-11 — Product Image Registrar

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 썸네일 처리와 분리하여 원본 이미지 정보를 등록한다.

- **선행작업**: P2-03, P2-09

- **구현 범위**: SOURCE_MAIN/SOURCE_DETAIL 등록, source URL, metadata, 중복 식별

- **산출물**: ImageRegistrar

- **Acceptance Criteria**: Import 과정에서 이미지 생성은 하지 않고 원본 이미지 record만 안전하게 등록된다.

- **테스트**: repeated image import, missing image

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P2-12 — Import Batch / Item Tracking

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 대량 Import의 성공/실패/스킵을 추적한다.

- **선행작업**: P2-06

- **구현 범위**: import_batch, import_item, error code, aggregate counts

- **산출물**: ImportResultRecorder

- **Acceptance Criteria**: 단건 실패가 Batch 전체를 rollback하지 않고 정확한 결과 집계가 남는다.

- **테스트**: mixed success/failure batch

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P2-13 — Product Import Queue / Chunk Processor

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 대량 데이터를 안정적으로 비동기 처리한다.

- **선행작업**: P2-03~P2-12

- **구현 범위**: `product.import`, chunk 100 / concurrency 2를 **설정 가능한 초기 기본값**으로 사용, retry/idempotency, backpressure

- **산출물**: Import worker handler

- **Acceptance Criteria**: 대량 샘플을 chunk 처리하고 재실행해도 중복이 발생하지 않는다.

- **테스트**: 1k synthetic import, worker restart, partial failure

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P2-14 — Import 관리 UI/API

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: Batch와 실패 상품을 운영자가 확인할 수 있게 한다.

- **선행작업**: P2-12, P2-13

- **구현 범위**: Batch list/detail, 상태/건수, 실패 이유, 재실행 진입점

- **산출물**: Admin Import 화면 + API

- **Acceptance Criteria**: 운영자가 성공/실패/스킵 및 오류 원인을 확인할 수 있다.

- **테스트**: API pagination/filter, UI error state

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P2-15 — MASTER 상품관리 API / UI

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: 설계서의 중심 데이터인 PRODUCT_MASTER를 운영자가 조회·검수할 수 있게 한다.

- **선행작업**: P2-09, P2-10, P2-11, P1-08, P1-11

- **구현 범위**: MASTER 목록/상세, Source 연결정보, SKU, Identifier, 원본 이미지, match 상태, 안전한 기본정보 수정, pagination/filter

- **산출물**: Product API + Admin MASTER 상품관리 화면

- **Acceptance Criteria**: 하나의 MASTER에서 연결된 Source/SKU/Identifier/Image를 추적할 수 있고, 외부에는 public_id만 노출한다.

- **테스트**: pagination/filter, missing relation, concurrent edit conflict, public_id validation

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P2-16 — Brand Alias / Unresolved Brand Review

- **Epic**: Phase 2 — Existing Product Importer / MASTER

- **목표**: Brand Normalizer가 확정하지 못한 브랜드를 사람이 안전하게 표준 BRAND에 연결한다.

- **선행작업**: P2-05, P2-14

- **구현 범위**: `import_item.REVIEW_REQUIRED`와 `raw_brand_name`을 이용한 unresolved 목록, 기존 BRAND 연결, alias 승인/거절, 영향 Source 재처리

- **산출물**: Brand Review API/UI

- **Acceptance Criteria**: 불확실 브랜드가 자동 신규 BRAND로 생성되지 않고, 승인된 Alias만 이후 동일 표기를 자동 매핑한다.

- **테스트**: alias approve/reject, duplicate alias, source별 alias precedence

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

### Phase 2 Gate

- 실제 샘플 데이터 Import 성공

- 재 Import 멱등성 통과

- MASTER/SKU/Source 관계 검증

- 동시 Import Race Test 통과

- MASTER 상품관리에서 관계 추적 가능

- Raw JSON/이미지 원본 메타데이터 보존

- unresolved 브랜드가 자동 오염 없이 검수 경로로 분리됨

---

# 4. Phase 3 — Identifier Resolver

## P3-01 — Resolve Input / Run Model

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 품번 탐색 1회를 재현 가능하게 기록한다.

- **선행작업**: Phase 2 Gate

- **구현 범위**: resolve input snapshot, run status/version, candidate lifecycle

- **산출물**: Resolver orchestration base

- **Acceptance Criteria**: 동일 source_product에 대해 실행 이력과 입력 snapshot이 남는다.

- **테스트**: run create/success/fail

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P3-02 — Brand Pattern Registry

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 브랜드별 품번 형식을 후보 생성 규칙으로 관리한다.

- **선행작업**: P2-05

- **구현 범위**: pattern registry, type mapping, versioning

- **산출물**: IdentifierPattern registry

- **Acceptance Criteria**: Regex match가 후보만 생성하고 검증 없이 확정하지 않는다.

- **테스트**: positive/negative brand fixtures

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P3-03 — Raw / URL / Text Extractors

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 외부 검색 전에 내부 데이터에서 가능한 후보를 최대한 찾는다.

- **선행작업**: P3-01, P3-02

- **구현 범위**: raw field, URL path/query, title/option pattern extraction

- **산출물**: candidate extractors

- **Acceptance Criteria**: 후보에 발견 위치와 원문 근거가 기록된다.

- **테스트**: URL/raw/title fixture suite

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P3-04 — Internal Catalog Provider

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 이미 검증된 내부 MASTER를 가장 저렴한 Evidence로 사용한다.

- **선행작업**: P3-01

- **구현 범위**: identifier exact, brand/name/variant lookup

- **산출물**: InternalCatalogProvider

- **Acceptance Criteria**: 외부 검색 없이 기존 verified identifier를 우선 재사용한다.

- **테스트**: exact/ambiguous/internal miss

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P3-05 — External Candidate Provider Port + 첫 Provider

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 외부 후보 탐색을 Provider 종속 없이 확장한다.

- **선행작업**: P3-01

- **구현 범위**: provider interface, timeout/rate-limit/circuit-breaker, 첫 SearchEvidence provider. 공식 API/허용된 검색 수단을 우선하고 Provider 사용조건을 문서화

- **산출물**: provider adapter

- **Acceptance Criteria**: Provider 장애가 Resolver 전체 프로세스를 비정상 종료시키지 않는다.

- **테스트**: timeout, rate limit, malformed response

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P3-06 — Evidence Model / Collector

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 모든 판단 근거를 구조적으로 보존한다.

- **선행작업**: P3-03~P3-05

- **구현 범위**: evidence types, source, weight, metadata, provenance

- **산출물**: EvidenceCollector

- **Acceptance Criteria**: 후보마다 왜 나왔는지 추적 가능한 Evidence가 저장된다.

- **테스트**: evidence merge/provenance

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Partial

## P3-07 — Candidate Normalizer / Deduplicator

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 표기 차이가 같은 품번을 중복 후보로 만들지 않는다.

- **선행작업**: P3-06

- **구현 범위**: type-specific normalization, same-value merge

- **산출물**: CandidateNormalizer

- **Acceptance Criteria**: `DD1391-100`, `DD1391100` 등 규칙상 동일한 값이 하나의 후보로 합쳐진다.

- **테스트**: normalization matrix

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P3-08 — Candidate Scorer

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: Evidence를 정규화된 신뢰도 점수로 계산한다.

- **선행작업**: P3-06, P3-07

- **구현 범위**: weight rules, Strong Evidence flag, scorer version

- **산출물**: CandidateScorer

- **Acceptance Criteria**: 같은 입력은 같은 scorer version에서 동일 점수를 낸다.

- **테스트**: golden score fixtures

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P3-09 — Hard Conflict Detector

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 높은 점수라도 치명적 충돌이 있으면 자동승인하지 않는다.

- **선행작업**: P3-07

- **구현 범위**: brand/GTIN/model/variant/volume/color conflicts

- **산출물**: ConflictDetector

- **Acceptance Criteria**: Hard Conflict가 하나라도 있으면 AUTO_ACCEPTED가 불가능하다.

- **테스트**: each conflict code + combinations

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P3-10 — Decision Engine

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 후보를 Auto/Review/Candidate/Not Found로 결정한다.

- **선행작업**: P3-08, P3-09

- **구현 범위**: 95+ strong evidence/no conflict, 80~94 review, 60~79 candidate, <60 not found

- **산출물**: DecisionEngine

- **Acceptance Criteria**: 점수만 높고 Strong Evidence가 없는 후보는 자동승인되지 않는다.

- **테스트**: boundary tests 59/60/79/80/94/95/100

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P3-11 — PRODUCT_IDENTIFIER 승격 / Audit

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 확정 후보만 Master identifier로 반영한다.

- **선행작업**: P3-10

- **구현 범위**: identifier insert/update, primary policy, verified/confidence/evidence link

- **산출물**: IdentifierPromotionService

- **Acceptance Criteria**: 승인되지 않은 후보가 product_identifier에 확정값으로 들어가지 않는다.

- **테스트**: auto/manual promotion, duplicate identifier

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P3-12 — Batch Resolver / Rate Limit

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 미확인 상품을 대량 탐색하면서 외부 Provider를 보호한다.

- **선행작업**: P3-10

- **구현 범위**: `identifier.resolve`, chunk enqueue, concurrency 4를 설정 가능한 초기값으로 사용, provider throttling, cost/rate guard

- **산출물**: Resolver worker handler

- **Acceptance Criteria**: Batch 실행이 Provider 제한을 넘지 않고 개별 실패를 격리한다.

- **테스트**: throttling, retry, partial failures

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P3-13 — 품번 검수 UI/API

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 사람이 후보 근거를 보고 승인/거절/직접입력할 수 있게 한다.

- **선행작업**: P3-06, P3-10, P3-11, P1-11

- **구현 범위**: candidate list/detail, evidence/conflict 표시, accept/reject/manual/re-resolve

- **산출물**: Identifier Review UI/API

- **Acceptance Criteria**: 수동 판단도 MANUAL_REVIEW Evidence로 기록되며, 직접입력 값도 normalize/중복/Hard Conflict 검사를 통과해야 PRODUCT_IDENTIFIER로 승격된다.

- **테스트**: permission, race condition, already-decided candidate

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P3-14 — Resolver Golden Dataset / Auto-Accept Calibration

- **Epic**: Phase 3 — Identifier Resolver

- **목표**: 자동승인 임계값을 추측으로 운영하지 않고 실제 상품 데이터로 검증한다.

- **선행작업**: P3-10, P3-11, P3-13

- **구현 범위**: 대표 브랜드/카테고리 labeled set, scorer/decision 결과 측정, false positive 분석, auto-accept feature flag

- **산출물**: Resolver Evaluation Report + threshold/config

- **Acceptance Criteria**: 보완 명세 5장의 평가셋 분리·최소 표본·오매칭 기준과 보고 필드를 충족한다. 미달/미평가 시 AUTO_ACCEPT=false를 유지한다. OFF 상태를 평가 PASS로 대체하지 않는다. 활성화 범위·버전·운영 책임자 결정을 기록한다.

- **테스트**: golden dataset regression test, scorer version 변경 시 재평가

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

### Phase 3 Gate

- 품번 미확인 상품 Batch Resolve 가능

- Evidence/Conflict/Score 보존

- 임의 품번 생성 금지 검증

- 자동승인과 검수대기 경계 테스트 통과

- Golden Dataset Regression 통과

- Calibration은 실제 실행 결과로 판정하고, 기준 미달/미평가 시 AUTO_ACCEPT=false 유지. OFF 설정만으로 Calibration PASS 처리 금지

---

# 5. Phase 4 — Thumbnail Engine + QA

## Phase 목표

> 원본 제품의 정체성을 보존하면서 사람·소품·배경을 제거하고, 받침대 없는 미니멀 프리미엄 스튜디오형 1:1 대표이미지를 생성한다.

MVP 자동승인 원칙은 보수적으로 잡는다.

```
SAFE_COMPOSITE + 원본 제품 픽셀 보존 + QA 통과
→ AUTO_APPROVED 가능

AI_EDIT
→ 기본 REVIEW_REQUIRED

AI_RECONSTRUCT
→ AUTO_APPROVED 금지
```

## P4-01 — AI Image Edit Provider 선정 Spike

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 사람/소품 제거 및 편집 품질과 비용을 비교해 MVP Provider를 하나 선정한다.

- **선행작업**: Phase 2 Gate 또는 독립 샘플 이미지 세트 확보

- **구현 범위**: 동일 샘플 세트로 제품보존/처리시간/단가/실패율/Rate Limit/상업적 사용조건 비교

- **산출물**: Provider Evaluation Note + 선택 Adapter 요구사항

- **Acceptance Criteria**: Provider 선택 근거, 월 비용 추정식, Rate Limit, 실패/Fallback 정책이 문서화된다.

- **테스트**: 사람/손/복잡배경/텍스트 라벨/투명·반사 제품 등 대표 샘플 비교

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P4-02 — Thumbnail Recipe / Policy Engine

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: `THUMBNAIL_PREMIUM_STUDIO_V1`을 코드/DB로 버전 관리한다.

- **선행작업**: P1-05

- **구현 범위**: 1000x1000, 1:1, sRGB, 제품 보존, 사람/소품 제거, **받침대/장식 구조물 금지**, 자연스러운 접지 그림자, 절제된 반사광 정책

- **산출물**: Recipe registry + seed

- **Acceptance Criteria**: 모든 Job에서 사용 recipe/version/hash를 추적할 수 있고 동일 recipe는 deterministic hash를 가진다.

- **테스트**: recipe lookup/versioning/hash regression

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P4-03 — Safe Image Fetch / Immutable Source Preservation

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 외부 이미지 URL 공격을 차단하고 썸네일 생성에 사용한 원본 바이트를 재현 가능하게 보존한다.

- **선행작업**: P1-12

- **구현 범위**: http/https 제한, DNS/IP 재검증, private/loopback 차단, redirect 재검증, MIME/size/pixel 제한, 최초 성공 fetch를 immutable source object로 저장, content hash 기록

- **산출물**: SafeImageFetcher + source preservation flow

- **Acceptance Criteria**: 내부망/비이미지/과대 파일이 차단되고, 성공 처리한 source image는 이후 원격 URL이 사라져도 동일 바이트를 다시 읽을 수 있다.

- **테스트**: SSRF suite, redirect attack, decompression bomb/pixel limit, remote URL 삭제 후 재처리

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P4-04 — Source Image Selector / Image Analyzer / Path Selector

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 여러 원본 중 대표이미지 후보를 선택하고 SAFE_COMPOSITE / AI_EDIT / AI_RECONSTRUCT 경로를 판정한다.

- **선행작업**: P4-02, P4-03

- **구현 범위**: productCount, human/body part, occlusion, props, crop risk, label/logo visibility, background complexity, source image ranking

- **산출물**: ImageSourceSelector + ImageAnalyzer + PathSelector

- **Acceptance Criteria**: 동일 입력/분석 버전에서 동일 source와 processing path가 선택되고 선택 근거가 result_json에 기록된다.

- **테스트**: labeled fixture set, multiple-source ranking, no-usable-source case

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P4-05 — Product Mask / Segmentation + Mask QA

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: SAFE_COMPOSITE와 제품 픽셀 재합성을 가능하게 하는 정확한 제품 Mask를 만든다.

- **선행작업**: P4-03, P4-04

- **구현 범위**: product segmentation/matting adapter, alpha mask, edge feather 최소화, mask confidence, 로고/라벨/제품 외곽 보존 검사

- **산출물**: ProductMaskService

- **Acceptance Criteria**: Mask confidence가 기준 미달이거나 제품 일부를 절단할 위험이 있으면 SAFE_COMPOSITE 자동승인 경로를 사용하지 않고 AI_EDIT 또는 REVIEW로 보낸다.

- **테스트**: 밝은/어두운/투명/반사/복잡 경계 제품 mask golden set

- **우선순위**: P0

- **난이도**: Very High

- **병렬 가능**: Partial

## P4-06 — SAFE_COMPOSITE Renderer

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 생성형 모델이 제품 자체를 다시 그리지 않도록 원본 제품 픽셀을 합성해 기본 썸네일을 만든다.

- **선행작업**: P4-02, P4-05

- **구현 범위**: original product pixels composite, clean studio background, contain/center, natural contact shadow, sRGB, resize/output normalization

- **산출물**: Sharp/libvips 기반 SafeCompositeRenderer

- **Acceptance Criteria**: 제품 영역은 원본 픽셀에서 유래하며 제품이 잘리지 않고 비율이 유지된 1000x1000 결과가 생성된다. 장식 받침대/구조물을 생성하지 않는다.

- **테스트**: product-region pixel comparison, geometry/aspect, color profile, no-crop, shadow boundary

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P4-07 — AI Edit Adapter

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 사람/소품/복잡한 배경 제거가 필요한 이미지를 생성형 편집으로 처리하되 제품 핵심 영역을 최대한 원본으로 보존한다.

- **선행작업**: P4-01, P4-04, P4-05, P1-13

- **구현 범위**: 공식 Prompt, provider adapter, mask-guided edit, timeout/retry/rate/cost guard, 가능하면 편집 후 원본 제품 픽셀 재합성

- **산출물**: AiImageEditor port + implementation

- **Acceptance Criteria**: 제품 핵심 영역을 수정하지 않는 mask 정책이 적용되고, Provider 호출비용/실패/모델버전이 기록된다. AI_EDIT 결과는 MVP 기본값으로 REVIEW_REQUIRED다.

- **테스트**: human/hand/prop/background cases, provider timeout/rate-limit, cost metadata

- **우선순위**: P0

- **난이도**: Very High

- **병렬 가능**: Partial

## P4-08 — Alternate Source Resolver / AI_RECONSTRUCT

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 제품이 가려진 경우 임의 생성보다 검증된 동일 상품 원본을 우선 사용한다.

- **선행작업**: P4-04, P4-07, Phase 3에서 verified identifier가 있으면 우선 활용

- **구현 범위**: 동일 source_product의 다른 이미지 → 같은 verified MASTER/Identifier의 alternate image 순으로 탐색, 부족 시 reconstruct flag/provenance 저장

- **산출물**: AlternateSourceResolver + reconstruction flow

- **Acceptance Criteria**: 다른 상품 이미지가 복원 근거로 섞이지 않으며, 생성형 복원이 개입한 결과는 항상 `AI_RECONSTRUCT`로 식별되고 자동승인되지 않는다.

- **테스트**: verified alternate source present/absent, similar-product rejection, label-covered case

- **우선순위**: P0

- **난이도**: Very High

- **병렬 가능**: No

## P4-09 — Thumbnail QA Engine

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 생성 결과의 제품 변형과 잔존 요소를 다층 검사한다.

- **선행작업**: P4-05, P4-06, P4-07, P4-08

- **구현 범위**: 제품수, human/body/prop 잔존, crop/aspect, product-region visual similarity, 주요 색상, OCR 가능한 라벨/용량 텍스트, logo/label visibility, centering, over-reflection checks

- **산출물**: QA result + standard issue codes + confidence

- **Acceptance Criteria**: `MULTI_PRODUCT`, `HUMAN_REMAINS`, `PRODUCT_CROPPED`, `PRODUCT_DISTORTED`, `TEXT_CHANGED`, `LOGO_CHANGED`, `AI_RECONSTRUCTION_RISK` 등 필수 실패코드가 표준화되고 불확실 검사는 Review로 승격된다.

- **테스트**: intentionally corrupted images, human-remains set, color/text/crop golden cases

- **우선순위**: P0

- **난이도**: Very High

- **병렬 가능**: Partial

## P4-10 — Review Policy / Thumbnail Review Record

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 자동승인·검수대기·재생성·실패 경계를 보수적으로 고정한다.

- **선행작업**: P4-08, P4-09

- **구현 범위**: AUTO_APPROVED/REVIEW_REQUIRED/REGENERATE/FAILED policy, reviewer record

- **산출물**: ThumbnailDecisionService

- **Acceptance Criteria**: `SAFE_COMPOSITE + 원본 제품 픽셀 보존 + 핵심 QA 통과`만 자동승인 후보가 될 수 있다. AI_EDIT는 MVP 기본 Review, AI_RECONSTRUCT 및 제품 텍스트/로고 변경 의심 결과는 자동승인 불가다.

- **테스트**: policy boundary/gating cases

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P4-11 — Thumbnail Storage / Object Key / Idempotency

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 원본을 덮어쓰지 않고 동일 작업의 무의미한 중복 생성을 막는다.

- **선행작업**: P1-12, P4-02, P4-03

- **구현 범위**: 보완 명세 2.2/4장의 source content hash + recipe/processing/mask/QA/provider-model 버전 + generation revision 기반 hash, request_key, immutable object key, 생성 결과 UNIQUE를 적용한다.

- **산출물**: thumbnail persistence layer

- **Acceptance Criteria**: Worker retry/중복 enqueue가 같은 logical output을 무한 생성하지 않고 원본 객체를 절대 overwrite하지 않는다.

- **테스트**: duplicate job, recipe/model version change, retry-after-store-crash

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P4-12 — Thumbnail Queue Worker

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 이미지 작업을 API와 분리해 비동기로 실행한다.

- **선행작업**: P4-04~P4-11

- **구현 범위**: `thumbnail.generate`, concurrency 2를 설정 가능한 기본값으로 사용, status/retry/dead-letter 성격의 failed 상태, idempotency

- **산출물**: Thumbnail worker handler

- **Acceptance Criteria**: Batch 요청이 API 응답을 막지 않고 Worker에서 처리되며 재시작 후에도 중복 생성 없이 계속 처리된다.

- **테스트**: retry, worker restart, duplicate job, provider partial failure

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P4-13 — Thumbnail 관리 UI/API

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 원본/생성본/QA를 비교하고 승인/거절/재생성할 수 있게 한다.

- **선행작업**: P4-10, P4-12

- **구현 범위**: list/detail, side-by-side, processing path/model/recipe 표시, issue/evidence, approve/reject/regenerate

- **산출물**: Thumbnail Admin

- **Acceptance Criteria**: 운영자가 SAFE_COMPOSITE/AI_EDIT/AI_RECONSTRUCT를 구분하고 어떤 제품 영역이 생성형 처리됐는지 확인할 수 있다.

- **테스트**: state transition, duplicate review, regenerate with new recipe

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P4-14 — Channel Compliance Validator 기본 Port

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 디자인 Recipe와 판매채널 업로드 규칙을 분리한다.

- **선행작업**: P4-02

- **구현 범위**: dimension/format/filesize validation port, generic validator, 쿠팡/네이버 adapter extension point

- **산출물**: ChannelComplianceValidator

- **Acceptance Criteria**: 내부 저장 포맷과 채널 업로드 변환/정책 경고가 분리되어 있고 채널 규칙 변경이 Recipe를 수정하지 않는다.

- **테스트**: format/dimension/filesize/policy-warning cases

- **우선순위**: P2

- **난이도**: Medium

- **병렬 가능**: Yes

## P4-15 — Thumbnail Golden Set / QA Calibration

- **Epic**: Phase 4 — Thumbnail Engine + QA

- **목표**: 자동 QA와 자동승인 정책을 실제 제품군에서 검증한다.

- **선행작업**: P4-09, P4-10

- **구현 범위**: 패션/뷰티 대표 이미지 labeled set, mask/QA/decision 결과 측정, false pass/false review 분석, threshold/config

- **산출물**: Thumbnail Evaluation Report + regression fixture

- **Acceptance Criteria**: 보완 명세 5장의 holdout·표본·false-pass 0건 기준으로 SAFE_COMPOSITE 경로를 평가한다. 미평가/표본 부족/실패 제품군은 AUTO_APPROVE=false다. AI_EDIT 기본 Review 및 AI_RECONSTRUCT 자동승인 금지를 검증한다.

- **테스트**: golden-set regression, recipe/provider/model 버전 변경 시 재평가

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

### Phase 4 Gate

- 공식 `THUMBNAIL_PREMIUM_STUDIO_V1` 적용 및 받침대/장식 구조물 미생성

- 원본 이미지 바이트 보존

- SAFE_COMPOSITE가 제품 Mask와 원본 픽셀 재합성 기반으로 동작

- AI_EDIT 결과가 기본 검수 경로로 분리

- AI_RECONSTRUCT 자동승인 금지

- QA Golden Set Regression 통과

- 원본 보존 / 중복생성 방지 / 재처리 가능

---

# 6. Phase 5 — Browser Scheduler / Automation

## P5-01 — 실제 Browser Flow Discovery

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 첫 자동화 대상의 실제 화면/단계/성공조건을 확정한다.

- **선행작업**: Phase 1 Gate

- **구현 범위**: 대상 URL, 로그인/2FA, 메뉴 경로, 입력값, 완료 신호, 실패 모달, 실행 빈도

- **산출물**: Browser Flow Spec v0.1

- **Acceptance Criteria**: prepare/authenticate/execute/verify/cleanup 단계로 명확히 기술된다.

- **테스트**: 수동 walkthrough

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P5-02 — Browser Manager

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: Playwright 실행환경을 Worker 전용으로 캡슐화한다.

- **선행작업**: P1-10

- **구현 범위**: Chromium lifecycle, headless/headed, timeout, graceful cleanup

- **산출물**: `packages/browser`

- **Acceptance Criteria**: API 패키지에는 Playwright 의존성이 포함되지 않는다.

- **테스트**: launch/close/crash cleanup

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P5-03 — Browser Profile / Session Manager

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 로그인 세션을 안전하게 재사용한다.

- **선행작업**: P5-02, P1-13

- **구현 범위**: profile directory, OS permission, session reuse, expiry detection, profile path isolation, secret/token log redaction

- **산출물**: SessionManager

- **Acceptance Criteria**: Cookie/token을 업무 DB에 평문 저장하지 않고 프로필 기반 재사용이 가능하다.

- **테스트**: valid/expired profile

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Partial

## P5-04 — Auth Strategy

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 수동 bootstrap과 ID/PW 재로그인을 Flow에서 분리한다.

- **선행작업**: P5-03, P1-13

- **구현 범위**: CookieSessionAuth, ManualBootstrapAuth, 선택적으로 IdPasswordAuth. ID/PW/OTP seed 등 비밀값은 SecretProvider를 통해서만 접근

- **산출물**: AuthStrategy port

- **Acceptance Criteria**: 인증 실패가 일반 UI 오류와 다른 표준 코드로 처리된다.

- **테스트**: login/session expiry cases

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P5-05 — Flow Registry / Lifecycle

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: DB에서 임의 코드를 실행하지 않고 등록 Flow만 실행한다.

- **선행작업**: P5-02

- **구현 범위**: handler_key registry, prepare/authenticate/execute/verify/cleanup contract

- **산출물**: FlowRunner

- **Acceptance Criteria**: 등록되지 않은 handler_key는 실행 거부된다.

- **테스트**: registered/unregistered flow

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P5-06 — Demo Flow / Test Harness

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 실제 사이트 자동화 전 Framework 자체를 검증한다.

- **선행작업**: P5-05, P5-09, P5-10. 초기 mock artifact 실험은 가능하나 전체 검증 전 PASS 금지

- **구현 범위**: deterministic demo page/flow, success/failure paths

- **산출물**: demo BrowserFlow

- **Acceptance Criteria**: Job → Flow → verify → artifact → status 전체 경로가 재현된다.

- **테스트**: browser integration test

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P5-07 — Automation Scheduler / Reconciliation

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: automation_job과 pg-boss schedule을 일치시킨다.

- **선행작업**: P1-09, P5-05

- **구현 범위**: cron/timezone, worker-start reconciliation, enable/disable/update

- **산출물**: SchedulerService

- **Acceptance Criteria**: Worker 재시작 후 활성 Job schedule이 자동 복구된다.

- **테스트**: restart/update/disable schedule

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P5-08 — Profile Lock / Duplicate Run Guard

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 같은 계정/프로필의 동시 자동화를 방지한다.

- **선행작업**: P5-03, P5-07

- **구현 범위**: same profile concurrency 1, request_key 중복 방어, 실행 전체를 포괄하는 전용 DB 연결 session advisory lock. 연결 손실 시 Browser 중단, TTL만으로 실행 중인 lock 강제 회수 금지

- **산출물**: RunLock service

- **Acceptance Criteria**: 여러 Worker에서 동일 profile의 실행이 겹치지 않는다. crash 시 연결 해제로 lock이 풀리며 재실행 전 외부 완료 상태를 확인한다. 불명확한 부작용은 SIDE_EFFECT_UNKNOWN으로 사용자 확인 경로에 둔다.

- **테스트**: concurrent enqueue / multi-process lock / worker crash / stale lock recovery

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

## P5-09 — Retry / Timeout / Error Taxonomy

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 오류 종류에 따라 재시도 여부를 통제한다.

- **선행작업**: P5-05

- **구현 범위**: network/timeout/browser crash vs auth/captcha/2FA/logic error

- **산출물**: BrowserErrorMapper + RetryPolicy

- **Acceptance Criteria**: AUTH_FAILED/CAPTCHA/TWO_FACTOR는 자동 재시도하지 않는다.

- **테스트**: each error code policy

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P5-10 — Screenshot / Trace / Result Artifact

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 실패 원인을 재현 가능하게 남긴다.

- **선행작업**: P5-02, P1-12, P1-13, P6-01의 인증/접근제어 기반. P6-01은 번호와 무관하게 이 시점에 선행 구현 가능

- **구현 범위**: start/failure/final screenshots, trace.zip, result.json, standard object keys, private object 기본값, signed preview, 민감 Header/Secret masking, retention metadata

- **산출물**: BrowserArtifactService

- **Acceptance Criteria**: 실패 Run에서 최소 failure screenshot, URL, step, error code를 권한 있는 관리자만 조회할 수 있고 secret/cookie 값이 result/log에 평문으로 남지 않는다.

- **테스트**: artifact upload failure, signed URL expiry, secret masking, unauthorized access

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P5-11 — CAPTCHA / 2FA Safe Stop

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 보안 Challenge를 우회하지 않고 안전하게 중단한다.

- **선행작업**: P5-04, P5-09

- **구현 범위**: detection hooks, `CAPTCHA_DETECTED`, `TWO_FACTOR_REQUIRED`, manual action status

- **산출물**: SecurityChallenge handler

- **Acceptance Criteria**: challenge 감지 시 작업이 즉시 중단되고 자동 우회하지 않는다.

- **테스트**: simulated challenge pages

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P5-12 — 첫 실제 BrowserFlow 구현

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 요구사항 3의 실제 대상 사이트에서 업무 자동화를 수행한다.

- **선행작업**: P5-01~P5-11, P1-13

- **구현 범위**: 실제 handler_key, 로그인 확인, 메뉴 이동, 실행, verify, cleanup, 입력값 allowlist/validation

- **산출물**: 첫 production BrowserFlow

- **Acceptance Criteria**: 수동 실행과 cron 실행 모두에서 성공조건을 verify하고 이력을 남긴다.

- **테스트**: staging/실계정 제한 테스트, UI 변화 실패 시 trace 확인

- **우선순위**: P0

- **난이도**: Very High

- **병렬 가능**: No

## P5-13 — Automation 관리 UI/API

- **Epic**: Phase 5 — Browser Scheduler / Automation

- **목표**: 스케줄/수동실행/이력을 관리자에서 운영한다.

- **선행작업**: P5-07, P5-10, P5-12

- **구현 범위**: job list/edit, next run, run now, run history/detail, current/final step, retry history, screenshot/trace link

- **산출물**: Automation Admin

- **Acceptance Criteria**: 운영자가 코드 수정 없이 Job enable/disable 및 실행이력 확인이 가능하되, UI에서 임의 handler/script/JavaScript/Shell 코드를 등록할 수 없다.

- **테스트**: duplicate run, disabled job, manual run

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

### Phase 5 Gate

- Cron / 수동 실행 모두 성공

- 동일 profile 동시 실행 방지

- verify 기반 성공 판정

- 실패 artifact 보존

- CAPTCHA/2FA 안전 중단

---

# 7. Phase 6 — 운영 안정화 / E2E / Backup / Release

## P6-01 — 관리자 인증 / Web Security 최소구현

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 공개 인터넷에서 관리자 기능을 보호한다.

- **선행작업**: P1-11, P1-13

- **구현 범위**: Caddy HTTPS/basic_auth, 단일 관리자 권한, proxy가 보증하는 감사 actor, 업무 API/Admin/Artifact 일괄 보호, 직접 API 접근 차단, same-origin 및 CSRF 검증. MVP에 별도 사용자/세션/RBAC 테이블을 추가하지 않는다.

- **산출물**: Admin auth + web security config

- **Acceptance Criteria**: 보완 명세 3장의 인증 경계를 적용한다. 미인증 업무 API/Artifact는 401, 위조 actor·cross-origin 변경 요청은 차단, 인증 정상 요청은 성공한다. 애플리케이션 쿠키 미사용 항목은 해당 없음과 근거를 기록한다.

- **테스트**: 인증 우회, 직접 API 접근, 위조 proxy actor, Origin/CSRF/CORS negative cases, 자격증명 교체, 이미지/Trace 접근제어

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P6-02 — Secret / Browser Profile 운영 Hardening

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: Phase 1의 Secret baseline을 운영환경 수준으로 강화한다.

- **선행작업**: P1-13, P5-03

- **구현 범위**: production secret injection, least privilege file permissions, profile directory isolation, log/trace masking, backup exclusion, rotation runbook

- **산출물**: production secret/profile policy + config

- **Acceptance Criteria**: DB/R2/Provider/browser credential 및 cookie가 이미지/로그/backup에 평문으로 노출되지 않고 운영 서버에서 최소권한으로만 읽힌다.

- **테스트**: secret leak scan, permission negative test, rotated secret smoke test

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P6-03 — Observability / 운영 Dashboard

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 장애를 DB 직접조회 없이 식별한다.

- **선행작업**: Phase 2~5 핵심 기능

- **구현 범위**: structured logs, correlation/import/resolve/thumbnail/run IDs, success/failure counters, queue lag, provider error/cost counters, Dashboard(MASTER/Source/미매칭/품번미확인/검수대기/썸네일대기/오늘 Automation 성공·실패)

- **산출물**: logging/metrics baseline + 운영 Dashboard

- **Acceptance Criteria**: Import/Resolver/Thumbnail/Automation 실패를 하나의 ID로 API→Queue→Worker까지 추적할 수 있다.

- **테스트**: correlation propagation, provider failure metrics, queue lag simulation

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P6-04 — Production R2 ObjectStorage Adapter

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: Local Storage 구현을 운영용 Object Storage로 교체 가능하게 한다.

- **선행작업**: P1-12, P1-13

- **구현 범위**: R2 S3-compatible adapter, private bucket 기본값, put/get/delete/signed URL, content-type/hash metadata, retry

- **산출물**: R2StorageAdapter

- **Acceptance Criteria**: Core/Worker 코드를 바꾸지 않고 Local↔R2 adapter를 환경설정으로 교체하고 private object를 signed URL로 제한 조회할 수 있다.

- **테스트**: adapter contract test, retry, signed URL expiry, wrong credential

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P6-05 — Data Retention / Artifact Cleanup

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 이미지/Browser Trace/실패 Artifact가 무기한 쌓여 비용·보안 리스크가 커지는 것을 막는다.

- **선행작업**: P6-04, P5-10

- **구현 범위**: artifact 유형별 retention, source original/승인 thumbnail 보존 정책, trace/screenshot cleanup, legal/운영상 hold 예외

- **산출물**: retention policy + scheduled cleanup job

- **Acceptance Criteria**: 원본/승인 결과는 정책에 따라 보존되고 임시 trace/screenshot은 설정 기간 이후 삭제되며 삭제 이력이 남는다.

- **테스트**: expired/non-expired/hold object cleanup

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P6-06 — DB Backup 자동화

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 서버 장애 시 핵심 데이터를 복구할 수 있다.

- **선행작업**: P1-05, P6-02, P6-04

- **구현 범위**: scheduled backup, retention, off-server storage, encryption, failure detection

- **산출물**: backup job + runbook

- **Acceptance Criteria**: 최신 Backup artifact가 자동 생성·암호화되어 서버 외부 저장소에 보관되고 실패가 탐지된다.

- **테스트**: backup creation/integrity, wrong credential/failure alert

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: Yes

## P6-07 — Restore Drill

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 백업이 실제로 복구 가능한지 검증한다.

- **선행작업**: P6-06

- **구현 범위**: clean DB restore, migration/version compatibility, sample relation checks

- **산출물**: Restore Test 절차 및 결과

- **Acceptance Criteria**: 별도 DB로 복구 후 주요 레코드 수·FK·샘플 hash를 검증한다. 초기 RPO 24시간/RTO 4시간 목표와 실제 측정값을 비교하고 미달은 기록한다.

- **테스트**: full restore drill + checksum/sample count

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P6-08 — 핵심 E2E Test Suite

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: MVP 주요 업무 흐름을 배포 전 자동 검증한다.

- **선행작업**: Phase 2~5 Gate

- **구현 범위**: Import→MASTER, Resolve→Review/Accept, Thumbnail→QA, Automation demo flow. 외부 AI/Search Provider는 deterministic mock을 기본으로 하고 별도 limited live smoke를 둔다.

- **산출물**: E2E suite

- **Acceptance Criteria**: 주요 정상경로와 대표 실패경로가 CI/local에서 반복 재현되고 외부 Provider 일시 장애가 CI를 무작위로 깨뜨리지 않는다.

- **테스트**: clean DB E2E, mocked provider failure, one controlled live smoke

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P6-09 — 성능 / 부하 Baseline

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 4 vCPU / 8GB 초기값에서 안전한 concurrency를 실측한다.

- **선행작업**: P6-08

- **구현 범위**: 1k+ Import, Resolver batch, Thumbnail concurrency, Browser 1 concurrency, DB pool/queue lag/memory

- **산출물**: performance baseline + tuned config

- **Acceptance Criteria**: 보완 명세 6.2의 부하·기간·p95/오류율/OOM 기준을 측정하고 환경·mock/live 구분·비용·최대 메모리·queue 지연을 보고한다. 기준 미달 시 동시성 조정 후 재검증한다.

- **테스트**: load scenarios + soak test

- **우선순위**: P1

- **난이도**: High

- **병렬 가능**: Yes

## P6-10 — Production Docker / Reverse Proxy / HTTPS

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 단일 Linux VM에 안전하게 배포한다.

- **선행작업**: P1 Gate, P6-01, P6-02, P6-04, P6-06

- **구현 범위**: Admin static serving, API, Worker, PostgreSQL private network, Caddy HTTPS, health/readiness, restart policy, resource limits

- **산출물**: prod compose + proxy config

- **Acceptance Criteria**: 외부에는 필요한 80/443만 노출되고 DB/Worker/내부 service port는 공개되지 않으며 `/ready` 기준으로 배포 상태를 판정한다.

- **테스트**: port scan, TLS, container restart, DB isolation, health/readiness

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: Yes

## P6-11 — Release / Migration 절차

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 운영 배포에서 Migration과 프로세스 업데이트를 안전하게 수행한다.

- **선행작업**: P6-07, P6-08, P6-10

- **구현 범위**: backup → migrate → deploy → liveness/readiness → worker verification → smoke test → rollback/forward-fix decision

- **산출물**: Release Checklist

- **Acceptance Criteria**: API/Worker 시작 시 자동 migration을 하지 않고 배포 절차에서 1회 실행하며 실패 시 데이터 복구 또는 forward-fix 판단 절차가 명확하다.

- **테스트**: staging release rehearsal, failed migration scenario

- **우선순위**: P0

- **난이도**: Medium

- **병렬 가능**: No

## P6-12 — 운영 Runbook

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 장애 발생 시 개발자의 기억에 의존하지 않는다.

- **선행작업**: P6-03~P6-11

- **구현 범위**: Import 실패, Resolver Provider 장애, Thumbnail Provider/QA 실패, Session 만료, CAPTCHA/2FA, R2 장애, DB restore, Worker restart

- **산출물**: Operations Runbook

- **Acceptance Criteria**: 주요 장애별 탐지 신호·확인 위치·안전한 복구 순서·에스컬레이션 조건이 문서화된다.

- **테스트**: tabletop incident walkthrough

- **우선순위**: P1

- **난이도**: Medium

- **병렬 가능**: Yes

## P6-13 — MVP UAT / Definition of Done 검수

- **Epic**: Phase 6 — 운영 안정화 / Release

- **목표**: 설계서의 MVP DoD를 실제 기능으로 최종 검증한다.

- **선행작업**: P6-01~P6-12

- **구현 범위**: 상품/품번/썸네일/자동화/보안/백업/배포 체크리스트

- **산출물**: UAT 결과 및 Release 승인 기록

- **Acceptance Criteria**: 설계서 v0.1의 MVP Definition of Done 전 항목이 Pass 또는 `owner/reason/risk/expiry`가 있는 명시적 Waiver 상태다.

- **테스트**: end-user scenario walkthrough

- **우선순위**: P0

- **난이도**: High

- **병렬 가능**: No

### Phase 6 Gate — MVP Release

```
상품 Import/MASTER/SKU          PASS
MASTER/Brand 운영 UI            PASS
품번 Evidence Resolver          PASS
Resolver Calibration            PASS
썸네일 Premium Recipe/QA       PASS
Thumbnail Calibration           PASS
Browser Scheduler               PASS
Admin Auth/Security             PASS
R2/Retention                    PASS
Backup/Restore                  PASS
핵심 E2E                       PASS
Production Deploy              PASS
```

---

# 8. 병렬 개발 권장 묶음

## Track A — Platform / Data Core

```
Phase 1 Foundation
→ Phase 2 Importer / MASTER
→ Phase 3 Resolver Core
```

## Track B — Frontend / Operations

```
P1 Admin Skeleton
→ P2 Import / MASTER / Brand Review UI
→ P3 Identifier Review UI
→ P4 Thumbnail Review UI
→ P5 Automation UI
→ P6 Operations Dashboard
```

## Track C — Image

```
Phase 2에서 원본 이미지 구조 확인
→ P4 Provider Spike / Source Preservation
→ Segmentation
→ Safe Composite / AI Edit
→ QA / Calibration
```

## Track D — Browser

```
Phase 1 Gate
→ Flow Discovery
→ Browser Framework / Secret Boundary
→ Demo Flow
→ 실제 Flow
```

## Track E — Release Engineering

```
P1 Test/CI Baseline
→ P6 Auth/R2/Backup/E2E
→ Production Deploy
→ Release Drill
```

핵심 병렬화 규칙:

- **Phase 3와 Phase 4는 Phase 2 Gate 이후 병렬 가능**하다.

- **Phase 5는 Phase 1 Gate 이후 Phase 2~4와 병렬 가능**하다.

- Phase 6의 E2E/UAT는 Phase 3·4·5 Gate를 모두 기다린다.

- 특정 UI Task는 해당 API contract가 고정되는 즉시 Core 구현과 병렬 진행할 수 있다.

---

# 9. 구현 착수 전 필요한 사용자 입력

아래 정보는 Architecture를 다시 설계하기 위한 것이 아니라 해당 Task 구현을 시작하기 위한 입력이다.

1. 기존 수집 상품 데이터의 실제 저장 위치와 형식

2. 대표 샘플 상품 20~100건

3. 원본 이미지 필드와 이미지 URL 예시

4. 기존 품번 컬럼 및 품번 없는 상품 샘플

5. 초기 상품/옵션 대략적 규모

6. 첫 Browser Automation 대상 화면과 실제 클릭 절차

7. 로그인/2FA 방식

8. 운영 서버 Provider 결정

9. AI Image Edit Provider 평가용 샘플 이미지 세트

10. Resolver/Thumbnail 자동승인 Feature Flag를 활성화할 운영 기준. 별도 합의가 없으면 초기값은 **OFF 또는 보수적 Review 우선**

---

# 10. 개발 착수 순서 — Sprint 기간 미확정

아직 개발 인원·가용시간·Sprint 길이를 정하지 않았으므로 WBS에서 임의 일정은 약속하지 않는다. 실제 착수는 다음 두 Wave로 권장한다.

## Foundation Wave A — 실행 경로

```
P1-01 Monorepo
P1-02 TypeScript / 품질설정
P1-03 Config
P1-08 Contract
P1-13 Secret Baseline
P1-14 Test/CI Baseline (먼저 기반 구성, 전체 실행은 후속 검증)
P1-04 PostgreSQL
P1-05 Migration
P1-06 DB Client
P1-07 /health + /ready
P1-09 Queue
P1-10 Worker system.test
P1-14 전체 검증
```

완료 조건:

```
clean checkout
→ install
→ DB migrate
→ API health/ready
→ Queue publish
→ Worker consume
→ CI pass
```

## Foundation Wave B — 운영 UI / Storage

```
P1-11 Admin Skeleton
P1-12 ObjectStorage Local Adapter
```

Wave B는 Wave A 후반과 병렬 진행할 수 있다. Phase 1 Gate가 완료되면 즉시 `P2-01 기존 수집 데이터 Discovery`와 `P5-01 Browser Flow Discovery`를 **병렬 착수**하는 것이 효율적이다.

---

# 11. 최종 WBS 판정

상세 재검수 후 이 WBS는 설계서 v0.1의 1차 MVP 범위를 실제 구현 가능한 Task로 분해하며, **개발 착수 기준으로 사용 가능**하다고 판정한다.

다만 아래 3개 영역은 구현 과정에서도 Calibration/실측을 통해 값이 확정되는 영역이다.

1. Resolver Auto-Accept 임계값

2. Thumbnail Mask/QA 자동승인 기준

3. Worker/DB/Browser 실제 Concurrency

이 값들은 Architecture 상수로 고정하지 않고 Feature Flag와 설정값으로 관리한다.

핵심 원칙은 다음과 같다.

- MASTER 데이터 구조를 먼저 안정화한다.

- 대량/외부/이미지/브라우저 작업은 API가 아닌 Worker로 처리한다.

- 품번은 추측이 아니라 Evidence로 결정한다.

- 썸네일은 제품 원본 보존을 우선하고 AI_RECONSTRUCT는 자동승인하지 않는다.

- Browser Automation은 성공조건 `verify()`와 안전한 실패처리를 갖는다.

- MVP Release에는 기능 구현뿐 아니라 Backup/Restore/E2E/Security가 포함된다.

- 더망고 API는 MVP 범위에서 제외하고 Browser UI 자동화와 미래 Connector만 고려한다.

**다음 실행 단계: Phase 1 Foundation Wave A —**`**brand-resell-os**`**실제 프로젝트 Skeleton 구현 및 실행 경로 검증**


## v0.2 Gate 판정 보완

85개 Task ID는 유지한다. 번호는 엄격한 실행 순서가 아니며 수정된 선행관계를 따른다. 보완 명세 6장의 상태·Waiver·증거 규칙을 적용한다. 위 Release PASS 목록은 목표 체크리스트다. 외부 입력 미제공, 평가 미실행, 운영 배포 미수행은 PASS가 아니다. Waiver가 있는 Release는 수용된 위험과 제외 기능을 별도로 표시한다.
