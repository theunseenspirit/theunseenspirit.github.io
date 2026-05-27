const ui = {
  gate: document.querySelector("#gate"),
  dashboard: document.querySelector("#dashboard"),
  form: document.querySelector("#unlockForm"),
  password: document.querySelector("#passwordInput"),
  unlockButton: document.querySelector("#unlockButton"),
  status: document.querySelector("#payloadStatus"),
  dataMeta: document.querySelector("#dataMeta"),
  metricStrip: document.querySelector("#metricStrip"),
  trendTitle: document.querySelector("#trendTitle"),
  trendDate: document.querySelector("#trendDate"),
  trendChart: document.querySelector("#trendChart"),
  metricTabs: document.querySelector("#metricTabs"),
  rangeControls: document.querySelector("#rangeControls"),
  heatmapTitle: document.querySelector("#heatmapTitle"),
  heatmap: document.querySelector("#heatmap"),
  heatmapDate: document.querySelector("#heatmapDate"),
  distributionDate: document.querySelector("#distributionDate"),
  metricPie: document.querySelector("#metricPie"),
  periodBarsDate: document.querySelector("#periodBarsDate"),
  periodBars: document.querySelector("#periodBars"),
  metricDetailsDate: document.querySelector("#metricDetailsDate"),
  metricDetails: document.querySelector("#metricDetails"),
  tooltip: document.querySelector("#chartTooltip"),
  lockButton: document.querySelector("#lockButton")
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const ENCRYPTED_PAYLOAD_SCHEMA = "health-dashboard-encrypted/v1";
const MIN_KDF_ITERATIONS = 300000;
const MAX_KDF_ITERATIONS = 2000000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_ENCRYPTED_PAYLOAD_BYTES = 12 * 1024 * 1024;

const state = {
  encrypted: null,
  data: null,
  metric: "steps",
  range: "365",
  tooltipTarget: null,
  isDecrypting: false,
  hasPlayedIntro: false,
  introTimer: null,
  rangeTimer: null,
  revealObserver: null
};

const healthMetrics = [
  {
    id: "steps",
    label: "Steps",
    category: "Activity",
    unit: "steps",
    digits: 0,
    color: "var(--blue)",
    direction: "higher",
    zeroBaseline: true,
    description: "Daily step count from the preferred step source.",
    value: (day) => day.totals?.steps
  },
  {
    id: "activeEnergy",
    label: "Active Energy Calories",
    shortLabel: "Active Calories",
    category: "Activity",
    unit: "Cal",
    digits: 0,
    color: "var(--red)",
    direction: "higher",
    zeroBaseline: true,
    description: "Calories actively burned above resting energy.",
    value: (day) => day.totals?.activeEnergy
  },
  {
    id: "exerciseMinutes",
    label: "Exercise Minutes",
    category: "Activity",
    unit: "min",
    digits: 0,
    color: "var(--green)",
    direction: "higher",
    zeroBaseline: true,
    description: "Minutes recorded as exercise.",
    value: (day) => day.totals?.exerciseMinutes
  },
  {
    id: "standHours",
    label: "Stand Hours",
    category: "Activity",
    unit: "hr",
    digits: 1,
    color: "var(--gold)",
    direction: "higher",
    zeroBaseline: true,
    description: "Hours with standing activity.",
    value: (day) => day.totals?.standHours ?? minutesToHours(day.totals?.standMinutes)
  },
  {
    id: "distanceMiles",
    label: "Walking and Running Distance",
    shortLabel: "Distance",
    category: "Activity",
    unit: "mi",
    digits: 1,
    color: "var(--cyan)",
    direction: "higher",
    zeroBaseline: true,
    description: "Daily walking and running distance.",
    value: (day) => day.totals?.distanceMiles
  },
  {
    id: "sleepHours",
    label: "Sleep Hours",
    category: "Recovery",
    unit: "hr",
    digits: 1,
    color: "var(--violet)",
    direction: "higher",
    zeroBaseline: true,
    description: "Hours asleep, grouped by wake date.",
    value: (day) => day.sleep?.asleepHours
  },
  {
    id: "sleepEfficiency",
    label: "Sleep Efficiency",
    category: "Recovery",
    unit: "%",
    unitJoiner: "",
    digits: 0,
    color: "var(--purple)",
    direction: "higher",
    zeroBaseline: false,
    description: "Asleep time divided by tracked sleep window.",
    value: (day) => day.sleep?.efficiency
  },
  {
    id: "restingHeartRate",
    label: "Resting Heart Rate",
    shortLabel: "Resting HR",
    category: "Vitals",
    unit: "bpm",
    digits: 0,
    color: "var(--green)",
    direction: "lower",
    zeroBaseline: false,
    description: "Average resting heart rate for the day.",
    value: (day) => day.samples?.restingHeartRate?.avg
  },
  {
    id: "hrv",
    label: "Heart Rate Variability",
    shortLabel: "HRV",
    category: "Vitals",
    unit: "ms",
    digits: 0,
    color: "var(--gold)",
    direction: "higher",
    zeroBaseline: true,
    description: "Apple Watch SDNN heart rate variability.",
    value: (day) => day.samples?.hrv?.avg
  },
  {
    id: "vo2Max",
    label: "VO2 Max",
    category: "Vitals",
    unit: "ml/kg/min",
    digits: 1,
    color: "var(--blue)",
    direction: "higher",
    zeroBaseline: false,
    description: "Estimated cardiorespiratory fitness.",
    value: (day) => day.samples?.vo2Max?.avg
  },
  {
    id: "bodyMass",
    label: "Body Weight",
    category: "Body",
    unit: "lb",
    digits: 1,
    color: "var(--ink)",
    direction: "neutral",
    zeroBaseline: false,
    description: "Body mass measured in pounds.",
    value: (day) => day.samples?.bodyMass?.avg
  },
  {
    id: "dietaryEnergy",
    label: "Dietary Calories",
    category: "Nutrition",
    unit: "Cal",
    digits: 0,
    color: "var(--orange)",
    direction: "neutral",
    zeroBaseline: true,
    description: "Calories logged as food energy.",
    value: (day) => day.totals?.dietaryEnergy
  },
  {
    id: "dietaryProtein",
    label: "Protein",
    category: "Nutrition",
    unit: "g",
    digits: 0,
    color: "var(--cyan)",
    direction: "neutral",
    zeroBaseline: true,
    description: "Protein grams logged for the day.",
    value: (day) => day.totals?.dietaryProtein
  },
  {
    id: "dietaryCarbs",
    label: "Carbohydrates",
    shortLabel: "Carbs",
    category: "Nutrition",
    unit: "g",
    digits: 0,
    color: "var(--gold)",
    direction: "neutral",
    zeroBaseline: true,
    description: "Carbohydrate grams logged for the day.",
    value: (day) => day.totals?.dietaryCarbs
  },
  {
    id: "dietaryFat",
    label: "Fat",
    category: "Nutrition",
    unit: "g",
    digits: 0,
    color: "var(--red)",
    direction: "neutral",
    zeroBaseline: true,
    description: "Fat grams logged for the day.",
    value: (day) => day.totals?.dietaryFat
  }
];

loadEncryptedPayload();

ui.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.encrypted) return;
  const secret = currentUnlockSecret();
  if (!secret) {
    setStatus("Enter the dashboard password.");
    updateUnlockButton();
    return;
  }
  setStatus("Decrypting.");
  state.isDecrypting = true;
  ui.gate.classList.add("is-decrypting");
  updateUnlockButton();
  try {
    state.data = await decryptHealthData(state.encrypted, secret);
    await playUnlockApproval();
    clearUnlockInputs();
    await showDashboard();
  } catch {
    ui.gate.classList.remove("is-decrypting", "is-approved", "is-handing-off");
    setStatus("Wrong password or damaged encrypted data.");
    ui.password.select();
  } finally {
    state.isDecrypting = false;
    updateUnlockButton();
  }
});

