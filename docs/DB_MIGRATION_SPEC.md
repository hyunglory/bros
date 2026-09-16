# P1-05 DB Migration 컬럼 명세

- 기준: `doc/brand_resell_os_design_v0.1.md` 11·12장, `doc/BROS_구현_보완_명세_v0.2.md` 2장 및 3.2장.
- 범위: `app` schema의 18개 업무 테이블, 현재 259개 컬럼(001 baseline 256개 + P3-12 migration 003의 3개). 현재 migration metadata 대조 기준이다.
- Kysely 이력은 `bros_migrations` schema로 분리한다. `pg_trgm`은 public schema에 설치하며 down에서 공유 extension을 삭제하지 않는다.
- `NN`은 NOT NULL, `NULL`은 SQL NULL 허용, `—`는 기본값 없음이다. JSON raw의 SQL NULL은 금지하고 JSON null·배열·스칼라는 허용한다.
- UUID는 NOT NULL / UNIQUE / uuidv7() 기본값이며 API 계약에서 버전 7을 검증한다. BIGINT·NUMERIC은 pg 기본 string 반환을 유지한다.
- 모든 FK는 ON DELETE RESTRICT이며 선두 컬럼을 이용할 수 있는 B-tree index를 둔다.
- product_type / created_method / import_type / evidence_type / reviewer_type은 DEC-20260912-010에 따라 VARCHAR(64)·NOT NULL·공백 금지로 확정했다. 폐쇄 집합 CHECK는 해당 P2/P3/P4 업무 단계에서 결정한 뒤 별도 forward migration으로 추가한다.

## platform

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| code | varchar(100) | NN | — | code ~ '[^[:space:]]' |
| name | text | NN | — | name ~ '[^[:space:]]' |
| platform_role | varchar(64) | NN | — | platform_role IN ('SOURCE', 'CHANNEL', 'INTEGRATION') |
| is_active | boolean | NN | true | — |
| config_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(config_json) = 'object' |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (code)`

## brand

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| brand_key | varchar(100) | NN | — | brand_key ~ '[^[:space:]]' |
| name_ko | text | NULL | — | — |
| name_en | text | NULL | — | — |
| official_url | text | NULL | — | — |
| is_active | boolean | NN | true | — |
| metadata_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(metadata_json) = 'object' |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (brand_key)`
- `CHECK (COALESCE(name_ko, '') ~ '[^[:space:]]' OR COALESCE(name_en, '') ~ '[^[:space:]]')`

## brand_alias

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| brand_id | bigint | NN | — | REFERENCES app.brand(id) ON DELETE RESTRICT |
| platform_id | bigint | NULL | — | REFERENCES app.platform(id) ON DELETE RESTRICT |
| alias_name | text | NN | — | alias_name ~ '[^[:space:]]' |
| alias_norm | text | NN | — | alias_norm ~ '[^[:space:]]' |
| created_at | timestamptz | NN | now() | — |

## product_master

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| brand_id | bigint | NULL | — | REFERENCES app.brand(id) ON DELETE RESTRICT |
| product_name | text | NN | — | product_name ~ '[^[:space:]]' |
| product_name_norm | text | NN | — | product_name_norm ~ '[^[:space:]]' |
| category_key | varchar(64) | NN | 'UNKNOWN' | category_key ~ '[^[:space:]]' |
| product_type | varchar(64) | NN | 'UNKNOWN' | product_type ~ '[^[:space:]]' |
| status | varchar(64) | NN | 'REVIEW_REQUIRED' | status IN ('ACTIVE', 'INACTIVE', 'REVIEW_REQUIRED') |
| identifier_status | varchar(64) | NN | 'UNKNOWN' | identifier_status IN ('UNKNOWN', 'SEARCHING', 'CANDIDATE', 'REVIEW_REQUIRED', 'VERIFIED', 'NOT_FOUND', 'NOT_APPLICABLE') |
| created_method | varchar(64) | NN | — | created_method ~ '[^[:space:]]' |
| metadata_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(metadata_json) = 'object' |
| version_no | integer | NN | 1 | version_no >= 1 |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

