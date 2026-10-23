import { useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import { useData } from '@/data/data-context';
import { APP_CATEGORY_META, type AppCategory, type IAppPolicy, type ITimeWindow } from '@/data/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface IFormState {
  name: string;
  targetMode: 'all' | 'list';
  targetIps: string[];
  apps: AppCategory[];
  workWindows: [ITimeWindow, ITimeWindow];
  lunch: ITimeWindow;
  freeWeekends: boolean;
  freeHolidays: boolean;
  holidays: string[];
  enabled: boolean;
  note: string;
}

const DEFAULT_FORM: IFormState = {
  name: '',
  targetMode: 'all',
  targetIps: [],
  apps: ['download'],
  workWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  lunch: { start: '12:00', end: '14:00' },
  freeWeekends: true,
  freeHolidays: true,
  holidays: [],
  enabled: true,
  note: '',
};

const APP_OPTIONS: AppCategory[] = ['download', 'game', 'video'];

function fromPolicy(p: IAppPolicy): IFormState {
  return {
    name: p.name,
    targetMode: p.targets === 'all' ? 'all' : 'list',
    targetIps: p.targets === 'all' ? [] : p.targets,
    apps: [...p.apps],
    workWindows: [
      p.workWindows[0] || { start: '09:00', end: '12:00' },
      p.workWindows[1] || { start: '14:00', end: '18:00' },
    ],
    lunch: p.lunch,
    freeWeekends: p.freeWeekends,
    freeHolidays: p.freeHolidays,
    holidays: [...p.holidays],
    enabled: p.enabled,
    note: p.note,
  };
}

