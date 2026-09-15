# Phase 3 Gate — 사전검수 및 남은 작업

기준일: 2026-09-15. 전체 Gate 판정: **BLOCKED**. P3-01~13의 구현·로컬 회귀 증거를 대조했으며 P3-14 실제 calibration은 사용자 요청으로 보류한다. 이는 Gate 면제나 PASS가 아니다. DEC-20260915-027.

## 적용 범위

- 기준: WBS P3-01~14 / Phase 3 Gate, 구현 보완 명세 v0.2 §5, DEC-20260915-001~026, docs/TEST_REPORT.md.
- 구현 위치: `codex/p1-foundation`, HEAD `968dfa7` 위의 미커밋 P3 변경. HEAD만으로 현재 구현을 재현하거나 원격 CI 통과를 주장할 수 없다.
- 이번 실행: `pnpm build:packages` PASS, Resolver 11개 파일 및 config/identifier-evidence/identifier-resolve 3개 파일의 unit 90개 PASS(exit 0). DB·브라우저·Provider는 이번 사전검수에서 실행하지 않았다.

## WBS Gate 증거 대조

| Gate 조건 | 현재 증거 | 남은 범위 |
| --- | --- | --- |
| 미확인 상품 Batch Resolve | P3-12 원자 접수, attempt fence, 재시도/실프로세스 복구 통합 회귀. P3-13 UI 재탐색 접수 증거 | 운영 DB 002/003 적용 및 current revision CI, 운영 Provider 연결 |
| Evidence/Conflict/Score 보존 | worker-handler가 candidate evidence_json/conflict_json/confidence_score와 result_json을 트랜잭션 저장. 기존 API/DB 통합 회귀 PASS | 아래 Collector capture 원본·비용 내보내기 보완과 구분 |
| 임의 품번 생성 금지 | Registry/Extractor의 근거 추적·후보 검증, Collector/Normalizer/Scorer/Detector 회귀. 이번 관련 unit PASS | 실제 브랜드 registry와 독립 근거 검수 |
| 자동승인/검수 경계 | Decision Engine 경계, strong/conflict/truncation, auto flag 및 promotion 차단 회귀. 이번 관련 unit PASS | 실제 threshold calibration 및 운영 활성화 결정 |
| Golden Dataset 회귀 | 합성 11건 SYNTHETIC_ONLY 기록, 이번 evaluation unit 포함 PASS | 합성 회귀를 실제 정확도 PASS로 확대하지 않음 |
| 실제 실행 Calibration | 실제 label 0, BLK-007 OPEN | 사용자 보류. 정답·capture 확보 후 재개. OFF로 평가 PASS 대체 금지 |

기존 전체 Node 157/Admin 35/순차 PostgreSQL integration 176 PASS는 DEC-024 기록이다. 이번 90개 검증과 실행 시점을 구분한다. P3-13 브라우저 검수는 DEC-023 증거이며 이번 재실행이 아니다. P3-11 BLK-006의 P2/P3 비교 키·저장 norm·동시성 결정은 RESOLVED_LOCAL 그대로 적용한다.

## P3-12 capture 보관·내보내기 보완

`packages/resolver/src/pipeline.ts`는 Collector 결과를 Normalizer/Scorer/Detector/Decision Engine으로 넘기고 최종 DecisionEngineResult를 반환한다. `worker-handler.ts`는 이 결과와 후보를 저장한다. 이는 후보 Evidence/Conflict/Score 보존 요건의 증거다.

DEC-20260915-028에서 기본 pipeline v2의 원본 capture 반환, result_json.executionCapture 원자 저장, run/attempt·입력/판정/payload digest 검증과 로컬 export를 보완했다. [capture 계약](RESOLVER_CAPTURE.md)을 따른다. 실제 수집/정답이 준비됐다는 뜻은 아니며 과거 capture가 없는 실행은 CAPTURE_UNAVAILABLE이다.

아래 항목은 이번 보완의 검증 범위다. 비용은 완료된 attempt만 나타내며 실패 시도의 누적 과금 장부는 별도다.

- 정답을 보지 않는 실행 경로에서 Collector 출력·conflict facts·구현/registry/provider 버전·출처·기록 비용을 보존한다. 비용을 모르면 null이다.
- 재시도/attempt fence/트랜잭션과 맞물려 다른 실행 결과를 섞거나 덮어쓰지 않는다. 저장 실패·export 재현성·비밀정보 제외를 검증한다.
- 기존 public 검수 API가 raw/capture를 무단 노출하지 않도록 기존 공개 DTO 경계를 유지한다.
- synthetic fixture capture와 실제 상품 실행 capture를 명시적으로 구분한다. 실제 label/calibration이나 live Provider 활성화를 동반할 필요는 없다.

## 운영 후속과 진행 순서

1. P3-12 capture 저장·export 로컬 보완 완료(DEC-028). 신규 migration 없이 기존 003 JSONB를 사용한다. 실제 capture 인수는 데이터 확보 후 진행한다.
2. BLK-005의 shared durable budget/전역 호출 제한은 PostgreSQL fixture로 구현·검증했다(DEC-029, [PROVIDER_QUOTA.md](PROVIDER_QUOTA.md)). 운영 연결에는 migration 004가 추가로 필요하다. 실제 계약·저장 권한·키·가격/한도·계정 매핑과 live smoke는 운영 입력 확보 후 진행한다.
3. DEC-20260916-001에서 [123개 파일의 변경 묶음·PR 초안·CI 준비·migration 순서](PHASE3_RELEASE_PREP.md)를 정리했다. 공개 경로 guard와 순차 integration runner를 추가했다. 다음은 실제 commit/push 후 새 SHA 원격 CI 증거 확보이며 대상 DB migration/배포는 별도다. 현재 local 준비를 원격 PASS로 기록하지 않는다.
4. 실제 정답·capture 확보 또는 사용자의 재개 요청 시 P3-14를 재개하고, 모든 조건 충족 후 Phase 3 Gate 최종 판정한다.

이 순서는 작업 우선순위다. 독립 구현이 끝났다는 이유로 BLK-005/007이나 운영 인증을 해소하지 않는다. 현재 auto OFF 유지.

## P3-14 보류 인수 메모

- 사용자가 실제 정답 작성 방법이 익숙하지 않음을 알렸고, 다른 P3 작업을 우선 진행하도록 요청했다. 보류 기간에 동일한 파일 경로 요청이나 미작성 표본 생성을 반복하지 않는다.
- 준비한 200행 워크북과 intake/validation은 `data/outputs/p314-real-review-20260915/`에 그대로 보관한다. 작업 상태는 BLOCKED_EXTERNAL_INPUT, 진행 메모는 사용자 요청 보류다.
- 재개 시 처음에는 소수 상품의 **공식 근거에서 확인한 품번·근거 위치·확인자**부터 함께 점검한다. 전체 200행과 기술 필드를 사용자가 혼자 작성하는 것을 시작 조건으로 요구하지 않는다.
- MASTER/SKU 관계·이미지 hash·capture/버전·분할은 에이전트가 실제 데이터와 코드로 확인하고, 의미상 동일 상품 판단이나 누락 근거만 사용자에게 확인한다. 모르는 항목은 미확정으로 둔다.
- 식별자를 확인했다고 `autoAcceptForbidden=false`가 자동으로 결정되는 것은 아니다. 충돌·AI 단독 등 독립 금지 조건을 별도로 검수한다. 미확인은 PENDING이며, 품번이 안 보인다는 이유만으로 NO_IDENTIFIER로 확정하지 않는다.
