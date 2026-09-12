## BROS_개발_운영_구성_지침_v0.1.md

> **적용 개정: v0.3 (2026-09-12)** — 파일명의 v0.1은 참조 호환성을 위해 유지한다. 설계·WBS·구현 보완 기준은 v0.2를 유지하며, v0.3은 작업 단계 종료 시 결정 기록과 모델 전환 인수인계 규칙을 추가한다. 아래 v0.1 표기와 기존 검수 판정은 최초 작성 이력이다. 현재 기준 문서는 `doc/`에서 관리한다. 문서 검토는 실제 구현·테스트 PASS를 의미하지 않는다. 변경 요약은 [문서 안내](README.md)를 참조한다.


# BROS 개발 운영 구성 지침

> 문서 버전: v0.1
> 기준일: 2026-09-11
> 프로젝트: BROS / Brand Resell OS
> 목적: BROS Project, Codex Local, ChatGPT Work, Codex Cloud의 역할을 분리하고 설계→구현→검수→위임→통합의 표준 개발 흐름을 고정한다.
> 기준 문서: brand_resell_os_design_v0.1.md, BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md

---

## 1. 이 지침의 핵심 결론

BROS 개발은 다음 4계층 구조로 운영한다.

```
현재 BROS Project
= 설계 / 요구사항 / 의사결정

           ↓

Codex Local
= 실제 개발자
= 코드 / Docker / DB / 테스트 / localhost

           ↓

Work
= 전체 검수 / 조사 / 문서 / 운영 분석

           ↓

Codex Cloud
= 필요할 때 큰 개발 작업 위임
```

한 문장으로 정리하면 다음과 같다.

> BROS Project가 무엇을 만들지 결정하고, Codex Local이 실제 제품을 만들며, Work가 전체를 검수하고, Codex Cloud는 경계가 명확한 큰 작업을 병렬 위임받는다.

---

## 2. 용어 정의

### 2.1 BROS Project

현재 ChatGPT의 BROS 프로젝트를 의미한다.

주요 책임:

- 제품 비전

- 설계 베이스라인

- 요구사항

- WBS

- 정책 결정

- 주요 변경 의사결정

- 프로젝트 문서의 장기 보존

BROS Project는 **요구사항과 설계의 Source of Truth**다.

### 2.2 Codex Local

본 지침에서 `Codex Local`은 별도 제품명을 의미하지 않는다.

**Codex 데스크톱 앱 / CLI / IDE 확장 등을 사용하여 사용자의 로컬 PC에 있는 저장소, 터미널, Docker, DB, 개발 서버를 직접 다루는 운영 방식**을 BROS 내부에서 편의상 `Codex Local`이라고 부른다.

주요 책임:

- 실제 코드 작성

- 파일 생성/수정

- Git 작업

- 로컬 개발환경

- Docker Compose

- PostgreSQL

- Migration

- API/Worker/Admin 실행

- Unit/Integration/E2E 테스트

- localhost UI 확인

- 브라우저 콘솔/네트워크 확인

- 버그 수정

- Phase Gate 증명

Codex Local은 **구현의 주 실행자**다.

### 2.3 ChatGPT Work

Work는 BROS 전체를 한 단계 위에서 검수하고 분석하는 역할로 사용한다.

주요 책임:

- 설계서와 구현 결과 대조

- WBS 누락 검수

- 코드/문서 전반 분석

- 외부 공식 문서 조사

- 보안/운영 검수

- 테스트 결과 분석

- Release Readiness 검토

- Runbook/보고서/운영 문서 작성

- 기술 의사결정의 독립 검토

Work는 원칙적으로 **주 개발자가 아니라 Reviewer / Architect / Researcher 역할**을 맡는다.

### 2.4 Codex Cloud

Codex Cloud는 로컬 PC에서 상시 직접 조작하기보다, 분리된 환경에서 경계가 명확한 개발 작업을 위임하는 용도로 사용한다.

주요 책임:

- 독립적으로 잘라낼 수 있는 큰 기능

- 테스트 추가

- 특정 패키지 리팩터링

- 코드베이스 조사

- 병렬 구현 실험

- 반복적인 정적 분석/보완

Cloud 작업은 **격리된 branch/worktree 단위**로 수행하는 것을 원칙으로 한다.

Cloud 결과는 바로 `main`에 넣지 않는다.

