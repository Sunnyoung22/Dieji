/* ==========================================================================
   蝶迹 · app.js
   UI, routing, forms and interactions. Built as a small dependency-free SPA.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.JK.const;
  const U = window.JK.utils;
  const M = window.JK.model;
  const INDICATORS = C.INDICATORS;
  const INDICATOR_ORDER = C.INDICATOR_ORDER;
  const PRIMARY_INDICATORS = C.PRIMARY_INDICATORS;
  const SYMPTOMS = C.SYMPTOMS;
  const FLAGS = C.FLAGS;
  const FEELINGS = C.FEELINGS;
  const SEVERITY = C.SEVERITY;
  const MED_CATEGORIES = C.MED_CATEGORIES;

  /* ------------------------------------------------------------------------
     App state
     ------------------------------------------------------------------------ */
  let state = JK.data.loadState();
  const initialLoadIssue = JK.data.getLoadStateIssue();
  let storageOK = true;
  try {
    const probe = '__jkc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch (error) {
    storageOK = false;
  }

  if (!state) {
    state = JK.data.buildDemoState();
    // Do not overwrite a parser-recoverable raw record before the user has had
    // a chance to preserve it from Settings.
    if (storageOK && !(initialLoadIssue && initialLoadIssue.type === 'corrupt')) {
      JK.data.saveState(state);
    }
  }

  let currentRoute = '';
  let recordFilters = { query: '', onlyAbnormal: false };
  let trendState = { indicator: 'TSH', days: 365 };
  let chartInstances = [];
  let chartAnimationDisabled = false;
  let modalStack = [];
  let toastTimer = null;

  const appEl = document.getElementById('app');
  const modalRoot = document.getElementById('modalRoot');
  const toastRegion = document.getElementById('toastRegion');
  const demoBanner = document.getElementById('demoBanner');
  const storageIssueBanner = document.getElementById('storageIssueBanner');

  /* ------------------------------------------------------------------------
     Generic helpers
     ------------------------------------------------------------------------ */
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
  }

  function icon(name, extraClass) {
    return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  function nl2br(value) {
    return esc(value).replace(/\n/g, '<br>');
  }

  function isDemo() { return Boolean(state.meta && state.meta.demo); }

  function todayKey() { return U.todayKey(); }

  function persist(quiet) {
    const ok = JK.data.saveState(state);
    if (!ok && !quiet) {
      storageOK = false;
      showToast('浏览器阻止了本地存储，关闭页面后新数据可能会丢失。请先导出备份。', 'warning', 7000);
    }
    updateChrome();
    return ok;
  }

  function pageDateLabel(key) {
    if (!key) return '—';
    const currentYear = new Date().getFullYear();
    const parsed = U.fromDateKey(key);
    return U.formatDate(key, { year: parsed && parsed.getFullYear() !== currentYear });
  }

  function dateWithWeekday(key) {
    return `${pageDateLabel(key)} · ${U.weekdayCN(key)}`;
  }

  function relativeDate(key) {
    if (!key) return '';
    const diff = U.daysBetween(key, todayKey());
    if (diff === null) return '';
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff > 1 && diff < 30) return `${diff} 天前`;
    return pageDateLabel(key);
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 13) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function initials(name) {
    if (!name) return '甲';
    const trimmed = String(name).trim();
    if (!trimmed) return '甲';
    return trimmed.slice(0, 1).toUpperCase();
  }

  function statusPill(status, indicatorKey, extraClass) {
    const tone = M.statusTone(status);
    const label = M.statusCopy(status, indicatorKey);
    return `<span class="status-badge status-${tone}${extraClass ? ' ' + extraClass : ''}"><span class="status-dot"></span>${esc(label)}</span>`;
  }

  function toneForStatus(status) { return M.statusTone(status); }

  function coreResultPill(summary, detailed) {
    if (!summary || !summary.total) return '<span class="result-pill neutral">无核心指标</span>';
    if (summary.out > 0) {
      return `<span class="result-pill watch">${summary.out} 项${detailed ? '核心指标' : ''}偏离</span>`;
    }
    return '<span class="result-pill good">核心指标参考内</span>';
  }

  function deltaMarkup(indicatorKey, latestValue, previousValue, unit) {
    if (latestValue === null || latestValue === undefined) return '<span class="delta-empty">—</span>';
    if (previousValue === null || previousValue === undefined) return '<span class="delta-empty">首次记录</span>';
    const diff = Number(latestValue) - Number(previousValue);
    if (Math.abs(diff) < 0.0000001) return '<span class="delta-empty">与上次持平</span>';
    const direction = diff > 0 ? '↑' : '↓';
    const valueText = U.formatNumber(Math.abs(diff), indicatorKey);
    return `<span class="delta-value"><span class="delta-arrow">${direction}</span>${valueText}${unit ? `<span class="delta-unit">${esc(unit)}</span>` : ''}<span class="delta-label">较上次</span></span>`;
  }

  function button(action, label, options) {
    const opts = options || {};
    const cls = `btn ${opts.variant ? 'btn-' + opts.variant : 'btn-secondary'}${opts.size ? ' btn-' + opts.size : ''}${opts.className ? ' ' + opts.className : ''}`;
    const attrs = [
      `type="${opts.type || 'button'}"`,
      `class="${cls}"`,
      action ? `data-action="${esc(action)}"` : '',
      opts.id ? `data-id="${esc(opts.id)}"` : '',
      opts.ariaLabel ? `aria-label="${esc(opts.ariaLabel)}"` : '',
      opts.attrs || ''
    ].filter(Boolean).join(' ');
    return `<button ${attrs}>${opts.icon ? icon(opts.icon) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  }

  function emptyBlock(options) {
    const opts = options || {};
    return `
      <div class="empty-block${opts.compact ? ' empty-block-compact' : ''}">
        <span class="empty-icon">${icon(opts.icon || 'sparkles')}</span>
        <h3>${esc(opts.title || '还没有记录')}</h3>
        ${opts.text ? `<p>${opts.text}</p>` : ''}
        ${opts.action || ''}
      </div>`;
  }

  function pageHead(options) {
    return `
      <header class="page-head">
        <div class="page-head-copy">
          ${options.eyebrow ? `<p class="eyebrow"><span class="eyebrow-mark"></span>${options.eyebrow}</p>` : ''}
          <h1>${options.title}</h1>
          ${options.subtitle ? `<p class="page-subtitle">${options.subtitle}</p>` : ''}
        </div>
        ${options.actions ? `<div class="page-actions">${options.actions}</div>` : ''}
      </header>`;
  }

  function cardHeader(title, subtitle, actionMarkup, iconName) {
    return `
      <header class="card-heading">
        <div class="card-heading-copy">
          <div class="card-title-line">${iconName ? `<span class="card-title-icon">${icon(iconName)}</span>` : ''}<h2>${title}</h2>${subtitle ? `<span class="card-subtitle">${subtitle}</span>` : ''}</div>
        </div>
        ${actionMarkup ? `<div class="card-heading-action">${actionMarkup}</div>` : ''}
      </header>`;
  }

  /* ------------------------------------------------------------------------
     Chrome: sidebar, demo state, active navigation
     ------------------------------------------------------------------------ */
  const ROUTE_META = {
    overview: { title: '总览', documentTitle: '蝶迹 · 把甲功变化看得更明白' },
    trends: { title: '指标趋势' },
    records: { title: '检查记录' },
    medications: { title: '用药与安全' },
    visits: { title: '复查与就诊' },
    learn: { title: '健康知识' },
    settings: { title: '个人与设置' },
    summary: { title: '就诊摘要' }
  };

  function updateChrome() {
    const profile = state.profile || {};
    const displayName = profile.name || '我的档案';
    const diagnosis = profile.diagnosis || '还没有填写诊断';
    const sidebarName = document.getElementById('sidebarName');
    const sidebarDiagnosis = document.getElementById('sidebarDiagnosis');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarDiagnosis) sidebarDiagnosis.textContent = diagnosis;
    if (sidebarAvatar) sidebarAvatar.textContent = initials(profile.name);

    const demo = isDemo();
    ['sidebarDemoTag', 'mobileDemoTag'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = !demo;
    });
    if (demoBanner) demoBanner.hidden = !demo;
    if (storageIssueBanner) {
      const hasCorruptIssue = Boolean(initialLoadIssue && initialLoadIssue.type === 'corrupt');
      storageIssueBanner.hidden = !hasCorruptIssue;
      if (hasCorruptIssue) {
        const copy = storageIssueBanner.querySelector('[data-storage-issue-copy]');
        if (copy) {
          copy.textContent = initialLoadIssue.recoverySaved
            ? '本地记录读取失败。原始内容已在「个人与设置」中保留，可下载恢复副本后再继续录入。'
            : '本地记录读取失败，且浏览器未能保留原始副本。建议先导出当前可见数据，再继续。';
        }
      }
    }

    document.querySelectorAll('[data-nav]').forEach((link) => {
      const nav = link.getAttribute('data-nav');
      let active = nav === currentRoute;
      if (nav === 'visits' && currentRoute === 'summary') active = true;
      if (link.closest('.mobile-nav')) {
        if (nav === 'more' && ['visits', 'learn', 'settings', 'summary'].includes(currentRoute)) active = true;
      }
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    const routeMeta = ROUTE_META[currentRoute] || ROUTE_META.overview;
    document.title = routeMeta.documentTitle || `蝶迹 · ${routeMeta.title}`;
  }

  /* ------------------------------------------------------------------------
     Charters
     ------------------------------------------------------------------------ */
  function mountChart(container, config) {
    if (!container) return null;
    const chart = JK.charts.mountLineChart(container, config);
    if (chart) chartInstances.push(chart);
    return chart;
  }

  function cleanupCharts() {
    chartInstances.forEach((chart) => {
      try { chart.destroy(); } catch (error) { /* already removed */ }
    });
    chartInstances = [];
  }

  function chartHeight(full) {
    if (window.innerWidth < 640) return full ? 270 : 190;
    return full ? 345 : 205;
  }

  /* ------------------------------------------------------------------------
     OVERVIEW PAGE
     ------------------------------------------------------------------------ */
  function renderOverview() {
    const latest = M.latestRecord(state);
    const name = state.profile.name ? `，${esc(state.profile.name)}` : '';
    const subtitle = latest
      ? '把每一次复查连成线，也把每天的感受照顾好。'
      : '从第一条甲功记录开始，慢慢看清身体的变化。';
    const head = pageHead({
      eyebrow: `${U.formatDate(todayKey(), { year: true })} · ${U.weekdayCN(todayKey())}`,
      title: `${greeting()}${name}`,
      subtitle,
      actions: `
        ${button('new-daily', '记录状态', { variant: 'secondary', icon: 'activity' })}
        ${button('new-lab', '记录化验', { variant: 'primary', icon: 'plus' })}
      `
    });

    return `
      <div class="page overview-page">
        ${head}
        <div class="dashboard-grid">
          ${renderHero(latest)}
          ${renderNextVisitWidget()}
          ${renderMedsWidget()}
          ${renderDailyWidget()}
          ${renderInsightsWidget()}
          ${renderRecentRecords()}
        </div>
      </div>`;
  }

  function renderHero(latest) {
    if (!latest) {
      return `
        <section class="hero-card hero-card-empty">
          <div class="hero-orbit hero-orbit-one"></div>
          <div class="hero-orbit hero-orbit-two"></div>
          <div class="hero-empty-content">
            <span class="hero-kicker"><span class="halo-dot"></span> 还没有甲功记录</span>
            <h2>把第一次化验，<br>留在这里。</h2>
            <p>录入 TSH、FT4、FT3 和化验单参考范围，下一次复查时就能直接看到变化。</p>
            <button type="button" class="btn btn-light" data-action="new-lab">${icon('plus')}记录第一次化验</button>
          </div>
          <div class="hero-empty-art" aria-hidden="true">
            <svg viewBox="0 0 240 190" fill="none">
              <path d="M24 144C48 102 63 75 91 79c33 5 27 51 54 50 22-1 31-22 67-46" stroke="rgba(202,233,219,.35)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <circle cx="91" cy="79" r="5" fill="#b7daca"/>
              <circle cx="145" cy="129" r="5" fill="#e0a98f"/>
              <circle cx="212" cy="83" r="5" fill="#b7daca"/>
              <rect x="39" y="28" width="154" height="1" fill="rgba(255,255,255,.08)"/>
              <rect x="39" y="156" width="154" height="1" fill="rgba(255,255,255,.12)"/>
            </svg>
          </div>
        </section>`;
    }

    const available = INDICATOR_ORDER.filter((key) => INDICATORS[key] && M.getValue(latest, key) !== null);
    const liveKey = PRIMARY_INDICATORS.find((key) => available.includes(key)) || available[0];
    if (!liveKey) {
      return renderHero(null);
    }
    const meta = INDICATORS[liveKey];
    const value = M.getValue(latest, liveKey);
    const status = M.entryStatus(latest, liveKey);
    const ref = M.getReference(latest, liveKey);
    const previous = M.previousRecord(state, latest);
    const previousValue = previous ? M.getValue(previous, liveKey) : null;
    const summary = M.corePanelSummary(latest);
    const summaryTone = summary.out > 0 ? 'watch' : 'good';
    const subKeys = PRIMARY_INDICATORS.filter((key) => key !== liveKey && M.getEntry(latest, key));
    const series = M.seriesFor(state, liveKey, 183);
    const headerHospital = latest.hospital || '未填写医院';
    const periodsText = series.length > 1 ? '近 6 个月' : '本期记录';

    return `
      <section class="hero-card hero-card-live" aria-label="最近一次甲功">
        <div class="hero-orbit hero-orbit-one"></div>
        <div class="hero-orbit hero-orbit-two"></div>
        <header class="hero-head">
          <div>
            <span class="hero-kicker"><span class="halo-dot"></span> 最近一次甲功</span>
            <p class="hero-meta">${esc(pageDateLabel(latest.date))} · ${esc(headerHospital)}</p>
          </div>
          <span class="hero-panel-pill ${summaryTone}">${summary.total ? `核心 ${summary.inRange}/${summary.total} 参考内` : '记录已保存'}</span>
        </header>
        <div class="hero-grid">
          <div class="hero-primary">
            <div class="hero-metric-label">
              <span class="hero-abbr">${liveKey}</span>
              <span>${esc(meta.name)}</span>
            </div>
            <div class="hero-reading">
              <strong>${U.formatNumber(value, liveKey)}</strong>
              <span>${esc(meta.unit)}</span>
            </div>
            <div class="hero-status-line">
              ${statusPill(status, liveKey, 'status-on-dark')}
              <span class="hero-ref">参考 ${U.formatRange(ref.low, ref.high, liveKey)}</span>
            </div>
            <div class="hero-delta">${deltaMarkup(liveKey, value, previousValue, meta.unit)}</div>
            <div class="hero-submetrics">
              ${subKeys.map((key) => {
                const subMeta = INDICATORS[key];
                const subValue = M.getValue(latest, key);
                const subStatus = M.entryStatus(latest, key);
                return `
                  <div class="hero-submetric">
                    <span class="hero-submetric-label">${key} <span class="dot-art ${toneForStatus(subStatus)}"></span></span>
                    <strong>${U.formatNumber(subValue, key)}<small>${esc(subMeta.unit)}</small></strong>
                  </div>`;
              }).join('')}
            </div>
          </div>
          <div class="hero-visual">
            <div class="hero-chart-caption">
              <span>${periodsText} · ${liveKey}</span>
              <span>${series.length} 次记录</span>
            </div>
            <div class="hero-chart" id="heroTrendChart" data-indicator="${liveKey}"></div>
            <div class="hero-chart-foot">
              <span>参考范围 ${U.formatRange(ref.low, ref.high, liveKey)}</span>
              <span>${series.length > 1 ? '最近一次已在图中标记' : '等待下一次记录'}</span>
            </div>
          </div>
        </div>
        <footer class="hero-footer">
          <span class="hero-footnote"><span class="hero-footnote-line"></span>${esc(latest.note ? latest.note : '参考范围来自你录入的化验单，治疗目标请以医生意见为准。')}</span>
          <a class="hero-link" href="#/trends">查看完整趋势 ${icon('arrow-right')}</a>
        </footer>
      </section>`;
  }

  function renderNextVisitWidget() {
    const visit = M.upcomingVisit(state);
    if (!visit) {
      return `
        <section class="card visit-card visit-card-empty">
          ${cardHeader('下一次复查', '', `<a class="mini-link" href="#/visits">管理</a>`, 'calendar')}
          ${emptyBlock({
            icon: 'calendar',
            title: '还没有安排复查',
            text: '把下一次复诊记下来，提前准备，心里更有底。',
            compact: true,
            action: button('new-visit', '安排复查', { variant: 'secondary', size: 'sm', icon: 'plus' })
          })}
        </section>`;
    }
    const days = U.daysBetween(todayKey(), visit.date);
    const prep = Array.isArray(visit.prep) ? visit.prep : [];
    const done = prep.filter((item) => item.done).length;
    const progress = prep.length ? Math.round((done / prep.length) * 100) : 0;
    const shownPrep = prep.slice(0, 3);
    const timeText = visit.time ? ` · ${visit.time}` : '';
    const countdown = days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天`;
    const monthLabel = U.englishMonth(visit.date);
    const dayNumber = U.fromDateKey(visit.date).getDate();

    return `
      <section class="card visit-card">
        ${cardHeader('下一次复查', '', `<a class="mini-link" href="#/visits">详情 ${icon('chevron-right')}</a>`, 'calendar')}
        <div class="visit-top">
          <div class="visit-date-block">
            <span class="visit-month">${monthLabel}</span>
            <strong>${dayNumber}</strong>
            <span class="visit-weekday">${U.weekdayCN(visit.date)}${timeText}</span>
          </div>
          <div class="visit-summary">
            <span class="visit-countdown"><span class="countdown-dot"></span>${days < 0 ? '日期已过' : days === 0 ? '就是今天' : `还有 ${countdown}`}</span>
            <h3>${esc(visit.type || '内分泌科复查')}</h3>
            <p>${esc(visit.hospital || '医院待补充')}${visit.doctor ? `<span class="dot-divider">·</span>${esc(visit.doctor)}` : ''}</p>
            ${visit.location ? `<p class="visit-location">${icon('clock')}${esc(visit.location)}</p>` : ''}
          </div>
        </div>
        ${prep.length ? `
          <div class="prep-block">
            <div class="prep-head">
              <span>复查准备</span>
              <span>${done}/${prep.length}</span>
            </div>
            <div class="prep-progress"><span style="width:${progress}%"></span></div>
            <div class="prep-mini-list">
              ${shownPrep.map((item) => `
                <button type="button" class="prep-mini ${item.done ? 'is-done' : ''}" data-action="toggle-prep" data-visit-id="${esc(visit.id)}" data-prep-id="${esc(item.id)}" aria-pressed="${Boolean(item.done)}">
                  <span class="prep-check">${icon('check')}</span><span>${esc(item.text)}</span>
                </button>`).join('')}
            </div>
          </div>` : ''}
        <div class="visit-card-foot">
          <span>${visit.purpose ? esc(visit.purpose) : '按医嘱准备复查项目'}</span>
          <a class="inline-link" href="#/visits">复查计划 ${icon('arrow-right')}</a>
        </div>
      </section>`;
  }

  function renderMedsWidget() {
    const doses = M.dosesForDate(state, todayKey());
    if (!doses.length) {
      return `
        <section class="card med-widget">
          ${cardHeader('今日用药', '', `<a class="mini-link" href="#/medications">管理</a>`, 'pill')}
          ${emptyBlock({
            icon: 'pill',
            title: '还没有记录用药',
            text: '把医生开具的药物记录下来，方便回看和打卡。',
            compact: true,
            action: button('new-med', '添加药物', { variant: 'secondary', size: 'sm', icon: 'plus' })
          })}
        </section>`;
    }
    const taken = doses.filter((dose) => dose.taken).length;
    const total = doses.length;
    const pct = total ? Math.round((taken / total) * 100) : 0;
    const allDone = taken === total;
    const nextDose = doses.find((dose) => !dose.taken);

    return `
      <section class="card med-widget">
        ${cardHeader('今日用药', '', `<a class="mini-link" href="#/medications">管理</a>`, 'pill')}
        <div class="med-progress-row">
          <div class="progress-ring" style="--progress:${pct}">
            <div class="progress-ring-inner"><strong>${taken}</strong><span>/${total}</span></div>
          </div>
          <div class="med-progress-copy">
            <strong>${allDone ? '今天的用药已打卡' : '按时服药，慢慢变好'}</strong>
            <p>${allDone ? '记录完整，继续保持。' : nextDose ? `待记录：${nextDose.time} · ${esc(nextDose.medName)}` : '按医嘱完成今天的药物。'}</p>
          </div>
        </div>
        <div class="dose-list dose-list-compact">
          ${doses.slice(0, 3).map((dose) => `
            <div class="dose-row ${dose.taken ? 'is-taken' : ''}">
              <button type="button" class="dose-check" data-action="toggle-dose" data-dose-key="${esc(dose.key)}" aria-label="${dose.taken ? '取消记录' : '记录为已服'} ${esc(dose.medName)} ${esc(dose.time)}" aria-pressed="${dose.taken}">
                ${icon('check')}
              </button>
              <div class="dose-copy">
                <strong>${esc(dose.medName)}</strong>
                <span>${esc(dose.time)}${dose.amount ? ` · ${esc(dose.amount)}` : ''}</span>
              </div>
              <span class="dose-state">${dose.taken ? '已服' : '待服'}</span>
            </div>`).join('')}
        </div>
        ${doses.length > 3 ? `<p class="med-more-note">还有 ${doses.length - 3} 次用药，请前往用药页查看。</p>` : ''}
        <div class="widget-foot">
          <span class="subtle-note">${icon('lock')}只记录服药情况，不提供剂量建议</span>
          <a class="inline-link" href="#/medications">全部用药 ${icon('arrow-right')}</a>
        </div>
      </section>`;
  }

  function buildHrSpark(days) {
    const series = M.dailySeries(state, 'heartRate', days || 7);
    if (series.length < 2) return '';
    const values = series.map((point) => point.value);
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    const range = Math.max(1, max - min);
    return `
      <div class="hr-spark-wrap" aria-hidden="true">
        <div class="hr-spark">
          ${series.map((point) => {
            const height = 28 + ((point.value - min) / range) * 62;
            return `<span class="hr-spark-bar" style="--h:${height}%" title="${esc(pageDateLabel(point.date))} ${point.value} bpm"><i></i></span>`;
          }).join('')}
        </div>
        <div class="hr-spark-labels"><span>${days || 7} 天前</span><span>今天</span></div>
      </div>`;
  }

  function symptomTags(entry, limit) {
    if (!entry) return '';
    const active = SYMPTOMS
      .map((symptom) => ({ symptom, level: Number(entry.symptoms && entry.symptoms[symptom.key]) || 0 }))
      .filter((item) => item.level > 0)
      .sort((a, b) => b.level - a.level);
    if (!active.length) return '<span class="quiet-tag">今天没有记录明显不适</span>';
    const visible = active.slice(0, limit || 3);
    return visible.map((item) => {
      const level = SEVERITY.find((option) => option.level === item.level);
      return `<span class="symptom-tag severity-${item.level}">${esc(item.symptom.short)}<span>${level ? level.label : '轻'}</span></span>`;
    }).join('')
      + (active.length > visible.length ? `<span class="symptom-more">+${active.length - visible.length}</span>` : '');
  }

  function renderDailyWidget() {
    const entry = M.latestDaily(state);
    const isToday = entry && entry.date === todayKey();
    const head = cardHeader('今日状态', '', `<button type="button" class="mini-link as-button" data-action="new-daily">${isToday ? '更新' : '打卡'}</button>`, 'activity');

    if (!isToday) {
      return `
        <section class="card daily-widget">
          ${head}
          <div class="daily-empty">
            <div class="daily-prompt-icon">${icon('activity')}</div>
            <h3>今天感觉怎么样？</h3>
            <p>花 1 分钟记录心率、体重和身体感受。<br>比单次数字更有价值的，是连续的变化。</p>
            ${button('new-daily', '开始今日打卡', { variant: 'primary', size: 'sm', icon: 'plus' })}
          </div>
          <div class="daily-footer-note">${entry ? `上次记录：${esc(relativeDate(entry.date))}` : '还没有每日状态记录'}</div>
        </section>`;
    }

    const feeling = FEELINGS.find((item) => item.key === entry.feeling);
    const activeFlags = (entry.flags || []).length;
    return `
      <section class="card daily-widget">
        ${head}
        <div class="daily-headline">
          <span class="daily-date">${esc(dateWithWeekday(entry.date))}</span>
          ${feeling ? `<span class="feeling-pill">${esc(feeling.name)}</span>` : ''}
          ${activeFlags ? `<span class="flag-pill">${icon('alert')}${activeFlags} 项安全提示</span>` : ''}
        </div>
        <div class="vitals-row">
          <div class="vital">
            <span class="vital-icon">${icon('heart')}</span>
            <div><strong>${entry.heartRate ? entry.heartRate : '—'}<small>${entry.heartRate ? ' bpm' : ''}</small></strong><span>静息心率</span></div>
          </div>
          <div class="vital">
            <span class="vital-icon">${icon('scale')}</span>
            <div><strong>${entry.weight ? entry.weight : '—'}<small>${entry.weight ? ' kg' : ''}</small></strong><span>体重</span></div>
          </div>
          <div class="vital">
            <span class="vital-icon">${icon('moon')}</span>
            <div><strong>${entry.sleepHours || entry.sleepHours === 0 ? entry.sleepHours : '—'}<small>${entry.sleepHours ? ' h' : ''}</small></strong><span>睡眠</span></div>
          </div>
        </div>
        ${buildHrSpark(7)}
        <div class="symptom-row-label">身体感受</div>
        <div class="symptom-tags">${symptomTags(entry, 3)}</div>
        <div class="widget-foot daily-widget-foot">
          <button type="button" class="text-button" data-action="new-daily">更新今日状态 ${icon('arrow-right')}</button>
          <span class="subtle-note">记录不是诊断</span>
        </div>
      </section>`;
  }

  function signalIcon(tone) {
    if (tone === 'danger') return 'alert';
    if (tone === 'watch') return 'info';
    if (tone === 'good') return 'check';
    return 'sparkles';
  }

  function renderInsightsWidget() {
    const signals = M.buildSignals(state, 3);
    const topTone = signals[0] ? signals[0].tone : 'info';
    return `
      <section class="card insights-widget tone-${topTone}">
        ${cardHeader('数据观察', '', `<span class="observation-badge">${icon('sparkles')}自动整理</span>`, null)}
        <div class="signal-list">
          ${signals.map((signal) => `
            <div class="signal-item signal-${signal.tone}">
              <span class="signal-icon">${icon(signalIcon(signal.tone))}</span>
              <div class="signal-copy">
                <strong>${esc(signal.title)}</strong>
                <p>${esc(signal.text)}</p>
                <a href="#/${signal.route}">${esc(signal.action)} ${icon('arrow-right')}</a>
              </div>
            </div>`).join('')}
        </div>
        <div class="insight-disclaimer">${icon('shield')}基于你录入的数据自动整理，不替代医生判断。</div>
      </section>`;
  }

  function renderRecentRecords() {
    const records = M.sortedRecords(state, false).slice(0, 4);
    const total = state.records.length;
    const heading = cardHeader('最近检查', `${total} 次化验记录`, `<a class="mini-link" href="#/records">全部记录 ${icon('arrow-right')}</a>`, 'records');
    if (!records.length) {
      return `
        <section class="card recent-records">
          ${heading}
          ${emptyBlock({
            icon: 'records',
            title: '化验记录会出现在这里',
            text: '下一次拿到甲功化验单时，把数值和参考范围一起记下来。',
            compact: true,
            action: button('new-lab', '添加检查记录', { variant: 'primary', size: 'sm', icon: 'plus' })
          })}
        </section>`;
    }
    return `
      <section class="card recent-records">
        ${heading}
        <div class="lab-table" aria-label="最近检查记录">
          <div class="lab-table-head" aria-hidden="true">
            <span>检查日期</span><span>医院 / 实验室</span><span>TSH</span><span>FT4</span><span>FT3</span><span class="result-column">结果</span><span></span>
          </div>
          ${records.map((record) => {
            const summary = M.corePanelSummary(record);
            const metricLabel = PRIMARY_INDICATORS
              .filter((key) => M.getEntry(record, key))
              .map((key) => `${key} ${U.formatNumber(M.getValue(record, key), key)}`)
              .join('，');
            const resultLabel = !summary.total ? '无核心指标' : summary.out > 0 ? `${summary.out} 项核心指标偏离参考范围` : '核心指标在参考范围内';
            return `
              <button type="button" class="lab-table-row" data-action="open-record" data-id="${esc(record.id)}" aria-label="${esc(`${pageDateLabel(record.date)}，${record.hospital || '未填写医院'}，${metricLabel || '未填核心指标'}，${resultLabel}。打开检查详情`)}">
                <span class="lab-date-cell">
                  <strong>${U.fromDateKey(record.date).getDate()}</strong>
                  <span>${U.fromDateKey(record.date).getMonth() + 1}月 · ${U.weekdayCN(record.date)}</span>
                </span>
                <span class="lab-provider-cell">
                  <strong>${esc(record.hospital || '未填写医院')}</strong>
                  <small>${esc(relativeDate(record.date))}</small>
                </span>
                ${PRIMARY_INDICATORS.map((key) => {
                  const value = M.getValue(record, key);
                  const status = M.entryStatus(record, key);
                  return `<span class="lab-number-cell metric-${key}">
                    <span class="cell-mobile-label">${key}</span>
                    <span class="cell-number">${U.formatNumber(value, key)}<i class="status-dot tone-${toneForStatus(status)}"></i></span>
                  </span>`;
                }).join('')}
                <span class="lab-result-cell">${coreResultPill(summary)}</span>
                <span class="row-chevron">${icon('chevron-right')}</span>
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  /* ------------------------------------------------------------------------
     TRENDS PAGE
     ------------------------------------------------------------------------ */
  function renderTrends() {
    if (!INDICATORS[trendState.indicator]) trendState.indicator = 'TSH';
    const key = trendState.indicator;
    const meta = INDICATORS[key];
    const allPoints = M.seriesFor(state, key, 0);
    const points = M.seriesFor(state, key, trendState.days || 0);
    const latestPoint = points[points.length - 1] || null;
    const previousPoint = points.length > 1 ? points[points.length - 2] : null;
    const latestAllRecord = M.latestRecord(state);
    const primaryTabs = PRIMARY_INDICATORS.map((tabKey) => {
      const tabMeta = INDICATORS[tabKey];
      return `<button type="button" class="indicator-tab ${tabKey === key ? 'is-active' : ''}" data-action="set-indicator" data-key="${tabKey}" aria-pressed="${tabKey === key}">
        <span class="indicator-dot" style="--tab-color:${tabMeta.color}"></span>${tabKey}
      </button>`;
    }).join('');
    const extraActive = !PRIMARY_INDICATORS.includes(key)
      ? `<button type="button" class="indicator-tab is-active" data-action="set-indicator" data-key="${key}" aria-pressed="true"><span class="indicator-dot" style="--tab-color:${meta.color}"></span>${key}</button>` : '';
    const moreOptions = INDICATOR_ORDER.filter((optionKey) => !PRIMARY_INDICATORS.includes(optionKey)).map((optionKey) => {
      return `<option value="${optionKey}" ${optionKey === key ? 'selected' : ''}>${optionKey} · ${INDICATORS[optionKey].name}</option>`;
    }).join('');
    const rangeButtons = [
      { days: 90, label: '3 个月' },
      { days: 180, label: '6 个月' },
      { days: 365, label: '1 年' },
      { days: 0, label: '全部' }
    ].map((range) => `<button type="button" class="${trendState.days === range.days ? 'is-active' : ''}" data-action="set-trend-range" data-days="${range.days}" aria-pressed="${trendState.days === range.days}">${range.label}</button>`).join('');

    const changeText = (() => {
      if (!latestPoint) return '<span class="muted">此时段内没有记录</span>';
      if (!previousPoint) return '<span class="muted">时段内首次记录</span>';
      return deltaMarkup(key, latestPoint.value, previousPoint.value, meta.unit);
    })();
    const head = pageHead({
      eyebrow: `指标趋势 · ${U.formatDate(todayKey(), { year: true })}`,
      title: '指标趋势',
      subtitle: '把每一次复查连成线。参考范围以你的化验单为准，治疗目标由医生判断。',
      actions: button('new-lab', '记录化验', { variant: 'primary', icon: 'plus' })
    });

    const latestPanel = latestAllRecord ? renderLatestPanelCard(latestAllRecord) : `
      <section class="card latest-panel-card">
        ${cardHeader('最近甲功', '', '', 'activity')}
        ${emptyBlock({ icon: 'records', title: '还没有化验数据', text: '完成第一条记录后，这里会显示三项核心指标的位置。', compact: true })}
      </section>`;

    const summaryFacts = renderTrendFacts(points, allPoints, key);

    return `
      <div class="page trends-page">
        ${head}
        <div class="trends-layout">
          <section class="card main-chart-card">
            <div class="chart-topline">
              <div class="chart-title">
                <span class="indicator-swatch" style="--swatch:${meta.color}"></span>
                <div><span class="chart-title-kicker">当前指标</span><h2>${meta.short}<span>${esc(meta.name)}</span></h2></div>
              </div>
              <div class="segmented-control" role="group" aria-label="时间范围">${rangeButtons}</div>
            </div>
            <div class="indicator-toolbar">
              <div class="indicator-tabs" role="group" aria-label="主要指标">${primaryTabs}${extraActive}</div>
              <label class="select-control indicator-select">
                <span class="sr-only">更多指标</span>
                <select id="indicatorSelect" aria-label="选择更多指标">
                  <option value="">更多指标</option>
                  ${moreOptions}
                </select>
                ${icon('chevron-down')}
              </label>
            </div>
            <div class="chart-highlight">
              <span class="chart-highlight-label">最新</span>
              <strong class="chart-highlight-value">${latestPoint ? U.formatNumber(latestPoint.value, key) : '—'}<span>${esc(meta.unit)}</span></strong>
              ${latestPoint ? statusPill(latestPoint.status, key) : ''}
              <span class="chart-highlight-meta">${latestPoint ? `记于 ${esc(relativeDate(latestPoint.date))} · ${changeText}` : (allPoints.length ? '所选时间范围内暂无记录，试试更长时间范围' : '等待第一次记录')}</span>
            </div>
            ${points.length
              ? '<div class="chart-canvas main-trend-chart" id="trendMainChart"></div>'
              : `<div class="chart-empty-state">
                  <span class="empty-icon">${icon('trend')}</span>
                  <h3>这个时间范围内还没有记录</h3>
                  <p>换一个时间范围，或记录一次新的化验；趋势会随着记录慢慢出现。</p>
                  ${button('new-lab', '记录化验', { variant: 'secondary', size: 'sm', icon: 'plus' })}
                </div>`}
            ${points.length ? `
              <div class="chart-notes-row">
                <span>${icon('info')}参考范围：${U.formatRange(latestPoint.low, latestPoint.high, key)} ${esc(meta.unit)}</span>
                <span>点击数据点可回看化验单</span>
              </div>` : ''}
            <div class="chart-explainer">
              <span class="chart-explainer-mark">i</span>
              <p>${esc(meta.description)}</p>
            </div>
          </section>
          <aside class="trend-aside">
            ${latestPanel}
            <section class="card trend-facts-card">
              ${cardHeader('这段记录里', '', '', 'sparkles')}
              ${summaryFacts}
              <p class="aside-disclaimer">数据观察只描述记录本身，不能代替诊断或治疗建议。</p>
            </section>
          </aside>
        </div>
        ${renderIndicatorHistory(key, meta)}
      </div>`;
  }

  function renderLatestPanelCard(record) {
    const entries = PRIMARY_INDICATORS.filter((key) => M.getEntry(record, key));
    return `
      <section class="card latest-panel-card">
        ${cardHeader('最近甲功', '', `<button type="button" class="mini-link as-button" data-action="open-record" data-id="${esc(record.id)}">化验单 ${icon('chevron-right')}</button>`, 'activity')}
        <div class="latest-panel-date"><span>${esc(pageDateLabel(record.date))}</span><span>${esc(record.hospital || '未填写医院')}</span></div>
        <div class="panel-rows">
          ${entries.length ? entries.map((key) => {
            const meta = INDICATORS[key];
            const value = M.getValue(record, key);
            const status = M.entryStatus(record, key);
            const ref = M.getReference(record, key);
            return `
              <div class="panel-row">
                <div class="panel-row-top">
                  <span class="panel-name"><strong>${key}</strong><span>${esc(meta.name)}</span></span>
                  <span class="panel-reading">${U.formatNumber(value, key)}<small>${esc(meta.unit)}</small></span>
                </div>
                ${rangeTrack(value, ref.low, ref.high, key)}
                <div class="panel-row-bottom">${statusPill(status, key)}<span class="panel-ref">参考 ${U.formatRange(ref.low, ref.high, key)}</span></div>
              </div>`;
          }).join('') : `<p class="muted">这次记录没有包含 TSH、FT4 或 FT3。</p>`}
        </div>
        <a class="panel-all-link" href="#/records">查看所有检查记录 ${icon('arrow-right')}</a>
      </section>`;
  }

  function rangeTrack(value, low, high, key) {
    const numericValue = Number(value);
    const numericLow = Number(low);
    const numericHigh = Number(high);
    let min = Math.min(numericLow, numericValue);
    let max = Math.max(numericHigh, numericValue);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
    if (max === min) { max += 1; min -= 1; }
    const pad = (max - min) * 0.075;
    min -= pad;
    max += pad;
    const span = max - min;
    const bandLeft = U.clamp(((numericLow - min) / span) * 100, 0, 100);
    const bandWidth = U.clamp(((numericHigh - numericLow) / span) * 100, 1, 100 - bandLeft);
    const pin = U.clamp(((numericValue - min) / span) * 100, 1.5, 98.5);
    const status = M.getStatus(numericValue, numericLow, numericHigh);
    return `
      <div class="range-track tone-${toneForStatus(status)}" aria-hidden="true">
        <span class="range-track-base"></span>
        <span class="range-track-normal" style="left:${bandLeft.toFixed(2)}%;width:${bandWidth.toFixed(2)}%"></span>
        <span class="range-pin" style="left:${pin.toFixed(2)}%"></span>
      </div>`;
  }

  function renderTrendFacts(points, allPoints, key) {
    const meta = INDICATORS[key];
    if (!allPoints.length) {
      return `<div class="empty-block empty-block-compact compact-no-icon"><h3>等待第一条记录</h3><p>有了数据之后，这里会帮你整理变化。</p></div>`;
    }
    const inRange = points.filter((point) => point.status === 'in-range').length;
    const first = points[0] || null;
    const last = points[points.length - 1] || null;
    const periodChange = first && last && first !== last ? last.value - first.value : null;
    const ref = last || allPoints[allPoints.length - 1];
    return `
      <div class="trend-facts">
        <div class="trend-fact">
          <span>所选时段记录</span><strong>${points.length}<small>次</small></strong>
        </div>
        <div class="trend-fact">
          <span>所选时段参考内</span><strong>${points.length ? `${inRange}<small>/ ${points.length} 次</small>` : '—'}</strong>
        </div>
        <div class="trend-fact">
          <span>时段内变化</span>
          <strong class="trend-fact-change">${periodChange === null ? '—' : `${periodChange > 0 ? '↑' : periodChange < 0 ? '↓' : '→'} ${U.formatNumber(Math.abs(periodChange), key)}`}<small>${periodChange === null ? '' : esc(meta.unit)}</small></strong>
        </div>
      </div>
      <div class="trend-ref-note"><span>本次参考范围</span><strong>${U.formatRange(ref.low, ref.high, key)} ${esc(meta.unit)}</strong></div>`;
  }

  function renderIndicatorHistory(key, meta) {
    const records = M.recordsWithIndicator(state, key);
    if (!records.length) {
      return `<section class="card indicator-history">
        ${cardHeader(`${meta.short} 历史记录`, '', '', 'records')}
        ${emptyBlock({ icon: 'trend', title: '这个指标还没有记录', text: '下次化验后，把这一项一起记下来。', compact: true })}
      </section>`;
    }
    const rows = records.slice(0, 12);
    return `
      <section class="card indicator-history">
        ${cardHeader(`${meta.short} 历史记录`, `${records.length} 次`, `<a class="mini-link" href="#/records">全部检查 ${icon('arrow-right')}</a>`, 'records')}
        <div class="history-table" aria-label="${esc(meta.name)}历史记录">
          <div class="history-head" aria-hidden="true"><span>检查日期</span><span>结果</span><span>参考范围</span><span>状态</span><span>较上次</span></div>
          ${rows.map((record, index) => {
            const value = M.getValue(record, key);
            const status = M.entryStatus(record, key);
            const ref = M.getReference(record, key);
            const previous = rows[index + 1] ? M.getValue(rows[index + 1], key) : null;
            return `
              <button type="button" class="history-row" data-action="open-record" data-id="${esc(record.id)}" aria-label="${esc(`${pageDateLabel(record.date)}，${record.hospital || '未填写医院'}，${key} ${U.formatNumber(value, key)} ${meta.unit}，参考 ${U.formatRange(ref.low, ref.high, key)}，${M.statusCopy(status, key)}。打开检查详情`)}">
                <span class="history-date"><strong>${esc(pageDateLabel(record.date))}</strong><small>${esc(record.hospital || '未填写医院')}</small></span>
                <span class="history-value">${U.formatNumber(value, key)}<small>${esc(meta.unit)}</small></span>
                <span class="history-ref">${U.formatRange(ref.low, ref.high, key)}</span>
                <span>${statusPill(status, key)}</span>
                <span class="history-delta">${deltaMarkup(key, value, previous, meta.unit)}</span>
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  /* ------------------------------------------------------------------------
     RECORDS PAGE
     ------------------------------------------------------------------------ */
  function recordMatches(record) {
    const query = recordFilters.query.trim().toLowerCase();
    if (recordFilters.onlyAbnormal) {
      const hasAbnormal = INDICATOR_ORDER.some((key) => {
        if (!M.getEntry(record, key)) return false;
        return M.entryStatus(record, key) !== 'in-range';
      });
      if (!hasAbnormal) return false;
    }
    if (!query) return true;
    const haystack = [
      record.hospital, record.doctor, record.note, record.date,
      ...INDICATOR_ORDER.map((key) => [key, INDICATORS[key].name, M.getValue(record, key)].join(' '))
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function renderRecords() {
    const all = M.sortedRecords(state, false);
    const abnormalCount = all.filter((record) => INDICATOR_ORDER.some((key) => M.getEntry(record, key) && M.entryStatus(record, key) !== 'in-range')).length;
    const head = pageHead({
      eyebrow: '检查记录 · 甲功档案',
      title: '检查记录',
      subtitle: '数值和当时的参考范围一起保存，回看时才不会断章取义。',
      actions: button('new-lab', '新增检查', { variant: 'primary', icon: 'plus' })
    });
    return `
      <div class="page records-page">
        ${head}
        <section class="records-toolbar-card">
          <div class="records-toolbar">
            <label class="search-box">
              ${icon('search')}
              <input id="recordSearch" type="search" value="${esc(recordFilters.query)}" placeholder="搜索医院、备注或指标" aria-label="搜索检查记录">
            </label>
            <div class="filter-pills" role="group" aria-label="筛选检查记录">
              <button type="button" class="${!recordFilters.onlyAbnormal ? 'is-active' : ''}" data-action="filter-records" data-mode="all" aria-pressed="${!recordFilters.onlyAbnormal}">全部 <span>${all.length}</span></button>
              <button type="button" class="${recordFilters.onlyAbnormal ? 'is-active' : ''}" data-action="filter-records" data-mode="abnormal" aria-pressed="${recordFilters.onlyAbnormal}">有偏离 <span>${abnormalCount}</span></button>
            </div>
            <span class="record-result-count" id="recordCountText" aria-live="polite">${all.filter(recordMatches).length} 条记录</span>
          </div>
        </section>
        <div id="recordList">${renderRecordList()}</div>
      </div>`;
  }

  function renderRecordList() {
    const all = M.sortedRecords(state, false);
    const filtered = all.filter(recordMatches);
    if (!all.length) {
      return `<section class="card">${emptyBlock({
        icon: 'records',
        title: '还没有检查记录',
        text: '拿到化验单后，把 TSH、FT4、FT3 的数值和参考范围录进来，趋势就会从这里开始。',
        action: button('new-lab', '记录第一次化验', { variant: 'primary', icon: 'plus' })
      })}</section>`;
    }
    if (!filtered.length) {
      return `<section class="card">${emptyBlock({
        icon: 'search',
        title: '没有找到匹配的记录',
        text: '试试换一个关键词，或切回「全部」查看。',
        compact: true
      })}</section>`;
    }
    return `
      <div class="record-list">
        ${filtered.map((record) => renderRecordCard(record)).join('')}
      </div>`;
  }

  function renderRecordCard(record) {
    const summary = M.corePanelSummary(record);
    const entryCount = Object.keys(record.panel || {}).length;
    const optionalEntries = INDICATOR_ORDER.filter((key) => !PRIMARY_INDICATORS.includes(key) && M.getEntry(record, key)).slice(0, 6);
    const note = record.note ? esc(record.note) : '';
    return `
      <button type="button" class="record-card" data-action="open-record" data-id="${esc(record.id)}">
        <span class="record-card-date">
          <span class="record-year">${U.fromDateKey(record.date).getFullYear()}</span>
          <strong>${String(U.fromDateKey(record.date).getMonth() + 1).padStart(2, '0')}.${String(U.fromDateKey(record.date).getDate()).padStart(2, '0')}</strong>
          <span>${U.weekdayCN(record.date)}</span>
        </span>
        <span class="record-card-main">
          <span class="record-card-topline">
            <span class="record-card-hospital">${esc(record.hospital || '未填写医院 / 实验室')}</span>
            <span class="record-relative">${esc(relativeDate(record.date))}</span>
            ${coreResultPill(summary)}
          </span>
          <span class="record-metrics">
            ${PRIMARY_INDICATORS.map((key) => {
              const has = Boolean(M.getEntry(record, key));
              const value = M.getValue(record, key);
              const status = M.entryStatus(record, key);
              return `<span class="record-metric ${has ? '' : 'is-empty'}">
                <span class="record-metric-label">${key}</span>
                <strong>${has ? U.formatNumber(value, key) : '—'}</strong>
                ${has ? `<i class="status-dot tone-${toneForStatus(status)}" title="${esc(M.statusCopy(status, key))}"></i>` : ''}
              </span>`;
            }).join('')}
            <span class="record-extra-count">共 ${entryCount} 项</span>
          </span>
          ${optionalEntries.length ? `<span class="record-extra-row">
            ${optionalEntries.map((key) => {
              const status = M.entryStatus(record, key);
              return `<span class="extra-indicator tone-${toneForStatus(status)}" title="${esc(INDICATORS[key].name)} · ${esc(M.statusCopy(status, key))}">
                <span>${key}</span><strong>${U.formatNumber(M.getValue(record, key), key)}</strong><i class="status-dot"></i>
              </span>`;
            }).join('')}
            ${entryCount - PRIMARY_INDICATORS.filter((key) => M.getEntry(record, key)).length > optionalEntries.length ? `<span class="extra-more">+${entryCount - PRIMARY_INDICATORS.filter((key) => M.getEntry(record, key)).length - optionalEntries.length}</span>` : ''}
          </span>` : ''}
          ${note ? `<span class="record-note">${note}</span>` : ''}
        </span>
        <span class="record-chevron">${icon('chevron-right')}</span>
      </button>`;
  }

  /* ------------------------------------------------------------------------
     MEDICATIONS PAGE
     ------------------------------------------------------------------------ */
  function safetyBanner() {
    return `
      <section class="safety-callout" aria-label="用药安全提醒">
        <div class="safety-callout-icon">${icon('alert')}</div>
        <div class="safety-callout-copy">
          <span class="safety-kicker">用药安全提醒</span>
          <h2>出现发热、咽痛、黄疸或广泛皮疹，不要等下次复查。</h2>
          <p>服用抗甲状腺药物期间，这些可能是需要尽快评估的信号。请尽快联系医生或前往急诊，并告诉医生你正在使用的药物；是否调整用药请遵医嘱。</p>
        </div>
        <a class="safety-callout-link" href="#/learn">查看应对要点 ${icon('arrow-right')}</a>
      </section>`;
  }

  function renderMedications() {
    const doses = M.dosesForDate(state, todayKey());
    const head = pageHead({
      eyebrow: '用药与安全 · 医嘱优先',
      title: '用药与安全',
      subtitle: '记录药物与服药情况，留意需要及时就医的安全信号。这里不会给出剂量建议。',
      actions: button('new-med', '添加药物', { variant: 'primary', icon: 'plus' })
    });
    return `
      <div class="page medications-page">
        ${head}
        ${safetyBanner()}
        <div class="med-page-grid">
          ${renderMedicationSchedule(doses)}
          ${renderAdherenceCard()}
        </div>
        <section class="med-section">
          <div class="section-heading">
            <div><span class="section-kicker">MEDICATION PLAN</span><h2>用药计划</h2></div>
            <span class="section-meta">${(state.medications || []).filter((med) => med.active !== false).length} 种在用</span>
          </div>
          ${renderMedicationCards()}
        </section>
        ${renderSafetyMonitor()}
      </div>`;
  }

  function renderMedicationSchedule(doses) {
    const taken = doses.filter((dose) => dose.taken).length;
    const allDone = doses.length > 0 && taken === doses.length;
    return `
      <section class="card schedule-card">
        ${cardHeader('今日服药', `${U.formatMonthDay(todayKey())} · ${U.weekdayCN(todayKey())}`, '', 'clock')}
        ${doses.length ? `
          <div class="schedule-summary">
            <div class="schedule-progress-copy">
              <strong>${taken}<span> / ${doses.length}</span></strong>
              <p>${allDone ? '今天的用药已全部打卡' : '已完成今天的用药记录'}</p>
            </div>
            <div class="schedule-bar"><span style="width:${Math.round((taken / doses.length) * 100)}%"></span></div>
          </div>
          <div class="schedule-list">
            ${doses.map((dose) => `
              <div class="schedule-item ${dose.taken ? 'is-taken' : ''}">
                <button type="button" class="dose-check dose-check-large" data-action="toggle-dose" data-dose-key="${esc(dose.key)}" aria-label="${dose.taken ? '取消记录' : '记录为已服'} ${esc(dose.medName)} ${esc(dose.time)}" aria-pressed="${dose.taken}">${icon('check')}</button>
                <time class="schedule-time">${esc(dose.time)}</time>
                <div class="schedule-med">
                  <strong>${esc(dose.medName)}${dose.amount ? `<span>${esc(dose.amount)}</span>` : ''}</strong>
                  <p>${esc(dose.instruction || dose.category || '按医嘱服用')}</p>
                </div>
                <span class="schedule-state">${dose.taken ? '已服' : '待服'}</span>
              </div>`).join('')}
          </div>
          <div class="schedule-footnote">${icon('info')} 只记录是否服用，不提示剂量、频次或停药时间。</div>` : `
          <div class="schedule-empty">
            ${emptyBlock({ icon: 'pill', title: '还没有今日用药', text: '按照医嘱添加药物后，就可以在这里打卡。', compact: true, action: button('new-med', '添加药物', { variant: 'secondary', size: 'sm', icon: 'plus' }) })}
          </div>`}
      </section>`;
  }

  function renderAdherenceCard() {
    const adh = M.adherence(state, 14);
    const series = M.medLogSeries(state, 14);
    if (adh.rate === null) {
      return `
        <section class="card adherence-card">
          ${cardHeader('用药打卡', '近 14 天', '', 'trend')}
          ${emptyBlock({ icon: 'sparkles', title: '还没有足够的打卡记录', text: '服药后点一下勾选，这里的记录会慢慢形成一条连续的轨迹。', compact: true })}
        </section>`;
    }
    const missed = series.filter((item) => item.rate !== null && item.rate < 100).length;
    return `
      <section class="card adherence-card">
        ${cardHeader('用药打卡', '近 14 天', '', 'trend')}
        <div class="adherence-headline">
          <div><strong>${adh.rate}<span>%</span></strong><p>${adh.taken} / ${adh.scheduled} 次已打卡</p></div>
          <span class="adherence-badge ${adh.rate >= 90 ? 'good' : adh.rate >= 75 ? 'watch' : 'low'}">${adh.rate >= 90 ? '很稳定' : adh.rate >= 75 ? '可以更好' : '留个心'}</span>
        </div>
        <div class="adherence-chart" aria-label="近 14 天每日用药打卡比例">
          ${series.map((item) => {
            const rate = item.rate === null ? 0 : item.rate;
            const isToday = item.date === todayKey();
            return `<div class="adherence-day ${isToday ? 'is-today' : ''} ${rate < 100 ? 'has-missed' : ''}" title="${esc(U.formatMonthDay(item.date))} · ${item.rate === null ? '无用药记录' : `${item.taken}/${item.scheduled} 次`}">
              <span class="adherence-bar" style="height:${Math.max(rate, item.rate === null ? 4 : 12)}%"></span>
              ${isToday ? '<span class="adh-today-dot">今天</span>' : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="adherence-days"><span>14 天前</span><span>今天</span></div>
        <div class="adherence-stats">
          <div><strong>${missed}</strong><span>天有未打卡</span></div>
          <div><strong>${series.filter((item) => item.rate === 100).length}</strong><span>天全部完成</span></div>
        </div>
        <p class="adherence-note">${icon('info')} 打卡率来自你的手动记录；忘记打卡不等于漏服。如确有不规律服药，请向医生或药师咨询。</p>
      </section>`;
  }

  function renderMedicationCards() {
    const all = state.medications || [];
    const active = all.filter((med) => med.active !== false);
    const inactive = all.filter((med) => med.active === false);
    if (!all.length) {
      return `<section class="card">${emptyBlock({
        icon: 'pill',
        title: '把医生开具的药物记下来',
        text: '记录名称、每次剂量与服用时间，方便自己回看，也方便复诊时向医生说明。',
        action: button('new-med', '添加第一种药物', { variant: 'primary', icon: 'plus' })
      })}</section>`;
    }
    const cardFor = (med) => {
      const times = (med.schedule || []).map((dose) => dose.time).join(' / ');
      return `
        <article class="medication-card ${med.active === false ? 'is-inactive' : ''}">
          <div class="medication-card-top">
            <span class="med-category">${esc(med.category || '其他药物')}</span>
            <span class="med-status ${med.active === false ? 'off' : 'on'}">${med.active === false ? '已停用' : '在用'}</span>
          </div>
          <div class="medication-title">
            <span class="med-letter">${esc(initials(med.name))}</span>
            <div><h3>${esc(med.name)}</h3>${med.brand ? `<p>${esc(med.brand)}</p>` : ''}</div>
          </div>
          <div class="medication-details">
            <div><span>每次剂量</span><strong>${esc(med.amount || '以医嘱为准')}</strong></div>
            <div><span>服药时间</span><strong>${times ? esc(times) : '未设置'}</strong></div>
          </div>
          ${med.instruction ? `<p class="med-instruction">${esc(med.instruction)}</p>` : ''}
          <div class="medication-foot">
            <span>${med.active === false && med.endDate
              ? `停用于 ${esc(pageDateLabel(med.endDate))}`
              : med.startDate ? `开始于 ${esc(pageDateLabel(med.startDate))}` : '未记录开始日期'}</span>
            <div class="med-actions">
              <button type="button" class="text-button" data-action="edit-med" data-id="${esc(med.id)}">编辑</button>
              <button type="button" class="text-button ${med.active === false ? '' : 'danger-text'}" data-action="toggle-med-active" data-id="${esc(med.id)}">${med.active === false ? '恢复使用' : '标记停用'}</button>
            </div>
          </div>
        </article>`;
    };
    return `
      <div class="medication-grid">
        ${active.map(cardFor).join('')}
        <button type="button" class="add-medication-card" data-action="new-med">
          <span>${icon('plus')}</span>
          <strong>添加药物</strong>
          <span class="add-medication-note">按医生开具的方案记录</span>
        </button>
      </div>
      ${inactive.length ? `<details class="inactive-meds"><summary>已停用药物 · ${inactive.length} 种 <span>${icon('chevron-down')}</span></summary><div class="medication-grid">${inactive.map(cardFor).join('')}</div></details>` : ''}`;
  }

  function renderSafetyMonitor() {
    const safetyKeys = ['WBC', 'ANC', 'ALT', 'AST'];
    const found = safetyKeys.map((key) => {
      const records = M.recordsWithIndicator(state, key);
      const record = records[0];
      return record ? {
        key,
        record,
        value: M.getValue(record, key),
        status: M.entryStatus(record, key),
        ref: M.getReference(record, key)
      } : null;
    });
    return `
      <section class="card safety-monitor-card">
        ${cardHeader('用药安全监测', '血常规与肝功能', `<button type="button" class="mini-link as-button" data-action="new-lab">添加结果 ${icon('plus')}</button>`, 'shield')}
        ${found.some(Boolean) ? `
          <div class="safety-metrics">
            ${found.map((item) => item ? `
              <button type="button" class="safety-metric" data-action="open-record" data-id="${esc(item.record.id)}">
                <span class="safety-metric-label">${item.key}<small>${esc(INDICATORS[item.key].name)}</small></span>
                <strong>${U.formatNumber(item.value, item.key)}<small>${esc(INDICATORS[item.key].unit)}</small></strong>
                <span class="safety-metric-foot">${statusPill(item.status, item.key)}<span>${esc(pageDateLabel(item.record.date))}</span></span>
              </button>` : `
              <div class="safety-metric is-empty">
                <span class="safety-metric-label">${item.key}<small>${esc(INDICATORS[item.key].name)}</small></span>
                <strong>—</strong>
                <span class="safety-metric-foot"><span>暂无近期记录</span></span>
              </div>`).join('')}
          </div>
          <p class="safety-monitor-note">${icon('info')} 这些数值来自你录入的化验单。需要检查哪些项目、多久检查一次，请以医生安排为准。</p>` : `
          <div class="safety-monitor-empty">
            <p>还没有录入血常规或肝功能结果。医生安排相关检查时，可以把结果一并记在这里，复诊时更容易回看。</p>
            ${button('new-lab', '记录检查结果', { variant: 'secondary', size: 'sm', icon: 'plus' })}
          </div>`}
      </section>`;
  }

  /* ------------------------------------------------------------------------
     VISITS PAGE
     ------------------------------------------------------------------------ */
  function renderVisits() {
    const future = M.upcomingVisits(state);
    const visit = future[0] || null;
    const laterVisits = future.slice(1);
    const past = M.pastVisits(state);
    const head = pageHead({
      eyebrow: '复查与就诊 · 提前准备',
      title: '复查与就诊',
      subtitle: '把下一次复查和想问的问题准备好，让有限的就诊时间更从容。',
      actions: button('new-visit', '安排复查', { variant: 'primary', icon: 'calendar' })
    });
    return `
      <div class="page visits-page">
        ${head}
        <div class="visits-layout">
          <div class="visits-main">
            ${visit ? renderUpcomingVisitCard(visit) : `
              <section class="card upcoming-visit-empty">
                ${emptyBlock({
                  icon: 'calendar',
                  title: '还没有安排下一次复查',
                  text: '复查时间通常由医生根据病情和治疗阶段决定。把已经约好的日期记下来，提前准备。',
                  action: button('new-visit', '安排复查', { variant: 'primary', icon: 'plus' })
                })}
              </section>`}
            ${laterVisits.length ? `<section class="future-visits-section">
              <div class="section-heading">
                <div><span class="section-kicker">UPCOMING</span><h2>后续安排</h2></div>
                <span class="section-meta">${laterVisits.length} 项</span>
              </div>
              <div class="future-visits-list">
                ${laterVisits.map(renderFutureVisit).join('')}
              </div>
            </section>` : ''}
            <section class="past-visits-section">
              <div class="section-heading">
                <div><span class="section-kicker">VISIT HISTORY</span><h2>过往就诊</h2></div>
                <span class="section-meta">${past.length} 次</span>
              </div>
              ${past.length ? `<div class="visit-timeline">${past.map(renderPastVisit).join('')}</div>` : `
                <section class="card compact-empty-card">${emptyBlock({ icon: 'calendar', title: '暂无过往就诊记录', text: '记录复诊日期与医生备注，复诊轨迹会更清晰。', compact: true })}</section>`}
            </section>
          </div>
          <aside class="visits-aside">
            <section class="card summary-promo-card">
              <span class="summary-promo-icon">${icon('file')}</span>
              <div class="summary-promo-eyebrow">VISIT SUMMARY</div>
              <h2>把变化整理成一页，带去诊室。</h2>
              <p>自动汇总近期甲功、趋势、用药与身体状态，也可以写下想问医生的问题。</p>
              <ul class="summary-promo-list">
                <li>${icon('check')}最近几次甲功与参考范围</li>
                <li>${icon('check')}当前用药与用药打卡</li>
                <li>${icon('check')}近期心率、体重与症状</li>
              </ul>
              <a class="btn btn-primary btn-block" href="#/summary">${icon('file')}生成就诊摘要</a>
              <span class="summary-promo-note">${icon('lock')}内容仅在本机生成，不会上传</span>
            </section>
            <section class="card visit-tips-card">
              ${cardHeader('复诊前小贴士', '', '', 'info')}
              <ul class="tips-list">
                <li><span>01</span><p><strong>带上原始化验单</strong>不同实验室的参考范围可能不同。</p></li>
                <li><span>02</span><p><strong>整理用药问题</strong>包括漏服、不适或想调整的原因。</p></li>
                <li><span>03</span><p><strong>写下最关心的事</strong>看诊时优先问最重要的两三个问题。</p></li>
              </ul>
            </section>
          </aside>
        </div>
      </div>`;
  }

  function renderUpcomingVisitCard(visit) {
    const days = U.daysBetween(todayKey(), visit.date);
    const date = U.fromDateKey(visit.date);
    const prep = Array.isArray(visit.prep) ? visit.prep : [];
    const done = prep.filter((item) => item.done).length;
    return `
      <section class="card next-visit-detail">
        <div class="upcoming-head">
          <div class="upcoming-date-block">
            <span>${U.englishMonth(visit.date)}</span>
            <strong>${date.getDate()}</strong>
            <small>${U.weekdayCN(visit.date)}${visit.time ? ` · ${esc(visit.time)}` : ''}</small>
          </div>
          <div class="upcoming-copy">
            <span class="upcoming-label">下一次复查 <span class="upcoming-countdown">${days === 0 ? '就是今天' : days === 1 ? '明天' : `还有 ${days} 天`}</span></span>
            <h2>${esc(visit.type || '内分泌科复查')}</h2>
            <p class="upcoming-place">${icon('building')}${esc(visit.hospital || '医院待补充')}${visit.doctor ? `<span class="dot-divider">·</span>${esc(visit.doctor)}` : ''}</p>
            ${visit.location ? `<p class="upcoming-location">${icon('clock')}${esc(visit.location)}</p>` : ''}
          </div>
          <button type="button" class="icon-btn icon-btn-bordered" data-action="edit-visit" data-id="${esc(visit.id)}" aria-label="编辑复查">${icon('edit')}</button>
        </div>
        ${visit.purpose ? `<div class="upcoming-purpose"><span>复查项目</span><strong>${esc(visit.purpose)}</strong></div>` : ''}
        ${prep.length ? `
          <div class="prep-panel">
            <div class="prep-panel-head"><strong>复查准备</strong><span>${done} / ${prep.length} 已完成</span></div>
            <div class="prep-checklist">
              ${prep.map((item) => `
                <button type="button" class="prep-checklist-item ${item.done ? 'is-done' : ''}" data-action="toggle-prep" data-visit-id="${esc(visit.id)}" data-prep-id="${esc(item.id)}" aria-pressed="${Boolean(item.done)}">
                  <span class="prep-check-large">${icon('check')}</span>
                  <span>${esc(item.text)}</span>
                </button>`).join('')}
            </div>
          </div>` : `
          <div class="prep-panel prep-panel-empty"><strong>复查准备</strong><p>可以在编辑复查时添加准备事项。</p></div>`}
        ${visit.notes ? `<div class="visit-note-callout">${icon('info')}<p>${nl2br(visit.notes)}</p></div>` : ''}
        <div class="upcoming-foot">
          <span class="subtle-note">${icon('shield')}如出现明显不适，请提前联系医生，不必等到预约日。</span>
          <button type="button" class="btn btn-secondary btn-sm" data-action="edit-visit" data-id="${esc(visit.id)}">编辑复查安排</button>
        </div>
      </section>`;
  }

  function renderFutureVisit(visit) {
    const date = U.fromDateKey(visit.date);
    return `
      <article class="future-visit">
        <span class="future-visit-date">
          <span>${U.englishMonth(visit.date)}</span>
          <strong>${date.getDate()}</strong>
        </span>
        <span class="future-visit-copy">
          <strong>${esc(visit.type || '内分泌科复查')}</strong>
          <span>${esc(pageDateLabel(visit.date))}${visit.time ? ` · ${esc(visit.time)}` : ''}${visit.hospital ? ` · ${esc(visit.hospital)}` : ''}</span>
        </span>
        <button type="button" class="icon-btn icon-btn-small" data-action="edit-visit" data-id="${esc(visit.id)}" aria-label="编辑${esc(visit.type || '复查')}">${icon('edit')}</button>
      </article>`;
  }

  function renderPastVisit(visit) {
    const date = U.fromDateKey(visit.date);
    return `
      <article class="past-visit">
        <div class="past-visit-date"><strong>${date.getDate()}</strong><span>${date.getMonth() + 1}月</span><small>${date.getFullYear()}</small></div>
        <div class="past-visit-line"><span></span></div>
        <div class="past-visit-main">
          <div class="past-visit-top">
            <h3>${esc(visit.type || '内分泌科复诊')}</h3>
            <span>${esc(relativeDate(visit.date))}</span>
            <button type="button" class="icon-btn icon-btn-small" data-action="edit-visit" data-id="${esc(visit.id)}" aria-label="编辑这次就诊">${icon('edit')}</button>
          </div>
          <p class="past-visit-place">${esc(visit.hospital || '医院未填写')}${visit.doctor ? ` · ${esc(visit.doctor)}` : ''}${visit.purpose ? ` · ${esc(visit.purpose)}` : ''}</p>
          ${visit.notes ? `<p class="past-visit-note">${esc(visit.notes)}</p>` : ''}
        </div>
      </article>`;
  }

  /* ------------------------------------------------------------------------
     VISIT SUMMARY / PRINT PAGE
     ------------------------------------------------------------------------ */
  function renderSummary() {
    const latest = M.latestRecord(state);
    const recentRecords = M.sortedRecords(state, false).slice(0, 5).reverse();
    const profile = state.profile || {};
    const age = M.age(profile);
    const activeMeds = (state.medications || []).filter((med) => med.active !== false);
    const dailySummary = buildDailySummary();
    const latestSafetyRefs = PRIMARY_INDICATORS.map((key) => {
      if (!latest || !M.getEntry(latest, key)) return null;
      const ref = M.getReference(latest, key);
      return `${key} ${U.formatRange(ref.low, ref.high, key)} ${INDICATORS[key].unit}`;
    }).filter(Boolean);
    const head = pageHead({
      eyebrow: '就诊沟通材料 · 本机生成',
      title: '就诊摘要',
      subtitle: '把最近的化验、用药与身体变化放在一页，方便和医生沟通。它不能替代病历或诊断。',
      actions: `
        <a class="btn btn-secondary" href="#/visits">${icon('calendar')}返回复查</a>
        <button type="button" class="btn btn-secondary" data-action="edit-summary-questions">${icon('edit')}编辑问题</button>
        <button type="button" class="btn btn-secondary" data-action="copy-summary">${icon('copy')}复制文字</button>
        <button type="button" class="btn btn-primary" data-action="print-summary">${icon('printer')}打印 / 存为 PDF</button>
      `
    });

    return `
      <div class="page summary-page">
        ${head}
        <article class="report-sheet" id="reportSheet">
          <header class="report-header">
            <div class="report-brand">
              <span class="report-brand-mark">${icon('activity')}</span>
              <div><strong>蝶迹</strong><span>THYROID CARE VISIT SUMMARY</span></div>
            </div>
            <div class="report-title"><span>甲亢随访</span><h1>就诊沟通摘要</h1><p>生成于 ${U.formatDate(todayKey(), { year: true })} ${U.weekdayCN(todayKey())}</p></div>
          </header>
          <section class="report-patient">
            <div><span>姓名</span><strong>${esc(profile.name || '未填写')}</strong></div>
            <div><span>性别 / 年龄</span><strong>${esc(profile.sex || '—')}${age ? ` / ${age} 岁` : ''}</strong></div>
            <div><span>诊断</span><strong>${esc(profile.diagnosis || '未填写')}</strong></div>
            <div><span>确诊时间</span><strong>${profile.diagnosedAt ? esc(pageDateLabel(profile.diagnosedAt)) : '未填写'}</strong></div>
            <div class="wide"><span>随访医院 / 医生</span><strong>${esc(profile.hospital || '未填写')}${profile.doctor ? ` · ${esc(profile.doctor)}` : ''}</strong></div>
          </section>

          <section class="report-section">
            <div class="report-section-head"><span class="report-number">01</span><h2>近期甲功</h2><span>最近 ${recentRecords.length} 次记录</span></div>
            ${recentRecords.length ? `
              <table class="report-table">
                <thead><tr><th>检查日期</th>${PRIMARY_INDICATORS.map((key) => `<th>${key}<small>${esc(INDICATORS[key].unit)}</small></th>`).join('')}<th>TRAb</th><th>结果</th></tr></thead>
                <tbody>
                  ${recentRecords.map((record) => {
                    const summary = M.corePanelSummary(record);
                    return `<tr>
                      <td>${esc(pageDateLabel(record.date))}<small>${esc(record.hospital || '')}</small></td>
                      ${PRIMARY_INDICATORS.map((key) => {
                        if (!M.getEntry(record, key)) return '<td class="empty-cell">—</td>';
                        const status = M.entryStatus(record, key);
                        return `<td class="report-value tone-${toneForStatus(status)}">${U.formatNumber(M.getValue(record, key), key)}<span class="print-dot"></span></td>`;
                      }).join('')}
                      <td>${M.getValue(record, 'TRAb') !== null ? U.formatNumber(M.getValue(record, 'TRAb'), 'TRAb') : '—'}</td>
                      <td>${summary.total === 0
                        ? '<span class="print-status neutral">无核心指标</span>'
                        : `<span class="print-status ${summary.out > 0 ? 'watch' : 'good'}">${summary.out > 0 ? `${summary.out} 项偏离` : '参考内'}</span>`}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
              <p class="report-note">参考范围（最近一次录入）：${latestSafetyRefs.length ? esc(latestSafetyRefs.join('；')) : '未记录'}。不同实验室的检测方法与参考范围不同，跨实验室结果不宜直接比较。</p>` : `<p class="report-empty">尚无甲功检查记录。</p>`}
          </section>

          <section class="report-section">
            <div class="report-section-head"><span class="report-number">02</span><h2>指标趋势</h2><span>数据来自患者自行记录</span></div>
            <div class="report-charts">
              ${PRIMARY_INDICATORS.map((key) => `
                <div class="report-chart">
                  <div class="report-chart-head"><strong>${key}</strong><span>${esc(INDICATORS[key].name)}</span></div>
                  <div class="report-chart-canvas" data-summary-chart="${key}"></div>
                </div>`).join('')}
            </div>
          </section>

          <div class="report-two-col">
            <section class="report-section">
              <div class="report-section-head"><span class="report-number">03</span><h2>当前用药</h2><span>${activeMeds.length} 种</span></div>
              ${activeMeds.length ? `<div class="report-med-list">${activeMeds.map((med) => `
                <div class="report-med">
                  <div><strong>${esc(med.name)}</strong>${med.brand ? `<span>${esc(med.brand)}</span>` : ''}</div>
                  <p>${esc(med.amount || '剂量以医嘱为准')} · ${(med.schedule || []).map((dose) => esc(dose.time)).join(' / ') || '时间未记录'}</p>
                  ${med.instruction ? `<small>${esc(med.instruction)}</small>` : ''}
                </div>`).join('')}</div>` : '<p class="report-empty">暂无用药记录。</p>'}
            </section>
            <section class="report-section">
              <div class="report-section-head"><span class="report-number">04</span><h2>近期身体状态</h2><span>近 30 天</span></div>
              ${dailySummary.count ? `
                <div class="report-vitals">
                  <div><span>平均静息心率</span><strong>${dailySummary.avgHr ? dailySummary.avgHr + ' <small>bpm</small>' : '—'}</strong></div>
                  <div><span>体重变化</span><strong>${dailySummary.weightChange !== null ? `${dailySummary.weightChange > 0 ? '+' : ''}${dailySummary.weightChange.toFixed(1)} <small>kg</small>` : '—'}</strong></div>
                  <div><span>打卡天数</span><strong>${dailySummary.count} <small>天</small></strong></div>
                </div>
                <p class="report-body-text"><strong>主要感受：</strong>${dailySummary.symptoms.length ? esc(dailySummary.symptoms.join('、')) : '近期记录无明显不适'}。</p>
                ${dailySummary.flags.length ? `<p class="report-alert">${icon('alert')}近期记录到：${esc([...new Set(dailySummary.flags)].join('、'))}。请向医生说明。</p>` : ''}
              ` : '<p class="report-empty">近 30 天没有每日状态记录。</p>'}
            </section>
          </div>

          <section class="report-section report-questions">
            <div class="report-section-head"><span class="report-number">05</span><h2>想和医生讨论的问题</h2><span>由患者填写</span></div>
            ${profile.summaryQuestions ? `<div class="report-question-text">${nl2br(profile.summaryQuestions)}</div>` : `<p class="report-empty">还没有填写。可在上方「编辑问题」中补充。</p>`}
          </section>

          <footer class="report-footer">
            <div>
              <strong>阅读说明</strong>
              <p>本摘要由患者自行录入的数据自动生成，仅用于就诊沟通，不作为诊断、处方或调整治疗的依据。化验结果请以原始检验报告为准；如有紧急不适，请及时就医。</p>
            </div>
            <span>蝶迹 · 本机生成</span>
          </footer>
        </article>
      </div>`;
  }

  function buildDailySummary() {
    const cutoff = U.dateKey(U.addDays(todayKey(), -30));
    const entries = (state.daily || []).filter((entry) => entry.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    const hrValues = entries.map((entry) => Number(entry.heartRate)).filter((value) => Number.isFinite(value) && value > 0);
    const weights = entries.map((entry) => Number(entry.weight)).filter((value) => Number.isFinite(value) && value > 0);
    const symptomTotals = {};
    entries.forEach((entry) => {
      SYMPTOMS.forEach((symptom) => {
        const level = Number(entry.symptoms && entry.symptoms[symptom.key]) || 0;
        if (level > 0) symptomTotals[symptom.short] = (symptomTotals[symptom.short] || 0) + level;
      });
    });
    const symptoms = Object.entries(symptomTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, score]) => `${name}（累计程度 ${score}）`);
    const flags = entries.flatMap((entry) => (entry.flags || []).map((flagKey) => {
      const flag = FLAGS.find((item) => item.key === flagKey);
      return flag ? flag.name : flagKey;
    }));
    return {
      count: entries.length,
      avgHr: hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null,
      weightChange: weights.length >= 2 ? weights[weights.length - 1] - weights[0] : null,
      symptoms,
      flags
    };
  }

  /* ------------------------------------------------------------------------
     LEARN PAGE
     ------------------------------------------------------------------------ */
  function renderLearn() {
    const head = pageHead({
      eyebrow: '健康教育 · 与医生一起做决定',
      title: '健康知识',
      subtitle: '把最常见的疑问讲清楚，帮助你在复诊时问出更好的问题。内容不替代个体化诊疗。',
      actions: `<a class="btn btn-secondary" href="#/summary">${icon('file')}就诊摘要</a><a class="btn btn-primary" href="#/visits">${icon('calendar')}复查计划</a>`
    });
    return `
      <div class="page learn-page">
        ${head}
        <section class="learn-hero">
          <div class="learn-hero-copy">
            <span class="learn-kicker">A CALMER WAY TO UNDERSTAND</span>
            <h2>先理解，<br>再和医生一起决定。</h2>
            <p>甲亢的治疗是一个持续调整的过程。数字会波动，方案也会变化。这里整理的是常见原则，不是给你的个人处方。</p>
          </div>
          <div class="learn-hero-art" aria-hidden="true">
            <svg viewBox="0 0 300 210" fill="none">
              <circle cx="152" cy="102" r="78" stroke="rgba(247,243,232,.18)"/>
              <circle cx="152" cy="102" r="54" stroke="rgba(247,243,232,.26)"/>
              <path d="M114 94c8-13 22-19 33-12 7 5 9 14 5 23-5 12-18 18-29 13-10-4-15-14-9-24Z" fill="rgba(184,220,204,.5)"/>
              <path d="M188 94c-8-13-22-19-33-12-7 5-9 14-5 23 5 12 18 18 29 13 10-4 15-14 9-24Z" fill="rgba(240,230,211,.6)"/>
              <path d="M151 101v28" stroke="#f4efe3" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="151" cy="88" r="5" fill="#f4efe3"/>
              <path d="M78 176h146M103 161v30M203 161v30" stroke="rgba(255,255,255,.14)"/>
            </svg>
          </div>
        </section>

        <section class="red-flag-card">
          <div class="red-flag-heading">
            <span class="red-flag-icon">${icon('alert')}</span>
            <div><span class="safety-kicker">需要尽快就医</span><h2>这些情况，不要等下一次复查。</h2></div>
          </div>
          <div class="red-flag-grid">
            <div><strong>发热与咽痛</strong><p>服抗甲状腺药期间出现高热、明显咽痛或口腔溃疡，尽快联系医生并检查血常规。</p></div>
            <div><strong>黄疸信号</strong><p>皮肤或眼白发黄、尿色明显加深、持续恶心或右上腹不适，尽快就医。</p></div>
            <div><strong>眼部急症</strong><p>眼痛、畏光明显加重、复视或视力下降，应尽快到眼科评估。</p></div>
            <div><strong>心肺症状</strong><p>胸痛、晕厥、呼吸困难或心悸突然明显加重，请及时就医或呼叫急救。</p></div>
          </div>
        </section>

        <div class="knowledge-toolbar">
          <div><span class="section-kicker">READING ROOM</span><h2>从你此刻最关心的问题开始</h2></div>
          <span class="knowledge-count">10 篇 · 通俗整理</span>
        </div>

        <div class="knowledge-grid">
          ${knowledgeCard({
            category: '读懂检查', tone: 'sage', read: '约 3 分钟',
            title: '甲功化验单，先看哪几项？',
            lead: 'TSH、FT4、FT3 分别在说什么？为什么不能只看一个数值？',
            content: `
              <p>常见的甲功组合包括 <strong>TSH（促甲状腺激素）</strong>、<strong>FT4（游离甲状腺素）</strong>和 <strong>FT3（游离三碘甲状腺原氨酸）</strong>。不同医院和实验室的具体组合可能不同。</p>
              <ul>
                <li><strong>FT4 / FT3</strong> 更直接反映血液中甲状腺激素的水平。甲亢时通常升高。</li>
                <li><strong>TSH</strong> 是垂体对甲状腺激素的反馈。甲状腺激素过多时，TSH 通常会被抑制而偏低。</li>
                <li>治疗过程中，FT4/FT3 可能先恢复，而 TSH 需要更长时间才回到参考范围。</li>
              </ul>
              <p class="knowledge-callout">单看一次结果不足以判断病情。用药阶段、症状、抗体、肝功能和血常规等信息，医生会一起考虑。</p>`
          })}
          ${knowledgeCard({
            category: '读懂检查', tone: 'ochre', read: '约 2 分钟',
            title: '为什么 TSH 和 FT4 的方向常常相反？',
            lead: '一个偏高、一个偏低，并不一定是化验错了。',
            content: `
              <p>可以把 TSH 理解为垂体发给甲状腺的“指令”。当血液里的甲状腺激素偏多时，垂体减少 TSH 分泌，试图让甲状腺“放慢一点”；所以甲亢常见 <strong>FT4/FT3 高、TSH 低</strong>。</p>
              <p>在治疗过程中，激素水平下降后，垂体需要一段时间恢复，TSH 可能仍然偏低，或者逐步回升。这就是为什么医生有时更关注 FT4/FT3 的即时变化，同时观察 TSH 的长期趋势。</p>
              <p class="knowledge-callout">不要只凭 TSH 一项自行加减药。治疗目标会受到病因、年龄、妊娠状态、心脏情况等因素影响。</p>`
          })}
          ${knowledgeCard({
            category: '化验常识', tone: 'stone', read: '约 2 分钟',
            title: '参考范围，为什么要以你的化验单为准？',
            lead: '不同实验室的仪器、方法和单位不同，数字不能跨化验单硬比。',
            content: `
              <p>每个实验室会根据自己使用的检测方法和人群设定参考范围。同一个数值，在一家实验室可能“轻微偏高”，在另一家也许已经在参考范围内。</p>
              <p>蝶迹会为每一次记录单独保存参考范围，也是因为这一点。回看趋势时，也应留意化验单是否来自同一实验室、是否更换了检测方法。</p>
              <p class="knowledge-callout">参考范围不等于“个体治疗目标”。例如妊娠期、老年人或合并心脏病时，医生关注的重点可能不同。</p>`
          })}
          ${knowledgeCard({
            category: '用药安全', tone: 'rose', read: '约 3 分钟', featured: true,
            title: '服用抗甲状腺药，哪些信号要尽快就医？',
            lead: '发热伴咽痛、黄疸或广泛皮疹，不要自行观察等待。',
            content: `
              <p>甲巯咪唑和丙硫氧嘧啶是治疗甲亢常用的抗甲状腺药物，具体使用由医生决定。治疗期间需要关注少数但重要的不良反应。</p>
              <ul>
                <li><strong>发热、明显咽痛、口腔溃疡：</strong>可能提示白细胞或中性粒细胞减少，需尽快联系医生并检查血常规。</li>
                <li><strong>皮肤或眼白发黄、尿色加深：</strong>可能提示肝脏损伤，需要尽快评估。</li>
                <li><strong>广泛皮疹、明显瘙痒或面部肿胀：</strong>让医生判断是否与药物有关。</li>
                <li><strong>关节明显疼痛、气促等异常：</strong>也需要及时告诉医生。</li>
              </ul>
              <p>不要因为担心副作用就自行停药，也不要强忍不适等到预约日。尽快联系医生或前往急诊，并告知正在使用的药物；如何处理由医生决定。</p>`
          })}
          ${knowledgeCard({
            category: '用药安全', tone: 'sage', read: '约 2 分钟',
            title: '复查肝功能和血常规，在监测什么？',
            lead: '这些检查不是为了增加焦虑，而是为了更安全地用药。',
            content: `
              <p>抗甲状腺药物可能影响白细胞和肝功能。因此医生会根据治疗阶段、既往结果与个人情况安排血常规或肝功能检查；具体项目与频率因人而异。</p>
              <p>在蝶迹里，你可以把这些结果和甲功记录在一起，复诊时更容易说明“什么时候查过、结果如何、有没有变化”。</p>
              <p class="knowledge-callout">如果医生没有安排某项检查，不代表一定不需要；如果你出现相关症状，即使还没到预约日，也应主动联系医生。</p>`
          })}
          ${knowledgeCard({
            category: '日常管理', tone: 'ochre', read: '约 3 分钟',
            title: '甲亢期间，碘盐、海带到底怎么吃？',
            lead: '不需要盲目“零碘”，但应避免额外大量摄碘。',
            content: `
              <p>碘是合成甲状腺激素的原料。甲亢未控制时，大量摄入碘可能不利于病情控制。日常通常建议避免海带、紫菜等高碘食物的大量摄入，具体饮食限制请听从医生或营养师建议。</p>
              <p>使用加碘盐时无需过度恐慌，也不建议自行改成完全无碘饮食。做增强 CT、造影等含碘检查前，记得告诉医生你有甲亢。</p>
              <p class="knowledge-callout">保证足够能量与蛋白质、规律作息、限制酒精和过量咖啡因，往往比追求某种“神奇食物”更重要。</p>`
          })}
          ${knowledgeCard({
            category: '日常管理', tone: 'stone', read: '约 2 分钟',
            title: '心率、体重和睡眠，是很有价值的线索',
            lead: '每天 1 分钟的小记录，能补上化验单看不到的细节。',
            content: `
              <p>甲亢可能带来心悸、手抖、怕热、多汗、体重下降、排便增多和睡眠变差。开始治疗后，这些感受通常会逐渐减轻，但速度因人而异。</p>
              <p>记录静息心率、体重、睡眠和症状程度，可以帮助你和医生描述“我最近到底怎么样”。比单次数字更有意义的，是几周内的走向。</p>
              <p class="knowledge-callout">如果静息心率持续很快、胸痛、气短或晕厥，请及时就医。应用里的记录不能替代心电图或其他检查。</p>`
          })}
          ${knowledgeCard({
            category: '特殊阶段', tone: 'rose', read: '约 3 分钟',
            title: '备孕、怀孕与甲亢：需要提前规划',
            lead: '不要擅自停药，也不要等到怀孕后再调整方案。',
            content: `
              <p>甲亢本身以及抗甲状腺药物都可能影响妊娠过程。如果有备孕计划，应提前与内分泌科医生沟通，并在医生指导下把甲状腺功能控制在合适范围。</p>
              <p>怀孕后，药物种类和剂量可能需要调整，甲功监测也会更频繁。请同时与内分泌科和产科团队随访，不要自行停药或换药。</p>
              <p class="knowledge-callout">如果怀孕期间出现明显心悸、持续呕吐、发热或其他不适，请尽快联系医生。</p>`
          })}
          ${knowledgeCard({
            category: '眼部健康', tone: 'sage', read: '约 2 分钟',
            title: 'Graves 眼病：戒烟与日常照护',
            lead: '眼部不适不总是“看累了”，有些变化需要尽快到眼科。',
            content: `
              <p>部分 Graves 病患者会出现眼干、畏光、眼睑肿胀、眼球突出或复视。戒烟非常重要；外出可戴太阳镜，眼干时可在医生建议下使用人工泪液。</p>
              <p>睡觉时抬高床头、减少长时间用眼，可能有助于缓解部分不适。不要自行使用含激素的眼药水。</p>
              <p class="knowledge-callout">出现眼痛、视力下降、明显复视或眼球活动受限时，请尽快到眼科就诊。</p>`
          })}
          ${knowledgeCard({
            category: '复诊准备', tone: 'stone', read: '约 2 分钟',
            title: '复诊时间有限，怎样把问题问清楚？',
            lead: '带上数据、说清变化、只问最重要的两三件事。',
            content: `
              <p>复诊前可以先写下三个最关心的问题，例如：现阶段治疗目标是什么？最近的变化需要调整方案吗？下次复查安排在什么时候？</p>
              <p>用自己的话描述身体变化，包括时间、频率和影响程度。例如“最近两周下午会心慌，每次约十分钟”，比“有点不舒服”更容易帮助医生判断。</p>
              <p>把正在使用的药物、实际服用方式和近期化验单一起带上。如果曾漏服或有不适，也请如实告诉医生，不需要因为担心被批评而隐瞒。</p>
              <p class="knowledge-callout">蝶迹可以生成一页就诊摘要，但它只是记录整理，不能替代你的病历和医生的判断。</p>`
          })}
        </div>

        <section class="knowledge-sources">
          <div class="sources-mark">${icon('book')}</div>
          <div>
            <h3>内容依据与说明</h3>
            <p>本页内容面向患者做通俗整理，参考中华医学会内分泌学分会相关甲亢诊治指南及常见患者教育资料，并经编辑整理。它不能替代医生的诊断、处方或个体化建议，具体处理请以你的医生意见为准。</p>
            <p class="sources-small">如果你觉得某段内容不清楚，欢迎把它带进下一次复诊，和医生讨论。</p>
          </div>
        </section>
      </div>`;
  }

  function knowledgeCard(options) {
    return `
      <details class="knowledge-card tone-${options.tone}${options.featured ? ' is-featured' : ''}">
        <summary>
          <span class="knowledge-card-top"><span class="knowledge-category">${esc(options.category)}</span><span class="knowledge-read">${esc(options.read)}</span></span>
          <h3>${esc(options.title)}</h3>
          <span class="knowledge-lead">${esc(options.lead)}</span>
          <span class="knowledge-expand">展开阅读 ${icon('arrow-right')}</span>
        </summary>
        <div class="knowledge-body">${options.content}</div>
      </details>`;
  }

  /* ------------------------------------------------------------------------
     SETTINGS PAGE
     ------------------------------------------------------------------------ */
  function renderSettings() {
    const profile = state.profile || {};
    const counts = {
      records: (state.records || []).length,
      daily: (state.daily || []).length,
      meds: (state.medications || []).length,
      visits: (state.visits || []).length
    };
    const bytes = U.estimateBytes(state);
    const sizeText = bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const recoveryAvailable = Boolean(JK.data.getRecoveryRaw());
    const head = pageHead({
      eyebrow: '个人与设置 · 数据属于你',
      title: '个人与设置',
      subtitle: '管理档案、参考范围与本地数据。蝶迹没有账号系统，也不会把记录上传到云端。',
      actions: ''
    });
    return `
      <div class="page settings-page">
        ${head}
        <div class="settings-layout">
          <div class="settings-main">
            <section class="card settings-card">
              ${cardHeader('个人与诊断', '用于就诊摘要与趋势说明', '', 'user')}
              <form id="profileForm" class="settings-form" novalidate>
                <div class="form-grid two-col">
                  <label class="field"><span>怎么称呼你</span><input type="text" name="profileName" maxlength="24" value="${esc(profile.name)}" placeholder="例如：林岚" autocomplete="nickname"></label>
                  <label class="field"><span>性别</span><select name="profileSex"><option value="">请选择</option>${['女', '男', '其他 / 不愿透露'].map((sex) => `<option value="${sex}" ${profile.sex === sex ? 'selected' : ''}>${sex}</option>`).join('')}</select></label>
                  <label class="field"><span>出生年份</span><input type="number" name="profileBirthYear" min="1900" max="${new Date().getFullYear()}" value="${esc(profile.birthYear)}" placeholder="例如：1994"></label>
                  <label class="field"><span>确诊时间</span><input type="date" name="profileDiagnosedAt" value="${esc(profile.diagnosedAt)}" max="${todayKey()}"></label>
                  <label class="field full"><span>诊断</span><input type="text" name="profileDiagnosis" maxlength="80" value="${esc(profile.diagnosis)}" placeholder="例如：Graves 病" list="diagnosisOptions"><datalist id="diagnosisOptions"><option value="Graves 病"><option value="毒性多结节性甲状腺肿"><option value="甲状腺自主高功能腺瘤"><option value="其他 / 未明确"></datalist></label>
                  <label class="field"><span>随访医院</span><input type="text" name="profileHospital" maxlength="60" value="${esc(profile.hospital)}" placeholder="例如：市第一人民医院"></label>
                  <label class="field"><span>随访医生</span><input type="text" name="profileDoctor" maxlength="40" value="${esc(profile.doctor)}" placeholder="例如：陈知远 医生"></label>
                </div>
                <div class="form-actions"><span class="form-hint">这些信息只用于应用内展示和就诊摘要。</span><button type="submit" class="btn btn-primary">${icon('check')}保存档案</button></div>
              </form>
            </section>

            <section class="card settings-card">
              ${cardHeader('参考范围默认值', '仅影响之后新增的化验记录', '', 'settings')}
              <form id="rangesForm" class="ranges-form" novalidate>
                <div class="range-form-grid">
                  ${INDICATOR_ORDER.map((key) => {
                    const meta = INDICATORS[key];
                    const range = state.settings.ranges[key] || { low: meta.low, high: meta.high };
                    return `<div class="range-form-item">
                      <div class="range-form-label"><strong>${key}</strong><span>${esc(meta.name)}</span><small>${esc(meta.unit)}</small></div>
                      <div class="range-form-inputs">
                        <label><span>下限</span><input type="text" inputmode="decimal" name="range_${key}_low" value="${esc(range.low)}"></label>
                        <span class="range-dash">–</span>
                        <label><span>上限</span><input type="text" inputmode="decimal" name="range_${key}_high" value="${esc(range.high)}"></label>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
                <div class="range-notice">${icon('info')} 不同医院、不同检测方法的参考范围不同。请优先使用你的化验单上的数值。修改默认值不会改动已保存的检查记录。</div>
                <div class="form-actions">
                  <button type="button" class="btn btn-ghost" data-action="reset-ranges">${icon('refresh')}恢复示例默认值</button>
                  <button type="submit" class="btn btn-primary">${icon('check')}保存参考范围</button>
                </div>
              </form>
            </section>

            <section class="card settings-card data-card">
              ${cardHeader('数据与备份', '所有数据保存在当前浏览器', '', 'file')}
              <div class="data-stats">
                <div><strong>${counts.records}</strong><span>检查记录</span></div>
                <div><strong>${counts.daily}</strong><span>状态打卡</span></div>
                <div><strong>${counts.meds}</strong><span>用药记录</span></div>
                <div><strong>${sizeText}</strong><span>本地占用</span></div>
              </div>
              <div class="data-actions">
                <button type="button" class="data-action" data-action="export-json">${icon('download')}<span class="data-action-copy"><strong>导出完整备份</strong><span>包含所有记录与档案的 JSON 文件</span></span>${icon('chevron-right')}</button>
                <button type="button" class="data-action" data-action="export-csv">${icon('file')}<span class="data-action-copy"><strong>导出化验 CSV</strong><span>适合在 Excel 中查看的指标明细</span></span>${icon('chevron-right')}</button>
                <button type="button" class="data-action" data-action="import-json">${icon('upload')}<span class="data-action-copy"><strong>从备份导入</strong><span>用之前的 JSON 备份覆盖当前数据</span></span>${icon('chevron-right')}</button>
                <input type="file" id="importFile" accept=".json,application/json" hidden>
              </div>
              ${recoveryAvailable ? `<div class="data-recovery">
                <span class="data-recovery-icon">${icon('alert')}</span>
                <div><strong>发现一份无法读取的本地数据副本</strong><p>应用当前使用临时数据。原始内容仍保留在本机，可先下载留档。</p></div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="export-recovery">下载恢复副本</button>
              </div>` : ''}
              <div class="data-danger">
                <div>
                  <h3>数据管理</h3>
                  <p>可以重新载入演示数据，或清空本机上的全部记录。清空后无法恢复，建议先导出备份。</p>
                </div>
                <div class="danger-actions">
                  <button type="button" class="btn btn-ghost btn-sm" data-action="load-demo">${icon('refresh')}载入演示数据</button>
                  <button type="button" class="btn btn-danger-ghost btn-sm" data-action="clear-all">${icon('trash')}清空全部数据</button>
                </div>
              </div>
            </section>
          </div>
          <aside class="settings-aside">
            <section class="card privacy-panel">
              <span class="privacy-panel-icon">${icon('lock')}</span>
              <h2>只属于你的记录</h2>
              <p>蝶迹把数据保存在浏览器 localStorage 中，没有账号、没有服务器同步，也不会上传任何健康信息。</p>
              <ul>
                <li>${icon('check')}不上传、不追踪、不投放广告</li>
                <li>${icon('check')}不需要手机号或实名认证</li>
                <li>${icon('check')}可随时导出完整备份</li>
              </ul>
              <p class="privacy-warning">清理浏览器数据、使用无痕模式或更换设备，都可能导致记录丢失。请定期下载备份。</p>
              <div class="storage-pill ${storageOK ? 'ok' : 'warn'}"><span></span>${storageOK ? '本地存储可用' : '本地存储受限'}</div>
              <p class="install-hint">${icon('smartphone')} 在手机浏览器中打开后，可尝试“添加到主屏幕”，方便下次直接访问。</p>
            </section>
            <section class="card about-panel">
              <div class="about-brand"><span class="footer-mark">${icon('activity')}</span><div><strong>蝶迹</strong><span>THYROID CARE</span></div></div>
              <p>一个安静、清楚、尊重隐私的甲亢记录工具。</p>
              <div class="about-row"><span>版本</span><strong>1.3.0 · 本地优先</strong></div>
              <div class="about-row"><span>数据位置</span><strong>当前浏览器</strong></div>
              <div class="about-row"><span>医疗内容</span><strong>患者教育参考</strong></div>
              <p class="about-disclaimer">本应用不提供诊断、处方或治疗调整建议，不能替代专业医疗照护。如出现紧急症状，请及时就医。</p>
            </section>
          </aside>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------------
     ROUTER + PAGE CHART MOUNTING
     ------------------------------------------------------------------------ */
  const pages = {
    overview: renderOverview,
    trends: renderTrends,
    records: renderRecords,
    medications: renderMedications,
    visits: renderVisits,
    learn: renderLearn,
    settings: renderSettings,
    summary: renderSummary
  };

  function getRouteId() {
    const raw = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return pages[raw] ? raw : 'overview';
  }

  function renderRoute(options) {
    const opts = options || {};
    const nextRoute = getRouteId();
    const routeChanged = nextRoute !== currentRoute;
    if (routeChanged && modalStack.length) closeAllModals();
    cleanupCharts();
    chartAnimationDisabled = opts.animateCharts === false;
    currentRoute = nextRoute;
    const renderer = pages[currentRoute] || renderOverview;
    appEl.innerHTML = renderer();
    if (!opts.silent) {
      const pageNode = appEl.querySelector('.page');
      if (pageNode) pageNode.classList.add('page-enter');
    }
    updateChrome();
    if (!opts.preserveScroll) window.scrollTo({ top: 0, behavior: 'auto' });
    if (routeChanged && !opts.initial) appEl.focus({ preventScroll: true });
    requestAnimationFrame(() => mountPageCharts(currentRoute));
  }

  function mountPageCharts(route) {
    if (route === 'overview') {
      const chartEl = document.getElementById('heroTrendChart');
      const latest = M.latestRecord(state);
      if (!chartEl || !latest) return;
      const key = chartEl.getAttribute('data-indicator') || 'TSH';
      const points = M.seriesFor(state, key, 183);
      if (!points.length) return;
      const latestPoint = points[points.length - 1];
      const ref = { low: latestPoint.low, high: latestPoint.high };
      mountChart(chartEl, {
        points,
        indicator: key,
        variant: 'dark',
        compact: true,
        height: chartHeight(false),
        showReference: true,
        showXAxis: true,
        showYAxis: false,
        reference: ref,
        animate: !chartAnimationDisabled,
        onSelect: (point) => openRecordDetails(point.recordId)
      });
    }
    if (route === 'trends') {
      const chartEl = document.getElementById('trendMainChart');
      if (!chartEl) return;
      const key = trendState.indicator;
      const points = M.seriesFor(state, key, trendState.days || 0);
      if (!points.length) return;
      const latestPoint = points[points.length - 1];
      mountChart(chartEl, {
        points,
        indicator: key,
        compact: false,
        height: chartHeight(true),
        showReference: true,
        showXAxis: true,
        showYAxis: true,
        reference: { low: latestPoint.low, high: latestPoint.high },
        emptyText: '这个时间范围内还没有记录',
        animate: !chartAnimationDisabled,
        onSelect: (point) => openRecordDetails(point.recordId)
      });
    }
    if (route === 'summary') {
      PRIMARY_INDICATORS.forEach((key) => {
        const chartEl = document.querySelector(`[data-summary-chart="${key}"]`);
        if (!chartEl) return;
        const points = M.seriesFor(state, key, 365);
        if (!points.length) {
          chartEl.innerHTML = '<span class="summary-chart-empty">暂无足够数据</span>';
          return;
        }
        const latestPoint = points[points.length - 1];
        mountChart(chartEl, {
          points,
          indicator: key,
          compact: true,
          height: 150,
          showReference: true,
          showXAxis: true,
          showYAxis: false,
          reference: { low: latestPoint.low, high: latestPoint.high },
          animate: !chartAnimationDisabled
        });
      });
    }
  }

  /* ------------------------------------------------------------------------
     Modal infrastructure
     ------------------------------------------------------------------------ */
  let modalIdCounter = 0;

  function openModal(config) {
    const opts = config || {};
    const titleId = `modalTitle${++modalIdCounter}`;
    const layer = document.createElement('div');
    layer.className = `modal-layer${opts.className ? ' ' + opts.className : ''}`;
    layer.innerHTML = `
      <div class="modal-backdrop" data-close-layer></div>
      <section class="modal-sheet ${opts.sheetClass || ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <header class="modal-head">
          <div>
            ${opts.eyebrow ? `<span class="modal-eyebrow">${esc(opts.eyebrow)}</span>` : ''}
            <h2 id="${titleId}">${opts.title || ''}</h2>
            ${opts.subtitle ? `<p>${opts.subtitle}</p>` : ''}
          </div>
          <button type="button" class="icon-btn modal-close" data-close-layer aria-label="关闭">${icon('close')}</button>
        </header>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.footer ? `<footer class="modal-foot">${opts.footer}</footer>` : ''}
      </section>`;
    modalRoot.appendChild(layer);
    const restoreFocus = document.activeElement;
    const record = { layer, onClose: opts.onClose, restoreFocus };
    modalStack.push(record);
    document.body.classList.add('modal-open');
    const appShell = document.querySelector('.app-shell');
    const mobileNav = document.querySelector('.mobile-nav');
    if (appShell) appShell.setAttribute('inert', '');
    if (mobileNav) mobileNav.setAttribute('inert', '');
    requestAnimationFrame(() => {
      layer.classList.add('is-open');
      const focusTarget = opts.initialFocus
        ? layer.querySelector(opts.initialFocus)
        : layer.querySelector('input:not([type="hidden"]), select, textarea, button:not([data-close-layer])')
          || layer.querySelector('.modal-close');
      if (focusTarget) {
        try { focusTarget.focus({ preventScroll: true }); } catch (error) { focusTarget.focus(); }
      }
    });
    layer.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-layer]')) closeModal(layer);
    });
    if (typeof opts.onMount === 'function') opts.onMount(layer);
    return layer;
  }

  function closeModal(layer) {
    const target = layer || (modalStack.length ? modalStack[modalStack.length - 1].layer : null);
    if (!target) return;
    const index = modalStack.findIndex((item) => item.layer === target);
    if (index === -1) return;
    const record = modalStack[index];
    modalStack.splice(index, 1);
    if (document.body.classList.contains('modal-open')) {
      if (!modalStack.length) {
        document.body.classList.remove('modal-open');
        const appShell = document.querySelector('.app-shell');
        const mobileNav = document.querySelector('.mobile-nav');
        if (appShell) appShell.removeAttribute('inert');
        if (mobileNav) mobileNav.removeAttribute('inert');
      }
    }
    if (typeof record.onClose === 'function') {
      try { record.onClose(); } catch (error) { console.warn(error); }
    }
    if (!modalStack.length) {
      try {
        if (record.restoreFocus && record.restoreFocus.isConnected) record.restoreFocus.focus({ preventScroll: true });
      } catch (error) { /* no-op */ }
    } else {
      const top = modalStack[modalStack.length - 1].layer;
      const best = top.querySelector('input:not([type="hidden"]), select, textarea, button:not([data-close-layer])');
      if (best) setTimeout(() => { try { best.focus({ preventScroll: true }); } catch (error) {} }, 0);
    }
    target.classList.add('is-closing');
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    setTimeout(() => target.remove(), delay);
  }

  function closeAllModals() {
    const layers = modalStack.map((item) => item.layer);
    modalStack.slice().forEach((item) => {
      if (typeof item.onClose === 'function') {
        try { item.onClose(); } catch (error) { /* no-op */ }
      }
    });
    modalStack = [];
    layers.forEach((layer) => layer.remove());
    document.body.classList.remove('modal-open');
    const appShell = document.querySelector('.app-shell');
    const mobileNav = document.querySelector('.mobile-nav');
    if (appShell) appShell.removeAttribute('inert');
    if (mobileNav) mobileNav.removeAttribute('inert');
  }

  function confirmDialog(options) {
    const opts = options || {};
    return new Promise((resolve) => {
      let settled = false;
      let layerRef = null;
      layerRef = openModal({
        title: opts.title || '请确认',
        eyebrow: opts.eyebrow || '需要你的确认',
        className: 'modal-confirm-layer',
        sheetClass: 'confirm-sheet',
        body: `<p class="confirm-message">${esc(opts.message || '')}</p>${opts.detail ? `<div class="confirm-detail">${esc(opts.detail)}</div>` : ''}`,
        footer: `
          <button type="button" class="btn btn-ghost" data-close-layer>取消</button>
          <button type="button" class="btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}" data-confirm-action>${esc(opts.confirmLabel || '确认')}</button>`,
        initialFocus: '[data-confirm-action]',
        onClose: () => {
          if (!settled) { settled = true; resolve(false); }
        },
        onMount: (layer) => {
          const confirmButton = layer.querySelector('[data-confirm-action]');
          if (confirmButton) {
            confirmButton.addEventListener('click', () => {
              settled = true;
              closeModal(layer);
              resolve(true);
            });
          }
        }
      });
    });
  }

  function showToast(message, tone, duration) {
    const type = tone || 'default';
    const iconName = type === 'success' ? 'check' : type === 'warning' || type === 'error' ? 'alert' : 'info';
    if (toastTimer) clearTimeout(toastTimer);
    toastRegion.innerHTML = `<div class="toast toast-${type}">${icon(iconName)}<span></span></div>`;
    const textEl = toastRegion.querySelector('span');
    if (textEl) textEl.textContent = message;
    const toastEl = toastRegion.querySelector('.toast');
    requestAnimationFrame(() => { if (toastEl) toastEl.classList.add('is-visible'); });
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.classList.remove('is-visible');
      setTimeout(() => { if (toastRegion.contains(toastEl)) toastRegion.innerHTML = ''; }, 220);
    }, duration || 3600);
  }

  function showFormError(form, message) {
    if (!form) return;
    let errorEl = form.querySelector('.form-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'form-error';
      form.prepend(errorEl);
    }
    errorEl.setAttribute('role', 'alert');
    errorEl.innerHTML = `${icon('alert')}<span></span>`;
    errorEl.querySelector('span').textContent = message;
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideFormError(form) {
    const errorEl = form && form.querySelector('.form-error');
    if (errorEl) errorEl.hidden = true;
  }

  function parseNumberInput(raw) {
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim().replace(/，/g, '.').replace(/。/g, '.');
    if (!value) return null;
    if (!/^\d+(?:\.\d+)?$/.test(value)) return NaN;
    return Number(value);
  }

  function finishSave(message, options) {
    const opts = options || {};
    const ok = persist(true);
    closeAllModals();
    renderRoute({ preserveScroll: opts.preserveScroll !== false, silent: true });
    if (!ok) {
      showToast('浏览器无法写入本地存储，记录可能不会保留。请导出备份后检查浏览器设置。', 'error', 7000);
      return false;
    }
    if (message) showToast(message, opts.tone || 'success');
    return true;
  }

  function finishInlineUpdate(message) {
    const ok = persist(true);
    renderRoute({ preserveScroll: true, silent: true, animateCharts: false });
    if (!ok) showToast('浏览器无法写入本地存储，记录可能不会保留。', 'error', 6000);
    else if (message) showToast(message, 'success', 1800);
    return ok;
  }

  function goTo(route) {
    const target = `#/${route}`;
    closeAllModals();
    if (window.location.hash === target) renderRoute({ preserveScroll: false });
    else window.location.hash = target;
  }

  /* ------------------------------------------------------------------------
     LAB MODAL
     ------------------------------------------------------------------------ */
  function labRowMarkup(key, record) {
    const meta = INDICATORS[key];
    const entry = record && record.panel ? record.panel[key] : null;
    const defaults = state.settings.ranges[key] || { low: meta.low, high: meta.high };
    const low = entry ? entry.low : defaults.low;
    const high = entry ? entry.high : defaults.high;
    const value = entry && entry.value !== undefined && entry.value !== null ? entry.value : '';
    return `
      <div class="lab-field-row" data-lab-row="${key}">
        <div class="lab-field-name">
          <span class="lab-abbr">${key}</span>
          <div><strong>${esc(meta.name)}</strong><small>${esc(meta.unit)}</small></div>
        </div>
        <div class="lab-field-value">
          <input type="text" inputmode="decimal" name="value_${key}" value="${esc(value)}" placeholder="—" autocomplete="off" aria-label="${esc(meta.name)} 数值">
          <span class="lab-live-status tone-muted">未填</span>
        </div>
        <details class="lab-range-detail">
          <summary><span>参考</span><span class="range-edit-text">${U.formatRange(low, high, key)}</span>${icon('chevron-down')}</summary>
          <div class="lab-range-edit">
            <label><span>下限</span><input type="text" inputmode="decimal" name="low_${key}" value="${esc(low)}" aria-label="${esc(meta.name)}参考下限"></label>
            <span class="range-dash">–</span>
            <label><span>上限</span><input type="text" inputmode="decimal" name="high_${key}" value="${esc(high)}" aria-label="${esc(meta.name)}参考上限"></label>
          </div>
        </details>
      </div>`;
  }

  function openLabModal(recordId) {
    const record = recordId ? state.records.find((item) => item.id === recordId) : null;
    const hasOptional = record && C.OPTIONAL_GROUPS.some((group) => group.keys.some((key) => Boolean(record.panel && record.panel[key])));
    const hospitalOptions = [...new Set(state.records.map((item) => item.hospital).filter(Boolean))];
    const body = `
      <form id="labForm" class="modal-form" novalidate>
        <div class="form-error" hidden></div>
        <input type="hidden" name="recordId" value="${esc(record ? record.id : '')}">
        <section class="form-section">
          <div class="form-section-heading"><h3>基本信息</h3><span>记录当时的参考范围，回看更准确</span></div>
          <div class="form-grid two-col">
            <label class="field"><span>检查日期 <em>*</em></span><input type="date" name="recordDate" value="${esc(record ? record.date : todayKey())}" max="${todayKey()}" required></label>
            <label class="field"><span>医院 / 实验室</span><input type="text" name="recordHospital" maxlength="60" value="${esc(record ? record.hospital : state.profile.hospital || '')}" placeholder="例如：市第一人民医院" list="hospitalOptions"></label>
            <datalist id="hospitalOptions">${hospitalOptions.map((hospital) => `<option value="${esc(hospital)}">`).join('')}</datalist>
            <label class="field"><span>医生</span><input type="text" name="recordDoctor" maxlength="40" value="${esc(record ? record.doctor : state.profile.doctor || '')}" placeholder="选填"></label>
            <label class="checkbox-field compact-checkbox"><input type="checkbox" name="recordFasting" ${record ? (record.fasting ? 'checked' : '') : 'checked'}><span class="checkbox-ui">${icon('check')}</span><span>空腹抽血</span></label>
          </div>
        </section>
        <section class="form-section">
          <div class="form-section-heading"><h3>甲功指标</h3><span>至少填写一项，留空表示本次未检查</span></div>
          <p class="unit-note">${icon('info')} 当前版本按上列常用单位记录。若你的化验单使用其他单位，请先咨询医生或检验科并确认换算方式，再统一单位录入，避免跨单位比较。</p>
          <div class="lab-field-list">
            ${PRIMARY_INDICATORS.map((key) => labRowMarkup(key, record)).join('')}
          </div>
          <details class="advanced-labs" ${hasOptional ? 'open' : ''}>
            <summary>
              <span class="advanced-summary-title">${icon('plus')}更多检查项目</span>
              <span class="advanced-summary-sub">总 T3/T4 · 抗体 · 肝功 · 血常规</span>
              ${icon('chevron-down', 'advanced-chevron')}
            </summary>
            <div class="advanced-lab-groups">
              ${C.OPTIONAL_GROUPS.map((group) => `
                <div class="advanced-lab-group">
                  <div class="advanced-group-title">${esc(group.title)}</div>
                  ${group.keys.map((key) => labRowMarkup(key, record)).join('')}
                </div>`).join('')}
            </div>
          </details>
        </section>
        <section class="form-section">
          <label class="field"><span>备注（选填）</span><textarea name="recordNote" rows="3" maxlength="500" placeholder="例如：这次复查时的心率、身体感受，或医生的简短说明">${esc(record ? record.note : '')}</textarea></label>
        </section>
        <div class="form-privacy-note">${icon('lock')} 数据只保存在本机浏览器，不会上传。</div>
      </form>`;
    const footer = `
      <button type="button" class="btn btn-ghost" data-close-layer>取消</button>
      <button type="submit" form="labForm" class="btn btn-primary">${icon('check')}${record ? '保存修改' : '保存这次化验'}</button>`;
    openModal({
      title: record ? '编辑检查记录' : '记录一次化验',
      eyebrow: '甲功检查',
      subtitle: '请你对照原始化验单填写，数值与参考范围会一起保存。',
      className: 'modal-wide',
      sheetClass: 'lab-sheet',
      body,
      footer,
      initialFocus: 'input[name="recordDate"]',
      onMount: (layer) => {
        const form = layer.querySelector('#labForm');
        form.addEventListener('input', (event) => {
          hideFormError(form);
          const row = event.target.closest('[data-lab-row]');
          if (row) updateLabRowStatus(row);
        });
        form.querySelectorAll('[data-lab-row]').forEach(updateLabRowStatus);
      }
    });
  }

  function updateLabRowStatus(row) {
    if (!row) return;
    const key = row.getAttribute('data-lab-row');
    const meta = INDICATORS[key];
    if (!meta) return;
    const valueInput = row.querySelector(`[name="value_${key}"]`);
    const lowInput = row.querySelector(`[name="low_${key}"]`);
    const highInput = row.querySelector(`[name="high_${key}"]`);
    const statusEl = row.querySelector('.lab-live-status');
    const summaryEl = row.querySelector('.range-edit-text');
    if (!valueInput || !statusEl) return;
    const value = parseNumberInput(valueInput.value);
    const low = parseNumberInput(lowInput ? lowInput.value : '');
    const high = parseNumberInput(highInput ? highInput.value : '');
    const rangeLow = Number.isFinite(low) ? low : meta.low;
    const rangeHigh = Number.isFinite(high) ? high : meta.high;
    if (summaryEl) summaryEl.textContent = U.formatRange(rangeLow, rangeHigh, key);
    valueInput.classList.toggle('has-value', valueInput.value.trim() !== '');
    if (valueInput.value.trim() === '') {
      statusEl.className = 'lab-live-status tone-muted';
      statusEl.textContent = '未填';
      valueInput.removeAttribute('aria-invalid');
      return;
    }
    if (!Number.isFinite(value) || !Number.isFinite(rangeLow) || !Number.isFinite(rangeHigh) || rangeLow >= rangeHigh) {
      statusEl.className = 'lab-live-status tone-warn';
      statusEl.textContent = '待核对';
      valueInput.setAttribute('aria-invalid', 'true');
      return;
    }
    valueInput.removeAttribute('aria-invalid');
    const status = M.getStatus(value, rangeLow, rangeHigh);
    statusEl.className = `lab-live-status tone-${toneForStatus(status)}`;
    statusEl.textContent = M.statusCopy(status, key);
  }

  function saveLabForm(form) {
    const formData = new FormData(form);
    const date = String(formData.get('recordDate') || '');
    if (!U.isValidDateKey(date)) return showFormError(form, '请选择有效的检查日期。');
    if (date > todayKey()) return showFormError(form, '检查日期不能晚于今天。');
    const panel = {};
    for (const key of INDICATOR_ORDER) {
      const rawValue = formData.get(`value_${key}`);
      if (rawValue === null || String(rawValue).trim() === '') continue;
      const value = parseNumberInput(rawValue);
      if (!Number.isFinite(value)) {
        return showFormError(form, `${key} 的数值需要是大于或等于 0 的数字。`);
      }
      const meta = INDICATORS[key];
      const fallback = state.settings.ranges[key] || { low: meta.low, high: meta.high };
      const rawLow = formData.get(`low_${key}`);
      const rawHigh = formData.get(`high_${key}`);
      const low = parseNumberInput(rawLow);
      const high = parseNumberInput(rawHigh);
      const rangeLow = rawLow === null || String(rawLow).trim() === '' ? Number(fallback.low) : low;
      const rangeHigh = rawHigh === null || String(rawHigh).trim() === '' ? Number(fallback.high) : high;
      if (!Number.isFinite(rangeLow) || !Number.isFinite(rangeHigh)) {
        return showFormError(form, `${key} 的参考范围需要填写数字，或留空使用默认参考范围。`);
      }
      if (rangeLow < 0 || rangeHigh < 0 || rangeLow >= rangeHigh) {
        return showFormError(form, `${key} 的参考范围下限应小于上限，且不能为负数。`);
      }
      panel[key] = {
        value,
        low: rangeLow,
        high: rangeHigh,
        unit: meta.unit
      };
    }
    if (!Object.keys(panel).length) return showFormError(form, '请至少填写一项检查结果。');
    const recordId = String(formData.get('recordId') || '');
    const existing = recordId ? state.records.find((record) => record.id === recordId) : null;
    const record = {
      id: existing ? existing.id : U.uid('lab'),
      date,
      hospital: String(formData.get('recordHospital') || '').trim(),
      doctor: String(formData.get('recordDoctor') || '').trim(),
      fasting: Boolean(formData.get('recordFasting')),
      panel,
      note: String(formData.get('recordNote') || '').trim(),
      createdAt: existing ? existing.createdAt : new Date().toISOString()
    };
    if (existing) {
      state.records = state.records.map((item) => item.id === existing.id ? record : item);
    } else {
      state.records.push(record);
    }
    const abnormal = INDICATOR_ORDER.filter((key) => panel[key] && M.getStatus(panel[key].value, panel[key].low, panel[key].high) !== 'in-range').length;
    const message = existing
      ? (abnormal ? '检查记录已更新，本次有指标偏离参考范围。' : '检查记录已更新。')
      : (abnormal ? `已保存。本次有 ${abnormal} 项指标偏离参考范围。` : '检查记录已保存。');
    finishSave(message);
  }

  /* ------------------------------------------------------------------------
     DAILY CHECK-IN MODAL
     ------------------------------------------------------------------------ */
  function openDailyModal() {
    const existing = M.latestDaily(state);
    const entry = existing || {
      heartRate: '', weight: '', sleepHours: '', symptoms: {}, flags: [], feeling: 'okay', note: ''
    };
    const body = `
      <form id="dailyForm" class="modal-form daily-form" novalidate>
        <div class="form-error" hidden></div>
        <div class="daily-modal-intro">
          <span class="daily-modal-date">${U.formatDate(todayKey(), { year: true })} · ${U.weekdayCN(todayKey())}</span>
          <p>所有项目都可以跳过。记录的作用是帮助你回看变化，而不是给自己打分。</p>
        </div>
        <section class="form-section">
          <div class="form-section-heading"><h3>今天的身体数据</h3><span>选填</span></div>
          <div class="vitals-form-grid">
            <label class="vitals-input"><span class="vitals-input-icon">${icon('heart')}</span><span class="vitals-input-copy"><span>静息心率</span><span class="inline-input"><input type="number" name="dailyHeartRate" min="25" max="250" step="1" value="${entry.heartRate || ''}" placeholder="—"><small>bpm</small></span></span></label>
            <label class="vitals-input"><span class="vitals-input-icon">${icon('scale')}</span><span class="vitals-input-copy"><span>体重</span><span class="inline-input"><input type="number" name="dailyWeight" min="20" max="300" step="0.1" value="${entry.weight || ''}" placeholder="—"><small>kg</small></span></span></label>
            <label class="vitals-input"><span class="vitals-input-icon">${icon('moon')}</span><span class="vitals-input-copy"><span>睡眠时长</span><span class="inline-input"><input type="number" name="dailySleep" min="0" max="24" step="0.1" value="${entry.sleepHours || ''}" placeholder="—"><small>小时</small></span></span></label>
          </div>
        </section>
        <section class="form-section">
          <div class="form-section-heading"><h3>身体感受</h3><span>0 无 · 1 轻 · 2 中 · 3 重</span></div>
          <div class="symptom-grid">
            ${SYMPTOMS.map((symptom) => {
              const current = Number(entry.symptoms && entry.symptoms[symptom.key]) || 0;
              return `<div class="symptom-input-row">
                <span class="symptom-input-name">${esc(symptom.name)}</span>
                <div class="severity-picker" role="radiogroup" aria-label="${esc(symptom.name)}严重程度">
                  ${SEVERITY.map((item) => `
                    <label class="severity-option sev-${item.level}">
                      <input type="radio" name="sym_${symptom.key}" value="${item.level}" ${current === item.level ? 'checked' : ''}>
                      <span>${item.label}</span>
                    </label>`).join('')}
                </div>
              </div>`;
            }).join('')}
          </div>
        </section>
        <section class="form-section">
          <div class="form-section-heading"><h3>整体感觉</h3><span>凭直觉选择就好</span></div>
          <div class="feeling-picker">
            ${FEELINGS.map((feeling) => `
              <label class="feeling-option">
                <input type="radio" name="dailyFeeling" value="${feeling.key}" ${entry.feeling === feeling.key ? 'checked' : ''}>
                <span>${esc(feeling.name)}</span>
              </label>`).join('')}
          </div>
        </section>
        <section class="form-section safety-check-section">
          <div class="form-section-heading"><h3>需要尽快关注的情况</h3><span>如有，请及时联系医生</span></div>
          <p class="safety-check-intro">服用抗甲状腺药物期间，以下情况不宜只做记录后继续等待。请尽快联系医生或就医，并告知正在使用的药物。</p>
          <div class="flag-options">
            ${FLAGS.map((flag) => `
              <label class="flag-option">
                <input type="checkbox" name="flag_${flag.key}" value="${flag.key}" ${(entry.flags || []).includes(flag.key) ? 'checked' : ''}>
                <span class="flag-checkbox">${icon('check')}</span>
                <span><strong>${esc(flag.name)}</strong><small>${esc(flag.hint)}</small></span>
              </label>`).join('')}
          </div>
        </section>
        <section class="form-section">
          <label class="field"><span>今天想特别记下什么？（选填）</span><textarea name="dailyNote" rows="3" maxlength="400" placeholder="例如：午后心悸明显，休息 20 分钟后缓解">${esc(entry.note || '')}</textarea></label>
        </section>
        <div class="form-privacy-note">${icon('lock')} 同一天再次打卡会更新今天的记录。</div>
      </form>`;
    openModal({
      title: existing ? '更新今日状态' : '今日状态打卡',
      eyebrow: '每日状态',
      subtitle: '静息心率建议在安静休息 5–10 分钟后测量。',
      className: 'modal-wide',
      sheetClass: 'daily-sheet',
      body,
      footer: `<button type="button" class="btn btn-ghost" data-close-layer>取消</button><button type="submit" form="dailyForm" class="btn btn-primary">${icon('check')}${existing ? '保存更新' : '保存今日状态'}</button>`,
      onMount: (layer) => {
        const form = layer.querySelector('#dailyForm');
        form.addEventListener('input', () => hideFormError(form));
      }
    });
  }

  function saveDailyForm(form) {
    const formData = new FormData(form);
    const parseOptional = (name, min, max, label) => {
      const raw = String(formData.get(name) || '').trim();
      if (!raw) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) {
        showFormError(form, `${label}数值需在 ${min}–${max} 之间，或留空不填。`);
        return NaN;
      }
      return value;
    };
    const heartRate = parseOptional('dailyHeartRate', 25, 250, '心率');
    if (Number.isNaN(heartRate)) return;
    const weight = parseOptional('dailyWeight', 20, 300, '体重');
    if (Number.isNaN(weight)) return;
    const sleepHours = parseOptional('dailySleep', 0, 24, '睡眠');
    if (Number.isNaN(sleepHours)) return;
    const symptoms = {};
    SYMPTOMS.forEach((symptom) => {
      const selected = form.querySelector(`input[name="sym_${symptom.key}"]:checked`);
      symptoms[symptom.key] = selected ? Number(selected.value) : 0;
    });
    const flags = FLAGS.filter((flag) => Boolean(formData.get(`flag_${flag.key}`))).map((flag) => flag.key);
    const feelingOption = form.querySelector('input[name="dailyFeeling"]:checked');
    const existing = M.latestDaily(state);
    const entry = {
      id: existing ? existing.id : U.uid('daily'),
      date: todayKey(),
      heartRate,
      weight,
      sleepHours,
      symptoms,
      flags,
      feeling: feelingOption ? feelingOption.value : 'okay',
      note: String(formData.get('dailyNote') || '').trim(),
      createdAt: existing ? existing.createdAt : new Date().toISOString()
    };
    if (existing) {
      state.daily = state.daily.map((item) => item.id === existing.id ? entry : item);
    } else {
      state.daily.push(entry);
    }
    finishSave(flags.length ? '今日状态已保存。你记录了需要关注的情况，请尽快联系医生。' : '今日状态已记录。', { tone: flags.length ? 'warning' : 'success' });
  }

  /* ------------------------------------------------------------------------
     MEDICATION MODAL
     ------------------------------------------------------------------------ */
  function openMedicationModal(medId) {
    const med = medId ? state.medications.find((item) => item.id === medId) : null;
    const times = ['', '', ''];
    if (med && med.schedule) med.schedule.slice(0, 3).forEach((dose, index) => { times[index] = dose.time; });
    const body = `
      <form id="medForm" class="modal-form" novalidate>
        <div class="form-error" hidden></div>
        <input type="hidden" name="medId" value="${esc(med ? med.id : '')}">
        <section class="form-section">
          <div class="form-section-heading"><h3>药物信息</h3><span>以医生处方为准</span></div>
          <div class="form-grid two-col">
            <label class="field"><span>药物名称 <em>*</em></span><input type="text" name="medName" maxlength="60" value="${esc(med ? med.name : '')}" placeholder="例如：甲巯咪唑片" required></label>
            <label class="field"><span>商品名 / 备注名</span><input type="text" name="medBrand" maxlength="40" value="${esc(med ? med.brand : '')}" placeholder="选填，例如：赛治"></label>
            <label class="field"><span>类别</span><select name="medCategory">${MED_CATEGORIES.map((category) => `<option value="${category}" ${med && med.category === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
            <label class="field"><span>每次剂量</span><input type="text" name="medAmount" maxlength="40" value="${esc(med ? med.amount : '')}" placeholder="例如：1 片（10 mg）"></label>
            <div class="field full"><span>服用时间</span><div class="time-input-grid">${times.map((time, index) => `<label class="time-input"><span>${index === 0 ? '第一次' : index === 1 ? '第二次' : '第三次'}</span><input type="time" name="medTime" value="${esc(time)}" aria-label="第 ${index + 1} 次服药时间"></label>`).join('')}</div><small class="field-hint">至少填写一个时间；不需要的时段留空。</small></div>
            <label class="field"><span>开始日期</span><input type="date" name="medStartDate" value="${esc(med ? med.startDate : todayKey())}"></label>
            <label class="field"><span>服用说明</span><input type="text" name="medInstruction" maxlength="100" value="${esc(med ? med.instruction : '')}" placeholder="例如：早餐后服用"></label>
            <label class="checkbox-field full"><input type="checkbox" name="medActive" ${!med || med.active !== false ? 'checked' : ''}><span class="checkbox-ui">${icon('check')}</span><span>目前仍按医嘱服用</span></label>
            <label class="field full"><span>备注</span><textarea name="medNote" rows="2" maxlength="300" placeholder="选填">${esc(med ? med.note : '')}</textarea></label>
          </div>
        </section>
        <div class="med-form-note">${icon('shield')} 蝶迹不会判断剂量是否合适，也不会提供停药建议。所有调整请咨询医生。</div>
      </form>`;
    const footer = `
      ${med ? `<button type="button" class="btn btn-danger-ghost delete-in-modal" data-action="delete-med" data-id="${esc(med.id)}">${icon('trash')}删除记录</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close-layer>取消</button>
      <button type="submit" form="medForm" class="btn btn-primary">${icon('check')}${med ? '保存修改' : '添加药物'}</button>`;
    openModal({
      title: med ? '编辑用药' : '添加药物',
      eyebrow: '用药计划',
      subtitle: '只记录医生已经开具的药物与服用方式。',
      className: 'modal-narrow',
      body,
      footer,
      initialFocus: 'input[name="medName"]',
      onMount: (layer) => {
        const form = layer.querySelector('#medForm');
        form.addEventListener('input', () => hideFormError(form));
      }
    });
  }

  function saveMedicationForm(form) {
    const formData = new FormData(form);
    const name = String(formData.get('medName') || '').trim();
    if (!name) return showFormError(form, '请填写药物名称。');
    const timeInputs = Array.from(form.querySelectorAll('input[name="medTime"]'));
    const times = [...new Set(timeInputs.map((input) => input.value).filter(Boolean))].sort();
    if (!times.length) return showFormError(form, '请至少填写一个服药时间。');
    if (times.length > 3) return showFormError(form, '最多记录三个服药时间，请分开添加其他药物。');
    const startDate = String(formData.get('medStartDate') || '');
    if (!U.isValidDateKey(startDate)) return showFormError(form, '请选择有效的开始日期。');
    const existingId = String(formData.get('medId') || '');
    const existing = existingId ? state.medications.find((item) => item.id === existingId) : null;
    const amount = String(formData.get('medAmount') || '').trim();
    const active = Boolean(formData.get('medActive'));
    let endDate = '';
    if (!active) {
      if (existing && existing.active === false) endDate = existing.endDate || '';
      else endDate = startDate > todayKey() ? startDate : todayKey();
    }
    const med = {
      id: existing ? existing.id : U.uid('med'),
      name,
      brand: String(formData.get('medBrand') || '').trim(),
      category: String(formData.get('medCategory') || '其他'),
      amount,
      schedule: times.map((time) => ({ time, amount: amount || '按医嘱' })),
      instruction: String(formData.get('medInstruction') || '').trim(),
      startDate,
      endDate,
      active,
      note: String(formData.get('medNote') || '').trim()
    };
    if (existing) {
      state.medications = state.medications.map((item) => item.id === existing.id ? med : item);
    } else {
      state.medications.push(med);
    }
    finishSave(existing ? '用药信息已更新。' : '药物已添加。');
  }

  /* ------------------------------------------------------------------------
     VISIT MODAL
     ------------------------------------------------------------------------ */
  function defaultPrepText() {
    return ['确认预约与就诊地点', '整理近期化验单和用药清单', '写下想问医生的问题'].join('\n');
  }

  function openVisitModal(visitId) {
    const visit = visitId ? state.visits.find((item) => item.id === visitId) : null;
    const prepText = visit && visit.prep && visit.prep.length ? visit.prep.map((item) => item.text).join('\n') : defaultPrepText();
    const body = `
      <form id="visitForm" class="modal-form" novalidate>
        <div class="form-error" hidden></div>
        <input type="hidden" name="visitId" value="${esc(visit ? visit.id : '')}">
        <section class="form-section">
          <div class="form-section-heading"><h3>复查安排</h3><span>以医院预约信息为准</span></div>
          <div class="form-grid two-col">
            <label class="field"><span>日期 <em>*</em></span><input type="date" name="visitDate" value="${esc(visit ? visit.date : '')}" required></label>
            <label class="field"><span>时间</span><input type="time" name="visitTime" value="${esc(visit ? visit.time : '')}"></label>
            <label class="field"><span>类型</span><input type="text" name="visitType" maxlength="60" value="${esc(visit ? visit.type : '内分泌科复查')}" placeholder="例如：内分泌科复查"></label>
            <label class="field"><span>医院</span><input type="text" name="visitHospital" maxlength="60" value="${esc(visit ? visit.hospital : state.profile.hospital || '')}" placeholder="例如：市第一人民医院"></label>
            <label class="field"><span>医生</span><input type="text" name="visitDoctor" maxlength="40" value="${esc(visit ? visit.doctor : state.profile.doctor || '')}" placeholder="选填"></label>
            <label class="field"><span>地点 / 诊室</span><input type="text" name="visitLocation" maxlength="80" value="${esc(visit ? visit.location : '')}" placeholder="例如：门诊楼 3 层"></label>
            <label class="field full"><span>复查项目</span><input type="text" name="visitPurpose" maxlength="120" value="${esc(visit ? visit.purpose : '')}" placeholder="例如：复查甲功、肝功与血常规"></label>
          </div>
        </section>
        <section class="form-section">
          <div class="form-section-heading"><h3>准备事项</h3><span>每行一项</span></div>
          <label class="field"><textarea name="visitPrep" rows="4" maxlength="600" placeholder="每行写一项准备">${esc(prepText)}</textarea></label>
          <p class="field-hint">已有事项会保留勾选状态。具体空腹、停药等要求请以医院通知和医生意见为准。</p>
        </section>
        <section class="form-section">
          <label class="field"><span>备注</span><textarea name="visitNotes" rows="3" maxlength="500" placeholder="例如：带上上次的化验单；如有不适提前联系">${esc(visit ? visit.notes : '')}</textarea></label>
        </section>
      </form>`;
    const footer = `
      ${visit ? `<button type="button" class="btn btn-danger-ghost delete-in-modal" data-action="delete-visit" data-id="${esc(visit.id)}">${icon('trash')}删除</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close-layer>取消</button>
      <button type="submit" form="visitForm" class="btn btn-primary">${icon('check')}${visit ? '保存修改' : '保存安排'}</button>`;
    openModal({
      title: visit ? '编辑复查安排' : '安排一次复查',
      eyebrow: '复查与就诊',
      subtitle: '把已经确定的日期与准备事项记下来，也可以随时修改。',
      className: 'modal-narrow',
      body,
      footer,
      initialFocus: 'input[name="visitDate"]',
      onMount: (layer) => {
        const form = layer.querySelector('#visitForm');
        form.addEventListener('input', () => hideFormError(form));
      }
    });
  }

  function saveVisitForm(form) {
    const formData = new FormData(form);
    const date = String(formData.get('visitDate') || '');
    if (!U.isValidDateKey(date)) return showFormError(form, '请选择有效的复查日期。');
    const existingId = String(formData.get('visitId') || '');
    const existing = existingId ? state.visits.find((item) => item.id === existingId) : null;
    const seenPrepText = new Set();
    const prepLines = String(formData.get('visitPrep') || '').split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line || seenPrepText.has(line)) return false;
        seenPrepText.add(line);
        return true;
      })
      .slice(0, 20);
    const prep = prepLines.map((text) => {
      const matched = existing && (existing.prep || []).find((item) => item.text === text);
      return { id: matched ? matched.id : U.uid('prep'), text, done: matched ? Boolean(matched.done) : false };
    });
    const visitTime = String(formData.get('visitTime') || '');
    const visit = {
      id: existing ? existing.id : U.uid('visit'),
      date,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(visitTime) ? visitTime : '',
      type: String(formData.get('visitType') || '').trim() || '内分泌科复查',
      hospital: String(formData.get('visitHospital') || '').trim(),
      doctor: String(formData.get('visitDoctor') || '').trim(),
      location: String(formData.get('visitLocation') || '').trim(),
      purpose: String(formData.get('visitPurpose') || '').trim(),
      notes: String(formData.get('visitNotes') || '').trim(),
      prep
    };
    if (existing) {
      state.visits = state.visits.map((item) => item.id === existing.id ? visit : item);
    } else {
      state.visits.push(visit);
    }
    finishSave(existing ? '复查安排已更新。' : '复查安排已保存。');
  }

  /* ------------------------------------------------------------------------
     RECORD DETAIL MODAL
     ------------------------------------------------------------------------ */
  function openRecordDetails(recordId) {
    const record = state.records.find((item) => item.id === recordId);
    if (!record) { showToast('没有找到这条记录，可能已被删除。', 'warning'); return; }
    const previous = M.previousRecord(state, record);
    const entries = INDICATOR_ORDER.filter((key) => M.getEntry(record, key));
    const summary = M.corePanelSummary(record);
    const body = `
      <div class="record-detail">
        <div class="record-detail-hero">
          <div class="record-detail-date">
            <span>${U.fromDateKey(record.date).getFullYear()}</span>
            <strong>${String(U.fromDateKey(record.date).getMonth() + 1).padStart(2, '0')}.${String(U.fromDateKey(record.date).getDate()).padStart(2, '0')}</strong>
            <small>${U.weekdayCN(record.date)}</small>
          </div>
          <div class="record-detail-heading">
            <span class="record-detail-eyebrow">检查记录</span>
            <h3>${esc(record.hospital || '未填写医院 / 实验室')}</h3>
            <p>${esc(pageDateLabel(record.date))}${record.doctor ? ` · ${esc(record.doctor)}` : ''}${record.fasting ? ' · 空腹' : ''}</p>
          </div>
          <div class="record-detail-summary">
            ${coreResultPill(summary, true)}
            <span>${entries.length} 项已记录</span>
          </div>
        </div>
        <div class="detail-metrics-list">
          <div class="detail-metrics-head"><span>指标</span><span>结果</span><span>参考范围</span><span>状态</span><span>较上次</span></div>
          ${entries.map((key) => {
            const meta = INDICATORS[key];
            const entry = record.panel[key];
            const status = M.entryStatus(record, key);
            const ref = M.getReference(record, key);
            const previousValue = previous ? M.getValue(previous, key) : null;
            return `
              <div class="detail-metric-row">
                <span class="detail-metric-name"><strong>${key}</strong><small>${esc(meta.name)}</small></span>
                <span class="detail-metric-reading">${U.formatNumber(entry.value, key)}<small>${esc(meta.unit)}</small></span>
                <span class="detail-metric-ref">${U.formatRange(ref.low, ref.high, key)}</span>
                <span>${statusPill(status, key)}</span>
                <span class="detail-metric-delta">${deltaMarkup(key, entry.value, previousValue, meta.unit)}</span>
              </div>`;
          }).join('')}
        </div>
        ${record.note ? `<div class="record-detail-note"><span>本次备注</span><p>${nl2br(record.note)}</p></div>` : ''}
        <div class="record-detail-meta">记录创建于 ${esc(U.formatDate(U.dateKey(new Date(record.createdAt)), { year: true }))}。参考范围来自本次录入的化验单。</div>
      </div>`;
    openModal({
      title: '检查详情',
      eyebrow: '甲功档案',
      className: 'modal-wide',
      sheetClass: 'record-detail-sheet',
      body,
      footer: `
        <button type="button" class="btn btn-danger-ghost delete-in-modal" data-action="delete-record" data-id="${esc(record.id)}">${icon('trash')}删除</button>
        <button type="button" class="btn btn-ghost" data-close-layer>关闭</button>
        <button type="button" class="btn btn-primary" data-action="edit-record" data-id="${esc(record.id)}">${icon('edit')}编辑记录</button>`
    });
  }

  /* ------------------------------------------------------------------------
     ONBOARDING + SUMMARY QUESTIONS + MORE MENU
     ------------------------------------------------------------------------ */
  function openStartFreshModal() {
    const body = `
      <form id="profileSetupForm" class="modal-form onboarding-form" novalidate>
        <div class="form-error" hidden></div>
        <div class="onboarding-intro">
          <span class="onboarding-mark">${icon('activity')}</span>
          <p>演示数据会被清除，你现在输入的信息会保存在本机浏览器里。没有任何内容会上传到云端。</p>
        </div>
        <div class="form-grid two-col">
          <label class="field full"><span>怎么称呼你 <em>*</em></span><input type="text" name="setupName" maxlength="24" placeholder="例如：林岚" autocomplete="nickname" required></label>
          <label class="field"><span>性别</span><select name="setupSex"><option value="">请选择</option>${['女', '男', '其他 / 不愿透露'].map((sex) => `<option value="${sex}">${sex}</option>`).join('')}</select></label>
          <label class="field"><span>出生年份</span><input type="number" name="setupBirthYear" min="1900" max="${new Date().getFullYear()}" placeholder="选填"></label>
          <label class="field"><span>诊断</span><input type="text" name="setupDiagnosis" maxlength="80" placeholder="例如：Graves 病" list="setupDiagnosisOptions"><datalist id="setupDiagnosisOptions"><option value="Graves 病"><option value="毒性多结节性甲状腺肿"><option value="甲状腺自主高功能腺瘤"><option value="其他 / 未明确"></datalist></label>
          <label class="field"><span>确诊时间</span><input type="date" name="setupDiagnosedAt" max="${todayKey()}"></label>
        </div>
        <p class="onboarding-disclaimer">只有你填写的内容会被保存。之后可以在「个人与设置」中补充医院、医生等信息。</p>
      </form>`;
    openModal({
      title: '创建我的档案',
      eyebrow: '从空白开始',
      subtitle: '这一步会清空演示数据，开始记录只属于你的健康线索。',
      className: 'modal-narrow',
      body,
      footer: `<button type="button" class="btn btn-ghost" data-close-layer>先看看演示</button><button type="submit" form="profileSetupForm" class="btn btn-primary">${icon('arrow-right')}开始使用</button>`,
      initialFocus: 'input[name="setupName"]',
      onMount: (layer) => {
        const form = layer.querySelector('#profileSetupForm');
        form.addEventListener('input', () => hideFormError(form));
      }
    });
  }

  function saveProfileSetup(form) {
    const formData = new FormData(form);
    const name = String(formData.get('setupName') || '').trim();
    if (!name) return showFormError(form, '请填写一个称呼，或至少输入「我」。');
    const birthYearRaw = String(formData.get('setupBirthYear') || '').trim();
    if (birthYearRaw) {
      const year = Number(birthYearRaw);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
        return showFormError(form, '出生年份需要是 1900 年到今年的四位数字。');
      }
    }
    const diagnosedAt = String(formData.get('setupDiagnosedAt') || '');
    if (diagnosedAt && (!U.isValidDateKey(diagnosedAt) || diagnosedAt > todayKey())) {
      return showFormError(form, '确诊时间不能晚于今天。');
    }
    state = JK.data.createEmptyState({
      name,
      sex: String(formData.get('setupSex') || ''),
      birthYear: birthYearRaw,
      diagnosis: String(formData.get('setupDiagnosis') || '').trim(),
      diagnosedAt,
      hospital: '',
      doctor: '',
      summaryQuestions: ''
    });
    recordFilters = { query: '', onlyAbnormal: false };
    trendState = { indicator: 'TSH', days: 365 };
    const ok = persist(true);
    closeAllModals();
    goTo('overview');
    showToast(ok ? '档案已创建。从记录第一条化验开始吧。' : '档案已创建，但浏览器无法持久保存。请及时导出备份。', ok ? 'success' : 'warning', 5000);
  }

  function openSummaryQuestionsModal() {
    const content = state.profile.summaryQuestions || '';
    const body = `
      <form id="summaryQuestionsForm" class="modal-form" novalidate>
        <div class="form-error" hidden></div>
        <label class="field"><span>想和医生讨论的问题</span><textarea name="summaryQuestions" rows="7" maxlength="1200" placeholder="例如：&#10;最近 TSH 回升，现阶段治疗目标是什么？&#10;下次复查需要查哪些项目？">${esc(content)}</textarea></label>
        <p class="field-hint">每行一个问题，就诊摘要里会原样呈现。最多 1,200 字。</p>
      </form>`;
    openModal({
      title: '编辑就诊问题',
      eyebrow: '就诊摘要',
      subtitle: '把最重要的问题写下来，避免看诊时忘记。',
      className: 'modal-narrow',
      body,
      footer: `<button type="button" class="btn btn-ghost" data-close-layer>取消</button><button type="submit" form="summaryQuestionsForm" class="btn btn-primary">${icon('check')}保存问题</button>`,
      onMount: (layer) => {
        const form = layer.querySelector('#summaryQuestionsForm');
        form.addEventListener('input', () => hideFormError(form));
      }
    });
  }

  function saveSummaryQuestions(form) {
    const formData = new FormData(form);
    state.profile.summaryQuestions = String(formData.get('summaryQuestions') || '').trim();
    finishSave('就诊问题已保存。');
  }

  function openMoreSheet() {
    const layer = openModal({
      title: '更多功能',
      eyebrow: '蝶迹',
      className: 'modal-more',
      sheetClass: 'more-sheet',
      body: `
        <div class="more-grid">
          <a href="#/visits" class="more-link"><span class="more-icon">${icon('calendar')}</span><div><strong>复查与就诊</strong><span>准备下一次复查</span></div>${icon('chevron-right')}</a>
          <a href="#/summary" class="more-link"><span class="more-icon">${icon('file')}</span><div><strong>就诊摘要</strong><span>生成一页沟通材料</span></div>${icon('chevron-right')}</a>
          <a href="#/learn" class="more-link"><span class="more-icon">${icon('book')}</span><div><strong>健康知识</strong><span>用药安全与常见问题</span></div>${icon('chevron-right')}</a>
          <a href="#/settings" class="more-link"><span class="more-icon">${icon('settings')}</span><div><strong>个人与设置</strong><span>档案、参考范围与备份</span></div>${icon('chevron-right')}</a>
        </div>
        <button type="button" class="more-daily-action" data-action="new-daily">${icon('activity')}<span>记录今日身体状态</span>${icon('arrow-right')}</button>
        <p class="more-privacy">${icon('lock')}所有数据仅保存在本机 · 不是紧急医疗服务</p>`
    });
    layer.querySelectorAll('a[href^="#/"]').forEach((link) => {
      link.addEventListener('click', () => closeAllModals());
    });
    const dailyButton = layer.querySelector('[data-action="new-daily"]');
    if (dailyButton) dailyButton.addEventListener('click', () => closeModal(layer));
  }

  /* ------------------------------------------------------------------------
     EXPORT / IMPORT / ACTIONS
     ------------------------------------------------------------------------ */
  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportJSON() {
    const payload = {
      format: 'jkc-backup',
      app: '蝶迹',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state
    };
    downloadFile(`蝶迹-完整备份-${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    showToast('完整备份已生成。请妥善保存这个文件。', 'success');
  }

  function exportRecovery() {
    const raw = JK.data.getRecoveryRaw();
    if (!raw) {
      showToast('没有找到可下载的恢复副本。', 'warning');
      return;
    }
    downloadFile(`蝶迹-无法读取的本地数据-${todayKey()}.json.txt`, raw, 'text/plain;charset=utf-8');
    showToast('恢复副本已下载，可交给技术人员排查或尝试修复。', 'success');
  }

  function csvCell(value) {
    let text = String(value === null || value === undefined ? '' : value);
    // Neutralise spreadsheet formulas when the CSV is opened in Excel.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCSV() {
    const rows = [['检查日期', '医院', '医生', '指标', '结果', '单位', '参考下限', '参考上限', '状态', '备注']];
    M.sortedRecords(state, false).forEach((record) => {
      INDICATOR_ORDER.forEach((key) => {
        if (!M.getEntry(record, key)) return;
        const value = M.getValue(record, key);
        const ref = M.getReference(record, key);
        const status = M.entryStatus(record, key);
        rows.push([
          record.date, record.hospital || '', record.doctor || '', key, value, INDICATORS[key].unit,
          ref.low, ref.high, M.statusCopy(status, key), record.note || ''
        ]);
      });
    });
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadFile(`蝶迹-化验指标-${todayKey()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('化验指标已导出为 CSV。', 'success');
  }

  async function handleImportFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('备份文件超过 5 MB，无法导入。');
      const text = await file.text();
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (error) { throw new Error('JSON 文件无法解析，请确认文件没有损坏。'); }
      const raw = parsed && parsed.data ? parsed.data : parsed;
      const validation = JK.data.validateImportedState(raw);
      if (!validation.ok) throw new Error(validation.message);
      const normalized = JK.data.normalizeState(raw);
      if (!normalized) throw new Error('备份数据无法读取。');
      const recordCount = normalized.records.length;
      const rawRecordCount = Array.isArray(raw.records) ? raw.records.length : 0;
      if (rawRecordCount > 0 && recordCount === 0) {
        throw new Error('备份中的检查记录格式无法识别，未导入任何数据。');
      }
      const confirmed = await confirmDialog({
        title: '导入并覆盖当前数据？',
        eyebrow: '导入备份',
        message: `备份中包含 ${recordCount} 条检查记录。导入会覆盖当前浏览器里的所有记录与档案。`,
        detail: '建议先导出当前数据备份。导入完成后无法自动撤销。',
        confirmLabel: '确认导入'
      });
      if (!confirmed) return;
      state = normalized;
      recordFilters = { query: '', onlyAbnormal: false };
      const writeOK = persist(true);
      closeAllModals();
      goTo('overview');
      showToast(
        writeOK ? `已导入 ${recordCount} 条检查记录。` : '数据已载入内存，但浏览器无法写入本地存储，请立即导出备份。',
        writeOK ? 'success' : 'error',
        writeOK ? 3600 : 8000
      );
    } catch (error) {
      showToast(error.message || '导入失败，请检查文件格式。', 'error', 6000);
    } finally {
      input.value = '';
    }
  }

  function buildSummaryText() {
    const profile = state.profile;
    const latest = M.latestRecord(state);
    const age = M.age(profile);
    const activeMeds = (state.medications || []).filter((med) => med.active !== false);
    const dailySummary = buildDailySummary();
    const lines = [];
    lines.push('甲亢随访 · 就诊沟通摘要');
    lines.push(`生成时间：${U.formatDate(todayKey(), { year: true })}`);
    lines.push(`姓名：${profile.name || '未填写'}${profile.sex ? ' ｜ 性别：' + profile.sex : ''}${age ? ' ｜ 年龄：' + age + ' 岁' : ''}`);
    lines.push(`诊断：${profile.diagnosis || '未填写'}${profile.diagnosedAt ? ' ｜ 确诊：' + pageDateLabel(profile.diagnosedAt) : ''}`);
    if (profile.hospital || profile.doctor) lines.push(`随访医院 / 医生：${profile.hospital || '未填写'}${profile.doctor ? ' · ' + profile.doctor : ''}`);
    lines.push('');
    lines.push('【最近一次甲功】');
    if (latest) {
      lines.push(`${pageDateLabel(latest.date)}${latest.hospital ? ' · ' + latest.hospital : ''}`);
      INDICATOR_ORDER.forEach((key) => {
        if (!M.getEntry(latest, key)) return;
        const ref = M.getReference(latest, key);
        lines.push(`${key}：${U.formatNumber(M.getValue(latest, key), key)} ${INDICATORS[key].unit}（参考 ${U.formatRange(ref.low, ref.high, key)}，${M.statusCopy(M.entryStatus(latest, key), key)}）`);
      });
    } else {
      lines.push('暂无记录');
    }
    lines.push('');
    lines.push('【近期趋势】');
    PRIMARY_INDICATORS.forEach((key) => {
      const points = M.seriesFor(state, key, 365);
      if (!points.length) return;
      const first = points[0];
      const last = points[points.length - 1];
      lines.push(`${key}：${U.formatNumber(first.value, key)} → ${U.formatNumber(last.value, key)} ${INDICATORS[key].unit}（${points.length} 次记录，最近一次 ${M.statusCopy(last.status, key)}）`);
    });
    lines.push('');
    lines.push('【当前用药】');
    if (activeMeds.length) {
      activeMeds.forEach((med) => {
        lines.push(`${med.name}${med.brand ? '（' + med.brand + '）' : ''}：${med.amount || '剂量以医嘱为准'}，${(med.schedule || []).map((dose) => dose.time).join(' / ') || '时间未记录'}${med.instruction ? '，' + med.instruction : ''}`);
      });
    } else {
      lines.push('暂无记录');
    }
    lines.push('');
    lines.push('【近 30 天身体状态】');
    if (dailySummary.count) {
      lines.push(`静息心率均值：${dailySummary.avgHr || '—'}${dailySummary.avgHr ? ' bpm' : ''} ｜ 体重变化：${dailySummary.weightChange !== null ? (dailySummary.weightChange > 0 ? '+' : '') + dailySummary.weightChange.toFixed(1) + ' kg' : '—'} ｜ 打卡 ${dailySummary.count} 天`);
      lines.push(`主要感受：${dailySummary.symptoms.length ? dailySummary.symptoms.join('、') : '无明显不适记录'}`);
      if (dailySummary.flags.length) lines.push(`需要关注：${[...new Set(dailySummary.flags)].join('、')}`);
    } else {
      lines.push('近 30 天暂无状态记录');
    }
    lines.push('');
    lines.push('【想和医生讨论的问题】');
    lines.push(profile.summaryQuestions || '暂无填写');
    lines.push('');
    lines.push('说明：本摘要由患者自行记录的数据自动生成，仅用于就诊沟通，不作为诊断或处方依据。检验结果请以原始报告为准。');
    return lines.join('\n');
  }

  async function copySummary() {
    const text = buildSummaryText();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      showToast('摘要文字已复制。', 'success');
    } catch (error) {
      showToast('复制失败，请手动选择页面上的文字。', 'error');
    }
  }

  function printSummary() {
    const originalTitle = document.title;
    document.title = `蝶迹-就诊摘要-${todayKey()}`;
    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 2000);
  }

  function removeMedicationLogs(medId) {
    Object.keys(state.medLogs || {}).forEach((dateKey) => {
      const day = state.medLogs[dateKey];
      if (!day) return;
      Object.keys(day).forEach((key) => {
        if (key.startsWith(`${medId}|`)) delete day[key];
      });
      if (!Object.keys(day).length) delete state.medLogs[dateKey];
    });
  }

  async function handleAction(action, trigger) {
    const id = trigger.getAttribute('data-id');
    switch (action) {
      case 'new-lab': openLabModal(); break;
      case 'edit-record':
        closeAllModals();
        openLabModal(id);
        break;
      case 'open-record':
        if (id) openRecordDetails(id);
        break;
      case 'delete-record': {
        const confirmed = await confirmDialog({
          title: '删除这条检查记录？',
          eyebrow: '删除',
          message: '删除后，这条记录中的指标将从趋势中移除。此操作无法自动撤销。',
          detail: '如需保留，请先取消并导出数据备份。',
          confirmLabel: '删除记录'
        });
        if (!confirmed) return;
        state.records = state.records.filter((record) => record.id !== id);
        finishSave('检查记录已删除。', { preserveScroll: true });
        break;
      }
      case 'new-daily': openDailyModal(); break;
      case 'new-med': openMedicationModal(); break;
      case 'edit-med':
        closeAllModals();
        openMedicationModal(id);
        break;
      case 'delete-med': {
        const med = state.medications.find((item) => item.id === id);
        if (!med) return;
        const confirmed = await confirmDialog({
          title: '删除这条用药记录？',
          eyebrow: '删除',
          message: `将删除「${med.name}」及其服药打卡记录，历史化验与每日状态不受影响。`,
          confirmLabel: '删除用药'
        });
        if (!confirmed) return;
        state.medications = state.medications.filter((item) => item.id !== id);
        removeMedicationLogs(id);
        finishSave('用药记录已删除。');
        break;
      }
      case 'toggle-med-active': {
        const med = state.medications.find((item) => item.id === id);
        if (!med) return;
        if (med.active !== false) {
          const confirmed = await confirmDialog({
            title: '标记为已停用？',
            eyebrow: '修改用药状态',
            message: `「${med.name}」将不再出现在今日服药清单里。历史记录会保留。`,
            detail: '请确认这是医生的安排。应用不会替你判断何时停药。',
            confirmLabel: '标记停用',
            danger: false
          });
          if (!confirmed) return;
          med.active = false;
          med.endDate = todayKey();
          finishSave('已标记为停用，历史记录仍保留。');
        } else {
          med.active = true;
          delete med.endDate;
          finishSave('已恢复为在用药物。');
        }
        break;
      }
      case 'toggle-dose': {
        const key = trigger.getAttribute('data-dose-key');
        if (!key) return;
        const date = todayKey();
        if (!state.medLogs) state.medLogs = {};
        if (!state.medLogs[date]) state.medLogs[date] = {};
        if (state.medLogs[date][key]) delete state.medLogs[date][key];
        else state.medLogs[date][key] = { at: new Date().toISOString() };
        finishInlineUpdate();
        break;
      }
      case 'toggle-prep': {
        const visitId = trigger.getAttribute('data-visit-id');
        const prepId = trigger.getAttribute('data-prep-id');
        const visit = state.visits.find((item) => item.id === visitId);
        const item = visit && (visit.prep || []).find((prep) => prep.id === prepId);
        if (!item) return;
        item.done = !item.done;
        finishInlineUpdate();
        break;
      }
      case 'new-visit': openVisitModal(); break;
      case 'edit-visit':
        closeAllModals();
        openVisitModal(id);
        break;
      case 'delete-visit': {
        const confirmed = await confirmDialog({
          title: '删除这次复查安排？',
          eyebrow: '删除',
          message: '这条复查安排和准备清单将被删除。已经记录的检查结果不会受到影响。',
          confirmLabel: '删除安排'
        });
        if (!confirmed) return;
        state.visits = state.visits.filter((visit) => visit.id !== id);
        finishSave('复查安排已删除。');
        break;
      }
      case 'set-indicator':
        trendState.indicator = trigger.getAttribute('data-key') || 'TSH';
        renderRoute({ preserveScroll: true, silent: true });
        break;
      case 'set-trend-range':
        trendState.days = Number(trigger.getAttribute('data-days')) || 0;
        renderRoute({ preserveScroll: true, silent: true });
        break;
      case 'filter-records':
        recordFilters.onlyAbnormal = trigger.getAttribute('data-mode') === 'abnormal';
        renderRoute({ preserveScroll: true, silent: true, animateCharts: false });
        break;
      case 'edit-summary-questions': openSummaryQuestionsModal(); break;
      case 'copy-summary': copySummary(); break;
      case 'print-summary': printSummary(); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'export-recovery': exportRecovery(); break;
      case 'import-json': {
        const input = document.getElementById('importFile');
        if (input) input.click();
        break;
      }
      case 'reset-ranges': {
        state.settings.ranges = JK.data.defaultRanges();
        persist(true);
        renderRoute({ preserveScroll: true, silent: true });
        showToast('参考范围已恢复为示例默认值。', 'success');
        break;
      }
      case 'load-demo': {
        const confirmed = await confirmDialog({
          title: '载入演示数据？',
          eyebrow: '演示模式',
          message: '这会覆盖当前浏览器中的所有档案与记录，并换成一套虚构的演示案例。',
          detail: '建议先导出备份。演示数据仅用于体验功能，不是真实患者信息。',
          confirmLabel: '载入演示数据',
          danger: false
        });
        if (!confirmed) return;
        state = JK.data.buildDemoState();
        recordFilters = { query: '', onlyAbnormal: false };
        trendState = { indicator: 'TSH', days: 365 };
        const ok = persist(true);
        closeAllModals();
        goTo('overview');
        showToast(ok ? '已载入演示数据。' : '演示数据已载入内存，但浏览器无法写入本地存储。', ok ? 'success' : 'error');
        break;
      }
      case 'clear-all': {
        const confirmed = await confirmDialog({
          title: '清空所有数据？',
          eyebrow: '不可撤销',
          message: '个人档案、检查记录、每日状态、用药与复查安排都将从这台设备上删除。',
          detail: '包括可能存在的恢复副本。这个操作不能撤销，如需保留任何内容，请先取消并导出备份。',
          confirmLabel: '确认清空'
        });
        if (!confirmed) return;
        JK.data.clearRecovery();
        state = JK.data.createEmptyState({});
        recordFilters = { query: '', onlyAbnormal: false };
        trendState = { indicator: 'TSH', days: 365 };
        const ok = persist(true);
        closeAllModals();
        goTo('overview');
        showToast(ok ? '本机数据已清空。' : '界面已清空，但浏览器拒绝写入本地存储；请检查浏览器设置。', ok ? 'success' : 'error');
        break;
      }
      case 'start-fresh': openStartFreshModal(); break;
      case 'open-more': openMoreSheet(); break;
      default:
        console.warn('未处理的 action:', action);
    }
  }

  /* ------------------------------------------------------------------------
     FORM HANDLING
     ------------------------------------------------------------------------ */
  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.id) return;
    if (!['labForm', 'dailyForm', 'medForm', 'visitForm', 'profileForm', 'rangesForm', 'profileSetupForm', 'summaryQuestionsForm'].includes(form.id)) return;
    event.preventDefault();
    hideFormError(form);
    switch (form.id) {
      case 'labForm': saveLabForm(form); break;
      case 'dailyForm': saveDailyForm(form); break;
      case 'medForm': saveMedicationForm(form); break;
      case 'visitForm': saveVisitForm(form); break;
      case 'profileSetupForm': saveProfileSetup(form); break;
      case 'summaryQuestionsForm': saveSummaryQuestions(form); break;
      case 'profileForm': {
        const data = new FormData(form);
        const birthYear = String(data.get('profileBirthYear') || '').trim();
        if (birthYear) {
          const y = Number(birthYear);
          if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) {
            return showFormError(form, '出生年份需要是 1900 年到今年的四位数字。');
          }
        }
        const diagnosedAt = String(data.get('profileDiagnosedAt') || '');
        if (diagnosedAt && (!U.isValidDateKey(diagnosedAt) || diagnosedAt > todayKey())) {
          return showFormError(form, '确诊时间不能晚于今天。');
        }
        state.profile = Object.assign({}, state.profile, {
          name: String(data.get('profileName') || '').trim(),
          sex: String(data.get('profileSex') || ''),
          birthYear,
          diagnosedAt,
          diagnosis: String(data.get('profileDiagnosis') || '').trim(),
          hospital: String(data.get('profileHospital') || '').trim(),
          doctor: String(data.get('profileDoctor') || '').trim()
        });
        const ok = persist(true);
        renderRoute({ preserveScroll: true, silent: true });
        showToast(ok ? '档案已保存。' : '档案已更新，但无法写入本地存储。', ok ? 'success' : 'error');
        break;
      }
      case 'rangesForm': {
        const data = new FormData(form);
        const ranges = {};
        for (const key of INDICATOR_ORDER) {
          const low = parseNumberInput(data.get(`range_${key}_low`));
          const high = parseNumberInput(data.get(`range_${key}_high`));
          if (!Number.isFinite(low) || !Number.isFinite(high)) {
            return showFormError(form, `${key} 的参考范围需要填写有效数字。`);
          }
          if (low < 0 || high < 0 || low >= high) {
            return showFormError(form, `${key} 的参考范围下限应小于上限，且不能为负数。`);
          }
          ranges[key] = { low, high };
        }
        state.settings.ranges = ranges;
        const ok = persist(true);
        renderRoute({ preserveScroll: true, silent: true });
        showToast(ok ? '默认参考范围已保存。已有记录不受影响。' : '无法保存参考范围，请检查浏览器设置。', ok ? 'success' : 'error');
        break;
      }
      default: break;
    }
  }

  /* ------------------------------------------------------------------------
     INPUT / EVENT BINDING
     ------------------------------------------------------------------------ */
  function updateRecordListUI() {
    const list = document.getElementById('recordList');
    if (!list) return;
    list.innerHTML = renderRecordList();
    const countText = document.getElementById('recordCountText');
    if (countText) countText.textContent = `${M.sortedRecords(state, false).filter(recordMatches).length} 条记录`;
  }

  document.addEventListener('click', (event) => {
    const closeTrigger = event.target.closest('[data-close-layer]');
    if (closeTrigger) {
      const layer = closeTrigger.closest('.modal-layer');
      if (layer) closeModal(layer);
      return;
    }
    const actionTrigger = event.target.closest('[data-action]');
    if (actionTrigger) {
      event.preventDefault();
      handleAction(actionTrigger.getAttribute('data-action'), actionTrigger);
      return;
    }
    const modalLink = event.target.closest('.modal-layer a[href^="#/"]');
    if (modalLink) closeAllModals();
  });

  document.addEventListener('submit', handleSubmit);

  document.addEventListener('input', (event) => {
    if (event.target.id === 'recordSearch') {
      recordFilters.query = event.target.value;
      updateRecordListUI();
      return;
    }
    const labForm = event.target.closest('#labForm');
    if (labForm) {
      hideFormError(labForm);
      const row = event.target.closest('[data-lab-row]');
      if (row) updateLabRowStatus(row);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'indicatorSelect') {
      const value = event.target.value;
      if (value) {
        trendState.indicator = value;
        renderRoute({ preserveScroll: true, silent: true });
      }
    }
    if (event.target.id === 'importFile') {
      handleImportFile(event.target);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!modalStack.length) return;
    const top = modalStack[modalStack.length - 1].layer;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(top);
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(top.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('hashchange', () => {
    if (modalStack.length) closeAllModals();
    renderRoute();
  });

  window.addEventListener('beforeprint', () => {
    // Charts are already rendered as SVG; printing needs no recalculation.
  });

  // Add-to-home-screen and offline capability are useful on phones and on a
  // deployed HTTPS site. Skipped silently for file:// and unsupported browsers.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Offline support is an enhancement; the app still works without it.
      });
    });
  }

  // Keyboard support for details-summary cards is native; no extra JS needed.

  /* ------------------------------------------------------------------------
     INITIALISE
     ------------------------------------------------------------------------ */
  registerServiceWorker();
  if (!window.location.hash) {
    try { window.history.replaceState(null, '', '#/overview'); }
    catch (error) { window.location.hash = '#/overview'; }
  }
  renderRoute({ initial: true });
  if (!storageOK) {
    setTimeout(() => showToast('当前浏览器禁用了本地存储。数据可能无法保留，请先导出备份或更换浏览器设置。', 'warning', 8000), 700);
  } else if (initialLoadIssue && initialLoadIssue.type === 'corrupt') {
    setTimeout(() => showToast('本地记录读取失败。原始数据已在「个人与设置 → 数据与备份」中保留，可下载恢复副本。', 'error', 9000), 800);
  }

})();
