const KEYS = {
  lastDevice: 'luna_last_device',
  favorites: 'luna_fav_colors',
  presets: 'luna_presets',
  known: 'luna_known',
};

export function loadLastDevice() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.lastDevice) || 'null');
  } catch {
    return null;
  }
}

export function saveLastDevice(info) {
  localStorage.setItem(KEYS.lastDevice, JSON.stringify(info));
}

export function clearLastDevice() {
  localStorage.removeItem(KEYS.lastDevice);
}

export function loadFavorites() {
  try {
    const f = JSON.parse(localStorage.getItem(KEYS.favorites) || 'null');
    if (Array.isArray(f) && f.length) return f;
  } catch {
    /* ignore */
  }
  return ['#ffc850', '#7ec8ff', '#ff6b8a', '#a8ff7a', '#c9a0ff', '#ffffff'];
}

export function saveFavorites(list) {
  localStorage.setItem(KEYS.favorites, JSON.stringify(list.slice(0, 12)));
}

export function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.presets) || '[]');
  } catch {
    return [];
  }
}

export function savePresets(list) {
  localStorage.setItem(KEYS.presets, JSON.stringify(list.slice(0, 24)));
}

export function rememberKnown(device) {
  const list = loadKnown();
  const i = list.findIndex((d) => d.id === device.id);
  const entry = {
    id: device.id,
    name: device.name,
    friendly: device.friendly || '',
    lastSeen: Date.now(),
  };
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.unshift(entry);
  localStorage.setItem(KEYS.known, JSON.stringify(list.slice(0, 20)));
}

export function loadKnown() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.known) || '[]');
  } catch {
    return [];
  }
}
