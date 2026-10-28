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

const expanded = structuredClone(fixture);
expanded.categories = ['weapon','world','armor','guild','alliance','racial','craft'].map(id => ({id,nameEn:id,nameJa:id,trees:[{id:'line',nameEn:'Line',nameJa:'ライン'},{id:'second',nameEn:'Second'}]}));
for (const c of expanded.categories) {
  expanded.skills.push({id:c.id+'-base',categoryId:c.id,treeId:'line',nameEn:c.id+' Base',type:'active',descriptionJa:'説明',browseTags:['重攻撃'],baseSkillId:null});
  expanded.skills.push({id:c.id+'-morph',categoryId:c.id,treeId:'line',nameEn:c.id+' Morph',type:'active',descriptionJa:'説明',browseTags:['軽攻撃'],baseSkillId:c.id+'-base'});
  expanded.skills.push({id:c.id+'-passive',categoryId:c.id,treeId:'second',nameEn:c.id+' Passive',type:'passive',descriptionJa:'説明'});
}
test('seven explicit categories coexist with legacy classes and each line filters independently',async()=>{
 const {api,node,context}=harness(expanded);await api.load();
 assert.equal(count(node('skills-list')),57);
 assert.equal((node('skills-categories').innerHTML.match(/<a /g)||[]).length,9);
 for(const c of expanded.categories){
  context.location.hash='#?category='+c.id;api.route();assert.equal(count(node('skills-list')),3);assert.equal(node('skills-class-section').hidden,true);
  context.location.hash='#?category='+c.id+'&tree=line';api.route();assert.equal(count(node('skills-list')),2);
  assert.match(node('skills-trees').innerHTML,/category=/);
 }
 context.location.hash='#?category=class';api.route();assert.equal(count(node('skills-list')),36);assert.equal(node('skills-class-section').hidden,false);
 context.location.hash='#?class=class-0&tree=tree-0';api.route();assert.equal(count(node('skills-list')),3);
});
test('category effects, form and search combine and detail routes retain state across back/forward/reload',async()=>{
 const {api,node,context}=harness(expanded);await api.load();
 const query='category=weapon&tree=line&q=Base&type=active&form=morph&effect='+encodeURIComponent('軽攻撃');
 context.location.hash='#?'+query;api.route();assert.equal(count(node('skills-list')),1);
 assert.match(node('skills-list').innerHTML,/weapon-morph/);
 context.location.hash='#skill/weapon-morph?'+query;api.route();assert.match(node('skill-detail').innerHTML,/<dt>系統<\/dt><dd>weapon/);
 assert.match(node('skill-detail').innerHTML,/category=weapon&amp;tree=line/);
 assert.match(node('skill-detail').innerHTML,/weapon-base\?category=weapon/);
 context.location.hash='#?'+query;api.route();assert.equal(count(node('skills-list')),1);
 const reload=harness(expanded);reload.context.location.hash='#skill/weapon-morph?'+query;await reload.api.load();assert.match(reload.node('skill-detail').innerHTML,/category=weapon/);
 node('skills-reset').events.click();assert.equal(context.location.hash,'#');assert.equal(count(node('skills-list')),57);
});
test('invalid routes cannot mix class and category; invalid line does not silently select other category',async()=>{
 const {api,node,context}=harness(expanded);await api.load();
 context.location.hash='#?category=weapon&class=class-0&tree=second';api.route();assert.equal(count(node('skills-list')),1);assert.match(node('skills-list').innerHTML,/weapon-passive/);
 context.location.hash='#?category=world&tree=absent';api.route();assert.equal(count(node('skills-list')),3);
 context.location.hash='#?category=unknown&tree=line';api.route();assert.equal(count(node('skills-list')),57);
 context.location.hash='#?category=class&tree=line';api.route();assert.equal(count(node('skills-list')),36);
});
test('category validation rejects unknown owners, duplicate lines, ambiguous class identity and cross-category morphs',()=>{
 for(const mutate of [
  v=>v.categories.push(v.categories[0]),
  v=>v.categories[0].trees.push(v.categories[0].trees[0]),
  v=>v.categories[0].id='fake',
  v=>v.skills.at(-1).categoryId='fake',
  v=>v.skills.at(-1).classId='class-0',
  v=>v.skills.find(x=>x.id==='weapon-morph').baseSkillId='world-base',
  v=>v.skills.find(x=>x.id==='weapon-morph').baseSkillId='weapon-passive',
  v=>v.skills.find(x=>x.id==='weapon-morph').treeId='second'
 ]){const v=structuredClone(expanded);mutate(v);assert.throws(()=>harness(v).api.validate(v));}
});
test('nonclass names/notes escape HTML and invalid source/icon paths remain safe',async()=>{
 const v=structuredClone(expanded);v.categories[0].nameJa='<script>bad</script>';v.skills.find(x=>x.id==='weapon-base').descriptionJa='<img onerror=bad>';
 const {api,node,context}=harness(v);await api.load();context.location.hash='#?category=weapon';api.route();assert.match(node('skills-list').innerHTML,/&lt;script&gt;/);assert.match(node('skills-list').innerHTML,/&lt;img/);assert.ok(!node('skills-list').innerHTML.includes('<script>'));
});
test('all classes chip excludes nonclass and elemental variants are not fabricated morphs',async()=>{
 const v=structuredClone(expanded);v.skills.push({id:'weapon-element',categoryId:'weapon',treeId:'line',nameEn:'Element',type:'active',baseSkillId:null,variantOfSkillId:'weapon-morph',variantNote:'装備した杖の属性による派生表示'});
 const {api,node,context}=harness(v);await api.load();assert.match(node('skills-classes').innerHTML,/href="#\?category=class">すべてのクラス/);
 context.location.hash='#?category=weapon&tree=line';api.route();assert.equal(count(node('skills-list')),3);assert.equal((node('skills-list').innerHTML.match(/class="eso-skills-group"/g)||[]).length,1);
 context.location.hash='#?category=weapon&form=variant';api.route();assert.equal(count(node('skills-list')),1);assert.match(node('skills-list').innerHTML,/属性派生/);
 context.location.hash='#?category=weapon&form=morph';api.route();assert.equal(count(node('skills-list')),1);assert.ok(!node('skills-list').innerHTML.includes('data-skill-id="weapon-element"'));
 context.location.hash='#skill/weapon-element?category=weapon';api.route();assert.match(node('skill-detail').innerHTML,/weapon-base\?category=weapon/);assert.match(node('skill-detail').innerHTML,/装備した杖の属性/);
 for(const mutate of [x=>x.skills.at(-1).variantOfSkillId='world-base',x=>x.skills.at(-1).baseSkillId='weapon-base',x=>x.skills.at(-1).variantOfSkillId='weapon-element']) {const b=structuredClone(v);mutate(b);assert.throws(()=>harness(b).api.validate(b));}
});
test('published class definitions and all 462 record fields remain byte-equivalent JSON semantics',()=>{
 const crypto=require('node:crypto');const d=JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'),'utf8'));
 const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
 assert.equal(d.skills.filter(s=>s.classId).length,462);
 assert.equal(sha(d.classes),'0051f92377624aaae6410080583b7430057bb1057b41d06fe0267d227f0f94e8');
 assert.equal(sha(d.skills.filter(s=>s.classId)),'bc79c7eaf985e3b70046e755af8e9395717905cba892c84e901e55aa117e8d9e');
 const h=harness(d);assert.doesNotThrow(()=>h.api.validate(d));
});
test('integrated nonclass inventory has complete descriptions and valid sources without changing class data',async()=>{
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'),'utf8')),nonclass=d.skills.filter(s=>!s.classId);
 assert.equal(nonclass.length,500);assert.equal(d.categories.length,7);assert.equal(d.categories.reduce((n,c)=>n+c.trees.length,0),42);
 assert.equal(nonclass.filter(s=>s.variantOfSkillId).length,36);assert.equal(nonclass.filter(s=>s.baseSkillId).length,168);
 const {api,node,context}=harness(d);await api.load();assert.equal(count(node('skills-list')),962);
 for(const s of nonclass){assert.ok(s.descriptionJa);assert.ok(api.safeURL(s.sourceUrl));assert.ok(!Object.keys(s).some(k=>k.startsWith('_')));assert.ok(!s.classId);}
 for(const c of d.categories){context.location.hash='#?category='+c.id;api.route();assert.equal(count(node('skills-list')),nonclass.filter(s=>s.categoryId===c.id).length);for(const t of c.trees){context.location.hash='#?category='+c.id+'&tree='+t.id;api.route();assert.equal(count(node('skills-list')),nonclass.filter(s=>s.categoryId===c.id&&s.treeId===t.id).length);}}
 assert.ok(!node('skills-list').innerHTML.includes('reference-snapshot'));
});
test('sustained health drains do not display a misleading zero cost and source conflicts stay explicit',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'),'utf8'));
 for(const id of ['blood-frenzy','sated-fury','simmering-frenzy']) {const s=d.skills.find(s=>s.id==='nonclass-world-'+id);assert.ok(s);assert.equal(s.cost,undefined);assert.match(s.costNote,/無料とは扱わず/);}
 const spray=d.skills.find(s=>s.id==='nonclass-weapon-acid-spray');assert.ok(spray);assert.equal(spray.durationSeconds,undefined);assert.equal(spray.verificationStatus,'source-conflict');
});
