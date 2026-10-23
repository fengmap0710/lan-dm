// EXPORTS: loadSeedDevices(): Promise<IXDevice[]>
import type { IXDevice } from './types';

const BASE = (import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '') + '/';

export async function loadSeedDevices(): Promise<IXDevice[]> {
  try {
    const res = await fetch(`${BASE}data/devices.json`);
    if (!res.ok) return [];
    const data = (await res.json()) as IXDevice[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
