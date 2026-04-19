// detect-engine.js - Shared detection engine for Obi-Tool

// ===== 業者情報検出キーワード定義 =====
const ANCHOR_STRONG = [
  '都知事', '府知事', '県知事', '国土交通大臣', '国土交通省',
  '取引態様', '取引形態', '取引様態',
];
const ANCHOR_MEDIUM = ['免許(', '免許（', '免許証', '宅建免許', '知事免許', '大臣免許'];
const BROKER_KW = [
  'TEL', 'ＴＥＬ', 'FAX', 'ＦＡＸ',
  '担当', '手数料', '報酬',
  '広告掲載', '広告不可', '広告：', '広告:',
  '保証協会', '不動産協会', '宅建協会', '流通経営協会',
  '定休日', '営業時間',
  '物件確認', '内見依頼', '内覧',
  '資料請求', 'お問い合わせ', '問合せ', 'お問合せ',
  '検印', '登録No', '登録Ｎｏ',
  '仲介', '媒介', '代理',
  '客付', '元付', '分かれ',
  '免許番号', '登録番号', '宅地建物取引',
  '社名', '担当者', '情報提供元', '情報提供',
];
const PROPERTY_KW = [
  '間取り', '間取', '所在地', '専有面積', '土地面積', '建物面積',
  '構造', '築年', '管理費', '修繕積立', '総戸数',
  '駐車場', '駐輪場', 'ペット飼育', 'エレベーター',
  '現況', '引渡', '権利', '用途地域', '建ぺい率', '容積率',
  '接道', '設備', '備考', '周辺施設', 'Life Information',
  'ライフインフォメーション', 'RENOVATION', 'リノベーション',
  'Coming Soon', '写真準備中',
  '小学校', '中学校', '高校', '保育園', '幼稚園',
  '公園', '病院', '郵便局',
  '徒歩約', '徒歩', '約m',
  'オーナーチェンジ', '利回り', '賃料',
  '二世帯', '世帯住宅',
  '物件概要', '物件No',
  'バルコニー', 'ルーフバルコニー',
  '面積', '地目', '都市計画', '法令制限', '市街化区域',
  '宅地', '防火', '高度地区', '日影規制',
  '施工会社', '分譲会社', '管理会社', '管理形態', '管理員',
  '月額合計', '持分割合', '所在階', '固定資産税',
  '向き', '所有権', 'エレベータ', '建築年月',
  'リフォーム', '交換', '張替', '貼替', '新規設置', '設置',
  'システムキッチン', 'ユニットバス', '洗面化粧台',
  'シャワートイレ', 'フローリング', '床暖房',
  '給湯器', '防水パン', 'クロス',
  '建具', 'コンセント', 'スイッチ',
  'コートフック', 'インターホン',
  '・・・・',
  '設備・仕様', '仕様等',
  '写真', '撮影', '動画', '詳細資料', 'ダウンロ',
];
const facilityRe = /(?:店|学校|園|局|病院|医院|クリニック|寺|教会|神社).*?(?:約|徒歩|分|ｍ|m)|(?:約\d+[mｍ]|徒歩\d+分|徒歩約\d+分)|・・・・約?\d+[mｍ]/;

// 正規表現パターン
const phoneRe = /0\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{2,4}/g;
const licenseRe = /第[\d０-９]+号/g;
const emailRe = /[\w.-]+@[\w.-]+\.\w+/g;
const urlRe = /(?:https?:\/\/|www\.)\S+/gi;
const companyRe = /(?:株式会社|有限会社|合同会社)[\u3000-\u9FFF\w]{2,}|[\u3000-\u9FFF\w]{2,}(?:株式会社|有限会社|合同会社)/g;
const zipcodeRe = /〒\d{3}[-]?\d{4}/g;
const realestateRe = /不動産|ホーム|ハウス|エステート|リアルティ|トラスト|住宅|住まい|レジデンス|ソリューション/;

// ===== Utility functions =====
function normalizeText(text) {
  return text
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[ー‐−―─–—]/g, '-')
    .replace(/\s/g, '');
}

function normalizeCJK(text) {
  return text.normalize('NFKC');
}

function isPropertyText(text) {
  const normCjk = normalizeCJK(text);
  if (PROPERTY_KW.some(kw => text.includes(kw) || normCjk.includes(kw))) return true;
  if (facilityRe.test(text) || facilityRe.test(normCjk)) return true;
  return false;
}

function extractPhones(text) {
  const phoneRe = /0\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{2,4}/g;
  const norm = normalizeText(text);
  const phones = new Set();
  for (const m of (norm.match(phoneRe) || [])) {
    const d = m.replace(/[-.\s]/g, '');
    if (d.length >= 9) phones.add(d);
  }
  return phones;
}

// ===== Signal 1: Pixel-based detection =====
function detectObiByPixels(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;

  const scanStartPct = 70;
  const scanStartY = Math.floor(h * scanStartPct / 100);

  const bandSize = Math.max(1, Math.floor(h / 100));
  const sampleLeft = Math.floor(w * 0.05);
  const sampleRight = Math.floor(w * 0.95);
  const sampleWidth = sampleRight - sampleLeft;
  const sampleStep = Math.max(1, Math.floor(sampleWidth / 80));

  const bands = [];

  for (let bandStart = scanStartY; bandStart < h - bandSize; bandStart += bandSize) {
    let totalRatio = 0;
    let rowCount = 0;

    for (let y = bandStart; y < bandStart + bandSize && y < h; y++) {
      const rowData = ctx.getImageData(sampleLeft, y, sampleWidth, 1).data;
      let nonWhite = 0;
      let samples = 0;

      for (let x = 0; x < sampleWidth; x += sampleStep) {
        const idx = x * 4;
        const r = rowData[idx], g = rowData[idx + 1], b = rowData[idx + 2];
        if (!(r >= 230 && g >= 230 && b >= 230)) nonWhite++;
        samples++;
      }
      totalRatio += (samples > 0 ? nonWhite / samples : 0);
      rowCount++;
    }

    bands.push({
      pct: (bandStart / h) * 100,
      avgRatio: rowCount > 0 ? totalRatio / rowCount : 0
    });
  }

  const ACTIVE_THRESHOLD = 0.08;
  const EMPTY_THRESHOLD = 0.05;

  let emptyStreak = 0;
  let boundaryPct = null;
  let hasActiveBottom = false;

  const bottom3 = bands.slice(-3);
  if (bottom3.some(b => b.avgRatio >= ACTIVE_THRESHOLD)) {
    hasActiveBottom = true;
  }

  if (!hasActiveBottom) {
    const lateActive = bands.filter(b => b.pct >= 85 && b.avgRatio >= ACTIVE_THRESHOLD);
    if (lateActive.length > 0) hasActiveBottom = true;
  }

  if (!hasActiveBottom) return { found: false, boundaryPct: null };

  for (let i = bands.length - 1; i >= 0; i--) {
    if (bands[i].avgRatio < EMPTY_THRESHOLD) {
      emptyStreak++;
    } else {
      emptyStreak = 0;
    }

    if (emptyStreak >= 3) {
      boundaryPct = bands[i + 3] ? bands[i + 3].pct : bands[i].pct;
      break;
    }
  }

  if (boundaryPct === null) {
    boundaryPct = scanStartPct;
  }

  return { found: true, boundaryPct };
}

// ===== Signal 2: Text keyword detection =====
async function detectObiByText(page) {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  if (!textContent || !textContent.items) return { found: false, topPct: null, keywords: [], allTextItems: [] };

  const allTextItems = [];
  for (const item of textContent.items) {
    const text = item.str;
    if (!text || text.trim().length === 0) continue;
    const y = item.transform[5];
    const height = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
    const yFromTop = pageHeight - y;
    const rawYPct = (yFromTop / pageHeight) * 100;
    const isOOB = rawYPct > 100 || rawYPct < 0;
    const yPct = Math.min(100, Math.max(0, rawYPct));
    const yTopPct = yPct;
    const yBotPct = Math.min(100, ((yFromTop + height) / pageHeight) * 100);
    allTextItems.push({ text, yPct, yTopPct, yBotPct, rawYPct, isOOB });
  }

  if (allTextItems.length === 0) return { found: false, topPct: null, keywords: [], allTextItems };

  const SCORE_STRONG = 10;
  const SCORE_MEDIUM = 6;
  const SCORE_BROKER = 3;
  const SCORE_PHONE = 4;
  const SCORE_COMPANY = 4;
  const SCORE_EMAIL = 3;
  const SCORE_PROTECT = -20;

  const PROP_TABLE_CTX = [
    '管理会社', '施工会社', '分譲会社', '管理組合',
    '売主', '事業主', '建設会社', '設計会社', '監理'
  ];

  const Y_CTX = 3.0;
  function hasPropertyTableContext(centerYPct) {
    return allTextItems.some(function (nb) {
      if (Math.abs(nb.yPct - centerYPct) > Y_CTX) return false;
      return PROP_TABLE_CTX.some(function (ctx) { return nb.text.includes(ctx); });
    });
  }

  const scoredItems = [];
  for (var si = 0; si < allTextItems.length; si++) {
    var item = allTextItems[si];
    var t = item.text;
    var norm = normalizeText(t);
    var score = 0;
    var tags = [];

    if (ANCHOR_STRONG.some(function (kw) { return t.includes(kw); })) { score += SCORE_STRONG; tags.push('strong'); }
    if (ANCHOR_MEDIUM.some(function (kw) { return t.includes(kw); })) { score += SCORE_MEDIUM; tags.push('medium'); }
    if (BROKER_KW.some(function (kw) { return t.includes(kw); })) { score += SCORE_BROKER; tags.push('broker'); }
    phoneRe.lastIndex = 0; if (phoneRe.test(norm)) { score += SCORE_PHONE; tags.push('phone'); }

    companyRe.lastIndex = 0;
    if (companyRe.test(t)) {
      var inPropertyTableRow = hasPropertyTableContext(item.yPct);
      if (!inPropertyTableRow) { score += SCORE_COMPANY; tags.push('company'); }
    }

    emailRe.lastIndex = 0; if (emailRe.test(t)) { score += SCORE_EMAIL; tags.push('email'); }
    if (isPropertyText(t)) { score += SCORE_PROTECT; tags.push('protect'); }

    scoredItems.push(Object.assign({}, item, { score: score, tags: tags }));
  }

  const MERGE_GAP_PCT = 4.0;
  const hitItems = scoredItems.filter(function (i) { return i.score > 0 && !i.tags.includes('protect'); });

  if (hitItems.length === 0) return { found: false, topPct: null, keywords: [], allTextItems };

  hitItems.sort(function (a, b) { return a.yTopPct - b.yTopPct; });

  const clusters = [];
  for (const item of hitItems) {
    let merged = false;
    for (const cluster of clusters) {
      const clTop = cluster.topPct;
      const clBot = cluster.botPct;
      const gap = Math.max(0, Math.max(item.yTopPct - clBot, clTop - item.yBotPct));
      if (gap <= MERGE_GAP_PCT) {
        cluster.topPct = Math.min(cluster.topPct, item.yTopPct);
        cluster.botPct = Math.max(cluster.botPct, item.yBotPct);
        cluster.totalScore += item.score;
        cluster.items.push(item);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        topPct: item.yTopPct,
        botPct: item.yBotPct,
        totalScore: item.score,
        items: [item]
      });
    }
  }

  if (clusters.length === 0) return { found: false, topPct: null, keywords: [], allTextItems };

  clusters.sort(function (a, b) { return b.totalScore - a.totalScore; });
  const best = clusters[0];

  if (best.totalScore < SCORE_BROKER) return { found: false, topPct: null, keywords: [], allTextItems };

  const protectItems = scoredItems.filter(function (i) {
    return i.tags.includes('protect') && i.yTopPct >= best.topPct - 2 && i.yBotPct <= best.botPct + 2;
  });

  let safeTopPct = best.topPct;
  let safeBotPct = best.botPct;

  if (protectItems.length > 0) {
    const protectMidY = protectItems.reduce(function (s, i) { return s + (i.yTopPct + i.yBotPct) / 2; }, 0) / protectItems.length;
    const clusterMidY = (best.topPct + best.botPct) / 2;

    if (protectMidY < clusterMidY) {
      const maxProtectBot = Math.max.apply(null, protectItems.map(function (i) { return i.yBotPct; }));
      safeTopPct = maxProtectBot + 0.5;
    } else {
      const minProtectTop = Math.min.apply(null, protectItems.map(function (i) { return i.yTopPct; }));
      safeBotPct = minProtectTop - 0.5;
    }
  }

  const topPct = Math.max(0, safeTopPct - 1.0);
  const botPct = Math.min(100, safeBotPct + 1.0);

  const foundKWs = new Set();
  for (const item of best.items) {
    for (const kw of ANCHOR_STRONG) { if (item.text.includes(kw)) foundKWs.add(kw); }
    for (const kw of ANCHOR_MEDIUM) { if (item.text.includes(kw)) foundKWs.add(kw); }
    for (const kw of BROKER_KW) { if (item.text.includes(kw)) foundKWs.add(kw); }
  }

  const fullText = best.items.map(function (i) { return i.text; }).join(' ');
  companyRe.lastIndex = 0;
  licenseRe.lastIndex = 0;
  emailRe.lastIndex = 0;
  urlRe.lastIndex = 0;
  zipcodeRe.lastIndex = 0;
  const fp = {
    phones: new Set(best.items.reduce(function (s, i) { return s.concat([...extractPhones(i.text)]); }, [])),
    companies: [...new Set(fullText.match(companyRe) || [])],
    licenses: [...new Set(fullText.match(licenseRe) || [])],
    emails: [...new Set(fullText.match(emailRe) || [])],
    urls: [...new Set((fullText.match(urlRe) || []).map(function (u) { return u.replace(/[\/\s]+$/, ''); }))],
    zipcodes: [...new Set(fullText.match(zipcodeRe) || [])]
  };

  return {
    found: true,
    topPct: topPct,
    botPct: botPct,
    keywords: [...foundKWs],
    hitCount: best.items.length,
    clusterScore: best.totalScore,
    allTextItems: allTextItems,
    protectCount: protectItems.length,
    fingerprint: fp
  };
}

