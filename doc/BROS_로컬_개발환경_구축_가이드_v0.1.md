## BROS_로컬_개발환경_구축_가이드_v0.1.md

> **적용 개정: v0.2 (2026-09-11)** — 파일명의 v0.1은 참조 호환성을 위해 유지한다. 아래 v0.1 표기와 기존 검수 판정은 최초 작성 이력이며, 현재 적용 기준은 [구현 보완 명세 v0.2](BROS_구현_보완_명세_v0.2.md) 및 이 문서의 개정 내용이다. 현재 기준 문서는 `doc/`에서 관리한다. 문서 검토는 실제 구현·테스트 PASS를 의미하지 않는다. 변경 요약은 [문서 안내](README.md)를 참조한다.


# BROS 로컬 개발환경 구축 가이드

> 문서 버전: v0.1
> 기준일: 2026-09-11
> 대상: 개발 경험이 거의 없거나 처음인 사용자
> 기준 OS: Windows 11
> 전제: Docker Desktop은 이미 설치되어 있음
> 프로젝트: BROS / Brand Resell OS
> 연계 문서:
> 
> brand_resell_os_design_v0.1.md
> 
> BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md
> 
> BROS_개발_운영_구성_지침_v0.1.md
> 
> BROS_Codex_Local_마스터_프롬프트_v0.1.md

---

# 1. 이 가이드의 목표

이 가이드를 끝까지 따라가면 내 PC가 아래 상태가 되는 것을 목표로 한다.

```
Windows 11 PC
│
├─ Docker Desktop
│   └─ PostgreSQL 18 실행 가능
│
├─ Git
├─ Node.js 24 LTS
├─ pnpm
├─ ChatGPT Desktop
│   └─ Codex
│
└─ D:\project\bros
    │
    ├─ Git Repository
    ├─ BROS 기준 문서
    ├─ React Admin
    ├─ Fastify API
    ├─ Worker
    └─ Docker Compose
         ↓
      localhost
```

최종적으로는 다음 개발 루프를 사용할 수 있어야 한다.

```
BROS Project
    ↓
Codex Local
    ↓
코드 작성
    ↓
Docker / PostgreSQL
    ↓
API / Worker / Admin 실행
    ↓
localhost 화면 확인
    ↓
Codex와 화면 보면서 수정
    ↓
테스트
    ↓
Git Commit
```

---

# 2. 초보자가 꼭 알아야 하는 7개 용어

개발을 시작하기 전에 아래 정도만 이해하면 된다.

## 2.1 Repository

프로젝트 파일 전체가 들어 있는 폴더다.

BROS에서는 다음 폴더가 Repository가 된다.

```
D:\project\bros
```

## 2.2 Git

코드 변경 이력을 저장하는 시스템이다.

실수로 코드를 망가뜨렸을 때 이전 상태를 확인하거나 되돌리는 데 매우 중요하다.

## 2.3 Node.js

BROS의 API, Worker, 개발도구를 실행하는 JavaScript Runtime이다.

BROS 기준 버전:

```
Node.js 24 LTS
```

## 2.4 pnpm

Node.js 프로젝트에서 라이브러리를 설치하고 명령을 실행하는 Package Manager다.

BROS는 여러 앱과 패키지가 들어 있는 Workspace 구조이므로 pnpm을 사용한다.

## 2.5 Docker

PostgreSQL 등 개발에 필요한 프로그램을 PC에 직접 복잡하게 설치하지 않고 Container로 실행하게 해준다.

현재 PC에는 이미 Docker Desktop이 설치되어 있다고 가정한다.

## 2.6 localhost

내 PC에서 실행 중인 웹서비스 주소다.

예:

```
http://localhost:5173
```

인터넷에 공개된 주소가 아니다.

## 2.7 Codex Local

BROS에서 사용하는 내부 표현이다.

별도의 제품명이 아니라 ChatGPT Desktop의 Codex가 내 PC의 로컬 폴더, Git, Terminal, Docker, 개발 서버 등을 직접 다루는 운영 방식을 뜻한다.

---

# 3. 전체 설치 및 확인 순서

처음부터 아래 순서대로 한다.

