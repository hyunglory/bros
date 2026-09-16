# P3-12 Resolver Batch Worker / Orchestration

## 실행 계약

- `enqueueResolveBatch(database, queue, { requestPublicId, sourceProductPublicIds, resolverVersion }, options)`가 source별 immutable snapshot과 `identifier.resolve` 메시지를 같은 PostgreSQL 트랜잭션에서 저장한다.
- 요청은 UUIDv7, source ID 1~10,000개다. 같은 목록의 중복 source는 제거한다. 기본 100개씩 목록을 순회하되 트랜잭션은 상품별이다. 한 상품의 enqueue 실패는 다른 상품을 롤백하지 않는다. 응답의 각 상품은 `ACCEPTED`, `REPLAYED`, `ERROR`다.
- 멱등성 키는 `requestPublicId:sourceProductPublicId`다. 같은 요청 UUID와 source를 재전송하면 terminal을 포함한 기존 run을 돌려준다. 같은 키에 다른 resolverVersion은 거부한다. 등록 실패만 같은 요청으로 재시도할 수 있다. 완료·실패·취소 run을 새로 분석하려면 새 요청 UUID를 사용한다.
- 동시 admission과 활성 run 개수 검사는 짧은 advisory transaction lock으로 직렬화한다. 기본 활성 상한은 1,000개이며 초과 상품은 `RESOLVE_BACKPRESSURE`다. 다른 요청 UUID로 같은 source를 의도적으로 재분석하는 것은 허용한다.
- Queue payload는 `{ publicId: runPublicId }` 하나뿐이다. 원본 raw/import, 후보, credential은 Queue 메시지에 넣지 않는다.

## DB와 실행 상태

Migration `003-resolver-orchestration`이 기존 run에 다음 컬럼을 추가한다. 업무 테이블은 18개를 유지한다.

| 필드 | 용도 |
| --- | --- |
| `admission_key` | nullable unique 요청/source 키, 기존 P3-01 run은 null |
| `queue_json` | P3-12/v1 receipt, attempt, 실행 상태 |
| `result_json` | Decision Engine 전체 결과, 추천·score breakdown·provider failure·truncation·버전·자동승격 OFF 기록 |

`input_json`은 변경하지 않는다. Worker는 receipt/provider/attempt를 확인하고 실행을 점유한다. 새 retry attempt만 이전 RUNNING을 인수할 수 있다. 결과 저장 시에도 같은 attempt인지 다시 확인하므로 오래된 실행이 새로운 결과나 취소를 덮어쓰지 못한다. HTTP 호출 중 DB transaction을 유지하지 않는다.

- `QUEUED → RUNNING → SUCCEEDED / FAILED`이며 재시도 대기는 run `QUEUED`, queue metadata `RETRY_WAIT`다.
- 후보 INSERT와 결과·SUCCEEDED 저장은 한 트랜잭션이다. 실패 시 후보도 롤백한다.
- 후보의 실제 `decision_status`는 항상 `CANDIDATE`로 시작한다. `result_json.candidates[].recommendedDecision`은 추천 이력이다. P3-11 수동 승인은 별도이며 이 Worker는 MASTER/identifier를 생성하거나 승격하지 않는다.
- 일반 처리 예외는 고정 `RESOLVER_FAILED`, 제한/시간 초과는 고정 code로 저장한다. pg-boss의 기본 retry 2회(최대 3 attempt)를 사용한다.
- Provider의 RATE_LIMIT/CIRCUIT_OPEN/TIMEOUT/EXTERNAL_SEARCH_FAILED 결과는 남은 retry가 있으면 재시도한다. 마지막 attempt에 정상적인 pipeline 결과가 있으면 부분 결과와 실패 근거를 보존해 SUCCEEDED로 종료한다. 후보가 없더라도 이런 결과는 REVIEW_REQUIRED이며 정상 NOT_FOUND와 구별된다. pipeline 자체가 실패하면 FAILED다.
- 기존 P3-01 `start/succeed/fail`로 Queue 관리 run을 직접 바꿀 수 없다. `cancel`은 허용하며 terminal delivery는 재처리하지 않는다.

## Pipeline과 Provider

승인된 P2 brand alias 조회 → P3-03 extraction 및 import의 명시적 식별자(WEAK SOURCE_FIELD) → 타입별 정규화 → verified catalog 조회 → Evidence/Normalizer/Scorer/Conflict/Decision 순서다. 내부 식별자 조회는 run당 최대 100개이며 초과는 truncation으로 기록한다. 브랜드·상품명 exact reference도 보존한다. 내부의 강한 근거로 모든 후보가 auto eligible이면 유료 fallback을 생략한다.

기존 `AB-123` 등 P2 저장 norm은 DEC-20260915-021의 비교 키로 Evidence에 연결한다. 저장 norm을 다시 쓰지 않는다. source brand는 승인된 alias만 사용하며 catalog brand와의 충돌은 canonical facts로 전달한다. variant/color/volume의 임의 문자열 해석은 하지 않는다.