// ===== Signal 3: Text logos (large company names/phone numbers) =====
async function detectTextLogos(page) {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  const items = [];
  for (const item of textContent.items) {
    const text = item.str;
    if (!text || text.trim().length === 0) continue;
    const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
    const y = item.transform[5];
    const yFromTop = pageHeight - y;
    const yPct = (yFromTop / pageHeight) * 100;
    if (yPct < 0) continue;
    items.push({ text, fontSize, yPct: Math.min(100, yPct) });
  }

  if (items.length === 0) return { found: false, topPct: null, logos: [] };

  const sizes = items.map(i => i.fontSize).sort((a, b) => a - b);
  const medianFs = sizes[Math.floor(sizes.length / 2)];

  const logos = [];
  for (const item of items) {
    if (item.yPct < 80) continue;
    const ratio = item.fontSize / medianFs;

    companyRe.lastIndex = 0;
    const isCompany = companyRe.test(item.text) || realestateRe.test(item.text);
    if (ratio >= 1.5 && isCompany) {
      logos.push({ ...item, ratio, reason: 'company_logo' });
      continue;
    }

    phoneRe.lastIndex = 0;
    if (ratio >= 1.8 && phoneRe.test(normalizeText(item.text))) {
      logos.push({ ...item, ratio, reason: 'phone_logo' });
      continue;
    }
  }

  if (logos.length === 0) return { found: false, topPct: null, logos: [] };

  const topPct = Math.min(...logos.map(l => l.yPct));
  return { found: true, topPct, logos, medianFs };
}

// ===== Signal 4: Image detection =====
async function detectObiImages(page) {
  try {
    const ops = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    const imagePositions = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === 85) {
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          if (ops.fnArray[j] === 12) {
            const args = ops.argsArray[j];
            if (args && args.length >= 6) {
              const imgHeight = Math.abs(args[3]);
              const imgY = args[5];
              const yFromTop = pageHeight - imgY;
              const yFromTopPct = Math.min(100, Math.max(0, (yFromTop / pageHeight) * 100));
              const hPct = (imgHeight / pageHeight) * 100;

              if (yFromTopPct >= 65 && hPct < 20 && hPct > 0.5) {
                imagePositions.push({ yFromTopPct, hPct });
              }
            }
            break;
          }
        }
      }
    }

    if (imagePositions.length === 0) return { found: false, topPct: null };

    return {
      found: true,
      topPct: Math.min(...imagePositions.map(i => i.yFromTopPct)),
      count: imagePositions.length
    };
  } catch (e) {
    return { found: false, topPct: null };
  }
}

// ===== Image-based page detection =====
function isImageBasedPage(textContent) {
  if (!textContent || !textContent.items) return true;
  const meaningfulItems = textContent.items.filter(item => {
    const str = (item.str || '').trim();
    return str.length >= 2;
  });
  return meaningfulItems.length < 5;
}

// ===== Enhanced pixel analysis for image pages =====
function detectObiBandByPixels(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;

  const scanStartPct = 50;
  const scanStartY = Math.floor(h * scanStartPct / 100);

  const bandSize = Math.max(1, Math.floor(h / 200));
  const sampleLeft = Math.floor(w * 0.03);
  const sampleRight = Math.floor(w * 0.97);
  const sampleStep = Math.max(1, Math.floor((sampleRight - sampleLeft) / 100));

  const rows = [];
  for (let y = scanStartY; y < h; y += bandSize) {
    const imgData = ctx.getImageData(sampleLeft, y, sampleRight - sampleLeft, 1).data;
    let nonWhite = 0;
    let totalR = 0, totalG = 0, totalB = 0;
    let samples = 0;

    for (let x = 0; x < imgData.length; x += sampleStep * 4) {
      const r = imgData[x], g = imgData[x + 1], b = imgData[x + 2];
      totalR += r; totalG += g; totalB += b;
      samples++;
      if (r < 230 || g < 230 || b < 230) nonWhite++;
    }

    rows.push({
      y,
      yPct: (y / h) * 100,
      nonWhiteRate: samples > 0 ? nonWhite / samples : 0,
      avgR: samples > 0 ? totalR / samples : 255,
      avgG: samples > 0 ? totalG / samples : 255,
      avgB: samples > 0 ? totalB / samples : 255
    });
  }

  function isBandRow(row) {
    const isDark = row.nonWhiteRate > 0.3 || (row.avgR < 210 && row.avgG < 210 && row.avgB < 210);
    const isColorful = Math.abs(row.avgR - row.avgG) > 20 || Math.abs(row.avgG - row.avgB) > 20 || Math.abs(row.avgR - row.avgB) > 20;
    const isVeryDark = row.avgR < 100 || row.avgG < 100 || row.avgB < 100;
    return isDark || isColorful || isVeryDark;
  }

  function scanBand(gapTolerance) {
    let bottomIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (isBandRow(rows[i])) { bottomIdx = i; break; }
    }
    if (bottomIdx < 0) return null;

    let topIdx = bottomIdx;
    let gap = 0;
    for (let i = bottomIdx - 1; i >= 0; i--) {
      if (isBandRow(rows[i])) {
        gap = 0;
        topIdx = i;
      } else {
        gap++;
        if (gap >= gapTolerance) break;
      }
    }
    const top = rows[topIdx].yPct;
    return { topPct: top, heightPct: 100 - top };
  }

  const tightBand = scanBand(1);
  const strictBand = scanBand(2);
  const relaxedBand = scanBand(5);

  let bestBand = null;

  if (tightBand && tightBand.heightPct >= 3 && tightBand.topPct >= 55) {
    bestBand = tightBand;
  }

  if (strictBand && strictBand.heightPct >= 3 && strictBand.topPct >= 55) {
    if (!bestBand) {
      bestBand = strictBand;
    } else if (strictBand.heightPct <= 18) {
      bestBand = strictBand;
    }
  }

  if (relaxedBand && relaxedBand.heightPct >= 3 && relaxedBand.topPct >= 55) {
    if (!bestBand) {
      bestBand = relaxedBand;
    } else if (relaxedBand.heightPct <= 18) {
      bestBand = relaxedBand;
    }
  }

  if (bestBand && bestBand.heightPct <= 40) {
    return {
      found: true,
      topPct: bestBand.topPct,
      bottomPct: 100,
      heightPct: bestBand.heightPct,
      method: 'pixel_band'
    };
  }

  for (let i = rows.length - 2; i >= 0; i--) {
    const below = rows[i + 1];
    const curr = rows[i];
    if (below.nonWhiteRate > 0.30 && curr.nonWhiteRate < 0.10 && below.yPct >= 70) {
      const edgeH = 100 - below.yPct;
      if (edgeH >= 3 && edgeH <= 35) {
        return {
          found: true,
          topPct: below.yPct,
          bottomPct: 100,
          heightPct: edgeH,
          method: 'pixel_edge'
        };
      }
    }
  }

  return { found: false };
}

// ===== Pixel-based horizontal line detection =====
function detectPixelHLines(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const hLines = [];

  const scanStartY = Math.floor(h * 0.25);
  const sampleLeft = Math.floor(w * 0.02);
  const sampleRight = Math.floor(w * 0.98);
  const sampleWidth = sampleRight - sampleLeft;

  const step = 2;
  const rowData = [];

  for (let y = scanStartY; y < h; y += step) {
    const imgData = ctx.getImageData(sampleLeft, y, sampleWidth, 1).data;
    let darkPixels = 0;
    let totalSamples = 0;
    const sampleStep = Math.max(1, Math.floor(sampleWidth / 200));

    for (let x = 0; x < imgData.length; x += sampleStep * 4) {
      const r = imgData[x], g = imgData[x + 1], b = imgData[x + 2];
      totalSamples++;
      if (r < 150 && g < 150 && b < 150) darkPixels++;
    }

    rowData.push({
      y,
      yPct: (y / h) * 100,
      darkRate: totalSamples > 0 ? darkPixels / totalSamples : 0
    });
  }

  for (let i = 1; i < rowData.length - 1; i++) {
    const curr = rowData[i];
    const prev = rowData[i - 1];
    const next = rowData[i + 1];

    if (curr.darkRate > 0.3 && prev.darkRate < 0.15 && next.darkRate < 0.15) {
      const lineImgData = ctx.getImageData(0, curr.y, w, 1).data;
      let leftX = -1, rightX = -1;
      const lineStep = Math.max(1, Math.floor(w / 400));

      for (let x = 0; x < lineImgData.length; x += lineStep * 4) {
        const px = x / 4;
        const r = lineImgData[x], g = lineImgData[x + 1], b = lineImgData[x + 2];
        if (r < 180 && g < 180 && b < 180) {
          if (leftX < 0) leftX = px;
          rightX = px;
        }
      }

      if (leftX >= 0 && rightX > leftX) {
        const lineWPct = ((rightX - leftX) / w) * 100;
        if (lineWPct >= 30) {
          hLines.push({
            yPct: curr.yPct,
            xStartPct: (leftX / w) * 100,
            xEndPct: (rightX / w) * 100,
            widthPct: lineWPct,
            fromPixel: true
          });
        }
      }
    }

    if (i < rowData.length - 2) {
      const next2 = rowData[i + 2];
      if (curr.darkRate > 0.3 && next.darkRate > 0.3 &&
        prev.darkRate < 0.15 && next2.darkRate < 0.15) {
        const lineImgData = ctx.getImageData(0, curr.y, w, 1).data;
        let leftX = -1, rightX = -1;
        const lineStep = Math.max(1, Math.floor(w / 400));

        for (let x = 0; x < lineImgData.length; x += lineStep * 4) {
          const px = x / 4;
          const r = lineImgData[x], g = lineImgData[x + 1], b = lineImgData[x + 2];
          if (r < 180 && g < 180 && b < 180) {
            if (leftX < 0) leftX = px;
            rightX = px;
          }
        }

        if (leftX >= 0 && rightX > leftX) {
          const lineWPct = ((rightX - leftX) / w) * 100;
          if (lineWPct >= 30) {
            const isDup = hLines.some(l => Math.abs(l.yPct - curr.yPct) < 1);
            if (!isDup) {
              hLines.push({
                yPct: curr.yPct,
                xStartPct: (leftX / w) * 100,
                xEndPct: (rightX / w) * 100,
                widthPct: lineWPct,
                fromPixel: true
              });
            }
          }
        }
      }
    }
  }

  return hLines;
}

