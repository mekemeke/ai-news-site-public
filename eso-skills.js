'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const types = {active:'アクティブ', ultimate:'アルティメット', passive:'パッシブ'};
  const effectGroups = [
    ['メジャーバフ', 'バフ（強）：'], ['マイナーバフ', 'バフ（弱）：'],
    ['メジャーデバフ', 'デバフ（強）：'], ['マイナーデバフ', 'デバフ（弱）：']
  ];
  const combatEffects = ['軽攻撃', '重攻撃', 'ペット'];
  const openEffectGroups = new Set();
  let effectTags = new Set();
  const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
  const text = value => typeof value === 'string' ? value : '';
  const title = item => item.nameJa || item.nameEn;
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja');
  let data, ready = false, loading = false;
  let classes = new Map(), trees = new Map(), skills = new Map();
  let state = {classId:'', treeId:'', q:'', type:'', form:'', effect:''};

  function safeURL(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return '';
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password || url.port || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa)(\.|$)/.test(host)) return '';
      return url.href;
    } catch { return ''; }
  }
  function sourceLink(source) {
    const label = text(source?.label) || text(source?.title) || '参照資料';
    const url = safeURL(source?.url);
    return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} ↗</a>` : escapeHTML(label);
  }
  function validate(value) {
    if (!value || value.schemaVersion !== 1 || !value.meta || !Array.isArray(value.classes) || !value.classes.length || !Array.isArray(value.skills)) throw new Error('Invalid database');
    const cm = new Map(), tm = new Map(), sm = new Map();
    const named = item => item && validId(item.id) && typeof item.nameEn === 'string' && item.nameEn.trim() && (item.nameJa == null || typeof item.nameJa === 'string');
    for (const item of value.classes) {
      if (!named(item) || cm.has(item.id) || !Array.isArray(item.trees) || !item.trees.length) throw new Error('Invalid class');
      cm.set(item.id, item);
      for (const tree of item.trees) {
        const key = `${item.id}/${tree.id}`;
        if (!named(tree) || tm.has(key) || (tree.category != null && tree.category !== 'class-mastery')) throw new Error('Invalid tree');
        tm.set(key, tree);
      }
    }
    for (const item of value.skills) {
      if (!named(item) || sm.has(item.id) || !cm.has(item.classId) || !tm.has(`${item.classId}/${item.treeId}`) || !Object.hasOwn(types, item.type) || (item.baseSkillId != null && !validId(item.baseSkillId))) throw new Error('Invalid skill');
      for (const key of ['descriptionJa','descriptionEn','sourceUrl','verifiedAt','verificationStatus','verificationNote','sourceNoteJa','conflictSourceUrl','sourceDataDate','gameUpdate','costNote','valueBasisJa','target','nameJaSourceUrl','nameJaSourceDate','nameJaVerificationStatus','nameJaVerificationNote']) if (item[key] != null && typeof item[key] !== 'string') throw new Error('Invalid skill text');
      if (item.browseTags != null && (!Array.isArray(item.browseTags) || !item.browseTags.every(tag => typeof tag === 'string' && tag.trim()) || new Set(item.browseTags).size !== item.browseTags.length)) throw new Error('Invalid skill effect tags');
      sm.set(item.id, item);
    }
    for (const item of sm.values()) {
      if (!item.baseSkillId) continue;
      const base = sm.get(item.baseSkillId);
      if (!base || base.baseSkillId || base.id === item.id || base.classId !== item.classId || base.treeId !== item.treeId || base.type !== item.type || item.type === 'passive') throw new Error('Invalid morph relationship');
    }
    return {classes:cm, trees:tm, skills:sm};
  }
  function readState(params) {
    const classId = classes.has(params.get('class')) ? params.get('class') : '';
    const treeId = classId && trees.has(`${classId}/${params.get('tree')}`) ? params.get('tree') : '';
    return {classId, treeId, q:params.get('q') || '', type:Object.hasOwn(types, params.get('type')) ? params.get('type') : '', form:['base','morph'].includes(params.get('form')) ? params.get('form') : '', effect:effectTags.has(params.get('effect')) ? params.get('effect') : ''};
  }
  function paramsFor(next = state) {
    const params = new URLSearchParams();
    if (next.classId) params.set('class', next.classId);
    if (next.treeId) params.set('tree', next.treeId);
    if (next.q) params.set('q', next.q);
    if (next.type) params.set('type', next.type);
    if (next.form) params.set('form', next.form);
    if (next.effect) params.set('effect', next.effect);
    return params.toString();
  }
  function listURL(next = state) { const query = paramsFor(next); return query ? `#?${query}` : '#'; }
  function detailURL(item) { const query = paramsFor(); return `#skill/${encodeURIComponent(item.id)}${query ? '?' + query : ''}`; }
  function formLabel(item) { return item.baseSkillId ? '変異' : item.type === 'passive' ? 'パッシブ' : '基本'; }
  function icon(item) {
    const value = item.icon;
    if (!value || !/^assets\/eso\/skills\/[a-z0-9][a-z0-9_-]*\.(?:png|jpe?g|webp)$/i.test(value.path || '') || !safeURL(value.sourceUrl) || !text(value.permissionNote).trim()) return '<span class="eso-skill-icon-pending">画像\n未掲載</span>';
    return `<img class="eso-skill-icon" src="./${escapeHTML(value.path)}" alt="${escapeHTML(title(item))}のスキルアイコン" width="48" height="48" loading="lazy">`;
  }
  document.addEventListener('error', event => {
    if (!(event.target instanceof HTMLImageElement) || !event.target.classList.contains('eso-skill-icon')) return;
    const fallback = document.createElement('span');
    fallback.className = 'eso-skill-icon-pending';
    fallback.textContent = '画像\n読込不可';
    event.target.replaceWith(fallback);
  }, true);
  function verification(item) {
    const labels = {'source-checked':'資料照合済み・ゲーム内では未検証', 'source-checked-update-unverified':'資料照合済み・現行アップデートとの一致は未確認', 'source-checked-older-snapshot':'過去版の資料を参照・現行仕様との一致は未確認', 'source-conflict-update-unverified':'出典に不一致・現行版未照合', 'name-only':'名称のみ確認・効果や数値は未確認'};
    const notes = [...new Set([item.verificationNote,item.sourceNoteJa].filter(Boolean))];
    return `<p class="eso-skill-verification">資料確認：${escapeHTML(item.verifiedAt || '未確認')} · 対応版：${escapeHTML(item.gameUpdate || '未確認')}</p>${item.verificationStatus ? `<p class="eso-skill-verification">${escapeHTML(labels[item.verificationStatus] || item.verificationStatus)}</p>` : ''}${notes.map(note => `<p class="eso-skill-verification"><strong>${escapeHTML(note)}</strong></p>`).join('')}`;
  }
  function numericFacts(item) {
    const facts = Array.isArray(item.mechanics) ? item.mechanics.filter(fact => fact && typeof fact.label === 'string' && typeof fact.value === 'string') : [];
    const resources = {Magicka:'マジカ',Stamina:'スタミナ',Ultimate:'アルティマ',Health:'体力'};
    const validCost = cost => cost && Number.isFinite(cost.value) && cost.value >= 0 && Object.hasOwn(resources,cost.resource);
    const formatCost = cost => `${cost.value} ${resources[cost.resource]}`;
    if (Array.isArray(item.costComponents) && item.costComponents.length) {
      // A dual-resource cost must never silently become a one-resource cost.
      if (item.costComponents.every(validCost)) facts.push({label:'コスト（参照値）',value:item.costComponents.map(formatCost).join(' ＋ ')});
    } else if (validCost(item.cost)) facts.push({label:'コスト（参照値）',value:formatCost(item.cost)});
    for (const [key,label,unit] of [['castTimeSeconds','詠唱時間','秒'],['channelTimeSeconds','チャネリング','秒'],['durationSeconds','持続時間','秒'],['rangeMeters','射程','m'],['radiusMeters','半径','m']]) {
      if (Number.isFinite(item[key]) && item[key] >= 0) facts.push({label:label+'（参照値）',value:`${item[key]} ${unit}`});
    }
    if (item.target) facts.push({label:'対象（参照資料）',value:({self:'自身',enemy:'敵',ally:'味方',ground:'地面',area:'範囲',cone:'扇状'})[item.target.toLowerCase()] || item.target});
    return facts;
  }
  function description(item) {
    const value = item.descriptionJa || item.descriptionEn;
    return `<p class="eso-skill-description"${!item.descriptionJa && item.descriptionEn ? ' lang="en"' : ''}>${escapeHTML(value || '効果・数値の説明は未収録です。参照資料で確認してください。')}</p>${item.valueBasisJa ? `<p class="eso-skill-verification">${escapeHTML(item.valueBasisJa)}</p>` : ''}`;
  }
  function nameProvenance(item) {
    if (!item.nameJa) return '';
    const status = item.nameJaVerificationStatus === 'official-reference-current-unverified' ? '公式日本語資料の表記を参照。現行日本語クライアントとの一致は未確認です。' : item.nameJaVerificationStatus || '日本語名の現行クライアントとの一致は未確認です。';
    return `<p><strong>日本語名の出典・確認範囲</strong><br>${item.nameJaSourceUrl ? sourceLink({label:'日本語名の参照資料',url:item.nameJaSourceUrl}) : '個別出典は未登録'}${item.nameJaSourceDate ? ` · 出典日：${escapeHTML(item.nameJaSourceDate)}` : ''}<br>${escapeHTML(status)}${item.nameJaVerificationNote ? `<br>${escapeHTML(item.nameJaVerificationNote)}` : ''}</p>`;
  }
  function chip(label, url, active, english) {
    return `<a href="${escapeHTML(url)}"${active ? ' aria-current="true"' : ''}>${escapeHTML(label)}${english && english !== label ? `<small lang="en">${escapeHTML(english)}</small>` : ''}</a>`;
  }
  function renderEffectFilters() {
    const link = (tag, label = tag) => chip(label, listURL({...state,effect:tag}), state.effect === tag);
    $('skills-combat-effects').innerHTML = link('', 'すべての効果・攻撃・ペット') + combatEffects.map(tag => effectTags.has(tag) ? link(tag, tag === 'ペット' ? 'ペット（召喚獣・関連効果）' : tag) : `<span class="eso-skills-effect-unavailable">${escapeHTML(tag)}（収録なし）</span>`).join('');
    $('skills-effect-groups').innerHTML = effectGroups.map(([group, prefix]) => {
      const effects = [...effectTags].filter(tag => tag.startsWith(prefix) && tag.length > prefix.length).sort((a,b) => a.localeCompare(b,'ja'));
      const selected = state.effect === group || effects.includes(state.effect);
      return `<details data-effect-group="${escapeHTML(group)}"${selected || openEffectGroups.has(group) ? ' open' : ''}${selected ? ' class="eso-skills-effect-selected"' : ''}><summary>${escapeHTML(group)} <small>（${effects.length}種類）</small></summary><nav class="eso-skills-chips" aria-label="${escapeHTML(group)}で絞り込み">${effectTags.has(group) ? link(group, `${group}すべて`) : '<span class="eso-skills-effect-unavailable">収録なし</span>'}${effects.map(tag => link(tag)).join('')}</nav></details>`;
    }).join('');
    $('skills-effect-selection').textContent = `選択中：${state.effect || 'すべての効果・攻撃・ペット'}`;
  }
  function renderFilters() {
    $('skills-classes').innerHTML = chip('すべてのクラス', listURL({...state,classId:'',treeId:''}), !state.classId) + data.classes.map(item => chip(title(item), listURL({...state,classId:item.id,treeId:''}), state.classId === item.id, item.nameEn)).join('');
    const selected = classes.get(state.classId);
    $('skills-tree-hint').hidden = !!selected;
    $('skills-trees').innerHTML = selected ? chip('すべてのツリー', listURL({...state,treeId:''}), !state.treeId) + selected.trees.filter(tree => tree.category !== 'class-mastery').map(tree => chip(title(tree), listURL({...state,treeId:tree.id}), state.treeId === tree.id, tree.nameEn)).join('') : '';
    const mastery = selected ? selected.trees.filter(tree => tree.category === 'class-mastery') : [];
    $('skills-mastery').hidden = !mastery.length;
    $('skills-mastery-trees').innerHTML = mastery.map(tree => chip(title(tree), listURL({...state,treeId:tree.id}), state.treeId === tree.id, tree.nameEn)).join('');
    $('skills-search').value = state.q;
    $('skills-type').value = state.type;
    $('skills-form').value = state.form;
    renderEffectFilters();
  }
  function matches(item) {
    if (state.classId && item.classId !== state.classId) return false;
    if (state.treeId && item.treeId !== state.treeId) return false;
    if (state.type && item.type !== state.type) return false;
    if (state.effect && !(item.browseTags || []).includes(state.effect)) return false;
    if (state.form === 'base' && item.baseSkillId || state.form === 'morph' && !item.baseSkillId) return false;
    const base = item.baseSkillId ? skills.get(item.baseSkillId) : item;
    const cl = classes.get(item.classId), tree = trees.get(`${item.classId}/${item.treeId}`);
    const haystack = normalize([item.nameJa,item.nameEn,item.descriptionJa,item.descriptionEn,base.nameJa,base.nameEn,cl.nameJa,cl.nameEn,tree.nameJa,tree.nameEn].join(' '));
    return normalize(state.q).trim().split(/\s+/).every(term => haystack.includes(term));
  }
  function renderCard(item) {
    return `<article class="eso-skill-card" data-skill-id="${escapeHTML(item.id)}"><div class="eso-skill-card-head">${icon(item)}<div><span class="eso-skill-type">${escapeHTML(types[item.type])} · ${escapeHTML(formLabel(item))}</span><h3><a href="${escapeHTML(detailURL(item))}">${escapeHTML(title(item))}</a></h3>${item.nameJa && item.nameEn !== item.nameJa ? `<p class="eso-skill-english" lang="en">${escapeHTML(item.nameEn)}</p>` : ''}</div></div>${description(item)}${verification(item)}</article>`;
  }
  function renderList() {
    renderFilters();
    const filtered = data.skills.filter(matches), groups = new Map();
    for (const item of filtered) {
      const key = item.baseSkillId || item.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    $('skills-count').textContent = `収録データ内：${filtered.length} / ${data.skills.length} 件（基本・変異・パッシブを個別に計数） · ${groups.size} グループ`;
    $('skills-list').innerHTML = [...groups].map(([id, members]) => {
      const base = skills.get(id), cl = classes.get(base.classId), tree = trees.get(`${base.classId}/${base.treeId}`);
      members.sort((a,b) => Number(!!a.baseSkillId) - Number(!!b.baseSkillId) || (a.morphIndex || 0) - (b.morphIndex || 0));
      return `<section class="eso-skills-group"><div class="eso-skills-group-heading"><p>${escapeHTML(title(cl))} / ${escapeHTML(title(tree))}${tree.category === 'class-mastery' ? ' · Class Mastery' : ''}</p><h2>${escapeHTML(title(base))}${base.type !== 'passive' ? ' 系列' : ''}</h2></div>${members.map(renderCard).join('')}</section>`;
    }).join('') || '<p class="eso-skills-empty">この条件に一致する収録データはありません。ゲーム内に存在しないという意味ではありません。検索語を変えるか、条件をクリアしてください。</p>';
  }
  function renderSources() {
    const meta = data.meta;
    const standardTrees = data.classes.reduce((total,item) => total + item.trees.filter(tree => tree.category !== 'class-mastery').length, 0);
    $('skills-coverage').innerHTML = `<p><strong>${data.classes.length}クラス / ${standardTrees}ツリー · ${data.skills.length}件を収録。</strong> 基本・変異・パッシブを別々に数えています。${data.classes.some(item => item.trees.some(tree => tree.category === 'class-mastery')) ? ' Class Masteryは通常ツリーと分けて表示します。' : ''}</p><p>${escapeHTML(text(meta.coverageNote) || '収録範囲は参照資料で確認できた項目に限ります。全スキル・現行のゲーム内仕様を保証するものではありません。')}</p><p class="eso-skills-muted">${escapeHTML(text(meta.iconNote) || '利用条件を確認できた画像のみ掲載します。未取得の画像は「未掲載」です。')} 資料確認日：${escapeHTML(text(meta.verifiedAt) || '未確認')}</p>`;
    const sources = Array.isArray(meta.sources) ? meta.sources : [];
    const notes = [meta.versionNote,meta.localizationNote,meta.numericNote].filter(note => typeof note === 'string' && note);
    const excluded = Array.isArray(meta.excludedCategories) ? meta.excludedCategories.filter(item => typeof item === 'string') : [];
    $('skills-sources').innerHTML = `<p>データ版：${escapeHTML(text(meta.version) || '未確認')} · 資料確認日：${escapeHTML(text(meta.verifiedAt) || '未確認')}</p><p>資料確認日は参照元を確認した日であり、ゲーム内の実測・動作検証日ではありません。数値・対応アップデートが未確認の項目は、その旨を表示します。日本語名未確認のスキルは英語で表示します。</p>${notes.map(note => `<p>${escapeHTML(note)}</p>`).join('')}${excluded.length ? `<p>今回の収録対象外：${escapeHTML(excluded.join(' / '))}</p>` : ''}<ul>${sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul>`;
  }
  function renderDetail(id) {
    const item = skills.get(id);
    const back = `<a class="eso-skills-back" href="${escapeHTML(listURL())}">← 絞り込み結果に戻る</a>`;
    if (!item) {
      document.title = 'スキルが見つからない | ESOデータベース';
      $('skill-detail').innerHTML = `${back}<h1>スキルが見つかりません</h1><p>指定したスキルは未収録、またはURLが正しくありません。スキル一覧から選び直してください。</p>`;
    } else {
      const cl = classes.get(item.classId), tree = trees.get(`${item.classId}/${item.treeId}`), baseId = item.baseSkillId || item.id;
      const family = data.skills.filter(other => other.id === baseId || other.baseSkillId === baseId).sort((a,b) => Number(!!a.baseSkillId) - Number(!!b.baseSkillId) || (a.morphIndex || 0) - (b.morphIndex || 0));
      const sources = Array.isArray(item.sources) ? item.sources : item.sourceUrl ? [{label:'スキルの参照資料',url:item.sourceUrl}] : [];
      const mechanics = numericFacts(item);
      document.title = `${title(item)} | ESOデータベース`;
      $('skill-detail').innerHTML = `${back}<div class="eso-skill-card-head">${icon(item)}<div><h1>${escapeHTML(title(item))}</h1>${item.nameJa ? `<p class="eso-skill-english" lang="en">${escapeHTML(item.nameEn)}</p>` : '<p class="eso-skill-english">日本語名は未確認のため英語で表示</p>'}</div></div><dl class="eso-skills-facts"><dt>クラス</dt><dd>${escapeHTML(title(cl))}</dd><dt>ツリー</dt><dd>${escapeHTML(title(tree))}${tree.category === 'class-mastery' ? '（別枠）' : ''}</dd><dt>種類</dt><dd>${escapeHTML(types[item.type])} / ${escapeHTML(formLabel(item))}</dd><dt>対応アップデート</dt><dd>${escapeHTML(item.gameUpdate || '未確認')}</dd>${mechanics.map(fact => `<dt>${escapeHTML(fact.label)}</dt><dd>${escapeHTML(fact.value)}</dd>`).join('')}</dl><h2>スキルの説明</h2>${description(item)}${item.costNote ? `<p class="eso-skills-muted"><strong>消費の確認範囲：</strong>${escapeHTML(item.costNote)}</p>` : ''}${mechanics.length ? `<p class="eso-skills-muted">${escapeHTML(text(data.meta.numericNote) || '数値は参照資料の掲載値です。ランク・装備・キャラクター条件による差は未検証です。')}</p>` : ''}${verification(item)}${family.length > 1 ? `<h2>基本スキルと変異</h2><ul class="eso-skills-family">${family.map(other => `<li><a href="${escapeHTML(detailURL(other))}"${other.id === item.id ? ' aria-current="page"' : ''}>${escapeHTML(title(other))}</a> <small>— ${escapeHTML(formLabel(other))}</small></li>`).join('')}</ul>` : ''}<div class="source-box"><strong>出典・確認範囲</strong>${nameProvenance(item)}${item.conflictSourceUrl ? `<p>${sourceLink({label:'比較資料（不一致の確認）',url:item.conflictSourceUrl})}</p>` : ''}${sources.length ? `<ul>${sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul>` : '<p>個別出典は未登録です。全体の出典・収録範囲を確認してください。</p>'}<p>参照資料のデータ日：${escapeHTML(item.sourceDataDate || '未確認')} · 資料確認日：${escapeHTML(item.verifiedAt || '未確認')}</p><p>ゲーム内の実測・動作検証はしていません。未記載の数値・ランク差・条件を推定して補ってはいません。</p>${item.icon && safeURL(item.icon.sourceUrl) && text(item.icon.permissionNote) ? `<p>画像出典：${sourceLink({label:'アイコン参照元',url:item.icon.sourceUrl})}<br>${escapeHTML(item.icon.permissionNote)}</p>` : ''}</div>${back}`;
    }
    window.scrollTo(0, 0);
    $('skill-detail').focus({preventScroll:true});
  }
  function route() {
    if (!ready) return;
    const hash = location.hash;
    const match = hash.match(/^#skill\/([^?]*)(?:\?(.*))?$/);
    state = readState(new URLSearchParams(match ? match[2] || '' : hash.startsWith('#?') ? hash.slice(2) : ''));
    const wasDetail = !$('skill-detail').hidden;
    $('skills-home').hidden = !!match;
    $('skill-detail').hidden = !match;
    if (match) {
      let id = '';
      try { id = decodeURIComponent(match[1]); } catch {}
      renderDetail(id);
    } else {
      document.title = 'クラススキル | ESOデータベース';
      renderList();
      if (wasDetail) $('skills-search').focus({preventScroll:true});
    }
  }
  function filter() {
    if (!ready) return;
    state = {...state,q:$('skills-search').value,type:$('skills-type').value,form:$('skills-form').value};
    history.replaceState(null, '', listURL());
    renderList();
  }
  $('skills-search').addEventListener('input', filter);
  $('skills-type').addEventListener('change', filter);
  $('skills-form').addEventListener('change', filter);
  $('skills-reset').addEventListener('click', () => {
    if (!ready) return;
    state = {classId:'',treeId:'',q:'',type:'',form:'',effect:''};
    openEffectGroups.clear();
    history.replaceState(null, '', '#');
    renderList();
    $('skills-search').focus();
  });
  $('skills-effect-groups').addEventListener('toggle', event => {
    const group = event.target.dataset?.effectGroup;
    if (!effectGroups.some(([name]) => name === group)) return;
    if (event.target.open) openEffectGroups.add(group); else openEffectGroups.delete(group);
  }, true);
  $('skills-retry').addEventListener('click', load);
  window.addEventListener('hashchange', route);
  async function load() {
    if (loading) return;
    loading = true;
    ready = false;
    for (const id of ['skills-search','skills-type','skills-form','skills-reset']) $(id).disabled = true;
    $('skills-retry').hidden = true;
    $('skills-notice').textContent = 'データを読み込み中…';
    try {
      const response = await fetch('./data/skills.json?v=20261027-skills-effects1', {credentials:'omit'});
      if (!response.ok) throw new Error('Data unavailable');
      const value = await response.json();
      const maps = validate(value);
      data = value; classes = maps.classes; trees = maps.trees; skills = maps.skills;
      effectTags = new Set(data.skills.flatMap(item => item.browseTags || []));
      renderSources();
      for (const id of ['skills-search','skills-type','skills-form','skills-reset']) $(id).disabled = false;
      $('skills-notice').textContent = '';
      ready = true;
      route();
    } catch {
      $('skills-coverage').textContent = '収録データを読み込めていないため、収録件数・確認範囲は表示できません。';
      $('skills-notice').textContent = 'データを読み込めませんでした。接続を確認して再試行してください。';
      $('skills-retry').hidden = false;
    } finally { loading = false; }
  }
  load();
})();
