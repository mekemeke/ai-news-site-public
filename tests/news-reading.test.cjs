const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function harness() {
  const nodes = new Map(), events = {}, windowEvents = {}, timers = new Map(), badges = [], scrolls = [];
  let timerId = 0, clock = Date.parse('2026-10-28T14:59:59.990Z');
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.attributes = {};
      this.style = {}; this.events = {}; this.hidden = false; this.value = ''; this.textContent = ''; this.innerHTML = '';
      this.className = ''; this.parentElement = null; this.rect = {left:280,top:440,bottom:460,width:40,height:20};
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(k, v) { this.events[k] = v; }
    append(child) { if (child && typeof child === 'object') {this.children.push(child); child.parentElement = this;} }
    contains(other) { return other === this || this.children.some(child => child.contains(other)); }
    closest(selector) { return this.className.split(' ').includes(selector.slice(1)) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) {
      const tags = selector.split(',').map(s => s.trim().toUpperCase());
      return this.children.flatMap(child => [...(tags.includes(child.tagName) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    getBoundingClientRect() {
      if (this.className !== 'news-glossary-popup') return this.rect;
      return {width:Math.min(320, parseFloat(this.style.maxWidth) || 320), height:Math.min(100, parseFloat(this.style.maxHeight) || 100)};
    }
  }
  const node = id => {
    if (!nodes.has(id)) { const el = new Element(); el.hidden = id === 'detail'; nodes.set(id, el); }
    return nodes.get(id);
  };
  node('theme').append(new Element('span'));
  const body = new Element(); body.classList = {toggle() {}};
  const document = {getElementById:node,body,hidden:false,activeElement:null,documentElement:{clientWidth:320},
    querySelector:node,querySelectorAll:selector=>selector.startsWith('.news-new')?badges:[],
    addEventListener(k, v) {events[k] = v;},head:new Element(),createElement:tag=>new Element(tag)};
  const window = {innerHeight:500,scrollY:123,scrollTo(...args){scrolls.push(args);},addEventListener(k,v){windowEvents[k]=v;},
    setTimeout(fn, delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}};
  class FakeDate extends Date { static now() { return clock; } }
  const location = {hash:''};
  const data = {categories:[{id:'ai',name:'AI'}],articles:[{id:'new',category:'ai',title:'New title',summary:'summary',publishedAt:'2026-10-28T10:00:00+09:00',blocks:[],sources:[]}]};
  const ctx = vm.createContext({document, window, URL, Intl, Date:FakeDate, location, localStorage:{getItem(){}},
    fetch:async()=>({ok:true,json:async()=>data})});
  const code = fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/  loadArticles\(\);\r?\n\}\)\(\);/,
    '  globalThis.api={isNewArticle,newBadge,refreshNewBadges,untilNextJSTDay,scheduleNewBadges,linkedText,renderBlocks,loadArticles,route,openGlossary,closeGlossary,positionGlossary};\n})();');
  vm.runInContext(code,ctx);
  function term(text='GPU', definition='画像処理向けの計算装置。', linked=false) {
    const group = new Element('span'); group.className = 'glossary-term'; group.dataset={term:text,definition};
    if (linked) group.append(new Element('a'));
    const button = new Element('button'); button.className='glossary-trigger'; group.append(button);
    return {group,button,anchor:linked?group.children[0]:null};
  }
  return {api:ctx.api,ctx,node,document,window,location,events,windowEvents,timers,badges,scrolls,term,
    popup:()=>body.children.find(el=>el.id==='news-glossary-popup'),clock:value=>{clock=Date.parse(value);},
    runTimer(delay){const row=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(row,`timer ${delay}`);timers.delete(row[0]);row[1].fn();}};
}

test('NEW uses publishedAt and JST calendar dates, never updatedAt/future/invalid timestamps', () => {
  const {api} = harness(), now = Date.parse('2026-10-28T15:00:00Z'); // Oct 29 JST
  for (const publishedAt of ['2026-10-29T00:00:00+09:00','2026-10-28T15:00:00Z','2026-10-28T08:00:00-07:00'])
    assert.equal(api.isNewArticle({publishedAt},now),true,publishedAt);
  for (const publishedAt of ['2026-10-28T14:59:59.999Z','2026-10-29T00:00:00.001+09:00','2026-10-30T00:00:00+09:00',
    'bad','2026-10-29','2026-10-29T00:00:00','2026-02-30T00:00:00Z','2026-10-29T24:00:00Z','',null,{},42])
    assert.equal(api.isNewArticle({publishedAt,updatedAt:'2026-10-29T00:00:00+09:00'},now),false,String(publishedAt));
  assert.equal(api.isNewArticle({publishedAt:'2026-10-28T00:00:00+09:00',updatedAt:'2026-10-29T00:00:00+09:00'},now),false);
  assert.equal(api.isNewArticle({publishedAt:'2026-10-29T00:00:00+09:00'},NaN),false);
  assert.equal(api.isNewArticle({publishedAt:'2024-02-29T00:00:00+09:00'},Date.parse('2024-02-29T01:00:00+09:00')),true);
  assert.equal(api.isNewArticle({publishedAt:'2023-02-29T00:00:00+09:00'},Date.parse('2023-03-01T01:00:00+09:00')),false);
});

