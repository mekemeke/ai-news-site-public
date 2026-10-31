const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const production=JSON.parse(fs.readFileSync(path.join(root,'data/sets.json'),'utf8'));
const ids=production.sets.slice(0,4).map(s=>s.id);
const record=(update,label)=>({status:'verified',update,label,sources:[{url:'https://example.org/patch',label:'Fixture source'}]});
const metadata={version:1,bySetId:{[ids[0]]:record(10,'Update 10'),[ids[1]]:record(51,'Update 51'),[ids[2]]:record(51,'Update 51')}};
function harness(introductions=metadata) {
  const nodes=new Map(),events={};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:true,events:{},addEventListener(k,v){this.events[k]=v},focus(){},append(){},querySelectorAll(){return []}});return nodes.get(id)};
  const context=vm.createContext({URL,URLSearchParams,HTMLImageElement:class{},location:{hash:''},history:{replaceState(a,b,url){context.location.hash=url},pushState(a,b,url){context.location.hash=url}},document:{getElementById:node,addEventListener(){},createElement:()=>node('retry')},window:{addEventListener(k,v){events[k]=v},scrollTo(){}},fetch:async url=>{if(url.includes('set-introductions')&&introductions===null)throw Error('offline');return {ok:true,json:async()=>url.includes('set-introductions')?introductions:production}}});
  vm.runInContext(fs.readFileSync(path.join(root,'eso.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/,'  globalThis.api={load,route,filter,renderEffects};\n})();'),context);
  return {node,context,api:context.api,events};
}
test('newest order is numeric, stable within update, and unknowns are last; update combines with search and AND effects',async()=>{
  const {node,api,context}=harness();await api.load();
  node('set-sort').value='newest';node('set-sort').events.change();
  const order=[...node('sets').innerHTML.matchAll(/data-set-id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(order.slice(0,4),[ids[1],ids[2],ids[0],ids[3]]);
  context.location.hash='#?update=51&sort=newest';api.route();
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,2);
  node('set-search').value=production.sets[1].englishName;api.filter();
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,1);
  const effect=production.sets[1].browseTags.find(t=>/^(バフ|デバフ)（|メジャー|マイナー|ペット|軽攻撃|重攻撃/.test(t));
  node('set-effect').value=effect;node('set-effect2').value=effect;api.filter();
  assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,1);
  const back=context.location.hash;
  context.location.hash='#set/'+ids[1]+back.slice(1);api.route();
  assert.match(node('set-detail').innerHTML,/追加時期の出典|Fixture source/);
  assert.match(node('set-detail').innerHTML,/完璧版の追加時期とは限りません/);
  context.location.hash=back;eventsCheck();
  function eventsCheck(){api.route();assert.equal(node('set-update').value,'51');assert.equal(node('set-sort').value,'newest')}
  node('set-reset').events.click();assert.equal(context.location.hash,'#');
  context.location.hash='#?update=unknown&sort=newest';api.route();assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,647);
});
test('missing, invalid and hostile introduction data cannot hide equipment or inject markup',async()=>{
  for(const data of [null,{}, {version:1,bySetId:{[ids[0]]:record(-1,'Bad')}},{version:1,bySetId:{[ids[0]]:{...record(51,'Bad'),sources:[{url:'javascript:alert(1)',label:'Bad'}]}}}]){
    const {node,api}=harness(data);await api.load();assert.equal((node('sets').innerHTML.match(/<article /g)||[]).length,650);assert.match(node('set-release-status').textContent,/読み込めません/);
  }
  const {node,api,context}=harness({version:1,bySetId:{[ids[0]]:record(0,'<img src=x>')}});await api.load();assert.ok(node('sets').innerHTML.includes('&lt;img src=x&gt;'));
  context.location.hash='#?update=invalid&sort=invalid';api.route();assert.equal(node('set-update').value,'');assert.equal(node('set-sort').value,'');
});
test('compact cards retain every rendered effect and quality value; source and verification remain in details',async()=>{
  const {node,api,context}=harness();await api.load();const html=node('sets').innerHTML;
  for(const set of production.sets)assert.ok(html.includes(api.renderEffects(set)),set.id);
  assert.ok(!html.includes('class="reference-date"'));
  context.location.hash='#set/'+ids[0];api.route();
  assert.ok(node('set-detail').innerHTML.includes(production.sets[0].verificationNote));
  assert.ok(node('set-detail').innerHTML.includes(production.sets[0].location));
  assert.ok(node('set-detail').innerHTML.includes('class="reference-date"'));
});
