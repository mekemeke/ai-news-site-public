const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const fixture = {
  schemaVersion:1,
  meta:{version:'test-only',checkedAt:'2026-10-27',scopeNote:'テスト専用の範囲。',versionNote:'現行版は未照合。',conditionsNote:'品質・レベルで効果量が変わる。'},
  sources:[{id:'official',name:'参照資料',url:'https://www.elderscrollsonline.com/en-us/news'}],
  equipmentTypes:[
    {id:'one-hand',nameJa:'片手武器',traitGroup:'weapon',glyphGroup:'weapon',notes:'片手武器の数値差は未検証。'},
    {id:'two-hand',nameJa:'両手武器',traitGroup:'weapon',glyphGroup:'weapon',notes:[]},
    {id:'shield',nameJa:'盾',traitGroup:'armor',glyphGroup:'armor',notes:['盾は防具用の特性・グリフ。']},
    {id:'body',nameJa:'胴防具',traitGroup:'armor',glyphGroup:'armor',notes:[]},
    {id:'ring',nameJa:'指輪',traitGroup:'jewelry',glyphGroup:'jewelry',notes:[]},
    {id:'necklace',nameJa:'ネックレス',traitGroup:'jewelry',glyphGroup:'jewelry',notes:[]}
  ],
  traits:[
    {id:'weapon-test',group:'weapon',nameEn:'Weapon Test',effectJa:'炎の力を強化。',sourceIds:['official'],conditionsJa:'武器の品質が条件。'},
    {id:'restricted-test',group:'weapon',nameEn:'Restricted Test',nameJa:'参考名',japaneseNameStatus:'provisional',effectJa:'限定された武器の効果。',sourceIds:['official'],applicableEquipmentIds:['one-hand']},
    {id:'armor-test',group:'armor',nameEn:'Armor Test',effectJa:'防具の効果を強化。',sourceIds:['official']},
    {id:'jewelry-test',group:'jewelry',nameEn:'Jewelry Test',effectJa:'回復力を強化。',sourceIds:['official']}
  ],
  enchantments:[
    {id:'weapon-glyph',group:'weapon',nameEn:'Glyph of Flame',effectJa:'炎ダメージを与える。',sourceIds:['official'],applicableEquipmentIds:['one-hand','two-hand']},
    {id:'armor-glyph',group:'armor',nameEn:'Glyph of Health',effectJa:'最大体力を増加。',sourceIds:['official'],applicableEquipmentIds:['shield','body'],conditionsJa:'部位と品質により変化。'},
    {id:'jewelry-glyph',group:'jewelry',nameEn:'Glyph of Recovery',effectJa:'マジカ再生を増加。',sourceIds:['official'],applicableEquipmentIds:['ring','necklace']}
  ],
  rules:[{title:'品質について',text:'品質・レベル差を推定しない。',sourceIds:['official']}]
};
function harness(value=fixture) {
  const nodes=new Map(),windowEvents={};
  function node(id) {
    if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:id==='reference-detail',disabled:true,events:{},addEventListener(k,v){this.events[k]=v;},focus(){this.focused=true;}});
    return nodes.get(id);
  }
  const context=vm.createContext({URL,URLSearchParams,location:{hash:''},history:{replaceState(a,b,url){context.location.hash=url;}},document:{getElementById:node},window:{addEventListener(k,v){windowEvents[k]=v;},scrollTo(){}},fetch:async()=>({ok:true,json:async()=>value})});
  const source=fs.readFileSync(path.join(root,'eso-traits-enchants.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/,'  globalThis.api = {load,route,filter,validate,safeURL};\n})();');
  vm.runInContext(source,context);
  return {node,context,windowEvents,api:context.api};
}
const count = node => (node.innerHTML.match(/data-entry-id=/g)||[]).length;
test('separate trait/enchantment views, group filters and exact equipment applicability',async()=>{
  const {api,node,context}=harness();await api.load();
  assert.equal(count(node('reference-list')),4);
  assert.equal((node('reference-views').innerHTML.match(/<a /g)||[]).length,2);
  assert.equal((node('reference-groups').innerHTML.match(/<a /g)||[]).length,4);
  context.location.hash='#?group=weapon';api.route();assert.equal(count(node('reference-list')),2);
  assert.match(node('reference-equipment').innerHTML,/片手武器/);assert.ok(!node('reference-equipment').innerHTML.includes('盾'));
  context.location.hash='#?group=weapon&equipment=two-hand';api.route();assert.equal(count(node('reference-list')),1);
  context.location.hash='#?equipment=shield';api.route();assert.equal(count(node('reference-list')),1);assert.match(node('reference-list').innerHTML,/trait\/armor-test/);
  assert.equal(node('reference-equipment-note').hidden,false);assert.match(node('reference-equipment-note').innerHTML,/盾は防具用/);
  context.location.hash='#?view=enchantments&equipment=shield';api.route();assert.equal(count(node('reference-list')),1);assert.match(node('reference-list').innerHTML,/enchantment\/armor-glyph/);
  assert.ok(!node('reference-list').innerHTML.includes('weapon-glyph'));
  context.location.hash='#?view=enchantments&group=jewelry';api.route();assert.equal(count(node('reference-list')),1);
});
test('NFKC multi-word search combines with group/type; clearing preserves current reference view',async()=>{
  const {api,node,context}=harness();await api.load();
  context.location.hash='#?group=weapon&q=Ｗｅａｐｏｎ　炎';api.route();assert.equal(count(node('reference-list')),1);
  context.location.hash='#?view=enchantments&group=weapon&q=FLAME';api.route();assert.equal(count(node('reference-list')),1);
  node('reference-search').value='absent';node('reference-search').events.input();assert.equal(count(node('reference-list')),0);assert.match(node('reference-list').innerHTML,/ゲーム内に存在しない/);
  assert.match(context.location.hash,/view=enchantments/);
  node('reference-reset').events.click();assert.equal(count(node('reference-list')),3);assert.equal(node('reference-search').value,'');assert.equal(context.location.hash,'#?view=enchantments');
  node('reference-reset').events.click();assert.equal(count(node('reference-list')),3);
});
test('source-provided aliases remain searchable and are explicitly labeled in detail',async()=>{
  const value=structuredClone(fixture);value.traits[0].aliases=['Historical Name','旧称テスト'];
  const {api,node,context}=harness(value);await api.load();
  context.location.hash='#?q=historical';api.route();assert.equal(count(node('reference-list')),1);
  context.location.hash='#trait/weapon-test';api.route();assert.match(node('reference-detail').innerHTML,/資料内の別表記・旧称：Historical Name \/ 旧称テスト/);
});
test('switching groups resets subtype but retains view and search; subtype selection sets appropriate group',async()=>{
  const {api,node,context}=harness();await api.load();
  context.location.hash='#?view=enchantments&group=weapon&equipment=one-hand&q=炎';api.route();
  assert.match(node('reference-groups').innerHTML,/view=enchantments&amp;group=armor&amp;q=/);
  assert.ok(!node('reference-groups').innerHTML.includes('group=armor&amp;equipment='));
  assert.match(node('reference-views').innerHTML,/#\?group=weapon&amp;equipment=one-hand&amp;q=/);
  context.location.hash='#';api.route();node('reference-equipment').value='ring';node('reference-equipment').events.change();
  assert.match(context.location.hash,/group=jewelry&equipment=ring/);assert.equal(count(node('reference-list')),1);
});
test('detail/deep links, back and forward preserve state and expose all target equipment and provenance',async()=>{
  const {api,node,context,windowEvents}=harness();await api.load();
  const query='view=enchantments&group=armor&equipment=shield&q=体力';
  context.location.hash='#?'+query;api.route();assert.equal(count(node('reference-list')),1);
  context.location.hash='#enchantment/armor-glyph?'+query;windowEvents.hashchange();
  assert.equal(node('reference-home').hidden,true);assert.equal(node('reference-detail').hidden,false);assert.equal(node('reference-detail').focused,true);
  const html=node('reference-detail').innerHTML;
  for(const term of ['対象装備','盾 / 胴防具','部位と品質により変化','未確認','日本語名は未確認','出典・確認範囲','https://www.elderscrollsonline.com/en-us/news']) assert.ok(html.includes(term),term);
  assert.match(html,/href="#\?view=enchantments&amp;group=armor&amp;equipment=shield&amp;q=/);
  context.location.hash='#?'+query;windowEvents.hashchange();assert.equal(node('reference-home').hidden,false);assert.equal(node('reference-search').value,'体力');assert.equal(count(node('reference-list')),1);
  context.location.hash='#enchantment/armor-glyph?'+query;windowEvents.hashchange();assert.equal(node('reference-detail').hidden,false);
  const direct=harness();direct.context.location.hash='#trait/weapon-test?group=weapon&q=炎';await direct.api.load();assert.match(direct.node('reference-detail').innerHTML,/Weapon Test/);
});
test('invalid IDs/parameters are bounded and prototype keys cannot change views or groups',async()=>{
  const {api,node,context}=harness();await api.load();
  context.location.hash='#?view=toString&group=__proto__&equipment=unknown';api.route();assert.equal(count(node('reference-list')),4);
  context.location.hash='#?group=weapon&equipment=shield';api.route();assert.equal(node('reference-equipment').value,'');assert.equal(count(node('reference-list')),2);
  context.location.hash='#trait/%E0%A4%A';api.route();assert.match(node('reference-detail').innerHTML,/見つかりません/);
  context.location.hash='#enchantment/not-found';api.route();assert.match(node('reference-detail').innerHTML,/見つかりません/);
  context.location.hash='#?q='+('a'.repeat(300));api.route();assert.equal(node('reference-search').value.length,200);
});
test('all source text is escaped and unsafe URLs never become executable links',async()=>{
  const value=structuredClone(fixture);
  value.traits[0].nameEn='<img src=x onerror="bad">';value.traits[0].effectJa='<script>bad()</script>';value.traits[0].conditionsJa='<b>condition</b>';value.traits[0].notes=['<svg onload=bad>'];
  value.meta.scopeNote='<b>scope</b>';value.meta.versionNote='<script>version</script>';value.sources[0].url='javascript:bad()';value.sources[0].name='<img src=x>';
  value.rules[0].text='<iframe src=x>';
  const {api,node,context}=harness(value);await api.load();
  assert.match(node('reference-list').innerHTML,/&lt;img/);assert.match(node('reference-coverage').innerHTML,/&lt;b&gt;/);assert.match(node('reference-rule-content').innerHTML,/&lt;iframe/);
  context.location.hash='#trait/weapon-test';api.route();const html=node('reference-detail').innerHTML;
  assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;svg/);assert.ok(!/<script|<img|<svg|href="javascript:/i.test(html));
  for(const url of ['javascript:x','http://test.org','https:foo.org','https://user:pass@test.org','https://test.org:8443','https://127.0.0.1','https://localhost','https://site.local','https://internal.foo.org','https://foo.home.arpa','https://foo.org\\x','//example.org']) assert.equal(api.safeURL(url),'',url);
  assert.equal(api.safeURL('https://www.elderscrollsonline.com/en-us/news'),'https://www.elderscrollsonline.com/en-us/news');
});
test('source scope, historical status, researchability and important caveats remain visible',async()=>{
  const value=structuredClone(fixture);
  value.meta.verificationNote='現行ゲーム内では未実測。';
  value.sources[0].note='公式フォーラム上のユーザー投稿 <b>officialではない</b>';
  value.coverage={excluded:['特殊装備'],limitations:['旧資料が含まれる <img src=x>']};
  value.traits[0].researchable=false;value.traits[0].notes=['研究できない特別な装備。'];
  value.enchantments[0].verificationStatus='historical-inventory-current-rules';
  const {api,node,context}=harness(value);await api.load();
  assert.match(node('reference-list').innerHTML,/研究不可/);assert.match(node('reference-list').innerHTML,/研究できない特別な装備/);
  assert.match(node('reference-coverage').innerHTML,/現行ゲーム内では未実測/);
  const sources=node('reference-sources').innerHTML;
  assert.match(sources,/公式フォーラム上のユーザー投稿 &lt;b&gt;/);assert.match(sources,/特殊装備/);assert.match(sources,/旧資料が含まれる &lt;img/);
  context.location.hash='#?view=enchantments';api.route();assert.match(node('reference-list').innerHTML,/過去資料の分類・仕様を参照（現行ゲーム内未照合）/);
  context.location.hash='#enchantment/weapon-glyph';api.route();assert.match(node('reference-detail').innerHTML,/公式フォーラム上のユーザー投稿 &lt;b&gt;/);assert.match(node('reference-detail').innerHTML,/過去資料の分類/);
});
test('schema rejects duplicate records, wrong-group applicability and unresolved evidence',async()=>{
  const {api}=harness();
  for(const change of [v=>v.schemaVersion=2,v=>v.traits.push(v.traits[0]),v=>v.sources.push(v.sources[0]),v=>v.equipmentTypes.push(v.equipmentTypes[0]),v=>v.traits[0].group='toString',v=>v.traits[0].sourceIds=['missing'],v=>v.enchantments[0].applicableEquipmentIds=['shield'],v=>delete v.enchantments[0].applicableEquipmentIds,v=>v.traits[0].applicableEquipmentIds=[],v=>v.rules[0].sourceIds=['missing'],v=>v.traits[0].notes=[{}]]) {
    const value=structuredClone(fixture);change(value);assert.throws(()=>api.validate(value));
  }
});
test('loading failure and duplicate retries fail closed, then recover cleanly',async()=>{
  const {api,node,context}=harness();let calls=0,resolve;
  context.fetch=()=>{calls++;return new Promise(r=>{resolve=r;});};
  const pending=api.load();await api.load();assert.equal(calls,1);assert.equal(node('reference-search').disabled,true);
  resolve({ok:false});await pending;assert.equal(node('reference-retry').hidden,false);assert.equal(count(node('reference-list')),0);
  context.fetch=async()=>({ok:true,json:async()=>fixture});await node('reference-retry').events.click();assert.equal(count(node('reference-list')),4);assert.equal(node('reference-retry').hidden,true);
  context.fetch=async()=>({ok:true,json:async()=>({schemaVersion:99})});await api.load();assert.equal(count(node('reference-list')),0);assert.equal(node('reference-search').disabled,true);assert.equal(node('reference-detail').hidden,true);
});
test('page keeps CSP/noindex, external assets, mobile layout, and strictly namespaced reference styles',()=>{
  const html=fs.readFileSync(path.join(root,'eso-traits-enchants.html'),'utf8'),css=fs.readFileSync(path.join(root,'eso-traits-enchants.css'),'utf8');
  assert.match(html,/<meta name="robots" content="noindex">/);assert.match(html,/script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:/);
  assert.ok(!/\son[a-z]+\s*=|<style>|<script>(?!<\/script>)/i.test(html));assert.ok(!html.includes('<img'));
  const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@media[^{}]*\{/g,'');
  for(const selector of stripped.match(/[^{}]+(?=\{)/g)||[]) for(const part of selector.split(',')) assert.ok(part.trim().startsWith('.eso-reference-page '),part);
  assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/minmax\(0,1fr\)/);
  for(const file of ['eso.html','eso-skills.html']) assert.match(fs.readFileSync(path.join(root,file),'utf8'),/href="\.\/eso-traits-enchants.html">特性・付呪<\/a>/);
});
test('production data loads and every view, group and individual equipment combination is exact',async()=>{
  const file=path.join(root,'data/eso-equipment-reference.json');
  assert.ok(fs.existsSync(file),'Production reference data must be integrated');
  const value=JSON.parse(fs.readFileSync(file,'utf8')),{api,node,context}=harness(value);await api.load();
  assert.equal(node('reference-retry').hidden,true);
  const maps=api.validate(value);
  assert.equal(value.equipmentTypes.length,22);assert.equal(value.traits.length,33);assert.equal(value.enchantments.length,38);
  assert.equal(value.traits.filter(item=>item.researchable).length,27);assert.equal(value.traits.filter(item=>item.researchable===false).length,6);
  assert.equal(value.coverage.traits,value.traits.length);assert.equal(value.coverage.glyphs,value.enchantments.length);
  assert.match(node('reference-coverage').innerHTML,/全変更を完全監査したものではない/);
  for(const view of ['traits','enchantments']) {
    context.location.hash='#?view='+view;api.route();assert.equal(count(node('reference-list')),value[view].length);
    for(const group of ['weapon','armor','jewelry']) {
      context.location.hash=`#?view=${view}&group=${group}`;api.route();assert.equal(count(node('reference-list')),value[view].filter(item=>item.group===group).length);
    }
    for(const eq of value.equipmentTypes) {
      context.location.hash=`#?view=${view}&equipment=${eq.id}`;api.route();
      const kind=view==='traits'?'trait':'enchantment';
      const expected=[...maps.entries.values()].filter(item=>item.kind===kind&&item.applicableEquipmentIds.includes(eq.id));
      assert.equal(count(node('reference-list')),expected.length,view+' / '+eq.id);
      for(const item of expected) assert.ok(node('reference-list').innerHTML.includes(`data-entry-id="${kind}/${item.id}"`));
    }
  }
  context.location.hash='#enchantment/glyph-reduce-skill-cost';api.route();
  assert.match(node('reference-detail').innerHTML,/公式資料の効果ラベル/);
  assert.match(node('reference-detail').innerHTML,/完全なグリフ名は未照合/);
  for(const item of maps.entries.values()) {
    context.location.hash=`#${item.kind}/${item.id}`;api.route();assert.ok(!node('reference-detail').innerHTML.includes('見つかりません'));
    assert.ok(!/<img|<svg|<iframe/.test(node('reference-detail').innerHTML));
  }
});
