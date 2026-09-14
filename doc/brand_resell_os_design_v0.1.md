## brand_resell_os_design_v0.1.md

> **적용 개정: v0.2 (2026-09-11)** — 파일명의 v0.1은 참조 호환성을 위해 유지한다. 아래 v0.1 표기와 기존 검수 판정은 최초 작성 이력이며, 현재 적용 기준은 [구현 보완 명세 v0.2](BROS_구현_보완_명세_v0.2.md) 및 이 문서의 개정 내용이다. 현재 기준 문서는 `doc/`에서 관리한다. 문서 검토는 실제 구현·테스트 PASS를 의미하지 않는다. 변경 요약은 [문서 안내](README.md)를 참조한다.


# 브랜드 리셀 OS 설계서

> 문서 버전: v0.1
> 기준일: 2026-09-11
> 프로젝트 코드명: brand-resell-os
> 상태: 개발 착수 전 MVP 설계 베이스라인 / 검수 완료
> 다음 단계: 기존 WBS 85개 작업과 구현 보완 명세를 기준으로 Phase 1 착수
> 사업 목표: 무신사·올리브영 등 국내 소싱처의 수집 상품을 내부 MASTER 기준으로 정규화하고, 품번 보정·프리미엄 썸네일 생성·브라우저 스케줄 자동화를 수행한 뒤 쿠팡·네이버 판매 운영 OS로 확장한다.

---

# 0. 문서 목적

이 문서는 브랜드 리셀 OS의 **첫 공식 설계 베이스라인(v0.1)** 이다. 이전 대화에서 논의한 구조와 세부 설계를 통합·재검수했으며, 이후 변경은 본 문서를 기준으로 버전 관리한다.

문서 버전과 개발 단계 번호가 혼동되지 않도록, 구현 순서는 `Phase 1~6`으로 표기한다.

본 문서의 목적은 다음과 같다.

1. 1차 MVP의 범위를 고정한다.

2. 상품 MASTER의 정체성과 데이터 경계를 고정한다.

3. 품번 Resolver, 썸네일 엔진, 브라우저 자동화의 안전한 처리 규칙을 고정한다.

4. 성능·운영비·확장성을 고려한 기술 스택과 배포 구조를 고정한다.

5. 2차 개발 및 미래 더망고 API 연동 시 핵심 구조를 다시 뜯지 않도록 확장 지점을 확보한다.

6. 다음 단계의 실제 개발 WBS를 작성할 기준 문서로 사용한다.

---

# 1. v0.1 검수 결과 요약

기존 설계를 기능·성능·비용·정합성·보안·운영·확장성 관점에서 다시 검수한 결과, 큰 방향은 유지하되 아래 항목을 수정 또는 보강했다.

## 1.1 유지하는 핵심 결정

- MVP는 **Modular Monolith**로 시작한다.

- Front/API/Worker를 TypeScript 중심으로 통일한다.

- Node.js 24 LTS + Fastify v5 + PostgreSQL 18 + Kysely를 사용한다.

- Queue/Scheduler는 PostgreSQL 기반 `pg-boss`로 시작한다.

- Redis, Kafka, Kubernetes, Elasticsearch는 MVP에 도입하지 않는다.

- API와 Worker는 코드 저장소를 공유하되 실행 프로세스를 분리한다.

- Playwright와 Sharp는 Worker 전용 의존성으로 격리한다.

- 더망고 API는 MVP에서 제외하고 미래 Integration으로 둔다.

## 1.2 이번 검수에서 변경·보강한 사항

### 0. 문서 버전 체계 초기화

- 본 문서를 첫 공식 베이스라인인 **v0.1**로 정의한다.

- 구현 진행 상황은 문서 버전과 분리해 `Phase 1~6`으로 관리한다.

- 이후 설계 변경은 `v0.2`, `v0.3`처럼 문서 자체의 변경 이력으로만 사용한다.

### A. MVP 업무 테이블 수 변경

기존 13개 테이블에서 Importer 및 Thumbnail Job/QA를 정식 모델로 반영하여 **18개 업무 테이블**을 기준으로 변경한다.

추가 테이블:

- `import_batch`

- `import_item`

- `thumbnail_recipe`

- `thumbnail_job`

- `thumbnail_review`

### B. PRODUCT_MASTER의 범위 명확화

`PRODUCT_MASTER`는 단순 상품명 단위가 아니다.

> 같은 제조사/브랜드의 동일 상업 모델·동일 패키지/컬러웨이 등, 하나의 안정적인 제품 정체성으로 관리할 단위를 MASTER로 본다.

예:

- 패션: `NIKE DD1391-100` 같은 컬러웨이/스타일코드 단위가 MASTER, 사이즈 260/270/280은 SKU.

- 뷰티: 동일 제품 라인과 패키지가 MASTER, 용량·색상·호수 등 실제 판매 선택값은 SKU가 될 수 있다. 단 제조사 코드/GTIN이 실질적으로 다른 제품 정체성을 나타내는 경우 별도 MASTER로 분리할 수 있다.

`PRODUCT_FAMILY`는 필요성이 확인되기 전까지 MVP에서 만들지 않고 2차 확장 후보로 둔다.

### C. 품번 Resolver의 Auto Accept 강화

단순 점수 95점 이상만으로 자동 확정하지 않는다.

- 강한 Evidence가 있어야 한다.

- 브랜드/GTIN/모델 Variant 충돌이 없어야 한다.

- AI 추론만으로 품번을 생성하거나 확정하지 않는다.

- 증거가 없으면 `NOT_FOUND`가 정상 결과다.

### D. 썸네일 설계의 핵심 수정 및 연출 기준 단순화

- 기본 연출에서 **투명 아크릴 받침대를 완전히 제거**한다.

- 받침대 없는 미니멀 스튜디오 배경, 자연스러운 접지 그림자, 절제된 반사광을 기본값으로 한다.

- 제품 외 장식 오브젝트를 새로 생성하지 않는 것을 기본 정책으로 한다.

사용자 요구인 **“제품은 절대 변경하지 않는다”**와 **“가려진 제품 부분을 복원한다”**는 기술적으로 충돌할 수 있다.

따라서 다음 정책으로 확정한다.

1. 가림이 없는 제품은 가능한 한 **원본 제품 픽셀을 유지한 채 배경/연출만 합성**한다.

2. 사람/소품이 제품과 겹치지 않으면 segmentation/inpainting 후 원본 제품 영역을 다시 합성한다.

3. 제품 일부가 가려졌다면 같은 상품의 다른 수집 이미지에서 복원 가능한 원본 근거를 먼저 찾는다.

4. 다른 원본이 없고 생성형 AI가 가려진 제품을 추정 복원한 경우 `AI_RECONSTRUCT`로 표시한다.

5. `AI_RECONSTRUCT`가 로고, 라벨, 문자, 용량, 형태 경계에 영향을 준 경우 **자동 승인 금지** 및 `REVIEW_REQUIRED` 처리한다.

6. 생성형 모델이 제품 문구나 로고를 임의 수정할 위험을 QA에서 반드시 검사한다.

### E. 썸네일 채널 정책 분리

`PREMIUM_STUDIO_V1`은 사용자 기본 썸네일 레시피로 사용하되 쿠팡·네이버 등 채널 등록 직전에는 **Channel Compliance Validator**를 거친다.

마켓 정책은 변경될 수 있으므로 디자인 레시피와 채널 규칙을 분리한다.

내부 기본 출력은 1000×1000으로 유지한다. 이는 채널 등록 적합성 판정을 의미하지 않는다. 채널 등록 기능 착수 시 공식 정책 URL·확인일·허용 포맷/용량/치수·배경/문구 규칙을 기록하고 validator fixture에 반영한다.

### F. Queue 공급자 종속성 제거

`automation_run.queue_job_id`를 UUID로 고정하지 않는다.

```
queue_provider VARCHAR(30)
queue_job_id   VARCHAR(200)
```

로 관리하여 미래에 pg-boss → SQS/BullMQ/RabbitMQ 등으로 바꿔도 업무 스키마를 유지한다.

### G. Browser Automation 운영 보강

- 동일 `profile_key` 동시 실행 금지 기본값

- CAPTCHA/2FA 자동 우회 금지

- 오류 종류별 Retry 정책

- Flow Lifecycle 정의

- 임의 JS/Shell 실행 금지

- Screenshot/Trace/현재 URL/Step/Error Code 기록

