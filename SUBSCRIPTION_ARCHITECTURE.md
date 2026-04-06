# Obi-Tool サブスクリプション・アーキテクチャ設計書

## 要件

| 項目 | 仕様 |
|------|------|
| 無料トライアル | 1ヶ月（クレカ登録後に開始） |
| 通常月額 | ¥500/月 |
| キャンペーン | プロモコード入力で ¥100/月 |
| デバイス制限 | 1アカウント = 1デバイスのみ |
| オフライン猶予 | 最終認証から7日間はオフラインで利用可 |

## 全体構成

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Obi-Tool App   │────▶│  License API     │────▶│   Stripe    │
│  (Electron)     │◀────│  (バックエンド)    │◀────│  (決済)     │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                        ┌──────┴──────┐
                        │  Database   │
                        │  (SQLite /  │
                        │  Supabase)  │
                        └─────────────┘
```

## Stripe 設定

### 商品・価格設定
- **Product**: "Obi-Tool サブスクリプション"
- **Price (通常)**: ¥500/月 (recurring)
- **Price (キャンペーン)**: Stripe Coupon で ¥400 割引 → 実質 ¥100/月
- **Trial**: 30日間の無料トライアル (trial_period_days: 30)

### Coupon/Promotion Code
- Stripe Dashboard で Coupon 作成（forever or repeating）
- Promotion Code を生成（例: `CAMPAIGN2026`）
- Checkout Session 作成時に `allow_promotion_codes: true` を指定

## デバイス制限の仕組み

### デバイスID生成（Electron側）
```
デバイスID = SHA256(hostname + platform + cpuModel + totalMemory + username)
```
- 完全にユニークでなくてもよい（同一人物の同一PCを識別できればOK）
- ハードウェア交換時は「デバイスリセット」機能で対応

### 認証フロー
```
1. アプリ起動
2. ローカルにライセンスキャッシュがある？
   ├─ YES → 最終検証から7日以内？
   │   ├─ YES → オフライン起動OK（機能フル利用）
   │   └─ NO → サーバー認証必須（失敗→制限モード）
   └─ NO → ログイン/アクティベーション画面を表示

3. サーバー認証
   → POST /api/license/verify { email, licenseKey, deviceId }
   → サーバーはStripeサブスク状態を確認
   → deviceIdが登録済みと一致するか確認
   → OK → { valid: true, expiresAt, plan } を返す
   → NG → { valid: false, reason: "device_mismatch" | "expired" | ... }
```

### デバイス移行
- ユーザーが Web ポータル（Stripe Customer Portal）から「デバイスリセット」を実行
- 次に別デバイスでログインすると新デバイスが登録される
- 月1回までリセット可能（悪用防止）

## バックエンド API 仕様

### エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/auth/register` | メール+パスワードでアカウント作成 |
| POST | `/api/auth/login` | ログイン → JWT発行 |
| POST | `/api/license/activate` | ライセンス有効化 + デバイス登録 |
| POST | `/api/license/verify` | ライセンス検証（起動時に毎回） |
| POST | `/api/license/deactivate` | デバイス解除 |
| POST | `/api/stripe/webhook` | Stripe Webhook受信 |
| POST | `/api/stripe/create-checkout` | Checkout Session作成 |
| GET  | `/api/stripe/portal` | Customer Portal URL取得 |

### データベーススキーマ

```sql
-- ユーザー
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,  -- bcryptハッシュ
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ライセンス
CREATE TABLE licenses (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  stripe_customer TEXT,          -- Stripe Customer ID
  stripe_sub      TEXT,          -- Stripe Subscription ID
  status          TEXT DEFAULT 'trial',  -- trial | active | past_due | canceled
  plan            TEXT DEFAULT 'standard', -- standard | campaign
  trial_end       DATETIME,
  current_period_end DATETIME,
  device_id       TEXT,          -- 登録済みデバイスID (1つだけ)
  device_name     TEXT,          -- 表示用デバイス名
  device_reset_at DATETIME,     -- 最終リセット日
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 認証トークン
CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at DATETIME NOT NULL
);
```

## Electron アプリ側の変更

### 追加モジュール
- `license-manager.js` — ライセンス認証ロジック
  - デバイスID生成
  - サーバーAPI呼び出し
  - ローカルキャッシュ管理（暗号化して保存）
  - オフライン猶予期間チェック

### UIの変更
- **ログイン画面** — アプリ起動時に未認証なら表示
  - メールアドレス + パスワード入力
  - 「アカウント作成」リンク
  - 「キャンペーンコードを入力」ボタン
- **ライセンス状態表示** — ステータスバーに
  - `✓ ライセンス有効 (2026/05/01まで)`
  - `⚠ トライアル中 (残り15日)`
  - `✗ ライセンス期限切れ`
- **制限モード** — 期限切れ時はPDF閲覧のみ、編集・保存を無効化

### ローカルキャッシュ
```json
// userData/license-cache.json (AES暗号化)
{
  "email": "user@example.com",
  "licenseKey": "lic_xxxxx",
  "deviceId": "sha256hash...",
  "status": "active",
  "plan": "standard",
  "verifiedAt": "2026-04-01T10:00:00Z",
  "expiresAt": "2026-05-01T00:00:00Z"
}
```
- 最終verifiedAtから7日間はオフラインOK
- 7日超過 → サーバー認証必須（できなければ制限モード）

## 実装の優先順位

### Phase 1: アプリ側（先に作れる）
1. デバイスID生成モジュール
2. ライセンスマネージャー（API呼び出し + キャッシュ）
3. ログイン画面UI
4. 制限モード（ライセンス無効時の機能制限）

### Phase 2: バックエンド
1. ユーザー認証API (register/login)
2. ライセンスAPI (activate/verify/deactivate)
3. Stripe連携 (Checkout/Webhook/Portal)
4. デプロイ (Vercel / Railway / VPS)

### Phase 3: テスト・運用
1. E2Eテスト（トライアル→課金→キャンペーン→解約）
2. Stripe テストモードでの動作確認
3. 本番Stripeキー設定・デプロイ
