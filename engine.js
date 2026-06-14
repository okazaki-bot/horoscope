/* ===========================================================================
 *  engine.js  —  計算エンジン
 *  ・西洋占星術: 10天体の黄道座標（その時点の春分点基準＝トロピカル）
 *  ・四柱推命:   年柱・月柱・日柱・時柱（節入りは太陽黄経で判定）
 *  ・動物占い / 六星占術 / 五星三心占い: 共通の干支ナンバー(1〜60)から導出
 *  astronomy-engine (グローバル変数 Astronomy) に依存。
 * ===========================================================================*/

/* ---------- 西洋占星術 ---------- */
const ASTRO_BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

/** UTCのDateを受け取り、各天体の黄経(度)を返す（その時点の黄道＝トロピカル） */
function planetLongitudes(utcDate) {
  const A = Astronomy;
  const rot = A.Rotation_EQJ_ECT(utcDate); // 赤道J2000 → その時点の黄道
  const out = {};
  for (const body of ASTRO_BODIES) {
    let lon;
    if (body === 'Sun') {
      lon = A.SunPosition(utcDate).elon;            // 既にその時点の黄道
    } else if (body === 'Moon') {
      const ec = A.RotateVector(rot, A.GeoMoon(utcDate));
      lon = Math.atan2(ec.y, ec.x) * 180 / Math.PI;
    } else {
      const v = A.GeoVector(body, utcDate, true);   // 光行差補正あり
      const ec = A.RotateVector(rot, v);
      lon = Math.atan2(ec.y, ec.x) * 180 / Math.PI;
    }
    out[body] = ((lon % 360) + 360) % 360;
  }
  return out;
}

/** 太陽黄経(度) — 節入り・年柱判定用 */
function sunLongitude(utcDate) {
  return ((Astronomy.SunPosition(utcDate).elon % 360) + 360) % 360;
}

function signIndexOf(lon) { return Math.floor((((lon % 360) + 360) % 360) / 30); }
function degInSign(lon)   { return (((lon % 360) + 360) % 360) % 30; }

/* ---------- 干支・暦 ---------- */
const STEMS   = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCHES= ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const BRANCH_ANIMAL = ['ねずみ','うし','とら','うさぎ','たつ','へび','うま','ひつじ','さる','とり','いぬ','いのしし'];

function jdn(y,m,d){ const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;
  return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045; }

/* 日柱: 2000-01-01 = 戊午(index54) を基準に校正 */
const DAY_REF = jdn(2000,1,1);
function dayPillarIndex(y,m,d){ return (((jdn(y,m,d)-DAY_REF+54)%60)+60)%60; }

/* Excelシリアル値（1900-01-01 = 1。動物占い等の干支ナンバー算出用） */
function excelSerial(y,m,d){ return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000); }
/* 動物占い・六星占術・五星三心 共通の干支ナンバー(1〜60) */
function destinyNumber(y,m,d){ return ((excelSerial(y,m,d)+8)%60)+1; }

/* ---------- 四柱推命 ---------- */
/**
 * 四柱を計算。local: {y,m,d,hour,min}（出生地の地方時）, utcDate: 対応するUTC, timeKnown:bool
 */
function fourPillars(local, utcDate, timeKnown) {
  const L = sunLongitude(utcDate);             // 太陽黄経
  // --- 年柱（立春＝太陽黄経315°が境）---
  // 立春前（1〜2月初旬で太陽黄経が 315°未満すなわち冬側）は前年扱い
  let pillarYear = local.y;
  // 太陽黄経で厳密判定: 立春(315°)〜翌立春。1〜2月初旬で太陽黄経が[270,315)なら立春前→前年扱い
  if (local.m <= 2 && (L >= 270 && L < 315)) pillarYear = local.y - 1;
  const yStem = ((pillarYear - 4) % 10 + 10) % 10;
  const yBranch = ((pillarYear - 4) % 12 + 12) % 12;

  // --- 月柱（節入り＝太陽黄経が 315°+30k° を通過。寅月=315〜345）---
  const seg = Math.floor(((L - 315 + 360) % 360) / 30); // 0=寅,1=卯,...
  const mBranch = (2 + seg) % 12;
  // 五虎遁: 年干から寅月の干 (甲己→丙, 乙庚→戊, 丙辛→庚, 丁壬→壬, 戊癸→甲)
  const tigerStem = ((yStem % 5) * 2 + 2) % 10;
  const mStem = (tigerStem + seg) % 10;

  // --- 日柱 ---
  const dIdx = dayPillarIndex(local.y, local.m, local.d);
  const dStem = dIdx % 10, dBranch = dIdx % 12;

  // --- 時柱（子=23:00-0:59, 丑=1:00-2:59 ...）時刻不明は正午=午 ---
  const hh = timeKnown ? local.hour : 12;
  const hBranch = (Math.floor((hh + 1) / 2)) % 12;
  // 五鼠遁: 日干から子刻の干 (甲己→甲, 乙庚→丙, 丙辛→戊, 丁壬→庚, 戊癸→壬)
  const ratStem = ((dStem % 5) * 2) % 10;
  const hStem = (ratStem + hBranch) % 10;

  const gz = (s,b) => STEMS[s] + BRANCHES[b];
  return {
    year:  { gz: gz(yStem,yBranch),  stem:STEMS[yStem],  branch:BRANCHES[yBranch], animal:BRANCH_ANIMAL[yBranch] },
    month: { gz: gz(mStem,mBranch),  stem:STEMS[mStem],  branch:BRANCHES[mBranch] },
    day:   { gz: gz(dStem,dBranch),  stem:STEMS[dStem],  branch:BRANCHES[dBranch] },
    hour:  { gz: gz(hStem,hBranch),  stem:STEMS[hStem],  branch:BRANCHES[hBranch], known:timeKnown },
    dayStem: dStem,
  };
}