---

# 2. 프로젝트 목표

## 2.1 1차 MVP 목표

1차 개발에서는 ERP 전체를 만들지 않는다. 아래 3개 자동화 요구와 이를 지탱하는 상품 MASTER 기반을 구현한다.

### 요구사항 1 — 썸네일 자동 생성

이미 수집된 상품 이미지로부터 쇼핑몰 대표이미지용 프리미엄 썸네일을 자동 생성한다.

### 요구사항 2 — 품번 자동 보정

이미 수집된 상품 중 품번/모델번호가 없는 상품에 대해 근거 기반으로 품번 후보를 찾고 자동확정 또는 검수대기로 보낸다.

### 요구사항 3 — 브라우저 스케줄 자동화

더망고 등 웹브라우저로 조작해야 하는 업무를 정해진 시간에 Playwright가 실행하고 성공/실패/재시도/로그를 관리한다.

## 2.2 2차 목표

- 소싱상품 선별 및 Sourcing Score

- 상품관리

- 판매/주문관리

- 문의관리

- 재고/매입관리

- 수익/통계관리

- 쿠팡/네이버 Connector 고도화

## 2.3 미래 목표

- 더망고 API Connector

- 추가 소싱처/판매처

- 가격 최적화

- 자동 매입 후보 추천

- 운영 의사결정 Dashboard

---

# 3. 범위 고정

## 3.1 MVP 포함

- Monorepo Skeleton

- React/Vite Admin

- Fastify API

- Worker

- PostgreSQL

- Kysely Migration/Repository

- pg-boss Queue/Scheduler

- 기존 상품 Importer

- Brand Normalizer

- Product MASTER/SKU/Identifier

- Identifier Resolver

- 프리미엄 Thumbnail Engine

- Thumbnail QA/Review

- Playwright Browser Automation

- Object Storage Adapter

- 로그/오류/Retry/Backup

## 3.2 MVP 제외

- 쿠팡 주문 자동수집

- 네이버 주문 자동수집

- 재고 ERP

- 판매관리

- 문의/CS 통합

- 매출/마진 Dashboard 고도화

- AI 소싱 추천

- 가격 이력/자동 가격조정

- 더망고 API

- Redis

- Kafka

- Kubernetes

- Elasticsearch

- Microservice 분리

- 임의 사용자 Script 실행 기능

---

# 4. Architecture Overview

```
flowchart TD
    ADMIN[React Admin - Static] --> CADDY[Caddy]
    CADDY --> API[Fastify API]
    API --> DB[(PostgreSQL 18)]
    API --> QUEUE[pg-boss]

    QUEUE --> WORKER[Worker]
    WORKER --> DB
    WORKER --> IMPORTER[Importer]
    WORKER --> RESOLVER[Identifier Resolver]
    WORKER --> THUMB[Thumbnail Engine]
    WORKER --> BROWSER[Playwright]

    THUMB --> STORAGE[Object Storage Adapter]
    BROWSER --> STORAGE

    STORAGE --> R2[Cloudflare R2 - Production Default]
```

핵심 원칙:

> API는 빠른 요청 처리와 Job 등록만 담당하고, 느리고 무거운 작업은 Worker가 담당한다.

---

# 5. 기술 스택

| 영역 | 기술 | 결정 이유 |
| --- | --- | --- |
| Runtime | Node.js 24 LTS | Front/API/Worker 생태계 통일, Playwright 친화성 |
| Language | TypeScript | 타입 공유 및 유지보수 |
| Admin | React + Vite | 관리자 SPA, 정적 배포 |
| API | Fastify v5 | 낮은 오버헤드, Schema 기반 검증 |
| Contract | TypeBox / JSON Schema | Fastify 검증 + TS 타입 단일 원천 |
| DB | PostgreSQL 18 | JSONB, pg_trgm, uuidv7, 무료/확장성 |
| DB Access | Kysely + pg | SQL 제어 및 타입 안정성 |
| Queue | pg-boss | Redis 없이 Postgres 기반 Job/Schedule |
| Browser | Playwright + Chromium | UI 자동화, Trace/Screenshot |
| Image | Sharp/libvips + AI Edit Adapter | 저비용 deterministic 처리 + 필요한 경우 생성형 편집 |
| Storage | ObjectStorage Port | Local/R2/S3 교체 가능 |
| Production Storage | Cloudflare R2 기본 | 이미지/Artifact 저장 비용 최적화 |
| Reverse Proxy | Caddy | HTTPS, API reverse proxy, Admin static serving |
| Logging | Pino | 구조화 JSON 로그 |
| Package Manager | pnpm Workspace | 단순한 Monorepo, 디스크 효율 |
| Deploy | Docker Compose | MVP 운영 복잡도 최소화 |

## 5.1 2026-09-11 기술 기준 검수

- 프로젝트 Runtime 기준은 Node.js 24 계열이다. 정확한 설치 패치는 착수 시 확인하여 고정한다.

- 프로젝트 DB 기준은 PostgreSQL 18이다. 사용할 이미지의 패치/tag/digest는 구현 시 확인하여 고정한다.

- PostgreSQL 18은 `uuidv7()`을 기본 제공한다.

- Fastify v5는 Node.js 20 이상을 요구하므로 Node 24와 호환된다.

- pg-boss는 설치할 정확한 버전의 engines, PostgreSQL 요구사항, 트랜잭션 enqueue 계약을 확인하고 통합 테스트한 뒤 lockfile에 고정한다.

- 실제 minor/patch는 `pnpm-lock.yaml` 및 Docker tag/digest로 고정하며 설계 문서에는 영구 종속시키지 않는다.

---

# 6. 프로젝트 구조

```
brand-resell-os/
├─ apps/
│  ├─ admin/
│  ├─ api/
│  └─ worker/
│
├─ packages/
│  ├─ core/
│  ├─ contracts/
│  ├─ db/
│  ├─ queue/
│  ├─ storage/
│  ├─ image/
│  └─ browser/
│
├─ infra/
│  ├─ docker/
│  └─ caddy/
│
├─ scripts/
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ .env.example
└─ README.md
```

Connector가 실제 필요해질 때만 추가한다.

```
packages/connectors/
├─ coupang/
├─ naver/
└─ themango/
```

빈 Connector를 미리 만들지 않는다.

---

# 7. Domain Boundary

```
PRODUCT DOMAIN
├─ Brand
├─ Product Master
├─ SKU
└─ Identifier

IMPORT DOMAIN
├─ Import Batch
├─ Source Product
└─ Source SKU

IDENTIFIER DOMAIN
├─ Resolve Run
├─ Candidate
├─ Evidence
└─ Decision Policy

IMAGE DOMAIN
├─ Product Image
├─ Thumbnail Recipe
├─ Thumbnail Job
└─ Thumbnail Review

AUTOMATION DOMAIN
├─ Automation Job
├─ Automation Run
├─ Browser Flow
└─ Browser Session
```

2차 Domain:

```
SOURCING
INVENTORY
PURCHASE
CHANNEL LISTING
ORDER
INQUIRY
ANALYTICS
```

---

# 8. 상품 MASTER 기준

## 8.1 계층

| 계층 | 정의 | 예 |
| --- | --- | --- |
| BRAND | 표준 브랜드 | NIKE |
| PRODUCT_MASTER | 하나의 안정적인 제품 정체성 | DD1391-100 |
| PRODUCT_SKU | 선택 가능한 실제 Variant | 270mm |
| SOURCE_PRODUCT | 무신사/올리브영 수집 상품 | 외부 상품 ID |
| SOURCE_SKU | 소싱처 옵션 | 외부 옵션 ID |
| CHANNEL_LISTING | 판매 채널 상품 | 2차 개발 |
| CHANNEL_SKU | 판매 채널 옵션 | 2차 개발 |

## 8.2 MASTER 생성 규칙

MASTER는 상품명만으로 만들지 않는다.

우선 판단 요소:

1. 브랜드

2. 제조사/브랜드 모델번호 또는 스타일코드

3. GTIN/EAN/UPC/Barcode

4. 컬러웨이/패키지 Variant

5. 상품명과 옵션

### 패션 예

```
MASTER
브랜드 A 모델명 / STYLE-EXAMPLE-001 (가상 예시; 실제 품번은 검증 데이터만 사용)

SKU
260
270
280
```

### 화장품 예

```
MASTER
브랜드 A 쿠션 본품

SKU
21호
23호
```

