# BROS Blocker

기준일: 2026-09-15

## BLK-007 — P3-14 실제 정답 검수 데이터와 독립 holdout 부재

- 상태: OPEN / BLOCKED_EXTERNAL_INPUT — 실제 calibration 및 운영 자동승인에 한정.
- 진행 방침(DEC-20260915-027): 사용자 요청으로 P3-14 실제 검수/calibration은 보류하고 다른 P3 보완을 우선한다. 실제 정답·capture 확보 또는 사용자 재개 요청 시 인수 검증부터 재개한다. 보류 중 같은 정답 경로 요청/표본 생성을 반복하지 않는다. 자동승격 OFF와 Gate 미통과는 유지한다.
- 관련 Task: P3-14, Phase 3 Gate. 근거: 구현 보완 명세 v0.2 §5.1/5.2, DEC-20260915-023/024.
- 확인된 입력은 기존 수집 XLSX와 합성 fixture다. 운영자가 확인한 정답 식별자/품번 없음, 근거, 대표 범위, MASTER/SKU/image 분리 정보가 있는 실제 label dataset은 확인되지 않았다. 원본 수집값을 정답으로 복제하지 않는다.
- 진행 결과: Evidence replay 평가 계약/실행기, 누출 검사, holdout/algorithm lock, 분모/오류/비용/처리시간 보고서, 합성 11건 회귀, false 기본 flag와 true 활성화 차단을 구현했다. 실제 보고서 상태는 SYNTHETIC_ONLY이며 평가 PASS가 아니다.
- 해소 입력: 실제 정답 확인 상품 200건 이상, 주요 브랜드/카테고리, 정답·독립 자동승인 금지 label·검수자/시각/근거, 원본 capture/버전/비용, MASTER/SKU/이미지 관계. tuning과 분리된 고정 holdout 자동승인 후보/상품 100개 및 주요 범위별 20개 기준을 측정한다.
- 해소 조건: label/대표성·분리/lock 사전 검토 → 실제 replay 및 end-to-end 결과 대조 → 오매칭/unsafe auto 0과 모든 기준 충족 → 운영 책임자의 범위/버전 결정. 미달/미평가 시 OFF를 유지한다. current revision CI와 Provider 운영 입력은 별도 후속이다.
- 입력 계약/실행법: [RESOLVER_EVALUATION.md](RESOLVER_EVALUATION.md). 사용자가 기존 정답 데이터 경로를 제공하면 해당 입력부터 검토한다.
- 2026-09-15 재확인/준비(DEC-20260915-025): 별도 검수 label은 확인되지 않았다. 원본 26,375행에서 200개 고유 원본 키 검수 intake를 생성·대조했다. 모든 정답란 공란/PENDING, MASTER·split 미확정, capture 없음. [표본/입력 절차](evaluations/p314-real-review-intake.md). 검수 준비 완료는 본 blocker 해소가 아니다.
- DEC-20260915-028: P3-12 원본 capture 저장·export 경로 구현 및 합성 통합검증 완료. 실제 label/capture가 확보된 것은 아니며 본 blocker와 사용자 보류를 유지한다. 사용법/attempt 비용 범위: [RESOLVER_CAPTURE.md](RESOLVER_CAPTURE.md).

## BLK-006 — P2/P3 식별자 정규화와 기존 catalog 호환성

- 상태: RESOLVED_LOCAL — DEC-20260915-021, 2026-09-15. current revision 원격 CI/Phase 3 Gate는 별도 NOT_RUN.
- 관련 Task: P3-04/07/11/12, Phase 3 Gate.
- 원인과 정책: P2 MODEL_NO `AB-123`/P3 `AB123`처럼 separator가 달랐다. 저장 norm 정책은 유지하고 MODEL_NO/STYLE_CODE/PRODUCT_NO/MPN 및 유효한 GTIN/EAN/UPC에만 version-bridging 비교 키를 추가했다. slash/dot, BARCODE/BRAND_CODE, 유효하지 않은 GTIN은 추정 결합하지 않는다.
- 실제 DB 분포: 중지된 `bros_postgres_data`를 읽기 전용으로 임시 사본에 복사해 원본과 동일한 고정 PostgreSQL 이미지로 조회했다. `bros`의 product_master/product_identifier/identifier_candidate/source_product/import_item은 각각 0행, 기존 migration 이력은 001 한 건이다. 원본 DB/volume은 실행·수정하지 않았다. 기존 legacy catalog 데이터 자체는 현재 없다.
- 해소 검증: PostgreSQL fixture의 legacy 행에서 P3 verified 조회, P2 import의 P3 행 재사용, P3의 다른 MASTER 거부와 같은 MASTER upsert, 실제 P2/P3 공유 advisory waiter/동시 import·승인, 서로 다른 기존 MASTER의 AMBIGUOUS를 확인했다. 002 비유일 비교 인덱스 migration/rollback 및 전체 순차 integration 26 files/158 PASS; 상세 증거는 TEST_REPORT와 DEC-20260915-021.
- 잔여 경계: 기존 저장 norm과 unique constraint는 바꾸지 않는다. 이미 여러 MASTER에 의미상 같은 legacy 행이 있을 미래 DB는 AMBIGUOUS/REVIEW_REQUIRED로 남기고 자동 병합하지 않는다. 현재 빈 실DB에 002 migration을 실행한 것으로 기록하지 않는다. 운영 연결은 원격 CI/current data 재확인 및 Phase 3 Gate를 따르며, 자동승격은 OFF다.

