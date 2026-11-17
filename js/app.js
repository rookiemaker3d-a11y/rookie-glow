import {
  EFFECTS,
  FX,
  FX_USES_COLOR2,
  cmdPower,
  cmdBrightness,
  cmdColor,
  cmdColor2,
  cmdEffect,
  cmdSpeed,
  cmdRename,
  cmdAutoInterval,
  cmdSaveNow,
  rgbToHex,
  hexToRgb,
} from './protocol.js';
import { LunaBle, bleSupported, isIOSSafari } from './ble.js';
import { MoonPreview } from './preview.js';
import { ColorWheel } from './color-wheel.js';
import {
  loadLastDevice,
  saveLastDevice,
  loadFavorites,
  saveFavorites,
  loadPresets,
  savePresets,
  rememberKnown,
  loadKnown,
} from './storage.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const ble = new LunaBle();
const preview = new MoonPreview($('#moon-preview'));

let colorWheel = null;
let syncingWheel = false;

const ui = {
  power: true,
  brightness: 180,
  effect: 0,
  speed: 128,
  r1: 255,
  g1: 200,
  b1: 80,
  r2: 20,
  g2: 40,
  b2: 80,
  autoInterval: 8,
  name: '',
};

let colorTarget = 'primary'; // primary | secondary
let debounceTimers = {};

function toast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 4200);
}

function setConnUI() {
  const n = ble.connectedCount;
  const badge = $('#conn-badge');
  const nameEl = $('#conn-name');
  badge.dataset.state = n ? 'on' : 'off';
  if (!n) {
    badge.textContent = 'Desconectado';
    nameEl.textContent = 'Ningún dispositivo';
  } else if (ble.targetMode === 'all') {
    badge.textContent = `${n} conectada${n > 1 ? 's' : ''}`;
    nameEl.textContent = `Todas (${n})`;
  } else {
    badge.textContent = n > 1 ? `${n} conectadas` : 'Conectado';
    nameEl.textContent = ble.deviceName || 'Luna seleccionada';
  }
  $('#btn-disconnect').disabled = !ble.connected;
  $('#controls').classList.toggle('disabled', !ble.connected);
  const tl = $('#transport-label');
  if (tl) {
    if (!n) tl.textContent = '—';
    else if (ble.targetMode === 'all') tl.textContent = `Controlando ${n} por Bluetooth`;
    else tl.textContent = n > 1 ? `Seleccionada · ${n} en línea` : 'Conectado por Bluetooth';
  }
  $$('[data-target-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.targetMode === ble.targetMode);
  });
  renderKnown();
}

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('rookie_theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'light' ? '#eef2f8' : '#121212';
}

function applyLocalState(st, fromDevice = false) {
  if (st.power !== undefined) ui.power = !!st.power;
  if (st.brightness !== undefined) ui.brightness = st.brightness;
  if (st.effect !== undefined) ui.effect = st.effect;
  if (st.speed !== undefined) ui.speed = st.speed;
  if (st.r1 !== undefined) {
    ui.r1 = st.r1;
    ui.g1 = st.g1;
    ui.b1 = st.b1;
  }
  if (st.r2 !== undefined) {
    ui.r2 = st.r2;
    ui.g2 = st.g2;
    ui.b2 = st.b2;
  }
  if (st.autoInterval !== undefined) ui.autoInterval = st.autoInterval;
  if (st.name !== undefined) ui.name = st.name;

  $('#power-toggle').checked = ui.power;
  $('#bri-slider').value = ui.brightness;
  $('#bri-val').textContent = String(ui.brightness);
  $('#speed-slider').value = ui.speed;
  $('#speed-val').textContent = String(ui.speed);
  $('#color-primary').value = rgbToHex(ui.r1, ui.g1, ui.b1);
  $('#color-secondary').value = rgbToHex(ui.r2, ui.g2, ui.b2);
  $('#auto-interval').value = ui.autoInterval;
  $('#rename-input').value = ui.name || '';
  $('#luna-title').textContent = ui.name || ble.deviceName || 'ROOKIE GLOW';
  syncWheelFromUi();

  preview.setState({
    power: ui.power ? 1 : 0,
    brightness: ui.brightness,
    effect: ui.effect,
    speed: ui.speed,
    r1: ui.r1,
    g1: ui.g1,
    b1: ui.b1,
    r2: ui.r2,
    g2: ui.g2,
    b2: ui.b2,
    autoInterval: ui.autoInterval,
  });

  highlightEffect();
  updateColor2Visibility();

  if (fromDevice && ble.connected && ble.deviceId) {
    rememberKnown({
      id: ble.deviceId,
      name: ble.deviceName,
      friendly: ui.name,
    });
  }
}

