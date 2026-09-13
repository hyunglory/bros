# BROS Source Mapping Spec v0.1

상태: DRAFT / BLOCKED_EXTERNAL_INPUT  
관련 Task: P2-01  
기준일: 2026-09-13

## 1. 목적과 완료 조건

첫 기존 수집 데이터의 실제 구조를 `SourceProductInput` 경계에 손실 없이 매핑하기 위한 발견 문서다. 실제 저장 위치·형식과 비식별화된 샘플 20~100건이 제공되기 전에는 Adapter 종류, 원본 컬럼명, 변환 규칙 또는 P2-01 PASS를 확정하지 않는다.

P2-01 완료 조건은 다음과 같다.

- 실제 저장 위치와 CSV/XLSX/JSON/API/Legacy DB 중 형식을 확인한다.
- 전체 상품·옵션의 대략적 건수와 파일 크기 또는 DB 규모를 확인한다.
- 최소 20개 입력행을 대상으로 mapping dry-run을 수행한다.
- 상품 ID·이름, 옵션, 이미지, 품번, 가격, 통화, 재고, 수집 시각의 실제 원본 경로와 결측 형태를 기록한다.
- 변환된 표준 입력과 제거된 민감 필드, 실패 사유를 입력행별로 재현할 수 있게 남긴다.

## 2. 현재 확인된 사실

| 항목 | 확인 결과 | 근거 |
| --- | --- | --- |
| Phase 1 Gate | PASS | DEC-20260913-006 |
| 원본 저장 위치 | 결정 필요 | 저장소에 샘플/연결 정보 없음 |
| 원본 형식 | 결정 필요 | WBS가 CSV/XLSX/JSON/API/Legacy DB 후보만 제시 |
| 샘플 수 | 0건 | 저장소 파일 전수 목록에 상품 fixture 없음 |
| 전체 건수·옵션 규모 | 결정 필요 | 운영 입력 미제공 |
| 첫 Adapter | 결정 필요 | 실제 형식 확인 후 하나를 선택해야 함 |
| mapping dry-run | NOT_RUN | 최소 샘플 20건 미제공 |

## 3. 표준 입력 경계 초안

아래 대상 필드는 설계서 14.2의 `SourceProductInput`, 보완 명세 2장, 현재 DB 물리 계약에서 도출했다. 원본 경로와 변환 규칙은 실제 샘플 증거로만 채운다.

| 표준 대상 | 필수 | 원본 경로 | 변환·검증 기준 | 현재 상태 |
| --- | --- | --- | --- | --- |
| `platformCode` | 예 | 결정 필요 | 공백 금지; 실제 수집처와 platform seed/code 관계 확인 | 입력 필요 |
| `externalProductId` | 예 | 결정 필요 | 문자열로 보존; 숫자 변환 및 선행 0 제거 금지 | 입력 필요 |
| `productName` | 예 | 결정 필요 | trim 후 공백값 거절; 원문은 `raw`에 보존 | 입력 필요 |
| `brandName` | 아니오 | 결정 필요 | 결측 허용; 불확실 값을 추정하거나 새 BRAND로 자동 생성하지 않음 | 입력 필요 |
| `productUrl` | 아니오 | 결정 필요 | 결측 허용; 임시 서명 query나 credential 포함 여부 검사 | 입력 필요 |
| `normalPrice` | 아니오 | 결정 필요 | 결측 허용; 0 이상; 통화와 독립적으로 추정하지 않음 | 입력 필요 |
| `currentPrice` | 아니오 | 결정 필요 | 결측 허용; 0 이상; 소수점·구분자·세금 포함 여부 확인 | 입력 필요 |
| `currencyCode` | 아니오 | 결정 필요 | 대문자 3자; 결측 시 KRW 추정 금지 | 입력 필요 |
| `identifiers[]` | 아니오 | 결정 필요 | type/value 원문 보존; MODEL_NO 등 내부 type 변환표는 증거 후 확정 | 입력 필요 |
| `options[]` | 아니오 | 결정 필요 | 외부 SKU ID, 옵션명·값, 가격·재고와 안정된 option key 재료 확인 | 입력 필요 |
| `images[]` | 아니오 | 결정 필요 | main/detail 구분, URL, 순서, 옵션 연결, 중복 형태 확인 | 입력 필요 |
| `raw` | 예 | 입력행 전체 | 원래 업무 구조를 보존하되 token/cookie/password/key는 저장 전 제거 또는 입력 거절 | 입력 필요 |

