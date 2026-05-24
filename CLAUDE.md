## 実装プランの作成

プランの作成時は、検討が必要な項目を徹底的に洗い出し、曖昧性が完全に排除されるまでユーザに質問・確認を行なってください。

## PRの作成

* PRには実装プランの内容をdetailsタグで記載してください。
* PRにはTest Planを記載してください。Test Planには、手動での動作確認の手順を記載してください。その後、
### PRのTest Planの動作確認
* PRを作成したら、実際にブラウザで動作確認を行なってください。
* ブラウザでの動作確認中はスクリーンショットを適宜撮影し、Gyazo CLI経由でアップロードしてください。
* 動作確認の完了後は、結果をPRのdescriptionに追記してください。結果には撮影したスクリーンショットのGyazo画像を記載してください。
  * 例: `![todos page](https://i.gyazo.com/c61050ac7cb4454cdaa9525f41810987.png)`

### Cloudflare Workersの環境での動作確認
* `bun run deploy:preview` でプレビュー環境にデプロイしてください。
* デプロイ後、プレビュー環境のURLで動作確認を行なってください。

# 環境
## 本番環境
* URL: https://note.niboshi.workers.dev

## プレビュー環境
固定のプレビュー環境です。DOを使用しているためPRごとのプレビュー環境は作成できません。
* URL: https://note-preview.niboshi.workers.dev
* デプロイ: `bun run deploy:preview`（ローカルから手動実行）
* プレビュー環境は共通のD1データベース (`note-preview-db`) を使用します。したがって、あるPRでデプロイした内容は他のPRからも確認できます。

## テストユーザ
テストユーザは以下の通りです。
* メールアドレス: test@example.com
* パスワード: 環境変数`TEST_USER_PASSWORD`に設定された値