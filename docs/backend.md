# 실제 서버

업무 규칙(버전 검사, 재고 예약, 실사 정산, 멱등 키)은 `packages/wms-server` 한 곳에만 있고, 저장 계층만 갈아 끼워 두 곳에서 돌립니다.

| | 데모 모드 | 실제 서버 모드 |
|---|---|---|
| 어디서 | 개발 서버, Vercel 미리보기, `pnpm preview` | 운영 사이트, `pnpm preview:api` |
| 업무 서버 | 브라우저 안 | Vercel 함수(`/api`, 싱가포르 `sin1`) |
| 저장 | IndexedDB(`sog-wms`) | Neon Postgres(같은 지역), 로컬은 PGlite |
| 쓰기 직렬화 | Web Locks(같은 브라우저의 탭 사이) | 트랜잭션 + `pg_advisory_xact_lock`(함수 인스턴스 사이) |
| 변경 알림 | BroadcastChannel | `events` 테이블 + `/api/changes` 폴링 |
| 접속 표시 | BroadcastChannel | `presence` 테이블 + `/api/presence` |
| 데이터를 보는 범위 | 이 브라우저만 | 모든 기기 |

## 모드 고르기

앱은 시작할 때 `/api/health`를 한 번 부릅니다(`WmsHost.ready()`).

- `{"mode":"remote"}`이면 요청을 서버로 보냅니다. 인터셉터가 `Authorization: Bearer <토큰>`과 `x-sog-origin`(탭)을 붙입니다.
- 404·503이면 브라우저 안 데모 서버를 씁니다. 미리보기 배포에는 DB를 연결하지 않아 503이 나오므로, 미리보기는 운영 데이터를 건드리지 않습니다.
- 그 밖의 오류(500 등)나 응답이 없으면(오프라인) 마지막으로 확인한 모드를 쓰고 덮어쓰지 않습니다. 창고 음영 지역에서 연 현장 앱이 데모 데이터로 바뀌어 가짜 수량을 실제처럼 보여 주는 일을 막기 위해서입니다.
- 운영 함수는 DB에 묻지 않고 상태 확인에 답합니다. DB가 잠시 응답하지 않아도 데모 모드로 바뀌지 않고, 장애는 각 요청의 오류로 드러납니다.

화면 코드는 어느 모드인지 모릅니다. 모두 `HttpClient`로 같은 API를 부르고, 같은 상태 코드(200·201·409·412·428)를 받습니다.

## 로그인과 권한

| | 내용 |
|---|---|
| 로그인 | `POST /api/auth/login` `{ userId, password }` → `{ token, expiresAt, user }`. 데모 계정의 비밀번호는 모두 `sog-demo` |
| 토큰 | `사용자ID.만료(초).서명`, HMAC-SHA256(Web Crypto). 7일 유효. 브라우저와 서버가 같은 코드로 서명·검증 |
| 서명 키 | 운영은 `AUTH_SECRET`(32자 이상, 없으면 500). 데모 모드는 브라우저 안이라 비밀일 수 없어 고정 값 |
| 보관 | 백오피스는 `sessionStorage`(탭마다 다른 관리자로 로그인해 동시 수정 시연), 현장 앱은 `localStorage`(앱을 닫거나 오프라인이어도 유지). 쿠키는 모든 탭이 함께 써서 탭별 계정이 안 되므로 헤더로 보냄 |
| 401 | 토큰이 없거나 만료·위조. 화면은 로그인 화면으로 보내고, 현장 앱 보낼함은 기록을 남겨 다시 로그인하면 보냄 |
| 403 | 역할이 맞지 않음. 품목 수정·재고 조정·입출고·실사 만들기/승인/취소·출고 지시·초기화는 관리자만, 실사 항목·피킹은 배정된 작업자만 |

로그인 화면과 `GET /api/reference`(계정 목록)만 토큰 없이 부를 수 있습니다. 변경 피드와 접속 표시도 토큰이 필요하고, 접속 표시의 사용자는 요청 값이 아니라 토큰에서 가져옵니다.

## 변경 이력

`mutate()`가 쓰기 직전에 품목·재고·실사 항목의 추적 필드를 이전 값과 비교해 `history` 저장소에 남깁니다(누가, 언제, 어느 버전, 무엇이 무엇으로). 버전 충돌(412)로 막힌 시도도 막힌 값과 함께 남깁니다. `GET /api/skus/:id/history`는 최근 60건을 돌려주고, 품목 상세의 변경 이력에서 그때 값을 수정 폼에 다시 불러올 수 있습니다.

## 저장 구조

```sql
docs     (store text, id text, data jsonb, primary key (store, id))   -- 업무 문서
events   (seq bigserial, at, origin, by_user, topics text[], message)  -- 변경 피드
presence (tab_id text primary key, data jsonb, seen_at timestamptz)    -- 접속 표시
```