ui.password.addEventListener("input", updateUnlockButton);

ui.metricTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-metric]");
  if (!button) return;
  selectMetric(button.dataset.metric);
});

ui.metricStrip.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-metric]");
  if (!button) return;
  selectMetric(button.dataset.metric);
});

ui.metricDetails.addEventListener("click", (event) => {
  const row = event.target.closest("[data-metric]");
  if (!row) return;
  selectMetric(row.dataset.metric);
});

ui.metricDetails.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-metric]");
  if (!row) return;
  event.preventDefault();
  selectMetric(row.dataset.metric);
});

ui.rangeControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button) return;
  if (state.range === button.dataset.range) return;
  state.range = button.dataset.range;
  renderDashboard();
  playRangeUpdate();
});

ui.lockButton.addEventListener("click", lockDashboard);
ui.dashboard.addEventListener("pointerover", showChartTooltip);
ui.dashboard.addEventListener("pointermove", updateChartTooltip);
ui.dashboard.addEventListener("pointerleave", hideChartTooltip);
window.addEventListener("resize", () => {
  if (state.data) renderDashboard();
});

async function loadEncryptedPayload() {
  try {
    const response = await fetch("data/health-data.enc.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    validateEncryptedPayload(payload);
    state.encrypted = payload;
    setStatus("Encrypted data ready.");
    updateUnlockButton();
    ui.password.focus();
  } catch {
    state.encrypted = null;
    setStatus("Encrypted data file missing or invalid.");
    updateUnlockButton();
  }
}

function currentUnlockSecret() {
  return ui.password.value;
}

function updateUnlockButton() {
  ui.unlockButton.disabled = !state.encrypted || state.isDecrypting || !currentUnlockSecret();
}

function clearUnlockInputs() {
  ui.password.value = "";
}

async function playUnlockApproval() {
  ui.gate.classList.remove("is-decrypting");
  ui.gate.classList.add("is-approved");
  setStatus("Access approved.");
  await waitForAnimation(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 760);
}

function waitForAnimation(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

async function decryptHealthData(payload, password) {
  if (!crypto.subtle) {
    throw new Error("Web Crypto is not available.");
  }
  const safePayload = validateEncryptedPayload(payload);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: safePayload.salt,
      iterations: safePayload.iterations,
      hash: safePayload.hash
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: safePayload.iv },
    key,
    safePayload.data
  );
  return JSON.parse(textDecoder.decode(plain));
}

async function showDashboard() {
  renderDashboard();
  ui.gate.classList.add("is-handing-off");
  await waitForAnimation(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 360);
  ui.gate.hidden = true;
  ui.dashboard.hidden = false;
  playDashboardIntro();
  renderDashboard();
}

