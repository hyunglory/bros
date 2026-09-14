# BROS 구현 현황

기준일: 2026-09-14

| Task | 상태 | 근거 | 다음 조치 |
|---|---|---|---|
| P1-01 Monorepo / pnpm Workspace | PASS | DEC-20260912-001, DEC-20260912-002, TEST_REPORT 2026-09-12 P1-01 | 완료 |
| P1-02 공통 TypeScript / 품질 설정 | PASS | DEC-20260912-003, TEST_REPORT 2026-09-12 P1-02 | 완료 |
| P1-03 환경변수 / Config Loader | PASS | DEC-20260912-004, TEST_REPORT 2026-09-12 P1-03 | 완료 |
| P1-08 API Contract / TypeBox | PASS | DEC-20260912-005, TEST_REPORT 2026-09-12 P1-08 | 완료 |
| P1-13 SecretProvider / Redaction | PASS | DEC-20260912-006, TEST_REPORT 2026-09-12 P1-13 | 완료 |
| P1-14 Test Harness / CI Baseline | PASS | DEC-20260912-007, DEC-20260913-006, PR #1, Actions run 34746426348 | 로컬·원격 Linux CI·required check 실패 차단 검증 완료 |
| P1-04 PostgreSQL 18 개발환경 | PASS | DEC-20260912-008, TEST_REPORT 2026-09-12 P1-04, 구현 커밋 `bc8c419` | 완료 |
| P1-05 DB Migration 기반 + MVP 18개 테이블 | PASS | DEC-20260912-010/011, 구현 커밋 `6e3cd03`, TEST_REPORT P1-05 완료 | 개발 DB 적용 및 clean clone 검증 완료 |
| P1-06 Kysely DB Client / Repository 기반 | PASS | DEC-20260912-012, TEST_REPORT P1-06 | 공용 query·transaction·pool lifecycle 검증 완료 |
| P1-07 API Bootstrap / Liveness / Readiness | PASS | DEC-20260912-013, TEST_REPORT P1-07 | 로컬 HTTP·DB 장애/복구·종료 검증 완료, POSIX 실신호는 Linux CI 후속 확인 |
| P1-09 Queue Port + pg-boss Adapter | PASS | DEC-20260913-001, TEST_REPORT P1-09 | 트랜잭션 enqueue·retry·프로세스 crash 복구 검증 완료 |
| P1-10 Worker Bootstrap / system.test | PASS | DEC-20260913-002, TEST_REPORT P1-10 | 실제 Worker·이력·재시도·crash/종료 검증 및 개발 smoke 완료 |
| P1-11 Admin React/Vite Skeleton | PASS | DEC-20260913-003, TEST_REPORT P1-11 | 실제 Vite 개발 서버·/health 프록시·정상/오류 UI·build 검증 완료 |
| P1-12 ObjectStorage Port / Local Adapter | PASS | DEC-20260913-004, TEST_REPORT P1-12 | 원자적 put/get/delete·signed local URL·traversal/symlink 차단 검증 완료 |
| Phase 1 Gate | PASS | DEC-20260913-006, P1-01~P1-14 PASS, BLK-001 RESOLVED | P2-01과 P5-01 착수 가능 |
| P2-01 기존 수집 데이터 Discovery | PASS | DEC-20260913-008, SOURCE_MAPPING_SPEC v0.1, BLK-003 RESOLVED | 실제 XLSX 26,375건 inventory와 변형 사례 20건 mapping dry-run 완료 |
| P2-02 SourceProductInput 표준 계약 | PASS | DEC-20260914-001, 계약 validation 8개, 전체 unit 36개·integration 53개, Actions run 34779705905 PASS | `gpt-5.6-terra / medium`으로 P2-03 XlsxImportAdapter 착수 |
| P2-03 XlsxImportAdapter | PASS | DEC-20260914-002, 실제 XLSX 26,375행 read-only mapping, unit 41개·integration 53개 PASS | P2-04 Import Validation / Raw 보존 착수 |
| P2-04 Import Validation / Raw 보존 | PASS | DEC-20260914-003, mapped/rejected row 이력·secret-safe raw persistence, unit 42개·integration 55개 PASS | P2-05 Brand Normalizer 또는 P2-06 Source Product Upsert 착수 |
| P2-06 Source Product Upsert | PASS | DEC-20260914-004, identity idempotency·newer source update·terminal batch aggregate, unit 42개·integration 57개 PASS | P2-05 Brand Normalizer 또는 P2-07 Identifier Extractor 착수 |
| P2-05 Brand Normalizer | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-005/007, 승인 alias exact resolution·platform precedence·unknown non-creation, 최신 로컬 unit 55개·integration 59개 PASS | 공개 원격 CI PASS 후 상태 확정 |
| P2-07 Embedded Identifier Extractor | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-006/007, explicit/raw allowlist extraction·provenance·bounded traversal, 최신 로컬 unit 55개·integration 59개 PASS | 공개 원격 CI PASS 후 상태 확정 |
| P2-08 MASTER Matcher v1 | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-007, exact/ambiguous/conflict/variant/truncation/evidence unit 및 PostgreSQL read-only discovery PASS, 최종 unit 55개·integration 59개 PASS | 공개 원격 CI PASS 후 상태 확정; P2-09는 로컬 구현 착수 가능 |
| P2-09 MASTER Creator / Race Control | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-008, identity lock·재조회·원자적 생성/연결·replay·review·retry 통합 12개 시나리오 PASS; 전체 unit 57개·integration 72개 및 pnpm check PASS | 원격 CI 미실행; P2-10 SKU Normalizer / Mapper 로컬 착수 가능 |
| P2-10 SKU Normalizer / Mapper | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-009, deterministic option key·SKU/source SKU upsert·replay·collision review 및 PostgreSQL 재import 통합 PASS | 원격 CI 미실행; P2-11 이미지 등록 또는 P2-12 pipeline completion 로컬 착수 가능 |
| P2-11 Source Image Registrar | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-010, immutable source revision·option SKU ownership·replay/concurrency/rollback PostgreSQL 통합 PASS | 원격 CI 미실행; P2-12 pipeline completion 로컬 착수 가능 |

상태 값은 `NOT_STARTED`, `READY`, `IN_PROGRESS`, `IMPLEMENTED_NOT_VALIDATED`, `PASS`, `BLOCKED`, `BLOCKED_EXTERNAL_INPUT`을 사용한다.
