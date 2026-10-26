const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/articles.json')));
function harness() {
  const nodes = new Map(), events = {}, windowEvents = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML: '', textContent: '', value: '', hidden: id === 'detail', dataset: {}, events: {},
      setAttribute(k,v) {this[k] = v;}, addEventListener(k,v) {this.events[k] = v;},
      querySelector() {return node(id + '-child');}, focus() {this.focused = true;}, append() {}});
    return nodes.get(id);
  };
  const document = {getElementById: node, body: {classList: {toggle(k,v) {node('body')[k]=v;}}},
    querySelector: node, querySelectorAll: () => [], addEventListener(k,v) {events[k]=v;}, head: {append() {}}, createElement: () => node('script')};
  const context = vm.createContext({document, URL, Intl, location: {hash: ''}, localStorage: {getItem() {},setItem() {}},
    window: {scrollY: 42, scrollTo() {}, addEventListener(k,v) {windowEvents[k]=v;}}});
  let code = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  code = code.replace(/  loadArticles\(\);\r?\n\}\)\(\);/, '  globalThis.api = {explanationURL, linkedText, thumbnail, renderBlocks, route, renderList, loadArticles};\n})();');
  vm.runInContext(code, context);
  context.fetch = async () => ({ok: true,json: async () => data});
  return {context, api: context.api, node, events, windowEvents};
}
test('only ordinary HTTPS DNS URLs become explanation links', () => {
  const {api} = harness();
  for (const url of ['https://docs.blender.org/manual/ja/latest/', 'https://ja.wikipedia.org/wiki/CG?a=1&b=2']) assert.ok(api.explanationURL(url));
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///x', 'http://example.org', '//example.org',
    'https://user:pass@example.org', 'https://example.org:8443', 'https://localhost', 'https://foo.local', 'https://internal.example.org',
    'https://foo.lan', 'https://foo.home.arpa', 'https://127.0.0.1', 'https://10.0.0.1', 'https://169.254.169.254',
    'https://2130706433', 'https://0x7f000001', 'https://[::1]', 'https://[2606:4700::1111]', 'https://8.8.8.8',
    'https://example.org\\@localhost', 'https://example.org\n', 'https://example.org.', null, {}]) assert.equal(api.explanationURL(url), null, String(url));
});
test('exact matches, overlaps and escaping never interpret HTML or Markdown', () => {
  const {api} = harness();
  const url = 'https://docs.blender.org/?a=1&b=2';
  const result = api.linkedText({text: '<b>CG</b> CG cg **raw**', links: [{text:'CG',url}]});
  assert.equal((result.match(/<a /g)||[]).length, 2);
  assert.ok(result.includes('&lt;b&gt;')); assert.ok(result.includes(' cg **raw**'));
  assert.ok(result.includes('a=1&amp;b=2')); assert.ok(result.includes('rel="noopener noreferrer"'));
  assert.equal(api.linkedText({text:'CG',links:[{text:'CG',url:'javascript:alert(1)'},null,{text:'',url}]}),'CG');
  assert.equal(api.linkedText({text:'<img src=x>',links:{}}),'&lt;img src=x&gt;');
  assert.equal((api.linkedText({text:'CG model',links:[{text:'CG',url},{text:'CG model',url}]}).match(/<a /g)||[]).length,1);
  assert.ok(api.renderBlocks([{type:'feature',label:'<label>',text:'CG',links:[{text:'CG',url}]}]).includes('&lt;label&gt;</strong>：<a '));
});
test('six local fallbacks, validated image paths and load failure', () => {
  const {api,events} = harness();
  for (const field of ['ai','cg','eso']) for (const kind of ['tips','news']) {
    const key = `${field}-${kind}`;
    assert.ok(api.thumbnail({thumbnailKey:key}).includes(`src="assets/news/${key}.svg"`));
    const svg = fs.readFileSync(path.join(root,`assets/news/${key}.svg`),'utf8');
    assert.ok(svg.includes('viewBox="0 0 800 450"')); assert.doesNotMatch(svg, /<script|<image|href=|onload=/);
  }
  assert.ok(api.thumbnail({category:'terrain',kind:'roundup'}).includes('cg-tips.svg'));
  assert.ok(api.thumbnail({category:'eso'}).includes('eso-news.svg'));
  assert.ok(api.thumbnail({thumbnailKey:['cg-news']}).includes('ai-news.svg'));
  for (const [key, fallback] of Object.entries({'ai-product':'ai-news','cg-product':'cg-news','terrain-product':'cg-news','eso-official':'eso-news'})) assert.ok(api.thumbnail({thumbnailKey:key}).includes(`${fallback}.svg`));
  for (const thumbnail of ['https://x.com/a.png','assets/news/../a.png','assets/news/%2e%2e/a.png','assets/news/a.svg?x','/assets/news/a.png','assets/news/a.png"']) {
    assert.ok(api.thumbnail({thumbnail,thumbnailAlt:'x'}).includes('src="assets/news/ai-news.svg"'));
  }
  assert.ok(api.thumbnail({thumbnail:'assets/news/photo.webp',thumbnailAlt:'<photo>'}).includes('alt="&lt;photo&gt;"'));
  const image = {matches: () => true, dataset: {fallback:'assets/news/ai-news.svg',fallbackAlt:'AI'},getAttribute: () => 'assets/news/missing.png'};
  events.error({target:image}); assert.equal(image.src,'assets/news/ai-news.svg'); assert.equal(image.dataset.fallback, undefined);
});
test('existing articles, detail switching, back, search, date and dark controls', async () => {
  const {api,context,node,windowEvents} = harness();
  await api.loadArticles();
  const visible = data.articles.filter(a => !a.sample && !a.id.startsWith('sample-'));
  assert.equal((node('articles').innerHTML.match(/class="news-card"/g)||[]).length,visible.length);
  for (const article of visible.slice(0,2)) {
    context.location.hash = '#article/' + encodeURIComponent(article.id); windowEvents.hashchange();
    assert.equal(node('detail').hidden,false); assert.equal(node('home').hidden,true);
    assert.ok(node('detail').innerHTML.includes('class="news-thumbnail"'));
    assert.ok(context.document.title.startsWith(article.title));
  }
  context.location.hash = ''; windowEvents.hashchange(); assert.equal(node('home').hidden,false); assert.ok(node('main').focused);
  node('search').value='__unmatched_query__'; node('search').events.input(); assert.ok(node('articles').innerHTML.includes('class="empty"'));
  node('search').value=''; node('date').value='1900-01-01'; node('date').events.change(); assert.ok(node('articles').innerHTML.includes('class="empty"'));
  node('date').value=''; api.renderList(); assert.ok(node('articles').innerHTML.includes('news-card'));
  node('theme').events.click(); assert.equal(node('body').dark,true); assert.equal(node('theme')['aria-pressed'],'true');
  node('theme').events.click(); assert.equal(node('body').dark,false);
  const x = api.renderBlocks([{type:'xpost',url:'https://x.com/test/status/123'}, {type:'xpost',url:'https://x.com/test/status/123'}]);
  assert.equal((x.match(/class="x-embed"/g)||[]).length,1); assert.ok(x.includes('data-dnt="true"'));
});
