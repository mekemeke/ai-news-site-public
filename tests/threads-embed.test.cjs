const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function harness(){
 const nodes=new Map(), scripts=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{dataset:{},events:{},hidden:true,value:'',setAttribute(){},querySelector(){return node(id+'-child')},addEventListener(k,f){(this.events[k]??=[]).push(f)},focus(){},append(){}});return nodes.get(id)}
 const context=vm.createContext({URL,Intl,localStorage:{getItem(){}},location:{hash:''},document:{body:{classList:{toggle(){}}},getElementById:node,addEventListener(){},head:{append(s){scripts.push(s)}},createElement(){return {dataset:{},events:{},addEventListener(k,f){(this.events[k]??=[]).push(f)}}}},window:{addEventListener(){}}});
 let code=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/  loadArticles\(\);\r?\n\}\)\(\);/,'  globalThis.api={threadsPost,renderBlocks,loadThreadsWidgets,advance(){xRenderToken++}};\n})();');
 vm.runInContext(code,context);return {api:context.api,context,scripts};
}
const url='https://www.threads.com/@threads/post/DWjTI0cgH5O';
test('Threads URL validation and canonicalization are strictly allowlisted',()=>{
 const {api}=harness();
 for(const host of ['threads.com','www.threads.com','threads.net','www.threads.net'])assert.equal(api.threadsPost(`https://${host}/@threads/post/DWjTI0cgH5O/?foo=1#x`).href,url);
 assert.equal(api.threadsPost('https://threads.net/t/AbC_123-').href,'https://www.threads.com/t/AbC_123-');
 for(const value of [null,{},'http://threads.com/t/abc','//threads.com/t/abc','https://threads.com.evil.org/t/abc','https://user@threads.com/t/abc','https://threads.com:8443/t/abc','https://threads.com/t/abc\\x','https://threads.com/t/abc\n','https://threads.com/@a','https://threads.com/@a/post/x/embed','https://threads.com/@%22/post/x','https://threads.com/@a/post/x%22','https://threads.com/@a/post/../abc','javascript:alert(1)'])assert.equal(api.threadsPost(value),null,String(value));
});
test('source binding, duplicates and HTML injection are rejected; fallback retained',()=>{
 const {api}=harness(), block={type:'threadspost',url};
 assert.equal(api.renderBlocks([block]),'');
 assert.equal(api.renderBlocks([block],[{url:'https://www.threads.com/@other/post/OTHER'}]),'');
 const html=api.renderBlocks([block,block,{...block,url:'https://threads.net/t/DWjTI0cgH5O'}],[{url}, {url:'https://threads.net/t/DWjTI0cgH5O'}]);
 assert.equal((html.match(/class="threads-embed"/g)||[]).length,1);
 assert.equal((html.match(/Threadsで元投稿を見る/g)||[]).length,2);
 assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/data-text-post-permalink=/);assert.doesNotMatch(html,/<script|<img/);
 assert.equal(api.renderBlocks([{type:'threadspost',url:'https://threads.com/@a/post/<script>'}],[{url}]),'');
});
test('script loads once, rescans after route changes, stale callbacks ignored',()=>{
 const {api,context,scripts}=harness();let count=0;context.window.instgrm={Embeds:{process(){count++}}};
 const container={isConnected:true,querySelector(){return {}}};
 api.loadThreadsWidgets(container);assert.equal(scripts.length,1);assert.equal(count,0);
 api.advance();api.loadThreadsWidgets(container);assert.equal(scripts.length,1);
 for(const cb of scripts[0].events.load)cb();assert.equal(count,1);
 api.advance();api.loadThreadsWidgets(container);assert.equal(count,2);assert.equal(scripts.length,1);
 container.isConnected=false;api.loadThreadsWidgets(container);assert.equal(count,2);
});
test('no script on plain content; missing API, thrown API and load failure remain safe',()=>{
 const {api,context,scripts}=harness();api.loadThreadsWidgets({querySelector(){return null}});assert.equal(scripts.length,0);
 const container={isConnected:true,querySelector(){return {}}};api.loadThreadsWidgets(container);
 api.loadThreadsWidgets(container);assert.equal(scripts.length,1); // Failed/pending load is never retried.
 for(const cb of scripts[0].events.load)assert.doesNotThrow(cb);
 context.window.instgrm={Embeds:{process(){throw Error('unavailable')}}};assert.doesNotThrow(()=>api.loadThreadsWidgets(container));
});
test('CSP change is limited to official Threads script/frame origin',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/name="robots" content="noindex"/);
 assert.match(html,/script-src 'self' https:\/\/platform.twitter.com https:\/\/www.threads.com;/);
 assert.match(html,/frame-src https:\/\/www.youtube-nocookie.com https:\/\/platform.twitter.com https:\/\/www.threads.com;/);
 assert.match(html,/style-src 'self'; connect-src 'self'; img-src 'self' data:;/);
 assert.doesNotMatch(html,/unsafe-inline|unsafe-eval|\*\.threads/);
});
