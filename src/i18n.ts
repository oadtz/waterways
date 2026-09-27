import { experienceCopy } from './experience-copy';
// Two languages, one plain voice. Thai is written for Thai readers (Buddhist-era dates,
// whole words, no abbreviations); English is written fresh, not translated word for word.

export type Lang = 'th' | 'en';

const LANG_KEY = 'waterways.lang';

export function savedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'th' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}
export function browserLang(): Lang {
  // First language the user ranks that we support (Thai or English); English otherwise.
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of list) {
    const code = l?.toLowerCase().slice(0, 2);
    if (code === 'th' || code === 'en') return code;
  }
  return 'en';
}
export function rememberLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
}

export let lang: Lang = (document.documentElement.lang as Lang) === 'en' ? 'en' : 'th';
export const setCurrentLang = (l: Lang) => {
  lang = l;
  document.documentElement.lang = l;
};

type Dict = Record<string, string>;

const th: Dict = {
  title: 'น้ำอยู่ไหน? — แผนที่น้ำทั่วไทย',
  'map.aria': 'แผนที่สามมิติของแม่น้ำ',
  h1: 'น้ำอยู่ไหน',
  lede: 'ดูระดับน้ำในแม่น้ำ ฝน และน้ำท่วม ทั่วประเทศไทย',
  'mode.loading': 'กำลังโหลด',
  'mode.now': 'ตอนนี้',
  'mode.past': 'ย้อนหลัง',
  'mode.forecast': 'คาดการณ์',
  'stat.overflow': '<em>จุดที่</em><strong>น้ำล้นตลิ่ง</strong>',
  'stat.high': '<em>จุดที่</em><strong>น้ำเกือบเต็มตลิ่ง</strong>',
  'stat.rain': '<em>จุดที่</em><strong>ฝนตกหนักมาก</strong>',
  'province.label': 'เลือกจังหวัด',
  'province.placeholder': 'ไปที่ภาคหรือจังหวัด…',
  'group.regions': 'ภาค',
  'group.provinces': 'จังหวัด',
  'panel.open': 'ชั้นข้อมูล',
  near: 'ใกล้ฉัน',
  'near.finding': 'กำลังหาตำแหน่ง…',
  'theme.toLight': 'เปลี่ยนเป็นโหมดสว่าง',
  'theme.toDark': 'เปลี่ยนเป็นโหมดมืด',
  'lang.button': 'EN',
  'lang.name': 'English',
  'theme.name': 'สว่าง / มืด',
  'lang.aria': 'Switch to English',
  help: 'วิธีดูแผนที่',
  'places.aria': 'มุมมอง',
  'view.thailand': 'ทั้งประเทศ',
  'view.north': 'ภาคเหนือ',
  'view.isan': 'ภาคอีสาน',
  'view.central': 'ภาคกลาง',
  'view.bangkok': 'กรุงเทพฯ',
  'view.south': 'ภาคใต้',
  'panel.toggle': 'สีบอกอะไร?',
  'panel.colours': 'สีบอกอะไร',
  'panel.hint': 'ผนังแม่น้ำยิ่งสูง แปลว่าน้ำยิ่งมาก',
  'panel.show': 'แสดงบนแผนที่',
  'panel.more': 'ตั้งค่าเพิ่มเติม',
  'panel.height': 'ความสูงผนัง',
  'panel.imerg': 'แสดงฝนจากดาวเทียม เมื่อดูวันย้อนหลัง',
  'layer.rivers': 'แม่น้ำ',
  'layer.stations': 'จุดวัดน้ำ',
  'layer.rain': 'ฝน',
  'layer.flood': 'น้ำท่วม',
  'level.low': 'น้ำน้อย',
  'level.low.desc': 'น้อยกว่าที่แม่น้ำนี้ไหลตามปกติ',
  'level.normal': 'ปกติ',
  'level.normal.desc': 'ใกล้เคียงปกติ ไม่ต้องกังวล',
  'level.high': 'น้ำมาก',
  'level.high.desc': 'มากกว่าปกติ ควรติดตามข่าว',
  'level.danger': 'อันตราย',
  'level.danger.desc': 'น้ำล้นตลิ่ง หรือมากกว่าปกติหลายเท่า',
  'rain.moderate': 'ฝนปานกลาง',
  'rain.heavy': 'ฝนหนัก',
  'rain.very': 'ฝนหนักมาก',
  'rain.light': 'ฝนเล็กน้อย',
  'rain.ring': 'วงกระพริบ = ระวังน้ำท่วมขัง',
  close: 'ปิด',
  play: 'เล่นย้อนหลัง',
  pause: 'หยุด',
  'chart.aria': 'กราฟรายวัน แตะหรือลากเพื่อเลือกวัน',
  'chart.overview': 'แม่น้ำในไทยที่น้ำมากและอันตราย',
  'chart.overview.value': '<i class="k-red"></i>อันตราย {d} กิโลเมตร <i class="k-yellow"></i>น้ำมาก {h} กิโลเมตร',
  'chart.river': '{name} · น้ำไหลรายวัน',
  'chart.river.value': 'วินาทีละ {q} ลูกบาศก์เมตร',
  'chart.back': 'ดูทั้งประเทศ',
  'speed.aria': 'ความเร็ว',
  'speed.slow': 'ช้า',
  'speed.normal': 'ปกติ',
  'speed.fast': 'เร็ว',
  now: 'กลับไปวันนี้',
  'guide.title': 'ดูแผนที่นี้อย่างไร',
  'guide.1': '<b>ผนังยิ่งสูง</b> แปลว่าน้ำในแม่น้ำยิ่งมาก',
  'guide.2': '<b>ดูสี</b> สีฟ้าคือปกติ สีเหลืองคือน้ำมาก <span class="red">สีแดงคืออันตราย</span>',
  'guide.3': '<b>แตะ</b>แม่น้ำหรือแท่งจุดวัดเพื่ออ่านรายละเอียด แล้วกด <b>เล่นย้อนหลัง</b> เพื่อดูน้ำขึ้นลงตลอด {span}ที่ผ่านมา',
  'guide.ok': 'เริ่มดูเลย',
  'span.months': '{n} เดือน',
  'span.year': '1 ปี',
  'sources.title': 'ข้อมูลมาจากไหน',
  'sources.list':
    '<li><b>ปริมาณน้ำในแม่น้ำ</b> แบบจำลอง GloFAS ของ Copernicus (ผ่าน Open‑Meteo) · รายวัน และคาดการณ์ล่วงหน้า 30 วัน</li>' +
    '<li><b>เส้นแม่น้ำ</b> HydroRIVERS (WWF / HydroSHEDS)</li>' +
    '<li><b>ระดับน้ำและฝน</b> คลังข้อมูลน้ำแห่งชาติ ThaiWater (สสน.) · อัปเดตทุก 10 นาที</li>' +
    '<li><b>เรดาร์ฝน</b> RainViewer · 1 ชั่วโมงล่าสุด</li>' +
    '<li><b>พื้นที่น้ำท่วมจากดาวเทียม</b> NASA MODIS · <b>ฝนจากดาวเทียม</b> NASA GPM IMERG</li>' +
    '<li><b>แผนที่</b> OpenStreetMap / OpenFreeMap</li>',
  loading: 'กำลังโหลดแผนที่แม่น้ำ…',
  'loading.error': 'โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง',
  today: 'วันนี้',
  updated: '· อัปเดต {hm} น.',
  forecast: 'คาดการณ์',
  highest: 'น้ำมากที่สุด',

  // sentences
  'pools.second': 'เท่ากับน้ำเต็มสระว่ายน้ำโอลิมปิก <b>{n} สระ</b> ในทุก ๆ วินาที',
  'pools.minute': 'เท่ากับน้ำเต็มสระว่ายน้ำโอลิมปิก <b>{n} สระ</b> ในทุก ๆ นาที',

  'river.kicker': 'แม่น้ำ · {date}',
  'river.kicker.forecast': 'แม่น้ำ · คาดการณ์วันที่ {date}',
  'river.basin': 'ลุ่ม{name}',
  'river.local': 'ลำน้ำในพื้นที่',
  'river.flow': 'น้ำไหลผ่าน <b>วินาทีละ {q} ลูกบาศก์เมตร</b>',
  'river.flow.forecast': 'คาดว่าน้ำจะไหลผ่าน <b>วินาทีละ {q} ลูกบาศก์เมตร</b>',
  'river.more': 'มากกว่าปกติ <b>{x} เท่า</b>',
  'river.less': 'น้อยกว่าปกติ เหลือประมาณ <b>{pct}%</b> ของปกติ',
  'river.usual': 'ใกล้เคียงปกติ',
  'river.fine': 'น้ำฝนจากพื้นที่ {area} ตารางกิโลเมตรไหลมารวมที่จุดนี้ · ข้อมูลจากแบบจำลอง GloFAS',

  'station.kicker': 'จุดวัดระดับน้ำ · จังหวัด{province}',
  'station.over': 'น้ำล้นตลิ่ง',
  'station.nearly': 'น้ำเกือบเต็มตลิ่ง',
  'station.overBy': 'น้ำ<b>ล้นตลิ่ง</b>ขึ้นมาแล้ว <b>{m} เมตร</b>',
  'station.below': 'น้ำยังต่ำกว่าขอบตลิ่ง <b>{m} เมตร</b>',
  'station.rising': '<b>น้ำกำลังขึ้น ▲</b>',
  'station.falling': 'น้ำกำลังลด ▼',
  'station.steady': 'ระดับน้ำทรงตัว',
  'station.fine': 'อัปเดต {when} · {basin} · ข้อมูลจาก ThaiWater',
  'xs.bank': 'ขอบตลิ่ง',
  'xs.water': 'น้ำ {pct}%',
  'xs.aria': 'น้ำอยู่ที่ {pct}% ของความสูงตลิ่ง',
  when: '{date} เวลา {hm} น.',

  'rainCard.kicker': 'จุดวัดฝน · จังหวัด{province}',
  'rainCard.amount': 'ใน 24 ชั่วโมงที่ผ่านมา ฝนตก <b>{mm} มิลลิเมตร</b>',
  'rainCard.depth': 'ถ้าน้ำฝนขังอยู่กับที่ จะสูงประมาณ <b>{cm} เซนติเมตร</b>',
  'rainCard.warnVery': '<b>ระวังน้ำท่วมขัง</b>บนถนนและที่ลุ่มต่ำ ถ้าอยู่ใกล้ภูเขา ระวังน้ำป่าไหลหลาก',
  'rainCard.warnHeavy': 'ที่ลุ่มต่ำอาจมีน้ำขังชั่วคราว',
  'rainCard.fine': 'ชั่วโมงล่าสุดฝนตก {mm1} มิลลิเมตร · อัปเดต {when} · ข้อมูลจาก ThaiWater',

  'area.over': 'น้ำล้นตลิ่ง {n} จุด',
  'area.nearly': 'น้ำเกือบเต็มตลิ่ง {n} จุด',
  'area.normal': 'ระดับน้ำส่วนใหญ่ปกติ',
  'tally.danger': 'ล้นตลิ่ง',
  'tally.high': 'เกือบเต็ม',
  'tally.normal': 'ปกติ',
  'tally.low': 'น้ำน้อย',
  'area.noGauges': 'พื้นที่นี้ไม่มีจุดวัดระดับน้ำ',
  'area.wettest': 'ฝนตกหนักที่สุดใน 24 ชั่วโมง: <b>{mm} มิลลิเมตร</b> ที่{name}',
  'area.dry': '24 ชั่วโมงที่ผ่านมาไม่มีฝนตก',
  'area.fine': 'จากจุดวัดระดับน้ำ {n} แห่ง · ข้อมูลล่าสุดจาก ThaiWater',
  'province.title': 'จังหวัด{name}',
  'province.kicker': 'สรุปสถานการณ์ตอนนี้',
  'near.title': 'รอบตัวคุณ ในระยะ 5 กิโลเมตร',
  'near.kicker': 'สถานการณ์ใกล้คุณตอนนี้',
  'near.note': 'จุดวัดระดับน้ำที่ใกล้คุณที่สุดคือ <b>{name}</b> ห่างไป {km} กิโลเมตร ตอนนี้<b>{status}</b>',
  'near.status.danger': 'น้ำล้นตลิ่ง',
  'near.status.high': 'น้ำเกือบเต็มตลิ่ง',
  'near.status.normal': 'ระดับน้ำปกติ',
  'near.status.low': 'น้ำน้อย',
  'near.errorTitle': 'ไม่พบตำแหน่งของคุณ',
  'near.errorBody': 'กรุณาอนุญาตให้เบราว์เซอร์ใช้ตำแหน่ง หรือเลือกจังหวัดจากช่องค้นหาแทน',
};

