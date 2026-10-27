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
  const source=fs.readFileSync(path.join(root,'eso.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/, '  globalThis.api = {load, route, filter, renderList, qualityBlock, validNumericValue, renderEffects, effectPlan, qualityValues};\n})();');
  vm.runInContext(source,context);
  return {node,context,api:context.api,events};
}

test('inline values contain exact five-quality samples, not multiplied endpoints', async () => {
 const {api,node,context}=harness(production); await api.load();
 assert.ok(node('set-quality-coverage').textContent.includes('608 / 650'));
 assert.equal((node('sets').innerHTML.match(/<table/g)||[]).length,0);
 assert.equal((node('sets').innerHTML.match(/class="set-quality-values"/g)||[]).length,1616);
 context.location.hash='#set/hundings-rage';api.route();
 const html=node('set-detail').innerHTML;
 for(const [id,value] of [['normal','261'],['fine','272'],['superior','282'],['epic','289'],['legendary','300']]) assert.match(html,new RegExp(`<span class="set-quality-${id}"[^>]*>${value}</span>`));
 assert.ok(html.includes('CP160')); assert.ok(html.includes('— は未確認'));
});
test('source values preserve perfected rows, mythic fixed quality, units and conditions', () => {
 const {api}=harness(production),sets=new Map(production.sets.map(s=>[s.id,s]));
 const lucent=api.renderEffects(sets.get('lucent-echoes'))+api.qualityBlock(sets.get('lucent-echoes'));
 assert.ok(lucent.includes('完璧版追加'));assert.ok(lucent.includes('完璧版5部位が必要'));assert.ok(lucent.includes('品質の完璧版が入手できることを示さない'));
 const mythic=api.renderEffects(sets.get('ring-of-the-wild-hunt'))+api.qualityBlock(sets.get('ring-of-the-wild-hunt'));
 assert.ok(mythic.includes('15%'));assert.ok(mythic.includes('45%'));assert.ok(mythic.includes('金相当'));assert.ok(mythic.includes('専用表示は橙')||mythic.includes('秘術表示は橙'));
 assert.equal((mythic.match(/data-quality="legendary"/g)||[]).length,2);
 assert.ok(!mythic.includes('data-quality="normal"')); assert.ok(mythic.includes('白・緑・青・紫は対象外'));
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
 const html=api.renderEffects(item)+api.qualityBlock(item,true);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script'));assert.ok(html.includes('&lt;svg'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
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
 assert.ok(!css.includes('overflow-x:auto'));assert.ok(css.includes('white-space:normal'));assert.ok(!css.includes('min-width:360px'));assert.ok(css.includes('background:#fff'));assert.ok(css.includes('@media(max-width:400px)'));
 const html=fs.readFileSync(path.join(root,'eso.html'),'utf8');assert.ok(html.includes('name="robots" content="noindex"'));assert.ok(html.includes('eso-quality.css?v=20261027-inline1'));
});

