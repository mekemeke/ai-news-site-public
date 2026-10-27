const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function harness(total = 33) {
  const nodes = new Map(), windowEvents = {}, scrolls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML:'',textContent:'',value:'',hidden:id==='detail',children:[],events:{},dataset:{},
      setAttribute(k,v){this[k]=v},addEventListener(k,v){this.events[k]=v},querySelector(){return node(id+'-child')},
      focus(){this.focused=true},scrollIntoView(){this.scrolled=true},append(){}});
    return nodes.get(id);
  };
  const document = {getElementById:node,body:{classList:{toggle(){}}},querySelector:node,querySelectorAll:()=>[],addEventListener(){},head:{append(){}},createElement:()=>node('script')};
  const location={hash:''};
  const articles=Array.from({length:total},(_,i)=>({id:`a${i}`,title:`Item ${i}`,summary:'',category:i%2?'eso':'ai',publishedAt:i%2?'2026-10-26T01:00:00Z':'2026-10-27T01:00:00Z',blocks:[],sources:[]}));
  const ctx=vm.createContext({document,URL,Intl,location,localStorage:{getItem(){}},window:{scrollY:123,scrollTo(...x){scrolls.push(x)},addEventListener(k,v){windowEvents[k]=v}},fetch:async()=>({ok:true,json:async()=>({categories:[{id:'ai',name:'AI'},{id:'eso',name:'ESO'}],articles})})});
  let code=fs.readFileSync(path.join(root,'app.js'),'utf8');
  code=code.replace(/  loadArticles\(\);\r?\n\}\)\(\);/,'  globalThis.api={loadArticles,renderList,route};\n})();');
  vm.runInContext(code,ctx);
  return {node,api:ctx.api,location,scrolls,click(id){node(id).events.click()},cards(){return (node('articles').innerHTML.match(/class="news-card"/g)||[]).length}};
}
for(const n of [0,1,15,16,30,31,33]) test(`boundary ${n} articles`,async()=>{
  const h=harness(n); await h.api.loadArticles();
  assert.equal(h.cards(),Math.min(15,n)); assert.equal(h.node('pagination').hidden,n<=15); assert.equal(h.node('page-prev').disabled,true);
  for(let p=2;p<=Math.ceil(n/15);p++){h.click('page-next');assert.equal(h.cards(),Math.min(15,n-(p-1)*15));assert.equal(h.node('page-status').textContent,`${p} / ${Math.ceil(n/15)} ページ`)}
  assert.equal(h.node('page-next').disabled,true); const before=h.node('articles').innerHTML; h.click('page-next');assert.equal(h.node('articles').innerHTML,before);
  assert.equal(h.node('end-note').hidden,n===0);
});
test('search/date/category reset current page and paginate filtered matches',async()=>{
  const h=harness();await h.api.loadArticles();h.click('page-next');
  h.node('search').value='Item 32';h.node('search').events.input();assert.equal(h.cards(),1);assert.equal(h.node('page-status').textContent,'1 / 1 ページ');
  h.node('search').value='';h.node('search').events.input();h.click('page-next');h.node('date').value='2026-10-26';h.node('date').events.change();assert.equal(h.cards(),15);assert.equal(h.node('page-status').textContent,'1 / 2 ページ');h.click('page-next');assert.equal(h.cards(),1);
  h.node('date').value='';h.node('date').events.change();h.click('page-next');h.node('categories').events.click({target:{closest:()=>({dataset:{category:'ai'}})}});assert.equal(h.cards(),15);assert.equal(h.node('page-status').textContent,'1 / 2 ページ');h.click('page-next');assert.equal(h.cards(),2);
});
test('detail/back preserves page and prior scroll; paging moves focus to heading',async()=>{
  const h=harness();await h.api.loadArticles();h.click('page-next');const old=h.node('articles').innerHTML;
  assert.equal(h.node('list-title').focused,true);assert.equal(h.node('list-title').scrolled,true);
  h.location.hash='#article/a1';h.api.route();assert.equal(h.node('home').hidden,true);
  h.location.hash='';h.api.route();assert.equal(h.node('home').hidden,false);assert.equal(h.node('articles').innerHTML,old);assert.equal(h.node('page-status').textContent,'2 / 3 ページ');assert.deepEqual(h.scrolls.at(-1),[0,123]);
  h.click('page-prev');assert.equal(h.node('page-status').textContent,'1 / 3 ページ');
});
test('markup preserves noindex/CSP and accessible controls; styles are scoped',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/name="robots" content="noindex"/);assert.match(html,/Content-Security-Policy/);assert.match(html,/id="page-prev" type="button" aria-controls="articles"/);assert.match(html,/id="page-next" type="button" aria-controls="articles"/);assert.match(html,/id="list-title" tabindex="-1"/);
  assert.match(fs.readFileSync(path.join(root,'style.css'),'utf8'),/\.news-pagination\{display:flex;flex-wrap:wrap/);
});

test('skip hash after leaving detail does not restore stale scroll',async()=>{
  const h=harness();await h.api.loadArticles();h.click('page-next');
  h.location.hash='#article/a1';h.api.route();h.location.hash='';h.api.route();
  h.click('page-next');const scrollCalls=h.scrolls.length;
  h.location.hash='#main';h.api.route();assert.equal(h.scrolls.length,scrollCalls);assert.equal(h.node('page-status').textContent,'3 / 3 ページ');
});
