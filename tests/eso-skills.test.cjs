const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const fixture = {schemaVersion:1,meta:{version:'test-only',verifiedAt:'2026-10-27',coverageNote:'テスト専用',iconNote:'画像未取得',sources:[{label:'資料',url:'https://www.elderscrollsonline.com/en-us/classes'}]},classes:[],skills:[]};
for (let i=0;i<7;i++) {
  const cl={id:`class-${i}`,nameJa:`クラス${i}`,nameEn:`Class ${i}`,trees:Array.from({length:3},(_,j)=>({id:`tree-${j}`,nameJa:`ツリー${j}`,nameEn:`Tree ${j}`}))};
  fixture.classes.push(cl);
  for(const [n,treeId,type,baseSkillId] of [['base','tree-0','active',null],['morph-a','tree-0','active',`class-${i}-base`],['morph-b','tree-0','active',`class-${i}-base`],['ultimate','tree-1','ultimate',null],['passive','tree-2','passive',null]]) {
    fixture.skills.push({id:`class-${i}-${n}`,classId:cl.id,treeId,type,baseSkillId,nameJa:null,nameEn:`Class ${i} ${n}`,descriptionJa:'説明。炎の力。',verifiedAt:'2026-10-27',gameUpdate:null,sourceUrl:'https://www.elderscrollsonline.com/en-us/classes',icon:null});
  }
}
fixture.classes[0].trees.push({id:'mastery',nameJa:null,nameEn:'Class Mastery',category:'class-mastery'});
fixture.skills.push({id:'class-0-mastery',classId:'class-0',treeId:'mastery',type:'passive',baseSkillId:null,nameEn:'Mastery',icon:null});
function harness(value=fixture) {
  const nodes=new Map(), events={}, windowEvents={};
  function node(id) {
    if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:id==='skill-detail',disabled:true,events:{},addEventListener(k,v){this.events[k]=v;},focus(){this.focused=true;}});
    return nodes.get(id);
  }
  class Image { constructor(){this.classList={contains:k=>k==='eso-skill-icon'};} replaceWith(value){this.replacement=value;} }
  const context=vm.createContext({URL,URLSearchParams,HTMLImageElement:Image,location:{hash:''},history:{replaceState(a,b,url){context.location.hash=url;}},document:{getElementById:node,addEventListener(k,v){events[k]=v;},createElement:()=>({})},window:{addEventListener(k,v){windowEvents[k]=v;},scrollTo(){}},fetch:async()=>({ok:true,json:async()=>value})});
  let source=fs.readFileSync(path.join(root,'eso-skills.js'),'utf8');
  source=source.replace(/  load\(\);\r?\n\}\)\(\);/,'  globalThis.api = {load,route,filter,validate,safeURL,icon};\n})();');
  vm.runInContext(source,context);
  return {context,node,events,windowEvents,Image,api:context.api};
}
const count = node => (node.innerHTML.match(/data-skill-id=/g)||[]).length;
test('7 class filters, 3 classic trees, optional mastery separate, grouping and empty state',async()=>{
  const {api,node,context}=harness(); await api.load();
  assert.equal((node('skills-classes').innerHTML.match(/<a /g)||[]).length,8);
  assert.equal(count(node('skills-list')),36);
  assert.equal((node('skills-list').innerHTML.match(/class="eso-skills-group"/g)||[]).length,22);
  assert.equal(node('skills-trees').innerHTML,'');
  context.location.hash='#?class=class-0';api.route();
  assert.equal((node('skills-trees').innerHTML.match(/<a /g)||[]).length,4);
  assert.equal(node('skills-mastery').hidden,false);
  assert.equal((node('skills-mastery-trees').innerHTML.match(/<a /g)||[]).length,1);
  context.location.hash='#?class=class-0&tree=tree-0';api.route();
  assert.equal(count(node('skills-list')),3);
  assert.equal((node('skills-list').innerHTML.match(/class="eso-skills-group"/g)||[]).length,1);
  node('skills-search').value='no-such-skill';api.filter();
  assert.equal(count(node('skills-list')),0);assert.match(node('skills-list').innerHTML,/ゲーム内に存在しない/);
  node('skills-reset').events.click();assert.equal(count(node('skills-list')),36);assert.equal(context.location.hash,'#');
});
test('search, type and form combine; class change resets tree while keeping search; bad hashes are safe',async()=>{
  const {api,node,context}=harness();await api.load();
  context.location.hash='#?class=class-0&tree=tree-0&q=炎&type=active&form=morph';api.route();
  assert.equal(count(node('skills-list')),2);
  assert.match(node('skills-classes').innerHTML,/#\?class=class-1&amp;q=/);
  assert.ok(!node('skills-classes').innerHTML.includes('class=class-1&amp;tree='));
  node('skills-search').value='Ｃｌａｓｓ ０';api.filter();assert.equal(count(node('skills-list')),2);
  node('skills-form').value='base';node('skills-form').events.change();assert.equal(count(node('skills-list')),1);
  context.location.hash='#?class=class-0&tree=mastery';api.route();assert.equal(count(node('skills-list')),1);
  context.location.hash='#?class=class-1&tree=mastery';api.route();assert.equal(count(node('skills-list')),5);assert.equal(node('skills-mastery').hidden,true);
  context.location.hash='#?class=not-real&tree=tree-0&type=toString&form=x';api.route();assert.equal(count(node('skills-list')),36);
  context.location.hash='#skill/%E0%A4%A';api.route();assert.match(node('skill-detail').innerHTML,/見つかりません/);
});
test('deep-linked details, morph navigation, back/forward and reset retain coherent filter state',async()=>{
  const {api,node,context}=harness();await api.load();
  const query='class=class-0&tree=tree-0&q=base&type=active';
  context.location.hash='#?'+query;api.route();assert.equal(count(node('skills-list')),3);
  context.location.hash='#skill/class-0-morph-a?'+query;api.route();
  assert.equal(node('skills-home').hidden,true);assert.equal(node('skill-detail').hidden,false);
  assert.match(node('skill-detail').innerHTML,/class-0-morph-b\?class=class-0/);
  assert.match(node('skill-detail').innerHTML,/href="#\?class=class-0&amp;tree=tree-0&amp;q=base&amp;type=active"/);
  assert.match(node('skill-detail').innerHTML,/対応アップデート<\/dt><dd>未確認/);
  assert.match(node('skill-detail').innerHTML,/日本語名は未確認/);
  context.location.hash='#?'+query;api.route();assert.equal(node('skills-home').hidden,false);assert.equal(node('skills-search').value,'base');assert.equal(count(node('skills-list')),3);
  context.location.hash='#skill/class-0-morph-a?'+query;api.route();assert.equal(node('skills-home').hidden,true);
  context.location.hash='#?'+query;api.route();node('skills-reset').events.click();assert.equal(node('skills-type').value,'');assert.equal(node('skills-form').value,'');assert.equal(node('skills-search').value,'');
  const direct=harness();direct.context.location.hash='#skill/class-0-base?'+query;await direct.api.load();assert.match(direct.node('skill-detail').innerHTML,/q=base/);
});
test('untrusted data is escaped; only local, attributed, permission-noted image paths accepted',async()=>{
  const value=structuredClone(fixture);value.skills[0].nameEn='<img src=x onerror="bad">';value.skills[0].descriptionJa='<script>bad()</script>';value.meta.coverageNote='<b>bad</b>';value.skills[0].sourceUrl='javascript:bad()';
  const {api,node,context,events,Image}=harness(value);await api.load();
  assert.match(node('skills-list').innerHTML,/&lt;img/);assert.ok(!node('skills-list').innerHTML.includes('<script>'));
  assert.match(node('skills-coverage').innerHTML,/&lt;b&gt;/);
  context.location.hash='#skill/class-0-base';api.route();assert.ok(!node('skill-detail').innerHTML.includes('href="javascript:'));
  const icon={path:'assets/eso/skills/test.webp',sourceUrl:'https://www.elderscrollsonline.com/en-us/classes',permissionNote:'Permission verified in fixture only'};
  assert.match(api.icon({...fixture.skills[0],icon}),/<img /);
  for(const path of ['https://other.org/icon.png','assets/eso/skills/../test.png','assets/eso/skills/test.svg','assets/eso/skills/test.png?q=x','assets/eso/test.png']) assert.ok(!api.icon({...fixture.skills[0],icon:{...icon,path}}).includes('<img'));
  assert.ok(!api.icon({...fixture.skills[0],icon:{...icon,permissionNote:''}}).includes('<img'));
  const img=new Image();events.error({target:img});assert.match(img.replacement.textContent,/読込不可/);
  for(const url of ['javascript:x','http://test.org','https:foo.org','https://user:pass@test.org','https://test.org:8443','https://127.0.0.1','https://localhost','https://site.local','https://internal.foo.org','https://foo.home.arpa','https://foo.org\\x']) assert.equal(api.safeURL(url),'');
});
test('invalid data never renders; retry and repeated clicks recover without duplicate requests',async()=>{
  const {api,node,context}=harness();let calls=0,resolve;
  context.fetch=()=>{calls++;return new Promise(r=>{resolve=r;});};
  const pending=api.load();await api.load();assert.equal(calls,1);assert.equal(node('skills-search').disabled,true);
  resolve({ok:false});await pending;assert.equal(node('skills-retry').hidden,false);assert.equal(count(node('skills-list')),0);
  context.fetch=async()=>({ok:true,json:async()=>fixture});await node('skills-retry').events.click();assert.equal(node('skills-retry').hidden,true);assert.equal(count(node('skills-list')),36);
  for(const change of [v=>v.skills.push(v.skills[0]),v=>v.skills[1].baseSkillId='absent',v=>v.skills[1].baseSkillId=v.skills[2].id,v=>v.skills[1].classId='class-1',v=>v.skills[0].type='toString',v=>v.schemaVersion=2]) {
    const bad=structuredClone(fixture);change(bad);assert.throws(()=>api.validate(bad));
  }
});
test('HTML keeps noindex and CSP, scripts/styles stay external, and skills CSS is namespaced',()=>{
  const html=fs.readFileSync(path.join(root,'eso-skills.html'),'utf8'),css=fs.readFileSync(path.join(root,'eso-skills.css'),'utf8');
  assert.match(html,/<meta name="robots" content="noindex">/);assert.match(html,/script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:/);
  assert.ok(!/\son[a-z]+\s*=|<style>|<script>(?!<\/script>)/i.test(html));
  assert.ok(!css.includes('.news-card'));assert.ok(!css.includes('.set-grid'));assert.ok(css.includes('@media(max-width:600px)'));
  assert.match(fs.readFileSync(path.join(root,'eso.html'),'utf8'),/href="\.\/eso-skills.html">スキル<\/a>/);
});
test('sourced numeric fields and verification status are labeled without guessing missing data',async()=>{
  const value=structuredClone(fixture);value.meta.numericNote='基礎キャラクター条件の参照値。装備による差は未確認。';
  Object.assign(value.skills[0],{cost:{value:123,resource:'Magicka'},castTimeSeconds:0,durationSeconds:12,rangeMeters:28,verificationStatus:'source-checked-update-unverified'});
  const {api,node,context}=harness(value);await api.load();context.location.hash='#skill/class-0-base';api.route();
  const html=node('skill-detail').innerHTML;assert.match(html,/123 マジカ/);assert.match(html,/0 秒/);assert.match(html,/28 m/);assert.match(html,/基礎キャラクター条件/);assert.match(html,/現行アップデートとの一致は未確認/);
  assert.ok(!html.includes('半径（参照値）'));assert.ok(!html.includes('source-checked-update-unverified'));
});
test('dual and Health costs, cost caveats, Japanese-name provenance and source conflicts stay explicit',async()=>{
  const value=structuredClone(fixture);
  Object.assign(value.skills[0],{nameJa:'公式資料の名前',nameJaSourceUrl:'https://eso.dmm.com/news/detail/15274',nameJaSourceDate:'2026-01-09',nameJaVerificationStatus:'official-reference-current-unverified',nameJaVerificationNote:'現行クライアント未照合',costComponents:[{value:100,resource:'Magicka'},{value:200,resource:'Stamina'}],costNote:'継続消費は未確認',verificationNote:'資料内に18秒と20秒の差があります。',valueBasisJa:'基礎参考値',target:'enemy'});
  Object.assign(value.skills[1],{cost:{value:300,resource:'Health'}});
  const {api,node,context}=harness(value);await api.load();context.location.hash='#skill/class-0-base';api.route();let html=node('skill-detail').innerHTML;
  for(const term of ['100 マジカ ＋ 200 スタミナ','継続消費は未確認','18秒と20秒','基礎参考値','日本語名の出典・確認範囲','現行日本語クライアントとの一致は未確認','https://eso.dmm.com/news/detail/15274']) assert.ok(html.includes(term),term);
  context.location.hash='#skill/class-0-morph-a';api.route();assert.match(node('skill-detail').innerHTML,/300 体力/);
  value.skills[0].costComponents[1].resource='unknown';const invalid=harness(value);await invalid.api.load();invalid.context.location.hash='#skill/class-0-base';invalid.api.route();assert.ok(!invalid.node('skill-detail').innerHTML.includes('100 マジカ'));
});
test('source conflict notes are escaped in list and detail with a separate comparison link',async()=>{
  const value=structuredClone(fixture);Object.assign(value.skills[0],{verificationStatus:'source-conflict-update-unverified',sourceNoteJa:'方向が不一致 <script>bad()</script>',conflictSourceUrl:'https://eso.dmm.com/news/detail/15731?page=1'});
  const {api,node,context}=harness(value);await api.load();assert.match(node('skills-list').innerHTML,/方向が不一致 &lt;script&gt;/);assert.match(node('skills-list').innerHTML,/出典に不一致・現行版未照合/);
  context.location.hash='#skill/class-0-base';api.route();assert.match(node('skill-detail').innerHTML,/比較資料（不一致の確認）/);assert.ok(!node('skill-detail').innerHTML.includes('<script>'));
});
test('production dataset is compatible and every class/tree can be filtered',async()=>{
  const file=path.join(root,'data/skills.json');
  assert.ok(fs.existsSync(file),'data/skills.json must be present for the final integration check');
  const value=JSON.parse(fs.readFileSync(file,'utf8')),{api,node,context}=harness(value);await api.load();
  assert.equal(value.classes.length,7);assert.equal(count(node('skills-list')),value.skills.length);assert.equal(node('skills-retry').hidden,true);
  const withIcons=value.skills.filter(item=>item.icon);
  assert.equal((node('skills-list').innerHTML.match(/<img class="eso-skill-icon"/g)||[]).length,withIcons.length);
  for(const item of withIcons) {
    assert.match(item.icon.path,/^assets\/eso\/skills\/[a-z0-9][a-z0-9_-]*\.(?:png|webp|jpg|jpeg)$/);
    assert.ok(fs.existsSync(path.join(root,item.icon.path)),item.icon.path+' must exist locally');
  }
  if(value.meta.excludedCategories?.includes('Class Mastery')) assert.match(node('skills-sources').innerHTML,/今回の収録対象外：[^<]*Class Mastery/);
  if(value.meta.versionNote) assert.ok(node('skills-sources').innerHTML.includes(value.meta.versionNote.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))));
  assert.ok(value.skills.every(item=>Array.isArray(item.browseTags)), 'all production skills must carry audited browseTags');
  const effects=[...new Set(value.skills.flatMap(item=>item.browseTags || []))];
  for(const tag of ['メジャーバフ','マイナーバフ','メジャーデバフ','マイナーデバフ','軽攻撃','重攻撃','ペット']) assert.ok(effects.includes(tag),'missing production filter '+tag);
  for(const effect of effects) {
    context.location.hash='#?effect='+encodeURIComponent(effect);api.route();
    assert.equal(count(node('skills-list')),value.skills.filter(item=>(item.browseTags || []).includes(effect)).length,effect);
    for(const cl of value.classes) {
      context.location.hash='#?class='+cl.id+'&effect='+encodeURIComponent(effect);api.route();
      assert.equal(count(node('skills-list')),value.skills.filter(item=>item.classId===cl.id&&(item.browseTags || []).includes(effect)).length,cl.id+' / '+effect);
    }
  }
  for(const cl of value.classes) {
    assert.equal(cl.trees.filter(tree=>tree.category!=='class-mastery').length,3);
    for(const tree of cl.trees) {
      context.location.hash=`#?class=${cl.id}&tree=${tree.id}`;api.route();
      assert.equal(count(node('skills-list')),value.skills.filter(item=>item.classId===cl.id&&item.treeId===tree.id).length);
    }
  }
});

