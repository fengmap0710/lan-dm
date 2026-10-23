import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Lock, Network, ShieldCheck, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'setup' | 'loading'>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .authStatus()
      .then((res) => {
        if (cancelled) return;
        setMode(res.initialized ? 'login' : 'setup');
      })
      .catch(() => {
        if (cancelled) return;
        setMode('login');
        setError('无法连接平台服务，请确认后端已启动');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const name = username.trim();
    if (!name) {
      setError('请输入账号');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    if (mode === 'setup') {
      if (password.length < 6) {
        setError('密码至少 6 位');
        return;
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致');
        return;
      }
      try {
        await api.init(name, password);
        const ok = await login(name, password);
        if (!ok) throw new Error('账号已创建，但自动登录失败，请手动登录');
        toast.success(`管理员账号「${name}」已创建`);
        navigate('/', { replace: true });
      } catch (err) {
        setError((err as Error).message || '创建失败');
      }
      return;
    }
    const ok = await login(name, password);
    if (ok) {
      navigate('/', { replace: true });
    } else {
      setError('账号或密码不正确');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-6">
      {/* 背景氛围装饰 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-200/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-700/25">
            <Network className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">内网设备管理</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">TL-R483G 运维台 · 多人共享平台</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-card/95 p-6 shadow-lg shadow-teal-950/5 backdrop-blur"
        >
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {mode === 'loading'
              ? '正在连接平台服务…'
              : mode === 'setup'
                ? '首次使用：创建管理员账号'
                : '登录后查看设备台账与管控配置'}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-name">账号</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="u-name"
                className="pl-9"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="登录账号"
                autoComplete="username"
                disabled={mode === 'loading'}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <Label htmlFor="u-pass">密码</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="u-pass"
                type="password"
                className="pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'setup' ? '至少 6 位' : '密码'}
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                disabled={mode === 'loading'}
              />
            </div>
          </div>

          {mode === 'setup' && (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="u-confirm">确认密码</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="u-confirm"
                  type="password"
                  className="pl-9"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <Button type="submit" className="mt-5 w-full" disabled={mode === 'loading'}>
            {mode === 'setup' ? '创建账号并进入' : '登录'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          数据存储于 NAS 服务器，多人共享；关闭标签页需重新登录
        </p>
      </div>
    </div>
  );
}
