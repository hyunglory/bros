# Resolver Golden Dataset / Auto-Accept Calibration — P3-14

기준: 2026-09-15. 개발 가능한 평가 harness/합성 회귀는 구현했다. 실제 정답 검수 데이터는 제공되지 않아 **P3-14는 BLOCKED_EXTERNAL_INPUT**, 실제 calibration은 **NOT_RUN**이다. 합성 회귀 보고서는 [p314-golden-v1/report.md](evaluations/p314-golden-v1/report.md) 및 [report.json](evaluations/p314-golden-v1/report.json)이다.

## 평가 범위와 고정 정책

`COLLECTED_EVIDENCE_REPLAY`는 Collector 이후 capture를 기존 Normalizer → Scorer → Hard Conflict Detector → Decision Engine으로 실행한다. 제출자가 작성한 점수/추천 결과는 입력으로 받지 않는다. 정답 label은 출력 비교에만 사용한다. 운영 DB/Identifier/Queue를 쓰거나 Provider를 호출하지 않는다. 추출·검색 자체의 재현과 end-to-end Worker 성능은 별도 검증이 필요하다.

95점 이상·strong evidence·hard conflict 없음·truncation 없음의 기존 자동승인 **추천** 정책을 유지한다. 80~94 CANDIDATE, 60~79 REVIEW_REQUIRED 등 기존 경계를 변경하지 않는다. 이 작업에서 threshold tuning이나 실브랜드 규칙을 임의로 확정하지 않았다.

`RESOLVER_AUTO_ACCEPT_ENABLED=false`가 명시적 기본값이다. 현재 true는 config validation에서 거절한다. 아직 calibration/owner 승인과 실제 자동 promotion 연결이 없으므로 무시하거나 작동하는 것처럼 보이는 true를 허용하지 않는다. 기존 `promoteAuto()`도 계속 거절한다. 평가 PASS는 운영 활성화가 아니다.

## 입력 계약

정확한 계약은 [resolver-evaluation.ts](../packages/contracts/src/resolver-evaluation.ts), 구조 예시는 [golden-v1.json](../packages/resolver/test/fixtures/golden-v1.json)이다. 예시의 정답·근거는 모두 합성이며 실제 라벨로 재사용하면 안 된다.

| 필드 | 의미 |
|---|---|
| schemaVersion / datasetVersion | 현재 schema 1 및 변경 시 새 데이터셋 버전 |
| sourceKind / sourceDescription | REAL 또는 SYNTHETIC과 데이터 출처 설명. REAL 표기는 운영자 검수를 대체하지 않는다 |
| scope.brands / scope.categories | 이번 평가가 주장할 주요 브랜드·카테고리 canonical key |
| caseId / masterKey | 관측 사례 ID / 플랫폼·SKU를 넘어 동일 상품을 묶는 MASTER ID |
| split | TUNING 또는 HOLDOUT. MASTER·SKU·이미지 hash가 양쪽에 겹치면 거절 |
| skuKeys / imageHashes | 모든 관련 SKU 키와 이미지 SHA-256; 알려진 관계를 누락해 분리 검사를 우회하면 안 된다 |
| tags | NORMAL / NO_IDENTIFIER / SIMILAR_MODEL / GTIN_CONFLICT / COLOR_CONFLICT / VOLUME_CONFLICT / AI_ONLY |
| truth.identifiers | 운영자가 근거로 확인한 허용 식별자 `{identifierType,value}` 목록. 확인된 품번 없음은 빈 배열과 NO_IDENTIFIER; 미확인은 정답 없음과 다름 |
| truth.autoAcceptForbidden | 충돌·AI 단독 등 자동승인을 금지해야 하는 독립 정답. Detector가 같은 오류를 반복해도 평가가 잡도록 둔다 |
| truth.verifiedBy / verifiedAt / evidenceReference | 운영자 식별값, UTC 검수 시각, 정답을 검증할 수 있는 문서/라벨 등 근거 위치 |
| capture.reference / resolverVersion / registryVersion / providerVersion | 원본 capture 참조와 수집 시 구현·패턴·Provider 버전. 정답을 보고 capture를 수정하지 않는다 |
| capture.costUsd | 해당 capture의 기록된 비용. 모르면 null; 0으로 대체하지 않는다 |
| capture.evidenceOrigin | NON_AI / MIXED / AI_ONLY. AI 생성 값을 검증된 catalog 근거로 바꾸면 안 된다 |
| capture.collection | 생산 Collector 출력의 candidates/evidence, internalCatalogReferences, providerFailures, truncated |
| capture.conflictContext | production adapter/catalog에서 확인한 canonical facts. truth로 만들어 주입하지 않는다 |

