export type MemberReadingEntry = {
  name: string
  reading: string
  aliases?: readonly string[]
}

export const MEMBER_READING_ENTRIES = [
  { name: 'ときのそら', reading: 'ときのそら' },
  { name: 'ロボ子さん', reading: 'ろぼこさん' },
  { name: 'AZKi', reading: 'あずき' },
  { name: 'さくらみこ', reading: 'さくらみこ' },
  { name: '星街すいせい', reading: 'ほしまちすいせい' },
  {
    name: 'アキ・ローゼンタール',
    reading: 'あきろーぜんたーる',
    aliases: ['アキロゼ'],
  },
  { name: '赤井はあと', reading: 'あかいはあと' },
  { name: '白上フブキ', reading: 'しらかみふぶき' },
  { name: '夏色まつり', reading: 'なついろまつり' },
  { name: '百鬼あやめ', reading: 'なきりあやめ' },
  { name: '癒月ちょこ', reading: 'ゆづきちょこ' },
  { name: '大空スバル', reading: 'おおぞらすばる' },
  { name: '大神ミオ', reading: 'おおかみみお' },
  { name: '猫又おかゆ', reading: 'ねこまたおかゆ' },
  { name: '戌神ころね', reading: 'いぬがみころね' },
  { name: '兎田ぺこら', reading: 'うさだぺこら' },
  { name: '不知火フレア', reading: 'しらぬいふれあ' },
  { name: '白銀ノエル', reading: 'しろがねのえる' },
  { name: '宝鐘マリン', reading: 'ほうしょうまりん' },
  { name: '角巻わため', reading: 'つのまきわため' },
  { name: '常闇トワ', reading: 'とこやみとわ' },
  { name: '姫森ルーナ', reading: 'ひめもりるーな' },
  { name: '雪花ラミィ', reading: 'ゆきはならみぃ' },
  { name: '桃鈴ねね', reading: 'ももすずねね' },
  { name: '獅白ぼたん', reading: 'ししろぼたん' },
  { name: '尾丸ポルカ', reading: 'おまるぽるか' },
  { name: 'ラプラス・ダークネス', reading: 'らぷらすだーくねす' },
  { name: '鷹嶺ルイ', reading: 'たかねるい' },
  { name: '博衣こより', reading: 'はくいこより' },
  { name: '風真いろは', reading: 'かざまいろは' },
  { name: '沙花叉クロヱ', reading: 'さかまたくろえ' },
  { name: 'アユンダ・リス', reading: 'あゆんだりす' },
  { name: 'ムーナ・ホシノヴァ', reading: 'むーなほしのゔぁ' },
  {
    name: 'アイラニ・イオフィフティーン',
    reading: 'あいらにいおふぃふてぃーん',
  },
  { name: 'クレイジー・オリー', reading: 'くれいじーおりー' },
  { name: 'アーニャ・メルフィッサ', reading: 'あーにゃめるふぃっさ' },
  { name: 'パヴォリア・レイネ', reading: 'ぱゔぉりあれいね' },
  { name: 'ベスティア・ゼータ', reading: 'べすてぃあぜーた' },
  { name: 'カエラ・コヴァルスキア', reading: 'かえらこゔぁるすきあ' },
  { name: 'こぼ・かなえる', reading: 'こぼかなえる' },
  { name: '森カリオペ', reading: 'もりかりおぺ' },
  { name: '小鳥遊キアラ', reading: 'たかなしきあら' },
  { name: '一伊那尓栖', reading: 'にのまえいなにす' },
  { name: 'ワトソン・アメリア', reading: 'わとそんあめりあ' },
  { name: 'IRyS', reading: 'あいりす' },
  { name: 'オーロ・クロニー', reading: 'おーろくろにー' },
  { name: 'ハコス・ベールズ', reading: 'はこすべーるず' },
  { name: 'シオリ・ノヴェラ', reading: 'しおりのゔぇら' },
  { name: '古石ビジュー', reading: 'こせきびじゅー' },
  {
    name: 'ネリッサ・レイヴンクロフト',
    reading: 'ねりっされいゔんくろふと',
  },
  { name: 'フワワ・アビスガード', reading: 'ふわわあびすがーど' },
  { name: 'モココ・アビスガード', reading: 'もここあびすがーど' },
  {
    name: 'エリザベス・ローズ・ブラッドフレイム',
    reading: 'えりざべすろーずぶらっどふれいむ',
  },
  { name: 'ジジ・ムリン', reading: 'じじむりん' },
  { name: 'セシリア・イマーグリーン', reading: 'せしりあいまーぐりーん' },
  { name: 'ラオーラ・パンテーラ', reading: 'らおーらぱんてーら' },
  { name: '音乃瀬奏', reading: 'おとのせかなで' },
  { name: '一条莉々華', reading: 'いちじょうりりか' },
  { name: '儒烏風亭らでん', reading: 'じゅうふうていらでん' },
  { name: '轟はじめ', reading: 'とどろきはじめ' },
  { name: '火威青', reading: 'ひおどしあお' },
  { name: '響咲リオナ', reading: 'いさきりおな' },
  { name: '虎金妃笑虎', reading: 'こがねいにこ' },
  { name: '水宮枢', reading: 'みずみやすう' },
  { name: '輪堂千速', reading: 'りんどうちはや' },
  { name: '綺々羅々ヴィヴィ', reading: 'ききららゔぃゔぃ' },
  { name: '湊あくあ', reading: 'みなとあくあ' },
  { name: '紫咲シオン', reading: 'むらさきしおん' },
  { name: '天音かなた', reading: 'あまねかなた' },
  { name: '桐生ココ', reading: 'きりゅうここ' },
  { name: 'がうる・ぐら', reading: 'がうるぐら' },
  { name: '九十九佐命', reading: 'つくもさな' },
  { name: 'セレス・ファウナ', reading: 'せれすふぁうな' },
  { name: '七詩ムメイ', reading: 'ななしむめい' },
] as const satisfies readonly MemberReadingEntry[]

const MEMBER_READING_BY_NAME = new Map(
  MEMBER_READING_ENTRIES.map((entry) => [entry.name, entry]),
)

function compactMemberName(name: string): string {
  return name.replace(/[・\s]/g, '')
}

export function getMemberSearchTerms(
  name: string,
): { nameReading: string; aliases: readonly string[] } | undefined {
  const entry = MEMBER_READING_BY_NAME.get(name)
  if (!entry) return undefined

  const compactName = compactMemberName(entry.name)
  return {
    nameReading: entry.reading,
    aliases: [
      ...(compactName === entry.name ? [] : [compactName]),
      ...('aliases' in entry ? entry.aliases : []),
    ],
  }
}