단, 제조사 식별번호가 컬러/용량별로 별도의 상업 제품을 의미한다면 MASTER 분리를 허용한다.

---

# 9. MVP ERD

```
erDiagram
    PLATFORM ||--o{ SOURCE_PRODUCT : owns
    PLATFORM ||--o{ IMPORT_BATCH : imports

    BRAND ||--o{ BRAND_ALIAS : has
    BRAND ||--o{ PRODUCT_MASTER : has

    PRODUCT_MASTER ||--o{ PRODUCT_SKU : has
    PRODUCT_MASTER ||--o{ PRODUCT_IDENTIFIER : identified_by
    PRODUCT_MASTER ||--o{ PRODUCT_IMAGE : has

    IMPORT_BATCH ||--o{ IMPORT_ITEM : contains
    SOURCE_PRODUCT ||--o{ IMPORT_ITEM : references

    SOURCE_PRODUCT ||--o{ SOURCE_SKU : has
    PRODUCT_MASTER ||--o{ SOURCE_PRODUCT : mapped_to
    PRODUCT_SKU ||--o{ SOURCE_SKU : mapped_to

    SOURCE_PRODUCT ||--o{ IDENTIFIER_RESOLVE_RUN : resolves
    IDENTIFIER_RESOLVE_RUN ||--o{ IDENTIFIER_CANDIDATE : produces

    PRODUCT_IMAGE ||--o{ THUMBNAIL_JOB : source_of
    THUMBNAIL_RECIPE ||--o{ THUMBNAIL_JOB : controls
    THUMBNAIL_JOB ||--o{ THUMBNAIL_REVIEW : reviewed_by

    AUTOMATION_JOB ||--o{ AUTOMATION_RUN : executes
```

---

# 10. MVP 업무 테이블 목록 — 19개

| # | Table | 역할 |
| --- | --- | --- |
| 1 | platform | 소싱/판매/통합 플랫폼 |
| 2 | brand | 표준 브랜드 |
| 3 | brand_alias | 브랜드 별칭 |
| 4 | product_master | 내부 기준 상품 |
| 5 | product_sku | 내부 옵션 |
| 6 | product_identifier | 품번/GTIN/Barcode |
| 7 | source_product | 수집 상품 |
| 8 | source_sku | 수집 상품 옵션 |
| 9 | product_image | 원본/생성 이미지 |
| 10 | import_batch | Import 실행 묶음 |
| 11 | import_item | Import 개별 결과 |
| 12 | identifier_resolve_run | 품번 탐색 실행 |
| 13 | identifier_candidate | 품번 후보/근거 |
| 14 | thumbnail_recipe | 썸네일 정책/버전 |
| 15 | thumbnail_job | 썸네일 생성 실행 |
| 16 | thumbnail_review | QA/수동검수 |
| 17 | automation_job | 자동화 정의 |
| 18 | automation_run | 자동화 실행이력 |
| 19 | artifact_retention_event | Browser artifact 보존·hold·삭제 감사 이력 |

pg-boss 내부 테이블은 기술 스키마로 별도 관리하고 업무 테이블 수에 포함하지 않는다.

---

# 11. DB 공통 정책

## 11.1 Schema

```
CREATE SCHEMA IF NOT EXISTS app;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

## 11.2 ID

내부 PK:

```
BIGINT GENERATED ALWAYS AS IDENTITY
```

외부 공개 ID:

```
UUID DEFAULT uuidv7()
```

외부 API에는 BIGINT를 노출하지 않는다.

## 11.3 Time

- DB: `TIMESTAMPTZ`

- UI 기본 표시: `Asia/Seoul`

## 11.4 상태값

MVP는 PostgreSQL ENUM보다 `VARCHAR + CHECK`를 기본으로 사용한다.

## 11.5 JSONB

사용:

- 원본 데이터

- 유동 옵션

- Evidence

- Job Config

- Result Metadata

사용하지 않는 핵심값:

- 상품명

- 브랜드

- 가격

- 상태

- 품번

- 검색/정렬 대상 필드

`raw_json` 전체에 무조건 GIN을 걸지 않는다.

---

# 12. 핵심 테이블 물리 설계

자료형·NULL·기본값·FK/UNIQUE·추가 필드·상태 전이는 [구현 보완 명세 2장](BROS_구현_보완_명세_v0.2.md#2-db-공통-물리-계약--p1-05)을 함께 적용한다. 아래는 도메인 필드 요약이며 Migration의 완전한 DDL이 아니다.

## 12.1 `platform`

```
id
public_id
code
name
platform_role: SOURCE | CHANNEL | INTEGRATION
is_active
config_json
created_at
updated_at
```

초기 Seed:

```
MUSINSA      SOURCE
OLIVEYOUNG   SOURCE
COUPANG      CHANNEL
NAVER        CHANNEL
```

`THEMANGO`는 미래 API Integration 개발 시 추가한다.

## 12.2 `brand`

```
id
public_id
brand_key
name_ko
name_en
official_url
is_active
metadata_json
created_at
updated_at
```

## 12.3 `brand_alias`

```
id
public_id
brand_id
platform_id nullable
alias_name
alias_norm
created_at
```

Unique 후보:

```
COALESCE(platform_id, 0) + alias_norm
```

## 12.4 `product_master`

```
id
public_id
brand_id nullable
product_name
product_name_norm
category_key
product_type
status
identifier_status
created_method
metadata_json
created_at
updated_at
```

`identifier_status`:

```
UNKNOWN
SEARCHING
CANDIDATE
REVIEW_REQUIRED
VERIFIED
NOT_FOUND
NOT_APPLICABLE
```

Index:

```
brand_id
identifier_status
GIN(product_name_norm gin_trgm_ops)
```

## 12.5 `product_sku`

```
id
public_id
product_id
sku_name
option_json
option_key
status
sort_order
created_at
updated_at
```

Unique:

```
product_id + option_key
```

예:

```
{
  "color": "WHITE",
  "size": "270"
}
```

```
option_key = color=WHITE|size=270
```

## 12.6 `product_identifier`

```
id
public_id
product_id
sku_id nullable
identifier_type
identifier_value
identifier_norm
is_primary
is_verified
confidence_score
evidence_type
source_url
evidence_json
created_at
updated_at
```

Type:

```
MODEL_NO
STYLE_CODE
PRODUCT_NO
MPN
GTIN
EAN
UPC
BARCODE
BRAND_CODE
```

Policy:

- 오염된 Source 때문에 저장이 막히지 않도록 모든 식별자를 무조건 전역 UNIQUE로 만들지 않는다.

- GTIN/모델번호가 서로 다른 MASTER에서 충돌하면 Resolver Conflict로 관리한다.

- `is_verified=true` Identifier를 Matching에서 우선한다.

## 12.7 `source_product`

```
id
public_id
platform_id
external_product_id
product_id nullable
product_url
raw_product_name
raw_brand_name
current_price
normal_price
currency_code
stock_status
match_status
match_confidence
raw_json
collected_at
last_seen_at
updated_at
```

Unique:

```
platform_id + external_product_id
```

## 12.8 `source_sku`

```
id
public_id
source_product_id
sku_id nullable
external_sku_id nullable
raw_option_name
option_json
option_key
current_price
stock_status
raw_json
created_at
updated_at
```

## 12.9 `product_image`

```
id
public_id
product_id nullable
sku_id nullable
source_product_id nullable
image_type
source_image_id nullable
source_url nullable
storage_provider
storage_bucket
object_key
mime_type
width
height
file_size
content_hash
recipe_hash
process_status
metadata_json
created_at
updated_at
```

Image Type:

```
SOURCE_MAIN
SOURCE_DETAIL
GENERATED_THUMBNAIL
CHANNEL_MAIN
CHANNEL_DETAIL
```

Generated image idempotency:

```
source_image_id + image_type + recipe_hash
```

원본 이미지는 덮어쓰지 않는다.

## 12.10 `import_batch`

```
id
public_id
platform_id
import_type
status
total_count
success_count
failed_count
skipped_count
review_count
source_name
config_json
started_at
finished_at
created_at
```

## 12.11 `import_item`

```
id
public_id
import_batch_id
external_product_id
source_product_id nullable
status
action_type
error_code
error_message
raw_json
processed_at
created_at
```

Action:

```
CREATED
UPDATED
MATCHED
REVIEW_REQUIRED
SKIPPED
FAILED
```

## 12.12 `identifier_resolve_run`

```
id
public_id
source_product_id
product_id nullable
resolver_version
status
input_json
error_code
error_message
started_at
finished_at
created_at
```

## 12.13 `identifier_candidate`

```
id
public_id
resolve_run_id
identifier_type
candidate_value
candidate_norm
confidence_score
rank_no
decision_status
evidence_json
conflict_json
created_at
```

Decision:

```
CANDIDATE
AUTO_ACCEPTED
REVIEW_REQUIRED
ACCEPTED
REJECTED
```

## 12.14 `thumbnail_recipe`

```
id
public_id
recipe_code
recipe_name
version_no
output_width
output_height
policy_json
is_active
created_at
updated_at
```

Unique:

```
recipe_code + version_no
```

## 12.15 `thumbnail_job`

```
id
public_id
product_image_id
recipe_id
status
path_type
attempt_no
error_code
error_message
input_json
analysis_json
result_json
queued_at
started_at
finished_at
```

Path Type:

```
SAFE_COMPOSITE
AI_EDIT
AI_RECONSTRUCT
```

## 12.16 `thumbnail_review`

```
id
public_id
thumbnail_job_id
review_status
issue_codes
score
reviewer_type
reviewer_name nullable
reviewed_at
```

Review Status:

```
AUTO_APPROVED
REVIEW_REQUIRED
MANUAL_APPROVED
REJECTED
REGENERATE_REQUIRED
```

## 12.17 `automation_job`

```
id
public_id
job_code
job_name
job_type
handler_key
profile_key nullable
cron_expression nullable
timezone
enabled
allow_manual_run
allow_parallel
max_retries
cooldown_seconds
timeout_seconds
config_json
created_at
updated_at
```

Job Type:

```
BROWSER
INTERNAL
API
```

## 12.18 `automation_run`

```
id
public_id
automation_job_id
queue_provider
queue_job_id
status
attempt_no
current_step
error_code
error_message
current_url nullable
input_json
result_json
screenshot_key nullable
trace_key nullable
queued_at
started_at
finished_at
```

Status:

```
QUEUED
RUNNING
RETRY_WAIT
SUCCESS
FAILED
TIMEOUT
CANCELLED
```

## 12.19 `artifact_retention_event`

Browser 실행 증적의 보존 예외와 삭제 결과를 append-only로 기록한다. 원본 이미지와 승인 썸네일은 이 테이블과 cleanup 대상에서 제외한다.

```
id
public_id
object_key
event_type
hold_until nullable
reason nullable
storage_provider nullable
storage_bucket nullable
error_code nullable
created_at
```

Event Type:

```
HOLD_SET
HOLD_RELEASED
DELETED
DELETE_FAILED
```

---

# 13. Phase 1 — 실행 가능한 Skeleton

## 13.1 성공 조건

```
PostgreSQL 시작
→ Migration 성공
→ API 시작
→ GET /health = 200
→ pg-boss 시작
→ system.test Job 생성
→ Worker 소비
→ SUCCESS 기록
```

## 13.2 Queue Name

```
system.test
product.import
identifier.resolve
thumbnail.generate
browser.run
artifact.cleanup
```

## 13.3 API/Worker 분리

API에서 직접 하면 안 되는 작업:

- 이미지 생성

- 브라우저 실행

- 대량 Import

- 외부 품번 검색

API는 Job을 등록하고 빠르게 반환한다.

---

# 14. Phase 2 — Existing Product Importer

## 14.1 목적

이미 수집된 상품을 단순 INSERT하지 않고 **표준 Source → MASTER Pipeline**으로 변환한다.

```
flowchart TD
    RAW[기존 수집 데이터] --> ADAPTER[Import Adapter]
    ADAPTER --> VALID[Validation]
    VALID --> BRAND[Brand Normalizer]
    BRAND --> SOURCE[Source Product Upsert]
    SOURCE --> IDS[Identifier Extract]
    IDS --> MATCH[MASTER Matcher]
    MATCH --> MASTER[MASTER Link/Create]
    MASTER --> SKU[SKU Mapping]
    SKU --> IMG[Image Registration]
    IMG --> RESULT[Import Result]
