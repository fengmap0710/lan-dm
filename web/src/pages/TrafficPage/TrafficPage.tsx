import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Clock, Download, Import, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, TRAFFIC_CATEGORY_META, type ITrafficRecord, type TrafficStats } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import TrafficRecordDialog from './sections/TrafficRecordDialog';
import TrafficImportDialog from './sections/TrafficImportDialog';
import { categoryLabel, formatBytes, formatDuration } from './traffic-utils';

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  tone = 'teal',
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof Download;
  tone?: 'teal' | 'amber' | 'blue' | 'green';
}) {
  const iconCls =
    tone === 'amber'
      ? 'stat-icon stat-icon-amber'
      : tone === 'blue'
        ? 'stat-icon stat-icon-blue'
        : tone === 'green'
          ? 'stat-icon stat-icon-green'
          : 'stat-icon stat-icon-teal';
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="mt-1.5 text-2xl font-bold leading-none tracking-tight tabular-nums">{value}</div>
          <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className={`${iconCls} h-10 w-10 shrink-0`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrafficPage() {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [records, setRecords] = useState<ITrafficRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterIp, setFilterIp] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [recordOpen, setRecordOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  // 统计周期：日 / 周 / 月 / 全部
  const [range, setRange] = useState<TrafficRange>('all');
  const rangeRef = useRef<TrafficRange>('all');

  const loadAll = useCallback(async (rg: TrafficRange) => {
    try {
      const [s, r] = await Promise.all([api.traffic.stats(rg), api.traffic.list()]);
      setStats(s);
      setRecords(r.items);
      setRefreshedAt(Date.now());
    } catch (e) {
      // 错误由 toast 统一处理（401 跳登录）
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 触发 NAS 采集器立即抓取路由器（流量明细来自快照，抓取约 10-40 秒后更新）
      api.collect.trigger().catch(() => {});
      await loadAll(rangeRef.current);
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const changeRange = useCallback(
    (r: TrafficRange) => {
      if (r === rangeRef.current) return;
      setRange(r);
      rangeRef.current = r;
      setRefreshing(true);
      void loadAll(r).finally(() => setRefreshing(false));
    },
    [loadAll],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, r] = await Promise.all([api.traffic.stats('all'), api.traffic.list()]);
        if (cancelled) return;
        setStats(s);
        setRecords(r.items);
      } catch {
        // 错误由 401 处理统一跳转
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const removeRecord = useCallback(
    async (id: string) => {
      try {
        await api.traffic.remove(id);
        await loadAll(rangeRef.current);
      } catch (e) {
        // noop
      }
    },
    [loadAll],
  );

  const ipTop = useMemo(
    () =>
      (stats?.byIp || [])
        .slice(0, 10)
        .map((it) => ({ name: it.ip, mb: Math.round(it.bytesDown / 1024 / 1024) })),
    [stats],
  );

  const catData = useMemo(
    () =>
      (stats?.byCategory || []).map((c) => ({
        name: categoryLabel(c.category),
        value: c.bytesDown,
        color: TRAFFIC_CATEGORY_META[c.category as keyof typeof TRAFFIC_CATEGORY_META]?.color || '#64748b',
      })),
    [stats],
  );

  const dayData = useMemo(
    () =>
      (stats?.byDay || []).map((d) => ({
        day: d.day.slice(5),
        download: +(d.bytesDown / 1024 / 1024).toFixed(0),
        upload: +(d.bytesUp / 1024 / 1024).toFixed(0),
      })),
    [stats],
  );

  const filtered = useMemo(() => {
    let list = records;
    const cutoff = rangeCutoff(range);
    if (cutoff > 0) list = list.filter((r) => new Date(r.recordedAt).getTime() >= cutoff);
    if (filterIp.trim()) {
      const q = filterIp.trim().toLowerCase();
      list = list.filter((r) => r.ip.includes(q) || (r.mac || '').toLowerCase().includes(q));
    }
    if (filterCat !== 'all') list = list.filter((r) => r.category === filterCat);
    return [...list].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  }, [records, filterIp, filterCat, range]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8">
      <PageHeader
        title="流量使用统计"
        description="按 IP/MAC 统计每个设备的流量用量与时长，支持手动录入与批量导入"
        icon={<BarChart3 className="h-5 w-5" />}
        iconTone="blue"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              title={`重新拉取流量统计汇总与明细记录（${RANGE_LABEL[range]} · 上次刷新 ${formatTime(refreshedAt)}）`}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Import className="h-4 w-4" />
              导入
            </Button>
            <Button onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" />
              录入
            </Button>
          </>
        }
      />

      {/* 统计周期选择 */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
          统计周期：{RANGE_LABEL[range]}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 text-xs">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => changeRange(o.key)}
              disabled={refreshing}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                range === o.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 统计卡 */}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="统计记录" value={String(stats?.total.records ?? 0)} sub="条流量记录" icon={BarChart3} tone="teal" />
        <StatCard title="累计下载" value={formatBytes(stats?.total.bytesDown ?? 0)} sub="下行流量总量" icon={Download} tone="blue" />
        <StatCard title="累计上传" value={formatBytes(stats?.total.bytesUp ?? 0)} sub="上行流量总量" icon={Upload} tone="green" />
        <StatCard title="累计时长" value={formatDuration(stats?.total.durationSec ?? 0)} sub="上网时间合计" icon={Clock} tone="amber" />
      </div>

      {/* 图表区 */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-teal-400 to-teal-600" />
              按 IP 下载量排行（Top 10）
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {ipTop.length === 0 ? (
              <EmptyHint text="暂无数据，请先录入或导入流量记录" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ipTop} layout="vertical" margin={{ left: 10, right: 34, top: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gradIpBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#45B5B3" />
                      <stop offset="100%" stopColor="#0E7C7B" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148,163,184,0.22)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickFormatter={(v) => `${v}MB`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 10, fill: '#374151' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    formatter={(value: number) => [`${value} MB`, '下载量']}
                  />
                  <Bar
                    dataKey="mb"
                    radius={[0, 6, 6, 0]}
                    fill="url(#gradIpBar)"
                    animationDuration={700}
                    animationEasing="ease-out"
                    label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: (v: number) => `${v} MB` }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-600" />
              用途分类占比
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {catData.length === 0 ? (
              <EmptyHint text="暂无数据" />
            ) : (
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={3}
                      cornerRadius={6}
                      stroke="#ffffff"
                      strokeWidth={2}
                      animationDuration={800}
                      animationEasing="ease-out"
                    >
                      {catData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name) => [formatBytes(Number(value)), String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold leading-none tabular-nums">
                    {Math.round(catData.reduce((s, c) => s + c.value, 0) / 1024 / 1024)}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">MB 合计</div>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {catData.map((c) => (
                <span key={c.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600" />
              按日期流量趋势（MB）
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {dayData.length === 0 ? (
              <EmptyHint text="暂无数据" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dayData} margin={{ left: 6, right: 16, top: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0E7C7B" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0E7C7B" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D97706" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#D97706" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ stroke: 'rgba(148,163,184,0.35)', strokeDasharray: '4 4' }}
                    formatter={(value: number, name) => [`${value} MB`, name === 'download' ? '下载' : '上传']}
                  />
                  <Area
                    type="monotone"
                    dataKey="download"
                    stroke="#0E7C7B"
                    strokeWidth={2.5}
                    fill="url(#gradDown)"
                    animationDuration={700}
                    dot={{ r: 3, strokeWidth: 0, fill: '#0E7C7B' }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#0E7C7B' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="upload"
                    stroke="#D97706"
                    strokeWidth={2.5}
                    fill="url(#gradUp)"
                    animationDuration={700}
                    dot={{ r: 3, strokeWidth: 0, fill: '#D97706' }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#D97706' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 明细表 */}
      <Card className="mt-5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">流量明细（{filtered.length} 条）</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-44"
              placeholder="按 IP / MAC 筛选"
              value={filterIp}
              onChange={(e) => setFilterIp(e.target.value)}
            />
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="all">全部用途</option>
              {Object.entries(TRAFFIC_CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              暂无记录。点击「录入」手动添加，或「导入」批量导入 / 粘贴路由器快照。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">IP / MAC</th>
                    <th className="pb-2 pr-4 font-medium">用途</th>
                    <th className="pb-2 pr-4 font-medium">说明</th>
                    <th className="pb-2 pr-4 font-medium">下载</th>
                    <th className="pb-2 pr-4 font-medium">上传</th>
                    <th className="pb-2 pr-4 font-medium">时长</th>
                    <th className="pb-2 pr-4 font-medium">时间</th>
                    <th className="pb-2 pr-4 font-medium">来源</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="row-hover border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium tabular-nums">{r.ip}</div>
                        {r.mac && <div className="text-xs text-muted-foreground">{r.mac}</div>}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="secondary">{categoryLabel(r.category)}</Badge>
                        {r.owner && <div className="mt-0.5 text-xs text-muted-foreground">{r.owner}</div>}
                      </td>
                      <td className="max-w-40 truncate py-2.5 pr-4 text-muted-foreground">{r.label || '-'}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{formatBytes(r.bytesDown)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{formatBytes(r.bytesUp)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{formatDuration(r.durationSec)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">
                        {new Date(r.recordedAt).toLocaleString('zh-CN', { hour12: false })}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {r.source === 'manual' ? '手动' : r.source === 'snapshot' ? '快照' : '导入'}
                      </td>
                      <td className="py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeRecord(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TrafficRecordDialog
        key={recordOpen ? 'open' : 'closed'}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onSaved={() => void loadAll(rangeRef.current)}
      />
      <TrafficImportDialog
        key={importOpen ? 'open' : 'closed'}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void loadAll(rangeRef.current)}
      />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function formatTime(t: number): string {
  if (!t) return '—';
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
}

/** 统计周期类型 */
type TrafficRange = 'day' | 'week' | 'month' | 'all';

const RANGE_OPTIONS: { key: TrafficRange; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'all', label: '全部' },
];

const RANGE_LABEL: Record<TrafficRange, string> = {
  day: '近 24 小时',
  week: '近 7 天',
  month: '近 30 天',
  all: '全部时间',
};

/** 周期 → 起始时间戳（毫秒） */
function rangeCutoff(range: TrafficRange): number {
  if (range === 'all') return 0;
  const DAY = 24 * 3600 * 1000;
  return Date.now() - (range === 'day' ? DAY : range === 'week' ? 7 * DAY : 30 * DAY);
}

/** recharts tooltip 统一弹层样式 */
const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid hsl(215 16% 88%)',
  boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.16)',
  fontSize: 12,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.96)',
} as const;