```
STEP 1  작업 폴더 결정
STEP 2  Docker 정상 작동 확인
STEP 3  Git 확인/설치
STEP 4  Node.js 24 LTS 확인/설치
STEP 5  pnpm 확인/설치
STEP 6  ChatGPT Desktop / Codex 준비
STEP 7  BROS Repository 생성
STEP 8  기준 문서 배치
STEP 9  Git 초기화 및 첫 Snapshot
STEP 10 Codex에서 Repository 열기
STEP 11 Codex 마스터 프롬프트 실행
STEP 12 PostgreSQL / API / Worker / Admin 실행
STEP 13 localhost 화면 확인
STEP 14 Codex와 화면을 보며 수정
STEP 15 테스트 및 Git Commit
```

한 단계가 정상인지 확인한 다음 다음 단계로 넘어간다.

---

# 4. STEP 1 — BROS 작업 폴더 만들기

## 권장 위치

Windows에서 다음 위치를 추천한다.

```
D:\project\bros
```

`바탕 화면`, `문서`, `OneDrive` 아래보다는 별도의 개발 폴더가 좋다.

특히 OneDrive 동기화 폴더는 대량의 `node_modules`나 Docker/개발파일과 충돌하거나 불필요한 동기화를 만들 수 있으므로 피하는 편이 좋다.

## 만드는 방법

Windows 탐색기에서:

```
C:\
└─ dev
   └─ bros
      └─ brand-resell-os
```

를 만든다.

또는 PowerShell에서:

```
New-Item -ItemType Directory -Force D:\project\bros
Set-Location D:\project\bros
```

현재 위치 확인:

```
Get-Location
```

정상 예:

```
Path
----
D:\project\bros
```

---

# 5. STEP 2 — 이미 설치된 Docker 확인

Docker Desktop을 다시 설치할 필요는 없다.

먼저 Windows 시작 메뉴에서 **Docker Desktop**을 실행한다.

Docker Desktop이 완전히 실행된 뒤 PowerShell을 연다.

## 5.1 Docker 버전 확인

```
docker --version
```

정상이면 다음과 비슷한 결과가 나온다.

```
Docker version xx.x.x, build xxxxx
```

## 5.2 Docker Engine 확인

```
docker info
```

많은 정보가 출력되면 정상이다.

다음과 비슷한 오류가 나오면 Docker Desktop이 아직 실행되지 않은 것이다.

```
Cannot connect to the Docker daemon
```

이 경우 Docker Desktop을 열고 실행 완료 후 다시 시도한다.

## 5.3 Docker Compose 확인

```
docker compose version
```

정상 예:

```
Docker Compose version v2.x.x
```

BROS에서는 구형 명령:

```
docker-compose
```

보다 다음 명령을 기준으로 사용한다.

```
docker compose
```

## 5.4 WSL 확인

```
wsl --version
```

그리고:

```
wsl -l -v
```

Docker Desktop이 WSL 2 Backend로 정상 동작하고 있다면 특별한 문제가 없는 한 설정을 변경할 필요는 없다.

Docker Desktop의:

```
Settings
→ General
→ Use WSL 2 based engine
```

이 활성 상태인지 확인한다.

이미 Docker가 정상 작동한다면 이 설정을 억지로 변경하지 않는다.

## Docker 검증 체크

```
[ ] Docker Desktop 실행
[ ] docker --version 성공
[ ] docker info 성공
[ ] docker compose version 성공
```

네 가지가 모두 되면 Docker 준비 완료다.

---

# 6. STEP 3 — Git 확인

PowerShell에서:

```
git --version
```

정상 예:

```
git version 2.x.x.windows.x
```

## Git이 없다면

Windows에서는 공식 Git for Windows를 설치한다.

또는 Windows Package Manager가 있다면:

```
winget install --id Git.Git -e --source winget
```

설치 후 PowerShell을 완전히 닫았다가 다시 연다.

그리고 다시:

```
git --version
```

## 최초 사용자 설정

아직 Git 이름과 이메일을 설정하지 않았다면:

```
git config --global user.name "YOUR_NAME"
git config --global user.email "YOUR_EMAIL"
```

예:

```
git config --global user.name "BROS"
git config --global user.email "your-email@example.com"
```

실제로 사용하는 이메일을 넣는다.

확인:

