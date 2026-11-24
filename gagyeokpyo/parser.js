/* 말하면 가격표: 말(음성 인식 결과)을 가격표 줄로 바꾸는 규칙.
   품목 · 수량 · 단위 · 가격 · 원산지. 원산지는 말한 것만 쓰고 절대 추측하지 않는다. */
(function (root) {
  'use strict';

  const SINO = { '영': 0, '공': 0, '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '륙': 6, '칠': 7, '팔': 8, '구': 9 };
  const SMALL = { '십': 10, '백': 100, '천': 1000 };
  const NATIVE = [
    ['스물', 20], ['스무', 20], ['열하나', 11], ['열한', 11], ['열둘', 12], ['열두', 12], ['열셋', 13], ['열세', 13], ['열넷', 14], ['열네', 14], ['열다섯', 15],
    ['하나', 1], ['한', 1], ['둘', 2], ['두', 2], ['셋', 3], ['세', 3], ['석', 3], ['넷', 4], ['네', 4], ['넉', 4], ['다섯', 5], ['여섯', 6], ['일곱', 7], ['여덟', 8], ['아홉', 9], ['열', 10], ['반', 0.5]
  ];
  // 단위: 말한 대로(키) → 가격표에 쓸 말(값)
  const UNITS = [
    ['킬로그램', 'kg'], ['키로그램', 'kg'], ['킬로', 'kg'], ['키로', 'kg'], ['kg', 'kg'], ['㎏', 'kg'], ['그램', 'g'], ['g', 'g'],
    ['봉지', '봉지'], ['봉다리', '봉지'], ['바구니', '바구니'], ['소쿠리', '소쿠리'], ['다라이', '다라이'], ['박스', '박스'], ['상자', '상자'], ['망', '망'], ['자루', '자루'],
    ['마리', '마리'], ['손', '손'], ['두름', '두름'], ['축', '축'], ['미', '마리'],
    ['포기', '포기'], ['단', '단'], ['묶음', '묶음'], ['다발', '다발'], ['송이', '송이'], ['통', '통'], ['쪽', '쪽'], ['알', '알'], ['개', '개'],
    ['근', '근'], ['팩', '팩'], ['판', '판'], ['모', '모'], ['병', '병'], ['줄', '줄'], ['접시', '접시'], ['인분', '인분'], ['되', '되'], ['말', '말'], ['장', '장'], ['컵', '컵'], ['공기', '공기'], ['봉', '봉'], ['접', '접']
  ];
  const COUNTRIES = ['중국', '미국', '호주', '뉴질랜드', '칠레', '노르웨이', '러시아', '베트남', '태국', '필리핀', '페루', '멕시코', '캐나다', '일본', '대만', '인도네시아', '스페인', '브라질', '아르헨티나',
    '에콰도르', '이스라엘', '남아공', '남아프리카공화국', '튀르키예', '터키', '이탈리아', '프랑스', '독일', '덴마크', '네덜란드', '영국', '아일랜드', '인도', '파키스탄', '몽골', '콜롬비아', '과테말라', '케냐',
    '모로코', '세네갈', '모리타니아', '아이슬란드', '캄보디아', '미얀마', '말레이시아', '스리랑카', '방글라데시', '우즈베키스탄', '카자흐스탄', '우루과이', '파라과이', '코스타리카', '파나마', '그리스', '폴란드',
    '헝가리', '오스트리아', '벨기에', '스웨덴', '핀란드', '포르투갈', '이란', '이집트', '나이지리아', '가나', '탄자니아', '마다가스카르', '모잠비크', '라오스', '홍콩', '싱가포르', '아랍에미리트'];
  const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
    '경기도', '강원도', '충청북도', '충청남도', '전라북도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주도', '강원특별자치도', '제주특별자치도',
    '해남', '영광', '나주', '무안', '고흥', '완도', '진도', '신안', '여수', '순천', '목포', '보성', '장흥', '강진', '영암', '함평', '담양', '곡성', '구례', '화순', '광양', '장성',
    '성주', '청송', '영천', '상주', '의성', '안동', '영주', '문경', '김천', '경산', '포항', '영덕', '울진', '경주', '청도', '봉화', '예천', '군위', '칠곡',
    '통영', '거제', '남해', '하동', '산청', '함양', '거창', '합천', '창녕', '밀양', '김해', '진주', '사천', '고성', '의령', '함안', '창원', '양산',
    '서산', '태안', '당진', '홍성', '보령', '논산', '금산', '부여', '공주', '천안', '아산', '청양', '예산', '서천',
    '괴산', '음성', '충주', '제천', '단양', '영동', '옥천', '보은', '진천', '증평', '청주',
    '고창', '부안', '김제', '정읍', '순창', '임실', '남원', '무주', '진안', '장수', '완주', '익산', '군산', '전주',
    '평창', '정선', '횡성', '홍천', '춘천', '철원', '양구', '인제', '강릉', '속초', '양양', '삼척', '동해', '태백', '영월', '화천',
    '이천', '여주', '안성', '평택', '포천', '양평', '가평', '연천', '파주', '김포', '용인', '화성', '서귀포', '울릉', '독도'];
  const DROP = ['해 주세요', '해주세요', '주세요', '해 줘요', '해줘요', '해 줘', '해줘', '써 줘', '써줘', '적어 줘', '적어줘', '만들어 줘', '만들어줘', '가격표', '입니다'];
  const DEL_RE = /(빼\s*줘|빼줘|빼요|빼|지워\s*줘|지워줘|지워|삭제|없애\s*줘|없애|다\s*팔렸|품절)/;

  function digitsFirst(s) { return s.replace(/(\d),(?=\d{3})/g, '$1').replace(/₩/g, ''); }

  // 한글·숫자 섞인 금액 → 숫자 (예: 1만2천, 만 이천, 삼천오백, 5천)
  function koNum(str) {
    let s = String(str).replace(/\s+/g, '');
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    let total = 0, part = 0, cur = null, seen = false;
    let i = 0;
    while (i < s.length) {
      const m = s.slice(i).match(/^\d+(\.\d+)?/);
      if (m) { if (cur !== null) return NaN; cur = parseFloat(m[0]); i += m[0].length; seen = true; continue; }
      const ch = s[i];
      if (ch in SINO) { if (cur !== null) return NaN; cur = SINO[ch]; i++; seen = true; continue; }
      if (ch in SMALL) { part += (cur === null ? 1 : cur) * SMALL[ch]; cur = null; i++; seen = true; continue; }
      if (ch === '만') { part += (cur === null ? 0 : cur); total += (part === 0 ? 1 : part) * 10000; part = 0; cur = null; i++; seen = true; continue; }
      if (ch === '억') { part += (cur === null ? 0 : cur); total += (part === 0 ? 1 : part) * 100000000; part = 0; cur = null; i++; seen = true; continue; }
      return NaN;
    }
    if (!seen) return NaN;
    return total + part + (cur === null ? 0 : cur);
  }

  const NUMCH = '0-9.영공일이삼사오육륙칠팔구십백천만억';
  const PRICE_RE = new RegExp('([' + NUMCH + '](?:[' + NUMCH + ' ]*[' + NUMCH + '])?)\\s*원', 'g');

  function findPrices(t) {
    const out = [];
    let m;
    PRICE_RE.lastIndex = 0;
    while ((m = PRICE_RE.exec(t))) {
      let raw = m[1].trim();
      // 금액 앞에 붙은 수량 말("두 봉지 만 원"의 '두'는 단위가 사이에 있어 안 걸림). 단어 경계 정리
      let v = koNum(raw);
      // "만" 단독은 koNum이 10000
      if (isNaN(v)) {
        // 앞쪽 글자가 섞였을 때 뒤에서부터 가장 긴 숫자 덩어리
        const toks = raw.split(/\s+/);
        for (let k = 0; k < toks.length; k++) {
          const tail = toks.slice(k).join('');
          const vv = koNum(tail);
          if (!isNaN(vv)) { v = vv; raw = toks.slice(k).join(' '); break; }
        }
      }
      if (isNaN(v) || v <= 0) continue;
      const start = m.index + m[0].indexOf(raw);
      out.push({ value: Math.round(v), start, end: m.index + m[0].length });
    }
    return out;
  }

  function nativeNum(w) {
    for (const [k, v] of NATIVE) if (w === k) return v;
    if (/^\d+(\.\d+)?$/.test(w)) return parseFloat(w);
    const n = koNum(w);
    return isNaN(n) ? null : n;
  }

  // "한 봉지", "2마리", "1kg", "100그램", "반 근", "개당", "킬로에"
  function findQty(t) {
    const unitAlt = UNITS.map(u => u[0]).sort((a, b) => b.length - a.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const numAlt = '(\\d+(?:\\.\\d+)?|' + NATIVE.map(n => n[0]).join('|') + '|[일이삼사오육칠팔구십백천]+)';
    const re = new RegExp('(?:' + numAlt + '\\s*)?(' + unitAlt + ')(당|에|씩|짜리)?(?=\\s|$|\\d|[일이삼사오육칠팔구십백천만])', 'g');
    const found = [];
    let m;
    while ((m = re.exec(t))) {
      const numWord = m[1];
      const unitWord = m[2];
      if (!numWord && !m[3]) continue; // 숫자도 '당'도 없으면 단위로 안 봄(품목 이름 속 '단', '통' 등 오인 방지)
      const q = numWord ? nativeNum(numWord) : 1;
      if (q === null) continue;
      const unit = UNITS.find(u => u[0] === unitWord)[1];
      found.push({ qty: q, unit, per: m[3] === '당', start: m.index, end: m.index + m[0].length });
    }
    return found;
  }

  function cleanItem(s) {
    let x = ' ' + s + ' ';
    for (const d of DROP) x = x.split(d).join(' ');
    x = x.replace(/[,.!?·~]/g, ' ');
    x = (' ' + x + ' ').replace(/\s(그리고|하고|또|다음|다음은|이번엔|이건|요건|요거|이거|저거|가격|값|가격은|값은|가격이|값이)(?=\s)/g, ' ');
    x = x.replace(/\s+/g, ' ').trim();
    // 앞: 앞 가격 말끝(원이고, 원이요, 원짜리 …)
    x = x.replace(/^(이고요|이고|이구요|이구|이요|이에요|예요|입니다|이다|요|고|짜리|씩|에|이랑|랑)(\s+|$)/, '').trim();
    // 끝 조사(포도의 '도' 같은 이름 글자는 건드리지 않음)
    x = x.replace(/(은|는|을|를|가|요)$/u, m => (x.length >= 2 ? '' : m)).trim();
    x = x.replace(/\s*(에|씩)$/u, '').trim();
    return x;
  }

  // strong: 국산·국내산·수입산·원양산, 「○○산」(○○가 나라·지역). weak: 나라·지역 이름만(가격 뒤나 '원산지' 뒤에서만 원산지로 씀)
  function findOrigins(t) {
    const out = [];
    const re = /(국내산|국산|우리\s?농산물|원양산|수입산|[가-힣]{2,12})/g;
    let m;
    while ((m = re.exec(t))) {
      const w = m[1].replace(/\s/g, '');
      let label = null, strong = false;
      if (w === '국내산' || w === '국산' || w === '우리농산물') { label = '국내산'; strong = true; }
      else if (w === '원양산') { label = '원양산'; strong = true; }
      else if (w === '수입산') { label = '수입산'; strong = true; }
      else {
        const stripped = w.replace(/(이에요|이요|이고|입니다|예요|요|이)$/, '');
        const cands = [stripped];
        if (stripped.endsWith('산')) cands.push(stripped.slice(0, -1));
        for (const c of cands) {
          const isSan = c !== stripped;   // ○○산 꼴
          if (COUNTRIES.includes(c)) { label = c + '산'; strong = isSan; break; }
          if (REGIONS.includes(c)) { label = '국내산(' + c + ')'; strong = isSan; break; }
        }
      }
      if (label) {
        const before = t.slice(Math.max(0, m.index - 6), m.index);
        if (/원산지\s*(는|은)?\s*$/.test(before)) strong = true;
        out.push({ label, strong, start: m.index, end: m.index + m[0].length, word: m[1] });
      }
    }
    return out;
  }

  function fmtQty(q, unit) {
    if (q === 0.5) return '반 ' + unit;
    const n = Number.isInteger(q) ? q : q.toString();
    return n + unit;
  }

  // 한 번 말한 문장 → 동작 목록 [{op:'set', item, qty, unit, per, price, origin, extra:[...]}, {op:'del', item}]
  function parse(text) {
    let t = digitsFirst(String(text || '')).replace(/\s+/g, ' ').trim();
    if (!t) return { ops: [], heard: '' };
    const ops = [];
    // 삭제 명령: "고등어 빼 줘", "사과 다 팔렸어"
    const del = t.match(DEL_RE);
    if (del && findPrices(t).length === 0) {
      const name = cleanItem(t.slice(0, del.index).replace(/(은|는|을|를|이|가)?\s*$/, ''));
      if (name) ops.push({ op: 'del', item: name });
      return { ops, heard: t };
    }
    const prices = findPrices(t);
    const qtys = findQty(t);
    const origins = findOrigins(t);
    // 구간 나누기: 가격마다 한 줄. 가격 뒤에 붙은 원산지는 그 줄로.
    let cursor = 0;
    let last = null;
    prices.forEach((p, idx) => {
      let segStart = cursor, segEnd = p.end;
      // 다음 가격 전까지, 이 가격 바로 뒤 원산지 말을 흡수
      const nextStart = idx + 1 < prices.length ? prices[idx + 1].start : t.length;
      const tailOrigins = origins.filter(o => o.start >= p.end && o.end <= nextStart);
      let tailEnd = p.end;
      let tailOrigin = null;
      if (tailOrigins.length) {
        const o = tailOrigins[0];
        const between = t.slice(p.end, o.start).replace(/[\s,]|원산지|은|는|이고|이요|이에요|예요|요|에|이다/g, '');
        if (between === '') { tailOrigin = o; tailEnd = o.end; }
      }
      const seg = t.slice(segStart, p.start);
      const segQty = qtys.filter(q => q.start >= segStart && q.end <= p.start + 1);
      const segOrig = origins.filter(o => o.strong && o.start >= segStart && o.end <= p.start);
      // 품목 이름 = 구간에서 수량·원산지·'원산지' 말 뺀 나머지
      let name = seg;
      const cut = [...segQty.map(q => [q.start - segStart, q.end - segStart]), ...segOrig.map(o => [o.start - segStart, o.end - segStart])].sort((a, b) => b[0] - a[0]);
      for (const [a, b] of cut) name = name.slice(0, a) + ' ' + name.slice(b);
      name = cleanItem(name.replace(/원산지(는|은)?/g, ' '));
      const q = segQty.length ? segQty[segQty.length - 1] : null;
      const origin = tailOrigin ? tailOrigin.label : (segOrig.length ? segOrig[segOrig.length - 1].label : null);
      const row = { op: 'set', item: name, qty: q ? q.qty : null, unit: q ? q.unit : null, per: q ? q.per : false, price: p.value, origin };
      if (!name && last) {
        // 같은 품목 두 번째 가격(예: 한 봉지 오천 원, 두 봉지 구천 원)
        last.extra = last.extra || [];
        last.extra.push({ qty: row.qty, unit: row.unit || last.unit, per: row.per, price: row.price });
        if (!last.origin && origin) last.origin = origin;
      } else {
        ops.push(row);
        last = row;
      }
      cursor = tailEnd;
    });
    if (!prices.length) {
      // 가격 없이 원산지만: "사과 원산지 청송"
      const o = origins.filter(x => x.strong).pop();
      if (o) {
        const name = cleanItem(t.slice(0, o.start).replace(/원산지(는|은)?/g, ' '));
        if (name) ops.push({ op: 'origin', item: name, origin: o.label });
      }
    }
    return { ops, heard: t };
  }

  function won(n) { return n.toLocaleString('ko-KR'); }

  const api = { parse, koNum, findPrices, findQty, findOrigins, fmtQty, won, COUNTRIES, REGIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PriceParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
