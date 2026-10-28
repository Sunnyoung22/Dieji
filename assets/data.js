/* ==========================================================================
   蝶迹 · data.js
   Domain constants, local persistence, demo data and derived statistics.
   No network access. All data stays in this browser.
   ========================================================================== */
(function () {
  'use strict';

  window.JK = window.JK || {};

  const APP_VERSION = 1;
  const STORAGE_KEY = 'jkc_app_v1';
  const DAY_MS = 86400000;

  /* ------------------------------------------------------------------------
     Clinical display configuration
     Ranges are editable defaults only. Every lab record stores its own range.
     ------------------------------------------------------------------------ */
  const INDICATORS = {
    TSH: {
      key: 'TSH', name: '促甲状腺激素', short: 'TSH', unit: 'mIU/L',
      low: 0.27, high: 4.20, decimals: 2, group: 'thyroid', primary: true,
      color: '#2f7464',
      description: '由垂体分泌，反映身体对甲状腺激素的反馈。甲亢治疗早期，它往往比 FT4、FT3 恢复得慢。'
    },
    FT4: {
      key: 'FT4', name: '游离甲状腺素', short: 'FT4', unit: 'pmol/L',
      low: 12.0, high: 22.0, decimals: 1, group: 'thyroid', primary: true,
      color: '#b17843',
      description: '血液中可自由发挥作用的甲状腺素，是评估甲亢程度与疗效的重要指标之一。'
    },
    FT3: {
      key: 'FT3', name: '游离三碘甲状腺原氨酸', short: 'FT3', unit: 'pmol/L',
      low: 3.1, high: 6.8, decimals: 1, group: 'thyroid', primary: true,
      color: '#5c7f95',
      description: '活性较强的甲状腺激素。部分甲亢患者 FT3 升高会更明显，也可能在治疗后较晚恢复。'
    },
    TT4: {
      key: 'TT4', name: '总甲状腺素', short: 'TT4', unit: 'nmol/L',
      low: 66, high: 181, decimals: 1, group: 'thyroid', primary: false,
      color: '#9a815c',
      description: '血液中与蛋白结合及游离的甲状腺素总量，可能受妊娠、肝病或药物影响。'
    },
    TT3: {
      key: 'TT3', name: '总三碘甲状腺原氨酸', short: 'TT3', unit: 'nmol/L',
      low: 1.3, high: 3.1, decimals: 2, group: 'thyroid', primary: false,
      color: '#887650',
      description: '血液中总的三碘甲状腺原氨酸含量，不同实验室的单位与参考范围差异较大。'
    },
    TRAb: {
      key: 'TRAb', name: '促甲状腺激素受体抗体', short: 'TRAb', unit: 'IU/L',
      low: 0, high: 1.75, decimals: 2, group: 'antibody', antibody: true,
      color: '#a1605c',
      description: '与 Graves 病相关。可用于辅助诊断与评估复发风险，具体解读需由医生结合病情判断。'
    },
    TPOAb: {
      key: 'TPOAb', name: '甲状腺过氧化物酶抗体', short: 'TPOAb', unit: 'IU/mL',
      low: 0, high: 34.0, decimals: 1, group: 'antibody', antibody: true,
      color: '#9a6c69',
      description: '反映自身免疫背景。阳性并不等同于甲亢严重程度，需结合甲状腺功能与其他检查。'
    },
    TgAb: {
      key: 'TgAb', name: '甲状腺球蛋白抗体', short: 'TgAb', unit: 'IU/mL',
      low: 0, high: 115, decimals: 1, group: 'antibody', antibody: true,
      color: '#8d7771',
      description: '常见的甲状腺自身抗体，通常与 TPOAb 一起评估自身免疫性甲状腺疾病背景。'
    },
    ALT: {
      key: 'ALT', name: '丙氨酸氨基转移酶', short: 'ALT', unit: 'U/L',
      low: 7, high: 40, decimals: 0, group: 'safety', safety: true,
      color: '#7b8b55',
      description: '常用的肝功能指标。抗甲状腺药物治疗期间，复查项目与频率请遵循医生安排。'
    },
    AST: {
      key: 'AST', name: '天门冬氨酸氨基转移酶', short: 'AST', unit: 'U/L',
      low: 13, high: 35, decimals: 0, group: 'safety', safety: true,
      color: '#78875b',
      description: '与 ALT 一起反映肝细胞情况。单次轻度升高也可能与运动、饮酒等因素相关。'
    },
    WBC: {
      key: 'WBC', name: '白细胞计数', short: 'WBC', unit: '×10⁹/L',
      low: 3.5, high: 9.5, decimals: 2, group: 'safety', safety: true,
      color: '#657f80',
      description: '服用抗甲状腺药物期间，医生可能会安排监测。出现发热或咽痛时尤其需要重视。'
    },
    ANC: {
      key: 'ANC', name: '中性粒细胞计数', short: 'ANC', unit: '×10⁹/L',
      low: 1.8, high: 6.3, decimals: 2, group: 'safety', safety: true,
      color: '#5e7a7c',
      description: '帮助判断中性粒细胞水平。抗甲状腺药物相关的粒细胞缺乏是需要及时识别的安全信号。'
    }
  };

  const INDICATOR_ORDER = ['TSH', 'FT4', 'FT3', 'TT4', 'TT3', 'TRAb', 'TPOAb', 'TgAb', 'ALT', 'AST', 'WBC', 'ANC'];
  const PRIMARY_INDICATORS = ['TSH', 'FT4', 'FT3'];
  const OPTIONAL_GROUPS = [
    { title: '总甲状腺激素', keys: ['TT4', 'TT3'] },
    { title: '甲状腺抗体', keys: ['TRAb', 'TPOAb', 'TgAb'] },
    { title: '用药安全监测', keys: ['ALT', 'AST', 'WBC', 'ANC'] }
  ];

  const SYMPTOMS = [
    { key: 'palpitations', name: '心悸 / 心慌', short: '心悸' },
    { key: 'tremor', name: '手抖', short: '手抖' },
    { key: 'sweating', name: '怕热多汗', short: '多汗' },
    { key: 'fatigue', name: '疲劳乏力', short: '乏力' },
    { key: 'sleep', name: '睡眠 / 情绪', short: '睡眠' },
    { key: 'bowel', name: '排便次数增多', short: '排便增多' },
    { key: 'eye', name: '眼部不适', short: '眼部不适' },
    { key: 'neck', name: '颈部肿胀 / 压迫感', short: '颈部不适' }
  ];

  const FLAGS = [
    { key: 'fever', name: '发热 ≥ 38.3℃', hint: '抗甲状腺药物期间出现发热需要及时联系医生' },
    { key: 'sore_throat', name: '明显咽痛 / 口腔溃疡', hint: '可能需要尽快检查血常规' },
    { key: 'jaundice', name: '皮肤或眼白发黄', hint: '可能提示肝损伤信号，需要就医评估' },
    { key: 'rash', name: '广泛皮疹 / 明显瘙痒', hint: '需要让医生判断是否与药物相关' }
  ];

  const FEELINGS = [
    { key: 'good', name: '很好' },
    { key: 'okay', name: '还好' },
    { key: 'low', name: '不太舒服' }
  ];

  const SEVERITY = [
    { level: 0, label: '无' },
    { level: 1, label: '轻' },
    { level: 2, label: '中' },
    { level: 3, label: '重' }
  ];

  const MED_CATEGORIES = ['抗甲状腺药', 'β受体阻滞剂', '护肝 / 升白', '维生素 / 其他'];

  /* ------------------------------------------------------------------------
     Small date / number helpers
     ------------------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, '0'); }

  function dateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayKey() { return dateKey(new Date()); }

  function fromDateKey(key) {
    if (!key || typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const parts = key.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return null;
    // Reject rollovers such as 2026-02-31.
    if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) return null;
    return d;
  }

  function isValidDateKey(key) {
    return typeof key === 'string' && fromDateKey(key) !== null;
  }

  function addDays(value, amount) {
    const d = value instanceof Date ? new Date(value.getTime()) : fromDateKey(value);
    if (!d) return null;
    d.setDate(d.getDate() + amount);
    return d;
  }

  function daysBetween(earlierKey, laterKey) {
    const a = fromDateKey(earlierKey);
    const b = fromDateKey(laterKey);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
  }

  function formatDate(key, options) {
    const d = fromDateKey(key);
    if (!d) return '—';
    const year = (options && options.year) !== false ? d.getFullYear() + '年' : '';
    return `${year}${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatMonthDay(key) {
    const d = fromDateKey(key);
    if (!d) return '—';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function weekdayCN(key) {
    const d = fromDateKey(key);
    if (!d) return '';
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }

  function englishMonth(key) {
    const d = fromDateKey(key);
    if (!d) return '';
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  }

  function formatNumber(value, key) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const cfg = INDICATORS[key] || {};
    let digits = Number.isInteger(cfg.decimals) ? cfg.decimals : 2;
    // Preserve precision the user actually entered (for example ALT 41.5),
    // and never round a very small positive value down to 0.000.
    const raw = String(num);
    if (!/[eE]/.test(raw) && raw.includes('.')) {
      digits = Math.max(digits, raw.split('.')[1].length);
    }
    if (num !== 0 && Math.abs(num) < 0.1) {
      digits = Math.max(digits, Math.ceil(-Math.log10(Math.abs(num))));
    }
    return num.toFixed(Math.min(6, digits));
  }

  function formatRange(low, high, key) {
    const cfg = INDICATORS[key] || {};
    if (low === null || low === undefined) {
      if (high === null || high === undefined) return '未设置';
      return `< ${formatNumber(high, key)}`;
    }
    if (high === null || high === undefined) return `> ${formatNumber(low, key)}`;
    if (cfg.antibody && Number(low) === 0) return `< ${formatNumber(high, key)}`;
    return `${formatNumber(low, key)} – ${formatNumber(high, key)}`;
  }

  function uid(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix || 'id'}_${Date.now().toString(36)}_${random}`;
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  /* ------------------------------------------------------------------------
     State shapes
     ------------------------------------------------------------------------ */
  function defaultRanges() {
    const ranges = {};
    INDICATOR_ORDER.forEach((key) => {
      ranges[key] = { low: INDICATORS[key].low, high: INDICATORS[key].high };
    });
    return ranges;
  }

  function createEmptyState(profile) {
    const now = new Date().toISOString();
    return {
      version: APP_VERSION,
      meta: { demo: false, createdAt: now, updatedAt: now },
      profile: Object.assign({
        name: '', sex: '', birthYear: '', diagnosis: '', diagnosedAt: '',
        hospital: '', doctor: '', summaryQuestions: ''
      }, profile || {}),
      settings: { ranges: defaultRanges() },
      records: [],
      daily: [],
      medications: [],
      medLogs: {},
      visits: []
    };
  }

  const RECOVERY_KEY = 'jkc_app_v1_recovery';
  let loadStateIssue = null;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanText(value, maxLength) {
    if (value === null || value === undefined) return '';
    return String(value).trim().slice(0, maxLength || 500);
  }

  function cleanNumber(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function cleanDate(value) {
    const text = cleanText(value, 10);
    return isValidDateKey(text) ? text : '';
  }

  function cleanTimestamp(value, fallbackDate) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
    return new Date(`${fallbackDate || todayKey()}T12:00:00`).toISOString();
  }

  function uniqueId(preferred, prefix, seen) {
    let id = cleanText(preferred, 80) || uid(prefix);
    let suffix = 2;
    while (seen.has(id)) {
      id = `${cleanText(preferred, 70) || prefix}_${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    return id;
  }

  function sanitizeRanges(rawRanges) {
    const ranges = defaultRanges();
    if (!isPlainObject(rawRanges)) return ranges;
    INDICATOR_ORDER.forEach((key) => {
      const raw = rawRanges[key];
      if (!isPlainObject(raw)) return;
      const low = cleanNumber(raw.low);
      const high = cleanNumber(raw.high);
      if (low !== null && high !== null && low >= 0 && high > low) ranges[key] = { low, high };
    });
    return ranges;
  }

  function sanitizePanel(rawPanel, ranges) {
    const panel = {};
    if (!isPlainObject(rawPanel)) return panel;
    INDICATOR_ORDER.forEach((key) => {
      const raw = rawPanel[key];
      if (!isPlainObject(raw)) return;
      const value = cleanNumber(raw.value);
      if (value === null || value < 0) return;
      const fallback = ranges[key] || INDICATORS[key];
      let low = cleanNumber(raw.low);
      let high = cleanNumber(raw.high);
      if (low === null || high === null || low < 0 || high <= low) {
        low = fallback.low;
        high = fallback.high;
      }
      panel[key] = { value, low, high, unit: INDICATORS[key].unit };
    });
    return panel;
  }

  function sanitizeProfile(rawProfile) {
    const profile = rawProfile && isPlainObject(rawProfile) ? rawProfile : {};
    const currentYear = new Date().getFullYear();
    const birthYear = Number(profile.birthYear);
    const validBirthYear = Number.isInteger(birthYear) && birthYear >= 1900 && birthYear <= currentYear
      ? String(birthYear) : '';
    return {
      name: cleanText(profile.name, 24),
      sex: cleanText(profile.sex, 24),
      birthYear: validBirthYear,
      diagnosis: cleanText(profile.diagnosis, 80),
      diagnosedAt: cleanDate(profile.diagnosedAt),
      hospital: cleanText(profile.hospital, 60),
      doctor: cleanText(profile.doctor, 40),
      summaryQuestions: cleanText(profile.summaryQuestions, 1200)
    };
  }

  function sanitizeRecords(rawRecords, ranges) {
    const records = [];
    const seen = new Set();
    if (!Array.isArray(rawRecords)) return records;
    rawRecords.forEach((raw) => {
      if (!isPlainObject(raw)) return;
      const date = cleanDate(raw.date);
      if (!date) return;
      const panel = sanitizePanel(raw.panel, ranges);
      if (!Object.keys(panel).length) return;
      records.push({
        id: uniqueId(raw.id, 'lab', seen),
        date,
        hospital: cleanText(raw.hospital, 60),
        doctor: cleanText(raw.doctor, 40),
        fasting: raw.fasting === true,
        panel,
        note: cleanText(raw.note, 500),
        createdAt: cleanTimestamp(raw.createdAt, date)
      });
    });
    return records;
  }

  function sanitizeDaily(rawDaily) {
    const byDate = new Map();
    if (!Array.isArray(rawDaily)) return [];
    rawDaily.forEach((raw) => {
      if (!isPlainObject(raw)) return;
      const date = cleanDate(raw.date);
      if (!date) return;
      const symptoms = {};
      SYMPTOMS.forEach((symptom) => {
        const level = cleanNumber(raw.symptoms && raw.symptoms[symptom.key]);
        symptoms[symptom.key] = level === null ? 0 : clamp(Math.round(level), 0, 3);
      });
      const heartRate = cleanNumber(raw.heartRate);
      const weight = cleanNumber(raw.weight);
      const sleepHours = cleanNumber(raw.sleepHours);
      const flags = Array.isArray(raw.flags)
        ? [...new Set(raw.flags.filter((flag) => FLAGS.some((item) => item.key === flag)))]
        : [];
      const feeling = FEELINGS.some((item) => item.key === raw.feeling) ? raw.feeling : 'okay';
      const entry = {
        id: cleanText(raw.id, 80) || uid('daily'),
        date,
        heartRate: heartRate !== null && heartRate >= 20 && heartRate <= 300 ? heartRate : null,
        weight: weight !== null && weight >= 20 && weight <= 300 ? weight : null,
        sleepHours: sleepHours !== null && sleepHours >= 0 && sleepHours <= 24 ? sleepHours : null,
        symptoms,
        flags,
        feeling,
        note: cleanText(raw.note, 400),
        createdAt: cleanTimestamp(raw.createdAt, date)
      };
      const previous = byDate.get(date);
      if (!previous || String(entry.createdAt) >= String(previous.createdAt)) byDate.set(date, entry);
    });
    return [...byDate.values()];
  }

  function sanitizeMedications(rawMedications) {
    const medications = [];
    const seen = new Set();
    if (!Array.isArray(rawMedications)) return medications;
    rawMedications.forEach((raw) => {
      if (!isPlainObject(raw)) return;
      const name = cleanText(raw.name, 60);
      if (!name) return;
      const seenTimes = new Set();
      const schedule = [];
      if (Array.isArray(raw.schedule)) {
        raw.schedule.forEach((dose) => {
          if (!isPlainObject(dose)) return;
          const time = cleanText(dose.time, 5);
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || seenTimes.has(time)) return;
          seenTimes.add(time);
          schedule.push({
            time,
            amount: cleanText(dose.amount || raw.amount, 40) || '按医嘱'
          });
        });
      }
      schedule.sort((a, b) => a.time.localeCompare(b.time));
      const startDate = cleanDate(raw.startDate);
      let endDate = cleanDate(raw.endDate);
      if (startDate && endDate && endDate < startDate) endDate = '';
      medications.push({
        id: uniqueId(raw.id, 'med', seen),
        name,
        brand: cleanText(raw.brand, 40),
        category: cleanText(raw.category, 40) || '其他',
        amount: cleanText(raw.amount, 40),
        schedule,
        instruction: cleanText(raw.instruction, 100),
        startDate,
        endDate,
        active: raw.active !== false,
        note: cleanText(raw.note, 300)
      });
    });
    return medications;
  }

  function sanitizeVisits(rawVisits) {
    const visits = [];
    const seen = new Set();
    if (!Array.isArray(rawVisits)) return visits;
    rawVisits.forEach((raw) => {
      if (!isPlainObject(raw)) return;
      const date = cleanDate(raw.date);
      if (!date) return;
      const prep = [];
      const prepIds = new Set();
      if (Array.isArray(raw.prep)) {
        raw.prep.forEach((item) => {
          if (!isPlainObject(item)) return;
          const text = cleanText(item.text, 200);
          if (!text) return;
          prep.push({
            id: uniqueId(item.id, 'prep', prepIds),
            text,
            done: item.done === true
          });
        });
      }
      const time = cleanText(raw.time, 5);
      visits.push({
        id: uniqueId(raw.id, 'visit', seen),
        date,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
        type: cleanText(raw.type, 60) || '内分泌科复查',
        hospital: cleanText(raw.hospital, 60),
        doctor: cleanText(raw.doctor, 40),
        location: cleanText(raw.location, 80),
        purpose: cleanText(raw.purpose, 120),
        notes: cleanText(raw.notes, 500),
        prep
      });
    });
    return visits;
  }

  function sanitizeMedLogs(rawLogs) {
    const logs = {};
    if (!isPlainObject(rawLogs)) return logs;
    Object.entries(rawLogs).forEach(([date, day]) => {
      if (!isValidDateKey(date) || !isPlainObject(day)) return;
      const cleanDay = {};
      Object.entries(day).forEach(([key, value]) => {
        if (typeof key !== 'string' || !key.includes('|')) return;
        cleanDay[key] = isPlainObject(value) ? { ...value } : {};
      });
      if (Object.keys(cleanDay).length) logs[date] = cleanDay;
    });
    return logs;
  }

  function normalizeState(raw) {
    if (!isPlainObject(raw)) return null;
    const fallback = createEmptyState();
    const ranges = sanitizeRanges(raw.settings && raw.settings.ranges);
    const now = new Date().toISOString();
    return {
      version: APP_VERSION,
      meta: {
        demo: Boolean(raw.meta && raw.meta.demo),
        createdAt: cleanTimestamp(raw.meta && raw.meta.createdAt, todayKey()),
        updatedAt: cleanTimestamp(raw.meta && raw.meta.updatedAt, todayKey())
      },
      profile: sanitizeProfile(raw.profile),
      settings: { ranges },
      records: sanitizeRecords(raw.records, ranges),
      daily: sanitizeDaily(raw.daily),
      medications: sanitizeMedications(raw.medications),
      medLogs: sanitizeMedLogs(raw.medLogs),
      visits: sanitizeVisits(raw.visits)
    };
  }

  function loadState() {
    loadStateIssue = null;
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      loadStateIssue = { type: 'unavailable', message: '浏览器不允许读取本地存储。' };
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      if (!normalized) throw new Error('无法识别的数据结构');
      return normalized;
    } catch (error) {
      let recoverySaved = false;
      try {
        window.localStorage.setItem(RECOVERY_KEY, raw);
        recoverySaved = true;
      } catch (recoveryError) {
        // The main store is already unreadable; nothing else can be done here.
      }
      loadStateIssue = {
        type: 'corrupt',
        message: '本地记录无法读取，已使用临时演示数据。',
        recoverySaved
      };
      console.warn('本地记录解析失败。', error);
      return null;
    }
  }

  function getLoadStateIssue() {
    return loadStateIssue ? { ...loadStateIssue } : null;
  }

  function getRecoveryRaw() {
    try { return window.localStorage.getItem(RECOVERY_KEY) || ''; }
    catch (error) { return ''; }
  }

  function clearRecovery() {
    try { window.localStorage.removeItem(RECOVERY_KEY); return true; }
    catch (error) { return false; }
  }

  function saveState(state) {
    try {
      state.meta = state.meta || {};
      state.meta.updatedAt = new Date().toISOString();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn('无法写入本地存储。', error);
      return false;
    }
  }

  /* ------------------------------------------------------------------------
     Demo case — deliberately fictional. Dates are relative to the current day.
     ------------------------------------------------------------------------ */
  function buildDemoState() {
    const now = new Date();
    const today = todayKey();
    const ago = (days) => dateKey(addDays(today, -days));
    const future = (days) => dateKey(addDays(today, days));

    const ranges = defaultRanges();

    function panel(values, overrides) {
      const output = {};
      Object.keys(values).forEach((key) => {
        const cfg = INDICATORS[key];
        if (!cfg) return;
        const range = Object.assign({}, ranges[key], (overrides && overrides[key]) || {});
        output[key] = {
          value: values[key],
          low: range.low,
          high: range.high,
          unit: cfg.unit
        };
      });
      return output;
    }

    const demoRecords = [
      {
        daysAgo: 386, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 0.006, FT4: 43.2, FT3: 17.6, TRAb: 13.8, TPOAb: 512,
          ALT: 41, AST: 33, WBC: 6.8, ANC: 3.9 },
        note: '确诊后首次复查，心悸和手抖明显。'
      },
      {
        daysAgo: 328, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 0.010, FT4: 31.8, FT3: 12.4, WBC: 5.9, ANC: 3.4 },
        note: '开始规律服药，心率较前下降。'
      },
      {
        daysAgo: 266, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 0.024, FT4: 23.6, FT3: 8.9, TRAb: 8.2 },
        note: '药物剂量按医嘱调整，继续观察。'
      },
      {
        daysAgo: 204, hospital: '仁和医学检验中心', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 0.071, FT4: 19.8, FT3: 7.2, ALT: 34, AST: 26, WBC: 6.1, ANC: 3.6 },
        note: '在外院复查，化验单参考范围已按本次录入。'
      },
      {
        daysAgo: 140, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 0.36, FT4: 17.2, FT3: 5.9, TRAb: 4.9 },
        note: '怕热、多汗较前减轻。'
      },
      {
        daysAgo: 76, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 0.92, FT4: 15.8, FT3: 5.4, ALT: 29, WBC: 6.3, ANC: 3.7 },
        note: '甲功持续改善，按医嘱继续当前方案。'
      },
      {
        daysAgo: 34, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 1.62, FT4: 16.4, FT3: 5.2, TRAb: 2.4 },
        note: '体重较前增加，睡眠尚可。'
      },
      {
        daysAgo: 6, hospital: '市第一人民医院', doctor: '陈知远 医生', fasting: true,
        values: { TSH: 2.31, FT4: 16.8, FT3: 5.2, TRAb: 1.52, TPOAb: 318,
          ALT: 23, AST: 20, WBC: 6.2, ANC: 3.5 },
        note: '复查甲功、抗体与用药安全指标，整体较前稳定。'
      }
    ];

    const records = demoRecords.map((item, index) => ({
      id: `demo_lab_${index + 1}`,
      date: ago(item.daysAgo),
      hospital: item.hospital,
      doctor: item.doctor,
      fasting: item.fasting,
      panel: panel(item.values, item.overrides),
      note: item.note,
      createdAt: new Date(now.getTime() - item.daysAgo * DAY_MS).toISOString()
    }));

    const demoDaily = [
      { d: 40, hr: 92, kg: 53.2, sleep: 6.0, s: [2, 2, 2, 2, 2, 1, 0, 0], feeling: 'low', note: '夜间心悸，入睡偏晚。' },
      { d: 36, hr: 90, kg: 53.3, sleep: 6.2, s: [2, 1, 2, 1, 2, 1, 0, 0], feeling: 'low', note: '' },
      { d: 32, hr: 88, kg: 53.4, sleep: 6.4, s: [1, 1, 2, 1, 2, 1, 0, 0], feeling: 'okay', note: '下午手抖比之前轻一些。' },
      { d: 28, hr: 86, kg: 53.5, sleep: 6.6, s: [1, 1, 1, 1, 1, 1, 0, 0], feeling: 'okay', note: '' },
      { d: 24, hr: 85, kg: 53.6, sleep: 6.8, s: [1, 1, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 21, hr: 84, kg: 53.7, sleep: 6.9, s: [1, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '工作较忙，午后有些累。' },
      { d: 18, hr: 82, kg: 53.7, sleep: 7.0, s: [1, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 16, hr: 81, kg: 53.8, sleep: 7.1, s: [0, 0, 1, 1, 0, 0, 0, 0], feeling: 'good', note: '' },
      { d: 14, hr: 80, kg: 53.8, sleep: 7.2, s: [0, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 12, hr: 79, kg: 53.9, sleep: 7.1, s: [0, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 10, hr: 78, kg: 54.0, sleep: 7.3, s: [0, 0, 1, 0, 0, 0, 0, 0], feeling: 'good', note: '' },
      { d: 8, hr: 78, kg: 54.0, sleep: 7.4, s: [0, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '睡前看了会书，比前几天放松。' },
      { d: 6, hr: 77, kg: 54.1, sleep: 7.0, s: [0, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 5, hr: 77, kg: 54.1, sleep: 7.2, s: [0, 0, 1, 1, 0, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 3, hr: 76, kg: 54.1, sleep: 7.1, s: [0, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '' },
      { d: 2, hr: 76, kg: 54.2, sleep: 7.3, s: [0, 0, 1, 0, 1, 0, 0, 0], feeling: 'good', note: '' },
      { d: 1, hr: 75, kg: 54.2, sleep: 7.2, s: [0, 0, 1, 1, 0, 0, 0, 0], feeling: 'good', note: '心率比上个月更平稳。' },
      { d: 0, hr: 76, kg: 54.2, sleep: 7.1, s: [0, 0, 1, 1, 1, 0, 0, 0], feeling: 'okay', note: '今天下午有些疲惫，休息后缓解。' }
    ];

    const symptomsKeys = SYMPTOMS.map((s) => s.key);
    const daily = demoDaily.map((item, index) => {
      const symptoms = {};
      symptomsKeys.forEach((key, sIndex) => { symptoms[key] = item.s[sIndex] || 0; });
      return {
        id: `demo_daily_${index + 1}`,
        date: ago(item.d),
        heartRate: item.hr,
        weight: item.kg,
        sleepHours: item.sleep,
        symptoms,
        flags: [],
        feeling: item.feeling,
        note: item.note,
        createdAt: new Date(now.getTime() - item.d * DAY_MS).toISOString()
      };
    });

    const medications = [
      {
        id: 'demo_med_1',
        name: '甲巯咪唑片',
        brand: '赛治',
        category: '抗甲状腺药',
        amount: '1 片（10 mg）',
        schedule: [{ time: '08:00', amount: '1 片（10 mg）' }],
        instruction: '早餐后服用',
        startDate: ago(400),
        active: true,
        note: '示例用药。剂量与服用方式请始终以医生医嘱为准。'
      },
      {
        id: 'demo_med_2',
        name: '普萘洛尔片',
        brand: '',
        category: 'β受体阻滞剂',
        amount: '1 片（10 mg）',
        schedule: [{ time: '08:00', amount: '1 片（10 mg）' }, { time: '20:00', amount: '1 片（10 mg）' }],
        instruction: '按医嘱服用；如出现明显心率过慢或不适，请咨询医生',
        startDate: ago(400),
        active: true,
        note: '示例用药，请勿据此自行服药。'
      }
    ];

    const medLogs = {};
    for (let i = 29; i >= 0; i -= 1) {
      const key = ago(i);
      const dayLogs = {};
      const skipped = i === 4 || i === 9 || i === 12 || i === 20;
      medications.forEach((med) => {
        med.schedule.forEach((dose) => {
          const id = `${med.id}|${dose.time}`;
          let taken = true;
          if (skipped && dose.time === '20:00') taken = false;
          if (i === 9 && med.id === 'demo_med_1') taken = false;
          if (i === 12 && med.id === 'demo_med_2') taken = false;
          if (i === 0 && dose.time === '20:00') taken = false;
          if (taken) dayLogs[id] = { at: `${key}T${dose.time}:00` };
        });
      });
      medLogs[key] = dayLogs;
    }

    const prepItems = [
      { id: 'p1', text: '挂号 · 内分泌科普通门诊', done: true },
      { id: 'p2', text: '空腹抽血（前一晚清淡饮食）', done: false },
      { id: 'p3', text: '带上近 3 个月化验单和用药清单', done: false },
      { id: 'p4', text: '写下想问医生的问题', done: false }
    ];

    const visits = [
      {
        id: 'demo_visit_next',
        date: future(24),
        time: '09:00',
        type: '内分泌科复查',
        hospital: '市第一人民医院',
        doctor: '陈知远 医生',
        location: '门诊楼 3 层 · 12 诊室',
        purpose: '甲功、肝功与血常规',
        notes: '空腹；如果出现发热、咽痛等不适，不要等到预约日，请提前联系医生。',
        prep: prepItems
      },
      {
        id: 'demo_visit_1', date: ago(34), time: '09:20', type: '内分泌科复诊',
        hospital: '市第一人民医院', doctor: '陈知远 医生',
        location: '门诊楼 3 层', purpose: '甲功三项复查',
        notes: '按医嘱继续当前方案，下一次复查安排在约 6 周后。', prep: []
      },
      {
        id: 'demo_visit_2', date: ago(76), time: '09:00', type: '内分泌科复诊',
        hospital: '市第一人民医院', doctor: '陈知远 医生',
        location: '门诊楼 3 层', purpose: '甲功 + 用药安全监测',
        notes: '化验结果已记录；药物剂量由医生根据结果调整。', prep: []
      },
      {
        id: 'demo_visit_3', date: ago(140), time: '10:00', type: '内分泌科复诊',
        hospital: '市第一人民医院', doctor: '陈知远 医生',
        location: '门诊楼 3 层', purpose: '甲功复查',
        notes: '恢复情况较前稳定。', prep: []
      }
    ];

    return {
      version: APP_VERSION,
      meta: { demo: true, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      profile: {
        name: '林岚',
        sex: '女',
        birthYear: 1994,
        diagnosis: 'Graves 病',
        diagnosedAt: ago(410),
        hospital: '市第一人民医院',
        doctor: '陈知远 医生',
        summaryQuestions: '最近 TSH 连续回升到参考范围内，现阶段治疗目标是什么？\n下次复查还需要做哪些项目？如果出现不适，应该提前就诊吗？'
      },
      settings: { ranges },
      records,
      daily,
      medications,
      medLogs,
      visits
    };
  }

  /* ------------------------------------------------------------------------
     Derived model
     ------------------------------------------------------------------------ */
  function sortedRecords(state, ascending) {
    const list = (state.records || []).slice().sort((a, b) => {
      if (a.date === b.date) return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      return a.date < b.date ? -1 : 1;
    });
    return ascending ? list : list.reverse();
  }

  function latestRecord(state) {
    return sortedRecords(state, false)[0] || null;
  }

  function previousRecord(state, record) {
    if (!record) return null;
    const ascending = sortedRecords(state, true);
    const index = ascending.findIndex((r) => r.id === record.id);
    return index > 0 ? ascending[index - 1] : null;
  }

  function getEntry(record, key) {
    return record && record.panel ? record.panel[key] || null : null;
  }

  function getValue(record, key) {
    const entry = getEntry(record, key);
    return entry && Number.isFinite(Number(entry.value)) ? Number(entry.value) : null;
  }

  function getReference(record, key) {
    const entry = getEntry(record, key);
    const cfg = INDICATORS[key] || {};
    if (!entry) return { low: cfg.low, high: cfg.high };
    return {
      low: Number.isFinite(Number(entry.low)) ? Number(entry.low) : cfg.low,
      high: Number.isFinite(Number(entry.high)) ? Number(entry.high) : cfg.high
    };
  }

  function getStatus(value, low, high) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const v = Number(value);
    if (Number.isFinite(Number(low)) && v < Number(low)) return 'low';
    if (Number.isFinite(Number(high)) && v > Number(high)) return 'high';
    return 'in-range';
  }

  function entryStatus(record, key) {
    const value = getValue(record, key);
    const ref = getReference(record, key);
    return getStatus(value, ref.low, ref.high);
  }

  function statusCopy(status, indicatorKey) {
    const cfg = INDICATORS[indicatorKey] || {};
    if (status === 'high') return cfg.antibody ? '高于参考' : '偏高';
    if (status === 'low') return '偏低';
    if (status === 'in-range') return '参考内';
    return '未填';
  }

  function statusTone(status) {
    if (status === 'high') return 'high';
    if (status === 'low') return 'low';
    if (status === 'in-range') return 'ok';
    return 'muted';
  }

  function seriesFor(state, key, rangeDays) {
    const records = sortedRecords(state, true);
    let cutoff = null;
    if (rangeDays && Number(rangeDays) > 0) cutoff = dateKey(addDays(todayKey(), -rangeDays));
    return records
      .filter((r) => getValue(r, key) !== null && (!cutoff || r.date >= cutoff))
      .map((r) => ({
        date: r.date,
        value: getValue(r, key),
        recordId: r.id,
        low: getReference(r, key).low,
        high: getReference(r, key).high,
        status: entryStatus(r, key)
      }));
  }

  function recordsWithIndicator(state, key) {
    return sortedRecords(state, false).filter((r) => getValue(r, key) !== null);
  }

  function latestDaily(state, date) {
    const key = date || todayKey();
    const matches = (state.daily || []).filter((d) => d.date === key)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return matches[0] || null;
  }

  function dailySeries(state, field, limit) {
    return (state.daily || [])
      .filter((d) => Number.isFinite(Number(d[field])))
      .slice()
      .sort((a, b) => a.date < b.date ? -1 : 1)
      .slice(-(limit || 30))
      .map((d) => ({ date: d.date, value: Number(d[field]) }));
  }

  /**
   * A medication counts for a given date if it had started, and either:
   * - is still active; or
   * - was stopped later than that date (so historical adherence remains valid).
   */
  function medicationAppliesOn(med, key) {
    if (med.startDate && key < med.startDate) return false;
    if (med.active === false) {
      if (!med.endDate) return false;
      if (key >= med.endDate) return false;
    }
    return true;
  }

  function dosesForDate(state, key) {
    const doses = [];
    (state.medications || []).filter((med) => medicationAppliesOn(med, key) && Array.isArray(med.schedule) && med.schedule.length > 0).forEach((med) => {
      med.schedule.forEach((dose) => {
        const logKey = `${med.id}|${dose.time}`;
        const logged = Boolean(state.medLogs && state.medLogs[key] && state.medLogs[key][logKey]);
        doses.push({
          key: logKey,
          medId: med.id,
          medName: med.name,
          time: dose.time,
          amount: dose.amount || med.amount || '',
          instruction: med.instruction || '',
          category: med.category || '',
          taken: logged
        });
      });
    });
    return doses.sort((a, b) => a.time.localeCompare(b.time));
  }

  function isDoseDue(dose, key) {
    if (key < todayKey()) return true;
    if (key > todayKey()) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [hours, minutes] = String(dose.time || '').split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return true;
    return hours * 60 + minutes <= currentMinutes;
  }

  function dueDosesForDate(state, key) {
    return dosesForDate(state, key).filter((dose) => isDoseDue(dose, key));
  }

  function adherence(state, days) {
    const span = days || 14;
    const today = todayKey();
    let scheduled = 0;
    let taken = 0;
    let loggedDays = 0;
    const earliest = (state.medications || []).reduce((min, med) => {
      if (!med.startDate) return min;
      return !min || med.startDate < min ? med.startDate : min;
    }, null);
    if (!earliest) return { rate: null, taken: 0, scheduled: 0, days: span, loggedDays: 0 };
    for (let i = span - 1; i >= 0; i -= 1) {
      const key = dateKey(addDays(today, -i));
      if (key < earliest) continue;
      const doses = dueDosesForDate(state, key);
      if (!doses.length) continue;
      if (state.medLogs && state.medLogs[key] && doses.some((dose) => dose.taken)) loggedDays += 1;
      doses.forEach((dose) => {
        scheduled += 1;
        if (dose.taken) taken += 1;
      });
    }
    if (!scheduled || !loggedDays) return { rate: null, taken, scheduled, days: span, loggedDays };
    return { rate: Math.round((taken / scheduled) * 100), taken, scheduled, days: span, loggedDays };
  }

  function medLogSeries(state, days) {
    const span = days || 14;
    const today = todayKey();
    const output = [];
    for (let i = span - 1; i >= 0; i -= 1) {
      const key = dateKey(addDays(today, -i));
      const doses = dueDosesForDate(state, key);
      const taken = doses.filter((d) => d.taken).length;
      output.push({
        date: key,
        scheduled: doses.length,
        taken,
        rate: doses.length ? Math.round((taken / doses.length) * 100) : null
      });
    }
    return output;
  }

  function upcomingVisits(state) {
    const today = todayKey();
    return (state.visits || [])
      .filter((v) => v.date >= today)
      .sort((a, b) => {
        if (a.date === b.date) return String(a.time || '').localeCompare(String(b.time || ''));
        return a.date.localeCompare(b.date);
      });
  }

  function upcomingVisit(state) {
    return upcomingVisits(state)[0] || null;
  }

  function pastVisits(state) {
    const today = todayKey();
    return (state.visits || []).filter((v) => v.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function age(profile) {
    if (!profile || !profile.birthYear) return null;
    const birthYear = Number(profile.birthYear);
    if (!Number.isFinite(birthYear) || birthYear < 1900) return null;
    return new Date().getFullYear() - birthYear;
  }

  function corePanelSummary(record) {
    if (!record) return { total: 0, inRange: 0, out: 0 };
    let total = 0;
    let inRange = 0;
    PRIMARY_INDICATORS.forEach((key) => {
      if (!getEntry(record, key)) return;
      total += 1;
      if (entryStatus(record, key) === 'in-range') inRange += 1;
    });
    return { total, inRange, out: total - inRange };
  }

  function recentFlags(state, days) {
    const span = days || 14;
    const cutoff = dateKey(addDays(todayKey(), -span));
    const found = [];
    (state.daily || []).forEach((entry) => {
      if (entry.date < cutoff) return;
      (entry.flags || []).forEach((flagKey) => {
        const flag = FLAGS.find((f) => f.key === flagKey);
        if (flag) found.push({ key: flag.key, name: flag.name, date: entry.date, hint: flag.hint });
      });
    });
    return found;
  }

  /**
   * Produce cautious, rule-based observations for display. These are not diagnoses.
   * Priority: safety > care gap > trend > education.
   */
  function buildSignals(state, limit) {
    const signals = [];
    const latest = latestRecord(state);
    const today = todayKey();

    // Safety flags from daily logs.
    const flags = recentFlags(state, 14);
    if (flags.length) {
      const unique = [...new Map(flags.map((f) => [f.name, f])).values()];
      signals.push({
        tone: 'danger', kind: 'safety-flag',
        title: '近期记录到需要尽快关注的情况',
        text: `你记录过「${unique.map((f) => f.name).join('、')}」。如正在服用抗甲状腺药物，请尽快联系医生或前往急诊，并告知用药情况；是否调整用药请遵医嘱。`,
        action: '了解安全信号', route: 'learn'
      });
    }

    // Safety labs are looked up per indicator, so a newer TSH-only record does
    // not hide an earlier abnormal blood count or liver result.
    const recentSafety = {};
    ['WBC', 'ANC', 'ALT', 'AST'].forEach((key) => {
      const record = recordsWithIndicator(state, key)[0];
      if (!record) return;
      const age = daysBetween(record.date, today);
      if (age === null || age > 120) return;
      recentSafety[key] = {
        record,
        value: getValue(record, key),
        reference: getReference(record, key)
      };
    });
    const lowBloodKeys = ['WBC', 'ANC'].filter((key) => {
      const item = recentSafety[key];
      return item && item.value !== null && item.value < item.reference.low;
    });
    const highLiverKeys = ['ALT', 'AST'].filter((key) => {
      const item = recentSafety[key];
      return item && item.value !== null && item.value > item.reference.high * 3;
    });
    if (lowBloodKeys.length || highLiverKeys.length) {
      const parts = [];
      if (lowBloodKeys.length) {
        parts.push(`血常规：${lowBloodKeys.map((key) => `${key} ${formatNumber(recentSafety[key].value, key)} ${INDICATORS[key].unit}（${formatMonthDay(recentSafety[key].record.date)}）`).join('、')} 低于参考范围`);
      }
      if (highLiverKeys.length) {
        parts.push(`肝酶：${highLiverKeys.map((key) => `${key} ${formatNumber(recentSafety[key].value, key)} ${INDICATORS[key].unit}（${formatMonthDay(recentSafety[key].record.date)}）`).join('、')} 明显高于参考上限`);
      }
      signals.push({
        tone: 'danger', kind: 'safety-lab',
        title: '最近的用药安全指标需要尽快关注',
        text: `按你录入的参考范围，${parts.join('；')}。若正在服用抗甲状腺药物，请尽快联系医生并按医嘱复查；不要自行调整或停用药物。`,
        action: '查看检查记录', route: 'records'
      });
    } else {
      const onATD = (state.medications || []).some((med) => med.active !== false && med.category === '抗甲状腺药');
      const hasRecentSafety = Object.keys(recentSafety).length > 0;
      if (onATD && !hasRecentSafety) {
        signals.push({
          tone: 'info', kind: 'safety-gap',
          title: '用药安全指标可以顺便记录',
          text: '正在服用抗甲状腺药物时，医生可能会安排血常规和肝功能监测。复查后可以在「检查记录」中一起录入，方便下次就诊时回看。',
          action: '了解监测要点', route: 'learn'
        });
      }
    }

    // Upcoming / overdue follow-up.
    const visit = upcomingVisit(state);
    if (visit) {
      const diff = daysBetween(today, visit.date);
      if (diff !== null && diff <= 7) {
        signals.push({
          tone: 'info', kind: 'visit',
          title: diff === 0 ? '今天是复查日' : `还有 ${diff} 天复查`,
          text: `${formatMonthDay(visit.date)} ${visit.type || '复查'} · ${visit.hospital || '医院待补充'}。如有空腹抽血等项目，记得提前准备。`,
          action: '查看复查准备', route: 'visits'
        });
      }
    } else {
      const nextPast = (state.visits || []).filter((v) => v.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (nextPast && daysBetween(nextPast.date, today) > 30) {
        signals.push({
          tone: 'watch', kind: 'visit-overdue',
          title: '没有记录到下一次复查安排',
          text: '复查间隔应由医生根据病情与治疗阶段决定。如果已经很久没有复查，可以联系医生确认下一次时间。',
          action: '安排复查', route: 'visits'
        });
      }
    }

    // Most recent panel observation.
    if (latest) {
      const summary = corePanelSummary(latest);
      if (summary.total) {
        if (summary.out === 0) {
          signals.push({
            tone: 'good', kind: 'panel',
            title: '最近一次甲功三项都在参考范围内',
            text: '这是基于化验单参考范围的数值观察，不等同于治疗目标已经达成。请按医生安排的节奏复查，不要自行调整药物。',
            action: '查看趋势', route: 'trends'
          });
        } else {
          const labels = [];
          PRIMARY_INDICATORS.forEach((key) => {
            const status = entryStatus(latest, key);
            if (status && status !== 'in-range') labels.push(`${key} ${statusCopy(status, key)}`);
          });
          signals.push({
            tone: 'watch', kind: 'panel',
            title: `最近一次甲功有 ${summary.out} 项偏离参考范围`,
            text: `${labels.join('、')}。单次结果可能受检查时间、药物与身体状况影响，是否调整治疗请以医生判断为准。`,
            action: '查看完整趋势', route: 'trends'
          });
        }
      }
    }

    // TSH direction over the last three records.
    const tshSeries = seriesFor(state, 'TSH', 0);
    if (tshSeries.length >= 3) {
      const lastThree = tshSeries.slice(-3);
      const asc = lastThree[0].value < lastThree[1].value && lastThree[1].value < lastThree[2].value;
      const desc = lastThree[0].value > lastThree[1].value && lastThree[1].value > lastThree[2].value;
      if (asc) {
        signals.push({
          tone: 'info', kind: 'tsh-trend',
          title: 'TSH 连续三次呈回升趋势',
          text: `当前为 ${formatNumber(lastThree[2].value, 'TSH')} ${INDICATORS.TSH.unit}。TSH 的变化通常较慢，趋势仅供复诊沟通参考，不能作为自行调药的依据。`,
          action: '打开指标趋势', route: 'trends'
        });
      } else if (desc) {
        signals.push({
          tone: 'info', kind: 'tsh-trend',
          title: 'TSH 连续三次呈下降趋势',
          text: `当前为 ${formatNumber(lastThree[2].value, 'TSH')} ${INDICATORS.TSH.unit}。请结合 FT4、FT3 与医生意见理解变化，不要自行调整药物。`,
          action: '打开指标趋势', route: 'trends'
        });
      }
    }

    // Medication logging.
    const adh = adherence(state, 14);
    if (adh.rate !== null && adh.loggedDays >= 4 && adh.rate < 80) {
      signals.push({
        tone: 'watch', kind: 'medication',
        title: '近 14 天用药打卡率偏低',
        text: `已打卡的服药比例为 ${adh.rate}%（${adh.taken}/${adh.scheduled} 次）。如果确实漏服，请向医生或药师确认如何处理，不要自行补服双倍剂量。`,
        action: '查看用药计划', route: 'medications'
      });
    }

    // Older labs.
    if (latest) {
      const ageDays = daysBetween(latest.date, today);
      if (ageDays !== null && ageDays > 120) {
        signals.push({
          tone: 'info', kind: 'stale',
          title: `距上次化验记录已有 ${ageDays} 天`,
          text: '如果已经到了医生建议的复查时间，可以提前安排。若近期没有任何不适，也不必因为这条提醒焦虑。',
          action: '记录新化验', route: 'records'
        });
      }
    }

    if (!signals.length) {
      signals.push({
        tone: 'good', kind: 'empty',
        title: '从一条记录开始',
        text: '录入最近一次甲功结果，或完成一次每日状态打卡。随着记录增多，这里会逐步呈现只属于你的趋势线索。',
        action: '记录化验', route: 'records'
      });
    }

    // Keep safety/alert first, then the rest.
    const priority = { danger: 0, watch: 1, info: 2, good: 3 };
    return signals.sort((a, b) => (priority[a.tone] ?? 9) - (priority[b.tone] ?? 9)).slice(0, limit || 3);
  }

  function estimateBytes(value) {
    try { return new Blob([JSON.stringify(value)]).size; }
    catch (error) { return JSON.stringify(value || '').length; }
  }

  function validateImportedState(raw) {
    if (!isPlainObject(raw)) return { ok: false, message: '文件内容不是有效的数据格式。' };
    if (!Array.isArray(raw.records) || !Array.isArray(raw.daily) || !Array.isArray(raw.medications)) {
      return { ok: false, message: '缺少必要的记录字段，可能不是蝶迹的备份文件。' };
    }
    if (!isPlainObject(raw.profile)) {
      return { ok: false, message: '备份中缺少个人档案信息。' };
    }
    const normalized = normalizeState(raw);
    if (!normalized) return { ok: false, message: '备份数据无法读取。' };
    if (raw.records.length > 0 && normalized.records.length === 0) {
      return { ok: false, message: '备份中的检查记录格式无法识别，未导入任何数据。' };
    }
    return { ok: true };
  }

  JK.const = {
    APP_VERSION, STORAGE_KEY,
    INDICATORS, INDICATOR_ORDER, PRIMARY_INDICATORS, OPTIONAL_GROUPS,
    SYMPTOMS, FLAGS, FEELINGS, SEVERITY, MED_CATEGORIES
  };

  JK.utils = {
    pad, dateKey, todayKey, fromDateKey, isValidDateKey, addDays, daysBetween,
    formatDate, formatMonthDay, weekdayCN, englishMonth,
    formatNumber, formatRange, uid, clamp, estimateBytes
  };

  JK.data = {
    createEmptyState, normalizeState, buildDemoState, loadState, saveState,
    getLoadStateIssue, getRecoveryRaw, clearRecovery, defaultRanges, validateImportedState
  };

  JK.model = {
    sortedRecords, latestRecord, previousRecord, getEntry, getValue, getReference,
    getStatus, entryStatus, statusCopy, statusTone, seriesFor, recordsWithIndicator,
    latestDaily, dailySeries, dosesForDate, adherence, medLogSeries, upcomingVisit,
    upcomingVisits, pastVisits, age, corePanelSummary, recentFlags, buildSignals
  };
})();
