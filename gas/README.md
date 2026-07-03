# GAS（受け取りサーバー）— clasp でのデプロイ

`index.html` から送られる表面/裏面の2枚を Google Drive に保存する Web アプリです。
[clasp](https://github.com/google/clasp) でデプロイします。

## 構成

- `コード.gs` … 本体（`doPost` で2枚受信 → Drive 保存、`doGet` は疎通確認）
- `appsscript.json` … マニフェスト（Webアプリ設定・OAuthスコープ込み）
- リポジトリ直下の `.clasp.json` … `rootDir: gas` を指定（`scriptId` は `clasp create` で自動入力）

> `FOLDER_ID` を空のままにしておくと、マイドライブに「おはツイキーホルダー受付」フォルダを
> 自動作成してそこへ保存します。特定フォルダに保存したい場合のみ `コード.gs` の `FOLDER_ID` を設定。

## デプロイ手順

事前に **一度だけ** 必要な作業（Google アカウント認証が絡むため手動）:

1. **Apps Script API を有効化**: <https://script.google.com/home/usersettings> で「Google Apps Script API」をオンにする。
2. **clasp ログイン**: 下記コマンドでブラウザ認証する。

```bash
# リポジトリのルートで実行
npx --yes @google/clasp login

# 新規スクリプトプロジェクトを作成（.clasp.json の scriptId が自動で入る）
npx --yes @google/clasp create --type standalone --title "おはツイキーホルダー受付" --rootDir gas

# コードをアップロード
npx --yes @google/clasp push

# ウェブアプリとしてデプロイ
npx --yes @google/clasp deploy --description "v1 表裏2枚対応"

# 発行された /exec URL を確認
npx --yes @google/clasp deployments
```

3. `deployments` に表示された `@HEAD` ではない方のデプロイIDを使い、
   `https://script.google.com/macros/s/＜デプロイID＞/exec` を
   `index.html` の `ENDPOINT_URL` に貼り付ける。
4. ブラウザでその `/exec` を開き `{"status":"ok",...}` が出れば疎通OK。

> **初回のみ：スコープの承認が必要**
> Drive を使う「自分として実行」の Web アプリは、デプロイ者が一度スコープを
> 承認するまで、匿名アクセスが Google ログイン画面（HTTP 403）に飛ばされます。
> オーナー本人が一度だけ承認してください（どちらか）:
> - スクリプトエディタ（`clasp open-script`）で `doGet` を実行 → 権限を承認、または
> - デプロイ者の Google にログインした状態で `/exec` を開き、権限承認まで進む。
> 承認後は、匿名アクセスでも `{"status":"ok"}` が返ります。

## 更新時

コードを変えたら再アップロード＆再デプロイ:

```bash
npx --yes @google/clasp push
npx --yes @google/clasp deploy --description "更新内容"
```

同じ Web アプリ URL を保ちたい場合は、既存デプロイIDを指定して上書き:

```bash
npx --yes @google/clasp deploy --deploymentId ＜既存のデプロイID＞ --description "更新内容"
```
