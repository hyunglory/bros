# P6-02 Production Secret / Browser Profile Hardening

기준일: 2026-09-15. 결정: DEC-20260915-005. 운영 대상은 Linux다. Windows 개발환경의 chmod를 Linux 권한 검증으로 인정하지 않는다.

## 주입 및 접근 경계

운영 API/Worker/migration은 secret 값 대신 절대 `_FILE` 경로를 받는다. DB URL과 API proxy token은 시작 시 읽고 `process.env`에 다시 넣지 않는다. R2/Provider/browser는 `createSecretProvider` → `FileSecretProvider`에서 조회한다. 개발·테스트의 기존 환경변수 입력은 유지하되 production의 평문 secret 환경변수, file/env 중복, DEBUG/PWDEBUG/NODE_OPTIONS는 거부한다.

| 소비자 | 읽을 수 있는 secret | 운영 권한 |
| --- | --- | --- |
| PostgreSQL 초기화 | postgres_password | root 소유 0400, 공식 entrypoint만 사용 |
| migration | database_url | UID 1000, 0400 |
| API | database_url, proxy_token, r2_access_key, r2_secret_key | UID 1000, 개별 read-only mount |
| Worker | database_url, r2_access_key, r2_secret_key | UID 1000, API proxy token 없음 |
| Caddy | caddy_auth, caddy_proxy | UID 1000, DB/R2 secret 없음 |
| staging identity probe | proxy_token | 테스트 경계 전용, 개별 read-only mount |

secret 파일은 regular file, 단일 hardlink, 최대 64 KiB, 소유자 전용 권한이어야 한다. symlink 및 비신뢰/쓰기 가능한 상위 경로, NUL/빈 값, 과도한 권한을 거부한다. reader는 상세 경로나 내용을 오류에 포함하지 않는다. `/tmp`의 root-owned sticky ancestor는 테스트 임시 디렉터리를 위해 허용하지만 secret의 바로 위 디렉터리로는 허용하지 않는다.

