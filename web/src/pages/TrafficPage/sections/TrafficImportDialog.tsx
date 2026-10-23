import { useRef, useState } from 'react';
import { FileUp, Router, ClipboardPaste } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { parseCsvText, parseSnapshotText } from '../traffic-utils';

export default function TrafficImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'csv' | 'snapshot'>('csv');
  const [snapshotText, setSnapshotText] = useState('');
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [parsedItems, setParsedItems] = useState<Array<Record<string, unknown>>>([]);
  const [importing, setImporting] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const items = parseCsvText(String(reader.result || ''));
      setParsedItems(items);
      setParsedCount(items.length);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSnapshot = () => {
    const items = parseSnapshotText(snapshotText);
    setParsedItems(items);
    setParsedCount(items.length);
  };

  const doImport = async () => {
    if (parsedItems.length === 0) {
      toast.error('未解析到有效记录');
      return;
    }
    setImporting(true);
    try {
      const res = await api.traffic.importItems(parsedItems);
      toast.success(`成功导入 ${res.added} 条流量记录`);
      setParsedItems([]);
      setParsedCount(null);
      setSnapshotText('');
      onOpenChange(false);
      onImported();
    } catch (e) {
      toast.error((e as Error).message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setTab('csv');
    setSnapshotText('');
    setParsedCount(null);
    setParsedItems([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>批量导入流量记录</DialogTitle>
          <DialogDescription>
            支持 CSV 文件导入，或直接粘贴路由器 IP 流量统计页面的数据
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex gap-2">
          <Button
            type="button"
            variant={tab === 'csv' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('csv')}
          >
            <FileUp className="h-3.5 w-3.5" />
            CSV 文件
          </Button>
          <Button
            type="button"
            variant={tab === 'snapshot' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('snapshot')}
          >
            <Router className="h-3.5 w-3.5" />
            路由器快照
          </Button>
        </div>

        {tab === 'csv' ? (
          <div className="grid gap-3">
            <div className="rounded-lg border border-dashed p-4 text-center">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <FileUp className="h-6 w-6" />
                点击选择 CSV 文件（.csv / .txt，UTF-8）
              </button>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              表头支持：ip, mac, owner, category, label, bytesDown, bytesUp, durationSec(分钟), recordedAt
              <br />
              或中文别名：IP地址 / 使用人 / 用途 / 下载量(MB) / 上传量(MB) / 时长(分钟) / 时间
              <br />
              用途取值：office（办公）/ download（下载）/ video（在线视频）/ game（游戏）/ other（其他）
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <Textarea
              rows={7}
              value={snapshotText}
              onChange={(e) => setSnapshotText(e.target.value)}
              placeholder={
                '粘贴路由器「IP流量统计」页面数据，每行一设备：\nIP\t名称\t下载(MB)\t上传(MB)\n192.168.102.10\tPC-1\t5230\t680\n192.168.102.20\tPhone-2\t1820\t240'
              }
            />
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ClipboardPaste className="h-3.5 w-3.5" />
                制表符或逗号分隔均可；名称将作为用途说明
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleSnapshot}>
                解析
              </Button>
            </div>
          </div>
        )}

        {parsedCount !== null && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <span>
              已解析 <b className="text-foreground">{parsedCount}</b> 条记录
            </span>
            <Button type="button" size="sm" onClick={doImport} disabled={importing || parsedCount === 0}>
              {importing ? '导入中…' : `导入 ${parsedCount} 条`}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