```

## 14.2 표준 입력 계약

```
interface SourceProductInput {
  platformCode: string;
  externalProductId: string;
  productName: string;
  brandName?: string;
  productUrl?: string;
  normalPrice?: number;
  currentPrice?: number;
  currencyCode?: string;
  identifiers?: { type: string; value: string }[];
  options?: SourceOptionInput[];
  images?: SourceImageInput[];
  raw: unknown;
}
```

Adapter 후보:

```
LegacyDbImportAdapter
CsvImportAdapter
XlsxImportAdapter
JsonImportAdapter
ApiImportAdapter
```

실제 기존 데이터 형식이 확인되면 필요한 Adapter 하나부터 만든다.

## 14.3 최소 Validation

필수:

```
platformCode
externalProductId
productName
```

브랜드/품번/가격/이미지가 없어도 Import 자체는 허용한다.

## 14.4 Brand Normalizer

```
Nike
NIKE
나이키
Nike Korea
```

→ `brand_alias`를 이용해 표준 BRAND로 연결한다.

확실하지 않은 Alias는 새 BRAND를 무조건 생성하지 않고 미해결 상태로 남겨 사람 검수를 가능하게 한다.

## 14.5 Source Product Upsert

Idempotency Key:

```
platform_id + external_product_id
```

재 Import 시 중복 INSERT가 아니라 Update/Last Seen 갱신으로 처리한다.

## 14.6 MASTER Matching 우선순위

1. Verified GTIN/EAN/UPC exact

2. Verified MPN/Model/Style exact

3. Brand + Identifier

4. Brand + 상품명 유사도

5. 옵션/색상/용량 비교

6. 추가 Metadata

7. 검수

Hard Conflict:

```
브랜드 충돌
GTIN 충돌
모델번호 충돌
명확한 Variant 충돌
```

상품명 유사도만으로 자동확정하지 않는다.

## 14.7 Chunk / Transaction

초기 권장:

```
Chunk Size = 100
Product Import Concurrency = 2
```

한 상품 오류로 Batch 전체를 Rollback하지 않는다.

## 14.8 동시 MASTER 생성 방지

- Identifier 기반 transaction

- Unique/Conflict 감지

- Conflict 시 재조회

- 동일 논리 상품의 중복 생성 최소화

## 14.9 Importer 완료 조건

- 재실행해도 중복 Source 상품이 생기지 않는다.

- Import 단건 실패가 Batch 전체를 중단하지 않는다.

- 신규 MASTER 생성과 기존 MASTER 연결을 구분한다.

- SKU를 표준화한다.

- 원본 Raw JSON을 보존한다.

- 작업 결과와 오류를 `import_batch/import_item`으로 추적한다.

---

# 15. Phase 3 — Identifier Resolver

## 15.1 목적

> 품번을 추측해서 채우는 시스템이 아니라, 검증 가능한 후보를 찾아 Evidence와 함께 결정하는 시스템이다.

## 15.2 처리 Stage

```
flowchart TD
    INPUT[Resolve Input] --> EMBEDDED[Raw/Field Extractor]
    EMBEDDED --> URL[URL Analyzer]
    URL --> PATTERN[Brand Pattern Extractor]
    PATTERN --> LOCAL[Internal Catalog Search]
    LOCAL --> EXT[External Candidate Providers]
    EXT --> EVIDENCE[Evidence Collector]
    EVIDENCE --> NORMAL[Candidate Normalizer]
    NORMAL --> SCORE[Scorer]
    SCORE --> CONFLICT[Conflict Detector]
    CONFLICT --> DECISION[Decision Engine]
