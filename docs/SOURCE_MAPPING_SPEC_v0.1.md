# BROS Source Mapping Spec v0.1

상태: PASS (P2-01, P2-02, P2-03, P2-04, P2-06)
관련 Task: P2-01, P2-02, P2-03, P2-04, P2-06
기준일: 2026-09-14

## 1. 목적과 완료 조건

첫 기존 수집 데이터의 실제 구조를 `SourceProductInput` 경계에 매핑하기 위한 발견 문서다. 원본 Excel은 읽기 전용으로 분석했으며 원본 파일을 수정하거나 Git에 추가하지 않았다.

P2-01 완료 조건과 결과는 다음과 같다.

- 실제 저장 위치와 형식 확인: PASS
- 전체 상품·옵션 규모와 원본 한계 확인: PASS
- 실제 상품 20건 mapping dry-run: PASS
- 필드별 원본 경로, 결측, 변환 및 실패 조건 기록: PASS
- P2-02에서 확정할 계약 공백 식별: PASS

## 2. 원본 Inventory

| 항목 | 확인 결과 | 근거 |
| --- | --- | --- |
| 원본 위치 | `examples/더망고_상품정보_20260913.xlsx` | 사용자 지정 로컬 파일 |
| 파일 크기 | 5,002,588 bytes | 파일 metadata |
| SHA-256 | `1C3D35AF15093510E613CF9504FAFD28E264B1D15AABB95B215DC564AC8E2FDE` | 원본 동일성 기준 |
| 형식 | XLSX | `수집 요약`, `상품 목록`, `검토 필요` 3개 시트 |
| 데이터 범위 | `상품 목록!A5:U26380` | 5행 header, 상품 26,375행 |
| 플랫폼 구성 | MUSINSA 16,133건 / OLIVEYOUNG 10,242건 | `원본사이트` 전수 집계 |
| 재고 구성 | 재고상품 24,707건 / 품절상품 1,668건 | 원본 `수집 요약` |
| 옵션 구성 | 옵션 상품 3,722건, 모두 OLIVEYOUNG | `옵션수 > 0` 전수 확인 |
| 품질 검토 | 검토 필요 8,579건 | 원본 `수집 요약` |
| 주요 결측 | 간략설명 6,785건, 원본상품코드·URL 407건 | 원본 `수집 요약` 및 전수 집계 |
| 가격 | 26,375건 모두 원가·판매가 0 | 실제 0원이 아니라 전체 내보내기 한계 |
| 내부 상품코드 | 26,375건 모두 공란 | 별도 product identifier로 사용 불가 |
| 첫 Adapter | `XlsxImportAdapter` | 실제 입력 형식 |

원본 파일의 재배포 가능 여부는 확인되지 않았다. 따라서 Excel 자체는 commit 대상이 아니며 문서에는 검증에 필요한 행 locator와 식별자만 기록한다.

## 3. 표준 입력 필드 Mapping

