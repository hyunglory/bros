# BROS 구현 보완 명세

> 개정: v0.2 / 2026-09-11
> 추가 적용 결정: DEC-20260912-010 / 2026-09-12 — P1-05 다섯 미정 코드 필드의 저장 정책
> 상태: 개발 착수용 명세. 구현·성능·외부 서비스 검증 완료를 의미하지 않는다.
> 적용: 기존 설계서·WBS·개발 운영 지침·로컬 가이드·마스터 프롬프트의 v0.2 개정과 함께 사용한다.

## 1. 적용 범위와 문서 우선순위

기존 Modular Monolith, Node 24 계열, PostgreSQL 18, Fastify, React/Vite, pg-boss, Worker 전용 이미지/브라우저 처리, 18개 업무 테이블과 85개 WBS Task를 유지한다. 이번 개정은 누락된 구현 계약과 검증 기준을 보완한다.

사용자의 현재 지시 → 이 보완 명세의 명시적 변경 사항 → 설계서의 도메인 정책 → WBS의 작업 범위·Acceptance Criteria → 실행 가이드 순으로 적용한다. WBS는 설계를 암묵적으로 확대하지 않는다. 새 충돌은 DECISIONS에 근거와 영향을 기록한다.

기존 5개 파일의 `_v0.1.md` 이름은 참조 호환성을 위해 유지하며, 본문 상단의 **적용 개정 v0.2**가 현재 기준이다. 이후 변경은 개정 번호와 변경 이력을 함께 갱신한다. 현재 기준 문서는 `doc/` 한 곳에서 관리하며 `docs/baseline/`에 중복 복사하지 않는다. 구현 상태·테스트·운영 기록은 개발 착수 시 `docs/`에 만든다.

## 2. DB 공통 물리 계약 — P1-05

아래 규칙은 설계서 12장의 필드 목록에 적용한다. 예외는 이 문서의 개별 표를 따른다. Migration 작성 전 전체 컬럼의 타입·NULL·기본값·제약 목록을 산출하고 실제 DB 메타데이터와 대조한다.

| 필드 종류 | 타입 및 기본 정책 |
| --- | --- |
| `id` | BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY |
| `public_id` | UUID NOT NULL DEFAULT uuidv7(), 테이블별 UNIQUE |
| FK `*_id` | BIGINT, 참조 대상 PK와 동일. 아래에서 선택 관계로 정한 경우만 NULL |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now(); updated_at은 실제 변경 시 애플리케이션에서 갱신 |
| 실행 시각 | queued_at/started_at/finished_at/processed_at/reviewed_at은 TIMESTAMPTZ; 아직 발생하지 않은 시각은 NULL |
| 수집 시각 | source_product.collected_at/last_seen_at은 TIMESTAMPTZ NOT NULL; 최초 수집 시각을 모르면 Import 시각을 쓰고 raw에 대체 사실 기록 |
| 금액 | NUMERIC(20,4), NULL 허용, 0 이상 CHECK; 통화는 VARCHAR(3), 대문자 ISO 코드 형식 검증. 통화를 모르면 NULL, KRW로 추정하지 않음 |
| 점수 | NUMERIC(5,2), NULL 허용, 0~100 CHECK; 점수 미계산과 0점을 구분 |
| count/attempt/rank/order/version | INTEGER, 0 이상; version_no와 rank_no는 1 이상. 집계·attempt·sort_order 기본 0, version_no 기본 1 |
| boolean | BOOLEAN NOT NULL; is_active/enabled/allow_manual_run 기본 true, is_primary/is_verified/allow_parallel 기본 false |
| JSON 객체 | JSONB NOT NULL DEFAULT '{}'; 객체 유형 CHECK. raw_json/raw snapshot은 기본값 없이 입력 원본을 보존하며 JSON null/배열/스칼라도 허용 |
| Evidence/Conflict 목록 | JSONB NOT NULL DEFAULT '[]', 배열 CHECK; product_identifier.evidence_json은 객체 |
| issue_codes | TEXT[] NOT NULL DEFAULT '{}' |
| 상태·타입·코드 | VARCHAR(64), 허용 집합 CHECK; 원본 외부 코드에는 내부 상태 CHECK를 강제하지 않음 |
| 정체성 key | brand_key/platform.code/job_code/recipe_code VARCHAR(100), NOT NULL, 공백값 금지 |
| 외부 ID / option_key | TEXT, 임의 숫자 변환 금지. 필수 여부는 아래 규칙 적용 |
| 이름·URL·설명·오류·기타 문자열 | TEXT; 필수값은 빈 문자열 금지, 오류/URL/선택 메타데이터는 NULL 허용 |
| 이미지 수치 | width/height INTEGER > 0, file_size BIGINT > 0; fetch 전 NULL |
| SHA-256 | content_hash/recipe_hash CHAR(64), 소문자 16진수 CHECK; 생성 전 NULL |
| 큐 식별자 | queue_provider VARCHAR(30), queue_job_id VARCHAR(200); enqueue 확정 전 둘 다 NULL, 이후 둘 다 존재 |

