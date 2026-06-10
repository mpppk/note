# アーキテクチャ一貫性レビュー (2026-06)

これまでのコンセプト変更・アーキテクチャ変更の経緯を踏まえ、コードの一貫性・冗長性を調査した結果をまとめる。

## 変遷の整理

コミット履歴から、本リポジトリは以下の大きな変遷を経ている。

1. **TODOアプリ** として開始（#10 で todos 機能を削除）
2. **Block + Page** の2概念モデル（#5）
3. **Page-only + Embed** アーキテクチャへ移行（#17 / bd7b700、blocks テーブル廃止）
4. **CodeMirror 6 ライブプレビューエディタ** 導入（#26、react-markdown ベースの表示を置換）
5. **セクション自動分割**（#29〜#39、H1/H2 でセクションを自動分割・削除する D1 ベースのモデル）
6. **Yjs + Durable Object によるリアルタイム共同編集**（#42）

各移行で「次のアーキテクチャ」は導入されたが「前のアーキテクチャの撤去」が不完全で、特に **5 と 6 が現在も衝突したまま共存している** のが最大の課題。

---

## 1. 【最重要】セクションモデル(D1) と Yjs ドキュメントの「二重の真実」

### 現状のデータフロー（3系統が併存）

| 経路 | トリガ | 書き込み先 |
|---|---|---|
| A. Yjs 経由 | エディタでの通常編集 | WebSocket → DO → 5秒デバウンスで `pages.yjsState` + **先頭 text セクションの body** (`src/do/collab-room.ts:120-148`) |
| B. HTTP 経由（リコンシリエーション） | 30秒ポーリング (`$pageId.tsx:127`) で取得した body に複数 H1/H2 を検出 | `updateSectionBody` + `addTextSectionAfter` で D1 のセクションを分割 (`$pageId.tsx:242-272`) |
| C. HTTP 経由（embed 編集） | `EmbedPageView` 内の `InlineBlockEditor` の 1.5秒デバウンス | `updateSectionBody` で D1 直接更新（Yjs/DO には通知されない） |

### 問題点

#### 1-1. DO の saveState が「結合ドキュメント全文」を先頭セクションに書き込む
`src/do/collab-room.ts:131-146` は Yjs ドキュメント（= 全 text セクションを `\n\n` 結合したもの、`loadState` の bootstrap 参照: 同 96-109 行）の **全文** を、**先頭の text セクション1つ** に書き込む。

text セクションが複数ある場合、D1 上では「先頭セクション = 全文」「2番目以降のセクション = 旧内容のまま」となり、その後クライアントのリコンシリエーション（経路B）が先頭セクションを分割すると **旧セクションと内容が重複する** 潜在バグがある。旧セクションを削除する経路は存在しない（後述の通り `onDeleteSection` は死んでいる）。

#### 1-2. 経路C（embed 編集）と経路A（DO 保存）の lost update
embed されたページを `InlineBlockEditor` で編集すると `updateSectionBody` で D1 を直接更新するが、同じページが別タブ/別ユーザによって Yjs 経由で開かれている場合、DO の5秒タイマーが古い Yjs 内容で同セクションを上書きし、編集が失われうる。逆方向（HTTP 更新が Yjs に反映されない）も同様で、embed 経由の編集と本体ページの編集は **整合する仕組みがない**。

#### 1-3. DO 再起動による編集ロスの窓
DO はメモリ上の Yjs doc が真実で、永続化は5秒デバウンスのみ。DO の eviction/再起動がタイマー発火前に起きると最大5秒分の編集が失われる。`DurableObjectState.storage` への書き込みや `alarm` の利用は行っていない。

#### 1-4. sectionRangesField が初期値のまま更新されない
`PageEditor` は `sectionRangesField` をマウント時の `mergeSections(sections)` の結果で初期化する（`src/components/page-editor/index.tsx:172,261`）が、実際の doc は空から始まり Yjs 同期で埋まる。`setSectionRangesEffect` を dispatch するのは死んでいる moveSection ハンドラのみのため、**レンジ情報は編集が進むほど実態とズレる**。このズレたレンジが embed 挿入位置の決定（`embedSelectEffect` ハンドラ、同 181-191 行）に使われており、セクション構造が変わった後の embed 挿入は誤った `afterSectionId` を渡しうる。

