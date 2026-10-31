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
  let threadsScript = null;
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
  const DAY_MS = 86400000, JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  function isNewArticle(article, now = Date.now()) {
    // Require an explicit timezone so malformed or local-time dates cannot be marked NEW.
    const value = article.publishedAt;
    if (typeof value !== 'string') return false;
    const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const monthDays = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > monthDays[month - 1]) return false;
    const published = Date.parse(value);
    return Number.isFinite(published) && Number.isFinite(now) && published <= now &&
      Math.floor((published + JST_OFFSET_MS) / DAY_MS) === Math.floor((now + JST_OFFSET_MS) / DAY_MS);
  }
  function newBadge(article, now = Date.now()) {
    return `<span class="news-new" data-published-at="${escapeHTML(article.publishedAt)}" aria-label="今日公開された新着記事（日本時間）"${isNewArticle(article, now) ? '' : ' hidden'}>NEW</span>`;
  }
  function refreshNewBadges(now = Date.now()) {
    document.querySelectorAll('.news-new[data-published-at]').forEach(badge => {
      badge.hidden = !isNewArticle({publishedAt: badge.dataset.publishedAt}, now);
    });
  }
  function untilNextJSTDay(now = Date.now()) {
    return DAY_MS - ((now + JST_OFFSET_MS) % DAY_MS) + 20;
  }
  let newBadgeTimer;
  function scheduleNewBadges() {
    if (typeof window.setTimeout !== 'function') return;
    window.clearTimeout(newBadgeTimer);
    // Minute checks also pick up clock changes; midnight is refreshed immediately.
    newBadgeTimer = window.setTimeout(() => {
      refreshNewBadges();
      scheduleNewBadges();
    }, Math.min(60000, untilNextJSTDay()));
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { refreshNewBadges(); scheduleNewBadges(); }
  });
  window.addEventListener('focus', () => { refreshNewBadges(); scheduleNewBadges(); });
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
  function glossaryTerms(block) {
    const seen = new Set();
    return (Array.isArray(block.terms) ? block.terms : []).filter(term => {
      if (!term || typeof term.text !== 'string' || !term.text.trim() || term.text.length > 80 ||
          typeof term.definition !== 'string' || !term.definition.trim() || term.definition.length > 240 || seen.has(term.text)) return false;
      seen.add(term.text);
      return true;
    });
  }
  function glossaryMarkup(term, link = '') {
    const text = escapeHTML(term.text), definition = escapeHTML(term.definition.trim());
    const button = link ? `<button type="button" class="glossary-trigger glossary-info" aria-label="${text}の用語解説" aria-expanded="false">?</button>` :
      `<button type="button" class="glossary-trigger" aria-label="${text}の用語解説" aria-expanded="false">${text}</button>`;
    return `<span class="glossary-term" data-term="${text}" data-definition="${definition}">${link}${button}</span>`;
  }
  function termText(text, terms) {
    let result = '', offset = 0;
    while (offset < text.length) {
      let next = null;
      for (const term of terms) {
        const index = text.indexOf(term.text, offset);
        if (index !== -1 && (!next || index < next.index || (index === next.index && term.text.length > next.text.length))) next = {...term, index};
      }
      if (!next) return result + escapeHTML(text.slice(offset));
      result += escapeHTML(text.slice(offset, next.index)) + glossaryMarkup(next);
      offset = next.index + next.text.length;
    }
    return result;
  }
  function linkedText(block) {
    const text = String(block.text ?? ''), terms = glossaryTerms(block);
    const links = (Array.isArray(block.links) ? block.links : []).flatMap(link => {
      if (!link || typeof link.text !== 'string' || !link.text) return [];
      const href = explanationURL(link.url);
      return href ? [{text: link.text, href}] : [];
    });
    let result = '', offset = 0;
    // Resolve existing links first. Terms never split a link or create nested controls.
    while (offset < text.length) {
      let next = null;
      for (const link of links) {
        const index = text.indexOf(link.text, offset);
        if (index !== -1 && (!next || index < next.index || (index === next.index && link.text.length > next.text.length))) next = {...link, index};
      }
      if (!next) return result + termText(text.slice(offset), terms);
      const anchor = `<a href="${escapeHTML(next.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(next.text)}</a>`;
      const term = terms.find(item => item.text === next.text);
      result += termText(text.slice(offset, next.index), terms) + (term ? glossaryMarkup(term, anchor) : anchor);
      offset = next.index + next.text.length;
    }
    return result;
  }
  // One text-only tooltip lives under body, outside article/card overflow containers.
  let glossaryPopup = null, activeTerm = null, glossaryPinned = false, glossaryHideTimer;
  function glossaryOwner(target) { return target?.closest?.('.glossary-term') || null; }
  function positionGlossary() {
    if (!activeTerm || !glossaryPopup) return;
    const rect = activeTerm.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || document.documentElement.clientWidth;
    const height = viewport?.height || window.innerHeight;
    const gap = 8, edge = 12;
    glossaryPopup.style.maxWidth = `${Math.max(1, width - edge * 2)}px`;
    glossaryPopup.style.maxHeight = `${Math.max(1, height - edge * 2)}px`;
    // Measure after applying the current viewport constraints (rotation / zoom).
    const size = glossaryPopup.getBoundingClientRect();
    const x = Math.max(left + edge, Math.min(rect.left, left + width - size.width - edge));
    const below = rect.bottom + gap;
    const y = below + size.height <= top + height - edge ? below : rect.top - size.height - gap;
    glossaryPopup.style.left = `${x}px`;
    glossaryPopup.style.top = `${Math.max(top + edge, Math.min(y, top + height - size.height - edge))}px`;
  }
  function closeGlossary() {
    if (typeof window.clearTimeout === 'function') window.clearTimeout(glossaryHideTimer);
    if (activeTerm) {
      activeTerm.querySelectorAll('button, a').forEach(control => control.removeAttribute('aria-describedby'));
      activeTerm.querySelector('button').setAttribute('aria-expanded', 'false');
    }
    if (glossaryPopup) glossaryPopup.hidden = true;
    activeTerm = null;
    glossaryPinned = false;
  }
  function openGlossary(term, pinned = false) {
    if (!term?.dataset.definition) return;
    if (typeof window.clearTimeout === 'function') window.clearTimeout(glossaryHideTimer);
    if (activeTerm !== term) closeGlossary();
    if (!glossaryPopup) {
      glossaryPopup = document.createElement('div');
      glossaryPopup.id = 'news-glossary-popup';
      glossaryPopup.className = 'news-glossary-popup';
      glossaryPopup.setAttribute('role', 'tooltip');
      document.body.append(glossaryPopup);
    }
    activeTerm = term;
    glossaryPinned = glossaryPinned || pinned;
    glossaryPopup.textContent = `${term.dataset.term}：${term.dataset.definition}`;
    glossaryPopup.hidden = false;
    term.querySelectorAll('button, a').forEach(control => control.setAttribute('aria-describedby', glossaryPopup.id));
    term.querySelector('button').setAttribute('aria-expanded', 'true');
    positionGlossary();
  }
  function deferGlossaryClose() {
    if (!activeTerm || glossaryPinned || activeTerm.contains(document.activeElement)) return;
    glossaryHideTimer = window.setTimeout(closeGlossary, 180);
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (glossaryPopup?.contains(event.target)) { window.clearTimeout(glossaryHideTimer); return; }
    const term = glossaryOwner(event.target);
    if (term && !term.contains(event.relatedTarget)) openGlossary(term);
  });
  document.addEventListener('pointerout', event => {
    const term = glossaryOwner(event.target);
    if ((term && !term.contains(event.relatedTarget)) ||
        (glossaryPopup?.contains(event.target) && !glossaryPopup.contains(event.relatedTarget))) deferGlossaryClose();
  });
  document.addEventListener('focusin', event => {
    const term = glossaryOwner(event.target);
    if (term) openGlossary(term);
    else closeGlossary();
  });
  document.addEventListener('focusout', event => {
    if (activeTerm && !activeTerm.contains(event.relatedTarget)) closeGlossary();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.glossary-trigger');
    if (button) {
      const term = glossaryOwner(button);
      if (activeTerm === term && glossaryPinned) closeGlossary(); else openGlossary(term, true);
    } else if (!activeTerm?.contains(event.target) && !glossaryPopup?.contains(event.target)) closeGlossary();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeTerm) { closeGlossary(); event.preventDefault(); }
  });
  window.addEventListener('resize', positionGlossary);
  window.addEventListener('scroll', positionGlossary, {passive: true});
  window.visualViewport?.addEventListener('resize', positionGlossary);
  window.visualViewport?.addEventListener('scroll', positionGlossary);
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
  const isVideoId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
  function videoFrame(id, label, loading) {
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${escapeHTML(label)}" loading="${loading}" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  function videoEmbed(article, bodyVideos = new Set()) {
    const id = article.videoId;
    // A video placed inside the body is shown there only, never again at the top.
    if (!isVideoId(id) || bodyVideos.has(id)) return '';
    return videoFrame(id, article.videoTitle || article.title, 'eager');
  }
  const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
  function youtubeVideo(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !youtubeHosts.includes(url.hostname)) return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] :
      url.pathname === '/watch' ? url.searchParams.get('v') : null;
    return isVideoId(id) ? {id, href: `https://www.youtube.com/watch?v=${id}`} : null;
  }
  function youtubeBlockVideo(block, sources) {
    // The ID, the original URL and a recorded source must all name the same video.
    const video = youtubeVideo(block?.url);
    if (!video || block.videoId !== video.id || !sources.some(source => youtubeVideo(source?.url)?.id === video.id)) return null;
    return video;
  }
  function bodyVideoIds(blocks, sources = []) {
    return new Set(blocks.filter(block => block?.type === 'youtube').map(block => youtubeBlockVideo(block, sources)?.id).filter(Boolean));
  }
  function youtubeBlockEmbed(block, seen, sources) {
    const video = youtubeBlockVideo(block, sources);
    if (!video || seen.has(video.id)) return '';
    seen.add(video.id);
    const label = typeof block.title === 'string' && block.title.trim() ? block.title : 'YouTube動画';
    return `${videoFrame(video.id, label, 'lazy')}<p class="video-link"><a href="${video.href}" target="_blank" rel="noopener noreferrer">YouTubeで元動画を見る ↗</a></p>`;
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
  const threadsHosts = ['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'];
  function threadsPost(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !threadsHosts.includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:@([A-Za-z0-9_.]{1,30})\/post|t)\/([A-Za-z0-9_-]{1,64})\/?$/);
    if (!match) return null;
    const path = match[1] ? `@${match[1]}/post` : 't';
    return {id: match[2], href: `https://www.threads.com/${path}/${match[2]}`};
  }
  function threadsPostEmbed(block, seen, sources) {
    const post = threadsPost(block.url);
    // Bind every embed to an explicitly recorded source, not arbitrary block HTML.
    if (!post || seen.has(post.id) || !sources.some(source => threadsPost(source?.url)?.href === post.href)) return '';
    seen.add(post.id);
    const href = escapeHTML(post.href);
    return `<figure class="threads-embed"><blockquote id="threads-post-${post.id}" class="text-post-media" data-text-post-permalink="${href}"${dark ? ' data-theme="dark"' : ''}><p>Threadsの元投稿</p><a href="${href}" target="_blank" rel="noopener noreferrer">Threadsで元投稿を見る ↗</a></blockquote><figcaption><a href="${href}" target="_blank" rel="noopener noreferrer">Threadsで元投稿を見る ↗</a><span>（表示できない場合はリンク先で確認できます）</span></figcaption></figure>`;
  }
  function loadThreadsWidgets(container) {
    const token = xRenderToken;
    if (!container || !container.querySelector('blockquote.text-post-media')) return;
    const run = () => {
      if (token !== xRenderToken || !container.isConnected) return;
      // Meta's official embed.js registers its Threads scanner on this shared API.
      try { window.instgrm?.Embeds?.process(); } catch {}
    };
    if (threadsScript) {
      if (threadsScript.dataset.loaded === 'true') run();
      else threadsScript.addEventListener('load', run, {once: true});
      return;
    }
    threadsScript = document.createElement('script');
    threadsScript.id = 'threads-wjs';
    threadsScript.src = 'https://www.threads.com/embed.js';
    threadsScript.async = true;
    threadsScript.addEventListener('load', () => {
      threadsScript.dataset.loaded = 'true';
      run();
    }, {once: true});
    // A denied/failed script leaves both source links intact; never retry-loop.
    document.head.append(threadsScript);
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
    $('articles').innerHTML = visible.map(article => `<article class="news-card"><a class="news-card-thumb" href="#article/${encodeURIComponent(article.id)}" aria-label="${escapeHTML(article.title)}（記事を開く）">${thumbnail(article)}</a><div class="news-card-copy">${metadata(article)}<h2><a href="#article/${encodeURIComponent(article.id)}">${escapeHTML(article.title)}</a>${newBadge(article)}</h2><p>${escapeHTML(article.summary)}</p><div class="source">${article.sources.map(sourceLink).join(' · ')}</div></div></article>`).join('') || '<div class="empty">該当する記事はない。検索語・ジャンル・掲載日付を変更すると、別の条件で探せる。</div>';
    $('count').textContent = `${filtered.length} / ${articles.length} 件の記事${filtered.length ? `（${start + 1}〜${start + visible.length}件目）` : ''}`;
    for (const suffix of ['', '-top']) {
      $('pagination' + suffix).hidden = pageCount <= 1;
      $('page-status' + suffix).textContent = `${page} / ${pageCount} ページ`;
      $('page-prev' + suffix).disabled = page <= 1;
      $('page-next' + suffix).disabled = page >= pageCount;
    }
    $('end-note').hidden = filtered.length === 0 || page < pageCount;
  }
  function renderBlocks(blocks, sources = []) {
    const seenPosts = new Set(), seenThreads = new Set(), seenVideos = new Set();
    return blocks.map(block => {
      if (block.type === 'xpost') return xPostEmbed(block, seenPosts);
      if (block.type === 'youtube') return youtubeBlockEmbed(block, seenVideos, sources);
      if (block.type === 'threadspost') return threadsPostEmbed(block, seenThreads, sources);
      if (block.type === 'feature') {
        return `<p class="feature"><strong>${escapeHTML(block.label)}</strong>：${linkedText(block)}</p>`;
      }
      const tag = block.type === 'heading' ? 'h2' : block.type === 'quote' ? 'blockquote' : 'p';
      return `<${tag}>${linkedText(block)}</${tag}>`;
    }).join('');
  }
  function route() {
    if (!ready) return;
    closeGlossary();
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
      $('detail').innerHTML = `<a class="back" href="#">← 一覧に戻る</a>${metadata(article)}<h1>${escapeHTML(article.title)}${newBadge(article)}</h1>${thumbnail(article, true)}${videoEmbed(article, bodyVideoIds(article.blocks, article.sources))}<p class="lead">${escapeHTML(article.summary)}</p><div class="article-body">${renderBlocks(article.blocks, article.sources)}</div><div class="source-box"><strong>${isSample(article) ? 'サンプルの参考リンク' : '出典・参考リンク'}</strong><ul>${article.sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul><p>${escapeHTML(isSample(article) ? 'リンクは表示例です。この記事の内容を裏付ける出典ではありません。' : article.sourceNote || '出典は各リンク先をご確認ください。')}</p></div><a class="return-link" href="#">← 一覧に戻る</a>`;
    }
    window.scrollTo(0, 0);
    $('detail').focus({preventScroll: true});
    loadXWidgets($('detail').querySelector('.article-body'));
    loadThreadsWidgets($('detail').querySelector('.article-body'));
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
  for (const suffix of ['', '-top']) {
    $('page-prev' + suffix).addEventListener('click', () => changePage(-1));
    $('page-next' + suffix).addEventListener('click', () => changePage(1));
  }
  window.addEventListener('hashchange', route);
  async function loadArticles() {
    $('notice').textContent = '記事を読み込み中…';
    try {
      const response = await fetch('./data/articles.json?v=20261029-thumb-link1', {credentials: 'omit'});
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
      scheduleNewBadges();
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



