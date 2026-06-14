/* ===========================================================================
 *  app.js  —  UI制御・結果のレンダリング
 * ===========================================================================*/

/* 出生地 → 標準時オフセット(時間)。サインの算出に必要なのはタイムゾーン。
   ※ 歴史的サマータイムは未考慮（標準時で計算）。日本は47都道府県すべて+9。 */
const JP_PREF = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const PLACE_GROUPS = [
  { label:'日本（都道府県）', items: JP_PREF.map(p => [p, 9]) },
  { label:'海外', items: [
    ['韓国・ソウル', 9], ['中国・北京', 8], ['台湾・台北', 8], ['香港', 8], ['シンガポール', 8],
    ['タイ・バンコク', 7], ['インド・デリー', 5.5], ['ドバイ(UAE)', 4],
    ['イギリス・ロンドン', 0], ['フランス・パリ', 1], ['ドイツ・ベルリン', 1], ['イタリア・ローマ', 1],
    ['ロシア・モスクワ', 3], ['南アフリカ', 2],
    ['アメリカ東部(ニューヨーク)', -5], ['アメリカ中部(シカゴ)', -6], ['アメリカ山岳部(デンバー)', -7],
    ['アメリカ西部(ロサンゼルス)', -8], ['ハワイ', -10], ['ブラジル・サンパウロ', -3],
    ['オーストラリア・シドニー', 10], ['ニュージーランド', 12],
  ]},
];
/* インデックス参照用にフラット化（value=連番） */
const PLACES = PLACE_GROUPS.flatMap(g => g.items);

const $ = (id) => document.getElementById(id);

let resultText = '';   // メール／コピー用の結果テキスト
let resultName = '';

function init(){
  // 年月日プルダウン
  const yearSel=$('year');
  for(let y=new Date().getFullYear(); y>=1920; y--){ yearSel.add(new Option(y+'年', y)); }
  const monthSel=$('month'); for(let m=1;m<=12;m++) monthSel.add(new Option(m+'月', m));
  const daySel=$('day'); for(let d=1;d<=31;d++) daySel.add(new Option(d+'日', d));
  const hourSel=$('hour'); for(let h=0;h<24;h++) hourSel.add(new Option(('0'+h).slice(-2)+'時', h));
  const minSel=$('min'); for(let mi=0;mi<60;mi+=1) minSel.add(new Option(('0'+mi).slice(-2)+'分', mi));
  const placeSel=$('place');
  let idx=0;
  for(const g of PLACE_GROUPS){
    const og=document.createElement('optgroup'); og.label=g.label;
    for(const it of g.items){ og.appendChild(new Option(it[0], idx++)); }
    placeSel.appendChild(og);
  }
  const tokyoIdx = PLACES.findIndex(p=>p[0]==='東京都');

  // 既定値
  yearSel.value=1990; monthSel.value=1; daySel.value=1; hourSel.value=12; minSel.value=0;
  placeSel.value = tokyoIdx>=0 ? tokyoIdx : 0;

  $('unknownTime').addEventListener('change', e=>{
    const dis=e.target.checked; hourSel.disabled=dis; minSel.disabled=dis;
    $('timeWrap').classList.toggle('disabled', dis);
  });
  $('runBtn').addEventListener('click', run);
  $('mailBtn').addEventListener('click', sendMail);
  $('copyBtn').addEventListener('click', copyResult);
}

