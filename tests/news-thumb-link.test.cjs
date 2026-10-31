const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json')));
function harness(d=data){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:id==='detail',dataset:{},events:{},setAttribute(){},addEventListener(k,v){this.events[k]=v},querySelector(){return node(id+'-child')},focus(){},append(){}});return nodes.get(id)};
 const context=vm.createContext({URL,Intl,location:{hash:''},localStorage:{getItem(){}},document:{getElementById:node,body:{classList:{toggle(){}}},querySelector:node,querySelectorAll:()=>[],addEventListener(){},head:{append(){}},createElement:()=>node('script')},window:{scrollY:0,scrollTo(){},addEventListener(){}}});
 const code=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/  loadArticles\(\);\r?\n\}\)\(\);/,'  globalThis.api={loadArticles};\n})();');
 vm.runInContext(code,context);context.fetch=async()=>({ok:true,json:async()=>d});
 return {api:context.api,node};
}
test('each list thumbnail is a normal link to the same article as its title, with an article-name label',async()=>{
 const {api,node}=harness();await api.loadArticles();
 const html=node('articles').innerHTML, cards=html.split('<article class="news-card">').slice(1);
 assert.equal(cards.length,15);
 for(const card of cards){
  const thumb=card.match(/^<a class="news-card-thumb" href="([^"]+)" aria-label="([^"]+)"><img class="news-thumbnail" [^>]*><\/a>/);
  assert.ok(thumb,card.slice(0,120));
  const title=card.match(/<h2><a href="([^"]+)">([^<]+)<\/a>/);
  assert.equal(thumb[1],title[1]);assert.match(thumb[1],/^#article\//);
  assert.equal(thumb[2],`${title[2]}（記事を開く）`);
  assert.doesNotMatch(thumb[0],/target=|tabindex="-1"|onclick/);
 }
 assert.equal((html.match(/news-card-thumb/g)||[]).length,15);
});
test('titles are escaped inside the thumbnail label',async()=>{
 const evil={...data,articles:[{...data.articles[0],id:'x"y',title:'A"<b>&\''}]};
 const {api,node}=harness(evil);await api.loadArticles();
 const html=node('articles').innerHTML;
 assert.match(html,/href="#article\/x%22y" aria-label="A&quot;&lt;b&gt;&amp;&#39;（記事を開く）"/);
 assert.doesNotMatch(html,/<b>/);
});
test('cache numbers updated; CSP and noindex unchanged',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/style\.css\?v=20261031-pagination-top1/);assert.match(html,/app\.js\?v=20261031-pagination-top1/);
 assert.ok(fs.readFileSync(path.join(root,'app.js'),'utf8').includes("articles.json?v=20261029-thumb-link1"));
 assert.match(html,/name="robots" content="noindex"/);
 assert.match(html,/script-src 'self' https:\/\/platform.twitter.com https:\/\/www.threads.com; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src https:\/\/www.youtube-nocookie.com https:\/\/platform.twitter.com https:\/\/www.threads.com;/);
});