반드시 Codex Local에서 검토·통합·전체 테스트 후 반영한다.

---

## 3. Source of Truth 체계

BROS는 Source of Truth를 하나로 뭉개지 않고 종류별로 분리한다.

| 종류 | Source of Truth |
| --- | --- |
| 제품 목표/요구사항 | BROS Project |
| Architecture Baseline | doc/brand_resell_os_design_v0.1.md의 적용 개정 v0.2 + doc/BROS_구현_보완_명세_v0.2.md |
| 개발 순서/Acceptance Criteria | BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md |
| 실제 구현 코드 | Local Git Repository |
| 현재 구현 상태 | Repository의 docs/IMPLEMENTATION_STATUS.md |
| 기술 변경 판단 | Repository의 docs/DECISIONS.md + BROS Project 승인 기록 |
| Blocker | Repository의 docs/BLOCKERS.md |
| 실제 테스트 결과 | Repository의 docs/TEST_REPORT.md + CI 결과 |
| 운영 절차 | Repository의 docs/RUNBOOK.md |

중요 원칙:

> 문서에는 구현이 됐다고 적혀 있는데 코드가 없는 상태, 코드에는 있는데 WBS에는 완료되지 않은 상태를 장기간 방치하지 않는다.

Phase Gate마다 상태를 동기화한다.

---

## 4. BROS 개발의 기본 작업 흐름

```
1. BROS Project에서 요구사항/설계/WBS 확정
                    ↓
2. Codex Local이 WBS Task 선택
                    ↓
3. 로컬 코드 구현
                    ↓
4. lint / typecheck / test / build
                    ↓
5. Docker / DB / API / Worker 실행
                    ↓
6. localhost Admin 실제 화면 확인
                    ↓
7. Acceptance Criteria 검증
                    ↓
8. Git checkpoint / commit
                    ↓
9. Work에서 독립 검수
                    ↓
10. 지적사항을 Codex Local에서 수정
                    ↓
11. 필요 시 일부 큰 작업을 Codex Cloud에 위임
                    ↓
12. Local에서 Cloud 결과 통합 + 전체 Regression
                    ↓
13. Phase Gate 통과
                    ↓
14. BROS Project에 결과 반영
```

---

## 5. 각 도구에 맡겨야 하는 일

### 5.1 BROS Project에 맡긴다

다음은 이 프로젝트에서 결정한다.

- MVP 범위 변경

- Architecture 변경

- WBS 수정

- Thumbnail 정책 변경

- Identifier 자동승인 정책 변경

- PRODUCT_MASTER 정의 변경

- 외부 Provider 선택의 최종 승인

- Security 정책 변경

- 운영 배포 방식 변경

- 새로운 Phase/대규모 기능 추가

즉, **"무엇을 만들 것인가"와 "왜 그렇게 만드는가"**는 BROS Project에서 결정한다.

### 5.2 Codex Local에 맡긴다

다음은 기본적으로 Codex Local에서 실행한다.

- WBS Task 구현

- Repository 생성/수정

- 패키지 설치

- TypeScript 작성

- DB Migration

- PostgreSQL 실행

- pg-boss 실행

- Fastify API 실행

- Worker 실행

- React/Vite Admin 실행

- Playwright 실행

- Docker Compose

- 테스트

- localhost 화면 확인

- 브라우저 콘솔/Network 확인

- Git diff 검토

- Commit 준비

즉, **"실제로 만들어서 돌아가게 하는 것"**은 Codex Local의 책임이다.

### 5.3 Work에 맡긴다

다음과 같은 질문은 Work에 적합하다.

- 설계서와 현재 구현이 일치하는가?

- WBS 85개 Task 중 누락된 것은 무엇인가?

- Phase Gate를 실제로 통과했다고 볼 수 있는가?

- Security 취약점이 있는가?

- OpenAI/Cloudflare/PostgreSQL/Playwright 등의 최신 공식 문서와 구현이 맞는가?

- 운영 배포 전 빠진 부분은 무엇인가?

- 테스트 전략이 충분한가?

- 장애 대응 Runbook이 충분한가?

Work 결과는 **Review Finding**으로 취급한다.

Work가 지적한 사항을 실제 코드에 반영하는 기본 주체는 Codex Local이다.

### 5.4 Codex Cloud에 맡긴다

