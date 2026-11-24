(function () {
  'use strict';
  const P = window.PriceParser;
  const TG = window.PriceTagger;
  const KEY = 'malhamyeon-gagyeokpyo.v1';
  const LEXKEY = 'malhamyeon-gagyeokpyo.lex';
  const SHOPKEY = 'malhamyeon-gagyeokpyo.shop';
  const $ = (s) => document.querySelector(s);
  const state = { items: [], undo: null, model: null, learned: { items: [], origins: [] } };
  const LOW = 0.8; // 이보다 확신이 낮으면 '확인해 주세요'

  // ---------- 저장 ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 안 돼도 화면은 그대로 */ } }
  };
  function load() {
    try { const raw = store.get(KEY); if (raw) state.items = JSON.parse(raw).items || []; } catch (e) { state.items = []; }
    try { const raw = store.get(LEXKEY); if (raw) state.learned = Object.assign({ items: [], origins: [] }, JSON.parse(raw)); } catch (e) { /* 처음 */ }
  }
  function save() { store.set(KEY, JSON.stringify({ items: state.items })); }
  function learn(kind, word) {
    const w = String(word || '').replace(/\s+/g, '');
    if (!w || state.learned[kind].includes(w)) return false;
    state.learned[kind].push(w);
    store.set(LEXKEY, JSON.stringify(state.learned));
    return true;
  }
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const uid = () => Math.random().toString(36).slice(2, 9);

  // 해석 모델(휴대폰 안에서 돎). 못 불러오면 규칙만으로.
  fetch('model.json').then((r) => r.json()).then((j) => { state.model = TG.load(j); if (j.itemsAll) state.model.base.items = j.itemsAll; }).catch(() => { state.model = null; });
  function userLex() { return { items: state.items.map((x) => x.item).concat(state.learned.items), origins: state.learned.origins }; }
  function knownItem(name) {
    const n = norm(name);
    if (state.model && state.model.base.items.includes(n)) return true;
    return state.learned.items.includes(n) || state.items.some((x) => norm(x.item) === n);
  }
  function understand(text) {
    if (state.model) return TG.understand(state.model, text, userLex());
    const r = P.parse(text);
    return { ops: r.ops, spans: [], heard: r.heard, by: 'rule' };
  }

  // ---------- 표시 글자 ----------
  function qtyText(q, unit, per) {
    if (!unit) return '';
    if (per) return (q && q !== 1 ? q : '') + unit + '당';
    return P.fmtQty(q == null ? 1 : q, unit);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const em = (s) => [...String(s)].reduce((a, c) => a + (/[가-힣]/.test(c) ? 0.98 : /[,.()]/.test(c) ? 0.3 : /\s/.test(c) ? 0.3 : 0.56), 0);

  function tagHTML(it, size) {
    const cls = size === '4' ? 'tag s4' : size === '1' ? 'tag s1' : 'tag';
    const price = P.won(it.price);
    // 글자가 넘치면 줄이되, 원산지는 20포인트(7.1mm) 아래로 안 내려감
    const G = size === '1' ? { w: 255, item: 40, qty: 18, main: 64, ov: 20, ol: 9 } : size === '4' ? { w: 84, item: 22, qty: 10, main: 34, ov: 10, ol: 4.2 } : { w: 88, item: 16, qty: 8, main: 21, ov: 8, ol: 4.2 };
    const mainFs = Math.min(G.main, G.w / (em(price) + 0.55));
    const qt = qtyText(it.qty, it.unit, it.per);
    const itemRoom = G.w - em(qt) * G.qty - 4;
    const itemFs = Math.min(G.item, itemRoom / Math.max(1, em(it.item)));
    const extras = (it.extra || []).map((x) => '<span class="t-extra">' + esc(qtyText(x.qty, x.unit || it.unit, x.per)) + ' ' + P.won(x.price) + '원</span>').join('');
    const ovFs = it.origin ? Math.max(7.1, Math.min(G.ov, (G.w - G.ol * 3.2 - 3) / Math.max(1, em(it.origin)))) : G.ov;
    const orig = it.origin
      ? '<span class="ol">원산지</span><span class="ov" style="font-size:' + ovFs.toFixed(1) + 'mm">' + esc(it.origin) + '</span>'
      : '<span class="ol">원산지</span><span class="blank"></span>';
    return '<div class="' + cls + '">' +
      '<div class="t-head"><span class="t-item" style="font-size:' + itemFs.toFixed(1) + 'mm">' + esc(it.item) + '</span><span class="t-qty">' + esc(qt) + '</span></div>' +
      '<div class="t-price"><span class="t-main" style="font-size:' + mainFs.toFixed(1) + 'mm">' + price + '<span class="w">원</span></span><span class="t-extras">' + extras + '</span></div>' +
      '<div class="t-orig">' + orig + '</div></div>';
  }

  // ---------- 화면 ----------
  function fitAll() {
    document.querySelectorAll('.fit').forEach((box) => {
      const tag = box.firstElementChild; if (!tag) return;
      tag.style.transform = 'scale(' + (box.clientWidth / tag.offsetWidth) + ')';
    });
  }

  function notes(it) {
    const f = [];
    if (it.check && it.check.length) f.push('<span class="note miss">확인해 주세요: ' + esc(it.check.join(', ')) + '</span>');
    else if (it.printedAt && it.updatedAt > it.printedAt) f.push('<span class="note chg">인쇄 뒤 값 바뀜</span>');
    return f.join('');
  }

  function render(flashIds) {
    const box = $('#tags');
    box.innerHTML = state.items.map((it) =>
      '<div class="slot" data-id="' + it.id + '">' +
        '<div class="fit' + (flashIds && flashIds.includes(it.id) ? ' flash' : '') + (it.check && it.check.length ? ' chk' : '') + '">' + tagHTML(it, '8') + '</div>' +
        '<div class="slot-tools">' + notes(it) + '<span style="flex:1"></span>' +
          (it.check && it.check.length ? '<button type="button" class="tbtn ok" data-act="ok">맞아요</button>' : '') +
          '<button type="button" class="tbtn" data-act="edit">고치기</button>' +
          '<button type="button" class="tbtn del" data-act="del">지우기</button></div>' +
      '</div>').join('');
    const has = state.items.length > 0;
    $('#empty').hidden = has;
    document.body.classList.toggle('has-tags', has);
    $('#shareImg').disabled = !has; $('#clearAll').disabled = !has;
    $('#shopName').hidden = !has;
    if (!has) $('#demoFit').innerHTML = tagHTML({ item: '사과', qty: 1, unit: '봉지', per: false, price: 5000, origin: '국내산(청송)', extra: [{ qty: 2, unit: '봉지', per: false, price: 9000 }] }, '8');
    $('#count').textContent = has ? state.items.length + '장' : '';
    fitAll();
  }

  // ---------- 말 → 가격표 ----------
  function apply(text, source, alts) {
    let r = understand(text);
    // 음성 인식 후보가 여럿이면 가격표가 가장 말이 되게 나오는 것을 고름
    let picked = 0;
    if (alts && alts.length > 1) {
      const scoreOf = (x) => x.ops.filter((o) => o.op !== 'set' || (o.item && o.price)).length * 10 + (x.spans.length ? Math.min(...x.spans.map((s) => s.conf || 1)) : 0);
      let best = scoreOf(r);
      alts.slice(1).forEach((a, i) => { const x = understand(a); const s = scoreOf(x); if (s > best + 0.05) { best = s; r = x; picked = i + 1; } });
    }
    const before = JSON.stringify(state.items);
    const done = [];
    const now = Date.now();
    for (const op of r.ops) {
      const i = state.items.findIndex((x) => norm(x.item) === norm(op.item));
      if (op.op === 'del') {
        if (i >= 0) { done.push({ kind: 'del', it: state.items[i] }); state.items.splice(i, 1); }
        else done.push({ kind: 'nf', name: op.item });
      } else if (op.op === 'origin') {
        if (i >= 0) { state.items[i].origin = op.origin; state.items[i].updatedAt = now; done.push({ kind: 'upd', it: state.items[i] }); }
        else done.push({ kind: 'nf', name: op.item });
      } else if (op.op === 'set') {
        if (!op.item) continue;
        const known = knownItem(op.item);
        const check = checksFor(op, r.spans);
        if (i >= 0) {
          const it = state.items[i];
          const hadExtra = (it.extra || []).length;
          it.price = op.price;
          if (op.unit) { it.qty = op.qty; it.unit = op.unit; it.per = op.per; }
          if (op.origin) it.origin = op.origin;
          if (op.extra) it.extra = op.extra; else if (op.unit) it.extra = [];
          it.check = check;
          it.updatedAt = now;
          done.push({ kind: 'upd', it, known: true, dropped: hadExtra && !(it.extra || []).length });
        } else {
          const it = { id: uid(), item: op.item, qty: op.qty, unit: op.unit, per: op.per, price: op.price, origin: op.origin, extra: op.extra || [], updatedAt: now, printedAt: 0, check };
          if (!known) it.check = check.concat(['처음 듣는 품목']);
          state.items.push(it);
          done.push({ kind: 'new', it, known });
        }
      }
    }
    if (done.length) state.undo = before;
    save();
    showHeard(r, done, picked);
    const ids = done.filter((d) => d.it && d.kind !== 'del').map((d) => d.it.id);
    render(ids);
    // 휴대폰: 만든 가격표가 보이게
    if (ids.length && window.matchMedia('(max-width:860px)').matches) {
      const el = document.querySelector('.slot[data-id="' + ids[0] + '"]');
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    } else {
      // PC: 왼쪽 패널 안에서 "방금 들은 말"이 보이게(노트북 화면에서 인쇄 막대에 가리지 않게)
      const h = $('#heard');
      if (h && !h.hidden) setTimeout(() => h.scrollIntoView({ block: 'nearest' }), 30);
    }
  }

  // 확신이 낮은 구간이 이 줄의 어느 칸인지
  function checksFor(op, spans) {
    const out = [];
    for (const s of (spans || [])) {
      if (s.conf == null || s.conf >= LOW) continue;
      const w = norm(s.text).replace(/산$/, '');
      if (s.type === 'ORIG' && op.origin && norm(op.origin).includes(w)) out.push('원산지');
      else if (s.type === 'ITEM' && norm(op.item) === norm(itemClean(s.text))) out.push('품목 이름');
      else if (s.type === 'QTY' && op.unit) out.push('수량');
      else if (s.type === 'PRICE') out.push('가격');
    }
    if (op.origin && IMPORT_ONLY.test(op.origin)) out.push('원산지 나라 이름');
    return [...new Set(out)];
  }
  const itemClean = (x) => String(x).replace(/(은|는|을|를)$/u, '');
  // 받침 있으면 a(은/을), 없으면 b(는/를)
  const josa = (w, a, b) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b; };
  const IMPORT_ONLY = /^(수입산|수입|외국산)$/;

  function heardHTML(t, spans) {
    if (!spans || !spans.length) return esc(t);
    let h = '', at = 0;
    for (const s of spans) {
      if (s.end <= at) continue;
      const st = Math.max(s.start, at);
      h += esc(t.slice(at, st));
      h += '<span class="sp sp-' + s.type + (s.conf != null && s.conf < LOW ? ' low' : '') + '" title="' + TYPE_NAME[s.type] + '">' + esc(t.slice(st, s.end)) + '</span>';
      at = s.end;
    }
    return h + esc(t.slice(at));
  }

  const TYPE_NAME = { ITEM: '품목', QTY: '수량', PRICE: '가격', ORIG: '원산지', DEL: '지우기' };
  const TYPE_KO = { ITEM: '품목으로', QTY: '수량으로', PRICE: '가격으로', ORIG: '원산지로', DEL: '지우라는 말로' };
  function showHeard(r, done, picked) {
    $('#heard').hidden = false;
    $('#heardText').innerHTML = '“' + heardHTML(r.heard, r.spans) + '”';
    const ul = $('#heardOps');
    const low = (r.spans || []).filter((s) => s.conf != null && s.conf < LOW);
    if (!done.length) {
      const gotPrice = (r.spans || []).some((s) => s.type === 'PRICE');
      ul.innerHTML = gotPrice
        ? '<li><span class="miss">값은 들었는데 품목 이름을 못 알아들었어요. “사과 한 봉지 오천 원”처럼 품목부터 말해 주세요.</span></li>'
        : '<li><span class="miss">가격을 못 알아들었어요. “사과 한 봉지 오천 원”처럼 원까지 말해 주세요.</span></li>';
      $('#undo').hidden = true;
    } else {
      $('#undo').hidden = false;
      ul.innerHTML = done.map((d) => {
        if (d.kind === 'del') return '<li><span class="what">' + esc(d.it.item) + '</span> 가격표를 지웠어요.</li>';
        if (d.kind === 'nf') return '<li><span class="miss">“' + esc(d.name) + '” 가격표가 없어요.</span></li>';
        const it = d.it;
        const q = qtyText(it.qty, it.unit, it.per);
        const ex = (it.extra || []).map((x) => ', ' + esc(qtyText(x.qty, x.unit || it.unit, x.per)) + ' ' + P.won(x.price) + '원').join('');
        let li = '<li><span class="what">' + esc(it.item) + '</span> 가격표를 ' + (d.kind === 'upd' ? '고쳤어요' : '만들었어요') + '. ' + (q ? esc(q) + ' ' : '') + P.won(it.price) + '원' + ex +
          (it.origin ? ', 원산지 ' + esc(it.origin) + '.' : '. <span class="miss">원산지를 말하지 않아서 빈칸으로 뒀어요.</span>');
        if (it.origin && IMPORT_ONLY.test(it.origin)) li += '<span class="check">수입품은 나라 이름을 써야 해요. “미국산”처럼 나라를 말하거나 고치기로 적어 주세요.</span>';
        if (d.dropped) li += '<span class="check">수량을 새로 말해서 전에 있던 두 번째 값 줄은 뺐어요. 되돌리려면 되돌리기를 눌러 주세요.</span>';
        if (d.kind === 'new' && d.known === false) li += '<span class="check">“' + esc(it.item) + '”' + josa(it.item, '은', '는') + ' 처음 듣는 품목이에요. 이름이 틀렸으면 고치기를 눌러 주세요. 고친 이름은 기억해 두고 다음부터 알아들어요.</span>';
        return li + '</li>';
      }).join('') + low.map((s) => '<li><span class="check">“' + esc(s.text) + '”' + josa(s.text, '을', '를') + ' ' + TYPE_KO[s.type] + ' 봤는데 확실하지 않아요. 가격표를 확인해 주세요.</span></li>').join('');
    }
    $('#heardBy').textContent = picked ? '음성 인식 후보 중 ' + (picked + 1) + '번째 문장이 가격표로 가장 말이 돼서 그걸로 만들었어요.' : '';
  }

  // ---------- 음성 인식 ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function setMic(on, msg) {
    listening = on;
    $('#mic').classList.toggle('on', on);
    $('#micLabel').textContent = on ? '듣는 중, 다시 누르면 멈춤' : '한 번 누르고 말하기';
    if (msg) $('#micState').textContent = msg;
  }
  function initSpeech() {
    if (!SR) {
      $('#mic').disabled = true;
      $('#micLabel').textContent = '음성 인식 안 됨';
      $('#micState').textContent = '이 브라우저는 음성 인식을 지원하지 않아요. 크롬(휴대폰, PC)에서 열거나 아래에 적어 주세요.';
      return;
    }
    rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    let finals = [], lastAlts = [];
    rec.onstart = () => { finals = []; lastAlts = []; setMic(true, '듣고 있어요. 천천히 말해 주세요.'); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finals.push(res[0].transcript);
          lastAlts = Array.from({ length: res.length }, (_, k) => res[k].transcript);
        } else interim += res[0].transcript;
      }
      $('#micState').textContent = (finals.join(' ') + ' ' + interim).trim() || '듣고 있어요.';
    };
    rec.onerror = (e) => {
      const m = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? '마이크 사용이 막혀 있어요. 주소창 옆 자물쇠에서 마이크를 허용해 주세요.'
        : e.error === 'no-speech' ? '말소리가 안 들렸어요. 다시 눌러 말해 주세요.'
        : e.error === 'network' ? '음성 인식 서버에 연결이 안 돼요. 인터넷을 확인하거나 아래에 적어 주세요.'
        : '음성 인식이 멈췄어요(' + e.error + '). 다시 눌러 주세요.';
      setMic(false, m);
    };
    rec.onend = () => {
      const t = finals.join(' ').trim();
      setMic(false, t ? '알아들었어요. 가격표를 확인해 주세요.' : $('#micState').textContent);
      if (!t) return;
      // 마지막 문장의 다른 후보들로 바꿔 본 문장들
      const head = finals.slice(0, -1).join(' ');
      const alts = lastAlts.length > 1 ? lastAlts.map((a) => (head + ' ' + a).trim()) : null;
      apply(t, 'voice', alts);
    };
  }
  $('#mic').addEventListener('click', () => {
    if (!rec) return;
    if (listening) { rec.stop(); return; }
    try { rec.start(); } catch (e) { /* 이미 시작됨 */ }
  });

  // ---------- 적기·예시 ----------
  $('#typeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#typeIn').value.trim();
    if (!v) return;
    apply(v, 'type');
    $('#typeIn').value = '';
  });
  document.querySelectorAll('.ex').forEach((b) => b.addEventListener('click', () => { b.blur(); apply(b.dataset.say, 'example'); }));
  $('#undo').addEventListener('click', () => {
    if (!state.undo) return;
    state.items = JSON.parse(state.undo); state.undo = null; save(); render();
    $('#heardOps').innerHTML = '<li>방금 한 것을 되돌렸어요.</li>'; $('#undo').hidden = true; $('#heardBy').textContent = '';
  });
  function say(html) {
    $('#heard').hidden = false; $('#heardText').innerHTML = ''; $('#heardBy').textContent = '';
    $('#heardOps').innerHTML = html;
  }

  // ---------- 고치기·지우기 ----------
  $('#tags').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const slot = b.closest('.slot'); if (!slot) return;
    const id = slot.dataset.id;
    const it = state.items.find((x) => x.id === id); if (!it) return;
    if (b.dataset.act === 'ok') {
      const wasNew = (it.check || []).includes('처음 듣는 품목');
      it.check = []; save(); render();
      const learned = wasNew && learn('items', it.item);
      say('<li><span class="what">' + esc(it.item) + '</span> 가격표를 확인했어요.' + (learned ? '<span class="check" style="color:var(--green)">“' + esc(it.item) + '”' + josa(it.item, '을', '를') + ' 기억했어요. 다음부터 품목으로 알아들어요.</span>' : '') + '</li>');
      return;
    }
    if (b.dataset.act === 'del') {
      state.undo = JSON.stringify(state.items);
      state.items = state.items.filter((x) => x.id !== id); save(); render();
      say('<li><span class="what">' + esc(it.item) + '</span> 가격표를 지웠어요.</li>'); $('#undo').hidden = false;
    } else if (b.dataset.act === 'edit') {
      if (slot.querySelector('.edit')) return;
      const f = document.createElement('form');
      f.className = 'edit';
      f.innerHTML = '<label>품목<input name="item" value="' + esc(it.item) + '"></label>' +
        '<label>가격(원)<input name="price" inputmode="numeric" value="' + it.price + '"></label>' +
        '<label>수량, 단위<input name="qty" value="' + esc(qtyText(it.qty, it.unit, it.per)) + '" placeholder="예) 한 봉지"></label>' +
        '<label>원산지<input name="origin" value="' + esc(it.origin || '') + '" placeholder="예) 국내산, 해남, 중국산"></label>' +
        '<div class="row"><span class="hint">고친 품목 이름과 원산지는 기억해요</span><button type="button" class="tbtn" data-act="cancel">취소</button><button class="btn btn-ink" type="submit">저장</button></div>';
      slot.appendChild(f);
      f.querySelector('input').focus();
      f.addEventListener('click', (ev) => { if (ev.target.dataset.act === 'cancel') f.remove(); });
      f.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const d = new FormData(f);
        state.undo = JSON.stringify(state.items);
        const oldName = it.item;
        it.item = String(d.get('item')).trim() || it.item;
        const pv = P.koNum(String(d.get('price')).replace(/[,원\s]/g, ''));
        if (!isNaN(pv) && pv > 0) it.price = Math.round(pv);
        const qs = String(d.get('qty')).trim();
        if (!qs) { it.qty = null; it.unit = null; it.per = false; }
        else { const q = P.findQty(qs + ' '); if (q.length) { it.qty = q[0].qty; it.unit = q[0].unit; it.per = q[0].per; } }
        const os = String(d.get('origin')).trim();
        let learnedMsg = '';
        if (!os) it.origin = null;
        else if (os === (it.origin || '') || /^국내산\(.+\)$/.test(os)) it.origin = os;
        else {
          const o = P.findOrigins(os);
          it.origin = o.length ? o[0].label : os;
          const place = os.replace(/산$/, '').replace(/\s+/g, '');
          if (!o.length && /^[가-힣]{2,8}$/.test(place) && learn('origins', place)) learnedMsg += ' 원산지 “' + esc(place) + '”도 기억했어요.';
        }
        if (norm(oldName) !== norm(it.item) && learn('items', it.item)) learnedMsg = '“' + esc(it.item) + '”' + josa(it.item, '을', '를') + ' 기억했어요. 다음부터 이 이름을 품목으로 알아들어요.' + learnedMsg;
        it.updatedAt = Date.now();
        it.check = it.origin && IMPORT_ONLY.test(it.origin) ? ['원산지 나라 이름'] : [];
        save(); render([it.id]);
        say('<li><span class="what">' + esc(it.item) + '</span> 가격표를 고쳤어요. ' + P.won(it.price) + '원' + (it.origin ? ', 원산지 ' + esc(it.origin) : '') + '.' + (learnedMsg ? '<span class="check" style="color:var(--green)">' + learnedMsg + '</span>' : '') + '</li>');
        $('#undo').hidden = false;
      });
    }
  });
  $('#clearAll').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed) {
      state.undo = JSON.stringify(state.items); state.items = []; save(); render();
      b.textContent = '전부 지우기'; delete b.dataset.armed;
      say('<li>가격표를 전부 지웠어요.</li>'); $('#undo').hidden = false;
    } else {
      if (!state.items.length) return;
      b.textContent = '한 번 더 누르면 전부 지워요'; b.dataset.armed = '1';
      setTimeout(() => { if (b.dataset.armed) { b.textContent = '전부 지우기'; delete b.dataset.armed; } }, 3500);
    }
  });

  // ---------- 인쇄 ----------
  let printing = [];
  function buildPrint() {
    const size = document.querySelector('input[name=size]:checked').value;
    const only = $('#onlyChanged').checked;
    const list = state.items.filter((it) => !only || !it.printedAt || it.updatedAt > it.printedAt);
    const per = size === '8' ? 8 : size === '4' ? 4 : 1;
    let html = '';
    for (let i = 0; i < list.length; i += per) {
      html += '<div class="sheet g' + size + '">' + list.slice(i, i + per).map((it) => tagHTML(it, size)).join('') + '</div>';
    }
    const area = $('#printArea');
    area.innerHTML = html;
    area.classList.toggle('bw', $('#bw').checked);
    printing = list.map((x) => x.id);
    return { list, per, size };
  }
  $('#printBtn').addEventListener('click', () => {
    const r = buildPrint();
    const note = $('#printNote');
    if (!r.list.length) { note.textContent = $('#onlyChanged').checked ? '마지막 인쇄 뒤 바뀐 가격표가 없어요.' : '인쇄할 가격표가 없어요.'; return; }
    const miss = r.list.filter((x) => !x.origin).length;
    const pages = Math.ceil(r.list.length / r.per);
    note.textContent = r.list.length + '장, A4 ' + pages + '쪽' + (miss ? '. 원산지 없는 ' + miss + '장은 빈칸으로 나가요(손으로 꼭 적어 주세요).' : '.');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.print()); else window.print();
  });
  window.addEventListener('afterprint', () => {
    const now = Date.now();
    state.items.forEach((it) => { if (printing.includes(it.id)) it.printedAt = now; });
    save(); render();
  });

  // ---------- 시세판 그림(단톡방·당근에 올리기) ----------
  function boardImage() {
    const list = state.items;
    const shop = ($('#shopName').value || '').trim();
    const W = 1080, rowH = 150, top = shop ? 300 : 250;
    const H = Math.max(720, top + list.length * rowH + 110);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#FFE07A'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#221D17'; g.textBaseline = 'alphabetic';
    let y0 = 120;
    if (shop) { g.font = '700 44px "IBM Plex Sans KR"'; g.fillText(shop, 72, 110); y0 = 196; }
    g.font = '92px "Black Han Sans"';
    g.fillText('오늘 시세', 72, y0);
    const d = new Date();
    g.font = '600 34px "IBM Plex Sans KR"'; g.textAlign = 'right';
    g.fillText((d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + '일월화수목금토'[d.getDay()] + '요일', W - 72, y0);
    g.textAlign = 'left';
    g.fillRect(72, top - 26, W - 144, 6);
    list.forEach((it, i) => {
      const y = top + i * rowH;
      g.fillStyle = '#221D17'; g.font = '64px "Black Han Sans"';
      g.fillText(it.item, 72, y + 70);
      g.textAlign = 'right'; g.fillStyle = '#C92A1C'; g.font = '68px "Black Han Sans"';
      g.fillText(P.won(it.price) + '원', W - 72, y + 70);
      g.textAlign = 'left';
      const q = qtyText(it.qty, it.unit, it.per);
      const ex = (it.extra || []).map((x) => qtyText(x.qty, x.unit || it.unit, x.per) + ' ' + P.won(x.price) + '원');
      const line = [q ? q + ' 기준' : '', ...ex].filter(Boolean).join(', ');
      g.font = '600 32px "IBM Plex Sans KR"'; g.fillStyle = '#3A322A';
      if (line) g.fillText(line, 72, y + 116);
      if (it.origin) { g.textAlign = 'right'; g.fillStyle = '#2F6B3A'; g.fillText('원산지 ' + it.origin, W - 72, y + 116); g.textAlign = 'left'; }
      g.fillStyle = 'rgba(34,29,23,.22)'; g.fillRect(72, y + rowH - 6, W - 144, 2);
    });
    g.fillStyle = '#6B6259'; g.font = '500 24px "IBM Plex Sans KR"'; g.textAlign = 'right';
    g.fillText('말하면 가격표', W - 72, H - 44);
    g.textAlign = 'left';
    return c;
  }
  $('#shareImg').addEventListener('click', async () => {
    if (!state.items.length) return;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const c = boardImage();
    const noOrig = state.items.filter((x) => !x.origin).length;
    say('<li>시세판 그림을 만들었어요.' + (noOrig ? ' <span class="miss">원산지를 말하지 않은 ' + noOrig + '개는 원산지 없이 나가요.</span>' : '') + '</li>');
    c.toBlob(async (blob) => {
      const name = '오늘시세_' + new Date().toISOString().slice(0, 10) + '.png';
      const file = new File([blob], name, { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '오늘 시세' }); return; }
      } catch (e) { /* 공유 취소 */ }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  $('#shopName').addEventListener('input', (e) => store.set(SHOPKEY, e.target.value));

  // ---------- 시작 ----------
  const d = new Date();
  $('#today').textContent = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + '일월화수목금토'[d.getDay()] + '요일';
  load(); initSpeech();
  $('#shopName').value = store.get(SHOPKEY) || '';
  render();
  window.addEventListener('resize', fitAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
  window.__mg = { apply, state, buildPrint, boardImage, ready: () => !!state.model };
})();
