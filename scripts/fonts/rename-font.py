"""OFL 예약 이름이 있는 글꼴을 줄인 파일의 이름표(name 표)를 새 이름으로 바꿉니다.
build-fonts.mjs가 설정에 "rename": true인 글꼴을 만든 뒤 부릅니다.

    pip install fonttools brotli
    python3 scripts/fonts/rename-font.py <새 이름> <woff2 파일...>
"""

import sys

from fontTools.ttLib import TTFont


def main() -> None:
    family, files = sys.argv[1], sys.argv[2:]
    for path in files:
        # 저장 시각을 새로 적지 않아, 다시 만들어도 같은 파일이 나오게 함
        font = TTFont(path, recalcTimestamp=False)
        style = font["name"].getDebugName(2) or "Regular"
        for record in font["name"].names:
            if record.nameID in (1, 4, 16, 21):
                record.string = family
            elif record.nameID == 6:
                record.string = f"{family}-{style}".replace(" ", "")
            elif record.nameID == 3:
                record.string = f"{family} subset"
        font.flavor = "woff2"
        font.save(path)
    print(f"{family}: {len(files)}개 파일의 이름을 바꿨습니다")


if __name__ == "__main__":
    main()
