import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import {
  Activity,
  ArrowRight,
  Clock,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import { useData } from '@/data/data-context';
import { formatRate, formatBytes, formatDuration } from '@/data/format';
import { APP_CATEGORY_META } from '@/data/types';
import { evaluatePolicy } from '@/data/schedule';
import { api, type RouterSnapshot, type RouterDeviceStat } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';

const CHART_COLORS = ['#0E7C7B', '#D97706', '#3B6FD4', '#3FA36C', '#C6558F'];
const STATUS_COLORS = ['#0E7C7B', '#D97706', '#DC2626', '#9CA3AF'];

type ViewMode = 'live' | 'stats';

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'success';
}) {
  const iconCls =
    tone === 'warning'
      ? 'stat-icon stat-icon-amber'
      : tone === 'success'
        ? 'stat-icon stat-icon-green'
        : 'stat-icon stat-icon-teal';
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`${iconCls} h-11 w-11 shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-3xl font-bold leading-none tracking-tight tabular-nums">{value}</div>
          <div className="mt-2 truncate text-xs text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { devices, rules, appPolicies, ready, refresh, refreshing } = useData();
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('live');
  const [snapshot, setSnapshot] = useState<RouterSnapshot | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  // 自动刷新：默认关闭；选择后记忆在 localStorage，刷新页面不重置
  const [autoRefresh, setAutoRefresh] = useState(() => {
    try {
      return localStorage.getItem('dash_auto_refresh') === '1';
    } catch {
      return false;
    }
  });
  const [collectEnabled, setCollectEnabled] = useState<boolean | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('dash_auto_refresh', autoRefresh ? '1' : '0');
    } catch {
      // noop
    }
  }, [autoRefresh]);

  // 读取抓取总开关状态
  useEffect(() => {
    let alive = true;
    api.collect
      .status()
      .then((s) => {
        if (alive) setCollectEnabled(s.enabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggleCollect = async () => {
    if (collectEnabled === null || toggleBusy) return;
    // 停止抓取是全局影响操作，二次确认防误触
    if (collectEnabled && !window.confirm('确定停止全部抓取吗？\n\n将暂停：路由器数据采集、NAS 内网探测。\n期间页面数据保持当前状态不再更新。')) {
      return;
    }
    setToggleBusy(true);
    try {
      const target = !collectEnabled;
      const res = await api.collect.toggle(target);
      setCollectEnabled(res.enabled);
      void refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '切换失败');
    } finally {
      setToggleBusy(false);
    }
  };

  const resetAll = async () => {
    const ok = window.confirm(
      '确定要清空全部数据重新开始吗？\n\n将清空：设备台账、流量统计、实时快照历史。\n保留：账号、路由器凭据、消息历史。\n重置后会自动停止抓取，确认准备就绪后再手动开启。\n\n此操作不可恢复！',
    );
    if (!ok) return;
    try {
      const res = await api.collect.reset();
      setCollectEnabled(res.enabled);
      setSnapshot(null);
      setLastFetch(null);
      await refresh();
      window.alert('数据已清空，抓取已自动停止。准备就绪后点击"抓取运行中"按钮重新开启。');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '重置失败');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // 每 5 秒刷新"当前时间"刻度（避免渲染期调用 Date.now）
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // 轮询路由器实时快照 + NAS 内网探测（5 秒）；顺带同步抓取总开关状态（多端一致）
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.routerRealtime.get();
        if (!alive) return;
        setSnapshot(res.snapshot);
        setLastFetch(Date.now());
        setSnapshotError('');
      } catch (e) {
        if (alive) setSnapshotError(e instanceof Error ? e.message : '加载失败');
      }
      try {
        const st = await api.collect.status();
        if (alive) setCollectEnabled(st.enabled);
      } catch {
        // 状态同步失败不阻断实时数据
      }
    };
    load();
    const timerId = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timerId);
    };
  }, []);

  // 自动刷新台账/统计数据（30 秒，可开关）
  useEffect(() => {
    if (!autoRefresh) return;
    const timerId = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timerId);
  }, [autoRefresh, refresh]);

  const deviceByIp = useMemo(() => {
    const m: Record<string, { hostname: string; owner: string; exempt: boolean; status: string }> = {};
    for (const d of devices) {
      m[d.ip] = { hostname: d.hostname, owner: d.owner, exempt: !!d.exempt, status: d.status };
    }
    return m;
  }, [devices]);

  const liveStats = useMemo(() => {
    if (!snapshot) return null;
    const rows: Array<RouterDeviceStat & { hostname: string; owner: string; exempt: boolean }> = snapshot.devices.map((d) => ({
      ...d,
      hostname: deviceByIp[d.addr]?.hostname || '',
      owner: deviceByIp[d.addr]?.owner || '',
      exempt: !!deviceByIp[d.addr]?.exempt,
    }));
    const totalDown = rows.reduce((s, d) => s + (d.rx_bps || 0), 0);
    const totalUp = rows.reduce((s, d) => s + (d.tx_bps || 0), 0);
    const active = rows.filter((d) => (d.rx_bps || 0) > 0 || (d.tx_bps || 0) > 0).length;
    return { rows, totalDown, totalUp, active };
  }, [snapshot, deviceByIp]);

  const liveTopOption = useMemo(() => {
    if (!liveStats) return null;
    const top = [...liveStats.rows].sort((a, b) => (b.rx_bps || 0) - (a.rx_bps || 0)).slice(0, 10);
    const name = (d: RouterDeviceStat & { hostname: string }) => {
      const ip = d.addr.split('.').pop();
      return d.hostname ? `${d.hostname} (${ip})` : d.addr;
    };
    return {
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 400,
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove|click',
        renderMode: 'richText',
        confine: true,
        formatter: function (p: Array<{ name: string; value: number }>) {
          const line = ['实时下行速率排行'];
          for (let i = 0; i < p.length; i++) {
            line.push(`${p[i].name}：${formatRate(p[i].value)}`);
          }
          return line.join(String.fromCharCode(10));
        },
      },
      grid: { left: 8, right: 70, top: 12, bottom: 12, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'KB/s',
        nameLocation: 'end',
        nameTextStyle: { fontSize: 10, color: '#8b949e' },
        axisLabel: { fontSize: 10, color: '#6b7280' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: top.map(name),
        axisLabel: { fontSize: 10, color: '#374151' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          barWidth: '58%',
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(14,124,123,0.35)' },
                { offset: 1, color: '#0E7C7B' },
              ],
            },
            borderRadius: [0, 4, 4, 0],
          },
          data: top.map((d) => d.rx_bps || 0),
          label: {
            show: true,
            position: 'right',
            fontSize: 10,
            color: '#6b7280',
            formatter: function (p: { value: number }) {
              return formatRate(p.value);
            },
          },
        },
      ],
    };
  }, [liveStats]);

  const collectorState = useMemo(() => {
    if (!snapshot) return { label: '等待采集', cls: 'bg-gray-300', text: '尚未收到路由器数据，请先启动采集器' };
    const ageSec = lastFetch ? Math.round((nowTick - lastFetch) / 1000) : 0;
    const probeAgeSec = snapshot.probeAt ? Math.round(nowTick / 1000 - snapshot.probeAt) : ageSec;
    // 在线状态由 NAS 内网探测维持（30 秒一轮），优先以探测新鲜度为准
    if (probeAgeSec <= 60) {
      return {
        label: '在线实时',
        cls: 'bg-emerald-500',
        text: `NAS 探测 ${probeAgeSec}s 前 · 路由器快照 ${formatDuration(ageSec)} 前 · ${snapshot.probeOnline ?? snapshot.count} 台在线`,
      };
    }
    if (ageSec > 120) return { label: '采集器离线', cls: 'bg-red-500', text: `最后快照 ${formatDuration(ageSec)} 前，请检查本机采集任务` };
    if (ageSec > 45) return { label: '数据偏旧', cls: 'bg-amber-500', text: `最后快照 ${formatDuration(ageSec)} 前，即将刷新` };
    return { label: '实时采集', cls: 'bg-emerald-500', text: `${formatDuration(ageSec)} 前更新 · 共 ${snapshot.count} 台设备` };
  }, [snapshot, lastFetch, nowTick]);

  const onlineCount = devices.filter((d) => d.status !== 'offline').length;
  const exemptDevices = devices.filter((d) => d.exempt);
  const enabledRules = rules.filter((r) => r.enabled).length;
  const enabledPolicies = appPolicies.filter((p) => p.enabled).length;

  const activeVerdicts = appPolicies.filter((p) => p.enabled).map((p) => ({ policy: p, verdict: evaluatePolicy(p, now) }));
  const restricting = activeVerdicts.find((v) => v.verdict.restricted);

  const trafficOption = useMemo(() => {
    const ipShort = (ip: string) => ip.split('.').pop() || ip;
    if (liveStats) {
      const top = [...liveStats.rows].sort((a, b) => (b.rx_bytes || 0) - (a.rx_bytes || 0)).slice(0, 10);
      return {
        animation: true,
        animationDuration: 600,
        animationEasing: 'cubicOut',
        animationDurationUpdate: 400,
        tooltip: { trigger: 'axis', triggerOn: 'mousemove|click', renderMode: 'richText', confine: true },
        grid: { left: 8, right: 64, top: 12, bottom: 12, containLabel: true },
        xAxis: {
          type: 'value',
          name: 'MB',
          nameLocation: 'end',
          nameTextStyle: { fontSize: 10, color: '#8b949e' },
          axisLabel: { fontSize: 10, color: '#6b7280' },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
        },
        yAxis: {
          type: 'category',
          inverse: true,
          data: top.map((d) => (d.hostname ? `${d.hostname} (${ipShort(d.addr)})` : d.addr)),
          axisLabel: { fontSize: 10, color: '#374151' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        series: [
          {
            type: 'bar',
            barWidth: '58%',
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: 'rgba(14,124,123,0.35)' },
                  { offset: 1, color: '#0E7C7B' },
                ],
              },
              borderRadius: [0, 4, 4, 0],
            },
            data: top.map((d) => Math.round(((d.rx_bytes || 0) / (1024 * 1024)) * 10) / 10),
            label: { show: true, position: 'right', fontSize: 10, color: '#6b7280', formatter: '{c}' },
          },
        ],
      };
    }
    const top = [...devices].sort((a, b) => b.rxTotal - a.rxTotal).slice(0, 10);
    return {
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 400,
      tooltip: { trigger: 'axis', triggerOn: 'mousemove|click', renderMode: 'richText', confine: true },
      grid: { left: 8, right: 64, top: 12, bottom: 12, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'MB',
        nameLocation: 'end',
        nameTextStyle: { fontSize: 10, color: '#8b949e' },
        axisLabel: { fontSize: 10, color: '#6b7280' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: top.map((d) => (d.hostname ? `${d.hostname} (${ipShort(d.ip)})` : d.ip)),
        axisLabel: { fontSize: 10, color: '#374151' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          barWidth: '58%',
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(14,124,123,0.35)' },
                { offset: 1, color: '#0E7C7B' },
              ],
            },
            borderRadius: [0, 4, 4, 0],
          },
          data: top.map((d) => Number(d.rxTotal.toFixed(1))),
          label: { show: true, position: 'right', fontSize: 10, color: '#6b7280', formatter: '{c}' },
        },
      ],
    };
  }, [devices, liveStats]);

  const typeOption = useMemo(() => {
    const map: Record<string, number> = {};
    devices.forEach((d) => {
      const key = d.deviceType || '其他';
      map[key] = (map[key] || 0) + 1;
    });
    const dist = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return {
      animation: true,
      animationDuration: 700,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 400,
      tooltip: { trigger: 'item', triggerOn: 'mousemove|click', renderMode: 'richText', confine: true },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: '#6b7280' } },
      color: CHART_COLORS,
      series: [
        {
          type: 'pie',
          radius: ['42%', '66%'],
          center: ['50%', '46%'],
          itemStyle: { borderRadius: 5, borderColor: '#ffffff', borderWidth: 1.5 },
          label: { fontSize: 11, color: '#374151', formatter: '{b} {c}' },
          labelLine: { length: 10, length2: 6 },
          data: dist.map(([name, count]) => ({ name, value: count })),
        },
      ],
    };
  }, [devices]);

  const statusOption = useMemo(() => {
    const count = (s: string) => devices.filter((d) => d.status === s).length;
    const dist = [
      { name: '在线', value: count('online') },
      { name: '限速', value: count('limited') },
      { name: '封禁', value: count('blocked') },
      { name: '离线', value: count('offline') },
    ].filter((d) => d.value > 0);
    return {
      animation: true,
      animationDuration: 700,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 400,
      tooltip: { trigger: 'item', triggerOn: 'mousemove|click', renderMode: 'richText', confine: true },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: '#6b7280' } },
      color: STATUS_COLORS,
      series: [
        {
          type: 'pie',
          radius: ['42%', '66%'],
          center: ['50%', '46%'],
          itemStyle: { borderRadius: 5, borderColor: '#ffffff', borderWidth: 1.5 },
          label: { fontSize: 11, color: '#374151', formatter: '{b} {c}' },
          labelLine: { length: 10, length2: 6 },
          data: dist,
        },
      ],
    };
  }, [devices]);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center text-sm text-muted-foreground md:px-8">
        正在加载设备台账…
      </div>
    );
  }

  const nowLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8">
      <PageHeader
        title="网络总览"
        description={`实时视图来自 TL-R483G 采集器快照 · 统计视图来自台账与流量记录（${nowLabel}）`}
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              自动刷新（30秒）
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                refreshing
                  ? 'cursor-wait border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              }`}
              title="立即重新拉取台账与统计数据"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '刷新中…' : '刷新'}
            </button>
            <button
              type="button"
              onClick={() => void toggleCollect()}
              disabled={toggleBusy || collectEnabled === null}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                collectEnabled === false
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
              }`}
              title="停止/开启 NAS 采集器对路由器的数据抓取"
            >
              <span className={`h-2 w-2 rounded-full ${collectEnabled === false ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {collectEnabled === null ? '开关…' : collectEnabled === false ? '抓取已停止' : '抓取运行中'}
            </button>
            <button
              type="button"
              onClick={() => void resetAll()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20"
              title="清空设备台账与流量数据，重新开始统计"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置数据
            </button>
            <div className="flex rounded-lg border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setView('live')}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === 'live' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Gauge className="h-4 w-4" />
                实时显示
              </button>
              <button
                type="button"
                onClick={() => setView('stats')}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === 'stats' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                统计显示
              </button>
            </div>
          </>
        }
      />

      {collectEnabled === false && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 shadow-sm">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            抓取已停止：以下数据显示的是暂停前的最新状态，不会再更新。准备就绪后点击右上角「抓取运行中」重新开启采集。
          </span>
        </div>
      )}

      {view === 'live' ? (
        <div>
          {/* 采集状态 */}
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                collectorState.cls === 'bg-emerald-500'
                  ? 'bg-emerald-50 text-emerald-700'
                  : collectorState.cls === 'bg-red-500'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${collectorState.cls}`} />
              {collectorState.label}
            </span>
            <span className="text-sm text-muted-foreground">{collectorState.text}</span>
            {snapshotError && <span className="ml-auto text-xs text-destructive">{snapshotError}</span>}
            <span className="ml-auto hidden text-xs text-muted-foreground md:inline">
              前端每 10 秒自动刷新 · 本机采集器建议每 30 秒一轮
            </span>
          </div>

          {!snapshot ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wifi className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">尚未收到路由器实时数据</p>
                <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  NAS 采集器（lan-collector）默认每 10 分钟自动抓取一次路由器，点击页面「刷新」可立即抓取。
                  当前抓取总开关处于停止状态，点击右上角「抓取运行中」重新开启后即可恢复采集。
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  label="实时下行合计"
                  value={formatRate(liveStats?.totalDown || 0)}
                  sub={`上行合计 ${formatRate(liveStats?.totalUp || 0)}`}
                  icon={<ArrowRight className="h-5 w-5" />}
                />
                <StatCard
                  label="活跃设备"
                  value={String(liveStats?.active ?? 0)}
                  sub={`共 ${snapshot.count} 台在线统计`}
                  icon={<Activity className="h-5 w-5" />}
                />
                <StatCard
                  label="登记设备"
                  value={String(onlineCount)}
                  sub={`共 ${devices.length} 台台账设备`}
                  icon={<LayoutDashboard className="h-5 w-5" />}
                />
                <StatCard
                  label="采样时间"
                  value={formatDuration(Math.round((nowTick - (snapshot.ts * 1000 || nowTick)) / 1000)) + '前'}
                  sub={
                    snapshot.probeAt
                      ? `在线探测 ${new Date(snapshot.probeAt * 1000).toLocaleTimeString('zh-CN', { hour12: false })} · 路由器采样 ${new Date(snapshot.ts * 1000).toLocaleTimeString('zh-CN', { hour12: false })}`
                      : `路由器采样 ${new Date(snapshot.ts * 1000).toLocaleTimeString('zh-CN', { hour12: false })}`
                  }
                  icon={<Clock className="h-5 w-5" />}
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-teal-400 to-teal-600" />
                      实时下行速率 Top 10（来自路由器，10 秒刷新）
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {liveTopOption ? <ReactECharts option={liveTopOption} style={{ height: 300 }} notMerge /> : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600" />
                      实时明细（下行速率降序）
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[340px] overflow-auto p-2">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">IP</th>
                          <th className="px-3 py-2 font-medium">设备</th>
                          <th className="px-3 py-2 text-right font-medium">下行 KB/s</th>
                          <th className="px-3 py-2 text-right font-medium">上行 KB/s</th>
                          <th className="px-3 py-2 text-right font-medium">累计下行</th>
                          <th className="px-3 py-2 text-right font-medium">累计上行</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...liveStats!.rows]
                          .sort((a, b) => (b.rx_bps || 0) - (a.rx_bps || 0))
                          .slice(0, 30)
                          .map((d) => (
                            <tr key={d.addr} className="row-hover border-t border-border/60">
                              <td className="px-3 py-1.5 font-mono text-xs">
                                {d.addr}
                                {d.exempt && <Badge className="ml-1.5 bg-primary/10 text-primary hover:bg-primary/10">NAS</Badge>}
                              </td>
                              <td className="px-3 py-1.5 text-xs">
                                {d.hostname || d.owner || <span className="text-muted-foreground">未登记</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">{Math.round(d.rx_bps || 0)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">{Math.round(d.tx_bps || 0)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">{formatBytes(d.rx_bytes || 0)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">{formatBytes(d.tx_bytes || 0)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600" />
                      实时上行速率 Top 10
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReactECharts
                      option={{
                        animation: true,
                        animationDuration: 600,
                        animationEasing: 'cubicOut',
                        animationDurationUpdate: 400,
                        tooltip: { trigger: 'axis', triggerOn: 'mousemove|click', renderMode: 'richText', confine: true },
                        grid: { left: 8, right: 70, top: 12, bottom: 12, containLabel: true },
                        xAxis: {
                          type: 'value',
                          name: 'KB/s',
                          nameLocation: 'end',
                          nameTextStyle: { fontSize: 10, color: '#8b949e' },
                          axisLabel: { fontSize: 10, color: '#6b7280' },
                          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
                        },
                        yAxis: {
                          type: 'category',
                          inverse: true,
                          data: [...liveStats!.rows]
                            .sort((a, b) => (b.tx_bps || 0) - (a.tx_bps || 0))
                            .slice(0, 10)
                            .map((d) => {
                              const ip = d.addr.split('.').pop();
                              return d.hostname ? `${d.hostname} (${ip})` : d.addr;
                            }),
                          axisLabel: { fontSize: 10, color: '#374151' },
                          axisLine: { show: false },
                          axisTick: { show: false },
                          splitLine: { show: false },
                        },
                        series: [
                          {
                            type: 'bar',
                            barWidth: '58%',
                            itemStyle: {
                              color: {
                                type: 'linear',
                                x: 0,
                                y: 0,
                                x2: 1,
                                y2: 0,
                                colorStops: [
                                  { offset: 0, color: 'rgba(59,111,212,0.35)' },
                                  { offset: 1, color: '#3B6FD4' },
                                ],
                              },
                              borderRadius: [0, 4, 4, 0],
                            },
                            data: [...liveStats!.rows]
                              .sort((a, b) => (b.tx_bps || 0) - (a.tx_bps || 0))
                              .slice(0, 10)
                              .map((d) => d.tx_bps || 0),
                            label: {
                              show: true,
                              position: 'right',
                              fontSize: 10,
                              color: '#6b7280',
                              formatter: function (p: { value: number }) {
                                return formatRate(p.value);
                              },
                            },
                          },
                        ],
                      }}
                      style={{ height: 280 }}
                      notMerge
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-rose-400 to-rose-600" />
                      实时包速率 Top 10
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReactECharts
                      option={{
                        animation: true,
                        animationDuration: 600,
                        animationEasing: 'cubicOut',
                        animationDurationUpdate: 400,
                        tooltip: { trigger: 'axis', triggerOn: 'mousemove|click', renderMode: 'richText', confine: true },
                        grid: { left: 8, right: 60, top: 12, bottom: 12, containLabel: true },
                        xAxis: {
                          type: 'value',
                          name: 'pps',
                          nameLocation: 'end',
                          nameTextStyle: { fontSize: 10, color: '#8b949e' },
                          axisLabel: { fontSize: 10, color: '#6b7280' },
                          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
                        },
                        yAxis: {
                          type: 'category',
                          inverse: true,
                          data: [...liveStats!.rows]
                            .sort((a, b) => (b.rx_pps || 0) - (a.rx_pps || 0))
                            .slice(0, 10)
                            .map((d) => {
                              const ip = d.addr.split('.').pop();
                              return d.hostname ? `${d.hostname} (${ip})` : d.addr;
                            }),
                          axisLabel: { fontSize: 10, color: '#374151' },
                          axisLine: { show: false },
                          axisTick: { show: false },
                          splitLine: { show: false },
                        },
                        series: [
                          {
                            type: 'bar',
                            barWidth: '58%',
                            itemStyle: {
                              color: {
                                type: 'linear',
                                x: 0,
                                y: 0,
                                x2: 1,
                                y2: 0,
                                colorStops: [
                                  { offset: 0, color: 'rgba(198,85,143,0.35)' },
                                  { offset: 1, color: '#C6558F' },
                                ],
                              },
                              borderRadius: [0, 4, 4, 0],
                            },
                            data: [...liveStats!.rows]
                              .sort((a, b) => (b.rx_pps || 0) - (a.rx_pps || 0))
                              .slice(0, 10)
                              .map((d) => d.rx_pps || 0),
                            label: {
                              show: true,
                              position: 'right',
                              fontSize: 10,
                              color: '#6b7280',
                              formatter: function (p: { value: number }) {
                                return `${Math.round(p.value)} pps`;
                              },
                            },
                          },
                        ],
                      }}
                      style={{ height: 280 }}
                      notMerge
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          {exemptDevices.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm">
                <span className="font-medium text-foreground">豁免保护：</span>
                <span className="text-muted-foreground">
                  {exemptDevices.map((d) => `${d.ip}${d.hostname ? `（${d.hostname}）` : ''}`).join('、')}
                  ——这些设备永不参与限速或封禁。
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              label="在线设备"
              value={String(onlineCount)}
              sub={`共 ${devices.length} 台登记设备`}
              icon={<Activity className="h-5 w-5" />}
            />
            <StatCard
              label="累计下行合计"
              value={liveStats ? formatBytes(liveStats.rows.reduce((s, d) => s + (d.rx_bytes || 0), 0)) : '—'}
              sub={liveStats ? `累计上行 ${formatBytes(liveStats.rows.reduce((s, d) => s + (d.tx_bytes || 0), 0))}` : '等待实时数据'}
              icon={<ArrowRight className="h-5 w-5" />}
            />
            <StatCard
              label="限速规则"
              value={String(enabledRules)}
              sub={`共 ${rules.length} 条规则`}
              icon={<SlidersHorizontal className="h-5 w-5" />}
            />
            <StatCard
              label="应用策略"
              value={String(enabledPolicies)}
              sub={`共 ${appPolicies.length} 条策略`}
              icon={<LayoutDashboard className="h-5 w-5" />}
            />
            <StatCard
              label="当前时段"
              value={restricting ? '限制中' : appPolicies.some((p) => p.enabled) ? '放开' : '未配置'}
              sub={restricting ? restricting.verdict.reason : activeVerdicts[0] ? activeVerdicts[0].verdict.reason : '尚未配置时段策略'}
              icon={<Clock className="h-5 w-5" />}
              tone={restricting ? 'warning' : 'success'}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-teal-400 to-teal-600" />
                  累计下行流量 Top 10（路由器统计周期）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={trafficOption} style={{ height: 300 }} notMerge />
              </CardContent>
            </Card>
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600" />
                  设备类型构成
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={typeOption} style={{ height: 280 }} notMerge />
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" />
                  设备状态分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={statusOption} style={{ height: 280 }} notMerge />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-600" />
                  应用限制策略（下载 / 游戏 / 在线视频）
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appPolicies.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    还没有应用限制策略。到「行为管控 → 应用限制」为占用带宽的设备和时段配置下载 / 游戏 / 视频限制。
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {appPolicies.map((p) => {
                      const verdict = p.enabled ? evaluatePolicy(p, now) : { restricted: false, reason: '策略未启用' };
                      return (
                        <div key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
                          <span className="text-sm font-medium">{p.name || '未命名策略'}</span>
                          <span className="flex flex-wrap gap-1">
                            {p.apps.map((a) => (
                              <Badge key={a} variant="outline">
                                {APP_CATEGORY_META[a].label}
                              </Badge>
                            ))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {p.targets === 'all' ? '全网设备' : `${p.targets.length} 台指定设备`}
                          </span>
                          <span className="ml-auto">
                            <Badge variant={verdict.restricted ? 'destructive' : 'default'}>
                              {verdict.restricted ? `限制中 · ${verdict.reason}` : `放开 · ${verdict.reason}`}
                            </Badge>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/devices"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              管理设备台账
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/rules"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              配置限速与应用策略
              <SlidersHorizontal className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
