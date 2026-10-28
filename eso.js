'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  let sets = [], ready = false, effectTags = new Set();
  const query = () => new URLSearchParams(location.hash.startsWith('#?') ? location.hash.slice(2) : '');
  const listURL = (overrides = {}) => {
    const params = new URLSearchParams();
    if ($('set-search').value) params.set('q', $('set-search').value);
    if ($('set-category').value) params.set('category', $('set-category').value);
    if ($('set-effect').value) params.set('effect', $('set-effect').value);
    if ($('set-effect2').value) params.set('effect2', $('set-effect2').value);
    for (const [key,value] of Object.entries(overrides)) {
      if (value) params.set(key,value); else params.delete(key);
    }
    return params.size ? '#?' + params : '#';
  };
  function icon(item) {
    if (typeof item.icon !== 'string' || !/^assets\/eso\/[a-z0-9][a-z0-9_-]*\.(?:png|jpe?g|webp)$/i.test(item.icon) || typeof item.iconAlt !== 'string' || !item.iconAlt.trim()) return '<p class="image-pending">実物画像未掲載</p>';
    return `<img class="set-icon" src="./${escapeHTML(item.icon)}" alt="${escapeHTML(item.iconAlt)}" width="64" height="64" loading="lazy">`;
  }
  document.addEventListener('error', event => {
    if (!(event.target instanceof HTMLImageElement) || !event.target.classList.contains('set-icon')) return;
    const fallback = document.createElement('p');
    fallback.className = 'image-pending';
    fallback.textContent = '実物画像未掲載（画像を読み込めなかった）';
    event.target.replaceWith(fallback);
  }, true);
  function verification(item) {
    return `<p class="reference-date">出典日：${escapeHTML(item.sourceDate)} · 資料確認日：${escapeHTML(item.verifiedAt)}</p>${item.verificationNote ? `<p><strong>${escapeHTML(item.verificationNote)}</strong></p>` : ''}`;
  }
  const qualityIds = ['normal','fine','superior','epic','legendary'];
  function validNumericValue(value, item) {
    if (value === undefined) return true;
    if (!value || value.qualityBasis !== 'equipment-set' || value.baseline !== 'CP160' || !['partial','unverified'].includes(value.status) || typeof value.basis !== 'string' || !Array.isArray(value.rows) || !Array.isArray(value.qualities) || value.qualities.length !== 5 || !Array.isArray(value.notes) || !value.notes.every(x => typeof x === 'string') || !Array.isArray(value.sourceIds) || !value.sourceIds.every(x => typeof x === 'string')) return false;
    const rowIds = new Set();
    for (const row of value.rows) {
      if (!row || typeof row.id !== 'string' || rowIds.has(row.id) || typeof row.label !== 'string' || !Number.isInteger(row.effectIndex) || !item.effects[row.effectIndex] || !['base','perfected'].includes(row.variant) || !['quality-scaled','fixed-quality'].includes(row.valueType) || !['ポイント','%'].includes(row.unit) || typeof row.sourceId !== 'string' || !value.sourceIds.includes(row.sourceId) || !row.values || typeof row.values !== 'object' || !Object.keys(row.values).length || !Object.entries(row.values).every(([key, n]) => qualityIds.includes(key) && Number.isFinite(n) && n >= 0)) return false;
      rowIds.add(row.id);
    }
    return value.qualities.every((quality, index) => quality && quality.id === qualityIds[index] && typeof quality.label === 'string' && ['partial','unverified','not-applicable'].includes(quality.status) && typeof quality.summary === 'string' && typeof quality.availability === 'string' && Array.isArray(quality.variants) && quality.variants.every(v => v && rowIds.has(v.rowId) && typeof v.label === 'string' && typeof v.value === 'string'));
  }
  // Match a verified row to an exact semantic numeric expression, never an arbitrary
  // occurrence of its endpoint. Ranges are replaced in full; originals stay in <details>.
  const metricAliases = [
    ['武器・呪文ダメージ', ['武器ダメージと呪文ダメージ','武器・呪文ダメージ']],
    ['クリティカル値', ['クリティカル率の能力値','クリティカルの値','クリティカル値']],
    ['攻撃貫通力', ['攻撃貫通力','攻撃貫通']],
    ['防御力', ['防御力（物理・呪文耐性）','防御力']],
    ...['最大体力','最大スタミナ','最大マジカ','スタミナ再生','マジカ再生','体力再生','クリティカル耐性'].map(label => [label,[label]]),
    ['モンスターへの与ダメージ増加', ['モンスターへの与ダメージ']],
    ['クリティカルダメージ増加', ['クリティカルダメージ']],
    ['軽攻撃/重攻撃の総ダメージ低下', ['軽攻撃・重攻撃で与える総ダメージ']],
    ['移動速度', ['移動速度']]
  ];
  const regexpEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const metricPattern = metricAliases.flatMap(([,aliases]) => aliases).sort((a,b) => b.length-a.length).map(regexpEscape).join('|');
  const numberPattern = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`;
  const amountPattern = `${numberPattern}(?:\\s*[～〜–—-]\\s*${numberPattern})?`;
  function rowMetric(row) {
    if (row.label.endsWith('移動速度')) return '移動速度';
    return metricAliases.find(([id]) => row.label.endsWith(id))?.[0] || row.label;
  }
  function effectPlan(item, effectIndex) {
    const effect = item.effects[effectIndex], rows = (item.numericValue?.rows || []).filter(row => row.effectIndex === effectIndex);
    const candidates = [];
    const add = (match, prefix, amount, unit, metrics) => {
      const offset = match.index + prefix.length;
      const endpoint = Number(amount.split(/[～〜–—-]/).pop().replace(/[,\s]/g,''));
      candidates.push({start:offset,end:offset+amount.length+unit.length,endpoint,unit,metrics});
    };
    const pattern = new RegExp(`((?:${metricPattern})(?:(?:と|・)(?:${metricPattern}))*(?:が|を)(?:さらに|それぞれ|各)?\\s*)(${amountPattern})([%％]?)(?![\\d.,])`,'g');
    for (const match of effect.text.matchAll(pattern)) {
      const metrics = [...match[1].matchAll(new RegExp(metricPattern,'g'))].map(found => metricAliases.find(([,aliases]) => aliases.includes(found[0]))[0]);
      add(match,match[1],match[2],match[3],metrics);
    }
    for (const [prefix,metric,unit] of [['与えたダメージの','1部位・与ダメージに対する回復率','%'],['この割合が','グループの味方1人につき低下','']]) {
      const pattern = new RegExp(`(${prefix})(${amountPattern})(${unit})(?![\\d.,])${unit ? '' : '(?=ポイント低下)'}`,'g');
      for (const match of effect.text.matchAll(pattern)) add(match,match[1],match[2],match[3],[metric]);
    }
    const perfectedEffect = /完璧|Perfected/i.test(effect.label);
    const compatible = (row,candidate) => {
      if ((row.variant === 'perfected') !== perfectedEffect) return false;
      if (!perfectedEffect && /完璧|Perfected/i.test(effect.text)) return false;
      const clause = effect.text.slice(0,candidate.start).split(/[。；;]/).pop();
      return !perfectedEffect || !/通常版(?:は|では)/.test(clause);
    };
    const matches = new Map(rows.map(row => [row,candidates.filter(candidate => compatible(row,candidate) && candidate.metrics.includes(rowMetric(row)) && candidate.endpoint === row.values.legendary && (row.unit === '%') === !!candidate.unit)]));
    const replacements = [], usedRows = new Set();
    for (const candidate of candidates) {
      const aligned = rows.filter(row => matches.get(row).length === 1 && matches.get(row)[0] === candidate);
      // Shared clauses ("最大スタミナと最大マジカがそれぞれ…") can use one
      // group only when every named metric has an independently verified identical vector.
      if (!aligned.length || !candidate.metrics.every(metric => aligned.some(row => rowMetric(row) === metric)) || !aligned.every(row => row.unit === aligned[0].unit && qualityIds.every(id => row.values[id] === aligned[0].values[id]))) continue;
      if (replacements.some(other => candidate.start < other.end && candidate.end > other.start)) continue;
      replacements.push({...candidate,rows:aligned});
      aligned.forEach(row => usedRows.add(row));
    }
    replacements.sort((a,b) => a.start-b.start);
    return {replacements,unmatched:rows.filter(row => !usedRows.has(row))};
  }
  function qualityValues(item, rows) {
    const data = item.numericValue, row = rows[0], mythic = data.availability === 'mythic-fixed';
    const ids = mythic ? ['legendary'] : qualityIds;
    return `<span class="set-quality-values" role="group" aria-label="${escapeHTML(rows.map(row => row.label).join(' / '))}" data-row-ids="${escapeHTML(rows.map(row => row.id).join(' '))}">${ids.map(id => {
      const quality = data.qualities[qualityIds.indexOf(id)], value = row.values[id];
      const unavailable = quality.status === 'not-applicable';
      const label = value === undefined ? (unavailable ? '対象外' : '未確認') : `${value}${row.unit === '%' ? 'パーセント' : 'ポイント'}`;
      const shown = value === undefined ? (unavailable ? '対象外' : '—') : `${value}${row.unit === '%' ? '%' : ''}`;
      return `<span class="set-quality-${id}${value === undefined ? ' set-quality-empty' : ''}" role="img" data-quality="${id}"${value !== undefined ? ' data-value="' + value + '"' : ''} aria-label="${escapeHTML(quality.label)} ${escapeHTML(label)}" title="${escapeHTML(quality.label)}：${escapeHTML(label)}">${shown}</span>`;
    }).join('<span class="set-quality-divider" aria-hidden="true"> / </span>')}</span>`;
  }
  function renderEffects(item) {
    return item.effects.map((effect,index) => {
      const plan = effectPlan(item,index);
      // Fold only source-text range notes, before escaping; never rewrite generated markup.
      const fragment = value => escapeHTML(plan.replacements.length ? value.replace(/（(?:資料の)?掲載範囲：[\d.,～〜–—\-\s]+）/g,'') : value);
      let cursor = 0, html = '';
      for (const replacement of plan.replacements) {
        html += fragment(effect.text.slice(cursor,replacement.start)) + qualityValues(item,replacement.rows);
        cursor = replacement.end;
      }
      html += fragment(effect.text.slice(cursor));
      const fallback = plan.unmatched.map(row => `<span class="set-quality-fallback">${escapeHTML(row.label)}：${qualityValues(item,[row])}</span>`).join('');
      return `<p><strong>${escapeHTML(effect.label)}</strong>：${html}${fallback}</p>`;
    }).join('');
  }
  function qualityBlock(item) {
    const data = item.numericValue;
    if (!data) return '<p class="set-quality-status">品質別の数値は未確認</p>';
    const mythic = data.availability === 'mythic-fixed', rows = data.rows;
    const linkedSources = item.sources.filter(source => data.sourceIds.includes(source.id));
    const sources = linkedSources.map(source => {
      let url; try { url = new URL(source.url); } catch {}
      return url?.protocol === 'https:' ? `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${source.id === 'mythic-quality' ? '秘術の品質' : source.id === 'eso-perfect-mixing' ? '通常/完璧版の公式ルール' : '品質別の出典（klarix）'}</a>` : '';
    }).filter(Boolean).join(' · ');
    const originals = item.effects.filter((effect,index) => effectPlan(item,index).replacements.length);
    const status = mythic ? `秘術・固定品質（金相当／橙）${rows.length ? ' · 一部確認' : ' · 数値未確認'}` : rows.length ? 'CP160 · 品質別は一部確認' : '品質別の数値は未確認';
    const brief = mythic ? '白・緑・青・紫は対象外。秘術は固定品質（金相当、ゲーム内の専用表示は橙）。低品質へ換算しない。' : '同じセットをCP160・同一品質に揃えた参照値。— は未確認（0や入手不可ではない）。';
    return `<div class="set-quality-meta"><p class="set-quality-status">${status}</p><details class="set-quality-details"><summary>出典・条件・元の掲載値</summary><p>${escapeHTML(brief)}</p><p>置換していない効果の品質差は未確認。本文の単一値・範囲を各品質共通とは扱わず、品質別へ推定配分していない。</p><p>${escapeHTML(data.basis)}</p><ul>${data.notes.map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul>${originals.length ? `<h4>元の効果文（単一値・レベル範囲を含む）</h4>${originals.map(effect => `<p><strong>${escapeHTML(effect.label)}</strong>：${escapeHTML(effect.text)}</p>`).join('')}` : ''}${sources ? `<p>${sources} · 照合日 ${escapeHTML(data.verifiedAt)}</p>` : ''}</details></div>`;
  }

  function renderEffectFilters() {
    const tags = effectTags;
    const groups = [
      ['メジャーバフ', 'バフ（強）：'], ['マイナーバフ', 'バフ（弱）：'],
      ['メジャーデバフ', 'デバフ（強）：'], ['マイナーデバフ', 'デバフ（弱）：']
    ];
    const link = tag => `<a data-effect="${escapeHTML(tag)}" href="#?effect=${encodeURIComponent(tag)}">${escapeHTML(tag)}</a>`;
    $('effect-filters').innerHTML = groups.map(([group, prefix]) => {
      const effects = [...tags].filter(tag => tag.startsWith(prefix) && tag.length > prefix.length).sort((a,b) => a.localeCompare(b,'ja'));
      if (!tags.has(group) && !effects.length) return '';
      return `<details><summary>${escapeHTML(group)}（${effects.length}種類）</summary><nav aria-label="${escapeHTML(group)}の効果">${tags.has(group) ? link(group) : ''}${effects.map(link).join('')}</nav></details>`;
    }).join('');
    $('effect-filter-section').hidden = !$('effect-filters').innerHTML;
  }
  function syncEffectFilters() {
    for (const link of $('sets-home').querySelectorAll('a[data-set-category], a[data-set-effect]')) {
      link.setAttribute('href', link.dataset.setEffect ? listURL({effect:link.dataset.setEffect}) : listURL({category:link.dataset.setCategory}));
    }
    for (const link of $('effect-filters').querySelectorAll('a[data-effect]')) {
      const tag = link.dataset.effect;
      link.setAttribute('href', listURL({effect:tag}));
      if (tag === $('set-effect').value) {
        link.setAttribute('aria-current', 'true');
        link.closest('details').open = true;
      } else link.removeAttribute('aria-current');
    }
  }
  function renderList() {
    const term = $('set-search').value.trim().toLocaleLowerCase('ja');
    const category = $('set-category').value;
    const effects = [$('set-effect').value, $('set-effect2').value].filter(Boolean);
    $('set-effect-selection').textContent = `効果条件1：${$('set-effect').value || 'すべての効果'} ／ 効果条件2：${$('set-effect2').value || 'すべての効果'}（AND）`;
    syncEffectFilters();
    const filtered = sets.filter(item => effects.every(effect => (item.browseTags || []).includes(effect)) && (!category || item.category === category || (item.browseTags || []).includes(category)) && [item.name, item.englishName, item.summary, item.location, item.category, ...item.effects.map(effect => effect.text)].join(' ').toLocaleLowerCase('ja').includes(term));
    $('set-count').textContent = `収録データ内：${filtered.length} / ${sets.length} セット系列`;
    $('sets').innerHTML = filtered.map(item => `<article class="news-card"><span class="category">${escapeHTML(item.category)}</span><h2><a href="#set/${encodeURIComponent(item.id)}${escapeHTML(listURL().slice(1))}">${escapeHTML(item.name)}</a></h2>${item.englishName ? `<p lang="en">${escapeHTML(item.englishName)}</p>` : ''}<p>${escapeHTML(item.summary)}</p>${icon(item)}<div class="article-body set-effects"><h3>セットボーナス・発動条件</h3>${renderEffects(item)}</div>${qualityBlock(item)}${verification(item)}</article>`).join('') || `<p class="empty">${term || category || effects.length ? 'この分類・検索条件に合うセットはまだ収録していない。ゲーム内に存在しないという意味ではない。条件をクリアして一覧に戻れる。' : '装備セットはまだ収録していない。確認済みの情報を追加するまで待ってほしい。'}</p>`;
  }
  function route() {
    if (!ready) return;
    const match = location.hash.match(/^#set\/([^?]*)(?:\?(.*))?$/);
    $('sets-home').hidden = !!match;
    $('set-detail').hidden = !match;
    if (!match || match[2] !== undefined) {
      const params = match ? new URLSearchParams(match[2]) : query();
      $('set-search').value = params.get('q') || '';
      $('set-category').value = params.get('category') || '';
      for (const key of ['effect','effect2']) $('set-' + key).value = effectTags.has(params.get(key)) ? params.get(key) : '';
    }
    if (!match) {
      document.title = '装備セット | ESOデータベース';
      renderList();
      return;
    }
    let id = '';
    try { id = decodeURIComponent(match[1]); } catch {}
    const item = sets.find(item => item.id === id);
    const back = `<a class="back" href="${escapeHTML(listURL())}">← 装備セット一覧に戻る</a>`;
    if (!item) {
      document.title = 'セットが見つからない | ESOデータベース';
      $('set-detail').innerHTML = `${back}<h1>セットが見つからない</h1><p>指定されたセットは未収録、またはURLが正しくない。装備セット一覧から確認できる。</p>`;
    } else {
      document.title = item.name + ' | ESOデータベース';
      $('set-detail').innerHTML = `${back}<h1>${escapeHTML(item.name)}</h1>${item.englishName ? `<p lang="en">${escapeHTML(item.englishName)}</p>` : ''}<span class="category">${escapeHTML(item.category)}</span><p class="lead">${escapeHTML(item.summary)}</p>${verification(item)}${icon(item)}<p class="image-pending">アイコンは代表頭部の参考画像。全部位の外見、通常版・完璧版の差やライブ性能を示すものではない。</p><div class="article-body"><h2>セットボーナス・発動条件</h2><p>装備数ごとの効果と条件を記載。品質別に照合した数値を文中に表示。元の単一値・範囲は「出典・条件・元の掲載値」で確認できる。</p>${item.effects.length ? '' : '<p>効果データは未収録。</p>'}${renderEffects(item)}${qualityBlock(item, true)}<h2>入手先</h2><p>${escapeHTML(item.location || '未確認')}</p></div><div class="source-box"><strong>出典</strong><ul>${item.sources.map(source => {
        let url;
        try { url = new URL(source.url); } catch {}
        return `<li>${url?.protocol === 'https:' ? `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.label)}</a>` : escapeHTML(source.label)}</li>`;
      }).join('')}</ul><p>資料確認日は出典を確認した日で、ゲーム内の検証日ではない。</p></div>${back}`;
    }
    window.scrollTo(0, 0);
    $('set-detail').focus({preventScroll:true});
  }
  function filter() {
    history.replaceState(null, '', listURL());
    renderList();
  }
  function changeEffects() {
    if (!ready) return;
    const url = listURL();
    if (location.hash !== url) history.pushState(null, '', url);
    renderList();
  }
  $('set-effect').addEventListener('change', changeEffects);
  $('set-effect2').addEventListener('change', changeEffects);
  $('set-search').addEventListener('input', filter);
  $('set-category').addEventListener('change', filter);
  $('set-reset').addEventListener('click', () => {
    $('set-search').value = '';
    $('set-category').value = '';
    $('set-effect').value = '';
    $('set-effect2').value = '';
    filter();
    $('set-search').focus();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  async function load() {
    $('set-notice').textContent = 'データを読み込み中…';
    try {
      const response = await fetch('./data/sets.json?v=20261027-quality1', {credentials:'omit'});
      if (!response.ok) throw new Error('Data unavailable');
      const data = await response.json();
      if (data.version !== 1 || !Array.isArray(data.sets)) throw new Error('Invalid data');
      const ids = new Set();
      for (const item of data.sets) {
        if (!item || !validNumericValue(item.numericValue,item) || (item.browseTags !== undefined && (!Array.isArray(item.browseTags) || !item.browseTags.every(tag => typeof tag === 'string'))) || (item.englishName !== undefined && typeof item.englishName !== 'string') || (item.verificationNote !== undefined && typeof item.verificationNote !== 'string') || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || !['name','category','summary','sourceDate','verifiedAt'].every(key => typeof item[key] === 'string' && item[key]) || !Array.isArray(item.effects) || !item.effects.every(e => e && typeof e.label === 'string' && typeof e.text === 'string') || !Array.isArray(item.sources) || !item.sources.length || !item.sources.every(s => s && typeof s.label === 'string' && typeof s.url === 'string')) throw new Error('Invalid set');
        ids.add(item.id);
      }
      sets = data.sets;
      effectTags = new Set(sets.flatMap(item => item.browseTags || []).filter(tag => ['軽攻撃','重攻撃','ペット','メジャーバフ','マイナーバフ','メジャーデバフ','マイナーデバフ'].includes(tag) || /^(?:バフ|デバフ)（(?:強|弱)）：/.test(tag)));
      const effectOptions = '<option value="">すべての効果</option>' + [...effectTags].sort((a,b) => a.localeCompare(b,'ja')).map(tag => `<option value="${escapeHTML(tag)}">${escapeHTML(tag)}</option>`).join('');
      $('set-effect').innerHTML = effectOptions;
      $('set-effect2').innerHTML = effectOptions;
      const qualityCount = sets.filter(item => item.numericValue?.rows.length).length;
      $('set-quality-coverage').textContent = `${qualityCount} / ${sets.length}系列で品質付き数値を掲載。白・緑・青・紫・金を色とラベルで区別。全効果・全品質の検証完了を意味しない。`;
      const categories = [...new Set([...['軽装','中装','重装','モンスター','秘術','武器セット','フィールド','ダンジョン','試練','アリーナ','クラフト','PvP','古遺物'], ...sets.flatMap(item => [item.category, ...(item.browseTags || [])])])].sort((a,b) => a.localeCompare(b,'ja'));
      $('set-category').innerHTML = '<option value="">すべての分類</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
      renderEffectFilters();
      for (const id of ['set-search','set-category','set-effect','set-effect2','set-reset']) $(id).disabled = false;
      $('set-notice').textContent = '';
      ready = true;
      route();
    } catch {
      $('set-notice').textContent = 'データを読み込めなかった。接続を確認して再試行できる。';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = '再試行';
      retry.addEventListener('click', load);
      $('set-notice').append(' ', retry);
    }
  }
  load();
})();