// ===== Pixel-based box detection =====
function detectPixelBoxes(canvas, pixelHLines) {
  if (!canvas || pixelHLines.length < 2) return [];

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const boxes = [];

  const lowerLines = pixelHLines.filter(l => l.yPct >= 60 && l.widthPct >= 40);
  lowerLines.sort((a, b) => a.yPct - b.yPct);

  for (let i = 0; i < lowerLines.length; i++) {
    for (let j = i + 1; j < lowerLines.length; j++) {
      const topLine = lowerLines[i];
      const botLine = lowerLines[j];
      const heightPct = botLine.yPct - topLine.yPct;

      if (heightPct < 2 || heightPct > 25) continue;

      const overlapLeft = Math.max(topLine.xStartPct, botLine.xStartPct);
      const overlapRight = Math.min(topLine.xEndPct, botLine.xEndPct);
      const overlapW = overlapRight - overlapLeft;
      if (overlapW < 30) continue;

      const topY = Math.floor((topLine.yPct / 100) * h);
      const botY = Math.floor((botLine.yPct / 100) * h);
      const leftX = Math.floor((overlapLeft / 100) * w);
      const rightX = Math.floor((overlapRight / 100) * w);

      let hasLeftEdge = false;
      let hasRightEdge = false;

      let leftDarkCount = 0;
      const checkRange = 5;
      const verticalSteps = Math.max(1, Math.floor((botY - topY) / 30));
      let vertSamples = 0;

      for (let y = topY; y <= botY; y += verticalSteps) {
        for (let dx = -checkRange; dx <= checkRange; dx++) {
          const px = leftX + dx;
          if (px < 0 || px >= w) continue;
          const imgData = ctx.getImageData(px, y, 1, 1).data;
          if (imgData[0] < 150 && imgData[1] < 150 && imgData[2] < 150) {
            leftDarkCount++;
            break;
          }
        }
        vertSamples++;
      }
      hasLeftEdge = vertSamples > 0 && (leftDarkCount / vertSamples) > 0.4;

      let rightDarkCount = 0;
      vertSamples = 0;
      for (let y = topY; y <= botY; y += verticalSteps) {
        for (let dx = -checkRange; dx <= checkRange; dx++) {
          const px = rightX + dx;
          if (px < 0 || px >= w) continue;
          const imgData = ctx.getImageData(px, y, 1, 1).data;
          if (imgData[0] < 150 && imgData[1] < 150 && imgData[2] < 150) {
            rightDarkCount++;
            break;
          }
        }
        vertSamples++;
      }
      hasRightEdge = vertSamples > 0 && (rightDarkCount / vertSamples) > 0.4;

      if (hasLeftEdge && hasRightEdge) {
        const xPct = overlapLeft;
        const yPct = topLine.yPct;
        const wPct = overlapW;
        const hPctVal = heightPct;

        const isDup = boxes.some(b =>
          Math.abs(b.yPct - yPct) < 2 && Math.abs(b.hPct - hPctVal) < 2);
        if (!isDup) {
          boxes.push({
            xPct: xPct,
            yPct: yPct,
            wPct: wPct,
            hPct: hPctVal,
            bottomPct: yPct + hPctVal,
            isFilled: false,
            isStroked: true,
            fillColor: null,
            fromPixel: true
          });
        }
      }
    }
  }

  return boxes;
}

// ===== Mid-page band detection =====
function detectMidPageBand(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;

  const bandSize = Math.max(1, Math.floor(h / 200));
  const sampleLeft = Math.floor(w * 0.03);
  const sampleRight = Math.floor(w * 0.97);
  const sampleStep = Math.max(1, Math.floor((sampleRight - sampleLeft) / 100));

  const rows = [];
  for (let y = 0; y < h; y += bandSize) {
    const imgData = ctx.getImageData(sampleLeft, y, sampleRight - sampleLeft, 1).data;
    let nonWhite = 0;
    let totalR = 0, totalG = 0, totalB = 0;
    let samples = 0;

    for (let x = 0; x < imgData.length; x += sampleStep * 4) {
      const r = imgData[x], g = imgData[x + 1], b = imgData[x + 2];
      totalR += r; totalG += g; totalB += b;
      samples++;
      if (r < 230 || g < 230 || b < 230) nonWhite++;
    }

    rows.push({
      y,
      yPct: (y / h) * 100,
      nonWhiteRate: samples > 0 ? nonWhite / samples : 0,
      avgR: samples > 0 ? totalR / samples : 255,
      avgG: samples > 0 ? totalG / samples : 255,
      avgB: samples > 0 ? totalB / samples : 255
    });
  }

  function isWhiteRow(row) { return row.nonWhiteRate < 0.15; }
  function isColorRow(row) {
    return row.nonWhiteRate > 0.25 ||
      row.avgR < 210 || row.avgG < 210 || row.avgB < 210 ||
      Math.abs(row.avgR - row.avgG) > 15 || Math.abs(row.avgG - row.avgB) > 15;
  }

  const midRows = rows.filter(r => r.yPct >= 25 && r.yPct <= 75);

  const bands = [];
  let bandStart = -1;
  let gap = 0;
  const MAX_GAP = 3;

  for (let i = 0; i < midRows.length; i++) {
    if (isColorRow(midRows[i])) {
      if (bandStart < 0) bandStart = i;
      gap = 0;
    } else {
      if (bandStart >= 0) {
        gap++;
        if (gap >= MAX_GAP) {
          const endIdx = i - gap;
          if (endIdx > bandStart) {
            bands.push({
              topPct: midRows[bandStart].yPct,
              bottomPct: midRows[endIdx].yPct + 0.5,
              heightPct: midRows[endIdx].yPct - midRows[bandStart].yPct + 0.5
            });
          }
          bandStart = -1;
          gap = 0;
        }
      }
    }
  }
  if (bandStart >= 0) {
    const endIdx = midRows.length - 1 - gap;
    if (endIdx > bandStart) {
      bands.push({
        topPct: midRows[bandStart].yPct,
        bottomPct: midRows[endIdx].yPct + 0.5,
        heightPct: midRows[endIdx].yPct - midRows[bandStart].yPct + 0.5
      });
    }
  }

  const candidates = bands.filter(b => b.heightPct >= 3 && b.heightPct <= 15);

  if (candidates.length === 0) return { found: false };

  for (const band of candidates) {
    const aboveRows = rows.filter(r => r.yPct >= band.topPct - 5 && r.yPct < band.topPct);
    const belowRows = rows.filter(r => r.yPct > band.bottomPct && r.yPct <= band.bottomPct + 5);
    const hasWhiteAbove = aboveRows.some(r => isWhiteRow(r));
    const hasWhiteBelow = belowRows.some(r => isWhiteRow(r));

    if (hasWhiteAbove || hasWhiteBelow) {
      return {
        found: true,
        topPct: band.topPct,
        bottomPct: band.bottomPct,
        heightPct: band.heightPct,
        method: 'mid_band'
      };
    }
  }

  if (candidates.length > 0) {
    return {
      found: true,
      topPct: candidates[0].topPct,
      bottomPct: candidates[0].bottomPct,
      heightPct: candidates[0].heightPct,
      method: 'mid_band'
    };
  }

  return { found: false };
}

// ===== OCR (PaddleOCR via IPC) =====
let ocrReady = false;
let ocrInitializing = false;

async function initOcrWorker() {
  if (ocrReady || ocrInitializing) return;
  ocrInitializing = true;
  try {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.ocrInit) {
      const result = await window.electronAPI.ocrInit();
      ocrReady = !!result.ready;
      if (ocrReady) console.log('[OCR] PaddleOCR ready via IPC');
      else console.warn('[OCR] PaddleOCR init failed:', result.error);
    }
  } catch (e) {
    console.warn('[OCR] 初期化失敗:', e);
    ocrReady = false;
  }
  ocrInitializing = false;
}

// Canvas → base64 PNG → IPC → PaddleOCR テキスト取得
async function _paddleOcrCanvas(canvas) {
  if (!canvas) {
    console.warn('[OCR] _paddleOcrCanvas: canvas null');
    return null;
  }
  if (!window || !window.electronAPI || !window.electronAPI.ocrRecognize) {
    console.warn('[OCR] _paddleOcrCanvas: electronAPI.ocrRecognize 未定義');
    return null;
  }
  const t0 = performance.now();
  try {
    // JPEG (品質0.9) でサイズ削減 → IPC高速化
    // 大きなcanvas (5000px+) でPNG base64 にすると数十MBになりIPCが詰まる
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const sizeKB = Math.round(base64.length * 0.75 / 1024);
    console.log(`[OCR] IPC送信: canvas ${canvas.width}x${canvas.height}, JPEG ${sizeKB}KB`);
    const result = await window.electronAPI.ocrRecognize(base64);
    const dt = Math.round(performance.now() - t0);
    if (!result) {
      console.warn(`[OCR] IPC結果null (${dt}ms)`);
      return null;
    }
    if (result.error) {
      console.warn(`[OCR] エラー (${dt}ms):`, result.error);
    } else {
      console.log(`[OCR] OCR完了 (${dt}ms): ${(result.lines||[]).length}行, テキスト${(result.text||'').length}文字`);
    }
    return result;
  } catch (e) {
    console.warn('[OCR] _paddleOcrCanvas failed:', e);
    return null;
  }
}

// 共通: OCR結果からブローカーキーワードを判定
const _OCR_BROKER_KW = ['TEL', 'FAX', 'tel', 'fax', '免許', '宅建', '取引態様',
  '媒介', '不動産', '株式会社', '有限会社', '担当', '仲介', '専任',
  '手数料', '物件確認', '問い合わせ', '問合せ', '営業時間',
  '社名', '担当者', '情報提供元', '情報提供'];
const _OCR_PHONE_RE = /\d{2,4}[-ー\s]?\d{2,4}[-ー\s]?\d{3,4}/;
const _OCR_EMAIL_RE = /[\w.-]+@[\w.-]+/;

