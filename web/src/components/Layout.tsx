import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  Server,
  Settings,
  SlidersHorizontal,
  BarChart3,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/auth';
import { useAuth } from '@/components/auth-context';
import DataProvider from '@/data/DataProvider';
import { useData } from '@/data/data-context';
import AccountDialog from '@/components/AccountDialog';
import MessageDialog from '@/components/MessageDialog';
import TopProgress from '@/components/TopProgress';

/** 数据刷新期间显示顶部细进度条（全局） */
function RefreshProgress() {
  const { refreshing } = useData();
  return <TopProgress visible={refreshing} />;
}

export const Layout = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout: doLogout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path));

  const NAV_ITEMS = [
    { path: '/', label: '仪表盘', icon: LayoutDashboard, adminOnly: false },
    { path: '/devices', label: '设备台账', icon: Server, adminOnly: false },
    { path: '/rules', label: '行为管控', icon: SlidersHorizontal, adminOnly: false },
    { path: '/traffic', label: '流量统计', icon: BarChart3, adminOnly: false },
    { path: '/users', label: '用户管理', icon: Users, adminOnly: true },
    { path: '/settings', label: '系统设置', icon: Settings, adminOnly: true },
  ];
  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const username = user?.username || '';
  const roleLabel = isAdmin ? '管理员' : '用户';

  const handleLogout = () => {
    logout();
    doLogout();
    navigate('/login', { replace: true });
  };

  return (
    <DataProvider>
      <RefreshProgress />
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        {/* 桌面端侧栏 */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
          {/* 顶部品牌渐变条 */}
          <div className="h-0.5 shrink-0 bg-gradient-to-r from-teal-400 via-teal-600 to-transparent" />
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-950/40">
              <Network className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-wide">内网设备管理</div>
              <div className="mt-0.5 text-xs text-sidebar-foreground/60">TL-R483G 运维台</div>
            </div>
          </div>
          <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
            {visibleNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item.path)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-teal-400'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setMsgOpen(true)}
              className="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:border-teal-400/40 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              发消息
            </button>
          </nav>
          <div className="border-t border-sidebar-border px-5 py-4">
            <div className="text-xs leading-relaxed text-sidebar-foreground/50">
              设备数据来自路由器实采快照
              <br />
              数据存储于 NAS 服务器
            </div>
            <div className="mt-3 flex items-center gap-2.5 border-t border-sidebar-border pt-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-[11px] font-semibold text-white">
                {(username || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-sidebar-foreground/80">{username}</div>
                <div className="text-[10px] text-sidebar-foreground/50">{roleLabel}</div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setAccountOpen(true)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                >
                  <Settings className="h-3.5 w-3.5" />
                  改密码
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  退出
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* 移动端顶部导航 */}
        <div className="fixed inset-x-0 top-0 z-20 flex items-center gap-1 border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden">
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
                isActive(item.path)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70',
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMsgOpen(true)}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/70"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            发消息
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70"
            aria-label="退出登录"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出
          </button>
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto pt-12 md:pt-0">
          <div className="page-enter h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <AccountDialog
        key={accountOpen ? 'open' : 'closed'}
        open={accountOpen}
        onOpenChange={setAccountOpen}
      />
      <MessageDialog open={msgOpen} onOpenChange={setMsgOpen} />
    </DataProvider>
  );
};