/* ---- 結果テキストの生成（メール本文・コピー用） ---- */
function buildPlainText(positions, reading, pillars, animal, roku, go, meta){
  const strip = s => s.replace(/<[^>]+>/g,'');
  const c = counts(positions);
  const L = [];
  L.push('★ ホロスコープ鑑定結果 ★', '');
  if(meta.name) L.push('お名前：'+meta.name);
  L.push('生年月日：'+meta.dateStr, '出生地：'+meta.placeName, '');
  L.push('【10天体の配置】');
  for(const p of PLANETS){ const s=SIGNS[positions[p.key].sign];
    L.push(`${p.glyph} ${p.jp}：${s.yomi}座 ${positions[p.key].deg.toFixed(1)}°`); }
  L.push('', '【バランス】',
    `元素　火${c.elem[0]}・土${c.elem[1]}・風${c.elem[2]}・水${c.elem[3]}`,
    `区分　活動${c.mode[0]}・固定${c.mode[1]}・柔軟${c.mode[2]}`,
    `陰陽　陽${c.elem[0]+c.elem[2]}・陰${c.elem[1]+c.elem[3]}`, '');
  L.push('【鑑定 — 超一流の占星術師より】', '');
  for(const sec of reading){ L.push('■ '+strip(sec.h)); for(const p of sec.p) L.push(strip(p)); L.push(''); }
  L.push('【参考：東洋の占い】',
    `・四柱推命：年柱${pillars.year.gz}／月柱${pillars.month.gz}／日柱${pillars.day.gz}／時柱${pillars.hour.gz}`,
    `・動物占い：${animal.character}（${animal.animal}／No.${animal.number}）`,
    `・六星占術：${roku.full}`,
    `・五星三心占い：${go.full}（命数${go.meisu}）`, '');
  L.push('──────────', '作成：ホロスコープ作成アプリ', 'https://okazaki-bot.github.io/horoscope/');
  return L.join('\n');
}

function showShareMsg(msg, ok=true){
  const el = $('shareMsg'); el.textContent = msg;
  el.style.color = ok ? 'var(--earth)' : 'var(--fire)';
  clearTimeout(showShareMsg._t);
  showShareMsg._t = setTimeout(()=>{ el.textContent=''; }, 5000);
}

