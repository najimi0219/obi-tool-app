/**
 * ライセンスマネージャー
 * - サーバーAPI通信（ログイン/ログアウト/認証/アクティベート）
 * - ローカルキャッシュ管理（AES暗号化）
 * - オフライン猶予判定（月1回=30日）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { generateDeviceId, getDeviceName } = require('./device-id');

// --- 設定 ---
const API_BASE_URL = 'https://obi-tool-api.vercel.app';
const OFFLINE_GRACE_DAYS = 30; // オフライン猶予期間（日）
const CACHE_ENCRYPTION_KEY = 'obi-tool-license-v1-key!'; // 簡易暗号化キー

// --- キャッシュファイル管理 ---
function getCachePath() {
  return path.join(app.getPath('userData'), 'license-cache.enc');
}

function encryptData(data) {
  const key = crypto.createHash('sha256').update(CACHE_ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encStr) {
  try {
    const key = crypto.createHash('sha256').update(CACHE_ENCRYPTION_KEY).digest();
    const [ivHex, encrypted] = encStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

function loadCache() {
  try {
    const cachePath = getCachePath();
    if (!fs.existsSync(cachePath)) return null;
    const encStr = fs.readFileSync(cachePath, 'utf8');
    return decryptData(encStr);
  } catch (e) {
    return null;
  }
}

function saveCache(data) {
  try {
    const cachePath = getCachePath();
    fs.writeFileSync(cachePath, encryptData(data), 'utf8');
  } catch (e) {
    console.error('License cache save error:', e.message);
  }
}

function clearCache() {
  try {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  } catch (e) {
    // ignore
  }
}

// --- API 呼び出し ---
async function apiRequest(endpoint, body) {
  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000) // 15秒タイムアウト
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: 'network_error', message: e.message };
  }
}

// --- ライセンス操作 ---

/**
 * ログイン + デバイスアクティベート
 * サーバーでemail/passwordを検証し、デバイスIDを登録する
 */
async function login(email, password) {
  const deviceId = generateDeviceId();
  const deviceName = getDeviceName();

  const result = await apiRequest('/api/auth/login', {
    email,
    password,
    deviceId,
    deviceName
  });

  if (result.success) {
    // ログイン成功 → ライセンス情報をキャッシュ
    const cache = {
      email,
      token: result.token,
      deviceId,
      isAdmin: result.isAdmin || false,
      status: result.license?.status || 'unknown',
      plan: result.license?.plan || 'standard',
      trialEnd: result.license?.trialEnd || null,
      currentPeriodEnd: result.license?.currentPeriodEnd || null,
      verifiedAt: new Date().toISOString()
    };
    saveCache(cache);
    return { success: true, license: cache };
  }

  return result; // { success: false, error: '...', message: '...' }
}

/**
 * ログアウト（デバイス解除）
 * サーバーのデバイス登録を解除し、ローカルキャッシュを削除
 * → これにより別デバイスでのログインが可能になる
 */
async function logout() {
  const cache = loadCache();
  if (cache && cache.token) {
    // サーバーにデバイス解除を通知
    await apiRequest('/api/license/deactivate', {
      token: cache.token,
      deviceId: cache.deviceId
    });
  }
  clearCache();
  return { success: true };
}

/**
 * ライセンス検証（起動時に呼ぶ）
 * 1. ローカルキャッシュを確認
 * 2. 30日以内ならオフラインOK
 * 3. 30日超過 or キャッシュなし → サーバー認証
 */
async function verifyLicense() {
  const cache = loadCache();
  const deviceId = generateDeviceId();

  // キャッシュなし → 未ログイン
  if (!cache) {
    return { valid: false, reason: 'not_logged_in' };
  }

  // ===== 管理者アカウント: 全チェックスキップ =====
  if (cache.isAdmin) {
    return { valid: true, license: cache, offline: false };
  }

  // デバイスIDが変わっている → 別デバイス
  if (cache.deviceId !== deviceId) {
    clearCache();
    return { valid: false, reason: 'device_mismatch' };
  }

  // オフライン猶予チェック（30日）
  const verifiedAt = new Date(cache.verifiedAt);
  const now = new Date();
  const daysSinceVerify = (now - verifiedAt) / (1000 * 60 * 60 * 24);

  if (daysSinceVerify <= OFFLINE_GRACE_DAYS) {
    // 猶予期間内 → ステータスに応じて判定
    if (cache.status === 'active' || cache.status === 'trial') {
      // トライアル期限チェック
      if (cache.status === 'trial' && cache.trialEnd) {
        if (now > new Date(cache.trialEnd)) {
          return { valid: false, reason: 'trial_expired', license: cache };
        }
      }
      // サブスク期限チェック
      if (cache.status === 'active' && cache.currentPeriodEnd) {
        if (now > new Date(cache.currentPeriodEnd)) {
          // 期限切れの可能性 → サーバーで確認を試みる
          return await verifyOnline(cache);
        }
      }
      return { valid: true, license: cache, offline: true };
    }
    return { valid: false, reason: 'inactive', license: cache };
  }

  // 30日超過 → サーバー認証必須
  return await verifyOnline(cache);
}