function _analyzeOcrResult(ocrResult, canvas, cropY) {
  if (!ocrResult || !ocrResult.text) return null;
  const ocrText = ocrResult.text;

  let matchCount = 0;
  const matchedKeywords = [];
  for (const kw of _OCR_BROKER_KW) {
    if (ocrText.includes(kw)) { matchCount++; matchedKeywords.push(kw); }
  }
  if (_OCR_PHONE_RE.test(ocrText)) { matchCount++; matchedKeywords.push('電話番号'); }
  if (_OCR_EMAIL_RE.test(ocrText)) { matchCount++; matchedKeywords.push('メール'); }

  // PaddleOCR lines から brokerMinYPct を計算
  let brokerMinYPct = null;
  if (ocrResult.lines && ocrResult.lines.length > 0 && canvas) {
    let minY = Infinity;
    for (const line of ocrResult.lines) {
      const lineText = line.text || '';
      let isBrokerWord = false;
      if (_OCR_BROKER_KW.some(kw => lineText.includes(kw))) isBrokerWord = true;
      if (!isBrokerWord && _OCR_PHONE_RE.test(lineText)) isBrokerWord = true;
      if (!isBrokerWord && _OCR_EMAIL_RE.test(lineText)) isBrokerWord = true;
      if (!isBrokerWord && /株式会社|有限会社|\(株\)|（株）/.test(lineText)) isBrokerWord = true;
      if (isBrokerWord && line.frame) {
        const wordYInPage = (cropY || 0) + (line.frame.top || 0);
        const wordYPct = (wordYInPage / canvas.height) * 100;
        if (wordYPct < minY) minY = wordYPct;
      }
    }
    if (minY < Infinity) brokerMinYPct = minY;
  }

  return { text: ocrText, hasBrokerInfo: matchCount >= 2, matchCount, matchedKeywords, brokerMinYPct };
}

async function ocrRegion(canvas, topPct, bottomPct) {
  if (!ocrReady && !ocrInitializing) await initOcrWorker();
  if (!ocrReady) return null;

  const cropY = Math.floor(canvas.height * topPct / 100);
  const cropBottom = Math.floor(canvas.height * bottomPct / 100);
  const cropH = cropBottom - cropY;
  if (cropH < 20) return null;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = canvas.width;
  tmpCanvas.height = cropH;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);

  try {
    const ocrResult = await _paddleOcrCanvas(tmpCanvas);
    return _analyzeOcrResult(ocrResult, canvas, cropY);
  } catch (e) {
    console.warn('[OCR] ocrRegion failed:', e);
    return null;
  }
}

async function ocrLowerRegion(canvas, topPct) {
  if (!ocrReady && !ocrInitializing) await initOcrWorker();
  if (!ocrReady) return null;

  const cropY = Math.floor(canvas.height * topPct / 100);
  const cropH = canvas.height - cropY;
  if (cropH < 20) return null;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = canvas.width;
  tmpCanvas.height = cropH;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);

  try {
    const ocrResult = await _paddleOcrCanvas(tmpCanvas);
    return _analyzeOcrResult(ocrResult, canvas, cropY);
  } catch (e) {
    console.warn('[OCR] ocrLowerRegion failed:', e);
    return null;
  }
}

// ===== QRコード検出 (jsQR) =====
// canvasからQRコードを検出し、位置情報を返す
function detectQRCodes(canvas) {
  if (!canvas || typeof jsQR === 'undefined') return { found: false, codes: [] };

  try {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const codes = [];

    // フルページスキャン
    const result = jsQR(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (result && result.location) {
      const loc = result.location;
      const topY = Math.min(loc.topLeftCorner.y, loc.topRightCorner.y);
      const bottomY = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y);
      const leftX = Math.min(loc.topLeftCorner.x, loc.bottomLeftCorner.x);
      const rightX = Math.max(loc.topRightCorner.x, loc.bottomRightCorner.x);

      codes.push({
        data: result.data,
        topPct: (topY / canvas.height) * 100,
        bottomPct: (bottomY / canvas.height) * 100,
        leftPct: (leftX / canvas.width) * 100,
        rightPct: (rightX / canvas.width) * 100,
        centerYPct: ((topY + bottomY) / 2 / canvas.height) * 100,
        sizePct: ((bottomY - topY) / canvas.height) * 100
      });
    }

    // QRが下半分に無い場合、下部領域だけ再スキャン（解像度向上）
    if (codes.length === 0) {
      const halfY = Math.floor(canvas.height * 0.5);
      const cropH = canvas.height - halfY;
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = cropH;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(canvas, 0, halfY, canvas.width, cropH, 0, 0, canvas.width, cropH);

      const cropData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
      const cropResult = jsQR(cropData.data, cropData.width, cropData.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (cropResult && cropResult.location) {
        const loc = cropResult.location;
        const topY = Math.min(loc.topLeftCorner.y, loc.topRightCorner.y);
        const bottomY = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y);
        const leftX = Math.min(loc.topLeftCorner.x, loc.bottomLeftCorner.x);
        const rightX = Math.max(loc.topRightCorner.x, loc.bottomRightCorner.x);

        codes.push({
          data: cropResult.data,
          topPct: ((halfY + topY) / canvas.height) * 100,
          bottomPct: ((halfY + bottomY) / canvas.height) * 100,
          leftPct: (leftX / canvas.width) * 100,
          rightPct: (rightX / canvas.width) * 100,
          centerYPct: ((halfY + (topY + bottomY) / 2) / canvas.height) * 100,
          sizePct: ((bottomY - topY) / canvas.height) * 100
        });
      }
    }

    if (codes.length > 0) {
      console.log(`[QR] ${codes.length}個のQRコード検出: ${codes.map(c => c.data.substring(0, 40)).join(', ')}`);
      console.log(`[QR] 位置: Y=${codes[0].topPct.toFixed(1)}%~${codes[0].bottomPct.toFixed(1)}%`);
    }

    return { found: codes.length > 0, codes };
  } catch (e) {
    console.warn('[QR] detectQRCodes failed:', e);
    return { found: false, codes: [] };
  }
}

// ===== PDF path elements detection =====
async function detectPathElements(page) {
  const ops = await page.getOperatorList();
  const viewport = page.getViewport({ scale: 1 });
  const pageH = viewport.height;
  const pageW = viewport.width;

  const rects = [];
  const hLines = [];

  let ctmStack = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  let pathPoints = [];
  let currentStroke = null;
  let currentFill = null;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === 10) { ctmStack.push([...ctm]); continue; }
    if (fn === 11) { ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0]; continue; }

    if (fn === 12 && args && args.length >= 6) {
      const [a, b, c, d, e, f] = args;
      const [a2, b2, c2, d2, e2, f2] = ctm;
      ctm = [
        a * a2 + b * c2, a * b2 + b * d2,
        c * a2 + d * c2, c * b2 + d * d2,
        e * a2 + f * c2 + e2, e * b2 + f * d2 + f2
      ];
      continue;
    }

    if (fn === 24 || fn === 26 || fn === 28 || fn === 32) {
      currentStroke = args;
      continue;
    }
    if (fn === 25 || fn === 27 || fn === 29 || fn === 33) {
      currentFill = args;
      continue;
    }

    if (fn === 91 && args) {
      const subOps = args[0];
      const subArgs = args[1];
      if (!subOps || !subArgs) continue;

      let argIdx = 0;
      pathPoints = [];

      for (const subOp of subOps) {
        if (subOp === 13) {
          pathPoints.push({ type: 'M', x: subArgs[argIdx], y: subArgs[argIdx + 1] });
          argIdx += 2;
        } else if (subOp === 14) {
          pathPoints.push({ type: 'L', x: subArgs[argIdx], y: subArgs[argIdx + 1] });
          argIdx += 2;
        } else if (subOp === 19) {
          const rx = subArgs[argIdx], ry = subArgs[argIdx + 1];
          const rw = subArgs[argIdx + 2], rh = subArgs[argIdx + 3];
          argIdx += 4;

          const x1 = ctm[0] * rx + ctm[2] * ry + ctm[4];
          const y1 = ctm[1] * rx + ctm[3] * ry + ctm[5];
          const w = Math.abs(ctm[0] * rw + ctm[2] * rh);
          const h = Math.abs(ctm[1] * rw + ctm[3] * rh);

          const yTop = pageH - y1;
          const xPct = (x1 / pageW) * 100;
          const yPct = ((yTop - h) / pageH) * 100;
          const wPct = (w / pageW) * 100;
          const hPct = (h / pageH) * 100;

          if (wPct > 2 && hPct > 0.5) {
            rects.push({
              xPct, yPct, wPct, hPct,
              bottomPct: yPct + hPct,
              isFilled: currentFill !== null,
              isStroked: true,
              fillColor: currentFill ? [...currentFill] : null
            });
          }
          if (wPct >= 30 && hPct <= 1.5 && hPct > 0) {
            hLines.push({
              yPct: yPct,
              xStartPct: xPct,
              xEndPct: xPct + wPct,
              widthPct: wPct,
              fromRect: true
            });
          }
        } else if (subOp === 15 || subOp === 16 || subOp === 17) {
          argIdx += (subOp === 17 ? 4 : 6);
        } else if (subOp === 18) {
        }
      }
      continue;
    }

    if (fn === 64 && pathPoints.length >= 2) {
      for (let j = 0; j < pathPoints.length - 1; j++) {
        const p1 = pathPoints[j];
        const p2 = pathPoints[j + 1];
        if (p1.type === 'M' && p2.type === 'L') {
          const x1 = ctm[0] * p1.x + ctm[2] * p1.y + ctm[4];
          const y1 = ctm[1] * p1.x + ctm[3] * p1.y + ctm[5];
          const x2 = ctm[0] * p2.x + ctm[2] * p2.y + ctm[4];
          const y2 = ctm[1] * p2.x + ctm[3] * p2.y + ctm[5];

          const yTop1 = pageH - y1;
          const yTop2 = pageH - y2;

          const lineW = Math.abs(x2 - x1);
          const lineWPct = (lineW / pageW) * 100;
          if (Math.abs(yTop1 - yTop2) < 2 && lineWPct > 30) {
            hLines.push({
              yPct: (yTop1 / pageH) * 100,
              xStartPct: (Math.min(x1, x2) / pageW) * 100,
              xEndPct: (Math.max(x1, x2) / pageW) * 100,
              widthPct: lineWPct
            });
          }
        }
      }
      pathPoints = [];
      continue;
    }

    if (fn === 65 || fn === 66) {
      if (pathPoints.length >= 2) {
        for (let j = 0; j < pathPoints.length - 1; j++) {
          const p1 = pathPoints[j];
          const p2 = pathPoints[j + 1];
          if (p1.type === 'M' && p2.type === 'L') {
            const x1 = ctm[0] * p1.x + ctm[2] * p1.y + ctm[4];
            const y1 = ctm[1] * p1.x + ctm[3] * p1.y + ctm[5];
            const x2 = ctm[0] * p2.x + ctm[2] * p2.y + ctm[4];
            const y2 = ctm[1] * p2.x + ctm[3] * p2.y + ctm[5];
            const yTop1 = pageH - y1;
            const yTop2 = pageH - y2;
            const lineW = Math.abs(x2 - x1);
            const lineWPct = (lineW / pageW) * 100;
            if (Math.abs(yTop1 - yTop2) < 2 && lineWPct > 30) {
              hLines.push({
                yPct: (yTop1 / pageH) * 100,
                xStartPct: (Math.min(x1, x2) / pageW) * 100,
                xEndPct: (Math.max(x1, x2) / pageW) * 100,
                widthPct: lineWPct,
                fromFill: true
              });
            }
          }
        }
      }
      pathPoints = [];
      continue;
    }
  }

  return { rects, hLines };
}

