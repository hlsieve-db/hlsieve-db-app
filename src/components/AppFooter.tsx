import { Link } from 'react-router-dom'

export function AppFooter() {
  return (
    <footer className="app-footer">
      <p>HLSieve DBは非公式のファンメイドツールです。</p>
      <p>
        hololive OFFICIAL CARD
        GAMEおよび関連する名称・画像等の権利は、各権利者に帰属します。
      </p>
      <p>
        <Link to="/updates">更新履歴</Link>
        {' · '}
        <Link to="/contact">お問い合わせ</Link>
        {' · '}
        <Link to="/disclaimer">利用条件</Link>
        {' · '}
        <Link to="/privacy">プライバシーポリシー</Link>
      </p>
    </footer>
  )
}
