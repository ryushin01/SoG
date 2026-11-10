import { toCsv } from './csv';

describe('toCsv', () => {
  it('쉼표·따옴표·줄바꿈이 있는 값은 따옴표로 감싼다', () => {
    expect(toCsv(['이름', '메모'], [['테이프, 48mm', '"강력"\n접착']])).toBe(
      '이름,메모\r\n"테이프, 48mm","""강력""\n접착"',
    );
  });

  it('수식으로 해석될 수 있는 글자는 작은따옴표로 막고, 숫자는 그대로 둔다', () => {
    expect(toCsv(['a', 'b', 'c'], [['=HYPERLINK("x")', '+1', -3]])).toBe(
      'a,b,c\r\n"\'=HYPERLINK(""x"")",\'+1,-3',
    );
  });

  it('빈 값은 빈 칸으로', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });
});
