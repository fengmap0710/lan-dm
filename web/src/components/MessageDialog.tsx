import { useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useData } from '@/data/data-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface IMessageItem {
  id: string;
  content: string;
  mode: 'all' | 'custom';
  targets: string[];
  status: string;
  results?: Array<{ ip: string; ok: boolean; error?: string }>;
  createdAt?: string;
  createdBy?: string;
}

export default function MessageDialog({
  open,
  onOpenChange,
  presetIps = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetIps?: string[];
}) {
  const { devices } = useData();
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'all' | 'custom'>('all');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<IMessageItem[]>([]);

  const onlinePcs = devices.filter(
    (d) =>
      d.status === 'online' &&
      !d.exempt &&
      (d.deviceType === '笔记本' || d.deviceType === '台式机' || /DESKTOP|PC|ADMIN|NOTEBOOK|LAPTOP/i.test(d.hostname || '')),
  );
  const targetCount = mode === 'all' ? onlinePcs.length : presetIps.length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) setContent('');
      if (!cancelled) setMode(presetIps.length ? 'custom' : 'all');
      try {
        const r = await api.messages.list();
        if (!cancelled) setHistory((r.items as IMessageItem[]) || []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, presetIps]);

  const send = async () => {
    if (!content.trim()) {
      toast.warning('请输入消息内容');
      return;
    }
    setSending(true);
    try {
      await api.messages.send({
        content: content.trim(),
        mode,
        ips: mode === 'custom' ? presetIps : undefined,
      });
      toast.success('消息已下发，采集器将在 30 秒内发送到目标电脑');
      setContent('');
      const r = await api.messages.list();
      setHistory((r.items as IMessageItem[]) || []);
    } catch (e) {
      toast.error((e as Error).message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  const statusMeta: Record<string, { label: string; cls: string }> = {
    pending: { label: '待发送', cls: 'bg-amber-100 text-amber-700' },
    delivering: { label: '发送中', cls: 'bg-blue-100 text-blue-700' },
    done: { label: '已完成', cls: 'bg-green-100 text-green-700' },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            给内网电脑发消息
          </DialogTitle>
          <DialogDescription>
            通过采集器（Windows 本机）向目标电脑弹窗。msg 方式受目标机设置影响，不一定 100% 送达。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 模式选择 */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('all')}
            >
              群发全部在线电脑（{onlinePcs.length} 台）
            </Button>
            <Button
              type="button"
              variant={mode === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('custom')}
              disabled={!presetIps.length}
            >
              发给指定设备（{presetIps.length} 台）
            </Button>
          </div>
          {mode === 'custom' && presetIps.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presetIps.map((ip) => (
                <Badge key={ip} variant="outline" className="font-mono text-xs">
                  {ip}
                </Badge>
              ))}
            </div>
          )}

          {/* 内容 */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="输入要发送的消息内容…"
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />

          {/* 历史 */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">发送历史（最近 20 条）</div>
            {history.length === 0 ? (
              <div className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
                暂无发送记录
              </div>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {history.map((m) => {
                  const meta = statusMeta[m.status] || { label: m.status, cls: 'bg-muted' };
                  const okN = (m.results || []).filter((r) => r.ok).length;
                  return (
                    <div key={m.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{m.content}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                          {meta.label}
                          {m.status === 'done' ? ` ${okN}/${m.targets.length}` : ''}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {m.mode === 'all' ? '群发' : '指定'} · {m.targets.length} 台 ·{' '}
                        {m.createdBy || 'admin'} · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                      </div>
                      {m.results && m.results.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.results.slice(0, 12).map((r) => (
                            <span
                              key={r.ip}
                              className={`rounded px-1 py-0.5 font-mono ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}
                            >
                              {r.ip}
                              {r.ok ? '✓' : '✗'}
                            </span>
                          ))}
                          {m.results.length > 12 && <span className="text-muted-foreground">…</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={send} disabled={sending || targetCount === 0}>
            <Send className="mr-1.5 h-4 w-4" />
            发送（{targetCount} 台）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
