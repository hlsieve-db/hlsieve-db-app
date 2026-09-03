const KATAKANA_START = 0x30a1
const KATAKANA_END = 0x30f6
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60

function katakanaToHiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/g, (character) => {
    const codePoint = character.codePointAt(0)
    if (
      codePoint === undefined ||
      codePoint < KATAKANA_START ||
      codePoint > KATAKANA_END
    ) {
      return character
    }

    return String.fromCodePoint(codePoint - KATAKANA_TO_HIRAGANA_OFFSET)
  })
}

export function normalizeSearchText(value: string): string {
  return katakanaToHiragana(value.normalize('NFKC').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
}
