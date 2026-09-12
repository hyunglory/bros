import type { ColumnType, Generated } from "kysely";

// PostgreSQL driver values: int8/numeric remain strings; timestamps are Date.
// JSON writes are serialized strings so pg never treats a JSON array as a PG array.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;
type Identity = ColumnType<string, never, never>;
type PublicId = ColumnType<string, string | undefined, never>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DefaultTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;
type JsonColumn<T, Required extends boolean = false> = ColumnType<
  T,
  Required extends true ? string : string | undefined,
  string
>;

export interface PlatformTable {
  id: Identity;
  public_id: PublicId;
  code: string;
  name: string;
  platform_role: "SOURCE" | "CHANNEL" | "INTEGRATION";
  is_active: Generated<boolean>;
  config_json: JsonColumn<JsonObject>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface BrandTable {
  id: Identity;
  public_id: PublicId;
  brand_key: string;
  name_ko: string | null;
  name_en: string | null;
  official_url: string | null;
  is_active: Generated<boolean>;
  metadata_json: JsonColumn<JsonObject>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface BrandAliasTable {
  id: Identity;
  public_id: PublicId;
  brand_id: string;
  platform_id: string | null;
  alias_name: string;
  alias_norm: string;
  created_at: DefaultTimestamp;
}

export interface ProductMasterTable {
  id: Identity;
  public_id: PublicId;
  brand_id: string | null;
  product_name: string;
  product_name_norm: string;
  category_key: Generated<string>;
  product_type: Generated<string>;
  status: Generated<"ACTIVE" | "INACTIVE" | "REVIEW_REQUIRED">;
  identifier_status: Generated<
    | "UNKNOWN"
    | "SEARCHING"
    | "CANDIDATE"
    | "REVIEW_REQUIRED"
    | "VERIFIED"
    | "NOT_FOUND"
    | "NOT_APPLICABLE"
  >;
  created_method: string;
  metadata_json: JsonColumn<JsonObject>;
  version_no: Generated<number>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ProductSkuTable {
  id: Identity;
  public_id: PublicId;
  product_id: string;
  sku_name: string;
  option_json: JsonColumn<JsonObject>;
  option_key: string;
  status: Generated<"ACTIVE" | "INACTIVE" | "REVIEW_REQUIRED">;
  sort_order: Generated<number>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ProductIdentifierTable {
  id: Identity;
  public_id: PublicId;
  product_id: string;
  sku_id: string | null;
  identifier_type:
    | "MODEL_NO"
    | "STYLE_CODE"
    | "PRODUCT_NO"
    | "MPN"
    | "GTIN"
    | "EAN"
    | "UPC"
    | "BARCODE"
    | "BRAND_CODE";
  identifier_value: string;
  identifier_norm: string;
  is_primary: Generated<boolean>;
  is_verified: Generated<boolean>;
  confidence_score: string | null;
  evidence_type: string;
  source_url: string | null;
  evidence_json: JsonColumn<JsonObject>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface SourceProductTable {
  id: Identity;
  public_id: PublicId;
  platform_id: string;
  external_product_id: string;
  product_id: string | null;
  product_url: string | null;
  raw_product_name: string;
  raw_brand_name: string | null;
  current_price: string | null;
  normal_price: string | null;
  currency_code: string | null;
  stock_status: Generated<"UNKNOWN" | "IN_STOCK" | "OUT_OF_STOCK">;
  match_status: Generated<"UNMATCHED" | "MATCHED" | "REVIEW_REQUIRED">;
  match_confidence: string | null;
  raw_json: JsonColumn<JsonValue, true>;
  collected_at: Timestamp;
  last_seen_at: Timestamp;
  updated_at: DefaultTimestamp;
}

export interface SourceSkuTable {
  id: Identity;
  public_id: PublicId;
  source_product_id: string;
  sku_id: string | null;
  external_sku_id: string | null;
  raw_option_name: string;
  option_json: JsonColumn<JsonObject>;
  option_key: string;
  current_price: string | null;
  stock_status: Generated<"UNKNOWN" | "IN_STOCK" | "OUT_OF_STOCK">;
  raw_json: JsonColumn<JsonValue, true>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ProductImageTable {
  id: Identity;
  public_id: PublicId;
  product_id: string | null;
  sku_id: string | null;
  source_product_id: string | null;
  image_type:
    "SOURCE_MAIN" | "SOURCE_DETAIL" | "GENERATED_THUMBNAIL" | "CHANNEL_MAIN" | "CHANNEL_DETAIL";
  source_image_id: string | null;
  source_url: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  object_key: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  file_size: string | null;
  content_hash: string | null;
  recipe_hash: string | null;
  process_status: Generated<"REGISTERED" | "FETCHING" | "STORED" | "FAILED">;
  metadata_json: JsonColumn<JsonObject>;
  source_revision: Generated<number>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ImportBatchTable {
  id: Identity;
  public_id: PublicId;
  platform_id: string;
  import_type: string;
  status: Generated<"QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL_FAILED" | "FAILED" | "CANCELLED">;
  total_count: Generated<number>;
  success_count: Generated<number>;
  failed_count: Generated<number>;
  skipped_count: Generated<number>;
  review_count: Generated<number>;
  source_name: string;
  config_json: JsonColumn<JsonObject>;
  started_at: NullableTimestamp;
  finished_at: NullableTimestamp;
  created_at: DefaultTimestamp;
}

export interface ImportItemTable {
  id: Identity;
  public_id: PublicId;
  import_batch_id: string;
  external_product_id: string | null;
  source_product_id: string | null;
  status: Generated<"PENDING" | "RUNNING" | "SUCCEEDED" | "REVIEW_REQUIRED" | "SKIPPED" | "FAILED">;
  action_type: "CREATED" | "UPDATED" | "MATCHED" | "REVIEW_REQUIRED" | "SKIPPED" | "FAILED" | null;
  error_code: string | null;
  error_message: string | null;
  raw_json: JsonColumn<JsonValue, true>;
  processed_at: NullableTimestamp;
  created_at: DefaultTimestamp;
  input_row_no: number;
}

export interface IdentifierResolveRunTable {
  id: Identity;
  public_id: PublicId;
  source_product_id: string;
  product_id: string | null;
  resolver_version: string;
  status: Generated<"QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED">;
  input_json: JsonColumn<JsonObject>;
  error_code: string | null;
  error_message: string | null;
  started_at: NullableTimestamp;
  finished_at: NullableTimestamp;
  created_at: DefaultTimestamp;
}

export interface IdentifierCandidateTable {
  id: Identity;
  public_id: PublicId;
  resolve_run_id: string;
  identifier_type:
    | "MODEL_NO"
    | "STYLE_CODE"
    | "PRODUCT_NO"
    | "MPN"
    | "GTIN"
    | "EAN"
    | "UPC"
    | "BARCODE"
    | "BRAND_CODE";
  candidate_value: string;
  candidate_norm: string;
  confidence_score: string | null;
  rank_no: number;
  decision_status: Generated<
    "CANDIDATE" | "AUTO_ACCEPTED" | "REVIEW_REQUIRED" | "ACCEPTED" | "REJECTED"
  >;
  evidence_json: JsonColumn<JsonValue[]>;
  conflict_json: JsonColumn<JsonValue[]>;
  created_at: DefaultTimestamp;
  version_no: Generated<number>;
  decided_at: NullableTimestamp;
  decided_by: string | null;
}

export interface ThumbnailRecipeTable {
  id: Identity;
  public_id: PublicId;
  recipe_code: string;
  recipe_name: string;
  version_no: Generated<number>;
  output_width: Generated<number>;
  output_height: Generated<number>;
  policy_json: JsonColumn<JsonObject>;
  is_active: Generated<boolean>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface ThumbnailJobTable {
  id: Identity;
  public_id: PublicId;
  product_image_id: string;
  recipe_id: string;
  status: Generated<"QUEUED" | "RUNNING" | "RETRY_WAIT" | "SUCCEEDED" | "FAILED" | "CANCELLED">;
  path_type: "SAFE_COMPOSITE" | "AI_EDIT" | "AI_RECONSTRUCT" | null;
  attempt_no: Generated<number>;
  error_code: string | null;
  error_message: string | null;
  input_json: JsonColumn<JsonObject>;
  analysis_json: JsonColumn<JsonObject>;
  result_json: JsonColumn<JsonObject>;
  queued_at: NullableTimestamp;
  started_at: NullableTimestamp;
  finished_at: NullableTimestamp;
  request_key: string;
  recipe_hash: string | null;
  provider_key: string | null;
  model_version: string | null;
  processing_version: string | null;
  created_at: DefaultTimestamp;
}

export interface ThumbnailReviewTable {
  id: Identity;
  public_id: PublicId;
  thumbnail_job_id: string;
  review_status:
    "AUTO_APPROVED" | "REVIEW_REQUIRED" | "MANUAL_APPROVED" | "REJECTED" | "REGENERATE_REQUIRED";
  issue_codes: Generated<string[]>;
  score: string | null;
  reviewer_type: string;
  reviewer_name: string | null;
  reviewed_at: NullableTimestamp;
  version_no: Generated<number>;
}

export interface AutomationJobTable {
  id: Identity;
  public_id: PublicId;
  job_code: string;
  job_name: string;
  job_type: "BROWSER" | "INTERNAL" | "API";
  handler_key: string;
  profile_key: string | null;
  cron_expression: string | null;
  timezone: Generated<string>;
  enabled: Generated<boolean>;
  allow_manual_run: Generated<boolean>;
  allow_parallel: Generated<boolean>;
  max_retries: Generated<number>;
  cooldown_seconds: Generated<number>;
  timeout_seconds: Generated<number>;
  config_json: JsonColumn<JsonObject>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
  version_no: Generated<number>;
}

export interface AutomationRunTable {
  id: Identity;
  public_id: PublicId;
  automation_job_id: string;
  queue_provider: string | null;
  queue_job_id: string | null;
  status: Generated<
    "QUEUED" | "RUNNING" | "RETRY_WAIT" | "SUCCESS" | "FAILED" | "TIMEOUT" | "CANCELLED"
  >;
  attempt_no: Generated<number>;
  current_step: string | null;
  error_code: string | null;
  error_message: string | null;
  current_url: string | null;
  input_json: JsonColumn<JsonObject>;
  result_json: JsonColumn<JsonObject>;
  screenshot_key: string | null;
  trace_key: string | null;
  queued_at: NullableTimestamp;
  started_at: NullableTimestamp;
  finished_at: NullableTimestamp;
  request_key: string;
  trigger_type: "MANUAL" | "SCHEDULED";
  scheduled_for: NullableTimestamp;
  created_at: DefaultTimestamp;
}

export interface Database {
  "app.platform": PlatformTable;
  "app.brand": BrandTable;
  "app.brand_alias": BrandAliasTable;
  "app.product_master": ProductMasterTable;
  "app.product_sku": ProductSkuTable;
  "app.product_identifier": ProductIdentifierTable;
  "app.source_product": SourceProductTable;
  "app.source_sku": SourceSkuTable;
  "app.product_image": ProductImageTable;
  "app.import_batch": ImportBatchTable;
  "app.import_item": ImportItemTable;
  "app.identifier_resolve_run": IdentifierResolveRunTable;
  "app.identifier_candidate": IdentifierCandidateTable;
  "app.thumbnail_recipe": ThumbnailRecipeTable;
  "app.thumbnail_job": ThumbnailJobTable;
  "app.thumbnail_review": ThumbnailReviewTable;
  "app.automation_job": AutomationJobTable;
  "app.automation_run": AutomationRunTable;
}