function lockDashboard() {
  state.data = null;
  state.metric = "steps";
  stopDashboardIntro();
  stopRangeUpdate();
  teardownScrollReveals();
  hideChartTooltip();
  ui.dashboard.hidden = true;
  ui.gate.hidden = false;
  ui.gate.classList.remove("is-decrypting", "is-approved", "is-handing-off");
  setStatus(state.encrypted ? "Encrypted data ready." : "Encrypted data file not found yet.");
  updateUnlockButton();
  ui.password.focus();
}

function playDashboardIntro() {
  stopDashboardIntro();
  if (state.hasPlayedIntro) return;
  state.hasPlayedIntro = true;
  ui.dashboard.classList.add("is-entering");
  state.introTimer = window.setTimeout(stopDashboardIntro, 1900);
}

function stopDashboardIntro() {
  if (state.introTimer) {
    window.clearTimeout(state.introTimer);
    state.introTimer = null;
  }
  ui.dashboard.classList.remove("is-entering");
}

function playRangeUpdate() {
  stopRangeUpdate();
  ui.dashboard.classList.add("is-range-updating");
  state.rangeTimer = window.setTimeout(stopRangeUpdate, 1500);
}

function stopRangeUpdate() {
  if (state.rangeTimer) {
    window.clearTimeout(state.rangeTimer);
    state.rangeTimer = null;
  }
  ui.dashboard.classList.remove("is-range-updating");
}

function setupScrollReveals() {
  const sections = Array.from(ui.dashboard.querySelectorAll(
    ".visual-grid .panel, .metric-table-panel, .import-help"
  ));
  const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (shouldReduceMotion || !("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  if (!state.revealObserver) {
    state.revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px"
    });
  }

  sections.forEach((section, index) => {
    if (!section.classList.contains("scroll-reveal")) {
      section.classList.add("scroll-reveal");
      section.style.setProperty("--scroll-delay", `${Math.min(index * 70, 280)}ms`);
    }
    if (!section.classList.contains("is-visible")) {
      state.revealObserver.observe(section);
    }
  });
}

function teardownScrollReveals() {
  state.revealObserver?.disconnect();
  state.revealObserver = null;
  ui.dashboard.querySelectorAll(".scroll-reveal").forEach((section) => {
    section.classList.remove("scroll-reveal", "is-visible");
    section.style.removeProperty("--scroll-delay");
  });
}

function showChartTooltip(event) {
  const target = chartTooltipTarget(event);
  if (!target) return;
  setChartTooltip(target, event);
}

function updateChartTooltip(event) {
  const target = chartTooltipTarget(event);
  if (!target) {
    hideChartTooltip();
    return;
  }
  setChartTooltip(target, event);
}

function chartTooltipTarget(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest("[data-tooltip]");
}

function setChartTooltip(target, event) {
  const title = document.createElement("span");
  const value = document.createElement("strong");
  const detail = document.createElement("small");
  title.textContent = target.dataset.tooltipTitle || "";
  value.textContent = target.dataset.tooltipValue || target.dataset.tooltip || "";
  detail.textContent = target.dataset.tooltipDetail || "";
  ui.tooltip.replaceChildren(title, value, detail);
  ui.tooltip.hidden = false;
  setActiveChartTarget(target);
  positionChartTooltip(event);
}

function setActiveChartTarget(target) {
  const nextTarget = target.closest(".chart-point-target");
  if (state.tooltipTarget === nextTarget) return;
  state.tooltipTarget?.classList.remove("is-active");
  state.tooltipTarget = nextTarget;
  state.tooltipTarget?.classList.add("is-active");
}

function positionChartTooltip(event) {
  const margin = 14;
  const rect = ui.tooltip.getBoundingClientRect();
  const x = Math.min(window.innerWidth - rect.width - margin, event.clientX + 16);
  const y = event.clientY + rect.height + 18 > window.innerHeight
    ? event.clientY - rect.height - 14
    : event.clientY + 16;
  ui.tooltip.style.transform = `translate(${Math.max(margin, x)}px, ${Math.max(margin, y)}px)`;
}

function hideChartTooltip() {
  ui.tooltip.hidden = true;
  state.tooltipTarget?.classList.remove("is-active");
  state.tooltipTarget = null;
}

function renderDashboard() {
  if (!state.data) return;
  const { source } = state.data;
  const metrics = availableMetrics();
  if (!metrics.length) {
    renderNoMetrics();
    return;
  }
  if (!metrics.some((metric) => metric.id === state.metric)) {
    state.metric = metrics[0].id;
  }

  updateRangeControls();
  ui.dataMeta.textContent = source?.range?.start && source?.range?.end
    ? `${dateLabel(source.range.start)} to ${dateLabel(source.range.end)}`
    : "";

  renderMetricTabs(metrics);
  renderMetricStrip(metrics);
  renderTrend();
  renderHeatmap();
  renderDistribution();
  renderPeriodBars();
  renderMetricDetails(metrics);
  setupScrollReveals();
}

function renderNoMetrics() {
  ui.metricStrip.innerHTML = `<p class="empty-state">No plottable health metrics found.</p>`;
  ui.trendChart.innerHTML = `<p class="empty-state">No metric data.</p>`;
  ui.heatmap.innerHTML = `<p class="empty-state">No metric data.</p>`;
  ui.metricPie.innerHTML = `<p class="empty-state">No metric data.</p>`;
  ui.periodBars.innerHTML = `<p class="empty-state">No metric data.</p>`;
  ui.metricDetails.innerHTML = `<p class="empty-state">No metric data.</p>`;
}