function highlightEffect() {
  $$('.fx-card').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === ui.effect);
  });
}

function updateColor2Visibility() {
  const need = FX_USES_COLOR2.has(ui.effect) || ui.effect === FX.AUTO;
  const tab = $('#color2-tab');
  if (tab) tab.hidden = !need;
  if (!need && colorTarget === 'secondary') {
    colorTarget = 'primary';
    $$('[data-color-target]').forEach((x) =>
      x.classList.toggle('active', x.dataset.colorTarget === 'primary')
    );
    syncWheelFromUi();
  }
  $('#auto-wrap').hidden = ui.effect !== FX.AUTO;
}

function syncWheelFromUi() {
  if (!colorWheel) return;
  syncingWheel = true;
  if (colorTarget === 'secondary') {
    colorWheel.setRgb(ui.r2, ui.g2, ui.b2, true);
    $('#color-hex').textContent = rgbToHex(ui.r2, ui.g2, ui.b2);
  } else {
    colorWheel.setRgb(ui.r1, ui.g1, ui.b1, true);
    $('#color-hex').textContent = rgbToHex(ui.r1, ui.g1, ui.b1);
  }
  syncingWheel = false;
}

function onWheelColor(rgb, hex) {
  if (syncingWheel) return;
  $('#color-hex').textContent = hex;
  if (colorTarget === 'secondary') {
    ui.r2 = rgb.r;
    ui.g2 = rgb.g;
    ui.b2 = rgb.b;
    $('#color-secondary').value = hex;
    preview.setState({ r2: rgb.r, g2: rgb.g, b2: rgb.b });
    debounced('c2', () => send(cmdColor2(rgb.r, rgb.g, rgb.b)));
  } else {
    ui.r1 = rgb.r;
    ui.g1 = rgb.g;
    ui.b1 = rgb.b;
    $('#color-primary').value = hex;
    preview.setState({ r1: rgb.r, g1: rgb.g, b1: rgb.b });
    debounced('c1', () => send(cmdColor(rgb.r, rgb.g, rgb.b)));
  }
}

async function send(bytes) {
  try {
    if (ble.connected) {
      await ble.write(bytes);
    }
  } catch (e) {
    toast(e.message || String(e), 'error');
  }
}

function debounced(key, fn, ms = 80) {
  clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(fn, ms);
}

function renderEffects() {
  const grid = $('#fx-grid');
  grid.innerHTML = '';
  for (const fx of EFFECTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fx-card';
    btn.dataset.id = String(fx.id);
    btn.innerHTML = `<span class="fx-icon">${fx.icon}</span><span class="fx-name">${fx.name}</span>`;
    btn.addEventListener('click', async () => {
      ui.effect = fx.id;
      highlightEffect();
      updateColor2Visibility();
      preview.setState({ effect: fx.id });
      await send(cmdEffect(fx.id));
    });
    grid.appendChild(btn);
  }
  highlightEffect();
}

function renderFavorites() {
  const row = $('#fav-colors');
  row.innerHTML = '';
  for (const hex of loadFavorites()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.title = hex;
    b.addEventListener('click', async () => {
      const { r, g, b: bl } = hexToRgb(hex);
      if (colorTarget === 'secondary') {
        ui.r2 = r;
        ui.g2 = g;
        ui.b2 = bl;
        $('#color-secondary').value = hex;
        preview.setState({ r2: r, g2: g, b2: bl });
      } else {
        ui.r1 = r;
        ui.g1 = g;
        ui.b1 = bl;
        $('#color-primary').value = hex;
        preview.setState({ r1: r, g1: g, b1: bl });
      }
      if (colorWheel) colorWheel.setRgb(r, g, bl, true);
      $('#color-hex').textContent = hex;
      await send(colorTarget === 'secondary' ? cmdColor2(r, g, bl) : cmdColor(r, g, bl));
    });
    row.appendChild(b);
  }
}

