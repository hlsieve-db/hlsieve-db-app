import { AppNavigation } from '../components/AppNavigation'
import { DISCLAIMER_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

export function DisclaimerPage() {
  useDocumentMetadata(DISCLAIMER_METADATA)

  return (
    <main className="content-page disclaimer-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>免責事項・利用条件</h1>
        <p>HLSieve DBをご利用いただく前に、以下をご確認ください。</p>
      </header>

      <div className="content-surface legal-content">
        <section>
          <h2>非公式ファンメイドツールについて</h2>
          <p>
            HLSieve DBは、hololive OFFICIAL CARD
            GAMEをより便利に楽しむことを目的として、個人が運営する非公式のファンメイドツールです。
          </p>
          <p>
            カバー株式会社その他の関連企業・団体とは関係がなく、公式に運営、提供、承認または協賛されたサービスではありません。
          </p>
        </section>

        <section>
          <h2>権利の帰属</h2>
          <p>
            カード画像、カード名称、キャラクター名称、ゲームに関する情報、その他の著作物・商標等の権利は、各権利者に帰属します。
          </p>
        </section>

        <section>
          <h2>情報の正確性と公式情報の確認</h2>
          <p>
            カード情報、ルールおよび裁定について可能な限り正確な情報提供を目指しますが、正確性、完全性、最新性を保証するものではありません。
          </p>
          <p>
            大会参加や正式なルール判断では、hololive OFFICIAL CARD
            GAME公式サイト、公式ルールおよび公式Q&amp;Aをご確認ください。
          </p>
        </section>

        <section>
          <h2>責任とサービス変更</h2>
          <p>
            本サイトの利用によって生じた損害、トラブルまたは不利益について、法令上認められる範囲で運営者は責任を負いません。
          </p>
          <p>
            予告なく内容の変更、機能の追加・削除、公開停止またはサービス終了を行う場合があります。
          </p>
          <p>
            外部リンク先の内容やサービスについて、HLSieve DBは責任を負いません。
          </p>
          <p>
            権利者その他の関係者から掲載内容について連絡を受けた場合は、内容を確認したうえで適切に対応します。
          </p>
        </section>

        <section>
          <h2>営利目的での利用について</h2>
          <p>
            HLSieve
            DB独自の情報整理、検索結果、画面、データまたはサービスを利用した営利目的の活動は禁止します。
          </p>
          <p>
            この利用条件はHLSieve
            DB独自サービスについて定めるものであり、公式カード画像・名称・キャラクター等の第三者権利物について、HLSieve
            DB運営者が利用許諾を与えるものではありません。第三者権利物の利用は、各権利者のルールに従ってください。
          </p>

          <div className="usage-example usage-example--allowed">
            <h3>無料コンテンツで許容する例</h3>
            <ul>
              <li>〇 無料noteでHLSieve DBを紹介する</li>
              <li>〇 無料ブログで検索結果を紹介する</li>
              <li>〇 SNSや無料動画・記事でHLSieve DBを紹介する</li>
            </ul>
          </div>

          <div className="usage-example usage-example--prohibited">
            <h3>禁止する例</h3>
            <ul>
              <li>× 有料noteへHLSieve DBの情報・検索結果を掲載する</li>
              <li>× 有料教材や有料会員向けコンテンツへ掲載する</li>
              <li>× HLSieve DBの情報を利用した資料を販売する</li>
              <li>
                ×
                商品やサービスの販売促進を目的として、情報・画面・検索結果等を利用する
              </li>
              <li>× その他、直接または間接的に収益を得る目的で利用する</li>
            </ul>
          </div>
          <p>
            現時点では問い合わせ窓口を設けていないため、営利利用に該当するか判断が難しい場合は利用をお控えください。
          </p>
        </section>
      </div>
    </main>
  )
}
