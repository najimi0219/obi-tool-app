/**
 * デバイスID生成モジュール
 * PC固有の情報からSHA-256ハッシュを生成し、デバイスを一意に識別する
 */
const os = require('os');
const crypto = require('crypto');

function generateDeviceId() {
  const cpus = os.cpus();
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpus.length > 0 ? cpus[0].model : 'unknown',
    os.totalmem().toString(),
    os.userInfo().username
  ];
  const raw = components.join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function getDeviceName() {
  return `${os.hostname()} (${os.platform()})`;
}

module.exports = { generateDeviceId, getDeviceName };
