# Phase 7B-3E 本番適用手順書（Deck Folder / Tag / Organization）

> **この適用は 2026-09-27 に完了しました。** migration 2本、検証クエリ、実機 QA の
> すべてを通過しています。以降は記録として、また次にスキーマを変更するときの
> 手順の下敷きとして残しています。
>
> **E-6（`git push`）と E-7（ビルド確認）は、実際には適用より前に済ませました。**
> 手順書を含む5コミットを先に出し、テーブルがない状態のフロントを本番に置いてから
> SQL を流しています。フロントはテーブル不在を `missing-table` として扱い、未送信
> キューに積まず静かに諦めるため、この順序でも害はありませんでした。したがって
> 実際の順序は E-1 → E-2 → E-3 → E-4 → E-5 → E-8 です。

この手順書は **メンテナー本人が実行する** 前提で書かれています。SQL の実行、
`git push`、実機 QA のいずれも、自動では行われません。

各段（E-1 〜 E-9）は独立して止まれます。途中で中断しても本番は壊れません。ただし
次の1点だけは例外です。

> **禁止: E-3（2本目の migration）を飛ばしてフロントを push しないこと。**
> 1本目だけを適用した状態でフロントを出すと、Folder と Tag の書き込みに使う
> `upsert_deck_folder` / `upsert_deck_tag` が存在せず、フォルダーとタグの同期だけが
> 失敗し続けます。E-1 → E-3 を必ず両方通してから E-6（push）に進んでください。

対象の migration は2本です。

- `supabase/migrations/20260927000000_create_cloud_deck_organization.sql`（457行）
- `supabase/migrations/20260927100000_add_deck_definition_upsert.sql`（114行）

未 push のコミットは4本です。

```
d0bdaa2 feat: add cloud tables for deck folders and tags
4c20d28 feat: send deck folders and tags to the account
a9d1c8f feat: reconcile deck folders and tags with the account
8004fa7 feat: offer this device's folders and tags to the account
```

**新しく作られる関数は 7つです。** 1本目が5つ
（`deck_organization_tag_ids_valid` / `deck_organization_set_timestamps` /
`tombstone_deck_folder` / `tombstone_deck_tag` / `tombstone_deck_with_related`）、
2本目が2つ（`upsert_deck_folder` / `upsert_deck_tag`）。以前「5つ」と報告したのは
1本目だけを数えた誤りで、以下の検証クエリは7つ前提です。

## 適用の結果（2026-09-27）

- **E-1 / E-3**: migration 2本とも成功。
- **E-2**: 3テーブルとも RLS 有効、ポリシー9件で DELETE は0件、`authenticated` に
  `select` / `insert` / `update` のみで `delete` なし、`anon` はすべて false、関数5つ
  とも `security invoker` かつ `anon` 実行不可、`deck_organization_tag_ids_valid` は
  `authenticated` 実行可、`tombstone_deck_with_versions` は不変、既存データ無傷
  （`decks` 3 / `deck_versions` 5 / `deck_shares` 1）、外部キー2本とインデックス4本。
- **E-4**: `upsert_deck_folder` / `upsert_deck_tag` が期待どおりのシグネチャと戻り値。
  `public` の関数は14個。
- **E-5**: `notify pgrst, 'reload schema'` 成功。
- **E-8**: 実機 QA 全項目通過（初回アップロード、端末をまたいだ反映、削除の伝播と
  非復活、競合の提示、既存機能の非退行）。
- `ensure_rls` が grant を触った形跡はなし。

## 適用前の本番の状態（確認済み）

- テーブル: `decks` / `deck_versions` / `deck_shares` の3つ
- 関数: `create_deck_share` / `deck_versions_protect_immutable` /
  `decks_set_timestamps` / `generate_deck_share_id` / `get_deck_share` /
  `rls_auto_enable` / `tombstone_deck_with_versions` の7つ
- イベントトリガー7つ。6つは Supabase 標準、7つ目の `ensure_rls` が
  `rls_auto_enable` を呼び、新規テーブルの RLS を自動で有効にする
- 既存3本の migration は適用済み。`20260927000000` と `20260927100000` は未適用

---

## 1. 適用の順序

