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
  function renderList() {
    const term = $('set-search').value.trim().toLocaleLowerCase('ja');
    const category = $('set-category').value;
    const filtered = sets.filter(item => (!category || item.category === category) && [item.name, item.englishName, item.summary, item.location, item.category, ...item.effects.map(effect => effect.text)].join(' ').toLocaleLowerCase('ja').includes(term));
    $('set-count').textContent = `${filtered.length} / ${sets.length} 件のセット`;
    $('sets').innerHTML = filtered.map(item => `<article class="news-card"><span class="category">${escapeHTML(item.category)}</span><h2><a href="#set/${encodeURIComponent(item.id)}">${escapeHTML(item.name)}</a></h2>${item.englishName ? `<p lang="en">${escapeHTML(item.englishName)}</p>` : ''}<p>${escapeHTML(item.summary)}</p>${verification(item)}${icon(item)}</article>`).join('') || `<p class="empty">${term || category ? '該当するセットはない。条件をクリアして一覧に戻れる。' : '装備セットはまだ収録していない。確認済みの情報を追加するまで待ってほしい。'}</p>`;
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
      $('set-detail').innerHTML = `${back}<h1>${escapeHTML(item.name)}</h1>${item.englishName ? `<p lang="en">${escapeHTML(item.englishName)}</p>` : ''}<span class="category">${escapeHTML(item.category)}</span><p class="lead">${escapeHTML(item.summary)}</p>${verification(item)}${icon(item)}<p class="image-pending">アイコンは代表頭部の参考画像。全部位の外見、通常版・完璧版の差やライブ性能を示すものではない。</p><div class="article-body"><h2>主要効果の要約</h2><p>全セットボーナスではない。</p>${item.effects.length ? '' : '<p>効果データは未収録。</p>'}${item.effects.map(effect => `<p><strong>${escapeHTML(effect.label)}</strong>：${escapeHTML(effect.text)}</p>`).join('')}<h2>入手先</h2><p>${escapeHTML(item.location || '未確認')}</p></div><div class="source-box"><strong>出典</strong><ul>${item.sources.map(source => {
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
      const response = await fetch('./data/sets.json?v=20261025-navigation1', {credentials:'omit'});
      if (!response.ok) throw new Error('Data unavailable');
      const data = await response.json();
      if (data.version !== 1 || !Array.isArray(data.sets)) throw new Error('Invalid data');
      const ids = new Set();
      for (const item of data.sets) {
        if (!item || (item.englishName !== undefined && typeof item.englishName !== 'string') || (item.verificationNote !== undefined && typeof item.verificationNote !== 'string') || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || !['name','category','summary','sourceDate','verifiedAt'].every(key => typeof item[key] === 'string' && item[key]) || !Array.isArray(item.effects) || !item.effects.every(e => e && typeof e.label === 'string' && typeof e.text === 'string') || !Array.isArray(item.sources) || !item.sources.length || !item.sources.every(s => s && typeof s.label === 'string' && typeof s.url === 'string')) throw new Error('Invalid set');
        ids.add(item.id);
      }
      sets = data.sets;
      const categories = [...new Set(sets.map(item => item.category))].sort((a,b) => a.localeCompare(b,'ja'));
      $('set-category').innerHTML = '<option value="">すべての分類</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
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
