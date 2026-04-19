// ===== Obi-Tool 検出エンジン (共有) =====
// このファイルはindex.html と viewer.html の両方から読み込まれます

    // ===== 業者情報検出キーワード定義 =====
    // 強アンカー: 業者情報にしか出現しないキーワード
    const ANCHOR_STRONG = [
      '都知事', '府知事', '県知事', '国土交通大臣', '国土交通省',
      '取引態様', '取引形態', '取引様態',
    ];
    // 中アンカー: 業者情報に頻出だが稀に物件情報にも出る
    const ANCHOR_MEDIUM = ['免許(', '免許（', '免許証', '宅建免許', '知事免許', '大臣免許'];
    // 業者関連キーワード（フィンガープリント拡張用）
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
    // 物件情報キーワード（拡張をブロック）
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
    // 施設距離パターン
    const facilityRe = /(?:店|学校|園|局|病院|医院|クリニック|寺|教会|神社).*?(?:約|徒歩|分|ｍ|m)|(?:約\d+[mｍ]|徒歩\d+分|徒歩約\d+分)|・・・・約?\d+[mｍ]/;

    // ===== Elements =====
    const pdfInput = document.getElementById('pdfInput');

    // ===== Drag & Drop (PDF only) =====
    const pdfZone = document.getElementById('pdfZone');
    pdfZone.addEventListener('dragover', (e) => { e.preventDefault(); pdfZone.classList.add('dragover'); });
    pdfZone.addEventListener('dragleave', () => { pdfZone.classList.remove('dragover'); });
    pdfZone.addEventListener('drop', (e) => {
      e.preventDefault();
      pdfZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) handlePDFFile(file);
    });

    // ===== PDF Upload =====
    pdfInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePDFFile(file);
    });

    // ===== 帯画像 Upload =====
    const obiZone = document.getElementById('obiZone');
    const obiInput = document.getElementById('obiInput');

    obiZone.addEventListener('dragover', (e) => { e.preventDefault(); obiZone.classList.add('dragover'); });
    obiZone.addEventListener('dragleave', () => { obiZone.classList.remove('dragover'); });
    obiZone.addEventListener('drop', (e) => {
      e.preventDefault();
      obiZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      const imgExts = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];
      if (file && (file.type.startsWith('image/') || imgExts.some(ext => file.name.toLowerCase().endsWith(ext)))) handleObiImageFile(file);
    });

    obiInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleObiImageFile(file);
    });

    function handleObiImageFile(file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          obiImage = img;
          applyObiImageUI(file.name, img, ev.target.result);
          // Electron: 帯画像を永続保存
          if (window.electronAPI) {
            file.arrayBuffer().then(buf => {
              window.electronAPI.saveObiImage(buf, file.name);
            });
          }
          showToast('✓ 帯画像を登録・保存しました');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    // 帯画像のUI反映（共通処理）
    function applyObiImageUI(name, img, dataUrl) {
      document.getElementById('obiInfo').textContent = `✓ ${name} (${img.width}×${img.height})`;
      document.getElementById('obiInfo').style.display = 'block';
      document.getElementById('obiThumbImg').src = dataUrl;
      document.getElementById('obiPreviewThumb').style.display = 'block';
      document.getElementById('obiZone').classList.add('has-file');
      if (pdfPages.length > 0) {
        document.getElementById('resultPanelLabel').textContent = '帯差し替え後';
        tryRenderPreview();
      }
    }

    function clearObiImage() {
      obiImage = null;
      document.getElementById('obiInfo').style.display = 'none';
      document.getElementById('obiPreviewThumb').style.display = 'none';
      document.getElementById('obiZone').classList.remove('has-file');
      obiInput.value = '';
      document.getElementById('resultPanelLabel').textContent = '業者情報削除後';
      if (pdfPages.length > 0) tryRenderPreview();
      // Electron: 保存済み帯画像も削除
      if (window.electronAPI) {
        window.electronAPI.clearObiImage();
      }
      showToast('帯画像をクリアしました');
    }

    async function handlePDFFile(file) {
      document.getElementById('pdfInfo').textContent = `✓ ${file.name}`;
      document.getElementById('pdfInfo').style.display = 'block';
      document.getElementById('pdfZone').classList.add('has-file');
      updateStep(1, 'done');
      await loadPDF(file);
    }

    // ===== Obi Detection Logic (3-Signal Hybrid) =====
    //
    // 実データ解析結果:
    //  - 帯はベタ塗りではなく、テキスト+ロゴ+余白が混在
    //  - ページごとに帯サイズが違う(10〜18%)
    //  - ピクセル行単位だとノイズが多い
    //
    // 改善方針:
    //  Signal 1: ピクセル「バンド密度」方式（1%帯の平均で安定化）
    //  Signal 2: テキストキーワード位置
    //  Signal 3: 画像（ロゴ等）の座標
    //  → 3つのうち最も上の境界を採用（マージン付き）

    // ---- Signal 1: ピクセルバンド密度スキャン ----
    function detectObiByPixels(canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const w = canvas.width;
      const h = canvas.height;

      // 下部30%をスキャン
      const scanStartPct = 70;
      const scanStartY = Math.floor(h * scanStartPct / 100);

      // 1%バンドごとに平均非白率を計算
      const bandSize = Math.max(1, Math.floor(h / 100)); // 1%分のピクセル行数
      const sampleLeft = Math.floor(w * 0.05);
      const sampleRight = Math.floor(w * 0.95);
      const sampleWidth = sampleRight - sampleLeft;
      const sampleStep = Math.max(1, Math.floor(sampleWidth / 80));

      const bands = []; // { pct, avgRatio }

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
            // 白/薄グレー判定（RGB全て230以上）
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

      // 下端から上方向にスキャン:
      // 「帯エリア」= 下端から連続して密度>0.08のバンドが含まれる領域
      // 連続3バンド以上密度<0.05なら帯の上端と判定

      const ACTIVE_THRESHOLD = 0.08;  // これ以上なら「帯の一部」
      const EMPTY_THRESHOLD = 0.05;   // これ以下なら「空白」

      let emptyStreak = 0;
      let boundaryPct = null;
      let hasActiveBottom = false;

      // まず下端3バンドに活性があるか確認
      const bottom3 = bands.slice(-3);
      if (bottom3.some(b => b.avgRatio >= ACTIVE_THRESHOLD)) {
        hasActiveBottom = true;
      }

      if (!hasActiveBottom) {
        // 下端にも活性がないが、少し上にある可能性
        // 下端付近（90%以降）で活性のあるバンドを探す
        const lateActive = bands.filter(b => b.pct >= 85 && b.avgRatio >= ACTIVE_THRESHOLD);
        if (lateActive.length > 0) hasActiveBottom = true;
      }

      if (!hasActiveBottom) return { found: false, boundaryPct: null };

      // 下から上にスキャン
      for (let i = bands.length - 1; i >= 0; i--) {
        if (bands[i].avgRatio < EMPTY_THRESHOLD) {
          emptyStreak++;
        } else {
          emptyStreak = 0;
        }

        // 3バンド連続で空なら境界
        if (emptyStreak >= 3) {
          boundaryPct = bands[i + 3] ? bands[i + 3].pct : bands[i].pct;
          break;
        }
      }

      if (boundaryPct === null) {
        // 途切れなかった → スキャン開始点が境界
        boundaryPct = scanStartPct;
      }

      return { found: true, boundaryPct };
    }

    // ---- ユーティリティ関数 ----
    function normalizeText(text) {
      return text
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
        .replace(/[ー‐−―─–—]/g, '-')
        .replace(/\s/g, '');
    }
    function normalizeCJK(text) {
      // CJK互換漢字を正規漢字に変換（PDFで頻出）
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

    // 正規表現パターン
    const phoneRe = /0\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{2,4}/g;
    const licenseRe = /第[\d０-９]+号/g;
    const emailRe = /[\w.-]+@[\w.-]+\.\w+/g;
    const urlRe = /(?:https?:\/\/|www\.)\S+/gi;
    const companyRe = /(?:株式会社|有限会社|合同会社)[\u3000-\u9FFF\w]{2,}|[\u3000-\u9FFF\w]{2,}(?:株式会社|有限会社|合同会社)/g;
    const zipcodeRe = /〒\d{3}[-]?\d{4}/g;
    // 不動産関連語（ロゴ検出用）
    const realestateRe = /不動産|ホーム|ハウス|エステート|リアルティ|トラスト|住宅|住まい|レジデンス|ソリューション/;

    // ---- Signal 4: テキストロゴ検出（大フォント会社名/電話番号）----
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
        if (yPct < 0) continue; // 上にはみ出しは無視
        items.push({ text, fontSize, yPct: Math.min(100, yPct) });
      }

      if (items.length === 0) return { found: false, topPct: null, logos: [] };

      // 中央値フォントサイズ
      const sizes = items.map(i => i.fontSize).sort((a, b) => a - b);
      const medianFs = sizes[Math.floor(sizes.length / 2)];

      // 下部20%（Y>=80%）で大きいフォントの業者関連テキストを検出
      const logos = [];
      for (const item of items) {
        if (item.yPct < 80) continue;
        const ratio = item.fontSize / medianFs;

        // 条件1: フォント1.5倍以上 + 会社名/不動産関連語
        companyRe.lastIndex = 0;
        const isCompany = companyRe.test(item.text) || realestateRe.test(item.text);
        if (ratio >= 1.5 && isCompany) {
          logos.push({ ...item, ratio, reason: 'company_logo' });
          continue;
        }

        // 条件2: フォント1.8倍以上 + 電話番号（大きい電話番号はロゴ級）
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

    // ---- Signal 2: キーワードBBOXクラスタリング方式 ----
    // ① 各テキストアイテムにYpct座標を付与してキーワードヒットを記録
    // ② ヒットボックスを近傍マージ（垂直方向 MERGE_GAP_PCT 以内は結合）
    // ③ 最も多くのブローカーキーワードを含むクラスタを選択
    // ④ クラスタのY範囲を全幅（x: 0〜100%）に引き伸ばす
    // ⑤ 保護チェック: クラスタ内に物件情報キーワードがあればその行を除外
    async function detectObiByText(page) {
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;

      if (!textContent || !textContent.items) return { found: false, topPct: null, keywords: [], allTextItems: [] };

      // ── Step 1: 全テキストアイテムをY座標付きで収集 ──
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
        // ボックスの上端・下端（%）
        const yTopPct = yPct;
        const yBotPct = Math.min(100, ((yFromTop + height) / pageHeight) * 100);
        allTextItems.push({ text, yPct, yTopPct, yBotPct, rawYPct, isOOB });
      }

      if (allTextItems.length === 0) return { found: false, topPct: null, keywords: [], allTextItems };

      // ── Step 2: スコア定数 ──
      const SCORE_STRONG = 10;   // 強アンカー
      const SCORE_MEDIUM = 6;    // 中アンカー
      const SCORE_BROKER = 3;    // ブローカーKW
      const SCORE_PHONE = 4;    // 電話番号
      const SCORE_COMPANY = 4;    // 会社名
      const SCORE_EMAIL = 3;    // メール
      const SCORE_PROTECT = -20;  // 物件情報（保護対象）

      // 会社名の近傍コンテキスト判定用キーワード
      const PROP_TABLE_CTX = [
        '管理会社', '施工会社', '分譲会社', '管理組合',
        '売主', '事業主', '建設会社', '設計会社', '監理'
      ];

      // 近傍（±Y_CTX%以内）に物件テーブルコンテキストがあるか判定
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

        // 会社名マッチ: 近傍（±3%Y）に物件テーブルラベルがある場合は除外
        companyRe.lastIndex = 0;
        if (companyRe.test(t)) {
          var inPropertyTableRow = hasPropertyTableContext(item.yPct);
          if (!inPropertyTableRow) { score += SCORE_COMPANY; tags.push('company'); }
        }

        emailRe.lastIndex = 0; if (emailRe.test(t)) { score += SCORE_EMAIL; tags.push('email'); }
        if (isPropertyText(t)) { score += SCORE_PROTECT; tags.push('protect'); }

        scoredItems.push(Object.assign({}, item, { score: score, tags: tags }));
      }

      // ── Step 3: ヒットアイテム（スコア > 0）をY座標でクラスタリング ──
      // 近傍 MERGE_GAP_PCT% 以内のボックスを同一クラスタにマージ
      const MERGE_GAP_PCT = 4.0; // 4%以内は同じ帯とみなす
      const hitItems = scoredItems.filter(function (i) { return i.score > 0 && !i.tags.includes('protect'); });

      if (hitItems.length === 0) return { found: false, topPct: null, keywords: [], allTextItems };

      // Y座標でソート
      hitItems.sort(function (a, b) { return a.yTopPct - b.yTopPct; });

      // Union-Find的なグルーピング
      const clusters = [];
      for (const item of hitItems) {
        let merged = false;
        for (const cluster of clusters) {
          // クラスタのY範囲と MERGE_GAP を考慮して近傍判定
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

      // ── Step 4: 最高スコアのクラスタを選択 ──
      clusters.sort(function (a, b) { return b.totalScore - a.totalScore; });
      const best = clusters[0];

      // スコアが低すぎる場合は不検出
      if (best.totalScore < SCORE_BROKER) return { found: false, topPct: null, keywords: [], allTextItems };

      // ── Step 5: 保護チェック ──
      // クラスタのY範囲内に保護対象テキストがあればその行だけ除外
      // 具体的には: protect アイテムが含まれるY範囲を削除対象から除く
      const protectItems = scoredItems.filter(function (i) {
        return i.tags.includes('protect') && i.yTopPct >= best.topPct - 2 && i.yBotPct <= best.botPct + 2;
      });

      let safeTopPct = best.topPct;
      let safeBotPct = best.botPct;

      if (protectItems.length > 0) {
        // 保護アイテムがクラスタの上半分にあれば削除開始点を下げる
        const protectMidY = protectItems.reduce(function (s, i) { return s + (i.yTopPct + i.yBotPct) / 2; }, 0) / protectItems.length;
        const clusterMidY = (best.topPct + best.botPct) / 2;

        if (protectMidY < clusterMidY) {
          // 保護対象が上寄り → 下方向にずらす
          const maxProtectBot = Math.max.apply(null, protectItems.map(function (i) { return i.yBotPct; }));
          safeTopPct = maxProtectBot + 0.5;
        } else {
          // 保護対象が下寄り → 上方向にずらす
          const minProtectTop = Math.min.apply(null, protectItems.map(function (i) { return i.yTopPct; }));
          safeBotPct = minProtectTop - 0.5;
        }
      }

      // ── Step 6: Y範囲を確定（全幅: x 0〜100%） ──
      const topPct = Math.max(0, safeTopPct - 1.0);    // 上に1%マージン
      const botPct = Math.min(100, safeBotPct + 1.0);  // 下に1%マージン

      // 検出キーワード収集
      const foundKWs = new Set();
      for (const item of best.items) {
        for (const kw of ANCHOR_STRONG) { if (item.text.includes(kw)) foundKWs.add(kw); }
        for (const kw of ANCHOR_MEDIUM) { if (item.text.includes(kw)) foundKWs.add(kw); }
        for (const kw of BROKER_KW) { if (item.text.includes(kw)) foundKWs.add(kw); }
      }

      // フィンガープリント（後段のisBrokerMatchで使用）
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



    // ---- Signal 3: 画像（ロゴ等）の位置検出 ----
    async function detectObiImages(page) {
      try {
        const ops = await page.getOperatorList();
        const viewport = page.getViewport({ scale: 1 });
        const pageHeight = viewport.height;

        const imagePositions = [];

        for (let i = 0; i < ops.fnArray.length; i++) {
          // paintImageXObject = 85 in pdf.js OPS
          if (ops.fnArray[i] === 85) {
            // The transform is usually set by a preceding transform operation
            // Look backwards for the transform
            for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
              if (ops.fnArray[j] === 12) { // transform
                const args = ops.argsArray[j];
                if (args && args.length >= 6) {
                  const imgHeight = Math.abs(args[3]);
                  const imgY = args[5]; // PDF coordinate (from bottom)
                  const yFromTop = pageHeight - imgY;
                  const yFromTopPct = Math.min(100, Math.max(0, (yFromTop / pageHeight) * 100));
                  const hPct = (imgHeight / pageHeight) * 100;

                  // 下部35%にある小〜中サイズの画像（ロゴ候補）
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

    // ---- 統合: テキスト + ロゴ + 画像 + ピクセル ----
    //
    // 優先順位:
    //  1. テキストキーワード（最も信頼性が高い）
    //  2. テキストロゴ（大フォント会社名/電話番号 → 帯上端の精密な指標）
    //  3. 画像位置（テキスト境界から上15%以内なら拡張）
    //  4. ピクセルバンド密度（テキスト・画像両方なしの場合のみ）
    //
    //  各シグナルの最も上の境界を採用

    // ===== 画像ベースページ判定 =====
    function isImageBasedPage(textContent) {
      // pdf.jsのテキスト抽出結果が極端に少ない → 画像ベースのページ
      if (!textContent || !textContent.items) return true;
      const meaningfulItems = textContent.items.filter(item => {
        const str = (item.str || '').trim();
        return str.length >= 2; // 2文字以上の意味あるテキスト
      });
      return meaningfulItems.length < 5; // テキスト要素が5個未満なら画像ベース
    }

    // ===== 画像ページ用: 強化ピクセル解析（帯境界＋色帯検出） =====
    // 戦略: 下から上にスキャンして、ページ最下部の帯のみを検出する
    // 上からスキャンすると物件写真やカラー見出しを帯と誤判定してしまうため
    function detectObiBandByPixels(canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const w = canvas.width;
      const h = canvas.height;

      // 下部50%をスキャン対象
      const scanStartPct = 50;
      const scanStartY = Math.floor(h * scanStartPct / 100);

      // 各Y行の「平均色」と「非白率」を計算
      const bandSize = Math.max(1, Math.floor(h / 200)); // 0.5%刻み
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

      // 行が非白（帯の一部）かどうかを判定するヘルパー
      function isBandRow(row) {
        const isDark = row.nonWhiteRate > 0.3 || (row.avgR < 210 && row.avgG < 210 && row.avgB < 210);
        const isColorful = Math.abs(row.avgR - row.avgG) > 20 || Math.abs(row.avgG - row.avgB) > 20 || Math.abs(row.avgR - row.avgB) > 20;
        const isVeryDark = row.avgR < 100 || row.avgG < 100 || row.avgB < 100;
        return isDark || isColorful || isVeryDark;
      }

      // === 下から上にスキャンして帯の上端を探す ===
      // ページ最下部から上に向かって、連続する非白行の塊（帯）を検出
      // 白い行にぶつかったら → そこが帯の上端
      //
      // ただし帯内に白い行（ロゴ間の隙間等）が数行あっても途切れと判定しない
      // 白い行が連続 GAP_TOLERANCE 行以上続いたら「帯の上端」とする

      // 3段階スキャン:
      // 1回目: 超厳密（GAP=1 → 0.5%の隙間で帯境界とする）→ 最小の帯核
      // 2回目: 厳密（GAP=2 → 1%の隙間で帯境界とする）→ 帯の核だけ検出
      // 3回目: 緩め（GAP=5 → 2.5%の隙間まで許容）→ 内部に白隙間がある帯に対応
      // 最終判定: 大きすぎる結果の場合はより厳密な結果にフォールバック

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

      const tightBand = scanBand(1);    // 0.5%隙間で切る（超厳密）
      const strictBand = scanBand(2);   // 1%隙間で切る
      const relaxedBand = scanBand(5);  // 2.5%隙間まで許容

      // 最適な結果を選択（段階的にフォールバック）
      // 方針: 緩め → 大きすぎなら厳密 → まだ大きければ超厳密
      let bestBand = null;

      // まず超厳密を基本候補にする
      if (tightBand && tightBand.heightPct >= 3 && tightBand.topPct >= 55) {
        bestBand = tightBand;
      }

      // 厳密結果が妥当サイズ（≤18%）なら採用（帯内の小さな隙間をカバー）
      if (strictBand && strictBand.heightPct >= 3 && strictBand.topPct >= 55) {
        if (!bestBand) {
          bestBand = strictBand;
        } else if (strictBand.heightPct <= 18) {
          bestBand = strictBand;
        }
        // strict > 18% の場合は超厳密を維持
      }

      // 緩め結果が妥当サイズ（≤18%）なら採用
      if (relaxedBand && relaxedBand.heightPct >= 3 && relaxedBand.topPct >= 55) {
        if (!bestBand) {
          bestBand = relaxedBand;
        } else if (relaxedBand.heightPct <= 18) {
          bestBand = relaxedBand;
        }
        // relaxed > 18% の場合はそれまでの結果を維持
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

      // フォールバック: 下から上にエッジ検出（非白→白の急激な変化点）
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

    // ===== 画像PDF用: ピクセルから水平ラインを検出 =====
    // ベクターパスがない画像ベースPDFでも、レンダリング済みCanvasから
    // 水平ライン（細い横線）を検出する
    function detectPixelHLines(canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const w = canvas.width;
      const h = canvas.height;
      const hLines = [];

      // 25%以降をスキャン（中央帯の2段組マイソク対応を含む）
      const scanStartY = Math.floor(h * 0.25);
      const sampleLeft = Math.floor(w * 0.02);
      const sampleRight = Math.floor(w * 0.98);
      const sampleWidth = sampleRight - sampleLeft;

      // 各行の「非白率」を計算（1px刻み）
      // ただし全行はコスト大なので2px刻みでスキャン
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
          // 暗いピクセル（ラインは通常黒/濃灰色）
          if (r < 150 && g < 150 && b < 150) darkPixels++;
        }

        rowData.push({
          y,
          yPct: (y / h) * 100,
          darkRate: totalSamples > 0 ? darkPixels / totalSamples : 0
        });
      }

      // 水平ラインの検出:
      // 1-3行連続で高darkRate、上下の行は低darkRateのパターン
      for (let i = 1; i < rowData.length - 1; i++) {
        const curr = rowData[i];
        const prev = rowData[i - 1];
        const next = rowData[i + 1];

        // 現在行が暗く（darkRate > 0.3）、上下は明るい（darkRate < 0.15）
        if (curr.darkRate > 0.3 && prev.darkRate < 0.15 && next.darkRate < 0.15) {
          // ラインの実際の幅を計測（左端〜右端のダークピクセル範囲）
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
                fromPixel: true  // ピクセル由来フラグ
              });
            }
          }
        }

        // 2行連続パターン（太めの線）
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
                // 重複チェック（同じ位置の既存ラインと近すぎないか）
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

    // ===== ピクセルベースのボックス（矩形）検出: 画像PDFで水平線ペアからボックスを推定 =====
    function detectPixelBoxes(canvas, pixelHLines) {
      // 水平ラインのペアからボックスを合成する
      // 下部エリア（60%以降）で、2本の水平ラインが上下に離れている（2%〜25%）場合、
      // 左右の垂直ラインも確認してボックスとみなす
      if (!canvas || pixelHLines.length < 2) return [];

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const w = canvas.width;
      const h = canvas.height;
      const boxes = [];

      // 60%以降のラインのみ対象
      const lowerLines = pixelHLines.filter(l => l.yPct >= 60 && l.widthPct >= 40);
      lowerLines.sort((a, b) => a.yPct - b.yPct);

      for (let i = 0; i < lowerLines.length; i++) {
        for (let j = i + 1; j < lowerLines.length; j++) {
          const topLine = lowerLines[i];
          const botLine = lowerLines[j];
          const heightPct = botLine.yPct - topLine.yPct;

          // ボックスの高さ: 2%〜25%
          if (heightPct < 2 || heightPct > 25) continue;

          // 左右の重なりが十分あるか（両方とも似た範囲をカバー）
          const overlapLeft = Math.max(topLine.xStartPct, botLine.xStartPct);
          const overlapRight = Math.min(topLine.xEndPct, botLine.xEndPct);
          const overlapW = overlapRight - overlapLeft;
          if (overlapW < 30) continue;

          // 垂直ライン（左辺・右辺）の確認
          // 上下のライン間に縦方向のダークピクセルがあるか
          const topY = Math.floor((topLine.yPct / 100) * h);
          const botY = Math.floor((botLine.yPct / 100) * h);
          const leftX = Math.floor((overlapLeft / 100) * w);
          const rightX = Math.floor((overlapRight / 100) * w);

          let hasLeftEdge = false;
          let hasRightEdge = false;

          // 左辺チェック: leftX付近に縦方向のダークピクセルが50%以上あるか
          let leftDarkCount = 0;
          const checkRange = 5; // ±5px
          const verticalSteps = Math.max(1, Math.floor((botY - topY) / 30));
          let vertSamples = 0;

          for (let y = topY; y <= botY; y += verticalSteps) {
            for (let dx = -checkRange; dx <= checkRange; dx++) {
              const px = leftX + dx;
              if (px < 0 || px >= w) continue;
              const imgData = ctx.getImageData(px, y, 1, 1).data;
              if (imgData[0] < 150 && imgData[1] < 150 && imgData[2] < 150) {
                leftDarkCount++;
                break; // この行にダークピクセルがあればOK
              }
            }
            vertSamples++;
          }
          hasLeftEdge = vertSamples > 0 && (leftDarkCount / vertSamples) > 0.4;

          // 右辺チェック
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

          // 左辺と右辺の両方があればボックスとみなす
          // ピクセルボックスは誤検出リスクが高いため、必ず両辺を確認
          if (hasLeftEdge && hasRightEdge) {
            const xPct = overlapLeft;
            const yPct = topLine.yPct;
            const wPct = overlapW;
            const hPctVal = heightPct;

            // 重複チェック
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
                fromPixel: true  // ピクセル由来フラグ
              });
            }
          }
        }
      }

      return boxes;
    }

    // ===== 中央帯検出: 上下2段組マイソクで中央に業者帯があるケース =====
    function detectMidPageBand(canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const w = canvas.width;
      const h = canvas.height;

      // ページ全体を走査（25%〜75%の範囲で中央帯を探す）
      const bandSize = Math.max(1, Math.floor(h / 200)); // 0.5%刻み
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

      // 中央部（25%〜75%）で「白帯に挟まれた色帯」パターンを探す
      // 白い行 → 色帯（3〜15%高さ）→ 白い行 のパターン
      function isWhiteRow(row) { return row.nonWhiteRate < 0.15; }
      function isColorRow(row) {
        return row.nonWhiteRate > 0.25 ||
          row.avgR < 210 || row.avgG < 210 || row.avgB < 210 ||
          Math.abs(row.avgR - row.avgG) > 15 || Math.abs(row.avgG - row.avgB) > 15;
      }

      // 中央領域の行をフィルタ
      const midRows = rows.filter(r => r.yPct >= 25 && r.yPct <= 75);

      // 色帯の塊を検出（連続する色行のグループ）
      const bands = [];
      let bandStart = -1;
      let gap = 0;
      const MAX_GAP = 3; // 1.5%の白隙間は帯内として許容

      for (let i = 0; i < midRows.length; i++) {
        if (isColorRow(midRows[i])) {
          if (bandStart < 0) bandStart = i;
          gap = 0;
        } else {
          if (bandStart >= 0) {
            gap++;
            if (gap >= MAX_GAP) {
              // 帯の終了
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
      // 最後の帯が未終了の場合
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

      // 候補: 高さ3〜15%で全幅の色帯を選ぶ
      // さらに帯の直上と直下に白い行（または異なるコンテンツ）があること
      const candidates = bands.filter(b => b.heightPct >= 3 && b.heightPct <= 15);

      if (candidates.length === 0) return { found: false };

      // 帯の上下に白い区切り行があるものを優先
      for (const band of candidates) {
        const aboveRows = rows.filter(r => r.yPct >= band.topPct - 5 && r.yPct < band.topPct);
        const belowRows = rows.filter(r => r.yPct > band.bottomPct && r.yPct <= band.bottomPct + 5);
        const hasWhiteAbove = aboveRows.some(r => isWhiteRow(r));
        const hasWhiteBelow = belowRows.some(r => isWhiteRow(r));

        // 上下両方に白い行がある → 独立した帯（業者帯の可能性大）
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

      // フォールバック: 上下の白行条件を緩和して最初の候補を返す
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

    // ===== QRコード検出 (jsQR) =====
    function detectQRCodes(canvas) {
      if (!canvas || typeof jsQR === 'undefined') return { found: false, codes: [] };
      try {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codes = [];

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

        // 下半分を再スキャン（解像度向上）
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
        }
        return { found: codes.length > 0, codes };
      } catch (e) {
        console.warn('[QR] detectQRCodes failed:', e);
        return { found: false, codes: [] };
      }
    }

    // ===== PaddleOCR via IPC ヘルパー =====
    async function _paddleOcrCanvas(canvas) {
      if (!canvas) return null;
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.ocrRecognize) {
          return await window.electronAPI.ocrRecognize(base64);
        }
        return null;
      } catch (e) {
        console.warn('[OCR] _paddleOcrCanvas failed:', e);
        return null;
      }
    }

    // ===== OCR結果からブローカー情報を分析する共通関数 =====
    function _analyzeOcrResult(ocrResult, cropY, canvasHeight) {
      if (!ocrResult) return null;
      const ocrText = ocrResult.text || '';

      const brokerKeywords = ['TEL', 'FAX', 'tel', 'fax', '免許', '宅建', '取引態様',
        '媒介', '不動産', '株式会社', '有限会社', '担当', '仲介', '専任',
        '手数料', '物件確認', '問い合わせ', '問合せ', '営業時間',
        '社名', '担当者', '情報提供元', '情報提供'];
      const phoneRe = /\d{2,4}[-ー\s]?\d{2,4}[-ー\s]?\d{3,4}/;
      const emailRe = /[\w.-]+@[\w.-]+/;

      let matchCount = 0;
      const matchedKeywords = [];
      for (const kw of brokerKeywords) {
        if (ocrText.includes(kw)) {
          matchCount++;
          matchedKeywords.push(kw);
        }
      }
      if (phoneRe.test(ocrText)) { matchCount++; matchedKeywords.push('電話番号'); }
      if (emailRe.test(ocrText)) { matchCount++; matchedKeywords.push('メール'); }

      // PaddleOCR lines[].frame から業者キーワードの最上位Y%を計算
      let brokerMinYPct = null;
      try {
        const lines = ocrResult.lines || [];
        if (lines.length > 0) {
          let minY = Infinity;
          for (const line of lines) {
            const lText = line.text || '';
            let isBrokerWord = false;
            if (brokerKeywords.some(kw => lText.includes(kw))) isBrokerWord = true;
            if (!isBrokerWord && phoneRe.test(lText)) isBrokerWord = true;
            if (!isBrokerWord && emailRe.test(lText)) isBrokerWord = true;
            if (!isBrokerWord && /株式会社|有限会社|\(株\)|（株）/.test(lText)) isBrokerWord = true;

            if (isBrokerWord && line.frame && typeof line.frame.top === 'number') {
              // frame: { left, top, width, height } — Box型
              const wordYInPage = cropY + line.frame.top;
              const wordYPct = (wordYInPage / canvasHeight) * 100;
              if (wordYPct < minY) minY = wordYPct;
            }
          }
          if (minY < Infinity) brokerMinYPct = minY;
        }
      } catch (e) { /* ワード位置取得失敗は無視 */ }

      return {
        text: ocrText,
        hasBrokerInfo: matchCount >= 2,
        matchCount,
        matchedKeywords,
        brokerMinYPct
      };
    }

    // ===== OCRで指定領域のテキストを抽出して業者情報チェック =====
    async function ocrRegion(canvas, topPct, bottomPct) {
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
        const result = await _paddleOcrCanvas(tmpCanvas);
        if (!result) return null;
        return _analyzeOcrResult(result, cropY, canvas.height);
      } catch (e) {
        console.warn('OCR失敗:', e);
        return null;
      }
    }

    // ===== 画像ページ用: OCRで下部テキストを抽出して業者情報チェック =====
    async function ocrLowerRegion(canvas, topPct) {
      const cropY = Math.floor(canvas.height * topPct / 100);
      const cropH = canvas.height - cropY;
      if (cropH < 20) return null;

      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = cropH;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);

      try {
        const result = await _paddleOcrCanvas(tmpCanvas);
        if (!result) return null;
        return _analyzeOcrResult(result, cropY, canvas.height);
      } catch (e) {
        console.warn('OCR失敗:', e);
        return null;
      }
    }

    // =============================================
    // ===== V2: Item-Based Detection Helpers =====
    // =============================================
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

    const PROTECTED_KW = [
      '小学校', '中学校', '高等学校', '高校', '幼稚園', '保育園', '保育所',
      '最寄', '徒歩', 'バス停', 'バス ',
      'コンビニ', 'スーパー', '病院', '薬局', '公園', '郵便局',
      '図書館', '銀行', '交番', '警察', '消防署',
      'ライフインフォメーション', '周辺環境', '周辺施設', '生活施設', '生活関連',
      '間取', 'LDK', 'DK', '1R', '1K',
      '専有面積', '建物面積', '土地面積', '敷地面積',
      '築年', '構造', '階建', '所在地',
      '管理費', '修繕積立', '駐車場', '総戸数',
      '賃料', '価格', '礼金', '敷金', '保証金',
      '設備', '入居', '契約期間',
      '外観', '内観', '現地', '室内', '眺望', 'バルコニー', 'エントランス',
      '物件概要', '概要'
    ];

    async function getAllPageImages(page) {
      try {
        const ops = await page.getOperatorList();
        const vp = page.getViewport({ scale: 1 });
        const pH = vp.height, pW = vp.width;
        const imgs = [];
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] === 85) {
            for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
              if (ops.fnArray[j] === 12) {
                const a = ops.argsArray[j];
                if (a && a.length >= 6) {
                  const iW = Math.abs(a[0]), iH = Math.abs(a[3]);
                  const iX = a[4], iY = a[5];
                  const yTop = pH - iY;
                  imgs.push({
                    yPct: (yTop / pH) * 100, xPct: (iX / pW) * 100,
                    hPct: (iH / pH) * 100, wPct: (iW / pW) * 100,
                    bottomPct: ((yTop + iH) / pH) * 100, rightPct: ((iX + iW) / pW) * 100,
                    area: (iH / pH) * (iW / pW) * 10000
                  });
                }
                break;
              }
            }
          }
        }
        return imgs;
      } catch (e) { return []; }
    }

    async function ocrToTextItems(canvas) {
      if (!canvas) return [];
      const result = await _paddleOcrCanvas(canvas);
      if (!result || !result.lines) {
        console.warn('[V2] ocrToTextItems: OCR結果なし', result);
        return [];
      }
      console.log(`[V2] ocrToTextItems: OCR ${result.lines.length}行取得`);
      const items = [];
      for (const line of result.lines) {
        if (!line.text) continue;
        // multilingual-purejs-ocr の frame は Box型: { left, top, width, height }
        const f = line.frame;
        if (!f || typeof f.top !== 'number') continue;
        const topY = f.top;
        const botY = f.top + f.height;
        const leftX = f.left;
        const rightX = f.left + f.width;
        items.push({
          text: line.text,
          yPct: (topY / canvas.height) * 100, xPct: (leftX / canvas.width) * 100,
          bottomPct: (botY / canvas.height) * 100, widthPct: ((rightX - leftX) / canvas.width) * 100,
          heightPct: ((botY - topY) / canvas.height) * 100,
          fontSize: botY - topY, source: 'ocr', confidence: line.score || 0
        });
      }
      console.log(`[V2] ocrToTextItems: ${items.length}件のテキストアイテム生成`);
      return items;
    }

    function extractBrokerItemsV2(textItems) {
      const items = [];
      for (const ti of textItems) {
        const types = [];
        let totalWeight = 0;
        for (const [type, { re, weight }] of Object.entries(BROKER_ITEM_PATTERNS)) {
          if (re.test(ti.text)) { types.push(type); totalWeight += weight; }
        }
        if (types.length > 0) items.push({ ...ti, brokerTypes: types, weight: totalWeight });
      }
      return items;
    }

    // Step 3.5: 業者アイテムのクラスタリング（外れ値除去）
    const CLUSTER_GAP_PCT = 15;

    function clusterBrokerItems(brokerItems, qrCodes) {
      if (brokerItems.length === 0) return { mainItems: [], outliers: [], clusterY: null };
      const sorted = [...brokerItems].sort((a, b) => a.yPct - b.yPct);
      const allYs = [
        ...sorted.map(item => ({ yPct: item.yPct, weight: item.weight || 1, type: 'broker' })),
        ...qrCodes.map(qr => ({ yPct: qr.topPct, weight: 3, type: 'qr' }))
      ].sort((a, b) => a.yPct - b.yPct);

      if (allYs.length <= 1) return { mainItems: brokerItems, outliers: [], clusterY: null };

      const clusters = [[]];
      clusters[0].push(allYs[0]);
      for (let i = 1; i < allYs.length; i++) {
        const gap = allYs[i].yPct - allYs[i - 1].yPct;
        if (gap >= CLUSTER_GAP_PCT) clusters.push([]);
        clusters[clusters.length - 1].push(allYs[i]);
      }

      if (clusters.length <= 1) return { mainItems: brokerItems, outliers: [], clusterY: null };

      let bestIdx = 0, bestScore = 0;
      for (let i = 0; i < clusters.length; i++) {
        const score = clusters[i].reduce((s, item) => s + item.weight, 0) * clusters[i].length;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }

      const mainCluster = clusters[bestIdx];
      const clusterMinY = mainCluster[0].yPct - 3;
      const clusterMaxY = mainCluster[mainCluster.length - 1].yPct + 3;

      const mainItems = brokerItems.filter(item => item.yPct >= clusterMinY && item.yPct <= clusterMaxY);
      const outliers = brokerItems.filter(item => item.yPct < clusterMinY || item.yPct > clusterMaxY);

      if (outliers.length > 0) {
        console.log(`[V2] ③.5 クラスタリング: メイン ${mainItems.length}件, 外れ値 ${outliers.length}件`);
      }
      return { mainItems, outliers, clusterY: { minPct: clusterMinY, maxPct: clusterMaxY }, clusterCount: clusters.length };
    }

    function getBrokerBoundingRect(brokerItems, qrCodes) {
      if (brokerItems.length === 0 && qrCodes.length === 0) return null;
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const item of brokerItems) {
        minY = Math.min(minY, item.yPct);
        maxY = Math.max(maxY, item.bottomPct || (item.yPct + (item.heightPct || 2)));
        minX = Math.min(minX, item.xPct);
        maxX = Math.max(maxX, item.xPct + (item.widthPct || 10));
      }
      for (const qr of qrCodes) {
        minY = Math.min(minY, qr.topPct); maxY = Math.max(maxY, qr.bottomPct);
        minX = Math.min(minX, qr.leftPct); maxX = Math.max(maxX, qr.rightPct);
      }
      return {
        topPct: minY, bottomPct: Math.min(maxY, 100),
        leftPct: Math.max(minX, 0), rightPct: Math.min(maxX, 100),
        heightPct: Math.min(maxY, 100) - minY, widthPct: Math.min(maxX, 100) - Math.max(minX, 0)
      };
    }

    function classifyBandTypeV2(rect, brokerItems) {
      const yValues = brokerItems.map(i => i.yPct);
      const avgY = yValues.reduce((s, v) => s + v, 0) / yValues.length;
      if (rect.topPct >= 62 || (avgY >= 75 && rect.topPct >= 55)) return 'bottom';
      if (rect.topPct >= 25 && rect.bottomPct <= 80 && rect.heightPct <= 35) return 'middle';
      return 'irregular';
    }

    function determineClearRegionV2(bandType, rect) {
      switch (bandType) {
        case 'bottom':
          return { method: 'v2_bottom', clearTopPct: Math.max(50, rect.topPct - 2), clearBottomPct: 100, clearLeftPct: 0, clearRightPct: 100, isFullWidth: true };
        case 'middle':
          return { method: 'v2_middle', clearTopPct: Math.max(15, rect.topPct - 2), clearBottomPct: Math.min(100, rect.bottomPct + 2), clearLeftPct: 0, clearRightPct: 100, isFullWidth: true };
        case 'irregular':
          return { method: 'v2_irregular', clearTopPct: Math.max(0, rect.topPct - 2), clearBottomPct: Math.min(100, rect.bottomPct + 2), clearLeftPct: Math.max(0, rect.leftPct - 3), clearRightPct: Math.min(100, rect.rightPct + 3), isFullWidth: rect.widthPct >= 85 };
      }
    }

    function adjustForProtectedItemsV2(clearRegion, textItems, pageImages, brokerItems) {
      const protectedTexts = textItems.filter(item => {
        if (item.yPct < clearRegion.clearTopPct - 1 || item.yPct > clearRegion.clearBottomPct + 1) return false;
        if (!clearRegion.isFullWidth) {
          if (item.xPct < clearRegion.clearLeftPct - 2 || item.xPct > clearRegion.clearRightPct + 2) return false;
        }
        const isBroker = brokerItems.some(b => b.text === item.text && Math.abs(b.yPct - item.yPct) < 1);
        if (isBroker) return false;
        return PROTECTED_KW.some(kw => item.text.includes(kw));
      });

      const protectedImages = pageImages.filter(img => {
        const imgCY = img.yPct + img.hPct / 2;
        if (imgCY < clearRegion.clearTopPct || imgCY > clearRegion.clearBottomPct) return false;
        return img.hPct > 8 && img.wPct > 12;
      });

      const allProt = [
        ...protectedTexts.map(t => ({ yPct: t.yPct, bottomPct: t.bottomPct || t.yPct + 2, type: 'text', text: t.text })),
        ...protectedImages.map(i => ({ yPct: i.yPct, bottomPct: i.bottomPct, type: 'image' }))
      ];

      if (allProt.length === 0) return clearRegion;

      const protMinY = Math.min(...allProt.map(p => p.yPct));
      const protMaxY = Math.max(...allProt.map(p => p.bottomPct));
      const brokerMinY = Math.min(...brokerItems.map(b => b.yPct));
      const brokerMaxY = Math.max(...brokerItems.map(b => b.bottomPct || b.yPct + 2));

      if (protMinY < brokerMinY && protMaxY < brokerMinY + 5) {
        clearRegion.clearTopPct = Math.max(protMaxY + 1, brokerMinY - 2);
        clearRegion.method += '+prot_adj_top';
      } else if (protMinY > brokerMaxY - 5 && protMinY > clearRegion.clearTopPct + 5) {
        clearRegion.clearBottomPct = Math.min(protMinY - 1, brokerMaxY + 2);
        clearRegion.method += '+prot_adj_bot';
      } else {
        clearRegion.hasProtectedConflict = true;
        clearRegion.protectedItems = allProt;
        clearRegion.method += '+prot_conflict';
      }
      return clearRegion;
    }

    // ===== Step 2 & 4: PDF パス要素（矩形・ライン）検出エンジン =====
    async function detectPathElements(page) {
      const ops = await page.getOperatorList();
      const viewport = page.getViewport({ scale: 1 });
      const pageH = viewport.height;
      const pageW = viewport.width;

      const rects = [];   // 矩形（ボックス）
      const hLines = [];  // 水平ライン

      // 変換行列スタック
      let ctmStack = [];
      let ctm = [1, 0, 0, 1, 0, 0]; // identity

      // 現在のパスポイント
      let pathPoints = [];
      let currentStroke = null;
      let currentFill = null;

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];

        // save/restore
        if (fn === 10) { ctmStack.push([...ctm]); continue; } // save
        if (fn === 11) { ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0]; continue; } // restore

        // transform
        if (fn === 12 && args && args.length >= 6) {
          // multiply CTM
          const [a, b, c, d, e, f] = args;
          const [a2, b2, c2, d2, e2, f2] = ctm;
          ctm = [
            a * a2 + b * c2, a * b2 + b * d2,
            c * a2 + d * c2, c * b2 + d * d2,
            e * a2 + f * c2 + e2, e * b2 + f * d2 + f2
          ];
          continue;
        }

        // setStrokeColor系
        if (fn === 24 || fn === 26 || fn === 28 || fn === 32) {
          currentStroke = args;
          continue;
        }
        // setFillColor系
        if (fn === 25 || fn === 27 || fn === 29 || fn === 33) {
          currentFill = args;
          continue;
        }

        // constructPath (op 91) — 主要なパス構築命令
        if (fn === 91 && args) {
          const subOps = args[0]; // [moveTo, lineTo, rect, ...]
          const subArgs = args[1]; // 座標配列
          if (!subOps || !subArgs) continue;

          let argIdx = 0;
          pathPoints = [];

          for (const subOp of subOps) {
            if (subOp === 13) { // moveTo
              pathPoints.push({ type: 'M', x: subArgs[argIdx], y: subArgs[argIdx + 1] });
              argIdx += 2;
            } else if (subOp === 14) { // lineTo
              pathPoints.push({ type: 'L', x: subArgs[argIdx], y: subArgs[argIdx + 1] });
              argIdx += 2;
            } else if (subOp === 19) { // rectangle(x,y,w,h)
              const rx = subArgs[argIdx], ry = subArgs[argIdx + 1];
              const rw = subArgs[argIdx + 2], rh = subArgs[argIdx + 3];
              argIdx += 4;

              // CTM適用
              const x1 = ctm[0] * rx + ctm[2] * ry + ctm[4];
              const y1 = ctm[1] * rx + ctm[3] * ry + ctm[5];
              const w = Math.abs(ctm[0] * rw + ctm[2] * rh);
              const h = Math.abs(ctm[1] * rw + ctm[3] * rh);

              // PDF座標 → top-based %
              const yTop = pageH - y1;
              const xPct = (x1 / pageW) * 100;
              const yPct = ((yTop - h) / pageH) * 100;  // 矩形上端
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
              // 薄い塗りつぶし矩形を水平ラインとしても登録
              // 多くのPDFでは水平線を薄いrectangleで描画する
              if (wPct >= 30 && hPct <= 1.5 && hPct > 0) {
                hLines.push({
                  yPct: yPct,
                  xStartPct: xPct,
                  xEndPct: xPct + wPct,
                  widthPct: wPct,
                  fromRect: true  // 矩形由来フラグ
                });
              }
            } else if (subOp === 15 || subOp === 16 || subOp === 17) {
              // bezierCurveTo variants
              argIdx += (subOp === 17 ? 4 : 6);
            } else if (subOp === 18) {
              // closePath
            }
          }
          continue;
        }

        // stroke (op 64) — パスの描画確定
        if (fn === 64 && pathPoints.length >= 2) {
          // 水平ラインの検出: moveTo → lineTo でY座標がほぼ同じ
          for (let j = 0; j < pathPoints.length - 1; j++) {
            const p1 = pathPoints[j];
            const p2 = pathPoints[j + 1];
            if (p1.type === 'M' && p2.type === 'L') {
              // CTM適用
              const x1 = ctm[0] * p1.x + ctm[2] * p1.y + ctm[4];
              const y1 = ctm[1] * p1.x + ctm[3] * p1.y + ctm[5];
              const x2 = ctm[0] * p2.x + ctm[2] * p2.y + ctm[4];
              const y2 = ctm[1] * p2.x + ctm[3] * p2.y + ctm[5];

              const yTop1 = pageH - y1;
              const yTop2 = pageH - y2;

              // 水平線: Y差が1px以内、幅がページの30%以上
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

        // fill / fill+stroke (op 65, 66) — パスの塗りつぶし確定
        if (fn === 65 || fn === 66) {
          // fill操作でも水平ラインを検出（太い線を塗りつぶしで描画するケース）
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
                    fromFill: true  // fill操作由来フラグ
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

    // ===== Step 2: 下部の大きなボックスを優先検索 → 業者情報確認 =====
    function findBrokerBox(rects, brokerTextItems, allTextItems, textResult) {
      // 方針: まず下部にある目立つ矩形を見つけ、中身に業者情報があるか確認する

      // --- Phase 0: 近接矩形のクラスタリング ---
      // 内部に区切り線があるボックスは複数の小矩形として検出されるため
      // 近接する矩形をグループ化して外接矩形（結合ボックス）を生成する
      function clusterRects(inputRects, thresholdPct) {
        // 各矩形の上下左右がthresholdPct以内で重なる/近接している場合にグループ化
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
              // グループ内のいずれかの矩形と近接しているか
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

      // --- Phase A: テキスト検出の境界（またはデフォルト75%）より下にある大きな矩形を探す ---
      const searchTopPct = textResult && textResult.found ? Math.max(55, textResult.topPct - 10) : 70;

      // 下部の矩形を抽出
      const lowerRects = rects.filter(r => {
        if (r.yPct < searchTopPct) return false;
        if (r.hPct > 50) return false; // ページ全体枠除外
        return true;
      });

      // 近接矩形をクラスタリング（1%以内の隙間を同一グループとみなす）
      // 閾値を小さくして、別の表枠（司法書士欄等）との過剰結合を防止
      const clusters = clusterRects(lowerRects, 1);

      // 各クラスタの外接矩形を計算
      const bigRects = [];
      for (const cluster of clusters) {
        let useCluster = cluster;

        // 過大結合チェック: 結合後の高さが25%を超える場合、
        // クラスタ内で最も下部にある矩形群（下端90%以降）だけに絞る
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
        // サイズフィルタ: 幅20%以上、高さ2%以上、下端85%以降
        if (merged.wPct >= 20 && merged.hPct >= 2 && merged.bottomPct >= 85) {
          bigRects.push(merged);
        }
      }

      // 単独の大きな矩形も追加（クラスタリングで漏れた場合のフォールバック）
      for (const r of lowerRects) {
        if (r.wPct >= 20 && r.hPct >= 2 && r.bottomPct >= 85) {
          const isDuplicate = bigRects.some(br =>
            Math.abs(br.xPct - r.xPct) < 3 && Math.abs(br.yPct - r.yPct) < 3 &&
            Math.abs(br.wPct - r.wPct) < 3 && Math.abs(br.hPct - r.hPct) < 3);
          if (!isDuplicate) bigRects.push(r);
        }
      }

      if (bigRects.length === 0) return null;

      // ソート優先度:
      // 1. 全幅（wPct >= 80%）を優先（帯は通常ページ幅いっぱい）
      // 2. 同じ幅カテゴリ内では下端が低い（bottomPct大きい）ものを優先
      // 3. それでも同じなら面積が大きい順
      bigRects.sort((a, b) => {
        const aFull = a.wPct >= 80 ? 1 : 0;
        const bFull = b.wPct >= 80 ? 1 : 0;
        if (bFull !== aFull) return bFull - aFull;       // 全幅優先
        if (Math.abs(b.bottomPct - a.bottomPct) > 2) return b.bottomPct - a.bottomPct; // 下端が低い方
        return (b.wPct * b.hPct) - (a.wPct * a.hPct);   // 面積大きい方
      });

      // --- Phase B: 各候補矩形の中に業者テキストがあるか確認 ---
      for (const rect of bigRects) {
        let hasBroker = false;

        // 方法1: 既に検出済みの業者テキストアイテムがボックス内にあるか
        if (brokerTextItems.length > 0) {
          const insideBrokers = brokerTextItems.filter(t =>
            t.yPct >= rect.yPct - 2 && t.yPct <= rect.bottomPct + 2 &&
            t.xPct >= rect.xPct - 5 && t.xPct <= rect.xPct + rect.wPct + 5
          );
          if (insideBrokers.length >= 1) hasBroker = true;
        }

        // 方法2: ボックス内の全テキストをキーワードチェック（業者テキストが少ない場合のフォールバック）
        if (!hasBroker && allTextItems && allTextItems.length > 0) {
          const insideTexts = allTextItems.filter(t =>
            t.yPct >= rect.yPct - 2 && t.yPct <= rect.bottomPct + 2
          );
          // 簡易キーワードチェック
          // 注意: 取引態様は物件テーブル内に頻出するためボックス内チェックからは除外
          // （detectObiByTextのANCHOR_STRONGで別途検出される）
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

        // 方法3: 矩形に塗りつぶし色がある（色付き帯）→ 業者帯の可能性が高い
        if (!hasBroker && rect.isFilled && rect.fillColor) {
          const c = rect.fillColor;
          // 白・ほぼ白以外の塗りつぶし
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

      // --- Phase C: 色付き帯の矩形（業者テキストが画像の場合でもキャッチ） ---
      // 下部で幅が広い塗りつぶし矩形は帯の可能性が高い
      const filledBands = rects.filter(r => {
        if (r.yPct < 75) return false;
        if (r.wPct < 70) return false;  // 幅70%以上
        if (r.hPct < 3 || r.hPct > 25) return false;
        if (!r.isFilled || !r.fillColor) return false;
        // 白以外
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

    // ===== Step 4: 業者情報の上に引かれた水平ラインを検出 =====
    function findBrokerLine(hLines, brokerTextItems) {
      if (brokerTextItems.length === 0 || hLines.length === 0) return null;

      const brokerMinY = Math.min(...brokerTextItems.map(t => t.yPct));

      // 業者テキストの上端より少し上（0〜5%上）にあるラインを探す
      const candidates = hLines.filter(l => {
        const diff = brokerMinY - l.yPct;
        return diff >= -1 && diff <= 6; // ラインが業者テキストの少し上
      });

      if (candidates.length === 0) return null;

      // 各候補ラインの「業者テキスト密度スコア」を計算
      // ラインの下10%以内に業者テキストがどれだけあるかで優先度を決める
      const scored = candidates.map(l => {
        const itemsBelow = brokerTextItems.filter(t =>
          t.yPct >= l.yPct && t.yPct <= l.yPct + 12
        );
        return { line: l, nearbyCount: itemsBelow.length };
      });

      // 近くに業者テキストが多いラインを優先
      scored.sort((a, b) => {
        // まず近傍の業者テキスト数で比較（多い方が良い）
        if (b.nearbyCount !== a.nearbyCount) return b.nearbyCount - a.nearbyCount;
        // 同数ならページ下部のラインを優先
        return b.line.yPct - a.line.yPct;
      });

      // 最高スコアのラインを採用（ただしnearbyCount=0のラインは避ける）
      const best = scored.find(s => s.nearbyCount > 0);
      if (best) return best.line;

      // フォールバック: 従来通り最も近いライン
      candidates.sort((a, b) => Math.abs(brokerMinY - a.yPct) - Math.abs(brokerMinY - b.yPct));
      return candidates[0];
    }

    // ===== V2 統合: Item-Based 検出フロー =====
    async function detectObiRegion(page, renderedCanvas) {
      const viewport = page.getViewport({ scale: 1 });
      const pageH = viewport.height;
      const pageW = viewport.width;
      const tc = await page.getTextContent();

      // ===== ① テキストベースか画像ベースか判定 =====
      const isImgPage = isImageBasedPage(tc);
      console.log(`[V2] ① ページタイプ: ${isImgPage ? '画像ベース' : 'テキストベース'}`);

      // ===== ② テキストアイテム統一取得 =====
      let textItems = [];
      if (!isImgPage) {
        // PDF テキストレイヤーから取得
        for (const item of tc.items) {
          const str = (item.str || '').trim();
          if (!str) continue;
          const yFromTop = pageH - item.transform[5];
          const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
          const estWidth = item.width || (str.length * fontSize * 0.6);
          textItems.push({
            text: str,
            yPct: (yFromTop / pageH) * 100,
            xPct: (item.transform[4] / pageW) * 100,
            bottomPct: ((yFromTop + fontSize) / pageH) * 100,
            widthPct: (estWidth / pageW) * 100,
            heightPct: (fontSize / pageH) * 100,
            fontSize, source: 'pdf'
          });
        }
      } else {
        // 画像ベース → OCRで仮想テキストアイテム生成
        console.log('[V2] ② OCRテキスト化実行...');
        textItems = await ocrToTextItems(renderedCanvas);
        console.log(`[V2] ② OCR結果: ${textItems.length}件のテキスト行`);
      }

      // ===== ③ 業者アイテム抽出 =====
      const brokerItems = extractBrokerItemsV2(textItems);
      console.log(`[V2] ③ 業者アイテム: ${brokerItems.length}件`);

      // ===== ④ QRコード検出 =====
      const qrResult = detectQRCodes(renderedCanvas);
      const qrCodes = qrResult.found ? qrResult.codes : [];
      if (qrCodes.length > 0) {
        console.log(`[V2] ④ QRコード: ${qrCodes.length}個 Y=${qrCodes[0].topPct.toFixed(1)}%~${qrCodes[0].bottomPct.toFixed(1)}%`);
      }

      // --- 業者アイテムもQRもなし → 検出失敗 ---
      if (brokerItems.length === 0 && qrCodes.length === 0) {
        console.log('[V2] 業者情報未検出 → fallback');
        return {
          detected: false, method: 'v2_no_items', obiType: 'none',
          topPct: 90, bottomPct: 100, heightPct: 10,
          clearTopPct: 90, clearBottomPct: 100,
          clearLeftPct: 0, clearRightPct: 100, isFullWidth: true,
          brokerItems: [], qrCodes: [], isImageBased: isImgPage
        };
      }

      // --- 信頼度チェック ---
      const uniqueTypes = new Set(brokerItems.flatMap(b => b.brokerTypes));
      if (uniqueTypes.size < 2 && qrCodes.length === 0) {
        console.log(`[V2] 業者アイテム種類不足 → fallback`);
        return {
          detected: false, method: 'v2_low_confidence', obiType: 'none',
          topPct: 90, bottomPct: 100, heightPct: 10,
          clearTopPct: 90, clearBottomPct: 100,
          clearLeftPct: 0, clearRightPct: 100, isFullWidth: true,
          brokerItems, qrCodes, isImageBased: isImgPage
        };
      }

      // ===== ③.5 クラスタリング（外れ値除去） =====
      const clustering = clusterBrokerItems(brokerItems, qrCodes);
      const effectiveBrokerItems = clustering.mainItems.length > 0 ? clustering.mainItems : brokerItems;

      const effectiveUniqueTypes = new Set(effectiveBrokerItems.flatMap(b => b.brokerTypes));
      if (effectiveUniqueTypes.size < 2 && qrCodes.length === 0 && clustering.mainItems.length < brokerItems.length) {
        console.log(`[V2] クラスタリング後の業者アイテム種類不足 → fallback`);
        return {
          detected: false, method: 'v2_clustered_low_confidence', obiType: 'none',
          topPct: 90, bottomPct: 100, heightPct: 10,
          clearTopPct: 90, clearBottomPct: 100,
          clearLeftPct: 0, clearRightPct: 100, isFullWidth: true,
          brokerItems: effectiveBrokerItems, qrCodes, isImageBased: isImgPage
        };
      }

      // ===== ⑤ クラスタ内の業者アイテム + QRの矩形を算出 =====
      const boundingRect = getBrokerBoundingRect(effectiveBrokerItems, qrCodes);
      console.log(`[V2] ⑤ 矩形: Y=${boundingRect.topPct.toFixed(1)}%~${boundingRect.bottomPct.toFixed(1)}%`);

      // ===== ⑥ 帯タイプ分類 =====
      const bandType = classifyBandTypeV2(boundingRect, effectiveBrokerItems);
      console.log(`[V2] ⑥ 帯タイプ: ${bandType}`);

      // ===== ⑦ 削除領域決定 =====
      let clearRegion = determineClearRegionV2(bandType, boundingRect);
      console.log(`[V2] ⑦ 削除領域: Y=${clearRegion.clearTopPct.toFixed(1)}%~${clearRegion.clearBottomPct.toFixed(1)}%`);

      // ===== ⑧ 保護アイテム確認 & 調整 =====
      const pageImages = await getAllPageImages(page);
      clearRegion = adjustForProtectedItemsV2(clearRegion, textItems, pageImages, effectiveBrokerItems);

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
        brokerItems: effectiveBrokerItems, outliers: clustering.outliers,
        qrCodes, boundingRect, bandType,
        protectedConflict: clearRegion.hasProtectedConflict || false,
        protectedItems: clearRegion.protectedItems || null,
        isImageBased: isImgPage
      };
    }

    // ===== 業者情報の検出＆削除 =====
    //
    // 【包含方式】業者パターンに積極的にマッチしたテキストだけを
    // 業者情報として収集する（物件情報の誤削除を防止）。
    // 帯ゾーン全体の白塗りはロゴ・背景帯・QR等の非テキスト要素対策として別途実施。

    function isBrokerMatch(text, fp) {
      // 強アンカー
      if (ANCHOR_STRONG.some(kw => text.includes(kw))) return 'anchor';
      // 中アンカー
      if (ANCHOR_MEDIUM.some(kw => text.includes(kw))) return 'anchor';
      // 業者キーワード
      if (BROKER_KW.some(kw => text.includes(kw))) return 'broker_kw';
      // 電話番号FP
      const itemPhones = extractPhones(text);
      for (const p of itemPhones) {
        if ([...fp.phones].some(fpp => fpp === p || fpp.includes(p) || p.includes(fpp))) return 'phone_fp';
      }
      // 会社名FP（施工会社/分譲会社/管理会社の文脈は除外）
      if (fp.companies.some(c => text.includes(c))) {
        if (!['施工会社', '分譲会社', '管理会社', '施工/', '分譲/', '管理/'].some(ctx => text.includes(ctx))) {
          return 'company_fp';
        }
      }
      // 免許番号FP
      if (fp.licenses.some(l => text.includes(l))) return 'license_fp';
      // Email FP / 直接マッチ
      if (fp.emails.some(e => text.includes(e))) return 'email_fp';
      emailRe.lastIndex = 0;
      if (emailRe.test(text)) return 'email';
      // URL FP
      if (fp.urls.some(u => text.includes(u))) return 'url_fp';
      urlRe.lastIndex = 0;
      if (urlRe.test(text)) return 'url';
      // 郵便番号FP
      if (fp.zipcodes.some(z => text.includes(z))) return 'zipcode_fp';

      return null; // 業者パターンに一致しない
    }

    async function findAllBrokerItems(page) {
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;
      const pageWidth = viewport.width;

      // 全テキスト要素を収集（pdf.jsのwidthプロパティも活用）
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
        // pdf.jsのwidth情報があればそれを使う（より正確）
        const textWidth = item.width || (text.length * fontSize * 0.6);
        allItems.push({ text, x, y: yFromTop, yPct, rawYPct, fontSize, isOOB, textWidth });
      }

      // detectObiByTextと同じ5フェーズ検出でアンカーと境界を取得
      const textResult = await detectObiByText(page);
      if (!textResult.found) return { brokerItems: [], fingerprint: null, obiBoundaryPct: null };

      const boundary = textResult.topPct - 1.5; // マージン適用
      const fp = textResult.fingerprint;

      // 【包含方式】業者パターンにマッチしたテキストだけを収集
      const brokerItems = [];
      for (const item of allItems) {
        const text = item.text;

        // 境界外かつOOBでもない → スキップ
        if (!item.isOOB && item.yPct < boundary) continue;

        // 業者パターンにマッチするかチェック
        const matchReason = isBrokerMatch(text, fp);
        if (!matchReason) continue; // マッチしない → スキップ（物件情報を保護）

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

    // Canvas上で業者情報テキストを個別に白塗り
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

    // 帯ゾーンを白塗り（ボックス対応: 左右の範囲も考慮）
    function applyZoneWhiteout(ctx, pageWidth, pageHeight, clearTopPct, clearBottomPct, clearLeftPct, clearRightPct) {
      const clearY = Math.round(pageHeight * clearTopPct / 100);
      const clearH = Math.round(pageHeight * (clearBottomPct - clearTopPct) / 100);
      const clearX = Math.round(pageWidth * (clearLeftPct || 0) / 100);
      const clearW = Math.round(pageWidth * ((clearRightPct || 100) - (clearLeftPct || 0)) / 100);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(clearX, clearY, clearW, clearH);
    }

    // 帯画像を描画（カスタム位置がある場合はそちらを使用）
    function applyObiOverlay(ctx, pageWidth, pageHeight, region) {
      if (!obiImage) return;
      const page = pdfPages[currentPage];
      const custom = page && page.obiCustomRect;
      let x, y, w, h;
      if (custom) {
        // カスタム位置（%指定）
        x = Math.round(pageWidth * custom.xPct / 100);
        y = Math.round(pageHeight * custom.yPct / 100);
        w = Math.round(pageWidth * custom.wPct / 100);
        h = Math.round(pageHeight * custom.hPct / 100);
      } else {
        // 自動検出ゾーンに合わせる
        x = Math.round(pageWidth * (region.clearLeftPct || 0) / 100);
        y = Math.round(pageHeight * region.clearTopPct / 100);
        w = Math.round(pageWidth * ((region.clearRightPct || 100) - (region.clearLeftPct || 0)) / 100);
        h = Math.round(pageHeight * (region.clearBottomPct - region.clearTopPct) / 100);
      }
      ctx.drawImage(obiImage, x, y, w, h);
    }

    // PDF出力用（ページインデックス指定）
    function applyObiOverlayForPage(ctx, pageWidth, pageHeight, region, pageIdx) {
      if (!obiImage) return;
      const page = pdfPages[pageIdx];
      const custom = page && page.obiCustomRect;
      let x, y, w, h;
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
