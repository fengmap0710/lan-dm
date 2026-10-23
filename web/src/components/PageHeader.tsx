import type { ReactNode } from 'react';

/**
 * 统一页头：标题 + 渐变图标 + 描述 + 右侧操作区 + 底部渐变分隔线
 */
export function PageHeader({
  title,
  description,
  icon,
  iconTone = 'teal',
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  iconTone?: 'teal' | 'blue' | 'amber' | 'rose';
  actions?: ReactNode;
}) {
  const toneCls =
    iconTone === 'blue'
      ? 'from-blue-500/15 to-blue-600/15 text-blue-700'
      : iconTone === 'amber'
        ? 'from-amber-500/15 to-amber-600/15 text-amber-700'
        : iconTone === 'rose'
          ? 'from-rose-500/15 to-rose-600/15 text-rose-700'
          : 'from-teal-500/15 to-teal-700/15 text-primary';
  return (
    <header className="relative mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {icon && (
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${toneCls}`}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-5 h-px bg-gradient-to-r from-primary/50 via-border/80 to-transparent" />
    </header>
  );
}
