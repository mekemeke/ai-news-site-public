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


## ニュース一覧のページ分け（2026-10-27）

トップページは新しい順に1ページ15件。前へ／次へで移動する。ジャンル・日付・検索の変更時は1ページ目に戻り、絞り込み結果も15件ずつ表示する。記事詳細から一覧へ戻ると、開く前のページとスクロール位置を維持する。同じタブ内の表示状態であり、再読込すると1ページ目に戻る。記事のデータ形式や掲載対象数は変更しない。60日を超えた記事を通常の運用で削除する方針は維持し、この表示処理自体は記事を削除しない。

検証: `node --test tests/news-pagination.test.cjs tests/news-display.test.cjs`。


## ESOデータベースのテーマ（2026-10-27）

装備セット・スキル・特性／付呪は右上のダーク／ライトボタンで切り替える。`eso-theme.js` と `eso-theme.css` を3入口で共用し、ニュースと同じ `ai-news-preview-theme` 保存キーを使用。ページ移動や再読込時に選択を引き継ぐ。ブラウザーが保存を禁止しても、そのページでの切り替えは利用できる（次ページへの保持はできない）。品質別の白・緑・青・紫・金は暗い背景用の文字色へ切り替え、順序・数値・未確認表示を変えない。記事・装備・スキルデータやフィルター・保持期間は変更しない。

検証: `node --test tests/eso-theme.test.cjs`。


## 書記の一覧と組み合わせ確認（2026-10-27）

`eso-scribing.html` は `data/eso-scribing.json` を読み、グリモアの名前・スキルライン・選択候補の効果から検索する。詳細では主効果（Focus）、追加効果（Signature）、バフ・デバフ等（Affix）を選び、各候補の説明と出典を同じ欄へ整理する。逆引きタグは個別候補の分類であり、そのすべてを同時付与できるという意味ではない。

個別候補の `status` は `confirmed`（参照資料に対応根拠）、`unknown`（未確認）、`unavailable`（根拠付きの不可）。未確認は確認用に選べるが、不可とは区別して表示する。完全な組み合わせは同じグリモア内の `verifiedCombinations` の Focus / Signature / Affix ID がすべて一致し、個別候補も confirmed の場合だけ資料確認済みと表示する。候補リストの直積から有効な組み合わせを推定しない。資料確認済みでも現行Live版の実測保証ではなく、条件・更新版は出典に従う。未確認部分や能力値依存の最終数値を推測して埋めない。

収録データの確認日・対象版・資料の限界はページ冒頭と出典欄に明記する。入手先は折りたたみ。新しい HTML も noindex、同一オリジンの外部スクリプトのみを許可する既存CSPを保持し、共通のダークモードを引き継ぐ。元の装備セット・クラススキル・特性／付呪データ、記事の15件ページ分け、60日保持は変更しない。今回の資料取得には転載制約のあるカタログやアクセス制限の回避を使わない。

検証: `node --test tests/eso-scribing.test.cjs`。


## ムンダス・チャンピオン一覧と書記アイコン（2026-10-28）

ESOデータベースの6入口を共通ナビで移動できる。`eso-mundus.html` は13種の基本効果を比較し、`eso-champion.html` は118星を星座・装備要否・名前／効果で絞り込む。効果の日本語要約、確認日、資料の対応範囲、未確認の値を区別する。チャンピオンの段階ごとの投資・取得経路は未収録。ムンダスの神々適用後の数値は資料不一致があり未掲載。詳細は `ESO-MUNDUS-CHAMPION.md`。

書記は正確な対応を確認できた11グリモアの既存アイコンをリポジトリ内から表示する。Mender's Bond は対応画像を未確認のため従来の文字表示を維持。画像の権利元・取得元・非公式表示は `ESO-SCRIBING-ICONS.md` と `assets/eso/scribing/icon-manifest.json` に記録。画像追加によって未確認のスクリプト組み合わせを確認済みに変更しない。

検証: `node --test tests/eso-catalog.test.cjs tests/eso-scribing.test.cjs`。noindex・no-referrer・CSP・ダークモードを維持。



## Threads投稿の埋め込み（2026-10-28）
- 公開・公式埋め込みが許される元投稿だけを、該当する出典段落の直後に `{ "type": "threadspost", "url": "https://www.threads.com/@threads/post/DWjTI0cgH5O" }` の構造化ブロックで配置する。例の投稿をニュースとして追加しない。
- 同じ記事の `sources` にある正規URLだけを表示。HTTPSの threads.com/www.threads.com/threads.net/www.threads.net、`/@ユーザー/post/投稿ID` または `/t/投稿ID` だけを受け付け、www.threads.comへ統一しクエリ・フラグメントを除く。認証情報、非標準ポート、空白、バックスラッシュ、別ホスト・別パスは拒否。同一記事内の同一投稿IDは一度だけ。
- Meta公式 `blockquote.text-post-media` と `https://www.threads.com/embed.js` を使用。スクリプトは必要な詳細画面で一度だけ読み込み、公式SDKの `window.instgrm.Embeds.process()` で画面切替後も再処理する。古い画面の読み込みコールバックは無効化する。表示失敗・削除・非公開化・閲覧制限でも、ウィジェット外の元投稿リンクを残す。
- CSPはニュース入口 index.html の script-src と frame-src に `https://www.threads.com` だけを追加。ワイルドカード・unsafe-inline・unsafe-evalは追加しない。SDKのiframeサイズ用CSSは既存外部style.cssへ置く。他のHTML入口のCSPやnoindexは変更しない。
- 投稿画像・動画・本文を独自に取得・保存しない。生HTMLを記事データへ入れない。ログインや非公開範囲を回避しない。FacebookのOGPカードは実装しない。既存記事への自動後付けはしない。
- 公式資料: https://github.com/facebook/meta-embeds-for-wordpress （対応URLと公式スクリプト）／ https://www.threads.com/embed.js （2026-10-28に取得したSDKでmarkup、共有process API、動的再走査を確認）。

### 通常スキル：クラス以外の系統（2026-10-28）

`eso-skills.html` はクラスに加えて武器・ワールド・防具・ギルド・同盟戦争・種族・生産を、系統 → スキルラインで絞り込む。`data/skills.json` の既存 `classes` とクラス462件は保持し、非クラスは `categories` と `categoryId` を使用する。書記・チャンピオンは別入口のまま。旧 `class` / `tree` / 詳細URLと効果フィルターは互換を維持。属性杖による派生表示は変異と区別する。出典の掲載値はキャラクター条件による差や現行版との一致を保証せず、資料日と未確認範囲を併記する。詳細は `ESO-SKILLS.md`。