```
git config --global user.name
git config --global user.email
```

---

# 7. STEP 4 — Node.js 24 LTS 확인

BROS Architecture Baseline은 Node.js 24 LTS다.

PowerShell:

```
node -v
```

정상 목표:

```
v24.x.x
```

BROS는 **Node.js 24 계열**을 기준으로 한다. 정확한 설치 패치는 실제 node -v로 확인하고, 패키지 호환성과 함께 기록한다. 이 가이드는 특정 패치가 최신이라고 보장하지 않는다.

npm도 확인한다.

```
npm -v
```

## Node가 없거나 24가 아니라면

초보자에게는 Node.js 공식 Windows Installer를 이용하는 방식을 권장한다.

공식 사이트에서 **24 LTS**를 선택해 설치한다.

설치 후 열려 있던 PowerShell을 닫고 새로 연다.

다시:

```
node -v
npm -v
```

확인한다.

### 중요한 원칙

다음처럼 최신 Current 버전을 무조건 설치하지 않는다.

```
Node 26 Current
```

BROS는 설계 기준대로:

```
Node 24 LTS
```

를 사용한다.

---

# 8. STEP 5 — pnpm 확인

PowerShell:

```
pnpm -v
```

버전이 나오면 이미 준비된 것이다.

## pnpm이 없다면

Node가 정상 설치된 상태에서 다음처럼 설치할 수 있다.

```
npm install -g pnpm
```

설치 후:

```
pnpm -v
```

확인한다.

향후 BROS Repository에 `packageManager` 버전이 고정되면 그 Repository의 버전 규칙을 우선한다.

---

# 9. STEP 6 — 필수 환경 한 번에 점검

아래 명령을 하나씩 실행한다.

```
git --version
node -v
npm -v
pnpm -v
docker --version
docker compose version
```

최소 목표:

```
Git          정상
Node         v24.x.x
npm          정상
pnpm         정상
Docker       정상
Compose      정상
```

누락 도구에 의존하는 작업만 보류한다. Docker가 준비되지 않아도 문서·workspace·TypeScript·mock 테스트 등 독립 작업은 진행할 수 있다.

---

# 10. STEP 7 — ChatGPT Desktop과 Codex 준비

BROS 실제 개발은 **ChatGPT Desktop의 Codex + 로컬 Repository**를 기본으로 한다.

ChatGPT Desktop 앱을 실행한다.

좌측 상단 또는 제품 선택 메뉴에서:

```
Codex
```

를 선택한다.

Codex는 BROS의 실제 개발자 역할을 담당한다.

```
코드
Docker
DB
테스트
localhost
Git
```

를 주로 맡긴다.

반면:

```
BROS Project = 설계 / 요구사항 / 의사결정
Work         = 전체 검수 / 조사 / 문서 / 운영 분석
Codex Cloud  = 필요한 큰 독립 작업 위임
```

으로 역할을 분리한다.

---

# 11. STEP 8 — BROS 기준 문서를 로컬 Repository에 넣기

현재 기준 문서가 doc/에 있으면 그 위치를 유지한다. 아래 docs/baseline/ 구성은 과거 예시이며 현재 프로젝트에는 실행하지 않는다. 기준 문서의 수정본을 두 곳에 두지 않는다.

```
Set-Location D:\project\bros

New-Item -ItemType Directory -Force docs\baseline
New-Item -ItemType Directory -Force docs
```

최종적으로 아래 문서를 넣는다.

```
D:\project\bros
│
└─ docs
   └─ baseline
      ├─ brand_resell_os_design_v0.1.md
      ├─ BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md
      ├─ BROS_개발_운영_구성_지침_v0.1.md
      ├─ BROS_Codex_Local_마스터_프롬프트_v0.1.md
      └─ BROS_로컬_개발환경_구축_가이드_v0.1.md
```

최소한 아래 두 개는 반드시 있어야 실제 구현을 시작한다.

```
brand_resell_os_design_v0.1.md
BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md
```

두 파일은 BROS 개발의 Architecture / WBS Source of Truth다.

---

# 12. STEP 9 — Git Repository 초기화

PowerShell:

```
Set-Location D:\project\bros
git init
```

상태 확인:

```
git status
```

## 기본 `.gitignore` 생성

