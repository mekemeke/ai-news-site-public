// Temporary noindex QA fixture. Not news; removed after official-widget verification.
'use strict';
(() => {
 const url='https://www.threads.com/@threads/post/DWjTI0cgH5O';
 const article={id:'threads-check',title:'動作確認用：Threads公式埋め込み（ニュース記事ではありません）',category:'ai',publishedAt:'2026-10-28T05:00:00Z',summary:'公開前の表示確認用です。Meta公式Threads投稿を使用します。',sources:[{label:'Threads公式投稿（表示確認用）',url}],blocks:[{type:'paragraph',text:'以下は公式埋め込みの動作確認であり、ニュース掲載ではありません。'},{type:'threadspost',url}]};
 const originalFetch=window.fetch.bind(window);
 window.fetch=(input,init)=> typeof input==='string' && input.startsWith('./data/articles.json') ? Promise.resolve(new Response(JSON.stringify({categories:[{id:'ai',name:'AI'}],articles:[article]}),{headers:{'Content-Type':'application/json'}})) : originalFetch(input,init);
 if(!location.hash)location.hash='#article/threads-check';
})();
