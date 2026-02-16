'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllMatches } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import { TrendingUp, TrendingDown, Minus, Trophy, Award } from 'lucide-react';
import type { Match, TournamentType } from '@/types';

interface ProgressStats {
  tournamentType: TournamentType;
  division: number;
  total: number;
  completed: number;
  waiting: number;
  active: number;
  progressRate: number;
  label: string;
}

export default function ProgressDashboard() {
  const { camp } = useCamp();
  const [stats, setStats] = useState<ProgressStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageProgress, setAverageProgress] = useState(0);

  useEffect(() => {
    if (!camp) {
      setLoading(false);
      return;
    }

    const loadProgress = async () => {
      const matches = await getAllMatches(camp.id);

      // 種目・部門ごとにグループ化
      const groupedMatches = new Map<string, Match[]>();
      matches.forEach(match => {
        const key = `${match.tournament_type}_${match.division || 0}`;
        if (!groupedMatches.has(key)) {
          groupedMatches.set(key, []);
        }
        groupedMatches.get(key)!.push(match);
      });

      // 統計を計算
      const progressStats: ProgressStats[] = [];
      groupedMatches.forEach((groupMatches, key) => {
        // keyの最後のアンダースコア以降をdivisionとして扱う
        const lastUnderscoreIndex = key.lastIndexOf('_');
        const tournamentType = key.substring(0, lastUnderscoreIndex);
        const divisionStr = key.substring(lastUnderscoreIndex + 1);
        const division = parseInt(divisionStr, 10);

        // NaNチェック - divisionが数値でない場合は0にする
        const safeDivision = isNaN(division) ? 0 : division;

        const total = groupMatches.length;
        const completed = groupMatches.filter(m => m.status === 'completed').length;
        const waiting = groupMatches.filter(m => m.status === 'waiting').length;
        const active = groupMatches.filter(m => m.status === 'calling' || m.status === 'playing').length;

        // 分母が0の場合の安全なハンドリング
        const progressRate = total > 0 ? completed / total : 0;

        // NaNチェック - progressRateが数値でない場合は0にする
        const safeProgressRate = isNaN(progressRate) ? 0 : progressRate;

        progressStats.push({
          tournamentType: tournamentType as TournamentType,
          division: safeDivision,
          total,
          completed,
          waiting,
          active,
          progressRate: safeProgressRate,
          label: getTournamentLabel(tournamentType as TournamentType, safeDivision)
        });
      });

      // 進行率でソート（遅れている順）
      progressStats.sort((a, b) => a.progressRate - b.progressRate);

      setStats(progressStats);

      // 平均進行率を計算（NaN安全版）
      const avgProgress = progressStats.length > 0
        ? progressStats.reduce((sum, s) => sum + (isNaN(s.progressRate) ? 0 : s.progressRate), 0) / progressStats.length
        : 0;

      // NaNチェック
      const safeAvgProgress = isNaN(avgProgress) ? 0 : avgProgress;
      setAverageProgress(safeAvgProgress);

      setLoading(false);
    };

    loadProgress();

    // 30秒ごとに更新
    const interval = setInterval(loadProgress, 30000);
    return () => clearInterval(interval);
  }, [camp?.id]);

  const getTournamentLabel = (type: TournamentType, division: number): string => {
    // 性別を抽出
    const getGender = (t: string): string => {
      if (t.includes('mens')) return '男子';
      if (t.includes('womens')) return '女子';
      if (t.includes('mixed')) return '混合';
      return '';
    };

    // 種目を抽出
    const getEventType = (t: string): string => {
      if (t.includes('doubles')) return 'ダブルス';
      if (t.includes('singles')) return 'シングルス';
      if (t.includes('team_battle')) return '団体戦';
      return '';
    };

    const gender = getGender(type);
    const eventType = getEventType(type);

    // 部門ラベル
    const divisionLabel = division > 0 ? `${division}部` : '';

    // 組み立て: "男子・ダブルス・1部"
    const parts = [gender, eventType, divisionLabel].filter(p => p);
    return parts.join('・');
  };

  const getProgressIcon = (rate: number) => {
    if (rate < averageProgress - 0.1) {
      return <TrendingDown className="w-5 h-5 text-red-500" />;
    } else if (rate > averageProgress + 0.1) {
      return <TrendingUp className="w-5 h-5 text-green-500" />;
    } else {
      return <Minus className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getProgressColor = (rate: number): string => {
    if (rate < 0.3) return 'bg-red-500';
    if (rate < 0.6) return 'bg-yellow-500';
    if (rate < 0.9) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getStatusColor = (rate: number): string => {
    if (rate < averageProgress - 0.1) return 'border-red-200 bg-red-50';
    if (rate > averageProgress + 0.1) return 'border-green-200 bg-green-50';
    return 'border-yellow-200 bg-yellow-50';
  };

  if (!camp) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-lg">
        <p className="text-amber-800 font-medium">合宿を選択してください</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-300 p-8 rounded-lg text-center">
        <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">試合データがありません</p>
        <p className="text-sm text-slate-500 mt-2">トーナメントを生成してください</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 全体サマリー */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-indigo-200 bg-indigo-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-indigo-700 flex items-center gap-2">
              <Award className="w-4 h-4" />
              全体進行率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-900">
              {(averageProgress * 100).toFixed(1)}%
            </div>
            <div className="mt-2 bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-500"
                style={{ width: `${averageProgress * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              最速種目
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-green-900 truncate">
              {stats.length > 0 ? stats[stats.length - 1].label : '-'}
            </div>
            <div className="text-sm text-green-700">
              {stats.length > 0 ? `${(stats[stats.length - 1].progressRate * 100).toFixed(0)}% 完了` : '-'}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              最遅種目
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-red-900 truncate">
              {stats.length > 0 ? stats[0].label : '-'}
            </div>
            <div className="text-sm text-red-700">
              {stats.length > 0 ? `${(stats[0].progressRate * 100).toFixed(0)}% 完了` : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 種目別進行状況 */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-800 mb-4">種目別進行状況</h3>
        {stats.map((stat, index) => (
          <Card key={`progress-stat-${index}-${stat.tournamentType}-${stat.division}`} className={`border-2 ${getStatusColor(stat.progressRate)}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getProgressIcon(stat.progressRate)}
                  <div>
                    <h4 className="font-bold text-slate-900">{stat.label}</h4>
                    <p className="text-xs text-slate-600">
                      完了 {stat.completed}/{stat.total} 試合
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900">
                    {(stat.progressRate * 100).toFixed(0)}%
                  </div>
                  {stat.progressRate < averageProgress - 0.1 && (
                    <span className="text-xs text-red-600 font-medium">遅延中</span>
                  )}
                  {stat.progressRate > averageProgress + 0.1 && (
                    <span className="text-xs text-green-600 font-medium">先行中</span>
                  )}
                </div>
              </div>

              {/* プログレスバー */}
              <div className="relative bg-slate-200 rounded-full h-4 overflow-hidden">
                <div
                  className={`${getProgressColor(stat.progressRate)} h-full transition-all duration-500`}
                  style={{ width: `${stat.progressRate * 100}%` }}
                />
                {/* 平均ライン */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-slate-900 opacity-50"
                  style={{ left: `${averageProgress * 100}%` }}
                  title={`平均: ${(averageProgress * 100).toFixed(0)}%`}
                />
              </div>

              {/* ステータス詳細 */}
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div className="bg-white px-2 py-1 rounded text-center">
                  <span className="text-slate-500">待機中</span>
                  <span className="block font-bold text-slate-800">{stat.waiting}</span>
                </div>
                <div className="bg-white px-2 py-1 rounded text-center">
                  <span className="text-slate-500">進行中</span>
                  <span className="block font-bold text-slate-800">{stat.active}</span>
                </div>
                <div className="bg-white px-2 py-1 rounded text-center">
                  <span className="text-slate-500">完了</span>
                  <span className="block font-bold text-green-600">{stat.completed}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm">
        <p className="text-indigo-800">
          <strong>ペーシング調整:</strong> 黒い縦線が平均進行率を示します。
          遅延中の種目は自動的に優先されます。
        </p>
      </div>
    </div>
  );
}
