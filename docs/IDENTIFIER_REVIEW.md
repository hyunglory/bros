# 품번 검수 UI/API — P3-13

기준: 2026-09-15, DEC-20260915-023. 로컬 구현·검증 완료, 운영 인증/원격 CI 검증 전 `IMPLEMENTED_NOT_VALIDATED`.

## 화면

Admin의 **품번 검수**(`/identifier-reviews`)에서 상품명·품번으로 후보를 조회한다. 상세에는 정규화 값, 점수, 판단 근거, 충돌, 결정 이력을 표시한다. 승인·거절 후 최신 상태를 다시 읽으며 이미 결정된 후보의 버튼은 비활성화한다. 거절과 직접입력은 판단 사유가 필수다.

**탐색 이력 · 후보 없음**을 선택하면 후보가 없는 실행도 조회하고 직접입력·재탐색할 수 있다. 직접입력은 연결된 MASTER가 있고 탐색이 완료된 실행에서 가능하다. 후보 없음은 임의 품번을 만들어내는 근거가 아니다. 재탐색 접수는 완료를 뜻하지 않으며 새로고침으로 상태를 확인한다.

## 공개 API

모든 경로의 접두사는 `/api/v1/identifier`다. ID는 UUIDv7 public ID만 사용한다.

| Method / 경로 | 입력·결과 |
|---|---|
| GET `/reviews` | `limit`(기본 50, 최대 100), `cursor`, `query`, `decision`, `runPublicId`; 후보 목록 |
| GET `/candidates/:publicId` | 후보·실행 요약, 공개 Evidence/Conflict/감사 이력 |
| GET `/runs` | `limit`, `cursor`, 상품명 `query`; 후보 없는 실행 포함 |
| GET `/runs/:publicId` | 실행 상태, 후보 수, MASTER version, 고정 오류/Provider 실패 코드 |
| POST `/candidates/:publicId/accept` | `{expectedVersion}`: 관측한 후보 버전 |
| POST `/candidates/:publicId/reject` | `{expectedVersion, reason}`: 후보 버전·거절 사유 |
| POST `/runs/:publicId/manual` | `{requestPublicId, expectedVersion, identifierType, candidateValue, reason}`: **MASTER** 버전·새 UUIDv7 요청 ID |
| POST `/runs/:publicId/re-resolve` | `{requestPublicId}`: 새 실행 접수, 202와 `publicId/status/statusUrl` |

저장 요청은 `Content-Type: application/json`, `x-bros-operation: identifier-review`가 필요하다. 브라우저 Origin이 있으면 요청 protocol/Host와 일치해야 하며 cross-site 요청은 거절한다. Vite `/api` 프록시는 `changeOrigin: false`로 Host를 보존한다. 실제 HTTPS reverse proxy의 신뢰/Origin 설정은 P6-01 운영 인증 연결에서 검증한다.

## 인증과 오류

- 기본 업무 API는 503으로 닫힌다. 기존 `API_LOCAL_UNAUTHENTICATED=true`는 비운영 loopback 설정에서만 허용되고 actor는 서버의 `local-identifier-reviewer`다.
- `createApiApp`의 `identifierReviewAuthorize`는 서버 전용 인증 연결 포트다. 검증된 principal의 actor를 반환하거나 인증 실패 시 null(401)을 반환한다. 클라이언트 body/header로 actor를 지정할 수 없다. 실제 Caddy/basic_auth 연동은 아직 없다.
- 400 입력 오류, 401 인증 필요, 403 출처/operation 거부, 404 대상 없음, 409 버전·결정·식별자 충돌, 429 Queue 상한, 503 준비/저장 실패를 고정 envelope로 반환한다. raw DB/Provider 예외를 반환하지 않는다.
- public DTO는 원본 JSON·내부 ID·Queue receipt를 제외한다. 근거 URL의 query/fragment를 제거하며 인증정보가 포함된 URL은 제외한다. 원본 Evidence는 DB에서 보존한다.

## 결정·동시성·재시도

- 승인은 P3-11 원자적 promotion을 호출한다. source snapshot, 후보 version, 정규화, conflict, P2/P3 의미상 중복과 MASTER scope를 다시 검사한다. 기존 identity lock·confidence·primary·감사 보존 정책을 유지한다.
- 거절은 후보 row lock과 version 검사를 거쳐 MANUAL_REVIEW를 append한다. 승인·거절 경합은 한 결정만 성공한다. 같은 actor/version/reason의 거절 replay는 이력을 중복 생성하지 않는다.
- 직접입력은 원 실행·후보를 수정하지 않고 새 `manual-review/v1` 실행/후보를 생성한다. 형식 정규화, 승인 브랜드 alias, 검증된 catalog/hard conflict와 기존 promotion 중복 검사를 통과해야 승격된다. ACTIVE와 P2의 REVIEW_REQUIRED MASTER를 허용하고 INACTIVE는 거부한다. 추정 color/variant/volume fact를 만들지 않는다.
- 직접입력의 새 실행, SUBMITTED 감사, 후보, Identifier, MASTER, 승인 감사, 요청 receipt는 한 transaction이다. 실패하면 모두 rollback한다. `manual:<requestPublicId>`가 요청을 식별하며 동일 입력 replay는 저장된 결과를 반환한다. 요청 ID 재사용 시 내용/actor가 다르면 409다.
- 재탐색은 P3-12 admission을 사용해 새 snapshot/run과 Queue를 원자적으로 접수한다. actor/originRunPublicId를 queue_json에 보존한다. 동일 요청 replay는 같은 실행과 현재 상태를 반환한다. 원 실행은 보존한다.
- 화면은 연속 클릭을 막고 불확실한 응답 후 같은 직접입력/재탐색 요청 ID를 유지한다. 화면을 새로 고친 뒤에는 목록·감사 이력으로 기존 처리 여부를 먼저 확인한다.
- 자동승격 OFF. Provider 기본 disabled 및 BLK-005 전역 한도/공유 예산 제한을 유지한다.

## 모듈 경계와 검증

공용 `@bros/contracts`는 브라우저가 읽는 계약과 순수 정규화 함수를 내보낸다. Node SHA-256 기반 `compatibleIdentityLockKeys`는 `@bros/contracts/server`에서 가져온다. namespace·hash·정렬·P2/P3 dual lock 계산은 변경하지 않았다. API와 Worker는 `@bros/resolver`의 `configuredResolverPipeline`을 공유하며 API가 Worker 실행 모듈을 import하지 않는다.

검증 명령과 실제 결과는 TEST_REPORT의 P3-13 절을 따른다. 로컬 DB fixture/browser 검증은 운영 DB migration, 인증 배포 또는 calibration PASS가 아니다. 실제 DB에 002/003을 적용하기 전 배포 절차와 current revision CI 증거를 확인해야 한다.
