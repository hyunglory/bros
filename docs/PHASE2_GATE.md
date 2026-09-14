# Phase 2 Gate — 실제 XLSX 재import 검증

기준일: 2026-09-14. 판정: **조건부 통과 — 공식 PASS 보류** (`IMPLEMENTED_NOT_VALIDATED`).

P2-01~16 구현의 로컬 회귀와 실제 대표 20행의 재import 검증은 완료했다. 현재 구현 revision의 원격 CI 증거가 없으므로 전체 Phase 2를 PASS로 변경하지 않는다. 이 판정은 Waiver나 운영 배포 승인이 아니다. 결정 기록은 `DEC-20260914-016`, 남은 조건은 `BLK-004`다.

## 판정 근거와 범위

- 기준: `doc/BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md`의 Phase 2 Gate(835~849행), `doc/BROS_구현_보완_명세_v0.2.md` 6장, `docs/DECISIONS.md` DEC-20260914-015 인수 조건.
- 구현 기준: `646cb49c8217358f2075d8df746adf6d1bb404d0` (`codex/p1-foundation`). 이번 변경은 검증 스크립트와 증거 문서이며 도메인 구현을 변경하지 않았다.
- 실행: Windows/Node 24, 격리 PostgreSQL **18.6**, 실제 XlsxImportAdapter → validation/raw persistence → pg-boss → Worker의 Source/MASTER/SKU/Image/Tracking pipeline → Fastify 조회 API. Worker runtime 두 개는 같은 Node 프로세스에서 독립 DB pool과 Queue consumer를 사용한다.
- XLSX 업로드 endpoint 또는 브라우저 업로드 E2E가 아니다. 현재 업로드 endpoint는 없으며 검증 스크립트가 내부 validation/enqueue 계약을 호출한다. API 확인은 Fastify `inject`이고 UI는 별도 Admin 테스트 증거다.

| WBS Gate 조건 | 로컬 판정 | 실행 증거와 제한 |
|---|---|---|
| 실제 샘플 데이터 Import 성공 | 정상/거절/검수 처리 PASS | 실제 20행 중 유효 16행 Source·이미지 등록 및 검수 완료, 필수 ID 없는 4행 명시적 거절. 업무 batch는 `PARTIAL_FAILED`이며 상품 전건 SUCCESS가 아니다. |
| 재 Import 멱등성 | PASS | 최초·동일 수집 시각 재import·동시 두 재import·새 수집 시각 재import의 5회에서 Source 16/이미지 35 및 공개 UUID 불변. 같은 batch 반복 enqueue도 동일 receipt. |
| MASTER/SKU/Source 관계 검증 | 합성 데이터 PASS | `master-service.integration.test.mjs`, `sku-mapper.integration.test.mjs`, `database-constraints.integration.test.mjs`. 실제 샘플은 승인 BRAND/명시 식별자 근거가 없어 MASTER/SKU/Source SKU가 모두 0건이며 양성 관계 생성은 미검증. |
| 동시 Import Race Test | PASS | 실제 샘플 concurrent-A/B 수렴, 합성 MASTER 생성·identifier lock·SKU·image 경합 및 rollback 테스트 통과. 실제 샘플만으로 MASTER 생성 경합을 검증했다고 보지 않는다. |
| MASTER 상품관리에서 관계 추적 가능 | 합성 데이터 PASS | `product-management-api.integration.test.mjs`의 공개 UUID 관계 projection과 Admin 상품관리 테스트. 실제 샘플은 Import 상세·미결 검수 cursor 추적, MASTER 목록 빈 결과만 검증. |
| Raw JSON/이미지 원본 메타데이터 보존 | PASS | mapped/rejected item 원본·locator/context, mappedInput, Source raw, 이미지 URL/등록 메타데이터와 기존 item 이력 비교. 파일 SHA도 실행 전후 동일. 이미지 다운로드/객체 저장은 범위 밖. |
| unresolved 브랜드 검수 분리 | PASS | 실제 입력에서 BRAND/alias 자동 생성 0건, 5회 누적 미결 item 80건을 API로 중복 없이 조회. 승인/거절·alias 경합·승인 후 새 batch 재처리는 합성 `brand-review-api.integration.test.mjs`에서 검증. |