초기 개발 때 최소한 다음은 Git에 올라가지 않아야 한다.

```
node_modules/
.env
.env.*
!.env.example
dist/
coverage/
tmp/
temp/
*.log
.DS_Store
Thumbs.db
.playwright/
test-results/
playwright-report/
/data/
/storage/
```

`data`와 `storage`는 저장소 루트의 런타임 데이터 디렉터리만 제외한다. `packages/storage` 같은 소스 패키지가 제외되지 않도록 반드시 루트 기준(`/`) 패턴을 사용한다.

특히 절대 Commit하지 않는다.

```
.env
Password
API Key
R2 Credential
Browser Cookie
Access Token
2FA 정보
```

## 첫 Snapshot

기준 문서가 들어간 상태에서:

```
git add .
git status
```

`git status`에서 올라갈 파일을 확인한다.

문제가 없다면:

```
git commit -m "docs: initialize BROS project baseline"
```

이 Commit은 매우 중요하다.

Codex가 개발하기 전 **깨끗한 출발점**이 된다.

---

# 13. GitHub는 지금 당장 필수인가?

아니다.

처음에는 Local Git만 있어도 개발할 수 있다.

하지만 PC 고장이나 파일 손실을 대비해 비교적 이른 시점에 Private GitHub Repository 같은 원격 Backup을 만드는 것을 권장한다.

초보 단계에서는:

```
1. Local Git 먼저
2. Phase 1이 안정화된 후 Private Remote 연결
```

순서로 진행해도 된다.

중요한 것은 GitHub 자체가 아니라 **Git Snapshot이 존재하는 것**이다.

---

# 14. STEP 10 — Codex에서 BROS 폴더 열기

ChatGPT Desktop → Codex에서 로컬 폴더를 연다.

선택할 폴더:

```
D:\project\bros
```

하위의 `apps`나 `docs`만 열지 말고 **Repository Root 전체**를 연다.

Codex가 다음을 볼 수 있어야 한다.

```
docs/
.git/
package.json        ← 개발이 시작되면 생성
docker-compose.yml  ← 개발이 시작되면 생성
apps/
packages/
```

---

# 15. STEP 11 — Codex 첫 실행

`BROS_Codex_Local_마스터_프롬프트_v0.1.md`의 MASTER PROMPT를 Codex에 전달한다.

처음부터 모든 명령을 직접 입력할 필요는 없다.

Codex에게 다음 원칙으로 맡긴다.

```
환경 진단
→ 기준 문서 확인
→ Git 보호
→ 현재 Repository 파악
→ WBS P1-01부터 구현
→ 테스트
→ 실행
→ localhost 확인
→ Acceptance Criteria 확인
```

Codex에게 특히 다음을 지키게 한다.

```
git reset --hard 금지
git clean -fd 금지
force push 금지
Secret Commit 금지
기존 사용자 파일 덮어쓰기 금지
설계 임의 변경 금지
```

---

# 16. Codex 첫 실행에서 기대하는 행동

Codex는 먼저 다음을 검사해야 한다.

```
git status
node -v
pnpm -v
docker --version
docker compose version
```

그리고:

```
docs/baseline/brand_resell_os_design_v0.1.md
docs/baseline/BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md
```

를 읽는다.

그 다음 Repository를 만들기 시작한다.

