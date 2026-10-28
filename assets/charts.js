/* ==========================================================================
   蝶迹 · charts.js
   Dependency-free responsive SVG trend chart with reference band + tooltip.
   ========================================================================== */
(function () {
  'use strict';

  window.JK = window.JK || {};
  let chartCounter = 0;

  const { formatNumber, formatMonthDay, formatDate, weekdayCN, fromDateKey, pad } = window.JK.utils;
  const { INDICATORS } = window.JK.const;

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function niceStep(rawStep) {
    const exponent = Math.floor(Math.log10(rawStep));
    const fraction = rawStep / Math.pow(10, exponent);
    let niceFraction;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  function buildYScale(min, max, tickTarget, floorZero) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
    if (Math.abs(max - min) < 1e-9) {
      const base = Math.abs(max) || 1;
      min = min - base * 0.25;
      max = max + base * 0.25;
    }
    const padding = (max - min) * 0.13;
    min -= padding;
    max += padding;
    if (floorZero && min < 0) min = 0;
    const target = tickTarget || 4;
    const step = niceStep((max - min) / target);
    let niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    if (floorZero) niceMin = Math.max(0, niceMin);
    const ticks = [];
    for (let value = niceMin; value <= niceMax + step * 0.001; value += step) {
      ticks.push(Number(value.toFixed(8)));
    }
    return { min: niceMin, max: niceMax, ticks };
  }

  function formatTick(value) {
    if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US');
    if (Math.abs(value) >= 100) return String(Math.round(value));
    if (Math.abs(value) >= 1) return String(Number(value.toFixed(2)));
    if (value === 0) return '0';
    return String(Number(value.toPrecision(2)));
  }

  function xLabel(date, spanDays) {
    const d = fromDateKey(date);
    if (!d) return '';
    if (spanDays > 400) return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}`;
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  function tooltipStatusCopy(point) {
    const meta = INDICATORS[point.key] || {};
    if (point.status === 'high') return meta.antibody ? '高于参考' : '偏高';
    if (point.status === 'low') return '偏低';
    return '参考内';
  }

  function mountLineChart(container, config) {
    if (!container) return null;
    let observer = null;
    let destroyed = false;
    let currentWidth = 0;
    let frame = null;

    function destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
    }

    function draw() {
      if (destroyed || !container.isConnected) return;
      const width = Math.floor(container.clientWidth);
      if (!width || width < 20) return;
      const compact = Boolean(config.compact);
      const theme = config.variant === 'dark' ? 'dark' : 'light';
      const height = config.height || (compact ? 180 : 330);
      const points = (config.points || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
      const indicator = INDICATORS[config.indicator] || {};
      const accent = config.color || (theme === 'dark' ? '#b9dccc' : indicator.color || '#2f7464');
      const muted = theme === 'dark' ? 'rgba(244,242,233,.58)' : '#84908b';
      const gridColor = theme === 'dark' ? 'rgba(255,255,255,.10)' : '#e9e5dc';
      const axisColor = theme === 'dark' ? 'rgba(255,255,255,.18)' : '#d9d4ca';
      const bandFill = theme === 'dark' ? 'rgba(182,224,205,.10)' : 'rgba(188,216,202,.25)';
      const bandLine = theme === 'dark' ? 'rgba(182,224,205,.22)' : 'rgba(70,128,107,.20)';
      const surface = theme === 'dark' ? '#173f37' : '#fffdfa';
      const highColor = theme === 'dark' ? '#f2a98f' : '#c76548';
      const lowColor = theme === 'dark' ? '#9fc4e1' : '#4e7e9f';
      const padLeft = compact ? 18 : 48;
      const padRight = compact ? 14 : 22;
      const padTop = compact ? 18 : 30;
      const padBottom = compact ? 26 : 34;
      const plotWidth = Math.max(10, width - padLeft - padRight);
      const plotHeight = Math.max(10, height - padTop - padBottom);

      container.innerHTML = '';
      container.classList.toggle('chart-dark', theme === 'dark');
      container.classList.toggle('chart-compact', compact);

      if (!points.length) {
        const empty = document.createElement('div');
        empty.className = 'chart-empty';
        empty.innerHTML = `<span>${escapeHTML(config.emptyText || '还没有足够的数据')}</span>`;
        container.appendChild(empty);
        return;
      }

      const refLow = Number.isFinite(Number(config.reference && config.reference.low))
        ? Number(config.reference.low)
        : Number(points[points.length - 1].low);
      const refHigh = Number.isFinite(Number(config.reference && config.reference.high))
        ? Number(config.reference.high)
        : Number(points[points.length - 1].high);

      const values = points.map((p) => p.value);
      const domainCandidates = values.slice();
      if (config.showReference !== false && Number.isFinite(refLow)) domainCandidates.push(refLow);
      if (config.showReference !== false && Number.isFinite(refHigh)) domainCandidates.push(refHigh);
      const domainMin = Math.min.apply(null, domainCandidates);
      const allNonNegative = domainCandidates.every((value) => Number(value) >= 0);
      const yScale = buildYScale(domainMin, Math.max.apply(null, domainCandidates), compact ? 3 : 4, allNonNegative);
      const yMin = yScale.min;
      const yMax = yScale.max;

      const dates = points.map((p) => fromDateKey(p.date).getTime());
      const minDate = Math.min.apply(null, dates);
      const maxDate = Math.max.apply(null, dates);
      const spanDays = Math.max(1, Math.round((maxDate - minDate) / 86400000));
      const xFor = (p) => {
        if (points.length === 1 || maxDate === minDate) return padLeft + plotWidth / 2;
        const d = fromDateKey(p.date).getTime();
        return padLeft + ((d - minDate) / (maxDate - minDate)) * plotWidth;
      };
      const yFor = (value) => padTop + plotHeight - ((Number(value) - yMin) / (yMax - yMin)) * plotHeight;

      const positions = points.map((p) => ({
        point: p,
        x: xFor(p),
        y: yFor(p.value),
        status: p.status || 'in-range'
      }));

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'trend-svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', String(height));
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('role', 'img');
      const first = points[0];
      const last = points[points.length - 1];
      const summary = `${indicator.name || config.indicator} 趋势：${formatDate(first.date)} ${formatNumber(first.value, config.indicator)} 至 ${formatDate(last.date)} ${formatNumber(last.value, config.indicator)} ${indicator.unit || ''}。最新一次${tooltipStatusCopy(last)}。`;
      svg.setAttribute('aria-label', summary);

      const title = document.createElementNS(svgNS, 'title');
      title.textContent = summary;
      svg.appendChild(title);

      const defs = document.createElementNS(svgNS, 'defs');
      const gradientId = `chartGradient${++chartCounter}`;
      const gradient = document.createElementNS(svgNS, 'linearGradient');
      gradient.setAttribute('id', gradientId);
      gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '0');
      gradient.setAttribute('x2', '0'); gradient.setAttribute('y2', '1');
      const stop1 = document.createElementNS(svgNS, 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', accent);
      stop1.setAttribute('stop-opacity', theme === 'dark' ? '.20' : '.12');
      const stop2 = document.createElementNS(svgNS, 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', accent);
      stop2.setAttribute('stop-opacity', '0');
      gradient.appendChild(stop1); gradient.appendChild(stop2);
      defs.appendChild(gradient);
      svg.appendChild(defs);

      // Horizontal grid + y labels.
      if (!compact || config.showYAxis) {
        yScale.ticks.forEach((tick) => {
          const y = yFor(tick);
          if (y < padTop - 1 || y > padTop + plotHeight + 1) return;
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', padLeft);
          line.setAttribute('x2', padLeft + plotWidth);
          line.setAttribute('y1', y);
          line.setAttribute('y2', y);
          line.setAttribute('stroke', gridColor);
          line.setAttribute('stroke-width', '1');
          svg.appendChild(line);
          if (!compact) {
            const label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', padLeft - 12);
            label.setAttribute('y', y + 3.5);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('class', 'chart-axis-label');
            label.setAttribute('fill', muted);
            label.textContent = formatTick(tick);
            svg.appendChild(label);
          }
        });
      }

      // Reference band.
      if (config.showReference !== false && Number.isFinite(refLow) && Number.isFinite(refHigh)) {
        const rawTop = yFor(refHigh);
        const rawBottom = yFor(refLow);
        const top = Math.max(padTop - 2, rawTop);
        const bottom = Math.min(padTop + plotHeight + 2, rawBottom);
        if (bottom > top) {
          const band = document.createElementNS(svgNS, 'rect');
          band.setAttribute('x', padLeft);
          band.setAttribute('y', top);
          band.setAttribute('width', plotWidth);
          band.setAttribute('height', bottom - top);
          band.setAttribute('fill', bandFill);
          svg.appendChild(band);
          [top, bottom].forEach((y) => {
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', padLeft);
            line.setAttribute('x2', padLeft + plotWidth);
            line.setAttribute('y1', y);
            line.setAttribute('y2', y);
            line.setAttribute('stroke', bandLine);
            line.setAttribute('stroke-dasharray', '3 5');
            line.setAttribute('stroke-width', '1');
            svg.appendChild(line);
          });
          if (!compact && bottom - top > 24) {
            const label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', padLeft + plotWidth - 8);
            label.setAttribute('y', top + 15);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('fill', muted);
            label.setAttribute('class', 'chart-band-label');
            label.textContent = '参考范围';
            svg.appendChild(label);
          }
        }
      }

      // X axis baseline.
      if (!compact || config.showXAxis) {
        const axis = document.createElementNS(svgNS, 'line');
        axis.setAttribute('x1', padLeft);
        axis.setAttribute('x2', padLeft + plotWidth);
        axis.setAttribute('y1', padTop + plotHeight);
        axis.setAttribute('y2', padTop + plotHeight);
        axis.setAttribute('stroke', axisColor);
        axis.setAttribute('stroke-width', '1');
        svg.appendChild(axis);
      }

      // X labels (max 6, deduplicated).
      if (config.showXAxis !== false) {
        const labelCount = Math.min(compact ? 3 : 6, points.length);
        const indexes = new Set();
        if (labelCount === 1) indexes.add(0);
        else {
          for (let i = 0; i < labelCount; i += 1) {
            indexes.add(Math.round((i / (labelCount - 1)) * (points.length - 1)));
          }
        }
        Array.from(indexes).sort((a, b) => a - b).forEach((index, position, arr) => {
          const pos = positions[index];
          const d = fromDateKey(points[index].date);
          if (!pos || !d) return;
          let text = xLabel(points[index].date, spanDays);
          if (index === 0 && spanDays > 300) text = `${d.getFullYear()}.${pad(d.getMonth() + 1)}`;
          const textEl = document.createElementNS(svgNS, 'text');
          let anchor = 'middle';
          let x = pos.x;
          if (position === 0 && x < padLeft + 22) { anchor = 'start'; x = padLeft; }
          if (position === arr.length - 1 && x > padLeft + plotWidth - 22) { anchor = 'end'; x = padLeft + plotWidth; }
          textEl.setAttribute('x', x);
          textEl.setAttribute('y', height - 10);
          textEl.setAttribute('text-anchor', anchor);
          textEl.setAttribute('fill', muted);
          textEl.setAttribute('class', 'chart-axis-label');
          textEl.textContent = text;
          svg.appendChild(textEl);
        });
      }

      // Area + line.
      const lineD = positions.map((pos, i) => `${i === 0 ? 'M' : 'L'}${pos.x.toFixed(2)},${pos.y.toFixed(2)}`).join(' ');
      if (positions.length > 1) {
        const baseY = padTop + plotHeight;
        const areaD = `${lineD} L${positions[positions.length - 1].x.toFixed(2)},${baseY} L${positions[0].x.toFixed(2)},${baseY} Z`;
        const area = document.createElementNS(svgNS, 'path');
        area.setAttribute('d', areaD);
        area.setAttribute('fill', `url(#${gradientId})`);
        area.setAttribute('class', 'chart-area');
        svg.appendChild(area);
      }

      if (positions.length > 1) {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', lineD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', accent);
        path.setAttribute('stroke-width', compact ? '2.2' : '2.4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('class', 'chart-line');
        svg.appendChild(path);
        if (config.animate !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          requestAnimationFrame(() => {
            try {
              const length = path.getTotalLength();
              path.style.strokeDasharray = String(length);
              path.style.strokeDashoffset = String(length);
              path.animate(
                [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
                { duration: 900, easing: 'cubic-bezier(.22,.75,.25,1)', fill: 'forwards' }
              );
            } catch (error) { /* Drawing still works without the animation. */ }
          });
        }
      }

      // Points.
      const visibleDots = !compact || points.length <= 14;
      positions.forEach((pos, index) => {
        const statusColor = pos.status === 'high' ? highColor : pos.status === 'low' ? lowColor : accent;
        const isLast = index === positions.length - 1;
        if (visibleDots) {
          if (isLast) {
            const ring = document.createElementNS(svgNS, 'circle');
            ring.setAttribute('cx', pos.x);
            ring.setAttribute('cy', pos.y);
            ring.setAttribute('r', compact ? '7' : '8');
            ring.setAttribute('fill', statusColor);
            ring.setAttribute('opacity', theme === 'dark' ? '.22' : '.14');
            ring.setAttribute('class', 'chart-point-ring');
            svg.appendChild(ring);
          }
          const dot = document.createElementNS(svgNS, 'circle');
          dot.setAttribute('cx', pos.x);
          dot.setAttribute('cy', pos.y);
          dot.setAttribute('r', isLast ? (compact ? '4.2' : '4.8') : (compact ? '3' : '3.6'));
          dot.setAttribute('fill', surface);
          dot.setAttribute('stroke', statusColor);
          dot.setAttribute('stroke-width', isLast ? '2.6' : '2');
          dot.setAttribute('class', 'chart-point');
          dot.setAttribute('data-index', String(index));
          const dotTitle = document.createElementNS(svgNS, 'title');
          dotTitle.textContent = `${formatDate(pos.point.date)} · ${formatNumber(pos.point.value, config.indicator)} ${indicator.unit || ''}`;
          dot.appendChild(dotTitle);
          svg.appendChild(dot);
        }
      });

      // Hover guide.
      const guide = document.createElementNS(svgNS, 'line');
      guide.setAttribute('x1', 0); guide.setAttribute('x2', 0);
      guide.setAttribute('y1', padTop); guide.setAttribute('y2', padTop + plotHeight);
      guide.setAttribute('stroke', theme === 'dark' ? 'rgba(255,255,255,.28)' : 'rgba(36,75,65,.20)');
      guide.setAttribute('stroke-dasharray', '3 4');
      guide.setAttribute('visibility', 'hidden');
      svg.appendChild(guide);

      const hoverDot = document.createElementNS(svgNS, 'circle');
      hoverDot.setAttribute('r', '5.5');
      hoverDot.setAttribute('fill', surface);
      hoverDot.setAttribute('stroke', accent);
      hoverDot.setAttribute('stroke-width', '2.4');
      hoverDot.setAttribute('visibility', 'hidden');
      svg.appendChild(hoverDot);

      container.appendChild(svg);

      const tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      tooltip.setAttribute('role', 'status');
      tooltip.hidden = true;
      container.appendChild(tooltip);

      let activeIndex = -1;

      function positionTooltip(pos, point) {
        const tipWidth = 184;
        const px = pos.x;
        const py = pos.y;
        const left = Math.min(Math.max(px, tipWidth / 2 + 4), width - tipWidth / 2 - 4);
        const useBelow = py < 105;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${useBelow ? py + 18 : py - 14}px`;
        tooltip.classList.toggle('tooltip-below', useBelow);
        const statusText = tooltipStatusCopy(point);
        const statusClass = point.status === 'high' ? 'high' : point.status === 'low' ? 'low' : 'ok';
        tooltip.innerHTML = `
          <span class="tip-date">${formatMonthDay(point.date)} · ${weekdayCN(point.date)}</span>
          <span class="tip-value">${formatNumber(point.value, config.indicator)} <em>${escapeHTML(indicator.unit || '')}</em></span>
          <span class="tip-meta"><span class="tip-status ${statusClass}">${statusText}</span><span>参考 ${escapeHTML(window.JK.utils.formatRange(refLow, refHigh, config.indicator))}</span></span>
        `;
        tooltip.hidden = false;
      }

      function setActive(index) {
        if (!positions[index]) return;
        activeIndex = index;
        const pos = positions[index];
        guide.setAttribute('x1', pos.x);
        guide.setAttribute('x2', pos.x);
        guide.setAttribute('visibility', 'visible');
        hoverDot.setAttribute('cx', pos.x);
        hoverDot.setAttribute('cy', pos.y);
        hoverDot.setAttribute('visibility', 'visible');
        positionTooltip(pos, pos.point);
        Array.from(svg.querySelectorAll('.chart-point')).forEach((dot) => {
          dot.classList.toggle('is-active', Number(dot.getAttribute('data-index')) === index);
        });
      }

      function hideActive() {
        activeIndex = -1;
        guide.setAttribute('visibility', 'hidden');
        hoverDot.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
        Array.from(svg.querySelectorAll('.chart-point.is-active')).forEach((dot) => dot.classList.remove('is-active'));
      }

      svg.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const localX = ((event.clientX - rect.left) / rect.width) * width;
        let nearest = 0;
        let smallest = Infinity;
        positions.forEach((pos, index) => {
          const distance = Math.abs(pos.x - localX);
          if (distance < smallest) { smallest = distance; nearest = index; }
        });
        if (smallest <= Math.max(28, plotWidth / points.length)) setActive(nearest);
        else hideActive();
      });
      svg.addEventListener('pointerleave', hideActive);

      // Only an explicit point (hover on desktop, tap on mobile) opens a record.
      svg.addEventListener('click', () => {
        if (activeIndex < 0) return;
        if (config.onSelect && positions[activeIndex]) config.onSelect(positions[activeIndex].point);
      });
      svg.addEventListener('touchstart', (event) => {
        const rect = svg.getBoundingClientRect();
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        const localX = ((touch.clientX - rect.left) / rect.width) * width;
        let nearest = 0;
        let smallest = Infinity;
        positions.forEach((pos, index) => {
          const distance = Math.abs(pos.x - localX);
          if (distance < smallest) { smallest = distance; nearest = index; }
        });
        setActive(nearest);
      }, { passive: true });

      // Keep the latest point visible if a tooltip is open while resizing.
      if (activeIndex >= 0) setActive(Math.min(activeIndex, positions.length - 1));
    }

    observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0].contentRect.width);
      if (Math.abs(width - currentWidth) > 2) {
        currentWidth = width;
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      }
    });
    observer.observe(container);
    // Draw synchronously after layout has settled.
    currentWidth = Math.floor(container.clientWidth);
    draw();
    return { destroy: destroy };
  }

  JK.charts = { mountLineChart };
})();
