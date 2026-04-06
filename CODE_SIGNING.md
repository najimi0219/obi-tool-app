# コード署名の設定手順

## 1. コード署名証明書の取得

Windows用のコード署名証明書を認証局から購入します。

推奨認証局:
- GlobalSign (年額 約$250〜)
- DigiCert (年額 約$400〜)
- Sectigo/Comodo (年額 約$200〜)

**EV証明書**（Extended Validation）を取得すると、Windows SmartScreenの警告が初回から出なくなります。
通常のOV証明書だとダウンロード実績が蓄積されるまで警告が出る場合があります。

## 2. 環境変数の設定

証明書ファイル（.pfx）を取得したら、以下の環境変数を設定します:

```bash
# .pfxファイルのパス（絶対パス）
set WIN_CSC_LINK=C:\path\to\certificate.pfx

# .pfxファイルのパスワード
set WIN_CSC_KEY_PASSWORD=your-certificate-password
```

**注意**: これらの値をソースコードやGitにコミットしないでください。

## 3. 署名付きビルドの実行

```bash
npm run build:signed
```

## 4. 署名の確認

ビルド後、`dist/` フォルダ内の `.exe` ファイルを右クリック → プロパティ → デジタル署名タブで署名を確認できます。

## CI/CD での利用

GitHub ActionsなどのCI環境では、証明書をBase64エンコードしてシークレットに保存し、ビルド時にデコードして使用します:

```yaml
env:
  WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```
