'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import {
  subscribeToCourts,
  getMatchWithPlayers,
  updateMatchResult,
  updateDocument,
  recordWalkover,
  freeCourtManually,
  unfreeCourtManually,
  moveMatchToCourt,
  getAllDocuments,
  getDocument,
  setMatchBreak,
  cancelMatchBreak,
  startMatchOnReservedCourt,
  resetMatchResult,
  swapMatchWinner
} from '@/lib/firestore-helpers';
import { recordMatchDuration } from '@/lib/eta';
import type { Match, Court, MatchWithPlayers, Team, Player, Config } from '@/types';
import { buildScoreContext, calcMatchScore, getGroupKey } from '@/lib/matchScoring';
import { diagnoseWaitingMatches, type MatchDiagnostic } from '@/lib/dispatcher';
import { getRoundName } from '@/lib/formatters';
import { useCamp } from '@/context/CampContext';
import { Clock, Users, Monitor, AlertTriangle, ChevronDown, ChevronUp, Pencil, Check, X, ArrowLeftRight } from 'lucide-react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastSuccess, toastError } from '@/lib/toast';

export default function ResultsTab() {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchesCache, setMatchesCache] = useState<Record<string, MatchWithPlayers>>({});
  const [scores, setScores] = useState<Record<string, { p1: number; p2: number }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showInputFor, setShowInputFor] = useState<string | null>(null);
  const [showCourtChangeFor, setShowCourtChangeFor] = useState<string | null>(null);
  const [availableCourts, setAvailableCourts] = useState<Court[]>([]);
  const [showBreakFor, setShowBreakFor] = useState<string | null>(null);
  const [breakingMatches, setBreakingMatches] = useState<MatchWithPlayers[]>([]);
  const [showAddBreakFor, setShowAddBreakFor] = useState<string | null>(null);
  // 種目ごとの最大ラウンド数（全試合から算出）
  const [maxRoundByType, setMaxRoundByType] = useState<Record<string, number>>({});
  // 待機中の試合リスト（強制アサイン用）
  const [waitingMatches, setWaitingMatches] = useState<MatchWithPlayers[]>([]);
  const [showForceAssignFor, setShowForceAssignFor] = useState<string | null>(null);
  // コートが空で試合が休息待ちの場合の警告
  const [blockedMatchCount, setBlockedMatchCount] = useState(0);
  // 予選グループ進行度マップ: `${type}_${division}_${group}` → {done, total}
  const [groupProgressMap, setGroupProgressMap] = useState<Record<string, { done: number; total: number }>>({});
  // 団体戦: チーム名マップ (teamId → teamName)
  const [teamsMap, setTeamsMap] = useState<Record<string, string>>({});
  // 待機試合の優先スコア (matchId → score)
  const [waitingScores, setWaitingScores] = useState<Record<string, number>>({});
  // コートが空になった時刻の追跡 (courtId → timestamp ms)
  const [courtEmptySince, setCourtEmptySince] = useState<Record<string, number>>({});
  // アサイン診断結果
  const [diagnostics, setDiagnostics] = useState<MatchDiagnostic[]>([]);
  // 診断カードの展開状態 (matchId → boolean)
  const [expandedDiagnostic, setExpandedDiagnostic] = useState<Record<string, boolean>>({});
  // 選手名インライン編集
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingPlayerName, setEditingPlayerName] = useState('');

  // 10秒ごとに現在時刻を更新（経過時間表示用）
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000); // 10秒ごと
    return () => clearInterval(timer);
  }, []);

  // 団体戦チーム名を取得
  useEffect(() => {
    getAllDocuments<Team>('teams').then(teams => {
      const map: Record<string, string> = {};
      teams.forEach(t => { map[t.id] = t.name; });
      setTeamsMap(map);
    }).catch(() => {});
  }, []);

  // 休憩中の試合を取得
  useEffect(() => {
    if (!camp) return;

    const fetchBreakingMatches = async () => {
      try {
        const allMatches = await getAllDocuments<Match>('matches');

        // 種目ごとの最大ラウンドを計算（全試合ベース）
        const byType: Record<string, number> = {};
        allMatches.forEach(m => {
          if (!m.tournament_type || !m.division || !m.round) return;
          const key = `${m.tournament_type}_${m.division}`;
          if (!byType[key] || m.round > byType[key]) byType[key] = m.round;
        });
        setMaxRoundByType(byType);

        // 予選グループ進行度を計算（この合宿のgroupあり試合のみ）
        const gMap: Record<string, { done: number; total: number }> = {};
        allMatches.filter(m => m.campId === camp.id && m.group).forEach(m => {
          const gKey = `${m.tournament_type}_${m.division}_${m.group}`;
          if (!gMap[gKey]) gMap[gKey] = { done: 0, total: 0 };
          gMap[gKey].total++;
          if (m.status === 'calling' || m.status === 'playing' || m.status === 'completed') {
            gMap[gKey].done++;
          }
        });
        setGroupProgressMap(gMap);

        const breaking = allMatches.filter(m =>
          m.campId === camp.id &&
          m.status === 'waiting' &&
          m.available_at &&
          m.reserved_court_id
        );

        // 各試合の選手情報を取得
        const breakingWithPlayers = await Promise.all(
          breaking.map(async (match) => {
            const withPlayers = await getMatchWithPlayers(match.id);
            return withPlayers;
          })
        );

        setBreakingMatches(breakingWithPlayers.filter((m): m is MatchWithPlayers => m !== null));

        // 待機中の試合（強制アサイン用）- enabled_tournamentsでフィルタ
        const campConfig = await getDocument<Config>('config', camp.id).catch(() => undefined);
        const enabledTypes = campConfig?.enabled_tournaments;
        const waiting = allMatches.filter(m =>
          m.campId === camp.id &&
          m.status === 'waiting' &&
          m.player1_id && m.player2_id &&
          (!enabledTypes || enabledTypes.length === 0 || enabledTypes.includes(m.tournament_type as any))
        );
        const waitingWithPlayers = await Promise.all(
          waiting.slice(0, 50).map(m => getMatchWithPlayers(m.id))
        );
        const resolvedWaiting = waitingWithPlayers.filter((m): m is MatchWithPlayers => m !== null);
        setWaitingMatches(resolvedWaiting);

        // 優先スコアを計算（dispatcher と同一ロジック）
        try {
          const allPlayersData = await getAllDocuments<Player>('players');
          const scoreCtx = buildScoreContext(allMatches, allPlayersData);
          const scores: Record<string, number> = {};
          resolvedWaiting.forEach(m => { scores[m.id] = calcMatchScore(m, scoreCtx); });
          setWaitingScores(scores);
        } catch {
          // スコア計算失敗は無視（表示のみの機能）
        }

        // アサイン診断（空きコートがある場合のみ）
        try {
          const diag = await diagnoseWaitingMatches(camp.id, 10);
          setDiagnostics(diag);
        } catch {
          // 表示専用、エラーは無視
        }

        // 空コートがあるが試合が休息中の場合の検知
        const now = Date.now();
        const allCourtsData = await getAllDocuments<{ id: string; is_active: boolean; current_match_id: string | null; manually_freed?: boolean; campId?: string }>('courts');
        const campCourts = allCourtsData.filter(c => c.campId === camp.id);
        const emptyCourts = campCourts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);
        if (emptyCourts.length > 0 && waiting.length > 0) {
          const blocked = waiting.filter(m => m.available_at && now < m.available_at.toMillis());
          setBlockedMatchCount(blocked.length === waiting.length ? blocked.length : 0);
        } else {
          setBlockedMatchCount(0);
        }
      } catch (error) {
        console.error('Error fetching breaking matches:', error);
      }
    };

    fetchBreakingMatches();
    const interval = setInterval(fetchBreakingMatches, 10000); // 10秒ごとに更新

    return () => clearInterval(interval);
  }, [camp?.id]);

  useEffect(() => {
    if (!camp) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToCourts(async (updatedCourts) => {
      const sorted = updatedCourts.sort((a, b) => {
        const numA = a.number || parseInt(a.id.replace('court_', '') || "0");
        const numB = b.number || parseInt(b.id.replace('court_', '') || "0");
        return numA - numB;
      });
      setCourts(sorted);
      setLoading(false);

      // コートが空になった時刻を追跡（性別制限の経過時間表示用）
      setCourtEmptySince(prev => {
        const now = Date.now();
        const updated = { ...prev };
        sorted.forEach(c => {
          if (!c.current_match_id) {
            if (!updated[c.id]) updated[c.id] = now;
          } else {
            delete updated[c.id];
          }
        });
        return updated;
      });

      // 試合データを取得
      const matchIds = sorted
        .map(c => c.current_match_id)
        .filter((id): id is string => !!id);

      const newMatches: Record<string, MatchWithPlayers> = {};
      await Promise.all(
        matchIds.map(async (id) => {
          try {
            const match = await getMatchWithPlayers(id);
            if (match) {
              newMatches[id] = match;
            }
          } catch (e) {
            console.error(`Error fetching match ${id}:`, e);
          }
        })
      );

      setMatchesCache(prev => ({ ...prev, ...newMatches }));
    }, camp.id);

    return () => unsubscribe();
  }, [camp?.id]);

  const handleScoreChange = (matchId: string, player: 'p1' | 'p2', value: string) => {
    const numValue = parseInt(value) || 0;
    setScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [player]: numValue,
      },
    }));
  };

  const handleSubmit = async (match: MatchWithPlayers, courtId: string) => {
    const score = scores[match.id];
    if (!score || (score.p1 === 0 && score.p2 === 0)) {
      alert('スコアを入力してください');
      return;
    }

    const winnerId = score.p1 > score.p2 ? match.player1_id : match.player2_id;
    setSubmitting(match.id);

    try {
      await updateMatchResult(match.id, score.p1, score.p2, winnerId);
      // 同じ試合IDが割り当てられている全コートを解放（団体戦3面同時対応）
      const courtsToFree = courts.filter(c => c.current_match_id === match.id);
      await Promise.all(courtsToFree.map(c => updateDocument('courts', c.id, { current_match_id: null })));
      await recordMatchDuration(match.id);

      setScores(prev => {
        const newScores = { ...prev };
        delete newScores[match.id];
        return newScores;
      });
    } catch (error) {
      alert('エラーが発生しました');
    }

    setSubmitting(null);
  };

  const handleSavePlayerName = async (playerId: string) => {
    const newName = editingPlayerName.trim();
    if (!newName) return;
    try {
      await updateDocument('players', playerId, { name: newName });
      setMatchesCache(prev => {
        const updated: Record<string, MatchWithPlayers> = {};
        Object.entries(prev).forEach(([matchId, m]) => {
          const patch = (p?: Player) => p?.id === playerId ? { ...p, name: newName } : p;
          updated[matchId] = {
            ...m,
            player1: patch(m.player1) ?? m.player1,
            player2: patch(m.player2) ?? m.player2,
            player3: patch(m.player3),
            player4: patch(m.player4),
            player5: patch(m.player5),
            player6: patch(m.player6),
          };
        });
        return updated;
      });
      setEditingPlayerId(null);
      toastSuccess('名前を更新しました');
    } catch {
      toastError('名前の更新に失敗しました');
    }
  };

  const handleWalkover = async (match: MatchWithPlayers, courtId: string, winnerSide: 1 | 2) => {
    const winnerName = winnerSide === 1
      ? [match.player1.name, match.player3?.name, match.player5?.name].filter(Boolean).join(' / ')
      : [match.player2.name, match.player4?.name, match.player6?.name].filter(Boolean).join(' / ');

    const confirmed = await confirm({
      title: '🏸 不戦勝の記録',
      message: `${winnerName} の不戦勝として記録しますか？`,
      confirmText: '記録する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    setSubmitting(match.id);
    try {
      await recordWalkover(match.id, winnerSide);
      await updateDocument('courts', courtId, { current_match_id: null });
      toastSuccess(`${winnerName} の不戦勝を記録しました`);
    } catch (error) {
      toastError('エラーが発生しました');
    }
    setSubmitting(null);
  };

  const handleFreeCourt = async (courtId: string) => {
    const confirmed = await confirm({
      title: '🆓 コートをフリーにする（手動固定）',
      message: 'このコートをフリー状態にしますか？\n現在の試合は削除されずに待機リストの先頭に戻ります。\n\n※ 自動割り当てが無効になり、手動で「割り当て再開」するまでフリー状態を維持します。',
      confirmText: 'フリーにする',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await freeCourtManually(courtId);
      if (success) {
        toastSuccess('コートをフリーにしました（試合は待機リストの先頭に戻りました）');
      } else {
        toastError('コートのフリー化に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleResumeAllocation = async (courtId: string) => {
    const confirmed = await confirm({
      title: '▶️ 割り当て再開',
      message: 'このコートの自動割り当てを再開しますか？\n待機中の試合が自動的に割り当てられるようになります。',
      confirmText: '再開する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await unfreeCourtManually(courtId);
      if (success) {
        toastSuccess('自動割り当てを再開しました');
      } else {
        toastError('再開に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleGenderUnlock = async (courtId: string) => {
    try {
      await updateDocument('courts', courtId, { manual_gender_unlock: true });
      toastSuccess('逆性別の試合を許可しました。次回の自動割り当てで反映されます。');
    } catch {
      toastError('エラーが発生しました');
    }
  };

  const handleCancelGenderUnlock = async (courtId: string) => {
    try {
      await updateDocument('courts', courtId, { manual_gender_unlock: false });
    } catch {
      toastError('エラーが発生しました');
    }
  };

  const handleShowCourtChange = async (matchId: string) => {
    // 利用可能なコートを取得
    const allCourts = await getAllDocuments<Court>('courts');
    const available = camp ? allCourts.filter(c =>
      c.campId === camp.id &&
      c.is_active &&
      !c.current_match_id
    ) : [];
    setAvailableCourts(available);
    setShowCourtChangeFor(matchId);
  };

  const handleCourtChange = async (matchId: string, targetCourtId: string) => {
    const confirmed = await confirm({
      title: '🔄 コート変更',
      message: `この試合を指定のコートに移動しますか？`,
      confirmText: '移動する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) {
      setShowCourtChangeFor(null);
      return;
    }

    try {
      const success = await moveMatchToCourt(matchId, targetCourtId);
      if (success) {
        toastSuccess('試合を移動しました');
        setShowCourtChangeFor(null);
      } else {
        toastError('コート変更に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleSetBreak = async (matchId: string, courtId: string, minutes: number) => {
    const confirmed = await confirm({
      title: '⏸️ 休憩設定',
      message: `この試合を${minutes}分間休憩させますか？\nコートは一時的に解放され、時間が来たら元のコートへ優先的に復帰します。`,
      confirmText: '休憩する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) {
      setShowBreakFor(null);
      return;
    }

    try {
      const success = await setMatchBreak(matchId, courtId, minutes);
      if (success) {
        toastSuccess(`${minutes}分の休憩を設定しました`);
        setShowBreakFor(null);
      } else {
        toastError('休憩設定に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleCancelBreak = async (matchId: string) => {
    const confirmed = await confirm({
      title: '▶️ 休憩解除',
      message: `休憩を解除して即座に復帰可能にしますか？`,
      confirmText: '解除する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await cancelMatchBreak(matchId);
      if (success) {
        toastSuccess('休憩を解除しました');
      } else {
        toastError('休憩解除に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleAddBreak = async (matchId: string, courtId: string, minutes: number) => {
    const confirmed = await confirm({
      title: '⏸️ 休憩を延長',
      message: `さらに${minutes}分間休憩を延長しますか？`,
      confirmText: '延長する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) {
      setShowAddBreakFor(null);
      return;
    }

    try {
      const success = await setMatchBreak(matchId, courtId, minutes);
      if (success) {
        toastSuccess(`${minutes}分の休憩を追加しました`);
        setShowAddBreakFor(null);
      } else {
        toastError('休憩延長に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleForceAssign = async (matchId: string, courtId: string) => {
    // 種目ロック確認（enabled_tournamentsに含まれない種目は完全ブロック）
    const match = waitingMatches.find(m => m.id === matchId);
    if (match?.tournament_type) {
      try {
        const campConfig = await getDocument<Config>('config', camp?.id || '');
        const enabled = campConfig?.enabled_tournaments;
        if (enabled && enabled.length > 0 && !enabled.includes(match.tournament_type as any)) {
          toastError(`「${match.tournament_type}」は進行制御でロック中です。操作タブで種目を有効にしてから割り当ててください。`);
          setShowForceAssignFor(null);
          return;
        }
      } catch { /* config取得失敗時はスルー */ }
    }

    const confirmed = await confirm({
      title: '⚡ 強制アサイン',
      message: `この試合をコートに強制的に割り当てますか？`,
      confirmText: '割り当てる',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) { setShowForceAssignFor(null); return; }
    try {
      // コートに既存の試合がある場合はその試合の court_id を解除（ゴースト防止）
      const targetCourt = courts.find(c => c.id === courtId);
      if (targetCourt?.current_match_id && targetCourt.current_match_id !== matchId) {
        await updateDocument('matches', targetCourt.current_match_id, { court_id: null });
      }

      // available_at / reserved_court_id をクリアしてラウンドロックを解除
      await updateDocument('matches', matchId, {
        status: 'calling',
        court_id: courtId,
        available_at: null,
        reserved_court_id: null,
      });
      await updateDocument('courts', courtId, { current_match_id: matchId });
      // Web Push 通知（fire-and-forget）
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      }).catch(() => {});
      toastSuccess('試合を割り当てました');
      setShowForceAssignFor(null);
    } catch {
      toastError('エラーが発生しました');
    }
  };

  const handleCancelResult = async (matchId: string) => {
    const confirmed = await confirm({
      title: '↩️ 結果を取り消す',
      message: `試合結果を取り消して待機状態に戻しますか？\n次ラウンドへの進出も取り消されます。`,
      confirmText: '取り消す',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;
    try {
      const success = await resetMatchResult(matchId);
      if (success) toastSuccess('結果を取り消しました');
      else toastError('取り消しに失敗しました');
    } catch {
      toastError('エラーが発生しました');
    }
  };

  const handleSwapWinner = async (matchId: string) => {
    const confirmed = await confirm({
      title: '⇄ 勝者入れ替え',
      message: '勝者と敗者を入れ替えますか？\nスコアが反転し、次ラウンドの進出選手も変更されます。',
      confirmText: '入れ替える',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;
    try {
      const result = await swapMatchWinner(matchId);
      if (result.success) toastSuccess('勝者を入れ替えました');
      else toastError(result.error || '入れ替えに失敗しました');
    } catch {
      toastError('エラーが発生しました');
    }
  };

  const handleStartOnReservedCourt = async (matchId: string) => {
    // 進行制御チェック（enabled_tournamentsに含まれない種目は完全ブロック）
    const match = breakingMatches.find(m => m.id === matchId);
    if (match?.tournament_type) {
      try {
        const campConfig = await getDocument<Config>('config', camp?.id || '');
        const enabled = campConfig?.enabled_tournaments;
        if (enabled && enabled.length > 0 && !enabled.includes(match.tournament_type as any)) {
          toastError(`「${match.tournament_type}」は進行制御でロック中です。操作タブで種目を有効にしてから開始してください。`);
          return;
        }
      } catch { /* config取得失敗時はスルー */ }
    }

    const confirmed = await confirm({
      title: '▶️ 試合開始',
      message: `この試合を予約コートで開始しますか？`,
      confirmText: '開始する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await startMatchOnReservedCourt(matchId);
      if (success) {
        toastSuccess('試合を開始しました');
      } else {
        toastError('試合開始に失敗しました（コートが使用中の可能性があります）');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const getCategoryLabel = (type: string | undefined) => {
    if (!type) return "不明";
    const map: Record<string, string> = {
      mens_doubles: "男子D",
      womens_doubles: "女子D",
      mixed_doubles: "混合D",
      mens_singles: "男子S",
      womens_singles: "女子S",
      team_battle: "団体戦"
    };
    return map[type] || type;
  };

  const getRoundLabel = (match: MatchWithPlayers | null) => {
    if (!match) return "-";
    // 全試合から計算したmaxRoundByTypeを使用（現在コート上の試合のみではなく全体から算出）
    const key = `${match.tournament_type}_${match.division}`;
    const maxRound = maxRoundByType[key] || match.round;
    return getRoundName(match.round, maxRound);
  };

  const getElapsedTime = (match: MatchWithPlayers | null) => {
    if (!match) return null;

    // callingまたはplayingステータスの場合、start_timeまたはupdated_atを使用
    const startTime = match.start_time || match.updated_at;
    if (!startTime) return null;

    const startMs = startTime.toMillis();
    const elapsed = Math.floor((currentTime - startMs) / 1000);

    if (elapsed < 0) return null;

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };;

  // 団体戦: チーム名取得
  const getTeamName = (match: MatchWithPlayers, side: 1 | 2): string => {
    const player = side === 1 ? match.player1 : match.player2;
    if (!player?.team_id) return `チーム${side}`;
    return teamsMap[player.team_id] || player.team_id;
  };

  // 団体戦判定
  const isTeamBattle = (match: MatchWithPlayers | null) => match?.tournament_type === 'team_battle';

  if (!camp) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-lg">
        <p className="text-amber-800 font-medium">合宿を選択してください</p>
      </div>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-4">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">コート別結果入力</h2>
            <p className="text-sm text-slate-600 mt-1">各コートで進行中の試合のスコアを直接入力できます</p>
          </div>
          <a href={`/preview?campId=${camp?.id ?? ''}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 border-slate-300 text-slate-600 hover:bg-slate-50">
              <Monitor className="w-4 h-4" />
              モニター
            </Button>
          </a>
        </div>

        {/* 空きコートがあるが試合が休息待ちの場合の警告 */}
        {blockedMatchCount > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              空きコートがありますが、待機中の試合（{blockedMatchCount}試合）はすべて休息時間中のため自動割り当てできません。
              下の「強制アサイン」から手動で割り当てるか、しばらくお待ちください。
            </p>
          </div>
        )}

        {/* 休憩中の試合 */}
        {breakingMatches.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-bold text-orange-700 mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              休憩中の試合
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {breakingMatches.map((match) => {
                const remainingMinutes = match.available_at
                  ? Math.max(0, Math.ceil((match.available_at.toMillis() - currentTime) / (1000 * 60)))
                  : 0;
                const courtNumber = match.reserved_court_id
                  ? courts.find(c => c.id === match.reserved_court_id)?.number || '?'
                  : '?';

                return (
                  <Card key={match.id} className="border-orange-300 bg-orange-50">
                    <CardHeader className="pb-2 bg-gradient-to-r from-orange-100 to-yellow-50">
                      <CardTitle className="flex items-center justify-between">
                        <span className="text-sm font-bold text-orange-700">
                          {courtNumber}コート予約
                        </span>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-full">
                            {getCategoryLabel(match.tournament_type)}
                          </span>
                          <span className="text-[10px] font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">
                            {getRoundLabel(match)}
                          </span>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="space-y-2">
                        <div className="bg-white p-2 rounded border border-orange-200">
                          <p className="font-bold text-slate-800 text-center text-xs">
                            {[match.player1?.name, match.player3?.name, match.player5?.name].filter(Boolean).join(' / ') || '未登録'}
                          </p>
                        </div>
                        <div className="flex items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-400">VS</span>
                        </div>
                        <div className="bg-white p-2 rounded border border-orange-200">
                          <p className="font-bold text-slate-800 text-center text-xs">
                            {[match.player2?.name, match.player4?.name, match.player6?.name].filter(Boolean).join(' / ') || '未登録'}
                          </p>
                        </div>

                        <div className={`flex items-center justify-center gap-2 px-2 py-1 rounded text-xs ${remainingMinutes > 0
                            ? 'text-orange-600 bg-orange-100'
                            : 'text-green-600 bg-green-100'
                          }`}>
                          <Clock className="w-3 h-3" />
                          <span className="font-bold">
                            {remainingMinutes > 0 ? `あと${remainingMinutes}分` : '✓ 休憩完了'}
                          </span>
                        </div>

                        {remainingMinutes > 0 ? (
                          // 休憩中（まだ時間が残っている）
                          <Button
                            onClick={() => handleCancelBreak(match.id)}
                            variant="outline"
                            size="sm"
                            className="w-full border-orange-400 text-orange-700 hover:bg-orange-100 h-7 text-xs"
                          >
                            ⏭️ 休憩をスキップ（即時復帰可能）
                          </Button>
                        ) : (
                          // 休憩完了（復帰可能）
                          <>
                            {showAddBreakFor === match.id ? (
                              <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-1.5">
                                <p className="text-[10px] font-bold text-orange-800">追加休憩時間を選択:</p>
                                <div className="grid grid-cols-4 gap-1">
                                  {[5, 10, 15, 20].map(minutes => (
                                    <Button
                                      key={minutes}
                                      onClick={() => handleAddBreak(match.id, match.reserved_court_id!, minutes)}
                                      size="sm"
                                      variant="outline"
                                      className="border-orange-300 text-orange-700 hover:bg-orange-100 h-7 text-xs px-1"
                                    >
                                      {minutes}分
                                    </Button>
                                  ))}
                                </div>
                                <Button
                                  onClick={() => setShowAddBreakFor(null)}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-[10px] h-6"
                                >
                                  キャンセル
                                </Button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5">
                                <Button
                                  onClick={() => handleStartOnReservedCourt(match.id)}
                                  variant="default"
                                  size="sm"
                                  className="bg-green-500 hover:bg-green-600 text-white h-7 text-xs"
                                >
                                  ▶️ 試合開始
                                </Button>
                                <Button
                                  onClick={() => setShowAddBreakFor(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-orange-400 text-orange-700 hover:bg-orange-100 h-7 text-xs"
                                >
                                  ➕ 休憩延長
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(() => {
            // 同一matchIdを持つコート数と、プライマリ（最小コート番号）を計算
            const courtCountByMatch: Record<string, number> = {};
            const primaryCourtByMatch: Record<string, string> = {};
            courts.forEach(c => {
              if (!c.current_match_id) return;
              courtCountByMatch[c.current_match_id] = (courtCountByMatch[c.current_match_id] || 0) + 1;
              const existingPrimaryId = primaryCourtByMatch[c.current_match_id];
              if (!existingPrimaryId) {
                primaryCourtByMatch[c.current_match_id] = c.id;
              } else {
                const existing = courts.find(ct => ct.id === existingPrimaryId);
                if (existing && c.number < existing.number) {
                  primaryCourtByMatch[c.current_match_id] = c.id;
                }
              }
            });

            return courts.map((court) => {
            const courtNumber = court.number || court.id.replace('court_', '');
            const isOccupied = !!court.current_match_id;
            const match = isOccupied && court.current_match_id ? matchesCache[court.current_match_id] : null;
            const matchCourtCount = match ? (courtCountByMatch[match.id] || 1) : 1;
            const isPrimaryCourtForMatch = match ? primaryCourtByMatch[match.id] === court.id : true;
            const primaryCourtNumber = (!isPrimaryCourtForMatch && match)
              ? (courts.find(c => c.id === primaryCourtByMatch[match.id])?.number ?? '?')
              : null;

            return (
              <Card key={court.id} className={`relative ${isOccupied ? 'border-sky-300 shadow-lg' : 'border-slate-200'}`}>
                <CardHeader className={`pb-2 ${isOccupied ? 'bg-gradient-to-r from-sky-50 to-blue-50' : 'bg-slate-50'}`}>
                  <CardTitle className="flex items-center justify-between">
                    <span className={`text-xl font-black ${isOccupied ? 'text-sky-600' : 'text-slate-400'}`}>
                      {courtNumber}コート
                    </span>
                    {match && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-bold text-white bg-sky-500 px-1.5 py-0.5 rounded-full">
                          {getCategoryLabel(match.tournament_type)}
                        </span>
                        {/* 団体戦マルチコートバッジ */}
                        {isTeamBattle(match) && matchCourtCount > 1 && (
                          <span className="text-[10px] font-bold text-white bg-rose-500 px-1.5 py-0.5 rounded-full">
                            {matchCourtCount}面同時
                          </span>
                        )}
                        <span className="text-[10px] font-medium text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full">
                          {isTeamBattle(match)
                            ? (match.group ? `グループ${match.group}` : '団体')
                            : (match.subtitle || getRoundLabel(match))}
                        </span>
                        {match.division && (
                          <span className="text-[10px] font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">
                            {match.division}部
                          </span>
                        )}
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>

                <CardContent className="pt-2">
                  {isOccupied && match ? (
                    <div className="space-y-2">
                      {/* 選手表示（団体戦はチーム名） */}
                      <div className="space-y-1.5">
                        <div className="bg-white p-2 rounded border border-slate-200">
                          {isTeamBattle(match) ? (
                            <p className="font-bold text-slate-800 text-center text-base">{getTeamName(match, 1)}</p>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {([match.player1, match.player3, match.player5] as (Player | undefined)[]).filter(Boolean).map((player) => (
                                <div key={player!.id} className="flex items-center justify-center gap-1">
                                  {editingPlayerId === player!.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={editingPlayerName}
                                        onChange={(e) => setEditingPlayerName(e.target.value)}
                                        className="h-6 text-xs text-center w-24 px-1"
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSavePlayerName(player!.id); if (e.key === 'Escape') setEditingPlayerId(null); }}
                                        autoFocus
                                      />
                                      <Button size="sm" className="h-5 w-5 p-0" onClick={() => handleSavePlayerName(player!.id)}><Check className="w-3 h-3" /></Button>
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingPlayerId(null)}><X className="w-3 h-3" /></Button>
                                    </div>
                                  ) : (
                                    <span
                                      className="text-sm font-bold text-slate-800 cursor-pointer hover:text-sky-600 flex items-center gap-0.5 group"
                                      onClick={() => { setEditingPlayerId(player!.id); setEditingPlayerName(player!.name); }}
                                    >
                                      {player!.name}
                                      <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-sky-400 opacity-0 group-hover:opacity-100" />
                                    </span>
                                  )}
                                </div>
                              ))}
                              {!match.player1 && <span className="text-sm text-slate-400">未登録</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-400">VS</span>
                        </div>

                        <div className="bg-white p-2 rounded border border-slate-200">
                          {isTeamBattle(match) ? (
                            <p className="font-bold text-slate-800 text-center text-base">{getTeamName(match, 2)}</p>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {([match.player2, match.player4, match.player6] as (Player | undefined)[]).filter(Boolean).map((player) => (
                                <div key={player!.id} className="flex items-center justify-center gap-1">
                                  {editingPlayerId === player!.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={editingPlayerName}
                                        onChange={(e) => setEditingPlayerName(e.target.value)}
                                        className="h-6 text-xs text-center w-24 px-1"
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSavePlayerName(player!.id); if (e.key === 'Escape') setEditingPlayerId(null); }}
                                        autoFocus
                                      />
                                      <Button size="sm" className="h-5 w-5 p-0" onClick={() => handleSavePlayerName(player!.id)}><Check className="w-3 h-3" /></Button>
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingPlayerId(null)}><X className="w-3 h-3" /></Button>
                                    </div>
                                  ) : (
                                    <span
                                      className="text-sm font-bold text-slate-800 cursor-pointer hover:text-sky-600 flex items-center gap-0.5 group"
                                      onClick={() => { setEditingPlayerId(player!.id); setEditingPlayerName(player!.name); }}
                                    >
                                      {player!.name}
                                      <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-sky-400 opacity-0 group-hover:opacity-100" />
                                    </span>
                                  )}
                                </div>
                              ))}
                              {!match.player2 && <span className="text-sm text-slate-400">未登録</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ステータス表示（管理者画面：callingも「試合中」と表示） */}
                      {match.status === 'calling' && (
                        <div className="flex items-center justify-center gap-2 text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-xs">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                          </span>
                          <span className="font-bold">試合中</span>
                          {getElapsedTime(match) && (
                            <>
                              <Clock className="w-3 h-3 ml-1" />
                              <span className="font-mono">{getElapsedTime(match)}</span>
                            </>
                          )}
                        </div>
                      )}

                      {match.status === 'playing' && (
                        <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 px-2 py-1 rounded text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-bold">試合中</span>
                          {getElapsedTime(match) && (
                            <>
                              <span className="font-mono font-bold">{getElapsedTime(match)}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* 団体戦セカンダリコート: スコア入力は別カードに委譲 */}
                      {isTeamBattle(match) && matchCourtCount > 1 && !isPrimaryCourtForMatch && match.status !== 'completed' && (
                        <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-center">
                          <p className="text-[10px] text-rose-700 font-medium">
                            スコア入力は第{primaryCourtNumber}コートのカードから
                          </p>
                        </div>
                      )}

                      {/* スコア入力（結果入力ボタンクリック時に表示） */}
                      {(isTeamBattle(match) && matchCourtCount > 1 && !isPrimaryCourtForMatch && match.status !== 'completed') ? null : match.status === 'completed' ? (
                        <div className="bg-green-50 border border-green-200 rounded p-2">
                          <p className="text-center text-green-800 font-bold text-xs mb-1">試合終了</p>
                          <div className="flex justify-center gap-3 text-xl font-bold">
                            <span className={match.winner_id === match.player1_id ? 'text-green-600' : 'text-gray-400'}>
                              {match.score_p1}{isTeamBattle(match) ? '勝' : ''}
                            </span>
                            <span className="text-gray-400">-</span>
                            <span className={match.winner_id === match.player2_id ? 'text-green-600' : 'text-gray-400'}>
                              {match.score_p2}{isTeamBattle(match) ? '勝' : ''}
                            </span>
                          </div>
                          <Button
                            onClick={() => handleSwapWinner(match.id)}
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 border-amber-400 text-amber-700 hover:bg-amber-50 h-7 text-xs"
                          >
                            ⇄ 勝者入れ替え
                          </Button>
                          <Button
                            onClick={() => handleCancelResult(match.id)}
                            variant="outline"
                            size="sm"
                            className="w-full mt-1 border-red-300 text-red-600 hover:bg-red-50 h-7 text-xs"
                          >
                            ↩️ 結果を取り消す
                          </Button>
                        </div>
                      ) : (
                        <>
                          {showInputFor === match.id ? (
                            <div className="space-y-2 mt-2">
                              {isTeamBattle(match) ? (
                                /* 団体戦: チーム勝利数入力 */
                                <div className="space-y-1">
                                  <p className="text-[10px] text-slate-500 text-center">チーム勝利数を入力 (合計5本)</p>
                                  <div className="flex gap-1.5 items-center">
                                    <div className="flex-1 text-center">
                                      <p className="text-[10px] text-slate-600 truncate">{getTeamName(match, 1)}</p>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="5"
                                        placeholder="0"
                                        value={scores[match.id]?.p1 || ''}
                                        onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                                        className="text-center text-base font-bold h-8 mt-0.5"
                                        disabled={submitting === match.id}
                                      />
                                    </div>
                                    <span className="text-slate-400 font-bold text-sm">勝</span>
                                    <div className="flex-1 text-center">
                                      <p className="text-[10px] text-slate-600 truncate">{getTeamName(match, 2)}</p>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="5"
                                        placeholder="0"
                                        value={scores[match.id]?.p2 || ''}
                                        onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                                        className="text-center text-base font-bold h-8 mt-0.5"
                                        disabled={submitting === match.id}
                                      />
                                    </div>
                                    <span className="text-slate-400 font-bold text-sm">勝</span>
                                  </div>
                                </div>
                              ) : (
                                /* 通常試合: 個人スコア入力 */
                                <div className="flex gap-1.5 items-center">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={scores[match.id]?.p1 || ''}
                                    onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                                    className="text-center text-base font-bold h-8"
                                    disabled={submitting === match.id}
                                  />
                                  <span className="text-slate-400 font-bold text-sm">-</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={scores[match.id]?.p2 || ''}
                                    onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                                    className="text-center text-base font-bold h-8"
                                    disabled={submitting === match.id}
                                  />
                                </div>
                              )}

                              <Button
                                onClick={() => handleSubmit(match, court.id)}
                                disabled={submitting === match.id}
                                className="w-full bg-sky-500 hover:bg-sky-600 h-8 text-xs"
                                size="sm"
                              >
                                {submitting === match.id ? '送信中...' : '結果を確定'}
                              </Button>

                              <div className="grid grid-cols-2 gap-1.5">
                                <Button
                                  onClick={() => handleWalkover(match, court.id, 1)}
                                  disabled={submitting === match.id}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                >
                                  上側 WO
                                </Button>
                                <Button
                                  onClick={() => handleWalkover(match, court.id, 2)}
                                  disabled={submitting === match.id}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                >
                                  下側 WO
                                </Button>
                              </div>

                              <Button
                                onClick={() => setShowInputFor(null)}
                                variant="ghost"
                                size="sm"
                                className="w-full h-7 text-xs"
                              >
                                閉じる
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2 mt-2">
                              <div className="grid grid-cols-4 gap-1.5">
                                <Button
                                  onClick={() => setShowInputFor(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-sky-300 text-sky-700 hover:bg-sky-50 text-xs px-1"
                                >
                                  結果入力
                                </Button>
                                <Button
                                  onClick={() => handleShowCourtChange(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-purple-300 text-purple-700 hover:bg-purple-50 text-xs px-1"
                                >
                                  コート変更
                                </Button>
                                <Button
                                  onClick={() => setShowBreakFor(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-orange-300 text-orange-700 hover:bg-orange-50 text-xs px-1"
                                >
                                  休憩
                                </Button>
                                <Button
                                  onClick={() => handleFreeCourt(court.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-slate-300 text-slate-600 hover:bg-slate-50 text-xs px-1"
                                >
                                  フリー
                                </Button>
                              </div>

                              {/* コート変更ダイアログ */}
                              {showCourtChangeFor === match.id && (
                                <div className="bg-purple-50 border border-purple-200 rounded p-2 space-y-1.5">
                                  <p className="text-[10px] font-bold text-purple-800">移動先のコートを選択:</p>
                                  <div className="grid grid-cols-4 gap-1">
                                    {availableCourts.map(c => {
                                      const num = c.number || c.id.replace('court_', '');
                                      return (
                                        <Button
                                          key={c.id}
                                          onClick={() => handleCourtChange(match.id, c.id)}
                                          size="sm"
                                          variant="outline"
                                          className="border-purple-300 text-purple-700 hover:bg-purple-100 h-7 text-xs px-1"
                                        >
                                          {num}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                  <Button
                                    onClick={() => setShowCourtChangeFor(null)}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-[10px] h-6"
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              )}

                              {/* 休憩時間選択ダイアログ */}
                              {showBreakFor === match.id && (
                                <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-1.5">
                                  <p className="text-[10px] font-bold text-orange-800">休憩時間を選択:</p>
                                  <div className="grid grid-cols-4 gap-1">
                                    {[5, 10, 15, 20].map(minutes => (
                                      <Button
                                        key={minutes}
                                        onClick={() => handleSetBreak(match.id, court.id, minutes)}
                                        size="sm"
                                        variant="outline"
                                        className="border-orange-300 text-orange-700 hover:bg-orange-100 h-7 text-xs px-1"
                                      >
                                        {minutes}分
                                      </Button>
                                    ))}
                                  </div>
                                  <Button
                                    onClick={() => setShowBreakFor(null)}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-[10px] h-6"
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 w-full">
                      <Users className={`w-8 h-8 mb-1.5 ${court.manually_freed ? 'text-amber-300' : 'text-slate-300'}`} />
                      <span className={`text-xs font-medium ${court.manually_freed ? 'text-amber-600' : 'text-slate-400'}`}>
                        フリー
                      </span>
                      {court.manually_freed ? (
                        <>
                          <span className="text-[10px] text-amber-500 mt-0.5 font-medium">🔒 自動割り当て無効</span>
                          <Button
                            onClick={() => handleResumeAllocation(court.id)}
                            variant="outline"
                            size="sm"
                            className="mt-2 border-amber-400 text-amber-700 hover:bg-amber-50 h-7 text-xs px-2"
                          >
                            ▶️ 割り当て再開
                          </Button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-0.5">自由に使用できます</span>
                      )}
                      {/* 性別制限解除ボタン（preferred_gender が設定されているコートのみ表示） */}
                      {court.preferred_gender && !court.manually_freed && (() => {
                        const emptyMins = courtEmptySince[court.id]
                          ? Math.floor((currentTime - courtEmptySince[court.id]) / 60000)
                          : 0;
                        const genderLabel = court.preferred_gender === 'male' ? '男子' : '女子';
                        const oppositeLabel = court.preferred_gender === 'male' ? '女子' : '男子';
                        return (
                          <div className="mt-2 w-full space-y-1">
                            {emptyMins >= 1 && (
                              <p className="text-[10px] text-slate-400 text-center">
                                {genderLabel}専用 · 空き{emptyMins}分
                              </p>
                            )}
                            {court.manual_gender_unlock ? (
                              <div className="flex flex-col gap-1 w-full">
                                <span className="text-[10px] text-green-700 font-medium bg-green-50 border border-green-200 rounded px-2 py-0.5 text-center">
                                  ✓ {oppositeLabel}の試合を許可中
                                </span>
                                <Button
                                  onClick={() => handleCancelGenderUnlock(court.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-[10px] h-6 text-slate-500"
                                >
                                  取り消す
                                </Button>
                              </div>
                            ) : (
                              <Button
                                onClick={() => handleGenderUnlock(court.id)}
                                variant="outline"
                                size="sm"
                                className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 h-7 text-xs"
                              >
                                {oppositeLabel}の試合を許可
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                      {/* 強制アサイン */}
                      <div className="mt-2 w-full">
                        {showForceAssignFor === court.id ? (
                          <div className="bg-blue-50 border border-blue-200 rounded p-2 space-y-1.5">
                            <p className="text-[10px] font-bold text-blue-800">割り当てる試合を選択:</p>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {waitingMatches.length === 0 ? (
                                <p className="text-[10px] text-slate-500 text-center py-1">待機中の試合なし</p>
                              ) : waitingMatches.map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => handleForceAssign(m.id, court.id)}
                                  className="w-full text-left text-[10px] p-1.5 bg-white border border-blue-200 rounded hover:bg-blue-100 truncate"
                                >
                                  #{m.match_number} {[m.player1?.name, m.player3?.name, m.player5?.name].filter(Boolean).join('/') || '?'} vs {[m.player2?.name, m.player4?.name, m.player6?.name].filter(Boolean).join('/') || '?'}
                                </button>
                              ))}
                            </div>
                            <Button onClick={() => setShowForceAssignFor(null)} variant="ghost" size="sm" className="w-full text-[10px] h-6">
                              キャンセル
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => setShowForceAssignFor(court.id)}
                            variant="outline"
                            size="sm"
                            className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 h-7 text-xs"
                          >
                            ⚡ 強制アサイン
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }); // closes courts.map
          })()}
        </div>

        {/* 次の待機試合一覧 */}
        {waitingMatches.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Users className="w-5 h-5" />
              次の待機試合 ({waitingMatches.length}試合)
            </h3>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="divide-y divide-slate-100">
                {[...waitingMatches]
                  .sort((a, b) => {
                    const aBlocked = !!(a.available_at && currentTime < a.available_at.toMillis());
                    const bBlocked = !!(b.available_at && currentTime < b.available_at.toMillis());
                    // 最優先: 待機可能 > 休息中
                    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
                    // スコアが計算済みであれば dispatcher と同一の優先順位で並べる
                    const aScore = waitingScores[a.id];
                    const bScore = waitingScores[b.id];
                    if (aScore !== undefined && bScore !== undefined) return bScore - aScore;
                    // フォールバック: ラウンド → 作成日時
                    if ((a.round || 0) !== (b.round || 0)) return (a.round || 0) - (b.round || 0);
                    return (a.created_at?.toMillis() || 0) - (b.created_at?.toMillis() || 0);
                  })
                  .map((match, idx) => {
                    const isBlocked = !!(match.available_at && currentTime < match.available_at.toMillis());
                    const remainingMinutes = match.available_at
                      ? Math.max(0, Math.ceil((match.available_at.toMillis() - currentTime) / (1000 * 60)))
                      : 0;
                    const groupKey = match.group
                      ? `${match.tournament_type}_${match.division}_${match.group}`
                      : null;
                    const groupProg = groupKey ? groupProgressMap[groupKey] : null;
                    return (
                      <div
                        key={match.id}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm ${isBlocked ? 'opacity-50 bg-slate-50' : idx % 2 === 0 ? 'hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'}`}
                      >
                        <span className="text-xs text-slate-400 w-6 flex-shrink-0 font-mono text-right">
                          {idx + 1}
                        </span>
                        {waitingScores[match.id] !== undefined && (
                          <span
                            className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded flex-shrink-0 tabular-nums"
                            title={`優先スコア: ${Math.round(waitingScores[match.id])}`}
                          >
                            {Math.round(waitingScores[match.id])}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-white bg-sky-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {getCategoryLabel(match.tournament_type)}
                        </span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">
                          {getRoundLabel(match)}
                        </span>
                        {match.division && (
                          <span className="text-[10px] text-purple-600 flex-shrink-0">
                            {match.division}部
                          </span>
                        )}
                        {groupProg !== null && match.group && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0" title="グループ進行度 (消化済み/合計)">
                            G{match.group}: {groupProg.done}/{groupProg.total}
                          </span>
                        )}
                        <span className="flex-1 text-slate-700 text-xs truncate min-w-0">
                          {[match.player1?.name, match.player3?.name, match.player5?.name].filter(Boolean).join(' / ')}
                          <span className="text-slate-400 mx-1.5">vs</span>
                          {[match.player2?.name, match.player4?.name, match.player6?.name].filter(Boolean).join(' / ')}
                        </span>
                        {isBlocked ? (
                          <span className="text-[10px] text-orange-500 flex-shrink-0 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            あと{remainingMinutes}分
                          </span>
                        ) : (
                          <span className="text-[10px] text-green-600 flex-shrink-0 font-medium">
                            待機中
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* アサイン診断 */}
        {diagnostics.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              アサイン診断（スキップされた試合）
              <span className="text-sm font-normal text-slate-500">{diagnostics.length}件</span>
            </h3>
            <div className="space-y-2">
              {diagnostics.map((d) => {
                const match = d.match as any as MatchWithPlayers;
                const isExpanded = !!expandedDiagnostic[d.match.id];
                // 理由ごとの色
                const reasonColor: Record<string, string> = {
                  disabled: 'bg-slate-100 text-slate-600 border-slate-300',
                  busy:     'bg-rose-50 text-rose-700 border-rose-300',
                  resting:  'bg-orange-50 text-orange-700 border-orange-300',
                  round_locked: 'bg-blue-50 text-blue-700 border-blue-300',
                  gender_mismatch: 'bg-violet-50 text-violet-700 border-violet-300',
                };
                const reasonIcon: Record<string, string> = {
                  disabled: '⏸',
                  busy: '🔴',
                  resting: '⏰',
                  round_locked: '🔒',
                  gender_mismatch: '♂♀',
                };
                return (
                  <div key={d.match.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {/* ヘッダー行（タップで展開） */}
                    <button
                      className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedDiagnostic(prev => ({ ...prev, [d.match.id]: !isExpanded }))}
                    >
                      {/* カテゴリ・ラウンド */}
                      <span className="text-[10px] font-bold text-white bg-sky-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {getCategoryLabel(d.match.tournament_type)}
                      </span>
                      {d.match.division && (
                        <span className="text-[10px] text-purple-600 flex-shrink-0">{d.match.division}部</span>
                      )}
                      {d.match.round && (
                        <span className="text-[10px] text-slate-500 flex-shrink-0">{d.match.round}回戦</span>
                      )}
                      {/* 選手名 */}
                      <span className="flex-1 text-sm text-slate-700 truncate min-w-0">
                        {[match.player1?.name, match.player3?.name, match.player5?.name].filter(Boolean).join(' / ') || '?'}
                        <span className="text-slate-400 mx-1.5 text-xs">vs</span>
                        {[match.player2?.name, match.player4?.name, match.player6?.name].filter(Boolean).join(' / ') || '?'}
                      </span>
                      {/* スコア */}
                      {d.score !== undefined && (
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded flex-shrink-0 tabular-nums">
                          {Math.round(d.score)}
                        </span>
                      )}
                      {/* 理由バッジ（先頭1件） */}
                      {d.reasons[0] && (
                        <span className={`text-[10px] border px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${reasonColor[d.reasons[0].reason] ?? 'bg-slate-100 text-slate-600'}`}>
                          {reasonIcon[d.reasons[0].reason]} {d.reasons[0].label}
                          {d.reasons.length > 1 && <span className="ml-1 opacity-70">+{d.reasons.length - 1}</span>}
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      }
                    </button>

                    {/* 展開パネル */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
                        {d.reasons.map((r, i) => (
                          <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${reasonColor[r.reason] ?? 'bg-slate-100 border-slate-300'}`}>
                            <span className="text-base leading-tight flex-shrink-0">{reasonIcon[r.reason]}</span>
                            <div>
                              <p className="text-sm font-semibold leading-tight">{r.label}</p>
                              {r.detail && (
                                <p className="text-xs mt-0.5 opacity-80">{r.detail}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
