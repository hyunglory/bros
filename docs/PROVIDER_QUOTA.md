# BLK-005 — 공유 예산과 계정 전체 호출 제한

기준일: 2026-09-15. DEC-20260915-029. PostgreSQL 구현과 합성 검증을 완료했다. 실제 Provider 계약·저장 권한·가격/한도·키 주입·live smoke는 별도이며 기본 Provider와 자동승격은 OFF다.

## 공유 범위와 저장

`createPostgresProviderQuota(database, policy)`가 `ProviderRequestQuota`를 구현한다. migration `004-provider-quota`가 필요하며 `bros_provider` 인프라 schema를 사용한다. 기존 `app` 18개 업무 테이블/259개 컬럼은 바꾸지 않는다.

- `account`: 계정 정책, 진행 중 reservation ID, 다음 허용 시각.
- `daily_budget`: 계정과 DB UTC 날짜별 예약 비용 누계.
- `reservation`: 호출별 UUID, Provider 구현 ID, 실행 주체, 예약 날짜/비용/시각, ACTIVE/RELEASED/RECOVERED 상태와 복구 감사 기록.

동일 실제 과금 계정은 **같은 DB와 `providerKey`, `accountKey`**를 사용해야 한다. `providerKey`는 `brave` 같은 고정 서비스/과금 namespace다. adapter 버전인 `providerId`와 분리하므로 버전 교체가 예산을 초기화하지 않는다. 키 교체/Worker 재시작 때도 계정 별칭을 유지한다. 다른 DB나 별칭을 쓰는 호출 및 BROS 외부 소비자는 합산할 수 없으므로 운영 계정 매핑과 예산 배분을 먼저 확정한다.

`ownerId`는 프로세스 실행 주체를 식별하는 비밀이 아닌 별칭으로, 재시작마다 구분 가능하게 설정한다. 계정·Provider·owner 이름에 API key/토큰을 넣지 않는다. 문자열 guard가 모든 비밀을 판별하는 것은 아니다.

## 정책

| 필드                        | 의미                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `providerKey`, `accountKey` | 각각 1~64자 ASCII 식별자; 계정 공유 키                        |
| `providerId`, `ownerId`     | 각각 1~128자 ASCII 식별자; adapter 버전과 프로세스 실행 주체  |
| `dailyBudgetMicrousd`       | 계정의 일일 예약 상한; 양의 safe integer                      |
| `requestCostMicrousd`       | 한 HTTP 시도의 최대 과금 예약액; 일일 상한 이하               |
| `minIntervalMs`             | 실제 callback 완료 후 다음 호출까지 최소 간격; 1~86,400,000ms |
| `rateLimitCooldownMs`       | 429/수동 복구 후 기본 대기; 1~86,400,000ms                    |

1 USD = 1,000,000 microusd. 예산과 요청 가격은 합성 fixture 값을 운영 기본값으로 사용하지 않는다. 첫 사용에서 정책이 저장되고, 같은 계정의 예산·요청 가격·간격·cooldown이 다르면 `QUOTA_POLICY_MISMATCH`로 거절한다. 실행 주체와 adapter 버전은 달라도 같은 정책을 공유할 수 있다. Brave policy와 quota 인자도 일치해야 한다.

정책 변경 API와 자동 초기화는 없다. 운영 정책 변경은 모든 기존 호출 주체의 종료를 확인하고 진행 중 예약을 정리한 뒤, 기존 일별 누계를 보존하는 별도 변경 절차로 검토한다. 계정 삭제/새 별칭 생성/일별 누계 초기화로 한도를 갱신하지 않는다.

## 호출 흐름과 실패 경계

1. secret/query 검증 후 짧은 DB transaction에서 계정 행을 잠근다. 진행 중 호출 또는 대기 시간이 있으면 비용 증가 없이 RATE_LIMIT을 반환한다.
2. 행 잠금 획득 후 **DB wall clock의 UTC 날짜**로 상한 검사·누계 증가·ACTIVE 예약·계정의 진행 중 표시를 원자 저장한다. Worker 날짜와 transaction 시작 시각을 사용하지 않는다.
3. commit 성공 후 callback이 HTTP를 실행한다. DB connection/transaction을 HTTP 동안 잡지 않는다. 자동 재시도와 미래 호출 슬롯 선예약은 없다.
4. callback이 실제로 끝나면 reservation을 RELEASED로 바꾸고 DB 시각 기준 다음 허용 시각을 기록한다. 실패·timeout도 예약 비용은 환불하지 않는다.
5. 429면 기본 cooldown과 Provider retry-after 중 긴 시간을 공유한다. 호출자 timeout 뒤 늦게 도착한 429도 반영한다. 적용 범위는 현재 Provider 계약과 동일하게 최대 24시간이다.