test('badge refresh crosses JST midnight while page stays open, without rerender/scroll/embed reset', async () => {
  const h=harness(); await h.api.loadArticles();
  assert.equal(h.api.untilNextJSTDay(Date.parse('2026-10-28T14:59:59.990Z')),30);
  const badge={dataset:{publishedAt:'2026-10-28T10:00:00+09:00'},hidden:false};h.badges.push(badge);
  const list=h.node('articles').innerHTML,detail=h.node('detail').innerHTML,scrollCount=h.scrolls.length;
  h.clock('2026-10-28T15:00:00.020Z');h.runTimer(30);
  assert.equal(badge.hidden,true);assert.equal(h.node('articles').innerHTML,list);assert.equal(h.node('detail').innerHTML,detail);assert.equal(h.scrolls.length,scrollCount);
  h.clock('2026-10-28T14:00:00Z');h.events.visibilitychange();assert.equal(badge.hidden,false);
  h.clock('2026-10-28T15:01:00Z');h.windowEvents.focus();assert.equal(badge.hidden,true);
  assert.equal(h.timers.size,1); // repeated resume never accumulates intervals
});

test('list and detail titles have red-text-labelled NEW placeholders; existing paging remains', async () => {
  const h=harness();await h.api.loadArticles();
  assert.match(h.node('articles').innerHTML, /<h2><a[^>]*>New title<\/a><span class="news-new"/);
  h.location.hash='#article/new';h.api.route();assert.match(h.node('detail').innerHTML, /<h1>New title<span class="news-new"/);
  assert.match(h.api.newBadge({publishedAt:'" onmouseover="x'},Date.now()),/data-published-at="&quot; onmouseover=&quot;x"/);
  assert.match(h.api.newBadge({publishedAt:'2026-10-28T00:00:00+09:00'},Date.parse('2026-10-29T00:00:00+09:00')),/ hidden>NEW<\/span>/);
  assert.match(fs.readFileSync(path.join(root,'style.css'),'utf8'),/\.news-new\{[^}]*background:#bf1733;color:#fff/);
});

test('structured terms escape all text/attributes, reject malformed definitions, and never interpret HTML', () => {
  const {api}=harness();
  const html=api.linkedText({text:'<GPU> and <script>',terms:[{text:'<GPU>',definition:'<img src=x onerror="alert(1)"> & safe'}]});
  assert.match(html,/data-term="&lt;GPU&gt;"/);assert.match(html,/data-definition="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; safe"/);
  assert.doesNotMatch(html,/<img|<script|onerror="alert/);
  assert.match(html,/&lt;script&gt;/);
  for(const terms of [null,{},[null,{}, {text:'GPU',definition:{}},{text:'GPU',definition:''},{text:'GPU',definition:'x'.repeat(241)},{text:' ',definition:'x'}]])
    assert.equal(api.linkedText({text:'GPU',terms}),'GPU');
  const duplicate=api.linkedText({text:'GPU',terms:[{text:'GPU',definition:'first'},{text:'GPU',definition:'second'}]});
  assert.match(duplicate,/first/);assert.doesNotMatch(duplicate,/second/);
  const longest=api.linkedText({text:'GPU model',terms:[{text:'GPU',definition:'short'},{text:'GPU model',definition:'long'}]});
  assert.equal((longest.match(/class="glossary-term"/g)||[]).length,1);assert.match(longest,/data-term="GPU model"/);
});

test('links keep href/rel/click targets; exact term adds sibling help, other overlaps keep link priority', () => {
  const {api}=harness(),url='https://docs.blender.org/?a=1&b=2';
  const html=api.linkedText({text:'GPU',links:[{text:'GPU',url}],terms:[{text:'GPU',definition:'processor'}]});
  assert.match(html,/<a href="https:\/\/docs.blender.org\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">GPU<\/a><button /);
  assert.doesNotMatch(html,/<a[^>]*>[^<]*<button/);assert.match(html,/class="glossary-trigger glossary-info"/);
  const overlap=api.linkedText({text:'GPU model',links:[{text:'GPU model',url}],terms:[{text:'GPU',definition:'processor'}]});
  assert.equal((overlap.match(/<a /g)||[]).length,1);assert.doesNotMatch(overlap,/glossary/);
  const invalid=api.linkedText({text:'GPU',links:[{text:'GPU',url:'javascript:x'}],terms:[{text:'GPU',definition:'processor'}]});
  assert.doesNotMatch(invalid,/<a /);assert.match(invalid,/glossary-trigger/);
  assert.match(api.renderBlocks([{type:'feature',label:'この記事のポイント',text:'GPU',terms:[{text:'GPU',definition:'processor'}]}]),/^<p class="feature"><strong>この記事のポイント<\/strong>：<span /);
});

test('tooltip supports focus/Escape, tap toggle/outside and linked text without stealing navigation', () => {
  const h=harness(),{group,button,anchor}=h.term('GPU','<img src=x>',true);
  h.document.activeElement=button;h.events.focusin({target:button});const popup=h.popup();
  assert.equal(popup.attributes.role,'tooltip');assert.equal(popup.textContent,'GPU：<img src=x>');assert.equal(popup.innerHTML,'');
  assert.equal(button.attributes['aria-expanded'],'true');assert.equal(button.attributes['aria-describedby'],popup.id);assert.equal(anchor.attributes['aria-describedby'],popup.id);
  let prevented=false;h.events.keydown({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(popup.hidden,true);assert.equal(h.document.activeElement,button);assert.equal(button.attributes['aria-describedby'],undefined);
  h.events.click({target:button});assert.equal(popup.hidden,false);h.events.click({target:button});assert.equal(popup.hidden,true);
  h.events.click({target:button});h.events.click({target:{closest:()=>null}});assert.equal(popup.hidden,true);
  h.events.focusin({target:anchor});h.events.click({target:anchor});assert.equal(popup.hidden,false); // no preventDefault and href untouched
  h.events.focusout({relatedTarget:null});assert.equal(popup.hidden,true);
  assert.equal(group.children.length,2);
});

test('tooltip is hoverable/persistent across trigger-popup gap and routes close it', async () => {
  const h=harness(),{group,button}=h.term();
  h.events.pointerover({target:button,pointerType:'touch',relatedTarget:null});assert.equal(h.popup(),undefined);
  h.events.pointerover({target:button,pointerType:'mouse',relatedTarget:null});const popup=h.popup();assert.equal(popup.hidden,false);
  h.events.pointerout({target:button,relatedTarget:popup});assert.equal([...h.timers.values()].filter(x=>x.delay===180).length,1);
  h.events.pointerover({target:popup,pointerType:'mouse'});assert.equal(h.timers.size,0);assert.equal(popup.hidden,false);
  h.events.pointerout({target:popup,relatedTarget:null});h.runTimer(180);assert.equal(popup.hidden,true);
  h.api.openGlossary(group);h.document.activeElement=button;h.events.pointerout({target:button,relatedTarget:null});assert.equal(h.timers.size,0);
  await h.api.loadArticles();assert.equal(popup.hidden,true);
});

test('popup is appended outside article clipping, bounded at narrow/zoomed viewport edges and repositions', () => {
  const h=harness(),{group}=h.term();h.api.openGlossary(group);const popup=h.popup();
  assert.equal(popup.parentElement,h.document.body);assert.equal(popup.style.maxWidth,'296px');assert.equal(popup.style.left,'12px');assert.equal(popup.style.top,'332px');
  h.window.visualViewport={width:240,height:180,offsetLeft:30,offsetTop:20};h.windowEvents.resize();
  assert.equal(popup.style.maxWidth,'216px');assert.equal(popup.style.maxHeight,'156px');assert.equal(popup.style.left,'42px');assert.equal(popup.style.top,'88px');
  group.rect={left:1,top:1,bottom:20};h.windowEvents.scroll();assert.equal(popup.style.top,'32px');
});

test('published roundup endings and curated glossary entries conform to renderer contract', () => {
  const {api}=harness(),data=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json'),'utf8'));
  for(const article of data.articles) {
    if(article.kind==='roundup') {
      const last=article.blocks.at(-1);assert.equal(last.type,'feature',article.id);assert.equal(last.label,'この記事のポイント',article.id);
      assert.ok(typeof last.text==='string' && last.text.trim());
    }
    for(const block of article.blocks) {
      if(!block.terms) continue;
      assert.ok(Array.isArray(block.terms));assert.equal(api.renderBlocks([block]).includes('glossary-trigger'),true,article.id);
      for(const term of block.terms) {
        assert.equal(typeof term.text,'string');assert.ok(term.text.length>0&&term.text.length<=80);
        assert.equal(typeof term.definition,'string');assert.ok(term.definition.length>0&&term.definition.length<=240);
        assert.equal(block.text.includes(term.text),true,`${article.id}: ${term.text}`);
        const escaped=term.text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        assert.ok(api.linkedText(block).includes(`data-term="${escaped}"`),`${article.id}: ${term.text} must not be hidden by link overlap`);
      }
    }
  }
});
