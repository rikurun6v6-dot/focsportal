'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAllDocuments, updateDocument } from '@/lib/firestore-helpers';
import type { Team } from '@/types';
import { useCamp } from '@/context/CampContext';
import { Users, Trophy, RefreshCw } from 'lucide-react';
import { toastSuccess, toastError } from '@/lib/toast';
import { Loading } from '@/components/ui/loading';

const GROUP_LABELS = ['A', 'B', 'C', 'D'] as const;
type GroupLabel = (typeof GROUP_LABELS)[number];

const GROUP_COLORS: Record<GroupLabel, { bg: string; border: string; badge: string; text: string }> = {
  A: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-500', text: 'text-blue-700' },
  B: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-500', text: 'text-green-700' },
  C: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-500', text: 'text-orange-700' },
  D: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-500', text: 'text-purple-700' },
};

export default function LeagueManager() {
  const { camp } = useCamp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    if (!camp) return;
    setLoading(true);
    try {
      const all = await getAllDocuments<Team>('teams');
      setTeams(all.filter(t => !t.campId || t.campId === camp.id));
    } catch {
      toastError('チームの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [camp?.id]);

  const handleAssign = async (teamId: string, group: GroupLabel) => {
    setSaving(teamId);
    try {
      await updateDocument('teams', teamId, { group });
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, group } : t));
      toastSuccess(`予選 ${group} ブロックに割り当てました`);
    } catch {
      toastError('保存に失敗しました');
    } finally {
      setSaving(null);
    }
  };

  if (!camp) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
        <p className="text-amber-800 font-medium">合宿を選択してください</p>
      </div>
    );
  }

  if (loading) return <Loading />;

  if (teams.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">チームが登録されていません</p>
        <p className="text-xs mt-1 text-slate-400">先に「選手」タブでチームを作成してください</p>
      </div>
    );
  }

  // グループ別に分類
  const grouped: Record<GroupLabel | 'unassigned', Team[]> = { A: [], B: [], C: [], D: [], unassigned: [] };
  teams.forEach(t => {
    const g = t.group as GroupLabel;
    if (GROUP_LABELS.includes(g)) {
      grouped[g].push(t);
    } else {
      grouped.unassigned.push(t);
    }
  });

  const allAssigned = grouped.unassigned.length === 0;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-indigo-500" />
            リーグ編成
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            各チームを予選ブロック（A〜D）に手動で割り当てます。設定はFirestoreに即時保存されます。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          更新
        </Button>
      </div>

      {/* 完了バナー */}
      {allAssigned && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
          ✅ 全チームがブロックに割り当て済みです。試合生成時にこのグループ分けが使用されます。
        </div>
      )}

      {/* 未割り当てチーム */}
      {grouped.unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4" />
            未割り当てチーム（{grouped.unassigned.length}チーム）
          </h3>
          <div className="space-y-2">
            {grouped.unassigned.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2">
                <span className="flex-1 text-sm font-medium text-slate-800">{t.name}</span>
                <div className="flex gap-1">
                  {GROUP_LABELS.map(g => {
                    const c = GROUP_COLORS[g];
                    return (
                      <Button
                        key={g}
                        size="sm"
                        variant="outline"
                        disabled={saving === t.id}
                        onClick={() => handleAssign(t.id, g)}
                        className={`h-7 w-8 text-xs font-bold border-2 ${c.border} ${c.text} hover:${c.bg}`}
                      >
                        {g}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* グループ別表示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {GROUP_LABELS.map(g => {
          const c = GROUP_COLORS[g];
          const groupTeams = grouped[g];
          return (
            <div key={g} className={`rounded-lg border-2 ${c.border} ${c.bg} p-3 min-h-[140px]`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-black text-white ${c.badge} px-2 py-0.5 rounded-full`}>
                  予選 {g}
                </span>
                <span className="text-xs text-slate-500">{groupTeams.length}チーム</span>
              </div>

              {groupTeams.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center mt-4">チームを割り当ててください</p>
              ) : (
                <div className="space-y-1.5">
                  {groupTeams.map(t => (
                    <div key={t.id} className="bg-white rounded border border-slate-200 px-2 py-1.5 flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-slate-800 flex-1 truncate">{t.name}</span>
                      {/* 他グループへの移動ボタン */}
                      <div className="flex gap-0.5 flex-shrink-0">
                        {GROUP_LABELS.filter(other => other !== g).map(other => {
                          const oc = GROUP_COLORS[other];
                          return (
                            <button
                              key={other}
                              disabled={saving === t.id}
                              onClick={() => handleAssign(t.id, other)}
                              title={`${other}ブロックへ移動`}
                              className={`text-[10px] font-bold px-1 py-0.5 rounded ${oc.text} hover:${oc.bg} transition-colors disabled:opacity-50`}
                            >
                              {other}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 凡例・説明 */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-700 mb-1">使い方</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>未割り当てチームの行にある <strong>A/B/C/D</strong> ボタンをクリックしてブロックに振り分けます</li>
          <li>割り当て済みチームのカードにある小さなボタンで別ブロックへ移動できます</li>
          <li>設定は即時 Firestore に保存され、試合生成時に <code className="bg-slate-100 px-1 rounded">match.group</code> フィールドとして反映されます</li>
          <li>各ブロック内のチームは round-robin（総当たり）形式で試合が生成されます</li>
        </ul>
      </div>
    </div>
  );
}
