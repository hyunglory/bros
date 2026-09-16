# P3-05 — External Candidate Provider / Brave Web Search

기준일: 2026-09-15. 결정: DEC-20260915-006. 개발 계약과 운영 활성화 조건을 구분한다.

## 범위와 결과

- `@bros/resolver`의 `ExternalCandidateProvider.search({ brandKey, input })`는 P3-01 snapshot과 canonical brand key를 받는다. P3-04 internal exact 조회 계약은 유지한다. 실제 파이프라인 연결과 DB 저장은 후속 작업이다.
- 성공은 `CANDIDATES` 또는 `NOT_FOUND`, 실패는 `ERROR`와 고정 `code`다. 실패에는 후보가 없으며 검색 결과 없음으로 처리하지 않는다.
- `createBraveSearchProvider`의 ID는 `brave-web-search-v1`. title/description은 TITLE 패턴, URL pathname/query value는 URL 패턴으로 검사한다. description은 DESCRIPTION surface로 구분한다.
- 각 후보는 type/value와 SEARCH_RESULT/WEAK 근거를 가진다. URL, 수집 시각, 검색 순위, surface/locator, match offset/text, pattern ID/version을 보존한다. URL fragment는 제거한다. 여러 근거의 동일 식별자는 그대로 유지한다.
- 검색 순위는 confidence가 아니다. 공식 도메인 검색 결과도 snippet만으로 강한 근거로 승격하지 않는다. normalization/dedup/score/decision은 후속 책임이다.

## 공식 API와 사용 조건

아래 공식 문서를 2026-09-15 확인했다. 어댑터 선정은 계약 체결이나 운영 승인 증거가 아니다.

