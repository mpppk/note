# Live Preview Editor 実装プラン

## 概要
現在のクリックでtextarea切り替えの仕組みを、CodeMirror 6ベースのObsidian風Live Previewエディタに置き換える。
カーソルが当たっていない部分はレンダリング後の表示、カーソルが当たっている部分はraw markdown記法が表示される（パーツ単位の粒度）。

## 技術スタック
- **CodeMirror 6** (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-markdown`)
- CodeMirror Decoration API（ViewPlugin + DecorationSet）でLive Preview表現
- React integration: `@codemirror/view` の EditorView を useRef + useEffect で管理

## アーキテクチャ

### エディタ構成
- ページ全体で**1つのCodeMirrorインスタンス**
- ドキュメント = 全セクションのmarkdownを結合（セクション境界はh1/h2で自動判定）
- embedセクション = ヘッダータイトル補完で選択された場合、参照先のコンテンツをインライン展開
- 保存時にh1/h2でテキスト分割 → DB上のsectionsレコードに書き戻し

### セクションモデル
```
Document:
  ## Section A (text)      ← textセクション（h2で始まる）
  paragraphs...
  ## Embedded Page Title   ← embedセクション（補完で選択されたタイトル）
  (展開されたcontent)       ← 参照先ページの内容（編集可能）
  ## Section B (text)      ← textセクション
  paragraphs...
```

### データフロー
1. ページロード時: sections → markdown結合 → CodeMirror doc
2. 編集中: CodeMirror doc → debounce → h1/h2で分割 → 各section API呼び出し
3. embed展開: 補完選択 → 参照先ページのsections取得 → ドキュメントに挿入
4. embed保存: embed範囲の変更検知 → 参照先ページのsection更新API呼び出し

---

## 実装フェーズ

### ✅ Phase 1: Core Editor Setup（完了）
CodeMirror 6の基盤を構築し、既存UIを置き換える。

- **1-1**: パッケージインストール
  - `@codemirror/view`, `@codemirror/state`, `@codemirror/language`
  - `@codemirror/lang-markdown`, `@codemirror/language-data`
  - `@codemirror/commands`, `@codemirror/autocomplete`
  - `@lezer/markdown` (markdown parser)
- **1-2**: React用 CodeMirror ラッパーコンポーネント作成 (`src/components/live-editor/`)
  - useRef + useEffect で EditorView を管理
  - propsでdoc(初期値), onChange(コールバック)を受け取る
  - クリーンアップでEditorView.destroy()
- **1-3**: 基本テーマ設定（Tailwindのデザインに合わせる）
  - ライトモード / ダークモード テーマ切り替え
  - フォント、行間、余白の調整
- **1-4**: `$pageId.tsx` で InlineBlockEditor → LiveEditor に置き換え
  - debounce (1.5秒) + blur 保存ロジック
  - ダークモード検知 (MutationObserver)

### ✅ Phase 2: Live Preview Decorations（完了）
カーソル位置に応じてraw/renderedを切り替えるDecoration実装。

- **2-1**: Decoration基盤の ViewPlugin 作成
  - カーソル位置のsyntax node判定 (`cursorInRange`)
  - decorationSetの差分更新 (`RangeSetBuilder`)
- **2-2**: Headings デコレーション
  - `#` マーク部分: カーソル外→非表示 + テキストに見出しスタイル
  - カーソル内→raw表示（`# heading text`）
- **2-3**: Bold / Italic デコレーション
  - `**text**`: カーソル外→`**`非表示 + bold style
  - `*text*`: カーソル外→`*`非表示 + italic style
- **2-4**: Inline Code デコレーション
  - `` `code` ``: カーソル外→バッククォート非表示 + code背景スタイル
- **2-5**: Links デコレーション
  - `[text](url)`: カーソル外→textのみ表示 + リンクスタイル
- **2-6**: Code Blocks デコレーション
  - ` ``` ` で囲まれたブロック: カーソル外→フェンス行スタイル + コードブロックスタイル

### Phase 3: Section Management
h1/h2によるセクション自動分割と保存。

- **3-1**: ドキュメントパーサー実装
  - h1/h2出現位置でテキストを分割するユーティリティ
  - 各セクションとDB上のsectionレコードのマッピング
  - 新規セクション検出 / 削除セクション検出
- **3-2**: 保存ロジック
  - debounce (入力停止後N秒) + blur時に保存
  - 差分検出: 変更があったセクションのみAPI呼び出し
  - セクション追加/削除の場合はcreate/delete API呼び出し
- **3-3**: セクション分離表示
  - セクション境界にvisualなセパレータ（Widget Decoration）
  - セパレータはnon-editable

### Phase 4: Embed System
ヘッダータイトル補完によるembed実現。

- **4-1**: ヘッダータイトル補完
  - h1/h2入力時にCodeMirror autocomplete起動
  - 既存ページタイトルのリストをソースに補完候補表示
  - 選択時にembedフラグをセクションメタデータに付与
- **4-2**: Embed展開表示
  - embedセクションの参照先ページ内容を取得
  - ドキュメント内にインライン展開（heading以降のbody部分）
  - embed範囲のvisual区別（左ボーダー + 薄い背景色）
- **4-3**: Embed編集 → 元ページ反映
  - embed範囲内の変更を検知
  - 変更を参照先ページのsection更新APIに反映
  - 別のdebounceで保存（自ページとは独立）
- **4-4**: Embedポーリング同期
  - 定期的に参照先ページのsections取得
  - 変更検知時: ユーザーがembed部分を編集中でなければ自動更新

### Phase 5: Auto-link
ページタイトルの自動リンク。

- **5-1**: テキスト内のページタイトル検出
  - 既存の `remarkAutoLink` と同等のロジックをCodeMirror decorationで実装
  - Longest match優先
  - 大文字/小文字を区別しない
- **5-2**: リンクDecoration
  - 検出されたタイトルにリンクスタイル適用
  - クリック時にページ遷移（React Router連携）
  - カーソル内は通常テキスト表示（リンクスタイルは維持）

### Phase 6: Drag & Drop
セクション単位の並び替え。

- **6-1**: セクション境界のドラッグハンドル
  - セパレータWidget内にドラッグアイコン表示
  - PointerSensor / TouchSensor 対応
- **6-2**: ドラッグ中のUI
  - ドラッグ中セクションのハイライト
  - ドロップ先インジケーター
- **6-3**: ドロップ時のドキュメント更新
  - CodeMirror doc内のテキストブロック移動
  - reorder API呼び出し

### Phase 7: Save & Sync
保存とコンフリクト管理。

- **7-1**: Debounced Auto-save
  - 入力停止後1〜2秒で自動保存
  - 保存中インジケーター表示
  - 保存エラー時のリトライ/通知
- **7-2**: Blur Save
  - エディタからフォーカスが外れた時に即座保存
- **7-3**: Conflict Detection
  - ポーリングで最新データ取得
  - ローカルの未保存変更とサーバーの変更を比較
  - コンフリクト検出時にユーザーへ通知（toast/banner）

### Phase 8: Mobile & Polish
モバイル対応と仕上げ。

- **8-1**: タッチ操作対応
  - タップでカーソル配置
  - ドラッグ&ドロップのタッチ対応
  - ビューポートのスクロール問題対処
- **8-2**: パフォーマンス最適化
  - 大きなドキュメントでのDecoration更新最適化
  - Lazy loading of embed contents
- **8-3**: アクセシビリティ
  - ARIA属性
  - キーボードナビゲーション
  - スクリーンリーダー対応

---

## 懸念事項と設計決定

### 1. ドキュメントとセクションの同期
- CodeMirrorのdocは1つの文字列。保存時にh1/h2でパースしてsectionsに分割する。
- セクションIDの追跡: 初回ロード時に各セクションの開始位置を記録し、編集に追従する。
- 新しいh1/h2が追加された場合 → 新規セクション作成API呼び出し
- h1/h2が削除された場合 → セクション結合（前のセクションに内容を追加）

### 2. Embedの境界管理
- embed範囲は「embedヘッダーの次の行」から「次のh1/h2の前」まで
- embed内容の変更範囲をトラッキングする必要がある
- 解決策: CodeMirror の RangeSet で embed 範囲を管理し、doc変更時にmapで追従

### 3. パフォーマンス
- Decoration の再計算はカーソル移動ごとに発生する
- 解決策: visible range のみ処理 + 差分更新（RangeSetBuilder）

### 4. 既存機能との整合性
- 「Add Section」フォームは廃止 → ヘッダーを書くだけでセクション作成
- embed追加は「Add Section (Embed Page)」UIを廃止 → ヘッダー補完で代替
- セクション削除はコンテキストメニューまたはセパレータ上のUIで

### 5. マイグレーション
- 既存のセクションデータはそのまま利用
- 表示時にセクションを結合してドキュメント生成
- ヘッダーが無いセクションは先頭に `## (Untitled)` 等を付与するか要検討

---

## ファイル構成（予定）

```
src/components/
  live-editor/
    index.tsx              # メインのLiveEditorコンポーネント
    use-editor.ts          # EditorView管理のhook
    theme.ts               # ライト/ダークテーマ定義
    extensions/
      live-preview.ts      # カーソル検知 + Decoration管理のViewPlugin
      headings.ts          # Heading decoration
      emphasis.ts          # Bold/Italic decoration
      inline-code.ts       # Inline code decoration
      links.ts             # Link decoration
      lists.ts             # List decoration
      code-blocks.ts       # Code block decoration
      autolink.ts          # Auto-link decoration (page titles)
    sections/
      parser.ts            # ドキュメント→セクション分割
      sync.ts              # セクション⇔API同期
      separator.ts         # セパレータWidget
      drag-drop.ts         # D&D機能
    embed/
      autocomplete.ts      # ヘッダータイトル補完
      expand.ts            # Embed展開ロジック
      sync.ts              # Embed変更同期
    save/
      debounce.ts          # Debounced保存
      conflict.ts          # コンフリクト検出
```

---

## 段階的リリース計画

1. **MVP (Phase 1-2)**: 基本的なLive Previewエディタ。セクション管理は既存のまま（各セクションが独立したCodeMirror）として実装し、Live Preview decorationを先に動作させる。
2. **統合 (Phase 3)**: セクション結合して1つのエディタ化
3. **Embed (Phase 4)**: Embed機能の実装
4. **完成 (Phase 5-8)**: Auto-link、D&D、保存最適化、モバイル対応

### MVP段階の妥協
MVPではまず**各セクションが独立したCodeMirror Live Preview**として動作させることで、早期にLive Preview体験を確認できる。その後Phase 3で統合する。