Cloud에는 다음처럼 범위가 명확한 일을 위임한다.

좋은 예:

```
P3-07 Candidate Normalizer와 관련 unit test를 구현하라.
변경 범위는 packages/core와 해당 test에 한정한다.
DB schema와 API contract는 변경하지 않는다.
```

```
현재 repository에서 P4 Thumbnail QA 관련 테스트 누락을 조사하고
새 branch에서 regression test를 추가하라.
Production code 변경은 테스트 실패를 고치는 최소 범위로 제한한다.
```

좋지 않은 예:

```
BROS 전체를 알아서 완성해줘.
```

Cloud 작업은 **작업 경계, 금지 변경, Acceptance Criteria, 테스트 명령**이 명확할수록 좋다.

---

## 6. BROS 전용 개발 원칙

기준 설계서 v0.1과 WBS v0.1의 아래 원칙은 모든 개발 환경에서 동일하게 적용한다.

### Architecture

- Modular Monolith

- API / Worker 실행 프로세스 분리

- React + Vite Admin

- Fastify v5

- Node.js 24 LTS

- PostgreSQL 18

- Kysely + pg

- pg-boss

- Playwright + Chromium

- Sharp/libvips + AI Edit Adapter

- ObjectStorage Port

- Cloudflare R2 운영 기본

- Caddy

- Docker Compose

MVP에 특별한 승인 없이 다음을 추가하지 않는다.

- Redis

- Kafka

- Kubernetes

- Elasticsearch

- Microservice 분리

- 별도 Workflow Engine

### Identifier Resolver

- Evidence-first

- 품번 추측 생성 금지

- Strong Evidence 없는 Auto Accept 금지

- Hard Conflict 존재 시 Auto Accept 금지

- `NOT_FOUND`를 정상 결과로 허용

- Golden Dataset Calibration 전 자동승인을 보수적으로 운영

### Thumbnail

- 제품 정체성 보존

- SAFE_COMPOSITE 우선

- 원본 제품 픽셀 재합성 우선

- 사람/손/팔/얼굴/소품 제거

- 투명 아크릴 받침대 및 장식 받침대 생성 금지

- AI_EDIT 기본 Review

- AI_RECONSTRUCT Auto Approve 금지

- 원본 이미지 overwrite 금지

### Browser Automation

- Playwright는 Worker 전용

- Flow Registry 기반

- `prepare → authenticate → execute → verify → cleanup`

- `verify()` 통과 전 SUCCESS 금지

- 동일 profile 동시 실행 금지

- CAPTCHA 우회 금지

- 2FA 우회 금지

- Screenshot/Trace/URL/Step/Error Code 기록

- Secret/Cookie/Token 평문 로그 금지

---

## 7. Local Repository 표준

권장 기본 구조:

```
brand-resell-os/
├─ apps/
│  ├─ admin/
│  ├─ api/
│  └─ worker/
├─ packages/
│  ├─ core/
│  ├─ contracts/
│  ├─ db/
│  ├─ queue/
│  ├─ storage/
│  ├─ image/
│  └─ browser/
├─ docs/
│  ├─ baseline/
│  ├─ IMPLEMENTATION_STATUS.md
│  ├─ BLOCKERS.md
│  ├─ DECISIONS.md
│  ├─ TEST_REPORT.md
│  └─ RUNBOOK.md
├─ infra/
│  ├─ docker/
│  └─ caddy/
├─ scripts/
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ .env.example
└─ README.md
```

현재 프로젝트의 기준 문서는 doc/에 보관한다. 아래 docs/baseline/ 경로는 기존 저장소 호환 예시이며 현재 문서를 중복 복사하지 않는다.

```
docs/baseline/brand_resell_os_design_v0.1.md
docs/baseline/BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md
```

---

## 8. Git 운영 규칙

### 기본 원칙

- `main`은 검증된 통합 상태를 유지한다.

- 작업은 branch에서 수행한다.

- `force push` 금지

- `git reset --hard` 금지

- 사용자 미커밋 작업 삭제 금지

- `git clean -fd`를 임의 실행하지 않는다.

- Secret Commit 금지

권장 branch 예:

```
codex/p1-foundation
codex/p2-importer
codex/p3-resolver
codex/p4-thumbnail
codex/p5-browser
codex/p6-release
```