```

## 15.3 비용 순서

1. Source field / Raw JSON

2. 상품명/옵션 Regex

3. URL/HTML 내 코드

4. 기존 내부 MASTER

5. Barcode/GTIN

6. 외부 검색/공식 자료

7. Vision/OCR/AI 보조

비싼 단계는 마지막에만 실행한다.

## 15.4 Pattern Registry

브랜드별 형식을 관리한다.

```
interface IdentifierPattern {
  brandKey: string;
  identifierType: string;
  regex: RegExp;
}
```

Regex Match는 **후보 생성**일 뿐 자동확정은 아니다.

## 15.5 Candidate Provider Port

```
interface IdentifierCandidateProvider {
  search(input: IdentifierResolveInput): Promise<IdentifierCandidate[]>;
}
```

MVP Provider 우선순위:

```
InternalCatalogProvider
SourceEvidenceProvider
SearchEvidenceProvider
```

브랜드 공식/Barcode API 등은 필요성 및 비용을 검증한 뒤 추가한다.

## 15.6 Evidence 예

```
GTIN_MATCH
OFFICIAL_SITE
SOURCE_FIELD
MODEL_PATTERN
TITLE_MATCH
URL_MATCH
OPTION_MATCH
EXTERNAL_CATALOG
IMAGE_MATCH
AI_INFERENCE
MANUAL_REVIEW
```

AI 자체는 강한 Evidence로 취급하지 않는다.

## 15.7 Decision Policy

권장 초기 범위:

```
95~100  + Strong Evidence + No Hard Conflict → AUTO_ACCEPTED
80~94                                      → REVIEW_REQUIRED
60~79                                      → CANDIDATE
<60                                        → NOT_FOUND
```

정확한 GTIN 또는 검증된 공식 모델번호는 일반 Score보다 강한 규칙으로 취급 가능하다.

## 15.8 Hard Gate

아래가 존재하면 자동승인 금지:

```
CONFLICT_BRAND
CONFLICT_GTIN
CONFLICT_MODEL
CONFLICT_VARIANT
CONFLICT_VOLUME
CONFLICT_COLOR
```

## 15.9 Failure Code

```
NO_CANDIDATE
BRAND_UNKNOWN
AMBIGUOUS_RESULT
CONFLICT_GTIN
CONFLICT_BRAND
CONFLICT_VARIANT
EXTERNAL_SEARCH_FAILED
RATE_LIMIT
TIMEOUT
INVALID_SOURCE_DATA
```

## 15.10 관리자 검수

기능:

```
승인
거절
직접입력
다시탐색
```

수동 승인 결과도 Evidence로 저장한다.

## 15.11 완료 조건

- 후보 여러 개 생성 가능

- 후보별 Evidence/Score/Conflict 보존

- 자동승인과 검수대기 구분

- 품번 임의 생성 금지

- 수동 승인/거절 가능

- Batch Resolve 지원

- Provider Rate Limit 지원

---

# 16. Phase 4 — Thumbnail Engine

## 16.1 목표

> 제품의 정체성을 보존하면서, 사람/소품/배경을 제거하고 프리미엄 스튜디오 광고형 1:1 대표 썸네일을 생성한다.

## 16.2 공식 기본 Recipe

```
THUMBNAIL_PREMIUM_STUDIO_V1
```

출력 기본:

```
1000 x 1000
1:1
sRGB
JPG 또는 WEBP 내부저장
Channel Upload 시 Channel 지원 포맷으로 변환
```

쿠팡 대표 이미지 업로드 시점에는 현재 API가 허용하는 JPG/PNG 및 크기/파일용량 조건에 맞춰 변환한다.

## 16.3 사용자 공식 제작 정책

### 제품 보존

- 원본 이미지의 제품은 절대 변경하지 않고 배경과 연출만 변경한다.

- 제품 디자인, 색상, 로고, 브랜드명, 패키지, 라벨, 글자, 용량 표기, 모양, 비율은 원본 그대로 유지한다.

- 제품은 하나만 중앙에 크게 배치하며 잘리거나 왜곡되지 않게 한다.

### 제거

- 모델, 사람, 얼굴, 손, 팔, 신체 일부가 있다면 모두 자연스럽게 제거한다.

- 제품과 관계없는 꽃, 잎, 물방울, 장식품, 소품, 배경 그래픽, 문구 등을 제거한다.

### 가림 복원

- 사람이 제품을 가리는 경우 우선 같은 상품의 다른 원본 이미지에서 가려진 부분을 복원할 근거를 찾는다.

- 원본 근거가 없어서 AI가 추정 복원해야 하는 경우 `AI_RECONSTRUCT` 경로로 표시한다.

- 로고/텍스트/라벨/용량/제품 외곽에 생성형 복원이 개입하면 자동 승인하지 않는다.

### 연출

- 별도의 받침대나 장식 구조물을 기본 연출 요소로 추가하지 않는다.

- 제품이 자연스럽게 놓인 깨끗한 전문 스튜디오 환경을 구성한다.

- 제품 아래에는 실제 촬영처럼 자연스러운 접지 그림자를 적용할 수 있다.

- 은은한 스튜디오 반사광은 허용하되, 제품 라벨과 로고의 가독성을 해치지 않도록 최소화한다.

- 배경과 그림자는 제품보다 시선을 끌지 않아야 한다.

- 전문 카메라로 촬영한 실제 프리미엄 브랜드 광고처럼 사실적으로 표현한다.

- 쇼핑몰 대표이미지용 정사각형 1:1로 제작한다.

## 16.4 공식 AI Edit Prompt Template

```
Edit the provided product image for a premium e-commerce thumbnail.

Preserve the product exactly as it appears in the original image.
Do not change the product design, color, logo, brand name, package, label,
text, capacity text, shape, or proportions.

Remove all people and body parts naturally, including models, faces,
hands, arms, or any visible human body parts.
If a person is holding or covering the product, remove the person.
Whenever possible, restore hidden product areas using verified alternate
source imagery of the same product rather than inventing details.

Remove all unrelated elements such as flowers, leaves, water droplets,
decorative objects, props, background graphics, and unrelated text.

Keep only one product. Place the product large and centered without
cropping or distortion.

Use a clean, minimal professional studio environment without adding decorative stands or display structures.
Ground the product naturally with a subtle contact shadow where appropriate.
Use only restrained studio reflections, keeping the product label and logo clearly visible.
The background and lighting must never compete visually with the product.

Make the result look like a realistic premium brand advertisement
photographed with a professional camera.

