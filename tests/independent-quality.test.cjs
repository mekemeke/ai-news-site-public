const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/sets.json')));
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, {addEventListener(){},value:'',innerHTML:'',textContent:'',querySelectorAll(){return [];}}); return nodes.get(id); };
const context = vm.createContext({URL,URLSearchParams,Number,document:{getElementById:node,addEventListener(){}},window:{addEventListener(){}}});
const source = fs.readFileSync(path.join(root,'eso.js'),'utf8').replace(/  load\(\);\r?\n\}\)\(\);/,'  globalThis.audit = {qualityBlock,validNumericValue,renderEffects,effectPlan};\n})();');
vm.runInContext(source,context);

test('independent: all 5841 set-quality values render with correct named grade, unit and row label',()=>{
  let cells=0,rows=0,families=0;
  for(const item of data.sets){
    assert.equal(context.audit.validNumericValue(item.numericValue,item),true,item.id);
    const markup=context.audit.renderEffects(item)+context.audit.qualityBlock(item,true);
    const nv=item.numericValue;
    const groups=markup.match(/<span class="set-quality-values"[\s\S]*?<\/span><\/span>/g)||[];
    assert.ok(!markup.includes('<table'),item.id);
    assert.equal(groups.flatMap(group=>group.match(/data-row-ids="([^"]+)"/)[1].split(' ')).length,nv.rows.length,item.id+' each row exactly once');
    for(const row of nv.rows){
      assert.ok(markup.includes(row.label.replace(/&/g,'&amp;')),item.id+' row label');
      const group=groups.find(group=>group.match(/data-row-ids="([^"]+)"/)[1].split(' ').includes(row.id));
      assert.ok(group,item.id+' '+row.id);
      for(const [grade,value] of Object.entries(row.values)){
        const q=nv.qualities.find(q=>q.id===grade);
        assert.notEqual(q.status,'not-applicable',item.id+' fake unavailable value');
        assert.ok(group.includes(`aria-label="${q.label} ${value}${row.unit==='%'?'パーセント':'ポイント'}"`),item.id+' '+grade+' '+value);
        cells++;
      }
      assert.ok(nv.sourceIds.includes(row.sourceId));
      assert.ok(item.sources.some(s=>s.id===row.sourceId));
      rows++;
    }
    if(nv.rows.length)families++;
    if(nv.availability==='mythic-fixed'){
      for(const q of nv.qualities.slice(0,4)){assert.equal(q.status,'not-applicable');assert.equal(q.variants.length,0);}
      assert.ok(markup.includes('対象外'));assert.ok(markup.includes('橙'));
    }else assert.ok(markup.includes('未確認'));
  }
  assert.equal(cells,5841);assert.equal(rows,1620);assert.equal(families,608);assert.equal(data.sets.length,650);
});

test('independent: numeric inline display does not leak source HTML, fake zero or lose perfected qualification',()=>{
  const item=structuredClone(data.sets.find(s=>s.numericValue.rows.some(r=>r.variant==='perfected')));
  assert.ok((context.audit.renderEffects(item)+context.audit.qualityBlock(item,true)).includes('完璧版追加'));
  item.numericValue.rows[0].label='<script>alert(1)</script>';
  item.numericValue.notes.push('<img src=x onerror=alert(1)>');
  const result=context.audit.renderEffects(item)+context.audit.qualityBlock(item,true);
  assert.ok(result.includes('&lt;script&gt;'));assert.ok(result.includes('&lt;img'));
  assert.ok(!/<script|<img/.test(result));
  assert.ok(result.includes('未確認（0や入手不可ではない）'));
});

test('independent: unchanged data, news, skills and navigation match portable frozen baseline hashes',()=>{
  const crypto=require('node:crypto');
  const baseline={
    "data/sets.json": "5cbebb5bf26b6db0ffc448e13895cdde1fbd88baf28909c917407c86f8ddaf5d",
    "data/eso-equipment-reference.json": "8b47411fc713a8ba2283b128de03f0bbefda953d2178799d5dbc5f7ea6bf9ba6",
    "data/skills.json": "0dab9f2a14abadbcb067207225f3f4e4091c75107e75732152eaf7c545be83c5",
    "data/articles.json": "19f826f1b0a8b85114585820d909305084bfc0852209f1d0617879c3cae61cb3",
    "index.html": "3c0fcda8dd09aa9dfe57dc750fc2035faaf059764719db1eab445ff497761f0f",
    "app.js": "0991b587c5220ff53bdd7fe04100daf306fc37d6da9dfe294073412d59c9b0c3"
};
  for(const [file,expected] of Object.entries(baseline)){
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),expected,file);
  }
  assert.equal(data.sets.length,650);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'))).skills.length,462);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/articles.json'))).articles.length,33);
  const equipment=JSON.parse(fs.readFileSync(path.join(root,'data/eso-equipment-reference.json')));
  assert.equal(equipment.traits.length+equipment.enchantments.length,71);
});