Task 단위 예:

```
codex/p3-07-candidate-normalizer
```

Commit 예:

```
feat(P1-09): add pg-boss queue adapter
feat(P2-08): implement product master matcher
test(P3-10): add resolver decision boundary cases
```

---

## 9. 동시 작업 충돌 방지 규칙

BROS에서 가장 중요한 운영 규칙 중 하나다.

> 같은 파일/같은 branch를 Codex Local, Work, Codex Cloud가 동시에 수정하지 않는다.

### One Writer Rule

한 시점에 특정 작업 영역의 Writer는 하나만 둔다.

예:

- Local이 `packages/db`를 수정 중이면 Cloud에는 같은 범위를 주지 않는다.

- Cloud가 `packages/image` worktree에서 작업 중이면 Local은 해당 Cloud 작업이 끝날 때까지 같은 파일군을 대규모 수정하지 않는다.

- Work는 기본적으로 직접 코드를 대량 수정하기보다 Review Report를 만든다.

---

## 10. Codex Cloud 결과 통합 규칙

Cloud 결과는 다음 순서로만 통합한다.

```
Cloud Task 완료
→ diff 확인
→ Codex Local에서 변경 내용 설명 검토
→ Architecture/WBS 위반 확인
→ 해당 Task test 실행
→ 전체 lint/typecheck/test/build
→ 필요 시 localhost regression
→ merge/rebase
→ IMPLEMENTATION_STATUS 갱신
```

Cloud가 "완료"라고 했다는 이유만으로 WBS Task를 PASS 처리하지 않는다.

---

## 11. Work 검수 결과 처리

Work는 다음 형식으로 Finding을 작성하는 것을 권장한다.

```
Finding ID
Severity
관련 WBS Task
문제
근거
영향
권장 수정
검증 방법
```

Severity:

```
BLOCKER
CRITICAL
HIGH
MEDIUM
LOW
```

Codex Local은 Finding을 수정한 뒤 실제 테스트 결과로 Close한다.

---

## 12. Phase Gate 운영

각 Phase가 끝날 때 다음 루프를 수행한다.

```
Codex Local 구현 완료
→ Local Test
→ localhost/UI 확인
→ Phase Gate 자체 판정
→ Work 독립 검수
→ Finding 수정
→ Regression Test
→ Git checkpoint
→ BROS Project에 결과 반영
```

Phase Gate를 통과하지 못하면 다음 Phase 전체를 무조건 중단할 필요는 없지만, WBS가 허용한 병렬 Track만 진행한다.

예:

- Phase 2 Gate 이후 Phase 3/4 대부분 진행

- Phase 1 Gate 이후 Phase 5 Browser Track 시작 가능

- Phase 6 Release Gate는 Phase 3/4/5 Gate 완료 필요

---

## 13. 화면 확인 표준

BROS Admin UI는 코드만 보고 완료 판단하지 않는다.

Codex Local에서 개발 서버를 실제 실행하고 ChatGPT 데스크톱 앱의 Codex 내장 브라우저 또는 사용자의 일반 브라우저로 `localhost`를 확인한다.

기본 확인 대상:

- 페이지가 실제 렌더링되는가

- Dashboard/Layout가 깨지지 않는가

- API health/readiness 표시가 정상인가

- Console error가 없는가

- Network 요청이 예상 상태코드를 반환하는가

- Loading/Error 상태가 보이는가

- 주요 버튼/폼이 실제 동작하는가

- 변경 후 새로고침해도 정상인가

UI 변경이 필요한 경우 내장 브라우저의 Annotation 기능을 활용해 화면의 특정 위치를 지정하고 Codex가 해당 코드까지 추적해 수정하도록 한다.

---

## 14. 로컬 환경 안전 규칙

Codex Local은 다음을 지킨다.

### 자동으로 해도 되는 것

- Repository 내부 파일 생성/수정

- 프로젝트 dependency 설치

- lint/typecheck/test/build

- Docker Compose의 프로젝트 서비스 실행/정지

- 개발 DB Migration

- Test fixture 생성

- localhost 개발 서버 실행

### 사용자 승인 없이 하면 안 되는 것

- OS 전체 설정 변경

- 중요한 시스템 프로그램 제거

- 디스크 전체 정리

- 프로젝트 밖 파일 대량 삭제

- Credential 변경