function renderPresets() {
  const list = $('#preset-list');
  list.innerHTML = '';
  const presets = loadPresets();
  if (!presets.length) {
    list.innerHTML = '<p class="muted">Sin escenas guardadas aún.</p>';
    return;
  }
  for (const p of presets) {
    const row = document.createElement('div');
    row.className = 'preset-row';
    row.innerHTML = `
      <button type="button" class="preset-load">${escapeHtml(p.name)}</button>
      <button type="button" class="preset-del" aria-label="Borrar">×</button>`;
    row.querySelector('.preset-load').addEventListener('click', async () => {
      applyLocalState(p);
      await send(cmdPower(p.power));
      await send(cmdBrightness(p.brightness));
      await send(cmdColor(p.r1, p.g1, p.b1));
      await send(cmdColor2(p.r2, p.g2, p.b2));
      await send(cmdSpeed(p.speed));
      await send(cmdEffect(p.effect));
      if (p.autoInterval) await send(cmdAutoInterval(p.autoInterval));
      toast(`Escena «${p.name}» aplicada`);
    });
    row.querySelector('.preset-del').addEventListener('click', () => {
      savePresets(loadPresets().filter((x) => x.id !== p.id));
      renderPresets();
    });
    list.appendChild(row);
  }
}

function renderKnown() {
  const box = $('#known-list');
  box.innerHTML = '';
  const known = loadKnown();
  const live = ble.listConnected();
  const byId = new Map(known.map((d) => [d.id, d]));
  for (const c of live) {
    if (!byId.has(c.id)) {
      byId.set(c.id, { id: c.id, name: c.name, friendly: '' });
    }
  }
  const last = loadLastDevice();
  if (!byId.size && last) byId.set(last.id, last);

  if (!byId.size) {
    box.innerHTML = '<p class="muted">Aún no hay lunas. Pulsa «Añadir luna».</p>';
    return;
  }

  for (const d of byId.values()) {
    const isConn = ble.isConnectedId(d.id);
    const isActive = isConn && ble.deviceId === d.id && ble.targetMode === 'active';
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'luna-item' + (isActive ? ' active' : '');
    let state = 'Guardada';
    if (isConn && ble.targetMode === 'all') state = 'En grupo';
    else if (isActive) state = 'Seleccionada';
    else if (isConn) state = 'Conectada';
    el.innerHTML = `
      <span class="luna-dot" data-on="${isConn ? '1' : '0'}"></span>
      <span class="luna-meta">
        <strong>${escapeHtml(d.friendly || d.name || 'Luna')}</strong>
        <small>${escapeHtml(d.name || d.id)}</small>
      </span>
      <span class="luna-state">${state}</span>`;
    el.addEventListener('click', async () => {
      if (isConn) {
        ble.setTargetMode('active');
        ble.setActive(d.id);
        setConnUI();
        toast(`Seleccionada: ${d.friendly || d.name}`, 'ok');
        return;
      }
      toast('Reconectando esa luna…');
      const ok = await ble.reconnectById(d.id);
      if (ok) {
        saveLastDevice({ id: d.id, name: d.name });
        rememberKnown(d);
        setConnUI();
        toast(`Conectada: ${d.name}`, 'ok');
      } else {
        toast('No respondió. Usa «Añadir luna» y elígela en el selector.');
      }
    });
    box.appendChild(el);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function doScan() {
  try {
    toast('Añadiendo luna por Bluetooth…');
    const info = await ble.requestAndConnect();
    saveLastDevice(info);
    rememberKnown(info);
    setConnUI();
    toast(
      ble.connectedCount > 1
        ? `Añadida: ${info.name} (${ble.connectedCount} en línea)`
        : `Conectada: ${info.name}`,
      'ok'
    );
  } catch (e) {
    if (e.name === 'AbortError') {
      toast('Búsqueda cancelada');
      return;
    }
    toast(e.message || String(e), 'error');
  }
}

async function tryAutoReconnect() {
  const known = loadKnown();
  const last = loadLastDevice();
  const ids = known.map((d) => d.id);
  if (last?.id && !ids.includes(last.id)) ids.unshift(last.id);
  if (!ids.length) return;
  toast('Reconectando lunas guardadas…');
  const n = await ble.reconnectAllKnown(ids);
  setConnUI();
  if (n) toast(`Reconectadas: ${n}`, 'ok');
  else toast('No se pudo reconectar. Usa «Añadir luna».');
}

function setupInstall() {
  let deferred = null;
  const btn = $('#btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) {
      toast('La app ya está instalada o el navegador no ofrece instalación aquí.');
      return;
    }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
    if (outcome === 'accepted') toast('App instalada', 'ok');
  });
  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    toast('Lunas instalada en el dispositivo', 'ok');
  });
}

