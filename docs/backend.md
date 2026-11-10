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

- `{"mode":"remote"}`이면 요청을 서버로 보냅니다. 인터셉터가 `x-sog-user`(사용자)와 `x-sog-origin`(탭)을 붙입니다.
- 404·503이면 브라우저 안 데모 서버를 씁니다. 미리보기 배포에는 DB를 연결하지 않아 503이 나오므로, 미리보기는 운영 데이터를 건드리지 않습니다.
- 응답이 없으면(오프라인) 마지막으로 확인한 모드를 씁니다. 창고 음영 지역에서 연 현장 앱이 데모 데이터로 바뀌어 가짜 수량을 실제처럼 보여 주는 일을 막기 위해서입니다.
- 운영 함수는 DB에 묻지 않고 상태 확인에 답합니다. DB가 잠시 응답하지 않아도 데모 모드로 바뀌지 않고, 장애는 각 요청의 오류로 드러납니다.

화면 코드는 어느 모드인지 모릅니다. 모두 `HttpClient`로 같은 API를 부르고, 같은 상태 코드(200·201·409·412·428)를 받습니다.

## 저장 구조

```sql
docs     (store text, id text, data jsonb, primary key (store, id))   -- 업무 문서
events   (seq bigserial, at, origin, by_user, topics text[], message)  -- 변경 피드
presence (tab_id text primary key, data jsonb, seen_at timestamptz)    -- 접속 표시
```

업무 문서는 저장소(`skus`, `stocks`, `orders` …)별 jsonb로 둡니다. 브라우저 데모 서버와 같은 문서 모델을 그대로 써서, 업무 규칙을 두 벌로 만들지 않기 위한 선택입니다. 데이터가 수백 건 규모라 요청마다 저장소를 통째로 읽어도 충분히 빠릅니다. 데이터가 커지면 문서 모델을 정규화된 테이블로 옮기고 `Storage` 인터페이스만 다시 구현하면 됩니다.

스키마는 첫 요청에서 `create table if not exists`로 만들고, 시드는 `meta` 문서의 시드 버전을 보고 넣습니다.

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
- DB는 Vercel Marketplace의 Neon 연동으로 만들었고, **운영 환경에만** `DATABASE_URL`을 넣었습니다.

## 로컬에서 실제 서버 모드로

```bash
pnpm preview:api   # http://localhost:4300, /api를 PGlite(메모리 Postgres) 위의 서버가 받음
```

계정이나 Docker가 필요 없습니다. 껐다 켜면 데이터는 처음 상태로 돌아갑니다. E2E의 `remote` 프로젝트가 이 모드로 같은 테스트를 돌립니다.

## 알려 둘 점

- 데모용이라 인증이 없습니다. 사용자는 `x-sog-user` 헤더로 고르고, 누구나 데모 초기화(`POST /api/_reset`)를 할 수 있습니다.
- 요청 본문은 64KB까지 받고, 모든 입력은 업무 서버가 검증합니다(길이, 정수 범위, 상태 전이, 역할).