## 4. P2-02에서 확정할 계약 공백

실제 샘플을 확인한 뒤 다음을 P2-02 타입과 validation 계약으로 확정한다.

| 결정 항목 | 현재 근거와 문제 | 선택지 |
| --- | --- | --- |
| 수집 시각 | DB의 `collected_at`/`last_seen_at`은 필수지만 현재 `SourceProductInput`에 필드가 없다. | `collectedAt` 선택 필드 추가 / Import context 시각만 사용. 원본 시각 미상 시 Import 시각과 대체 사실을 raw metadata에 기록해야 함 |
| 상품 재고 | DB는 `stock_status`를 저장하지만 현재 최상위 입력 계약에 재고 필드가 없다. | 선택 `stockStatus` 추가 / Adapter가 raw에서 변환. 결측은 UNKNOWN |
| 숫자 표현 | 설계 예시는 JavaScript `number`, DB는 `NUMERIC(20,4)`다. | decimal string / 제한된 number. 실제 자릿수와 소수 형식 확인 후 결정 |
| `SourceOptionInput` | 하위 타입의 필드 목록과 option key 생성 규칙이 문서에 완결되어 있지 않다. | 실제 옵션 구조 기반 canonical key 규칙 확정 |
| `SourceImageInput` | URL·순서·main/detail·옵션 연결 계약이 문서에 완결되어 있지 않다. | 실제 이미지 필드 기반 최소 하위 타입 확정 |
| 식별자 type 변환 | 내부 허용 type은 있으나 원본 코드·컬럼이 미확인이다. | 명시적 mapping table / 미지원 값은 raw 보존 후 검수 |

## 5. 제공받을 입력

Secret과 개인정보를 제거한 상태로 다음 중 하나의 읽기 가능한 위치를 제공한다. Git에 넣을 샘플은 재배포 가능 여부도 함께 확인한다.

1. 실제 원본 위치와 접근 방법: 로컬 파일 경로, 읽기 전용 DB 접속 방식 또는 API 문서
2. 형식과 인코딩: CSV delimiter/quote/encoding, XLSX sheet, JSON shape, DB table/query 또는 API pagination
3. 대표 상품 20~100건: 최소 20개 입력행과 원본 컬럼명 유지
4. 변형 사례: 품번 없음, 옵션 없음, 다중 옵션, 이미지 없음, 다중 이미지, 가격/통화 결측, 재고 결측, 선행 0 외부 ID를 가능한 범위에서 포함
5. 전체 규모: 상품행, 옵션행, 이미지 URL 수, 파일 크기 또는 DB row count의 대략값
6. 수집 시각 의미와 timezone, 가격의 세금/할인/통화 의미, 재고 코드 정의

실제 password, cookie, Authorization header, API key, signed URL 전체값은 문서나 fixture에 넣지 않는다. 접근 자격증명은 SecretProvider 경계로 별도 주입한다.

## 6. 샘플 20건 mapping dry-run 기록표

샘플을 받은 뒤 한 입력행당 한 줄로 작성한다. 원문 전체는 승인된 fixture 또는 별도 안전 위치에 두고 여기에는 위치와 판정만 기록한다.

| input_row_no | source locator | product ID | product name | options | images | identifiers | result | issue code |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1~20 | 입력 필요 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | SAMPLE_NOT_PROVIDED |

Dry-run은 다음을 확인한다.

- 입력행 순서와 `input_row_no`가 재실행에도 안정적이다.
- 필수 3필드 결측만 validation 실패로 분리되고 브랜드·품번·가격·이미지 결측은 허용된다.
- 동일 `(platformCode, externalProductId)`가 반복될 때 같은 Source identity로 수렴할 수 있다.
- 옵션과 이미지를 원본 상품에 손실 없이 연결할 수 있다.
- 지원하지 않는 원본 값은 추정하지 않고 raw와 issue code로 보존된다.
- 원본에 포함된 민감정보가 표준 입력, raw, 오류 메시지 또는 로그에 남지 않는다.

## 7. 착수 판정

P2-01은 `BLOCKED_EXTERNAL_INPUT`이다. 문서 골격과 판정 기준은 준비됐지만 실제 샘플 기반 필드표와 20건 dry-run이 없으므로 Source Mapping Spec v0.1을 완료본 또는 PASS로 취급하지 않는다.
