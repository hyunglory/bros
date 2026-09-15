# P6-03 Backup Failure Alert Receiver

## 범위와 상태

이 문서는 P6-03 전체 운영 Dashboard 중 P6-06 DB backup health 신호를 외부 수신기로 전달하는 부분 구현만 다룬다. correlation ID가 있는 구조화 로그, queue lag/worker heartbeat 알림, provider metrics, Dashboard UI는 아직 이 범위에 포함하지 않는다.

`backup-alert`는 `status.json`을 읽어 다음 상태를 incident로 전환한다.

- 마지막 backup 실행이 `FAILURE`
- status 파일이 없거나 유효하지 않음
- 마지막 성공이 26시간을 초과함

dispatcher는 기본 60초마다 실행하며 `BACKUP_ALERT_POLL_MS`로 30초~15분 범위에서만 조정할 수 있다. 정상화 이후에는 같은 incident에 대해 recovery를 한 번만 보낸다.

## Secret 및 실행 경계

secret-manager bundle에는 `backupAlertWebhookUrl`을 넣는다. URL은 HTTPS여야 하며 hostname, userinfo 없음, fragment 없음의 endpoint만 허용한다. 생성 파일은 `backup_alert_webhook_url`이며 UID 1000, mode `0400`이다. production에서 `BACKUP_ALERT_WEBHOOK_URL` 평문 환경변수 또는 HTTP URL은 거부한다. 테스트 환경의 disposable internal receiver만 HTTP를 허용한다.

`backup-alert` service는 `backup_alert_webhook_url` 파일, backup status volume의 read-only mount, 자체 alert-state volume, egress network만 가진다. DB, R2 credential, backup encryption key, Browser profile, proxy/admin secret, host port는 제공하지 않는다. receiver URL과 응답 본문은 로그에 남기지 않는다.

## 전달 계약

POST body에는 `eventId`, `incidentId`, `kind`, `observedAt`, `reason`, `schemaVersion`, 제한된 backup status(`attemptedAt`, `lastSuccessAt`, `state`)만 포함한다. dump, database URL, R2 credential, encryption key, webhook URL이나 응답 본문은 포함하지 않는다. redirect는 거부하고 요청 timeout은 기본 5초(1~30초 범위)다.

incident state는 private volume에 atomic rename으로 먼저 기록한다. `2xx` 전달 뒤에는 `delivered: true`를 기록해 동일 장애의 반복 알림을 억제한다. 전달 실패는 같은 `incidentId`로 다음 poll에서 재시도한다. 전달되기 전 장애가 해소되면 recovery 알림을 만들지 않고 state만 정리한다. 전달된 incident가 해소됐지만 recovery 전달이 실패하면 recovery가 성공할 때까지 재시도한다.

## 운영 절차와 검증 한계

배포 전 secret generation을 만들고 backup과 receiver를 함께 기동한다.

```sh
docker compose -f compose.production.yml up -d backup backup-alert
```

수신 endpoint는 운영자가 소유·인증·보존 정책을 확인한 HTTPS endpoint여야 한다. 이 구현은 외부 receiver 계정, alert routing, on-call 수신, 실제 production network 전달을 생성하거나 검증하지 않는다.

```sh
pnpm run verify:db-backup
```

disposable Docker 검증은 실패 signal → 내부 HTTP receiver 1회 전달 → 중복 억제 → healthy status → recovery 1회 전달을 실제 HTTP로 확인한다. 이는 live external receiver 또는 private R2 backup run 증거를 대체하지 않는다.
