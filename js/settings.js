// 画面上部の「前提」カードで、本流・起点・ブランチ名を決める。
// 決めた値はこのブラウザにだけ保存する（ほかの人の表示には影響しない）。

const SETTINGS_KEY = 'git-visualizer:names:v1';
let SETTINGS = { ...NAME_DEFAULTS };
let NAMES = resolveNames(SETTINGS);
const nameListeners = [];
const onNamesChange = (fn) => nameListeners.push(fn);
const storageErrorText = (e) => `このブラウザでは設定を保存できません（${e.name}）。ページを閉じると初期値に戻ります。`;

// 保存済みの設定を読む。読めなかった・使えない値だったときは、その理由を返す
function loadSettings() {
  let raw;
  try { raw = localStorage.getItem(SETTINGS_KEY); } catch (e) { return storageErrorText(e); }
  if (!raw) return '';
  let saved;
  try { saved = JSON.parse(raw); } catch (e) { return '保存されていた設定が読めなかったため、初期値で表示しています。'; }
  const s = { ...NAME_DEFAULTS, ...saved };
  if (!validateSettings(s).ok) return '保存されていた設定に使えない名前があったため、初期値で表示しています。';
  SETTINGS = s;
  NAMES = resolveNames(s);
  return '';
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); return ''; } catch (e) { return storageErrorText(e); }
}

function initSettings() {
  const storeProblem = loadSettings();
  const form = document.getElementById('settings-form');
  form.innerHTML = `
    <span class="l" id="l-base">本流ブランチ</span>
    <div class="segctl" role="group" aria-labelledby="l-base">
      <button type="button" id="s-base-master" data-v="master">master</button><button type="button" id="s-base-main" data-v="main">main</button>
    </div>
    <span class="l" id="l-start">起点ブランチ</span>
    <div class="radio" role="radiogroup" aria-labelledby="l-start">
      <label><input type="radio" name="s-start" id="s-start-same" value="same"> <span id="s-start-same-label"></span></label>
      <label><input type="radio" name="s-start" id="s-start-other" value="other"> 別のブランチ</label>
      <input type="text" id="s-start-name" aria-label="起点ブランチの名前" spellcheck="false" autocomplete="off">
    </div>
    <div class="msg" id="m-start" aria-live="polite"></div>
    <label class="l" for="s-mine">あなたのブランチ</label>
    <div class="frow">
      <input type="text" id="s-mine" spellcheck="false" autocomplete="off">
      <span class="prefixes"><button type="button" class="chipbtn" data-prefix="feature/">feature/</button><button type="button" class="chipbtn" data-prefix="fix/">fix/</button><button type="button" class="chipbtn" data-prefix="refactor/">refactor/</button></span>
    </div>
    <div class="msg" id="m-mine" aria-live="polite"></div>
    <label class="l" for="s-mate">ほかの人のブランチ</label>
    <input type="text" id="s-mate" spellcheck="false" autocomplete="off">
    <div class="msg" id="m-mate" aria-live="polite"></div>
    <span class="l"></span>
    <div class="frow"><button type="button" class="btn" id="s-reset">初期値に戻す</button><span class="msg" id="m-store" aria-live="polite"></span></div>`;

  const $ = (id) => document.getElementById(id);
  const baseBtns = [$('s-base-master'), $('s-base-main')];

  function fillForm(s) {
    baseBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.base)));
    $('s-start-same').checked = s.startMode === 'same';
    $('s-start-other').checked = s.startMode === 'other';
    $('s-start-name').value = s.startOther;
    $('s-mine').value = s.mine;
    $('s-mate').value = s.mate;
  }
  function readForm() {
    return {
      base: baseBtns.find((b) => b.getAttribute('aria-pressed') === 'true').dataset.v,
      startMode: $('s-start-other').checked ? 'other' : 'same',
      startOther: $('s-start-name').value,
      mine: $('s-mine').value,
      mate: $('s-mate').value,
    };
  }
  function showMsg(id, inputId, err, warn) {
    const m = $(id);
    m.className = 'msg' + (err ? ' err' : warn ? ' note' : '');
    m.textContent = err ? `反映していません：${err}` : (warn || '');
    $(inputId).setAttribute('aria-invalid', String(!!err));
  }
  function setStoreMsg(text) { const m = $('m-store'); m.className = 'msg' + (text ? ' err' : ''); m.textContent = text; }

  // 入力のたびに全体を確かめ、使える組み合わせのときだけ反映する
  function onFormChange() {
    const d = readForm();
    $('s-start-same-label').textContent = `本流と同じ（${d.base}）`;
    $('s-start-name').disabled = d.startMode !== 'other';
    const { errors, warnings, ok } = validateSettings(d);
    showMsg('m-start', 's-start-name', errors.start, warnings.start);
    showMsg('m-mine', 's-mine', errors.mine, warnings.mine);
    showMsg('m-mate', 's-mate', errors.mate, warnings.mate);
    if (!ok) return;
    SETTINGS = d;
    NAMES = resolveNames(d);
    setStoreMsg(saveSettings());
    nameListeners.forEach((fn) => fn(NAMES));
  }

  baseBtns.forEach((b) => b.addEventListener('click', () => {
    baseBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onFormChange();
  }));
  ['s-start-same', 's-start-other'].forEach((id) => $(id).addEventListener('change', onFormChange));
  ['s-start-name', 's-mine', 's-mate'].forEach((id) => $(id).addEventListener('input', onFormChange));
  form.querySelectorAll('[data-prefix]').forEach((c) => c.addEventListener('click', () => {
    const input = $('s-mine');
    input.value = c.dataset.prefix + input.value.replace(/^[^/]*\//, '');
    onFormChange();
  }));
  $('s-reset').addEventListener('click', () => { fillForm(NAME_DEFAULTS); onFormChange(); });

  fillForm(SETTINGS);
  $('s-start-same-label').textContent = `本流と同じ（${SETTINGS.base}）`;
  $('s-start-name').disabled = SETTINGS.startMode !== 'other';
  setStoreMsg(storeProblem);
}