### 推奨

場当たり的な修正ではなく、**真実の所在を1つに決める** ことを推奨する。現状すでに UI は「ページ全体で1つの結合ドキュメント」なので、

- **推奨案: Yjs ドキュメント（`pages.yjsState`）を text コンテンツの唯一の真実とする**
  - D1 の text セクション複数行保持をやめ、ページ本文は1レコード（または `pages` 直下のカラム）に集約する
  - embed は「本文中のマーカー（例: 専用記法）」または order を持つ別テーブルとして本文から分離する
  - 検索・embed 表示用のプレーンテキストは DO の saveState が派生データとして書き出す（現在の動きを「仕様」に昇格させる）
  - これにより経路Bのクライアント側リコンシリエーション（30秒ポーリング + H1/H2分割）と、その全ヘルパー（`splitBodyAtAllH1H2` 等）を削除できる

---

## 2. 死蔵コード（全て grep で参照ゼロを検証済み）

### 2-1. 旧アーキテクチャの残骸ファイル

| ファイル | 行数 | 由来 | 状態 |
|---|---|---|---|
| `src/components/markdown.tsx` | ~100 | react-markdown 時代（#26 以前） | どこからも import されていない |
| `src/lib/remark-autolink.ts` | ~60 | 同上 | 実質未使用。`block-editor.tsx:3` が型 `TitleEntry` のためだけに import（同型は `live-editor/extensions/auto-link.ts` にも存在） |
| `src/components/page-editor/section-separator.ts` | 228 | セクション並べ替えUI（#19/#40 時代） | エディタの extensions に組み込まれておらず、どこからも import されていない |
| `src/components/ui/checkbox.tsx` | - | shadcn 導入時 | 未使用 |
| `src/components/ui/textarea.tsx` | - | textarea 編集時代の残骸 | 未使用 |

### 2-2. 未使用サーバ関数（`src/server/notes.ts`）

| 関数 | 行 | 状態 |
|---|---|---|
| `getPage` | 63 | フロントから呼ばれていない（`getPageWithEmbeds` に置換済み） |
| `addEmbedSection` | 232 | `addEmbedSectionAfter` に置換済み |
| `searchBacklinks` | 606 | 完全実装されているが UI が存在しない（未完の機能） |

### 2-3. 到達不能なリオーダー機能一式

セクション並べ替えは経路全体が死んでいる：

```
section-separator.ts のボタン（エディタに未組込）
  → moveSectionEffect（dispatch されない）
  → PageEditor の moveSection ハンドラ (page-editor/index.tsx:193-219、デッドコード)
  → onReorder コールバック（呼ばれない）
  → reorder.mutate ($pageId.tsx:419、実行されない)
  → reorderSections サーバ関数 (notes.ts、到達不能)
```

削除するか、機能として復活させるかを決めるべき。中途半端に全部残っているのが最も読み手を混乱させる。

### 2-4. PageEditor の「受け取るが無視する」props

`src/components/page-editor/index.tsx:73-79` で `onSave` / `onAddSectionAfter` / `onDeleteSection` / `placeholder` を `_` プレフィックスにリネームして握りつぶしている。呼び出し側 `$pageId.tsx:410-430` はこれらに本物の mutation を渡しており、**保存処理が動いているように見えて実際は Yjs 経由でしか保存されない**。Yjs 移行（#42）の残骸であり、インターフェースから削除すべき。

## 3. 未使用依存パッケージ

`package.json` から削除可能（全て src/ 内に import なし）：

- `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`（ドラッグ&ドロップは結局 CodeMirror 内実装になり、それも現在は死蔵）
- `react-markdown` / `remark-gfm`（`markdown.tsx` 削除と同時に）
- `mdast-util-find-and-replace`（`remark-autolink.ts` 削除と同時に）
- `@radix-ui/react-checkbox`（`ui/checkbox.tsx` 削除と同時に）