function wireControls() {
  $('#btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  $('#btn-scan').addEventListener('click', doScan);
  $('#btn-disconnect').addEventListener('click', async () => {
    if (ble.targetMode === 'all' || ble.connectedCount <= 1) {
      await ble.disconnect();
      setConnUI();
      toast('Todas desconectadas');
      return;
    }
    const id = ble.deviceId;
    await ble.disconnect(id);
    setConnUI();
    toast('Luna seleccionada desconectada');
  });
  $('#btn-reconnect').addEventListener('click', tryAutoReconnect);

  $$('[data-target-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ble.setTargetMode(btn.dataset.targetMode);
      setConnUI();
      toast(
        ble.targetMode === 'all'
          ? `Controlando las ${ble.connectedCount || 0} conectadas`
          : 'Solo la luna seleccionada'
      );
    });
  });

  $('#power-toggle').addEventListener('change', async (e) => {
    ui.power = e.target.checked;
    preview.setState({ power: ui.power ? 1 : 0 });
    await send(cmdPower(ui.power));
  });

  $('#bri-slider').addEventListener('input', (e) => {
    ui.brightness = Number(e.target.value);
    $('#bri-val').textContent = String(ui.brightness);
    preview.setState({ brightness: ui.brightness });
    debounced('bri', () => send(cmdBrightness(ui.brightness)));
  });

  $('#speed-slider').addEventListener('input', (e) => {
    ui.speed = Number(e.target.value);
    $('#speed-val').textContent = String(ui.speed);
    preview.setState({ speed: ui.speed });
    debounced('spd', () => send(cmdSpeed(ui.speed)));
  });

  $('#btn-fav-add').addEventListener('click', () => {
    const hex = colorWheel ? colorWheel.getHex() : '#ffc850';
    const list = loadFavorites();
    if (!list.includes(hex)) {
      list.unshift(hex);
      saveFavorites(list);
      renderFavorites();
      toast('Color añadido a favoritos');
    }
  });

  $$('[data-color-target]').forEach((el) => {
    el.addEventListener('click', () => {
      colorTarget = el.dataset.colorTarget;
      $$('[data-color-target]').forEach((x) =>
        x.classList.toggle('active', x === el)
      );
      syncWheelFromUi();
    });
  });

  $('#auto-interval').addEventListener('change', async (e) => {
    ui.autoInterval = Math.max(1, Math.min(120, Number(e.target.value) || 8));
    preview.setState({ autoInterval: ui.autoInterval });
    await send(cmdAutoInterval(ui.autoInterval));
  });

  $('#btn-auto').addEventListener('click', async () => {
    ui.effect = FX.AUTO;
    highlightEffect();
    updateColor2Visibility();
    preview.setState({ effect: FX.AUTO });
    await send(cmdEffect(FX.AUTO));
    toast('Secuencia automática activada');
  });

  $('#btn-rename').addEventListener('click', async () => {
    const name = $('#rename-input').value.trim().slice(0, 20);
    if (!name) {
      toast('Escribe un nombre (máx. 20)', 'error');
      return;
    }
    ui.name = name;
    $('#luna-title').textContent = name;
    await send(cmdRename(name));
    await send(cmdSaveNow());
    if (ble.connected && ble.deviceId) {
      rememberKnown({ id: ble.deviceId, name: ble.deviceName, friendly: name });
      renderKnown();
    }
    toast(
      ble.targetMode === 'all'
        ? `Nombre «${name}» enviado a todas`
        : `Renombrada a «${name}»`,
      'ok'
    );
  });

  $('#btn-save-preset').addEventListener('click', () => {
    const name = ($('#preset-name').value || '').trim() || `Escena ${loadPresets().length + 1}`;
    const presets = loadPresets();
    presets.unshift({
      id: Date.now(),
      name,
      power: ui.power ? 1 : 0,
      brightness: ui.brightness,
      effect: ui.effect,
      speed: ui.speed,
      r1: ui.r1,
      g1: ui.g1,
      b1: ui.b1,
      r2: ui.r2,
      g2: ui.g2,
      b2: ui.b2,
      autoInterval: ui.autoInterval,
    });
    savePresets(presets);
    $('#preset-name').value = '';
    renderPresets();
    toast(`Escena «${name}» guardada`, 'ok');
  });
}

