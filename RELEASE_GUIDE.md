# Obi-Tool リリース手順

## 1. バージョン更新
`package.json` の `"version"` を上げる（例: `1.4.3` → `1.4.4`）

## 2. コミット & タグ & プッシュ
```powershell
git add -A
git commit -m "v1.4.4: 変更内容の説明"
git tag v1.4.4
git push origin main
git push origin v1.4.4
```

## 3. ビルド
```powershell
npm run build
```
※ `npm run build:publish` は GH_TOKEN 未設定だとエラーになるので `npm run build` でOK

## 4. GitHub Release 作成
1. https://github.com/najimi0219/obi-tool-app/releases/new を開く
2. タグ: `v1.4.4` を選択
3. タイトル: `v1.4.4`
4. 以下の3ファイルをドラッグ&ドロップでアップロード:
   - `dist\Obi-Tool.Setup.1.4.4.exe` — インストーラー本体
   - `dist\latest.yml` — 自動アップデートのバージョン情報（これが無いと既存ユーザーに通知が届かない）
   - `dist\Obi-Tool.Setup.1.4.4.exe.blockmap` — 差分アップデート用（301MBのexe全体ではなく差分だけDLされるので高速化）
5. **Publish release** をクリック

### latest.yml が dist に無い場合
ビルド後に `dist\latest.yml` が生成されていなければ手動で作成する。
exe の sha512(base64) は PowerShell で取得できる:
```powershell
$hash = Get-FileHash "dist\Obi-Tool.Setup.1.4.4.exe" -Algorithm SHA512
[Convert]::ToBase64String([byte[]]($hash.Hash -replace '..', '0x$&,' -split ',' | Where-Object {$_}))
```
または簡易的に:
```powershell
certutil -hashfile "dist\Obi-Tool.Setup.1.4.4.exe" SHA512
```
で得たhex値を base64 変換して以下の形式で作成:
```yaml
version: 1.4.4
files:
  - url: Obi-Tool.Setup.1.4.4.exe
    sha512: (base64ハッシュ)
    size: (ファイルサイズ bytes)
path: Obi-Tool.Setup.1.4.4.exe
sha512: (base64ハッシュ)
releaseDate: '2026-04-20T00:00:00.000Z'
```

## 5. LP のダウンロードリンク更新
`obi-tool-api/public/index.html` 内のexeファイル名を新バージョンに変更（5箇所）:
```
Obi-Tool.Setup.1.4.3.exe → Obi-Tool.Setup.1.4.4.exe
```
変更後にデプロイ:
```powershell
cd obi-tool-api
vercel --prod
```

## 自動アップデートについて
- 既存ユーザーはアプリ起動時 + 30分ごとに `latest.yml` をチェック
- `latest.yml` がリリースに含まれていないと自動アップデートが動かない
- exe と latest.yml の両方が必ずリリースにアップロードされていること
