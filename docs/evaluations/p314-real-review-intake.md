# P3-14 실제 상품 정답 검수 준비 — 2026-09-15

상태: **INTAKE_PREPARED / 실제 label 0 / calibration NOT_RUN**. DEC-20260915-025. 검수 파일 생성·대조 PASS이며 실제 정답 검수 완료나 Gate PASS가 아니다.

## 원본과 표본

- 원본: `examples/더망고_상품정보_20260913.xlsx`, `상품 목록` 6~26380행(26,375행). 내부 상품코드가 채워진 행 0건. 별도 운영자 검수 label dataset은 확인되지 않았다.
- 원본 SHA-256: `1c3d35af15093510e613cf9504fafd28e264b1d15aabb95b215dc564ac8e2fde`. 읽기 전후 동일하며 원본은 수정하지 않았다.
- 플랫폼별 행 수 상위 5개 브랜드를 고르고, 브랜드별 원본 상품 ID/URL이 있는 행을 `SHA256(원본 digest:행 번호)` 오름차순으로 정렬해 상품 ID 중복을 제외하고 20개씩 선택했다. 선택 기준에 후보 점수나 예측 품번은 사용하지 않았다.
- MUSINSA 100행: ESCAPEFROM, NOMANUAL, OPENYARD(OY), FRIZMWORKS, WACKY WILLY 각 20행.
- OliveYoung 100행: 필리밀리, 라운드랩, 피카소, 더툴랩, 웨이크메이크 각 20행.
- 총 200행 / 플랫폼+원본 상품 ID 200개 / 플랫폼+카테고리 코드 52개 / 옵션이 있는 행 33개. **확정 MASTER 200개 또는 대표 범위 충족을 뜻하지 않는다.** 다른 브랜드·카테고리·challenge 사례와 동일 상품 관계는 검수 후 보완한다.

## 로컬 산출물

Git 제외 `data/outputs/p314-real-review-20260915/`에 보관한다. 원본 상품별 데이터를 공개 문서나 Git에 복제하지 않는다.

- `P3-14_실제상품_정답검수_대기.xlsx`: 정답 검수 / 원본 참조 2개 탭. 정답·근거·검수자·시각·MASTER·SKU·이미지 관계·독립 자동승인 금지·사례 태그 입력란. 모든 행은 PENDING, 정답란 공란이다.
- `intake-source.json`: 행 locator와 원본 상품/이미지/옵션 URL 및 수집 상태. evaluator 입력 계약이 아닌 검수 intake이며 split은 UNASSIGNED다.
- `inventory.json`, `validation.json`: 표본 집계, 원본·산출물 digest, 실행한 대조 검사 결과.
- XLSX SHA-256: `ed9f55aaf8d9a15f6347fb8177068d5b5e4a125d2abe02ec9ffa33313c95bbdc`.

## 검수와 평가로 넘기는 순서

1. 다른 운영자 정답 파일이 있으면 해당 파일을 우선 인수하고 출처·검수 이력부터 확인한다. 이번 표본은 운영 평가 범위로 확정하지 않는다.
2. 상품별 공식 문서/실물 라벨 등 독립 근거로 식별자 또는 확인된 품번 없음을 기록한다. 원본 상품 URL은 추정 수집값이며 이번 단계에서 접근·내용을 검증하지 않았다. 수집 상태의 확인 완료를 품번 정답 검수 완료로 옮기지 않는다.
3. IDENTIFIED는 식별자 종류/값을, NO_IDENTIFIER는 품번 없음 근거와 자동승인 금지 TRUE를 기록한다. 미확인을 품번 없음으로 처리하지 않는다. 추가 식별자는 비고에 종류·값을 기록하고 인수 시 배열로 검수한다. 태그는 평가 계약의 NORMAL/NO_IDENTIFIER/SIMILAR_MODEL/GTIN_CONFLICT/COLOR_CONFLICT/VOLUME_CONFLICT/AI_ONLY를 사용한다.
4. 검수자·UTC 시각·근거를 남긴다. MASTER·관련 SKU·실제 이미지 SHA-256 관계와 주요 canonical 브랜드/카테고리 범위를 검수한다. 이미지 URL hash를 이미지 내용 hash로 대체하지 않는다.
5. 독립 Collector capture/버전/비용 및 conflict facts를 확보한다. 정답을 보고 capture를 만들거나 바꾸지 않는다. 이번 파일에는 capture가 없으며 replay를 바로 실행할 수 없다.
6. 인수 검증 후 REAL 계약으로 변환하고 동일 MASTER/SKU/image가 섞이지 않게 tuning/holdout을 분할한다. 별도 검수한 lock으로 고정한 다음 [평가 절차](../RESOLVER_EVALUATION.md)에 따라 실행한다.

워크북의 FIELDS_FILLED는 필요한 입력 칸을 채웠다는 보조 표시다. 형식·GTIN 유효성·정답 진실성·관계 완전성·대표성·capture 검증을 대신하지 않는다. 표본 200행만으로 holdout auto MASTER 100개/주요 범위별 20개와 challenge 기준이 충족된다고 가정하지 않는다.

## 이번 검증

- bundled Python openpyxl 읽기 전용 분석과 원본 대조, bundled Node artifact-tool XLSX 생성/재계산/렌더/내보내기를 실행했다. 임시 재현 스크립트는 `tmp/p314-intake/{prepare.py,build.mjs,verify.py}`다.
- 200행 원본 행 번호/상품명/ID/카테고리/상품·이미지 URL 일치, 원본 키 중복 없음, 정답 공란/PENDING 200/입력 충족 0, 식별자·카테고리 텍스트 유지, 원본 셀 수식 없음, 원본 hash 보존 PASS.
- 수식 오류 검색 0건. 상태만 IDENTIFIED로 변경하면 MISSING_FIELDS/집계 0, 필수 칸을 채우면 FIELDS_FILLED/집계 1, 복원 후 PENDING/집계 0 PASS. 임시 TEST-ONLY 값은 최종 파일에 없다.
- 두 탭 및 오른쪽 검수 입력란 렌더를 확인했다. 렌더러는 긴 숫자 문자열을 지수 표기로 표시하는 제한이 있으나 내보낸 XLSX의 상품 ID·18자리 카테고리 코드가 원문 문자열/텍스트 서식임을 별도 검사했다. Excel 앱 직접 검증은 NOT_RUN.
- 실제 정답 검수, live URL/Provider, Collector capture, REAL calibration, end-to-end/remote CI/운영 활성화는 NOT_RUN. 애플리케이션 코드는 변경하지 않아 기존 전체 unit/integration을 이번 단계에서 재실행하지 않았다.

BLK-007 OPEN, P3-14 BLOCKED_EXTERNAL_INPUT, 자동승격 OFF를 유지한다.