| 표준 대상 | 필수 | 원본 경로 | 변환·검증 기준 | 판정 |
| --- | --- | --- | --- | --- |
| `platformCode` | 예 | `상품 목록!B:B 원본사이트` | `MUSINSA.com → MUSINSA`, `OliveYoung.co.kr → OLIVEYOUNG`; DB seed와 일치하지 않으면 거절 | 매핑 가능 |
| `externalProductId` | 예 | `C:C 원본상품코드` | trim한 문자열로 보존; 숫자 변환 금지; 공란은 `MISSING_EXTERNAL_PRODUCT_ID`로 거절 | 20건 중 16건 가능 |
| `productName` | 예 | `D:D 상품명` | trim 후 공백 거절; 원문은 `raw`에 보존 | 20/20 |
| `brandName` | 아니오 | `E:E 브랜드` | trim; 결측 허용; 이후 Brand Normalizer에서 검수 | 20/20 존재 |
| `productUrl` | 아니오 | `N:N 원문상품 URL(추정)` | http/https와 플랫폼 host 검사; 원본상품코드 결측 시 null; 실제 접속 성공을 이번 dry-run에서 단정하지 않음 | 16/20 |
| `normalPrice` | 아니오 | `R:R 원가(내보내기값)` | 원본 0은 exporter 한계이므로 실제 0원으로 저장하지 않고 null | 0/20 유효 가격 |
| `currentPrice` | 아니오 | `S:S 판매가(내보내기값)` | 원본 0은 exporter 한계이므로 실제 0원으로 저장하지 않고 null | 0/20 유효 가격 |
| `currencyCode` | 아니오 | 없음 | 가격이 없으므로 KRW를 추정하지 않고 null | 0/20 |
| `identifiers[]` | 아니오 | `Q:Q 내부 상품코드` | 전부 공란; 카테고리코드는 product identifier로 승격하지 않고 `raw`에 보존 | 0/20 |
| `options[]` | 아니오 | `I:I 옵션수`, `J:J 옵션명 목록`, `K:K 옵션 이미지 URL 목록` | ` | ` 구분자로 같은 순서의 이름·이미지를 pairing; 외부 SKU·옵션별 가격·재고는 없음 | 표본 20개 옵션, pairing 가능 |
| `images[]` | 아니오 | `M:M 대표이미지 URL`, `K:K 옵션 이미지 URL 목록` | 대표이미지는 `MAIN`; 옵션 이미지는 `options[].imageUrl`에 옵션 순서대로 연결 | 표본 40개 URL |
| `raw` | 예 | `A:U` 입력행 전체 | 원문과 legacy `고유값`을 보존; token/cookie/password/key 탐지 시 입력 거절 | 20/20 |
| `stockStatus` | 아니오 | `G:G 재고수`, `H:H 상태` | `재고수 > 0 → IN_STOCK`, `0 → OUT_OF_STOCK`; 수량 31은 정확한 재고수로 단정하지 않음 | 20/20 |
| 수집 시각 | import context 필수 | 행별 필드 없음 | adapter 실행 시각은 `collectedAt`, 파일 기준일 2026-09-13은 `sourceAsOfDate`; 행별 수집 시각으로 확대 해석하지 않음 | P2-02 계약 확정 |

`A:A 고유값`은 더망고 export 행의 legacy ID다. 플랫폼 상품 ID의 의미가 아니므로 `C:C 원본상품코드` 결측 시 대체값으로 사용하지 않는다.

## 4. 실제 샘플 20건 선정 규칙

원본 행 순서를 유지한 채 아래 10개 조건에서 처음 등장하는 2건씩을 선택했다. 동일 SHA-256 파일에 같은 규칙을 적용하면 같은 표본이 나온다.

1. OLIVEYOUNG 재고·확인 완료
2. OLIVEYOUNG 품절
3. OLIVEYOUNG 검토 필요
4. OLIVEYOUNG 옵션 존재
5. OLIVEYOUNG 간략설명 누락
6. OLIVEYOUNG 원본상품코드 누락
7. MUSINSA 재고·확인 완료
8. MUSINSA 품절
9. MUSINSA 원본상품코드 누락
10. MUSINSA 검토 필요

## 5. 샘플 20건 Mapping Dry-run

`MAPPED_WITH_REVIEW`는 필수 3필드가 유효해 top-level 입력은 만들 수 있지만 원본 품질 표시 또는 옵션 하위 계약 확정이 필요한 경우다. `REJECTED`는 현재 필수 계약을 만들 수 없는 경우다.

