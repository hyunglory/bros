# P6-10 공개 Docker/HTTPS staging 검증

검증일: 2026-09-15. 결정: DEC-20260915-002.

후속 변경: DEC-20260915-005 / [P6-02 hardening](P6_02_HARDENING.md)이 이 문서의 환경변수 secret 주입·재실행 방법을 대체한다. 아래는 당시 E2E의 역사적 증거이며 평문 환경변수 명령을 현행 production/staging에서 재사용하면 안 된다. start.png 미해결 항목은 DEC-20260915-003/004에서 해결됐다. 현재 상태는 IMPLEMENTATION_STATUS를 따른다.

## 판정과 범위

공개 Quick Tunnel 경유 E2E 및 재시작 복구는 PASS다. P6-10 전체 상태는 `IMPLEMENTED_NOT_VALIDATED`로 유지한다. 실제 Linux VM의 custom domain DNS/80·443 방화벽/Caddy ACME 발급, P6-02 secret/profile hardening, P6-06 backup, remote CI가 남아 있다.

검증 경로는 외부 HTTPS → Cloudflare TLS edge → outbound QUIC tunnel → Caddy Basic Auth → loopback API → private R2 preview다. 별도의 검증 프로세스가 disposable PostgreSQL에 고유 demo job을 등록하고 공개 ID를 pg-boss에 enqueue하면 Linux Worker/Chromium이 실행하며 상태와 artifact key를 DB에 남긴다. Admin의 수동 Browser 실행 버튼/HTTP 접수 endpoint 검증을 뜻하지 않는다.

최종 검증 hostname은 `gregory-baking-freebsd-association.trycloudflare.com`이었다. 임시 터널을 종료했으므로 지속 서비스 주소가 아니다. Cloudflare 계정에 zone이 없어 custom domain을 구매하거나 영구 DNS를 변경하지 않았다.

## 실제 결과

| 검사 | 결과 |
| --- | --- |
| Public DNS와 신뢰 체인/hostname을 검사한 TLS 연결 | DNS 주소 2개, TLS 1.3 PASS |
| 비인증 `/`, `/health`, `/ready`, artifact preview | 401 PASS |
| 잘못된 Basic Auth 비밀번호 | 401 PASS |
| 인증된 Admin HTML과 `/ready` | 200, `{ "status": "ready" }` PASS |
| 위조 actor/proxy token, upstream Authorization | 인증 username/정확한 host token으로 교체, Authorization 제거 PASS |
| 인증은 유효하지만 다른 Origin의 POST | 403 PASS |
| 공개 hostname의 API 3000 직접 접근 | 차단 PASS; origin VM의 전체 포트 스캔을 대신하지 않음 |
| Docker API/PostgreSQL/Worker host port binding | 모두 없음 |
| 터널과 같은 edge network에서 API 3000/진단 3001/DB 5432 | 모두 연결 실패 PASS |
| PostgreSQL migration 및 Worker 실제 Chromium 실행 | durable run SUCCESS, current_step=completed PASS |
| final.png/trace.zip/result.json authorized R2 preview | HTTP 200, MIME/파일 signature/실제 SHA-256와 metadata 일치, 300초 TTL PASS |
| 같은 R2 object unsigned 요청 | 거부 PASS |
| API/Worker 재시작 및 Caddy 재연결 뒤 E2E 반복 | PASS |

`scripts/verify-public-staging.mjs`는 공개 URL, Basic Auth, DNS/TLS, durable run, R2 preview를 검사한다. 로컬 수신기의 raw secret이나 signed URL을 결과 로그에 넣지 않는다. R2가 생성한 bucket virtual-hosted 주소와 account path-style 주소만 허용한다.

## 발견·수정 사항

- Caddy의 `/ready`와 `/health`가 SPA fallback으로 가지 않도록 API upstream 경로에 포함했다.
- Worker와 production API/Caddy에 outbound egress network를 추가했다. PostgreSQL은 internal backend에만 붙는다.
- API의 네트워크 namespace를 공유하는 Caddy/identity probe를 API와 동시에 restart하면 사라진 namespace 때문에 OCI 오류가 발생했다. 먼저 dependent service를 stop하고 API/Worker restart 후 dependent service를 recreate하여 검증했다.
- pg-boss Timekeeper의 내부 `__pgboss__send-it` 큐와 P6-01의 선행 401 인증 거부를 기존 회귀 테스트가 반영하지 못했다. provider 내부 큐를 application queue 목록에서 제외하고 인증 기대값을 현재 계약으로 수정했다. 업무 구현을 완화하지 않았다.

## 자격 증명과 정리

이전 응답의 상태 출력에 노출된 `BROS P6-10 public staging 2026-09-15` 토큰을 삭제하고 목록 부재를 확인했다. 교체 토큰은 `BROS P6-10 public staging retry 2026-09-15`, `bros-p6-staging-artifacts` 단일 버킷의 Object Read & Write, 24시간 TTL이었다.

교체 자격 증명은 성공 화면의 두 S3 필드만 읽어 승인된 `127.0.0.1:47831` 일회성 수신기에 전달한 뒤 process environment로 Docker Compose에 주입했다. 교체 값은 대화 출력·저장소·명령행·`.env` 파일에 기록하지 않았다. 다만 Docker의 environment 방식은 컨테이너 설정 metadata에도 값을 보유하므로, 이를 OS/Docker 전체에서의 엄밀한 memory-only secret storage로 해석하면 안 된다. 검증 후 컨테이너/임시 DB·network와 교체 토큰을 삭제하고 수신 helper를 저장소에서 제거했다. production secret injection의 최종 hardening은 P6-02다.

