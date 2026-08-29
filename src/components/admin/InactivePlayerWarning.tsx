'use client';

// 棄権した選手が入ったまま残っている未消化の試合を警告する。
//
// 「選手」タブの棄権ボタンを使えば未消化の試合は自動で不戦勝になるが、
// 直接データを触った場合や、棄権処理の途中で失敗した場合には取り残しが出る。
// 取り残されたままだと、その試合はコートに呼ばれ、来ない選手を待つことになる。

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getAllMatches, getAllPlayers, countMatchesWithInactivePlayers } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';

export default function InactivePlayerWarning() {
  const { camp } = useCamp();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!camp?.id) return;
    let alive = true;

    const check = async () => {
      try {
        const [matches, players] = await Promise.all([
          getAllMatches(camp.id),
          getAllPlayers(camp.id),
        ]);
        if (alive) setCount(countMatchesWithInactivePlayers(matches, players));
      } catch {
        /* 取得できないときは黙って何も出さない */
      }
    };

    check();
    // 棄権は運営が手で行うので、頻繁に確認する必要はない
    const timer = setInterval(check, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [camp?.id]);

  if (count === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-bold text-amber-900">
          棄権した選手が入ったままの試合が {count} 件あります
        </p>
        <p className="text-amber-800 mt-0.5 leading-relaxed">
          このままだとコートに呼ばれて、来ない選手を待つことになります。
          「安全」タブの<span className="font-bold">欠場処理</span>で1試合ずつ相手の不戦勝にするか、
          「選手」タブでいったん復帰させてから<span className="font-bold">棄権</span>を押し直すと、まとめて処理されます。
        </p>
      </div>
    </div>
  );
}