예상 구조:

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
├─ docs/
│  ├─ baseline/
│  ├─ IMPLEMENTATION_STATUS.md
│  ├─ BLOCKERS.md
│  ├─ DECISIONS.md
│  ├─ TEST_REPORT.md
│  └─ RUNBOOK.md
│
├─ infra/
├─ scripts/
├─ docker-compose.yml
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ .env.example
└─ README.md
```

---

# 17. STEP 12 — PostgreSQL은 Docker로 실행

BROS에서는 PostgreSQL 18을 Windows에 직접 설치하지 않는 것을 권장한다.

Docker Compose로 실행한다.

Codex가 `docker-compose.yml`을 만든 후 일반적으로 다음과 같이 실행한다.

```
docker compose up -d
```

상태 확인:

```
docker compose ps
```

정상 예는 PostgreSQL Service가:

```
Up
healthy
```

또는 이에 준하는 실행 상태로 나오는 것이다.

로그 확인:

```
docker compose logs postgres
```

서비스 이름은 실제 `docker-compose.yml`에 따라 다를 수 있으므로 Codex가 만든 이름을 따른다.

---

# 18. Docker에서 절대 무작정 실행하지 말 명령

초보 단계에서는 아래 명령을 의미를 모르고 실행하지 않는다.

```
docker system prune -a
docker volume prune
docker compose down -v
```

특히:

```
-v
```

옵션은 PostgreSQL 데이터 Volume까지 삭제할 수 있다.

개발 DB를 초기화하려는 명확한 목적이 없다면 사용하지 않는다.

Codex에게도 데이터 삭제 명령은 먼저 영향을 설명하게 한다.

---

# 19. STEP 13 — BROS 서비스 실행

Phase 1이 만들어지면 일반적으로 다음 구성요소가 있다.

```
PostgreSQL
API
Worker
Admin
```

Repository Script가 만들어진 이후에는 반드시 `package.json`의 실제 Script를 기준으로 실행한다.

예를 들어 Codex가 아래 Script를 만들었다면:

```
pnpm install
pnpm db:migrate
pnpm dev
```

형태로 실행할 수 있다.

하지만 이 명령 이름을 가이드가 강제로 정하지 않는다.

**실제 Repository에 만들어진 Script가 Source of Truth다.**

Codex에게:

```
현재 repository에서 개발환경을 실행하는 정확한 명령을 알려주고 직접 실행해.
```

라고 요청하면 된다.

---

# 20. API 정상 여부 확인

Phase 1에서는 설계상 다음이 중요하다.

```
GET /health
GET /ready
```

예를 들어 API가 `3000` 포트를 사용한다면 브라우저에서:

```
http://localhost:3000/health
```

에 접속한다.

정상이라면 HTTP 200이 나와야 한다.

PowerShell에서도 확인할 수 있다.

```
Invoke-WebRequest http://localhost:3000/health
```

실제 Port는 Repository 설정을 따른다.

---

# 21. STEP 14 — Admin localhost 화면 열기

React/Vite Admin이 실행되면 터미널에 다음과 비슷한 주소가 나온다.

```
http://localhost:5173
```

이 주소는 예시다.

실제 출력된 주소를 사용한다.

## 일반 브라우저에서 먼저 확인

Chrome/Edge에서:

```
http://localhost:5173
```

을 연다.

Dashboard가 표시되는지 확인한다.

---

# 22. Codex 내장 브라우저로 화면 확인

ChatGPT Desktop의 Codex에서 내장 브라우저를 연 수 있다.

Windows 기본 Shortcut:

```
Ctrl + Shift + B
```

내장 브라우저에서 실제 Admin 주소를 연다.

예:

```
http://localhost:5173
```

이제 Codex와 같은 화면을 보며 작업할 수 있다.

예를 들어 다음처럼 지시한다.

```
현재 localhost Admin 화면을 확인해.
Console 오류와 Network 오류를 먼저 검사해.
Dashboard UI가 깨진 부분이 있으면 원인을 찾고 수정한 뒤 다시 화면을 확인해.
```

---

# 23. 화면 수정은 이렇게 지시하면 된다

코드를 직접 설명할 필요가 없다.

예:

```
Dashboard 카드가 너무 붙어 있어.
현재 화면을 보고 간격을 자연스럽게 수정해.
모바일과 데스크톱 모두 확인해.
```

또는:

```
Thumbnail Review에서 원본 이미지와 생성 이미지를 한 화면에서 비교하기 어렵다.
두 이미지를 크게 나란히 비교할 수 있게 수정해.
처리 경로와 QA 결과도 같은 화면에서 확인되게 해.
```

또는:

```
현재 화면에서 버튼을 눌러 실제 동작을 테스트해.
브라우저 Console과 Network도 확인하고 오류가 있으면 수정해.
```

핵심은:

```
수정
→ 실제 페이지 Reload
→ Console 확인
→ Network 확인
→ 다시 화면 확인
```

까지 시키는 것이다.

---

# 24. “화면이 보인다”와 “기능이 된다”는 다르다

Admin 페이지가 예쁘게 보인다고 Task를 PASS 처리하면 안 된다.

예:

```
Import 버튼 표시
```

만으로는 Import 기능 완료가 아니다.

최소한:

```
버튼 클릭
→ API 요청
→ DB 반영
→ Worker 처리
→ 결과 상태 표시
```

까지 연결되어야 Acceptance Criteria를 만족할 수 있다.

Codex에게 항상:

```
화면만 보지 말고 실제 API/DB/Worker까지 연결됐는지 검증해.
```

라고 요구한다.

---

# 25. STEP 15 — 테스트

개발 중 자주 실행해야 한다.

Repository에 최종적으로 다음 계열 Script가 있어야 한다.

```
lint
typecheck
test
build
```

실제 Script 이름은 Repository를 따른다.

Codex에게:

```
lint, typecheck, unit test, integration test, build를 실행하고
실패한 것이 있으면 원인을 수정한 뒤 다시 전부 실행해.
```

라고 한다.

PASS 결과를 실제 실행 없이 주장하면 안 된다.

---

# 26. Git Commit 전 확인

작업이 끝났다고 바로 Commit하지 않는다.

먼저:

```
git status
git diff
```

를 확인한다.

Codex에게도:

```
Commit 전에 git status와 git diff를 검토해.
Secret, 임시파일, 로그, 불필요한 generated file이 포함되지 않았는지 확인해.
```

라고 요청한다.

문제가 없다면 예:

```
git add .
git commit -m "feat(P1-01): initialize BROS workspace"
```

WBS Task ID를 Commit Message에 넣는 방식을 권장한다.

---

# 27. 초보자가 가장 많이 겪는 문제

## 문제 1 — `node` 명령을 찾을 수 없음

증상:

```
'node' is not recognized...
```

조치:

1. Node.js 24 LTS 설치 여부 확인

2. PowerShell 완전히 종료

3. 새 PowerShell 실행

4. `node -v`

---

## 문제 2 — `pnpm` 명령을 찾을 수 없음

조치:

```
npm install -g pnpm
```

새 PowerShell에서:

```
pnpm -v
```

---

## 문제 3 — Docker 명령은 있는데 Engine 연결 실패

증상:

```
Cannot connect to Docker daemon
```

조치:

1. Docker Desktop 실행

2. Docker가 Running 상태인지 확인

3. 다시 `docker info`

---

## 문제 4 — Port already in use

예:

```
Port 5173 is already in use
```

이미 다른 프로그램이 해당 Port를 쓰고 있다는 뜻이다.

임의로 프로세스를 죽이지 말고 Codex에게:

```
현재 포트 충돌 원인을 확인하고
BROS 관련 프로세스인지 검증한 뒤 안전하게 해결해.
다른 사용자 프로그램은 종료하지 마.
```

라고 한다.

---

## 문제 5 — DB 접속 실패

먼저:

```
docker compose ps
```

그 다음:

```
docker compose logs
```

Codex에게:

```
PostgreSQL container 상태, healthcheck, port, DATABASE_URL을 비교해서 원인을 찾아.
Secret 값 자체는 출력하지 마.
```

라고 요청한다.

---

## 문제 6 — 화면은 뜨는데 API 오류

Codex 내장 브라우저에서:

```
Console
Network
```

를 함께 확인시킨다.

지시:

```
현재 페이지에서 실패한 Network 요청을 찾고
API 로그와 비교해서 root cause를 수정해.
```

---

## 문제 7 — 개발하다 코드가 망가짐

가장 먼저:

```
git status
git diff
```

를 본다.

초보자가 바로 다음을 실행해서는 안 된다.

```
git reset --hard
git clean -fd
```

Codex에게:

```
현재 변경을 삭제하지 말고 git diff를 분석해서
어느 변경이 문제인지 먼저 설명해.
```

라고 한다.

---

# 28. PC를 재부팅한 다음 개발 재개 순서

매일 개발할 때 아래 정도만 기억하면 된다.

```
1. Docker Desktop 실행
2. ChatGPT Desktop 실행
3. Codex 실행
4. D:\project\bros 열기
5. Terminal 열기
6. git status
7. Docker/DB 상태 확인
8. 개발 서비스 실행
9. localhost 화면 확인
10. Codex에게 다음 WBS Task 진행 요청
```

Codex에 넣을 시작 문구 예:

```
BROS 개발을 이어서 진행해.
먼저 git status와 현재 실행 환경을 안전하게 확인하고,
IMPLEMENTATION_STATUS.md와 WBS를 비교해서
마지막 PASS 다음의 실행 가능한 Task부터 진행해.
기존 사용자 변경은 덮어쓰지 마.
```

---

# 29. 개발을 끝내기 전 종료 루틴

하루 작업이 끝났을 때:

```
1. 테스트 결과 확인
2. IMPLEMENTATION_STATUS 갱신
3. git status
4. git diff
5. Secret 유입 여부 확인
6. Commit
7. 필요한 경우 개발 서버 종료
```

Docker DB는 계속 켜둬도 되지만 PC 자원을 아끼려면:

```
docker compose stop
```

을 사용할 수 있다.

다시 시작:

```
docker compose start
```

구성 변경 후 전체 재생성이 필요한 경우에는:

```
docker compose up -d
```

를 사용한다.

---

# 30. BROS에서 하지 않을 것

초보자라도 다음 원칙만 지키면 큰 사고를 줄일 수 있다.

```
[금지] 운영 DB를 로컬 테스트 대상으로 사용
[금지] .env Commit
[금지] API Key를 코드에 직접 입력
[금지] Docker Volume을 이유 없이 삭제
[금지] git reset --hard를 의미 모르고 실행
[금지] git clean -fd를 의미 모르고 실행
[금지] force push를 습관적으로 사용
[금지] WBS와 무관한 기술을 Codex가 마음대로 추가하게 둠
[금지] 테스트 없이 PASS 처리
[금지] localhost 화면을 확인하지 않고 UI 완료 처리
```

---

# 31. 최종 개발환경 체크리스트

## PC

```
[ ] Windows 11 정상
[ ] 충분한 디스크 여유 공간
```

## Docker

```
[ ] Docker Desktop 실행
[ ] docker --version
[ ] docker info
[ ] docker compose version
```

## 개발도구

```
[ ] git --version
[ ] node -v → v24.x.x
[ ] npm -v
[ ] pnpm -v
```

## Repository

```
[ ] D:\project\bros 존재
[ ] git init 완료
[ ] .gitignore 존재
[ ] 첫 baseline commit 존재
```

## 기준 문서

```
[ ] brand_resell_os_design_v0.1.md
[ ] BROS_브랜드_리셀_OS_MVP_개발_WBS_v0.1.md
[ ] BROS_개발_운영_구성_지침_v0.1.md
[ ] BROS_Codex_Local_마스터_프롬프트_v0.1.md
[ ] BROS_로컬_개발환경_구축_가이드_v0.1.md
```

## Codex

```
[ ] ChatGPT Desktop 실행
[ ] Codex 선택
[ ] Repository Root 열기
[ ] 기준 문서 접근 가능
[ ] MASTER PROMPT 전달
```

## Phase 1 완료 후

```
[ ] PostgreSQL Container 실행
[ ] Migration 성공
[ ] API 실행
[ ] /health 200
[ ] /ready 정상
[ ] Worker 실행
[ ] system.test 성공
[ ] React Admin 실행
[ ] localhost Admin 화면 확인
[ ] Console 치명 오류 없음
[ ] Network 치명 오류 없음
[ ] lint PASS
[ ] typecheck PASS
[ ] test PASS
[ ] build PASS
[ ] Git Commit
```

---

# 32. 현대표가 실제로 해야 할 최소 작업

개발자가 아닌 사용자가 매번 코드를 직접 만질 필요는 없다.

실제로는 아래 다섯 가지를 관리하면 된다.

```
① 기준 문서가 맞는지
② Codex가 어떤 WBS Task를 작업하는지
③ localhost 화면이 내가 원하는지
④ 테스트가 실제로 PASS했는지
⑤ Git Snapshot이 남았는지
```

나머지:

```
코드 작성
DB Migration
API 구현
Docker 명령
테스트 작성
버그 수정
```

은 Codex Local에 맡긴다.

---

# 33. 가장 추천하는 실제 운영 방식

```
아침/작업 시작
    ↓