| input_row_no | source locator | externalProductId | name | options | images | identifiers | result | issue code |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | `상품 목록!A7:U7` | `A000000264904` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 2 | `상품 목록!A9:U9` | `A000000160370` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 3 | `상품 목록!A6:U6` | `A000000200463` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 4 | `상품 목록!A11:U11` | `A000000141025` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 5 | `상품 목록!A8:U8` | `A000000209125` | 있음 | 0 | 1 | 0 | MAPPED_WITH_REVIEW | `SOURCE_REVIEW_REQUIRED` |
| 6 | `상품 목록!A12:U12` | `A000000137298` | 있음 | 0 | 1 | 0 | MAPPED_WITH_REVIEW | `SOURCE_REVIEW_REQUIRED` |
| 7 | `상품 목록!A36:U36` | `A000000136713` | 있음 | 1 | 2 | 0 | MAPPED_WITH_REVIEW | `OPTION_CHILD_CONTRACT_REQUIRED` |
| 8 | `상품 목록!A47:U47` | `A000000110553` | 있음 | 4 | 5 | 0 | MAPPED_WITH_REVIEW | `OPTION_CHILD_CONTRACT_REQUIRED` |
| 9 | `상품 목록!A1206:U1206` | `A000000258443` | 있음 | 4 | 5 | 0 | MAPPED_WITH_REVIEW | `OPTION_CHILD_CONTRACT_REQUIRED`, `SOURCE_DESCRIPTION_MISSING`, `SOURCE_REVIEW_REQUIRED` |
| 10 | `상품 목록!A1342:U1342` | `A000000243610` | 있음 | 10 | 11 | 0 | MAPPED_WITH_REVIEW | `OPTION_CHILD_CONTRACT_REQUIRED`, `SOURCE_DESCRIPTION_MISSING`, `SOURCE_REVIEW_REQUIRED` |
| 11 | `상품 목록!A48:U48` | 없음 (legacy `360668`) | 있음 | 1 | 2 | 0 | REJECTED | `MISSING_EXTERNAL_PRODUCT_ID`, `SOURCE_PRODUCT_URL_UNAVAILABLE` |
| 12 | `상품 목록!A49:U49` | 없음 (legacy `360667`) | 있음 | 0 | 1 | 0 | REJECTED | `MISSING_EXTERNAL_PRODUCT_ID`, `SOURCE_PRODUCT_URL_UNAVAILABLE` |
| 13 | `상품 목록!A2603:U2603` | `6210231` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 14 | `상품 목록!A2604:U2604` | `6414920` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 15 | `상품 목록!A2605:U2605` | `6415004` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 16 | `상품 목록!A10271:U10271` | `4843587` | 있음 | 0 | 1 | 0 | MAPPED | — |
| 17 | `상품 목록!A11083:U11083` | 없음 (legacy `343095`) | 있음 | 0 | 1 | 0 | REJECTED | `MISSING_EXTERNAL_PRODUCT_ID`, `SOURCE_PRODUCT_URL_UNAVAILABLE` |
| 18 | `상품 목록!A11875:U11875` | 없음 (legacy `339999`) | 있음 | 0 | 1 | 0 | REJECTED | `MISSING_EXTERNAL_PRODUCT_ID`, `SOURCE_PRODUCT_URL_UNAVAILABLE` |
| 19 | `상품 목록!A12334:U12334` | `5250788` | 있음 | 0 | 1 | 0 | MAPPED_WITH_REVIEW | `SOURCE_REVIEW_REQUIRED` |
| 20 | `상품 목록!A12335:U12335` | `5250800` | 있음 | 0 | 1 | 0 | MAPPED_WITH_REVIEW | `SOURCE_REVIEW_REQUIRED` |

### Dry-run 집계

| 검사 | 결과 |
| --- | --- |
| 표본 수 | 20 |
| MAPPED | 8 |
| MAPPED_WITH_REVIEW | 8 |
| REJECTED | 4 |
| 유효 `(platformCode, externalProductId)` | 16 |
| 유효 identity 중복 | 0 |
| 옵션 이름·이미지 pairing | 20/20, mismatch 0 |
| 대표이미지 존재 | 20/20 |
| 민감정보 의심 필드/값 | 0 |
| 가격 mapping | 20/20 null 처리 |

4건의 `REJECTED`는 dry-run 실패가 아니라 필수값 거절 규칙이 실제 결측 행에 적용된 결과다. legacy `고유값`을 외부 상품 ID로 대체하면 잘못된 플랫폼 identity가 생성되므로 자동 보정하지 않는다.

## 6. P2-02 확정 계약

구현 Source of Truth는 `packages/contracts/src/source-product.ts`다. 구조 검증을 통과한 뒤에도 raw JSON·URL의 민감정보, 중복 식별자와 source 순서를 의미 검증하며 결과에는 원본값을 포함하지 않는다.

