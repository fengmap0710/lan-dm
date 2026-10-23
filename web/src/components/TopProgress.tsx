/** 顶部细进度条：数据刷新期间显示（固定于视口顶端，不占布局） */
export default function TopProgress({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden">
      <div className="top-progress-bar h-full w-full bg-gradient-to-r from-teal-400 via-teal-500 to-teal-600" />
    </div>
  );
}
