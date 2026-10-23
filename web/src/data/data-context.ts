// EXPORTS: DataContext, useData(), IDataContextValue
import { createContext, useContext } from 'react';
import type { IXDevice, IXRule, IAppPolicy } from './types';

export interface IDataContextValue {
  devices: IXDevice[];
  rules: IXRule[];
  appPolicies: IAppPolicy[];
  ready: boolean;
  lastUpdated: number;
  refreshing: boolean;
  refresh: () => Promise<boolean>;
  addDevice: (d: IXDevice) => void;
  updateDevice: (id: string, patch: Partial<IXDevice>) => void;
  removeDevice: (id: string) => void;
  batchUpdateDevices: (ids: string[], patch: Partial<IXDevice>) => Promise<number>;
  importOwners: (map: Record<string, string>) => Promise<number>;
  addRule: (r: IXRule) => void;
  updateRule: (id: string, patch: Partial<IXRule>) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
  activeRuleForIp: (ip: string) => IXRule | undefined;
  addPolicy: (p: IAppPolicy) => void;
  updatePolicy: (id: string, patch: Partial<IAppPolicy>) => void;
  removePolicy: (id: string) => void;
  togglePolicy: (id: string) => void;
}

export const DataContext = createContext<IDataContextValue | null>(null);

export function useData(): IDataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData 必须在 DataProvider 内使用');
  return ctx;
}
