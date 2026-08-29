'use client';

// 開催日（1日目 / 2日目）をダッシュボードから切り替えるボタン。
//
// 従来この操作は合宿一覧（CampManager）にしかなく、大会中ずっといるダッシュボードからは
// 「合宿選択へ」で一覧に戻らないと切り替えられなかった。2日目の朝に必ず使う操作なので、
// 運営が見ている画面に置く。

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { useCamp } from '@/context/CampContext';
import { switchCampDay, getCampCourtCountForDay } from '@/lib/firestore-helpers';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastSuccess, toastError } from '@/lib/toast';

export default function CampDaySwitcher({ readOnly = false }: { readOnly?: boolean }) {
  const { camp, refreshCamp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [switching, setSwitching] = useState(false);

  // 開催中の合宿だけが対象。準備中・アーカイブ済みでは出さない
  if (!camp || camp.status !== 'active') return null;

  const currentDay = camp.active_day ?? 1;

  const handleSwitch = async (day: 1 | 2) => {
    if (currentDay === day || switching) return;
    const count = getCampCourtCountForDay(camp, day);
    const confirmed = await confirm({
      title: `🗓️ ${day}日目に切り替え`,
      message: `開催日を「${day}日目」（${count}面）に切り替えます。\nコートを ${count} 面で再初期化します（進行中の割り当てはリセットされます）。\n試合データ・結果は保持されます。`,
      confirmText: `${day}日目にする`,
      cancelText: 'キャンセル',
      type: 'warning',
    });
    if (!confirmed) return;

    setSwitching(true);
    const ok = await switchCampDay(camp.id, day, count);
    if (ok) {
      await refreshCamp();
      toastSuccess(`${day}日目（${count}面）に切り替えました`);
    } else {
      toastError('日の切り替えに失敗しました', '通信を確認して、もう一度お試しください');
    }
    setSwitching(false);
  };

  return (
    <>
      <ConfirmDialog />
      <div className="flex items-center rounded-md border border-slate-300 bg-white overflow-hidden h-9">
        <span className="hidden lg:flex items-center gap-1 px-2 text-xs text-slate-500 border-r border-slate-200 h-full">
          <Calendar className="w-3.5 h-3.5" />
          開催日
        </span>
        {([1, 2] as const).map((day) => {
          const isActive = currentDay === day;
          const count = getCampCourtCountForDay(camp, day);
          return (
            <Button
              key={day}
              size="sm"
              variant="ghost"
              disabled={readOnly || switching || isActive}
              onClick={() => handleSwitch(day)}
              title={isActive ? `現在の開催日（${count}面）` : `${day}日目（${count}面）に切り替え`}
              className={`h-full rounded-none px-2.5 text-xs disabled:opacity-100 ${
                isActive
                  ? 'bg-indigo-500 text-white hover:bg-indigo-500'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {day}日目
              <span className="hidden md:inline ml-1 opacity-80">（{count}面）</span>
            </Button>
          );
        })}
      </div>
    </>
  );
}
