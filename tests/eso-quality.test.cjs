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
  const source=fs.readFileSync(path.join(root,'eso.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/, '  globalThis.api = {load, route, filter, renderList, qualityBlock, validNumericValue};\n})();');
  vm.runInContext(source,context);
  return {node,context,api:context.api,events};
}

test('quality tables contain exact five-quality samples, not multiplied endpoints', async () => {
 const {api,node,context}=harness(production); await api.load();
 assert.ok(node('set-quality-coverage').textContent.includes('608 / 650'));
 assert.equal((node('sets').innerHTML.match(/<table class="set-quality-table"/g)||[]).length,608);
 context.location.hash='#set/hundings-rage';api.route();
 const html=node('set-detail').innerHTML;
 for(const [id,value] of [['normal','261'],['fine','272'],['superior','282'],['epic','289'],['legendary','300']]) assert.match(html,new RegExp(`<td class="set-quality-${id}"><span[^>]*>${value}</span>`));
 assert.ok(html.includes('CP160')); assert.ok(html.includes('— は未確認'));
});
test('source values preserve perfected rows, mythic fixed quality, units and conditions', () => {
 const {api}=harness(production),sets=new Map(production.sets.map(s=>[s.id,s]));
 const lucent=api.qualityBlock(sets.get('lucent-echoes'),true);
 assert.ok(lucent.includes('完璧版追加'));assert.ok(lucent.includes('完璧版5部位が必要'));assert.ok(lucent.includes('品質の完璧版が入手できることを示さない'));
 const mythic=api.qualityBlock(sets.get('ring-of-the-wild-hunt'));
 assert.ok(mythic.includes('15%'));assert.ok(mythic.includes('45%'));assert.ok(mythic.includes('金相当'));assert.ok(mythic.includes('専用表示は橙')||mythic.includes('秘術表示は橙'));
 assert.equal((mythic.match(/>対象外</g)||[]).length,8);
 const pale=sets.get('ring-of-the-pale-order').numericValue.rows;
 assert.equal(pale.find(x=>x.label.includes('味方1人')).unit,'ポイント');
 assert.ok(api.qualityBlock(sets.get('powerful-assault')).includes('発動条件・対象・制約は本文'));
});
test('unknown does not claim a constant value or unavailable quality', () => {
 const {api}=harness(production);const item=production.sets.find(x=>x.id==='earthgore');
 const html=api.qualityBlock(item);assert.ok(html.includes('数値は未確認'));assert.ok(!html.includes('<table'));assert.ok(html.includes('推定配分していない'));
});
test('quality content is escaped and dangerous sources are not linked', () => {
 const {api}=harness(production);const item=structuredClone(production.sets[0]);
 item.numericValue.rows[0].label='<img src=x onerror="bad">';item.numericValue.basis='<script>bad</script>';item.numericValue.notes=['<svg onload=bad>'];
 item.sources.find(x=>x.id==='klarix-fsets').url='javascript:bad()';
 const html=api.qualityBlock(item,true);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script'));assert.ok(html.includes('&lt;svg'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
});
test('malformed quality data fail safely, fallback legacy data still loads, reset works repeatedly', async () => {
 for(const corrupt of [v=>v.rows[0].values.legendary=-1,v=>v.rows[0].variant='all',v=>v.qualities[1].id='legendary',v=>v.rows[0].effectIndex=9999,v=>v.sourceIds=[]]){
  const data=structuredClone(production);corrupt(data.sets[0].numericValue);const {api,node}=harness(data);await api.load();assert.ok(node('set-notice').textContent.includes('読み込めなかった'));
 }
 const data=structuredClone(production);delete data.sets[0].numericValue;const {api,node}=harness(data);await api.load();assert.ok(node('sets').innerHTML.includes('品質別の数値は未確認'));
 for(let i=0;i<3;i++){node('set-search').value='Hunding';api.filter();node('set-reset').events.click();assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,650);}
});
test('quality styles remain scoped, headers labelled and accessible', () => {
 const css=fs.readFileSync(path.join(root,'eso-quality.css'),'utf8');
 for(const id of ['normal','fine','superior','epic','legendary']) assert.ok(css.includes(`.eso-sets-page .set-quality-${id}`));
 assert.ok(css.includes('overflow-x:auto'));assert.ok(css.includes('background:#fff'));assert.ok(css.includes('@media(max-width:400px)'));
 const html=fs.readFileSync(path.join(root,'eso.html'),'utf8');assert.ok(html.includes('name="robots" content="noindex"'));assert.ok(html.includes('eso-quality.css?v=20261027-quality1'));
});
