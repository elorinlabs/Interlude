// Adapted from hjxccc/codex-pet-dock (MIT); see pet_dock/LICENSE.
(() => {
  'use strict';
  const KEY = '__interludePetDock';
  if (window[KEY]?.version === 15) return;
  window[KEY]?.destroy();
  // i18n:pet-dock:start
    const petDockCopy = {
    "zh": {
        "averageFiveHour": "5小时平均",
        "averageWeekly": "周剩余平均",
      "fiveHour": "5小时剩余",
      "weekly": "本周剩余",
      "remaining": "剩余额度",
      "total": "总消耗",
      "unlimited": "无限额",
      "unknown": "未知",
      "loading": "读取余额中",
      "stale": "数据未更新",
      "unavailable": "部分数据不可用"
    },
    "en": {
        "averageFiveHour": "5h average",
        "averageWeekly": "Week average",
      "fiveHour": "5h left",
      "weekly": "Week left",
      "remaining": "Balance",
      "total": "Total tokens",
      "unlimited": "Unlimited",
      "unknown": "Unknown",
      "loading": "Loading balance",
      "stale": "Data is out of date",
      "unavailable": "Some data unavailable"
    },
    "ru": {
        "averageFiveHour": "Сред. 5 ч",
        "averageWeekly": "Сред. нед.",
      "fiveHour": "Ост. 5 ч",
      "weekly": "Ост. нед.",
      "remaining": "Остаток",
      "total": "Токены",
      "unlimited": "Без лимита",
      "unknown": "Неизвестно",
      "loading": "Загрузка баланса",
      "stale": "Данные устарели",
      "unavailable": "Данные недоступны"
    },
    "ja": {
        "averageFiveHour": "5時間平均",
        "averageWeekly": "週間平均",
      "fiveHour": "5時間残量",
      "weekly": "週間残量",
      "remaining": "残高",
      "total": "総トークン",
      "unlimited": "無制限",
      "unknown": "不明",
      "loading": "残高を取得中",
      "stale": "更新されていません",
      "unavailable": "一部データ取得不可"
    }
  };
  // i18n:pet-dock:end
  let copy = petDockCopy.en;
  const style = document.createElement('style');
  style.id = 'remoteai-pet-dock-style';
  style.textContent = `
    [data-remoteai-dock-toolbar] { visibility:hidden!important; pointer-events:none!important; }
    [data-remoteai-dock-mascot-host] { z-index:1!important; anchor-name:--remoteai-dock-mascot; user-select:none; }
    [data-remoteai-dock-tray] {
      translate:0 var(--remoteai-dock-tray-shift,0px)!important; z-index:2!important; pointer-events:none!important;
    }
    [data-remoteai-dock-tray] > [data-avatar-overlay-size="notification-tray"] { pointer-events:auto!important; }
    [data-remoteai-dock-anchored] {
      position-anchor:--remoteai-dock-mascot; position-try-fallbacks:--remoteai-dock-above;
      inset:auto!important; position-area:bottom; justify-self:anchor-center; align-self:start;
      margin:var(--remoteai-dock-tray-gap) 8px 0;
      height:var(--remoteai-dock-tray-height)!important; transform:none!important; translate:none!important;
    }
    [data-remoteai-dock-anchored] > [data-avatar-overlay-size="notification-tray"] {
      top:0!important; transform:none!important;
    }
    @position-try --remoteai-dock-above { position-area:top; align-self:end; margin-top:0; margin-bottom:8px; }
    #remoteai-pet-dock { position:absolute; width:224px; height:72px; z-index:0;
      pointer-events:none; user-select:none; font-family:Arial,'Microsoft YaHei',sans-serif;
      background-size:100% 100%; background-repeat:no-repeat; color:#e7fcff; }
    #remoteai-pet-dock .ra-metrics { position:absolute; left:29px; right:29px; top:29px;
      height:28px; display:grid; grid-template-columns:1fr 1fr; align-items:center;
      border-radius:4px; background:rgba(3,14,24,.72); text-shadow:0 1px 3px #000; }
    #remoteai-pet-dock .ra-window { text-align:center; line-height:1.05; min-width:0; }
    #remoteai-pet-dock .ra-window + .ra-window { border-left:1px solid #406674; }
    #remoteai-pet-dock .ra-label { font-size:9px; color:#bdd6dc; font-weight:600; }
    #remoteai-pet-dock .ra-value { font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; }
    #remoteai-pet-dock .ra-label, #remoteai-pet-dock .ra-value {
      position:relative; top:var(--ra-text-offset,2px); }
    #remoteai-pet-dock[data-show-labels=false] .ra-label { display:none; }
    #remoteai-pet-dock[data-show-labels=false] .ra-window {
      height:100%; display:flex; align-items:center; justify-content:center; }
    #remoteai-pet-dock[data-show-labels=false] .ra-value { line-height:1; }
    #remoteai-pet-dock[data-stale=true] .ra-value { color:#e9bd75!important; }
    #remoteai-pet-dock .ra-stale { position:absolute; top:59px; width:100%; text-align:center;
      font-size:8px; color:#edc17e; }
  `;
  document.head.append(style);
  const dock = document.createElement('div');
  dock.id = 'remoteai-pet-dock';
  dock.setAttribute('role', 'status');
  // No synthetic native hit region: the base is display-only and cannot steal native pet/card clicks.
  dock.innerHTML = '<div class="ra-metrics"><div class="ra-window"><div class="ra-label"></div><div class="ra-value" data-side="left">--</div></div><div class="ra-window"><div class="ra-label"></div><div class="ra-value" data-side="right">--</div></div></div><div class="ra-stale" hidden></div>';
  const textMeasure = document.createElement('canvas').getContext('2d');
  const fontSizes = new Map();
  function valueFont(node, maximum, width) {
    const key = `${node.textContent}|${maximum}|${width}`;
    if (fontSizes.has(key)) return fontSizes.get(key);
    textMeasure.font = `700 ${maximum}px Arial, "Microsoft YaHei", sans-serif`;
    const measured = textMeasure.measureText(node.textContent).width;
    const size = Math.max(8, Math.min(maximum, maximum * Math.max(0, width - 3) / Math.max(1, measured)));
    if (fontSizes.size > 20) fontSizes.clear();
    fontSizes.set(key, size);
    return size;
  }
  const marked = new Map();
  let lastBeat = Date.now(), destroyed = false, trayHost = null, lastShift = 0;
  let quota = null, baseScale = 1;
  function mark(element, name, value = '') {
    if (!element) return;
    let attrs = marked.get(element);
    if (!attrs) { attrs = new Map(); marked.set(element, attrs); }
    if (!attrs.has(name)) attrs.set(name, element.getAttribute(name));
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  function setStyle(element, name, value) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
  function layout() {
    if (destroyed) return;
    const frame = document.querySelector('[data-avatar-overlay-content-frame]');
    const mascot = document.querySelector('[data-avatar-mascot="true"]');
    if (!frame || !mascot) { dock.hidden = true; return; }
    const rect = mascot.getBoundingClientRect();
    if (!rect.width || !rect.height) { dock.hidden = true; return; }
    dock.hidden = false;
    const host = mascot.closest('.group.absolute') ?? mascot.parentElement;
    mark(host, 'data-remoteai-dock-mascot-host');
    // Share the native pet's moving parent. Drag transforms now move both in the
    // same compositor frame, without waiting for a timer or position interpolation.
    if (dock.parentElement !== host) host.append(dock);
    for (const toolbar of document.querySelectorAll('[data-quick-chat-presentation], [data-avatar-overlay-proximity-region="quick-chat"]')) {
      mark(toolbar, 'data-remoteai-dock-toolbar');
      mark(toolbar, 'inert');
    }
    placeDock(frame, host, rect);
  }
  function placeDock(frame, host, rect) {
    const frameRect = frame.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const scaleX = hostRect.width / host.offsetWidth || 1;
    const scaleY = hostRect.height / host.offsetHeight || 1;
    // Calibrate against the upstream 128px pet / 224px base ratio. Never resize the pet.
    baseScale = Math.min(rect.width / 128, Math.max(0, frameRect.width - 16) / 224) / scaleX;
    const width = 224 * baseScale, height = 72 * baseScale;
    const x = (rect.left + rect.width / 2 - hostRect.left) / scaleX - width / 2;
    const y = (rect.bottom - hostRect.top) / scaleY - 21 * baseScale;
    setStyle(dock, 'left', `${x}px`);
    setStyle(dock, 'top', `${y}px`);
    setStyle(dock, 'width', `${width}px`);
    setStyle(dock, 'height', `${height}px`);
    styleMetrics(width, height);
    placeTray(hostRect.top + (y + height + Math.max(5, 8 * baseScale)) * scaleY, rect);
  }
  function styleMetrics(width, height) {
    setStyle(dock, '--ra-text-offset', `${Math.max(1.5, 3.2 * baseScale)}px`);
    const metrics = dock.querySelector('.ra-metrics');
    setStyle(metrics, 'left', `${29 * baseScale}px`);
    setStyle(metrics, 'right', `${29 * baseScale}px`);
    setStyle(metrics, 'top', `${29 * baseScale}px`);
    setStyle(metrics, 'height', `${Math.max(21, 28 * baseScale)}px`);
    for (const label of dock.querySelectorAll('.ra-label')) setStyle(label, 'font-size', `${Math.max(7, 9 * baseScale)}px`);
    const maximumValueFont = quota?.showLabels === true ? Math.max(11, 17 * baseScale) : Math.max(14, 24 * baseScale);
    for (const value of dock.querySelectorAll('.ra-value')) setStyle(value, 'font-size', `${valueFont(value, maximumValueFont, (width - 58 * baseScale) / 2)}px`);
    setStyle(dock.querySelector('.ra-stale'), 'top', `${height - Math.max(6, 8 * baseScale)}px`);
    setStyle(dock.querySelector('.ra-stale'), 'font-size', `${Math.max(6, 8 * baseScale)}px`);
  }
  function clearTrayStyles(element) {
    for (const suffix of ['shift', 'gap', 'height']) {
      element?.style.removeProperty(`--remoteai-dock-tray-${suffix}`);
    }
  }
  function placeTray(desiredTop, mascotRect) {
    const tray = document.querySelector('[data-avatar-overlay-size="notification-tray"]');
    const nextHost = tray?.parentElement;
    if (trayHost !== nextHost) {
      clearTrayStyles(trayHost);
      trayHost = nextHost;
      lastShift = 0;
    }
    if (tray && trayHost) {
      mark(trayHost, 'data-remoteai-dock-tray');
      const trayRect = tray.getBoundingClientRect();
      // Anchors follow native drag transforms in layout, before the next JS animation frame.
      // Only the actual card surface receives input; its displaced outer box stays transparent.
      if (CSS.supports('position-area', 'bottom') && CSS.supports('position-try-fallbacks', '--above')) {
        setStyle(trayHost, '--remoteai-dock-tray-gap', `${desiredTop - mascotRect.bottom}px`);
        setStyle(trayHost, '--remoteai-dock-tray-height', `${Math.max(trayRect.height, tray.scrollHeight)}px`);
        mark(trayHost, 'data-remoteai-dock-anchored');
        return;
      }
      const naturalTop = trayRect.top - lastShift;
      // Replace the former toolbar space, retaining the real activity cards and all their handlers.
      const shift = desiredTop - naturalTop;
      lastShift = shift;
      setStyle(trayHost, '--remoteai-dock-tray-shift', `${shift}px`);
    }
  }
  function formatTokens(value) {
    if (!Number.isFinite(value) || value < 0) return '--';
    if (value >= 1e6) return `${(value / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(value);
  }
  function formatBalance(remaining) {
    if (!remaining) return '--';
    if (remaining.unlimited) return copy.unlimited;
    if (!Number.isFinite(remaining.amount)) return '--';
    const symbols = { USD: '$', CNY: '¥', RMB: '¥', EUR: '€', GBP: '£' };
    const value = remaining.amount >= 10000
      ? `${(remaining.amount / 1000).toFixed(2)}K` : remaining.amount.toFixed(2);
    const prefix = symbols[remaining.unit?.toUpperCase()];
    return prefix ? `${prefix}${value}` : `${value} ${remaining.unit ?? ''}`.trim();
  }
  function update(next, image) {
    lastBeat = Date.now();
    quota = next;
    dock.dataset.showLabels = String(next.showLabels === true);
    if (image && dock.style.backgroundImage !== `url("${image}")`) dock.style.backgroundImage = `url("${image}")`;
    dock.dataset.stale = String(!!next.stale || !!next.error);
    copy = petDockCopy[next.language] ?? petDockCopy.en;
    const fallback = {
      left: { label: next.average ? copy.averageFiveHour : copy.fiveHour, value: next.fiveHour ? `${Math.round(next.fiveHour.remaining)}%` : '--', percent: next.fiveHour?.remaining },
      right: { label: next.average ? copy.averageWeekly : copy.weekly, value: next.weekly ? `${Math.round(next.weekly.remaining)}%` : '--', percent: next.weekly?.remaining },
    };
    const display = next.kind === 'api' ? {
      left: { label: copy.remaining, value: formatBalance(next.remaining),
        detail: next.remaining?.unlimited ? copy.unlimited : next.remaining
          ? `${next.remaining.amount.toFixed(2)} ${next.remaining.unit}` : copy.unknown,
        critical: next.remaining?.amount === 0 },
      right: { label: copy.total, value: formatTokens(next.totalTokens),
        detail: `${next.totalTokens ?? copy.unknown} Token` },
    } : fallback;
    for (const side of ['left', 'right']) {
      const metric = display[side];
      const node = dock.querySelector(`[data-side="${side}"]`);
      const label = node.parentElement.querySelector('.ra-label');
      const value = metric.value;
      if (node.textContent !== value) node.textContent = value;
      if (label.textContent !== metric.label) label.textContent = metric.label;
      node.parentElement.title = `${metric.label}：${metric.detail ?? value}`;
      node.style.color = metric.critical || metric.percent <= 20 ? '#ff9292' : metric.percent <= 50 ? '#ffd28a' : '#e7fcff';
    }
    const warning = dock.querySelector('.ra-stale');
    warning.hidden = !next.error && !next.stale && !next.pending;
    warning.textContent = '';
    if (next.pending) warning.textContent = copy.loading;
    if (next.stale) warning.textContent = copy.stale;
    if (next.error) warning.textContent = copy.unavailable;
    dock.setAttribute('aria-label', `Interlude：${display.left.label}${display.left.detail ?? display.left.value}，${display.right.label}${display.right.detail ?? display.right.value}${next.stale ? `, ${copy.stale}` : ''}`);
    layout();
  }
  let animationFrame;
  function tick() {
    if (destroyed) return;
    layout();
    animationFrame = requestAnimationFrame(tick);
  }
  const watchdog = setInterval(() => {
    if (Date.now() - lastBeat > 20_000) destroy();
  }, 1000);
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(animationFrame);
    clearInterval(watchdog);
    dock.remove();
    style.remove();
    clearTrayStyles(trayHost);
    for (const [element, attrs] of marked) {
      for (const [name, original] of attrs) {
        if (original === null) element.removeAttribute(name); else element.setAttribute(name, original);
      }
    }
    marked.clear();
    delete window[KEY];
  }
  function inspect() {
    const rect = e => e?.getBoundingClientRect().toJSON() ?? null;
    const mascot = document.querySelector('[data-avatar-mascot="true"]');
    return { installed: !destroyed, dockVisible: dock.isConnected && !dock.hidden,
      quota, baseScale, dock: rect(dock), mascot: rect(mascot),
      sameMovingParent: dock.parentElement === (mascot?.closest('.group.absolute') ?? mascot?.parentElement),
      tray: rect(document.querySelector('[data-avatar-overlay-size="notification-tray"]')),
      toolbarHidden: [...document.querySelectorAll('[data-quick-chat-presentation]')].every(e => getComputedStyle(e).visibility === 'hidden'),
      dockCount: document.querySelectorAll('#remoteai-pet-dock').length };
  }
  window[KEY] = { version: 15, update, destroy, inspect };
  tick();
})();
