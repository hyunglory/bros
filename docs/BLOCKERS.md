# BROS Blocker

기준일: 2026-09-13

## BLK-001 — P1-14 원격 CI 실행 및 merge 차단 검증

- 상태: RESOLVED — DEC-20260913-006, 2026-09-13
- 관련 Task: P1-14, Phase 1 Gate
- 해소 전 원인: 저장소에 GitHub remote와 branch protection 대상 repository가 없었다.
- 해소 결과: 사용자가 공개 전환을 승인한 `hyunglory/bros` repository를 `origin`으로 연결했다. PR #1의 Actions run 34746426348이 PASS했고, ruleset 23149676이 기본 브랜치에 strict required status check `install / lint / typecheck / test / build`를 적용한다.
- 실패 차단 증거: 임시 PR #2의 Actions run 34747040147이 의도적 ESLint 오류를 탐지해 FAILURE가 되었고, GitHub API의 `mergeStateStatus`가 `BLOCKED`를 반환했다. PR은 merge하지 않고 닫았으며 임시 원격·로컬 브랜치는 삭제했다.
- 공개 범위: GitHub Free private repository에서는 branch protection/ruleset API가 403을 반환해, 사용자 승인에 따라 repository를 PUBLIC으로 전환했다.
- 2026-09-13 재확인: HEAD `b8bed87`에서 BROS 전용 PostgreSQL을 사용한 `pnpm check`는 PASS했다. 그러나 `git remote -v` 출력은 비어 있고, GitHub CLI 기본 계정의 인증 토큰은 무효다. 따라서 원격 repository 선택, push, workflow 실행, protection 설정은 NOT_RUN이며 BLK-001은 해소되지 않았다.

## BLK-002 — P1-05 코드 필드 허용 집합 결정

- 상태: RESOLVED — DEC-20260912-010, 2026-09-12 사용자 후속 지시에 따라 제안 정책 확정
- 관련 Task: P1-05
- 근거: `doc/BROS_구현_보완_명세_v0.2.md` 2장 34·42행은 상태·타입·코드의 허용 집합 CHECK와 필수 컬럼을 지정하지만, `product_type`, `created_method`, `import_type`, `reviewer_type`의 값 목록은 없다. 설계서 15.6의 `evidence_type` 값은 예시로 명시되어 있다.
- 영향: 폐쇄된 허용값 CHECK를 원문만으로 확정할 수 없다. 임의 값을 추가하거나 CHECK 요구를 조용히 생략하면 후속 입력/검수 계약이 달라진다.
- 진행한 독립 작업: 18개 테이블 256개 컬럼 명세, Kysely/pg 설치, migration 실행기, DDL 초안, 일회용 DB 테스트 코드. DB build와 lint는 통과했다.
- 해소 이후: migration up 가드를 제거하고 실제 DB 검증을 진행한다. 최종 구현 검증 상태는 IMPLEMENTATION_STATUS와 TEST_REPORT를 따른다.
- 제안: 다섯 필드를 VARCHAR(64), NOT NULL, 공백 금지로 시작하고 각 업무 단계에서 코드 집합을 확정하여 별도 migration으로 제한한다. 그 외 문서에 명시된 상태/타입 CHECK는 모두 유지한다.
- 해소 조건: 열린 코드 제안 승인 또는 다섯 필드의 허용값 제공 → 새 ACCEPTED Decision → 가드 제거 → DB 실행 및 negative test 보완·검증.
