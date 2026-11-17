/**
 * Rueda de color (H/S) + slider de valor — estilo selector circular
 */
const COLOR_NAMES = [
  { name: 'Rojo', h: 0 },
  { name: 'Naranja', h: 25 },
  { name: 'Ámbar', h: 40 },
  { name: 'Amarillo', h: 55 },
  { name: 'Lima', h: 90 },
  { name: 'Verde', h: 120 },
  { name: 'Turquesa', h: 165 },
  { name: 'Cian', h: 180 },
  { name: 'Azul', h: 220 },
  { name: 'Índigo', h: 250 },
  { name: 'Lavanda', h: 270 },
  { name: 'Violeta', h: 285 },
  { name: 'Magenta', h: 310 },
  { name: 'Rosa', h: 340 },
];

export function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function nearestName(h, s) {
  if (s < 0.12) return 'Blanco';
  let best = COLOR_NAMES[0];
  let bestD = 999;
  for (const c of COLOR_NAMES) {
    let d = Math.abs(c.h - h);
    if (d > 180) d = 360 - d;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}

export class ColorWheel {
  /**
   * @param {{ wheel: HTMLCanvasElement, valueBar: HTMLCanvasElement, tip: HTMLElement, onChange: Function }} opts
   */
  constructor({ wheel, valueBar, tip, onChange }) {
    this.wheel = wheel;
    this.valueBar = valueBar;
    this.tip = tip;
    this.onChange = onChange;
    this.h = 40;
    this.s = 0.85;
    this.v = 1;
    this._dragging = null;
    this._raf = 0;
    this._bind();
    this._resize();
    this.redraw();
  }

  setRgb(r, g, b, silent = false) {
    const hsv = rgbToHsv(r, g, b);
    this.h = hsv.h;
    this.s = hsv.s;
    this.v = hsv.v || 0.01;
    this.redraw();
    if (!silent) this._emit();
  }

  getRgb() {
    return hsvToRgb(this.h, this.s, this.v);
  }

  getHex() {
    const { r, g, b } = this.getRgb();
    return (
      '#' +
      [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
    );
  }

  _bind() {
    const onWheel = (e) => {
      e.preventDefault();
      this._fromWheelEvent(e);
      this._dragging = 'wheel';
    };
    const onBar = (e) => {
      e.preventDefault();
      this._fromBarEvent(e);
      this._dragging = 'bar';
    };
    const move = (e) => {
      if (this._dragging === 'wheel') this._fromWheelEvent(e);
      if (this._dragging === 'bar') this._fromBarEvent(e);
    };
    const up = () => {
      this._dragging = null;
    };

    this.wheel.addEventListener('pointerdown', onWheel);
    this.valueBar.addEventListener('pointerdown', onBar);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('resize', () => {
      this._resize();
      this.redraw();
    });
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.wheel, this.valueBar]) {
      const w = c.clientWidth || (c === this.wheel ? 260 : 260);
      const h = c === this.wheel ? w : c.clientHeight || 28;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  _cssPos(el, e) {
    const r = el.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top, w: r.width, h: r.height };
  }

  _fromWheelEvent(e) {
    const { x, y, w, h } = this._cssPos(this.wheel, e);
    const cx = w / 2;
    const cy = h / 2;
    const dx = x - cx;
    const dy = y - cy;
    const R = Math.min(w, h) / 2 - 2;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > R) dist = R;
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    this.h = ang;
    this.s = Math.min(1, dist / R);
    this.redraw();
    this._emit();
  }

  _fromBarEvent(e) {
    const { x, w } = this._cssPos(this.valueBar, e);
    this.v = Math.max(0, Math.min(1, x / w));
    this.redraw();
    this._emit();
  }

  _emit() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      const rgb = this.getRgb();
      this.onChange?.(rgb, this.getHex(), {
        h: this.h,
        s: this.s,
        v: this.v,
        name: nearestName(this.h, this.s),
      });
    });
  }

  redraw() {
    this._drawWheel();
    this._drawBar();
    this._drawTip();
  }

  _drawWheel() {
    const c = this.wheel;
    const ctx = c.getContext('2d');
    const w = c.clientWidth || 260;
    const h = c.clientHeight || 260;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 2;

    ctx.clearRect(0, 0, w, h);

    // Disco H/S
    for (let a = 0; a < 360; a += 1) {
      const rad0 = ((a - 0.6) * Math.PI) / 180;
      const rad1 = ((a + 0.6) * Math.PI) / 180;
      const { r, g, b } = hsvToRgb(a, 1, 1);
      const gdt = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      gdt.addColorStop(0, '#ffffff');
      gdt.addColorStop(1, `rgb(${r},${g},${b})`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, rad0, rad1);
      ctx.closePath();
      ctx.fillStyle = gdt;
      ctx.fill();
    }

    // Anillo exterior sutil
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Selector
    const ang = (this.h * Math.PI) / 180;
    const rr = this.s * R;
    const sx = cx + Math.cos(ang) * rr;
    const sy = cy + Math.sin(ang) * rr;
    const { r, g, b } = hsvToRgb(this.h, this.s, this.v);

    ctx.beginPath();
    ctx.arc(sx, sy, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawBar() {
    const c = this.valueBar;
    const ctx = c.getContext('2d');
    const w = c.clientWidth || 260;
    const h = c.clientHeight || 28;
    ctx.clearRect(0, 0, w, h);

    const { r, g, b } = hsvToRgb(this.h, this.s, 1);
    const gdt = ctx.createLinearGradient(0, 0, w, 0);
    gdt.addColorStop(0, '#000000');
    gdt.addColorStop(1, `rgb(${r},${g},${b})`);

    const rad = h / 2;
    ctx.beginPath();
    // rounded rect
    ctx.moveTo(rad, 0);
    ctx.arcTo(w, 0, w, h, rad);
    ctx.arcTo(w, h, 0, h, rad);
    ctx.arcTo(0, h, 0, 0, rad);
    ctx.arcTo(0, 0, w, 0, rad);
    ctx.closePath();
    ctx.fillStyle = gdt;
    ctx.fill();

    const x = this.v * w;
    ctx.beginPath();
    ctx.arc(Math.max(rad, Math.min(w - rad, x)), h / 2, rad - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(Math.max(rad, Math.min(w - rad, x)), h / 2, rad - 6, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
  }

  _drawTip() {
    if (!this.tip) return;
    const name = nearestName(this.h, this.s);
    const { r, g, b } = this.getRgb();
    this.tip.textContent = name;
    this.tip.style.background = `rgb(${r},${g},${b})`;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    this.tip.style.color = lum > 150 ? '#1a1a1a' : '#fff';

    // Posicionar cerca del selector
    const w = this.wheel.clientWidth || 260;
    const h = this.wheel.clientHeight || 260;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 2;
    const ang = (this.h * Math.PI) / 180;
    const rr = this.s * R;
    const sx = cx + Math.cos(ang) * rr;
    const sy = cy + Math.sin(ang) * rr;
    this.tip.style.left = `${sx}px`;
    this.tip.style.top = `${Math.max(18, sy - 28)}px`;
  }
}
