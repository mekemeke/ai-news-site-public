const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function harness(){
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{dataset:{},hidden:true,value:'',setAttribute(){},querySelector(){return node(id+'-child')},addEventListener(){},focus(){},append(){}});return nodes.get(id)}
 const context=vm.createContext({URL,Intl,localStorage:{getItem(){}},location:{hash:''},document:{body:{classList:{toggle(){}}},getElementById:node,addEventListener(){},head:{append(){}},createElement(){return {dataset:{},addEventListener(){}}}},window:{addEventListener(){}}});
 const code=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/  loadArticles\(\);\r?\n\}\)\(\);/,'  globalThis.api={youtubeVideo,renderBlocks,videoEmbed,bodyVideoIds};\n})();');
 vm.runInContext(code,context);return context.api;
}
const id='ID6vEy94j7c', url=`https://www.youtube.com/watch?v=${id}`;
const block={type:'youtube',videoId:id,url,title:'Sprout <demo>'};
test('YouTube URL validation accepts only official watch / youtu.be forms',()=>{
 const api=harness();
 for(const value of [url,`https://youtube.com/watch?v=${id}&t=30s`,`https://m.youtube.com/watch?v=${id}`,`https://youtu.be/${id}`,`https://youtu.be/${id}/?si=x#t`])assert.equal(api.youtubeVideo(value).href,url,value);
 for(const value of [null,{},`http://www.youtube.com/watch?v=${id}`,`//www.youtube.com/watch?v=${id}`,`https://www.youtube.com.evil.org/watch?v=${id}`,`https://user@www.youtube.com/watch?v=${id}`,`https://www.youtube.com:8443/watch?v=${id}`,
  `https://www.youtube.com/embed/${id}`,`https://www.youtube.com/watch?v=${id}x`,'https://www.youtube.com/watch?v=short','https://www.youtube.com/watch?v=ID6vEy94j7%22',`https://www.youtube.com/watch?v=${id}\n`,`https://www.youtube-nocookie.com/embed/${id}`,'javascript:alert(1)'])
  assert.equal(api.youtubeVideo(value),null,String(value));
});
test('body video requires matching ID, URL and recorded source; duplicates and injection rejected',()=>{
 const api=harness(), sources=[{url}];
 assert.equal(api.renderBlocks([block]),'');
 assert.equal(api.renderBlocks([block],[{url:'https://www.youtube.com/watch?v=pQ_Dnr9Q4k8'}]),'');
 assert.equal(api.renderBlocks([{...block,videoId:'pQ_Dnr9Q4k8'}],sources),'');
 assert.equal(api.renderBlocks([{...block,videoId:'<script>x</s'}],sources),'');
 assert.equal(api.renderBlocks([{...block,url:`https://www.youtube.com/watch?v=${id}"><script>`}],sources),'');
 const html=api.renderBlocks([block,block,{...block,url:`https://youtu.be/${id}`}],[...sources,{url:`https://youtu.be/${id}`}]);
 assert.equal((html.match(/<iframe /g)||[]).length,1);
 assert.match(html,new RegExp(`src="https://www.youtube-nocookie.com/embed/${id}"`));
 assert.match(html,/class="video-embed"/);assert.match(html,/loading="lazy"/);
 assert.match(html,new RegExp(`<a href="${url.replace(/[?]/g,'\\?')}" target="_blank" rel="noopener noreferrer">YouTubeで元動画を見る ↗</a>`));
 assert.match(html,/title="Sprout &lt;demo&gt;"/);assert.doesNotMatch(html,/<script|<img/);
 assert.match(api.renderBlocks([{...block,title:''}],sources),/title="YouTube動画"/);
});
test('top video is suppressed only when the same video is shown in the body',()=>{
 const api=harness(), sources=[{url}];
 const moved={title:'記事',videoId:id,videoTitle:'Sprout'};
 assert.match(api.videoEmbed(moved),/loading="eager"/);
 assert.equal(api.videoEmbed(moved,api.bodyVideoIds([block],sources)),'');
 assert.match(api.videoEmbed(moved,api.bodyVideoIds([block],[])),/embed\/ID6vEy94j7c/); // invalid body block → top stays
 assert.match(api.videoEmbed({...moved,videoId:'MWt-ytgfo0Q'},api.bodyVideoIds([block],sources)),/embed\/MWt-ytgfo0Q/);
 assert.equal(api.videoEmbed({title:'x'}),'');
});
test('published youtube blocks follow their source paragraph and precede the takeaway',()=>{
 const api=harness(), data=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json'),'utf8'));
 const placed={};
 for(const article of data.articles){
  const body=api.bodyVideoIds(article.blocks,article.sources);
  article.blocks.forEach((b,i)=>{
   if(b.type!=='youtube')return;
   assert.ok(body.has(b.videoId),`${article.id}: ${b.videoId} must validate`);
   const prev=article.blocks[i-1], next=article.blocks[i+1];
   assert.equal(prev.type,'paragraph');assert.ok(prev.text.startsWith('出典')&&prev.text.includes(b.url),`${article.id}: source before ${b.videoId}`);
   assert.equal(next.type,'feature');assert.equal(next.label,'dotの所感');
   (placed[article.id]??=[]).push(b.videoId);
  });
  if(body.size)assert.equal(api.videoEmbed(article,body),'',`${article.id}: no duplicate top video`);
  const html=api.renderBlocks(article.blocks,article.sources);
  for(const v of body)assert.equal(html.split(`embed/${v}"`).length-1,1);
 }
 assert.deepEqual(placed,{'20261029-ai-tips':['ID6vEy94j7c','pQ_Dnr9Q4k8'],'20261029-eso-tips':['MWt-ytgfo0Q']});
});
test('existing top-level videos, CSP and noindex are unchanged',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json'),'utf8'));
 assert.equal(data.articles.find(a=>a.id==='20261029-chatgpt-api-credits').videoId,'ujmyzWSj8IU');
 assert.ok(data.articles.filter(a=>a.videoId).length>0);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/name="robots" content="noindex"/);
 assert.match(html,/frame-src https:\/\/www.youtube-nocookie.com https:\/\/platform.twitter.com https:\/\/www.threads.com;/);
 assert.match(html,/script-src 'self' https:\/\/platform.twitter.com https:\/\/www.threads.com;/);
});
