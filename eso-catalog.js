'use strict';
(() => {
  const treeNames = {craft:'クラフト',warfare:'戦闘',fitness:'体力'};
  function escapeHTML(value) {return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function safeURL(value) {try {const u=new URL(value),h=u.hostname.toLowerCase().replace(/\.$/,'');return u.protocol==='https:' && !u.username && !u.password && !u.port && h.includes('.') && !/^[\d.]+$/.test(h) && !h.includes(':') && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(h) ? u.href : '';} catch {return '';}}
  function validateData(data,mode) {
    if(!data || !Array.isArray(data.items) || !data.items.length || !Array.isArray(data.sources) || !Array.isArray(data.notes)) throw new Error('schema');
    const ids=new Set(), sourcesOK=xs=>Array.isArray(xs)&&xs.every(s=>s&&typeof s.label==='string'&&typeof s.url==='string'&&safeURL(s.url));
    if(!sourcesOK(data.sources)||!data.notes.every(n=>typeof n==='string'))throw new Error('schema');
    for(const item of data.items){
      if(!item || typeof item.id!=='string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id) || typeof item.name!=='string' || !item.name.trim() || !sourcesOK(item.sources) || !Array.isArray(item.notes)||!item.notes.every(n=>typeof n==='string'))throw new Error('schema');
      ids.add(item.id);
      for(const key of ['nameJa','effectJa','effect','statusLabel','category'])if(item[key]!=null&&typeof item[key]!=='string')throw new Error('schema');
      if(mode==='champion'&&(!Object.hasOwn(treeNames,item.tree)||![true,false,null].includes(item.slottable)))throw new Error('schema');
      if(item.baseValue!=null&&typeof item.baseValue!=='string'&&(!Number.isFinite(item.baseValue)||item.baseValue<0))throw new Error('schema');
      for(const key of ['maxPoints','stageCount'])if(item[key]!=null&&(!Number.isFinite(item[key])||item[key]<0))throw new Error('schema');
      if(item.stages!=null&&(!Array.isArray(item.stages)||item.stages.some(v=>!v||(v.points!=null&&(!Number.isFinite(v.points)||v.points<0))||(v.effect!=null&&typeof v.effect!=='string')||(v.effectJa!=null&&typeof v.effectJa!=='string'))))throw new Error('schema');
    }
    return data;
  }
  function kindOf(item) {return item.slottable===true?'slottable':item.slottable===false?'passive':'unknown';}
  function filterItems(items, state, mode) {
    const q=String(state.q||'').toLocaleLowerCase();
    return items.filter(item => (!state.group || (mode==='champion'?item.tree:item.category)===state.group) && (!state.kind || kindOf(item)===state.kind) && (!q || [item.name,item.nameJa,item.effect,item.effectJa,...(item.notes||[])].join(' ').toLocaleLowerCase().includes(q)));
  }
  function sourceHTML(source) {const url=safeURL(source.url);return url?`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.label||'出典')}</a>`:escapeHTML(source.label||'出典URL未確認');}
  function renderCard(item,mode) {
    const e=escapeHTML; const title=item.nameJa||item.name;
    const tags=[];
    if(mode==='champion') {tags.push(treeNames[item.tree]||item.tree||'星座未確認');tags.push({slottable:'装備する星',passive:'常時効果',unknown:'発動方法未確認'}[kindOf(item)]);}
    else if(item.category) tags.push(item.category);
    const value=mode==='mundus'?`<p class="catalog-points">基本値（神々なし）：${item.baseValue==null?'未確認':e(item.baseValue)}${item.unit?' '+e(item.unit):''}</p>`:'';
    const visibleNotes=mode==='mundus'?(item.notes||[]).map(n=>`<p class="catalog-status">${e(n)}</p>`).join(''):'';
    const pts=mode==='champion'?`<p class="catalog-points">最大投資：${item.maxPoints==null?'未確認':e(item.maxPoints)+' CP'}${item.stageCount==null?'':' ／ '+e(item.stageCount)+'段階'}</p>`:'';
    const stages=(item.stages||[]).map(s=>`<li>${s.points==null?'必要ポイント未確認':e(s.points)+' CP'}：${e(s.effectJa||s.effect||'効果未確認')}</li>`).join('');
    return `<article class="catalog-card${mode==='champion' && Object.hasOwn(treeNames,item.tree)?' catalog-tree-'+item.tree:''}" id="${e(item.id)}"><div class="catalog-tags">${tags.map(t=>`<span class="catalog-tag">${e(t)}</span>`).join('')}</div><h2>${e(title)}</h2>${item.nameJa?`<p class="catalog-en">${e(item.name)}</p>`:''}<p class="catalog-effect">${e(item.effectJa||item.effect||'効果未確認')}</p>${pts}${value}${visibleNotes}${item.statusLabel?`<p class="catalog-status">${e(item.statusLabel)}</p>`:''}<details><summary>条件・数値・出典</summary>${item.effectJa&&item.effect?`<p lang="en">${e(item.effect)}</p>`:''}${stages?`<ul class="catalog-stage">${stages}</ul>`:''}${mode==='mundus'?'':(item.notes||[]).map(n=>`<p>${e(n)}</p>`).join('')}${(item.sources||[]).map(s=>`<p>${sourceHTML(s)}</p>`).join('')}</details></article>`;
  }
  const api={escapeHTML,safeURL,validateData,kindOf,filterItems,renderCard};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  if(typeof document==='undefined') return;
  const mode=document.body.dataset.catalog;if(!['mundus','champion'].includes(mode)) return;
  const $=id=>document.getElementById(id);const query=$('catalog-search'), group=$('catalog-group'), kind=$('catalog-kind'), reset=$('catalog-reset');
  let items=[];let loaded=false;let loading=false;
  if(mode==='mundus') $('catalog-kind-label').hidden=true;
  $('catalog-group-label').textContent=mode==='champion'?'星座':'効果の分類';
  $('catalog-help').textContent=mode==='champion'?'装備する星は対応するチャンピオンバーへのセットが必要です（各星座4枠）。常時効果も各星の発動条件に従います。最大投資CPは取得ルートの総必要CPではありません。接続順・解放条件を再現するビルド計算機ではありません。':'数値は各資料の記載条件を参照してください。装備の「神々」などによる増幅は、基本効果と区別します。';
  function readState() {const p=new URLSearchParams(location.search);return {q:p.get('q')||'',group:p.get('group')||'',kind:p.get('kind')||''};}
  function currentState(){return {q:query.value,group:group.value,kind:mode==='champion'?kind.value:''};}
  function render(updateURL=true){if(!loaded)return;const state=currentState(),filtered=filterItems(items,state,mode);$('catalog-list').innerHTML=filtered.length?filtered.map(i=>renderCard(i,mode)).join(''):'<p class="catalog-empty">一致する項目はありません。条件を変えてください。</p>';$('catalog-count').textContent=`${filtered.length} / ${items.length} 件`;
    if(updateURL){const url=new URL(location.href);for(const key of ['q','group','kind']){if(state[key])url.searchParams.set(key,state[key]);else url.searchParams.delete(key);}try{history.replaceState(null,'',url);}catch{}}
  }
  function restore(){const s=readState();query.value=s.q.slice(0,200);group.value=s.group;kind.value=s.kind;render(false);}
  async function load(){if(loading)return;loading=true;$('catalog-notice').hidden=false;$('catalog-notice').textContent='データを読み込み中…';$('catalog-retry').hidden=true;
    try{const response=await fetch(`./data/eso-${mode}.json?v=20261028-catalog1`);if(!response.ok)throw new Error('fetch');const data=validateData(await response.json(),mode);items=data.items;
      const values=[...new Set(items.map(i=>mode==='champion'?i.tree:i.category).filter(Boolean))];group.innerHTML='<option value="">すべて</option>'+values.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(mode==='champion'?(treeNames[v]||v):v)}</option>`).join('');
      $('catalog-coverage').innerHTML=`<p><strong>${items.length} 件収録</strong> ／ 資料確認日：${escapeHTML(data.checkedAt||'未確認')}</p><p>${escapeHTML(data.versionScope||'現行Live版との全面一致は未確認です。')}</p>`+(data.notes||[]).map(n=>`<p>${escapeHTML(n)}</p>`).join('');
      $('catalog-sources').innerHTML=(data.sources||[]).map(s=>`<p>${sourceHTML(s)}</p>`).join('')+'<p>出典の更新日だけでは現行Live版との一致を保証できません。個別の未確認注記も参照してください。</p>';
      loaded=true;for(const el of [query,group,kind,reset])el.disabled=false;$('catalog-notice').hidden=true;restore();
    }catch{$('catalog-notice').textContent='データを読み込めませんでした。時間をおいて再試行してください。';$('catalog-retry').hidden=false;}finally{loading=false;}}
  query.addEventListener('input',()=>render());group.addEventListener('change',()=>render());kind.addEventListener('change',()=>render());reset.addEventListener('click',()=>{query.value='';group.value='';kind.value='';render();query.focus();});$('catalog-retry').addEventListener('click',load);window.addEventListener('popstate',restore);load();
})();
