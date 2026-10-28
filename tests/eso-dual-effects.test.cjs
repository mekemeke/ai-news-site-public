const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const tagPairs = [['ペット','重攻撃'],['軽攻撃','重攻撃'],['メジャーバフ','マイナーバフ'],['メジャーデバフ','重攻撃']];
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const datasets = {set:JSON.parse(read('data/sets.json')),skills:JSON.parse(read('data/skills.json'))};
const items = (kind,data=datasets[kind]) => data[kind === 'set' ? 'sets' : 'skills'];
function harness(kind,data=datasets[kind],hash='') {
  const nodes=new Map(),events={},stack=[hash]; let index=0;
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{value:'',innerHTML:'',textContent:'',hidden:id==='skill-detail'||id==='set-detail',disabled:true,events:{},links:[],addEventListener(k,v){this.events[k]=v;},querySelectorAll(){return this.links;},focus(){this.focused=true;},append(){}});
    return nodes.get(id);
  };
  const context=vm.createContext({URL,URLSearchParams,HTMLImageElement:class{},location:{hash},history:{replaceState(a,b,url){stack[index]=url;context.location.hash=url;},pushState(a,b,url){stack.splice(++index);stack.push(url);context.location.hash=url;}},document:{getElementById:node,addEventListener(){},createElement:()=>({})},window:{addEventListener(k,v){events[k]=v;},scrollTo(){}},fetch:async()=>({ok:true,json:async()=>data})});
  vm.runInContext(read(kind==='set'?'eso.js':'eso-skills.js').replace(/  load\(\);\r?\n\}\)\(\);/,'  globalThis.api={load,route};\n})();'),context);
  const count=()=>kind==='set'?(node('sets').innerHTML.match(/<article /g)||[]).length:(node('skills-list').innerHTML.match(/data-skill-id=/g)||[]).length;
  const choose=(position,value)=>{node(kind+'-effect'+(position===2?'2':'')).value=value;node(kind+'-effect'+(position===2?'2':'')).events.change();};
  const move=delta=>{index+=delta;assert.ok(index>=0&&index<stack.length);context.location.hash=stack[index];events.popstate();};
  const navigate=url=>{context.history.pushState(null,'',url);events.hashchange();};
  return {node,context,api:context.api,count,choose,move,navigate,stack,events};
}
for(const kind of ['set','skills']) {
  test(kind+': both selectors default to all; each is independently optional and duplicate selection is idempotent',async()=>{
    const h=harness(kind);await h.api.load();
    assert.equal(h.count(),items(kind).length);
    for(const suffix of ['','2']) {assert.equal(h.node(kind+'-effect'+suffix).value,'');assert.equal(h.node(kind+'-effect'+suffix).disabled,false);assert.match(h.node(kind+'-effect'+suffix).innerHTML,/<option value="">すべての効果<\/option>/);}
    h.choose(2,'重攻撃'); const expected=items(kind).filter(x=>x.browseTags?.includes('重攻撃')).length;
    assert.equal(h.count(),expected);h.choose(1,'重攻撃');assert.equal(h.count(),expected);
    h.choose(2,'');assert.equal(h.count(),expected);h.choose(1,'');assert.equal(h.count(),items(kind).length);
  });
  test(kind+': real dataset pairs return exactly their intersection, never the union',async()=>{
    const h=harness(kind);await h.api.load();
    for(const [first,second] of tagPairs) {
      h.choose(1,first);h.choose(2,second);
      const expected=items(kind).filter(x=>[first,second].every(t=>x.browseTags?.includes(t))).length;
      assert.equal(h.count(),expected,first+' AND '+second);assert.ok(h.count()<=items(kind).filter(x=>x.browseTags?.includes(first)).length);
      h.choose(2,'');assert.equal(h.count(),items(kind).filter(x=>x.browseTags?.includes(first)).length);
    }
  });
  test(kind+': repeated selector changes, Back/Forward, detail reload, and reset preserve coherent URL state',async()=>{
    const h=harness(kind);await h.api.load();h.choose(1,'ペット');h.choose(2,'重攻撃');const url=h.context.location.hash,intersection=h.count(),length=h.stack.length;
    h.choose(2,'重攻撃');assert.equal(h.stack.length,length,'unchanged selections do not add history entries');
    h.choose(2,'軽攻撃');h.move(-1);assert.equal(h.node(kind+'-effect2').value,'重攻撃');assert.equal(h.count(),intersection);
    h.move(1);assert.equal(h.node(kind+'-effect2').value,'軽攻撃');h.move(-1);
    const item=items(kind).find(x=>['ペット','重攻撃'].every(t=>x.browseTags?.includes(t)))||items(kind)[0];
    const detail='#'+(kind==='set'?'set':'skill')+'/'+item.id+url.slice(1);h.navigate(detail);
    const fresh=harness(kind,datasets[kind],detail);await fresh.api.load();
    assert.ok(fresh.node(kind==='set'?'set-detail':'skill-detail').innerHTML.includes(url.replace(/&/g,'&amp;')),'direct detail URL retains both conditions');
    h.move(-1);assert.equal(h.count(),intersection);h.move(1);assert.equal(h.node(kind==='set'?'sets-home':'skills-home').hidden,true);h.move(-1);
    h.node(kind+'-reset').events.click();assert.equal(h.context.location.hash,'#');assert.equal(h.node(kind+'-effect').value,'');assert.equal(h.node(kind+'-effect2').value,'');assert.equal(h.count(),items(kind).length);
    h.node(kind+'-reset').events.click();assert.equal(h.count(),items(kind).length);
  });
  test(kind+': invalid condition URLs fail safely and a zero result remains explicit',async()=>{
    const h=harness(kind,datasets[kind],'#?effect=not-a-tag&effect2=%3Cscript%3E');await h.api.load();
    assert.equal(h.count(),items(kind).length);assert.equal(h.node(kind+'-effect').value,'');assert.equal(h.node(kind+'-effect2').value,'');
    h.node(kind+'-search').value='__never_a_match__';h.node(kind+'-search').events.input();h.choose(1,'ペット');h.choose(2,'重攻撃');
    assert.equal(h.count(),0);assert.match(h.node(kind==='set'?'sets':'skills-list').innerHTML,/ゲーム内に存在しない/);
  });
}
test('set shortcuts preserve both effects, category and search; legacy category links still filter',async()=>{
  const h=harness('set');await h.api.load();
  const link=dataset=>({dataset,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},closest(){return {};}});
  const category=link({setCategory:'軽装'}),combat=link({setEffect:'軽攻撃'}),named=link({effect:'メジャーバフ'});
  h.node('sets-home').links=[category,combat];h.node('effect-filters').links=[named];
  h.node('set-category').value='軽装';h.node('set-search').value='a';h.node('set-search').events.input();h.choose(1,'ペット');h.choose(2,'重攻撃');
  for(const item of [category,combat,named]) {const p=new URLSearchParams(item.attrs.href.slice(2));assert.equal(p.get('effect2'),'重攻撃');assert.equal(p.get('category'),'軽装');assert.equal(p.get('q'),'a');}
  assert.equal(new URLSearchParams(category.attrs.href.slice(2)).get('effect'),'ペット');
  assert.equal(h.count(),items('set').filter(x=>x.browseTags?.includes('ペット')&&x.browseTags?.includes('重攻撃')&&(x.category==='軽装'||x.browseTags?.includes('軽装'))&&[x.name,x.englishName,x.summary,x.location,x.category,...x.effects.map(e=>e.text)].join(' ').toLocaleLowerCase('ja').includes('a')).length);
  h.navigate('#?category='+encodeURIComponent('ペット'));assert.equal(h.count(),items('set').filter(x=>x.browseTags?.includes('ペット')||x.category==='ペット').length);
});
test('skills category/class/tree/type/form/search and effect shortcuts retain AND condition',async()=>{
  const h=harness('skills');await h.api.load();h.navigate('#?category=weapon&tree=weapon-two-handed&type=active&form=base&effect='+encodeURIComponent('重攻撃')+'&effect2='+encodeURIComponent('メジャーバフ'));
  const actualTree=h.node('skills-trees').innerHTML;assert.ok(actualTree.includes('effect2='));
  for(const id of ['skills-categories','skills-classes','skills-trees','skills-combat-effects','skills-effect-groups']) assert.ok(h.node(id).innerHTML.includes('effect2='),id);
  const expected=items('skills').filter(x=>x.categoryId==='weapon'&&x.treeId==='weapon-two-handed'&&x.type==='active'&&!x.baseSkillId&&!x.variantOfSkillId&&['重攻撃','メジャーバフ'].every(t=>x.browseTags?.includes(t))).length;
  assert.equal(h.count(),expected);
  h.node('skills-search').value='__none__';h.node('skills-search').events.input();assert.equal(h.count(),0);assert.equal(new URLSearchParams(h.context.location.hash.slice(2)).get('effect2'),'メジャーバフ');
});
test('selectors are labeled, responsive and use theme variables; CSP/noindex remain unchanged',()=>{
  const css=read('eso-effect-filters.css');assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/min-height:44px/);assert.match(css,/color:var\(--ink\)/);assert.match(css,/background:var\(--paper\)/);
  for(const [file,prefix] of [['eso.html','set'],['eso-skills.html','skills']]) {
    const html=read(file);assert.match(html,/name="robots" content="noindex"/);assert.match(html,/script-src 'self'; style-src 'self'; connect-src 'self'/);assert.ok(!/<script>/.test(html));
    assert.ok(html.includes('eso-effect-filters.css?v=20261028-dual1'));assert.ok(html.includes('id="'+prefix+'-effect"'));assert.ok(html.includes('id="'+prefix+'-effect2"'));assert.ok(html.includes('条件2にも合うものだけ'));
  }
});