function effectFixture() {
  const value=structuredClone(fixture);
  const categories={
    base:['メジャーバフ','バフ（強）：残忍 / Major Brutality','軽攻撃'],
    'morph-a':['メジャーバフ','バフ（強）：残忍 / Major Brutality','重攻撃'],
    'morph-b':['マイナーデバフ','デバフ（弱）：脆弱 / Minor Vulnerability','ペット'],
    ultimate:['メジャーデバフ','デバフ（強）：脆弱 / Major Vulnerability','重攻撃','ペット'],
    passive:['マイナーバフ','バフ（弱）：防護 / Minor Protection','軽攻撃','重攻撃']
  };
  for (const item of value.skills) item.browseTags=[...(categories[item.id.replace(/^class-\d+-/,'')] || [])];
  return value;
}
test('effect controls expose all four named groups and three combat categories with global type counts',async()=>{
  const {api,node,context}=harness(effectFixture());await api.load();
  const groups=node('skills-effect-groups').innerHTML;
  assert.equal((groups.match(/<details /g)||[]).length,4);
  for(const label of ['メジャーバフ','マイナーバフ','メジャーデバフ','マイナーデバフ']) assert.ok(groups.includes(label+'すべて'));
  for(const label of ['軽攻撃','重攻撃','ペット（召喚獣・関連効果）']) assert.ok(node('skills-combat-effects').innerHTML.includes('>'+label+'</a>'));
  assert.equal((groups.match(/（1種類）/g)||[]).length,4);
  context.location.hash='#?class=class-0&q=not-found';api.route();
  assert.equal(count(node('skills-list')),0);
  assert.equal((node('skills-effect-groups').innerHTML.match(/（1種類）/g)||[]).length,4);
  assert.match(node('skills-effect-groups').innerHTML,/class=class-0&amp;q=not-found&amp;effect=/);
  const untagged=harness();await untagged.api.load();
  assert.equal((untagged.node('skills-effect-groups').innerHTML.match(/<details /g)||[]).length,4);
  assert.equal((untagged.node('skills-effect-groups').innerHTML.match(/収録なし/g)||[]).length,4);
});
test('single effect combines with class/tree/search/type/form without inheriting a base effect to its morphs',async()=>{
  const value=effectFixture(),{api,node,context}=harness(value);await api.load();
  for(const effect of [...new Set(value.skills.flatMap(item=>item.browseTags))]) {
    context.location.hash='#?effect='+encodeURIComponent(effect);api.route();
    assert.equal(count(node('skills-list')),value.skills.filter(item=>item.browseTags.includes(effect)).length,effect);
    assert.equal(node('skills-effect-selection').textContent,'選択中：'+effect);
    assert.match(node('skills-count').textContent,new RegExp('収録データ内：'+count(node('skills-list'))+' / 36 件'));
  }
  const effect='バフ（強）：残忍 / Major Brutality';
  context.location.hash='#?class=class-0&tree=tree-0&q=炎&type=active&form=morph&effect='+encodeURIComponent(effect);api.route();
  assert.equal(count(node('skills-list')),1);assert.match(node('skills-list').innerHTML,/data-skill-id="class-0-morph-a"/);
  assert.match(node('skills-effect-groups').innerHTML,/<details data-effect-group="メジャーバフ" open class="eso-skills-effect-selected">/);
  assert.match(node('skills-classes').innerHTML,/class=class-1&amp;q=/);assert.ok(!node('skills-classes').innerHTML.includes('class=class-1&amp;tree='));
  assert.ok(node('skills-classes').innerHTML.includes('&amp;effect='+encodeURIComponent(effect).replace(/%20/g,'+')));
  node('skills-search').value='Class 0';node('skills-search').events.input();assert.equal(count(node('skills-list')),1);assert.ok(context.location.hash.includes('effect='));
  context.location.hash='#?class=class-0&tree=tree-0&effect='+encodeURIComponent('軽攻撃');api.route();
  assert.equal(count(node('skills-list')),1);assert.match(node('skills-list').innerHTML,/data-skill-id="class-0-base"/);
  context.location.hash='#?class=class-0&tree=tree-2&effect='+encodeURIComponent('ペット');api.route();
  assert.equal(count(node('skills-list')),0);assert.match(node('skills-list').innerHTML,/この条件に一致する収録データはありません/);
});
test('effect URLs survive detail/family/back/forward/reload and clear only on explicit reset',async()=>{
  const value=effectFixture(),{api,node,context,windowEvents}=harness(value);await api.load();
  const params=new URLSearchParams({class:'class-0',tree:'tree-0',q:'炎',type:'active',effect:'メジャーバフ'}),query=params.toString();
  context.location.hash='#?'+query;windowEvents.hashchange();assert.equal(count(node('skills-list')),2);
  const list=node('skills-list').innerHTML;assert.ok(list.includes('effect='+encodeURIComponent('メジャーバフ')));
  context.location.hash='#skill/class-0-base?'+query;windowEvents.hashchange();
  assert.ok(node('skill-detail').innerHTML.includes('href="#?'+query.replace(/&/g,'&amp;')+'"'));
  assert.ok(node('skill-detail').innerHTML.includes('class-0-morph-a?'+query.replace(/&/g,'&amp;')));
  context.location.hash='#?'+query;windowEvents.hashchange();assert.equal(count(node('skills-list')),2);assert.equal(node('skills-effect-selection').textContent,'選択中：メジャーバフ');
  context.location.hash='#skill/class-0-base?'+query;windowEvents.hashchange();assert.equal(node('skills-home').hidden,true);
  const direct=harness(value);direct.context.location.hash=context.location.hash;await direct.api.load();assert.ok(direct.node('skill-detail').innerHTML.includes('effect='+encodeURIComponent('メジャーバフ')));
  context.location.hash='#?'+query;windowEvents.hashchange();node('skills-reset').events.click();
  assert.equal(count(node('skills-list')),36);assert.equal(context.location.hash,'#');assert.equal(node('skills-effect-selection').textContent,'選択中：すべての効果・攻撃・ペット');
  context.location.hash='#?effect=not-collected';windowEvents.hashchange();assert.equal(count(node('skills-list')),36);
});
test('effect panel retains manual disclosure state and unsafe source tags cannot create HTML or script URLs',async()=>{
  const value=effectFixture(),evil='バフ（強）：<img src=x onerror="bad()"> / Major Test';
  value.skills[0].browseTags.push(evil);
  const {api,node,context}=harness(value);await api.load();
  node('skills-effect-groups').events.toggle({target:{dataset:{effectGroup:'メジャーデバフ'},open:true}});
  node('skills-search').events.input();assert.match(node('skills-effect-groups').innerHTML,/<details data-effect-group="メジャーデバフ" open>/);
  context.location.hash='#?effect='+encodeURIComponent(evil);api.route();
  assert.equal(count(node('skills-list')),1);assert.ok(!node('skills-effect-groups').innerHTML.includes('<img'));
  assert.match(node('skills-effect-groups').innerHTML,/&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
  assert.ok(!node('skills-effect-groups').innerHTML.includes('href="javascript:'));
  assert.equal(node('skills-effect-selection').textContent,'選択中：'+evil);
  node('skills-reset').events.click();assert.ok(!node('skills-effect-groups').innerHTML.includes(' open'));
});
test('malformed effect-tag schemas fail safe and retry accepts a valid tagged dataset',async()=>{
  for(const tags of ['ペット',{},['ペット',42],[''],['ペット','ペット']]) {
    const value=effectFixture();value.skills[0].browseTags=tags;const {api,node,context}=harness(value);
    assert.throws(()=>api.validate(value));await api.load();assert.equal(count(node('skills-list')),0);assert.equal(node('skills-retry').hidden,false);
    context.fetch=async()=>({ok:true,json:async()=>effectFixture()});await node('skills-retry').events.click();
    assert.equal(count(node('skills-list')),36);assert.equal(node('skills-retry').hidden,true);
  }
});
