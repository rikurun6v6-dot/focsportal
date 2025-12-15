'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Player } from '@/types';
import { getPlayerRankings } from '@/lib/points';
import { Trophy } from 'lucide-react';

export default function PlayerRanking() {
  const [maleDiv1, setMaleDiv1] = useState<Player[]>([]);
  const [maleDiv2, setMaleDiv2] = useState<Player[]>([]);
  const [femaleDiv1, setFemaleDiv1] = useState<Player[]>([]);
  const [femaleDiv2, setFemaleDiv2] = useState<Player[]>([]);

  useEffect(() => {
    loadRankings();
  }, []);

  const loadRankings = async () => {
    const [md1, md2, fd1, fd2] = await Promise.all([
      getPlayerRankings('male', 1),
      getPlayerRankings('male', 2),
      getPlayerRankings('female', 1),
      getPlayerRankings('female', 2)
    ]);
    setMaleDiv1(md1);
    setMaleDiv2(md2);
    setFemaleDiv1(fd1);
    setFemaleDiv2(fd2);
  };

  const RankingTable = ({ players, title }: { players: Player[]; title: string }) => (
    <Card className="p-4">
      <h3 className="font-bold mb-3">{title}</h3>
      <div className="space-y-2">
        {players.map((player, idx) => (
          <div key={player.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex items-center gap-2">
              {idx === 0 && <Trophy className="w-5 h-5 text-yellow-500" />}
              <span className="font-medium">{idx + 1}位</span>
              <span>{player.name}</span>
            </div>
            <Badge>{player.total_points || 0}pt</Badge>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <RankingTable players={maleDiv1} title="男子1部" />
      <RankingTable players={maleDiv2} title="男子2部" />
      <RankingTable players={femaleDiv1} title="女子1部" />
      <RankingTable players={femaleDiv2} title="女子2部" />
    </div>
  );
}
