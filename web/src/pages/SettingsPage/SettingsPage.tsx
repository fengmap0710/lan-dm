import { useEffect, useState } from 'react';
import { KeyRound, Router, Save, Server as ServerIcon, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .routerCredential
      .get()
      .then((res) => {
        if (cancelled) return;
        if (res.credential) {
          setUrl(res.credential.url);
          setUsername(res.credential.username);
          setPassword(res.credential.password);
          setUpdatedAt(res.credential.updatedAt);
        }
      })
      .catch(() => {
        // 忽略加载失败，表单保持空白
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!url.trim() || !username.trim() || !password.trim()) {
      toast.error('地址、账号、密码均不能为空');
      return;
    }
    setSaving(true);
    try {
      const res = await api.routerCredential.put({
        url: url.trim(),
        username: username.trim(),
        password: password.trim(),
      });
      setUpdatedAt(res.credential.updatedAt);
      toast.success('路由器账号密码已保存');
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8">
      <PageHeader
        title="系统设置"
        description="维护路由器登录凭据与平台部署信息（仅管理员可见）"
        icon={<Settings className="h-5 w-5" />}
        iconTone="teal"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Router className="h-4 w-4" />
              路由器账号密码
            </CardTitle>
            <CardDescription>
              保存 TL-R483G 的登录凭据，用于后续流量快照同步与限速配置。修改后请及时更新。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-1.5">
              <Label>管理地址</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.102.1/webpages/index.html" disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label>登录账号</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="路由器登录账号" disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label>登录密码</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="路由器登录密码"
                disabled={loading}
              />
            </div>
            {updatedAt && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                上次保存：{new Date(updatedAt).toLocaleString('zh-CN', { hour12: false })}
              </p>
            )}
            <div className="flex items-center justify-end">
              <Button onClick={submit} disabled={saving || loading}>
                <Save className="h-4 w-4" />
                保存凭据
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ServerIcon className="h-4 w-4" />
              部署信息
            </CardTitle>
            <CardDescription>平台服务运行在 NAS 服务器，数据持久化存储</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">平台地址</span>
                <span className="font-medium">http://&lt;你的服务器地址&gt;:8088</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">后端服务</span>
                <span className="font-medium">NAS 容器（端口 3001）</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">数据存储</span>
                <span className="font-medium">NAS 数据卷（JSON 持久化）</span>
              </div>
              <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
                路由器密码与平台登录账号相互独立。路由器密码仅供管理员在本页维护；平台账号在「用户管理」中创建。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