function availableMetrics() {
  const days = state.data?.days || [];
  return healthMetrics.filter((metric) => days.some((day) => metricValue(metric, day) !== null));
}

function selectedMetric() {
  return availableMetrics().find((metric) => metric.id === state.metric) || availableMetrics()[0] || healthMetrics[0];
}

function selectMetric(metricId) {
  if (!availableMetrics().some((metric) => metric.id === metricId)) return;
  if (state.metric === metricId) return;
  state.metric = metricId;
  renderDashboard();
  playRangeUpdate();
}

function renderMetricTabs(metrics) {
  ui.metricTabs.innerHTML = metrics.map((metric) => `
    <button class="metric-tab ${metric.id === state.metric ? "is-active" : ""}" type="button" data-metric="${metric.id}" style="--metric-color:${metric.color}">
      ${escapeHtml(metric.shortLabel || metric.label)}
    </button>
  `).join("");
}

function renderMetricStrip(metrics) {
  const days = getRangeDays(state.data.days, state.range);
  const previous = getPreviousRangeDays(state.data.days, state.range);
  ui.metricStrip.innerHTML = metrics.map((metric) => {
    const average = averageMetric(days, metric);
    const previousAverage = averageMetric(previous, metric);
    const delta = metricDeltaSub(average, previousAverage, metric);
    const coverage = metricCoverage(days, metric);
    return `
      <button class="metric-card metric-card-button ${metric.id === state.metric ? "is-active" : ""}" type="button" data-metric="${metric.id}" style="--metric-color:${metric.color}">
        <span class="metric-card-top">
          <span class="metric-label">${escapeHtml(metric.shortLabel || metric.label)}</span>
          <span class="metric-category">${escapeHtml(metric.category)}</span>
        </span>
        <span>
          <span class="metric-value">${escapeHtml(formatMetricValue(metric, average, { withUnit: false }))}</span>
          <span class="metric-sub ${delta.className}" title="${escapeHtml(delta.longText || "")}">
            ${escapeHtml(delta.text || `${formatNumber(coverage, 0)}% coverage`)}
          </span>
        </span>
      </button>
    `;
  }).join("");
}

function renderTrend() {
  const metric = selectedMetric();
  ui.trendTitle.textContent = metric.shortLabel || metric.label;
  ui.trendDate.textContent = rangeLabel(state.range);
  syncMetricButtons();

  const days = getRangeDays(state.data.days, state.range);
  const bucket = trendBucketForRange(state.range);
  const series = bucketMetricSeries(metricSeries(days, metric), bucket);
  ui.trendChart.innerHTML = lineChart(series, {
    metric,
    bucket,
    range: state.range,
    width: chartWidth(),
    height: isCompactViewport() ? 268 : 316
  });
}