| 결정 항목 | 실제 샘플 근거 | 확정 결정 |
| --- | --- | --- |
| 수집 시각 | 행별 시각·timezone 없음 | 제품과 분리한 `SourceImportContext.collectedAt`을 RFC 3339 실행 시각으로 필수 주입하고 파일 기준일은 선택 `sourceAsOfDate`로 보존 |
| 상품 재고 | 0과 양수로 status 판정 가능하나 31의 실제 수량 의미는 불명 | 선택 `stockStatus: UNKNOWN \| IN_STOCK \| OUT_OF_STOCK`; 정확한 quantity는 계약에 넣지 않음 |
| 금액 표현 | 실제 가격이 전부 미제공 | 선택 가격은 PostgreSQL `numeric(20,4)` 범위의 비음수 canonical decimal string; 가격이 있으면 ISO 4217 형태의 대문자 3자 통화 필수 |
| `SourceOptionInput` | 이름·순서·이미지는 있으나 외부 SKU, 옵션별 가격·재고 없음 | `rawOptionName`, 0 기반 `sourceOrder`, `raw` 필수; 외부 SKU·가격·재고·이미지는 선택. 안정된 DB option key 생성은 Core Importer 책임 |
| `SourceImageInput` | 대표이미지와 옵션이미지 구분 가능 | 상품 이미지는 `MAIN \| DETAIL`, URL, 역할별 0 기반 순서, raw 필수. 옵션 이미지는 option에 직접 연결 |
| 식별자 | 내부 상품코드는 전부 공란 | DB identifier type 집합만 허용하고 이번 XLSX는 `identifiers` 생략; 카테고리코드는 `raw.categoryCode`로만 보존 |
| 입력 안전성 | 원본 A:U 보존과 자격증명 제외가 모두 필요 | top-level 미정 필드 거절, raw는 JSON-compatible 값만 허용, secret key·URL userinfo·서명 query 입력 거절, validation 결과에는 code와 path만 반환 |
| 가격·URL 보강 | Excel만으로 실제 가격과 407건 URL을 복구할 수 없음 | 별도 관리자 화면/API source가 확보될 때 보강 Adapter를 분리 |

## 7. P2-01 판정

P2-01은 **PASS**다. 실제 XLSX 구조, 전체 규모, 필드 mapping과 대표 20건 dry-run이 재현 가능하게 기록됐다. BLK-003은 해소한다.

P2-02 표준 계약과 validation 테스트는 PASS다. 다음 P2-03은 이 계약으로 XLSX Adapter를 구현한다. 원본상품코드가 없는 407건은 필수 validation에서 거절하거나 별도 보강 절차로 보내며 자동 생성한 ID로 source identity를 만들지 않는다.

## 8. P2-03 XLSX Adapter 결과

`@bros/importer`의 `XlsxImportAdapter`는 workbook buffer를 읽고 `상품 목록` 시트의 5행 header와 필수 컬럼을 먼저 검증한다. 파일명 `더망고_상품정보_YYYYMMDD.xlsx`의 기준일은 `SourceImportContext.sourceAsOfDate`로만 파생하며, `collectedAt`은 adapter 실행 시각 또는 호출자가 제공한 RFC 3339 시각을 사용한다.

