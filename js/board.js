// レーン盤面（5つの場所 × 横の矢印）を描く共通部品。早見表とパターンの両方で使う。

const COMMAND_BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));
const laneIndex = (l) => LANES.indexOf(l);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 列の中心(px)。5列・列の間隔 8px
const colX = (w, k) => { const cw = (w - 32) / 5; return k * (cw + 8) + cw / 2; };

function layoutBoard(board) {
  const w = board.clientWidth;
  if (!w) return;
  board.querySelectorAll('[data-x1]').forEach((s) => {
    const a = colX(w, +s.dataset.x1), b = colX(w, +s.dataset.x2);
    s.style.left = a + 'px';
    s.style.width = (b - a) + 'px';
  });
  // ラベルは盤面からはみ出さない位置に寄せる
  board.querySelectorAll('[data-cx]').forEach((p) => {
    const pw = p.offsetWidth;
    const c = Math.max(pw / 2 + 4, Math.min(w - pw / 2 - 4, colX(w, +p.dataset.cx)));
    p.style.left = c + 'px';
  });
  // 矢印の下に1行の説明を出す行は、その高さ（折り返しを含む）に合わせる
  board.querySelectorAll('.row.has-sum').forEach((r) => {
    const a = r.querySelector('.sum');
    r.style.height = (a.offsetTop + a.offsetHeight + 8) + 'px';
  });
}
function watchLayout(board, after) {
  const run = () => { layoutBoard(board); if (after) after(); };
  new ResizeObserver(run).observe(board);
  document.fonts.ready.then(run);
  run();
}

function drawLanes(board, heads) {
  const bg = el('div', 'lane-bg');
  LANES.forEach((l) => { const d = el('div', 'lb'); d.dataset.lane = l; bg.appendChild(d); });
  board.appendChild(bg);
  const hs = el('div', 'heads');
  LANES.forEach((l) => {
    const h = el('div', 'head', `<b>${LANE_NAME[l]}</b><small>${LANE_SUB[l]}</small>`);
    h.dataset.lane = l;
    const conf = heads[l];
    if (conf && conf.chips) {
      const box = el('div', 'chips');
      conf.chips.forEach(([id, name, cls, who]) => {
        const s = el('span', 'chip ' + cls, esc(name) + (who ? `<span class="who">${who}</span>` : ''));
        s.dataset.id = id;
        box.appendChild(s);
      });
      h.appendChild(box);
    }
    if (conf && conf.note) h.appendChild(el('div', 'headnote', conf.note));
    hs.appendChild(h);
  });
  board.appendChild(hs);
}

// v: segs(矢印) / look(見るだけ) / mark(その場所の中で起きる) / event(git 以外の操作) / pill(ラベル位置の上書き) / sum(矢印の下の1行)
function buildRow(v) {
  const r = el('div', 'row');
  r.tabIndex = 0;
  r.setAttribute('role', 'button');
  r.dataset.cmd = v.cmd;
  r.setAttribute('aria-label', v.cmd + (v.sum ? `（${v.sum}）` : ''));
  const idx = [];
  (v.segs || []).forEach(([a, b]) => {
    const i = laneIndex(a), j = laneIndex(b);
    const s = el('div', 'seg ' + (j > i ? 'r' : 'l'));
    s.dataset.x1 = Math.min(i, j);
    s.dataset.x2 = Math.max(i, j);
    r.appendChild(s);
    idx.push(i, j);
  });
  // 2段の矢印は、経由する場所に点を打つ
  (v.segs || []).slice(1).forEach(([a]) => { const d = el('div', 'dot'); d.dataset.cx = laneIndex(a); r.appendChild(d); });
  if (v.look) {
    const i = laneIndex(v.look[0]), j = laneIndex(v.look[v.look.length - 1]);
    if (i === j) { const d = el('div', 'dot'); d.dataset.cx = i; r.appendChild(d); }
    else { const s = el('div', 'seg look'); s.dataset.x1 = Math.min(i, j); s.dataset.x2 = Math.max(i, j); r.appendChild(s); }
    idx.push(i, j);
  }
  const markLane = v.event || v.mark;
  if (markLane) { const d = el('div', 'dot mark'); d.dataset.cx = laneIndex(markLane); r.appendChild(d); idx.push(laneIndex(markLane)); }
  const center = v.pill != null ? v.pill : (Math.min(...idx) + Math.max(...idx)) / 2;
  const p = el('span', 'pill' + (v.event ? ' event' : ''), esc(v.cmd));
  p.dataset.cx = center;
  r.appendChild(p);
  // 何をするかの1行（同じ結果になる別の書き方は、クリックで開く説明にだけ書く）
  if (v.sum) {
    r.classList.add('has-sum');
    const a = el('div', 'sum', esc(v.sum));
    a.dataset.cx = center;
    r.appendChild(a);
  }
  return r;
}