// ===== Broker box finder =====
function findBrokerBox(rects, brokerTextItems, allTextItems, textResult) {
  function clusterRects(inputRects, thresholdPct) {
    const used = new Set();
    const clusters = [];

    for (let i = 0; i < inputRects.length; i++) {
      if (used.has(i)) continue;
      const group = [inputRects[i]];
      used.add(i);
      let changed = true;

      while (changed) {
        changed = false;
        for (let j = 0; j < inputRects.length; j++) {
          if (used.has(j)) continue;
          const r2 = inputRects[j];
          for (const r1 of group) {
            const overlapX = r1.xPct < r2.xPct + r2.wPct + thresholdPct &&
              r2.xPct < r1.xPct + r1.wPct + thresholdPct;
            const overlapY = r1.yPct < r2.bottomPct + thresholdPct &&
              r2.yPct < r1.bottomPct + thresholdPct;
            if (overlapX && overlapY) {
              group.push(r2);
              used.add(j);
              changed = true;
              break;
            }
          }
        }
      }
      clusters.push(group);
    }
    return clusters;
  }

  const searchTopPct = textResult && textResult.found ? Math.max(55, textResult.topPct - 10) : 70;

  const lowerRects = rects.filter(r => {
    if (r.yPct < searchTopPct) return false;
    if (r.hPct > 50) return false;
    return true;
  });

  const clusters = clusterRects(lowerRects, 1);

  const bigRects = [];
  for (const cluster of clusters) {
    let useCluster = cluster;

    const fullMinY = Math.min(...cluster.map(r => r.yPct));
    const fullMaxBottom = Math.max(...cluster.map(r => r.bottomPct));
    if (fullMaxBottom - fullMinY > 25) {
      const bottomGroup = cluster.filter(r => r.bottomPct >= 90 || r.yPct >= 80);
      if (bottomGroup.length > 0) useCluster = bottomGroup;
    }

    const minX = Math.min(...useCluster.map(r => r.xPct));
    const minY = Math.min(...useCluster.map(r => r.yPct));
    const maxRight = Math.max(...useCluster.map(r => r.xPct + r.wPct));
    const maxBottom = Math.max(...useCluster.map(r => r.bottomPct));
    const merged = {
      xPct: minX,
      yPct: minY,
      wPct: maxRight - minX,
      hPct: maxBottom - minY,
      bottomPct: maxBottom,
      isFilled: useCluster.some(r => r.isFilled),
      fillColor: useCluster.find(r => r.isFilled && r.fillColor)?.fillColor || null,
      _clusterSize: useCluster.length
    };
    if (merged.wPct >= 20 && merged.hPct >= 2 && merged.bottomPct >= 85) {
      bigRects.push(merged);
    }
  }

  for (const r of lowerRects) {
    if (r.wPct >= 20 && r.hPct >= 2 && r.bottomPct >= 85) {
      const isDuplicate = bigRects.some(br =>
        Math.abs(br.xPct - r.xPct) < 3 && Math.abs(br.yPct - r.yPct) < 3 &&
        Math.abs(br.wPct - r.wPct) < 3 && Math.abs(br.hPct - r.hPct) < 3);
      if (!isDuplicate) bigRects.push(r);
    }
  }

  if (bigRects.length === 0) return null;

  bigRects.sort((a, b) => {
    const aFull = a.wPct >= 80 ? 1 : 0;
    const bFull = b.wPct >= 80 ? 1 : 0;
    if (bFull !== aFull) return bFull - aFull;
    if (Math.abs(b.bottomPct - a.bottomPct) > 2) return b.bottomPct - a.bottomPct;
    return (b.wPct * b.hPct) - (a.wPct * a.hPct);
  });

  for (const rect of bigRects) {
    let hasBroker = false;

    if (brokerTextItems.length > 0) {
      const insideBrokers = brokerTextItems.filter(t =>
        t.yPct >= rect.yPct - 2 && t.yPct <= rect.bottomPct + 2 &&
        t.xPct >= rect.xPct - 5 && t.xPct <= rect.xPct + rect.wPct + 5
      );
      if (insideBrokers.length >= 1) hasBroker = true;
    }

    if (!hasBroker && allTextItems && allTextItems.length > 0) {
      const insideTexts = allTextItems.filter(t =>
        t.yPct >= rect.yPct - 2 && t.yPct <= rect.bottomPct + 2
      );
      const brokerKeywords = ['TEL', 'FAX', '免許', '宅建', '媒介',
        '株式会社', '有限会社', '(株)', '（株）', '担当', 'tel', 'fax',
        '物件確認', '手数料', '仲介', '専任', '問い合わせ', '問合せ',
        '社名', '担当者', '情報提供元', '情報提供'];
      const phoneRe = /\d{2,4}[-\s]?\d{2,4}[-\s]?\d{3,4}/;
      for (const t of insideTexts) {
        const str = t.text || t.str || '';
        if (brokerKeywords.some(kw => str.includes(kw))) { hasBroker = true; break; }
        if (phoneRe.test(str)) { hasBroker = true; break; }
      }
    }

    if (!hasBroker && rect.isFilled && rect.fillColor) {
      const c = rect.fillColor;
      if (c.length >= 3) {
        const isWhitish = c.every(v => v > 0.9);
        if (!isWhitish && rect.wPct >= 50) hasBroker = true;
      } else if (c.length === 1) {
        if (c[0] < 0.85 && rect.wPct >= 50) hasBroker = true;
      }
    }

    if (hasBroker) {
      return {
        xPct: rect.xPct,
        yPct: rect.yPct,
        wPct: rect.wPct,
        hPct: rect.hPct,
        bottomPct: rect.bottomPct,
        isFilled: rect.isFilled,
        fillColor: rect.fillColor
      };
    }
  }

  const filledBands = rects.filter(r => {
    if (r.yPct < 75) return false;
    if (r.wPct < 70) return false;
    if (r.hPct < 3 || r.hPct > 25) return false;
    if (!r.isFilled || !r.fillColor) return false;
    const c = r.fillColor;
    if (c.length >= 3) return !c.every(v => v > 0.9);
    if (c.length === 1) return c[0] < 0.85;
    return false;
  });

  if (filledBands.length > 0) {
    filledBands.sort((a, b) => (b.wPct * b.hPct) - (a.wPct * a.hPct));
    const band = filledBands[0];
    return {
      xPct: band.xPct,
      yPct: band.yPct,
      wPct: band.wPct,
      hPct: band.hPct,
      bottomPct: band.bottomPct,
      isFilled: true,
      fillColor: band.fillColor
    };
  }

  return null;
}

// ===== Broker line finder =====
function findBrokerLine(hLines, brokerTextItems) {
  if (brokerTextItems.length === 0 || hLines.length === 0) return null;

  const brokerMinY = Math.min(...brokerTextItems.map(t => t.yPct));

  const candidates = hLines.filter(l => {
    const diff = brokerMinY - l.yPct;
    return diff >= -1 && diff <= 6;
  });

  if (candidates.length === 0) return null;

  const scored = candidates.map(l => {
    const itemsBelow = brokerTextItems.filter(t =>
      t.yPct >= l.yPct && t.yPct <= l.yPct + 12
    );
    return { line: l, nearbyCount: itemsBelow.length };
  });

  scored.sort((a, b) => {
    if (b.nearbyCount !== a.nearbyCount) return b.nearbyCount - a.nearbyCount;
    return b.line.yPct - a.line.yPct;
  });

  const best = scored.find(s => s.nearbyCount > 0);
  if (best) return best.line;

  candidates.sort((a, b) => Math.abs(brokerMinY - a.yPct) - Math.abs(brokerMinY - b.yPct));
  return candidates[0];
}

// =============================================
// ===== V2: Item-Based Detection Flow =====
// =============================================
// ① テキスト/画像ページ判定 → ② OCRテキスト化 → ③ 業者アイテム抽出
// → ④ QRコード検出 → ⑤ 矩形囲み → ⑥ 帯タイプ分類
// → ⑦ 削除領域決定 → ⑧ 保護アイテム除外 → ⑨⑩ 消去＆貼付

// --- 業者情報パターン ---
const BROKER_ITEM_PATTERNS = {
  phone:       { re: /\d{2,4}[-ー−‐\s]?\d{2,4}[-ー−‐\s]?\d{3,4}/, label: '電話番号', weight: 3 },
  email:       { re: /[\w.\-]+@[\w.\-]+\.\w+/, label: 'メアド', weight: 3 },
  company:     { re: /株式会社|有限会社|\(株\)|（株）|合同会社/, label: '会社名', weight: 3 },
  license:     { re: /免許|宅建|宅地建物|国土交通大臣|知事\s*[\(（]/, label: '宅建番号', weight: 4 },
  transaction: { re: /取引態様|媒介|仲介|専任|一般媒介|専属専任/, label: '取引態様', weight: 4 },
  commission:  { re: /手数料/, label: '手数料', weight: 3 },
  contact:     { re: /担当[者：:\s]|お問い?合わせ|問合せ|物件確認/, label: '担当', weight: 3 },
  fax:         { re: /FAX|fax|ファックス|ＦＡＸ/, label: 'FAX', weight: 3 },
  tel:         { re: /TEL|tel|ＴＥＬ|電話番号/, label: 'TEL', weight: 2 },
  url:         { re: /https?:\/\/|www\./, label: 'URL', weight: 2 },
  broker_name: { re: /不動産|ホーム|ハウス|リアル|エステート|プロパティ|建設|開発/, label: '業者名', weight: 2 }
};

// --- 保護アイテムキーワード（消してはいけない） ---
const PROTECTED_KW = [
  // 周辺情報・ライフインフォメーション
  '小学校', '中学校', '高等学校', '高校', '幼稚園', '保育園', '保育所',
  '最寄', '徒歩', 'バス停', 'バス ',
  'コンビニ', 'スーパー', '病院', '薬局', '公園', '郵便局',
  '図書館', '銀行', '交番', '警察', '消防署',
  'ライフインフォメーション', '周辺環境', '周辺施設', '生活施設', '生活関連',
  // 物件情報
  '間取', 'LDK', 'DK', '1R', '1K',
  '専有面積', '建物面積', '土地面積', '敷地面積',
  '築年', '構造', '階建', '所在地',
  '管理費', '修繕積立', '駐車場', '総戸数',
  '賃料', '価格', '礼金', '敷金', '保証金',
  '設備', '入居', '契約期間',
  // 写真関連ラベル
  '外観', '内観', '現地', '室内', '眺望', 'バルコニー', 'エントランス',
  '物件概要', '概要'
];

// Step 2: ページ全体の画像情報を取得（位置・サイズ）
async function getAllPageImages(page) {
  try {
    const ops = await page.getOperatorList();
    const vp = page.getViewport({ scale: 1 });
    const pageH = vp.height;
    const pageW = vp.width;
    const images = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === 85) { // paintImageXObject
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          if (ops.fnArray[j] === 12) { // transform
            const a = ops.argsArray[j];
            if (a && a.length >= 6) {
              const imgW = Math.abs(a[0]);
              const imgH = Math.abs(a[3]);
              const imgX = a[4];
              const imgY = a[5];
              const yFromTop = pageH - imgY;
              images.push({
                yPct: (yFromTop / pageH) * 100,
                xPct: (imgX / pageW) * 100,
                hPct: (imgH / pageH) * 100,
                wPct: (imgW / pageW) * 100,
                bottomPct: ((yFromTop + imgH) / pageH) * 100,
                rightPct: ((imgX + imgW) / pageW) * 100,
                area: (imgH / pageH) * (imgW / pageW) * 10000 // %²
              });
            }
            break;
          }
        }
      }
    }
    return images;
  } catch (e) {
    console.warn('[V2] getAllPageImages failed:', e);
    return [];
  }
}