| 段      | 作業                                                       | 止まれるか                                                                   |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **E-1** | `20260927000000_create_cloud_deck_organization.sql` を実行 | ○ 本番は無傷（新テーブルが増えるだけ。フロントは未 push なので誰も触らない） |
| **E-2** | E-1 の検証クエリ（§3-A）                                   | ○                                                                            |
| **E-3** | `20260927100000_add_deck_definition_upsert.sql` を実行     | ○ ただし **ここを飛ばして push しないこと**（冒頭の禁止事項）                |
| **E-4** | E-3 の検証クエリ（§3-B）                                   | ○                                                                            |
| **E-5** | `notify pgrst, 'reload schema';`（§6）                     | ○                                                                            |
| **E-6** | `git push origin main`（4コミット）                        | ○ ここまで旧クライアントは無影響                                             |
| **E-7** | Cloudflare Pages のビルド完了を確認                        | ○                                                                            |
| **E-8** | 実機 QA（§5）                                              | —                                                                            |
| **E-9** | README 更新（§7）をコミット・push                          | —                                                                            |

E-1 〜 E-5 を先に済ませてから E-6 に進む理由: フロントは「テーブルが無い」を静かに
無視する（`missing-table`）ので順序を逆にしても壊れませんが、逆順だと「適用前に
開いていたタブは、リロードするまで同期を諦めたまま」になります。SQL を先に通して
おけば、push 直後から全員が同期できます。

---

## 2. 各 migration の実行手順

共通: Supabase ダッシュボード → SQL Editor → New query → ファイル内容を**全文その
まま**貼り付け → Run。

### トランザクションで囲むか

**囲んでください。** 各ファイルの先頭に `begin;`、末尾に `commit;` を1行ずつ足して
実行します（リポジトリのファイル自体は編集せず、エディタ上で足すだけ）。

- Postgres は `create table` / `create function` / `create policy` / `grant` の
  すべてがトランザクション対応です。途中で失敗したときに「テーブルだけできて RLS が
  無い」状態が残るのが最悪で、それを避けられます。
- Supabase の SQL Editor は複数文をまとめて送りますが、暗黙の単一トランザクションに
  なる保証は文書化されていません。明示的に囲めば挙動が確定します。既に暗黙で囲まれて
  いたとしても、明示の `begin;` / `commit;` は無害です。
- **2本を1つのトランザクションにまとめないでください。** 段の区切り（E-1 / E-3）を
  残すためと、片方だけ流した状態でも安全に止まれるようにするためです。
- 失敗したら `rollback;` を実行します（エラー後は自動的に abort 状態なので、
  `rollback;` を送って明示的に閉じます）。

### イベントトリガー `ensure_rls` について

新テーブル作成時に `rls_auto_enable` が RLS を有効化しますが、migration 側でも
`alter table ... enable row level security` を明示しているため、二重でも問題あり
ません（冪等）。ただし `ensure_rls` が **grant も触る**実装だった場合は §3 の grant
検証で差が出ます。差が出たら適用を止めてください。

---

## 3. 検証クエリ

すべて**読み取りのみ**です。`supabase/tests/deck_organization_matrix.sql` は
**本番で実行しないでください**（`auth` スキーマを作り、最後にアカウントを削除します）。

### 3-A. E-2（1本目の直後）

```sql
-- 1. 3テーブルが存在し、RLS が有効（期待: 3行、rls すべて t）
select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('deck_folders', 'deck_tags', 'deck_organizations')
 order by c.relname;
```

```sql
-- 2. ポリシーは9つ、DELETE は0（期待: 9 / 0）
select count(*) filter (where cmd in ('SELECT', 'INSERT', 'UPDATE')) as crud_policies,
       count(*) filter (where cmd = 'DELETE') as delete_policies
  from pg_policies
 where schemaname = 'public'
   and tablename in ('deck_folders', 'deck_tags', 'deck_organizations');
```

```sql
-- 2b. 内訳（期待: 各テーブル SELECT/INSERT/UPDATE が1つずつ、roles は {authenticated}）
select tablename, cmd, policyname, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('deck_folders', 'deck_tags', 'deck_organizations')
 order by tablename, cmd;
```

```sql
-- 3. grant（期待: 3行とも sel/ins/upd = t、del = f、anon_any = f）
select t.relname,
       has_table_privilege('authenticated', t.oid, 'select') as auth_select,
       has_table_privilege('authenticated', t.oid, 'insert') as auth_insert,
       has_table_privilege('authenticated', t.oid, 'update') as auth_update,
       has_table_privilege('authenticated', t.oid, 'delete') as auth_delete,
       (has_table_privilege('anon', t.oid, 'select')
        or has_table_privilege('anon', t.oid, 'insert')
        or has_table_privilege('anon', t.oid, 'update')
        or has_table_privilege('anon', t.oid, 'delete')) as anon_any
  from pg_class t
 where t.relnamespace = 'public'::regnamespace
   and t.relname in ('deck_folders', 'deck_tags', 'deck_organizations')
 order by t.relname;
```

