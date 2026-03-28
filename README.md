# Obi-Tool デスクトップアプリ

マイソク業者情報削除ツールのElectronデスクトップアプリ版です。

## セットアップ

```bash
cd obi-tool-app
npm install
```

## 開発・起動

```bash
npm start
```

## ビルド（Windowsインストーラー作成）

```bash
npm run build
```

`dist/` フォルダにインストーラー（.exe）が生成されます。

## PDF関連付け

アプリメニュー「設定」→「PDFの既定アプリに設定」から、Windowsの既定アプリ設定画面を開いて手動で切り替えられます。

## 機能

- PDFダブルクリックでObi-Toolが起動（関連付け設定後）
- Ctrl+O でPDFファイルを開く
- ネイティブ保存ダイアログでPDF出力
- ドラッグ&ドロップ対応
- 既存の全機能（帯自動検出、AI検出、削除後確認等）をそのまま搭載
