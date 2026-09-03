export function normalizeRuleText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchesSecondTurnOne(value: string): boolean {
  return clauses(value).some(
    (clause) =>
      clause.includes('後攻') && /(?:最初のターン|1ターン目)/.test(clause),
  )
}

export function matchesDraw(value: string): boolean {
  const text = normalizeRuleText(value)
  return /(?<!エール)デッキを[^。！？]{0,80}(?:\d+|[一二三四五六七八九十]+)枚引(?:く|ける|き|いて|いた)/.test(
    text,
  )
}

const DECK_SEARCH_DESTINATION =
  /(?:手札に(?:加える|戻す)|ステージに(?:出す|登場させる)|登場させる|(?:Bloom|ブルーム)させる)/
const DECK_SEARCH_SELECTION = /(?:公開|選|探|その中から)/

function matchingWindows(text: string, sourcePattern: RegExp): string[] {
  return [...text.matchAll(sourcePattern)].map((match) =>
    text.slice(match.index, match.index + 240),
  )
}

export function matchesDeckSearch(value: string): boolean {
  const text = normalizeRuleText(value)
  const direct = matchingWindows(text, /(?<!エール)デッキから/g).map(
    (window) => window.split(/[。！？]/)[0] ?? '',
  )
  if (
    direct.some(
      (clause) =>
        DECK_SEARCH_SELECTION.test(clause) &&
        DECK_SEARCH_DESTINATION.test(clause),
    )
  ) {
    return true
  }

  const fromTop = matchingWindows(
    text,
    /(?<!エール)デッキの上から\d+枚を?見る/g,
  )
  return fromTop.some(
    (window) =>
      window.includes('その中から') && DECK_SEARCH_DESTINATION.test(window),
  )
}

export function matchesCheerAcceleration(value: string): boolean {
  return clauses(value).some((clause) => {
    const hasExternalSource =
      /エールデッキ(?:の上)?から/.test(clause) ||
      /アーカイブ.{0,100}エール/.test(clause) ||
      /手札.{0,100}エール/.test(clause)

    return hasExternalSource && /ホロメンに送る/.test(clause)
  })
}

function clauses(text: string): string[] {
  return normalizeRuleText(text)
    .split(/[。！？]+/)
    .map((clause) => clause.trim())
    .filter(Boolean)
}

export function matchesCheerRecovery(value: string): boolean {
  return clauses(value).some(
    (clause) =>
      /アーカイブ(?:にある|の|から)[^。！？]{0,100}エール/.test(clause) &&
      /(?:ホロメンに送る|エールデッキに戻す|手札に(?:戻す|加える))/.test(
        clause,
      ),
  )
}

export function matchesArchiveRecovery(value: string): boolean {
  return clauses(value).some((clause) => {
    if (
      !/アーカイブ(?:にある|の|から)/.test(clause) ||
      clause.includes('エール')
    ) {
      return false
    }

    return (
      /(?:ホロメン|サポートカード|イベント|ツール|マスコット|ファン|カード)/.test(
        clause,
      ) && /(?:手札に(?:戻す|加える)|デッキに戻す|ステージに出す)/.test(clause)
    )
  })
}

export function matchesArtsBoost(value: string): boolean {
  return /アーツ(?:ダメージ)?\s*\+\s*\d+/.test(normalizeRuleText(value))
}

export function matchesDamageReduction(value: string): boolean {
  const text = normalizeRuleText(value)
  return (
    /受けるダメージ(?:を|が)?\s*-\s*\d+/.test(text) ||
    /ダメージを受けない/.test(text)
  )
}

export function matchesSpecialDamage(value: string): boolean {
  return /特殊ダメージ\s*[「"]?\s*\d*\s*[」"]?\s*を与え/.test(
    normalizeRuleText(value),
  )
}