function sendMail(){
  if(!resultText){ showShareMsg('先に「ホロスコープを作成する」を押してください', false); return; }
  const to = $('mailTo').value.trim();
  const subject = `【ホロスコープ】${resultName||'あなた'}の鑑定結果`;
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(resultText)}`;
  window.location.href = href;
  showShareMsg('メールアプリを開きました。内容を確認して送信してください');
}

function copyResult(){
  if(!resultText){ showShareMsg('先に「ホロスコープを作成する」を押してください', false); return; }
  const done = ()=>showShareMsg('コピーしました！メール・LINE等に貼り付けられます');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(resultText).then(done).catch(fallbackCopy);
  } else { fallbackCopy(); }
  function fallbackCopy(){
    const ta=document.createElement('textarea'); ta.value=resultText;
    ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
    ta.select(); try{ document.execCommand('copy'); done(); }catch(e){ showShareMsg('コピーに失敗しました', false); }
    ta.remove();
  }
}

function run(){
  const y=+$('year').value, m=+$('month').value, d=+$('day').value;
  const timeKnown = !$('unknownTime').checked;
  const hour = timeKnown ? +$('hour').value : 12;
  const min  = timeKnown ? +$('min').value : 0;
  const offset = PLACES[+$('place').value][1];
  const placeName = PLACES[+$('place').value][0];
  const name = $('name').value.trim();

  // 妥当性（日数）
  const dim = new Date(y, m, 0).getDate();
  if(d>dim){ alert(`${y}年${m}月は${dim}日までです。`); return; }

  // 出生地の地方時 → UTC
  const utcMs = Date.UTC(y, m-1, d, hour, min) - offset*3600*1000;
  const utcDate = new Date(utcMs);
  const local = { y, m, d, hour, min };

  // --- 計算 ---
  const lons = planetLongitudes(utcDate);
  const positions = {};
  for(const b of ASTRO_BODIES){ positions[b] = { lon:lons[b], sign:signIndexOf(lons[b]), deg:degInSign(lons[b]) }; }

  const sheet = renderSheet(positions, name, {y,m,d,hour,min,timeKnown,placeName});
  const reading = buildReading(positions, timeKnown);
  const pillars = fourPillars(local, utcDate, timeKnown);
  const animal = animalUranai(y,m,d);
  const roku = rokusei(y,m,d);
  const go = gosei(y,m,d);

  // --- 描画 ---
  $('sheet').innerHTML = sheet;
  $('reading').innerHTML = reading.map(s=>
    `<section class="rd"><h3>${s.h}</h3>${s.p.map(p=>`<p>${p}</p>`).join('')}</section>`).join('');
  $('other').innerHTML = renderOther(positions, pillars, animal, roku, go, {y,m,d,timeKnown});

  // メール／コピー用テキスト
  const dateStr = timeKnown
    ? `${y}年${m}月${d}日 ${('0'+hour).slice(-2)}:${('0'+min).slice(-2)}`
    : `${y}年${m}月${d}日（時刻不明→正午で計算）`;
  resultName = name;
  resultText = buildPlainText(positions, reading, pillars, animal, roku, go, {name, dateStr, placeName});

  $('result').classList.remove('hidden');
  $('result').scrollIntoView({behavior:'smooth'});
}

/* 天体グリフ（サイン別の在住天体表示用） */
function planetsInSign(positions, signIdx){
  return PLANETS.filter(p=>positions[p.key].sign===signIdx)
    .map(p=>`<span class="pl" title="${p.jp}">${p.glyph}</span>`).join('');
}

/* Excel「西洋占星術シート」形式のグリッドを生成 */
function renderSheet(positions, name, meta){
  const elemCols=[0,2,1,3]; // 表示順: 火・風・土・水（Excel準拠）
  const c=counts(positions);
  // セル取得: elem,mode から該当サインを引く
  const findSign=(elem,mode)=> SIGNS.findIndex(s=>s.elem===elem && s.mode===mode);

  let rows='';
  for(let mode=0; mode<3; mode++){
    const md=MODES[mode];
    let tds='';
    let rowTotal=0;
    for(const elem of elemCols){
      const si=findSign(elem,mode); const s=SIGNS[si]; const desc=SIGN_DESC[s.jp];
      const pls=PLANETS.filter(p=>positions[p.key].sign===si);
      rowTotal+=pls.length;
      const glyphs = pls.map(p=>`<span class="pl" title="${p.jp}（${SIGNS[positions[p.key].sign].jp} ${positions[p.key].deg.toFixed(1)}°）">${p.glyph}</span>`).join('');
      tds+=`<td class="cell ${pls.length?'has':''}">
        <div class="cellHead"><span class="signGlyph">${s.glyph}</span>
          <span class="signName">${s.yomi}<small>${s.jp}</small></span>
          <span class="cnt">${pls.length}</span></div>
        <div class="signPlanets">${glyphs||'<span class="empty">―</span>'}</div>
        <div class="signTitle">【${desc.title}】<span class="sk">※「${desc.key}」</span></div>
        <div class="signBody">${desc.body}</div>
      </td>`;
    }
    rows+=`<tr>
      <th class="modeTh"><div class="mname">${md.name}</div><div class="mtag">${md.tag}</div></th>
      ${tds}
      <th class="rowTotal">${md.name}<br><b>${rowTotal}</b></th>
    </tr>`;
  }

  // 元素合計（火土風水 → 表示は火風土水）
  const elemTotalCells = elemCols.map(e=>
    `<td class="sum"><b>${ELEMENTS[e].name}</b> ${c.elem[e]}</td>`).join('');
  const yang=c.elem[0]+c.elem[2], yin=c.elem[1]+c.elem[3];

  const tm = meta.timeKnown
    ? `${meta.y}年${meta.m}月${meta.d}日 ${('0'+meta.hour).slice(-2)}:${('0'+meta.min).slice(-2)}`
    : `${meta.y}年${meta.m}月${meta.d}日 <span class="warn">（時刻不明→正午で計算）</span>`;

  // 天体一覧
  const planetList = PLANETS.map(p=>{
    const s=SIGNS[positions[p.key].sign];
    return `<li><span class="pg">${p.glyph}</span><b>${p.jp}</b>：${s.yomi}座 ${positions[p.key].deg.toFixed(1)}° <small>${p.body}</small></li>`;
  }).join('');

  return `
  <div class="sheetHead">
    <h2>西洋占星術シート</h2>
    <div class="meta">${name?`お名前：<b>${name}</b>　／　`:''}生年月日：<b>${tm}</b>　／　出生地：<b>${meta.placeName}</b></div>
  </div>
  <div class="legend">
    列＝四元素（<b>火</b>情熱/陽・<b>風</b>理論/陽・<b>土</b>現実/陰・<b>水</b>感情/陰）
    行＝3区分（活動宮・固定宮・柔軟宮）。各サインに在住する天体（${PLANETS.map(p=>p.glyph).join(' ')}）を配置。
  </div>
  <div class="tableWrap">
  <table class="astroSheet">
    <thead><tr>
      <th class="corner">陰陽×3区分</th>
      <th class="eh fire">【火】の要素<br><small>情熱／統率者・陽</small></th>
      <th class="eh air">【風】の要素<br><small>理論／実務家・陽</small></th>
      <th class="eh earth">【土】の要素<br><small>現実／管理者・陰</small></th>
      <th class="eh water">【水】の要素<br><small>感情／調整者・陰</small></th>
      <th class="eh">3宮合計</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><th>四要素合計</th>${elemTotalCells}<td class="sum">計 <b>10</b></td></tr>
      <tr><th>陰陽合計</th>
        <td class="sum yang" colspan="2">【陽】男性性・推進力（火＋風）= <b>${yang}</b></td>
        <td class="sum yin" colspan="2">【陰】女性性・調整力（土＋水）= <b>${yin}</b></td>
        <td class="sum"></td></tr>
    </tfoot>
  </table>
  </div>
  <div class="planetList"><h3>10天体の配置</h3><ul>${planetList}</ul></div>
  `;
}

/* 参考占い（四柱推命・動物占い・六星占術・五星三心） */
function renderOther(positions, p, animal, roku, go, b){
  const timeNote = b.timeKnown ? '' : '<span class="warn">（時刻不明のため時柱は正午=午刻で計算）</span>';
  const dStem = p.dayStem;
  return `
  <div class="otherGrid">
    <div class="card">
      <h3>🀄 四柱推命</h3>
      <table class="pillars">
        <tr><th>年柱</th><th>月柱</th><th>日柱</th><th>時柱</th></tr>
        <tr><td>${p.year.gz}</td><td>${p.month.gz}</td><td class="dayp">${p.day.gz}</td><td>${p.hour.gz}</td></tr>
      </table>
      <p>日主（あなた自身）は<b>${p.day.stem}（${STEM_WUXING[dStem]}・${STEM_YINYANG[dStem]}）</b>。
      ${STEM_WUXING[dStem]}の性質を軸に人生が展開します。年支は<b>${p.year.branch}（${p.year.animal}）年</b>生まれ。${timeNote}</p>
      <p class="note">※節入りは太陽黄経で判定。立春をまたぐ生まれは年柱が前年になります。</p>
    </div>

    <div class="card">
      <h3>🐾 動物占い</h3>
      <p class="big">${animal.character}</p>
      <p>代表動物は<b>「${animal.animal}」</b>（60分類No.${animal.number}）。</p>
      <p>${animal.trait}</p>
    </div>

    <div class="card">
      <h3>⭐ 六星占術（細木数子）</h3>
      <p class="big">${roku.full}</p>
      <p>${roku.desc}</p>
      <p class="note">※運命星は<b>${roku.star}</b>、陰陽は<b>${roku.sign}</b>（生年の干支による）。</p>
    </div>

    <div class="card">
      <h3>🔮 五星三心占い（ゲッターズ飯田）</h3>
      <p class="big">${go.full}</p>
      <p>命数は<b>${go.meisu}</b>。${go.desc}</p>
      <p class="note">※${go.metal==='金'?'偶数':'奇数'}年生まれのため「${go.metal}」。</p>
    </div>
  </div>
  <p class="disclaimer">※動物占い・六星占術・五星三心占いは生年月日（暦）から算出する参考情報です。各占術の正式な鑑定とは細部が異なる場合があります。エンタメとしてお楽しみください。</p>
  `;
}

document.addEventListener('DOMContentLoaded', init);
