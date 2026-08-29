'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import {
  getTournamentConfigs,
  createTournamentConfig,
  deleteTournamentConfig,
  subscribeToTournamentConfigs,
  deleteAllMatches,
  deleteTournamentMatches,
} from '@/lib/firestore-helpers';
import type { TournamentConfig, EventType, Division, TournamentFormat } from '@/types';
import { Trash2, Save, ArrowUp, ArrowDown } from 'lucide-react';
import { useCamp } from '@/context/CampContext';
import { POINTS_STANDARD } from '@/lib/match-points';
import { DEFAULT_DIVISIONS } from '@/lib/divisions';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

export default function TournamentSetup({ readOnly = false }: { readOnly?: boolean }) {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [configs, setConfigs] = useState<TournamentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newConfig, setNewConfig] = useState({
    event_type: 'MD' as EventType,
    division: 1 as Division,
    format: 'double-elimination' as TournamentFormat,
    group_count: 4,
    qualifiers_per_group: 2,
    priority: 999 as number,
  });

  useEffect(() => {
    if (!camp) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToTournamentConfigs((data) => {
      // 優先度でソート（小さい順）
      const sorted = [...data].sort((a, b) => (a.priority || 999) - (b.priority || 999));
      setConfigs(sorted);
      setLoading(false);
    }, camp.id);
    return () => unsubscribe();
  }, [camp]);

  const handleSaveConfig = async () => {
    if (!camp) {
      alert('合宿が選択されていません');
      return;
    }
    setSaving(true);
    try {
      const configToSave = {
        ...newConfig,
        // 点数は試合ごとに大会の形から決めるため、設定側は既定値のみ保持する
        points_per_game: POINTS_STANDARD,
        points_by_round: {},
        campId: camp.id,
      };
      await createTournamentConfig(configToSave);
      // Reset form
      setNewConfig({
        event_type: 'MD',
        division: 1,
        format: 'double-elimination',
        group_count: 4,
        qualifiers_per_group: 2,
        priority: 999,
      });
    } catch (error) {
      alert('設定の保存に失敗しました');
    }
    setSaving(false);
  };

  const handleDeleteConfig = async (id: string) => {
    const confirmed = await confirm({
      title: '設定の削除',
      message: 'この設定を削除してもよろしいですか？',
      confirmText: '削除',
      cancelText: 'キャンセル',
      type: 'warning',
    });
    if (!confirmed) return;
    await deleteTournamentConfig(id);
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const currentConfig = configs[index];
    const previousConfig = configs[index - 1];

    // 優先度を入れ替え
    await createTournamentConfig({ ...currentConfig, priority: previousConfig.priority });
    await createTournamentConfig({ ...previousConfig, priority: currentConfig.priority });
  };

  const handleMoveDown = async (index: number) => {
    if (index === configs.length - 1) return;
    const currentConfig = configs[index];
    const nextConfig = configs[index + 1];

    // 優先度を入れ替え
    await createTournamentConfig({ ...currentConfig, priority: nextConfig.priority });
    await createTournamentConfig({ ...nextConfig, priority: currentConfig.priority });
  };

  const handleDeleteAllMatches = async () => {
    if (!camp) {
      alert('合宿が選択されていません');
      return;
    }
    const confirmed = await confirm({
      title: '全試合の削除',
      message: 'この合宿の全試合を削除しますか？\nこの操作は取り消せません。',
      confirmText: '削除',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteAllMatches(camp.id);
      alert('全試合を削除しました');
    } catch (error) {
      alert('削除中にエラーが発生しました');
    }
    setSaving(false);
  };

  const handleDeleteTournamentMatches = async (config: TournamentConfig) => {
    if (!camp) {
      alert('合宿が選択されていません');
      return;
    }
    const confirmed = await confirm({
      title: 'トーナメント試合の削除',
      message: `${getEventTypeName(config.event_type)} ${config.division}部の全試合を削除しますか？\nこの操作は取り消せません。`,
      confirmText: '削除',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteTournamentMatches(camp.id, config.event_type, config.division);
      alert('トーナメントの試合を削除しました');
    } catch (error) {
      alert('削除中にエラーが発生しました');
    }
    setSaving(false);
  };

  const handleDeleteTournamentComplete = async (config: TournamentConfig) => {
    if (!camp) {
      alert('合宿が選択されていません');
      return;
    }
    const confirmed = await confirm({
      title: 'トーナメント完全削除',
      message: `【警告】この操作は取り消せません。\n\n${getEventTypeName(config.event_type)} ${config.division}部の以下のデータを完全に削除します：\n• トーナメント設定\n• 関連する全試合データ\n\n本当に削除してもよろしいですか？`,
      confirmText: '完全削除',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      // 関連試合を削除
      await deleteTournamentMatches(camp.id, config.event_type, config.division);
      // トーナメント設定を削除
      await deleteTournamentConfig(config.id);
      alert('トーナメントを完全に削除しました');
    } catch (error) {
      alert('削除中にエラーが発生しました');
    }
    setSaving(false);
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
    return <Loading />;
  }

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">新規トーナメント設定</CardTitle>
          <CardDescription>種目・部門・トーナメント形式を設定（点数は大会の形から自動で決まります）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block">種目</label>
              <select
                value={newConfig.event_type}
                onChange={(e) => {
                  setNewConfig({ ...newConfig, event_type: e.target.value as EventType });
                }}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white text-slate-900 px-3"
                style={{ backgroundColor: 'white', color: 'black' }}
                disabled={readOnly}
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
                value={DEFAULT_DIVISIONS.includes(newConfig.division) ? newConfig.division : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setNewConfig({ ...newConfig, division: DEFAULT_DIVISIONS.length + 1 });
                  } else {
                    setNewConfig({ ...newConfig, division: parseInt(e.target.value) });
                  }
                }}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white text-slate-900 px-3"
                style={{ backgroundColor: 'white', color: 'black' }}
                disabled={readOnly}
              >
                {DEFAULT_DIVISIONS.map((d) => (
                  <option key={d} value={d}>{d}部</option>
                ))}
                <option value="custom">その他（手入力）</option>
              </select>
              {!DEFAULT_DIVISIONS.includes(newConfig.division) && (
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={newConfig.division}
                  onChange={(e) => setNewConfig({ ...newConfig, division: parseInt(e.target.value) || 1 })}
                  className="mt-2 h-8 text-xs md:text-sm"
                  placeholder="部門番号を入力 (例: 3, 4)"
                  disabled={readOnly}
                />
              )}
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">トーナメント形式</label>
              <select
                value={newConfig.format}
                onChange={(e) => setNewConfig({ ...newConfig, format: e.target.value as TournamentFormat })}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white text-slate-900 px-3"
                style={{ backgroundColor: 'white', color: 'black' }}
                disabled={readOnly}
              >
                <option value="single-elimination">シングルエリミネーション</option>
                <option value="double-elimination">ダブルエリミネーション</option>
                <option value="round-robin">総当たりリーグ戦</option>
                <option value="group-stage-knockout">予選リーグ + 決勝トーナメント</option>
              </select>
            </div>

            {newConfig.format === 'group-stage-knockout' && (
              <>
                <div>
                  <label className="text-xs font-medium mb-1 block">グループ数</label>
                  <select
                    value={newConfig.group_count}
                    onChange={(e) => setNewConfig({ ...newConfig, group_count: parseInt(e.target.value) })}
                    className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white text-slate-900 px-3"
                    style={{ backgroundColor: 'white', color: 'black' }}
                    disabled={readOnly}
                  >
                    <option value="2">2グループ</option>
                    <option value="4">4グループ</option>
                    <option value="8">8グループ</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 block">予選通過人数/グループ</label>
                  <select
                    value={newConfig.qualifiers_per_group}
                    onChange={(e) => setNewConfig({ ...newConfig, qualifiers_per_group: parseInt(e.target.value) })}
                    className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white text-slate-900 px-3"
                    style={{ backgroundColor: 'white', color: 'black' }}
                    disabled={readOnly}
                  >
                    <option value="1">1位のみ</option>
                    <option value="2">2位まで</option>
                    <option value="3">3位まで</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-medium mb-1 block">進行順位（優先度）</label>
              <select
                value={newConfig.priority}
                onChange={(e) => setNewConfig({ ...newConfig, priority: parseInt(e.target.value) })}
                className="h-8 text-xs md:text-sm w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white text-slate-900 px-3"
                style={{ backgroundColor: 'white', color: 'black' }}
                disabled={readOnly}
              >
                <option value="1">1 - 最優先</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="999">999 - デフォルト（最後）</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">※保存後、下のリストで並べ替え可能</p>
            </div>
          </div>

          <Button onClick={handleSaveConfig} disabled={saving || readOnly} className="w-full">
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
              {configs.map((config, index) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMoveUp(index)}
                        disabled={readOnly || index === 0}
                        title="上へ移動"
                        aria-label="上へ移動"
                        className="h-6 w-6 p-0"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMoveDown(index)}
                        disabled={readOnly || index === configs.length - 1}
                        title="下へ移動"
                        aria-label="下へ移動"
                        className="h-6 w-6 p-0"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-indigo-100 text-indigo-800 font-bold">{index + 1}</Badge>
                        <Badge>{getEventTypeName(config.event_type)}</Badge>
                        <Badge variant="outline">{config.division}部</Badge>
                        <Badge className="bg-purple-100 text-purple-800">優先度: {config.priority || 999}</Badge>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {getFormatName(config.format)}
                      </p>
                      {config.format === 'group-stage-knockout' && (
                        <p className="text-xs text-gray-500 mt-1">
                          {config.group_count}グループ, 各{config.qualifiers_per_group}名通過
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteTournamentMatches(config)}
                      disabled={readOnly || saving}
                      title="このトーナメントの試合のみを削除"
                      className="text-xs"
                    >
                      試合削除
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteConfig(config.id)}
                      disabled={readOnly || saving}
                      title="トーナメント設定のみを削除"
                      className="text-xs"
                    >
                      設定削除
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteTournamentComplete(config)}
                      disabled={readOnly || saving}
                      title="トーナメント設定と全試合を完全に削除"
                      className="bg-red-600 hover:bg-red-700 text-xs"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      完全削除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base text-red-600">危険な操作</CardTitle>
          <CardDescription>この合宿の試合データを削除します</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleDeleteAllMatches}
            disabled={readOnly || saving}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            全試合を削除
          </Button>
        </CardContent>
      </Card>
      </div>
    </>
  );
}