- A:U의 header와 cell value는 `SourceProductInput.raw`에 보존한다. formula, JSON으로 표현할 수 없는 cell 값, workbook 25MB 초과, 100,000행 초과는 안전한 오류 코드로 거절한다.
- `원본사이트`는 `MUSINSA.com → MUSINSA`, `OliveYoung.co.kr → OLIVEYOUNG`으로만 변환한다. product URL은 해당 플랫폼 host만 허용한다.
- 옵션명·옵션 이미지 URL은 `|` 구분 순서로 pairing한다. 옵션 수와 이름 또는 제공된 이미지 목록의 길이가 다르면 행을 거절한다.
- 재고수는 0이면 `OUT_OF_STOCK`, 양수면 `IN_STOCK`이며 정확한 quantity는 전달하지 않는다. 가격 0은 누락으로 유지하고 통화나 nonzero 가격을 추정하지 않는다.
- 2026-09-14 동일 원본 SHA-256에 고정 `collectedAt`을 주입한 전체 read-only 실행 결과는 총 26,375행, `MAPPED` 25,945행, `REJECTED` 430행이다. issue 발생 횟수는 외부 ID 결측 407회, 옵션명 수 불일치 5회, 옵션 이미지 수 불일치 24회이며 한 행에는 복수 issue가 있을 수 있다.
- P2-01의 실제 20행 locator를 다시 실행하면 `MAPPED` 16행, `REJECTED` 4행(모두 `MISSING_EXTERNAL_PRODUCT_ID`)이다. 이전 `MAPPED_WITH_REVIEW`은 `데이터상태`·설명 결측 등 원본 품질 신호를 보이기 위한 dry-run 분류였으며, adapter는 이 필드를 raw에 보존하고 계약 유효성으로만 accept/reject를 정한다.

## 9. P2-04 Validation과 Raw 보존

`createImportValidationService`는 플랫폼별 `import_batch`를 열고 Adapter의 `MAPPED`와 `REJECTED` 행을 모두 append-only `import_item`으로 남긴다. 현재 첫 XLSX는 두 플랫폼이 섞여 있으므로 batch는 `platformCode`별로 분리한다. P2-06이 source upsert와 최종 batch 완료 상태 전이를 담당하므로 P2-04에서 유효 행은 `PENDING`, 거절 행은 `FAILED`로 기록하고 batch는 `RUNNING`으로 유지한다.

- 저장 payload는 schema version, import context, 원본 locator·행 번호, 원본 `raw`, validation outcome·issue code/path를 포함한다. 유효 행에는 재현 가능한 `mappedInput`도 보존한다.
- 필수 `platformCode`·`externalProductId`·`productName` 결측 및 adapter issue는 거절한다. 브랜드·식별자·가격·이미지 결측은 유효 입력으로 수용한다.
- `REJECTED` 행도 raw JSON secret 검사를 다시 통과해야 한다. cookie/token/password 등 secret성 key나 비 JSON raw가 발견되면 어떤 원문값도 저장하지 않고 `raw: null`과 safe issue code/path만 남긴다.
- P2-04는 `source_product`를 생성·갱신하지 않는다. `(platform_id, external_product_id)` 멱등 upsert와 batch terminal aggregate는 P2-06의 책임이다.

## 10. P2-06 Source Product Upsert

`createSourceProductUpsertService`는 `RUNNING` batch를 transaction으로 잠그고 P2-04의 `PENDING` item만 소비한다. `(platform_id, external_product_id)` unique key에 `INSERT ... ON CONFLICT DO NOTHING`을 사용한 뒤, 기존 행은 source 수집 시각이 같거나 새 경우에만 update한다.

- 첫 입력은 `CREATED`, 새롭거나 같은 `collectedAt`의 기존 identity는 `UPDATED`, 더 오래된 입력은 최신 source를 보존하고 `MATCHED`로 item 이력에 남긴다. identity가 다시 유입돼도 `source_product`는 중복 생성되지 않는다.
- source raw는 이미 안전 검사를 거친 `mappedInput.raw`만 `source_product.raw_json`에 쓴다. 원본 row envelope·locator·validation issue는 계속 `import_item.raw_json`에 보존한다.
- P2-06은 brand master나 SKU/image/identifier를 만들지 않는다. `brandName`은 `raw_brand_name`에만 보존하며 P2-05가 alias resolution을 담당한다.
- 모든 PENDING item이 처리된 뒤 item status를 재집계해 batch를 `SUCCEEDED`/`PARTIAL_FAILED`/`FAILED`로 전이하고 count 합계 및 `finished_at`을 한 transaction으로 기록한다.

## 11. P2-05 Brand Normalizer

`createBrandNormalizer`는 `rawBrandName`과 platform code를 받아 승인된 `brand_alias`만 표준 `brand`로 해석한다. 이 서비스는 `source_product`·`brand`·`brand_alias`를 쓰지 않으며, P2-08이 결과를 MASTER 후보 판단에 사용한다.

