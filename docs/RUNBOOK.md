# BROS 운영 Runbook

## 개발 환경 시작

요구 버전:

- Node.js 24.x
- pnpm 11.x

저장소 루트에서 실행한다.

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`check`는 lint, typecheck, format check, build 순서로 실행한다. `typecheck`는 clean checkout에서도 동작하도록 공통 패키지 7개를 먼저 빌드한다.

개별 명령이 필요하면 다음을 사용한다.

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

## 환경 설정

로컬 실행 전 `.env.example`을 참고해 추적되지 않는 `.env`를 만든다. 최소 필수값은 `DATABASE_URL`이다.

- `APP_ENV=development` 또는 `test`: API host/port, Worker concurrency, local storage 경로에 개발 기본값을 적용한다.
- `APP_ENV=production`: `API_HOST`, `API_PORT`, `WORKER_CONCURRENCY`, `STORAGE_DRIVER`를 명시해야 한다. Local storage를 선택하면 `STORAGE_LOCAL_ROOT`도 필수다.
- 설정 오류는 환경변수 이름과 규칙만 출력하며 입력값은 출력하지 않는다.
- 업무 코드는 환경변수를 직접 읽지 않고 `@bros/core`의 typed config를 받는다.

## 공통 API 계약

- 외부 리소스 ID는 UUIDv7 `publicId`만 사용한다. 내부 BIGINT ID를 요청·응답에 넣지 않는다.
- 비동기 작업 접수 응답은 HTTP 202와 `{publicId,status,statusUrl}`을 사용하며 접수 시 상태는 `QUEUED`다.
- 오류 본문은 `{error:{code,message,requestId,details?}}`를 사용한다.
- 오류 `details`에는 계약이 허용한 검증 issue, 버전 숫자, 재시도 초만 넣는다.
- 목록 limit 기본값은 50, 최대값은 100이다.

운영 절차는 해당 WBS Task가 구현되고 검증될 때 추가한다.