/* 十干の五行・陰陽（日干＝命式の主体「日主」） */
const STEM_WUXING = ['木','木','火','火','土','土','金','金','水','水'];
const STEM_YINYANG = ['陽','陰','陽','陰','陽','陰','陽','陰','陽','陰'];

/* ---------- 動物占い ---------- */
function animalUranai(y,m,d){
  const n = destinyNumber(y,m,d);
  const chara = ANIMAL60[n];
  let animal = '';
  for (const kw of ANIMAL_KEYWORDS){ if (chara.indexOf(kw) >= 0){ animal = kw; break; } }
  return { number:n, character:chara, animal, trait: ANIMAL_TRAIT[animal] || '' };
}

/* ---------- 六星占術 ---------- */
const ROKUSEI_STARS = ['土星人','金星人','火星人','天王星人','木星人','水星人'];
const ROKUSEI_DESC = {
  '土星人':'コツコツ努力を積み上げる現実主義者。地道な継続で着実に成果を出す、辛抱強い大器晩成型。',
  '金星人':'明るく社交的で楽天的。直感と愛嬌で人を惹きつけ、楽しみながら運をつかむムードメーカー。',
  '火星人':'独立心が強く感受性豊かな個性派。好き嫌いがはっきりし、独自の感性で道を切り開く。',
  '天王星人':'ユニークでロマンチストな自由人。型にはまらない発想と二面性をもち、ひらめきで動く。',
  '木星人':'面倒見がよく親分肌。情に厚く人の世話を焼き、信頼と人望を集める包容力の人。',
  '水星人':'頭脳明晰で合理的、計算高い知性派。情報を駆使して効率よく目標を達成する戦略家。',
};
function rokusei(y,m,d){
  const star = ((destinyNumber(y,m,d)-1)/10|0); // 0..5
  // 干支(年支)で陰陽: 子寅辰午申戌=+(陽), 丑卯巳未酉亥=-(陰)。暦年(1/1境界)
  const branch = ((y-4)%12+12)%12;
  const plus = (branch % 2 === 0);
  const name = ROKUSEI_STARS[star];
  return { star:name, sign: plus?'＋':'－', full: name + (plus?'（＋）':'（－）'), desc: ROKUSEI_DESC[name] };
}

/* ---------- 五星三心占い ---------- */
const GOSEI_ZA = ['羅針盤座','インディアン座','鳳凰座','時計座','カメレオン座','イルカ座'];
const GOSEI_DESC = {
  '羅針盤座':'真面目で品格があり、正しい道を進もうとする努力家。学びと向上心で人生を切り開く。',
  'インディアン座':'好奇心旺盛で楽天的、子どものような無邪気さをもつ。仲間と群れて情報を集めるのが得意。',
  '鳳凰座':'一点集中型の職人気質。こだわり強く、決めたことを粘り強くやり遂げる一匹狼タイプ。',
  '時計座':'面倒見がよく平等を重んじる博愛家。庶民的で人を支え、忙しく動くほど運が回る。',
  'カメレオン座':'学習能力が高く器用な現実派。経験と情報を取り込み、状況に合わせて賢く立ち回る。',
  'イルカ座':'明るく華やかで負けず嫌い。遊び心とサービス精神があり、注目される場所で輝く。',
};
function gosei(y,m,d){
  const n = destinyNumber(y,m,d);
  const za = GOSEI_ZA[((n-1)/10|0)];
  const metal = (y % 2 === 0) ? '金' : '銀'; // 偶数年=金, 奇数年=銀
  return { meisu:n, za, metal, full:`${metal}の${za}`, desc: GOSEI_DESC[za] };
}