Boolean 필드와 정체성 키 이외에 필수로 취급할 문자열은 platform.name, product_master.product_name/product_name_norm/category_key/product_type/status/identifier_status/created_method, product_sku.sku_name/option_key/status, product_identifier.identifier_type/identifier_value/identifier_norm/evidence_type, source_product.external_product_id/raw_product_name/stock_status/match_status, source_sku.raw_option_name/option_key/stock_status, product_image.image_type/process_status, import_batch.import_type/status/source_name, import_item.status, identifier_resolve_run.resolver_version/status, identifier_candidate.identifier_type/candidate_value/candidate_norm/decision_status, thumbnail_recipe.recipe_name, thumbnail_job.status, thumbnail_review.review_status/reviewer_type, automation_job.job_name/job_type/handler_key/timezone, automation_run.status다. 미분류 category_key/product_type은 UNKNOWN을 명시한다. brand는 name_ko/name_en 중 하나 이상 필수다. brand_alias.alias_name/alias_norm도 필수다.

브라우저 설정 max_retries는 INTEGER DEFAULT 2, cooldown_seconds DEFAULT 60, timeout_seconds DEFAULT 300이며 모두 0 이상, timeout_seconds는 1 이상이다. output_width/output_height는 양의 INTEGER이며 기본 1000이다. attempt_no는 최초 시도 1, 대기 중 0이다. identifier_candidate.rank_no는 1부터 시작한다. 각 실행의 started_at은 finished_at보다 늦을 수 없다. DB의 BIGINT는 Node에서 손실 가능한 number로 변환하지 않고 내부 string 또는 bigint로 다룬다.

### 2.1 관계, 유일성, 삭제