## product_sku

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| product_id | bigint | NN | — | REFERENCES app.product_master(id) ON DELETE RESTRICT |
| sku_name | text | NN | — | sku_name ~ '[^[:space:]]' |
| option_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(option_json) = 'object' |
| option_key | text | NN | — | option_key ~ '[^[:space:]]' |
| status | varchar(64) | NN | 'REVIEW_REQUIRED' | status IN ('ACTIVE', 'INACTIVE', 'REVIEW_REQUIRED') |
| sort_order | integer | NN | 0 | sort_order >= 0 |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (product_id, option_key)`
- `UNIQUE (id, product_id)`

## product_identifier

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| product_id | bigint | NN | — | REFERENCES app.product_master(id) ON DELETE RESTRICT |
| sku_id | bigint | NULL | — | REFERENCES app.product_sku(id) ON DELETE RESTRICT |
| identifier_type | varchar(64) | NN | — | identifier_type IN ('MODEL_NO', 'STYLE_CODE', 'PRODUCT_NO', 'MPN', 'GTIN', 'EAN', 'UPC', 'BARCODE', 'BRAND_CODE') |
| identifier_value | text | NN | — | identifier_value ~ '[^[:space:]]' |
| identifier_norm | text | NN | — | identifier_norm ~ '[^[:space:]]' |
| is_primary | boolean | NN | false | — |
| is_verified | boolean | NN | false | — |
| confidence_score | numeric(5,2) | NULL | — | confidence_score BETWEEN 0 AND 100 |
| evidence_type | varchar(64) | NN | — | evidence_type ~ '[^[:space:]]' |
| source_url | text | NULL | — | — |
| evidence_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(evidence_json) = 'object' |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `FOREIGN KEY (sku_id, product_id) REFERENCES app.product_sku(id, product_id) ON DELETE RESTRICT`

## source_product

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| platform_id | bigint | NN | — | REFERENCES app.platform(id) ON DELETE RESTRICT |
| external_product_id | text | NN | — | external_product_id ~ '[^[:space:]]' |
| product_id | bigint | NULL | — | REFERENCES app.product_master(id) ON DELETE RESTRICT |
| product_url | text | NULL | — | — |
| raw_product_name | text | NN | — | raw_product_name ~ '[^[:space:]]' |
| raw_brand_name | text | NULL | — | — |
| current_price | numeric(20,4) | NULL | — | current_price >= 0 AND current_price <> 'NaN'::numeric |
| normal_price | numeric(20,4) | NULL | — | normal_price >= 0 AND normal_price <> 'NaN'::numeric |
| currency_code | varchar(3) | NULL | — | currency_code ~ '^[A-Z]{3}$' |
| stock_status | varchar(64) | NN | 'UNKNOWN' | stock_status IN ('UNKNOWN', 'IN_STOCK', 'OUT_OF_STOCK') |
| match_status | varchar(64) | NN | 'UNMATCHED' | match_status IN ('UNMATCHED', 'MATCHED', 'REVIEW_REQUIRED') |
| match_confidence | numeric(5,2) | NULL | — | match_confidence BETWEEN 0 AND 100 |
| raw_json | jsonb | NN | — | — |
| collected_at | timestamptz | NN | — | — |
| last_seen_at | timestamptz | NN | — | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (platform_id, external_product_id)`