- 실제 운영 DB 파괴적 변경

- 운영 서비스 배포

- 실제 Marketplace에 대량 상품 등록

- 비용이 큰 외부 API 대량 호출

---

## 15. 외부 입력이 없을 때의 처리

실제 상품 데이터, Provider API Key, R2 Key, Browser 계정 등 외부 입력이 없다는 이유로 전체 개발을 정지하지 않는다.

```
구현 가능한 Core 작업 계속
→ Port/Adapter 구현
→ deterministic mock/fixture 사용
→ 테스트 가능한 범위 완료
→ 외부 입력이 필요한 Task만 BLOCKED_EXTERNAL_INPUT
```

단, Architecture Baseline 문서 자체가 없다면 임의 추측으로 구현을 시작하지 않는다.

---

## 16. 권장 일상 개발 루프

하루 또는 한 작업 세션의 권장 흐름:

```
1. Codex Local에서 git status 확인
2. IMPLEMENTATION_STATUS 확인
3. 다음 WBS Task 선택
4. 구현
5. 관련 test
6. 전체 lint/typecheck
7. 필요한 경우 Docker 서비스 실행
8. localhost 화면 확인
9. Acceptance Criteria 판정
10. status/test report 갱신
11. Commit
12. 중요한 묶음이 끝나면 Work 검수
```

---

## 17. 언제 Codex Cloud를 쓸 것인가

다음 중 하나면 Cloud 위임을 고려한다.

- 작업이 독립 package로 잘 분리된다.

- Local에서 다른 핵심 작업을 동시에 진행하고 싶다.

- 대량 테스트 추가처럼 반복 작업이 크다.

- 특정 리팩터링을 별도 실험하고 싶다.

- 결과를 diff로 명확히 검토할 수 있다.

다음이면 Local이 낫다.

- Docker/DB/localhost 상태와 강하게 결합된 문제

- UI를 보면서 빠르게 반복 수정해야 하는 문제

- 실제 PC Browser Profile/Session을 써야 하는 문제

- 로컬 Secret/개발환경에 의존하는 문제

- 여러 서비스 로그를 동시에 봐야 하는 문제

---

## 18. 언제 Work를 쓸 것인가

다음이면 Work를 사용한다.

- Phase 전체 검수

- 최신 공식문서 조사

- 설계와 구현 비교

- Release Checklist 검토

- Security/Operations 검토

- 큰 문서 작성

- 외부 서비스 정책 조사

- WBS 변경 영향 분석

Work는 BROS Project context를 활용해 설계서/WBS와 구현 결과를 대조하는 것이 핵심이다.

---

## 19. 개발 현황 보고 표준

Codex Local, Work, Cloud 모두 가능하면 다음 형식을 사용한다.

```
Completed
- P1-01 ...
- P1-02 ...

Validated
- lint PASS
- typecheck PASS
- test 42/42 PASS
- build PASS

UI Checked
- http://localhost:5173
- Console errors: 0
- Failed network requests: 0

Changed
- apps/api/...
- packages/db/...

Blocked
- P2-01: 실제 Legacy 상품 데이터 필요

Next
- P1-09
- P1-10
```

---

## 20. BROS 개발 환경의 최종 역할 구분

### BROS Project

**CEO / Product Owner / Architecture Board**

질문:

> 무엇을 만들 것인가? 어떤 정책으로 만들 것인가?

### Codex Local

**Lead Developer / QA / Local DevOps**

질문:

> 실제 코드로 어떻게 구현하고, 실행하고, 검증할 것인가?

### Work

**Architect Reviewer / Researcher / Auditor**

질문:

> 설계대로 제대로 만들었는가? 빠진 것은 없는가?

### Codex Cloud

**Parallel Engineering Agent**

질문:

> 독립적인 큰 작업을 병렬로 처리할 수 있는가?

---

## 21. 최종 운영 원칙

BROS에서는 다음 순서를 우선한다.

```
설계의 일관성
→ 데이터 정합성
→ 재현 가능한 로컬 실행
→ 자동 테스트
→ 실제 화면 검증
→ 독립 검수
→ 병렬 위임
→ 통합 Regression
→ 운영 배포
```

화려한 기술보다 검증 가능성을 우선한다.

계획만 있는 상태보다 실제 실행 가능한 상태를 우선한다.

