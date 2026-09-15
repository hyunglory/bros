# PR #1 설명 초안

다음 원격 반영 단계에서 사용할 로컬 초안. PR에는 Phase 1/2가 이미 누적되어 있으므로 제목과 본문은 전체 최종 범위를 설명한다. 이 파일을 작성한 것으로 실제 PR 수정이나 신규 SHA 검증을 주장하지 않는다.

## 제목

BROS foundation, catalog import, and identifier resolution/review

## 본문

상품 수집 데이터를 catalog에 연결하고, 미확인 품번을 근거와 함께 분석해 운영자가 검수할 수 있는 기반을 추가합니다. 후보 추출부터 Evidence·충돌·점수·판정, Batch Worker와 수동 검수 UI/API까지 실행 결과와 감사 기록을 보존합니다.

### 주요 변경

- Phase 1의 DB/Queue/API/Worker/Admin 및 Phase 2 import/catalog/브랜드 검수 기반을 포함합니다.
- Phase 3 Resolver와 검수 UI/API, P2/P3 비교 키·공유 identity lock, 재시도·process 복구, 원본 execution capture 저장·export를 추가합니다.
- PostgreSQL 계정별 공유 예산과 전역 호출 제한을 추가합니다. 불확실 호출 비용은 유지하며 중단된 호출은 종료 확인 후 감사 사유와 함께 복구합니다.
- 합성 Golden Dataset 평가 도구와 공개 제외 경로 검사, 통합 테스트 순차 실행을 포함합니다. 실제 상품 XLSX·검수 자료·capture·비밀값은 변경 묶음에서 제외합니다.

### 검증

- Phase 1/2의 이전 원격 CI 증거와 Phase 3 로컬 검증 기록은 `docs/TEST_REPORT.md`에 구분해 기록했습니다.
- 최신 로컬 실행은 2026-09-16 기록을 따릅니다. 새 Phase 3 commit의 원격 CI URL과 정확한 SHA는 실행 완료 후 이 항목에 추가해야 합니다.
- 로컬 단위 163개·Admin 35개·통합 191개 PASS. frozen lockfile install, publication 경로 검사, lint/typecheck, 포맷과 build를 확인했습니다. 최초 `pnpm check`의 포맷 단계가 다른 worktree의 접근 제한 폴더 때문에 실패해 대상 경로를 명시하고 해당 단계와 최종 build를 다시 통과시켰습니다.

### 배포·제한

- migration 002~004와 동일 revision의 P2 importer/P3 resolver·API/Worker/CLI 배포가 필요합니다. 실제 DB에는 아직 적용하지 않았습니다. 순서와 복구 경계는 `docs/PHASE3_RELEASE_PREP.md`를 따릅니다.
- 외부 Provider는 기본 disabled, 자동승격은 OFF입니다. 실제 계약·키·가격/한도·계정 연결과 실제 정답/capture calibration은 완료되지 않았습니다.
- P3-14 실제 검수/calibration은 사용자 요청으로 보류 중이며, 합성 회귀와 원격 CI 성공을 Phase 3 Gate 통과로 해석하지 않습니다.