Compose의 file secret은 host bind mount다. YAML의 `uid/gid/mode`로 host 파일 권한을 교정한다고 가정하지 않는다. [Docker 공식 설명](https://docs.docker.com/compose/how-tos/use-secrets/). 프로필/secret은 저장소·build context 밖에 둔다. 이 구성은 **암호화 저장소나 memory-only secret store가 아니다**. root와 Docker daemon 관리자는 접근할 수 있고, PostgreSQL 공식 entrypoint는 파일 값을 내부 프로세스 환경으로 가져올 수 있다. host 디스크 암호화·접근 통제와 secret manager를 별도로 적용한다.

## 신규 secret generation 준비

Linux에서 secret manager가 JSON을 stdin으로 공급하도록 구성한다. 값을 터미널 argument, shell history, `.env`, Git, 출력에 쓰지 않는다. 준비 도구는 root로 실행하며 기존 generation을 덮어쓰지 않는다. 실패한 신규 generation은 사용하지 말고 관리자만 접근 가능한 상태에서 원인을 확인한다.

```sh
# 실제 secret manager의 stdout을 다음 명령의 stdin으로 연결한다.
# /etc/bros와 /etc/bros/secrets는 root:root 0700으로 미리 준비한다.
node scripts/provision-production-secrets.mjs /etc/bros/secrets/generation-001
```

stdin JSON 계약(아래는 필드 설명이며 실제 secret 예시가 아니다):

- `database`: `user`, `name`(소문자 식별자), `password`
- `r2`: `accessKeyId`, `secretAccessKey`
- `proxyToken`: Caddy/API 공용 32~256자 영숫자·`_`·`-` 랜덤 값
- `admin`: `username`, `passwordHash`(Caddy bcrypt)
- 선택 `additionalSecrets`: 승인된 `provider.<key>.apiKey` 또는 `browser.profile.<key>.<field>` → 값

추가 secret은 이름 검증 후 파일만 생성한다. 해당 소비자에만 명시적 Compose secret mount와 대응 `BROS_SECRET_..._FILE`을 추가해야 한다. 디렉터리 전체를 API/Worker에 공유하지 않는다. 브라우저 로그인 상태는 DB/R2에 직렬화하지 않는다.

비밀이 아닌 배포 설정에는 `BROS_SECRETS_DIR=/etc/bros/secrets/generation-001`, `BROS_PROFILE_ROOT=/var/lib/bros/profiles`, public host/email, R2 endpoint/bucket, DB user/name만 둔다. `POSTGRES_USER/POSTGRES_DB`는 bundle의 user/name과 반드시 일치해야 한다. 기본값 `bros`를 사용할 경우 bundle도 `bros`로 준비한다.

프로필 root는 root-owned 안전한 상위 디렉터리 아래에 UID/GID 1000, 0700으로 별도 생성한다. Compose는 없는 host 디렉터리를 자동 생성하지 않는다. 기존 Caddy volume을 재사용할 때는 `/data`, `/config`의 UID 1000 접근 권한을 먼저 확인한다. 과거 autosave 파일에 token이 남아 있을 수 있으므로 값 출력 없이 정확한 경로를 검사하고, 서비스 종료 후 해당 파일만 제거·관련 token 교체한다. 인증서 volume 전체를 삭제하지 않는다.

## Browser / 로그 / artifact

- API/Worker 시작 시 umask 0077. API/Worker/migration은 read-only rootfs, no-new-privileges, cap_drop ALL, 임시 `/tmp` tmpfs를 사용한다.
- SessionManager는 `BROS_BROWSER_PROFILE_ROOT` 또는 명시적 절대 경로 아래의 검증된 profile key만 사용한다. production의 기존 root/profile은 UID 일치·0700이어야 하며 느슨한 권한을 자동 수리하며 계속하지 않는다. 상위 symlink를 거부하고 launch 실패는 stable code로 반환한다.
- Chromium은 PATH/HOME/locale/display/임시 경로 등 명시된 기본 변수만 받는다. DB/R2/Provider/browser secret, NODE_OPTIONS, DEBUG는 상속하지 않는다. 이는 브라우저 프로세스의 환경 격리이며 같은 UID 프로세스가 이미 mount된 파일에 접근하지 못하게 하는 별도 sandbox를 뜻하지 않는다.
- logger는 중첩 객체·배열의 credential/cookie/OTP/R2 key 및 문자열 인증 정보를 마스킹한다. 원시 인증 응답·HTML·임의 credential을 일반 message 필드에 전달하는 것은 금지다. 자동 마스킹이 모든 자유 텍스트의 불투명 secret을 탐지한다고 보장하지 않는다.
- artifact service는 기본적으로 screenshot/trace 저장을 거부한다. 인증 세션의 raw trace ZIP을 사후 정규식으로 마스킹하는 방식은 사용하지 않는다. 현재 고정 `about:blank` Demo 및 합성 fixture만 코드 내부 `capturePolicy: "synthetic-demo"`를 지정한다. HTTP/queue input에서 이 값을 전달하거나 실제 로그인 flow에서 재사용하지 않는다.
- Demo의 start/final 또는 failure/trace/result 계약과 기존 hold/cleanup 정책은 유지한다. 실제 인증 flow의 시각 증거가 필요하면 별도 검증된 DOM 마스킹/증거 정책을 설계해야 한다.
- Caddy는 `admin off`, `persist_config off`이고 token/hash를 read-only snippet에서 import한다. 설정을 읽는 admin endpoint와 자동 JSON 저장을 사용하지 않는다. 변경은 restart/recreate로 반영한다. [Caddy 공식 옵션](https://caddyserver.com/docs/caddyfile/options), [import](https://caddyserver.com/docs/caddyfile/directives/import).

## 백업 제외

백업 payload는 PostgreSQL logical dump 등 승인된 데이터만 allowlist로 구성한다. host/container rootfs, secret generation, 브라우저 profile/cookie/session, Caddy autosave, 임시 trace, 개인 키는 일반 업무 백업에 넣지 않는다. `ops/backup-excludes.txt`는 GNU tar packaging의 추가 제외 규칙이며, 임의 경로 전체를 백업해도 안전하다는 보장이 아니다. canonical secret/profile 경로는 각각 `/etc/bros/secrets`, `/var/lib/bros/profiles`로 분리한다. 백업 스크립트는 allowlist와 이 제외 규칙을 함께 적용해야 한다.

프로필 복구는 백업에서 cookie를 복원하지 않고 재로그인한다. TLS 인증서·secret manager 자체의 재해복구는 별도 암호화/접근통제 정책으로 취급한다. P6-06 자동 백업·암호화·복구 훈련은 이번 구현에 포함되지 않는다. 이번 검증은 합성 archive에서 제외 파일이 실제 누락되는지 확인한다.

## 교체 및 장애 절차

1. 기존 값을 출력하지 말고 새로운 전체 generation을 별도 경로에 준비한다. R2는 필요한 private bucket 권한만 사용하고, 검증용 토큰은 짧은 TTL을 유지한다. 준비만으로 기존 DB role password가 바뀌지는 않는다.
2. Worker 작업을 drain하고 Caddy(공개 staging은 identity probe 포함)를 먼저 중지한다. API/Worker를 중지해 기존 DB pool·인증 상태를 종료한다.
3. DB 비밀번호 교체가 포함되면 승인된 관리자 연결에서 role password를 안전한 경로로 변경한다. secret file 변경만으로 기존 PostgreSQL volume의 비밀번호가 변경된다고 가정하지 않는다. DB 접근 실패 시 기존 generation을 지우지 말고 관리자 복구 경로를 사용한다.
4. `BROS_SECRETS_DIR`를 신규 generation 경로로 변경한다. PostgreSQL/migration/API/Worker를 의존 순서에 맞춰 recreate한다. 파일 bind mount는 inode를 고정하므로 host 파일 rename 후 단순 process restart만으로 새 값이 전달된다고 가정하지 않는다.
5. API readiness 및 Worker ready를 확인한 뒤 Caddy/identity probe를 recreate한다. API namespace를 공유하는 서비스를 API와 동시에 restart하지 않는다.
6. 신규 인증 200, 이전 proxy token 거부, 신규 DB 연결, R2 put/get/authorized preview 및 대상 Provider smoke를 확인한다. runtime logger/metadata에 값이 없는지 노출 없이 검사한다. R2 client는 매 요청 파일을 조회하지만 교체 도중의 key-pair 혼합을 막기 위해 generation 단위로 함께 교체한다.
7. 검증 성공 뒤 이전 외부 token을 폐기한다. 보존 중인 이전 generation 파일은 rollback 정책에 따라 정확한 경로만 승인 후 폐기한다. token 폐기 뒤 옛 파일을 복원해도 인증이 복구되지는 않는다. 삭제·SSD 덮어쓰기가 forensic secure erase를 보장한다고 주장하지 않는다.

`scripts/verify-public-staging.mjs`도 file provider를 사용한다. 운영 모드 verifier는 `BROS_STAGING_ADMIN_PASSWORD_FILE`을 별도 read-only mount로 공급하며 API/Worker 상시 환경에는 관리자 평문 비밀번호를 넣지 않는다. 실제 private R2·Provider rotation smoke는 외부 권한이 필요한 별도 검증이다.

## 재현 가능한 로컬 검증

```sh
pnpm build
docker build --target worker -t bros-p602-worker -f ops/Dockerfile .
docker build --target edge -t bros-p602-edge -f ops/Dockerfile .
node scripts/verify-production-hardening.mjs
```

검증기는 무작위 테스트 credential과 고유 `bros-p602-*` container/network/volume만 사용한다. 실제 R2 요청·public tunnel·운영 profile/DB 변경은 하지 않는다. Linux 소유권을 유지하기 위해 Docker volume 안에 fixture를 생성하고 서비스별 subset mount를 사용한다. 최신 core/browser dist와 테스트를 read-only mount하므로 먼저 build가 필요하다. 종료 시 fixture container와 해당 anonymous volume, 전용 network/secret/profile volume을 제거한다. 테스트 이미지/build cache는 재사용을 위해 남긴다.

검증 내용: 두 generation의 파일 주입 및 DB/proxy/R2 provider 값 교체, migration/API/Worker/Caddy 인증, 이전 token 거부, Docker metadata/log/image history scan, Caddy autosave 부재, 다른 UID의 secret/profile 접근 거부, 느슨한 권한 거부, 실제 Chromium persistent cookie 재사용/만료, Linux 전용 unit, tar 제외, Browser/retention 대상 회귀. 실제 배포 호스트의 ACL·backup restore·R2 live rotation·native TLS는 별도 증거가 필요하다.