// Step 2: 画像ページのOCR → 仮想テキストアイテム変換
// 画像ベースページでは2段階OCRを実行：
//   ① 全体OCR（縮小される） → ページ上部のテキスト用
//   ② 下部60%のクロップOCR（高解像度維持） → 帯部分の精密OCR
async function ocrToTextItems(canvas) {
  if (!canvas) return [];

  console.log(`[V2] ocrToTextItems: canvas ${canvas.width}x${canvas.height} で全体+帯領域の2段階OCR実行`);

  // ① 全体OCR（PaddleOCRが内部で縮小する）
  const fullResult = await _paddleOcrCanvas(canvas);
  const fullLines = (fullResult && fullResult.lines) ? fullResult.lines : [];
  console.log(`[V2] ① 全体OCR: ${fullLines.length}行`);

  // ② 下部60%を高解像度のままクロップしてOCR（帯文字精度UP）
  const cropTopPct = 40; // 下60%
  const cropY = Math.floor(canvas.height * cropTopPct / 100);
  const cropH = canvas.height - cropY;
  let bottomLines = [];
  let bottomCropOffset = cropY;

  if (cropH >= 100) {
    try {
      const bottomCanvas = document.createElement('canvas');
      bottomCanvas.width = canvas.width;
      bottomCanvas.height = cropH;
      const bctx = bottomCanvas.getContext('2d');
      bctx.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);
      const bottomResult = await _paddleOcrCanvas(bottomCanvas);
      if (bottomResult && bottomResult.lines) {
        bottomLines = bottomResult.lines;
        console.log(`[V2] ② 下部クロップOCR (${canvas.width}x${cropH}): ${bottomLines.length}行`);
      }
    } catch (e) {
      console.warn('[V2] 下部クロップOCR失敗:', e);
    }
  }

  // 結果を統合: 上部60%は fullLines、下部40%は bottomLines を優先
  const items = [];
  const seenTexts = new Set(); // 重複排除用

  // 下部クロップ結果を先に追加（高解像度なので優先）
  for (const line of bottomLines) {
    if (!line.text) continue;
    const f = line.frame;
    if (!f || typeof f.top !== 'number') continue;
    const topY = bottomCropOffset + f.top;
    const bottomY = bottomCropOffset + f.top + f.height;
    const leftX = f.left;
    const rightX = f.left + f.width;
    const key = `${line.text}@${Math.floor(topY/10)}`;
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);
    items.push({
      text: line.text,
      yPct: (topY / canvas.height) * 100,
      xPct: (leftX / canvas.width) * 100,
      bottomPct: (bottomY / canvas.height) * 100,
      widthPct: ((rightX - leftX) / canvas.width) * 100,
      heightPct: ((bottomY - topY) / canvas.height) * 100,
      fontSize: bottomY - topY,
      source: 'ocr_bottom',
      confidence: line.score || 0
    });
  }

  // 全体OCR結果を追加（上部のテキスト用）
  for (const line of fullLines) {
    if (!line.text) continue;
    const f = line.frame;
    if (!f || typeof f.top !== 'number') continue;
    const topY = f.top;
    const bottomY = f.top + f.height;
    const leftX = f.left;
    const rightX = f.left + f.width;
    const yPct = (topY / canvas.height) * 100;
    // 下部60%は bottomLines 優先、上部40%のみ採用
    if (yPct >= cropTopPct - 5) continue;
    const key = `${line.text}@${Math.floor(topY/10)}`;
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);
    items.push({
      text: line.text,
      yPct,
      xPct: (leftX / canvas.width) * 100,
      bottomPct: (bottomY / canvas.height) * 100,
      widthPct: ((rightX - leftX) / canvas.width) * 100,
      heightPct: ((bottomY - topY) / canvas.height) * 100,
      fontSize: bottomY - topY,
      source: 'ocr_full',
      confidence: line.score || 0
    });
  }

  console.log(`[V2] ocrToTextItems: 統合結果 ${items.length}件 (下部優先)`);
  if (items.length > 0) {
    const sample = items.slice(0, 5).map(i => `"${i.text.substring(0, 15)}"@Y${i.yPct.toFixed(0)}%`).join(', ');
    console.log(`[V2] OCRサンプル: ${sample}`);
  }
  return items;
}

// Step 3: 業者アイテム抽出
// ページ上部（Y < 65%）にある単独マッチは物件詳細テーブルの誤検出が多いので
// 重みを下げるか除外する。これにより帯の矩形が不必要に広がるのを防ぐ。
function extractBrokerItems(textItems) {
  const items = [];
  // 上部の単独マッチで誤検出しやすいパターン
  // 「取引態様」は物件概要表のラベルとして頻出、broker_name系ワードも物件説明に出る
  const UPPER_WEAK_TYPES = new Set(['transaction', 'broker_name', 'phone', 'tel', 'url']);

  for (const ti of textItems) {
    const types = [];
    let totalWeight = 0;
    for (const [type, { re, weight }] of Object.entries(BROKER_ITEM_PATTERNS)) {
      if (re.test(ti.text)) {
        types.push(type);
        totalWeight += weight;
      }
    }
    if (types.length === 0) continue;

    // ページ上部（Y < 65%）にある単独マッチは信頼度が低い
    // 複数タイプ同時マッチ or 高weight（免許番号等）は信頼できるのでそのまま
    if (ti.yPct < 65 && types.length === 1 && UPPER_WEAK_TYPES.has(types[0])) {
      // 上部の弱い単独マッチは除外（物件情報テーブルの誤検出が多い）
      continue;
    }

    items.push({ ...ti, brokerTypes: types, weight: totalWeight });
  }
  return items;
}

// Step 3.5: 業者アイテムのクラスタリング（外れ値除去）
// Y座標でソートし、大きなギャップで分割 → 最重クラスタを帯として採用
const CLUSTER_GAP_PCT = 15; // 15%以上のギャップでクラスタ分割

function clusterBrokerItems(brokerItems, qrCodes) {
  if (brokerItems.length === 0) return { mainItems: [], outliers: [], clusterY: null };

  // Y座標でソート
  const sorted = [...brokerItems].sort((a, b) => a.yPct - b.yPct);

  // QRコードのY座標も考慮（クラスタ判定用）
  const allYs = [
    ...sorted.map(item => ({ yPct: item.yPct, weight: item.weight || 1, type: 'broker' })),
    ...qrCodes.map(qr => ({ yPct: qr.topPct, weight: 3, type: 'qr' }))
  ].sort((a, b) => a.yPct - b.yPct);

  if (allYs.length <= 1) return { mainItems: brokerItems, outliers: [], clusterY: null };

  // ギャップ検出 → クラスタに分割
  const clusters = [[]];
  clusters[0].push(allYs[0]);
  for (let i = 1; i < allYs.length; i++) {
    const gap = allYs[i].yPct - allYs[i - 1].yPct;
    if (gap >= CLUSTER_GAP_PCT) {
      clusters.push([]);
    }
    clusters[clusters.length - 1].push(allYs[i]);
  }

  if (clusters.length <= 1) {
    // ギャップなし → 全てが同一クラスタ
    return { mainItems: brokerItems, outliers: [], clusterY: null };
  }

  // 各クラスタのスコア（アイテム数 × 平均weight）を計算
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < clusters.length; i++) {
    const totalWeight = clusters[i].reduce((s, item) => s + item.weight, 0);
    const score = totalWeight * clusters[i].length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // メインクラスタのY範囲を取得
  const mainCluster = clusters[bestIdx];
  const clusterMinY = mainCluster[0].yPct - 3; // 少しマージン
  const clusterMaxY = mainCluster[mainCluster.length - 1].yPct + 3;

  // 業者アイテムをメインクラスタ内/外に分類
  const mainItems = brokerItems.filter(item =>
    item.yPct >= clusterMinY && item.yPct <= clusterMaxY
  );
  const outliers = brokerItems.filter(item =>
    item.yPct < clusterMinY || item.yPct > clusterMaxY
  );

  if (outliers.length > 0) {
    console.log(`[V2] ③.5 クラスタリング: ${clusters.length}クラスタ検出, ` +
      `メイン(Y=${clusterMinY.toFixed(1)}%~${clusterMaxY.toFixed(1)}%): ${mainItems.length}件, ` +
      `外れ値: ${outliers.length}件 → ${outliers.map(o => `"${o.text.substring(0, 15)}" Y=${o.yPct.toFixed(1)}%`).join(', ')}`);
  }

  return {
    mainItems,
    outliers,
    clusterY: { minPct: clusterMinY, maxPct: clusterMaxY },
    clusterCount: clusters.length
  };
}

// Step 5: 業者アイテム群 + QRコードから矩形を算出
function getBrokerBoundingRect(brokerItems, qrCodes) {
  if (brokerItems.length === 0 && qrCodes.length === 0) return null;

  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity;

  for (const item of brokerItems) {
    minY = Math.min(minY, item.yPct);
    maxY = Math.max(maxY, item.bottomPct || (item.yPct + (item.heightPct || 2)));
    minX = Math.min(minX, item.xPct);
    maxX = Math.max(maxX, item.xPct + (item.widthPct || 10));
  }
  for (const qr of qrCodes) {
    minY = Math.min(minY, qr.topPct);
    maxY = Math.max(maxY, qr.bottomPct);
    minX = Math.min(minX, qr.leftPct);
    maxX = Math.max(maxX, qr.rightPct);
  }

  return {
    topPct: minY, bottomPct: Math.min(maxY, 100),
    leftPct: Math.max(minX, 0), rightPct: Math.min(maxX, 100),
    heightPct: Math.min(maxY, 100) - minY,
    widthPct: Math.min(maxX, 100) - Math.max(minX, 0)
  };
}

// Step 6: 帯タイプ分類
function classifyBandType(rect, brokerItems) {
  // 業者アイテムのY座標分布を分析
  const yValues = brokerItems.map(i => i.yPct);
  const avgY = yValues.reduce((s, v) => s + v, 0) / yValues.length;

  // 下段帯: アイテムの大部分がページ下部に集中
  // 帯の高さが過大（35%超）なら散在扱い（誤検出で矩形が広がっている可能性）
  if (rect.heightPct > 35) return 'irregular';
  if (rect.topPct >= 65 || (avgY >= 78 && rect.topPct >= 60)) return 'bottom';

  // 中段帯: アイテムがページ中間部に集中
  if (rect.topPct >= 25 && rect.bottomPct <= 80 && rect.heightPct <= 35) return 'middle';

  // 上部にも下部にも散在 or 大きい範囲 → 変形帯
  return 'irregular';
}

// Step 7: 帯タイプに応じた削除領域決定
function determineClearRegion(bandType, rect) {
  switch (bandType) {
    case 'bottom':
      // 帯の上端にわずかなマージンを追加するが、65%より上には行かない
      // これにより物件情報テーブルへの食い込みを防ぐ
      return {
        method: 'v2_bottom',
        clearTopPct: Math.max(65, rect.topPct - 1.5),
        clearBottomPct: 100,
        clearLeftPct: 0,
        clearRightPct: 100,
        isFullWidth: true
      };
    case 'middle':
      // 左上段と右下段の範囲の高さ方向で、横幅全体を囲む
      return {
        method: 'v2_middle',
        clearTopPct: Math.max(15, rect.topPct - 2),
        clearBottomPct: Math.min(100, rect.bottomPct + 2),
        clearLeftPct: 0,
        clearRightPct: 100,
        isFullWidth: true
      };
    case 'irregular':
      // 左上段と右下段の範囲だけ囲む
      return {
        method: 'v2_irregular',
        clearTopPct: Math.max(0, rect.topPct - 2),
        clearBottomPct: Math.min(100, rect.bottomPct + 2),
        clearLeftPct: Math.max(0, rect.leftPct - 3),
        clearRightPct: Math.min(100, rect.rightPct + 3),
        isFullWidth: rect.widthPct >= 85
      };
  }
}

// Step 8: 保護アイテム検出 & 削除領域の調整
function isProtectedText(text) {
  return PROTECTED_KW.some(kw => text.includes(kw));
}

