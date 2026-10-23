import { useState } from 'react';
import { useData } from '@/data/data-context';
import { type IXRule } from '@/data/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface IFormState {
  ip: string;
  label: string;
  maxUp: string;
  maxDown: string;
  note: string;
}

export default function RuleDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: IXRule | null;
}) {
  const { devices, addRule, updateRule } = useData();
  const [form, setForm] = useState<IFormState>(() =>
    editing
      ? {
          ip: editing.ip,
          label: editing.label,
          maxUp: String(editing.maxUp),
          maxDown: String(editing.maxDown),
          note: editing.note,
        }
      : { ip: '', label: '', maxUp: '512', maxDown: '2048', note: '' },
  );
  const [error, setError] = useState('');

  // 可选限速的 IP：排除豁免设备
  const selectable = devices
    .filter((d) => !d.exempt)
    .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));

  const set = (patch: Partial<IFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    const ip = form.ip.trim();
    if (!ip) {
      setError('请选择要限速的 IP');
      return;
    }
    const maxUp = Number(form.maxUp);
    const maxDown = Number(form.maxDown);
    if (!Number.isFinite(maxUp) || maxUp < 0) {
      setError('最大上行需为非负数字');
      return;
    }
    if (!Number.isFinite(maxDown) || maxDown <= 0) {
      setError('最大下行需为大于 0 的数字');
      return;
    }
    if (editing) {
      updateRule(editing.id, {
        ip,
        label: form.label.trim(),
        maxUp,
        maxDown,
        note: form.note.trim(),
      });
      toast.success(`已更新规则 ${ip}`);
    } else {
      addRule({
        id: `r-${Date.now()}`,
        ip,
        label: form.label.trim(),
        maxUp,
        maxDown,
        enabled: true,
        note: form.note.trim(),
      });
      toast.success(`已新增规则 ${ip}，并已启用`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑规则 ${editing.ip}` : '新增限速规则'}</DialogTitle>
          <DialogDescription>
            为该 IP 设置带宽上限（单位 KB/s）。启用后设备在台账中自动标记为「限速」。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-ip">限速 IP *</Label>
            <Select value={form.ip} onValueChange={(v) => set({ ip: v })}>
              <SelectTrigger id="r-ip">
                <SelectValue placeholder="从非豁免设备中选择" />
              </SelectTrigger>
              <SelectContent>
                {selectable.map((d) => (
                  <SelectItem key={d.id} value={d.ip}>
                    <span className="font-mono">{d.ip}</span>
                    {d.hostname || d.owner ? `（${d.hostname || d.owner}）` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectable.length === 0 && (
              <p className="text-xs text-muted-foreground">
                没有可限速的设备，请先在「设备台账」中新增设备
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-label">规则名（可选）</Label>
            <Input
              id="r-label"
              value={form.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="如：宿舍无线 / 会议室终端"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-up">最大上行（KB/s）</Label>
              <Input
                id="r-up"
                type="number"
                min={0}
                value={form.maxUp}
                onChange={(e) => set({ maxUp: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-down">最大下行（KB/s）</Label>
              <Input
                id="r-down"
                type="number"
                min={1}
                value={form.maxDown}
                onChange={(e) => set({ maxDown: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            参考：2048 KB/s ≈ 16 Mbps 带宽；512 KB/s ≈ 4 Mbps
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="r-note">备注（可选）</Label>
            <Input
              id="r-note"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="如：9 分钟下载 291MB 的大户"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit}>{editing ? '保存修改' : '新增并启用'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