- alias lookup key는 Unicode NFKC, trim, 연속 공백 통합, 대소문자 정규화를 적용한 `alias_norm`이다. 구두점 제거·유사도 검색·부분일치는 수행하지 않는다.
- active platform의 platform-scoped alias를 먼저 조회하고, 없을 때 active brand의 global alias를 조회한다. 같은 표기가 플랫폼별로 다를 수 있다는 DB unique scope를 그대로 따른다.
- 빈 브랜드, 미등록 platform, 비활성 platform, 승인 alias 부재(비활성 brand 포함)는 `UNRESOLVED`이며 새로운 brand/alias를 자동 생성하지 않는다. P2-16이 사람이 alias를 승인하는 경로를 담당한다.

## 12. P2-07 Embedded Identifier Extractor

`extractEmbeddedIdentifiers`는 source 계약의 explicit `identifiers[]`와 nested `raw` JSON에서 allowlist key에 직접 연결된 문자열만 후보화한다. 이 단계는 product identifier나 identifier candidate DB row를 만들지 않고, P2-08/P3 resolver가 소비할 type·value·normalized value·provenance를 반환한다.

- allowlist는 `modelNo`/`모델번호`/`품번`, `styleCode`/`스타일코드`, `productNo`/`상품번호`, `mpn`, `gtin`, `ean`, `upc`, `barcode`/`바코드`, `brandCode`/`브랜드코드`다. key의 NFKC·공백/underscore/hyphen 차이만 흡수한다.
- 임의 product name/free text와 numeric raw value는 후보로 추론하지 않는다. 숫자 raw는 leading zero 손실 여부를 판단할 수 없으므로 문자열 source만 수용한다.
- candidate는 type+normalized value로 중복 제거하고 explicit field 및 raw JSON pointer provenance를 전부 남긴다. traversal 상한에 걸린 결과는 `truncated: true`여서 후속 단계가 자동 승인하면 안 된다.

## 13. P2-08 MASTER Matcher v1

`createProductMatcher`는 P2-05의 brand resolution과 P2-07의 identifier extraction을 입력으로 받아 기존 MASTER snapshot을 읽고 `MATCH_EXISTING`, `REVIEW_REQUIRED`, `NEW_MASTER_CANDIDATE` 중 하나를 권고한다. 이 단계는 `source_product.product_id`나 match 상태, MASTER/SKU/identifier를 쓰지 않는다. 실제 연결·신규 생성과 동시성 제어는 P2-09가 담당한다.

- 후보 조회는 `BRAND_CODE`를 제외한 identifier normalized value exact와, resolved brand 범위의 `pg_trgm similarity >= 0.3` 상위 20건을 합친다. 0.3은 후보 recall을 제한하는 조회 하한일 뿐 승인 임계값이 아니며 상품명 유사도는 어떤 값에서도 `MATCH_EXISTING`을 만들지 않는다.
- verified `GTIN`/`EAN`/`UPC`는 같은 GTIN 계열의 exact value를 강한 근거로 취급한다. verified `MODEL_NO`/`MPN`/`STYLE_CODE`는 같은 type exact일 때 강한 근거다. 승인 brand가 같고 동일 type identifier가 exact인 경우도 강한 근거다.
- 강한 후보가 정확히 하나이고 hard conflict와 extraction truncation이 없을 때만 기존 MASTER를 권고한다. 후보 provenance와 기존 identifier public ID를 evidence에 남겨 판단을 재현할 수 있게 한다.
- resolved brand 불일치, GTIN 계열 값 불일치, 동일 model type 값 불일치, source option과 MASTER option의 명확한 비중첩, inactive MASTER는 hard conflict다. conflict, 강한 후보 복수, 제목/미검증 근거만 존재, `truncated: true`는 모두 `REVIEW_REQUIRED`다.
- 기존 후보 근거가 없고 resolved brand와 상품 identifier가 있을 때만 `NEW_MASTER_CANDIDATE`를 반환한다. 브랜드 또는 상품 identity 근거가 부족하면 `REVIEW_REQUIRED`다. 신규 후보는 생성 완료 상태가 아니며 P2-09가 identifier lock 안에서 재조회한 뒤 생성 또는 review를 확정해야 한다.

