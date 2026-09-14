# BROS 구현 현황

기준일: 2026-09-15

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
| P2-12 Import Batch / Item Tracking | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-011, mixed outcome 집계·item 단위 실패 격리·동시 기록·replay·stage completeness PostgreSQL 통합 PASS; 전체 unit 66개·integration 89개 PASS | 원격 CI 미실행; P2-13 Product Import Queue / Chunk Processor 로컬 착수 가능 |
| P2-13 Product Import Queue / Chunk Processor | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-012, 원자적 접수·상한·chunk 100/concurrency 2·1k import·실패 격리·실제 Worker crash 복구 PASS; 전체 pnpm check PASS(unit 68·integration 97) | 원격 CI 미실행; P2-14 Import 관리 UI/API 로컬 착수 가능 |
| P2-14 Import 관리 UI/API | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-013, cursor pagination·상태/건수·안전한 실패 원인·업무/처리 상태 분리·명시적 resume/replay·local 인증 fence PASS; 전체 pnpm check PASS(Admin 13·unit 71·integration 99) | 원격 CI 미실행; P2-15 MASTER 상품관리 API/UI 또는 P2-16 Brand Review 로컬 착수 가능 |
| P5-06 Demo Flow/Test Harness + P5-09/10 evidence | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-014/015, DEC-20260915-002, actual Chromium evidence·disposable PostgreSQL/pg-boss success/failure·receipt 멱등성과 공개 HTTPS/R2 E2E·재시작 PASS | 원격 CI PASS 후 상태 확정; Admin Browser 실행 UI/HTTP enqueue는 이번 검증 범위 밖 |
| P6-01 인증 경계 + P5 durable DB/Queue 연결 | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-014/015, DEC-20260915-002, public Quick Tunnel/Caddy auth·actor/token overwrite·Authorization 제거·same-origin gate·R2 preview·durable Worker/DB PASS | 원격 CI·native-domain Linux VM/host firewall 검증 잔여 |
| P6-04 Production R2 ObjectStorage Adapter | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-016, DEC-20260915-001/002, 실제 private R2 및 public HTTPS authorized preview·SHA-256·unsigned 거부 PASS | remote CI·production host hardening은 후속 |
| P6-02 Secret / Browser Profile 운영 Hardening | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-005, Linux file secret·DB/proxy 교체·API/Worker/Caddy·metadata/log scan·UID negative·실제 profile 재사용/만료·backup exclusion·대상 통합 9개 PASS | 실제 운영 host ACL/secret manager, R2·Provider live rotation, P6-06 backup/restore 및 remote CI 확인 |
| P6-05 Artifact Retention / Cleanup | IMPLEMENTED_NOT_VALIDATED | DEC-20260914-017, DEC-20260915-001~004, start 포함 4종의 실제 private R2 hold/release·cleanup·audit·empty/private 확인 PASS, Local/PostgreSQL 회귀 PASS | remote CI 필요 |
| P6-10 Production Docker / Reverse Proxy / HTTPS | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-002, 공개 Quick Tunnel TLS 1.3·DNS·Caddy auth·내부망 격리·R2 Browser run 및 재시작 E2E PASS, P6_10_STAGING.md | custom-domain Linux VM/Caddy ACME·실제 host firewall, P6-02/P6-06, remote CI 잔여; 일반 test runner 종료 문제 별도 |

상태 값은 `NOT_STARTED`, `READY`, `IN_PROGRESS`, `IMPLEMENTED_NOT_VALIDATED`, `PASS`, `BLOCKED`, `BLOCKED_EXTERNAL_INPUT`을 사용한다.