## BLK-005 — P3-05 외부 검색 운영 입력 및 공유 예산 통합

- 상태: OPEN — live 운영 입력/연결·검증에 한정. 공유 quota 구현은 RESOLVED_LOCAL(DEC-20260915-029).
- 관련 Task: P3-05, P3-12, Phase 3 운영 검증.
- 근거: 구현 보완 명세 v0.2 §5의 Provider 계약·사용 조건·한도·키 주입 요구와 DEC-20260915-006.
- 남은 원인: 운영 검색 Provider 계약/검색 결과 저장 권한, 실제 과금 상한/일일 예산/RPS와 계정 매핑, SecretProvider 키 주입 및 기본 Worker live 구성·배포 검증이 준비되지 않았다.
- 진행 결과: Brave 공식 API 어댑터와 공통 장애 경계, fixture 메모리 예산을 구현했다. 미설정 live와 메모리 예산의 live 사용은 차단한다. 상세 조건은 `EXTERNAL_PROVIDER_BRAVE.md`.
- 2026-09-15 P3-12: Worker 내부 직렬 호출·최소 간격·취소 전파와 fixture 비용 한도를 동시 실행으로 검증했다. 이는 계정 단위 durable 예산이나 여러 Worker의 전역 RPS 보장이 아니다. 기본 Worker의 live Provider는 계속 disabled이며 해당 운영 통합은 OPEN이다. 로컬 orchestration 자체는 검증 완료했다.
- 2026-09-15 공유 quota 보완(DEC-20260915-029): migration 004/bros_provider 장부, 계정·DB UTC 원자 예약, 실제 callback 완료 후 전역 간격/429, 강제 프로세스 종료 후 비용/ACTIVE 보존과 명시적 복구를 구현·합성 검증했다. adapter 버전 교체도 같은 계정 예산을 공유한다. [운영 계약/복구 절차](PROVIDER_QUOTA.md). 운영 DB에는 미적용이며 live/auto는 OFF다.
- 해소 조건: 운영자 계약·저장 권한·가격/한도·공유 계정 확인 기록, 비밀값을 노출하지 않는 키 주입과 quota 연결/배포, 제한된 live smoke와 비용 확인. 로컬 원자성/재시작/다중 Worker 증거, 원격 CI 결과, live 결과를 별도로 기록한다.

## BLK-001 — P1-14 원격 CI 실행 및 merge 차단 검증

- 상태: RESOLVED — DEC-20260913-006, 2026-09-13
- 관련 Task: P1-14, Phase 1 Gate
- 해소 전 원인: 저장소에 GitHub remote와 branch protection 대상 repository가 없었다.
- 해소 결과: 사용자가 공개 전환을 승인한 `hyunglory/bros` repository를 `origin`으로 연결했다. PR #1의 Actions run 34746426348이 PASS했고, ruleset 23149676이 기본 브랜치에 strict required status check `install / lint / typecheck / test / build`를 적용한다.
- 실패 차단 증거: 임시 PR #2의 Actions run 34747040147이 의도적 ESLint 오류를 탐지해 FAILURE가 되었고, GitHub API의 `mergeStateStatus`가 `BLOCKED`를 반환했다. PR은 merge하지 않고 닫았으며 임시 원격·로컬 브랜치는 삭제했다.
- 공개 범위: GitHub Free private repository에서는 branch protection/ruleset API가 403을 반환해, 사용자 승인에 따라 repository를 PUBLIC으로 전환했다.
- 2026-09-13 재확인: HEAD `b8bed87`에서 BROS 전용 PostgreSQL을 사용한 `pnpm check`는 PASS했다. 그러나 `git remote -v` 출력은 비어 있고, GitHub CLI 기본 계정의 인증 토큰은 무효다. 따라서 원격 repository 선택, push, workflow 실행, protection 설정은 NOT_RUN이며 BLK-001은 해소되지 않았다.

## BLK-002 — P1-05 코드 필드 허용 집합 결정

