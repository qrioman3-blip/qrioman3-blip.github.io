/* 말하면 가격표: 시장 말 해석 모델.
   글자 하나하나에 품목·수량·가격·원산지·지움 표시를 붙이는 작은 학습 모델(구조 퍼셉트론 + 비터비).
   규칙(parser.js)이 찾은 숫자·단위·지역 후보를 특징으로 함께 보고, 문맥으로 최종 판단한다.
   휴대폰 브라우저 안에서만 돌고, 말한 내용은 밖으로 나가지 않는다. */
(function (root) {
  'use strict';
  const P = (typeof module !== 'undefined' && module.exports) ? require('./parser.js') : root.PriceParser;
  const LABELS = ['O', 'B-ITEM', 'I-ITEM', 'B-QTY', 'I-QTY', 'B-PRICE', 'I-PRICE', 'B-ORIG', 'I-ORIG', 'B-DEL', 'I-DEL'];
  const NL = LABELS.length;
  const NUMS = '영공일이삼사오육륙칠팔구십백천만억';
  const NATIVE_W = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '반', '하나', '둘', '셋', '넷'];

  function cls(c) {
    if (c === ' ') return 'S';
    if (c >= '0' && c <= '9') return 'D';
    if (NUMS.includes(c)) return 'N';
    if (/[가-힣]/.test(c)) return 'H';
    if (/[a-zA-Z]/.test(c)) return 'L';
    return 'P';
  }

  // 사전(품목·지역·나라·단위)에 걸리는 글자 표시
  function lexMarks(t, lex) {
    const marks = Array.from({ length: t.length }, () => []);
    for (const [name, set, maxLen] of lex) {
      let i = 0;
      while (i < t.length) {
        let hit = 0;
        for (let L = Math.min(maxLen, t.length - i); L >= 1; L--) {
          if (set.has(t.substr(i, L))) { hit = L; break; }
        }
        if (hit) {
          // 글자 경계: 앞 글자가 한글이면 낱말 중간(예: '청양고추'의 '양고')이라 약하게 표시
          const mid = i > 0 && /[가-힣]/.test(t[i - 1]);
          for (let k = 0; k < hit; k++) marks[i + k].push(name + (k === 0 ? 'B' : 'I') + (mid ? 'm' : ''));
          i += hit;
        } else i++;
      }
    }
    return marks;
  }

  // 규칙이 찾은 후보 구간(가격·수량·원산지) 표시
  function ruleMarks(t) {
    const m = new Array(t.length).fill('');
    const put = (s, e, tag) => { for (let k = s; k < e && k < t.length; k++) if (!m[k]) m[k] = tag + (k === s ? 'B' : 'I'); };
    try {
      for (const p of P.findPrices(t)) put(p.start, p.end, 'p');
      for (const q of P.findQty(t)) put(q.start, q.end, 'q');
      for (const o of P.findOrigins(t)) put(o.start, o.end, o.strong ? 'O' : 'o');
    } catch (e) { /* 후보 없음 */ }
    return m;
  }

  function makeLex(base, extra) {
    const items = new Set(base.items || []);
    if (extra && extra.items) extra.items.forEach((x) => items.add(String(x).replace(/\s+/g, '')));
    const regions = new Set(P.REGIONS); if (extra && extra.origins) extra.origins.forEach((x) => regions.add(x));
    const ml = (s) => Math.max(1, ...[...s].map((x) => x.length));
    return [['I', items, ml(items)], ['R', regions, ml(regions)], ['C', new Set(P.COUNTRIES), ml(new Set(P.COUNTRIES))]];
  }

  function prep(t, lex, dropItemLex) {
    const marks = lexMarks(t, lex);
    if (dropItemLex) for (const a of marks) for (let k = a.length - 1; k >= 0; k--) if (a[k][0] === 'I') a.splice(k, 1);
    const rule = ruleMarks(t);
    // 낱말(띄어쓰기 단위)
    const wid = new Array(t.length).fill(-1), words = [];
    let s = -1;
    for (let i = 0; i <= t.length; i++) {
      if (i === t.length || t[i] === ' ') { if (s >= 0) { words.push([s, i]); s = -1; } }
      else if (s < 0) s = i;
    }
    words.forEach(([a, b], w) => { for (let k = a; k < b; k++) wid[k] = w; });
    const wtxt = words.map(([a, b]) => t.slice(a, b));
    let wonAt = []; for (let i = 0; i < t.length; i++) if (rule[i] && rule[i][0] === 'p') wonAt.push(i);
    return { t, marks, rule, wid, words, wtxt, wonFirst: wonAt.length ? wonAt[0] : Infinity, wonLast: wonAt.length ? wonAt[wonAt.length - 1] : -1 };
  }

  function feats(x, i) {
    const t = x.t;
    const c = (k) => (i + k >= 0 && i + k < t.length ? t[i + k] : (i + k < 0 ? '^' : '$'));
    const k = (d) => (i + d >= 0 && i + d < t.length ? cls(t[i + d]) : '#');
    const f = ['b', 'c=' + c(0), 'c-1=' + c(-1), 'c+1=' + c(1), 'c-2=' + c(-2), 'c+2=' + c(2),
      'cc-=' + c(-1) + c(0), 'cc+=' + c(0) + c(1), 'c-+=' + c(-1) + c(1), 'ccc-=' + c(-2) + c(-1) + c(0), 'ccc+=' + c(0) + c(1) + c(2), 'ccc=' + c(-1) + c(0) + c(1),
      'k3=' + k(-1) + k(0) + k(1), 'k5=' + k(-2) + k(-1) + k(0) + k(1) + k(2),
      'r=' + x.rule[i], 'r-1=' + (x.rule[i - 1] || '^'), 'r+1=' + (x.rule[i + 1] || '$'), 'rr=' + (x.rule[i - 1] || '^') + '|' + x.rule[i] + '|' + (x.rule[i + 1] || '$'),
      'won<' + (i > x.wonFirst ? 1 : 0) + (i > x.wonLast ? 1 : 0)];
    for (const m of x.marks[i]) { f.push('l=' + m); f.push('lr=' + m + '|' + x.rule[i]); }
    if (!x.marks[i].length) f.push('l=none');
    if (i > 0) for (const m of x.marks[i - 1]) f.push('l-1=' + m);
    if (i + 1 < t.length) for (const m of x.marks[i + 1]) f.push('l+1=' + m);
    const w = x.wid[i];
    if (w >= 0) {
      const [a, b] = x.words[w], word = x.wtxt[w];
      const pos = b - a === 1 ? 'S' : i === a ? 'B' : i === b - 1 ? 'E' : 'M';
      const pw = w > 0 ? x.wtxt[w - 1] : '^', nw = w + 1 < x.wtxt.length ? x.wtxt[w + 1] : '$';
      f.push('w=' + word, 'wp=' + pos, 'wpc=' + pos + c(0), 'w-1=' + pw, 'w+1=' + nw, 'wl=' + word.slice(-2), 'wf=' + word.slice(0, 2),
        'w-1l=' + pw.slice(-1), 'w+1f=' + nw.slice(0, 1), 'wnat=' + (NATIVE_W.includes(word) ? 1 : 0), 'nwnat=' + (NATIVE_W.includes(nw) ? 1 : 0), 'pwnat=' + (NATIVE_W.includes(pw) ? 1 : 0),
        'wlen=' + Math.min(5, b - a), 'wpos=' + (w === 0 ? 'first' : w === x.words.length - 1 ? 'last' : 'mid'));
    } else f.push('space', 'sp=' + c(-1) + '_' + c(1));
    return f;
  }

  // 점수표(글자 × 표시)
  function emissions(x, W) {
    const E = [];
    for (let i = 0; i < x.t.length; i++) {
      const row = new Float64Array(NL);
      for (const f of feats(x, i)) {
        const w = W.get(f);
        if (w) for (let j = 0; j < w.length; j += 2) row[w[j]] += w[j + 1];
      }
      E.push(row);
    }
    return E;
  }

  // BIO 규칙: I-X 앞에는 B-X 또는 I-X만
  const ALLOWED = (() => {
    const a = [];
    for (let p = 0; p <= NL; p++) { // p === NL: 시작
      a.push([]);
      for (let y = 0; y < NL; y++) {
        const L = LABELS[y];
        if (L[0] !== 'I') { a[p][y] = true; continue; }
        const pl = p === NL ? 'O' : LABELS[p];
        a[p][y] = pl !== 'O' && pl.slice(2) === L.slice(2);
      }
    }
    return a;
  })();

  function viterbi(E, T) {
    const n = E.length; if (!n) return [];
    const S = [], B = [];
    S.push(new Float64Array(NL)); B.push(new Int8Array(NL));
    for (let y = 0; y < NL; y++) S[0][y] = ALLOWED[NL][y] ? E[0][y] + T[NL][y] : -1e9;
    for (let i = 1; i < n; i++) {
      const s = new Float64Array(NL), b = new Int8Array(NL);
      for (let y = 0; y < NL; y++) {
        let best = -Infinity, bi = 0;
        for (let p = 0; p < NL; p++) {
          if (!ALLOWED[p][y]) continue;
          const v = S[i - 1][p] + T[p][y];
          if (v > best) { best = v; bi = p; }
        }
        s[y] = best + E[i][y]; b[y] = bi;
      }
      S.push(s); B.push(b);
    }
    let y = 0; for (let k = 1; k < NL; k++) if (S[n - 1][k] > S[n - 1][y]) y = k;
    const out = new Array(n); out[n - 1] = y;
    for (let i = n - 1; i > 0; i--) { y = B[i][y]; out[i - 1] = y; }
    return out;
  }

  // 글자별 확신도(앞뒤 계산, 점수를 온도로 나눠 확률처럼)
  function marginals(E, T, temp) {
    const n = E.length; if (!n) return [];
    const lse = (arr) => { let m = -Infinity; for (const v of arr) if (v > m) m = v; let s = 0; for (const v of arr) s += Math.exp(v - m); return m + Math.log(s); };
    const tr = (p, y) => (ALLOWED[p][y] ? T[p][y] / temp : -1e9);
    const A = [], Bk = [];
    A.push(Array.from({ length: NL }, (_, y) => tr(NL, y) + E[0][y] / temp));
    for (let i = 1; i < n; i++) A.push(Array.from({ length: NL }, (_, y) => lse(Array.from({ length: NL }, (_, p) => A[i - 1][p] + tr(p, y))) + E[i][y] / temp));
    Bk[n - 1] = new Array(NL).fill(0);
    for (let i = n - 2; i >= 0; i--) Bk[i] = Array.from({ length: NL }, (_, p) => lse(Array.from({ length: NL }, (_, y) => tr(p, y) + E[i + 1][y] / temp + Bk[i + 1][y])));
    const Z = lse(A[n - 1]);
    return A.map((a, i) => a.map((v, y) => Math.exp(v + Bk[i][y] - Z)));
  }

  function toSpans(t, labels, M) {
    const out = [];
    let cur = null;
    for (let i = 0; i <= t.length; i++) {
      const L = i < t.length ? LABELS[labels[i]] : 'O';
      if (cur && (L === 'O' || L[0] === 'B')) {
        let e = i; while (e > cur.start && t[e - 1] === ' ') e--;
        cur.end = e; cur.text = t.slice(cur.start, e);
        if (M) { let s = 0; for (let k = cur.start; k < e; k++) s += M[k][labels[k]]; cur.conf = s / Math.max(1, e - cur.start); }
        out.push(cur); cur = null;
      }
      if (i < t.length && L[0] === 'B') cur = { type: L.slice(2), start: i };
    }
    return out;
  }

  // ---------- 구간 → 가격표 동작 ----------
  function originLabel(s) {
    const w = s.replace(/\s/g, '').replace(/(이에요|이요|예요|입니다|이고|요|거|것)$/, '');
    if (/^(국내산|국산|우리농산물)$/.test(w)) return '국내산';
    if (w === '원양산' || w === '수입산') return w;
    const o = P.findOrigins(w + (w.endsWith('산') ? '' : '산'));
    if (o.length) return o[0].label;
    return w.endsWith('산') ? w : w + '산';
  }
  function qtyOf(s) {
    const q = P.findQty(s.replace(/\s+/g, ' ').trim() + ' ');
    if (q.length) return { qty: q[0].qty + (/\s반$/.test(s.trim()) && Number.isInteger(q[0].qty) ? 0.5 : 0), unit: q[0].unit, per: q[0].per };
    // 사전에 없는 단위("한 재기", "두 톳"): 앞 수만 수로 읽고 나머지는 단위
    const NW = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
    const k = s.trim().match(/^(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|\d+)\s*([가-힣a-zA-Z]+?)(당)?$/);
    if (k && k[2]) return { qty: NW[k[1]] || +k[1], unit: k[2], per: !!k[3] };
    const m = s.replace(/\s+/g, '').match(/^(.*?)(당)?$/);
    return { qty: 1, unit: m[1] || s, per: !!m[2] };
  }
  function priceOf(s) {
    const p = P.findPrices(s.replace(/(\d),(?=\d{3})/g, '$1'));
    if (p.length) return p[p.length - 1].value;
    const v = P.koNum(s.replace(/[,원\s]/g, ''));
    return isNaN(v) ? null : Math.round(v);
  }
  function itemOf(s) {
    const x = s.replace(/[,.!?]/g, ' ').replace(/\s+/g, ' ').trim();
    const y = x.length > 2 ? x.replace(/(은|는|을|를)$/u, '') : x;
    return y.length > 2 ? y.replace(/\s*(값|가격)$/u, '') : y;
  }

  const STOP_ITEM = /^(값|가격|가격표|이거|요거|저거|오늘|이제|하나|자|여기|원산지|아|어|음|으음|흠|그|저|저기|저기요|네|예|응|아니|전부|모두|다|둘|셋|둘다|반)$/;
  function assemble(t, spans) {
    const recs = [];
    let cur = null, pend = null, lastEnd = 0;
    const SEP = /[,.]|그리고|하고|또|다음|이랑|랑/;
    const newRec = () => { cur = { item: null, qty: null, unit: null, per: false, price: null, origin: null, extra: [], del: false, first: null, spans: [] }; recs.push(cur); pend = null; return cur; };
    spans.forEach((s, idx) => {
      const gap = t.slice(lastEnd, s.start);
      const sep = SEP.test(gap);
      const next = spans[idx + 1];
      if (s.type === 'ITEM') {
        const name = itemOf(s.text);
        if (STOP_ITEM.test(name)) {
          // "사과 하나에 천 원"의 '하나'는 수량 1개
          if (/^하나/.test(name) && cur && cur.item && cur.qty == null && cur.price == null) { cur.qty = 1; cur.unit = '개'; }
          // "한 근 반" → 1.5근
          if (name === '반' && cur && cur.unit && cur.price == null && Number.isInteger(cur.qty) && /^\s*$/.test(gap)) cur.qty += 0.5;
          lastEnd = s.end; return;
        }
        // 값을 먼저 말한 경우("오천 원짜리 사과")만 앞 줄에 이름을 붙임
        if (!cur || cur.item || cur.del || (cur.price != null && cur.first !== 'PRICE')) newRec();
        cur.item = name;
      } else if (s.type === 'QTY') {
        if (!cur || (sep && cur.price != null && next && next.type === 'ITEM')) newRec();
        const q = qtyOf(s.text);
        if (cur.qty == null && (cur.price == null || (cur.first === 'PRICE' && cur.item))) Object.assign(cur, q); else pend = q;
      } else if (s.type === 'PRICE') {
        const v = priceOf(s.text);
        if (v == null) { lastEnd = s.end; return; }
        const nextItem = next && (next.type === 'ITEM' || (next.type === 'QTY' && spans[idx + 2] && spans[idx + 2].type === 'ITEM'));
        if (cur && cur.price != null && nextItem && (sep || !pend)) newRec();
        if (!cur) newRec();
        if (cur.price == null) {
          cur.price = v;
          if (pend && cur.qty == null) { Object.assign(cur, pend); pend = null; }
        } else {
          cur.extra.push({ qty: pend ? pend.qty : null, unit: pend ? pend.unit : cur.unit, per: pend ? pend.per : false, price: v });
          pend = null;
        }
      } else if (s.type === 'ORIG') {
        const lab = originLabel(s.text);
        // "둘 다 국산이에요", "전부 국내산": 이 말 안의 원산지 빈 가격표 모두에
        if (recs.length > 1 && /(둘\s*다|셋\s*다|모두|전부|다)\s*$/.test(t.slice(Math.max(0, s.start - 8), s.start)) && !(next && next.type === 'ITEM')) {
          recs.forEach((r) => { if (r.origin == null && (r.item || r.price != null)) r.origin = lab; });
          lastEnd = s.end; return;
        }
        const nextIsNew = next && (next.type === 'ITEM' || (next.type === 'QTY' && spans[idx + 2] && spans[idx + 2].type === 'ITEM'));
        const canPrev = cur && cur.origin == null && (cur.item || cur.price != null);
        if (canPrev && !(nextIsNew && sep)) cur.origin = lab;
        else if (!cur || nextIsNew) { newRec(); cur.origin = lab; }
        else if (cur.origin == null || lab.length > cur.origin.length) cur.origin = lab;
      } else if (s.type === 'DEL') {
        // 값이 없는 앞 품목들 모두 지움
        let any = false;
        for (let k = recs.length - 1; k >= 0; k--) {
          const r = recs[k];
          if (r.price != null || r.del) break;
          if (r.item) { r.del = true; any = true; }
        }
        if (!any && cur && cur.item) cur.del = true;
      }
      if (cur) { if (!cur.first) cur.first = s.type; cur.spans.push(s); }
      lastEnd = s.end;
    });
    const ops = [];
    let prevSet = null;
    for (const r of recs) {
      if (r.del && r.item) { ops.push({ op: 'del', item: r.item }); continue; }
      if (r.item && r.price != null) {
        const op = { op: 'set', item: r.item, qty: r.unit ? r.qty : null, unit: r.unit, per: !!r.per, price: r.price, origin: r.origin };
        if (r.spans.length) Object.defineProperty(op, 'at', { value: [r.spans[0].start, r.spans[r.spans.length - 1].end], enumerable: false });
        if (r.extra.length) op.extra = r.extra;
        ops.push(op); prevSet = op; continue;
      }
      if (!r.item && r.price != null && prevSet) {
        prevSet.extra = prevSet.extra || [];
        prevSet.extra.push({ qty: r.unit ? r.qty : null, unit: r.unit || prevSet.unit, per: !!r.per, price: r.price });
        if (!prevSet.origin && r.origin) prevSet.origin = r.origin;
        continue;
      }
      if (r.item && r.origin && r.price == null) { ops.push({ op: 'origin', item: r.item, origin: r.origin }); continue; }
      // 원산지만 말한 경우("청송산", "국내산이요"): 이 말 안의 앞 가격표에, 없으면 화면에서 방금 만든 가격표에 붙임
      if (!r.item && r.origin && r.price == null) {
        if (prevSet && !prevSet.origin) prevSet.origin = r.origin;
        else ops.push({ op: 'origin', item: null, origin: r.origin });
      }
    }
    return ops;
  }

  // ---------- 모델 ----------
  function load(json) {
    const W = new Map();
    for (const k in json.F) W.set(k, json.F[k]);
    return { W, T: json.T, temp: json.temp || 1, base: { items: json.items || [] }, meta: json.meta || {} };
  }

  function clean(text) {
    return String(text || '').replace(/(\d),(?=\d{3})/g, '$1').replace(/₩/g, '').replace(/\s+/g, ' ').trim();
  }

  // 사전 낱말과 걸치면 경계를 사전에 맞춤(예: '노르웨'+'이로' → '노르웨이', '갈치하' → '갈치')
  function snap(t, spans, lex) {
    const dict = { ITEM: lex[0][1], ORIG: new Set([...lex[1][1], ...lex[2][1]]) };
    const TAIL = /^(하고|하|랑|이랑|와|과|은|는|이|가|도|을|를|로|으로|에)$/;
    // 값 구간이 앞 낱말 끝 글자에서 시작하면("송|이 만 원", "대|구 만 원") 그 글자를 앞 구간에 돌려줌
    spans.forEach((s, i) => {
      if (s.type !== 'PRICE' || s.start === 0 || !/[가-힣]/.test(t[s.start - 1])) return;
      const prev = spans[i - 1];
      let k = 0;
      const mm = s.text.match(/^([영공일이삼사오육륙칠팔구십백천만억]+)\s+\S/);
      if (mm) k = mm[1].length;
      // 붙여 말한 "대구만원": 앞 품목 구간에 첫 글자를 붙이면 사전 품목이 되고, 남은 글자도 값이면 떼기
      else if (prev && prev.type === 'ITEM' && prev.end === s.start && dict.ITEM.has(prev.text + s.text[0]) && !isNaN(P.koNum(s.text.slice(1).replace(/[원\s]/g, '')))) k = 1;
      if (!k) return;
      if (prev && prev.end === s.start) { prev.end += k; prev.text = t.slice(prev.start, prev.end); }
      s.start += k; while (t[s.start] === ' ') s.start++;
      s.text = t.slice(s.start, s.end);
    });
    for (const s of spans) {
      const D = dict[s.type]; if (!D) continue;
      const w = s.text.replace(/산$/, '');
      if (D.has(s.text.replace(/\s+/g, '')) || D.has(w)) continue;
      // 1) 뒤에 붙은 조사·연결어 떼기
      let fixed = false;
      for (let k = 1; k <= 2 && k < s.text.length; k++) {
        const head = s.text.slice(0, -k), tail = s.text.slice(-k);
        if (TAIL.test(tail) && D.has(head.replace(/\s+/g, ''))) { s.end -= k; s.text = head; fixed = true; break; }
      }
      if (fixed) continue;
      // 2) 사전 낱말이 구간을 덮으면 늘리기(앞뒤 3글자까지)
      let best = null;
      for (let a = Math.max(0, s.start - 3); a <= s.start; a++) {
        for (let b = s.end; b <= Math.min(t.length, s.end + 3); b++) {
          const sub = t.slice(a, b);
          if (/\s/.test(sub)) continue;
          if (D.has(sub) || (s.type === 'ORIG' && sub.endsWith('산') && D.has(sub.slice(0, -1)))) { if (!best || b - a > best[1] - best[0]) best = [a, b]; }
        }
      }
      if (best) { s.start = best[0]; s.end = best[1]; s.text = t.slice(best[0], best[1]); }
    }
    return spans;
  }

  // "오천 원 아니 육천 원"처럼 말하다 고친 값은 뒤의 값만 씀
  function selfCorrect(t) {
    const ps = P.findPrices(t);
    for (let i = ps.length - 2; i >= 0; i--) {
      const gap = t.slice(ps[i].end, ps[i + 1].start);
      const toNew = /^\s*에서\s*$/.test(gap) && /^\s*(으로|로)/.test(t.slice(ps[i + 1].end));
      if (toNew || /^\s*(아니|아니다|아니야|아니요|아니고|아니지|말고)\s*$/.test(gap)) t = t.slice(0, ps[i].start) + t.slice(ps[i + 1].start);
    }
    return t;
  }

  function tag(model, text, extraLex) {
    const t = selfCorrect(clean(text));
    const lex = makeLex(model.base, extraLex);
    const x = prep(t, lex);
    const E = emissions(x, model.W);
    const y = viterbi(E, model.T);
    const M = marginals(E, model.T, model.temp);
    return { t, labels: y, spans: snap(t, toSpans(t, y, M), lex) };
  }

  // 말 → {ops, spans, heard}. 모델이 가격표 줄을 못 만들면 규칙으로 한 번 더.
  // 가격표에 안 들어간 낱말 중 뜻이 있어 보이는 것("진영", "구룡포") — 사장님께 확인을 부탁하려고
  const FUNC = new Set(('자 오늘 오늘은 이제 이거 요거 저거 여기 거기 음 어 아 에 그 저 저기 저기요 으음 흠 네 예 응 뭐냐 거시기 그러니까 근데 그런데 ' +
    '그리고 하고 또 다음 그다음 그라고 허고 이랑 랑 및 그리고또 아니 아니고 말고 아니요 아니야 아니지 ' +
    '가격표 가격 값 원산지 원산지는 원산지가 원산지도 써 써줘 써주세요 적어 적어줘 적어주세요 해 해줘 해주세요 해요 만들어 만들어줘 만들어주세요 이렇게 ' +
    '바꿔 바꿔줘 바꿔주세요 바꿀게 올려 올려줘 올려요 내려 내려줘 내려요 변경 할게 해서 받아 받어 받아요 받어요 받을게 팔아 팔아요 팔어 줘 주세요 ' +
    '이요 요 이에요 에요 예요 입니다 입니더 이고 고 짜리 씩 에서 으로 로 거 거요 거여 것 거예요 이여 여 이라 라 이랑께 랑께 잉 이잉 요잉 유 이유 ' +
    '다 전부 모두 둘 셋 둘다 셋다 같이 각각 하나 하나씩 개당 묶어서 떨이 오늘만 지금 새로 새로운 처음 방금 그거 그것 이것 저것 ' +
    '산 원 짜리 정도 쯤 한 두 세 네 반').split(/\s+/));
  function leftovers(t, spans) {
    const used = new Uint8Array(t.length);
    spans.forEach((s) => { for (let i = s.start; i < s.end; i++) used[i] = 1; });
    const out = [];
    const re = /[가-힣A-Za-z]+/g; let m;
    while ((m = re.exec(t))) {
      let a = m.index, b = a + m[0].length;
      if ([...Array(b - a).keys()].some((k) => used[a + k])) continue; // 구간에 걸친 낱말은 조사 꼬리
      let w = m[0].replace(/(은|는|이|가|을|를|도|만|에|에서|으로|로|요|이요|이에요|예요|입니다|이고|이랑|랑|하고)$/u, '');
      if (w.length < 2 || FUNC.has(m[0]) || FUNC.has(w)) continue;
      if (/^(거|것|꺼)(요|여|예|라|라예|랑께|이여|이라|이에요|예요|입니다|유|이유|임|이다|다)?$/.test(m[0])) continue; // "신안 거랑께", "의령 거라예"
      if (/^(수정|고쳐|고치|변경|바꾸|바꿔|올리|내리|만들|적어|써|해|빼|지우|넣어|넣)/.test(m[0])) continue; // 시키는 말
      if (/^(다|전부|모두)?(팔렸|팔렸어|팔렸다|팔렸네|팔렸어요|팔림|품절|나갔|나갔어|떨어졌|없어|없응께|삭제|지워|빼|끝났)/.test(m[0])) continue;
      out.push({ text: m[0], start: a, end: b });
    }
    return out;
  }
  function understand(model, text, extraLex) {
    const r = tag(model, text, extraLex);
    // 원산지로 봤는데 '산'도 안 붙었고 아는 지명·나라도 아니면("받어", "우리") 확신을 낮춰 확인 표시
    r.spans.forEach((s) => {
      if (s.type !== 'ORIG') return;
      const w = s.text.replace(/\s/g, '').replace(/(이에요|이요|예요|입니다|이고|요|거|것)$/, '');
      if (!/산$/.test(w) && !/^(국내산|국산|우리농산물|수입|원양)$/.test(w) && !P.findOrigins(w + '산').length) s.conf = Math.min(s.conf == null ? 1 : s.conf, 0.5);
    });
    // "꽃게 떨어졌어"처럼 다 팔렸다는 말을 품목으로 잘못 보거나 놓치면 지우기 말로 바로잡음
    const DEL_W = /^(다\s*)?(팔렸|떨어졌|나갔|품절|매진|끝났)/;
    r.spans.forEach((s, i) => {
      if (s.type !== 'ITEM' || !DEL_W.test(s.text)) return;
      s.type = 'DEL'; s.conf = Math.max(s.conf || 0, 0.9);
      const nx = r.spans[i + 1] ? r.spans[i + 1].start : r.t.length;
      while (s.end < nx && /[가-힣]/.test(r.t[s.end])) s.end++;
      s.text = r.t.slice(s.start, s.end);
    });
    const reD = /(다\s*)?(팔렸|떨어졌|나갔|품절|매진|끝났)[가-힣]*/g; let md;
    while ((md = reD.exec(r.t))) {
      const a = md.index, b = a + md[0].length;
      if (!r.spans.some((s) => s.start < b && s.end > a)) r.spans.push({ type: 'DEL', start: a, end: b, text: md[0], conf: 0.9 });
    }
    r.spans.sort((x, y) => x.start - y.start);
    // "강원|도"처럼 지명 끝 글자가 빠지면 붙여 줌
    r.spans.forEach((s, i) => {
      if (s.type !== 'ORIG' || r.t[s.end] !== '도' || (r.spans[i + 1] && r.spans[i + 1].start === s.end)) return;
      const o = P.findOrigins(s.text.replace(/산$/, '') + '도산');
      if (o.length && /도\)?$/.test(o[0].label.replace(/산$/, ''))) { s.end += 1; s.text = r.t.slice(s.start, s.end); }
    });
    let ops = assemble(r.t, r.spans);
    let by = 'model';
    if (!ops.length) {
      const rr = P.parse(r.t);
      const ok = rr.ops.filter((o) => o.item && !STOP_ITEM.test(o.item));
      if (ok.length) { ops = ok; by = 'rule'; }
    }
    const unknown = leftovers(r.t, r.spans);
    // 못 알아들은 낱말은 가장 가까운 앞 가격표 줄에 붙임
    unknown.forEach((u) => {
      let best = null;
      ops.forEach((o) => { if (o.at && o.at[0] <= u.start && (!best || o.at[0] > best.at[0])) best = o; });
      if (!best) best = ops.find((o) => o.at) || null;
      if (best) { if (!best.unk) Object.defineProperty(best, 'unk', { value: [], enumerable: false }); best.unk.push(u.text); }
    });
    return { ops, spans: r.spans, heard: r.t, by, unknown };
  }

  const api = { LABELS, NL, prep, feats, emissions, viterbi, marginals, toSpans, assemble, makeLex, load, tag, understand, clean, lexMarks, leftovers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PriceTagger = api;
})(typeof window !== 'undefined' ? window : globalThis);
