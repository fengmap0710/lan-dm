import { useState, type FormEvent } from 'react';
import { useData } from '@/data/data-context';
import { api, TRAFFIC_CATEGORY_META, type TrafficCategory } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { fromLocalInput } from '../traffic-utils';

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrafficRecordDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { devices } = useData();
  const [ip, setIp] = useState('');
  const [mac, setMac] = useState('');
  const [category, setCategory] = useState<TrafficCategory>('other');
  const [label, setLabel] = useState('');
  const [downMb, setDownMb] = useState('');
  const [upMb, setUpMb] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [recordedAt, setRecordedAt] = useState(nowLocal());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const deviceIps = devices.map((d) => d.ip).filter(Boolean).slice(0, 20);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const ipv = ip.trim();
    if (!ipv) {
      setError('请输入 IP 地址');
      return;
    }
    const down = parseFloat(downMb) || 0;
    const up = parseFloat(upMb) || 0;
    const durMin = parseFloat(durationMin) || 0;
    if (down <= 0 && up <= 0 && durMin <= 0) {
      setError('请至少填写下载量、上传量或时长之一');
      return;
    }
    setSaving(true);
    try {
      await api.traffic.create({
        ip: ipv,
        mac: mac.trim() || undefined,
        category,
        label: label.trim() || undefined,
        bytesDown: Math.round(down * 1024 * 1024),
        bytesUp: Math.round(up * 1024 * 1024),
        durationSec: Math.round(durMin * 60),
        recordedAt: fromLocalInput(recordedAt),
        source: 'manual',
      });
      toast.success(`已录入 ${ipv} 的流量记录`);
      setIp('');
      setMac('');
      setLabel('');
      setDownMb('');
      setUpMb('');
      setDurationMin('');
      setRecordedAt(nowLocal());
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>录入流量记录</DialogTitle>
          <DialogDescription>手动记录某个 IP 的流量用量与上网时长</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>IP 地址 *</Label>
              <Input list="traffic-ips" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.102.x" />
              <datalist id="traffic-ips">
                {deviceIps.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>MAC（可选）</Label>
              <Input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>用途分类</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as TrafficCategory)}
              >
                {Object.entries(TRAFFIC_CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>用途说明（可选）</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如：下载大文件" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>下载量（MB）</Label>
              <Input type="number" min={0} value={downMb} onChange={(e) => setDownMb(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>上传量（MB）</Label>
              <Input type="number" min={0} value={upMb} onChange={(e) => setUpMb(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>时长（分钟）</Label>
              <Input type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>记录时间</Label>
            <Input type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              保存记录
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
