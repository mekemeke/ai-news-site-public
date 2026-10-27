'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),code=fs.readFileSync(path.join(root,'eso-theme.js'),'utf8');
function boot(store={},failRead=false,failWrite=false,missing=false){
 const state={dark:false},attrs={},span={},listeners={};
 const button={hidden:true,setAttribute:(k,v)=>attrs[k]=v,querySelector:()=>span,addEventListener:(k,f)=>listeners[k]=f};
 vm.runInNewContext(code,{document:{body:{classList:{toggle:(k,v)=>state.dark=v}},getElementById:()=>missing?null:button},localStorage:{getItem:k=>{if(failRead)throw Error();return store[k]},setItem:(k,v)=>{if(failWrite)throw Error();store[k]=v}}});
 return {state,attrs,span,button,click:()=>listeners.click(),store};
}
test('defaults light and exposes accessible button',()=>{const a=boot();assert.equal(a.state.dark,false);assert.equal(a.button.hidden,false);assert.equal(a.attrs['aria-pressed'],'false');assert.equal(a.span.textContent,'ダーク')});
test('loads news dark preference',()=>{const a=boot({'ai-news-preview-theme':'dark'});assert.equal(a.state.dark,true);assert.equal(a.attrs['aria-label'],'ライトモードに切り替え')});
test('toggle twice persists across reloads',()=>{const s={},a=boot(s);a.click();assert.equal(s['ai-news-preview-theme'],'dark');assert.equal(boot(s).state.dark,true);a.click();assert.equal(s['ai-news-preview-theme'],'light');assert.equal(boot(s).state.dark,false)});
test('unknown preference is light',()=>assert.equal(boot({'ai-news-preview-theme':'invalid'}).state.dark,false));
test('blocked reads and writes do not stop toggle',()=>{const a=boot({},true,true);a.click();assert.equal(a.state.dark,true);a.click();assert.equal(a.state.dark,false)});
test('missing button causes no failure',()=>assert.doesNotThrow(()=>boot({},false,false,true)));
for(const file of ['eso.html','eso-skills.html','eso-traits-enchants.html'])test(file+' integrates once and keeps security markers',()=>{const s=fs.readFileSync(path.join(root,file),'utf8');assert.equal((s.match(/id="theme"/g)||[]).length,1);assert.equal((s.match(/src="\.\/eso-theme.js\?v=20261027-dark1" defer/g)||[]).length,1);assert.match(s,/eso-theme.css\?v=20261027-dark1/);assert.match(s,/<meta name="robots" content="noindex">/);assert.match(s,/script-src 'self'; style-src 'self'/);assert.match(s,/aria-label="ESOデータベース"/)});
function lum(h){const v=h.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]}
function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('all dark grade colors meet normal text AA on paper and body',()=>{for(const c of ['#edf1e9','#91dda3','#9ecbff','#dfb3f2','#f2cf74'])for(const bg of ['#202d26','#18221e'])assert.ok(ratio(c,bg)>=4.5,`${c} on ${bg}`)});
test('dark small notes meet AA on paper',()=>assert.ok(ratio('#b2bfb5','#202d26')>=4.5));
