# P3-12 실행 capture 저장·내보내기

기준일: 2026-09-15. DEC-20260915-028. 원본 Collector 출력과 판정 입력을 보관하고 로컬 CLI로 내보낸다. P3-14 실제 정답 검수/calibration은 사용자 요청 보류, 자동승격 OFF다.

## 저장 계약

기본 createResolverPipeline()은 captureRequired=true이며 최종 DecisionEngineResult와 executionCapture를 반환한다. collection에는 정규화 전 candidateValue/Evidence, catalog 참조, Provider 실패와 effective truncation을 보존한다. 초기 catalog probe 100개 제한도 truncation에 반영한다. conflictContext는 기존 catalog/brand adapter가 만든 canonical facts만 사용한다.

| 필드                         | 의미                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| schemaVersion                | 현재 1                                                                                                                                         |
| sourceKind                   | 기본 UNCLASSIFIED. 신뢰할 수 있는 호출자가 captureSourceKind로 REAL/SYNTHETIC 지정 가능. 실제 정답 검수/대표성 증명이 아님                     |
| startedAt / finishedAt       | pipeline 호출 시작·종료 UTC. DB commit 완료 시각과 다름                                                                                        |
| inputDigest / decisionDigest | 고정 Resolve Input / 최종 판정의 canonical JSON SHA-256                                                                                        |
| providerAttempted            | Provider port 호출 여부. HTTP 호출 또는 과금 발생을 의미하지 않음                                                                              |
| costScope                    | COMPLETED_ATTEMPT_ONLY: 완료된 해당 attempt의 capture 비용                                                                                     |
| capture                      | P3-14 ResolverEvaluationCaptureSchema 재사용: reference, resolver/registry/provider 버전, costUsd, evidenceOrigin, collection, conflictContext |

Worker는 기존 identifier_resolve_run.result_json.executionCapture에 runPublicId/sourceProductPublicId/attempt/payloadDigest envelope를 저장한다. reference는 resolve-run:<run UUID>:attempt:<n>이다. migration 003의 JSONB object를 사용하므로 새 migration은 없다.

저장 전에 strict shape·기존 raw/secret guard·비밀 텍스트·입력/판정 digest·resolverVersion을 검증한다. collection/context를 기존 Normalizer → Scorer → Detector → Decision Engine으로 재실행해 판정 digest를 확인한다. 불일치/크기 등 경계 초과/금지 데이터/필수 capture 누락은 INVALID_RESOLVER_CAPTURE로 terminal 실패한다.

capture·후보·최종 결과·성공 상태는 기존 attempt fence 아래 하나의 트랜잭션으로 저장한다. capture UPDATE 실패도 후보 INSERT까지 롤백한다. 과거 attempt의 늦은 응답과 성공 후 재배달은 저장한 capture를 교체하지 못한다. Source snapshot의 복사본을 pipeline에 넘긴다.

## 비용과 실패 범위

- ExternalCandidateResult 및 ExternalCandidateSource 성공 결과의 선택 costUsd는 해당 호출에서 기록된 값이다. generic Provider가 source의 기록 비용을 결과로 전달하고 pipeline은 누락을 null로 보존한다.
- requestCostMicrousd/예산 예약값을 실측 비용으로 환산하지 않는다. 현재 Brave 응답 adapter는 실측 비용을 제공하지 않아 외부 결과의 비용은 null이다. disabled/error 호출도 비용을 추정하지 않는다.
- strong local 결과로 Provider port를 생략하면 해당 attempt의 외부 Provider 비용은 0이다. CPU/DB/전체 인프라 비용을 측정한 값이 아니다.
- 재시도 전 실패·중단 attempt에는 완료 capture를 저장하지 않는다. SUCCEEDED로 저장된 마지막 attempt만 export한다. 이전 실패 호출의 비용을 합산한 run/account 과금 장부가 아니다. BLK-005의 공유 예산/계정 한도는 별도다.
- 마지막 attempt의 Provider 실패가 포함된 부분 결과도 기존 정책대로 SUCCEEDED/REVIEW_REQUIRED가 될 수 있으며 capture에 실패를 보존한다. 완전한 수집 성공으로 해석하지 않는다.
- 현재 Collector에는 AI Evidence 유형이 없어 production capture는 NON_AI다. 향후 AI 경로를 추가할 때 계약과 출처 추적을 함께 변경해야 한다.

