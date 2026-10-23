import { useState } from 'react';
import { useData } from '@/data/data-context';
import { DEVICE_STATUS_META, DEVICE_TYPE_OPTIONS, type IXDevice } from '@/data/types';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const STATUS_OPTIONS = (Object.keys(DEVICE_STATUS_META) as Array<keyof typeof DEVICE_STATUS_META>).map(
  (key) => ({ value: key, label: DEVICE_STATUS_META[key].label }),
);

interface IFormState {
  ip: string;
  mac: string;
  hostname: string;
  deviceType: string;
  owner: string;
  status: string;
  exempt: boolean;
  note: string;
}

const EMPTY_FORM: IFormState = {
  ip: '',
  mac: '',
  hostname: '',
  deviceType: '其他',
  owner: '',
  status: 'online',
  exempt: false,
  note: '',
};

export default function DeviceDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: IXDevice | null;
}) {
  const { devices, addDevice, updateDevice } = useData();
  const [form, setForm] = useState<IFormState>(() =>
    editing
      ? {
          ip: editing.ip,
          mac: editing.mac,
          hostname: editing.hostname,
          deviceType: editing.deviceType,
          owner: editing.owner,
          status: editing.status,
          exempt: editing.exempt,
          note: editing.note,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState('');

  const set = (patch: Partial<IFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    const ip = form.ip.trim();
    if (!ip) {
      setError('IP 地址不能为空');
      return;
    }
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      setError('IP 地址格式不正确');
      return;
    }
    const duplicate = devices.some((d) => d.ip === ip && d.id !== (editing?.id ?? ''));
    if (duplicate) {
      setError('该 IP 已存在于台账中');
      return;
    }
    const payload = {
      ip,
      mac: form.mac.trim(),
      hostname: form.hostname.trim(),
      deviceType: form.deviceType,
      owner: form.owner.trim(),
      status: form.status as IXDevice['status'],
      exempt: form.exempt,
      note: form.note.trim(),
    };
    if (editing) {
      updateDevice(editing.id, payload);
      toast.success(`已更新设备 ${ip}`);
    } else {
      addDevice({
        id: `d-${Date.now()}`,
        ...payload,
        rxRate: 0,
        txRate: 0,
        rxTotal: 0,
        txTotal: 0,
      });
      toast.success(`已新增设备 ${ip}`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑设备 ${editing.ip}` : '新增设备'}</DialogTitle>
          <DialogDescription>
            {editing ? '修改该设备的台账信息' : '手工登记一台内网设备（通常从路由器 DHCP 客户端列表采集）'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-ip">IP 地址 *</Label>
              <Input
                id="d-ip"
                value={form.ip}
                onChange={(e) => set({ ip: e.target.value })}
                placeholder="192.168.102.x"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-type">设备类型</Label>
              <Select value={form.deviceType} onValueChange={(v) => set({ deviceType: v })}>
                <SelectTrigger id="d-type">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-mac">MAC 地址</Label>
              <Input
                id="d-mac"
                value={form.mac}
                onChange={(e) => set({ mac: e.target.value })}
                placeholder="AA-BB-CC-DD-EE-FF"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-owner">使用人</Label>
              <Input
                id="d-owner"
                value={form.owner}
                onChange={(e) => set({ owner: e.target.value })}
                placeholder="姓名 / 工位"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-host">主机名</Label>
              <Input
                id="d-host"
                value={form.hostname}
                onChange={(e) => set({ hostname: e.target.value })}
                placeholder="设备主机名"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-status">状态</Label>
              <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger id="d-status">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-note">备注</Label>
            <Input
              id="d-note"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="如：累计下载较高、建议限速等"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.exempt} onCheckedChange={(v) => set({ exempt: v === true })} />
            <span>豁免保护（NAS / 服务器等，永不参与限速与封禁）</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit}>{editing ? '保存修改' : '新增设备'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