export default function AppPolicyDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: IAppPolicy | null;
}) {
  const { devices, addPolicy, updatePolicy } = useData();
  const [form, setForm] = useState<IFormState>(() => (editing ? fromPolicy(editing) : DEFAULT_FORM));
  const [error, setError] = useState('');
  const [holidayInput, setHolidayInput] = useState('');

  const selectable = devices
    .filter((d) => !d.exempt)
    .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));

  const set = (patch: Partial<IFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleApp = (app: AppCategory) =>
    set({
      apps: form.apps.includes(app) ? form.apps.filter((a) => a !== app) : [...form.apps, app],
    });

  const toggleIp = (ip: string) =>
    set({
      targetIps: form.targetIps.includes(ip)
        ? form.targetIps.filter((i) => i !== ip)
        : [...form.targetIps, ip],
    });

  const addHoliday = () => {
    if (!holidayInput) return;
    if (!form.holidays.includes(holidayInput)) {
      set({ holidays: [...form.holidays, holidayInput] });
    }
    setHolidayInput('');
  };

  const removeHoliday = (d: string) => set({ holidays: form.holidays.filter((h) => h !== d) });

  const submit = () => {
    const name = form.name.trim();
    if (!name) {
      setError('请填写策略名称');
      return;
    }
    if (form.apps.length === 0) {
      setError('请至少选择一类应用（下载 / 游戏 / 在线视频）');
      return;
    }
    if (form.targetMode === 'list' && form.targetIps.length === 0) {
      setError('请至少选择一台目标设备，或改为「全部设备」');
      return;
    }
    for (const w of [...form.workWindows, form.lunch]) {
      if (w.start >= w.end) {
        setError(`时间段不合法：${w.start}-${w.end}（开始需早于结束）`);
        return;
      }
    }
    const payload: IAppPolicy = {
      id: editing?.id ?? `p-${Date.now()}`,
      name,
      targets: form.targetMode === 'all' ? 'all' : [...form.targetIps],
      apps: [...form.apps],
      workWindows: [...form.workWindows],
      lunch: { ...form.lunch },
      freeWeekends: form.freeWeekends,
      freeHolidays: form.freeHolidays,
      holidays: [...form.holidays],
      enabled: form.enabled,
      note: form.note.trim(),
    };
    if (editing) {
      updatePolicy(editing.id, payload);
      toast.success(`已更新策略「${name}」`);
    } else {
      addPolicy(payload);
      toast.success(`已新增策略「${name}」`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑策略「${editing.name}」` : '新增应用限制策略'}</DialogTitle>
          <DialogDescription>
            在指定时间段内，对目标设备限制「下载 / 游戏 / 在线视频」；午休、周末、节假日自动放开。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-name">策略名称 *</Label>
            <Input
              id="ap-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="如：办公时段限下载 / 上班禁游戏"
            />
          </div>

          <div className="space-y-2">
            <Label>限制的应用 *</Label>
            <div className="flex flex-wrap gap-2">
              {APP_OPTIONS.map((a) => (
                <Badge
                  key={a}
                  variant={form.apps.includes(a) ? 'default' : 'outline'}
                  className={`cursor-pointer select-none px-3 py-1.5 text-sm ${form.apps.includes(a) ? '' : 'text-muted-foreground'}`}
                  onClick={() => toggleApp(a)}
                >
                  {APP_CATEGORY_META[a].label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>目标设备</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.targetMode === 'all'}
                  onChange={() => set({ targetMode: 'all', targetIps: [] })}
                />
                全部设备
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.targetMode === 'list'}
                  onChange={() => set({ targetMode: 'list' })}
                />
                指定设备
              </label>
            </div>
            {form.targetMode === 'list' && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border p-2">
                {selectable.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">没有可选择的设备</p>
                ) : (
                  selectable.map((d) => (
                    <label
                      key={d.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${form.targetIps.includes(d.ip) ? 'bg-primary/5' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.targetIps.includes(d.ip)}
                        onChange={() => toggleIp(d.ip)}
                      />
                      <span className="font-mono">{d.ip}</span>
                      <span className="text-muted-foreground">{d.hostname || d.owner || ''}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>工作时间（限制生效）</Label>
            <div className="grid grid-cols-2 gap-3">
              {form.workWindows.map((w, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
                  <span className="text-xs text-muted-foreground">{i === 0 ? '上午' : '下午'}</span>
                  <Input
                    type="time"
                    className="h-8 w-[86px] px-1 text-xs"
                    value={w.start}
                    onChange={(e) => {
                      const next = [...form.workWindows] as [ITimeWindow, ITimeWindow];
                      next[i] = { ...next[i], start: e.target.value };
                      set({ workWindows: next });
                    }}
                  />
                  <span className="text-xs text-muted-foreground">至</span>
                  <Input
                    type="time"
                    className="h-8 w-[86px] px-1 text-xs"
                    value={w.end}
                    onChange={(e) => {
                      const next = [...form.workWindows] as [ITimeWindow, ITimeWindow];
                      next[i] = { ...next[i], end: e.target.value };
                      set({ workWindows: next });
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              默认 09:00-12:00 与 14:00-18:00，其余时段（午休、晚间、周末、节假日）自动放开
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>午休放开（默认 12:00-14:00）</Label>
            <div className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
              <Input
                type="time"
                className="h-8 w-[100px] px-1 text-xs"
                value={form.lunch.start}
                onChange={(e) => set({ lunch: { ...form.lunch, start: e.target.value } })}
              />
              <span className="text-xs text-muted-foreground">至</span>
              <Input
                type="time"
                className="h-8 w-[100px] px-1 text-xs"
                value={form.lunch.end}
                onChange={(e) => set({ lunch: { ...form.lunch, end: e.target.value } })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-sm">周末放开</div>
                <div className="text-xs text-muted-foreground">周六、周日不执行限制</div>
              </div>
              <Switch
                checked={form.freeWeekends}
                onCheckedChange={(v) => set({ freeWeekends: v === true })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-sm">节假日放开</div>
                <div className="text-xs text-muted-foreground">按下方日期列表判断，可手动添加法定节假日</div>
              </div>
              <Switch
                checked={form.freeHolidays}
                onCheckedChange={(v) => set({ freeHolidays: v === true })}
              />
            </div>
            {form.freeHolidays && (
              <div className="space-y-2 rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={holidayInput}
                    onChange={(e) => setHolidayInput(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={addHoliday}>
                    <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
                {form.holidays.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.holidays.map((h) => (
                      <Badge key={h} variant="secondary" className="gap-1 font-mono">
                        {h}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => removeHoliday(h)}
                          aria-label={`移除 ${h}`}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  建议把全年法定节假日加入；未添加的日期按工作日规则执行
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm">立即启用</div>
              <div className="text-xs text-muted-foreground">保存后策略立即按当前时段判定</div>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set({ enabled: v === true })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-note">备注（可选）</Label>
            <Input
              id="ap-note"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="如：针对办公区无线，防止工作时间刷视频"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit}>{editing ? '保存修改' : '新增策略'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