```sql
-- 3b. 明示的な grant の中身（期待: authenticated の SELECT/INSERT/UPDATE のみ）
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('deck_folders', 'deck_tags', 'deck_organizations')
   and grantee in ('anon', 'authenticated', 'public')
 order by table_name, grantee, privilege_type;
```

```sql
-- 4. 1本目の関数5つ（期待: 5行。authenticated_execute は tombstone_* の3つが t、
--    内部用2つは f。anon_execute はすべて f。security_invoker はすべて t）
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       not p.prosecdef as security_invoker,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in (
     'deck_organization_tag_ids_valid',
     'deck_organization_set_timestamps',
     'tombstone_deck_folder',
     'tombstone_deck_tag',
     'tombstone_deck_with_related'
   )
 order by p.proname;
```

`deck_organization_tag_ids_valid` は **`authenticated_execute = t` が正解**です
（CHECK 制約は呼び出し元として評価されるため、これが無いと
`deck_organizations` への書き込みがすべて拒否されます）。
`deck_organization_set_timestamps` はトリガー関数なので `f` で正しい状態です。

```sql
-- 5. 既存の関数が変わっていない（期待: 1行、args = 'p_deck_id text'、戻り列2つ）
select pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result,
       p.proargnames
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname = 'tombstone_deck_with_versions';
```

```sql
-- 6. 既存テーブルが無傷（期待: 適用前と同じ行数）
select (select count(*) from public.decks) as decks,
       (select count(*) from public.deck_versions) as deck_versions,
       (select count(*) from public.deck_shares) as deck_shares;
```

```sql
-- 7. FK と index（期待: deck_fk, folder_fk が t、indexes = 4）
select exists (select from pg_constraint
                where conrelid = 'public.deck_organizations'::regclass
                  and conname = 'deck_organizations_parent_fkey') as deck_fk,
       exists (select from pg_constraint
                where conrelid = 'public.deck_organizations'::regclass
                  and conname = 'deck_organizations_folder_fkey') as folder_fk,
       (select count(*) from pg_indexes
         where schemaname = 'public'
           and indexname in ('deck_folders_user_updated_at_idx',
                             'deck_tags_user_updated_at_idx',
                             'deck_organizations_user_updated_at_idx',
                             'deck_organizations_user_folder_idx')) as indexes;
```

### 3-B. E-4（2本目の直後）

```sql
-- 8. 追加された2関数（期待: 2行、authenticated_execute = t、anon_execute = f、
--    security_invoker = t）
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       not p.prosecdef as security_invoker,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('upsert_deck_folder', 'upsert_deck_tag')
 order by p.proname;
```

```sql
-- 9. 新しい関数は合計7つ（期待: 7）
select count(*) as new_functions
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in (
     'deck_organization_tag_ids_valid', 'deck_organization_set_timestamps',
     'tombstone_deck_folder', 'tombstone_deck_tag', 'tombstone_deck_with_related',
     'upsert_deck_folder', 'upsert_deck_tag'
   );
```

```sql
-- 10. public ロールへの execute が残っていない（期待: 0行）
select p.proname
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in (
     'tombstone_deck_folder', 'tombstone_deck_tag', 'tombstone_deck_with_related',
     'upsert_deck_folder', 'upsert_deck_tag'
   )
   and has_function_privilege('public', p.oid, 'execute');
```

---

## 4. 失敗したときの戻し方

### どこまで作られているか

```sql
-- 何ができているかの一覧（適用前は0行）
select 'table' as kind, relname as name
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('deck_folders', 'deck_tags', 'deck_organizations')
union all
select 'function', proname || '(' || pg_get_function_identity_arguments(oid) || ')'
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in (
     'deck_organization_tag_ids_valid', 'deck_organization_set_timestamps',
     'tombstone_deck_folder', 'tombstone_deck_tag', 'tombstone_deck_with_related',
     'upsert_deck_folder', 'upsert_deck_tag'
   )
 order by kind, name;
```

### やり直す手順

`begin;` / `commit;` で囲んでいれば、失敗時は**何も作られていません**。エラー本文を
控えて `rollback;` を送り、原因を潰してから同じファイルを流し直します。