/**
 * オンラインでサーバー認証
 */
async function verifyOnline(cache) {
  const result = await apiRequest('/api/license/verify', {
    token: cache.token,
    deviceId: cache.deviceId
  });

  if (result.success && result.license) {
    // キャッシュ更新
    const updated = {
      ...cache,
      status: result.license.status,
      plan: result.license.plan,
      trialEnd: result.license.trialEnd,
      currentPeriodEnd: result.license.currentPeriodEnd,
      verifiedAt: new Date().toISOString()
    };
    saveCache(updated);

    if (result.license.status === 'active' || result.license.status === 'trial') {
      return { valid: true, license: updated, offline: false };
    }
    return { valid: false, reason: result.license.status, license: updated };
  }

  if (result.error === 'network_error') {
    // ネットワークエラー → キャッシュがあれば猶予で通す（ただし30日以内のみ）
    const verifiedAt = new Date(cache.verifiedAt);
    const daysSince = (new Date() - verifiedAt) / (1000 * 60 * 60 * 24);
    if (daysSince <= OFFLINE_GRACE_DAYS && (cache.status === 'active' || cache.status === 'trial')) {
      return { valid: true, license: cache, offline: true };
    }
    return { valid: false, reason: 'offline_expired' };
  }

  // device_mismatch等のサーバーエラー
  if (result.error === 'device_mismatch') {
    clearCache();
    return { valid: false, reason: 'device_mismatch' };
  }

  return { valid: false, reason: result.error || 'unknown' };
}

/**
 * アカウント新規作成
 */
async function register(email, password) {
  const result = await apiRequest('/api/auth/register', { email, password });
  if (result.success) {
    // 登録直後にログイン
    return await login(email, password);
  }
  return result;
}

/**
 * Stripe Checkout URL取得（サブスク購入ページ）
 */
async function getCheckoutUrl(promoCode) {
  const cache = loadCache();
  if (!cache || !cache.token) {
    return { success: false, error: 'not_logged_in' };
  }
  const body = { token: cache.token };
  if (promoCode) body.promoCode = promoCode;
  return await apiRequest('/api/stripe/create-checkout', body);
}

/**
 * Stripe Customer Portal URL取得（サブスク管理ページ）
 */
async function getPortalUrl() {
  const cache = loadCache();
  if (!cache || !cache.token) {
    return { success: false, error: 'not_logged_in' };
  }
  return await apiRequest('/api/stripe/portal', { token: cache.token });
}

/**
 * サブスクリプション解約
 */
async function cancelSubscription() {
  const cache = loadCache();
  if (!cache || !cache.token) {
    return { success: false, message: 'ログインしてください' };
  }
  try {
    const result = await apiRequest('/api/stripe/cancel', { token: cache.token });
    if (result.success) {
      await verifyLicense();
    }
    return result;
  } catch (e) {
    return { success: false, message: 'エラーが発生しました' };
  }
}

/**
 * プロモーションコードを適用
 */
async function applyPromoCode(code) {
  const cache = loadCache();
  if (!cache || !cache.token) {
    return { success: false, message: 'ログインしてください' };
  }
  try {
    const result = await apiRequest('/api/stripe/apply-promo', { token: cache.token, promoCode: code });
    if (result.success) {
      // キャッシュのプラン情報も更新するためverifyを再実行
      await verifyLicense();
    }
    return result;
  } catch (e) {
    return { success: false, message: 'エラーが発生しました' };
  }
}

/**
 * 現在のキャッシュ情報を取得（UI表示用）
 */
function getLicenseInfo() {
  const cache = loadCache();
  if (!cache) return null;
  return {
    email: cache.email,
    isAdmin: cache.isAdmin || false,
    status: cache.status,
    plan: cache.plan,
    trialEnd: cache.trialEnd,
    currentPeriodEnd: cache.currentPeriodEnd,
    verifiedAt: cache.verifiedAt
  };
}

module.exports = {
  login,
  logout,
  register,
  verifyLicense,
  getCheckoutUrl,
  getPortalUrl,
  applyPromoCode,
  cancelSubscription,
  getLicenseInfo,
  clearCache
};