function adjustForProtectedItems(clearRegion, textItems, pageImages, brokerItems) {
  // --- テキスト系の保護アイテムを抽出 ---
  const protectedTexts = textItems.filter(item => {
    // 削除領域内かチェック
    if (item.yPct < clearRegion.clearTopPct - 1 || item.yPct > clearRegion.clearBottomPct + 1) return false;
    if (!clearRegion.isFullWidth) {
      if (item.xPct < clearRegion.clearLeftPct - 2 || item.xPct > clearRegion.clearRightPct + 2) return false;
    }
    // 業者アイテムでなく、保護キーワードに該当するか
    const isBroker = brokerItems.some(b => b.text === item.text && Math.abs(b.yPct - item.yPct) < 1);
    if (isBroker) return false;
    return isProtectedText(item.text);
  });

  // --- 画像系の保護アイテム（大きい画像 = 写真・間取り図）---
  const protectedImages = pageImages.filter(img => {
    // 削除領域内かチェック
    const imgCenterY = img.yPct + img.hPct / 2;
    if (imgCenterY < clearRegion.clearTopPct || imgCenterY > clearRegion.clearBottomPct) return false;
    // 大きい画像は物件写真・間取り図の可能性が高い（小さいのはロゴ）
    return img.hPct > 8 && img.wPct > 12;
  });

  const allProtected = [
    ...protectedTexts.map(t => ({ yPct: t.yPct, bottomPct: t.bottomPct || t.yPct + 2, type: 'text', text: t.text })),
    ...protectedImages.map(i => ({ yPct: i.yPct, bottomPct: i.bottomPct, type: 'image' }))
  ];

  if (allProtected.length === 0) {
    console.log('[V2] ⑧ 保護アイテムなし → 調整不要');
    return clearRegion;
  }

  console.log(`[V2] ⑧ 保護アイテム ${allProtected.length}件検出:`,
    allProtected.map(p => `${p.type}(Y=${p.yPct.toFixed(1)}%${p.text ? ': ' + p.text.substring(0, 15) : ''})`).join(', '));

  // 保護アイテムの位置を分析
  const protMinY = Math.min(...allProtected.map(p => p.yPct));
  const protMaxY = Math.max(...allProtected.map(p => p.bottomPct));

  // 業者アイテムの位置
  const brokerMinY = Math.min(...brokerItems.map(b => b.yPct));
  const brokerMaxY = Math.max(...brokerItems.map(b => b.bottomPct || b.yPct + 2));

  // ケース1: 保護アイテムが削除領域の上部にある → 上端を下げる
  if (protMinY < brokerMinY && protMaxY < brokerMinY + 5) {
    const newTop = Math.max(protMaxY + 1, brokerMinY - 2);
    console.log(`[V2] ⑧ 上部保護 → 上端調整: ${clearRegion.clearTopPct.toFixed(1)}% → ${newTop.toFixed(1)}%`);
    clearRegion.clearTopPct = newTop;
    clearRegion.method += '+prot_adj_top';
  }
  // ケース2: 保護アイテムが削除領域の下部にある → 下端を上げる
  else if (protMinY > brokerMaxY - 5 && protMinY > clearRegion.clearTopPct + 5) {
    const newBottom = Math.min(protMinY - 1, brokerMaxY + 2);
    console.log(`[V2] ⑧ 下部保護 → 下端調整: ${clearRegion.clearBottomPct.toFixed(1)}% → ${newBottom.toFixed(1)}%`);
    clearRegion.clearBottomPct = newBottom;
    clearRegion.method += '+prot_adj_bot';
  }
  // ケース3: 保護アイテムが中間に混在 → 業者アイテム個別消去モードを推奨
  else {
    console.warn('[V2] ⑧ 保護アイテムが業者情報と混在 → 個別消去推奨');
    clearRegion.hasProtectedConflict = true;
    clearRegion.protectedItems = allProtected;
    clearRegion.method += '+prot_conflict';
  }

  return clearRegion;
}