계정당 진행 중 callback은 하나이며, 완료 뒤 간격을 추가한다. 따라서 시작 시각 간 최소 간격보다 보수적이다. burst를 허용하는 token bucket은 제공하지 않는다. 계약에 별도 분/월 window가 있으면 이 정책만으로 모두 충족한다고 가정하지 않는다.

상위 Provider deadline이 끝나도 transport가 abort를 무시하면 실제 callback 종료까지 ACTIVE를 유지한다. commit 뒤 취소되어 HTTP가 시작되지 않아도 예약을 보존한다. 프로세스 중단/DB 응답 불명확/완료 저장 실패 때도 ACTIVE와 비용이 남을 수 있으며, 중복 호출 방지를 위해 **자동 만료시키지 않는다**. 예약은 예약일에 귀속된다. 자정을 가로지르는 실행과 Provider 청구일은 다를 수 있으므로 이 장부를 청구서로 해석하지 않는다.

DB 실패는 `QUOTA_STORAGE_FAILED`, 정책 불일치는 `QUOTA_POLICY_MISMATCH`처럼 고정 code만 전달한다. Brave 공개 결과는 기존 `EXTERNAL_SEARCH_FAILED` 경계로 감싸며 SQL/DSN 원문을 노출하지 않는다. DB가 불가능하면 메모리 예산으로 대체하지 않는다.

## 서버 내부 연결

```ts
const quota = createPostgresProviderQuota(database, approvedQuotaPolicy);
const provider = createBraveSearchProvider({
  registry,
  mode: "fixture",
  policy: approvedProviderPolicy,
  quota,
  secretProvider: fixtureSecretProvider,
  transport: fixtureTransport,
});
```

위 예시는 주입 경로이며 운영 활성화 명령이 아니다. live 생성에는 계약/저장 권한 승인, 실제 SecretProvider, 동일 정책의 shared quota가 모두 필요하다. 기존 `budget.reserve`는 fixture 호환용이며 quota 사용 시 이중 차감하지 않는다. `scope=SHARED_DURABLE`인 budget만으로 live를 허용하지 않는다. 구현의 scope 선언만으로 외부 custom adapter의 실제 내구성을 검증할 수 없으므로 운영에는 검증한 adapter를 주입한다.

기본 Worker pipeline은 여전히 disabled Provider를 생성한다. 환경변수만으로 live를 켤 수 없다. production 구성 연결과 승인된 계정 정책/SecretProvider 주입은 운영 입력 확정 후 후속 작업이다.

## 중단된 호출 확인과 복구

운영 권한을 가진 서버 내부 도구에서 같은 계정/정책으로 조회한다. 이 메서드는 공개 API/검수 UI에 연결하지 않는다.

```ts
const state = await quota.inspect();
// null: 아직 계정 예약 없음.
// 그 외: activeReservationId, ownerId, nextAllowedAt, utcDay,
// reservedMicrousd, dailyBudgetMicrousd. 금액은 손실 없는 decimal 문자열.
```

ACTIVE가 있으면 owner 프로세스와 transport가 종료했거나 callback이 완전히 종료했음을 먼저 확인한다. timeout 경과만으로 종료를 추정하지 않는다. 종료가 불확실하면 호출 차단을 유지한다. 확인한 예약 ID와 비밀을 포함하지 않는 actor/사유로 복구한다.

```ts
await quota.recoverAbandoned({
  reservationId: confirmedReservationId,
  actor: operatorAlias,
  reason: confirmedTerminationReason,
});
```

현재 ACTIVE ID가 일치할 때만 RECOVERED와 완료 시각/actor/사유를 원자 저장하고, 진행 중 표시를 해제한 후 cooldown을 적용한다. 오래된 ID·반복 복구는 `QUOTA_LEASE_CONFLICT`다. 비용은 그대로 남는다. DB에 직접 DELETE/UPDATE하여 복구하거나 active lease에 TTL을 추가하지 않는다.

## 검증과 비용 해석

단위 검증: `node --test packages/resolver/test/provider-quota.test.mjs`.
전용 PostgreSQL fixture 검증: build 후 `TEST_DATABASE_URL`을 전용 테스트 서버로 지정하고 `node --test tests/integration/provider-quota.integration.test.mjs`.

독립 DB pool/실제 child process 경쟁, 예산 소진/버전 변경 공유, DB UTC/계정 격리, 예약 rollback/행 잠금 중 취소, 완료 transaction 실패, 공유 429, 강제 종료·재생성·감사 복구, abort 무시 transport와 migration down/up을 검증한다. 테스트는 실제 API를 호출하지 않는다.

이 장부는 보수적인 **예약 비용**이다. capture의 `COMPLETED_ATTEMPT_ONLY` 실측 비용, 실제 청구액, 전체 run별 비용 보고서를 대체하지 않는다. P3-14의 실제 정답·capture 검수는 사용자 보류 상태를 유지한다.