function renderHeatmap() {
  const metric = selectedMetric();
  const days = getRangeDays(state.data.days, state.range);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const end = parseDateKey(days.at(-1)?.date);
  ui.heatmapTitle.textContent = `${metric.shortLabel || metric.label} Heatmap`;
  ui.heatmapDate.textContent = rangeLabel(state.range);
  if (!end) {
    ui.heatmap.innerHTML = `<p class="empty-state">No ${escapeHtml(metric.label.toLowerCase())} data.</p>`;
    return;
  }
  const start = parseDateKey(days[0]?.date) || addDays(end, -370);
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  const values = metricSeries(days, metric).map((point) => point.value).sort((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75, 0.9].map((pct) => quantile(values, pct));
  const weeks = Math.max(1, Math.floor(totalDays / 7) + 1);
  const cells = [];

  for (let i = 0; i <= totalDays; i += 1) {
    const date = addDays(start, i);
    const key = toDateKey(date);
    const day = byDate.get(key);
    const value = day ? metricValue(metric, day) : null;
    const level = heatLevel(value, thresholds);
    const week = Math.floor(i / 7);
    const dow = date.getUTCDay();
    const label = value === null
      ? `${dateLabel(key)}: no ${metric.label.toLowerCase()} data`
      : `${dateLabel(key)}: ${formatMetricValue(metric, value)}`;
    const cellDelay = heatCellDelay(week, dow, weeks);
    cells.push(`
      <rect class="heat-cell h${level}" style="--cell-delay:${cellDelay}ms; --metric-color:${metric.color}" x="${week * 14}" y="${dow * 14}" width="11" height="11"
        data-tooltip="${escapeHtml(label)}"
        data-tooltip-title="${escapeHtml(dateLabel(key))}"
        data-tooltip-value="${escapeHtml(value === null ? "No data" : formatMetricValue(metric, value))}"
        data-tooltip-detail="${escapeHtml(metric.label)}"></rect>
    `);
  }

  ui.heatmap.innerHTML = `
    <svg class="heatmap-svg metric-heatmap-svg" style="--heatmap-width:${weeks * 14}px; --metric-color:${metric.color}" viewBox="0 0 ${weeks * 14} 98" role="img" aria-label="${escapeHtml(metric.label)} daily heatmap">
      ${cells.join("")}
    </svg>
  `;
}

function renderDistribution() {
  const metric = selectedMetric();
  const days = getRangeDays(state.data.days, state.range);
  const series = metricSeries(days, metric);
  ui.distributionDate.textContent = rangeLabel(state.range);
  if (!series.length) {
    ui.metricPie.innerHTML = `<p class="empty-state">No ${escapeHtml(metric.label.toLowerCase())} values.</p>`;
    return;
  }

  const buckets = distributionBuckets(series, metric);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const gradient = conicGradient(buckets, total);
  const average = averageSeries(series);
  ui.metricPie.innerHTML = `
    <div class="pie-layout" style="--metric-color:${metric.color}">
      <div class="pie-chart" style="background:${gradient}" aria-label="${escapeHtml(metric.label)} distribution">
        <span>${escapeHtml(formatMetricValue(metric, average, { withUnit: false }))}</span>
        <small>avg</small>
      </div>
      <div class="pie-legend">
        ${buckets.map((bucket, index) => `
          <button class="pie-legend-item" type="button" style="--bucket-color:${bucketColor(index)}"
            data-tooltip="${escapeHtml(`${bucket.label}: ${formatUnit(bucket.count, 0, "day", "days")}`)}"
            data-tooltip-title="${escapeHtml(bucket.label)}"
            data-tooltip-value="${escapeHtml(formatUnit(bucket.count, 0, "day", "days"))}"
            data-tooltip-detail="${escapeHtml(bucketRangeLabel(bucket, metric))}">
            <span></span>
            <strong>${escapeHtml(bucket.label)}</strong>
            <em>${formatNumber(total ? (bucket.count / total) * 100 : 0, 0)}%</em>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPeriodBars() {
  const metric = selectedMetric();
  const days = getRangeDays(state.data.days, state.range);
  const bucket = trendBucketForRange(state.range);
  const series = bucketMetricSeries(metricSeries(days, metric), bucket);
  ui.periodBarsDate.textContent = bucket.label;
  if (!series.length) {
    ui.periodBars.innerHTML = `<p class="empty-state">No ${escapeHtml(metric.label.toLowerCase())} values.</p>`;
    return;
  }

  const values = series.map((point) => point.value);
  const max = Math.max(...values);
  const min = metric.zeroBaseline ? 0 : Math.min(...values);
  const span = Math.max(max - min, 1);
  const bars = series.map((point, index) => {
    const height = metric.zeroBaseline
      ? (point.value / Math.max(max, 1)) * 100
      : ((point.value - min) / span) * 86 + 10;
    const label = periodLabel(point);
    return `
      <div class="period-bar-wrap chart-point-target">
        <div
          class="period-bar"
          style="--bar-height:${Math.max(4, height).toFixed(1)}%; --bar-delay:${Math.min(520, index * 16)}ms; --metric-color:${metric.color}"
          data-tooltip="${escapeHtml(`${label}: ${formatMetricValue(metric, point.value)}`)}"
          data-tooltip-title="${escapeHtml(label)}"
          data-tooltip-value="${escapeHtml(formatMetricValue(metric, point.value))}"
          data-tooltip-detail="${escapeHtml(point.count > 1 ? `${point.count} days` : metric.label)}"
          aria-label="${escapeHtml(`${label}: ${formatMetricValue(metric, point.value)}`)}"
        ></div>
      </div>
    `;
  }).join("");

  ui.periodBars.innerHTML = `
    <div class="period-bars-row" style="--bar-count:${series.length}; --metric-color:${metric.color}">
      ${bars}
    </div>
  `;
}

function renderMetricDetails(metrics) {
  const days = getRangeDays(state.data.days, state.range);
  ui.metricDetailsDate.textContent = rangeLabel(state.range);
  ui.metricDetails.innerHTML = metrics.map((metric) => {
    const series = metricSeries(days, metric);
    const average = averageSeries(series);
    const latest = latestMetric(days, metric);
    const coverage = metricCoverage(days, metric);
    return `
      <div class="metric-row ${metric.id === state.metric ? "is-active" : ""}" data-metric="${metric.id}" role="button" tabindex="0" style="--metric-color:${metric.color}">
        <span class="metric-row-marker" aria-hidden="true"></span>
        <span class="metric-row-main">
          <strong>${escapeHtml(metric.label)}</strong>
          <small>${escapeHtml(metric.description)}</small>
        </span>
        <span class="metric-row-stat">
          <strong>${escapeHtml(formatMetricValue(metric, average))}</strong>
          <small>range avg</small>
        </span>
        <span class="metric-row-stat">
          <strong>${escapeHtml(latest ? formatMetricValue(metric, latest.value) : "--")}</strong>
          <small>${escapeHtml(latest ? dateShort(latest.date) : "latest")}</small>
        </span>
        <span class="metric-row-stat">
          <strong>${formatNumber(coverage, 0)}%</strong>
          <small>coverage</small>
        </span>
      </div>
    `;
  }).join("");
}

function syncMetricButtons() {
  ui.dashboard.querySelectorAll("[data-metric]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.metric === state.metric);
  });
}

function metricSeries(days, metric) {
  return days
    .map((day) => ({ date: day.date, value: metricValue(metric, day) }))
    .filter((point) => point.value !== null);
}

function metricValue(metric, day) {
  if (!day) return null;
  const value = cleanNumber(metric.value(day));
  return value === null ? null : value;
}

function averageMetric(days, metric) {
  return averageSeries(metricSeries(days, metric));
}

function averageSeries(series) {
  if (!series.length) return null;
  return series.reduce((sum, point) => sum + point.value, 0) / series.length;
}

function latestMetric(days, metric) {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const value = metricValue(metric, days[index]);
    if (value !== null) return { date: days[index].date, value };
  }
  return null;
}

