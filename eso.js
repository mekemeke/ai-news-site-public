'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  let sets = [], ready = false;
  const query = () => new URLSearchParams(location.hash.startsWith('#?') ? location.hash.slice(2) : '');
  const listURL = () => {
    const params = new URLSearchParams();
    if ($('set-search').value) params.set('q', $('set-search').value);
    if ($('set-category').value) params.set('category', $('set-category').value);
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
  const qualityNames = ['白','緑','青','紫','金'];
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
  function qualityBlock(item, detailed = false) {
    const data = item.numericValue;
    if (!data) return '<p class="set-quality-unknown">品質別の数値は未確認。本文の単一値・範囲を各品質共通とは扱わない。</p>';
    const mythic = data.availability === 'mythic-fixed';
    const heading = mythic ? 'CP160・秘術の固定品質' : 'CP160・品質別の数値';
    const rows = data.rows;
    const linkedSources = item.sources.filter(s => data.sourceIds.includes(s.id));
    const sources = linkedSources.map(source => {
      let url; try { url = new URL(source.url); } catch {}
      return url?.protocol === 'https:' ? `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${source.id === 'mythic-quality' ? '秘術の品質' : source.id === 'eso-perfect-mixing' ? '通常/完璧版の公式ルール' : '品質別の出典（klarix）'}</a>` : '';
    }).filter(Boolean).join(' · ');
    const table = rows.length ? `<div class="set-quality-table-wrap" role="region" tabindex="0" aria-label="${escapeHTML(item.name)}の品質別数値"><table class="set-quality-table"><caption>${escapeHTML(heading)}（資料照合済みの効果のみ）</caption><thead><tr><th scope="col">効果</th>${qualityNames.map((label,i) => `<th scope="col" class="set-quality-${qualityIds[i]}" title="${escapeHTML(data.qualities[i].label)}"><span class="set-quality-mark" aria-hidden="true"></span>${label}${mythic && i === 4 ? '相当' : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escapeHTML(row.label)}</th>${qualityIds.map((id,i) => {
      const value = row.values[id];
      const unavailable = data.qualities[i].status === 'not-applicable';
      if (value === undefined) return `<td class="set-quality-empty"><span title="${unavailable ? '秘術は固定品質のため対象外' : 'この効果の品質別数値・入手可否は未確認'}">${unavailable ? '対象外' : '—'}</span></td>`;
      return `<td class="set-quality-${id}"><span aria-label="${escapeHTML(data.qualities[i].label)} ${value}${row.unit === '%' ? 'パーセント' : 'ポイント'}">${Number(value).toLocaleString('ja-JP')}${row.unit === '%' ? '%' : ''}</span></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>` : `<h3>${escapeHTML(heading)}</h3><p class="set-quality-unknown">${mythic ? '白・緑・青・紫は対象外。秘術は固定品質（専用表示は橙、金相当）。本文の効果は保持しているが、このセットの固定品質数値は今回の表に未照合。' : '白・緑・青・紫・金ごとの数値は未確認。本文の単一値や範囲を品質別へ推定配分していない。'}</p>`;
    const brief = mythic ? '秘術は品質固定。金相当欄の値だけを使用し、低品質へ換算しない。ゲーム内の秘術表示は橙。' : '同じセットをCP160・同一品質に揃えた参照値。— は未確認（0や入手不可ではない）。狭い画面では表を横にスクロールできる。';
    return `<section class="set-quality-block" aria-label="品質別数値">${table}<p class="set-quality-note">${escapeHTML(brief)}</p>${rows.length ? '<p class="set-quality-note">表にない効果の品質差は未確認。本文の範囲は品質別の値ではない。</p>' : ''}${detailed ? `<p class="set-quality-note">${escapeHTML(data.basis)}</p><ul class="set-quality-notes">${data.notes.map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul>` : `<details><summary>品質・混在装備の注意</summary><p>${escapeHTML(data.basis)}</p><ul>${data.notes.map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul></details>`}${sources ? `<p class="set-quality-source">${sources} · 照合日 ${escapeHTML(data.verifiedAt)}</p>` : ''}</section>`;
  }

  function renderEffectFilters() {
    const tags = new Set(sets.flatMap(item => item.browseTags || []));
    const groups = [
      ['メジャーバフ', 'バフ（強）：'], ['マイナーバフ', 'バフ（弱）：'],
      ['メジャーデバフ', 'デバフ（強）：'], ['マイナーデバフ', 'デバフ（弱）：']
    ];
    const link = tag => `<a data-effect="${escapeHTML(tag)}" href="#?category=${encodeURIComponent(tag)}">${escapeHTML(tag)}</a>`;
    $('effect-filters').innerHTML = groups.map(([group, prefix]) => {
      const effects = [...tags].filter(tag => tag.startsWith(prefix) && tag.length > prefix.length).sort((a,b) => a.localeCompare(b,'ja'));
      if (!tags.has(group) && !effects.length) return '';
      return `<details><summary>${escapeHTML(group)}（${effects.length}種類）</summary><nav aria-label="${escapeHTML(group)}の効果">${tags.has(group) ? link(group) : ''}${effects.map(link).join('')}</nav></details>`;
    }).join('');
    $('effect-filter-section').hidden = !$('effect-filters').innerHTML;
  }
  function syncEffectFilters() {
    for (const link of $('effect-filters').querySelectorAll('a[data-effect]')) {
      const tag = link.dataset.effect;
      link.setAttribute('href', '#?category=' + encodeURIComponent(tag) + ($('set-search').value ? '&q=' + encodeURIComponent($('set-search').value) : ''));
      if (tag === $('set-category').value) {
        link.setAttribute('aria-current', 'true');
        link.closest('details').open = true;
      } else link.removeAttribute('aria-current');
    }
  }
  function renderList() {
    const term = $('set-search').value.trim().toLocaleLowerCase('ja');
    const category = $('set-category').value;
    syncEffectFilters();
    const filtered = sets.filter(item => (!category || item.category === category || (item.browseTags || []).includes(category)) && [item.name, item.englishName, item.summary, item.location, item.category, ...item.effects.map(effect => effect.text)].join(' ').toLocaleLowerCase('ja').includes(term));
    $('set-count').textContent = `収録データ内：${filtered.length} / ${sets.length} セット系列`;
    $('sets').innerHTML = filtered.map(item => `<article class="news-card"><span class="category">${escapeHTML(item.category)}</span><h2><a href="#set/${encodeURIComponent(item.id)}">${escapeHTML(item.name)}</a></h2>${item.englishName ? `<p lang="en">${escapeHTML(item.englishName)}</p>` : ''}<p>${escapeHTML(item.summary)}</p>${icon(item)}<div class="article-body set-effects"><h3>セットボーナス・発動条件</h3>${item.effects.map(effect => `<p><strong>${escapeHTML(effect.label)}</strong>：${escapeHTML(effect.text)}</p>`).join('')}</div>${qualityBlock(item)}${verification(item)}</article>`).join('') || `<p class="empty">${term || category ? 'この分類・検索条件に合うセットはまだ収録していない。ゲーム内に存在しないという意味ではない。条件をクリアして一覧に戻れる。' : '装備セットはまだ収録していない。確認済みの情報を追加するまで待ってほしい。'}</p>`;
  }
  function route() {
    if (!ready) return;
    const match = location.hash.match(/^#set\/(.*)$/);
    $('sets-home').hidden = !!match;
    $('set-detail').hidden = !match;
    if (!match) {
      const params = query();
      $('set-search').value = params.get('q') || '';
      $('set-category').value = params.get('category') || '';
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
      $('set-detail').innerHTML = `${back}<h1>${escapeHTML(item.name)}</h1>${item.englishName ? `<p lang="en">${escapeHTML(item.englishName)}</p>` : ''}<span class="category">${escapeHTML(item.category)}</span><p class="lead">${escapeHTML(item.summary)}</p>${verification(item)}${icon(item)}<p class="image-pending">アイコンは代表頭部の参考画像。全部位の外見、通常版・完璧版の差やライブ性能を示すものではない。</p><div class="article-body"><h2>セットボーナス・発動条件</h2><p>装備数ごとの効果と条件を記載。本文は従来の参照資料の掲載値。品質別に照合できた値は下の色付き表に分けて掲載。本文の範囲を品質ごとの値とは扱わない。</p>${item.effects.length ? '' : '<p>効果データは未収録。</p>'}${item.effects.map(effect => `<p><strong>${escapeHTML(effect.label)}</strong>：${escapeHTML(effect.text)}</p>`).join('')}${qualityBlock(item, true)}<h2>入手先</h2><p>${escapeHTML(item.location || '未確認')}</p></div><div class="source-box"><strong>出典</strong><ul>${item.sources.map(source => {
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
  $('set-search').addEventListener('input', filter);
  $('set-category').addEventListener('change', filter);
  $('set-reset').addEventListener('click', () => {
    $('set-search').value = '';
    $('set-category').value = '';
    filter();
    $('set-search').focus();
  });
  window.addEventListener('hashchange', route);
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
      const qualityCount = sets.filter(item => item.numericValue?.rows.length).length;
      $('set-quality-coverage').textContent = `${qualityCount} / ${sets.length}系列で品質付き数値を掲載。白・緑・青・紫・金を色とラベルで区別。全効果・全品質の検証完了を意味しない。`;
      const categories = [...new Set([...['軽装','中装','重装','モンスター','秘術','武器セット','フィールド','ダンジョン','試練','アリーナ','クラフト','PvP','古遺物'], ...sets.flatMap(item => [item.category, ...(item.browseTags || [])])])].sort((a,b) => a.localeCompare(b,'ja'));
      $('set-category').innerHTML = '<option value="">すべての分類</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
      renderEffectFilters();
      for (const id of ['set-search','set-category','set-reset']) $(id).disabled = false;
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
