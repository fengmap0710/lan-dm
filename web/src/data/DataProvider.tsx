import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DataContext, type IDataContextValue } from '@/data/data-context';
import type { IXDevice, IXRule, IAppPolicy } from '@/data/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function DataProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<IXDevice[]>([]);
  const [rules, setRules] = useState<IXRule[]>([]);
  const [appPolicies, setAppPolicies] = useState<IAppPolicy[]>([]);
  const [ready, setReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // 从后端加载全部业务数据（启动与手动刷新共用）
  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [d, r, p] = await Promise.all([
        api.devices.list(),
        api.rules.list(),
        api.policies.list(),
      ]);
      setDevices(d.items as IXDevice[]);
      setRules(r.items as IXRule[]);
      setAppPolicies(p.items as IAppPolicy[]);
      setLastUpdated(Date.now());
      return true;
    } catch (e) {
      toast.error((e as Error).message || '数据加载失败');
      return false;
    } finally {
      setReady(true);
      setRefreshing(false);
    }
  }, []);

  // 启动从后端加载全部业务数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, r, p] = await Promise.all([
          api.devices.list(),
          api.rules.list(),
          api.policies.list(),
        ]);
        if (cancelled) return;
        setDevices(d.items as IXDevice[]);
        setRules(r.items as IXRule[]);
        setAppPolicies(p.items as IAppPolicy[]);
        setLastUpdated(Date.now());
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message || '数据加载失败');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    // 先触发 NAS 采集器立即抓取路由器（异步，不阻塞页面刷新；路由器抓取约 10-40 秒完成）
    api.collect.trigger().catch(() => {});
    const ok = await loadAll();
    if (ok) toast.success('已请求即时抓取，数据约 10-40 秒内更新');
    return ok;
  }, [loadAll]);

  // ---------- 设备 ----------
  const addDevice = useCallback(async (d: IXDevice) => {
    try {
      const res = await api.devices.create(d as unknown as Record<string, unknown>);
      setDevices((prev) => [...prev, res.item as unknown as IXDevice]);
      return true;
    } catch (e) {
      toast.error((e as Error).message || '新增失败');
      return false;
    }
  }, []);

  const updateDevice = useCallback(async (id: string, patch: Partial<IXDevice>) => {
    try {
      const res = await api.devices.update(id, patch as unknown as Record<string, unknown>);
      setDevices((prev) => prev.map((d) => (d.id === id ? (res.item as unknown as IXDevice) : d)));
      return true;
    } catch (e) {
      toast.error((e as Error).message || '更新失败');
      return false;
    }
  }, []);

  const removeDevice = useCallback(async (id: string) => {
    try {
      await api.devices.remove(id);
      setDevices((prev) => prev.filter((d) => d.id !== id));
      return true;
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
      return false;
    }
  }, []);

  const batchUpdateDevices = useCallback(
    async (ids: string[], patch: Partial<IXDevice>) => {
      try {
        const res = await api.devices.batch(ids, patch as unknown as Record<string, unknown>);
        // 本地同步更新（只更新用户传入的字段）
        setDevices((prev) =>
          prev.map((d) => {
            if (!ids.includes(d.id)) return d;
            const next = { ...d };
            if (patch.deviceType !== undefined) next.deviceType = patch.deviceType;
            if (patch.owner !== undefined) next.owner = patch.owner;
            if (patch.note !== undefined) next.note = patch.note;
            return next;
          }),
        );
        return res.updated;
      } catch (e) {
        toast.error((e as Error).message || '批量更新失败');
        return 0;
      }
    },
    [],
  );

  const importOwners = useCallback(
    async (map: Record<string, string>) => {
      const matchedIps = devices.filter((d) => !!map[d.ip]).map((d) => d.ip);
      if (matchedIps.length === 0) return 0;
      let okCount = 0;
      for (const ip of matchedIps) {
        const device = devices.find((d) => d.ip === ip);
        if (!device) continue;
        try {
          await api.devices.update(device.id, { owner: map[ip] });
          setDevices((prev) => prev.map((d) => (d.ip === ip ? { ...d, owner: map[ip] } : d)));
          okCount += 1;
        } catch {
          // 单条失败继续其余
        }
      }
      return okCount;
    },
    [devices],
  );

  // ---------- 规则（含设备状态联动） ----------
  const addRule = useCallback(async (r: IXRule) => {
    try {
      const res = await api.rules.create(r as unknown as Record<string, unknown>);
      const created = res.item as unknown as IXRule;
      setRules((prev) => [...prev, created]);
      if (created.enabled) {
        setDevices((prev) =>
          prev.map((d) => (d.ip === created.ip && !d.exempt ? { ...d, status: 'limited' } : d)),
        );
      }
      return true;
    } catch (e) {
      toast.error((e as Error).message || '新增规则失败');
      return false;
    }
  }, []);

  const updateRule = useCallback(
    async (id: string, patch: Partial<IXRule>) => {
      const target = rules.find((r) => r.id === id);
      if (!target) return false;
      try {
        const res = await api.rules.update(id, patch as unknown as Record<string, unknown>);
        const next = res.item as unknown as IXRule;
        setRules((prev) => prev.map((r) => (r.id === id ? next : r)));
        if (target.ip) {
          const otherActive = rules.some((r) => r.enabled && r.id !== id && r.ip === target.ip);
          if (next.enabled && !otherActive) {
            setDevices((prev) =>
              prev.map((d) => (d.ip === target.ip && !d.exempt ? { ...d, status: 'limited' } : d)),
            );
          } else if (!next.enabled && !otherActive) {
            setDevices((prev) =>
              prev.map((d) => (d.ip === target.ip && d.status === 'limited' ? { ...d, status: 'online' } : d)),
            );
          }
        }
        return true;
      } catch (e) {
        toast.error((e as Error).message || '更新规则失败');
        return false;
      }
    },
    [rules],
  );

  const removeRule = useCallback(
    async (id: string) => {
      const target = rules.find((r) => r.id === id);
      try {
        await api.rules.remove(id);
        setRules((prev) => prev.filter((r) => r.id !== id));
        if (target?.ip) {
          const otherActive = rules.some((r) => r.enabled && r.id !== id && r.ip === target.ip);
          if (!otherActive) {
            setDevices((prev) =>
              prev.map((d) => (d.ip === target.ip && d.status === 'limited' ? { ...d, status: 'online' } : d)),
            );
          }
        }
        return true;
      } catch (e) {
        toast.error((e as Error).message || '删除规则失败');
        return false;
      }
    },
    [rules],
  );

  const toggleRule = useCallback(
    async (id: string) => {
      const target = rules.find((r) => r.id === id);
      if (!target) return;
      const willEnable = !target.enabled;
      try {
        const res = await api.rules.update(id, { enabled: willEnable });
        setRules((prev) => prev.map((r) => (r.id === id ? (res.item as unknown as IXRule) : r)));
        if (target.ip) {
          if (willEnable) {
            setDevices((prev) =>
              prev.map((d) => (d.ip === target.ip && !d.exempt ? { ...d, status: 'limited' } : d)),
            );
          } else {
            const otherActive = rules.some((r) => r.enabled && r.id !== id && r.ip === target.ip);
            if (!otherActive) {
              setDevices((prev) =>
                prev.map((d) => (d.ip === target.ip && d.status === 'limited' ? { ...d, status: 'online' } : d)),
              );
            }
          }
        }
      } catch (e) {
        toast.error((e as Error).message || '切换规则失败');
      }
    },
    [rules],
  );

  const activeRuleForIp = useCallback((ip: string) => rules.find((r) => r.enabled && r.ip === ip), [rules]);

  // ---------- 应用策略 ----------
  const addPolicy = useCallback(async (p: IAppPolicy) => {
    try {
      const res = await api.policies.create(p as unknown as Record<string, unknown>);
      setAppPolicies((prev) => [...prev, res.item as unknown as IAppPolicy]);
      return true;
    } catch (e) {
      toast.error((e as Error).message || '新增策略失败');
      return false;
    }
  }, []);

  const updatePolicy = useCallback(async (id: string, patch: Partial<IAppPolicy>) => {
    try {
      const res = await api.policies.update(id, patch as unknown as Record<string, unknown>);
      setAppPolicies((prev) => prev.map((p) => (p.id === id ? (res.item as unknown as IAppPolicy) : p)));
      return true;
    } catch (e) {
      toast.error((e as Error).message || '更新策略失败');
      return false;
    }
  }, []);

  const removePolicy = useCallback(async (id: string) => {
    try {
      await api.policies.remove(id);
      setAppPolicies((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (e) {
      toast.error((e as Error).message || '删除策略失败');
      return false;
    }
  }, []);

  const togglePolicy = useCallback(
    async (id: string) => {
      const target = appPolicies.find((p) => p.id === id);
      if (!target) return;
      try {
        const res = await api.policies.update(id, { enabled: !target.enabled });
        setAppPolicies((prev) => prev.map((p) => (p.id === id ? (res.item as unknown as IAppPolicy) : p)));
      } catch (e) {
        toast.error((e as Error).message || '切换策略失败');
      }
    },
    [appPolicies],
  );

  const value: IDataContextValue = {
    devices,
    rules,
    appPolicies,
    ready,
    lastUpdated,
    refreshing,
    refresh,
    addDevice,
    updateDevice,
    removeDevice,
    batchUpdateDevices,
    importOwners,
    addRule,
    updateRule,
    removeRule,
    toggleRule,
    activeRuleForIp,
    addPolicy,
    updatePolicy,
    removePolicy,
    togglePolicy,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