function metricCoverage(days, metric) {
  if (!days.length) return 0;
  return (metricSeries(days, metric).length / days.length) * 100;
}

function metricDeltaSub(current, previous, metric) {
  if (current == null || previous == null) return { text: "", className: "" };
  const delta = current - previous;
  const threshold = metric.digits > 0 ? 0.05 : 0.5;
  if (Math.abs(delta) < threshold) {
    return { text: "flat vs prev", longText: "Flat versus previous range", className: "warn" };
  }
  const className = metric.direction === "neutral"
    ? "warn"
    : metric.direction === "lower"
      ? delta < 0 ? "good" : "down"
      : delta > 0 ? "good" : "down";
  const text = `${delta > 0 ? "+" : ""}${formatMetricValue(metric, delta, { withUnit: false })} vs prev`;
  return {
    text,
    longText: `${text} ${metric.unit ? metric.unit : ""}`.trim(),
    className
  };
}

function lineChart(series, { metric, bucket, range, width, height }) {
  if (series.length < 2) {
    return `<p class="empty-state">Not enough ${escapeHtml(metric.label.toLowerCase())} data.</p>`;
  }
  const compact = width < 520;
  const pad = compact
    ? { top: 18, right: 28, bottom: 38, left: 44 }
    : { top: 24, right: 20, bottom: 44, left: 58 };
  const values = series.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (metric.zeroBaseline) min = 0;
  if (min === max) {
    min = metric.zeroBaseline ? 0 : min - 1;
    max += 1;
  }
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const gradientId = `trendArea-${metric.id}`;
  const pointFor = (point, index) => {
    const x = pad.left + (index / Math.max(series.length - 1, 1)) * innerW;
    const y = pad.top + (1 - ((point.value - min) / (max - min))) * innerH;
    return [x, y];
  };
  const points = series.map(pointFor);
  const line = smoothPath(points);
  const area = areaPath(points, height - pad.bottom);
  const hitTargets = points.map(([x, y], index) => {
    const point = series[index];
    const meta = chartPointMeta(point, metric, bucket);
    const prevX = points[index - 1]?.[0] ?? pad.left;
    const nextX = points[index + 1]?.[0] ?? width - pad.right;
    const startX = index === 0 ? pad.left : (prevX + x) / 2;
    const endX = index === points.length - 1 ? width - pad.right : (x + nextX) / 2;
    return `
      <g class="chart-point-target">
        <line class="chart-hover-guide" x1="${x.toFixed(1)}" y1="${pad.top}" x2="${x.toFixed(1)}" y2="${height - pad.bottom}"></line>
        <rect
          class="chart-hit-band"
          x="${startX.toFixed(1)}"
          y="${pad.top}"
          width="${Math.max(1, endX - startX).toFixed(1)}"
          height="${innerH}"
          data-tooltip="${escapeHtml(`${meta.title}: ${meta.value}`)}"
          aria-label="${escapeHtml(`${meta.title}: ${meta.value}`)}"
          data-tooltip-title="${meta.title}"
          data-tooltip-value="${meta.value}"
          data-tooltip-detail="${meta.detail}"
        ></rect>
        <circle class="chart-hover-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"></circle>
      </g>
    `;
  }).join("");
  const yLines = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const y = pad.top + step * innerH;
    const value = max - step * (max - min);
    return `
      <line class="grid-line${step === 1 ? " grid-line-base" : ""}" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line>
      <text class="axis-label axis-y" x="${pad.left - 12}" y="${y + 4}">${axisNumber(value, metric)}</text>
    `;
  }).join("");
  const xLabels = xAxisLabels(series, points, range, height);
  return `
    <svg class="trend-svg" style="--chart-color:${metric.color}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)} trend">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${metric.color}" stop-opacity="0.22"></stop>
          <stop offset="0.62" stop-color="${metric.color}" stop-opacity="0.10"></stop>
          <stop offset="1" stop-color="${metric.color}" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      ${yLines}
      <path class="trend-area" fill="url(#${gradientId})" d="${area}"></path>
      <path class="trend-line" pathLength="1" style="stroke:${metric.color}" d="${line}"></path>
      <g class="chart-hit-layer">${hitTargets}</g>
      ${xLabels}
    </svg>
  `;
}

function trendBucketForRange(range) {
  if (range === "all") return { unit: "month", label: "Monthly avg" };
  const days = rangeDays(range);
  if (days <= 45) return { unit: "day", label: "Daily" };
  if (days <= 400) return { unit: "week", label: "Weekly avg" };
  return { unit: "month", label: "Monthly avg" };
}