레코드 10,000개, 파일 32MiB 등 경계가 있다. 기존 Evidence/Normalizer 검증을 재사용하며 비밀정보가 든 텍스트/JSON과 추가 점수 필드를 거절한다. 원본 XLSX는 정답 검수가 아니므로 현재 `examples/더망고_상품정보_20260913.xlsx`를 자동 라벨링하지 않았다. 실제 label/capture는 Git 제외 `data/` 등 별도 경로에 둔다.

## 고정 holdout과 실행

먼저 실제 label과 상품/자산 분리를 확인하고 평가 범위를 고정한다. tuning에만 규칙을 조정한다. 평가 전 빌드하고 lock을 생성해 별도 검수·보관한 뒤 holdout을 실행한다. 같은 holdout 결과를 보며 반복 튜닝한 사실은 hash로 탐지할 수 없으므로 운영자가 사용 이력을 관리해야 한다.

```powershell
pnpm build:packages
node scripts/evaluate-resolver.mjs seal data/resolver-labels-v1.json data/resolver-holdout-v1.lock.json
node scripts/evaluate-resolver.mjs evaluate data/resolver-labels-v1.json data/resolver-holdout-v1.lock.json data/resolver-evaluation-v1
```

`pnpm resolver:evaluate seal ...` / `pnpm resolver:evaluate evaluate ...`도 같은 CLI를 실행한다. 기존 lock과 출력 디렉터리를 덮어쓰지 않는다. 종료 코드 0은 seal 성공 또는 평가 PASS, 2는 보고서를 생성했지만 SYNTHETIC_ONLY/INSUFFICIENT_DATA/FAIL, 1은 입력/lock/build/출력 오류다. CLI 오류는 원본 값을 출력하지 않는다.

Lock은 holdout 레코드·정답·capture·범위와 빌드된 contracts/resolver JavaScript 파일들의 SHA-256을 고정한다. 변경이 발견되면 실행을 거절한다. 알고리즘 변경 시 기존 lock을 덮어쓰지 말고 새 버전으로 검수·재평가한다. 단순 tuning 레코드 내용 변경은 holdout hash를 바꾸지 않지만 MASTER/자산 누출은 다시 검사한다. 전체 dataset digest도 보고한다.

합성 fixture를 재현할 때는 `packages/resolver/test/fixtures/golden-v1.json`과 새 lock/출력 경로를 사용한다. 보관한 [lock](evaluations/p314-golden-v1.lock.json)은 기록 시점 코드에 대응하며 미래 빌드에서 불일치하면 정상적인 재평가 요구다.

## Gate와 분모

보완 명세 v0.2 §5.1의 실제 정답 상품 200건, 주요 브랜드/카테고리별 20건, holdout 자동승인 후보 100건, 오매칭/Hard Conflict/AI 단독 자동승인 0건을 적용한다. 반복 SKU/capture로 표본을 부풀리지 않도록 distinct MASTER도 세며, 보수적으로 holdout 자동승인 MASTER 100개와 holdout 내 각 주요 브랜드/카테고리 20개를 요구한다. 이 운영 전 제한을 완화하려면 별도 근거/결정이 필요하다.

holdout에 품번 없음·유사 모델·GTIN/색상/용량 충돌·AI 단독 사례를 포함한다. NO_IDENTIFIER와 각 충돌/AI 단독 사례는 독립 `autoAcceptForbidden=true`가 필수다. 이 회귀 지표의 PASS는 실제 label의 신뢰성·대표성·관계 누락을 자동 증명하지 않는다.