## source_sku

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| source_product_id | bigint | NN | — | REFERENCES app.source_product(id) ON DELETE RESTRICT |
| sku_id | bigint | NULL | — | REFERENCES app.product_sku(id) ON DELETE RESTRICT |
| external_sku_id | text | NULL | — | — |
| raw_option_name | text | NN | — | raw_option_name ~ '[^[:space:]]' |
| option_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(option_json) = 'object' |
| option_key | text | NN | — | option_key ~ '[^[:space:]]' |
| current_price | numeric(20,4) | NULL | — | current_price >= 0 AND current_price <> 'NaN'::numeric |
| stock_status | varchar(64) | NN | 'UNKNOWN' | stock_status IN ('UNKNOWN', 'IN_STOCK', 'OUT_OF_STOCK') |
| raw_json | jsonb | NN | — | — |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (source_product_id, option_key)`

## product_image

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| product_id | bigint | NULL | — | REFERENCES app.product_master(id) ON DELETE RESTRICT |
| sku_id | bigint | NULL | — | REFERENCES app.product_sku(id) ON DELETE RESTRICT |
| source_product_id | bigint | NULL | — | REFERENCES app.source_product(id) ON DELETE RESTRICT |
| image_type | varchar(64) | NN | — | image_type IN ('SOURCE_MAIN', 'SOURCE_DETAIL', 'GENERATED_THUMBNAIL', 'CHANNEL_MAIN', 'CHANNEL_DETAIL') |
| source_image_id | bigint | NULL | — | REFERENCES app.product_image(id) ON DELETE RESTRICT |
| source_url | text | NULL | — | — |
| storage_provider | text | NULL | — | — |
| storage_bucket | text | NULL | — | — |
| object_key | text | NULL | — | — |
| mime_type | text | NULL | — | — |
| width | integer | NULL | — | width > 0 |
| height | integer | NULL | — | height > 0 |
| file_size | bigint | NULL | — | file_size > 0 |
| content_hash | char(64) | NULL | — | content_hash ~ '^[0-9a-f]{64}$' |
| recipe_hash | char(64) | NULL | — | recipe_hash ~ '^[0-9a-f]{64}$' |
| process_status | varchar(64) | NN | 'REGISTERED' | process_status IN ('REGISTERED', 'FETCHING', 'STORED', 'FAILED') |
| metadata_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(metadata_json) = 'object' |
| source_revision | integer | NN | 1 | source_revision >= 1 |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `CHECK (product_id IS NOT NULL OR source_product_id IS NOT NULL)`
- `CHECK (sku_id IS NULL OR product_id IS NOT NULL)`
- `FOREIGN KEY (sku_id, product_id) REFERENCES app.product_sku(id, product_id) ON DELETE RESTRICT`
- `CHECK (num_nonnulls(storage_provider, storage_bucket, object_key, content_hash, mime_type, width, height, file_size) IN (0, 8))`
- `CHECK (process_status <> 'STORED' OR num_nonnulls(storage_provider, storage_bucket, object_key, content_hash, mime_type, width, height, file_size) = 8)`
- `CHECK (image_type <> 'GENERATED_THUMBNAIL' OR (source_image_id IS NOT NULL AND recipe_hash IS NOT NULL AND num_nonnulls(storage_provider, storage_bucket, object_key, content_hash, mime_type, width, height, file_size) = 8))`

## import_batch

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| platform_id | bigint | NN | — | REFERENCES app.platform(id) ON DELETE RESTRICT |
| import_type | varchar(64) | NN | — | import_type ~ '[^[:space:]]' |
| status | varchar(64) | NN | 'QUEUED' | status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED') |
| total_count | integer | NN | 0 | total_count >= 0 |
| success_count | integer | NN | 0 | success_count >= 0 |
| failed_count | integer | NN | 0 | failed_count >= 0 |
| skipped_count | integer | NN | 0 | skipped_count >= 0 |
| review_count | integer | NN | 0 | review_count >= 0 |
| source_name | text | NN | — | source_name ~ '[^[:space:]]' |
| config_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(config_json) = 'object' |
| started_at | timestamptz | NULL | — | — |
| finished_at | timestamptz | NULL | — | — |
| created_at | timestamptz | NN | now() | — |

추가 제약:

- `CHECK (started_at <= finished_at)`
- `CHECK (status NOT IN ('SUCCEEDED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED') OR total_count::bigint = success_count::bigint + failed_count::bigint + skipped_count::bigint + review_count::bigint)`
- `CHECK (status <> 'SUCCEEDED' OR failed_count = 0)`
- `CHECK (status <> 'PARTIAL_FAILED' OR (failed_count > 0 AND failed_count < total_count))`
- `CHECK (status <> 'FAILED' OR failed_count = total_count)`

## import_item

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| import_batch_id | bigint | NN | — | REFERENCES app.import_batch(id) ON DELETE RESTRICT |
| external_product_id | text | NULL | — | — |
| source_product_id | bigint | NULL | — | REFERENCES app.source_product(id) ON DELETE RESTRICT |
| status | varchar(64) | NN | 'PENDING' | status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'REVIEW_REQUIRED', 'SKIPPED', 'FAILED') |
| action_type | varchar(64) | NULL | — | action_type IN ('CREATED', 'UPDATED', 'MATCHED', 'REVIEW_REQUIRED', 'SKIPPED', 'FAILED') |
| error_code | varchar(64) | NULL | — | — |
| error_message | text | NULL | — | — |
| raw_json | jsonb | NN | — | — |
| processed_at | timestamptz | NULL | — | — |
| created_at | timestamptz | NN | now() | — |
| input_row_no | integer | NN | — | input_row_no >= 1 |

추가 제약:

- `UNIQUE (import_batch_id, input_row_no)`

## identifier_resolve_run

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| source_product_id | bigint | NN | — | REFERENCES app.source_product(id) ON DELETE RESTRICT |
| product_id | bigint | NULL | — | REFERENCES app.product_master(id) ON DELETE RESTRICT |
| resolver_version | text | NN | — | resolver_version ~ '[^[:space:]]' |
| admission_key | varchar(73) | NULL | — | UNIQUE; migration 003 요청 UUID:source UUID |
| queue_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(queue_json) = 'object'; migration 003 |
| result_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(result_json) = 'object'; migration 003. P3-12 v2 executionCapture도 이 객체에 후보/성공 결과와 원자 저장; 신규 migration 없음 |
| status | varchar(64) | NN | 'QUEUED' | status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') |
| input_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(input_json) = 'object' |
| error_code | varchar(64) | NULL | — | — |
| error_message | text | NULL | — | — |
| started_at | timestamptz | NULL | — | — |
| finished_at | timestamptz | NULL | — | — |
| created_at | timestamptz | NN | now() | — |

추가 제약:

- `CHECK (started_at <= finished_at)`

## identifier_candidate

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| resolve_run_id | bigint | NN | — | REFERENCES app.identifier_resolve_run(id) ON DELETE RESTRICT |
| identifier_type | varchar(64) | NN | — | identifier_type IN ('MODEL_NO', 'STYLE_CODE', 'PRODUCT_NO', 'MPN', 'GTIN', 'EAN', 'UPC', 'BARCODE', 'BRAND_CODE') |
| candidate_value | text | NN | — | candidate_value ~ '[^[:space:]]' |
| candidate_norm | text | NN | — | candidate_norm ~ '[^[:space:]]' |
| confidence_score | numeric(5,2) | NULL | — | confidence_score BETWEEN 0 AND 100 |
| rank_no | integer | NN | — | rank_no >= 1 |
| decision_status | varchar(64) | NN | 'CANDIDATE' | decision_status IN ('CANDIDATE', 'AUTO_ACCEPTED', 'REVIEW_REQUIRED', 'ACCEPTED', 'REJECTED') |
| evidence_json | jsonb | NN | '[]'::jsonb | jsonb_typeof(evidence_json) = 'array' |
| conflict_json | jsonb | NN | '[]'::jsonb | jsonb_typeof(conflict_json) = 'array' |
| created_at | timestamptz | NN | now() | — |
| version_no | integer | NN | 1 | version_no >= 1 |
| decided_at | timestamptz | NULL | — | — |
| decided_by | text | NULL | — | — |

추가 제약:

- `UNIQUE (resolve_run_id, identifier_type, candidate_norm)`

## thumbnail_recipe

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| recipe_code | varchar(100) | NN | — | recipe_code ~ '[^[:space:]]' |
| recipe_name | text | NN | — | recipe_name ~ '[^[:space:]]' |
| version_no | integer | NN | 1 | version_no >= 1 |
| output_width | integer | NN | 1000 | output_width >= 1 |
| output_height | integer | NN | 1000 | output_height >= 1 |
| policy_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(policy_json) = 'object' |
| is_active | boolean | NN | true | — |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (recipe_code, version_no)`

