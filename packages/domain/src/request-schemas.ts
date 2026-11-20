/**
 * 요청 본문 스키마(zod/mini). 업무 서버가 본문을 확인하고, 맞지 않으면 400과 첫 문구로 답합니다(`parseBody`).
 * 문구는 화면이 보여 주는 서버 오류 문구와 같습니다. 앱 첫 화면 묶음에 들어가지 않도록 `@sog/domain/requests`로만
 * 가져옵니다(도메인 index에서 내보내지 않음). 스키마는 처음 부를 때 만들고, 타입은 api.ts의 인터페이스가 기준입니다.
 */
import * as z from 'zod/mini';
import type {
  AdjustRequest,
  CreateCountRequest,
  CreateOrderRequest,
  LoginRequest,
  MovementRequest,
  PickRequest,
  SkuPatch,
  SubmitCountLineRequest,
} from './api';
import type { Schema } from './schemas';
import type { ZoneCode } from './types';

/** 수량·금액 같은 정수 입력의 상한 */
export const MAX_INT_INPUT = 1_000_000;

/** 구역 코드(기준 정보의 구역과 같은 목록) */
export const ZONE_CODES = ['A', 'B', 'C', 'D', 'E', 'F'] as const satisfies readonly ZoneCode[];

/** 정수 입력. 0을 허용하지 않으면 1 이상입니다. */
export function intInput(label: string, allowZero = false) {
  const message = `${label}은(는) ${allowZero ? '0 이상' : '1 이상'}의 정수여야 합니다.`;
  return z
    .int({ error: message })
    .check(
      z.gte(allowZero ? 0 : 1, { error: message }),
      z.lte(MAX_INT_INPUT, { error: `${label}이(가) 너무 큽니다.` }),
    );
}

/** 글자 입력. 앞뒤 공백을 지운 뒤 비었거나 길면 거절합니다. */
export function textInput(label: string, max: number) {
  const empty = `${label}을(를) 입력해 주세요.`;
  return z
    .string({ error: empty })
    .check(
      z.trim(),
      z.minLength(1, { error: empty }),
      z.maxLength(max, { error: `${label}은(는) ${max}자 이내로 입력해 주세요.` }),
    );
}

/** 비워도 되는 글자 입력(보내지 않으면 undefined) */
export function optionalText(label: string, max: number) {
  return z.optional(
    z
      .string({ error: `${label}은(는) 글자로 입력해 주세요.` })
      .check(
        z.trim(),
        z.maxLength(max, { error: `${label}은(는) ${max}자 이내로 입력해 주세요.` }),
      ),
  );
}

/** 목록에서 고르는 값(ID). 비었으면 안내 문구로 거절합니다. */
function choice(message: string) {
  return z.string({ error: message }).check(z.minLength(1, { error: message }));
}

/** 날짜·시각(ISO 문자열 등 Date가 읽을 수 있는 값) */
function dateInput(message: string) {
  return z
    .string({ error: message })
    .check(z.refine((value) => !Number.isNaN(Date.parse(value)), { error: message }));
}

// ---------- 요청 본문 ----------

let loginRequest: Schema<LoginRequest> | undefined;
export function loginRequestSchema(): Schema<LoginRequest> {
  return (loginRequest ??= z.object({ userId: z.string(), password: z.string() }));
}

let skuPatch: Schema<SkuPatch> | undefined;
export function skuPatchSchema(): Schema<SkuPatch> {
  return (skuPatch ??= z.object({
    name: z.optional(textInput('품목명', 60)),
    safetyStock: z.optional(intInput('안전 재고', true)),
    unitCost: z.optional(intInput('단가', true)),
    description: optionalText('설명', 500),
  }));
}

let adjustRequest: Schema<AdjustRequest> | undefined;
export function adjustRequestSchema(): Schema<AdjustRequest> {
  return (adjustRequest ??= z.object({
    onHand: intInput('수량', true),
    reason: textInput('조정 사유', 100),
  }));
}

let movementRequest: Schema<MovementRequest> | undefined;
export function movementRequestSchema(): Schema<MovementRequest> {
  if (movementRequest) return movementRequest;
  const skuId = choice('품목을 선택해 주세요.');
  const location = choice('로케이션을 선택해 주세요.');
  const qty = intInput('수량');
  const reason = textInput('사유', 100);
  return (movementRequest = z.discriminatedUnion(
    'type',
    [
      z.object({
        type: z.literal('receipt'),
        skuId,
        toLocationId: location,
        qty,
        reason,
        ref: optionalText('참조 번호', 40),
      }),
      z.object({
        type: z.literal('shipment'),
        skuId,
        fromLocationId: location,
        qty,
        reason,
        ref: optionalText('참조 번호', 40),
      }),
      z.object({
        type: z.literal('transfer'),
        skuId,
        fromLocationId: location,
        toLocationId: location,
        qty,
        reason,
      }),
    ],
    { error: '이동 유형을 선택해 주세요.' },
  ));
}

let createCountRequest: Schema<CreateCountRequest> | undefined;
/** 키 순서는 서버가 확인하던 순서(작업 이름 → 구역 → 담당자 → 마감)라 첫 문구가 같습니다. */
export function createCountRequestSchema(): Schema<CreateCountRequest> {
  const outside = '고른 구역 안의 로케이션만 실사할 수 있습니다.';
  return (createCountRequest ??= z.object({
    title: textInput('작업 이름', 60),
    zone: z.enum(ZONE_CODES, { error: '구역을 선택해 주세요.' }),
    assigneeId: choice('담당 작업자를 선택해 주세요.'),
    dueAt: dateInput('마감일을 입력해 주세요.'),
    locationIds: z.optional(z.array(z.string({ error: outside }), { error: outside })),
    blind: z._default(z.boolean({ error: '블라인드 실사 여부를 골라 주세요.' }), false),
  }));
}

let submitCountLineRequest: Schema<SubmitCountLineRequest> | undefined;
export function submitCountLineRequestSchema(): Schema<SubmitCountLineRequest> {
  return (submitCountLineRequest ??= z.object({
    countedQty: intInput('센 수량', true),
    note: optionalText('메모', 120),
  }));
}

let createOrderRequest: Schema<CreateOrderRequest> | undefined;
/** 줄마다의 수량은 품목 이름을 넣은 문구로 서버가 따로 확인합니다(예: "OPP 테이프 48mm 수량은…"). */
export function createOrderRequestSchema(): Schema<CreateOrderRequest> {
  return (createOrderRequest ??= z.object({
    customer: textInput('고객사', 40),
    assigneeId: choice('피킹 작업자를 선택해 주세요.'),
    dueAt: dateInput('출고 마감을 입력해 주세요.'),
    lines: z
      .array(
        z.object({
          skuId: choice('품목을 선택해 주세요.'),
          qty: z.number({ error: '수량을 입력해 주세요.' }),
        }),
        { error: '품목을 하나 이상 넣어 주세요.' },
      )
      .check(
        z.minLength(1, { error: '품목을 하나 이상 넣어 주세요.' }),
        z.maxLength(20, { error: '품목은 20개까지 넣을 수 있습니다.' }),
      ),
  }));
}

let pickRequest: Schema<PickRequest> | undefined;
export function pickRequestSchema(): Schema<PickRequest> {
  return (pickRequest ??= z.object({
    pickedQty: intInput('집은 수량', true),
    note: optionalText('메모', 100),
  }));
}
