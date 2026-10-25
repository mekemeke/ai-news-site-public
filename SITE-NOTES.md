# ニュースとESO参考資料

- ニュース分類のIDは `ai` / `3dcg` / `terrain` / `eso`。表示は AI / 3DCG / 地形生成CG / ESO。
- Blender実記事は `3dcg`。本文・要約・出典・動画IDは維持した。
- 架空サンプル4件は公開JSONから除外した。必要なら `git show f8432060592a97234f734e76b1c7f52250c66ad9:data/articles.json` で復元できる。UIも `sample: true` / `sample-` IDを除外する。
- 上位ナビはニュースとESOデータベースを分離。`eso.html` が装備セット入口、`eso.html#set/<id>` が将来収録するセットの詳細URL。未収録IDは見つからない旨を表示する。ハッシュ方式なのでGitHub Pagesのサブパスでも直接開ける。スキルは準備中の表示のみ。
- `data/sets.json` は3件。HyperioxesのU51対応ガイド（2026-10-11更新）を2026-10-25に資料確認した主要効果の要約で、全ボーナス・全件DBではない。ゲーム内検証なし。DMM公式は名称・一部分類の照合のみで、古い効果説明は採用していない。代表頭部アイコン3枚をローカル保存。全部位や通常版・完璧版の差、ライブ性能の証拠として扱わない。
- 新規項目には一意の英小文字・数字・ハイフンの `id`、`name`、`category`、`summary`、`sourceDate`、`verifiedAt`、`effects`（`label` / `text`）、`sources`（`label` / `url`）を使う。任意の `englishName` は英名の表示・検索に使用し、`location` も検索対象。任意の `verificationNote` に「資料で確認済み、ゲーム内検証なし」など資料の確認範囲を記載でき、一覧と詳細に表示する。`verifiedAt` は参照資料の確認日でありゲーム仕様の確認日ではない。分類は収録項目から作る。
- ESO-HubとLibSetsのデータ・画像は取り込んでいない。今後も資料ごとの再利用条件と現行仕様を確認してから追加する。外部データは文字列としてエスケープし、出典URLはHTTPSのみリンク化する。CSPは維持した。

## 検索エンジン

すべてのHTML入口（`index.html` / `eso.html`）のheadに `meta name="robots" content="noindex"` を設定した。新しいHTMLを追加するときも必須。
[Google公式のnoindex仕様](https://developers.google.com/search/docs/crawling-indexing/block-indexing)に従い、全面クロール拒否のrobots.txtは追加しない。プロジェクト配下のrobots.txtはホスト全体の設定にならない。
noindexはアクセス制御ではない。サイトとリポジトリは公開のままで、既存検索結果の削除には再クロールが必要となり、即時の削除は保証されない。認証・権限・Search Consoleは変更していない。

## 維持する運用

既存のAPI workflow、APIスクリプト、Secrets、`api-results`結果ブランチには変更を加えていない。今回の作業ではAPIの実呼び出し、mainへのpush、公開反映は行っていない。

## 装備アイコン

任意の `icon` は `assets/eso/` 直下の英数字・ハイフン・アンダースコアのファイル名（PNG / JPEG / WebP）のみ。`iconAlt` に空でない代替テキストを指定する。外部URL・階層移動・不正なパス・未指定は画像を表示しない。取得・利用条件を確認できた実物画像だけを追加し、未取得または読込失敗は未掲載と表示する。

現在の3枚は親が取得元と非商用の利用範囲を確認したHyperioxes参照画像に限定する。元ファイルは `gear_breton_medium_head_d.png` / `gear_undspriggan_head_a.png` / `gear_lucentguardian_heavy_head_a.webp`（https://static.hyperioxes.com/images/icons/）。元ページは https://hyperioxes.com/eso/tank/sets 。サイトのフッターに権利帰属・画像参照元・非公式非商用を表示する。
