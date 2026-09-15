# BROS 구현 현황

기준일: 2026-09-16

진행 방침(DEC-20260915-027/028/029, DEC-20260916-001): P3-14 실제 정답 검수/calibration은 사용자 요청으로 보류한다. 실제 정답·capture 확보 또는 재개 요청 시 이어가며 자동승격 OFF를 유지한다. P3-12 capture와 BLK-005 공유 quota 보완 후 [Phase 3 변경 묶음·원격 CI 준비](PHASE3_RELEASE_PREP.md)를 작성했다. 다음 단계는 검토한 변경의 commit/push와 새 SHA 원격 CI 검증이다. 현재 준비와 기존 head CI 성공은 Phase 3 원격 PASS가 아니다. BLK-005 운영 입력/연결은 OPEN, Phase 3 Gate 전체는 BLOCKED다.

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
| P2-05 Brand Normalizer | PASS | DEC-20260914-005/007/017, 승인 alias exact resolution·platform precedence·unknown non-creation, local·Linux CI PASS | Phase 2 Gate PASS |
| P2-07 Embedded Identifier Extractor | PASS | DEC-20260914-006/007/017, explicit/raw allowlist extraction·provenance·bounded traversal, local·Linux CI PASS | Phase 2 Gate PASS |
| P2-08 MASTER Matcher v1 | PASS | DEC-20260914-007/017, exact/ambiguous/conflict/variant/truncation/evidence와 PostgreSQL discovery, Linux CI PASS | Phase 2 Gate PASS |
| P2-09 MASTER Creator / Race Control | PASS | DEC-20260914-008/017, identity lock·원자적 생성/연결·replay·review·retry, Linux CI PASS | Phase 2 Gate PASS |
| P2-10 SKU Normalizer / Mapper | PASS | DEC-20260914-009/017, deterministic SKU/source SKU upsert·replay·collision review, Linux CI PASS | Phase 2 Gate PASS |
| P2-11 Source Image Registrar | PASS | DEC-20260914-010/017, immutable revision·option ownership·replay/concurrency/rollback, Linux CI PASS | Phase 2 Gate PASS |
| P2-12 Import Batch / Item Tracking | PASS | DEC-20260914-011/017, item terminal 결과·집계·replay·stage completeness, Linux CI PASS | Phase 2 Gate PASS |
| P2-13 Product Import Queue / Chunk Processor | PASS | DEC-20260914-012/017, atomic admission·chunk·1k import·Worker crash recovery, Linux CI PASS | Phase 2 Gate PASS |
| P2-14 Import 관리 UI/API | PASS | DEC-20260914-013/017, pagination·safe projection·resume/replay·local fence, Linux CI PASS | Phase 2 Gate PASS |
| P2-15 MASTER 상품관리 API/UI | PASS | DEC-20260914-014/017, 공개 관계 trace·CAS edit·audit, Linux CI PASS | Phase 2 Gate PASS |
| P2-16 Brand Alias / Unresolved Brand Review | PASS | DEC-20260914-015/017, alias review·경합·Queue 원자 접수·재처리, Linux CI PASS | Phase 2 Gate PASS |
| Phase 2 Gate | PASS | DEC-20260914-016/017, PHASE2_GATE.md 및 CI run 34849017954 | 실제 20행 재import와 모든 WBS 조건 증거, current SHA Linux required check PASS |
| P3-01 Resolve Input / Run Model | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-001/002, versioned snapshot·run lifecycle·후보 원자 저장·재import/경합/rollback, 로컬 pnpm check PASS | 원격 CI NOT_RUN; P3-02 Brand Pattern Registry 착수 가능, Phase 3 Gate에서 current revision CI 증거 확보 |
| P3-02 Brand Pattern Registry | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-003, immutable versioned registry·brand/source/type mapping·safe regex·positive/negative fixture, 로컬 pnpm check PASS | 원격 CI NOT_RUN; P3-03 Raw / URL / Text Extractors가 registry를 근거 metadata로 사용 |
| P3-03 Raw / URL / Text Extractors | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-004, snapshot 기반 raw/URL/title/option 후보·bounded provenance·secret guard·truncation, 로컬 pnpm check PASS | 원격 CI NOT_RUN; P3-04 Internal Catalog Provider 또는 P3-06 Evidence Model/Collector 착수 가능 |
| P3-04 Internal Catalog Provider | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-005, verified exact·brand/name/variant exact lookup·ambiguous/miss·read-only, 품질 명령과 순차 integration PASS | 원격 CI NOT_RUN; 병렬 pnpm check는 DB CPU 경합으로 기존 100ms timeout 4건 FAIL, 순차 23 files/127 PASS |
| P3-05 External Candidate Provider Port + 첫 Provider | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-006/007/029, Brave adapter·장애/secret guard에 PostgreSQL 계정 예산·완료 후 전역 간격·429·실프로세스 복구 보완. 합성 검증은 TEST_REPORT 참조 | 공유 quota RESOLVED_LOCAL. BLK-005 live 계약/저장 권한/키/가격·한도·계정 매핑/Worker 연결 OPEN; 운영 004·원격 CI NOT_RUN |
| P3-06 Evidence Model / Collector | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-008/009, versioned Evidence schema·P3-03/04/05 provenance collector·exact raw-value evidence merge·catalog/provider reference, 신규 unit 8 및 전체 순차 integration 133 PASS | P3-07 Candidate Normalizer / Deduplicator 착수 가능. run orchestration/DB write·score·decision 및 원격 CI NOT_RUN |
| P3-07 Candidate Normalizer / Deduplicator | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-010/011, type-specific norm v1·same type/norm merge·all provenance/reference/failure preservation·invalid typed candidate 분리, 신규 unit 8 및 전체 순차 integration 133 PASS | P3-08 Candidate Scorer 착수 가능. resolver orchestration/DB write·원격 CI NOT_RUN |
| P3-08 Candidate Scorer | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-012/013, scorer v1 fixed weight·type-level duplicate non-inflation·verified-only strong flag·deterministic score/rank, 신규 golden unit 5 및 전체 순차 integration 133 PASS | P3-09 Hard Conflict Detector 착수 가능. resolver orchestration/DB write·actual calibration·원격 CI NOT_RUN |
| P3-09 Hard Conflict Detector | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-014/015, verified catalog target collision·explicit canonical fact conflict·six closed codes·deterministic code-only result, 신규 unit 6 및 전체 순차 integration 133 PASS | P3-10 Decision Engine 착수 가능. canonical fact projection·resolver orchestration/DB write·actual calibration·원격 CI NOT_RUN |
| P3-10 Decision Engine | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-016/017, boundary recommendation·strong/conflict/truncation guard·incomplete empty result separation, 신규 unit 6 및 전체 순차 integration 133 PASS | P3-11 Identifier Promotion / Audit 착수 가능. autoaccept activation·resolver orchestration/DB write·holdout·원격 CI NOT_RUN |
| P3-11 Identifier Promotion / Audit | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-018/019/020/021, 수동 승인·영속 replay·MASTER/SKU scope·legacy/P3 비교 lock·감사 보존·rollback, PostgreSQL 호환 전용 10/전체 순차 158 PASS, 전체 로컬 품질 PASS | BLK-006 RESOLVED_LOCAL. P3-12 orchestration/P3-13 API 후속, 자동 승격 OFF, current revision remote CI/holdout NOT_RUN |
| P3-12 Resolver Batch Worker / Orchestration | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-022/028/029, 원자 접수·attempt fence·복구/capture 저장·export 및 공유 quota adapter 구현. 전용/전체 회귀는 TEST_REPORT 참조 | 공유 quota 운영 구성 연결 후속. 실제 DB 002/003/004·원격 CI·live/holdout NOT_RUN. pipeline v2/auto OFF |
| P3-13 품번 검수 UI/API | IMPLEMENTED_NOT_VALIDATED | DEC-20260915-023, 공개 목록/상세·승인/거절/직접입력/재탐색·서버 actor/version·원자 감사, API 전용 8/전체 순차 integration 176·Node 148·Admin 35 PASS, 실제 브라우저 4개 저장 흐름 PASS | P3-14 Golden Dataset / Auto-Accept Calibration. 운영 인증/Caddy·실제 DB 002/003·원격 CI·holdout NOT_RUN; 자동승격 OFF |
| P3-14 Resolver Golden Dataset / Auto-Accept Calibration | BLOCKED_EXTERNAL_INPUT | DEC-20260915-024/025, Evidence replay 평가·MASTER/SKU/image split·holdout/algorithm lock·보고서·OFF flag, 합성 11건 SYNTHETIC_ONLY, 기존 Node 157/Admin 35/순차 integration 176 PASS. 후속 실제 상품 200행 검수 intake 생성·원본 대조 PASS, 정답 0/capture 없음 | BLK-007: 실제 정답/근거·대표 범위·독립 holdout 필요. 실제 calibration/활성화/Phase 3 Gate NOT_RUN; 자동승격 OFF |

상태 값은 `NOT_STARTED`, `READY`, `IN_PROGRESS`, `IMPLEMENTED_NOT_VALIDATED`, `PASS`, `BLOCKED`, `BLOCKED_EXTERNAL_INPUT`을 사용한다.
