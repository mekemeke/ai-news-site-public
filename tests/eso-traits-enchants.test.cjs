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
  const source=fs.readFileSync(path.join(root,'eso-traits-enchants.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/,'  globalThis.api = {load,route,filter,validate,safeURL,comparisonRows,effectHTML};\n})();');
  vm.runInContext(source,context);
  return {node,context,windowEvents,api:context.api};
}
const count = node => (node.innerHTML.match(/data-entry-id=/g)||[]).length;
const qualityDefinitions = [
  ['normal','白（Normal）'],['fine','緑（Fine）'],['superior','青（Superior）'],['epic','紫（Epic）'],['legendary','金（Legendary）']
];
function withNumericValues() {
  const value=structuredClone(fixture);
  value.traits[0].numericValue={qualityBasis:'equipment',basis:'CP160・片手武器 / 両手武器。特性の基準値。',sourceIds:['official'],notes:['過去資料の参考値。現行ゲーム内未実測。'],qualities:qualityDefinitions.map(([id,label],index)=>({id,label,status:index===0?'unverified':index===4?'verified':'partial',summary:index===0?'この品質の根拠資料は未確認。':'資料で確認した値。',variants:index===0?[]:[{label:'片手武器',value:`${index*10}%`},{label:'両手武器',value:`${index*20}%`}]}))};
  value.enchantments[1].numericValue={qualityBasis:'glyph',basis:'CP160・注入などの強化なし。装備の色ではなくグリフの色。',sourceIds:['official'],notes:['胴・頭・脚と小部位を区別する。'],qualities:[{id:'legendary',label:'金（Legendary）',status:'verified',summary:'基準部位での効果。',variants:[{label:'胴・頭・脚・盾',value:'+954 体力'},{label:'肩・手・腰・足',value:'+386 体力'}]}]};
  return value;
}
test('numeric values are compact inline series in list and detail with named qualities and exact contexts',async()=>{
  const {api,node,context,windowEvents}=harness(withNumericValues());await api.load();
  context.location.hash='#?group=weapon&q=Weapon';api.route();
  let html=node('reference-list').innerHTML;
  assert.equal((html.match(/data-quality=/g)||[]).length,10);
  for(const [id,label] of qualityDefinitions) {assert.ok(html.includes(`class="eso-ref-quality-${id}"`));assert.ok(html.includes(label));}
  for(const expected of ['装備自体の品質別','CP160','片手武器','両手武器','40%','80%','title="未確認"','参考値（現行未実測）','現行ゲーム内未実測','数値の出典']) assert.ok(html.includes(expected),expected);
  assert.ok(!html.includes('<table'));assert.match(html,/eso-ref-quality-inline/);
  assert.ok(html.indexOf('data-quality=')<html.indexOf('対象装備'));
  assert.ok(!/<details[^>]*>[\s\S]*data-quality=/.test(html));
  context.location.hash='#trait/weapon-test?group=weapon&q=Weapon';windowEvents.hashchange();html=node('reference-detail').innerHTML;
  assert.equal((html.match(/data-quality=/g)||[]).length,10);assert.ok(html.indexOf('data-quality=')<html.indexOf('出典・確認範囲'));
  context.location.hash='#?group=weapon&q=Weapon';windowEvents.hashchange();assert.match(node('reference-list').innerHTML,/40%/);
  context.location.hash='#trait/weapon-test?group=weapon&q=Weapon';windowEvents.hashchange();assert.match(node('reference-detail').innerHTML,/80%/);
  context.location.hash='#?view=enchantments&equipment=shield';api.route();html=node('reference-list').innerHTML;
  for(const expected of ['グリフの品質別（装備自体の色とは別）','CP160','胴・頭・脚・盾','+954 体力','肩・手・腰・足','+386 体力']) assert.ok(html.includes(expected),expected);
  assert.equal((html.match(/title="未確認"/g)||[]).length,8);
  context.location.hash='#enchantment/armor-glyph';api.route();assert.match(node('reference-detail').innerHTML,/\+386 体力/);
});
test('missing numeric data remains compatible and explicit unknown values never become zero or interpolated values',async()=>{
  const {api,node,context}=harness();await api.load();
  context.location.hash='#trait/weapon-test';api.route();const html=node('reference-detail').innerHTML;
  assert.equal((html.match(/title="未確認"/g)||[]).length,5);assert.match(html,/基準レベル・効果量：未確認/);assert.ok(!html.includes('>0<'));
  const partial=withNumericValues();partial.traits[0].numericValue.qualities=partial.traits[0].numericValue.qualities.slice(4);
  const other=harness(partial);await other.api.load();other.context.location.hash='#trait/weapon-test';other.api.route();
  assert.equal((other.node('reference-detail').innerHTML.match(/title="未確認"/g)||[]).length,8);
  assert.match(other.node('reference-detail').innerHTML,/40%/);assert.ok(!other.node('reference-detail').innerHTML.includes('30%'));
  const v2=withNumericValues();v2.schemaVersion=2;assert.doesNotThrow(()=>api.validate(v2));
});
test('numeric labels, multi-value strings, basis and notes are escaped and numeric search remains composable',async()=>{
  const value=withNumericValues(),number=value.traits[0].numericValue;
  number.basis='CP160 <script>bad()</script>';number.notes=['<svg onload=bad>'];number.qualities[4].label='金 <img src=x>';number.qualities[4].summary='<iframe src=x>';number.qualities[4].variants=[{label:'片手 <b>武器</b>',value:'40% <img src=x onerror=bad>'}];
  const {api,node,context}=harness(value);await api.load();
  context.location.hash='#?group=weapon&q=CP160%2040';api.route();assert.equal(count(node('reference-list')),1);
  context.location.hash='#trait/weapon-test';api.route();const html=node('reference-detail').innerHTML;
  for(const tag of ['script','svg','img','iframe','b']) assert.ok(html.includes(`&lt;${tag}`),tag);
  assert.ok(!/<script|<img|<svg|<iframe|<b>/.test(html));
});
test('numeric schema rejects invented quality identifiers, contradictions, incomplete values and unresolved sources',()=>{
  const {api}=harness();
  for(const change of [
    n=>n.qualityBasis='glyph',n=>n.basis='',n=>n.qualities.push(n.qualities[0]),n=>n.qualities[0].id='__proto__',n=>n.qualities[0].status='guessed',n=>n.qualities[0].variants=[{label:'片手',value:'0'}],n=>n.qualities[4].variants=[{label:'片手',value:80}],n=>n.qualities[4].variants=[{value:'80%'}],n=>n.qualities[4].summary={},n=>n.qualities[4].sourceIds=['missing'],n=>n.qualities[4].sourceIds=[],n=>n.sourceIds=['missing'],n=>n.sourceIds=[],n=>n.sourceIds=['official','official'],n=>n.notes=[{}],n=>{n.qualities[4].variants=[];n.qualities[4].summary='';}
  ]) {const value=withNumericValues();change(value.traits[0].numericValue);assert.throws(()=>api.validate(value));}
});
test('quality colors have WCAG AA contrast on their explicit white panel and remain labeled without color perception',()=>{
  const css=fs.readFileSync(path.join(root,'eso-traits-enchants.css'),'utf8');
  const luminance=hex=>{const rgb=hex.match(/[a-f0-9]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  assert.match(css,/\.eso-reference-page \.eso-ref-numeric\{[^}]*background:#fff;/);
  for(const [id] of qualityDefinitions) {const match=css.match(new RegExp(`\\.eso-reference-page \\.eso-ref-quality-${id}\\{color:(#[a-f0-9]{6})\\}`));assert.ok(match,id);assert.ok(1.05/(luminance(match[1])+.05)>=4.5,`${id} contrast`);}
  assert.match(css,/\.eso-ref-quality-legend \.eso-ref-quality-normal:before\{[^}]*background:#fff;[^}]*border:1px solid/);
  assert.ok(!css.includes('table-layout:fixed'));assert.match(css,/font-variant-numeric:tabular-nums/);assert.match(css,/\.eso-ref-quality-inline\{[^}]*white-space:nowrap/);
});
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
  for(const change of [v=>v.schemaVersion=3,v=>v.traits.push(v.traits[0]),v=>v.sources.push(v.sources[0]),v=>v.equipmentTypes.push(v.equipmentTypes[0]),v=>v.traits[0].group='toString',v=>v.traits[0].sourceIds=['missing'],v=>v.enchantments[0].applicableEquipmentIds=['shield'],v=>delete v.enchantments[0].applicableEquipmentIds,v=>v.traits[0].applicableEquipmentIds=[],v=>v.rules[0].sourceIds=['missing'],v=>v.traits[0].notes=[{}]]) {
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
  assert.match(node('reference-coverage').innerHTML,/全変更.*完全監査/);
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
test('production 71 entries preserve all 355 quality records and exact facts without repeated tables',async()=>{
  const value=JSON.parse(fs.readFileSync(path.join(root,'data/eso-equipment-reference.json'),'utf8'));
  const {api,node,context}=harness(value);await api.load();
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const all=[...value.traits.map(item=>({...item,kind:'trait'})),...value.enchantments.map(item=>({...item,kind:'enchantment'}))];
  assert.equal(all.length,71);assert.equal(all.flatMap(item=>item.numericValue?.qualities||[]).length,355);
  for(const key of ['numericBasis','numericVerificationNote']) assert.ok(node('reference-coverage').innerHTML.includes(escape(value.meta[key])),key);
  for(const item of all) {
    context.location.hash=`#${item.kind}/${item.id}`;api.route();const html=node('reference-detail').innerHTML;
    assert.ok(!html.includes('<table'),item.id);
    const rendered=[...html.matchAll(/data-quality="([a-z]+)"/g)].map(match=>match[1]);
    assert.ok(rendered.length>=5&&rendered.length%5===0,item.id);
    for(let index=0;index<rendered.length;index+=5) assert.deepEqual(rendered.slice(index,index+5),qualityDefinitions.map(([id])=>id));
    assert.ok(html.includes(escape(item.effectJa)),item.id+' complete original effect');
    assert.ok(html.includes(escape(item.numericValue.basis)),item.id+' basis');
    for(const note of item.numericValue.notes||[]) assert.ok(html.includes(escape(note)),item.id+' note');
    for(const quality of item.numericValue.qualities) {
      assert.ok(html.includes(escape(quality.label)),item.id+' quality label');
      if(quality.summary) assert.ok(html.includes(escape(quality.summary)),item.id+' summary');
      for(const variant of quality.variants||[]) {assert.ok(html.includes(escape(variant.label)),item.id+' variant label');assert.ok(html.includes(escape(variant.value)),item.id+' exact value');}
    }
  }
});
test('semantic inline replacement uses exact anchors and never substitutes thresholds or ambiguous equal-value positions',async()=>{
  const value=withNumericValues();value.traits[0].effectJa='最大体力を80増やす。体力80%未満でも有効。';
  value.traits[0].numericValue.qualities=qualityDefinitions.map(([id,label],index)=>({id,label,status:'partial',summary:'参考値',variants:[{label:'最大体力',value:`+${40+index*10}`}]}));
  const {api,node,context}=harness(value);await api.load();context.location.hash='#trait/weapon-test';api.route();
  let effect=node('reference-detail').innerHTML.match(/<p class="eso-ref-effect">([\s\S]*?)<\/p>/)[1];
  assert.match(effect,/最大体力を<span class="eso-ref-quality-inline"/);assert.match(effect,/体力80%未満/);assert.ok(!effect.includes('eso-ref-inline-row'));
  const item={...value.traits[0],kind:'trait',effectJa:'最大体力を80増やす。最大体力を80増やす。'};
  effect=api.effectHTML(item);assert.ok(effect.includes('最大体力を80増やす。最大体力を80増やす。'));assert.ok(effect.includes('eso-ref-inline-row'));
  item.effectJa='体力が80%未満の敵に追加ダメージ。';effect=api.effectHTML(item);assert.ok(effect.includes(item.effectJa));
});
test('semantic templates separate multi-effect rows, preserve duplicate positions, and never promote unknown multipliers',async()=>{
  const value=JSON.parse(fs.readFileSync(path.join(root,'data/eso-equipment-reference.json'),'utf8'));
  const {api}=harness(value);
  const absorb=value.enchantments.find(item=>item.id==='glyph-absorb-magicka');
  const rows=api.comparisonRows(absorb);assert.equal(rows.length,4);
  const magic=rows.filter(row=>row.context.includes('魔法'));const recovery=rows.filter(row=>row.context.includes('マジカ'));
  assert.equal(magic.length,2);assert.equal(recovery.length,2);
  assert.equal(magic[0].values.get('legendary').amount,'1,900');assert.equal(recovery[0].values.get('legendary').amount,'354');
  const health=value.enchantments.find(item=>item.id==='glyph-health');
  const unknown=api.comparisonRows(health).find(row=>row.label.includes('肩'));
  assert.equal(unknown.values.size,0);assert.ok(!api.effectHTML(health).includes('>40%<'));
  const harm=value.enchantments.find(item=>item.id==='glyph-increase-physical-harm');
  const damage=api.comparisonRows(harm).find(row=>row.context.includes('武器'));
  assert.equal(damage.values.has('normal'),false);assert.equal(damage.values.get('legendary').amount,'+174');
  const duplicate={effectJa:'原文は不変',numericValue:{qualities:[{id:'legendary',status:'partial',variants:[{label:'同名',value:'+10'},{label:'同名',value:'+20'}]}]}};
  assert.equal(api.comparisonRows(duplicate).length,2);assert.match(api.effectHTML(duplicate),/>\+10<.*>\+20</);
});
test('shared quality legend is outside list-only section and accessible values remain outside collapsed provenance',async()=>{
  const page=fs.readFileSync(path.join(root,'eso-traits-enchants.html'),'utf8');
  assert.equal((page.match(/aria-label="品質別数値の凡例"/g)||[]).length,1);
  assert.ok(page.indexOf('eso-ref-quality-legend')<page.indexOf('id="reference-home"'));
  const {api,node}=harness(withNumericValues());await api.load();const html=node('reference-list').innerHTML;
  assert.match(html,/role="img" aria-label="白（Normal） 未確認" title="未確認">—<\/span>/);
  assert.ok(html.indexOf('data-quality=')<html.indexOf('<details'));
  assert.match(html,/<details class="eso-ref-item-notes"><summary>条件・出典・原文<\/summary>/);
  assert.ok(!html.includes('<table'));
});

test('concise basis and critical old-source, rounded, partial and gameplay caveats stay visible outside disclosures',async()=>{
  const value=JSON.parse(fs.readFileSync(path.join(root,'data/eso-equipment-reference.json'),'utf8'));
  const {api,node,context}=harness(value);await api.load();
  const cases=[
    ['trait','weapon-defending',['CP160','装備品質（1個）','2023年参考値']],
    ['enchantment','glyph-crushing',['グリフ品質（追加補正なし）','紫：2016年参考値','片手は50%換算・表示丸め未実測']],
    ['enchantment','glyph-health',['小部位の表示値は未照合']],
    ['trait','armor-impenetrable',['金も参考値','資料間の不一致あり']],
    ['enchantment','glyph-decrease-health',['注入の通常の効果量増加をダメージに掛けない','金も参考値','現行の割合は未確認（片手も未確認）']],
    ['enchantment','glyph-increase-physical-harm',['再生+10は品質共通（注入などの装備補正は別）']],
    ['enchantment','glyph-increase-magical-harm',['再生+10は品質共通（注入などの装備補正は別）']],
    ['enchantment','glyph-reduce-skill-cost',['継続消費型アビリティは対象外','アルティマ消費減少ではない']],
    ['enchantment','glyph-potion-speed',['薬にはレベル条件']],
    ['trait','jewelry-bloodthirsty',['到達上限・常時ではない']]
  ];
  for(const [kind,id,expected] of cases){
    context.location.hash=`#?view=${kind==='trait'?'traits':'enchantments'}&q=${id.startsWith('glyph')?'':' '}`;api.route();
    const card=node('reference-list').innerHTML.match(new RegExp(`<article[^>]*data-entry-id="${kind}/${id}"[\\s\\S]*?<\\/article>`))?.[0];
    assert.ok(card,id);const visible=card.split('<details')[0];
    for(const text of expected) assert.ok(visible.includes(text),id+': '+text);
  }
});

test('all five grades remain one horizontal run and production token widths fit a 240px mobile content area',()=>{
  const css=fs.readFileSync(path.join(root,'eso-traits-enchants.css'),'utf8');
  const script=fs.readFileSync(path.join(root,'eso-traits-enchants.js'),'utf8');
  assert.match(css,/\.eso-ref-quality-inline\{[^}]*display:inline-flex;flex-wrap:nowrap;[^}]*font-size:12px;[^}]*white-space:nowrap/);
  assert.ok(!script.includes('<wbr>'));
  const value=JSON.parse(fs.readFileSync(path.join(root,'data/eso-equipment-reference.json'),'utf8'));
  const {api}=harness(value);let maxLength=0,maxWidth=0;
  for(const item of [...value.traits,...value.enchantments]) for(const row of api.comparisonRows(item)) {
    const amounts=qualityDefinitions.map(([id])=>row.values.get(id));
    const tokens=amounts.map(value=>(value?.amount||'—').replace(/,/g,''));
    const chars=tokens.join('/');maxLength=Math.max(maxLength,chars.length);
    // Conservative 12px mono metrics: ASCII/dash <= 7.25px, 秒 12px;
    // four slash margins = 8px, group padding = 6px, each ※ <= 9px.
    const width=[...chars].reduce((sum,char)=>sum+(char==='秒'?12:7.25),0)+14+amounts.filter(value=>value?.calculated).length*9;
    maxWidth=Math.max(maxWidth,width);assert.ok(width<=240,item.id+': '+width);
    const effect=api.effectHTML(item);assert.ok(!effect.includes('<wbr>'));assert.ok(!effect.includes(' / </span>'));
  }
  assert.equal(maxLength,29);assert.ok(maxWidth<=228,`max estimated width ${maxWidth}`);
});