Generate as a square 1:1 e-commerce hero image.
```

## 16.5 3가지 Processing Path

### `SAFE_COMPOSITE`

제품이 충분히 보이며 원본 제품 픽셀을 그대로 활용할 수 있는 경우.

```
Analyze
→ Product segmentation
→ Background/people/props removal
→ Background generation/composition
→ Original product pixels re-composite
→ Natural contact shadow / subtle studio reflection
→ Resize/Color Convert
→ QA
```

**기본 우선 경로**다.

### `AI_EDIT`

복잡한 사람/소품 제거, 자연스러운 빈 공간 복원 등이 필요하지만 제품 핵심 영역은 보존할 수 있는 경우.

생성형 처리가 들어가더라도 최종 단계에서 원본 제품 영역을 다시 합성하는 것을 우선한다.

### `AI_RECONSTRUCT`

제품 자체가 사람/손/소품에 의해 가려져 원본에 없는 픽셀을 추정해야 하는 경우.

정책:

```
AUTO_APPROVED 금지
→ REVIEW_REQUIRED
```

특히 로고/문구/라벨/용량/형태 경계를 건드린 경우 반드시 수동 검수한다.

## 16.6 Image Analyzer

분석:

```
productCount
hasHuman
hasBodyPart
hasOcclusion
occlusionRegion
hasProps
backgroundComplexity
labelVisibility
logoVisibility
productCropRisk
recommendedPath
```

## 16.7 QA Rule

필수 검사:

- 제품 1개인가

- 제품이 잘리지 않았는가

- 종횡비가 변하지 않았는가

- 원본 주요 색상이 유지됐는가

- 로고가 변경/깨짐/추가되지 않았는가

- 브랜드명이 유지됐는가

- 라벨 문구가 유지됐는가

- 용량 표기가 유지됐는가

- 사람/손/팔/얼굴이 남지 않았는가

- 불필요 소품이 남지 않았는가

- 중앙 배치됐는가

- 반사광이 라벨을 가리지 않는가

- 복제된 제품이 없는가

Issue Code:

```
MULTI_PRODUCT
HUMAN_REMAINS
BODY_PART_REMAINS
PROP_REMAINS
LABEL_UNCLEAR
LABEL_CHANGED
LOGO_CHANGED
TEXT_CHANGED
COLOR_SHIFT
PRODUCT_DISTORTED
PRODUCT_CROPPED
BAD_CENTERING
OVER_REFLECTION
LOW_REALISM
AI_RECONSTRUCTION_RISK
CHANNEL_POLICY_RISK
```

## 16.8 Review Policy

### Auto Approve 가능

- `SAFE_COMPOSITE`

- 핵심 보존 QA 통과

- 제품 원본 픽셀 보존 확인

### Review Required

- 모든 `AI_EDIT` 결과는 MVP 기본값 REVIEW_REQUIRED

- 약한 QA 경고

- 스튜디오 연출 품질 검토 필요

### Auto Approve 금지

- `AI_RECONSTRUCT`

- 로고/텍스트/라벨/용량 변경 의심

- 제품 형상/색상 변화 의심

## 16.9 Channel Compliance Layer

Thumbnail Recipe와 채널 정책은 분리한다.

```
Generated Thumbnail
→ ChannelComplianceValidator(COUPANG/NAVER/...)
→ 필요 시 Format/Size 변환
→ Policy Warning
→ Channel Listing
```

마켓 규칙이 바뀌어도 `PREMIUM_STUDIO_V1`을 다시 설계하지 않는다.

## 16.10 Storage / Idempotency

```
source_image_id + recipe_hash
```

같은 원본 + 같은 레시피는 무의미한 중복 생성을 방지한다.

원본은 절대 덮어쓰지 않는다.

---

# 17. Phase 5 — Browser Scheduler / Automation

## 17.1 목표

```
정해진 시간
→ Job 생성
→ Browser Worker
→ Playwright
→ 로그인 상태 확인
→ 지정 Flow 실행
→ 업무 성공조건 확인
→ Screenshot/Trace/로그
→ SUCCESS / RETRY / FAILED
```

## 17.2 개념

```
Job     = 무엇을 언제 실행할지
Run     = 실제 1회 실행 기록
Flow    = 브라우저 안의 작업 절차
Profile = 로그인 세션 실행 환경
```

## 17.3 Flow Lifecycle

```
prepare()
authenticate()
execute()
verify()
cleanup()
```

성공은 단순 클릭 성공이 아니라 `verify()`에서 업무 결과가 확인되어야 한다.

## 17.4 Flow Registry

```
apps/worker/src/browser-flows/
├─ registry.ts
├─ common/
├─ demo/
└─ themango-ui/   # 실제 구현 시 추가
```

DB에는 실행 가능한 임의 JS/Shell 코드를 저장하지 않는다.

`handler_key`는 서버에 등록된 Flow만 선택한다.

## 17.5 Session

```
/data/browser-profiles/<profile-key>/
```

- DB에 Cookie/Token 평문 저장 금지

- Worker 사용자만 접근

- 로그/Backup에 Session 내용 노출 금지

## 17.6 기본 동시성

```
동일 profile_key = concurrency 1
Browser worker 기본 concurrency = 1
```

실측 후 증가한다.

## 17.7 CAPTCHA / 2FA

자동 우회하지 않는다.

```
CAPTCHA_DETECTED
TWO_FACTOR_REQUIRED
→ 작업 중단
→ 관리자 확인
```

## 17.8 Retry

재시도 가능:

```
NETWORK_ERROR
NAVIGATION_TIMEOUT
BROWSER_CRASHED
일시적 ELEMENT_NOT_FOUND
```

재시도 금지:

```
AUTH_FAILED
CAPTCHA_DETECTED
TWO_FACTOR_REQUIRED
PERMISSION_DENIED
FLOW_LOGIC_ERROR
```

## 17.9 Artifact

각 Run:

```
start.png
failure.png
final.png
trace.zip
result.json
```

표준 Object Key:

```
automation/<yyyy>/<mm>/<dd>/<run-public-id>/...
```

## 17.10 표준 Error Code

```
NETWORK_ERROR
NAVIGATION_TIMEOUT
ELEMENT_NOT_FOUND
ELEMENT_NOT_CLICKABLE
LOGIN_REQUIRED
AUTH_FAILED
SESSION_EXPIRED
CAPTCHA_DETECTED
TWO_FACTOR_REQUIRED
PERMISSION_DENIED
SUCCESS_CONDITION_NOT_MET
UNEXPECTED_MODAL
FLOW_LOGIC_ERROR
BROWSER_CRASHED
UNKNOWN_ERROR
```

---

# 18. Queue / Scheduler

## 18.1 역할 분리

```
automation_job
= 업무 스케줄 정의

automation_run
= 운영 이력

pg-boss
= 기술적 Queue/Schedule 상태
```

## 18.2 Worker 시작 Reconciliation

Worker 시작 시 활성 Job과 pg-boss Schedule 상태를 비교하여 누락/변경을 동기화한다.

## 18.3 Queue Provider 추상화

업무 DB:

```
queue_provider = PGBOSS
queue_job_id   = 문자열
```

향후 Queue를 교체해도 업무 테이블을 유지한다.

## 18.4 초기 동시성

| Queue | 초기 Concurrency |
| --- | --- |
| Product Import | 2 |
| Identifier Resolve | 4 |
| Thumbnail | 2 |
| Browser | 1 |

4 vCPU / 8GB 기준 시작값이며 실측 후 변경한다.

---

# 19. Storage Architecture

```
interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(key: string): Promise<ReadableStream>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
```

Adapter:

```
Development  LocalStorageAdapter
Production   R2StorageAdapter
Future       S3StorageAdapter / MinIOStorageAdapter
```

DB에는 완성 URL이 아니라:

```
storage_provider
storage_bucket
object_key
```

를 저장한다.

---

# 20. Image Fetch Security

외부 원본 이미지를 내려받을 때 적용:

- Source Domain Allowlist

- redirect 횟수 제한

- private/loopback/link-local/metadata IP 차단

- DNS resolution 후 IP 재검사

- 최대 다운로드 크기 제한

- Connection/Read Timeout

- MIME Type 검사

- 실제 Decode 검사

- decompression bomb 방지

- 파일 hash 계산

---

# 21. API Contract

API Prefix:

```
/api/v1
```

TypeBox Schema를 요청/응답 검증 및 Admin 타입의 단일 원천으로 사용한다.

## 21.1 System

```
GET /health
GET /ready
GET /api/v1/system/status
```

## 21.2 Import

```
POST /api/v1/imports
GET  /api/v1/imports
GET  /api/v1/imports/:publicId
GET  /api/v1/imports/:publicId/items
```

## 21.3 Product

```
GET   /api/v1/products
GET   /api/v1/products/:publicId
PATCH /api/v1/products/:publicId
```

## 21.4 Identifier

```
POST /api/v1/products/:publicId/identifier/resolve
POST /api/v1/identifier/resolve/batch
GET  /api/v1/identifier/reviews
POST /api/v1/identifier/candidates/:candidatePublicId/accept
POST /api/v1/identifier/candidates/:candidatePublicId/reject
```

## 21.5 Thumbnail

```
POST /api/v1/products/:publicId/thumbnails
POST /api/v1/thumbnails/batch
GET  /api/v1/thumbnails/jobs
GET  /api/v1/thumbnails/jobs/:publicId
POST /api/v1/thumbnails/jobs/:publicId/regenerate
POST /api/v1/thumbnails/jobs/:publicId/approve
POST /api/v1/thumbnails/jobs/:publicId/reject
```

## 21.6 Automation

```
GET   /api/v1/automation/jobs
POST  /api/v1/automation/jobs
PATCH /api/v1/automation/jobs/:publicId
POST  /api/v1/automation/jobs/:publicId/run
GET   /api/v1/automation/runs
GET   /api/v1/automation/runs/:publicId
```

---

# 22. 관리자 UI

## 22.1 Dashboard

- MASTER 상품 수

- Source 상품 수

- 미매칭 상품 수

- 품번 미확인 수

- 품번 검수대기 수

- 썸네일 미생성/검수대기 수

- 오늘 Automation 성공/실패

## 22.2 Import 관리

- Batch 목록

- 전체/성공/실패/검수/Skip 건수

- 개별 실패 이유

- 재처리

## 22.3 MASTER 상품관리

검색:

```
브랜드
상품명
품번
Identifier 상태
Source
```

상세:

```
MASTER
SKU
Identifier
Source Mapping
원본 이미지
썸네일
Resolver History
```

## 22.4 품번 검수

```
상품 정보
원본 이미지
추천 품번
신뢰도
Evidence
Conflict

[승인] [거절] [직접입력] [재탐색]
```

## 22.5 썸네일 관리

```
원본 vs 생성본
Recipe
Processing Path
QA Score
Issue Codes

