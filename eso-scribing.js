'use strict';
(() => {
  const slots = ['focus', 'signature', 'affix'];
  const labels = {focus: '主効果', signature: '追加効果', affix: 'バフ・デバフ等'};
  const descriptions = {focus: '技の中心となるダメージ・回復など。', signature: '技に付け足す特徴的な効果。', affix: '補助的なバフ・デバフなど。'};
  const array = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value : '';
  const name = item => text(item?.nameJa) || text(item?.name);
  const optionName = item => item?.nameJa ? `${text(item.nameJa)} / ${text(item.name)}` : text(item?.name);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const options = (g, slot) => array(g?.[slot]);
  const activeOptions = g => slots.flatMap(slot => options(g, slot)).filter(option => option.status !== 'unavailable');
  const tags = g => [...new Set(activeOptions(g).flatMap(option => array(option.tags).filter(tag => typeof tag === 'string')))];
  function safeURL(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(u.hostname) || /(^|\.)(localhost|local|internal|test|invalid|example|onion)(\.|$)/i.test(u.hostname)) return null;
      return u.href;
    } catch { return null; }
  }
  function safeIcon(value) {
    return typeof value === 'string' && /^assets\/eso\/scribing\/[a-z0-9-]+\.webp$/.test(value) ? value : null;
  }
  function iconMarkup(g) {
    const path = safeIcon(g.icon);
    return path && text(g.iconAlt).trim() ? `<span class="scribing-icon-wrap"><img class="scribing-icon" src="${escape(path)}" alt="${escape(g.iconAlt)}" width="56" height="56" loading="lazy"><span class="scribing-icon-fallback" hidden>画像未掲載</span></span>` : '<span class="scribing-icon-fallback">画像未掲載</span>';
  }
  function filterGrimoires(grimoires, query = '', line = '', effect = '') {
    const q = query.trim().toLocaleLowerCase('ja');
    return grimoires.filter(g => (!line || g.line === line) && (!effect || tags(g).includes(effect)) && (!q || [g.name, g.nameJa, g.line, g.weapon, g.summary, ...slots.flatMap(slot => options(g, slot).flatMap(o => [o.name, o.nameJa, o.effect, ...array(o.tags)]))].join(' ').toLocaleLowerCase('ja').includes(q)));
  }
  function selectedOptions(g, selection) {
    return slots.map(slot => options(g, slot).find(o => o.id === selection[slot]));
  }
  function combination(g, selection) {
    const selected = selectedOptions(g, selection);
    if (selected.some(o => !o)) return {status:'incomplete', selected};
    if (selected.some(o => o.status === 'unavailable')) return {status:'unavailable', selected};
    const match = array(g.verifiedCombinations).find(c => slots.every(slot => c[slot] === selection[slot]));
    // A general list of options is not evidence that every Cartesian combination works.
    if (selected.some(o => o.status !== 'confirmed') || !match) return {status:'unknown', selected};
    return {status:'confirmed', selected, match};
  }
  function validate(data) {
    if (!data || !Array.isArray(data.grimoires) || !Array.isArray(data.sources)) throw new Error('Invalid data');
    const sourceIds = new Set();
    for (const source of data.sources) {
      if (!source || typeof source.id !== 'string' || !source.id || sourceIds.has(source.id) || !safeURL(source.url)) throw new Error('Invalid source');
      sourceIds.add(source.id);
    }
    const sourced = item => Array.isArray(item.sourceIds) && item.sourceIds.length > 0 && item.sourceIds.every(id => sourceIds.has(id));
    const ids = new Set();
    for (const g of data.grimoires) {
      if (!g || typeof g.id !== 'string' || !/^[a-z0-9-]+$/.test(g.id) || ids.has(g.id) || !text(g.name)) throw new Error('Invalid grimoire');
      ids.add(g.id);
      for (const slot of slots) {
        if (!Array.isArray(g[slot])) throw new Error('Invalid options');
        const optionIds = new Set();
        for (const o of g[slot]) {
          if (!o || typeof o.id !== 'string' || !/^[a-z0-9-]+$/.test(o.id) || optionIds.has(o.id) || !text(o.name) || !['confirmed','unknown','unavailable'].includes(o.status)) throw new Error('Invalid option');
          if (o.status !== 'unknown' && !sourced(o)) throw new Error('Missing option source');
          optionIds.add(o.id);
        }
      }
      for (const c of array(g.verifiedCombinations)) if (!sourced(c) || !slots.every(slot => options(g, slot).some(o => o.id === c[slot] && o.status === 'confirmed'))) throw new Error('Invalid combination');
    }
    return data;
  }
  const api = {slots, escape, safeURL, tags, filterGrimoires, selectedOptions, combination, validate, safeIcon, iconMarkup};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  let data, current = null, selection = {}, ready = false, listY = 0, lastId = '';
  function sourceLinks(ids) {
    return [...new Set(array(ids))].map(id => data.sources.find(s => s.id === id)).filter(Boolean).map(s => {
      const url = safeURL(s.url);
      return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(s.label || s.id)} ↗</a>` : escape(s.label || s.id);
    }).join(' · ');
  }
  function renderList() {
    const filtered = filterGrimoires(data.grimoires, $('scribing-search').value, $('scribing-line').value, $('scribing-effect').value);
    $('scribing-count').textContent = `${filtered.length} / ${data.grimoires.length} グリモア`;
    $('scribing-list').innerHTML = filtered.map(g => `<article class="scribing-card">${iconMarkup(g)}<p class="scribing-meta">${escape(g.line)}${g.weapon ? ` · ${escape(g.weapon)}` : ''}</p><h2><a href="#grimoire/${encodeURIComponent(g.id)}">${escape(name(g))}</a></h2>${g.nameJa ? `<p class="scribing-meta">${escape(g.name)}</p>` : ''}<p>${escape(g.summary)}</p><div class="scribing-tags">${tags(g).map(t => `<span class="scribing-tag">${escape(t)}</span>`).join('')}</div></article>`).join('') || '<p class="empty">条件に合うグリモアがありません。検索条件を変更してください。</p>';
  }
  function renderResult() {
    const result = combination(current, selection);
    const states = {incomplete:'3種類を選んでください', unavailable:'この候補は組み合わせ不可', unknown:'選択内容の整理・組み合わせ未確認', confirmed:'資料で確認した組み合わせ'};
    let content = `<h2>選択した効果</h2><span class="scribing-state">${states[result.status]}</span>`;
    content += result.status === 'confirmed' ? `<p>${escape(result.match.verificationNote || '出典でこの組み合わせが示されています。現行Live版の実測値を保証するものではありません。')}</p>` : '<p class="scribing-muted">個々の候補の説明を並べたものです。同時使用の可否・相互作用・最終数値は、組み合わせ単位の根拠がない限り未確認です。</p>';
    if (result.match?.effect) content += `<p>${escape(result.match.effect)}</p>`;
    content += `<dl>${slots.map((slot,i) => `<dt>${labels[slot]}</dt><dd>${result.selected[i] ? `<strong>${escape(optionName(result.selected[i]))}</strong><p>${escape(result.selected[i].effect || '効果の説明は未確認です。')}</p>${result.selected[i].status === 'unknown' ? `<p class="scribing-muted">${escape(result.selected[i].reason || 'この候補の対応条件は未確認です。')}</p>` : ''}<p class="scribing-sources">${sourceLinks(result.selected[i].sourceIds)}</p>` : '未選択'}</dd>`).join('')}</dl>`;
    content += '<p class="scribing-muted">数値は出典に条件がある場合のみ記載します。能力値・対象・装備に応じたダメージや回復量を自動計算する機能ではありません。</p>';
    if (result.match) content += `<p class="scribing-sources">組み合わせの根拠：${sourceLinks(result.match.sourceIds)}</p>`;
    $('scribing-result').innerHTML = content;
  }
  function renderDetail() {
    const g = current;
    $('scribing-detail').innerHTML = `<a class="scribing-back" href="#">← 一覧に戻る</a>${iconMarkup(g)}<p class="scribing-meta">${escape(g.line)}${g.weapon ? ` · ${escape(g.weapon)}` : ''}</p><h1>${escape(name(g))}</h1>${g.nameJa ? `<p class="scribing-muted">${escape(g.name)}</p>` : ''}<p class="lead">${escape(g.summary)}</p><p class="scribing-note">まず主効果、次に追加効果とバフ・デバフを選びます。「未確認」は「不可」と異なります。資料が不足する候補も確認用に選べますが、有効な組み合わせとは表示しません。</p><div class="scribing-choices">${slots.map((slot,i) => `<section class="scribing-choice"><h2>${i+1}. ${labels[slot]}</h2><p class="scribing-muted">${descriptions[slot]}</p><label for="select-${slot}" class="scribing-muted">${labels[slot]}を選択</label><select id="select-${slot}" data-slot="${slot}"><option value="">未選択</option>${options(g,slot).map(o => `<option value="${escape(o.id)}"${o.status === 'unavailable' ? ' disabled' : ''}>${escape(optionName(o))}${o.status === 'unknown' ? '（未確認）' : o.status === 'unavailable' ? '（不可）' : ''}</option>`).join('')}</select>${options(g,slot).filter(o=>o.status === 'unavailable').map(o=>`<p class="scribing-muted">${escape(optionName(o))}：${escape(o.reason || '参照資料では対応しない候補です。')}</p>`).join('')}${options(g,slot).length ? '' : '<p class="scribing-muted">この区分の選択候補は未収録です。</p>'}</section>`).join('')}</div><div id="scribing-result" class="scribing-result" aria-live="polite"></div><details class="scribing-provenance"><summary>入手方法・出典・注意点</summary><p>${escape(g.acquisition || '入手方法は未確認です。')}</p><p class="scribing-muted">${escape(g.iconNote || '')}</p>${g.iconSourceIds ? `<p class="scribing-sources">アイコン：${sourceLinks(g.iconSourceIds)}</p>` : ''}${array(g.notes).map(n=>`<p>${escape(n)}</p>`).join('')}<p class="scribing-sources">${sourceLinks(g.sourceIds)}</p></details>${array(g.historicalExamples).length ? `<details class="scribing-provenance"><summary>旧資料の構成例（現行の動作は未確認）</summary><p class="scribing-muted">過去の資料に掲載された例です。有効な組み合わせとして認定せず、候補を比較するための参考に限ります。</p>${array(g.historicalExamples).map(example=>`<section><h2>${escape(example.summary || '資料掲載例')}</h2><p>${slots.map(slot=>`${labels[slot]}：${escape(optionName(options(g,slot).find(o=>o.id===example[slot])) || example[slot])}`).join(' / ')}</p><p>${escape(example.verificationNote)}</p><p class="scribing-sources">${sourceLinks(example.sourceIds)}</p></section>`).join('')}</details>` : ''}<a class="scribing-back" href="#">← 一覧に戻る</a>`;
    renderResult();
  }
  function route() {
    if (!ready) return;
    const match = location.hash.match(/^#grimoire\/(.*)$/), wasDetail = !$('scribing-detail').hidden;
    if (!match) {
      $('scribing-home').hidden = false; $('scribing-detail').hidden = true; document.title = '書記 | ESOデータベース';
      if (wasDetail) {
        const link = [...document.querySelectorAll('#scribing-list h2 a')].find(a=>a.getAttribute('href') === '#grimoire/'+lastId);
        (link || $('main')).focus({preventScroll:true}); window.scrollTo(0,listY);
      }
      return;
    }
    if (!wasDetail) { listY=window.scrollY; lastId=match[1]; }
    let id; try { id=decodeURIComponent(match[1]); } catch {}
    const g = data.grimoires.find(g=>g.id === id);
    $('scribing-home').hidden = true; $('scribing-detail').hidden = false;
    if (!g) { current=null; selection={}; $('scribing-detail').innerHTML='<a class="scribing-back" href="#">← 一覧に戻る</a><h1>グリモアが見つかりません</h1>'; document.title='グリモアが見つかりません | ESOデータベース'; }
    else { current=g; selection={}; renderDetail(); document.title=name(g)+' | 書記'; }
    window.scrollTo(0,0); $('scribing-detail').focus({preventScroll:true});
  }
  document.addEventListener('error', event => {
    const image = event.target;
    if (!image || !image.classList?.contains('scribing-icon')) return;
    image.hidden = true;
    const fallback = image.nextElementSibling;
    if (fallback?.classList.contains('scribing-icon-fallback')) fallback.hidden = false;
  }, true);
  $('scribing-detail').addEventListener('change', event => {
    const slot=event.target.dataset?.slot;
    if (!current || !slots.includes(slot)) return;
    const o=options(current,slot).find(o=>o.id === event.target.value && o.status !== 'unavailable');
    selection[slot]=o?.id || ''; renderResult();
  });
  ['scribing-search','scribing-line','scribing-effect'].forEach(id=>$(id).addEventListener(id === 'scribing-search' ? 'input' : 'change',renderList));
  $('scribing-reset').addEventListener('click',()=>{ ['scribing-search','scribing-line','scribing-effect'].forEach(id=>$(id).value='');renderList(); });
  window.addEventListener('hashchange',route);
  async function load() {
    $('scribing-notice').textContent='データを読み込み中…'; $('scribing-retry').hidden=true;
    try {
      const response=await fetch('./data/eso-scribing.json?v=20261028-scribing-icons1',{credentials:'omit'});
      if (!response.ok) throw new Error('Unavailable'); data=validate(await response.json());
      $('scribing-coverage').innerHTML=`<p><strong>${escape(data.coverage || '参照資料で確認できた範囲を収録しています。')}</strong></p><p>資料確認日：${escape(data.checkedAt || '未確認')}</p>${array(data.notes).map(n=>`<p>${escape(n)}</p>`).join('')}`;
      $('scribing-line').innerHTML='<option value="">すべて</option>'+[...new Set(data.grimoires.map(g=>g.line).filter(Boolean))].map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');
      $('scribing-effect').innerHTML='<option value="">すべて</option>'+[...new Set(data.grimoires.flatMap(tags))].sort((a,b)=>a.localeCompare(b,'ja')).map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');
      $('scribing-sources').innerHTML=data.sources.map(s=>`<p>${sourceLinks([s.id])}${s.notes ? `<br>${escape(s.notes)}` : ''}</p>`).join('');
      ['scribing-search','scribing-line','scribing-effect','scribing-reset'].forEach(id=>$(id).disabled=false);
      $('scribing-notice').textContent='';ready=true;renderList();route();
    } catch { $('scribing-notice').textContent='データを読み込めませんでした。接続を確認して再試行してください。';$('scribing-retry').hidden=false; }
  }
  $('scribing-retry').addEventListener('click',load);load();
})();

