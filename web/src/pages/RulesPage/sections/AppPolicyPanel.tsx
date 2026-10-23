import { useEffect, useMemo, useState } from 'react';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '@/data/data-context';
import { APP_CATEGORY_META, type IAppPolicy } from '@/data/types';
import { evaluatePolicy } from '@/data/schedule';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import AppPolicyDialog from './AppPolicyDialog';

function fmtWin(w: { start: string; end: string }) {
  return `${w.start}-${w.end}`;
}

export default function AppPolicyPanel() {
  const { appPolicies, devices, removePolicy, togglePolicy } = useData();
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<IAppPolicy | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const sorted = useMemo(
    () => [...appPolicies].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [appPolicies],
  );

  const verdicts = sorted.map((p) => ({ policy: p, verdict: evaluatePolicy(p, now) }));
  const restrictingCount = verdicts.filter((v) => v.verdict.restricted).length;
  const nowLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const deviceIpMap = useMemo(() => {
    const m: Record<string, string> = {};
    devices.forEach((d) => {
      m[d.ip] = d.hostname || d.owner || '';
    });
    return m;
  }, [devices]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
            restrictingCount > 0
              ? 'border-amber-500/40 bg-amber-50 text-amber-900'
              : 'border-emerald-500/40 bg-emerald-50 text-emerald-900'
          }`}
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <span className="font-medium">
              当前 {nowLabel}：{restrictingCount > 0 ? `有 ${restrictingCount} 条策略处于限制中` : '全部策略处于放开状态'}
            </span>
            <div className="mt-0.5 text-xs opacity-80">
              {verdicts.length === 0
                ? '尚未配置策略，先点右上角「新增策略」'
                : verdicts
                    .filter((v) => v.policy.enabled)
                    .map((v) => `「${v.policy.name}」${v.verdict.reason}`)
                    .join('；') || '所有策略未启用'}
            </div>
          </div>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          新增策略
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            没有应用限制策略。为占用带宽的设备配置「下载 / 游戏 / 在线视频」限制，并绑定工作时间段。
          </p>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            新增第一条策略
          </Button>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-border bg-card">
          <div className="min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">策略名</TableHead>
                  <TableHead className="whitespace-nowrap">限制应用</TableHead>
                  <TableHead className="whitespace-nowrap">目标</TableHead>
                  <TableHead className="whitespace-nowrap">工作时间（限制）</TableHead>
                  <TableHead className="whitespace-nowrap">放开时段</TableHead>
                  <TableHead className="whitespace-nowrap">当前判定</TableHead>
                  <TableHead className="whitespace-nowrap">启用</TableHead>
                  <TableHead className="whitespace-nowrap">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((p) => {
                  const v = evaluatePolicy(p, now);
                  const targetLabel =
                    p.targets === 'all'
                      ? '全部设备'
                      : p.targets.length <= 3
                        ? p.targets.map((ip) => `${ip}${deviceIpMap[ip] ? `（${deviceIpMap[ip]}）` : ''}`).join('、')
                        : `${p.targets.length} 台指定设备`;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-sm font-medium">
                        {p.name}
                        {p.note && <div className="text-xs font-normal text-muted-foreground">{p.note}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex flex-wrap gap-1">
                          {p.apps.map((a) => (
                            <Badge key={a} variant="outline">
                              {APP_CATEGORY_META[a].label}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{targetLabel}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {p.workWindows.map((w) => fmtWin(w)).join('、')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className="block max-w-[220px]">
                          午休 {fmtWin(p.lunch)}
                          {p.freeWeekends && ' · 周末'}
                          {p.freeHolidays && ` · 节假日${p.holidays.length > 0 ? `（${p.holidays.length} 天）` : ''}`}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={v.restricted ? 'destructive' : 'default'}>
                          {v.restricted ? `限制中 · ${v.reason}` : `放开 · ${v.reason}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Switch
                          checked={p.enabled}
                          onCheckedChange={() => togglePolicy(p.id)}
                          aria-label={`启用策略 ${p.name}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditing(p);
                              setDialogOpen(true);
                            }}
                            aria-label={`编辑策略 ${p.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                aria-label={`删除策略 ${p.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除策略「{p.name}」？</AlertDialogTitle>
                                <AlertDialogDescription>删除后该策略不再生效。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => {
                                    removePolicy(p.id);
                                    toast.success(`已删除策略「${p.name}」`);
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
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <AppPolicyDialog
        key={editing?.id ?? (dialogOpen ? 'new' : 'closed')}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}