## 로컬 내보내기

DB 연결 권한이 있는 운영자가 기존 data/ 디렉터리에 새 파일로 기록한다. 공개 HTTP endpoint나 검수 화면 다운로드 기능은 추가하지 않았다. 기존 검수 API DTO에는 capture/raw/비용/context가 노출되지 않는다.

```powershell
pnpm resolver:capture:export <run-uuidv7> data/capture-<run-uuidv7>.json
```

packages를 build하고 .env 또는 process DATABASE_URL로 연결한다. 직접 실행 시 빌드 후 아래 명령을 사용한다.

```powershell
node --env-file-if-exists=.env scripts/export-resolver-capture.mjs <run-uuidv7> data/capture-<run-uuidv7>.json
```

SUCCEEDED run을 읽고 payload·입력·판정 digest 및 run/source/attempt/version/reference를 검증한다. 과거 capture를 오늘의 알고리즘으로 다시 판정해 수정하지 않는다. 동일 저장 record는 동일 export 객체와 captureDigest를 반환한다. hash는 내용 변경 감지용이며 DB 쓰기 권한자가 hash까지 수정한 경우를 인증하는 서명이 아니다.

출력은 {schemaVersion, captureDigest, execution}이며 **execution.payload.capture**가 P3-14 case.capture에 대응한다. 전체 export 파일도 출처/attempt 증거로 함께 보관한다. 전체 Resolve Input은 출력하지 않지만 Evidence에는 상품별 값/근거 URL이 있으므로 Git 제외 data/ 등 승인된 로컬 경로에 둔다.

CLI는 새 파일만 생성한다(wx). 기존 파일·symlink를 덮어쓰지 않고 stdout에는 digest만 출력한다. POSIX 생성 권한은 0600이며 Windows는 대상 디렉터리 ACL을 따른다. 쓰기 도중 프로세스/장치 장애 시 부분 파일이 남을 수 있으므로 JSON/digest 검증 전에 사용하지 않는다. 실패 파일을 자동 덮어쓰지 않으며 새 경로로 재시도한다.

| 오류                      | 의미                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| CAPTURE_RUN_NOT_FOUND     | 대상 실행 없음                                                         |
| CAPTURE_RUN_NOT_SUCCEEDED | QUEUED/RUNNING/FAILED/CANCELLED                                        |
| CAPTURE_UNAVAILABLE       | legacy/custom/manual 등 capture 없는 완료 기록                         |
| INVALID_RESOLVER_CAPTURE  | capture 또는 연결/digest 불일치                                        |
| CAPTURE_OUTPUT_EXISTS     | 출력 파일 존재                                                         |
| CAPTURE_EXPORT_FAILED     | DB/권한/출력 경로 등 실패. 원본 DB 오류나 비밀값은 CLI에 출력하지 않음 |

성공 exit 0, 실패 exit 1이다. production pipeline은 capture 필수이며 이전 custom pipeline에는 선택 반환 계약을 허용한다. capture 없는 과거 기록을 최종 후보에서 역생성하지 않는다.

## 버전과 P3-14 연결

- orchestration v2로 올렸다. registry 정의/provider ID/sourceKind가 version hash에 포함된다. v1로 등록한 실행은 새 Worker에서 RESOLVER_VERSION_MISMATCH로 거절된다. Worker/등록 CLI 버전을 일치시키고 새 분석은 새 요청 ID로 접수한다.
- 이번 contracts/resolver 변경으로 P3-14 algorithm lock hash도 달라진다. 기존 보고서/lock을 수정하지 않는다. 재평가 시 새 lock/출력 경로를 만들고 holdout 사용 이력을 관리한다.
- export는 정답 label, MASTER/SKU/image 관계, 범위 또는 tuning/holdout을 생성하지 않는다. UNCLASSIFIED/SYNTHETIC capture를 자동으로 REAL 평가에 넣지 않는다. 실제 출처와 독립 label 검수 후 인수한다.
- P3-14 실제 calibration은 계속 보류한다. 합성 fixture 검증과 live/실제 정답 측정을 구분하며 Provider live/자동승격 OFF를 유지한다. 실행 증거는 TEST_REPORT 참조.
