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