- 상태: RESOLVED — DEC-20260912-010, 2026-09-12 사용자 후속 지시에 따라 제안 정책 확정
- 관련 Task: P1-05
- 근거: `doc/BROS_구현_보완_명세_v0.2.md` 2장 34·42행은 상태·타입·코드의 허용 집합 CHECK와 필수 컬럼을 지정하지만, `product_type`, `created_method`, `import_type`, `reviewer_type`의 값 목록은 없다. 설계서 15.6의 `evidence_type` 값은 예시로 명시되어 있다.
- 영향: 폐쇄된 허용값 CHECK를 원문만으로 확정할 수 없다. 임의 값을 추가하거나 CHECK 요구를 조용히 생략하면 후속 입력/검수 계약이 달라진다.
- 진행한 독립 작업: 18개 테이블 256개 컬럼 명세, Kysely/pg 설치, migration 실행기, DDL 초안, 일회용 DB 테스트 코드. DB build와 lint는 통과했다.
- 해소 이후: migration up 가드를 제거하고 실제 DB 검증을 진행한다. 최종 구현 검증 상태는 IMPLEMENTATION_STATUS와 TEST_REPORT를 따른다.
- 제안: 다섯 필드를 VARCHAR(64), NOT NULL, 공백 금지로 시작하고 각 업무 단계에서 코드 집합을 확정하여 별도 migration으로 제한한다. 그 외 문서에 명시된 상태/타입 CHECK는 모두 유지한다.
- 해소 조건: 열린 코드 제안 승인 또는 다섯 필드의 허용값 제공 → 새 ACCEPTED Decision → 가드 제거 → DB 실행 및 negative test 보완·검증.

## BLK-003 — P2-01 기존 수집 데이터 입력 부재

- 상태: RESOLVED (2026-09-13)
- 관련 Task: P2-01, P2-02, P2-03
- 해소 전 원인: 실제 수집 데이터의 저장 위치·형식, 대표 상품 20~100건, 옵션/이미지/품번 필드와 전체 규모가 제공되지 않았다.
- 해소 전 영향: 실제 원본 컬럼 매핑, 첫 Adapter 종류, `SourceOptionInput`/`SourceImageInput`, 수집 시각·재고·금액 표현 계약과 20건 mapping dry-run을 확정할 수 없었다.
- 진행한 독립 작업: `docs/SOURCE_MAPPING_SPEC_v0.1.md`에 확인된 표준 입력 경계, 계약 공백, 제공 입력, dry-run 판정표를 작성했다.
- 해소 전 우회: source와 독립적인 P2-05 Brand Normalizer 또는 P5-02 Browser Manager 기반만 별도 진행할 수 있었다.
- 해소 조건: 비밀·개인정보를 제거한 실제 샘플 최소 20건과 저장 위치/형식/전체 규모/필드 의미 제공 → field inventory → 20건 mapping dry-run → Source Mapping Spec 확정.
- 해소 근거: `examples/더망고_상품정보_20260913.xlsx`를 읽기 전용 분석해 상품 26,375건과 옵션 상품 3,722건을 확인하고, 변형 사례를 포함한 20건 mapping dry-run을 완료했다. 결과는 MAPPED 8건, MAPPED_WITH_REVIEW 8건, 필수 `externalProductId` 결측에 따른 REJECTED 4건이며 유효 source identity 중복과 옵션-이미지 pairing mismatch는 0건이다.
- 후속 범위: BLK-003 해소는 P2-02 계약 구현 완료를 의미하지 않는다. `stockStatus`, 수집 시각, 옵션·이미지 하위 타입과 가격 decimal 표현은 Source Mapping Spec 6장에서 확정한 뒤 구현한다.

## BLK-004 — Phase 2 현재 revision의 원격 CI 증거 부재

- 상태: RESOLVED — DEC-20260914-017, 2026-09-14
- 관련 Task: P2-05, P2-07~P2-16, Phase 2 Gate
- 근거: `646cb49c8217358f2075d8df746adf6d1bb404d0`에 대한 GitHub check-runs 조회가 HTTP 422 `No commit found`다. 조회한 최근 5개 run 중 최근 성공 34794445556은 P2-04 SHA `8c799a3`이므로 현재 구현을 검증하지 않는다.
- 해소 결과: `cc605d0c6bd51173da32ab3e08a145158de6fddc`를 PR #1 branch에 fast-forward push했다. GitHub Actions run 34849017954가 Ubuntu/PostgreSQL service에서 `install / lint / typecheck / test / build`를 SUCCESS로 완료했고 PR #1은 `CLEAN`이다.
- protection 근거: ruleset 23149676 `main required quality`는 기본 브랜치에 strict required status check `install / lint / typecheck / test / build`를 적용하며 bypass actor가 없다.
- 공개 범위: 원본 XLSX·raw는 push하지 않았고, Gate script·보고서와 기존 구현 커밋만 포함했다.
- 구분: Phase 1 BLK-001은 RESOLVED를 유지한다. 기존 branch protection 증거와 신규 Phase 2 코드의 CI 미실행은 별개의 사항이다.

## P3-01 착수·로컬 검증 확인 — 2026-09-15

- 착수 blocker 없음. DEC-20260914-017의 Phase 2 Gate PASS를 인수해 P3-01 계약·서비스와 로컬 전체 검증을 완료했다.
- P3-01 원격 push/CI는 NOT_RUN이며 Phase 3 Gate PASS로 선언하지 않는다. 후속 Gate의 증거 항목으로 남기고 이미 해소된 BLK-004를 재개방하지 않는다.
- Pattern/Provider, Queue·API·UI 연결, 자동승인/수동검수, 실제 정답 표본은 후속 WBS 범위다. P3-01의 합성 run 검증을 Resolver 정확도 평가로 해석하지 않는다.
