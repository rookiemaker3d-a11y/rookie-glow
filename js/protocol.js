/**
 * Protocolo Lunas — debe coincidir byte a byte con firmware y PROTOCOLO.md
 */
export const LUNA_SERVICE_UUID = '4c554e41-0001-4c55-4e41-00004c554e41';
export const LUNA_CHAR_CMD_UUID = '4c554e41-0002-4c55-4e41-00004c554e41';
export const LUNA_CHAR_STATUS_UUID = '4c554e41-0003-4c55-4e41-00004c554e41';

export const OP = {
  POWER: 0x01,
  BRIGHTNESS: 0x02,
  COLOR: 0x03,
  EFFECT: 0x04,
  SPEED: 0x05,
  COLOR2: 0x06,
  SET_ALL: 0x07,
  RENAME: 0x08,
  REQUEST_STATUS: 0x09,
  AUTO_INTERVAL: 0x0a,
  SAVE_NOW: 0x0b,
};

export const FX = {
  SOLID: 0,
  BREATHING: 1,
  BLINK: 2,
  STROBE: 3,
  RAINBOW: 4,
  RAINBOW_ROT: 5,
  CHASE: 6,
  COMET: 7,
  FIRE: 8,
  TWINKLE: 9,
  PULSE_ALT: 10,
  AUTO: 11,
};

/** Efectos que usan color secundario */
export const FX_USES_COLOR2 = new Set([
  FX.CHASE,
  FX.COMET,
  FX.TWINKLE,
  FX.PULSE_ALT,
]);

export const EFFECTS = [
  { id: FX.SOLID, name: 'Sólido', icon: '●', usesColor2: false },
  { id: FX.BREATHING, name: 'Respiración', icon: '◐', usesColor2: false },
  { id: FX.BLINK, name: 'Parpadeo', icon: '✧', usesColor2: false },
  { id: FX.STROBE, name: 'Strobe suave', icon: '⚡', usesColor2: false },
  { id: FX.RAINBOW, name: 'Arcoíris', icon: '🌈', usesColor2: false },
  { id: FX.RAINBOW_ROT, name: 'Arcoíris rotando', icon: '🌀', usesColor2: false },
  { id: FX.CHASE, name: 'Persecución', icon: '➤', usesColor2: true },
  { id: FX.COMET, name: 'Cometa', icon: '☄', usesColor2: true },
  { id: FX.FIRE, name: 'Fuego / vela', icon: '🔥', usesColor2: false },
  { id: FX.TWINKLE, name: 'Twinkle', icon: '✨', usesColor2: true },
  { id: FX.PULSE_ALT, name: 'Pulso alterno', icon: '↔', usesColor2: true },
  { id: FX.AUTO, name: 'Secuencia automática', icon: '▶', usesColor2: false },
];

export function cmdPower(on) {
  return new Uint8Array([OP.POWER, on ? 1 : 0]);
}
export function cmdBrightness(v) {
  return new Uint8Array([OP.BRIGHTNESS, v & 0xff]);
}
export function cmdColor(r, g, b) {
  return new Uint8Array([OP.COLOR, r & 0xff, g & 0xff, b & 0xff]);
}
export function cmdEffect(id) {
  return new Uint8Array([OP.EFFECT, id & 0xff]);
}
export function cmdSpeed(v) {
  return new Uint8Array([OP.SPEED, v & 0xff]);
}
export function cmdColor2(r, g, b) {
  return new Uint8Array([OP.COLOR2, r & 0xff, g & 0xff, b & 0xff]);
}
export function cmdRequestStatus() {
  return new Uint8Array([OP.REQUEST_STATUS]);
}
export function cmdAutoInterval(sec) {
  return new Uint8Array([OP.AUTO_INTERVAL, Math.max(1, Math.min(120, sec)) & 0xff]);
}
export function cmdSaveNow() {
  return new Uint8Array([OP.SAVE_NOW]);
}
export function cmdRename(name) {
  const enc = new TextEncoder().encode(String(name).slice(0, 20));
  const out = new Uint8Array(1 + enc.length);
  out[0] = OP.RENAME;
  out.set(enc, 1);
  return out;
}
export function cmdSetAll(s) {
  return new Uint8Array([
    OP.SET_ALL,
    s.power ? 1 : 0,
    s.brightness & 0xff,
    s.effect & 0xff,
    s.speed & 0xff,
    s.r1 & 0xff,
    s.g1 & 0xff,
    s.b1 & 0xff,
    s.r2 & 0xff,
    s.g2 & 0xff,
    s.b2 & 0xff,
    Math.max(1, Math.min(120, s.autoInterval ?? 8)) & 0xff,
  ]);
}

/** Parsea el paquete de estado fijo de 32 bytes */
export function parseStatus(data) {
  const u = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u.length < 12) return null;
  const nameBytes = u.slice(12, 32);
  let end = nameBytes.indexOf(0);
  if (end < 0) end = nameBytes.length;
  const name = new TextDecoder().decode(nameBytes.slice(0, end));
  return {
    power: u[0] ? 1 : 0,
    brightness: u[1],
    effect: u[2],
    speed: u[3],
    r1: u[4],
    g1: u[5],
    b1: u[6],
    r2: u[7],
    g2: u[8],
    b2: u[9],
    autoInterval: u[10] || 8,
    name,
  };
}

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}
