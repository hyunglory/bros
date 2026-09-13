# BROS Blocker

기준일: 2026-09-13

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
