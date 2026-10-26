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

## X投稿の埋め込み

記事の `blocks` に `{"type": "xpost", "url": "https://x.com/<ユーザー名>/status/<投稿ID>"}` を置くと、その位置にXの公式埋め込み（`blockquote.twitter-tweet` + `https://platform.twitter.com/widgets.js`、`data-dnt="true"`）を表示する。対応する話題の「出典」段落の直後に置く。話題との対応が不明な投稿は置かない。
受理するのはHTTPSの `x.com` / `www.x.com` / `twitter.com` / `www.twitter.com` の `/<ユーザー名>/status/<数字>` だけ。認証情報・ポート付き、他ホスト、画像・動画パスは表示しない。クエリとハッシュは捨てる。投稿IDは文字列のまま扱う。同じ投稿は1記事で1回だけ表示。生HTMLは入れない。
widgets.jsは詳細画面で埋め込みがあるときだけ1回読み込む。一覧では読み込まない。読込失敗・削除・非公開でも記事本文と「Xで元投稿を見る」リンクは残る。dntを指定してもXへの通信は発生する。
CSPは `script-src` と `frame-src` に `https://platform.twitter.com` だけを追加した。
## ニュースのサムネイルと本文解説リンク

記事データは従来のままでも表示できる。任意の `thumbnail` は `assets/news/` 配下のローカル画像パス（英数字・ハイフン・アンダースコアのディレクトリ／ファイル名、拡張子 svg/png/jpg/jpeg/webp、小文字）とし、空でない `thumbnailAlt` を併記する。外部URL、階層移動、クエリ付きパスは使えない。SVGは自作の静的な図形・文字のみとし、スクリプトや外部参照を入れない。権利を確認できる実画像だけを使い、X画像はダウンロードしない。

画像未指定・不正・読込失敗は、日付のない共通文字カードに戻る。`thumbnailKey` は `ai-news` / `ai-tips` / `cg-news` / `cg-tips` / `eso-news` / `eso-tips`。未指定は category の ai→AI、3dcg/terrain/cg→CG、eso→ESO（未知→AI）、kind の roundup/tips/tip/digest/小ネタ→小ネタ、その他（headline/youtube/未指定を含む）→ニュースで決まる。単体記事も実画像がなければこの文字カードを使う。一覧と記事先頭で同じ画像を再利用する。

本文ブロックの任意の `links: [{text, url}]` は `feature.text` を含め同じ処理。本文中の大文字小文字を区別した完全一致部分をすべてリンク化する（単語境界の推定なし）。重なる候補は最も左、同じ位置なら長い語、同じ語なら配列の先頭を優先。label、要約、記事タイトルには適用しない。HTMLやMarkdownは解釈しない。不正なリンク指定は無視し、本文はエスケープした平文のまま表示する。

URLはHTTPSの公開DNS名に限り、認証情報、非標準ポート、空白、バックスラッシュ、IPリテラル（公開IPを含む）、単一ラベルホスト、予約・内部名前空間（localhost/local/internal/lan/home/corp等）を拒否する。URL文字列の検査でありDNS解決や遷移後の転送先は検査しないため、編集者はリンク先が実際に公開された解説ページであることを確認する。APIや外部依存は不要。

例（既存の記事オブジェクトへ必要なフィールドだけ追加）：

```json
{
  "category": "3dcg",
  "kind": "roundup",
  "thumbnailKey": "cg-tips",
  "blocks": [
    {"type": "paragraph", "text": "レンダリングの仕組みを確認する。", "links": [{"text": "レンダリング", "url": "https://docs.blender.org/manual/ja/latest/render/index.html"}]},
    {"type": "feature", "label": "dotの所感", "text": "レンダリングの基礎も押さえたい。", "links": [{"text": "レンダリング", "url": "https://docs.blender.org/manual/ja/latest/render/index.html"}]}
  ]
}
```

権利確認済み画像を実際に配置した場合だけ、例えば `"thumbnail": "assets/news/blender-render.webp", "thumbnailAlt": "Blenderのレンダリング設定画面"` を追加する。この例の実画像ファイルは同梱していない。日々の更新は記事JSONと必要な画像の追加だけでよい。

表示ロジックの検証：`node --test tests/news-display.test.cjs`（ネットワーク・追加依存不要）。

単体記事用の別名 `ai-product` → `ai-news`、`cg-product` / `terrain-product` → `cg-news`、`eso-official` → `eso-news` も受理する。実画像未指定時は同じ6種の分野別文字カードを再利用し、製品画像や公式画像を生成・推定しない。
