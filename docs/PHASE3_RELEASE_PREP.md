# Phase 3 변경 묶음 및 원격 CI 준비

기준일: 2026-09-16. DEC-20260916-001. **로컬 준비 자료**이며 원격 Phase 3 CI 통과나 운영 배포를 의미하지 않는다.

## 기준과 원격 상태

- 작업 branch: `codex/p1-foundation`, 기준 HEAD `968dfa7930c0ead33d89d47493091dd5aad04fc4`.
- 저장소: public `hyunglory/bros`. [열린 PR #1](https://github.com/hyunglory/bros/pull/1)의 head도 같은 SHA이며 base는 main이다. 2026-09-16 GitHub API로 확인했다.
- main SHA: `126490b9f60c0500c556e6a40f9f2d8b9747d623`. 기존 PR에는 Phase 1/2 누적 변경도 있으므로 PR 전체를 Phase 3만의 diff로 설명하지 않는다.
- 기존 head의 [CI 성공](https://github.com/hyunglory/bros/actions/runs/34849628583/job/103993990742)은 기존 커밋의 증거다. 이번 미커밋 Phase 3의 증거로 사용하지 않는다.
- ruleset 23149676: active, strict required check `install / lint / typecheck / test / build`, bypass actor 없음. 이번에는 읽기만 수행했다.
- commit/push/PR 수정/workflow dispatch/merge는 이번 준비 작업에서 실행하지 않는다. 다음 실행 단계는 아래 검토 자료를 기준으로 진행한다.

## 변경 묶음

정확한 포함 경로는 [phase3-change-set.json](phase3-change-set.json)의 `files`다. 기준 HEAD 이후 현재 변경을 하나의 통합 checkpoint로 묶는다. 디렉터리 glob 전체를 stage하지 않는다. 이 목록은 내용의 서명이나 미래 변경의 자동 승인 목록이 아니며, 추가 변경이 생기면 diff를 다시 검토한다.

| 검토 단위           | 주요 경로와 내용                                                                                          | 함께 필요한 경계                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 계약·실행 모델      | contracts identifier/evidence/pattern/review/capture/evaluation, resolver run/registry/extractor/provider | package exports, resolver workspace, lockfile         |
| 판정·승격           | collector/normalizer/scorer/conflict/decision/promotion, importer 호환 키와 공유 lock                     | migration 002, 기존 norm 보존, 수동 승인 감사         |
| Batch·공유 한도     | admission/pipeline/worker/reconciliation, queue, configuration, quota                                     | migration 003/004, Worker/CLI 버전, capture 원자 저장 |
| API·Admin           | identifier review API와 UI, route, DTO, Vite origin 전달                                                  | 기존 인증/CSRF 경계, raw/capture 비노출               |
| 합성 평가·운영 문서 | fixture golden, 평가/export CLI, 보고서와 결정·blocker                                                    | 실제 정답/calibration 보류, 합성 보고서의 시점 구분   |
| CI 준비             | publication guard, 통합 파일 순차 실행, examples 제외, 이 문서/PR 초안/목록                               | required check 이름·전체 테스트 유지                  |

WBS별 파일이 index/package/config와 같은 경로를 공유하므로 현재 완성된 working tree를 임의의 P3-01~14 개별 커밋으로 쪼개지 않는다. 분할 커밋이 필요하면 각 경계의 독립 build/test를 별도로 확보한다.

## 공개 포함·제외 검토

- 포함: 코드/테스트/기준·결정·운영 문서, 손으로 만든 `SYNTHETIC` golden fixture와 기존 합성 평가 보고서. 실제 정답 PASS로 해석하지 않는다.
- 제외: `/examples/`의 원본 XLSX와 검수 대기 XLSX, `/data/`의 intake/원본 capture/검수 산출물, `/storage/`, 환경별 `.env`, 비밀 key 및 DB dump. 원본 파일은 이동·삭제·수정하지 않는다.
- `.gitignore`에 `/examples/`를 추가했다. `pnpm publication:check`는 Git index의 경로를 검사하므로 `git add -f`로 넣은 제외 자료도 CI에서 실패한다. `node scripts/check-publication.mjs --worktree`는 현재 미추적 후보까지 확인한다.
- 경로 검사는 내용을 분류하거나 모든 비밀을 탐지하지 않는다. 상품별 raw/capture를 허용된 JSON/문서 경로로 옮겨도 안전하다고 판단하지 않는다. stage diff의 수동 검토가 필요하다.
- 이번 경로 점검에서 원본/검수 XLSX와 intake JSON의 ignore 적용, index 내 examples/data/storage 부재를 확인했다. 고정 패턴의 private-key/GitHub/OpenAI 토큰 검색에서 일치한 파일은 없었다. 이는 포괄적 secret 감사 인증이 아니다.
- `docs/evaluations/p314-real-review-intake.md`는 집계·절차·digest 문서이며 상품별 raw를 포함하지 않는다. 과거 golden lock/report는 당시 알고리즘 증거로 보존한다. 현재 resolver 변경 뒤 같은 lock을 현재 평가 PASS로 재사용하지 않는다.

## CI 실행 계약

기존 workflow trigger(push main / pull_request / workflow_dispatch), action pin, PostgreSQL image pin, 20분 제한, required job 이름을 유지한다. feature branch push는 열린 PR의 synchronize 이벤트로 검증되며, 해당 branch의 push trigger 자체는 없다.

실행 순서: frozen lockfile install → publication 경로 검사 → lint → typecheck → unit/integration → format → build. 실제 Provider 키·XLSX·운영 DB가 필요하지 않다. CI의 전용 PostgreSQL service와 합성 fixture만 사용한다.

`scripts/run-tests.mjs integration`에 `--test-concurrency=1`을 적용해 직전 189 PASS와 같은 파일 간 실행 방식을 사용한다. 각 파일 내부의 Promise 경쟁/여러 pool/실제 process crash 테스트는 유지한다. 실패 시 skip/timeout 완화로 통과시키지 않는다. unit 실행 방식은 유지한다.

포맷 명령은 root 설정 파일과 `.github/apps/packages/scripts/tests`를 명시적으로 검사한다. 저장소 아래 다른 worktree의 접근 제한 폴더 때문에 `prettier --check .`가 실패한 것을 수정했다. 기존 `.prettierignore`의 doc/docs 제외 정책은 유지하고 이번 신규 문서는 별도로 검사한다. 다른 worktree나 비밀 디렉터리에 접근 권한을 추가하지 않는다.

이번 검증의 명령·최종 개수·결과는 [TEST_REPORT.md](TEST_REPORT.md)의 2026-09-16 기록을 따른다. Windows 로컬 PASS를 Ubuntu 원격 PASS로 대체하지 않는다.

## 다음 커밋·CI 실행 절차

아래는 다음 실행 단계의 절차이며 아직 실행한 명령이 아니다.

1. branch/HEAD와 working tree를 재확인한다. 기준 SHA가 바뀌거나 예상 외 변경이 있으면 목록을 재검토한다. 기존 staged 변경이 있으면 섞지 말고 먼저 범위를 확인한다.
2. 포함 목록과 실제 변경 경로를 대조하고 `node scripts/check-publication.mjs --worktree`, `git diff --check`를 실행한다.
3. PowerShell에서 명시적 목록만 stage하고 전체 staged diff를 검토한다.

```powershell
$phase3Bundle = Get-Content -Raw docs/phase3-change-set.json | ConvertFrom-Json
git add -- $phase3Bundle.files
pnpm publication:check
git diff --cached --check
git diff --cached --stat
git diff --cached
```

4. 검토한 묶음을 `feat(resolver): add Phase 3 resolution and review workflow` 같은 통합 commit으로 기록하고 새 SHA를 보관한다. working tree 검증과 commit SHA를 혼동하지 않는다.
5. 현재 branch를 origin에 일반 push한다. force push는 사용하지 않는다. PR #1의 전체 누적 범위를 [PR 설명 초안](PHASE3_PR.md)으로 갱신한다.
6. 새 SHA의 `install / lint / typecheck / test / build`가 completed/success인지 확인하고 workflow URL·head SHA·검증 결과를 기록한다. old head나 다른 PR의 성공은 사용하지 않는다.
7. CI 성공도 Phase 3 Gate PASS/자동승격 활성화/운영 배포를 뜻하지 않는다. BLK-005 운영 입력과 BLK-007은 별도로 유지한다.

## Migration 및 배포 인수 순서

실제 대상 DB에 이번 작업으로 migration을 적용하지 않았다. 대상 데이터/이력 재확인과 백업·복구 준비 후 별도 배포 작업으로 수행한다.

1. API/Worker의 신규 쓰기와 Queue 접수를 중지하고 기존 실행을 drain한다. **P2 importer와 P3 resolver를 함께 배포**한다. 과거 P2 프로세스는 새 호환 identity lock을 공유하지 않을 수 있다.
2. 실행 중/대기 중 resolve run의 resolver/registry version을 확인한다. v1 run을 v2 성공으로 덮어쓰지 않는다. 기존 version fence와 재접수 규칙을 적용하고 필요한 재분석에는 새 요청 UUID를 쓴다.
3. 검토한 동일 revision을 install/build한 뒤 `pnpm db:migrate`를 한 배포 주체에서 실행한다. 적용 순서는 001 baseline → 002 identifier 비교 index → 003 admission/queue/result JSONB → 004 bros_provider 계정/예약 장부다.
4. 002는 저장 norm/unique를 바꾸지 않는 비유일 index지만 일반 CREATE INDEX이므로 쓰기 잠금 시간을 대상 DB 크기와 함께 검토한다. 003 ALTER TABLE의 잠금 시간도 고려한다. 004는 별도 schema 생성 권한이 필요하다.
5. migration 이력 4개, app 업무 테이블/컬럼 계약, bros_provider 테이블을 확인한다. 과거 실제 DB 0행/001 기록을 오늘의 운영 상태로 가정하지 않는다.
6. 동일 revision의 API/Worker/접수 CLI와 호환 Admin을 시작한다. registry와 설정을 맞추고 기존 run fence·수동 검수·local capture/export를 확인한다. readiness만으로 migration·업무 정합성 검증을 대체하지 않는다.
7. 기본 Provider disabled 및 `RESOLVER_AUTO_ACCEPT_ENABLED=false`를 유지한다. live는 운영 계약/저장 권한·계정·가격/한도·키·shared quota 연결을 별도로 충족해야 한다.

운영 down/reset으로 복구하지 않는다. 문제 시 쓰기를 중지하고 검증한 forward fix 또는 백업 복구 절차를 따른다. 추가 schema가 있다는 이유만으로 과거 P2 binary로 무조건 되돌리지 않는다. quota ACTIVE는 owner/transport 종료 확인과 감사 복구 절차를 따른다.

## 남은 상태

- 원격 Phase 3 commit/CI/배포: NOT_RUN.
- BLK-005: 공유 quota RESOLVED_LOCAL, 운영 입력/연결 OPEN.
- BLK-006: RESOLVED_LOCAL; 원래 norm/identity 결정을 유지.
- BLK-007/P3-14: 사용자 보류. 실제 정답·capture 확보 또는 재개 요청 시 이어간다.
- Phase 3 Gate: BLOCKED, 자동승격 OFF.