囲まずに実行して途中で止まった場合、または適用後に取り消したい場合の撤去 SQL
（**新規オブジェクトのみを消します。既存の3テーブルと7関数には触れません**）:

```sql
begin;

drop function if exists public.upsert_deck_tag(text, text);
drop function if exists public.upsert_deck_folder(text, text, integer);
drop function if exists public.tombstone_deck_with_related(text);
drop function if exists public.tombstone_deck_tag(text);
drop function if exists public.tombstone_deck_folder(text);

-- テーブルを消すとトリガーも一緒に消えます。FK の向き（organizations → folders /
-- decks）があるので organizations から。
drop table if exists public.deck_organizations;
drop table if exists public.deck_tags;
drop table if exists public.deck_folders;

drop function if exists public.deck_organization_set_timestamps();
drop function if exists public.deck_organization_tag_ids_valid(text[]);

commit;
```

**フロントを push した後にこれを実行すると、その時点でクラウドにあった Folder /
Tag / Organization は消えます**（端末のデータは無傷）。QA 中に撤去が必要になった
場合は、先に「どの端末にどのデータがあるか」を確認してください。撤去後に再適用
しても、端末側のマーカー（`hlsieve:cloud-organization-uploaded--<userId>`）が残って
いるため初回アップロードは自動では走りません。アカウントパネルの
「フォルダー・タグをクラウドへ保存」で上げ直せます。

---

## 5. 実機 QA（E-8）

前提: PC（端末A）とスマホ（端末B）で**同じアカウントにサインイン**、両方で Cloud
Sync が有効。ブラウザは通常のウィンドウ（プライベートは IndexedDB が消えるため不可）。

### 準備

1. 端末Aと端末Bで `https://hlsieve.com/decks` を開き、両方リロード（新しいバンドルを
   掴ませる）。
2. 端末Aで `/account` を開き、「未送信の変更」が0件であることを確認。

### QA-1: 初回アップロード（自動）

3. 端末Aで `/decks` を開き、フォルダー「大会用」とタグ「赤」を作り、デッキを1つ
   「大会用」＋「赤」に整理する。
4. `/account` をリロード。**期待**: 未送信0件、「最後にアップロードした時刻」が更新。
5. Supabase で `select count(*) from public.deck_folders;` が1以上。

### QA-2: 端末Bに現れる

6. 端末Bで `/account` を開く。フォルダー・タグの取り込みは同期の完了時に走るので、
   **「フォルダー・タグをクラウドへ保存」ボタンを押す**か、サインインし直す。
7. **期待**: 「すでに同じ内容です。」または取り込みの確認ダイアログ。
8. 端末Bで `/decks` を開く。**期待**: 左（PC）またはセレクト（スマホ）に「大会用」が
   現れ、タグチップに「赤」がある。デッキカードにフォルダー名とタグが出る。

### QA-3: 削除が伝わり、復活しない

9. 端末Bで `/decks` の管理パネルから「大会用」を削除（確認ダイアログの件数表示も
   確認）。
10. 端末Aで `/account` を開き、ボタンを押す（または再読み込み）。**期待**:
    「クラウドで削除されたフォルダー・タグ1件を、この端末からも外します。」が出る →
    「選択した内容で続行」。
11. 端末Aで `/decks`。**期待**: 「大会用」が消え、そのデッキは「フォルダーなし」。
    タグは残っている。
12. **復活しないことの確認**: 端末Aでもう一度ボタンを押す。**期待**:
    「すでに同じ内容です。」（フォルダーは戻らない）。
13. Supabase で `select id, name, deleted_at from public.deck_folders;` →
    `deleted_at` が入った行が残っている（物理削除されていない）。

### QA-4: アカウントパネルのボタン（既存ユーザー相当）

14. 端末Bのブラウザで `localStorage` から
    `hlsieve:cloud-organization-uploaded--<userId>` を削除し、リロード。
15. **期待**: クラウドに行があるので自動アップロードは走らず、マーカーが再作成される
    （DevTools で確認）。デッキや整理情報は変化しない。

### QA-5: 競合の提示

16. 端末Aと端末Bの両方を**オフライン**にする（DevTools の Offline、スマホは機内モード）。
17. 同じデッキを、端末Aでは「フォルダーX」に、端末Bでは「フォルダーY」に入れる
    （または両方でタグを変える）。
18. 端末Aをオンラインに戻し、`/account` でボタンを押して送信完了を待つ。
19. 端末Bをオンラインに戻し、`/account` でボタンを押す。**期待**: 「デッキの整理
    （1件）」の見出しで競合が出て、「この端末の割り当てを使う / クラウドの割り当てを
    使う」が選べる。片方を選んで続行 → 選んだ側になる。
