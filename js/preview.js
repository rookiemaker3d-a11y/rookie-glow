/**
 * Vista previa de 8 LEDs en círculo (simulación de efectos)
 */
import { FX } from './protocol.js';

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = (v / 255) * (s / 255);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v / 255 - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function scale(rgb, bri) {
  const f = bri / 255;
  return rgb.map((c) => Math.round(c * f));
}

export class MoonPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.n = 8;
    this.state = {
      power: 1,
      brightness: 180,
      effect: 0,
      speed: 128,
      r1: 255,
      g1: 200,
      b1: 80,
      r2: 20,
      g2: 40,
      b2: 80,
    };
    this.phase = 0;
    this.autoSub = 0;
    this.autoLast = performance.now();
    this.trail = Array(this.n).fill(null).map(() => [0, 0, 0]);
    this._raf = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  setState(partial) {
    Object.assign(this.state, partial);
  }

  start() {
    if (this._raf) return;
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      this._draw(t);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 220;
    const h = this.canvas.clientHeight || 220;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  _colors(t) {
    const s = this.state;
    const n = this.n;
    const step = 1 + (s.speed >> 4);
    this.phase = (this.phase + step) & 0xffff;
    let fx = s.effect;
    if (fx === FX.AUTO) {
      if (t - this.autoLast > (s.autoInterval || 8) * 1000) {
        this.autoLast = t;
        this.autoSub = (this.autoSub + 1) % 11;
        this.phase = 0;
      }
      fx = this.autoSub;
    }

    const out = Array(n)
      .fill(null)
      .map(() => [0, 0, 0]);
    if (!s.power) return out;

    const c1 = [s.r1, s.g1, s.b1];
    const c2 = [s.r2, s.g2, s.b2];
    const bri = s.brightness;

    switch (fx) {
      case FX.SOLID:
        for (let i = 0; i < n; i++) out[i] = scale(c1, bri);
        break;
      case FX.BREATHING: {
        const wave = Math.sin(this.phase / 40) * 0.5 + 0.5;
        for (let i = 0; i < n; i++) out[i] = scale(c1, bri * wave);
        break;
      }
      case FX.BLINK: {
        const period = 1200 - (s.speed / 255) * 1080;
        const on = Math.floor(t / period) % 2 === 0;
        for (let i = 0; i < n; i++) out[i] = on ? scale(c1, bri) : [0, 0, 0];
        break;
      }
      case FX.STROBE: {
        const period = 800 - (s.speed / 255) * 720;
        const pos = t % period;
        const f = pos < period / 6 ? 0.85 : 0.12;
        for (let i = 0; i < n; i++) out[i] = scale(c1, bri * f);
        break;
      }
      case FX.RAINBOW:
        for (let i = 0; i < n; i++) {
          out[i] = scale(hsvToRgb((i * 360) / n, 255, 255), bri);
        }
        break;
      case FX.RAINBOW_ROT: {
        const base = (this.phase * 2) % 360;
        for (let i = 0; i < n; i++) {
          out[i] = scale(hsvToRgb(base + (i * 360) / n, 255, 255), bri);
        }
        break;
      }
      case FX.CHASE: {
        for (let i = 0; i < n; i++) out[i] = scale(c2, bri * 0.5);
        out[Math.floor(this.phase / 8) % n] = scale(c1, bri);
        break;
      }
      case FX.COMET: {
        for (let i = 0; i < n; i++) {
          this.trail[i] = this.trail[i].map((v) => Math.floor(v * 0.75));
          out[i] = scale(
            [
              Math.max(this.trail[i][0], c2[0] / 6),
              Math.max(this.trail[i][1], c2[1] / 6),
              Math.max(this.trail[i][2], c2[2] / 6),
            ],
            bri
          );
        }
        const idx = Math.floor(this.phase / 6) % n;
        this.trail[idx] = [...c1];
        out[idx] = scale(c1, bri);
        break;
      }
      case FX.FIRE:
        for (let i = 0; i < n; i++) {
          const heat = 120 + Math.random() * 135;
          out[i] = scale([heat, heat * 0.4, Math.random() * 20], bri);
        }
        break;
      case FX.TWINKLE:
        for (let i = 0; i < n; i++) out[i] = scale(c2, bri * 0.6);
        if (Math.random() > 0.7) {
          out[Math.floor(Math.random() * n)] = scale(c1, bri);
        }
        break;
      case FX.PULSE_ALT: {
        const wave = Math.sin(this.phase / 40) * 0.5 + 0.5;
        for (let i = 0; i < n; i++) {
          const w = i % 2 ? 1 - wave : wave;
          out[i] = scale(
            [
              c2[0] + (c1[0] - c2[0]) * w,
              c2[1] + (c1[1] - c2[1]) * w,
              c2[2] + (c1[2] - c2[2]) * w,
            ],
            bri
          );
        }
        break;
      }
      default:
        for (let i = 0; i < n; i++) out[i] = scale(c1, bri);
    }
    return out;
  }

  _draw(t) {
    const { ctx, w, h, n } = this;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.32;
    const ledR = Math.min(w, h) * 0.07;

    // disco lunar
    const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R * 1.4);
    g.addColorStop(0, '#e8e0c8');
    g.addColorStop(0.55, '#9a8f6e');
    g.addColorStop(1, '#1a1e2e');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // cráter suave
    ctx.beginPath();
    ctx.arc(cx + R * 0.25, cy - R * 0.15, R * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    const colors = this._colors(t);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + Math.cos(ang) * R;
      const y = cy + Math.sin(ang) * R;
      const [r, gch, b] = colors[i];
      const glow = ctx.createRadialGradient(x, y, 0, x, y, ledR * 2.2);
      glow.addColorStop(0, `rgba(${r},${gch},${b},0.95)`);
      glow.addColorStop(0.4, `rgba(${r},${gch},${b},0.45)`);
      glow.addColorStop(1, `rgba(${r},${gch},${b},0)`);
      ctx.beginPath();
      ctx.arc(x, y, ledR * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, ledR, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r},${gch},${b})`;
      ctx.fill();
    }
  }
}
