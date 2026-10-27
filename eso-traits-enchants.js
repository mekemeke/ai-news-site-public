'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const text = value => typeof value === 'string' ? value : '';
  const lines = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : text(value).trim() ? [value] : [];
  const title = item => item.nameJa || item.nameEn;
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja');
  const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
  const groupNames = {weapon:'武器',armor:'防具・盾',jewelry:'宝飾品'};
  const viewNames = {traits:'特性',enchantments:'付呪（グリフ）'};
  const kindNames = {trait:'特性',enchantment:'付呪'};
  const qualities = [
    {id:'normal',label:'白（Normal）'},
    {id:'fine',label:'緑（Fine）'},
    {id:'superior',label:'青（Superior）'},
    {id:'epic',label:'紫（Epic）'},
    {id:'legendary',label:'金（Legendary）'}
  ];
  let data, ready = false, loading = false;
  let equipment = new Map(), sources = new Map(), entries = new Map();
  let state = {view:'traits',group:'',equipmentId:'',q:''};

  function safeURL(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return '';
    try {
      const url = new URL(value), host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password || url.port || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa)(\.|$)/.test(host)) return '';
      return url.href;
    } catch { return ''; }
  }
  function sourceLink(source) {
    const label = text(source?.name) || text(source?.label) || text(source?.title) || '参照資料';
    const url = safeURL(source?.url);
    return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} ↗</a>` : escapeHTML(label);
  }
  function sourceReference(source) {
    const notes = [...new Set([...lines(source?.note),...lines(source?.notes)])];
    return sourceLink(source) + (notes.length ? ` — ${escapeHTML(notes.join(' '))}` : '');
  }
  function sourceLinks(ids) { return ids.map(id => sourceLink(sources.get(id))).join(' / '); }
  function validateNumericValue(value,kind,sourceMap) {
    if (value == null) return;
    const nonempty = value => typeof value === 'string' && !!value.trim();
    const ids = new Set(qualities.map(item => item.id)), seen = new Set();
    if (!value || typeof value !== 'object' || value.qualityBasis !== (kind === 'trait' ? 'equipment' : 'glyph') || !nonempty(value.basis) || !Array.isArray(value.qualities) || value.qualities.length > qualities.length || !Array.isArray(value.sourceIds) || !value.sourceIds.every(id => sourceMap.has(id)) || new Set(value.sourceIds).size !== value.sourceIds.length || (value.notes != null && typeof value.notes !== 'string' && (!Array.isArray(value.notes) || !value.notes.every(note => typeof note === 'string')))) throw new Error('Invalid numeric value');
    for (const quality of value.qualities) {
      if (!quality || !ids.has(quality.id) || seen.has(quality.id) || !['verified','partial','unverified'].includes(quality.status) || (quality.label != null && !nonempty(quality.label)) || (quality.summary != null && typeof quality.summary !== 'string') || (quality.variants != null && (!Array.isArray(quality.variants) || !quality.variants.every(variant => variant && nonempty(variant.label) && nonempty(variant.value))))) throw new Error('Invalid quality value');
      if (quality.sourceIds != null && (!Array.isArray(quality.sourceIds) || new Set(quality.sourceIds).size !== quality.sourceIds.length || !quality.sourceIds.every(id => sourceMap.has(id) && value.sourceIds.includes(id)) || (quality.status !== 'unverified' && !quality.sourceIds.length))) throw new Error('Invalid quality evidence');
      if (quality.status === 'unverified' && quality.variants?.length) throw new Error('Unverified numeric variants');
      if (quality.status !== 'unverified' && (!value.sourceIds.length || (!quality.variants?.length && !nonempty(quality.summary)))) throw new Error('Missing numeric evidence');
      seen.add(quality.id);
    }
  }
  function validate(value) {
    if (!value || ![1,2].includes(value.schemaVersion) || !value.meta || !Array.isArray(value.sources) || !value.sources.length || !Array.isArray(value.equipmentTypes) || !value.equipmentTypes.length || !Array.isArray(value.traits) || !value.traits.length || !Array.isArray(value.enchantments) || !value.enchantments.length) throw new Error('Invalid reference data');
    const em = new Map(), sm = new Map(), im = new Map();
    const nonempty = value => typeof value === 'string' && !!value.trim();
    const textOrLines = value => value == null || typeof value === 'string' || (Array.isArray(value) && value.every(item => typeof item === 'string'));
    for (const source of value.sources) {
      if (!source || !validId(source.id) || sm.has(source.id) || !nonempty(source.name || source.label || source.title) || (source.url != null && typeof source.url !== 'string')) throw new Error('Invalid source');
      sm.set(source.id,source);
    }
    for (const item of value.equipmentTypes) {
      if (!item || !validId(item.id) || em.has(item.id) || !nonempty(item.nameJa) || !Object.hasOwn(groupNames,item.traitGroup) || !Object.hasOwn(groupNames,item.glyphGroup) || !textOrLines(item.notes)) throw new Error('Invalid equipment');
      em.set(item.id,item);
    }
    for (const [kind,items] of [['trait',value.traits],['enchantment',value.enchantments]]) {
      for (const item of items) {
        const key = `${kind}/${item?.id}`;
        if (!item || !validId(item.id) || im.has(key) || !nonempty(item.nameEn) || (item.nameJa != null && typeof item.nameJa !== 'string') || !Object.hasOwn(groupNames,item.group) || !nonempty(item.effectJa)) throw new Error('Invalid entry');
        for (const field of ['conditionsJa','japaneseNameStatus','verifiedAt','checkedAt','gameUpdate','versionNote','sourceDataDate','verificationNote','verificationStatus','nameNoteJa']) if (item[field] != null && typeof item[field] !== 'string') throw new Error('Invalid entry text');
        if (item.researchable != null && typeof item.researchable !== 'boolean') throw new Error('Invalid research status');
        if ((item.aliases != null && (!Array.isArray(item.aliases) || !item.aliases.every(alias => nonempty(alias)))) || !textOrLines(item.notes) || !Array.isArray(item.sourceIds) || !item.sourceIds.length || new Set(item.sourceIds).size !== item.sourceIds.length || !item.sourceIds.every(id => sm.has(id))) throw new Error('Invalid entry provenance');
        const groupField = kind === 'trait' ? 'traitGroup' : 'glyphGroup';
        const ids = item.applicableEquipmentIds || [...em.values()].filter(other => other[groupField] === item.group).map(other => other.id);
        if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || !ids.every(id => em.has(id) && em.get(id)[groupField] === item.group)) throw new Error('Invalid equipment applicability');
        if (kind === 'enchantment' && !Array.isArray(item.applicableEquipmentIds)) throw new Error('Missing enchantment applicability');
        validateNumericValue(item.numericValue,kind,sm);
        im.set(key,{...item,kind,applicableEquipmentIds:ids});
      }
    }
    if (value.rules != null && (!Array.isArray(value.rules) || !value.rules.every(rule => typeof rule === 'string' || (rule && nonempty(rule.title) && nonempty(rule.text) && (rule.sourceIds == null || (Array.isArray(rule.sourceIds) && rule.sourceIds.every(id => sm.has(id)))))))) throw new Error('Invalid rules');
    return {equipment:em,sources:sm,entries:im};
  }
  function readState(params,forcedView) {
    const view = forcedView || (Object.hasOwn(viewNames,params.get('view')) ? params.get('view') : 'traits');
    let group = Object.hasOwn(groupNames,params.get('group')) ? params.get('group') : '';
    let equipmentId = equipment.has(params.get('equipment')) ? params.get('equipment') : '';
    const groupField = view === 'traits' ? 'traitGroup' : 'glyphGroup';
    if (equipmentId && group && equipment.get(equipmentId)[groupField] !== group) equipmentId = '';
    if (equipmentId && !group) group = equipment.get(equipmentId)[groupField];
    return {view,group,equipmentId,q:(params.get('q') || '').slice(0,200)};
  }
  function paramsFor(next = state) {
    const params = new URLSearchParams();
    if (next.view !== 'traits') params.set('view',next.view);
    if (next.group) params.set('group',next.group);
    if (next.equipmentId) params.set('equipment',next.equipmentId);
    if (next.q) params.set('q',next.q);
    return params.toString();
  }
  function listURL(next = state) { const query = paramsFor(next); return query ? '#?' + query : '#'; }
  function detailURL(item) { const query = paramsFor(); return `#${item.kind}/${item.id}${query ? '?' + query : ''}`; }
  function viewEntries(view = state.view) { const kind = view === 'traits' ? 'trait' : 'enchantment'; return [...entries.values()].filter(item => item.kind === kind); }
  function nameNote(item) {
    if (!item.nameJa) return '日本語名は未確認のため英語で表示';
    if (item.nameNoteJa) return item.nameNoteJa;
    const labels = {'official-effect-label-only':'公式資料の効果ラベルを参照（現行ゲーム内の完全なグリフ名は未照合）','official-source-term':'公式資料の日本語名を参照（現行ゲーム内未照合）','official-term-not-slot-specific':'公式資料の用語を参照（この部位の現行アイテム名は未照合）','official':'公式資料の日本語名を参照（現行ゲーム内未照合）','official-reference-current-unverified':'公式資料の日本語名を参照（現行ゲーム内未照合）','community':'コミュニティ資料の日本語名を参照（公式未確認）','community-reference':'コミュニティ資料の日本語名を参照（公式未確認）','provisional':'日本語名は参考表記（公式未確認）'};
    return labels[item.japaneseNameStatus] || '日本語名は参照資料の表記（現行ゲーム内未照合）';
  }
  function conditions(item) {
    return text(item.conditionsJa) || text(data.meta.conditionsNote) || '品質・レベル・装備部位による数値差は未検証です。';
  }
  function verification(item) {
    const checkedAt = item.checkedAt || item.verifiedAt || data.meta.checkedAt || data.meta.verifiedAt || '未確認';
    const update = item.gameUpdate || data.meta.gameUpdate || '現行アップデート未照合';
    const labels = {
      'historical-inventory-current-rules':'過去資料の分類・仕様を参照（現行ゲーム内未照合）',
      'u51-community-tooltip-corroborated':'U51のコミュニティ資料で照合（現行ゲーム内未検証）',
      'live-patch-corroborated':'公式ライブパッチ履歴で照合（現行ゲーム内未検証）',
      'live-patch-and-u51-corroborated':'公式ライブパッチ履歴とU51資料で照合（現行ゲーム内未検証）',
      'needs-live-patch-corroboration':'現行ライブパッチとの照合待ち'
    };
    const scope = item.verificationStatus ? labels[item.verificationStatus] || item.verificationStatus : '';
    return `<p class="eso-ref-verification">資料確認：${escapeHTML(checkedAt)} · 対応版：${escapeHTML(update)}</p>${scope ? `<p class="eso-ref-verification"><strong>${escapeHTML(scope)}</strong></p>` : ''}${item.verificationNote ? `<p class="eso-ref-verification">${escapeHTML(item.verificationNote)}</p>` : ''}`;
  }
  function applicability(item,full = false) {
    const items = item.applicableEquipmentIds.map(id => equipment.get(id));
    if (full || items.length <= 3) return items.map(item => item.nameJa);
    const allInGroup = [...equipment.values()].filter(other => other[item.kind === 'trait' ? 'traitGroup' : 'glyphGroup'] === item.group);
    return allInGroup.length === items.length ? [`${groupNames[item.group]}の収録装備すべて`] : [`${items.map(item => item.nameJa).slice(0,2).join('・')} ほか${items.length - 2}種類（詳細参照）`];
  }
  // Only group identical semantic templates. Unknowns and unaligned text are never
  // converted into amounts; the complete source wording remains in the disclosure.
  function comparisonRows(item) {
    const groups = new Map(), unknownGroups = new Map();
    for (const quality of item.numericValue?.qualities || []) {
      if (quality.status === 'unverified') continue;
      const occurrences = new Map();
      for (const variant of quality.variants || []) {
        const ordinal = occurrences.get(variant.label) || 0;
        occurrences.set(variant.label,ordinal + 1);
        const groupKey = `${variant.label}\u0000${ordinal}`;
        unknownGroups.set(groupKey,variant.label);
        const calculated = /計算上|表示丸め未確認/.test(variant.value);
        const clean = variant.value.replace(/^計算上\s*/, '').replace(/（表示丸め未確認）$/, '');
        for (const segment of clean.split(/\s+\/\s+/)) {
          if (/未確認/.test(segment)) continue;
          const matches = [...segment.matchAll(/[+−-]?\d[\d,]*(?:\.\d+)?(?:%|秒)?/g)];
          const signed = matches.filter(match => /^[+−-]/.test(match[0]));
          // A duration/condition inside parentheses is context, not a second effect.
          const outside = matches.filter(match => !/[（(][^）)]*$/.test(segment.slice(0,match.index)));
          const selected = signed.length === 1 ? signed[0] : outside.length === 1 ? outside[0] : null;
          if (!selected) continue;
          const before = segment.slice(0,selected.index), after = segment.slice(selected.index + selected[0].length);
          const template = `${before}\u0001${after}`;
          const key = `${groupKey}\u0000${template}`;
          if (!groups.has(key)) groups.set(key,{label:variant.label,context:(before + after).trim(),before,after,values:new Map(),groupKey});
          const row = groups.get(key);
          // Conflicting duplicate fragments are not assigned to the same location.
          if (row.values.has(quality.id)) row.ambiguous = true;
          row.values.set(quality.id,{amount:selected[0],original:variant.value,calculated});
        }
      }
    }
    const rows = [...groups.values()].filter(row => !row.ambiguous);
    for (const [groupKey,label] of unknownGroups) if (!rows.some(row => row.groupKey === groupKey)) rows.push({label,context:'',values:new Map(),groupKey});
    return rows.length ? rows : [{label:'品質別の効果量',context:'',values:new Map()}];
  }
  function qualitySeries(item,row) {
    const known = new Map((item.numericValue?.qualities || []).map(quality => [quality.id,quality]));
    return `<span class="eso-ref-quality-inline" aria-label="品質順：白・緑・青・紫・金">${qualities.map((definition,index) => {
      const quality = known.get(definition.id), value = row.values.get(definition.id);
      const label = quality?.label || definition.label;
      const amount = value?.amount || '—';
      const note = value ? `${value.calculated ? '計算値・表示丸め未確認。' : ''}${quality.status === 'partial' ? '参考値（現行未実測）。' : '資料照合（未実測）。'}${value.original}` : '未確認';
      return `${index ? '<span class="eso-ref-quality-separator" aria-hidden="true">/</span>' : ''}<span class="eso-ref-quality-${definition.id}" data-quality="${definition.id}" role="img" aria-label="${escapeHTML(label)} ${escapeHTML(value ? amount + '。' + note : '未確認')}" title="${escapeHTML(note)}">${escapeHTML(amount.replace(/,/g,''))}${value?.calculated ? '<sup aria-hidden="true">※</sup>' : ''}</span>`;
    }).join('')}</span>`;
  }
  function effectHTML(item) {
    const rows = comparisonRows(item), replacements = [];
    // A number is replaced only when its semantic label immediately precedes it.
    // Equal values at multiple positions or in multiple rows remain explicit rows.
    for (const row of rows) {
      const metric = row.context.replace(/[（(].*$/, '').trim() || row.label.replace(/[（(].*$/, '').trim();
      if (!metric || /[：:]/.test(metric)) continue;
      const candidates = [...item.effectJa.matchAll(/[+−-]?\d[\d,]*(?:\.\d+)?(?:%|秒)?/g)].filter(match => {
        const prefix = item.effectJa.slice(0,match.index);
        const contextMatches = prefix.endsWith(metric) || prefix.endsWith(metric + 'が') || prefix.endsWith(metric + 'を');
        const sourceMatches = [...row.values.values()].some(value => value.amount.replace(/^[+]/,'').replace(/,/g,'') === match[0].replace(/^[+]/,'').replace(/,/g,''));
        return contextMatches && sourceMatches;
      });
      if (candidates.length === 1) replacements.push({row,index:candidates[0].index,length:candidates[0][0].length});
    }
    const unique = replacements.filter(candidate => replacements.filter(other => other.index === candidate.index).length === 1).sort((a,b) => a.index - b.index);
    let cursor = 0, effect = '';
    for (const replacement of unique) {
      effect += escapeHTML(item.effectJa.slice(cursor,replacement.index)) + qualitySeries(item,replacement.row);
      cursor = replacement.index + replacement.length;
    }
    effect += escapeHTML(item.effectJa.slice(cursor));
    const remaining = rows.filter(row => !unique.some(replacement => replacement.row === row));
    return `<p class="eso-ref-effect">${effect}${remaining.map(row => `<span class="eso-ref-inline-row"><span class="eso-ref-inline-label">${escapeHTML(row.label)}${row.context ? ' · ' + escapeHTML(row.context) : ''}：</span>${qualitySeries(item,row)}</span>`).join('')}</p>`;
  }
  function numericStatus(item) {
    const value = item.numericValue, qualitiesPresent = value?.qualities || [];
    const unknown = qualitiesPresent.length < 5 || qualitiesPresent.some(quality => quality.status === 'unverified' || (quality.variants || []).some(variant => /未確認/.test(variant.value)));
    const partial = qualitiesPresent.some(quality => quality.status === 'partial');
    const allUnknown = !qualitiesPresent.length || qualitiesPresent.every(quality => quality.status === 'unverified');
    const label = allUnknown ? '品質別未確認' : unknown ? '一部未確認' + (partial ? '・参考値' : '') : partial ? '参考値・現行未実測' : '資料照合・未実測';
    const basis = /CP160/.test(value?.basis || '') ? `CP160 · ${item.kind === 'trait' ? '装備品質（1個）' : 'グリフ品質（追加補正なし）'}` : `${item.kind === 'trait' ? '装備品質' : 'グリフ品質'} · 基準は原文参照`;
    const historical = new Map();
    for (const quality of qualitiesPresent) {
      if (quality.status === 'unverified') continue;
      const years = new Set((quality.summary || '').match(/20\d{2}(?=年)/g) || []);
      for (const id of quality.sourceIds || []) {
        const source = sources.get(id);
        if (source?.type !== 'community-historical') continue;
        const dated = `${source.name || ''} ${source.dataDate || ''} ${/^20\d{2}年/.test(source.note || '') ? source.note : ''}`;
        for (const year of dated.match(/20\d{2}(?=年|-)/g) || []) years.add(year);
      }
      for (const year of years) {
        if (!historical.has(year)) historical.set(year,[]);
        historical.get(year).push(qualities.find(definition => definition.id === quality.id).label[0]);
      }
    }
    const warnings = [...historical].map(([year,grades]) => `${grades.join('・')}：${year}年参考値`);
    if (qualitiesPresent.some(quality => quality.id === 'legendary' && quality.status === 'partial')) warnings.push('金も参考値');
    const notes = lines(value?.notes).join(' ');
    if (/片手欄は公式U21の50%則/.test(notes)) warnings.push('片手は50%換算・表示丸め未実測（時間は半減しない）');
    if (/小部位.*未照合/.test(notes)) warnings.push('小部位の表示値は未照合');
    if (/不一致/.test(notes)) warnings.push('資料間の不一致あり');
    if (/百分率ポイントの加算ではない/.test(notes)) warnings.push('既存確率への増加率（百分率ポイント加算ではない）');
    if (/記載は到達上限/.test(notes)) warnings.push('記載値は到達上限・常時ではない');
    if (/再生\+10はU37公式記録で全品質共通/.test(notes)) warnings.push('再生+10は品質共通（注入などの装備補正は別）');
    if (/現行の割合は未確認/.test(notes)) warnings.push('現行の割合は未確認（片手も未確認）');
    // Keep unique gameplay exceptions visible. Generic repeated provenance belongs
    // in the disclosure, rather than making every card a second reference table.
    const genericNote = /^(?:同じ品質では両手武器側|片手／両手の特性倍率|研究・クラフトで選ぶ9種|頭・胴・脚・盾は100%)/;
    const caveats = lines(item.notes).filter(note => !genericNote.test(note));
    if (item.conditionsJa && !/^数値はCP160/.test(item.conditionsJa) && !/^ドロップ品など/.test(item.conditionsJa)) caveats.unshift(item.conditionsJa);
    const unique = [...new Set(caveats)].filter((note,index,list) => !list.some((other,otherIndex) => otherIndex !== index && other.includes(note)));
    return `<p class="eso-ref-quality-status">${escapeHTML(basis)} · ${label}${warnings.length ? '<br>' + escapeHTML(warnings.join(' · ')) : ''}</p>${unique.length ? `<p class="eso-ref-caution">${unique.map(escapeHTML).join('<br>')}</p>` : ''}`;
  }
  function numericValues(item) {
    const value = item.numericValue, basis = value?.qualityBasis || (item.kind === 'trait' ? 'equipment' : 'glyph');
    const basisLabel = basis === 'glyph' ? 'グリフの品質別（装備自体の色とは別）' : '装備自体の品質別';
    return `<div class="eso-ref-numeric"><p class="eso-ref-numeric-basis"><strong>${basisLabel}</strong> · ${escapeHTML(value?.basis || '基準レベル・効果量：未確認')}</p><p><strong>説明原文：</strong>${escapeHTML(item.effectJa)}</p>${(value?.qualities || []).map(quality => `<p class="eso-ref-numeric-original"><strong>${escapeHTML(quality.label || qualities.find(definition => definition.id === quality.id).label)}</strong>：${escapeHTML(quality.summary || '')}（${quality.status === 'unverified' ? '未確認' : quality.status === 'partial' ? '参考値・現行未実測' : '資料照合・未実測'}）${(quality.variants || []).map(variant => `<br>${escapeHTML(variant.label)}：${escapeHTML(variant.value)}`).join('')}</p>`).join('')}${lines(value?.notes).map(note => `<p class="eso-ref-numeric-note">${escapeHTML(note)}</p>`).join('')}<p class="eso-ref-numeric-note">— は未確認です。0ではなく、他の品質から推定していません。${value?.sourceIds.length ? ` 数値の出典：${sourceLinks(value.sourceIds)}` : ''}</p></div>`;
  }
  function renderCard(item) {
    return `<article class="eso-ref-card" data-entry-id="${item.kind}/${item.id}"><p class="eso-ref-kind">${kindNames[item.kind]} / ${groupNames[item.group]}${typeof item.researchable === 'boolean' ? ' · ' + (item.researchable ? '研究可能' : '研究不可') : ''}</p><h2><a href="${escapeHTML(detailURL(item))}">${escapeHTML(title(item))}</a></h2>${item.nameJa ? `<p class="eso-ref-english" lang="en">${escapeHTML(item.nameEn)}</p>` : ''}${effectHTML(item)}${numericStatus(item)}<div class="eso-ref-availability" aria-label="対象装備">${applicability(item).map(label => `<span>${escapeHTML(label)}</span>`).join('')}</div><details class="eso-ref-item-notes"><summary>条件・出典・原文</summary>${numericValues(item)}<p class="eso-ref-condition">${escapeHTML(conditions(item))}</p>${lines(item.notes).map(note => `<p class="eso-ref-condition">${escapeHTML(note)}</p>`).join('')}${verification(item)}<p class="eso-ref-verification">${escapeHTML(nameNote(item))}</p><p class="eso-ref-verification">出典：${sourceLinks(item.sourceIds)}</p></details></article>`;
  }
  function chip(label,url,selected,count) { return `<a href="${escapeHTML(url)}"${selected ? ' aria-current="true"' : ''}>${escapeHTML(label)}${count == null ? '' : `<small>${count}件</small>`}</a>`; }
  function renderFilters() {
    $('reference-views').innerHTML = Object.entries(viewNames).map(([view,label]) => chip(label,listURL({...state,view}),state.view === view,viewEntries(view).length)).join('');
    $('reference-view-hint').textContent = state.view === 'traits' ? '特性は装備自体に付く性質です。数値は装備の品質別に表示します。CP160などの基準レベル・部位と、確認できた範囲を「条件・出典・原文」で確認してください。' : '付呪の数値はグリフの品質別です。装備自体の品質とは別に、CP160などの基準レベルと適用部位を「条件・出典・原文」で確認してください。注入特性などを含む完成装備の計算機ではありません。';
    const items = viewEntries();
    $('reference-groups').innerHTML = chip('すべて',listURL({...state,group:'',equipmentId:''}),!state.group,items.length) + Object.entries(groupNames).map(([group,label]) => chip(label,listURL({...state,group,equipmentId:''}),state.group === group,items.filter(item => item.group === group).length)).join('');
    const groupField = state.view === 'traits' ? 'traitGroup' : 'glyphGroup';
    const equipmentOptions = [...equipment.values()].filter(item => !state.group || item[groupField] === state.group);
    $('reference-equipment').innerHTML = `<option value="">${state.group ? groupNames[state.group] + 'の' : ''}すべての装備</option>` + equipmentOptions.map(item => `<option value="${item.id}">${escapeHTML(item.nameJa)}</option>`).join('');
    $('reference-equipment').value = state.equipmentId;
    $('reference-search').value = state.q;
    const item = equipment.get(state.equipmentId), notes = lines(item?.notes);
    $('reference-equipment-note').hidden = !notes.length;
    $('reference-equipment-note').innerHTML = notes.length ? `<strong>${escapeHTML(item.nameJa)}の確認ポイント</strong>${notes.map(note => `<p>${escapeHTML(note)}</p>`).join('')}` : '';
  }
  function renderList() {
    renderFilters();
    const words = normalize(state.q).trim().split(/\s+/).filter(Boolean);
    const all = viewEntries();
    const filtered = all.filter(item => {
      if (state.group && item.group !== state.group) return false;
      if (state.equipmentId && !item.applicableEquipmentIds.includes(state.equipmentId)) return false;
      const haystack = normalize([item.nameJa,item.nameEn,item.effectJa,item.conditionsJa,...(item.aliases || []),...lines(item.notes),item.numericValue?.basis,...lines(item.numericValue?.notes),...(item.numericValue?.qualities || []).flatMap(quality => [quality.label,quality.summary,...(quality.variants || []).flatMap(variant => [variant.label,variant.value])]),...item.applicableEquipmentIds.map(id => equipment.get(id).nameJa)].filter(Boolean).join(' '));
      return words.every(word => haystack.includes(word));
    });
    $('reference-count').textContent = `${viewNames[state.view]}：${filtered.length} / ${all.length} 件${state.equipmentId ? ' · ' + equipment.get(state.equipmentId).nameJa : state.group ? ' · ' + groupNames[state.group] : ''}`;
    $('reference-list').innerHTML = filtered.map(renderCard).join('') || '<p class="eso-ref-empty">この条件に一致する収録データはありません。ゲーム内に存在しないという意味ではありません。検索語を変えるか、条件をクリアしてください。</p>';
  }
  function rulesHTML() {
    return (data.rules || []).map(rule => typeof rule === 'string' ? `<p>${escapeHTML(rule)}</p>` : `<section><h3>${escapeHTML(rule.title)}</h3><p>${escapeHTML(rule.text)}</p>${rule.sourceIds?.length ? `<p class="eso-ref-muted">出典：${sourceLinks(rule.sourceIds)}</p>` : ''}</section>`).join('') || '<p>品質・レベル・装備部位による数値差は未検証です。個別の出典で条件を確認してください。</p>';
  }
  function renderSources() {
    const meta = data.meta, checkedAt = meta.checkedAt || meta.verifiedAt || '未確認';
    const scope = text(meta.scopeNote) || text(meta.coverageNote) || '参照資料で確認できた特性と装備用グリフを掲載。ゲーム内の実測・現行アップデートとの照合は未実施です。';
    $('reference-coverage').innerHTML = `<p><strong>特性${data.traits.length}件 / 付呪${data.enchantments.length}件。</strong> 武器・防具・宝飾品で分類し、盾や個別の装備種類でも絞り込めます。</p><p>${escapeHTML(scope)}</p>${meta.numericBasis ? `<p><strong>数値の基準：</strong>${escapeHTML(meta.numericBasis)}</p>` : ''}${meta.numericVerificationNote ? `<p>${escapeHTML(meta.numericVerificationNote)}</p>` : ''}${meta.verificationNote ? `<p>${escapeHTML(meta.verificationNote)}</p>` : ''}<p class="eso-ref-muted">資料確認日：${escapeHTML(checkedAt)} · ${escapeHTML(text(meta.versionNote) || '資料の対応版と現行仕様の一致は未確認です。')} 数値を推定せず、画像は掲載していません。</p>`;
    const notes = [meta.localizationNote,meta.conditionsNote,meta.numericNote,meta.numericBasis,meta.numericVerificationNote,meta.verificationNote].filter(note => typeof note === 'string' && note);
    $('reference-rule-content').innerHTML = rulesHTML();
    $('reference-sources').innerHTML = `<p>データ版：${escapeHTML(text(meta.version) || 'スキーマ1')} · 資料確認日：${escapeHTML(checkedAt)}</p><p>${escapeHTML(scope)}</p><p>${escapeHTML(text(meta.versionNote) || '対応アップデートは未確認です。')}</p><p>資料確認日は参照元を確認した日です。ゲーム内実測日ではありません。効果説明は日本語の要約で、名称の照合範囲は各項目に記載しています。</p>${notes.map(note => `<p>${escapeHTML(note)}</p>`).join('')}${lines(data.coverage?.excluded).length ? `<h3>収録対象外</h3><ul>${lines(data.coverage.excluded).map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul>` : ''}${lines(data.coverage?.limitations).length ? `<h3>確認上の制約</h3><ul>${lines(data.coverage.limitations).map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul>` : ''}<ul>${data.sources.map(source => `<li>${sourceReference(source)}${source.checkedAt || source.verifiedAt ? `（資料確認：${escapeHTML(source.checkedAt || source.verifiedAt)}）` : ''}</li>`).join('')}</ul>`;
  }
  function renderDetail(kind,id) {
    const item = entries.get(`${kind}/${id}`);
    const back = `<a class="eso-ref-back" href="${escapeHTML(listURL())}">← 絞り込み結果に戻る</a>`;
    if (!item) {
      document.title = '項目が見つからない | ESOデータベース';
      $('reference-detail').innerHTML = `${back}<h1>項目が見つかりません</h1><p>指定した特性・付呪は未収録、またはURLが正しくありません。一覧から選び直してください。</p>`;
    } else {
      document.title = `${title(item)} | 特性・付呪 | ESOデータベース`;
      const equipmentNotes = item.applicableEquipmentIds.flatMap(id => lines(equipment.get(id).notes).map(note => `${equipment.get(id).nameJa}：${note}`));
      $('reference-detail').innerHTML = `${back}<p class="eso-ref-kind">${kindNames[item.kind]} / ${groupNames[item.group]}</p><h1>${escapeHTML(title(item))}</h1>${item.nameJa ? `<p class="eso-ref-english" lang="en">${escapeHTML(item.nameEn)}</p>` : ''}<p class="eso-ref-muted">${escapeHTML(nameNote(item))}</p>${item.aliases?.length ? `<p class="eso-ref-muted">資料内の別表記・旧称：${escapeHTML(item.aliases.join(' / '))}</p>` : ''}<dl class="eso-ref-facts"><dt>種類</dt><dd>${kindNames[item.kind]} / ${groupNames[item.group]}</dd>${typeof item.researchable === 'boolean' ? `<dt>研究</dt><dd>${item.researchable ? '研究可能' : '研究不可（非研究特性）'}</dd>` : ''}<dt>対象装備</dt><dd>${escapeHTML(applicability(item,true).join(' / '))}</dd><dt>対応アップデート</dt><dd>${escapeHTML(item.gameUpdate || data.meta.gameUpdate || '未確認')}</dd><dt>品質・レベルなどの条件</dt><dd>${escapeHTML(conditions(item))}</dd></dl><h2>効果</h2>${effectHTML(item)}${numericStatus(item)}<details class="eso-ref-item-notes"><summary>品質の根拠・原文</summary>${numericValues(item)}</details>${lines(item.notes).map(note => `<p class="eso-ref-condition">${escapeHTML(note)}</p>`).join('')}${verification(item)}${equipmentNotes.length ? `<h2>装備種類ごとの注意</h2><ul>${equipmentNotes.map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul>` : ''}<div class="source-box"><h2>出典・確認範囲</h2><ul>${item.sourceIds.map(id => `<li>${sourceReference(sources.get(id))}</li>`).join('')}</ul><p>参照資料のデータ日：${escapeHTML(item.sourceDataDate || '未確認')} · 現行ゲーム内では未検証</p>${item.versionNote ? `<p>${escapeHTML(item.versionNote)}</p>` : ''}<p>${escapeHTML(text(data.meta.versionNote) || '参照資料の対応版と現行仕様の一致は未確認です。')}</p><p>効果説明は参照資料の要約です。未確認の数値・品質差を推定して補ってはいません。効果量や装備への適用はゲーム内でも確認してください。</p></div>${back}`;
    }
    window.scrollTo(0,0);
    $('reference-detail').focus({preventScroll:true});
  }
  function route() {
    if (!ready) return;
    const hash = location.hash, match = hash.match(/^#(trait|enchantment)\/([^?]*)(?:\?(.*))?$/);
    state = readState(new URLSearchParams(match ? match[3] || '' : hash.startsWith('#?') ? hash.slice(2) : ''),match ? match[1] === 'trait' ? 'traits' : 'enchantments' : undefined);
    const wasDetail = !$('reference-detail').hidden;
    $('reference-home').hidden = !!match;
    $('reference-detail').hidden = !match;
    if (match) {
      let id = ''; try { id = decodeURIComponent(match[2]); } catch {}
      renderDetail(match[1],id);
    } else {
      document.title = '特性・付呪 | ESOデータベース';
      renderList();
      if (wasDetail) $('reference-search').focus({preventScroll:true});
    }
  }
  function filter() {
    if (!ready) return;
    const equipmentId = equipment.has($('reference-equipment').value) ? $('reference-equipment').value : '';
    const groupField = state.view === 'traits' ? 'traitGroup' : 'glyphGroup';
    state = {...state,equipmentId,group:equipmentId ? equipment.get(equipmentId)[groupField] : state.group,q:$('reference-search').value.slice(0,200)};
    history.replaceState(null,'',listURL());
    renderList();
  }
  $('reference-search').addEventListener('input',filter);
  $('reference-equipment').addEventListener('change',filter);
  $('reference-reset').addEventListener('click',() => {
    if (!ready) return;
    state = {view:state.view,group:'',equipmentId:'',q:''};
    history.replaceState(null,'',listURL());
    renderList();
    $('reference-search').focus();
  });
  $('reference-retry').addEventListener('click',load);
  window.addEventListener('hashchange',route);
  async function load() {
    if (loading) return;
    loading = true; ready = false;
    for (const id of ['reference-search','reference-equipment','reference-reset']) $(id).disabled = true;
    for (const id of ['reference-list','reference-views','reference-groups','reference-count','reference-rule-content','reference-sources']) $(id).innerHTML = '';
    $('reference-detail').hidden = true;
    $('reference-home').hidden = false;
    $('reference-equipment-note').hidden = true;
    $('reference-retry').hidden = true;
    $('reference-notice').textContent = 'データを読み込み中…';
    try {
      const response = await fetch('./data/eso-equipment-reference.json?v=20261027-quality2',{credentials:'omit'});
      if (!response.ok) throw new Error('Data unavailable');
      const value = await response.json(), maps = validate(value);
      data = value; equipment = maps.equipment; sources = maps.sources; entries = maps.entries;
      renderSources();
      for (const id of ['reference-search','reference-equipment','reference-reset']) $(id).disabled = false;
      $('reference-notice').textContent = '';
      ready = true; route();
    } catch {
      $('reference-coverage').textContent = '収録データを読み込めていないため、収録件数・確認範囲は表示できません。';
      $('reference-notice').textContent = 'データを読み込めませんでした。接続を確認して再試行してください。';
      $('reference-retry').hidden = false;
    } finally { loading = false; }
  }
  load();
})();