## 4. ロジックの重複（DRY違反）

### 4-1. オートリンクのマッチングロジックが二重実装
- 旧: `src/lib/remark-autolink.ts`（remark プラグイン版、未使用）
- 現: `src/components/live-editor/extensions/auto-link.ts`（CodeMirror 版、稼働中）

正規表現生成・タイトルフィルタリング・最長一致のアルゴリズムがほぼ同一。旧版を削除し `TitleEntry` 型の import 元を `auto-link.ts` に統一する。

### 4-2. `notes.ts` 内のセクション order 計算の重複
- 「末尾 order + 1024」の計算: `addTextSection` (154-160行) と `addEmbedSection` (245-250行) でほぼ同一
- 「After 挿入位置 = (前後の order の中間)」の計算: `addTextSectionAfter` (201-214行) と `addEmbedSectionAfter` (307-320行) でほぼ同一

`getNextSectionOrder()` / `calcInsertOrder()` のようなヘルパーに共通化するか、`addEmbedSection` の削除と合わせて `addSectionAfter(type, ...)` に統合する。

## 5. 命名・構成の不整合（軽微）

- **`src/components/block-editor.tsx`**: Block 概念は #17 で廃止済みだが、ファイル名・コンポーネント名（`InlineBlockEditor`）に残存。実態は「embed セクションのデバウンス保存付きエディタ」なので `embed-section-editor` 等への改名が妥当
- **`src/server/notes.ts`**: エンティティは一貫して Page/Section なのにファイル名だけ notes。`pages.ts` への改名が妥当
- **コンポーネントのファイル名規約混在**: `Header.tsx` / `ThemeToggle.tsx`（PascalCase）と `block-editor.tsx` / `title-manager.tsx`（kebab-case）
- **`package.json`**: TanStack 系 7 パッケージが `"latest"` 指定（他は `^` 固定）。再現性のためバージョン固定を推奨。また bun 利用なのに `pnpm.onlyBuiltDependencies` セクションが残存
- **`/org/$orgId/team/$teamId/pages/` ルート**: リダイレクトのみ（#25 統合の名残）。旧URLへの後方互換が不要なら削除可

## 6. テスト・ドキュメントの未整備

- `playwright-live-editor-test.ts` がリポジトリ直下に単発スクリプトとして放置。`@playwright/test` は devDependencies にあるが playwright.config も CI 統合もない。`e2e/` 配下への移動と CI 統合、または削除を推奨
- `docs/live-preview-plan.md` は Yjs 導入前のアーキテクチャ（「保存時に h1/h2 で分割して DB に書き戻し」）を現役の設計として記述しており、現状と乖離。経緯ドキュメントとして残すなら冒頭に「歴史的文書」と明記する

## 7. 良好だった点

- DB マイグレーション履歴は変遷（todos 削除 → blocks 削除 → yjsState 追加）を正しく反映し、現行スキーマと整合している
- 認証ガード（`beforeLoad` + `getSession`）と認可チェック（`requireOrgMember`）は全ルート・全サーバ関数で一貫
- loader での `prefetchQuery` + `useQuery` + mutation 後の `invalidateQueries` のパターンは全ルートで統一されており、query key の命名も規則的
- zod による入力バリデーションは全サーバ関数で統一
- wrangler.jsonc の bindings（D1 / DO / R2）とコードの利用は整合

## 推奨ロードマップ

1. **Phase 1（機械的な掃除・リスクほぼゼロ）**: §2 の死蔵ファイル・未使用サーバ関数・§3 の未使用依存を削除し、`TitleEntry` の import 元を統一する
2. **Phase 2（設計判断が必要）**: §1 の真実の一本化。リオーダー機能（§2-3）の要否もここで決める（Yjs 一本化後は「ドキュメント内でテキストを動かすだけ」になり専用機能は不要になる可能性が高い）
3. **Phase 3（リネーム・整備）**: §5 の命名統一、§6 のテスト基盤整備
