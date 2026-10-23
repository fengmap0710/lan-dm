import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { useData } from '@/data/data-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileUp, Info } from 'lucide-react';

interface IImportRow {
  ip: string;
  owner: string;
}

export default function ImportOwnerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { devices, importOwners } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<IImportRow[]>([]);
  const [fileName, setFileName] = useState('');

  const handleFile = (file: File) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const parsed: IImportRow[] = [];
        result.data.forEach((row) => {
          const ip = (row[0] || '').trim();
          const owner = (row[1] || '').trim();
          if (ip && owner) parsed.push({ ip, owner });
        });
        setRows(parsed);
        setFileName(file.name);
      },
    });
  };

  const matched = rows.filter((r) => devices.some((d) => d.ip === r.ip)).length;
  const unknownCount = rows.length - matched;

  const doImport = () => {
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.ip] = r.owner;
    });
    const n = importOwners(map);
    toast.success(`已为 ${n} 台设备写入使用人${unknownCount > 0 ? `，另有 ${unknownCount} 个 IP 不在台账中已跳过` : ''}`);
    setRows([]);
    setFileName('');
    onOpenChange(false);
  };

  const reset = () => {
    setRows([]);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导入「IP → 使用人」映射</DialogTitle>
          <DialogDescription>
            选择一张 CSV 或 TXT 文件：<b>第一列是 IP 地址，第二列是对应的使用人</b>。文件每行一条。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-muted">
            <FileUp className="h-5 w-5" />
            点击选择 CSV 文件
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {fileName && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{fileName}</span>
                <span className="text-muted-foreground">{rows.length} 行</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  匹配台账 {matched} 台
                </span>
                {unknownCount > 0 && (
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                    {unknownCount} 个 IP 不在台账
                  </span>
                )}
              </div>
              {rows.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto rounded-md bg-muted/50 p-2 font-mono text-xs">
                  {rows.slice(0, 8).map((r) => (
                    <div key={`${r.ip}-${r.owner}`} className="flex justify-between gap-2 py-0.5">
                      <span>{r.ip}</span>
                      <span className="text-muted-foreground">{r.owner}</span>
                    </div>
                  ))}
                  {rows.length > 8 && (
                    <div className="py-0.5 text-muted-foreground">…共 {rows.length} 行</div>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            用 Excel 直接编辑一列 IP、一列人名后另存为 CSV 即可；也可手动在「设备台账」中逐台填写使用人。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={doImport} disabled={matched === 0}>
            导入 {matched > 0 ? `${matched} 台` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