Docker Desktop
    ↓
ChatGPT Desktop → Codex
    ↓
Repository Open
    ↓
git status
    ↓
Codex에게 WBS 다음 Task 진행
    ↓
코드 + 테스트
    ↓
localhost 직접 확인
    ↓
화면 수정 지시
    ↓
Acceptance Criteria 확인
    ↓
Git Commit
    ↓
Phase 단위로 Work 검수
```

---

# 34. 첫날에는 어디까지 하면 되는가

처음부터 BROS 전체를 만들려고 하지 않는다.

**첫날 목표는 Phase 1 개발을 시작할 수 있는 환경을 만드는 것**이면 충분하다.

최소 성공 기준:

```
Docker 정상
Git 정상
Node 24 정상
pnpm 정상
Repository 생성
기준 문서 배치
첫 Git Commit
Codex가 Repository 접근
Codex가 두 기준 문서를 읽음
P1-01 착수
```

여기까지 되면 개발환경 구축은 성공이다.

그 다음부터는 `BROS_Codex_Local_마스터_프롬프트_v0.1.md`에 따라 Codex가 WBS를 진행한다.

---

# 35. 한 장 요약

```
[현재 이미 있음]
Docker Desktop
      ↓
[확인]
docker info
docker compose version
      ↓
[준비]
Git
Node.js 24 LTS
pnpm
ChatGPT Desktop / Codex
      ↓
