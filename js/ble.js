/**
 * Web Bluetooth — varias lunas a la vez (seleccionada o todas)
 */
import {
  LUNA_SERVICE_UUID,
  LUNA_CHAR_CMD_UUID,
  LUNA_CHAR_STATUS_UUID,
  cmdRequestStatus,
  parseStatus,
} from './protocol.js';

export function bleSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export function isIOSSafari() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|Chrome/.test(ua);
  return iOS && webkit && !chrome;
}

export class LunaBle {
  constructor() {
    /** @type {Map<string, object>} */
    this.sessions = new Map();
    this.activeId = null;
    /** @type {'active'|'all'} */
    this.targetMode = 'active';
    this.onStatus = null;
    this.onDisconnected = null;
    this.onRosterChange = null;
  }

  get connected() {
    return this.sessions.size > 0;
  }

  get connectedCount() {
    return this.sessions.size;
  }

  get deviceName() {
    return this.sessions.get(this.activeId)?.name || '';
  }

  get deviceId() {
    return this.activeId || '';
  }

  listConnected() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      name: s.name,
      active: s.id === this.activeId,
    }));
  }

  isConnectedId(id) {
    return this.sessions.has(id);
  }

  setTargetMode(mode) {
    this.targetMode = mode === 'all' ? 'all' : 'active';
  }

  setActive(id) {
    if (!id || !this.sessions.has(id)) return false;
    this.activeId = id;
    this._roster();
    return true;
  }

  async requestAndConnect() {
    if (!bleSupported()) {
      throw new Error('Tu navegador no soporta Web Bluetooth. Usa Chrome o Edge en PC/Android.');
    }

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [LUNA_SERVICE_UUID] }],
        optionalServices: [LUNA_SERVICE_UUID],
      });
    } catch (e) {
      if (e.name === 'NotFoundError') {
        throw new Error('No se eligió ninguna luna. Acerca el ESP32 y vuelve a buscar.');
      }
      if (e.name === 'SecurityError') {
        throw new Error('Bluetooth bloqueado. Abre la app en HTTPS o localhost.');
      }
      throw e;
    }

    return this.connectDevice(device);
  }

  async reconnectById(savedId) {
    if (!bleSupported() || !savedId || !navigator.bluetooth.getDevices) {
      return false;
    }
    try {
      const devices = await navigator.bluetooth.getDevices();
      const found = devices.find((d) => d.id === savedId);
      if (!found) return false;
      await this.connectDevice(found);
      return true;
    } catch {
      return false;
    }
  }

  async reconnectAllKnown(ids = []) {
    if (!bleSupported() || !navigator.bluetooth.getDevices) return 0;
    let n = 0;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const want = new Set(ids.filter(Boolean));
      for (const d of devices) {
        if (want.size && !want.has(d.id)) continue;
        if (this.sessions.has(d.id) && d.gatt?.connected) {
          n += 1;
          continue;
        }
        try {
          await this.connectDevice(d);
          n += 1;
        } catch {
          /* skip */
        }
      }
    } catch {
      /* ignore */
    }
    return n;
  }

  async connectDevice(device) {
    if (this.sessions.has(device.id) && device.gatt?.connected) {
      this.activeId = device.id;
      this._roster();
      return { id: device.id, name: device.name || 'LUNA' };
    }

    const onDisc = () => this._onSessionDrop(device.id);
    device.removeEventListener('gattserverdisconnected', onDisc);
    device.addEventListener('gattserverdisconnected', onDisc);

    let server;
    try {
      server = await device.gatt.connect();
    } catch (e) {
      const msg = String(e.message || e);
      if (/Bluetooth adapter not available|bluetooth.*off|NetworkError/i.test(msg)) {
        throw new Error('Bluetooth apagado o no disponible. Actívalo e inténtalo de nuevo.');
      }
      throw new Error('No se pudo conectar a la luna. ¿Está encendida y cerca?');
    }

    const service = await server.getPrimaryService(LUNA_SERVICE_UUID);
    const cmdChar = await service.getCharacteristic(LUNA_CHAR_CMD_UUID);
    const statusChar = await service.getCharacteristic(LUNA_CHAR_STATUS_UUID);

    const onStatus = (event) => this._emitStatus(device.id, event.target.value);

    try {
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', onStatus);
    } catch {
      /* algunos stacks solo lectura */
    }

    const session = {
      id: device.id,
      name: device.name || 'LUNA',
      device,
      server,
      cmdChar,
      statusChar,
      onStatus,
      onDisc,
    };
    this.sessions.set(device.id, session);
    this.activeId = device.id;

    await this._writeSession(session, cmdRequestStatus());
    try {
      const raw = await statusChar.readValue();
      this._emitStatus(device.id, raw);
    } catch {
      /* ignore */
    }

    this._roster();
    return { id: device.id, name: session.name };
  }

  async write(bytes) {
    const ids =
      this.targetMode === 'all'
        ? [...this.sessions.keys()]
        : this.activeId && this.sessions.has(this.activeId)
          ? [this.activeId]
          : [];

    if (!ids.length) {
      throw new Error('No hay luna conectada.');
    }

    const errors = [];
    for (const id of ids) {
      const s = this.sessions.get(id);
      if (!s) continue;
      try {
        await this._writeSession(s, bytes);
      } catch (e) {
        errors.push(s.name || id);
      }
    }
    if (errors.length === ids.length) {
      throw new Error('Error al enviar comando. ¿Se desconectaron las lunas?');
    }
  }

  async _writeSession(session, bytes) {
    if (!session?.cmdChar || !session.device?.gatt?.connected) {
      throw new Error('Sesión BLE caída');
    }
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (session.cmdChar.properties.writeWithoutResponse) {
      await session.cmdChar.writeValueWithoutResponse(u8);
    } else {
      await session.cmdChar.writeValue(u8);
    }
  }

  async disconnect(id = null, notify = true) {
    const ids = id ? [id] : [...this.sessions.keys()];
    for (const sid of ids) {
      await this._teardown(sid);
    }
    if (!this.sessions.size) this.activeId = null;
    else if (!this.sessions.has(this.activeId)) {
      this.activeId = this.sessions.keys().next().value;
    }
    this._roster();
    if (notify && this.onDisconnected) this.onDisconnected(id || null);
  }

  async _teardown(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    try {
      if (s.statusChar && s.onStatus) {
        s.statusChar.removeEventListener('characteristicvaluechanged', s.onStatus);
        await s.statusChar.stopNotifications();
      }
    } catch {
      /* ignore */
    }
    try {
      if (s.onDisc) s.device.removeEventListener('gattserverdisconnected', s.onDisc);
      if (s.device.gatt?.connected) s.device.gatt.disconnect();
    } catch {
      /* ignore */
    }
    this.sessions.delete(id);
  }

  _onSessionDrop(id) {
    const wasActive = this.activeId === id;
    this.sessions.delete(id);
    if (wasActive) {
      this.activeId = this.sessions.size ? this.sessions.keys().next().value : null;
    }
    this._roster();
    if (this.onDisconnected) this.onDisconnected(id);
  }

  _emitStatus(deviceId, dataView) {
    const buf = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const st = parseStatus(buf);
    if (st && this.onStatus) this.onStatus(st, deviceId);
  }

  _roster() {
    if (this.onRosterChange) this.onRosterChange(this.listConnected());
  }
}