20. フォルダー名の競合も見るなら: 両端末でオフラインにし、**同じフォルダー**の名前を
    別々に変更 → 同じ手順。**期待**: 「フォルダー名（1件）」の見出しと、両側に
    「（n件のデッキ）」。

### QA-6: テーブル不在だった期間に溜まったものがないこと

21. 両端末の DevTools → Application → Local Storage で、次の3キーが**空または存在
    しない**ことを確認:
    - `hlsieve:cloud-sync-pending-folders--<userId>`
    - `hlsieve:cloud-sync-pending-tags--<userId>`
    - `hlsieve:cloud-sync-pending-organizations--<userId>`
22. `/account` の「未送信の変更」が0件。
23. もし残っていたら、オンラインでリロードするか「今すぐ再送」を押せば送られます
    （テーブル不在期間中は pending に積まない設計なので、通常は空のはずです）。

### QA-7: 既存機能の非退行

24. デッキの作成・複製・削除・バージョン作成／復元・バックアップの書き出しと
    読み込みが従来どおり動く。
25. デッキを削除したとき、Supabase で
    `select deleted_at from public.deck_organizations where deck_id = '<消したデッキのid>';`
    に `deleted_at` が入る（新しい RPC が効いている）。

---

## 6. PostgREST のスキーマキャッシュ

PostgREST はスキーマをメモリにキャッシュしており、テーブルや関数を足しても**即座には
見えません**。Supabase は DDL を検知して自動でリロードしますが、反映は通常数秒〜1分
です。確実にするには E-5 で明示的にリロードを要求します。

```sql
notify pgrst, 'reload schema';
```

**待ってから push するのが確実ですが、待たずに push しても害はありません。** フロント
は未反映を `PGRST205`（スキーマキャッシュにそのリレーションが無い）として受け取り、
`missing-table` に分類して**未送信キューに積まず静かに諦めます**。キャッシュが反映
された時点から、次のページ読み込みで自然に同期が始まります。急ぐ場合は `notify` の
直後に push して構いません。落ち着いて進めるなら、`notify` 実行後に1分ほど置いてから
push してください。

反映の確認は、SQL Editor で `select count(*) from public.deck_folders;` が通ること
と、QA-1 の手順でアプリが実際に書き込めることを見るのが確実です。

---

## 7. 適用後の README 更新（E-9）

`supabase/README.md` に対して:

1. 冒頭の **「None of this SQL has been run yet.」を差し替える**。実状に合わせて、例:
   > As of &lt;適用日&gt;, `20260922000000`, `20260922100000`, `20260925000000`,
   > `20260927000000` and `20260927100000` are applied to production. Apply any new
   > migration in filename order.
2. 「Checking folder, tag and organization rules」節の
   **「It has not been applied to production.」を削除**し、適用日と、適用後に実行した
   検証クエリ（§3）の要点を1段落で記録。
3. **本番で matrix を実行しないこと**を明記（`auth` スキーマを作り、最後にアカウントを
   削除するため）。
4. `tombstone_deck_with_versions` と `tombstone_deck_with_related` が**両方存在し、
   どちらの順でも矛盾しない**こと、古いタブのために前者を残していることを Conventions
   に1行追加。
5. PostgREST のスキーマキャッシュについて1行（DDL 後は
   `notify pgrst, 'reload schema';`、反映まで最大1分、アプリは未反映を `missing-table`
   として静かに無視する）。

この更新はコード変更を伴わないので、`docs: record applied migrations` のような単独
コミットにするのが分かりやすい形です。

---

## 8. 適用とは別件の既知の問題

- **クラウド側の孤児 Organization**: 旧 RPC でデッキを削除した古いタブが残した行は、
  端末側では取り込まれませんがクラウドには残ります。掃除するなら、適用後に件数を
  確認してから判断してください（実行は任意）。

  ```sql
  -- 親デッキが tombstone なのに active な整理情報の件数
  select count(*)
    from public.deck_organizations o
    join public.decks d on d.user_id = o.user_id and d.id = o.deck_id
   where o.deleted_at is null and d.deleted_at is not null;
  ```

- **`DB_VERSION` を次に変更する前の対応**（`onversionchange` で close した後も
  キャッシュした IndexedDB 接続を保持している問題）。7B-3 では `DB_VERSION` を上げて
  いないため、今回の適用には無関係です。
