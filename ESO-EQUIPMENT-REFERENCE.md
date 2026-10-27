# ESO 特性・付呪リファレンス

## ページと責務

- `eso-traits-enchants.html`：閲覧専用の一覧と詳細。既存の `eso.html` / `eso-skills.html` にナビリンクを1つずつ追加。
- `eso-traits-enchants.js`：ローカルJSONの検証、特性／付呪切替、装備分類・個別装備・検索のAND絞り込み、詳細、ハッシュURL復元。
- `eso-traits-enchants.css`：すべて `.eso-reference-page` 内に限定。ニュース・セット・スキルのレイアウトに適用しない。
- `data/eso-equipment-reference.json`：出典で確認した装備対応と効果の日本語要約。正規名未照合の項目は英語で表示。
- `tests/eso-traits-enchants.test.cjs`：新機能とセキュリティのテスト、実データ全件・全装備組合せ検査。

効果量の計算機や推定式ではない。品質・レベル・装備部位差はデータの注記で示し、未確認の数値や画像を補わない。資料確認日と現行ゲーム内での検証日は区別する。

## 品質別の数値表示

- 一覧カードと詳細に、白 / 緑 / 青 / 紫 / 金の5品質を常時表示する。色だけでなく品質名を付ける。
- 特性は**装備自体の品質**、付呪は**グリフの品質**として明記する。CP160等の基準レベル、片手 / 両手や大小部位の条件は数値表の近くに表示する。
- `numericValue` は任意。旧データや品質行が未収録の場合は `— 未確認` とし、0・他品質からの補間値を作らない。
- `partial` は「参考値（現行未実測）」と表示し、資料時点や出典間の差が書かれた `summary` / `notes` を折り畳まない。`verified` もゲーム内実測済みを意味しない。
- 品質数値パネルは白背景を固定。通常品質は白いチップと濃灰文字、緑・青・紫・金は濃色文字とし、全5色がWCAG AA 4.5:1以上となることを自動テストする。

任意の `numericValue` 形式：

```text
qualityBasis: equipment（特性） / glyph（付呪）
basis: 基準レベル・装備部位・除外する補正などの条件文字列
qualities: [{id, label, status, summary, variants: [{label, value}]}]
notes: 文字列または文字列配列
sourceIds: 数値根拠の出典ID配列
```

品質IDは `normal` / `fine` / `superior` / `epic` / `legendary`。
statusは `verified` / `partial` / `unverified` のみ。`variants` の値は単位を含む文字列で、部位や片手 / 両手などの文脈ラベルを伴う。
未確認行に数値variantsは許容せず、確認値には解決可能な数値出典を必須とする。品質の重複、不明なID、品質基準の混同、不正型は読込エラーにする。

## 操作・URL

- 初期表示は特性。付呪へ切り替えても装備と検索条件を保持する。
- 武器 / 防具・盾 / 宝飾品に加え、JSONに収録された個別装備で絞り込む。
- 分類変更時は個別装備の条件だけを解除。条件クリアは現在の特性／付呪タブを維持し、分類・装備・検索を解除する。
- 検索は日本語名・英名・効果・条件・注記・出典で確認した別表記／旧称・対象装備名を対象とする。NFKC正規化し、空白区切りの語はAND検索。
- `#?view=enchantments&group=armor&equipment=shield` のように条件をURLに保存。
- `#trait/<id>` / `#enchantment/<id>` で詳細を開く。詳細URLのクエリに絞り込み条件を保持する。
- 戻るリンク、ブラウザーの戻る／進む、直接リンクの再読込に対応。存在しない詳細は専用表示にする。
- ゼロ件は未収録の可能性を明示し、ゲーム内に存在しないとは断定しない。

## データと安全性

`schemaVersion: 2`（旧 `1` も読込可能）。トップレベルは `meta`、`sources`、`equipmentTypes`、`traits`、`enchantments`、任意の `rules`。

- 装備は `traitGroup` と `glyphGroup` をそれぞれ持つ。特性とグリフの適用範囲を混同しない。
- エントリーの `group` は `weapon` / `armor` / `jewelry` のいずれか。
- `applicableEquipmentIds` は参照先と分類の一致を検証。付呪では必須、特性では未記載時のみ同じ `traitGroup` の装備から導出。
- 重複ID、不明な装備・出典、異なる分類への適用、壊れた必須データは描画せずエラー表示。
- 全データ文字列はHTMLエスケープ。出典URLは通常のHTTPS DNSホストだけをリンク化し、資格情報・独自ポート・IP・ローカルホスト等を拒否。
- 外部スクリプト・画像・フォント・API・アクセス解析は追加しない。既存のCSP、`noindex`、`no-referrer` を維持。
- データ読込失敗後の再試行、同時クリックの重複リクエスト防止、失敗時の古い一覧消去に対応。

## 検証コマンド

```sh
node --check eso-traits-enchants.js
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -v
```

新規テストは装備対応、切替、検索、別名、空表示、リセット、詳細・URL復元、不正パラメーター、XSSとURL検証、スキーマ拒否、読込失敗／再試行、CSP／CSS限定、実データ全件を含む。既存ニュース・650セット・462スキルのテストも合わせて実行する。

実ブラウザーの表示検証は公開後に既存の管理されたクラウドブラウザー経路で行う。ローカルブラウザーや別経路によるプレビュー制限の回避は行わない。DOMモックテストは実ブラウザー表示の合格を意味しない。