위 테스트 파일 경로는 `tests/integration/` 기준이다. 실제 양성 MASTER/SKU 관계를 확인하려면 운영자가 확인한 브랜드 연결과 명시 식별자가 있는 추가 샘플이 필요하다. 이는 현재 실데이터 증거의 제한이며 원본을 변경하거나 상품명으로 식별자를 만들어 해소하지 않는다. WBS의 관계 검증은 위 합성 테스트로 별도 충족한다.

## 실제 입력과 결과

- 파일: `examples/더망고_상품정보_20260913.xlsx` (원본 읽기 전용, Git 추가 안 함).
- 크기: **5,002,588 bytes**.
- SHA-256: `1c3d35af15093510e613cf9504fafd28e264b1d15aabb95b215dc564ac8e2fde` (실행 전후 일치).
- 전체 파일 mapping inventory: total **26,375**, mapped **25,945**, rejected **430**. 전체 파일을 DB에 import한 결과가 아니다.
- 영속화 표본: 기존 `SOURCE_MAPPING_SPEC_v0.1.md` 5장의 20행. `7, 9, 6, 11, 8, 12, 36, 47, 1206, 1342, 48, 49, 2603, 2604, 2605, 10271, 11083, 11875, 12334, 12335`.
- 최종 스크립트 실행 완료: **2026-09-14T13:10:30.351Z**. 최초 context `collectedAt=2026-09-14T13:10:15.908Z`, later context `2026-09-14T13:10:24.937Z`, sourceAsOfDate `2026-09-13`.
- 유효 input의 명시 identifiers: **0개**. 승인 BRAND/alias를 임의 seed하지 않았다.

각 회차는 플랫폼별 두 batch다. 아래 결과는 first/reimport/concurrent-A/concurrent-B/later-collection에서 각각 동일했다.

| 플랫폼 | 행 | REVIEW_REQUIRED | FAILED | 업무 상태 | Queue / pipeline |
|---|---:|---:|---:|---|---|
| OLIVEYOUNG | 12 | 10 | 2 | PARTIAL_FAILED | SUCCESS / completed |
| MUSINSA | 8 | 6 | 2 | PARTIAL_FAILED | SUCCESS / completed |

FAILED 4행은 모두 `MISSING_EXTERNAL_PRODUCT_ID`이며 Source를 만들지 않았다. Queue SUCCESS는 처리 완료를 뜻하고 업무 성공 건수는 0이다. 유효 16행은 미승인 브랜드로 REVIEW_REQUIRED다.

| 영속 데이터 | 최초 | 5회 완료 | 해석 |
|---|---:|---:|---|
| Source Product | 16 | 16 | 동일 source identity와 공개 UUID 유지 |
| Source 이미지 메타데이터 | 35 | 35 | 원본 URL/등록 row 불변, 모두 REGISTERED |
| MASTER / canonical SKU / Source SKU | 0 / 0 / 0 | 0 / 0 / 0 | 근거 없는 연결 생성 없음 |
| Import Batch / Item | 2 / 20 | 10 / 100 | 독립 수집 실행마다 이력 추가 |
| 미결 브랜드 검수 item | 16 | 80 | 검수 단위가 import item이므로 새 이력마다 증가 |

재import 멱등성은 도메인 중복 생성을 막는 성질이다. 서로 다른 batch의 이력까지 하나로 합치는 계약은 아니다. 동일 batch 재접수는 receipt를 재사용한다. 수집 시각이 같은 실행에서는 비교한 Source 업무 필드·raw·시각과 전체 이미지 row가 동일했고, 나중 시각의 실행에서는 Source `collected_at`/`last_seen_at`만 새로운 context에 맞게 바뀌었다. 이전 완료 item의 status/action/error/raw/processed_at은 유지됐다.

## 회귀와 원격 증거

- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm format:check`, `pnpm build`: 모두 exit 0.
- Admin Vitest **27**, Node unit **76**, 실패/skip 0.
- `node --test --test-concurrency=1`로 integration 21개 파일 **110개(parent 포함)** PASS, 실패/skip 0, 147,423ms. 이번에는 Windows 순차 실행이며 Linux CI와 동일 실행 환경이라는 주장을 하지 않는다.
- 합성 1,000행의 실제 Worker 처리 **53,892ms** 및 실제 Worker 프로세스 강제 종료/재전달 복구도 회귀 PASS. 20행 실데이터 실행 시간이나 P6 운영 성능 목표 검증과 구분한다.
- read-only `gh run list`: 조회한 최근 5개 중 가장 최근 성공은 run **34794445556**, SHA `8c799a3413e0a4903c751c1cc89fdba64078275b` (P2-04). 더 최근 run 34795563889은 cancelled였다.
- `gh api repos/hyunglory/bros/commits/646cb49/check-runs`는 **HTTP 422, No commit found for SHA: 646cb49**. 현재 구현 기준 SHA는 원격에 없어 원격 검증 상태는 NOT_RUN이다. 이번 작업의 push/workflow 실행/required check 설정 변경은 없다.
- Phase 1 BLK-001의 기존 required check/실패 PR 차단 완료 기록을 유지한다. 그것이 현재 Phase 2 revision의 CI 통과 증거를 대신하지 않는다.

## 재현 절차

원본 파일과 기존 의존성이 있는 로컬 저장소에서 실행한다. 컨테이너 이름과 loopback 포트가 비어 있는지 먼저 확인한다. 아래 비밀번호는 새로 만드는 일회용 로컬 DB 전용 값이다.

```powershell
docker run --name bros-phase2-gate --rm -e POSTGRES_USER=bros -e POSTGRES_PASSWORD=bros_test -e POSTGRES_DB=postgres -p 127.0.0.1:55438:5432 -d postgres:18-alpine
docker exec bros-phase2-gate pg_isready -U bros -d postgres
$env:TEST_DATABASE_URL='postgresql://bros:bros_test@127.0.0.1:55438/postgres'
$env:pnpm_config_verify_deps_before_run='false'
pnpm build
node scripts/verify-phase2-sample.mjs 'examples/더망고_상품정보_20260913.xlsx'
```

`pg_isready`가 ready이고 build가 exit 0인 뒤 스크립트를 실행한다. 실행한 태그의 실제 서버 버전은 JSON `postgresVersion`에 출력된다. 스크립트는 supplied DB를 초기화하지 않고 임의 이름 `bros_test_*` DB를 생성·migration하고 종료 시 삭제한다. 연결 계정에는 CREATEDB 권한이 필요하다. 성공 출력은 집계·SHA·행 locator와 검증 boolean만 포함하고 원본 행/상품명/상품 ID/이미지 URL을 출력하지 않는다. 실패 출력은 checkpoint와 고정 오류 code로 제한한다.

회귀는 build 후 다음과 같이 재실행한다. 각 명령의 exit code를 확인하고 실패하면 PASS로 기록하지 않는다.

```powershell
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm format:check
$gateIntegrationFiles = @(Get-ChildItem -LiteralPath 'tests/integration' -Filter '*.integration.test.mjs' -File | Sort-Object FullName | ForEach-Object FullName)
node --test --test-concurrency=1 $gateIntegrationFiles
docker stop bros-phase2-gate
```

완료 또는 오류 후에도 이번에 만든 `bros-phase2-gate`만 종료한다. `--rm`으로 컨테이너와 임시 데이터가 제거되며 기존 DB/컨테이너와 별도 P5 worktree는 대상이 아니다. 이 실데이터 검증은 opt-in이며 공개 CI fixture에 XLSX를 추가하지 않는다.

## 다음 조치와 완료 조건

1. 공개 원격에 전달할 변경 범위를 확인하고 현재 구현 및 검증 문서를 포함한 revision을 원격 CI로 검증한다. 원본 XLSX와 raw 출력은 포함하지 않는다.
2. 해당 revision의 required check `install / lint / typecheck / test / build` 성공을 확인한다. 실패나 취소는 PASS로 취급하지 않는다.
3. BLK-004를 해소하고 새 결정 기록에서 관련 P2 Task와 Phase 2 Gate 상태를 확정한다. 코드 수정이 생겼으면 영향 회귀와 실데이터 검증의 재실행 필요성을 판단한다.
4. 실제 양성 MASTER/SKU 관계 표본은 확인 가능한 브랜드/식별자 근거가 생겼을 때 보강한다. 전체 26,375행 영속화·이미지 다운로드·P6 인증/성능은 이번 PASS 증거로 주장하지 않는다.

Gate 확정 전 Phase 3/4 전체 착수 완료를 선언하지 않는다. WBS가 허용한 Phase 5 병렬 Track은 기존 Phase 1 Gate 근거로 계속 가능하다.
