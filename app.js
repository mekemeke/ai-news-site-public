'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const title = 'AIニュース | 仮公開プレビュー';
  const dateFormat = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
  let categories = [], articles = [], category = '', listY = 0, lastArticle = '', ready = false;
  let dark = false;
  try { dark = localStorage.getItem('ai-news-preview-theme') === 'dark'; } catch {}
  function setTheme() {
    document.body.classList.toggle('dark', dark);
    $('theme').setAttribute('aria-pressed', String(dark));
    $('theme').setAttribute('aria-label', dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え');
    $('theme').querySelector('span').textContent = dark ? 'ライト' : 'ダーク';
  }
  setTheme();
  $('theme').addEventListener('click', () => {
    dark = !dark;
    setTheme();
    try { localStorage.setItem('ai-news-preview-theme', dark ? 'dark' : 'light'); } catch {}
  });
  const categoryName = id => categories.find(item => item.id === id)?.name || '';
  const dateLabel = value => dateFormat.format(new Date(value));
  const dayLabel = value => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo'}).format(new Date(value));
  function sourceLink(source) {
    let url;
    try { url = new URL(source.url); } catch { return escapeHTML(source.label || '参考リンクなし'); }
    if (url.protocol !== 'https:') return escapeHTML(source.label || '参考リンクなし');
    return `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.label || url.href)} ↗</a>`;
  }
  const isSample = article => article.sample === true || article.id.startsWith('sample-');
  function videoEmbed(article) {
    const id = article.videoId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return '';
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${escapeHTML(article.videoTitle || article.title)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  function metadata(article) {
    const sample = isSample(article);
    return `<div class="meta"><span class="category">${escapeHTML(categoryName(article.category))}</span><span class="status">${sample ? '架空サンプル' : '動画紹介・振り返り'}</span><time datetime="${escapeHTML(article.publishedAt)}">${sample ? 'サンプル日時' : '記事掲載'} ${escapeHTML(dateLabel(article.publishedAt))} JST</time></div>`;
  }
  function renderCategories() {
    $('categories').innerHTML = [{id: '', name: 'すべて'}, ...categories].map(item => `<button type="button" data-category="${escapeHTML(item.id)}" aria-pressed="${item.id === category}">${escapeHTML(item.name)}</button>`).join('');
  }
  function renderList() {
    const query = $('search').value.trim().toLocaleLowerCase('ja');
    const date = $('date').value;
    const filtered = articles.filter(article => (!category || article.category === category) && (!date || dayLabel(article.publishedAt) === date) && (!query || [article.title, article.summary, categoryName(article.category), ...article.blocks.map(block => block.text)].join(' ').toLocaleLowerCase('ja').includes(query)));
    $('articles').innerHTML = filtered.map(article => `<article class="news-card">${metadata(article)}<h2><a href="#article/${encodeURIComponent(article.id)}">${escapeHTML(article.title)}</a></h2><p>${escapeHTML(article.summary)}</p><div class="source">${article.sources.map(sourceLink).join(' · ')}</div></article>`).join('') || '<div class="empty">該当する記事がありません。条件を変えてお試しください。</div>';
    $('count').textContent = `${filtered.length} / ${articles.length} 件の記事`;
    $('end-note').hidden = filtered.length === 0;
  }
  function renderBlocks(blocks) {
    return blocks.map(block => {
      if (block.type === 'feature') {
        return `<p class="feature"><strong>${escapeHTML(block.label)}</strong>：${escapeHTML(block.text)}</p>`;
      }
      const tag = block.type === 'heading' ? 'h2' : block.type === 'quote' ? 'blockquote' : 'p';
      return `<${tag}>${escapeHTML(block.text)}</${tag}>`;
    }).join('');
  }
  function route() {
    if (!ready) return;
    const match = location.hash.match(/^#article\/(.*)$/);
    const isDetail = !!match;
    if (isDetail && !$('home').hidden) { listY = window.scrollY; lastArticle = match[1]; }
    document.querySelector('.toolbar').hidden = isDetail;
    $('home').hidden = isDetail;
    $('detail').hidden = !isDetail;
    if (!isDetail) {
      document.title = title;
      if (lastArticle) {
        const link = [...document.querySelectorAll('#articles h2 a')].find(item => item.getAttribute('href') === '#article/' + lastArticle);
        (link || $('main')).focus({preventScroll: true});
        window.scrollTo(0, listY);
      }
      return;
    }
    let id = '';
    try { id = decodeURIComponent(match[1]); } catch {}
    const article = articles.find(item => item.id === id);
    if (!article) {
      document.title = '記事が見つかりません | ' + title;
      $('detail').innerHTML = '<a class="back" href="#">← 一覧に戻る</a><h1>記事が見つかりません</h1><p>指定された記事は見つかりませんでした。一覧から記事を選んでください。</p>';
    } else {
      document.title = article.title + ' | ' + title;
      $('detail').innerHTML = `<a class="back" href="#">← 一覧に戻る</a>${metadata(article)}<h1>${escapeHTML(article.title)}</h1>${videoEmbed(article)}<p class="lead">${escapeHTML(article.summary)}</p><div class="article-body">${renderBlocks(article.blocks)}</div><div class="source-box"><strong>${isSample(article) ? 'サンプルの参考リンク' : '出典・参考リンク'}</strong><ul>${article.sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul><p>${escapeHTML(isSample(article) ? 'リンクは表示例です。この記事の内容を裏付ける出典ではありません。' : article.sourceNote || '出典は各リンク先をご確認ください。')}</p></div><a class="return-link" href="#">← 一覧に戻る</a>`;
    }
    window.scrollTo(0, 0);
    $('detail').focus({preventScroll: true});
  }
  $('categories').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    category = button.dataset.category;
    renderCategories();
    [...$('categories').children].find(item => item.dataset.category === category)?.focus();
    renderList();
  });
  $('search').addEventListener('input', renderList);
  $('date').addEventListener('change', renderList);
  window.addEventListener('hashchange', route);
  async function loadArticles() {
    $('notice').textContent = '記事を読み込み中…';
    try {
      const response = await fetch('./data/articles.json?v=20261025-readability4', {credentials: 'omit'});
      if (!response.ok) throw new Error('Article data unavailable');
      const data = await response.json();
      if (!Array.isArray(data.categories) || !Array.isArray(data.articles)) throw new Error('Invalid article data');
      categories = data.categories;
      articles = [...data.articles].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      const dates = [...new Set(articles.map(article => dayLabel(article.publishedAt)))].sort().reverse();
      $('date').innerHTML = '<option value="">すべて</option>' + dates.map(date => `<option value="${escapeHTML(date)}">${escapeHTML(date)}</option>`).join('');
      renderCategories();
      renderList();
      $('search').disabled = false;
      $('date').disabled = false;
      $('notice').textContent = '';
      ready = true;
      route();
    } catch {
      $('notice').textContent = '記事データを読み込めませんでした。接続を確認して再試行してください。';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '再試行';
      retry.addEventListener('click', loadArticles);
      $('notice').append(' ', retry);
    }
  }
  loadArticles();
})();