배포 registry JSON은 P3-02 계약 `{ version, patterns }`와 안전한 regex 검증을 통과해야 한다. 미설정 기본 registry는 빈 목록이다. 실제 브랜드의 패턴 정확도를 검증한 것으로 간주하지 않는다. resolverVersion은 orchestration 버전 + registry 정의/provider ID의 SHA-256이며 큐 등록 시 버전과 Worker 버전이 다르면 `RESOLVER_VERSION_MISMATCH`로 실패한다. 정책·알고리즘 변경 시 orchestration 버전도 올려야 한다.

한 Worker가 Provider 인스턴스와 직렬 호출 대기열을 공유한다. 호출 완료 후 설정된 최소 간격을 기다린다. Provider 자체 timeout/429 Retry-After/circuit/budget guard도 적용된다. 대기 중 abort는 호출을 시작하지 않으며 실행 timeout과 queue abort는 Provider에 전달한다.

**실운영 Brave는 기본 disabled이며 환경변수로 활성화할 수 없다.** fixture Provider는 WorkerOptions의 pipeline 주입으로만 검증했다. DEC-20260915-029에서 계정 단위 공유 예산·전역 호출 제한을 PostgreSQL adapter와 독립 pool/프로세스 fixture로 보완했다. [PROVIDER_QUOTA.md](PROVIDER_QUOTA.md)의 migration 004와 동일 계정/정책 주입이 필요하다. BLK-005의 실제 계약·저장 권한·키·가격/한도 및 기본 Worker live 연결은 후속 운영 통합이다. 기존 메모리 예산/Worker 내부 간격 자체를 전역 제한으로 해석하지 않는다.

## 시작과 복구

1. 대상 DB에 migration 003까지 적용한다. 이번 검증은 일회용 DB에만 적용했다. 실제 BROS DB의 migration 적용은 별도다.
2. 승인 registry가 있으면 `RESOLVER_PATTERN_REGISTRY_PATH`에 JSON 경로를 지정한다. Worker와 enqueue CLI는 같은 registry를 사용한다.
3. `pnpm worker:start`로 Worker를 시작한다.
4. `pnpm worker:resolve <request-uuidv7> <source-uuidv7> [source-uuidv7 ...]`로 등록한다. CLI는 item별 결과를 출력하며 하나라도 ERROR이면 exit 1이다. 동일 요청 UUID를 보관해 부분 등록 재시도에 사용한다.

| 환경변수 | 기본값 | 범위 |
| --- | --- | --- |
| `RESOLVER_CONCURRENCY` | 4 | 1~16, Worker 프로세스별 |
| `RESOLVER_CHUNK_SIZE` | 100 | 1~1,000 |
| `RESOLVER_MAX_QUEUED_RUNS` | 1,000 | 1~10,000 |
| `RESOLVER_RUN_TIMEOUT_MS` | 120,000 | 100~600,000 |
| `RESOLVER_PROVIDER_MIN_INTERVAL_MS` | 1,000 | 1~60,000 |
| `RESOLVER_PATTERN_REGISTRY_PATH` | 빈 값 | 선택 JSON 파일, 최대 1MiB |

프로세스가 종료되면 pg-boss의 만료·재시도가 같은 run을 복구한다. 기본 queue 만료는 900초이므로 즉시 인수되지 않을 수 있다. Worker는 시작 시와 이후 10초마다 최대 100개씩 keyset 순회하며 활성 run과 Queue terminal 상태를 대조한다. 마지막 attempt 중 종료된 run은 Queue FAILED 확인 후 `RESOLVE_RETRIES_EXHAUSTED`로 정리한다. receipt가 사라졌거나 Queue가 완료됐는데 run은 미완료이면 `RESOLVE_QUEUE_INCONSISTENT`로 실패 처리한다. 성공을 추정하거나 비용이 발생할 수 있는 호출을 임의로 다시 enqueue하지 않는다. 재분석은 새 요청 UUID로 명시한다.

`QueuePort.inspect`를 제공하지 않는 테스트/custom adapter는 reconciliation이 생략된다. 기본 pg-boss adapter는 지원한다. 배포 시 새 Queue adapter에도 이 기능이 필요하다. Worker 종료는 reconciliation 및 Queue 처리를 정리한 뒤 DB를 닫는다.

## 후속

2026-09-15 capture 보완(DEC-20260915-028): 기본 pipeline v2는 정규화 전 Collector 출력·conflict facts·버전/시각·기록 비용을 필수 반환하고 Worker가 후보/성공 결과와 같은 트랜잭션의 result_json.executionCapture에 저장한다. [capture 계약과 export CLI](RESOLVER_CAPTURE.md)를 따른다. 완료된 attempt의 비용만 표현하며 이전 실패 호출 비용은 합산하지 않는다. 새 migration은 없으며 기존 003까지 필요하다.

P3-13 품번 검수 UI/API에서 이 내부 run 조회를 그대로 노출하지 말고 공개 UUID 기반 안전한 DTO와 인증 actor/version CAS를 사용한다. `input_json`, Queue provider ID, raw Provider 자료는 공개 응답에 포함하지 않는다. P3-14 holdout과 Phase 3 Gate 전에는 자동승격을 활성화하지 않는다.