function showCompatBanner() {
  const banner = $('#compat-banner');
  if (isIOSSafari()) {
    banner.hidden = false;
    banner.innerHTML =
      '<strong>iPhone / Safari:</strong> Web Bluetooth no está disponible. ' +
      'Usa el navegador <em>Bluefy</em> en iOS, o empaqueta esta PWA con ' +
      '<em>Capacitor</em> para una app nativa iOS/Android. Ver README.';
    return;
  }
  if (!bleSupported()) {
    banner.hidden = false;
    banner.innerHTML =
      '<strong>Navegador no compatible</strong> con Web Bluetooth. ' +
      'Abre esta app en <em>Chrome</em> o <em>Edge</em> (PC o Android), por HTTPS o localhost.';
  }
}

ble.onStatus = (st, deviceId) => {
  if (ble.targetMode === 'all' || !deviceId || deviceId === ble.deviceId) {
    applyLocalState(st, true);
  } else if (st.name) {
    rememberKnown({
      id: deviceId,
      name: ble.sessions.get(deviceId)?.name || '',
      friendly: st.name,
    });
    renderKnown();
  }
};
ble.onDisconnected = (id) => {
  setConnUI();
  toast(id ? 'Una luna se desconectó' : 'Bluetooth desconectado', 'error');
};
ble.onRosterChange = () => setConnUI();

let installShareUrl = '';

function qrImageUrl(url, size = 400) {
  return (
    'https://api.qrserver.com/v1/create-qr-code/?size=' +
    size +
    'x' +
    size +
    '&margin=8&data=' +
    encodeURIComponent(url)
  );
}

function resolveInstallUrl(cfg) {
  const { hostname, protocol, origin, pathname } = window.location;
  const isLocal =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (!isLocal && protocol === 'https:') {
    const dir = pathname.replace(/[^/]+$/, '');
    return origin + (dir || '/');
  }
  const fromCfg = (cfg && cfg.url) || '';
  if (fromCfg && !/github\.io\/rookie-glow/i.test(fromCfg)) return fromCfg;
  return window.location.href.split('#')[0];
}

function applyInstallQr(url) {
  installShareUrl = url;
  const img = $('#qr-install');
  const urlEl = $('#install-url');
  if (urlEl) urlEl.textContent = url;
  if (img) {
    // Siempre QR de la URL actual (nunca el PNG viejo de github.io)
    img.src = qrImageUrl(url, 240);
    img.alt = 'QR ' + url;
  }
}

async function shareInstallLink() {
  if (!installShareUrl) return;
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'ROOKIE GLOW',
        text: 'Instala ROOKIE GLOW y controla tu luna por Bluetooth',
        url: installShareUrl,
      });
      toast('Enlace compartido', 'ok');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(installShareUrl);
    toast('Enlace copiado', 'ok');
  } catch {
    toast(installShareUrl);
  }
}

async function copyInstallLink() {
  if (!installShareUrl) return;
  try {
    await navigator.clipboard.writeText(installShareUrl);
    toast('Enlace copiado', 'ok');
  } catch {
    toast('No se pudo copiar', 'error');
  }
}

function downloadInstallQr() {
  if (!installShareUrl) return;
  const a = document.createElement('a');
  a.href = qrImageUrl(installShareUrl, 600);
  a.download = 'rookie-glow-qr.png';
  a.target = '_blank';
  a.rel = 'noopener';
  a.click();
  toast('Descargando QR…');
}

function setupQr() {
  fetch('./install-url.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((cfg) => applyInstallQr(resolveInstallUrl(cfg)))
    .catch(() => applyInstallQr(resolveInstallUrl(null)));

  $('#btn-share-link')?.addEventListener('click', shareInstallLink);
  $('#btn-copy-link')?.addEventListener('click', copyInstallLink);
  $('#btn-download-qr')?.addEventListener('click', downloadInstallQr);
}

function init() {
  applyTheme(localStorage.getItem('rookie_theme') || 'dark');
  showCompatBanner();
  colorWheel = new ColorWheel({
    wheel: $('#color-wheel'),
    valueBar: $('#color-value'),
    tip: $('#color-tip'),
    onChange: onWheelColor,
  });
  renderEffects();
  renderFavorites();
  renderPresets();
  renderKnown();
  wireControls();
  setupInstall();
  setupQr();
  applyLocalState(ui);
  setConnUI();
  preview.start();

  setTimeout(() => {
    if (bleSupported() && loadLastDevice()?.id) {
      tryAutoReconnect();
    }
  }, 600);
}

init();