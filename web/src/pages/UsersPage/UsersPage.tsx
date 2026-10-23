import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, UserCog, Users as UsersIcon } from 'lucide-react';
import { api, type IApiUser } from '@/lib/api';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

function formatDate(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<IApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<IApiUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<IApiUser | null>(null);

  // 新增表单
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [formError, setFormError] = useState('');
  // 重置密码表单
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.users.list();
      setUsers(res.users);
    } catch (e) {
      toast.error((e as Error).message || '加载用户失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.users.list();
        if (cancelled) return;
        setUsers(res.users);
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message || '加载用户失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitAdd = async () => {
    setFormError('');
    const name = newUsername.trim();
    if (!name) {
      setFormError('请输入账号');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setFormError('密码至少 6 位');
      return;
    }
    try {
      await api.users.create(name, newPassword, newRole);
      toast.success(`用户「${name}」已创建`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setAddOpen(false);
      load();
    } catch (e) {
      setFormError((e as Error).message || '创建失败');
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    setResetError('');
    if (!resetPassword || resetPassword.length < 6) {
      setResetError('密码至少 6 位');
      return;
    }
    try {
      await api.users.update(resetTarget.id, { password: resetPassword });
      toast.success(`已重置「${resetTarget.username}」的密码`);
      setResetPassword('');
      setResetTarget(null);
    } catch (e) {
      setResetError((e as Error).message || '重置失败');
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await api.users.remove(removeTarget.id);
      toast.success(`用户「${removeTarget.username}」已删除`);
      setUsers((prev) => prev.filter((u) => u.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
      setRemoveTarget(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8">
      <PageHeader
        title="用户管理"
        description="管理平台登录账号与角色权限（管理员可管理用户与路由器凭据，普通用户可配置管控）"
        icon={<UsersIcon className="h-5 w-5" />}
        iconTone="rose"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            新增用户
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="h-4 w-4" />
            平台账号（{users.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无用户</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">账号</th>
                    <th className="pb-2 pr-4 font-medium">角色</th>
                    <th className="pb-2 pr-4 font-medium">创建时间</th>
                    <th className="pb-2 pr-4 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">
                        {u.username}
                        {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">（当前）</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? '管理员' : '普通用户'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{formatDate(u.createdAt)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResetError('');
                              setResetPassword('');
                              setResetTarget(u);
                            }}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            重置密码
                          </Button>
                          {u.id !== me?.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setRemoveTarget(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增用户 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              新增用户
            </DialogTitle>
            <DialogDescription>创建平台登录账号，可分配管理员或普通用户角色</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>账号 *</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="登录账号" />
            </div>
            <div className="space-y-1.5">
              <Label>密码 *</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newRole === 'user' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewRole('user')}
                >
                  普通用户
                </Button>
                <Button
                  type="button"
                  variant={newRole === 'admin' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewRole('admin')}
                >
                  管理员
                </Button>
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={submitAdd}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码 */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>为「{resetTarget?.username}」设置新密码</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>新密码 *</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              取消
            </Button>
            <Button onClick={submitReset}>确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户「{removeTarget?.username}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该账号将无法登录平台，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-destructive text-destructive-foreground">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