test('red-box effects replace only semantic numbers inside the sentence',()=>{
 const {api}=harness(production), item=production.sets.find(s=>s.id==='powerful-assault');
 const html=api.renderEffects(item);
 assert.match(html,/最大体力が<span class="set-quality-values"/);
 assert.match(html,/>1136<.*>1164<.*>1206<\/span><\/span>増加する。/);
 for(const text of ['自分と12m以内','グループメンバー最大5人','効果は15秒間','対象人数は自分を含めて最大6人']) assert.ok(html.includes(text));
 assert.ok(!html.includes('最大体力が1206増加'));
 assert.ok(api.qualityBlock(item).includes('最大体力が1206増加する。'));
 assert.ok(!api.qualityBlock(item).includes('<details open'));
 assert.ok(!html.includes('<table'));
});
test('full ranges are replaced, repeated range notes are folded, and percent disclaimers survive',()=>{
 const {api}=harness(production);
 for(const id of ['hundings-rage','plague-doctor','thunderous-volley']){
  const item=production.sets.find(s=>s.id===id), html=api.renderEffects(item), fold=api.qualityBlock(item);
  assert.ok(!/[～〜–—-]<span class="set-quality-values"/.test(html));
  for(let i=0;i<item.effects.length;i++) if(api.effectPlan(item,i).replacements.length) assert.ok(fold.includes(item.effects[i].text));
 }
 const volley=api.renderEffects(production.sets.find(s=>s.id==='thunderous-volley'));
 assert.ok(volley.includes('クリティカル率が526%増える意味ではない。'));
 assert.match(volley,/クリティカルの値がさらに<span/);
 const hunding=api.renderEffects(production.sets.find(s=>s.id==='hundings-rage'));
 assert.ok(!hunding.includes('掲載範囲：'));
});
test('duplicate endpoints align to distinct metrics and truly shared clauses render once',()=>{
 const {api}=harness(production);
 for(const id of ['shacklebreaker','vampires-kiss','vastaries-tutelage']){
  const item=production.sets.find(s=>s.id===id), html=api.renderEffects(item);
  assert.equal((html.match(/class="set-quality-values"/g)||[]).length,item.numericValue.rows.length);
  assert.ok(!html.includes('set-quality-fallback'));
 }
 for(const [id,shared] of [['roksa-the-warped','q1 q2 q3'],['stonekeeper','q1 q2'],['swarm-mother','q1 q2']]){
  const item=production.sets.find(s=>s.id===id), html=api.renderEffects(item);
  assert.ok(html.includes(`data-row-ids="${shared}"`));
  assert.ok(!html.includes('set-quality-fallback'));
  assert.ok(!/[～〜–—-]<span/.test(html));
 }
});
test('ambiguous and unit-mismatched source numbers never get a fabricated association',()=>{
 const {api}=harness(production), source=production.sets.find(s=>s.id==='powerful-assault');
 for(const sentence of ['最大体力が1206増加する。最大体力が1206増加する。','最大体力が1206%増加する。','最大マジカが1206増加する。','最大体力が21206増加する。']){
  const item=structuredClone(source);item.effects[0].text=sentence;
  const plan=api.effectPlan(item,0);assert.equal(plan.replacements.length,0);assert.equal(plan.unmatched.length,1);
  const html=api.renderEffects(item);assert.ok(html.includes(sentence));assert.ok(html.includes('set-quality-fallback'));
 }
 const shared=structuredClone(production.sets.find(s=>s.id==='swarm-mother'));
 shared.numericValue.rows[1].values.epic=1000;
 assert.equal(api.effectPlan(shared,0).replacements.length,0);
 assert.equal(api.effectPlan(shared,0).unmatched.length,2);
});
test('normal and perfected variants cannot migrate between effect positions',()=>{
 const {api}=harness(production), item=structuredClone(production.sets.find(s=>s.id==='lucent-echoes'));
 let plan=api.effectPlan(item,5);assert.equal(plan.replacements.length,1);
 const inline=api.qualityValues(item,plan.replacements[0].rows);
 assert.match(inline,/data-quality="superior"[^>]*未確認/);assert.ok(!inline.includes('1136'));
 item.numericValue.rows[1].effectIndex=2;
 plan=api.effectPlan(item,2);assert.equal(plan.replacements.length,1);assert.equal(plan.unmatched[0].variant,'perfected');
 item.effects[2].text='通常版は最大体力が1206増加する。完璧版は最大体力が1206増加する。';
 assert.equal(api.effectPlan(item,2).replacements.length,0);
});
test('unmapped text remains byte-equivalent after escaping; all data and notes are retained',()=>{
 const {api}=harness(production), escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(const item of production.sets){
  const html=api.renderEffects(item), fold=api.qualityBlock(item);
  for(let i=0;i<item.effects.length;i++){
   const effect=item.effects[i], plan=api.effectPlan(item,i);
   assert.ok((plan.replacements.length?fold:html).includes(escape(effect.text)),item.id+' '+i);
   for(const row of plan.unmatched) assert.ok(html.includes(escape(row.label)));
  }
  for(const note of item.numericValue.notes) assert.ok(fold.includes(escape(note)),item.id);
 }
});
test('five quality order, accessible unknowns and fixed mythic values are explicit',()=>{
 const {api}=harness(production), ids=['normal','fine','superior','epic','legendary'];
 for(const item of production.sets){
  const html=api.renderEffects(item);
  for(const group of html.match(/<span class="set-quality-values"[\s\S]*?<\/span><\/span>/g)||[]){
   const found=[...group.matchAll(/data-quality="([^"]+)"/g)].map(match=>match[1]);
   assert.deepEqual(found,item.numericValue.availability==='mythic-fixed'?['legendary']:ids);
   assert.ok(!group.includes('undefined'));
   assert.equal((group.match(/role="img"/g)||[]).length,found.length);
   for(const unknown of group.match(/<span[^>]*set-quality-empty[^>]*>/g)||[]) assert.ok(unknown.includes('aria-label=')&&unknown.includes('未確認')&&unknown.includes('title='));
  }
 }
});
test('inline palette is WCAG AA on its explicit white background',()=>{
 const luminance=hex=>{const v=hex.match(/\w\w/g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 for(const color of ['374151','206337','1b5795','753b91','805600','59665f']) assert.ok(1.05/(luminance(color)+.05)>=4.5,color);
});


test('each five-quality comparison is indivisible and short enough for a 320px viewport',()=>{
 const {api}=harness(production);
 const css=fs.readFileSync(path.join(root,'eso-quality.css'),'utf8');
 const valuesRule=css.match(/\.set-quality-values\{([^}]+)\}/)[1];
 assert.ok(valuesRule.includes('display:inline-block'));
 assert.ok(valuesRule.includes('white-space:nowrap'));
 assert.ok(valuesRule.includes('monospace'));
 assert.ok(css.includes('.set-quality-values{padding:1px 0;font-size:12px}'));
 let longest=0;
 for(const item of production.sets){
  assert.ok(!api.renderEffects(item).includes('<wbr>'));
  for(const row of item.numericValue.rows){
   const ids=item.numericValue.availability==='mythic-fixed'?['legendary']:['normal','fine','superior','epic','legendary'];
   const sequence=ids.map(id=>row.values[id]===undefined?'—':String(row.values[id])+(row.unit==='%'?'%':'')).join(' / ');
   longest=Math.max(longest,sequence.length);
  }
 }
 assert.equal(longest,32);
 // 320px viewport minus shared 8% margin, card padding/borders = 263.4px.
 // Even a conservative 0.65em monospace advance at mobile 12px fits all data.
 assert.ok(longest*12*.65<=320*.92-31);
});