- [Web Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get): 고정 HTTPS GET `https://api.search.brave.com/res/v1/web/search`, `X-Subscription-Token` header. query 최대 600자/75단어, count 최대 20. 어댑터는 web만 요청하고 spellcheck/text decorations/operators를 끈다.
- [Rate limiting](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting): 429와 Remaining/Reset의 여러 window를 처리한다. reset은 현재부터의 초다. Retry-After와 소진 window 중 긴 대기를 적용한다. remaining이 없으면 reset 중 긴 값을 사용한다.
- [사용약관](https://api-dashboard.search.brave.com/terms-of-service)과 [공식 FAQ](https://brave.com/search/api/): 일반 약관의 결과 저장·캐시·재배포 제한을 확인하고 BROS 후보·근거 보존에 필요한 명시적인 storage rights를 확보해야 한다. 실제 계약/plan 확인 전 live를 활성화하지 않는다. 검색 결과 URL의 제3자 페이지 권리가 함께 부여되는 것은 아니다.
- [개인정보 처리 안내](https://api-dashboard.search.brave.com/privacy-policy): query는 Provider 정책 적용 대상이다. raw/import/내부 ID/원본 상품 URL을 보내지 않고 브랜드명과 상품명만 사용한다. 해당 필드에 비밀·개인정보를 넣지 않는 입력 정책을 유지한다.
- 실제 요금을 코드에 고정하지 않는다. 계약의 요청당 최대 청구액과 사용 한도를 운영 설정에 반영한다. 테스트의 가격 숫자는 합성 fixture다.

## 생성 및 활성화 계약

옵션은 서버 내부 코드에서 주입한다. 환경변수 자동 로딩과 Worker 등록은 아직 연결하지 않았다.

| 옵션 | 의미 |
|---|---|
| `registry` | 배포 시 검증한 immutable Brand Pattern Registry |
| `mode` | 기본 disabled; fixture는 주입 transport 필수; live는 고정 실제 endpoint 사용 |
| `secretProvider` | 공통 SecretProvider, key name `provider.brave.apiKey` |
| `termsApproved`, `storageRightsApproved` | live는 모두 true 필수. 계약 확인 기록을 먼저 확보 |
| `policy.timeoutMs` | secret·예산 예약·HTTP·body 전체 제한, 1~60,000ms |
| `policy.minIntervalMs` | instance 내 최소 요청 간격, 1~86,400,000ms; 동시에 하나만 실행 |
| `policy.failureThreshold` | 연속 실패 차단 임계치, 1~100 |
| `policy.circuitOpenMs`, `rateLimitCooldownMs` | circuit/429 기본 대기, 각각 1~86,400,000ms |
| `policy.requestCostMicrousd` | 호출 전 예약하는 보수적인 최대 비용. 1 USD = 1,000,000 microusd |
| `policy.maxRequestCostMicrousd`, `dailyBudgetMicrousd` | 요청/일일 상한. 모든 비용은 양의 safe integer이고 예약액 이상 |
| `budget` | fixture 메모리 예산 호환용. quota가 있으면 사용하지 않음 |
| `quota` | live는 `scope=SHARED_DURABLE`인 ProviderRequestQuota 필수; 예산과 전역 호출 admission을 함께 적용 |
| `transport`, `now` | fixture 전용. live에 전달하면 구성 오류 |

EnvSecretProvider 사용 시 키 환경변수 이름은 `BROS_SECRET_PROVIDER_BRAVE_API_KEY`다. 값은 문서/fixture/로그/채팅에 넣지 않는다.

```ts
const provider = createBraveSearchProvider({ registry }); // 기본 disabled
const result = await provider.search({ brandKey, input: resolveSnapshot });
```

live는 승인 flags, SecretProvider, 모든 policy 필드와 공유 quota 구현을 함께 전달한다. 설정 누락/잘못된 값은 HTTP 없이 PROVIDER_NOT_CONFIGURED, 기본 모드는 PROVIDER_DISABLED다.

## 공유 예산 포트와 운영 통합

DEC-20260915-029에서 `ProviderRequestQuota.execute(request, perform)`와 PostgreSQL adapter를 추가했다. 예산 예약과 계정 전체 호출 제한을 하나의 admission으로 적용한다. migration 004, 고정 Provider/계정 별칭, DB UTC, 완료 후 간격 및 장애 복구 절차는 [PROVIDER_QUOTA.md](PROVIDER_QUOTA.md)를 따른다. SHARED_DURABLE 선언만으로 custom 구현의 내구성을 증명하지 않는다.

- 모든 HTTP 시도 전에 비용을 예약한다. 실패/timeout/응답 불명확 시 환불하지 않는다. 실제 과금 상한으로 예약한다.
- 예산 소진/예약 실패는 HTTP 없이 종료한다. timeout 후 늦은 예약 완료가 비용을 차감할 수 있지만 늦은 HTTP는 시작하지 않는다.
- `createFixtureProviderBudget()`는 UTC 일별 메모리 예약이다. 재시작 시 사라지므로 live에서 차단한다.
- PostgreSQL 공유 adapter의 원자성·재시작·다중 Worker/프로세스·계정 한도를 합성 fixture로 검증했다. ACTIVE는 실제 callback 종료까지 유지하며 자동 만료/환불하지 않는다. 운영 배포와 기본 Worker live 연결은 아직 하지 않았다.

## 장애 및 자원 제한

- body 512 KiB, 결과 20개, 후보 200개 제한. 초과 body는 INVALID_SOURCE_DATA. 결과/후보 초과 및 512자를 넘는 후보 제외는 truncated=true다.
- 잘못된 JSON/type/URL, secret 포함 주요 필드, 잘못된 결과 row는 전체 INVALID_SOURCE_DATA로 격리한다. 반환하지 않는 부가 필드는 폐기한다. 추가 snippet/본문 fetch는 없다.
- secret/budget/transport throw는 EXTERNAL_SEARCH_FAILED, 429는 RATE_LIMIT, 기타 non-200은 EXTERNAL_SEARCH_FAILED다. 오류/응답 원문을 로그하거나 반환하지 않는다.
- 연속 TIMEOUT/RATE_LIMIT/INVALID_SOURCE_DATA/EXTERNAL_SEARCH_FAILED에서 circuit를 연다. 기간 후 하나의 복구 요청, 성공 시 초기화, 실패 시 재차단한다. 설정/사전 입력/예산 오류와 로컬 간격 차단은 장애 횟수에 추가하지 않는다.
- 자동 재시도/페이지 추가 요청은 없다. 호출자는 ERROR와 NOT_FOUND를 구분한다. 인스턴스를 Worker별로 재사용한다.
- 결과 URL은 근거로만 반환한다. HTTP는 고정 Brave endpoint에 보내며 redirect를 거부한다. fixture transport는 합성/loopback 테스트에만 사용한다.

## 검증 상태

로컬 단위/loopback HTTP 및 PostgreSQL 공유 quota 검증은 TEST_REPORT 참조. 실제 키·운영 API·계약/저장 권한·배포 및 remote CI는 NOT_RUN이다. BLK-005는 live 활성화에 적용하며 fixture 구현을 중단시키지 않는다.