[승인] [거절] [재생성]
```

`AI_RECONSTRUCT`는 검수대기 필터에서 명확하게 표시한다.

## 22.6 자동화 관리

```
Job
Schedule
Profile
활성/비활성
최근실행
다음실행
상태

[지금 실행]
```

Run 상세:

```
현재/최종 Step
Error Code
Error Message
URL
Screenshot
Trace
Retry History
```

---

# 23. Security

## 23.1 관리자 인증

Pilot/MVP:

```
HTTPS
+ Caddy basic_auth
+ 단일 관리자 권한 / 사용자별 감사 actor
+ 강한 비밀번호
```

MVP에는 별도 사용자/세션/RBAC 테이블을 추가하지 않는다. 상태 변경 Origin/CSRF 검증, API 직접 접근 차단, Artifact 인증은 구현 보완 명세 3장을 따른다. 다중 역할이 필요하면 Application Auth/RBAC를 후속 설계 변경으로 다룬다.

## 23.2 Secret

Git/로그 저장 금지:

```
.env
DB password
R2 credentials
API secret
Cookie
Browser profile
Access token
```

## 23.3 Browser Security

- 임의 Script 입력 기능 금지

- 등록된 Flow만 실행

- Profile 파일 권한 제한

- CAPTCHA/2FA 우회 금지

## 23.4 Database

- Parameter Binding

- Dynamic sort/filter Whitelist

- DB 외부 Port 차단

- 최소 권한 계정

---

# 24. Observability

Pino Context:

```
requestId
queueProvider
queueJobId
runPublicId
importBatchPublicId
productPublicId
sourceProductId
thumbnailJobPublicId
handlerKey
```

민감정보 Redaction을 적용한다.

업무 추적은 애플리케이션 로그만 의존하지 않고 업무 테이블에 저장한다.

---

# 25. Backup / Recovery

기본:

```
매일 pg_dump
→ 압축
→ 별도 Object Storage Backup Prefix
```

예시 보존:

```
일간 7
주간 4
월간 3
```

최소 분기 1회 Restore Test를 수행한다.

Browser Profile은 DB Backup과 분리하고 민감도에 맞게 보호한다.

---

# 26. Development / Production

## 26.1 개발

```
Docker
└ PostgreSQL

Host/WSL
├ Admin
├ API
└ Worker
```

개발 중 Playwright는 Headed 실행을 허용한다.

## 26.2 운영

```
flowchart TD
    INTERNET[Internet] --> CADDY[Caddy]
    CADDY --> ADMIN[React Static]
    CADDY --> API[Fastify API]
    API --> PG[(PostgreSQL)]
    API --> BOSS[pg-boss]
    BOSS --> WORKER[Worker]
    WORKER --> PG
    WORKER --> CHROME[Chromium]
    WORKER --> STORE[Object Storage]
```

React Admin은 별도 Node 서버를 두지 않고 정적 빌드한다.

---

# 27. 성능 / 비용 전략

의도적으로 제외:

```
Redis
Kafka
Kubernetes
Elasticsearch
별도 Workflow Engine
별도 Scheduler Server
Admin Node SSR Server
Oracle License
```

초기 서버:

```
Pilot       2 vCPU / 4GB
권장 MVP    4 vCPU / 8GB / 80~160GB SSD
```

Scale Trigger:

- CPU 70% 이상 장시간 지속

- Swap/Memory Pressure

- Queue Delay 증가

- Thumbnail 작업 중 API Latency 악화

- Browser Backlog 증가

확장 순서:

```
1. Worker 별도 서버
2. PostgreSQL Managed 전환 검토
3. Queue 분리 필요성 재평가
4. 특정 도메인만 Service 분리
```

---

# 28. Test Strategy

## Unit

- Brand Normalizer

- Option Normalizer

- Identifier Normalizer

- Matcher Rule

- Resolver Score/Hard Gate

- Thumbnail Recipe Hash

- Thumbnail QA Rule

- Retry Policy

## Integration

- Migration

- PostgreSQL Repository

- Import Upsert

- pg-boss

- Local/R2 Storage Adapter

- Thumbnail Job state transition

## Browser

- Locator 안정성

- Session 만료

- Timeout

- 실패 Artifact

- 성공조건 검증

## E2E

```
Existing Product Import
→ MASTER 생성/매칭
→ Identifier Resolve
→ Manual/Auto Decision
→ Thumbnail Generate
→ Thumbnail Review
→ Browser Scheduled Job
→ Admin에서 전체 이력 확인
```

---

# 29. 더망고 계획

## MVP

더망고 API 개발 없음.

```
상품 API X
주문 API X
재고 API X
문의 API X
```

## MVP Browser Automation

업무상 필요한 더망고 웹 UI 조작은 일반 `BrowserFlow` 구현체로 추가 가능하다.

## 미래 API

```
interface IntegrationConnector {
  syncProducts(): Promise<void>;
}
```

`TheMangoConnector`를 추가하더라도 MASTER Core를 변경하지 않는 것을 목표로 한다.

---

# 30. 2차 데이터 확장 예정

```
product_family                 optional
purchase
purchase_item
purchase_evidence
source_product_price_history
inventory
inventory_transaction
channel_listing
channel_sku
order
order_item
customer_inquiry
sales_daily
product_profit
sourcing_score
```

소싱 점수의 핵심 입력:

```
Source Price
+ Channel Market Price
+ Platform Fee
+ Shipping Cost
+ Expected Return Risk
+ Competition
+ Demand/Sales Signal
= Sourcing Score
```

---

# 31. 1차 MVP 구현 순서

```
Phase 1  Skeleton / DB / API / Queue / Worker
   ↓
Phase 2  Existing Product Importer
   ↓
Phase 3  Identifier Resolver
   ↓
Phase 4  Thumbnail Engine + QA
   ↓
Phase 5  Browser Scheduler / Automation
   ↓
