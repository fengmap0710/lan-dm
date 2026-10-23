// EXPORTS: DeviceStatus, IXDevice{id,ip,mac,hostname,deviceType,owner,status,rxRate,txRate,rxTotal,txTotal,exempt,note}, IXRule{id,ip,label,maxUp,maxDown,enabled,note}, AppCategory, ITimeWindow, IAppPolicy{id,name,targets,apps,workWindows,lunch,freeWeekends,freeHolidays,holidays,enabled,note}, DEVICE_TYPE_OPTIONS, DEVICE_STATUS_META, APP_CATEGORY_META, DEFAULT_WORK_WINDOWS, DEFAULT_LUNCH_WINDOW

export type DeviceStatus = 'online' | 'offline' | 'limited' | 'blocked';

export interface IXDevice {
  id: string;
  ip: string;
  mac: string;
  hostname: string;
  deviceType: string;
  owner: string;
  status: DeviceStatus;
  rxRate: number; // 接收速率 KB/s
  txRate: number; // 发送速率 KB/s
  rxTotal: number; // 累计接收 MB
  txTotal: number; // 累计发送 MB
  exempt: boolean; // 豁免（NAS 等，不参与限速管控）
  note: string;
}

export interface IXRule {
  id: string;
  ip: string;
  label: string;
  maxUp: number; // KB/s
  maxDown: number; // KB/s
  enabled: boolean;
  note: string;
}

export const DEVICE_TYPE_OPTIONS = ['手机', '台式机', '笔记本', '无线设备', '摄像头', 'NAS', '其他'] as const;

export const DEVICE_STATUS_META: Record<DeviceStatus, { label: string; dot: string; text: string }> = {
  online: { label: '在线', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  limited: { label: '限速', dot: 'bg-amber-500', text: 'text-amber-700' },
  blocked: { label: '封禁', dot: 'bg-red-500', text: 'text-red-700' },
  offline: { label: '离线', dot: 'bg-gray-300', text: 'text-gray-500' },
};

export type AppCategory = 'download' | 'game' | 'video';

export const APP_CATEGORY_META: Record<AppCategory, { label: string }> = {
  download: { label: '下载' },
  game: { label: '游戏' },
  video: { label: '在线视频' },
};

export interface ITimeWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

export const DEFAULT_WORK_WINDOWS: ITimeWindow[] = [
  { start: '09:00', end: '12:00' },
  { start: '14:00', end: '18:00' },
];

export const DEFAULT_LUNCH_WINDOW: ITimeWindow = { start: '12:00', end: '14:00' };

export interface IAppPolicy {
  id: string;
  name: string;
  targets: 'all' | string[]; // 'all'=全网；数组=指定 IP
  apps: AppCategory[];
  workWindows: ITimeWindow[]; // 工作时间段（限制生效）
  lunch: ITimeWindow; // 午休时间段（放开）
  freeWeekends: boolean; // 周末放开
  freeHolidays: boolean; // 节假日放开
  holidays: string[]; // 自定义节假日日期 YYYY-MM-DD
  enabled: boolean;
  note: string;
}
