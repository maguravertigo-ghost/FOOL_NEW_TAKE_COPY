/* Lightweight on-device profiler for DEV builds. No data leaves the device. */
export class PerformanceProfiler {
  constructor() {
    this.active = false;
    this.frames = [];
    this.events = [];
    this.longTasks = [];
    this.metrics = {};
    this._raf = 0;
    this._lastFrame = 0;
    this._observer = null;
    this._onPointer = (e) => {
      if (!this.active) return;
      const target = e.target;
      this.events.push({
        t: Math.round(performance.now() - this.startedAt),
        type: 'pointer',
        target: target?.closest?.('.card') ? 'card' : (target?.id || target?.className?.baseVal || target?.tagName || 'unknown'),
      });
    };
  }

  start() {
    if (this.active) return;
    this.frames = [];
    this.events = [];
    this.longTasks = [];
    this.metrics = {};
    this.startedAt = performance.now();
    this.active = true;
    this._lastFrame = 0;
    document.addEventListener('pointerdown', this._onPointer, true);
    try {
      if ('PerformanceObserver' in window) {
        this._observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            this.longTasks.push({ t: Math.round(e.startTime - this.startedAt), duration: +e.duration.toFixed(2) });
          }
        });
        this._observer.observe({ type: 'longtask', buffered: false });
      }
    } catch { this._observer = null; }
    this._sampleFrame();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this._raf);
    document.removeEventListener('pointerdown', this._onPointer, true);
    this._observer?.disconnect();
    this._observer = null;
  }

  record(name, duration, detail = {}) {
    if (!this.active) return;
    const bucket = this.metrics[name] || (this.metrics[name] = { count: 0, totalMs: 0, maxMs: 0, samples: [] });
    const ms = Number(duration) || 0;
    bucket.count++;
    bucket.totalMs += ms;
    bucket.maxMs = Math.max(bucket.maxMs, ms);
    if (bucket.samples.length < 2000) bucket.samples.push({ t: Math.round(performance.now() - this.startedAt), ms: +ms.toFixed(3), ...detail });
  }

  mark(name, detail = {}) {
    if (!this.active) return;
    this.events.push({ t: Math.round(performance.now() - this.startedAt), type: 'mark', name, ...detail });
  }

  _sampleFrame = (t) => {
    if (!this.active) return;
    if (this._lastFrame) {
      const delta = t - this._lastFrame;
      if (this.frames.length < 60000) this.frames.push({ t: Math.round(t - this.startedAt), ms: +delta.toFixed(2) });
    }
    this._lastFrame = t;
    this._raf = requestAnimationFrame(this._sampleFrame);
  };

  report() {
    const frameDeltas = this.frames.map((frame) => frame.ms);
    const sorted = [...frameDeltas].sort((a, b) => a - b);
    const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
    const totals = Object.fromEntries(Object.entries(this.metrics).map(([name, m]) => [name, {
      count: m.count, totalMs: +m.totalMs.toFixed(2), maxMs: +m.maxMs.toFixed(2), samples: m.samples,
    }]));
    let settings = null;
    try {
      const raw = JSON.parse(localStorage.getItem('fool_game_settings') || '{}');
      settings = { cardStyle: raw.cardStyle, suitStyle: raw.suitStyle, handLayout: raw.handLayout, deckSize: raw.deckSize, aiLevel: raw.aiLevel };
    } catch { /* settings unavailable */ }
    return {
      schema: 'fool-performance-v2',
      capturedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - this.startedAt),
      settings,
      diagnostics: { prepaintNextFace: !!window.__devPrepaintFaces },
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        screen: { width: screen.width, height: screen.height },
        memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null,
      },
      frameSummary: {
        count: sorted.length,
        avgMs: sorted.length ? +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2) : null,
        p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
        over20ms: sorted.filter(x => x > 20).length,
        over33ms: sorted.filter(x => x > 33).length,
        samples: this.frames,
      },
      longTasks: this.longTasks,
      metrics: totals,
      events: this.events,
    };
  }

  download() {
    const blob = new Blob([JSON.stringify(this.report(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fool-performance-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const performanceProfiler = new PerformanceProfiler();
