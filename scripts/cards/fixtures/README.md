# 公式カードHTML fixture corpus

## 用途

公式カードリストのHTML構造を、後続TASKで実装するparserのテスト入力として固定するための代表fixtureです。productionから読み込むデータではなく、parserテスト専用です。

fixtureは全カードのcrawlではありません。通常一覧、サポート一覧、特殊entry、およびカード種別・Bloomレベル・Q&Aなどの構造差をカバーする14件に限定しています。

## 公式ソースと取得日

- 公式公開サイト: <https://hololive-official-cardgame.com/cardlist/>
- 検索ページ: <https://hololive-official-cardgame.com/cardlist/cardsearch/?view=text>
- 取得日: 2026-09-02

各fixtureの正確な公開URL、取得日、期待する代表文字列は `manifest.ts` に記録しています。private/internal APIは使用していません。

## 取得方法

1. `manifest.ts` の `sourceUrl` をブラウザで開く。
2. 公開ページの `#content` 要素を `outerHTML` で取得する。
3. 対応する `list/` または `detail/` のHTMLを置き換える。
4. 取得日とnotes、必要ならexpectedSignalsを更新する。
5. `npm run test:run` と `npm run format:check` を実行する。

カード情報を含むDOM、class、data属性、Q&A本文は人手で書き換えません。`git diff --check` に適合させるため行末空白だけを除去しています。サイト共通のheader/footerと、`#content` 外のscript/styleはfixture対象外です。HTML内の画像URLは公式DOMの一部として残しますが、画像asset自体は保存しません。

## 代表ケース

- `list/`: 通常の複数結果、サポート絞り込み、説明用の特殊entry「デッキ構築ルール」
- 推しホロメン、通常ホロメン、Buzz、エール、サポート（LIMITED・ツール・ファン）
- Debut、1st、2nd、Spot、多色、アーツ、特殊ダメージ、タグ、イラストレーター、商品・発売日
- Q&Aなし、Q&Aあり、複数Q&A（Q番号・公開日・質問・回答・関連カードを含む）
- 同一カードナンバー `hBP03-050` の実在する別収録商品版2件

収録時点で確認できた公開HTMLだけを保存しており、不足ケースを推測や手書きで補っていません。