[폴더]
D:\project\bros
      ↓
[문서]
설계서 v0.1
WBS v0.1
개발 운영 지침
Codex Master Prompt
      ↓
[Git]
git init
첫 baseline commit
      ↓
[Codex]
Repository Root 열기
Master Prompt 실행
      ↓
[구현]
P1-01부터 WBS 진행
      ↓
[Runtime]
Docker PostgreSQL
Fastify API
Worker
React Admin
      ↓
[검수]
localhost
Console
Network
실제 기능
      ↓
[Test]
lint
typecheck
test
build
      ↓
[저장]
Git Commit
      ↓
[큰 단위 검수]
Work
```

---

# 36. 최종 원칙

BROS 로컬 개발환경에서 가장 중요한 것은 복잡한 개발 지식이 아니다.

다음 네 가지만 지킨다.

> 하나씩 확인하고 다음으로 간다.

> Codex가 바꾼 코드는 반드시 실제 실행과 테스트로 확인한다.

> 화면 기능은 localhost에서 직접 확인한다.

> 안정된 시점마다 Git Snapshot을 남긴다.

이 네 가지를 지키면 개발 경험이 많지 않아도 BROS MVP를 비교적 안전하게 단계별로 만들어갈 수 있다.


# v0.2 현재 환경과 시작 절차

현재 루트는 D:\project\bros이며 중첩 폴더를 만들지 않는다. 개발 실행 시 doc/의 5개 기준 문서와 구현 보완 명세를 함께 읽는다. 아래 기록은 2026-09-11 읽기 전용 점검 결과이며 재실행 때 다시 확인한다.

| 항목 | 확인 결과 |
| --- | --- |
| Git | 2.54.0.windows.1 설치, 현재 폴더는 Git 미초기화 |
| Node | 24.14.1 |
| pnpm | 11.19.0 |
| Docker CLI / Compose | 29.7.2 / 5.3.1 |
| Docker daemon | config.json 및 named pipe 접근 거부로 확인 불가. 엔진 중지/미설치로 단정 불가 |
| 앱 코드 | 문서만 존재, 앱 실행/DB/테스트 미구현 |

Docker 접근 거부 시 사용자 터미널의 docker info 결과와 현재 실행 도구의 접근 권한을 구분한다. 엔진이 정상인 경우 불필요한 재설치나 전역 보안 설정 변경을 하지 않는다. 버전 manager/프로젝트 단위 도구를 우선하며 설치가 필요하면 영향 범위를 명시한다. pnpm은 실제 호환 검증 후 packageManager와 lockfile에 고정한다.

최초 구현 순서와 Phase 1 완료 조건은 WBS 및 보완 명세 6~7장을 따른다. 먼저 P1-01/02/03과 공통 Contract/Secret/Test 기반을 준비한다. 기존 가이드의 모든 명령은 예시이며 실제 package.json/Compose 서비스명을 확인한 후 실행한다.