2026-09-12 추가 결정: [DEC-20260912-010](../docs/DECISIONS.md#dec-20260912-010--p1-05-미정-코드-집합의-확장-가능한-저장-정책)에 따라 `product_master.product_type/created_method`, `import_batch.import_type`, `product_identifier.evidence_type`, `thumbnail_review.reviewer_type`은 P1-05에서 VARCHAR(64)·NOT NULL·공백 금지로 구현한다. 기존 원문에 완결된 허용값 목록이 없는 이 다섯 필드만 폐쇄 집합 CHECK를 유예하며 P2/P3/P4에서 값 목록과 기존 데이터 변환 정책을 확정해 별도 forward migration으로 추가한다. 다른 상태·타입 CHECK는 그대로 적용한다.

모든 업무 FK는 기본 `ON DELETE RESTRICT`다. 운영 UI는 논리 비활성화/상태 변경을 사용하며 상품·근거·실행이력의 연쇄 삭제를 제공하지 않는다. 보존기간 경과 이력은 별도 정리 작업이 참조를 확인하고 자식부터 명시적으로 삭제한다.

| 테이블 | 선택 관계 / UNIQUE / 추가 규칙 |
| --- | --- |
| platform | code UNIQUE |
| brand | brand_key UNIQUE |
| brand_alias | platform_id NULL 허용; brand_id 필수. `(COALESCE(platform_id,0), alias_norm)` UNIQUE; 플랫폼별 alias 우선, 전역 alias 차선 |
| product_master | brand_id NULL 허용; review용 미확정 MASTER 허용 |
| product_sku | product_id 필수; `(product_id, option_key)` UNIQUE |
| product_identifier | sku_id NULL 허용; product_id 필수. `(product_id, COALESCE(sku_id,0), identifier_type, identifier_norm)` UNIQUE. 동일 범위·타입의 primary는 하나만 허용하는 부분 UNIQUE |
| source_product | product_id NULL 허용; platform_id 필수; `(platform_id, external_product_id)` UNIQUE |
| source_sku | sku_id/external_sku_id NULL 허용; source_product_id 필수; `(source_product_id, option_key)` UNIQUE, external_sku_id가 존재하면 `(source_product_id, external_sku_id)` 부분 UNIQUE |
| product_image | product_id를 NULL 허용으로 보완하여 미매칭 Source 이미지도 등록 가능. sku_id/source_product_id/source_image_id 선택; product_id 또는 source_product_id 중 하나 이상 필수 |
| import_batch | platform_id 필수; 단일 플랫폼 단위 Batch |
| import_item | source_product_id/external_product_id NULL 허용: 식별 필수값이 누락된 실패 원본도 기록. import_batch_id 필수; 아래 input_row_no 기준 UNIQUE |
| identifier_resolve_run | product_id 선택, source_product_id 필수 |
| identifier_candidate | resolve_run_id 필수; `(resolve_run_id, identifier_type, candidate_norm)` UNIQUE |
| thumbnail_recipe | `(recipe_code, version_no)` UNIQUE; 이미 사용한 버전 내용은 수정 금지 |
| thumbnail_job | product_image_id/recipe_id 필수; 생성 멱등성 키는 아래 추가 필드 사용 |
| thumbnail_review | thumbnail_job_id 필수; 검수 이력은 append-only |
| automation_job | profile_key/cron_expression 선택; BROWSER는 profile_key 필수. timezone 기본 Asia/Seoul, 유효 IANA 값 검증 |
| automation_run | automation_job_id 필수; 수동/정기 실행 요청 키 UNIQUE |

모든 FK에 조회용 B-tree 인덱스를 둔다. 추가 인덱스는 상품 `(brand_id, identifier_status)`, 상품명 pg_trgm GIN, Source `(platform_id,last_seen_at)`, 실행 테이블 `(status,created_at)` 또는 `(status,queued_at)`, candidate `(decision_status,created_at)`, identifier `(identifier_type,identifier_norm)`을 기본으로 한다. raw_json 전체 GIN은 만들지 않는다.

product_sku에 `(id,product_id)` UNIQUE를 두고 identifier/image의 `(sku_id,product_id)` 복합 FK로 다른 MASTER의 SKU 참조를 차단한다. sku_id가 있으면 product_id도 있어야 한다. source_sku가 참조하는 SKU와 source_product의 MASTER 일치는 매핑 트랜잭션에서 잠금 후 검증한다. MASTER 재매핑은 관련 SKU/이미지 관계까지 같은 트랜잭션에서 검증한다.

### 2.2 기존 18개 테이블의 추가 필드

| 대상 | 추가 필드 및 목적 |
| --- | --- |
| brand_alias/import_item/identifier_candidate/thumbnail_review | public_id 추가. 관리 API의 모든 리소스 경로는 공개 UUID를 사용 |
| import_item | input_row_no INTEGER NOT NULL >= 1; `(import_batch_id,input_row_no)` UNIQUE. 동일 외부 ID가 여러 행에 등장해도 각 입력행 결과 보존 |
| identifier_candidate | version_no INTEGER NOT NULL DEFAULT 1; decided_at TIMESTAMPTZ NULL, decided_by TEXT NULL. 승인 race와 감사 기록 |
| product_master/automation_job | version_no INTEGER NOT NULL DEFAULT 1; 낙관적 동시 수정 검증 |
| thumbnail_job | public_id 외에 request_key TEXT NOT NULL UNIQUE, recipe_hash CHAR(64) NULL, provider_key/model_version/processing_version TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(). 원본 준비·경로 선택 전에는 hash/Provider 정보가 없을 수 있으며 생성 호출 전에 고정한다. 로컬 처리는 provider_key=LOCAL |
| automation_run | request_key TEXT NOT NULL UNIQUE, trigger_type VARCHAR(16) MANUAL 또는 SCHEDULED, scheduled_for TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now() |
| product_image | source_revision INTEGER NOT NULL DEFAULT 1 CHECK > 0; 동일 Source URL 내용 변경 시 증가. 원본 슬롯 단위 잠금 안에서 버전 생성 |

이미지 등록 단계에는 source_url만 있고 storage_provider/storage_bucket/object_key/content_hash/mime_type/width/height/file_size는 모두 NULL일 수 있다. fetch 성공 시 이 저장 메타데이터를 함께 채우고 process_status=STORED로 전환한다. Local도 storage_bucket에 논리 루트 이름을 기록하며 절대 경로는 노출하지 않는다. GENERATED_THUMBNAIL은 source_image_id, recipe_hash, 저장 메타데이터 필수이며 `(source_image_id,image_type,recipe_hash)` 부분 UNIQUE를 적용한다. 원본은 `(source_product_id,image_type,source_url,source_revision)` 부분 UNIQUE다. Source 원본 등록 시 해당 URL의 최신 버전을 잠금 내 재조회하여 재사용한다. 명시적 원본 갱신에서 bytes hash가 달라지면 source_revision을 증가시켜 새 row/object를 만들고 이전 row/object는 보존한다. 동일 bytes는 기존 버전을 재사용하며 생성 결과는 정확한 source_image_id에 연결한다.

thumbnail_job.request_key는 사용자 생성 요청의 멱등성 키다. 원본 fetch/분석 이후 최종 recipe_hash를 고정하여 동일 결과 재사용 여부를 확인한다. SUCCEEDED에는 recipe_hash 및 처리 버전이 필수다. queue retry는 같은 job의 attempt_no를 증가시키며, 실패 결과의 운영자 재생성은 generation revision을 바꾼 새 job이다. 다른 요청 키로 동일 결과 hash가 동시에 유입되더라도 product_image의 UNIQUE와 잠금 내 재조회로 하나의 결과에 수렴한다. 검수 이력과 생성 성공을 혼동하지 않는다.

### 2.3 상태와 상태 전이

| 대상 | 허용 상태 / 초기값 |
| --- | --- |
| product_master.status, product_sku.status | ACTIVE / INACTIVE / REVIEW_REQUIRED; 미확정 생성은 REVIEW_REQUIRED |
| product_master.identifier_status | UNKNOWN / SEARCHING / CANDIDATE / REVIEW_REQUIRED / VERIFIED / NOT_FOUND / NOT_APPLICABLE; 초기 UNKNOWN |
| source_product.match_status | UNMATCHED / MATCHED / REVIEW_REQUIRED; 초기 UNMATCHED |
| Source stock_status | UNKNOWN / IN_STOCK / OUT_OF_STOCK; 초기 UNKNOWN |
| product_image.process_status | REGISTERED / FETCHING / STORED / FAILED; 초기 REGISTERED |
| import_batch.status | QUEUED / RUNNING / SUCCEEDED / PARTIAL_FAILED / FAILED / CANCELLED |
| import_item.status | PENDING / RUNNING / SUCCEEDED / REVIEW_REQUIRED / SKIPPED / FAILED |
| import_item.action_type | NULL(처리 전) / CREATED / UPDATED / MATCHED / REVIEW_REQUIRED / SKIPPED / FAILED |
| identifier_resolve_run.status | QUEUED / RUNNING / SUCCEEDED / FAILED / CANCELLED |
| identifier_candidate.decision_status | CANDIDATE / AUTO_ACCEPTED / REVIEW_REQUIRED / ACCEPTED / REJECTED |
| thumbnail_job.status | QUEUED / RUNNING / RETRY_WAIT / SUCCEEDED / FAILED / CANCELLED |
| thumbnail_review.review_status | AUTO_APPROVED / REVIEW_REQUIRED / MANUAL_APPROVED / REJECTED / REGENERATE_REQUIRED |
| automation_run.status | QUEUED / RUNNING / RETRY_WAIT / SUCCESS / FAILED / TIMEOUT / CANCELLED |

테이블마다 SUCCEEDED/SUCCESS를 위 표대로 사용하며 서로 혼용하지 않는다. 썸네일 생성 성공과 검수 승인은 별개다. 오류 코드는 상태와 별도 필드다. CAPTCHA/2FA는 FAILED + 해당 error_code로 종료하고 UI가 사용자 조치 필요로 표시한다. NOT_FOUND는 Resolver 실행 실패가 아니라 정상 결과다.

실행은 QUEUED → RUNNING → 성공/실패/취소, 재시도는 RUNNING → RETRY_WAIT → RUNNING이다. 완료 이력을 다시 QUEUED로 되돌리지 않는다. 운영자 재실행은 새 실행 레코드를 만든다. 후보 승인/거절은 미결정 상태에서만 가능하며 version_no 조건부 UPDATE와 identifier 승격을 한 트랜잭션으로 묶는다. 중복 동일 요청은 기존 결과, 상충하는 결정은 409를 반환한다.

Batch의 total_count는 입력행 수다. 종료 시 `total_count = success_count + failed_count + skipped_count + review_count`를 만족해야 한다. 집계는 입력행의 최종 상태에서 계산하며 재시도 때 단순 증가시키지 않는다. 전건 실패는 FAILED, 일부 실패는 PARTIAL_FAILED, 실패 0건은 SUCCEEDED(검수/skip 수는 별도 표시)다.

## 3. API·인증·검수 계약

### 3.1 MVP 인증 — P6-01, P5-10

기본 배포 방식은 **Caddy HTTPS + basic_auth + 단일 관리자 권한**으로 고정한다. 이번 MVP에 별도 사용자/세션/RBAC 테이블을 추가하지 않는다. 다중 역할이 필요하면 후속 설계 변경으로 다룬다. 사용자별 Caddy 계정명은 감사 actor로 사용한다.

인증은 Admin·업무 API·미디어·Trace 조회에 일괄 적용한다. API 포트는 외부 비공개이며 proxy가 전달한 actor 헤더는 외부 입력을 제거한 뒤 인증된 값으로만 덮어쓴다. 헤더만 보내 API 인증을 우회할 수 없어야 한다. local 무인증 모드는 명시 설정과 loopback 바인딩에서만 허용한다.

Basic Auth도 브라우저가 자격증명을 자동 첨부하므로 상태 변경 요청의 Origin을 같은 origin으로 제한하고 CSRF 토큰/명시적 커스텀 헤더 검증을 적용한다. GET은 상태를 변경하지 않는다. 업무 API는 JSON Content-Type만 받으며 cross-origin credential 요청은 허용하지 않는다. 이 모드에는 애플리케이션 세션 쿠키가 없으므로 cookie 플래그 검사는 해당 없음으로 기록한다. 로그인 팝업·자격증명 교체 절차와 인증 실패 UX를 Runbook에 설명한다.

검증: 미인증 업무 API/이미지/Trace 401, 외부 직접 API 접근 차단, 위조 actor 제거, 타 origin 변경 요청 차단, 인증된 정상 요청 성공. P5-10의 접근제어 테스트는 이 기반을 선행 구현하거나 테스트용 인증 경계로 검증한다. 실계정 Artifact 제공 전 실제 인증 기반을 적용한다.

### 3.2 공통 HTTP 계약 — P1-08

- 리소스 ID는 UUID public_id만 입출력한다. 경로 `:candidateId`는 `:candidatePublicId`로 통일한다.
- 비동기 요청은 202 + `{publicId,status,statusUrl}`; 완료 전 성공 결과를 반환하지 않는다.
- 오류는 `{error:{code,message,requestId,details?}}`; details는 민감정보 제거 후 허용 필드만 반환한다.
- 400 형식 오류, 401 미인증, 403 금지, 404 미존재, 409 상태/버전 충돌, 413 크기 초과, 429 한도 초과, 503 준비 안 됨을 구분한다.
- 목록 기본 limit=50, 최대 100. `(created_at,public_id)` 기반 cursor와 정렬/필터 allowlist를 사용한다. 해당 정렬을 쓰는 테이블은 created_at을 필수로 보유한다.
- PATCH/검수에는 expectedVersion을 요구한다. 성공 시 version 증가, 불일치 409. Thumbnail 검수는 job 잠금 후 최신 review 기준으로 검사한다.
- Thumbnail 검수의 expectedVersion은 API가 반환한 최신 review 순번이다. thumbnail_review에 version_no INTEGER NOT NULL >= 1을 두고 `(thumbnail_job_id,version_no)` UNIQUE를 적용한다. 최초 검수 전 expectedVersion=0이며 job 잠금 내에서 순번을 증가시킨다. candidate 감사 변경도 evidence_json에 원결정·새결정·actor·시각을 보존한다.
- `/health`는 프로세스 생존만 확인하고 200을 반환한다. `/ready`는 제한 시간 내 DB query 성공 시 200, 실패 시 503이며 상세 접속정보는 숨긴다. Worker readiness는 DB+queue 초기화+handler 등록+schedule reconciliation 완료를 확인한다.
- API는 image/Playwright 의존성을 import하지 않는다. Worker 처리 진행률은 업무 테이블에서 조회한다.

## 4. 큐·멱등성·외부 부작용

pg-boss의 전달 결과를 업무의 exactly-once 보장으로 간주하지 않는다. Worker는 중복 전달을 전제로 설계한다.

DB 상태와 enqueue 사이 유실을 막기 위해 동일 pg 트랜잭션에 참여 가능한 pg-boss API를 설치 버전의 공식 계약으로 검증한다. 지원되면 업무 레코드와 enqueue를 같은 트랜잭션에 기록한다. 불가능하면 업무 테이블의 QUEUED 레코드를 주기적으로 재조정하는 방식으로 구현하고, enqueue 후 queue_job_id 기록 전에 crash해도 request_key로 중복 소비를 차단한다. 새 Outbox 업무 테이블 추가는 별도 설계 변경 없이 진행하지 않는다.

- Import: Batch 내 행 키와 Source 외부 ID를 분리한다. 동일 원본 재요청과 새로운 Import는 구분한다.
- Thumbnail: recipe hash에 recipe/processing/mask/QA/provider-model 버전과 실제 원본 content hash를 포함한다. 동일 요청 재시도는 같은 request_key, 명시적 새 변형은 별도 generation revision을 hash에 포함한다. FAILED 재시도 attempt와 새 logical output을 혼동하지 않는다.
- Browser 정기 실행: job public_id + 예정 UTC 시각을 request_key로 사용한다. 수동 실행은 Idempotency-Key를 요구한다. 동일 key에 다른 입력은 409다.
- Browser 외부 클릭 후 DB 기록 전에 crash한 경우 먼저 외부 완료 상태를 조회한다. 완료 여부 불명확하면 `SIDE_EFFECT_UNKNOWN`으로 실패 및 사용자 확인을 요구하고 자동으로 다시 클릭하지 않는다.
- Profile lock은 실행 전체 동안 전용 DB 연결의 session advisory lock으로 유지한다. 연결 손실 시 브라우저 작업을 중단한다. lock을 얻지 못한 실행은 대기시키며 DB 연결과 무관한 TTL 만료만으로 실행 중인 lock을 강제 탈취하지 않는다.
- 앱 shutdown은 새 작업 수락 중단 → 현재 작업 제한 시간 대기 → browser/queue/pool 정리다. 완료하지 못한 작업은 복구 시 업무 상태와 외부 부작용을 재검증한다.

필수 장애 테스트: enqueue 직전/직후 crash, 저장 후 DB commit 전 crash, 동일 요청 동시 처리, Worker 재시작, lock 연결 손실, Browser 클릭 후 verify 전 crash. API와 Worker를 같은 머신에서 실행해도 이 경계를 테스트한다.

## 5. 자동승인 평가와 외부 입력

### 5.1 기본값

`RESOLVER_AUTO_ACCEPT_ENABLED=false`, `THUMBNAIL_AUTO_APPROVE_ENABLED=false`를 기본으로 한다. 평가 실행 자체는 비용 한도 내 테스트 범위이며 운영 자동승인 활성화와 구분한다. 다음 숫자는 **이번 개정에서 정한 초기 평가 규칙**이며 실측 결과나 정확도 보증이 아니다.

| 영역 | 평가 데이터 / 최소 판정 |
| --- | --- |
| Resolver | 실제 정답 확인 상품 200건 이상; 평가 범위의 각 주요 브랜드/카테고리 20건 이상. 품번 없음·유사 모델·GTIN/색상/용량 충돌을 포함 |
| Resolver 자동승인 | 고정 holdout에서 자동승인 후보 100건 이상, 오매칭 0건, Hard Conflict/AI 단독 근거의 자동승인 0건. 표본 미달 또는 실패 시 OFF 유지 |
| Thumbnail | 원본/정답 검수쌍 100건 이상; 사람/가림/라벨/투명/반사/복잡 경계 유형별 10건 이상(중복 태그 허용) |
| Thumbnail 자동승인 | 고정 holdout에서 SAFE_COMPOSITE 자동승인 후보 50건 이상, 제품 변형 false-pass 0건, AI_EDIT/AI_RECONSTRUCT 자동승인 0건. 부족한 제품군은 OFF |

정규화·임계값 튜닝용 데이터와 holdout은 상품 MASTER 단위로 분리한다. 같은 상품 이미지나 SKU가 양쪽에 섞이지 않아야 한다. 평가 데이터셋 버전, 출처, 정답 근거, 범위, 분모, 오류 건수, precision/coverage, false-review율, 처리시간과 건당 비용을 보고한다. 희귀 오류의 부재를 통계적으로 보장한다고 표현하지 않는다. 기준 통과는 활성화 필요조건이며 운영 책임자의 활성화 결정·범위·버전을 기록한다. 모델/규칙/recipe/mask/QA 버전 변경 시 해당 범위 자동승인을 OFF하고 재평가한다.

Mask confidence와 이미지 유사도/OCR 임계값을 근거 없이 상수로 정하지 않는다. P4-05/P4-15 평가 보고서에 제품군별 수치와 통과·실패 사례를 남긴다. 크기·색공간 변환이 있으므로 원본 픽셀 보존 검사는 동일 기하/색공간 변환을 적용한 기준 이미지의 제품 내부를 비교하고, alpha 경계·합성 그림자는 별도 영역으로 평가한다.

### 5.2 입력 준비 목록

| 시점 | 입력 / 제공 책임 | 미제공 시 |
| --- | --- | --- |
| P2-01 | 운영자: 실제 저장 형식·위치, 상품 20~100건, 옵션/이미지/품번 컬럼, 대략 총량 | Source Adapter만 BLOCKED_EXTERNAL_INPUT; 공통 기반 작업 계속 |
| P3-05 | 운영자와 개발자: 검색 Provider 계약·사용 조건·한도·키 주입 방식 | mock/contract 검증 가능, live 완료로 표시 금지 |
| P3-14 | 운영자: 정답 식별자와 근거; 개발자: 분리된 평가셋/보고서 | 자동승인 OFF, 미검증 Gate PASS 금지 |
| P4-01/05 | 운영자: 대표 원본 이미지와 허용 비용; 개발자: 편집·segmentation Provider 평가 | Local 합성/port 가능, 실제 AI/mask 품질 검증은 보류 |
| P5-01 | 운영자: URL·단계·입력값·실행 빈도·성공 신호·2FA 방식 | demo framework 진행 가능, 실제 Flow PASS 금지 |
| P6 | 운영자: 서버/도메인/저장소/운영 책임자/복구 목표 | 로컬 배포 리허설 가능, 운영 Release 미완료 |

Secret 실제 값은 문서/채팅/fixture에 넣지 않는다. 외부 호출은 요청당·일간 비용과 timeout/rate 한도를 설정한 뒤 수행하며 미설정이면 live 호출을 막는다. 원본 샘플은 개인정보·토큰 제거 후 별도 경로에서 관리하고 Git에 넣을 fixture는 재배포 가능 여부를 확인한다.

Raw 보존은 상품 입력의 업무 필드와 원래 구조를 보존한다는 의미다. Cookie/Authorization/password/API key가 섞인 입력은 저장 전에 제거하거나 해당 입력을 거부하고 필드 경로와 처리 사유만 기록한다. 제거 전 secret 값은 실패 raw_json이나 예외 로그에도 보존하지 않는다. signed URL query 등 임시 자격증명은 로그/화면/Artifact 메타데이터에서 마스킹한다.

## 6. 검증·Gate·운영 목표

WBS의 P0/P1/P2는 우선순위이며 완료 면제 표시가 아니다. Phase 1의 14개 작업 각각을 추적하고 최소 실행 경로만 완성한 상태는 Phase 1 전체 PASS로 표시하지 않는다. 해당 Gate의 모든 조건과 필수 작업 검증이 완료되어야 한다.

상태값은 NOT_STARTED / IN_PROGRESS / BLOCKED_EXTERNAL_INPUT / IMPLEMENTED_NOT_VALIDATED / TEST_FAILED / PASS로 통일한다. Waiver는 PASS로 바꾸지 않고 별도 판정으로 남긴다. Release는 모든 필수 항목 PASS 또는 운영 책임자가 명시적으로 수용한 Waiver(owner/reason/risk/impact/workaround/expiry/revisit)이며, 면제된 기능을 완성했다고 표시하지 않는다. 자동승인 OFF는 안전 설정이지 누락된 평가를 수행했다는 증거가 아니다.

### 6.1 검증 기록

각 Task는 관련 파일, 실행 명령, 실행 일시, 환경/버전, 실제 결과, 실패 내용, UI 증거, 미검증 범위를 기록한다. 문서의 과거 '검수 통과'는 문서 자체 검토이며 실행 검증 결과가 아니다. 이번 개정에서도 실제 앱 테스트는 수행하지 않았다.

기본 순서: config/contract/security/test 기반 → DB/Migration/client → API/Queue/Worker → Admin/Storage → 전체 Phase 1 Gate. 최초 화면을 일찍 띄우는 것은 허용하되 해당 Task를 부분 구현으로 기록한다.

### 6.2 운영 수치의 초기 목표 — P6-05~09

- DB 백업: 매일, 일간 7/주간 4/월간 3 보존, 서버 외 암호화 저장. 초기 RPO 목표 24시간, RTO 목표 4시간; 운영자가 다른 목표를 정하면 갱신한다. 실제 restore 시간과 마지막 성공 백업 나이로 검증한다.
- Trace/스크린샷: 기본 14일, 미해결 장애 hold는 명시 종료일까지. signed preview TTL 기본 5분. 원본·승인 썸네일은 자동 정리 대상에서 제외하고 상품 보존 정책에 따른다.
- 4 vCPU/8GB 기준 초기 부하 시나리오: 1,000건 Import + Resolver 4/Thumbnail 2/Browser 1 동시성, API 읽기 5 RPS, 30분 관찰. mock Provider와 live 측정을 별도 보고한다.
- 초기 API 목표: 위 조건에서 읽기 p95 ≤ 1초, 서버 오류율 < 1%, OOM/DB pool 고갈 0건. 비용·처리량·queue 최대/평균 지연·메모리 최대치를 기록한다. 이 수치는 검증 목표이며 측정 완료된 성능이 아니다.
- 백업 26시간 이상 미성공, queue 가장 오래된 대기 10분 초과, Worker heartbeat 2분 이상 부재는 초기 경보 조건이다. 경보 전달 수단/수신자는 P6-03에서 실제 설정하고 시험한다.

## 7. 다음 구현 착수 조건

현재 폴더 `D:\project\bros`를 루트로 사용한다. Git 초기화·기준 문서 snapshot·ignore 설정·도구 버전 확인 후 P1-01부터 시작한다. Docker CLI 설치 여부, daemon 접근 권한, daemon 실행 여부를 별도로 판정한다. 접근 거부를 '미설치' 또는 '중지'로 단정하지 않는다.

P1-05 전 이 문서의 DB 계약을 Migration 명세에 반영하고, P1-08 전 공개 ID·오류·인증 경계를 contract에 반영한다. 실제 상품/사이트 입력이 없어도 Phase 1은 진행할 수 있다. 이번 문서 보완 요청 자체를 앱 구현·전역 설치·운영 배포 요청으로 해석하지 않는다.