업무 문서는 저장소(`skus`, `stocks`, `orders` …)별 jsonb로 둡니다. 브라우저 데모 서버와 같은 문서 모델을 그대로 써서, 업무 규칙을 두 벌로 만들지 않기 위한 선택입니다. 데이터가 수백 건 규모라 요청마다 저장소를 통째로 읽어도 충분히 빠릅니다. 데이터가 커지면 문서 모델을 정규화된 테이블로 옮기고 `Storage` 인터페이스만 다시 구현하면 됩니다.

스키마는 첫 요청에서 `create table if not exists`로 만들고, 시드는 `meta` 문서가 없을 때만 넣습니다. 데모 모드는 시드 버전이 바뀌면 다시 채우지만, 실제 서버는 배포 중 옛 함수와 새 함수가 함께 돌며 서로를 낡았다고 보고 데이터를 거듭 지울 수 있어 버전으로 다시 채우지 않습니다(`reseedOnVersionChange`).

## 쓰기와 잠금

모든 쓰기는 `lock(work)` 안에서 합니다(`pg-backend.ts`).

```
BEGIN
  select pg_advisory_xact_lock(74201001)   -- 모든 쓰기가 한 줄로 섬
  읽기 → 검사(버전, 가용 재고) → 쓰기(docs) → 변경 기록(events)
COMMIT                                      -- 잠금 해제
```

잠금 안에서는 `AsyncLocalStorage`로 그 트랜잭션의 연결을 잡아, 읽기와 쓰기가 같은 연결을 씁니다. 그래서 여러 함수 인스턴스가 동시에 같은 재고를 출고해도 하나만 성공하고, 오류가 나면 문서와 변경 기록이 함께 취소됩니다. 같은 저장소의 여러 문서는 `unnest`로 한 번에 넣어, 시드처럼 수백 건을 쓸 때 왕복을 줄입니다.

## 실시간 반영

- **변경 피드:** 쓰기가 끝나면 `events`에 순번과 함께 남깁니다. 클라이언트는 처음에 마지막 순번을 받고, 2.5초마다(화면이 숨겨지면 10초) `/api/changes?after=순번`으로 놓친 변경을 이어 받습니다. 연결이 끊겼다 돌아와도 순번으로 이어 받으므로 빠지는 변경이 없습니다. 하루 지난 기록은 가끔 지웁니다.
- **접속 표시:** 탭마다 5초 간격과 상태가 바뀔 때 `/api/presence`에 신호를 보내고, 3초마다 목록을 받습니다. 15초 동안 신호가 없거나 탭을 닫으면(`pagehide` → `DELETE`) 사라집니다.

웹소켓 대신 폴링을 고른 것은 Vercel 함수가 오래 열린 연결을 지원하지 않기 때문입니다. 폴링 응답은 대부분 빈 목록이라 가볍습니다.

## 배포

- `scripts/build-api.mjs`: esbuild로 `/api` 코드를 파일 하나로 묶습니다(`vercel.mjs`: node-postgres, `local.mjs`: PGlite).
- `scripts/build-vercel.mjs`: [Build Output API](https://vercel.com/docs/build-output-api/v3) 형식으로 `.vercel/output`을 만듭니다. 정적 사이트, `api.func`(Node 22, `sin1`), 라우팅·캐시 규칙(`config.json`)이 들어갑니다.
- DB는 Vercel Marketplace의 Neon 연동으로 만들었고, **운영 환경에만** `DATABASE_URL`을 넣었습니다. `AUTH_SECRET`·`CRON_SECRET`도 운영 환경에만 Secret으로 둡니다.
- 매일 03:00(KST) Vercel Cron이 `/api/cron/reset`을 `Authorization: Bearer <CRON_SECRET>`으로 불러 데모 데이터를 처음 상태로 되돌립니다(`config.json`의 `crons`).

## 로컬에서 실제 서버 모드로

```bash
pnpm preview:api   # http://localhost:4300, /api를 PGlite(메모리 Postgres) 위의 서버가 받음
```

계정이나 Docker가 필요 없습니다. 껐다 켜면 데이터는 처음 상태로 돌아갑니다. E2E의 `remote` 프로젝트가 이 모드로 같은 테스트를 돌립니다.

## 알려 둘 점

- 데모라 비밀번호를 공개합니다. 실제 서비스라면 계정별 비밀번호 해시(예: Argon2)와 로그인 시도 제한, 짧은 토큰과 갱신, 토큰 폐기 목록이 필요합니다.
- 데모 초기화(`POST /api/_reset`)는 관리자만 할 수 있습니다.
- 요청 본문은 64KB까지 받고, 모든 입력은 업무 서버가 검증합니다(길이, 정수 범위, 상태 전이, 역할).