// ===== detectObiRegion: V2 統合フロー =====
// userRotation: ユーザーが手動で回転させた角度 (0/90/180/270)
//   レンダリング時は (PDF nativeRotation + userRotation) が適用されるため、
//   テキスト座標も同じ最終回転を反映する必要がある
async function detectObiRegion(page, renderedCanvas, userRotation = 0) {
  // PDFネイティブ回転 + ユーザー回転 = レンダリング時と同じ最終回転
  // pdf.jsの getViewport({rotation}) は ネイティブ回転に追加で rotation を加算する
  const viewport = page.getViewport({ scale: 1, rotation: userRotation });
  const pageH = viewport.height;
  const pageW = viewport.width;
  const totalRotation = (page.rotate + userRotation + 360) % 360;
  console.log(`[V2] viewport: ${pageW}x${pageH}, PDFネイティブ回転=${page.rotate}°, ユーザー回転=${userRotation}°, 最終=${totalRotation}°`);
  const tc = await page.getTextContent();

  // ===== ① テキストベースか画像ベースか判定 =====
  const isImgPage = isImageBasedPage(tc);
  console.log(`[V2] ① ページタイプ: ${isImgPage ? '画像ベース' : 'テキストベース'}`);

  // ===== ② テキストアイテム統一取得 =====
  let textItems = [];
  if (!isImgPage) {
    // PDF テキストレイヤーから取得
    // viewport.convertToViewportPoint() を使ってPDF user space → viewport space に変換
    // これでネイティブ回転＋ユーザー回転が両方反映される
    for (const item of tc.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const tx = item.transform;
      const fontSize = Math.abs(tx[3]) || Math.abs(tx[0]) || 10;
      // テキストの左下と右上をビューポート座標に変換
      // pdf.jsのテキスト transform[4],[5] は左下基準
      const itemWidth = item.width || (str.length * fontSize * 0.6);
      const itemHeight = item.height || fontSize;
      // 4隅をviewport座標に変換し、AABBを取る（回転対応）
      const corners = [
        viewport.convertToViewportPoint(tx[4], tx[5]),
        viewport.convertToViewportPoint(tx[4] + itemWidth, tx[5]),
        viewport.convertToViewportPoint(tx[4], tx[5] + itemHeight),
        viewport.convertToViewportPoint(tx[4] + itemWidth, tx[5] + itemHeight)
      ];
      const xs = corners.map(c => c[0]);
      const ys = corners.map(c => c[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      textItems.push({
        text: str,
        yPct: (minY / pageH) * 100,
        xPct: (minX / pageW) * 100,
        bottomPct: (maxY / pageH) * 100,
        widthPct: ((maxX - minX) / pageW) * 100,
        heightPct: ((maxY - minY) / pageH) * 100,
        fontSize,
        source: 'pdf'
      });
    }
  } else {
    // 画像ベース → OCRで仮想テキストアイテム生成
    console.log('[V2] ② OCRテキスト化実行...');
    textItems = await ocrToTextItems(renderedCanvas);
    console.log(`[V2] ② OCR結果: ${textItems.length}件のテキスト行`);
  }

  // ===== ③ 業者アイテム抽出 =====
  const brokerItems = extractBrokerItems(textItems);
  console.log(`[V2] ③ 業者アイテム: ${brokerItems.length}件`,
    brokerItems.map(b => `[${b.brokerTypes.join(',')}] "${b.text.substring(0, 20)}" Y=${b.yPct.toFixed(1)}%`).join(' | '));

  // ===== ④ QRコード検出 =====
  const qrResult = detectQRCodes(renderedCanvas);
  const qrCodes = qrResult.found ? qrResult.codes : [];
  if (qrCodes.length > 0) {
    console.log(`[V2] ④ QRコード: ${qrCodes.length}個 Y=${qrCodes[0].topPct.toFixed(1)}%~${qrCodes[0].bottomPct.toFixed(1)}%`);
  } else {
    console.log('[V2] ④ QRコード: なし');
  }

  // ===== ④.5 混在ページ対策 =====
  // テキストベースページで「業者アイテムが下部にない」場合、
  // 帯部分が画像化されている可能性が高い（売主情報が縦書きで本文中に、業者帯は画像）
  // → 下部30%を追加でOCRして、画像化された業者情報を捕捉
  const bottomItems = brokerItems.filter(b => b.yPct >= 70);
  const needsBottomOcr = !isImgPage && renderedCanvas && bottomItems.length === 0 && qrCodes.length === 0;
  if (needsBottomOcr) {
    console.log('[V2] ④.5 テキストページだが下部に業者アイテムなし → 下部30%をOCRして画像帯を探索');
    try {
      const cropTopPct = 70;
      const cropY = Math.floor(renderedCanvas.height * cropTopPct / 100);
      const cropH = renderedCanvas.height - cropY;
      if (cropH >= 80) {
        const bottomCanvas = document.createElement('canvas');
        bottomCanvas.width = renderedCanvas.width;
        bottomCanvas.height = cropH;
        const bctx = bottomCanvas.getContext('2d');
        bctx.drawImage(renderedCanvas, 0, cropY, renderedCanvas.width, cropH, 0, 0, renderedCanvas.width, cropH);
        const bottomResult = await _paddleOcrCanvas(bottomCanvas);
        if (bottomResult && bottomResult.lines && bottomResult.lines.length > 0) {
          const ocrItems = [];
          for (const line of bottomResult.lines) {
            if (!line.text || !line.frame || typeof line.frame.top !== 'number') continue;
            const f = line.frame;
            const topY = cropY + f.top;
            const bottomY = cropY + f.top + f.height;
            ocrItems.push({
              text: line.text,
              yPct: (topY / renderedCanvas.height) * 100,
              xPct: (f.left / renderedCanvas.width) * 100,
              bottomPct: (bottomY / renderedCanvas.height) * 100,
              widthPct: (f.width / renderedCanvas.width) * 100,
              heightPct: (f.height / renderedCanvas.height) * 100,
              fontSize: f.height,
              source: 'ocr_hybrid',
              confidence: line.score || 0
            });
          }
          const ocrBrokerItems = extractBrokerItems(ocrItems);
          if (ocrBrokerItems.length > 0) {
            console.log(`[V2] ④.5 下部OCRで ${ocrBrokerItems.length}件の業者アイテム発見 → 既存リストにマージ`);
            // テキストアイテムにもマージ（保護判定用）
            for (const item of ocrItems) textItems.push(item);
            for (const item of ocrBrokerItems) brokerItems.push(item);
          } else {
            console.log('[V2] ④.5 下部OCRで業者アイテムなし');
          }
        }
      }
    } catch (e) {
      console.warn('[V2] ④.5 下部OCRフォールバック失敗:', e);
    }
  }

  // --- 業者アイテムもQRもなし ---
  if (brokerItems.length === 0 && qrCodes.length === 0) {
    // 画像ページ → ピクセルベースのフォールバック検出を試行
    if (isImgPage && renderedCanvas) {
      console.log('[V2] 画像ページ: OCR未検出 → ピクセルフォールバック実行');
      const pixelResult = detectObiBandByPixels(renderedCanvas);
      if (pixelResult.found && pixelResult.heightPct >= 3 && pixelResult.topPct >= 50) {
        console.log(`[V2] ピクセルフォールバック成功: Y=${pixelResult.topPct.toFixed(1)}%~100% (H=${pixelResult.heightPct.toFixed(1)}%)`);
        return {
          detected: true, method: 'v2_pixel_fallback', obiType: 'normal',
          topPct: pixelResult.topPct, bottomPct: 100,
          heightPct: pixelResult.heightPct,
          clearTopPct: pixelResult.topPct, clearBottomPct: 100,
          clearLeftPct: 0, clearRightPct: 100,
          isFullWidth: true,
          brokerItems: [], qrCodes: [],
          isImageBased: isImgPage
        };
      }
      console.log('[V2] ピクセルフォールバックも未検出');
    }
    console.log('[V2] 業者情報未検出 → fallback');
    return {
      detected: false, method: 'v2_no_items', obiType: 'none',
      topPct: 90, bottomPct: 100, heightPct: 10,
      clearTopPct: 90, clearBottomPct: 100,
      clearLeftPct: 0, clearRightPct: 100,
      isFullWidth: true,
      brokerItems: [], qrCodes: [],
      isImageBased: isImgPage
    };
  }

  // --- 信頼度チェック: 業者アイテムが1種類のみ & QRなし → 信頼度低い ---
  // 画像ページはOCR精度が低いため、1種類でも検出成功とする
  const uniqueTypes = new Set(brokerItems.flatMap(b => b.brokerTypes));
  if (uniqueTypes.size < 2 && qrCodes.length === 0 && !isImgPage) {
    console.log(`[V2] 業者アイテム種類が少ない (${[...uniqueTypes].join(',')}) → 信頼度低、fallback`);
    return {
      detected: false, method: 'v2_low_confidence', obiType: 'none',
      topPct: 90, bottomPct: 100, heightPct: 10,
      clearTopPct: 90, clearBottomPct: 100,
      clearLeftPct: 0, clearRightPct: 100,
      isFullWidth: true,
      brokerItems, qrCodes,
      isImageBased: isImgPage
    };
  }
  // 画像ページで1種類のみの場合: ピクセル検出で補強を試みる
  if (uniqueTypes.size < 2 && qrCodes.length === 0 && isImgPage) {
    console.log(`[V2] 画像ページ: 業者アイテム1種類 (${[...uniqueTypes].join(',')}) → ピクセル補強`);
    const pixelResult = detectObiBandByPixels(renderedCanvas);
    if (pixelResult.found && pixelResult.topPct >= 50) {
      // ピクセルで帯が見つかれば、OCRの1種類と合わせて信頼度十分とみなす
      console.log(`[V2] ピクセル補強成功 → 検出続行 (pixel Y=${pixelResult.topPct.toFixed(1)}%)`);
    } else {
      console.log(`[V2] 画像ページ: ピクセル補強も失敗 → fallback`);
      return {
        detected: false, method: 'v2_img_low_confidence', obiType: 'none',
        topPct: 90, bottomPct: 100, heightPct: 10,
        clearTopPct: 90, clearBottomPct: 100,
        clearLeftPct: 0, clearRightPct: 100,
        isFullWidth: true,
        brokerItems, qrCodes,
        isImageBased: isImgPage
      };
    }
  }

  // ===== ③.5 クラスタリング（外れ値除去） =====
  const clustering = clusterBrokerItems(brokerItems, qrCodes);
  const effectiveBrokerItems = clustering.mainItems.length > 0 ? clustering.mainItems : brokerItems;

  // クラスタリング後に再度信頼度チェック（画像ページはスキップ — OCR精度考慮）
  const effectiveUniqueTypes = new Set(effectiveBrokerItems.flatMap(b => b.brokerTypes));
  if (effectiveUniqueTypes.size < 2 && qrCodes.length === 0 && clustering.mainItems.length < brokerItems.length && !isImgPage) {
    console.log(`[V2] クラスタリング後の業者アイテム種類不足 → fallback`);
    return {
      detected: false, method: 'v2_clustered_low_confidence', obiType: 'none',
      topPct: 90, bottomPct: 100, heightPct: 10,
      clearTopPct: 90, clearBottomPct: 100,
      clearLeftPct: 0, clearRightPct: 100,
      isFullWidth: true,
      brokerItems: effectiveBrokerItems, qrCodes, outliers: clustering.outliers,
      isImageBased: isImgPage
    };
  }

  // ===== ⑤ クラスタ内の業者アイテム + QRの矩形を算出 =====
  const boundingRect = getBrokerBoundingRect(effectiveBrokerItems, qrCodes);
  console.log(`[V2] ⑤ 矩形: Y=${boundingRect.topPct.toFixed(1)}%~${boundingRect.bottomPct.toFixed(1)}% ` +
    `X=${boundingRect.leftPct.toFixed(1)}%~${boundingRect.rightPct.toFixed(1)}% ` +
    `(H=${boundingRect.heightPct.toFixed(1)}% W=${boundingRect.widthPct.toFixed(1)}%)`);

  // ===== ⑥ 帯タイプ分類 =====
  const bandType = classifyBandType(boundingRect, effectiveBrokerItems);
  console.log(`[V2] ⑥ 帯タイプ: ${bandType}`);

  // ===== ⑦ 削除領域決定 =====
  let clearRegion = determineClearRegion(bandType, boundingRect);
  console.log(`[V2] ⑦ 削除領域: Y=${clearRegion.clearTopPct.toFixed(1)}%~${clearRegion.clearBottomPct.toFixed(1)}% ` +
    `X=${clearRegion.clearLeftPct.toFixed(1)}%~${clearRegion.clearRightPct.toFixed(1)}% (${clearRegion.method})`);

  // ===== ⑧ 保護アイテム確認 & 調整 =====
  const pageImages = await getAllPageImages(page);
  clearRegion = adjustForProtectedItems(clearRegion, textItems, pageImages, effectiveBrokerItems);

  // 保護アイテム衝突で検出不能の場合
  if (clearRegion.hasProtectedConflict) {
    console.warn('[V2] 保護アイテム衝突 → 安全のため検出成功として返すが要注意フラグ付き');
  }

  // ===== 結果を返す =====
  const obiType = bandType === 'bottom' ? 'normal' : bandType === 'middle' ? 'mid_band' : 'irregular';

  return {
    detected: true,
    method: clearRegion.method,
    obiType,
    topPct: clearRegion.clearTopPct,
    bottomPct: clearRegion.clearBottomPct,
    heightPct: clearRegion.clearBottomPct - clearRegion.clearTopPct,
    clearTopPct: clearRegion.clearTopPct,
    clearBottomPct: clearRegion.clearBottomPct,
    clearLeftPct: clearRegion.clearLeftPct || 0,
    clearRightPct: clearRegion.clearRightPct || 100,
    isFullWidth: clearRegion.isFullWidth !== false,
    brokerItems: effectiveBrokerItems,
    outliers: clustering.outliers,
    qrCodes,
    boundingRect,
    bandType,
    protectedConflict: clearRegion.hasProtectedConflict || false,
    protectedItems: clearRegion.protectedItems || null,
    isImageBased: isImgPage
  };
}

// ===== Broker matching and cleanup =====
function isBrokerMatch(text, fp) {
  if (ANCHOR_STRONG.some(kw => text.includes(kw))) return 'anchor';
  if (ANCHOR_MEDIUM.some(kw => text.includes(kw))) return 'anchor';
  if (BROKER_KW.some(kw => text.includes(kw))) return 'broker_kw';

  const itemPhones = extractPhones(text);
  for (const p of itemPhones) {
    if ([...fp.phones].some(fpp => fpp === p || fpp.includes(p) || p.includes(fpp))) return 'phone_fp';
  }

  if (fp.companies.some(c => text.includes(c))) {
    if (!['施工会社', '分譲会社', '管理会社', '施工/', '分譲/', '管理/'].some(ctx => text.includes(ctx))) {
      return 'company_fp';
    }
  }

  if (fp.licenses.some(l => text.includes(l))) return 'license_fp';
  if (fp.emails.some(e => text.includes(e))) return 'email_fp';
  emailRe.lastIndex = 0;
  if (emailRe.test(text)) return 'email';
  if (fp.urls.some(u => text.includes(u))) return 'url_fp';
  urlRe.lastIndex = 0;
  if (urlRe.test(text)) return 'url';
  if (fp.zipcodes.some(z => text.includes(z))) return 'zipcode_fp';

  return null;
}

async function findAllBrokerItems(page) {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;
  const pageWidth = viewport.width;

  const allItems = [];
  for (const item of textContent.items) {
    const text = item.str;
    if (!text || text.trim().length === 0) continue;
    const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
    const x = item.transform[4];
    const y = item.transform[5];
    const yFromTop = pageHeight - y;
    const rawYPct = (yFromTop / pageHeight) * 100;
    const yPct = Math.min(100, Math.max(0, rawYPct));
    const isOOB = rawYPct > 100 || rawYPct < 0;
    const textWidth = item.width || (text.length * fontSize * 0.6);
    allItems.push({ text, x, y: yFromTop, yPct, rawYPct, fontSize, isOOB, textWidth });
  }

  const textResult = await detectObiByText(page);
  if (!textResult.found) return { brokerItems: [], fingerprint: null, obiBoundaryPct: null };

  const boundary = textResult.topPct - 1.5;
  const fp = textResult.fingerprint;

  const brokerItems = [];
  const RENDER_SCALE = 2;
  for (const item of allItems) {
    const text = item.text;

    if (!item.isOOB && item.yPct < boundary) continue;

    const matchReason = isBrokerMatch(text, fp);
    if (!matchReason) continue;

    brokerItems.push({
      x: item.x * RENDER_SCALE,
      y: (item.y - item.fontSize) * RENDER_SCALE,
      w: item.textWidth * RENDER_SCALE,
      h: (item.fontSize + 2) * RENDER_SCALE,
      yPct: item.yPct,
      text: item.text.substring(0, 30),
      reason: matchReason
    });
  }

  return { brokerItems, fingerprint: fp, obiBoundaryPct: boundary };
}

function applyBrokerCleanup(ctx, brokerItems) {
  ctx.fillStyle = '#ffffff';
  for (const t of brokerItems) {
    ctx.fillRect(
      Math.max(0, t.x - 3),
      Math.max(0, t.y - 3),
      t.w + 6,
      t.h + 6
    );
  }
}

function applyZoneWhiteout(ctx, pageWidth, pageHeight, clearTopPct, clearBottomPct, clearLeftPct, clearRightPct) {
  const clearY = Math.round(pageHeight * clearTopPct / 100);
  const clearH = Math.round(pageHeight * (clearBottomPct - clearTopPct) / 100);
  const clearX = Math.round(pageWidth * (clearLeftPct || 0) / 100);
  const clearW = Math.round(pageWidth * ((clearRightPct || 100) - (clearLeftPct || 0)) / 100);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(clearX, clearY, clearW, clearH);
}

function applyObiOverlay(ctx, pageWidth, pageHeight, region) {
  if (typeof obiImage === 'undefined' || !obiImage) return;
  const x = Math.round(pageWidth * (region.clearLeftPct || 0) / 100);
  const y = Math.round(pageHeight * region.clearTopPct / 100);
  const w = Math.round(pageWidth * ((region.clearRightPct || 100) - (region.clearLeftPct || 0)) / 100);
  const h = Math.round(pageHeight * (region.clearBottomPct - region.clearTopPct) / 100);
  ctx.drawImage(obiImage, x, y, w, h);
}

function applyObiOverlayForPage(ctx, pageWidth, pageHeight, region, pageIdx) {
  if (typeof obiImage === 'undefined' || !obiImage) return;
  var page = (typeof pdfPages !== 'undefined' && pdfPages[pageIdx]) ? pdfPages[pageIdx] : null;
  var custom = page && page.obiCustomRect;
  var x, y, w, h;
  if (custom) {
    x = Math.round(pageWidth * custom.xPct / 100);
    y = Math.round(pageHeight * custom.yPct / 100);
    w = Math.round(pageWidth * custom.wPct / 100);
    h = Math.round(pageHeight * custom.hPct / 100);
  } else {
    x = Math.round(pageWidth * (region.clearLeftPct || 0) / 100);
    y = Math.round(pageHeight * region.clearTopPct / 100);
    w = Math.round(pageWidth * ((region.clearRightPct || 100) - (region.clearLeftPct || 0)) / 100);
    h = Math.round(pageHeight * (region.clearBottomPct - region.clearTopPct) / 100);
  }
  ctx.drawImage(obiImage, x, y, w, h);
}
