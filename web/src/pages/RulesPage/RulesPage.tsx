import { useMemo, useState } from 'react';
import { Download, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useData } from '@/data/data-context';
import { formatRate } from '@/data/format';
import { APP_CATEGORY_META, type IXRule } from '@/data/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { toast } from 'sonner';
import RuleDialog from './sections/RuleDialog';
import AppPolicyPanel from './sections/AppPolicyPanel';

function fmtWin(w: { start: string; end: string }) {
  return `${w.start}-${w.end}`;
}

export default function RulesPage() {
  const { rules, devices, appPolicies, removeRule, toggleRule } = useData();
  const [editing, setEditing] = useState<IXRule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const exemptDevices = devices.filter((d) => d.exempt);
  const sorted = useMemo(
    () => [...rules].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true })),
    [rules],
  );

  const exportGuide = () => {
    const lines = [
      'TL-R483G 行为管控操作指引',
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      '========================================',
      '前置：浏览器登录 http://192.168.102.1/webpages/index.html',
      '',
      '一、带宽控制（按 IP 限速）',
      '1. 行为管控 → 地址管理 → 新增地址组（如「限速组」），填入需要限速的 IP 或网段',
      '2. 行为管控 → 带宽控制 → 勾选「启用 IP 带宽控制」并保存',
      '3. 在规则列表点击「新增」，按以下参数为每台设备配置带宽：',
      '',
    ];
    const active = rules.filter((r) => r.enabled);
    if (active.length === 0) {
      lines.push('（当前没有已启用的限速规则）');
    } else {
      active.forEach((r) => {
        lines.push(
          `   - ${r.ip}${r.label ? `（${r.label}）` : ''}：最大上行 ${r.maxUp} KB/s，最大下行 ${r.maxDown} KB/s${r.note ? `；备注：${r.note}` : ''}`,
        );
      });
    }

    lines.push('', '二、应用限制（下载 / 游戏 / 在线视频）');
    const activePolicies = appPolicies.filter((p) => p.enabled);
    if (activePolicies.length === 0) {
      lines.push('（当前没有已启用的应用策略）');
    } else {
      lines.push(
        '1. 行为管控 → 时间管理 → 新增时间段（可按「工作时间 / 午休」分开建，或直接建一整段工作时间）',
        '2. 行为管控 → 应用控制 → 新增规则：选择目标设备（或全网）→ 选择应用类型 → 绑定时间段',
        '3. 周末与节假日不创建限制规则（即放开）。逐条策略如下：',
        '',
      );
      activePolicies.forEach((p) => {
        const targets = p.targets === 'all' ? '全部设备' : p.targets.join('、');
        const apps = p.apps.map((a) => APP_CATEGORY_META[a].label).join('、');
        lines.push(
          `   - 策略「${p.name}」：目标 ${targets}；限制 ${apps}`,
          `       工作时间（限制）：${p.workWindows.map(fmtWin).join('、')}`,
          `       放开：午休 ${fmtWin(p.lunch)}${p.freeWeekends ? '、周末' : ''}${p.freeHolidays ? `、节假日${p.holidays.length > 0 ? `（${p.holidays.join('、')}）` : ''}` : ''}`,
        );
      });
    }

    lines.push('', '4. 保存后，在「高级功能 → IP 流量统计」刷新观察效果');
    if (exemptDevices.length > 0) {
      lines.push('', `豁免保护：${exemptDevices.map((d) => d.ip).join('、')} 不参与限速/封禁。`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TL-R483G行为管控操作指引.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('操作指引已导出为 TXT');
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8">
      <PageHeader
        title="行为管控"
        description="带宽控制：按 IP 设置上行 / 下行上限；应用限制：按「下载 / 游戏 / 在线视频」+ 时间段管控"
        icon={<SlidersHorizontal className="h-5 w-5" />}
        iconTone="amber"
        actions={
          <Button variant="outline" onClick={exportGuide}>
            <Download className="mr-1.5 h-4 w-4" />
            导出路由器操作指引
          </Button>
        }
      />

      {exemptDevices.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <span className="font-medium text-foreground">豁免保护：</span>
            <span className="text-muted-foreground">
              {exemptDevices.map((d) => `${d.ip}${d.hostname ? `（${d.hostname}）` : ''}`).join('、')}
              ——不会出现在可限速 / 可管控设备列表中。
            </span>
          </div>
        </div>
      )}

      <Tabs defaultValue="bandwidth">
        <TabsList className="mb-4">
          <TabsTrigger value="bandwidth">带宽控制</TabsTrigger>
          <TabsTrigger value="apps">应用限制</TabsTrigger>
        </TabsList>

        <TabsContent value="bandwidth" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              新增规则
            </Button>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                还没有限速规则。先到「设备台账」确认设备，再在这里为占用带宽的设备设置上限。
              </p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                新增第一条规则
              </Button>
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-border bg-card">
              <div className="min-w-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">IP 地址</TableHead>
                      <TableHead className="whitespace-nowrap">规则名</TableHead>
                      <TableHead className="whitespace-nowrap">最大上行</TableHead>
                      <TableHead className="whitespace-nowrap">最大下行</TableHead>
                      <TableHead className="whitespace-nowrap">启用</TableHead>
                      <TableHead className="whitespace-nowrap">备注</TableHead>
                      <TableHead className="whitespace-nowrap">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => (
                      <TableRow key={r.id} className="row-hover">
                        <TableCell className="whitespace-nowrap font-mono text-sm">{r.ip}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{r.label || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatRate(r.maxUp)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatRate(r.maxDown)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={r.enabled}
                              onCheckedChange={() => toggleRule(r.id)}
                              aria-label={`启用规则 ${r.ip}`}
                            />
                            <Badge variant={r.enabled ? 'default' : 'outline'}>{r.enabled ? '已启用' : '停用'}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="block max-w-[220px] truncate text-sm text-muted-foreground">
                            {r.note || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditing(r);
                                setDialogOpen(true);
                              }}
                              aria-label={`编辑规则 ${r.ip}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  aria-label={`删除规则 ${r.ip}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>删除规则 {r.ip}？</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    删除后该设备将恢复为「在线」状态（不再限速）。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      removeRule(r.id);
                                      toast.success(`已删除规则 ${r.ip}`);
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="apps">
          <AppPolicyPanel />
        </TabsContent>
      </Tabs>

      <RuleDialog
        key={editing?.id ?? (dialogOpen ? 'new' : 'closed')}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}
