const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const production = JSON.parse(fs.readFileSync(path.join(root, 'data/sets.json'), 'utf8'));
const groups = [
  ['メジャーバフ', 'バフ（強）：勇気 / Major Courage'],
  ['マイナーバフ', 'バフ（弱）：威力 / Minor Force'],
  ['メジャーデバフ', 'デバフ（強）：侵害 / Major Breach'],
  ['マイナーデバフ', 'デバフ（弱）：不確実 / Minor Uncertainty']
];
const fixture = {version: 1, sets: Array.from({length:49}, (_, i) => ({
  ...production.sets[0], id: `fixture-${i}`, name: `テスト装備${i}`, englishName: `Fixture ${i}`,
  category: '軽装', summary: 'テスト用のセット',
  browseTags: [groups[i % 4][0], groups[i % 4][1] + (i < 4 ? '' : ` ${i}`), ...(i === 0 ? ['ペット','軽攻撃','重攻撃'] : [])]
}))};
function harness(data) {
  const nodes = new Map(), events = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {value:'', innerHTML:'', textContent:'', hidden:false, disabled:true, events:{}, links:[],
      addEventListener(k,v) {this.events[k]=v;}, focus() {this.focused=true;}, append() {}, querySelectorAll() {return this.links;}});
    return nodes.get(id);
  };
  const context = vm.createContext({URL, URLSearchParams, HTMLImageElement: class {},
    location: {hash:''}, history: {replaceState(a,b,url) {context.location.hash=url;}},
    document: {getElementById:node, addEventListener() {}, createElement: () => node('retry')},
    window: {addEventListener(k,v) {events[k]=v;},scrollTo() {}},
    fetch: async () => ({ok:true,json:async () => data})});
  const source=fs.readFileSync(path.join(root,'eso.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/, '  globalThis.api = {load, route, filter, renderList};\n})();');
  vm.runInContext(source,context);
  return {node,context,api:context.api,events};
}
test('650 current sets render with existing categories, search, detail and back', async () => {
  const {node,api,context}=harness(production);
  await api.load();
  assert.equal(production.sets.length,650);
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,650);
  node('set-category').value='ペット'; api.filter();
  const expected=production.sets.filter(s=>s.category==='ペット'||s.browseTags?.includes('ペット')).length;
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,expected);
  node('set-search').value='__no_such_set__'; node('set-search').events.input();
  assert.ok(node('sets').innerHTML.includes('class="empty"'));
  node('set-reset').events.click(); assert.equal(context.location.hash,'#');
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,650);
  context.location.hash='#set/'+production.sets[0].id; api.route();
  assert.equal(node('sets-home').hidden,true); assert.ok(node('set-detail').innerHTML.includes('セットボーナス・発動条件'));
  assert.ok(node('set-detail').innerHTML.includes('href="#"'));
  context.location.hash='#'; api.route(); assert.equal(node('sets-home').hidden,false);
});
test('49 effect tags form four collapsed groups, escaped labels and encoded URLs', async () => {
  const {node,api}=harness(fixture); await api.load();
  const html=node('effect-filters').innerHTML;
  assert.equal((html.match(/<details>/g)||[]).length,4);
  assert.equal((html.match(/data-effect=/g)||[]).length,53);
  assert.ok(!html.includes('<details open'));
  for(const [group,tag] of groups) {
    assert.ok(html.includes(`href="#?effect=${encodeURIComponent(group)}"`));
    assert.ok(html.includes(`href="#?effect=${encodeURIComponent(tag)}"`));
    assert.ok(node('set-category').innerHTML.includes(tag));
  }
  const unsafe='バフ（強）：<img src=x onerror="bad"> & テスト';
  const data={version:1,sets:[{...fixture.sets[0],browseTags:['メジャーバフ',unsafe]}]};
  const other=harness(data); await other.api.load();
  assert.ok(other.node('effect-filters').innerHTML.includes('&lt;img'));
  assert.ok(!other.node('effect-filters').innerHTML.includes('<img'));
  assert.ok(other.node('effect-filters').innerHTML.includes(encodeURIComponent(unsafe)));
});
test('effect links preserve search, select synchronization, URL restoration and reset', async () => {
  const {node,api,context}=harness(fixture); await api.load();
  const tag=groups[0][1], detail={open:false};
  const link={dataset:{effect:tag}, attrs:{}, setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];},closest(){return detail;}};
  node('effect-filters').links=[link];
  node('set-search').value='Fixture 0'; api.filter();
  assert.equal(new URLSearchParams(link.attrs.href.slice(2)).get('effect'),tag);
  assert.equal(new URLSearchParams(link.attrs.href.slice(2)).get('q'),'Fixture 0');
  context.location.hash=link.attrs.href; api.route();
  assert.equal(node('set-effect').value,tag); assert.equal(node('set-search').value,'Fixture 0');
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,1);
  assert.equal(link.attrs['aria-current'],'true'); assert.equal(detail.open,true);
  const back=context.location.hash;
  context.location.hash='#set/fixture-0'; api.route();
  assert.ok(node('set-detail').innerHTML.includes('effect='));
  context.location.hash=back; api.route(); assert.equal(node('set-effect').value,tag);
  node('set-reset').events.click(); assert.equal(node('set-category').value,''); assert.equal(node('set-search').value,'');
  assert.equal(link.attrs['aria-current'],undefined);
  for(const [group] of groups) {
    context.location.hash='#?category='+encodeURIComponent(group); api.route();
    assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,fixture.sets.filter(s=>s.browseTags.includes(group)).length);
  }
});
test('thumbnail grid affects news only at desktop and mobile widths; effects stay bounded', () => {
  const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
  const shared=[...css.matchAll(/(?:^|[}])\.news-card\{([^}]+)\}/g)].map(m=>m[1]);
  assert.ok(shared.some(rule=>rule.includes('background:')));
  assert.ok(shared.every(rule=>!/(?:display:grid|grid-template-columns)/.test(rule)));
  assert.ok(css.includes('#articles .news-card{display:grid;'));
  assert.ok(css.includes('@media(max-width:700px){#articles .news-card{grid-template-columns:minmax(0,1fr)'));
  assert.match(css,/\.effect-filters nav\{[^}]*max-height:280px;overflow:auto/);
  for(const file of ['index.html','eso.html']) assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes('style.css?v=20261027-eso-filters1'));
});
