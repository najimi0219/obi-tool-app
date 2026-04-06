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

// ===== OCR region (browser-dependent, stubs provided) =====
// ===== OCR関連 =====
let ocrWorker = null;
let ocrReady = false;
let ocrInitializing = false;

async function initOcrWorker() {
  if (ocrReady || ocrInitializing) return;
  ocrInitializing = true;
  try {
    ocrWorker = await Tesseract.createWorker('jpn', 1, {
      logger: m => { }
    });
    ocrReady = true;
  } catch (e) {
    console.warn('OCR初期化失敗:', e);
    ocrReady = false;
  }
  ocrInitializing = false;
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
    const result = await ocrWorker.recognize(tmpCanvas);
    const ocrText = result.data.text || '';

    const brokerKeywords = ['TEL', 'FAX', 'tel', 'fax', '免許', '宅建', '取引態様',
      '媒介', '不動産', '株式会社', '有限会社', '担当', '仲介', '専任',
      '手数料', '物件確認', '問い合わせ', '問合せ', '営業時間',
      '社名', '担当者', '情報提供元', '情報提供'];
    const phoneRe = /\d{2,4}[-ー\s]?\d{2,4}[-ー\s]?\d{3,4}/;
    const emailRe = /[\w.-]+@[\w.-]+/;

    let matchCount = 0;
    const matchedKeywords = [];
    for (const kw of brokerKeywords) {
      if (ocrText.includes(kw)) { matchCount++; matchedKeywords.push(kw); }
    }
    if (phoneRe.test(ocrText)) { matchCount++; matchedKeywords.push('電話番号'); }
    if (emailRe.test(ocrText)) { matchCount++; matchedKeywords.push('メール'); }

    let brokerMinYPct = null;
    try {
      const words = result.data.words || [];
      if (words.length > 0) {
        let minY = Infinity;
        for (const word of words) {
          const wText = word.text || '';
          let isBrokerWord = false;
          if (brokerKeywords.some(kw => wText.includes(kw))) isBrokerWord = true;
          if (!isBrokerWord && phoneRe.test(wText)) isBrokerWord = true;
          if (!isBrokerWord && emailRe.test(wText)) isBrokerWord = true;
          if (!isBrokerWord && /株式会社|有限会社|\(株\)|（株）/.test(wText)) isBrokerWord = true;
          if (isBrokerWord && word.bbox) {
            const wordYInPage = cropY + word.bbox.y0;
            const wordYPct = (wordYInPage / canvas.height) * 100;
            if (wordYPct < minY) minY = wordYPct;
          }
        }
        if (minY < Infinity) brokerMinYPct = minY;
      }
    } catch (e) { }

    return { text: ocrText, hasBrokerInfo: matchCount >= 2, matchCount, matchedKeywords, brokerMinYPct };
  } catch (e) {
    console.warn('OCR失敗:', e);
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
    const result = await ocrWorker.recognize(tmpCanvas);
    const ocrText = result.data.text || '';

    const brokerKeywords = ['TEL', 'FAX', 'tel', 'fax', '免許', '宅建', '取引態様',
      '媒介', '不動産', '株式会社', '有限会社', '担当', '仲介', '専任',
      '手数料', '物件確認', '問い合わせ', '問合せ', '営業時間',
      '社名', '担当者', '情報提供元', '情報提供'];
    const phoneRe = /\d{2,4}[-ー\s]?\d{2,4}[-ー\s]?\d{3,4}/;
    const emailRe = /[\w.-]+@[\w.-]+/;

    let matchCount = 0;
    const matchedKeywords = [];
    for (const kw of brokerKeywords) {
      if (ocrText.includes(kw)) { matchCount++; matchedKeywords.push(kw); }
    }
    if (phoneRe.test(ocrText)) { matchCount++; matchedKeywords.push('電話番号'); }
    if (emailRe.test(ocrText)) { matchCount++; matchedKeywords.push('メール'); }

    let brokerMinYPct = null;
    try {
      const words = result.data.words || [];
      if (words.length > 0) {
        let minY = Infinity;
        for (const word of words) {
          const wText = word.text || '';
          let isBrokerWord = false;
          if (brokerKeywords.some(kw => wText.includes(kw))) isBrokerWord = true;
          if (!isBrokerWord && phoneRe.test(wText)) isBrokerWord = true;
          if (!isBrokerWord && emailRe.test(wText)) isBrokerWord = true;
          if (!isBrokerWord && /株式会社|有限会社|\(株\)|（株）/.test(wText)) isBrokerWord = true;
          if (isBrokerWord && word.bbox) {
            const wordYInPage = cropY + word.bbox.y0;
            const wordYPct = (wordYInPage / canvas.height) * 100;
            if (wordYPct < minY) minY = wordYPct;
          }
        }
        if (minY < Infinity) brokerMinYPct = minY;
      }
    } catch (e) { }

    return { text: ocrText, hasBrokerInfo: matchCount >= 2, matchCount, matchedKeywords, brokerMinYPct };
  } catch (e) {
    console.warn('OCR失敗:', e);
    return null;
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

// ===== Main integrated detection function =====
async function detectObiRegion(page, renderedCanvas) {
  const viewport = page.getViewport({ scale: 1 });
  const pageH = viewport.height;
  const pageW = viewport.width;

  const text = await detectObiByText(page);
  const logos = await detectTextLogos(page);
  const images = await detectObiImages(page);
  const pixel = detectObiByPixels(renderedCanvas);

  let obiType = 'none';
  let brokerTextItems = [];
  let allTextItems = [];

  const tc = await page.getTextContent();
  for (const item of tc.items) {
    if (!item.str || item.str.trim().length === 0) continue;
    const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
    const yFromTop = pageH - item.transform[5];
    const yPct = (yFromTop / pageH) * 100;
    const xPct = (item.transform[4] / pageW) * 100;
    allTextItems.push({ str: item.str, text: item.str, yPct, xPct, fontSize });
  }

  if (text.found) {
    obiType = text.topPct >= 75 ? 'normal' : 'irregular';

    if (text.fingerprint) {
      for (const item of allTextItems) {
        if (item.yPct >= text.topPct - 3) {
          const matchReason = isBrokerMatch(item.str, text.fingerprint);
          if (matchReason) {
            brokerTextItems.push({ text: item.str, yPct: item.yPct, xPct: item.xPct, fontSize: item.fontSize, reason: matchReason });
          }
        }
      }
    }
  }

  const paths = await detectPathElements(page);

  if (paths.hLines.length === 0 && renderedCanvas) {
    const pixelLines = detectPixelHLines(renderedCanvas);
    if (pixelLines.length > 0) {
      paths.hLines.push(...pixelLines);
    }
  }

  if (paths.rects.length === 0 && renderedCanvas && paths.hLines.length >= 2) {
    const pixelBoxes = detectPixelBoxes(renderedCanvas, paths.hLines);
    if (pixelBoxes.length > 0) {
      paths.rects.push(...pixelBoxes);
    }
  }

  let brokerBox = null;
  let brokerLine = null;
  let clearRegion = null;

  brokerBox = findBrokerBox(paths.rects, brokerTextItems, allTextItems, text);

  if (brokerBox) {
    let boxTopPct = brokerBox.yPct;
    let boxBottomPct = brokerBox.bottomPct;

    if (brokerBox.hPct > 15 && brokerTextItems.length > 0) {
      const brokerInBox = brokerTextItems.filter(t =>
        t.yPct >= brokerBox.yPct - 2 && t.yPct <= brokerBox.bottomPct + 2);
      if (brokerInBox.length > 0) {
        const minBrokerY = Math.min(...brokerInBox.map(t => t.yPct));
        boxTopPct = Math.max(brokerBox.yPct, minBrokerY - 3);
      }
    }

    const isPartialBox = brokerBox.wPct < 80;

    if (isPartialBox) {
      if (text.found && brokerTextItems.length > 0) {
        const altLine = findBrokerLine(paths.hLines, brokerTextItems);
        if (altLine && altLine.yPct > boxTopPct) {
          brokerLine = altLine;
          brokerBox = null;
          if (obiType === 'normal') {
            clearRegion = {
              detected: true, method: 'line',
              clearTopPct: altLine.yPct, clearBottomPct: 100,
              clearLeftPct: 0, clearRightPct: 100,
              isFullWidth: true, line: altLine
            };
          } else {
            clearRegion = {
              detected: true, method: 'line_irregular',
              clearTopPct: altLine.yPct,
              clearBottomPct: Math.min(100, Math.max(...brokerTextItems.map(t => t.yPct)) + 4),
              clearLeftPct: altLine.xStartPct, clearRightPct: altLine.xEndPct,
              isFullWidth: altLine.widthPct >= 90, line: altLine
            };
          }
        } else if (altLine && altLine.widthPct >= 50) {
          brokerLine = altLine;
          brokerBox = null;
          clearRegion = {
            detected: true, method: 'line',
            clearTopPct: altLine.yPct, clearBottomPct: 100,
            clearLeftPct: 0, clearRightPct: 100,
            isFullWidth: altLine.widthPct >= 90, line: altLine
          };
        } else {
          if (text.topPct > boxTopPct + 5) {
            brokerBox = null;
          } else if (brokerBox.wPct < 60) {
            brokerBox = null;
          }
        }
      } else if (brokerBox.wPct < 60) {
        brokerBox = null;
      }
    }

    if (brokerBox && !clearRegion) {
      clearRegion = {
        detected: true,
        method: obiType === 'normal' ? 'box' : (obiType === 'irregular' ? 'box_irregular' : 'box'),
        clearTopPct: boxTopPct,
        clearBottomPct: boxBottomPct,
        clearLeftPct: brokerBox.xPct,
        clearRightPct: brokerBox.xPct + brokerBox.wPct,
        isFullWidth: brokerBox.wPct >= 90,
        box: brokerBox
      };
    }
  }

  if (!clearRegion && text.found && brokerTextItems.length > 0) {
    brokerLine = findBrokerLine(paths.hLines, brokerTextItems);

    if (brokerLine && brokerLine.yPct < 66) {
      brokerLine = null;
    }

    if (brokerLine) {
      if (obiType === 'normal') {
        clearRegion = {
          detected: true,
          method: 'line',
          clearTopPct: brokerLine.yPct,
          clearBottomPct: 100,
          clearLeftPct: 0,
          clearRightPct: 100,
          isFullWidth: true,
          line: brokerLine
        };
      } else {
        clearRegion = {
          detected: true,
          method: 'line_irregular',
          clearTopPct: brokerLine.yPct,
          clearBottomPct: Math.min(100, Math.max(...brokerTextItems.map(t => t.yPct)) + 4),
          clearLeftPct: brokerLine.xStartPct,
          clearRightPct: brokerLine.xEndPct,
          isFullWidth: brokerLine.widthPct >= 90,
          line: brokerLine
        };
      }
    }

    if (!clearRegion && text.clusterScore >= 10 && text.topPct >= 70) {
      clearRegion = {
        detected: true,
        method: 'text_cluster',
        clearTopPct: Math.max(55, text.topPct - 1.5),
        clearBottomPct: text.botPct ? Math.min(100, text.botPct + 1.0) : 100,
        clearLeftPct: 0,
        clearRightPct: 100,
        isFullWidth: true
      };
    }
  }

  if (!clearRegion && !text.found && paths.hLines.length > 0) {
    const lowerLines = paths.hLines.filter(l => l.yPct >= 70 && l.widthPct >= 50);
    if (lowerLines.length > 0) {
      lowerLines.sort((a, b) => a.yPct - b.yPct);
      const lineY = lowerLines[0].yPct;

      const lowerTexts = allTextItems.filter(t => t.yPct >= lineY - 2 && t.yPct <= 100);
      let hasBrokerKw = false;
      for (const t of lowerTexts) {
        const s = t.str;
        if (ANCHOR_STRONG.some(k => s.includes(k)) ||
          ANCHOR_MEDIUM.some(k => s.includes(k)) ||
          BROKER_KW.some(k => s.includes(k))) {
          hasBrokerKw = true;
          break;
        }
      }

      if (hasBrokerKw) {
        brokerLine = lowerLines[0];
        clearRegion = {
          detected: true,
          method: 'line',
          clearTopPct: brokerLine.yPct,
          clearBottomPct: 100,
          clearLeftPct: 0,
          clearRightPct: 100,
          isFullWidth: brokerLine.widthPct >= 90,
          line: brokerLine
        };
      }
    }
  }

  if (!clearRegion && text.found) {
    let clearTopPct = text.topPct;
    let method = 'text';

    if (logos.found && logos.topPct < clearTopPct && logos.topPct >= 70) {
      clearTopPct = logos.topPct;
      method = 'text+logo';
    }
    if (images.found && images.topPct < clearTopPct && images.topPct >= clearTopPct - 15) {
      clearTopPct = images.topPct;
      method += '+img';
    }

    clearTopPct = Math.max(55, Math.min(95, clearTopPct - 1.5));
    const clearBotPct = text.botPct ? Math.min(100, text.botPct + 1.0) : 100;
    clearRegion = {
      detected: true,
      method,
      clearTopPct,
      clearBottomPct: clearBotPct,
      clearLeftPct: 0,
      clearRightPct: 100,
      isFullWidth: true
    };

  } else if (!clearRegion && (logos.found || images.found || (pixel.found && pixel.boundaryPct > 75))) {
    let clearTopPct = logos.found ? logos.topPct : images.found ? images.topPct : pixel.boundaryPct;
    let method = logos.found ? 'logo' : images.found ? 'image' : 'pixel';
    clearTopPct = Math.max(58, Math.min(95, clearTopPct - 1.5));
    clearRegion = {
      detected: true,
      method,
      clearTopPct,
      clearBottomPct: 100,
      clearLeftPct: 0,
      clearRightPct: 100,
      isFullWidth: true
    };
  }

  if (!clearRegion) {
    const midBand = detectMidPageBand(renderedCanvas);
    if (midBand.found) {
      const isImgPage = isImageBasedPage(tc);

      if (!isImgPage) {
        const bandTexts = allTextItems.filter(t =>
          t.yPct >= midBand.topPct - 2 && t.yPct <= midBand.bottomPct + 2);
        const hasBrokerKw = bandTexts.some(t => {
          const s = t.str || t.text || '';
          return ANCHOR_STRONG.some(k => s.includes(k)) ||
            ANCHOR_MEDIUM.some(k => s.includes(k)) ||
            BROKER_KW.some(k => s.includes(k)) ||
            /\d{2,4}[-\s]?\d{2,4}[-\s]?\d{3,4}/.test(s);
        });
        if (hasBrokerKw) {
          clearRegion = {
            detected: true,
            method: 'mid_band',
            clearTopPct: midBand.topPct,
            clearBottomPct: midBand.bottomPct,
            clearLeftPct: 0,
            clearRightPct: 100,
            isFullWidth: true
          };
          obiType = 'mid_band';
        }
      }
    }
  }

  if (!clearRegion && paths.hLines.length > 0) {
    const midLines = paths.hLines.filter(l => l.yPct >= 25 && l.yPct <= 70 && l.widthPct >= 50);
    if (midLines.length > 0) {
      midLines.sort((a, b) => Math.abs(a.yPct - 50) - Math.abs(b.yPct - 50));
      const midLine = midLines[0];
    }
  }

  if (!clearRegion) {
    const isImgPage = isImageBasedPage(tc);
    const pixelBand = detectObiBandByPixels(renderedCanvas);

    if (pixelBand.found) {
      if (!isImgPage) {
        const vp = page.getViewport({ scale: 1 });
        const vpH = vp.height;
        const searchTop = Math.max(0, pixelBand.topPct - 5);
        const searchBottom = Math.min(100, (pixelBand.bottomPct || 100) + 2);
        const bandItems = (tc.items || []).filter(item => {
          const str = (item.str || '').trim();
          if (str.length < 2) return false;
          const yFromTop = item.transform ? (1 - item.transform[5] / vpH) * 100 : 100;
          return yFromTop >= searchTop && yFromTop <= searchBottom;
        });
        const brokerKws = ['TEL', 'FAX', 'tel', 'fax', '免許', '不動産', '株式会社', '有限会社', '（株）', '(株)',
          '宅地建物', '仲介', '媒介', '建設', 'ホーム', 'ハウス', 'リアル', 'エステート', 'プロパティ',
          '電話', '担当', '問い合わせ', '問合せ', '手数料', '専任', '物件確認',
          '社名', '担当者', '情報提供元', '情報提供'];
        const phoneRe = /\d{2,4}[-\s]?\d{2,4}[-\s]?\d{3,4}/;
        const hasKw = bandItems.some(item => {
          const s = item.str || '';
          return brokerKws.some(kw => s.includes(kw)) || phoneRe.test(s);
        });
        if (hasKw) {
          clearRegion = {
            detected: true,
            method: pixelBand.method || 'pixel_band',
            clearTopPct: pixelBand.topPct,
            clearBottomPct: pixelBand.bottomPct || 100,
            clearLeftPct: 0,
            clearRightPct: 100,
            isFullWidth: true
          };
        }
      }
    }
  }

  if (!clearRegion) {
    return {
      detected: false, method: 'fallback', obiType: obiType || 'none',
      topPct: 90, bottomPct: 100, heightPct: 10,
      clearTopPct: 90, clearBottomPct: 100,
      clearLeftPct: 0, clearRightPct: 100,
      isFullWidth: true,
      hitCount: 0, keywords: [],
      pixelBoundary: pixel.found ? pixel.boundaryPct : null,
      textBoundary: null, imageBoundary: null, logoBoundary: null,
      brokerBox: null, brokerLine: null, pathInfo: paths,
      isImageBased: isImageBasedPage(tc)
    };
  }

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
    hitCount: text.found ? text.hitCount : 0,
    keywords: text.found ? text.keywords : [],
    pixelBoundary: pixel.found ? pixel.boundaryPct : null,
    textBoundary: text.found ? text.topPct : null,
    imageBoundary: images.found ? images.topPct : null,
    logoBoundary: logos.found ? logos.topPct : null,
    brokerBox: brokerBox,
    brokerLine: brokerLine,
    pathInfo: paths,
    ocrResult: clearRegion.ocrResult || null,
    isImageBased: isImageBasedPage(tc)
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
