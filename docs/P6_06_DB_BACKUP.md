# P6-06 Database Backup / Restore Runbook

## 운영 계약

- PostgreSQL logical backup은 매일 `03:41 UTC`에 실행한다. 마지막 성공이 24시간 이상 지난 경우 scheduler 시작 또는 재시도 시 즉시 실행한다.
- 암호화된 backup object와 manifest를 private ObjectStorage의 `database-backup/YYYY/MM/DD/` 아래에 저장한다.
- 보존은 UTC 기준 최근 7 daily, 4 ISO-weekly, 3 monthly generation의 합집합이다. 각 generation의 `.dump.enc`와 `.manifest.json`은 항상 쌍으로 보존·삭제한다. 26시간을 넘긴 불완전 pair는 정리한다.
- backup payload는 `pg_dump --format=custom --no-owner --no-privileges` 출력만 허용한다. host rootfs, production secret generation, Browser profile/cookie/session, Caddy state는 포함하지 않는다.
- payload는 업로드 전에 32-byte key를 사용한 AES-256-GCM으로 암호화한다. 인증된 header에는 format version, backup ID, 생성 시각, 비밀이 아닌 key ID만 둔다. 암호화 객체의 SHA-256을 업로드 후 다시 읽어 검증한 다음 manifest를 게시한다.
- 목표는 초기 `RPO 24h`, `RTO 4h`다. 마지막 성공이 26시간을 초과하거나 마지막 실행이 실패하면 healthcheck가 실패한다. P6-03 알림 수신기가 이 상태를 실제 notification으로 연결한다.

## Secret 준비와 배포

`scripts/provision-production-secrets.mjs`에 stdin으로 전달하는 secret-manager bundle에는 `backupEncryptionKey` 64자리 hex 문자열을 포함한다. 생성 파일은 `backup_encryption_key`이며 UID 1000, mode `0400`이다. 키를 잃으면 기존 backup을 복호화할 수 없으므로 DB와 다른 보안 저장소에 escrow한다. 키 교체 시 이전 generation의 보존 기간이 끝날 때까지 이전 키 generation을 유지한다.

production/public-staging Compose의 `backup` 서비스만 다음 secret을 읽는다.

- `database_url`
- `r2_access_key`, `r2_secret_key`
- `backup_encryption_key`

Browser profile volume과 proxy/admin secret은 backup 서비스에 마운트하지 않는다. 배포 후에는 다음으로 최초 실행과 상태를 확인한다.

```sh
docker compose -f compose.production.yml up -d backup
docker compose -f compose.production.yml exec backup node scripts/check-database-backup-health.mjs
```

수동 one-shot은 같은 service 경계에서 실행한다.

```sh
docker compose -f compose.production.yml run --rm backup node scripts/database-backup-once.mjs
```

성공 로그는 `DATABASE_BACKUP_COMPLETED`, 실패 로그는 `DATABASE_BACKUP_FAILED`라는 안정된 code만 사용한다. DB URL, 암호화 키, R2 credential은 환경변수 값·명령행·로그에 넣지 않는다.

## 복구 훈련

복구는 원본 DB에 직접 수행하지 않는다. 빈 disposable DB를 `bros_restore_` prefix로 생성하고, 그 URL을 UID 1000/mode `0400` 파일로 준비한다. 검증할 manifest key는 비밀이 아니지만 private bucket inventory에서 승인된 정확한 key를 선택한다.

```sh
docker compose -f compose.production.yml run --rm \
  -e RESTORE_CONFIRM_DISPOSABLE=YES \
  -e RESTORE_DATABASE_URL_FILE=/run/secrets/restore_database_url \
  -e BACKUP_MANIFEST_KEY=database-backup/YYYY/MM/DD/<generation>.manifest.json \
  -v /etc/bros/restore/restore_database_url:/run/secrets/restore_database_url:ro \
  backup node scripts/database-restore-drill.mjs
```

복구 도구는 manifest/object pair, object SHA-256, AES-GCM 인증 tag, backup ID/생성 시각, 복호화 plaintext SHA-256을 모두 검증하고 `pg_restore --exit-on-error`를 사용한다. 완료 후 source/restore의 핵심 row count와 업무 샘플 hash를 비교하고 소요 시간이 4시간 이내인지 기록한다. 검증 DB와 임시 credential file은 훈련 종료 후 별도 승인된 절차로 제거한다.

## 장애 대응

1. `check-database-backup-health.mjs` 실패와 `status.json`의 `FAILURE` 또는 26시간 초과를 확인한다.
2. PostgreSQL readiness, database URL secret generation, R2 endpoint/bucket credential, encryption-key file owner/mode, ObjectStorage quota를 순서대로 확인한다.
3. 원인을 수정한 뒤 one-shot backup을 실행하고 healthcheck가 성공하는지 확인한다.
4. 가장 최근의 complete pair로 disposable restore drill을 수행한다. object만 있거나 manifest만 있는 generation은 사용하지 않는다.
5. backup key가 의심되면 즉시 새 key generation으로 교체하되, 침해 범위 판정 전 기존 backup/key를 임의 삭제하지 않는다.

## 검증

로컬 disposable Linux 검증은 synthetic credential만 사용한다.

```sh
pnpm run verify:db-backup
```

이 검증은 PostgreSQL migration/seed, custom dump, AES-256-GCM object, manifest pair, 빈 DB restore와 row 대조, wrong key 거부, wrong DB credential 실패 상태, 26시간 stale health 실패, 임시 Docker 자원 정리를 확인한다. Local ObjectStorage volume은 off-server adapter 계약의 disposable 대역이며 실제 private R2/운영 host scheduler 증거를 대신하지 않는다.
