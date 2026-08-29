'use client';

// ペアまわりの3画面を1タブにまとめたもの。
//
// 以前はサイドバーに「ペア割り当て」「ペア・シード」「予選配置編集」が並んでいたが、
// どれも「誰がどこに入るか」を触る画面で、名前だけでは使い分けが分からなかった。
// 当日いちばん使う「番号で割り当て」を先頭に置き、細かい直しは後ろにまとめる。

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loading } from '@/components/ui/loading';
import { ListOrdered, Pencil, ArrowLeftRight } from 'lucide-react';

const TabLoading = () => <Loading />;

const PairAssignManager = dynamic(() => import('@/components/admin/PairAssignManager'), { loading: TabLoading, ssr: false });
const PairSeedManager = dynamic(() => import('@/components/admin/PairSeedManager'), { loading: TabLoading, ssr: false });
const PreliminaryGroupEditor = dynamic(() => import('@/components/admin/PreliminaryGroupEditor'), { loading: TabLoading, ssr: false });

const SUB_TABS = [
  {
    value: 'assign',
    label: '番号で割り当て',
    icon: ListOrdered,
    hint: '当日くじで決まったペアを番号ごとに入れる。ふだんはここだけ使う。',
  },
  {
    value: 'fix',
    label: '試合ごとに直す',
    icon: Pencil,
    hint: '1回戦の1試合だけ選手を差し替える。3人ペア・シード番号もここ。',
  },
  {
    value: 'blocks',
    label: 'ブロック入れ替え',
    icon: ArrowLeftRight,
    hint: '予選ブロックをまたいでペアを移す。割り当て後にしか使えない。',
  },
] as const;

export default function PairSetupPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [sub, setSub] = useState<string>('assign');
  const current = SUB_TABS.find(t => t.value === sub);

  return (
    <Tabs value={sub} onValueChange={setSub} className="w-full space-y-4">
      <div className="space-y-2">
        <TabsList className="w-full grid grid-cols-3 h-auto">
          {SUB_TABS.map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {current && (
          <p className="text-xs text-slate-500 px-1">{current.hint}</p>
        )}
      </div>

      <TabsContent value="assign" className="space-y-6">
        <PairAssignManager readOnly={readOnly} />
      </TabsContent>

      <TabsContent value="fix" className="space-y-6">
        <PairSeedManager readOnly={readOnly} />
      </TabsContent>

      <TabsContent value="blocks" className="space-y-6">
        <PreliminaryGroupEditor readOnly={readOnly} />
      </TabsContent>
    </Tabs>
  );
}