## 14. P2-09 MASTER Creator / Race Control

`createMasterService(database).process(itemPublicId)`는 P2-06을 마친 `SUCCEEDED` import item을 처리한다. batch는 `SUCCEEDED` 또는 `PARTIAL_FAILED`여야 한다. 외부에서 만든 match 결과를 신뢰하지 않고 item의 `mappedInput`·context를 재검증하고 P2-05/P2-07/P2-08을 트랜잭션 내부에서 호출한다.

- 잠금 순서: batch → item → source row → 정렬한 모든 identifier advisory transaction lock → 선택된 MASTER row. `READ COMMITTED`를 명시하고 advisory lock 대기 후 후보를 다시 조회한다. 같은 batch의 item은 집계 보호를 위해 직렬 처리되며 서로 다른 batch는 공유 식별자 범위에서만 직렬화된다.
- 잠금 key: `BRAND_CODE`를 제외한 각 정규화 식별자를 `JSON.stringify(["bros/master-identity/v1", family, normalizedValue])`로 인코딩하고 SHA-256 선두 8바이트를 signed BIGINT로 해석한다. GTIN/EAN/UPC는 `GTIN` family, 나머지는 원래 type이다. 브랜드를 key에 넣지 않아 같은 번호·다른 브랜드도 재조회에서 충돌로 검출한다. key를 중복 제거하고 BIGINT 오름차순으로 획득한다. 이 namespace는 판단 규칙 버전과 독립이며 후속 identifier writer도 같은 규약을 따라야 한다. hash 충돌은 추가 직렬화만 만들고 identity를 확정하지 않는다.
- 재시도: lock timeout 기본 1,000ms(1~10,000), 최대 시도 기본 3회(1~5). SQLSTATE 55P03/40P01/40001만 rollback 후 새 transaction에서 25ms × 이전 시도 횟수 대기로 재시도한다. 소진 시 `MASTER_LOCK_RETRY_EXHAUSTED`; 다른 DB 오류는 원문 없이 `MASTER_PERSISTENCE_FAILED`다. commit 응답 유실은 자동 재시도하지 않고 같은 item을 다시 요청해 결과를 확인한다.
- 신규 생성: resolved brand + 상품 식별자, 기존 후보 없음, 충돌·truncation 없음일 때 `created_method=IMPORT_STRONG_IDENTIFIER`, `status=REVIEW_REQUIRED`, `identifier_status=CANDIDATE`로 생성한다. 식별자는 `is_verified=false`, `evidence_type=SOURCE_EMBEDDED`와 provenance로 저장한다. 전역 identifier UNIQUE를 추가하지 않는다. MASTER·미검증 identifier·Source 연결·item 결과·batch 집계는 모두 함께 commit 또는 rollback된다.
- 기존 연결: 유일한 strong match를 잠근 뒤 재평가해 `MATCHED`로 연결한다. 기존 `product_id`가 다른 경우 자동 교체하거나 해제하지 않고 `EXISTING_LINK_CONFLICT` 검수로 남긴다. Source `MATCHED`는 제품 연결 상태이며 MASTER 활성화·식별자 검증 승인과 다르다. `match_confidence`는 보정된 점수가 없으므로 NULL이다.
- 검수/과거 입력: title-only·unknown/evidence 부족·ambiguous·conflict·truncated 결과는 검수다. 한 identity family에 서로 다른 값이 여럿이면 SKU 식별자일 수 있어 기존 match·신규 생성 모두 차단한다. source 시각/상품명/브랜드/raw가 달라진 item은 `SKIPPED/SOURCE_SNAPSHOT_CHANGED`로 처리해 source를 수정하지 않는다. 같은 source·같은 시각의 item 간 explicit identifiers/options가 다르면 `SOURCE_IDENTITY_AMBIGUOUS` 검수다.
- 이력/멱등성: 원본 envelope를 유지하고 `raw_json.masterCreation`에 stage, brand/extraction 입력, matcher 근거·충돌, public ID 결과, 완료 시각, P2-06의 source action을 저장한다. 같은 item 재호출은 같은 결과를 반환하며 집계를 다시 증가시키지 않는다. 검수 재처리는 새 item으로 수행하고 기존 이력을 덮어쓰지 않는다. batch 종료 상태·finished_at은 P2-06 이력으로 유지하고 terminal item 집계를 SQL로 재계산한다. P2-12는 pipeline 전체 완료 표시를 별도로 통합해야 한다.
- P2-10 이전 variant 보호: 신규 MASTER metadata의 `importMatchOptionNames`에 원본 옵션명을 보존하며 matcher가 이를 우선 비교한다. 없으면 기존 SKU option_key를 사용한다. P2-10은 정규화 key와 원본 옵션명을 혼동하지 않도록 이 비교 계약을 인수해야 한다. SKU 생성·옵션 표준화는 이 단계에 포함하지 않는다.

