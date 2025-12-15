'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getTournamentConfigs,
  createTournamentConfig,
  deleteTournamentConfig,
  subscribeToTournamentConfigs,
} from '@/lib/firestore-helpers';
import type { TournamentConfig, EventType, Division, TournamentFormat, PointsDistribution } from '@/types';
import { Plus, Trash2, Save } from 'lucide-react';

export default function TournamentSetup() {
  const [configs, setConfigs] = useState<TournamentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newConfig, setNewConfig] = useState({
    event_type: 'MD' as EventType,
    division: 1 as Division,
    format: 'double-elimination' as TournamentFormat,
    points_per_game: 15 as 11 | 15 | 21,
    points_distribution: [
      { rank: 1, points: 100 },
      { rank: 2, points: 70 },
      { rank: 3, points: 50 },
      { rank: 4, points: 30 },
    ] as PointsDistribution[],
  });

  useEffect(() => {
    const unsubscribe = subscribeToTournamentConfigs((data) => {
      setConfigs(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await createTournamentConfig(newConfig);
      // Reset form
      setNewConfig({
        event_type: 'MD',
        division: 1,
        format: 'double-elimination',
        points_per_game: 15,
        points_distribution: [
          { rank: 1, points: 100 },
          { rank: 2, points: 70 },
          { rank: 3, points: 50 },
          { rank: 4, points: 30 },
        ],
      });
    } catch (error) {
      alert('設定の保存に失敗しました');
    }
    setSaving(false);
  };

  const handleDeleteConfig = async (id: string) => {
    if (!confirm('この設定を削除してもよろしいですか?')) return;
    await deleteTournamentConfig(id);
  };

  const handleAddRank = () => {
    const nextRank = newConfig.points_distribution.length + 1;
    setNewConfig({
      ...newConfig,
      points_distribution: [
        ...newConfig.points_distribution,
        { rank: nextRank, points: 10 },
      ],
    });
  };

  const handleRemoveRank = (index: number) => {
    const newDist = newConfig.points_distribution.filter((_, i) => i !== index);
    // Re-number ranks
    newDist.forEach((item, i) => {
      item.rank = i + 1;
    });
    setNewConfig({ ...newConfig, points_distribution: newDist });
  };

  const handleUpdateRankPoints = (index: number, points: number) => {
    const newDist = [...newConfig.points_distribution];
    newDist[index].points = points;
    setNewConfig({ ...newConfig, points_distribution: newDist });
  };

  const getEventTypeName = (type: EventType) => {
    const names: Record<EventType, string> = {
      MD: '男子ダブルス',
      WD: '女子ダブルス',
      XD: '混合ダブルス',
      MS: '男子シングルス',
      WS: '女子シングルス',
      TEAM: '団体戦',
    };
    return names[type];
  };

  const getFormatName = (format: TournamentFormat) => {
    const names: Record<TournamentFormat, string> = {
      'single-elimination': 'シングルエリミネーション',
      'double-elimination': 'ダブルエリミネーション',
      'round-robin': '総当たりリーグ戦',
      'group-stage-knockout': '予選リーグ + 決勝トーナメント',
    };
    return names[format];
  };

  if (loading) {
    return <p className="text-gray-600 dark:text-gray-400">読み込み中...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">新規トーナメント設定</CardTitle>
          <CardDescription>トーナメント形式、点数、ポイント配分を設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block">種目</label>
              <select
                value={newConfig.event_type}
                onChange={(e) => setNewConfig({ ...newConfig, event_type: e.target.value as EventType })}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3"
              >
                <option value="MD">男子ダブルス</option>
                <option value="WD">女子ダブルス</option>
                <option value="XD">混合ダブルス</option>
                <option value="MS">男子シングルス</option>
                <option value="WS">女子シングルス</option>
                <option value="TEAM">団体戦</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">部門</label>
              <select
                value={newConfig.division}
                onChange={(e) => setNewConfig({ ...newConfig, division: parseInt(e.target.value) as Division })}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3"
              >
                <option value="1">1部</option>
                <option value="2">2部</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">トーナメント形式</label>
              <select
                value={newConfig.format}
                onChange={(e) => setNewConfig({ ...newConfig, format: e.target.value as TournamentFormat })}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3"
              >
                <option value="single-elimination">シングルエリミネーション</option>
                <option value="double-elimination">ダブルエリミネーション</option>
                <option value="round-robin">総当たりリーグ戦</option>
                <option value="group-stage-knockout">予選リーグ + 決勝トーナメント</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">点数設定</label>
              <select
                value={newConfig.points_per_game}
                onChange={(e) =>
                  setNewConfig({ ...newConfig, points_per_game: parseInt(e.target.value) as 11 | 15 | 21 })
                }
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3"
              >
                <option value="11">11点</option>
                <option value="15">15点</option>
                <option value="21">21点</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">順位別ポイント配分</label>
              <Button size="sm" variant="outline" onClick={handleAddRank}>
                <Plus className="w-3 h-3 mr-1" />
                <span className="hidden md:inline">順位を追加</span>
              </Button>
            </div>
            <div className="space-y-2">
              {newConfig.points_distribution.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm font-medium w-12">{item.rank}位:</span>
                  <Input
                    type="number"
                    min="0"
                    value={item.points}
                    onChange={(e) => handleUpdateRankPoints(index, parseInt(e.target.value) || 0)}
                    className="flex-1 h-8 text-xs md:text-sm"
                  />
                  <span className="text-xs text-gray-500">pt</span>
                  {newConfig.points_distribution.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveRank(index)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSaveConfig} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '設定を保存'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">保存済みトーナメント設定 ({configs.length}件)</CardTitle>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <p className="text-sm text-gray-500">設定がありません</p>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge>{getEventTypeName(config.event_type)}</Badge>
                      <Badge variant="outline">{config.division}部</Badge>
                      <Badge variant="secondary">{config.points_per_game}点</Badge>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {getFormatName(config.format)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      ポイント配分: {config.points_distribution.map((p) => `${p.rank}位=${p.points}pt`).join(', ')}
                    </p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteConfig(config.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