- precision = 정답 자동승인 후보 / 전체 자동승인 후보. 분모 0이면 null.
- coverage = 자동승인 후보가 하나 이상인 case / 전체 case. 잘못 승인한 case도 분자에 포함되므로 precision과 함께 해석한다.
- falseReviewRate = 정답상 자동승인 허용이며 정답 후보를 찾았지만 그 후보를 자동승인하지 않은 case / 정답상 자동승인 허용이며 정답 후보가 있는 case. 독립 금지 label은 이 분모에서 제외한다.
- missingCorrectCandidateCount는 품번이 알려진 case에서 정답 후보를 전혀 찾지 못한 건수다. 위 false-review와 구분한다.
- wrongAutoCount / unsafeAutoCount는 오매칭과 Detector 충돌/strong 부재/AI 단독/독립 금지 label의 자동승인 후보 수다.
- 처리시간은 replay의 실제 수행 시간이며 원 검색/네트워크/Queue 시간은 포함하지 않는다. 비용은 capture의 기록값 합계·알려진 건수·평균이다. missing cost는 null로 구분한다.
- tuning/holdout, 브랜드, 카테고리별 분모·오류·precision/coverage/false-review·score 구간, case별 정답 근거·capture 참조·버전과 오류를 JSON에 보존한다.

실제 표본 미달/미평가/실패 시 자동승격 OFF. 희귀 오류가 없다고 통계적으로 보장하지 않는다. 운영 활성화에는 label 검수, end-to-end 검증, current revision CI, 활성화 범위·버전·운영 책임자의 기록이 추가로 필요하다.

## 현재 결과와 다음 입력

DEC-20260915-028: P3-12 capture 저장/export 로컬 보완 완료. [RESOLVER_CAPTURE.md](RESOLVER_CAPTURE.md)의 `execution.payload.capture`를 독립 검수된 case.capture에 연결할 수 있다. export의 sourceKind/attempt/costScope 증거를 함께 보관하며, 비용은 완료된 attempt 범위다. 미분류/합성 출처를 자동 REAL로 전환하지 않는다. 실제 P3-14 보류와 auto OFF는 유지한다.

DEC-20260915-027: 사용자 요청으로 실제 검수/calibration은 보류한다. 먼저 P3-12 capture 보관·내보내기 등 독립 개발을 진행하며, 실제 정답·capture 확보 또는 재개 요청 시 이어간다. [Gate 사전검수와 재개 인수 메모](PHASE3_GATE.md)를 따른다. 입력 작성은 소수 상품의 품번·공식 근거부터 함께 확인하고 기술 관계/해시/capture 필드는 에이전트가 실제 데이터로 검증한다. 식별자 확인 자체가 독립 자동승인 금지 FALSE를 뜻하지 않는다.

2026-09-15 후속: 원본 26,375행을 재확인하고 실제 상품 200행의 검수 대기 XLSX를 준비했다. 원본 키 중복 제거와 200행 대조는 PASS지만 운영자 정답·capture는 아직 없다. 선택 기준·로컬 경로·검수 순서는 [실제 상품 검수 준비 기록](evaluations/p314-real-review-intake.md)을 따른다. 분할 UNASSIGNED, label 0, calibration NOT_RUN을 유지한다.

실제 검수 label 0건 확인, calibration NOT_RUN. 합성 11건(TUNING 1 / HOLDOUT 10)의 실제 replay 결과는 SYNTHETIC_ONLY이며 자동승인 후보 1건/오매칭 0건은 제품 정확도 근거가 아니다. P3-14를 완료하려면 운영자가 정답 품번 또는 검증된 품번 없음, 근거, MASTER/관련 SKU·이미지 관계, 브랜드·카테고리 범위를 제공해야 한다. 현재 비어 있는 실DB나 원본 XLSX만으로 이를 추정하지 않는다.