const en: Dict = {
  title: 'น้ำอยู่ไหน? — Where’s the water? Thailand’s live water map',
  'map.aria': '3D map of rivers',
  h1: 'น้ำอยู่ไหน',
  lede: 'River levels, rain and flooding across Thailand',
  'mode.loading': 'Loading',
  'mode.now': 'Now',
  'mode.past': 'Past',
  'mode.forecast': 'Forecast',
  'stat.overflow': '<em>gauges </em><strong>over the bank</strong>',
  'stat.high': '<em>gauges </em><strong>nearly full</strong>',
  'stat.rain': '<em>places with </em><strong>very heavy rain</strong>',
  'province.label': 'Choose a province',
  'province.placeholder': 'Go to a region or province…',
  'group.regions': 'Regions',
  'group.provinces': 'Provinces',
  'panel.open': 'Layers & key',
  near: 'Near me',
  'near.finding': 'Finding you…',
  'theme.toLight': 'Switch to light mode',
  'theme.toDark': 'Switch to dark mode',
  'lang.button': 'ไทย',
  'lang.name': 'ภาษาไทย',
  'theme.name': 'Light / dark',
  'lang.aria': 'เปลี่ยนเป็นภาษาไทย',
  help: 'How to read this map',
  'places.aria': 'Views',
  'view.thailand': 'All Thailand',
  'view.north': 'North',
  'view.isan': 'Northeast',
  'view.central': 'Central',
  'view.bangkok': 'Bangkok',
  'view.south': 'South',
  'panel.toggle': 'What do the colours mean?',
  'panel.colours': 'What the colours mean',
  'panel.hint': 'The taller the wall, the more water in the river',
  'panel.show': 'Show on the map',
  'panel.more': 'More settings',
  'panel.height': 'Wall height',
  'panel.imerg': 'Show satellite rain when looking at past days',
  'layer.rivers': 'Rivers',
  'layer.stations': 'Gauges',
  'layer.rain': 'Rain',
  'layer.flood': 'Flooding',
  'level.low': 'Low',
  'level.low.desc': 'Less water than this river usually carries',
  'level.normal': 'Normal',
  'level.normal.desc': 'Close to usual — nothing to worry about',
  'level.high': 'High',
  'level.high.desc': 'More than usual — keep an eye on the news',
  'level.danger': 'Danger',
  'level.danger.desc': 'Over the bank, or several times more than usual',
  'rain.moderate': 'Moderate rain',
  'rain.heavy': 'Heavy rain',
  'rain.very': 'Very heavy rain',
  'rain.light': 'Light rain',
  'rain.ring': 'Pulsing ring = watch for street flooding',
  close: 'Close',
  play: 'Play the past',
  pause: 'Pause',
  'chart.aria': 'Daily chart. Tap or drag to pick a day',
  'chart.overview': 'Thai rivers running high or dangerous',
  'chart.overview.value': '<i class="k-red"></i>Danger {d} km <i class="k-yellow"></i>High {h} km',
  'chart.river': '{name} · daily flow',
  'chart.river.value': '{q} cubic metres a second',
  'chart.back': 'All Thailand',
  'speed.aria': 'Speed',
  'speed.slow': 'Slow',
  'speed.normal': 'Normal',
  'speed.fast': 'Fast',
  now: 'Back to today',
  'guide.title': 'How to read this map',
  'guide.1': '<b>Taller walls</b> mean more water in the river',
  'guide.2': '<b>Colours:</b> blue is normal, yellow is high, <span class="red">red is danger</span>',
  'guide.3': '<b>Tap</b> a river or a gauge bar for details, then press <b>Play the past</b> to watch the water rise and fall over the last {span}',
  'guide.ok': 'Start exploring',
  'span.months': '{n} months',
  'span.year': 'year',
  'sources.title': 'Where the data comes from',
  'sources.list':
    '<li><b>River flow</b> Copernicus GloFAS model (via Open‑Meteo) · daily, plus a 30-day forecast</li>' +
    '<li><b>River lines</b> HydroRIVERS (WWF / HydroSHEDS)</li>' +
    '<li><b>Water levels and rain</b> ThaiWater, Thailand’s national water data centre (HII) · every 10 minutes</li>' +
    '<li><b>Rain radar</b> RainViewer · last hour</li>' +
    '<li><b>Flooded areas from satellite</b> NASA MODIS · <b>Satellite rain</b> NASA GPM IMERG</li>' +
    '<li><b>Base map</b> OpenStreetMap / OpenFreeMap</li>',
  loading: 'Loading the river map…',
  'loading.error': 'Couldn’t load the data — please refresh the page',
  today: 'Today',
  updated: '· updated {hm}',
  forecast: 'Forecast',
  highest: 'Highest',

  'pools.second': 'as much as <b>{n} Olympic swimming pools</b> every second',
  'pools.minute': 'as much as <b>{n} Olympic swimming pools</b> every minute',

  'river.kicker': 'River · {date}',
  'river.kicker.forecast': 'River · forecast for {date}',
  'river.basin': '{name} basin',
  'river.local': 'Local stream',
  'river.flow': 'Water flowing past: <b>{q} cubic metres every second</b>',
  'river.flow.forecast': 'Expected flow: <b>{q} cubic metres every second</b>',
  'river.more': '<b>{x} times</b> more than usual',
  'river.less': 'Less than usual — about <b>{pct}%</b> of normal',
  'river.usual': 'Close to usual',
  'river.fine': 'Rain falling on {area} square kilometres drains to this point · GloFAS model data',

  'station.kicker': 'Water-level gauge · {province}',
  'station.over': 'Over the bank',
  'station.nearly': 'Nearly full',
  'station.overBy': 'The river is <b>over its bank</b> by <b>{m} metres</b>',
  'station.below': 'The water is <b>{m} metres</b> below the top of the bank',
  'station.rising': '<b>Rising ▲</b>',
  'station.falling': 'Falling ▼',
  'station.steady': 'Steady',
  'station.fine': 'Updated {when} · {basin} · ThaiWater',
  'xs.bank': 'Top of bank',
  'xs.water': 'Water {pct}%',
  'xs.aria': 'Water is at {pct}% of the bank height',
  when: '{date}, {hm}',

  'rainCard.kicker': 'Rain gauge · {province}',
  'rainCard.amount': '<b>{mm} millimetres</b> of rain in the last 24 hours',
  'rainCard.depth': 'If it all stayed put, it would stand about <b>{cm} centimetres</b> deep',
  'rainCard.warnVery': '<b>Watch for flooding</b> on roads and low ground. Near hills, watch for flash floods.',
  'rainCard.warnHeavy': 'Low ground may flood for a while.',
  'rainCard.fine': 'Last hour: {mm1} mm · Updated {when} · ThaiWater',

  'area.over': '{n} gauges over the bank',
  'area.nearly': '{n} gauges nearly full',
  'area.normal': 'Water levels mostly normal',
  'tally.danger': 'Over bank',
  'tally.high': 'Nearly full',
  'tally.normal': 'Normal',
  'tally.low': 'Low',
  'area.noGauges': 'No water-level gauges here',
  'area.wettest': 'Heaviest rain in 24 hours: <b>{mm} millimetres</b> at {name}',
  'area.dry': 'No rain in the last 24 hours',
  'area.fine': 'From {n} water-level gauges · latest ThaiWater data',
  'province.title': '{name}',
  'province.kicker': 'Situation right now',
  'near.title': 'Around you, within 5 km',
  'near.kicker': 'Situation near you right now',
  'near.note': 'The nearest water-level gauge is <b>{name}</b>, {km} km away. Right now: <b>{status}</b>',
  'near.status.danger': 'over the bank',
  'near.status.high': 'nearly full',
  'near.status.normal': 'normal',
  'near.status.low': 'low',
  'near.errorTitle': 'Couldn’t find your location',
  'near.errorBody': 'Please allow location access, or pick a province from the search box instead.',
};

const DICTS: Record<Lang, Dict> = { th: { ...th, ...experienceCopy.th }, en: { ...en, ...experienceCopy.en } };

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = DICTS[lang][key] ?? DICTS.th[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Static markup: data-i18n (text), data-i18n-html (markup), data-i18n-aria / -title (attributes).
export function applyStatic(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle!)));
  document.title = t('title');
}

// ---------------------------------------------------------------- dates

const MONTHS: Record<Lang, string[]> = {
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
export const monthShort = (m: number) => MONTHS[lang][m - 1];
export const displayYear = (y: number) => (lang === 'th' ? y + 543 : y);

// "27 ก.ย. 2569" / "27 Sep 2026"
export function shortDate(iso: string, withYear = true) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${monthShort(m)}${withYear ? ` ${displayYear(y)}` : ''}`;
}
// "27 กันยายน 2569" / "27 September 2026"
export function longDate(iso: string) {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}