function bucketMetricSeries(series, bucket) {
  if (!bucket || bucket.unit === "day") return series.map((point) => ({ ...point, endDate: point.date, count: 1 }));
  const grouped = new Map();
  series.forEach((point) => {
    const key = bucketKey(point.date, bucket.unit);
    const item = grouped.get(key) || {
      date: point.date,
      endDate: point.date,
      sum: 0,
      count: 0
    };
    item.sum += point.value;
    item.count += 1;
    if (point.date < item.date) item.date = point.date;
    if (point.date > item.endDate) item.endDate = point.date;
    grouped.set(key, item);
  });
  return Array.from(grouped.values()).map((item) => ({
    date: item.date,
    endDate: item.endDate,
    value: item.sum / item.count,
    count: item.count
  }));
}

function bucketKey(dateKeyValue, unit) {
  const date = parseDateKey(dateKeyValue);
  if (!date) return dateKeyValue;
  const year = date.getUTCFullYear();
  if (unit === "week") {
    const weekStart = addDays(date, -date.getUTCDay());
    return toDateKey(weekStart);
  }
  if (unit === "quarter") {
    return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function chartPointMeta(point, metric, bucket) {
  const title = periodLabel(point);
  const value = formatMetricValue(metric, point.value);
  const average = bucket?.unit && bucket.unit !== "day" ? bucket.label.replace(" avg", " average") : "";
  const count = point.count > 1 ? `${point.count} days${average ? `, ${average.toLowerCase()}` : ""}` : metric.label;
  return {
    title: escapeHtml(title),
    value: escapeHtml(value),
    detail: escapeHtml(count)
  };
}

function axisNumber(value, metric) {
  if (metric.unit === "hr" || metric.digits > 0) return formatNumber(value, Math.min(metric.digits, 1));
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${formatNumber(value / 1000000, 1)}M`;
  if (abs >= 10000) return `${formatNumber(value / 1000, 1)}k`;
  return formatNumber(value, 0);
}

function xAxisLabels(series, points, range, height) {
  const y = height - 8;
  if (range === "all" || rangeDays(range) >= 365) {
    const seenYears = new Set();
    const labels = [];
    series.forEach((point, index) => {
      const date = parseDateKey(point.date);
      if (!date) return;
      const year = date.getUTCFullYear();
      if (seenYears.has(year)) return;
      seenYears.add(year);
      const x = points[index][0];
      labels.push(`
        <line class="year-tick" x1="${x.toFixed(1)}" y1="${height - 28}" x2="${x.toFixed(1)}" y2="${height - 22}"></line>
        <text class="axis-label axis-year" x="${x.toFixed(1)}" y="${y}">${year}</text>
      `);
    });
    return labels.join("");
  }

  const first = series[0];
  const last = series.at(-1);
  return `
    <text class="axis-label" x="${points[0][0].toFixed(1)}" y="${y}">${dateShort(first.date)}</text>
    <text class="axis-label axis-end" x="${points.at(-1)[0].toFixed(1)}" y="${y}">${dateShort(last.date)}</text>
  `;
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  const commands = [`M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const previous = points[i - 1] || current;
    const following = points[i + 2] || next;
    const cp1 = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6
    ];
    const cp2 = [
      next[0] - (following[0] - current[0]) / 6,
      next[1] - (following[1] - current[1]) / 6
    ];
    commands.push([
      "C",
      cp1[0].toFixed(1),
      cp1[1].toFixed(1),
      cp2[0].toFixed(1),
      cp2[1].toFixed(1),
      next[0].toFixed(1),
      next[1].toFixed(1)
    ].join(" "));
  }
  return commands.join(" ");
}

function areaPath(points, baselineY) {
  const line = smoothPath(points);
  if (!points.length) return "";
  const first = points[0];
  const last = points.at(-1);
  return `${line} L ${last[0].toFixed(1)} ${baselineY.toFixed(1)} L ${first[0].toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

function heatCellDelay(week, dayOfWeek, totalWeeks) {
  const weekProgress = totalWeeks > 1 ? week / (totalWeeks - 1) : 0;
  const wave = weekProgress * 1160;
  const columnJitter = seededJitter(week, 0) * 130;
  const rowJitter = seededJitter(week, dayOfWeek + 17) * 210;
  return Math.round(wave + columnJitter + rowJitter);
}

function seededJitter(a, b) {
  const value = Math.sin((a + 1) * 12.9898 + (b + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function heatLevel(value, thresholds) {
  if (value === null) return 0;
  if (value >= thresholds[3]) return 4;
  if (value >= thresholds[2]) return 3;
  if (value >= thresholds[1]) return 2;
  return 1;
}

function distributionBuckets(series, metric) {
  const values = series.map((point) => point.value).sort((a, b) => a - b);
  const min = values[0];
  const max = values.at(-1);
  if (min === max) {
    return [{
      label: "Same value",
      count: series.length,
      min,
      max
    }];
  }
  const q25 = quantile(values, 0.25);
  const q50 = quantile(values, 0.5);
  const q75 = quantile(values, 0.75);
  const buckets = [
    { label: "Low", count: 0, min, max: q25 },
    { label: "Mid low", count: 0, min: q25, max: q50 },
    { label: "Mid high", count: 0, min: q50, max: q75 },
    { label: "High", count: 0, min: q75, max }
  ];
  series.forEach((point) => {
    if (point.value <= q25) {
      buckets[0].count += 1;
    } else if (point.value <= q50) {
      buckets[1].count += 1;
    } else if (point.value <= q75) {
      buckets[2].count += 1;
    } else {
      buckets[3].count += 1;
    }
  });
  return buckets.filter((bucket) => bucket.count > 0 || metric);
}

function conicGradient(buckets, total) {
  if (!total) return "rgb(247 246 239 / 0.08)";
  let cursor = 0;
  const stops = buckets.map((bucket, index) => {
    const start = cursor;
    cursor += (bucket.count / total) * 100;
    return `${bucketColor(index)} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function bucketColor(index) {
  return [
    "color-mix(in srgb, var(--metric-color) 30%, #050505)",
    "color-mix(in srgb, var(--metric-color) 48%, #050505)",
    "color-mix(in srgb, var(--metric-color) 68%, #050505)",
    "color-mix(in srgb, var(--metric-color) 92%, #f7f6ef)"
  ][index % 4];
}

function bucketRangeLabel(bucket, metric) {
  if (bucket.min === bucket.max) return formatMetricValue(metric, bucket.min);
  return `${formatMetricValue(metric, bucket.min)} to ${formatMetricValue(metric, bucket.max)}`;
}

function chartWidth() {
  const fallback = isCompactViewport() ? 360 : 720;
  const measured = Math.floor(ui.trendChart.clientWidth || fallback);
  return Math.max(isCompactViewport() ? 280 : 520, measured);
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function getRangeDays(days, range) {
  if (range === "all") return days;
  return days.slice(-rangeDays(range));
}

function getPreviousRangeDays(days, range) {
  if (range === "all") return [];
  const count = rangeDays(range);
  return days.slice(-count * 2, -count);
}

function rangeDays(range) {
  const count = Number(range);
  return Number.isFinite(count) && count > 0 ? count : 365;
}

function updateRangeControls() {
  Array.from(ui.rangeControls.querySelectorAll("button")).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === state.range);
  });
}