동시성 보장은 공유 식별자가 있고 위 잠금 규약을 준수하는 writer 사이에 적용한다. 식별자 교집합이 전혀 없는 동일 상품, 임의 SQL writer, 후보 조회의 실데이터 recall·대량 처리 성능은 별도 검증 대상이다. Resolver 자동승인 설정은 변경하지 않는다.

## 15. P2-10 SKU Normalizer / Mapper

`createSkuMapper(database).process(itemPublicId)`는 P2-09가 처리한 item의 저장된 `mappedInput`·context를 다시 검증하고, 연결된 MASTER의 source option을 `product_sku`와 `source_sku`로 기록한다. 이 단계는 MASTER/identifier/source product 연결 상태와 import batch 집계를 변경하지 않으며, 결과는 원본 envelope의 `raw_json.skuMapping`에 보존한다.

- option key는 `v1:` 뒤에 raw option name을 Unicode NFKC, trim, 연속 공백 통합, `en-US` 소문자화한 값이다. 구두점 삭제·토큰 순서 변경·fuzzy 비교는 하지 않는다. external SKU ID와 source order는 key에 넣지 않는다.
- 같은 source item 안에서 같은 option key가 둘 이상이면 `DUPLICATE_NORMALIZED_OPTION` 검수로 끝내며 어떤 SKU도 쓰지 않는다. source의 다른 option에 이미 사용 중인 external SKU ID를 재사용하려 하면 `SOURCE_EXTERNAL_SKU_CONFLICT`, 기존 source SKU가 다른 canonical SKU를 가리키면 `SOURCE_SKU_LINK_CONFLICT`로 검수한다.
- source row를 잠근 뒤 MASTER row를 잠그고, `["bros/sku-option/v1", masterPublicId, optionKey]`의 SHA-256 signed BIGINT advisory transaction lock을 오름차순으로 얻는다. 같은 MASTER+option key의 동시 importer는 하나의 `product_sku`로 수렴한다. timeout 기본 1초, 55P03/40P01/40001만 최대 3회 새 transaction에서 재시도한다.
- 새 canonical SKU는 최초 raw option name, normalized option name, option key, 최초 source order를 `product_sku`에 보존하고 `REVIEW_REQUIRED`로 생성한다. 재import는 canonical SKU 표현과 sort order를 바꾸지 않고 source별 raw name, price, stock, raw payload만 `source_sku`에 갱신한다.
- `product_sku`가 있으면 P2-08 matcher는 SKU `option_json.rawOptionName`을 variant 비교에 사용한다. SKU가 아직 없을 때만 P2-09의 MASTER metadata `importMatchOptionNames`를 사용한다. 내부 versioned option key를 raw option name으로 비교하지 않는다.
- source snapshot이 저장 당시 item과 다르면 `SKIPPED/SOURCE_SNAPSHOT_CHANGED`, 연결 MASTER가 없으면 `SKIPPED/MASTER_NOT_LINKED`, 옵션이 없으면 `SKIPPED/NO_SOURCE_OPTIONS`로 기록한다. 같은 item 재호출은 저장된 결과를 반환한다.
