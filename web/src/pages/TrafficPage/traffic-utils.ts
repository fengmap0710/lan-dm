// 流量统计公共工具
import type { TrafficCategory } from '@/lib/api';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0 分钟';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string {
  if (!v) return new Date().toISOString();
  return new Date(v).toISOString();
}

export function parseSnapshotText(text: string): Array<Record<string, unknown>> {
  // 路由器 IP 流量统计页面复制格式：IP<TAB>名称<TAB>下载(MB)<TAB>上传(MB)
  // 或 CSV：ip,name,downloadMB,uploadMB
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !/^(IP|名称|下载|上传|ip|name)/i.test(l.split(/[\t,]/)[0]));
  const items: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  for (const line of lines) {
    const cols = line.split(/[\t,]+/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;
    const ip = cols[0];
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
    const name = cols[1];
    const downMb = parseFloat(cols[2]);
    const upMb = cols.length > 3 ? parseFloat(cols[3]) : 0;
    if (Number.isNaN(downMb)) continue;
    items.push({
      ip,
      label: name || `路由器快照 ${now.slice(0, 10)}`,
      category: 'other',
      bytesDown: Math.round(downMb * 1024 * 1024),
      bytesUp: Number.isNaN(upMb) ? 0 : Math.round(upMb * 1024 * 1024),
      recordedAt: now,
      source: 'snapshot',
    });
  }
  return items;
}

export function parseCsvText(text: string): Array<Record<string, unknown>> {
  // 支持列：ip,mac,owner,category,label,bytesDown,bytesUp,durationSec,recordedAt
  // 兼容表头含中文别名：IP地址/设备/MAC/使用人/用途/说明/下载量/上传量/时长(分钟)/时间
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(/[,，\t]/).map((c) => c.trim().toLowerCase());
  const colMap: Record<string, number> = {};
  header.forEach((h, i) => {
    if (/^(ip|ip地址|ipaddress)$/.test(h)) colMap.ip = i;
    if (/^(mac)$/.test(h)) colMap.mac = i;
    if (/^(owner|使用人|姓名|用户)$/.test(h)) colMap.owner = i;
    if (/^(category|用途|分类)$/.test(h)) colMap.category = i;
    if (/^(label|说明|备注|用途说明|name)$/.test(h)) colMap.label = i;
    if (/^(bytesdown|下载量|下载|下行)$/.test(h)) colMap.down = i;
    if (/^(bytesup|上传量|上传|上行)$/.test(h)) colMap.up = i;
    if (/^(durationsec|时长|时长\(分钟\)|分钟)$/.test(h)) colMap.duration = i;
    if (/^(recordedat|时间|日期)$/.test(h)) colMap.time = i;
  });
  if (colMap.ip === undefined) return [];
  const items: Array<Record<string, unknown>> = [];
  for (let r = 1; r < lines.length; r += 1) {
    const cols = lines[r].split(/[,，\t]/).map((c) => c.trim());
    const ip = cols[colMap.ip];
    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
    const num = (idx: number | undefined, def = 0) => {
      if (idx === undefined) return def;
      const v = parseFloat(cols[idx]);
      return Number.isNaN(v) ? def : v;
    };
    const durMin = num(colMap.duration);
    items.push({
      ip,
      mac: colMap.mac !== undefined ? cols[colMap.mac] : undefined,
      owner: colMap.owner !== undefined ? cols[colMap.owner] : undefined,
      category: colMap.category !== undefined ? cols[colMap.category] : 'other',
      label: colMap.label !== undefined ? cols[colMap.label] : undefined,
      bytesDown: num(colMap.down) * 1024 * 1024,
      bytesUp: num(colMap.up) * 1024 * 1024,
      durationSec: durMin * 60,
      recordedAt: colMap.time !== undefined ? cols[colMap.time] : new Date().toISOString(),
      source: 'import',
    });
  }
  return items;
}

export function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    office: '办公/工作',
    download: '下载',
    video: '在线视频',
    game: '游戏',
    other: '其他',
  };
  return map[cat] || cat;
}
