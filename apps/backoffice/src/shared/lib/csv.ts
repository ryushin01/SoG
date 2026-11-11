/**
 * CSV 내보내기. 엑셀에서 한글이 깨지지 않게 BOM을 붙이고,
 * =, +, -, @로 시작하는 값은 수식으로 실행되지 않도록 앞에 작은따옴표를 붙입니다(CSV 수식 주입 방지).
 */
export type CsvCell = string | number | null | undefined;

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const cell = (value: CsvCell): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]): void {
  const blob = new Blob(['﻿', toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 파일 이름에 붙일 오늘 날짜(YYYY-MM-DD, 한국 시간) */
export function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}