자동 정리는 각 run의 final/trace/result 3개를 DELETE하고 `OBJECT_NOT_FOUND`로 확인했다. 최종 bucket listing에서 별도로 생성된 start.png 6개가 남아 있음을 발견했다. 모두 이번 검증 시각의 정확한 6개 UUIDv7 prefix로 확인하여 dashboard에서 삭제했고, 새로 고친 목록에서 `Your bucket is ready. Add files to get started.`와 Public Access Disabled를 확인했다. 삭제한 테스트 파일은 복구 불가이며 private bucket은 유지했다.

검증기에는 같은 run의 start.png도 정리하도록 추가했다. 이 마지막 정리 보완은 코드 검토/문법·lint 확인이며, 토큰 폐기 후 실제 R2 재실행은 하지 않았다. 운영 `artifact-retention.ts`도 현재 DB에 기록된 screenshot/trace/result만 열거하여 start.png를 놓친다. 운영 artifact inventory/hold/cleanup 보완은 후속 P6-05 작업이다.

## 회귀와 품질

- Node unit 103개 PASS; Admin Vitest 13개 PASS.
- Linux PostgreSQL 18.6/Chromium 환경에서 통합 25개 파일, 110개 테스트 PASS. 실제 POSIX SIGTERM/SIGKILL, queue redelivery, 1k import, DB 관계/schema 및 Browser evidence 포함.
- 일반 전체 실행기는 Vite assertion이 완료된 뒤 잔여 handle로 종료되지 않았다. Windows 실행은 해당 테스트 자식을 종료해 FAIL로 기록했고 Linux 최종 실행은 `node --test --test-force-exit --test-timeout=120000`을 사용했다. PASS는 assertion 결과이며 일반 `pnpm test:integration`의 종료 안정성 PASS를 의미하지 않는다. `scripts/run-tests.mjs`는 변경하지 않았다.
- Linux test container에는 최신 `tests/`, `ops/`, 두 compose 파일과 `docs/DB_MIGRATION_SPEC.md`를 read-only mount했다. 최초 Linux 재실행에서 명세 fixture 누락 ENOENT를 발견했으며 mount 추가 후 전체 110개 PASS했다.
- API/Worker/Admin workspace Docker build, 전체 ESLint, 변경 스크립트 문법 검증 PASS. 기존 Admin 11개 파일의 format drift와 remote CI는 별도 잔여 항목이다.

## 재실행

전용 staging bucket과 짧은 수명의 scoped token을 승인된 host secret injection으로 준비한다. `POSTGRES_PASSWORD`, `BROS_PUBLIC_ORIGIN`, `BROS_PROXY_AUTH_TOKEN`, `BROS_ADMIN_USERNAME`, `BROS_ADMIN_PASSWORD_HASH`, `STORAGE_R2_ENDPOINT`, `STORAGE_R2_BUCKET`, 두 `BROS_SECRET_STORAGE_R2_*` 값이 필요하다. verifier에는 `BROS_STAGING_ADMIN_PASSWORD`도 메모리로 주입한다. 값을 command argument에 쓰거나 `docker compose config` 전체 출력/`docker inspect` 환경값을 로그로 저장하지 않는다.

```powershell
docker compose -f compose.public-staging.yml config --quiet
docker compose -f compose.public-staging.yml build
docker compose -f compose.public-staging.yml up -d tunnel
# tunnel 로그의 새 HTTPS origin을 BROS_PUBLIC_ORIGIN에 반영한 뒤 시작한다.
docker compose -f compose.public-staging.yml up -d postgres migrate api identity-probe edge worker
docker compose -f compose.public-staging.yml run --rm --no-deps -e BROS_STAGING_ADMIN_PASSWORD -e BROS_PUBLIC_ORIGIN -e BROS_ADMIN_USERNAME api node scripts/verify-public-staging.mjs
```

API 재시작 시 network namespace dependent service를 다음 순서로 다시 만든다. 재시작 후 authenticated `/ready`와 위 verifier를 반복한다.

```powershell
docker compose -f compose.public-staging.yml stop edge identity-probe
docker compose -f compose.public-staging.yml restart api worker
docker compose -f compose.public-staging.yml up -d --no-deps --force-recreate edge identity-probe
```

검증 완료 후 해당 job의 artifact 삭제/부재를 확인하고 `bros-public-staging` 프로젝트만 `down --volumes --remove-orphans`로 정리한다. bucket 전체 삭제나 `bros-production` volume 삭제에는 이 절차를 사용하지 않는다. 토큰을 폐기하고 bucket listing의 잔여 object와 private 상태를 확인한다.

production에서는 `compose.production.yml`을 사용한다. API namespace에 published 80/443를 두지만 실제 listener는 Caddy이며 API는 127.0.0.1:3000이다. migration은 one-shot service이고 API/Worker 시작 때 자동 실행하지 않는다. `postgres_data`·Caddy certificate volume은 영속 보관한다. API 교체 시 `edge`를 먼저 stop한 뒤 API/Worker restart, `edge` recreate 순서를 적용한다. custom-domain VM 배포는 P6-02/P6-06 준비 및 실제 도메인/방화벽 검증 후 진행한다.
