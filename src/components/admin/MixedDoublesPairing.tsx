'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAllPlayers } from '@/lib/firestore-helpers';
import { pairPlayersForDoubles } from '@/lib/tournament-logic';
import { useCamp } from '@/context/CampContext';
import type { Player, Division } from '@/types';
import { Users, Shuffle, Check } from 'lucide-react';

interface MixedDoublesPairingProps {
  division: Division;
  onPairsCreated: (pairs: ([Player, Player] | [Player, Player, Player])[]) => void;
}

export default function MixedDoublesPairing({ division, onPairsCreated }: MixedDoublesPairingProps) {
  const { camp } = useCamp();
  const [players, setPlayers] = useState<Player[]>([]);
  const [pairs, setPairs] = useState<([Player, Player] | [Player, Player, Player])[]>([]);
  const [preferMixed, setPreferMixed] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!camp) return;
    setLoading(true);
    getAllPlayers(camp.id).then(all => {
      setPlayers(all.filter(p => p.is_active && p.division === division));
      setLoading(false);
    });
  }, [camp, division]);

  const handleAutoPair = () => {
    const generated = pairPlayersForDoubles(players, preferMixed);
    setPairs(generated);
  };

  const maleCount = players.filter(p => p.gender === 'male').length;
  const femaleCount = players.filter(p => p.gender === 'female').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-5 h-5 text-pink-500" />
          混合ダブルス 自動ペアリング
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-slate-500">読み込み中...</p>}

        {!loading && (
          <>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">男性 {maleCount}名</Badge>
              <Badge variant="outline">女性 {femaleCount}名</Badge>
              <Badge variant="outline">計 {players.length}名</Badge>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferMixed}
                  onChange={e => setPreferMixed(e.target.checked)}
                  className="w-4 h-4"
                />
                混合ペアを優先する
              </label>
            </div>

            <Button onClick={handleAutoPair} disabled={players.length < 2} className="gap-2">
              <Shuffle className="w-4 h-4" />
              自動ペアリング実行
            </Button>

            {pairs.length > 0 && (
              <div className="space-y-2">
                {(() => {
                  const totalParticipants = pairs.reduce((sum, pair) => sum + pair.length, 0);
                  const hasTriple = pairs.some(pair => pair.length === 3);
                  return (
                    <p className="text-sm font-medium text-slate-700">
                      {pairs.length} ペア生成済み
                      <span className="ml-2 text-slate-500">（参加者総数 {totalParticipants}名）</span>
                      {hasTriple && (
                        <Badge className="ml-2 text-xs bg-amber-100 text-amber-700 border-amber-200">3人組あり</Badge>
                      )}
                    </p>
                  );
                })()}
                <div className="grid gap-2">
                  {pairs.map((pair, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 bg-slate-50 rounded-md text-sm"
                    >
                      <span className="text-slate-400 w-5 text-right">{i + 1}.</span>
                      <span className={pair[0].gender === 'male' ? 'text-blue-700' : 'text-pink-700'}>
                        {pair[0].name}
                      </span>
                      <span className="text-slate-400">/</span>
                      <span className={pair[1].gender === 'male' ? 'text-blue-700' : 'text-pink-700'}>
                        {pair[1].name}
                      </span>
                      {pair.length === 3 && (
                        <>
                          <span className="text-slate-400">/</span>
                          <span className={pair[2].gender === 'male' ? 'text-blue-700' : 'text-pink-700'}>
                            {pair[2].name}
                          </span>
                          <Badge className="ml-auto text-xs bg-amber-100 text-amber-700 border-amber-200">3人</Badge>
                        </>
                      )}
                      {pair.length === 2 && pair[0].gender !== pair[1].gender && (
                        <Badge className="ml-auto text-xs bg-pink-100 text-pink-700 border-pink-200">混合</Badge>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => onPairsCreated(pairs)}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4" />
                  このペアリングで確定
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