Phase 6  운영 안정화 / E2E / Backup / Release
```

`Phase 6`은 **운영 가능한 MVP 완성**을 위해 테스트·백업·보안·실패 UX를 하나의 안정화 단계로 명시한다.

---

# 32. MVP 완료 Definition of Done

## 상품

- 기존 상품을 Import 가능

- 재 Import 멱등성 보장

- MASTER 생성/매칭

- SKU 생성/Mapping

- Raw 보존

## 품번

- 미확인 상품 탐색

- Candidate/Evidence/Conflict 보존

- Auto/Review/Not Found 구분

- 수동 승인/거절

- 품번 Fabrication 금지

## 썸네일

- 원본 보존

- Premium Studio Recipe 적용

- 사람/소품 제거

- 제품 1개 중앙 배치

- 깔끔한 프리미엄 스튜디오 연출

- 제품 보존 QA

- `AI_RECONSTRUCT` 자동승인 금지

- 중복 생성 방지

- 수동 검수/재생성

## 자동화

- Cron 실행

- 수동 실행

- Session 재사용

- 동일 Profile Lock

- Retry/Timeout

- Screenshot/Trace

- CAPTCHA/2FA 안전 중단

## 운영

- HTTPS

- 관리자 인증

- Secret 보호

- DB 비공개

- Backup

- Restore Test 절차

- 주요 E2E 통과

---

# 33. 위험 Register

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 잘못된 품번 자동입력 | 카탈로그 오매칭/판매 문제 | Evidence Hard Gate + Review |
| AI가 제품 로고/문구 변경 | 상품 왜곡 | 원본 픽셀 우선 + QA + AI_RECONSTRUCT 검수 |
| 가려진 제품을 AI가 잘못 복원 | 허위 이미지 | Alternate Source 우선 + 자동승인 금지 |
| Marketplace 이미지 정책 변경 | 등록 거절 | Channel Compliance Layer |
| 동일 MASTER 중복 | 재고/통계 왜곡 | Identifier 우선 Matcher + Conflict 처리 |
| Source UI/Schema 변경 | Import 실패 | Adapter 분리 + Raw 보존 |
| Browser UI 변경 | 자동화 실패 | Flow Version + Trace + Error Code |
| Session/2FA | 자동화 중단 | Profile 관리 + Manual Action |
| Queue 중복 | 중복 이미지/중복 클릭 | Idempotency + Profile Lock |
| 이미지 URL 공격 | SSRF | Domain/IP/MIME/Size 검증 |
| Worker 과부하 | API 지연 | 프로세스 분리 + Concurrency 제한 |
| 서버 장애 | 데이터 손실 | DB Backup + Object Storage |
| Cloud 종속 | 이전 비용 | Storage Port |
| 더망고/API 정책 변경 | Integration 장애 | Adapter/Connector 경계 |

---

# 34. 구현 직전 확인할 입력 정보

아래는 WBS 작성 후 각 개발 Task 착수 전에 확인해야 하며 Architecture Blocker는 아니다.

1. 기존 수집 상품 데이터의 실제 저장 위치와 형식

2. 샘플 수집 상품 20~100건

3. 상품별 원본 이미지 필드 구조

4. 현재 품번 컬럼 및 결측 데이터 예시

5. 초기 총 상품/옵션 수

6. Browser Automation 대상 실제 화면/Step

7. 사용 계정의 로그인/2FA 방식

8. 운영 서버 Provider

9. AI Image Edit Provider 선택 및 호출 비용

10. 썸네일 자동승인 허용 수준

---

# 35. Architecture Decision Record 요약

| ADR | 결정 |
| --- | --- |
| ADR-001 | Modular Monolith |
| ADR-002 | Node.js 24 LTS + TypeScript |
| ADR-003 | React/Vite Admin 정적 배포 |
| ADR-004 | Fastify v5 + TypeBox |
| ADR-005 | PostgreSQL 18 + Kysely |
| ADR-006 | pg-boss로 MVP Queue/Schedule |
| ADR-007 | API/Worker Process 분리 |
| ADR-008 | BIGINT PK + UUIDv7 Public ID |
| ADR-009 | Internal PRODUCT_MASTER가 상품 정체성의 기준 |
| ADR-010 | Evidence-first Identifier Resolver |
| ADR-011 | AI가 품번을 임의 생성하지 않음 |
| ADR-012 | Thumbnail은 Safe Composite 우선 |
| ADR-013 | AI Reconstruction 결과 자동승인 금지 |
| ADR-014 | Premium Studio Recipe와 Channel Policy 분리 |
| ADR-015 | Object Storage Adapter 사용 |
| ADR-016 | Browser Flow는 등록 Handler만 실행 |
| ADR-017 | CAPTCHA/2FA 우회하지 않음 |
| ADR-018 | 더망고 API는 MVP 제외 |
| ADR-019 | Redis/Kafka/K8s는 필요 시점까지 제외 |
| ADR-020 | 운영 안정화 Phase 6을 MVP Definition에 포함 |

---

# 36. 검수 판정

## 36.1 기능 정합성

**통과**

1차 요구사항 3개가 모두 독립 Domain으로 정의되어 있고 상품 MASTER를 중심으로 연결된다.

## 36.2 데이터 확장성

**통과**

Source/MASTER/SKU/Identifier/Channel 경계가 분리되어 있어 2차 쿠팡·네이버 연동 및 미래 더망고 연동 시 Core 재설계 가능성이 낮다.

## 36.3 비용 구조

**통과**

PostgreSQL을 DB+Queue 기반으로 사용하고 Redis/Kafka/K8s를 제외해 Pilot 운영비가 낮다.

## 36.4 성능 구조

**통과, 운영 측정 필요**

API/Worker가 분리되어 있고 이미지/브라우저 동시성을 제한한다. 실제 상품 수와 Browser 부하는 운영 Metrics로 조정해야 한다.

## 36.5 품번 안전성

**통과**

Evidence, Hard Gate, Manual Review, Failure Code가 명확하며 AI Fabrication을 금지한다.

## 36.6 썸네일 안전성

**조건부 통과 → 이번 v0.1에서 수정 완료**

생성형 편집만으로 “제품 절대 보존”을 보장할 수 없다는 기존 설계의 모순을 `SAFE_COMPOSITE 우선 + AI_RECONSTRUCT 검수 의무`로 해결했다.

## 36.7 Browser 운영 안정성

**통과**

Profile Lock, Retry 구분, Trace, 성공조건 검증, CAPTCHA/2FA 정책을 포함한다.

## 36.8 보안/복구

**MVP 수준 통과**

Secret, SSRF, DB 노출, Backup/Restore, Browser Profile 보호가 반영되어 있다.

---

# 37. WBS 작성 시 기준

다음 단계 WBS는 이 문서의 `Phase 1 → Phase 6` 순서를 기준으로 작성한다.

각 Task에는 최소 다음 정보를 포함한다.

```
Task ID
Epic
작업명
목표
선행작업
구현 범위
산출물
Acceptance Criteria
테스트
우선순위
예상 난이도
병렬 가능 여부
```

WBS에서는 설계 자체를 다시 논의하지 않고, **이 Architecture Baseline을 실제 구현 Task로 분해하는 것**에 집중한다.

---

# 38. 최종 결론

본 v0.1 설계는 다음 원칙을 만족한다.

> 작게 시작하지만 임시방편으로 만들지 않는다.

MVP에서는 상품 Import, MASTER, 품번 Resolver, 프리미엄 썸네일, Browser Automation이라는 실제 수익 운영에 직접 필요한 기능에 집중한다.

인프라는 PostgreSQL 중심으로 단순하게 유지하고, 이미지·Queue·외부 Integration은 Port/Adapter 경계로 분리하여 필요할 때만 확장한다.

특히 썸네일은 생성형 AI에 제품 전체를 맡기는 대신 **원본 제품 보존을 최우선**으로 하고, AI가 제품 자체를 추정 복원한 결과는 반드시 검수하도록 설계한다.

따라서 본 문서를 **Brand Resell OS 1차 MVP의 개발 착수 전 Architecture Baseline v0.1**로 사용하고, 다음 단계부터 실제 개발 WBS를 작성한다.

`최종`이라는 표현은 사용하지 않는다. 실제 구현과 검증 과정에서 필요한 수정은 후속 문서 버전으로 관리한다.

---

# 39. v0.1 재검수 및 보완 결과

이번 재검수에서 다음 항목을 다시 확인하고 보완했다.

1. **문서 버전과 개발 단계 번호 분리**: 문서는 v0.1, 구현은 Phase 1~6으로 통일했다.

2. **썸네일 기본 연출 단순화**: 투명 아크릴 받침대와 기타 장식 구조물을 제거하고, 제품 중심의 미니멀 스튜디오 연출로 변경했다.

3. **제품 보존 우선순위 유지**: SAFE_COMPOSITE를 최우선으로 하고, AI가 제품 픽셀을 추정 생성하는 `AI_RECONSTRUCT`는 자동 승인하지 않는다.

4. **썸네일 QA 강화**: 접지 그림자·반사광 또한 제품 외곽, 로고, 라벨, 글자 가독성을 해치면 실패 또는 검수 대상으로 본다.

5. **데이터 경계 재확인**: MASTER / SKU / Identifier / Source Product 역할 중복이 없으며 2차 Channel 기능 추가 시 Core 구조를 유지할 수 있다.

6. **Queue와 업무 이력 분리 유지**: pg-boss 내부 테이블은 업무 이력의 원천이 아니며, `automation_run`이 사용자에게 노출되는 실행 이력의 기준이다.

7. **더망고 범위 재확인**: API 연동은 MVP에 포함하지 않으며, 필요한 웹 UI 자동화만 일반 BrowserFlow 구현체로 다룬다.

8. **과설계 방지 확인**: Redis, Kafka, Kubernetes, Elasticsearch, Microservice는 실제 병목이 확인되기 전까지 도입하지 않는다.

재검수 결론: **WBS 작성 및 개발 착수가 가능한 수준으로 통과**한다. 다만 실제 수집 데이터 샘플과 대상 웹 UI를 확보한 뒤 Phase 2/5 착수 시 Adapter/Flow 세부 정의를 확정해야 한다.

---

# 40. 공식 기술 검증 출처

다음은 구현 시 확인해야 할 공식 문서 목록이다. 기존 문서에 정확한 URL·버전·조회 결과가 없는 기술 검증 주장은 검증 증거로 사용하지 않는다. P1-01/P1-14에서 실제 확인한 버전·URL·확인일·호환성 테스트 결과를 TEST_REPORT에 기록한다.

- Node.js Releases / Node.js 24 LTS Release

- PostgreSQL 18 Release Notes / Supported Versions

- Fastify v5 Migration Guide

- pg-boss 공식 GitHub README / Requirements

- Coupang Open API Product Creation / Image Requirements

시장/채널 정책은 변경 가능하므로 실제 상품 등록 기능을 구현하는 시점에 최신 정책을 다시 확인한다.

---

**END OF DOCUMENT**