Cloud의 속도보다 Local 통합 안정성을 우선한다.

자동화보다 Evidence와 안전한 실패를 우선한다.

> BROS의 개발 기준은 “AI가 코드를 많이 작성했는가”가 아니라 “설계서와 WBS의 Acceptance Criteria를 실제 실행과 테스트로 증명했는가”다.

---

## 22. OpenAI 도구 사용 참고 — 2026-09-11 기준

- Codex 데스크톱 환경은 로컬 폴더, 저장소, 터미널, 개발 도구를 사용할 수 있다.

- ChatGPT 데스크톱 앱의 Codex/Work 내장 브라우저는 로컬 개발 페이지를 열고 사용자와 같은 화면을 보며 검토하는 용도로 사용할 수 있다.

- 내장 브라우저는 Windows/macOS에서 사용할 수 있으며 로컬 개발 페이지 검토와 Annotation을 지원한다.

- Codex는 로컬과 Cloud 작업을 연결할 수 있으나, BROS에서는 Cloud 변경을 바로 통합하지 않고 Local 검증 단계를 둔다.

공식 참고:

- [https://help.openai.com/en/articles/20001275/](https://help.openai.com/en/articles/20001275/)

- [https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app)

- [https://help.openai.com/ko-kr/articles/11369540-using-codex-with-chatgpt](https://help.openai.com/ko-kr/articles/11369540-using-codex-with-chatgpt)

- [https://openai.com/index/introducing-the-codex-app/](https://openai.com/index/introducing-the-codex-app/)


## v0.2 운영 및 변경 관리 보완

- 제품 범위는 기존 설계대로 유지하며 이번 보완의 인증 기본값은 Caddy basic_auth/단일 관리자 권한이다. 후속 다중 역할 요구는 별도 Decision으로 관리한다.
- 문서 보완 요청과 실제 개발 실행 요청을 구분한다. 실행 지침을 읽었다는 이유로 앱 구현·설치·배포를 시작하지 않는다.
- 전체 Phase PASS는 해당 작업의 검증 증거로 판단한다. P0는 우선순위이며 P1/P2를 자동 면제하지 않는다.
- 검토 문서의 통과와 런타임 테스트 통과를 구분하며 Waiver는 PASS와 별도로 기록한다.
- 운영 자동승인 활성화, 실제 비용 한도, 외부 입력의 제공 책임은 구현 보완 명세 5장 입력표를 따른다. 자격증명은 문서에 적지 않는다.
- 기준 문서는 doc/에서만 개정하고 구현 상태는 docs/에서 관리한다. 양쪽의 적용 개정과 관련 Task ID를 연결한다.
- 기존 도구 사용 참고의 URL은 참고 목록이다. 현재 앱 기능·단축키·권한은 실제 제공 기능과 공식 문서를 확인한 뒤 안내하며 이 문서의 과거 설명을 검증 증거로 취급하지 않는다.

---

## 23. 작업 단계 종료·모델 전환 결정 기록

설계, 문서화, 구현, 검수, 운영 준비 등 하나의 작업 분야 또는 단계가 끝나면 다음 작업을 시작하기 전에 결정 기록을 남긴다. 같은 채팅에서 모델 또는 추론 수준만 변경하는 경우에도 동일하다.

목적은 다음 모델이 이전 모델의 숨은 추론이나 대화 요약을 추측해 결론을 재구성하지 않도록 하는 것이다. 다음 작업자는 파일에 기록된 결정, 변경 내용, 검증 증거만 공식 인수 자료로 사용한다.

### 23.1 기록 위치

- 개발 저장소가 준비된 뒤의 기술 결정 Source of Truth는 `docs/DECISIONS.md`다.
- 구현 현황은 `docs/IMPLEMENTATION_STATUS.md`, 검증 결과는 `docs/TEST_REPORT.md`, blocker는 `docs/BLOCKERS.md`에 함께 동기화한다.
- 프로젝트 초기라 해당 파일이 없으면 첫 작업자가 생성한다.
- 채팅 응답에만 남긴 결론은 장기 결정 기록으로 인정하지 않는다.

### 23.2 기록 시점

다음 중 하나에 해당하면 기록한다.

- 설계 검수, 문서 반영, 구현, 테스트, 보안 검토 또는 운영 검토가 끝났을 때
- 모델 또는 추론 수준을 변경하기 직전
- WBS Task 또는 Phase Gate의 상태가 바뀔 때
- 기존 Architecture, API, DB, 보안 또는 운영 결정을 변경할 때
- 다음 작업자의 구현 범위나 금지 변경을 고정해야 할 때

### 23.3 필수 형식

```md
## DEC-YYYYMMDD-NNN — 제목

- 일자:
- 종료 단계/분야:
- 작성 모델/추론 수준:
- 관련 WBS Task:
- 검토 범위와 근거:
- 상태: PROPOSED | ACCEPTED | SUPERSEDED | REJECTED
- supersedes: 없음 | 기존 Decision ID

### 확정 결정
- ...

### 기각한 선택지와 이유
- ...

### 변경 파일
- ...

### 검증 증거
- 실행 명령 또는 수동 확인:
- 결과: PASS | FAIL | NOT_RUN | IMPLEMENTED_NOT_VALIDATED

### 미해결 사항 및 Blocker
- ...

### 다음 작업 인수 조건
- 작업 범위:
- 금지 변경:
- 완료 조건:
- 재검토가 필요한 조건:
```

해당 사항이 없으면 항목을 삭제하지 않고 `없음` 또는 `NOT_RUN`으로 명시한다. 문서 검토 완료를 구현 완료나 테스트 PASS로 바꾸어 기록하지 않는다.

### 23.4 확정 결정의 변경

- 다음 모델은 `ACCEPTED` 결정을 임의로 재해석하거나 조용히 변경하지 않는다.
- 확정 결정을 바꿔야 하면 기존 기록을 덮어쓰지 않고 새 Decision을 추가한다.
- 새 기록에는 `supersedes` 대상, 변경 근거, 영향 범위, 필요한 재검증을 적는다.
- 보안, 데이터 손실, 권한 우회, 외부 부작용 위험을 발견한 경우에는 확정 결정보다 안전을 우선하고 작업을 중단한 뒤 근거를 보고한다.
- 그 밖의 새로운 모순이나 누락은 기존 결정을 즉시 폐기하지 않고 `PROPOSED` 또는 blocker로 기록한다.

### 23.5 모델과 추론 수준별 역할

- 고성능·높은 추론 수준의 설계 검수 결과는 `ACCEPTED` 여부와 근거를 명확히 기록한 뒤 다음 단계로 넘긴다.
- 낮은 추론 수준의 문서 작업은 확정 결정의 정확한 반영, 링크·표·표현 정리처럼 경계가 명확한 작업에 사용한다.
- 문서 반영 중 새로운 Architecture, DB, API, 인증·인가 또는 운영 정책 판단이 필요하면 임의로 확정하지 않고 `결정 필요`로 남긴다.
- 구현 모델은 최신 `ACCEPTED` 결정과 WBS Acceptance Criteria를 기준으로 작업한다. 대화상의 이전 제안보다 저장소의 최신 결정 기록을 우선한다.

### 23.6 인수인계 완료 조건

모델 전환은 다음이 모두 충족되어야 완료로 본다.

1. 종료 단계의 결정 기록이 파일에 저장되어 있다.
2. 실제 변경 파일과 검증 상태가 기록과 일치한다.
3. 미해결 사항과 blocker가 누락되지 않았다.
4. 다음 작업의 범위, 금지 변경, 완료 조건이 명시되어 있다.
5. 다음 모델이 최신 결정 기록을 읽고 작업을 시작하도록 요청에 명시되어 있다.

한 채팅 안에서 모델을 전환해도 이 절차를 생략하지 않는다.

### 23.7 완료 보고의 모델 추천

모든 작업 완료 보고의 마지막에는 다음 형식을 반드시 포함한다.

```md
[추천 모델과 추론성능]
- 다음 작업: ...
- 추천: 정확한 모델명 + 추론 수준
- 이유: 작업 복잡도, 위험도, 검증 필요성, 사용량 효율을 근거로 설명
- 전환 조건: 더 높거나 낮은 모델·추론 수준으로 바꿔야 하는 조건
```

다음 작업이 없으면 `추천: 없음 — 현재 요청 완료`라고 기록한다. 항상 최고 성능 모델을 추천하지 않고, 다음 작업을 안정적으로 완료할 수 있는 가장 효율적인 조합을 선택한다.
