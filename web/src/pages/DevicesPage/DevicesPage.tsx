import { useMemo, useState } from 'react';
import { Check, Download, MessageSquare, Pencil, Plus, RefreshCw, Server, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { useData } from '@/data/data-context';
import { DEVICE_STATUS_META, DEVICE_TYPE_OPTIONS, type IXDevice } from '@/data/types';
import { formatRate, formatTraffic } from '@/data/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import DeviceDialog from './sections/DeviceDialog';
import ImportOwnerDialog from './sections/ImportOwnerDialog';
import MessageDialog from '@/components/MessageDialog';

function formatTime(t: number): string {
  if (!t) return '—';
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
}

export default function DevicesPage() {
  const { devices, ready, refresh, lastUpdated, refreshing, removeDevice, batchUpdateDevices } = useData();
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [editing, setEditing] = useState<IXDevice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // 批量编辑
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchType, setBatchType] = useState('');
  const [batchOwner, setBatchOwner] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  // 发消息
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgIps, setMsgIps] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return devices
      .filter((d) => {
        if (typeFilter !== '全部' && d.deviceType !== typeFilter) return false;
        if (!kw) return true;
        return (
          d.ip.toLowerCase().includes(kw) ||
          d.mac.toLowerCase().includes(kw) ||
          d.hostname.toLowerCase().includes(kw) ||
          d.owner.toLowerCase().includes(kw)
        );
      })
      .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  }, [devices, keyword, typeFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allChecked = filtered.length > 0 && filtered.every((d) => selectedIds.includes(d.id));
  const toggleSelectAll = () => {
    if (allChecked) {
      setSelectedIds((prev) => prev.filter((x) => !filtered.some((d) => d.id === x)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...filtered.map((d) => d.id)])]);
    }
  };

  const applyBatch = async () => {
    if (!selectedIds.length) return;
    const patch: Partial<IXDevice> = {};
    if (batchType) patch.deviceType = batchType;
    if (batchOwner.trim()) patch.owner = batchOwner.trim();
    if (!patch.deviceType && patch.owner === undefined) {
      toast.warning('请先选择要批量设置的设备类型或输入使用人');
      return;
    }
    setBatchBusy(true);
    const n = await batchUpdateDevices(selectedIds, patch);
    setBatchBusy(false);
    if (n > 0) {
      toast.success(`已批量更新 ${n} 台设备`);
      setSelectedIds([]);
      setBatchType('');
      setBatchOwner('');
    }
  };

  const exportCsv = () => {
    const header = 'IP地址,MAC地址,主机名,设备类型,使用人,状态,接收速率KB/s,发送速率KB/s,累计接收MB,豁免,备注';
    const rows = filtered.map((d) =>
      [d.ip, d.mac, d.hostname, d.deviceType, d.owner, DEVICE_STATUS_META[d.status].label, d.rxRate, d.txRate, d.rxTotal, d.exempt ? '是' : '否', d.note]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '内网设备台账.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${filtered.length} 条设备记录`);
  };

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center text-sm text-muted-foreground md:px-8">
        正在加载设备台账…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8">
      <PageHeader
        title="设备台账"
        description={`共 ${devices.length} 台设备 · 按 IP / MAC / 主机名 / 使用人搜索 · 可导入「IP → 使用人」映射`}
        icon={<Server className="h-5 w-5" />}
        iconTone="teal"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={refreshing}
              title={`重新从 NAS 拉取设备清单与最新在线状态（上次更新 ${formatTime(lastUpdated)}）`}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              导入使用人
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              导出 CSV
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              新增设备
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索 IP / MAC / 主机名 / 使用人…"
          className="w-full max-w-xs"
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="设备类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="全部">全部类型</SelectItem>
            {DEVICE_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">
            已选 <span className="text-primary">{selectedIds.length}</span> 台设备
          </span>
          <Select value={batchType} onValueChange={(v) => setBatchType(v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="批量设类型" />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={batchOwner}
            onChange={(e) => setBatchOwner(e.target.value)}
            placeholder="批量设使用人（可选）"
            className="w-44"
          />
          <Button size="sm" disabled={batchBusy} onClick={applyBatch}>
            <Check className="mr-1.5 h-4 w-4" />
            应用
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={batchBusy}
            onClick={() => {
              const ips = devices.filter((d) => selectedIds.includes(d.id)).map((d) => d.ip);
              setMsgIps(ips);
              setMsgOpen(true);
            }}
          >
            <MessageSquare className="mr-1.5 h-4 w-4" />
            给选中发消息（{selectedIds.length}）
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={batchBusy}
            onClick={() => {
              setSelectedIds([]);
              setBatchType('');
              setBatchOwner('');
            }}
          >
            <X className="mr-1.5 h-4 w-4" />
            取消选择
          </Button>
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-xl border border-border bg-card">
        <div className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleSelectAll}
                    aria-label="全选当前列表"
                    className="h-4 w-4 accent-primary"
                  />
                </TableHead>
                <TableHead className="whitespace-nowrap">状态</TableHead>
                <TableHead className="whitespace-nowrap">IP 地址</TableHead>
                <TableHead className="whitespace-nowrap">主机名 / 设备</TableHead>
                <TableHead className="whitespace-nowrap">MAC 地址</TableHead>
                <TableHead className="whitespace-nowrap">类型</TableHead>
                <TableHead className="whitespace-nowrap">使用人</TableHead>
                <TableHead className="whitespace-nowrap">↓ 接收</TableHead>
                <TableHead className="whitespace-nowrap">↑ 发送</TableHead>
                <TableHead className="whitespace-nowrap">累计下载</TableHead>
                <TableHead className="whitespace-nowrap">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const meta = DEVICE_STATUS_META[d.status];
                const checked = selectedIds.includes(d.id);
                return (
                  <TableRow key={d.id} className={`row-hover ${checked ? 'bg-primary/5' : ''}`}>
                    <TableCell className="w-10">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(d.id)}
                        aria-label={`选择 ${d.ip}`}
                        className="h-4 w-4 accent-primary"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
                        {d.exempt && (
                          <Badge variant="outline" className="gap-1 text-primary">
                            <ShieldCheck className="h-3 w-3" />
                            豁免
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-sm">{d.ip}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="block max-w-[200px] truncate text-sm">
                        {d.hostname || '—'}
                        {d.hostname && d.note ? ' · ' : ''}
                        {d.note ? <span className="text-muted-foreground">{d.note}</span> : null}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {d.mac || '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {d.deviceType || '未知'}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{d.owner || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {d.rxRate > 0 ? formatRate(d.rxRate) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {d.txRate > 0 ? formatRate(d.txRate) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {d.rxTotal > 0 ? formatTraffic(d.rxTotal) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setMsgIps([d.ip]);
                            setMsgOpen(true);
                          }}
                          aria-label={`给 ${d.ip} 发消息`}
                          title="发消息"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditing(d);
                            setDialogOpen(true);
                          }}
                          aria-label={`编辑 ${d.ip}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label={`删除 ${d.ip}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除设备 {d.ip}？</AlertDialogTitle>
                              <AlertDialogDescription>
                                {d.exempt
                                  ? '该设备为豁免设备，删除后其豁免保护将一并失效。'
                                  : '删除后将无法在此台账中管理该设备，此操作不可撤销。'}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => {
                                  removeDevice(d.id);
                                  toast.success(`已删除 ${d.ip}`);
                                }}
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                    没有匹配的设备，试试调整搜索条件或新增设备
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <DeviceDialog
        key={editing?.id ?? (dialogOpen ? 'new' : 'closed')}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
      <ImportOwnerDialog open={importOpen} onOpenChange={setImportOpen} />
      <MessageDialog open={msgOpen} onOpenChange={setMsgOpen} presetIps={msgIps} />
    </div>
  );
}