function rangeLabel(range) {
  return {
    "30": "1M",
    "90": "3M",
    "180": "6M",
    "270": "9M",
    "365": "1Y",
    "730": "2Y",
    "1095": "3Y",
    all: "All"
  }[range] || `${rangeDays(range)}D`;
}

function periodLabel(point) {
  if (point.endDate && point.endDate !== point.date) {
    return `${dateShort(point.date)} to ${dateShort(point.endDate)}`;
  }
  return dateLabel(point.date);
}

function quantile(values, pct) {
  if (!values.length) return Infinity;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * pct)));
  return values[index];
}

function minutesToHours(value) {
  const minutes = cleanNumber(value);
  return minutes === null ? null : minutes / 60;
}

function formatUnit(value, digits, singular, plural = `${singular}s`) {
  const number = cleanNumber(value);
  if (number === null) return `-- ${plural}`;
  const rounded = Number(number.toFixed(digits));
  const unit = Math.abs(rounded) === 1 ? singular : plural;
  return `${formatNumber(number, digits)} ${unit}`;
}

function formatMetricValue(metric, value, options = {}) {
  const number = cleanNumber(value);
  if (number === null) return "--";
  const formatted = formatNumber(number, metric.digits);
  if (options.withUnit === false || !metric.unit) return formatted;
  return `${formatted}${metric.unitJoiner ?? " "}${metric.unit}`;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 0) {
  const number = cleanNumber(value);
  if (number === null) return "--";
  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function validateEncryptedPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Encrypted payload must be an object.");
  }
  if (payload.schema !== ENCRYPTED_PAYLOAD_SCHEMA) {
    throw new Error("Encrypted payload schema is not supported.");
  }
  if (payload.kdf?.name !== "PBKDF2" || payload.kdf?.hash !== "SHA-256") {
    throw new Error("Encrypted payload KDF is not supported.");
  }
  const iterations = Number(payload.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) {
    throw new Error("Encrypted payload KDF iterations are outside the allowed range.");
  }
  if (payload.cipher?.name !== "AES-GCM") {
    throw new Error("Encrypted payload cipher is not supported.");
  }
  return {
    iterations,
    hash: payload.kdf.hash,
    salt: checkedBase64Bytes(payload.kdf.salt, "salt", SALT_BYTES, SALT_BYTES),
    iv: checkedBase64Bytes(payload.cipher.iv, "iv", IV_BYTES, IV_BYTES),
    data: checkedBase64Bytes(payload.data, "data", 17, MAX_ENCRYPTED_PAYLOAD_BYTES)
  };
}

function checkedBase64Bytes(value, label, minBytes, maxBytes) {
  assertBase64String(value, label, minBytes, maxBytes);
  const bytes = fromBase64(value);
  if (bytes.length < minBytes || bytes.length > maxBytes) {
    throw new Error(`Encrypted payload ${label} byte length is invalid.`);
  }
  return bytes;
}

function assertBase64String(value, label, minBytes, maxBytes) {
  if (typeof value !== "string") {
    throw new Error(`Encrypted payload ${label} must be a string.`);
  }
  const minLength = Math.ceil(minBytes / 3) * 4;
  const maxLength = Math.ceil(maxBytes / 3) * 4;
  if (value.length < minLength || value.length > maxLength || value.length % 4 !== 0) {
    throw new Error(`Encrypted payload ${label} length is invalid.`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`Encrypted payload ${label} is not valid base64.`);
  }
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseDateKey(key) {
  if (!key) return null;
  return new Date(`${key}T00:00:00Z`);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(key) {
  const date = parseDateKey(key);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function dateShort(key) {
  const date = parseDateKey(key);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function setStatus(message) {
  ui.status.textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