## thumbnail_job

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| product_image_id | bigint | NN | — | REFERENCES app.product_image(id) ON DELETE RESTRICT |
| recipe_id | bigint | NN | — | REFERENCES app.thumbnail_recipe(id) ON DELETE RESTRICT |
| status | varchar(64) | NN | 'QUEUED' | status IN ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELLED') |
| path_type | varchar(64) | NULL | — | path_type IN ('SAFE_COMPOSITE', 'AI_EDIT', 'AI_RECONSTRUCT') |
| attempt_no | integer | NN | 0 | attempt_no >= 0 |
| error_code | varchar(64) | NULL | — | — |
| error_message | text | NULL | — | — |
| input_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(input_json) = 'object' |
| analysis_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(analysis_json) = 'object' |
| result_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(result_json) = 'object' |
| queued_at | timestamptz | NULL | — | — |
| started_at | timestamptz | NULL | — | — |
| finished_at | timestamptz | NULL | — | — |
| request_key | text | NN | — | request_key ~ '[^[:space:]]' |
| recipe_hash | char(64) | NULL | — | recipe_hash ~ '^[0-9a-f]{64}$' |
| provider_key | text | NULL | — | — |
| model_version | text | NULL | — | — |
| processing_version | text | NULL | — | — |
| created_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (request_key)`
- `CHECK (started_at <= finished_at)`
- `CHECK (status <> 'SUCCEEDED' OR (recipe_hash IS NOT NULL AND processing_version IS NOT NULL AND processing_version ~ '[^[:space:]]'))`

## thumbnail_review

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| thumbnail_job_id | bigint | NN | — | REFERENCES app.thumbnail_job(id) ON DELETE RESTRICT |
| review_status | varchar(64) | NN | — | review_status IN ('AUTO_APPROVED', 'REVIEW_REQUIRED', 'MANUAL_APPROVED', 'REJECTED', 'REGENERATE_REQUIRED') |
| issue_codes | text[] | NN | '{}'::text[] | — |
| score | numeric(5,2) | NULL | — | score BETWEEN 0 AND 100 |
| reviewer_type | varchar(64) | NN | — | reviewer_type ~ '[^[:space:]]' |
| reviewer_name | text | NULL | — | — |
| reviewed_at | timestamptz | NULL | — | — |
| version_no | integer | NN | 1 | version_no >= 1 |

추가 제약:

- `UNIQUE (thumbnail_job_id, version_no)`

## automation_job

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| job_code | varchar(100) | NN | — | job_code ~ '[^[:space:]]' |
| job_name | text | NN | — | job_name ~ '[^[:space:]]' |
| job_type | varchar(64) | NN | — | job_type IN ('BROWSER', 'INTERNAL', 'API') |
| handler_key | text | NN | — | handler_key ~ '[^[:space:]]' |
| profile_key | text | NULL | — | — |
| cron_expression | text | NULL | — | — |
| timezone | text | NN | 'Asia/Seoul' | timezone ~ '[^[:space:]]' |
| enabled | boolean | NN | true | — |
| allow_manual_run | boolean | NN | true | — |
| allow_parallel | boolean | NN | false | — |
| max_retries | integer | NN | 2 | max_retries >= 0 |
| cooldown_seconds | integer | NN | 60 | cooldown_seconds >= 0 |
| timeout_seconds | integer | NN | 300 | timeout_seconds >= 1 |
| config_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(config_json) = 'object' |
| created_at | timestamptz | NN | now() | — |
| updated_at | timestamptz | NN | now() | — |
| version_no | integer | NN | 1 | version_no >= 1 |

추가 제약:

- `CHECK (job_type <> 'BROWSER' OR (profile_key IS NOT NULL AND profile_key ~ '[^[:space:]]'))`

## automation_run

| 컬럼 | 타입 | NULL | 기본값 | 컬럼 제약 |
| --- | --- | --- | --- | --- |
| id | bigint | NN | IDENTITY | PRIMARY KEY |
| public_id | uuid | NN | uuidv7() | UNIQUE |
| automation_job_id | bigint | NN | — | REFERENCES app.automation_job(id) ON DELETE RESTRICT |
| queue_provider | varchar(30) | NULL | — | — |
| queue_job_id | varchar(200) | NULL | — | — |
| status | varchar(64) | NN | 'QUEUED' | status IN ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED') |
| attempt_no | integer | NN | 0 | attempt_no >= 0 |
| current_step | text | NULL | — | — |
| error_code | varchar(64) | NULL | — | — |
| error_message | text | NULL | — | — |
| current_url | text | NULL | — | — |
| input_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(input_json) = 'object' |
| result_json | jsonb | NN | '{}'::jsonb | jsonb_typeof(result_json) = 'object' |
| screenshot_key | text | NULL | — | — |
| trace_key | text | NULL | — | — |
| queued_at | timestamptz | NULL | — | — |
| started_at | timestamptz | NULL | — | — |
| finished_at | timestamptz | NULL | — | — |
| request_key | text | NN | — | request_key ~ '[^[:space:]]' |
| trigger_type | varchar(16) | NN | — | trigger_type IN ('MANUAL', 'SCHEDULED') |
| scheduled_for | timestamptz | NULL | — | — |
| created_at | timestamptz | NN | now() | — |

추가 제약:

- `UNIQUE (request_key)`
- `CHECK (started_at <= finished_at)`
- `CHECK ((queue_provider IS NULL) = (queue_job_id IS NULL))`

## 추가 인덱스와 업무 서비스 책임

- brand_alias: `(COALESCE(platform_id,0),alias_norm)` UNIQUE.
- product_identifier: `(product_id,COALESCE(sku_id,0),identifier_type,identifier_norm)` UNIQUE; 동일 범위·타입의 primary에 부분 UNIQUE; `(identifier_type,identifier_norm)` 조회 index.
- source_sku: external_sku_id가 NULL이 아닐 때 `(source_product_id,external_sku_id)` UNIQUE.
- product_image: GENERATED_THUMBNAIL의 `(source_image_id,image_type,recipe_hash)` 부분 UNIQUE; SOURCE_MAIN/SOURCE_DETAIL의 `(source_product_id,image_type,source_url,source_revision)` 부분 UNIQUE.
- product_master: `(brand_id,identifier_status)`, `identifier_status`, `GIN(product_name_norm gin_trgm_ops)`.
- source_product: `(platform_id,last_seen_at)`.
- import_batch/identifier_resolve_run/thumbnail_job/automation_run: `(status,created_at)`.
- identifier_candidate: `(decision_status,created_at)`.
- IANA timezone은 PostgreSQL pg_timezone_names와 대조하는 write trigger로 검증한다. 변경 가능한 timezone catalogue를 IMMUTABLE CHECK 함수로 감추지 않는다.
- DB CHECK는 유효한 행의 형태를 검사한다. 상태 전이 및 version CAS, Source SKU와 MASTER 재매핑 잠금, 사용한 recipe 버전 불변성, thumbnail review append-only 업무 경로는 해당 P2/P3/P4/P5 service 작업에서 트랜잭션으로 구현·검증한다.
- raw secret 제거, URI 안전성 및 사용자 입력 validation은 ingest/API 경계의 후속 작업이다. DB schema 검증을 해당 보안 경계 완료로 기록하지 않는다.
- 플랫폼 seed: MUSINSA/SOURCE, OLIVEYOUNG/SOURCE, COUPANG/CHANNEL, NAVER/CHANNEL. 초기 name은 code와 같고 실제 운영 명칭은 후속 관리에서 변경한다.

## Provider quota infrastructure (migration 004)

- DEC-20260915-029: `004-provider-quota`는 별도 `bros_provider` schema의 account/daily_budget/reservation을 추가한다. 위 `app` 18개 업무 테이블/259개 컬럼 계약은 유지한다.
- account: SHA-256 ID PK, `(provider_key, account_key)` UNIQUE, 고정 예산/가격/간격/cooldown, active_reservation_id FK, next_allowed_at. 비밀 키는 저장하지 않는다.
- daily_budget: `(account_id, utc_day)` PK, account FK, bigint reserved_microusd. DB UTC 날짜별 예약 누계이며 최대 safe integer 범위 CHECK를 적용한다.
- reservation: UUID PK, account FK, UTC 예약일/비용, provider_id/owner_id, ACTIVE/RELEASED/RECOVERED 및 시각/복구 actor/reason. 상태와 종료·감사 필드 조합 CHECK, 계정/날짜 index를 적용한다.
- 서비스가 계정 행 FOR UPDATE와 짧은 transaction으로 예산·ACTIVE·호출 간격을 관리한다. HTTP 중 DB transaction을 유지하지 않으며 lease 자동 만료/환불은 없다. [정책과 복구](PROVIDER_QUOTA.md)를 따른다.
- down/up은 일회용 PostgreSQL fixture에서 검증한다. 운영 ledger를 지우는 down/reset은 제공하지 않으며 실제 BROS DB 004 적용은 NOT_RUN이다.