function visualLanes(v) {
  if (v.on) return v.on;
  const set = new Set();
  (v.segs || []).forEach(([a, b]) => { set.add(a); set.add(b); });
  if (v.look) LANES.slice(laneIndex(v.look[0]), laneIndex(v.look[v.look.length - 1]) + 1).forEach((l) => set.add(l));
  if (v.mark) set.add(v.mark);
  if (v.event) set.add(v.event);
  return [...set];
}

function routeHTML(v) {
  const sp = (l) => `<span data-lane="${l}">${LANE_NAME[l]}</span>`;
  if (v.look) return `<em>見るだけ：</em>${visualLanes(v).map(sp).join('<em>・</em>')}`;
  if (!v.segs) return `${sp(v.mark)}<em>の中だけ（ファイルは動かない）</em>`;
  const route = v.route || [v.segs[0][0], ...v.segs.map((s) => s[1])];
  return route.map((x) => (Array.isArray(x) ? x.map(sp).join('<em>＋</em>') : sp(x))).join('<em>→</em>');
}

function setActive(board, v) {
  board.classList.toggle('has-active', !!v);
  const lanes = v ? visualLanes(v) : [];
  if (v) {
    board.style.setProperty('--c-act', `var(--${v.color})`);
    board.style.setProperty('--tc-act', `var(--t-${v.color})`);
  }
  board.querySelectorAll('.lb').forEach((b) => b.classList.toggle('on', lanes.includes(b.dataset.lane)));
  board.querySelectorAll('.chip').forEach((ch) => {
    ch.classList.toggle('hit', !!v && (v.chips || []).includes(ch.dataset.id));
    ch.classList.toggle('still', !!v && (v.still || []).includes(ch.dataset.id));
  });
  if (board.stickyBar) {
    board.stickyBar.classList.toggle('has-active', !!v);
    board.stickyBar.querySelectorAll('.ls-cell').forEach((c) => c.classList.toggle('on', lanes.includes(c.dataset.lane)));
  }
}

// スクロールしても5つの場所の名前を画面の上に出しておく。
// 盤面は横スクロールの枠（.scroller）の中にあり CSS の sticky が効かないので、画面上部に固定した行を横位置も合わせて出す
const stickyUpdaters = [];
function attachStickyLanes(board) {
  const scroller = board.parentElement;
  const bar = el('div', 'lane-sticky');
  bar.hidden = true;
  bar.setAttribute('aria-hidden', 'true'); // 同じ名前が盤面の見出しにもあるので、読み上げは見出しだけにする
  const inner = el('div', 'lane-sticky-inner');
  LANES.forEach((l) => { const c = el('div', 'ls-cell', `<b>${LANE_NAME[l]}</b>`); c.dataset.lane = l; inner.appendChild(c); });
  bar.appendChild(inner);
  scroller.before(bar);
  board.stickyBar = bar;
  function update() {
    const heads = board.querySelector('.heads');
    // 見出しが画面の上に消え、盤面はまだ見えているときだけ出す（タブが隠れているときは出さない）
    const show = !!heads && board.offsetParent !== null
      && heads.getBoundingClientRect().top < 0 && board.getBoundingClientRect().bottom > 80;
    bar.hidden = !show;
    if (!show) return;
    const s = scroller.getBoundingClientRect();
    bar.style.left = s.left + 'px';
    bar.style.width = scroller.clientWidth + 'px';
    inner.style.width = board.offsetWidth + 'px';
    inner.style.transform = `translateX(${-scroller.scrollLeft}px)`;
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  scroller.addEventListener('scroll', update, { passive: true });
  stickyUpdaters.push(update);
  update();
}
const updateStickyLanes = () => stickyUpdaters.forEach((fn) => fn());
