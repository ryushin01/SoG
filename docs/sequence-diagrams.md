# 시퀀스 다이어그램

SoG의 주요 흐름입니다. 원리와 근거는 [동시성 제어](concurrency.md)와 [실제 서버](backend.md)에 있고, 여기서는 시간 순서로 그립니다. 업무 서버는 운영에서는 Postgres 위의 Vercel 함수, 개발·미리보기에서는 브라우저 안(IndexedDB)의 데모 서버이며, 두 앱은 `@sog/wms-client`의 `HttpClient`로만 통신합니다.

## 1. 두 관리자가 같은 품목을 고칠 때 (낙관적 잠금)

```mermaid
sequenceDiagram
    actor A as 관리자 A
    actor B as 관리자 B
    participant 화면A as 품목 상세 (A)
    participant 화면B as 품목 상세 (B)
    participant 서버 as 업무 서버<br/>(packages/wms-server)

    화면A->>서버: GET /api/skus/sku-10201
    서버-->>화면A: 200, ETag "3"
    화면B->>서버: GET /api/skus/sku-10201
    서버-->>화면B: 200, ETag "3"
    Note over 화면A,화면B: 접속 표시: 서로 같은 품목을 보고 있음을 표시
    A->>화면A: 저장
    화면A->>서버: PATCH If-Match "3"
    서버->>서버: 쓰기 잠금 안에서 버전 확인 후 저장
    서버-->>화면A: 200, ETag "4"
    서버-->>화면B: 변경 알림 (skus/sku-10201)
    화면B-->>B: 수정 중이라 입력은 지키고 "방금 수정했습니다" 안내
    B->>화면B: 그대로 저장
    화면B->>서버: PATCH If-Match "3"
    서버-->>화면B: 412 VERSION_CONFLICT + 최신 자원
    화면B-->>B: 내 입력과 최신 값이 다른 항목만 비교 표
    alt 내 입력으로 다시 저장
        화면B->>서버: PATCH If-Match "4"
        서버-->>화면B: 200, ETag "5"
    else 최신 값 불러오기
        화면B-->>B: 최신 값으로 바꿈
    end
```

## 2. 현장 실사: 오프라인 보낼함과 실시간 반영

```mermaid
sequenceDiagram
    actor 작업자
    participant 실사앱 as 현장 실사 앱<br/>(apps/count, PWA)
    participant 보낼함 as 보낼함<br/>(IndexedDB sog-count)
    participant 서버 as 업무 서버
    participant 백오피스 as 실사 검토 화면<br/>(apps/backoffice)

    작업자->>실사앱: 수량 입력 후 저장 (SubmitLock)
    실사앱->>보낼함: 기록 + 멱등 키 (같은 항목을 다시 세면 보내지 않은 기록을 바꿈)
    alt 연결 끊김 (음영 지역)
        보낼함-->>작업자: "보낼함에 저장됨"
        Note over 보낼함: 다시 연결되면 순서대로 보냄
    end
    보낼함->>서버: PUT /api/counts/:id/lines/:lineId<br/>Idempotency-Key, If-Match
    alt 같은 키로 이미 반영됨
        서버-->>보낼함: 처음 응답 (Idempotent-Replayed: true)
    else 관리자가 재실사를 요청해 버전이 바뀜
        서버-->>보낼함: 412
        보낼함-->>작업자: "확인 필요" (덮어쓰지 않고 다시 세게 함)
    else
        서버->>서버: 센 수량과 센 시각 기록
        서버-->>보낼함: 200
        서버-->>백오피스: 변경 알림 (counts/ct-…)<br/>데모: BroadcastChannel, 실제 서버: /api/changes
        백오피스-->>백오피스: 표 갱신, 바뀐 줄 강조
    end
```

## 3. 출고 지시의 재고 예약

```mermaid
sequenceDiagram
    actor A as 관리자 A
    actor B as 관리자 B
    participant 서버 as 업무 서버
    participant DB as Postgres<br/>(또는 IndexedDB)

    A->>서버: POST 출고 지시 (마지막 재고)
    B->>서버: POST 출고 지시 (같은 재고, 거의 동시에)
    서버->>DB: A 요청: 트랜잭션 + pg_advisory_xact_lock<br/>(데모: Web Locks)
    서버->>서버: 최신 재고로 가용 수량(보유 − 출고 지시) 계산, allocate
    서버->>DB: 가용 재고가 많은 로케이션부터 예약
    서버-->>A: 201
    서버->>DB: B 요청: 잠금을 기다렸다가 같은 과정
    서버->>서버: 가용 수량 부족
    서버-->>B: 409 + 품목별 지금 가용 수량
    Note over 서버,DB: 출고를 확정하면 집은 만큼 재고에서 빠지고,<br/>덜 집은 수량과 취소한 지시의 예약은 풀림
```

## 4. 실사 승인 정산

```mermaid
sequenceDiagram
    actor 관리자
    participant 검토 as 실사 검토 화면
    participant 규칙 as 정산 규칙<br/>(packages/domain settledOnHand)
    participant 서버 as 업무 서버

    Note over 검토: 실사 항목마다 만들 때의 장부 수량, 재고 버전, 센 시각이 있음
    검토->>규칙: 센 수량, 센 뒤에 일어난 입출고
    규칙-->>검토: 승인 시 재고 = 센 수량 + 센 뒤 입출고의 순증감
    검토-->>관리자: 항목마다 "실사 중 이동"과 "승인 시 재고"
    관리자->>검토: 승인
    검토->>서버: 승인 (If-Match 작업 버전)
    alt 작업자가 더 셌거나 다른 관리자가 먼저 처리
        서버-->>검토: 412
        검토-->>관리자: 최신 상태를 다시 받아 보여 줌
    else
        서버->>서버: 잠금 안에서 재고 반영, 활동 기록
        서버-->>검토: 200
    end
```
