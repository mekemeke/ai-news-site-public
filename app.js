'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const title = 'AIニュース | 仮公開プレビュー';
  const dateFormat = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
  let categories = [], articles = [], category = '', listY = 0, lastArticle = '', ready = false;
  const PAGE_SIZE = 15;
  let page = 1, pageCount = 1;
  let xRenderToken = 0, xScript = null;
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
  function explanationURL(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    const host = url.hostname.toLowerCase();
    // Public DNS names only: reject IP literals (including URL-normalized numeric IPs),
    // credentials, nonstandard ports and reserved/internal namespace labels.
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
        /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa)(\.|$)/.test(host)) return null;
    return url.href;
  }
  function linkedText(block) {
    const text = String(block.text ?? '');
    const links = (Array.isArray(block.links) ? block.links : []).flatMap(link => {
      if (!link || typeof link.text !== 'string' || !link.text) return [];
      const href = explanationURL(link.url);
      return href ? [{text: link.text, href}] : [];
    });
    let result = '', offset = 0;
    while (offset < text.length) {
      let next = null;
      for (const link of links) {
        const index = text.indexOf(link.text, offset);
        if (index !== -1 && (!next || index < next.index || (index === next.index && link.text.length > next.text.length))) next = {...link, index};
      }
      if (!next) return result + escapeHTML(text.slice(offset));
      result += escapeHTML(text.slice(offset, next.index)) + `<a href="${escapeHTML(next.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(next.text)}</a>`;
      offset = next.index + next.text.length;
    }
    return result;
  }
  function thumbnail(article, detail = false) {
    const field = article.category === 'eso' ? 'eso' : ['3dcg', 'terrain', 'cg'].includes(article.category) ? 'cg' : 'ai';
    const kind = ['roundup', 'tips', 'tip', 'digest', '小ネタ'].includes(article.kind) ? 'tips' : 'news';
    const aliases = {'ai-product': 'ai-news', 'cg-product': 'cg-news', 'terrain-product': 'cg-news', 'eso-official': 'eso-news'};
    const requested = typeof article.thumbnailKey === 'string' ? article.thumbnailKey : '';
    const key = /^(ai|cg|eso)-(tips|news)$/.test(requested) ? requested : Object.hasOwn(aliases, requested) ? aliases[requested] : `${field}-${kind}`;
    const fallback = `assets/news/${key}.svg`;
    const fallbackAlt = `${key.split('-')[0].toUpperCase()} ${key.endsWith('-tips') ? '小ネタ' : 'ニュース'}（共通文字カード）`;
    const valid = typeof article.thumbnail === 'string' && /^assets\/news\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(svg|png|jpe?g|webp)$/.test(article.thumbnail) && typeof article.thumbnailAlt === 'string' && article.thumbnailAlt.trim();
    return `<img class="news-thumbnail" src="${valid ? article.thumbnail : fallback}" alt="${escapeHTML(valid ? article.thumbnailAlt : fallbackAlt)}" width="800" height="450" loading="${detail ? 'eager' : 'lazy'}" decoding="async" data-fallback="${fallback}" data-fallback-alt="${fallbackAlt}">`;
  }
  // Capture image errors without inline handlers (the existing CSP remains unchanged).
  document.addEventListener('error', event => {
    const image = event.target;
    if (!image.matches?.('img.news-thumbnail') || !image.dataset.fallback) return;
    const fallback = image.dataset.fallback;
    delete image.dataset.fallback;
    image.alt = image.dataset.fallbackAlt;
    if (image.getAttribute('src') !== fallback) image.src = fallback;
  }, true);
  function videoEmbed(article) {
    const id = article.videoId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return '';
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${escapeHTML(article.videoTitle || article.title)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  const xHosts = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'];
  function xPost(value) {
    if (typeof value !== 'string') return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !xHosts.includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})\/?$/);
    if (!match) return null;
    // IDは桁落ちを避けるため文字列のまま扱う
    return {user: match[1], id: match[2], href: `https://x.com/${match[1]}/status/${match[2]}`};
  }
  function xPostEmbed(block, seen) {
    const post = xPost(block.url);
    if (!post || seen.has(post.id)) return '';
    seen.add(post.id);
    const link = `<a href="${post.href}" target="_blank" rel="noopener noreferrer">`;
    return `<figure class="x-embed"><blockquote class="twitter-tweet" data-dnt="true" data-lang="ja"${dark ? ' data-theme="dark"' : ''}><p>@${post.user} のX投稿（埋め込みを表示できない場合は下のリンクから確認できます）</p><a href="https://twitter.com/${post.user}/status/${post.id}">https://x.com/${post.user}/status/${post.id}</a></blockquote><figcaption>${link}Xで元投稿を見る ↗</a></figcaption></figure>`;
  }
  function loadXWidgets(container) {
    const token = xRenderToken;
    if (!container || !container.querySelector('blockquote.twitter-tweet')) return;
    const run = () => {
      if (token !== xRenderToken || !container.isConnected) return;
      try { window.twttr.widgets.load(container); } catch {}
    };
    if (window.twttr?.widgets?.load) { run(); return; }
    if (!xScript) {
      xScript = document.createElement('script');
      xScript.id = 'twitter-wjs';
      xScript.src = 'https://platform.twitter.com/widgets.js';
      xScript.async = true;
      xScript.charset = 'utf-8';
      document.head.append(xScript);
    }
    xScript.addEventListener('load', () => {
      if (window.twttr?.ready) window.twttr.ready(run); else run();
    }, {once: true});
  }
  function metadata(article) {
    const sample = isSample(article);
    return `<div class="meta"><span class="category">${escapeHTML(categoryName(article.category))}</span><span class="status">${sample ? '架空サンプル' : 'ニュース・動画紹介'}</span><time datetime="${escapeHTML(article.publishedAt)}">${sample ? 'サンプル日時' : '記事掲載'} ${escapeHTML(dateLabel(article.publishedAt))} JST</time></div>`;
  }
  function renderCategories() {
    $('categories').innerHTML = [{id: '', name: 'すべて'}, ...categories].map(item => `<button type="button" data-category="${escapeHTML(item.id)}" aria-pressed="${item.id === category}">${escapeHTML(item.name)}</button>`).join('');
  }
  function renderList() {
    const query = $('search').value.trim().toLocaleLowerCase('ja');
    const date = $('date').value;
    const filtered = articles.filter(article => (!category || article.category === category) && (!date || dayLabel(article.publishedAt) === date) && (!query || [article.title, article.summary, categoryName(article.category), ...article.blocks.map(block => block.text)].join(' ').toLocaleLowerCase('ja').includes(query)));
    pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), pageCount);
    const start = (page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    $('articles').innerHTML = visible.map(article => `<article class="news-card">${thumbnail(article)}<div class="news-card-copy">${metadata(article)}<h2><a href="#article/${encodeURIComponent(article.id)}">${escapeHTML(article.title)}</a></h2><p>${escapeHTML(article.summary)}</p><div class="source">${article.sources.map(sourceLink).join(' · ')}</div></div></article>`).join('') || '<div class="empty">該当する記事はない。検索語・ジャンル・掲載日付を変更すると、別の条件で探せる。</div>';
    $('count').textContent = `${filtered.length} / ${articles.length} 件の記事${filtered.length ? `（${start + 1}〜${start + visible.length}件目）` : ''}`;
    $('pagination').hidden = pageCount <= 1;
    $('page-status').textContent = `${page} / ${pageCount} ページ`;
    $('page-prev').disabled = page <= 1;
    $('page-next').disabled = page >= pageCount;
    $('end-note').hidden = filtered.length === 0 || page < pageCount;
  }
  function renderBlocks(blocks) {
    const seenPosts = new Set();
    return blocks.map(block => {
      if (block.type === 'xpost') return xPostEmbed(block, seenPosts);
      if (block.type === 'feature') {
        return `<p class="feature"><strong>${escapeHTML(block.label)}</strong>：${linkedText(block)}</p>`;
      }
      const tag = block.type === 'heading' ? 'h2' : block.type === 'quote' ? 'blockquote' : 'p';
      return `<${tag}>${linkedText(block)}</${tag}>`;
    }).join('');
  }
  function route() {
    if (!ready) return;
    xRenderToken++;
    const match = location.hash.match(/^#article\/(.*)$/);
    const isDetail = !!match;
    const wasDetail = !$('detail').hidden;
    if (isDetail && !$('home').hidden) { listY = window.scrollY; lastArticle = match[1]; }
    document.querySelector('.toolbar').hidden = isDetail;
    $('home').hidden = isDetail;
    $('detail').hidden = !isDetail;
    if (!isDetail) {
      document.title = title;
      if (wasDetail && lastArticle) {
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
      $('detail').innerHTML = `<a class="back" href="#">← 一覧に戻る</a>${metadata(article)}<h1>${escapeHTML(article.title)}</h1>${thumbnail(article, true)}${videoEmbed(article)}<p class="lead">${escapeHTML(article.summary)}</p><div class="article-body">${renderBlocks(article.blocks)}</div><div class="source-box"><strong>${isSample(article) ? 'サンプルの参考リンク' : '出典・参考リンク'}</strong><ul>${article.sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul><p>${escapeHTML(isSample(article) ? 'リンクは表示例です。この記事の内容を裏付ける出典ではありません。' : article.sourceNote || '出典は各リンク先をご確認ください。')}</p></div><a class="return-link" href="#">← 一覧に戻る</a>`;
    }
    window.scrollTo(0, 0);
    $('detail').focus({preventScroll: true});
    loadXWidgets($('detail').querySelector('.article-body'));
  }
  $('categories').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    category = button.dataset.category;
    page = 1;
    renderCategories();
    [...$('categories').children].find(item => item.dataset.category === category)?.focus();
    renderList();
  });
  function resetPage() { page = 1; renderList(); }
  $('search').addEventListener('input', resetPage);
  $('date').addEventListener('change', resetPage);
  function changePage(delta) {
    const next = Math.min(Math.max(1, page + delta), pageCount);
    if (next === page) return;
    page = next;
    renderList();
    $('list-title').focus({preventScroll: true});
    $('list-title').scrollIntoView({block: 'start'});
  }
  $('page-prev').addEventListener('click', () => changePage(-1));
  $('page-next').addEventListener('click', () => changePage(1));
  window.addEventListener('hashchange', route);
  async function loadArticles() {
    $('notice').textContent = '記事を読み込み中…';
    try {
      const response = await fetch('./data/articles.json?v=20261026-xembed1', {credentials: 'omit'});
      if (!response.ok) throw new Error('Article data unavailable');
      const data = await response.json();
      if (!Array.isArray(data.categories) || !Array.isArray(data.articles)) throw new Error('Invalid article data');
      categories = data.categories;
      articles = data.articles.filter(article => !isSample(article)).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
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

