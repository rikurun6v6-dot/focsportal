'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllDocuments, getAllPlayers } from '@/lib/firestore-helpers';
import { db } from '@/lib/firebase';
import { writeBatch, doc, where } from 'firebase/firestore';
import { useCamp } from '@/context/CampContext';
import type { Match, Player, TournamentType, Division, TeamGroup } from '@/types';
import { RefreshCw, ArrowLeftRight, UserCog, X, AlertTriangle, Users, Check } from 'lucide-react';
import { toastSuccess, toastError } from '@/lib/toast';

// ─── Data types ──────────────────────────────────────────────────────────────

interface PairEntry {
  key: string;   // canonical sorted player-ID string (dedup key)
  p1: string;    // player1 field value (main)
  p3: string;    // player3 field value (partner, '' for singles)
  p5: string;    // player5 field value (3rd member, '')
  group: TeamGroup;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function makePairKey(p1: string, p3 = '', p5 = ''): string {
  return [p1, p3, p5].filter(Boolean).sort().join('|');
}

function sideAKey(m: Match): string {
  return makePairKey(m.player1_id || '', m.player3_id || '', m.player5_id || '');
}

function sideBKey(m: Match): string {
  return makePairKey(m.player2_id || '', m.player4_id || '', m.player6_id || '');
}

function extractPairs(matches: Match[]): PairEntry[] {
  const seen = new Map<string, PairEntry>();
  for (const m of matches) {
    if (!m.group) continue;
    if (m.player1_id) {
      const key = sideAKey(m);
      if (key && !seen.has(key)) {
        seen.set(key, { key, p1: m.player1_id, p3: m.player3_id || '', p5: m.player5_id || '', group: m.group });
      }
    }
    if (m.player2_id) {
      const key = sideBKey(m);
      if (key && !seen.has(key)) {
        seen.set(key, { key, p1: m.player2_id, p3: m.player4_id || '', p5: m.player6_id || '', group: m.group });
      }
    }
  }
  return Array.from(seen.values());
}

function groupIsLocked(groupLabel: TeamGroup, matches: Match[]): boolean {
  return matches.some(m => m.group === groupLabel && (m.status === 'completed' || m.status === 'playing'));
}

type SwapMode = 'pair' | 'player';

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreliminaryGroupEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { camp } = useCamp();
  const [tournamentType, setTournamentType] = useState<TournamentType>('mens_doubles');
  const [division, setDivision] = useState<Division>(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selection state
  const [swapMode, setSwapMode] = useState<SwapMode>('pair');
  const [selectedPair, setSelectedPair] = useState<PairEntry | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null); // player ID

  // Per-pair inline editor
  const [editingPairKey, setEditingPairKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ p1: string; p3: string; p5: string }>({ p1: '', p3: '', p5: '' });

  useEffect(() => {
    if (!camp) return;
    load();
  }, [camp, tournamentType, division]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    if (!camp) return;
    setLoading(true);
    setSelectedPair(null);
    setSelectedPlayer(null);
    setEditingPairKey(null);
    try {
      const [matchList, playerList] = await Promise.all([
        getAllDocuments<Match>('matches', [
          where('campId', '==', camp.id),
          where('tournament_type', '==', tournamentType),
          where('division', '==', division),
          where('phase', '==', 'preliminary'),
        ]),
        getAllPlayers(camp.id),
      ]);
      setMatches(matchList);
      setPlayers(playerList);
    } finally {
      setLoading(false);
    }
  };

  const pName = (id?: string) => players.find(p => p.id === id)?.name ?? id ?? '?';

  const isDoubles = tournamentType.includes('doubles');

  const pairs = useMemo(() => extractPairs(matches), [matches]);

  const groups = useMemo(() => {
    const g: Partial<Record<TeamGroup, PairEntry[]>> = {};
    for (const pair of pairs) {
      if (!g[pair.group]) g[pair.group] = [];
      g[pair.group]!.push(pair);
    }
    return g;
  }, [pairs]);

  const GROUP_LABELS: TeamGroup[] = ['A', 'B', 'C', 'D'];
  const activeGroups = GROUP_LABELS.filter(g => groups[g] && groups[g]!.length > 0);

  // Collect all player IDs in use in this tournament/division
  const allUsedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      [m.player1_id, m.player2_id, m.player3_id, m.player4_id, m.player5_id, m.player6_id].forEach(id => {
        if (id) ids.add(id);
      });
    }
    return ids;
  }, [matches]);

  // ─── Pair Swap ──────────────────────────────────────────────────────────────

  const handlePairTap = async (pair: PairEntry) => {
    if (readOnly || saving) return;

    if (!selectedPair) {
      setSelectedPair(pair);
      return;
    }
    if (selectedPair.key === pair.key) {
      setSelectedPair(null);
      return;
    }

    // Check locks
    const lockedA = groupIsLocked(selectedPair.group, matches);
    const lockedB = groupIsLocked(pair.group, matches);
    if (lockedA || lockedB) {
      const g = lockedA ? selectedPair.group : pair.group;
      toastError(`グループ ${g} に完了・試合中の試合があるため変更できません`);
      setSelectedPair(null);
      return;
    }

    setSaving(true);
    setSelectedPair(null);
    try {
      const count = await executePairSwap(selectedPair, pair);
      toastSuccess(`ペアを入れ替えました（${count}試合を更新）`);
      await load();
    } catch {
      toastError('入れ替えに失敗しました');
      setSaving(false);
    }
  };

  const executePairSwap = async (pairA: PairEntry, pairB: PairEntry): Promise<number> => {
    const waitingMatches = matches.filter(m => m.status === 'waiting');
    const batch = writeBatch(db);
    let count = 0;

    for (const m of waitingMatches) {
      const aOnA = sideAKey(m) === pairA.key;
      const aOnB = sideBKey(m) === pairA.key;
      const bOnA = sideAKey(m) === pairB.key;
      const bOnB = sideBKey(m) === pairB.key;

      if (!aOnA && !aOnB && !bOnA && !bOnB) continue;

      const upd: Record<string, string | null> = {};
      if (aOnA) {
        upd.player1_id = pairB.p1;
        upd.player3_id = pairB.p3 || null;
        upd.player5_id = pairB.p5 || null;
      }
      if (aOnB) {
        upd.player2_id = pairB.p1;
        upd.player4_id = pairB.p3 || null;
        upd.player6_id = pairB.p5 || null;
      }
      if (bOnA) {
        upd.player1_id = pairA.p1;
        upd.player3_id = pairA.p3 || null;
        upd.player5_id = pairA.p5 || null;
      }
      if (bOnB) {
        upd.player2_id = pairA.p1;
        upd.player4_id = pairA.p3 || null;
        upd.player6_id = pairA.p5 || null;
      }

      batch.update(doc(db, 'matches', m.id), upd);
      count++;
    }

    await batch.commit();
    return count;
  };

  // ─── Player Swap ─────────────────────────────────────────────────────────────

  const handlePlayerTap = async (playerId: string) => {
    if (readOnly || saving) return;

    if (!selectedPlayer) {
      setSelectedPlayer(playerId);
      return;
    }
    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      return;
    }

    // Check locks: get groups both players belong to
    const pairOfA = pairs.find(p => [p.p1, p.p3, p.p5].includes(selectedPlayer));
    const pairOfB = pairs.find(p => [p.p1, p.p3, p.p5].includes(playerId));
    if (pairOfA && groupIsLocked(pairOfA.group, matches)) {
      toastError(`グループ ${pairOfA.group} に完了・試合中の試合があるため変更できません`);
      setSelectedPlayer(null);
      return;
    }
    if (pairOfB && groupIsLocked(pairOfB.group, matches)) {
      toastError(`グループ ${pairOfB.group} に完了・試合中の試合があるため変更できません`);
      setSelectedPlayer(null);
      return;
    }

    const a = selectedPlayer;
    setSaving(true);
    setSelectedPlayer(null);
    try {
      const count = await executePlayerSwap(a, playerId);
      toastSuccess(`選手を入れ替えました（${count}試合を更新）`);
      await load();
    } catch {
      toastError('入れ替えに失敗しました');
      setSaving(false);
    }
  };

  const executePlayerSwap = async (playerA: string, playerB: string): Promise<number> => {
    const playerFields = ['player1_id', 'player2_id', 'player3_id', 'player4_id', 'player5_id', 'player6_id'] as const;
    const waitingMatches = matches.filter(m => m.status === 'waiting');
    const batch = writeBatch(db);
    let count = 0;

    for (const m of waitingMatches) {
      const hasA = playerFields.some(f => m[f] === playerA);
      const hasB = playerFields.some(f => m[f] === playerB);
      if (!hasA && !hasB) continue;

      const upd: Record<string, string | null> = {};
      for (const f of playerFields) {
        if (m[f] === playerA) upd[f] = playerB;
        else if (m[f] === playerB) upd[f] = playerA;
      }
      batch.update(doc(db, 'matches', m.id), upd);
      count++;
    }

    await batch.commit();
    return count;
  };

  // ─── Individual Player Edit ───────────────────────────────────────────────────

  const openEdit = (pair: PairEntry) => {
    setEditingPairKey(pair.key);
    setEditDraft({ p1: pair.p1, p3: pair.p3, p5: pair.p5 });
    setSelectedPair(null);
    setSelectedPlayer(null);
  };

  const handleEditSave = async (pair: PairEntry) => {
    if (!camp) return;

    // Validate no duplicates (exclude this pair's current players)
    const currentPairIds = [pair.p1, pair.p3, pair.p5].filter(Boolean);
    const newPairIds = [editDraft.p1, editDraft.p3, editDraft.p5].filter(Boolean);
    const otherUsedIds = new Set([...allUsedPlayerIds].filter(id => !currentPairIds.includes(id)));
    const dup = newPairIds.find(id => otherUsedIds.has(id));
    if (dup) {
      toastError(`選手 ${pName(dup)} はすでに別のペアに登録されています`);
      return;
    }
    if (!editDraft.p1) {
      toastError('選手1は必須です');
      return;
    }
    if (isDoubles && !editDraft.p3) {
      toastError('ダブルスではパートナーは必須です');
      return;
    }

    setSaving(true);
    try {
      const waitingMatches = matches.filter(m => m.status === 'waiting');
      const batch = writeBatch(db);
      let count = 0;
      for (const m of waitingMatches) {
        const onSideA = sideAKey(m) === pair.key;
        const onSideB = sideBKey(m) === pair.key;
        if (!onSideA && !onSideB) continue;

        const upd: Record<string, string | null> = {};
        if (onSideA) {
          if (pair.p1 !== editDraft.p1) upd.player1_id = editDraft.p1 || null;
          if (pair.p3 !== editDraft.p3) upd.player3_id = editDraft.p3 || null;
          if (pair.p5 !== editDraft.p5) upd.player5_id = editDraft.p5 || null;
        }
        if (onSideB) {
          if (pair.p1 !== editDraft.p1) upd.player2_id = editDraft.p1 || null;
          if (pair.p3 !== editDraft.p3) upd.player4_id = editDraft.p3 || null;
          if (pair.p5 !== editDraft.p5) upd.player6_id = editDraft.p5 || null;
        }
        if (Object.keys(upd).length > 0) {
          batch.update(doc(db, 'matches', m.id), upd);
          count++;
        }
      }

      await batch.commit();
      setEditingPairKey(null);
      toastSuccess(`ペアを更新しました（${count}試合を更新）`);
      await load();
    } catch {
      toastError('保存に失敗しました');
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!camp) return <p className="text-slate-500">合宿を選択してください</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4" />
          予選グループ配置エディター
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select
            value={tournamentType}
            onValueChange={v => { setTournamentType(v as TournamentType); setSelectedPair(null); setSelectedPlayer(null); }}
          >
            <SelectTrigger className="w-44 h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mens_doubles">男子ダブルス</SelectItem>
              <SelectItem value="womens_doubles">女子ダブルス</SelectItem>
              <SelectItem value="mixed_doubles">混合ダブルス</SelectItem>
              <SelectItem value="mens_singles">男子シングルス</SelectItem>
              <SelectItem value="womens_singles">女子シングルス</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(division)}
            onValueChange={v => { setDivision(parseInt(v) as Division); setSelectedPair(null); setSelectedPlayer(null); }}
          >
            <SelectTrigger className="w-24 h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1部</SelectItem>
              <SelectItem value="2">2部</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={load} variant="outline" className="h-11" disabled={loading || saving}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            再読み込み
          </Button>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
            <button
              onClick={() => { setSwapMode('pair'); setSelectedPlayer(null); setSelectedPair(null); }}
              className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${swapMode === 'pair' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />ペア入れ替え
            </button>
            <button
              onClick={() => { setSwapMode('player'); setSelectedPair(null); setSelectedPlayer(null); }}
              className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${swapMode === 'player' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <Users className="w-3.5 h-3.5" />選手入れ替え
            </button>
          </div>
        </div>

        {/* Selection indicator */}
        {swapMode === 'pair' && selectedPair && (
          <div className="flex items-center gap-2 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>選択中:</strong> グループ{selectedPair.group} —{' '}
              {pName(selectedPair.p1)}{selectedPair.p3 ? ` / ${pName(selectedPair.p3)}` : ''}
            </span>
            <button onClick={() => setSelectedPair(null)} className="ml-auto p-0.5 hover:bg-sky-200 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="text-slate-500 shrink-0">→ 入れ替えるペアをタップ</span>
          </div>
        )}

        {swapMode === 'player' && selectedPlayer && (
          <div className="flex items-center gap-2 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span><strong>選択中:</strong> {pName(selectedPlayer)}</span>
            <button onClick={() => setSelectedPlayer(null)} className="ml-auto p-0.5 hover:bg-sky-200 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="text-slate-500 shrink-0">→ 入れ替える選手をタップ</span>
          </div>
        )}

        {/* Instructions */}
        <p className="text-xs text-slate-400">
          {swapMode === 'pair'
            ? 'ペアカードをタップして選択し、入れ替えたいペアをタップすると即座に入れ替わります。'
            : '選手名をタップして選択し、入れ替えたい選手名をタップすると全試合で入れ替わります。'}
          {' '}<span className="text-amber-600 font-medium">完了済み試合のあるグループはロックされます。</span>
        </p>

        {loading && <p className="text-center text-slate-500 py-8">読み込み中...</p>}

        {!loading && activeGroups.length === 0 && (
          <p className="text-center text-slate-400 py-8">
            予選グループの試合が見つかりません。先にトーナメントを生成してください。
          </p>
        )}

        {/* Groups grid */}
        {!loading && activeGroups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeGroups.map(groupLabel => {
              const groupPairs = groups[groupLabel] || [];
              const locked = groupIsLocked(groupLabel, matches);
              return (
                <div
                  key={groupLabel}
                  className={`rounded-xl border-2 p-3 space-y-2 ${locked ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-700">グループ {groupLabel}</span>
                    {locked && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" />ロック
                      </span>
                    )}
                    <span className="text-xs text-slate-500 ml-auto">{groupPairs.length}ペア</span>
                  </div>

                  {groupPairs.map(pair => {
                    const isPairSelected = swapMode === 'pair' && selectedPair?.key === pair.key;
                    const isPairTarget = swapMode === 'pair' && !!selectedPair && selectedPair.key !== pair.key;
                    const isEditing = editingPairKey === pair.key;

                    return (
                      <div key={pair.key} className="space-y-1">
                        {/* Pair card */}
                        {!isEditing && (
                          <div
                            onClick={() => !locked && !readOnly && swapMode === 'pair' && handlePairTap(pair)}
                            className={[
                              'rounded-lg border-2 p-3 transition-all select-none',
                              locked || readOnly
                                ? 'bg-white border-slate-200 opacity-70'
                                : swapMode === 'pair'
                                ? isPairSelected
                                  ? 'bg-sky-100 border-sky-500 ring-2 ring-sky-300 shadow-md cursor-pointer'
                                  : isPairTarget
                                  ? 'bg-indigo-50 border-indigo-300 hover:border-indigo-500 cursor-pointer shadow-sm'
                                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm cursor-pointer'
                                : 'bg-white border-slate-200',
                            ].join(' ')}
                          >
                            {/* Player names (clickable in player mode) */}
                            <div className="space-y-1">
                              {[
                                { id: pair.p1, label: '選手1' },
                                ...(pair.p3 ? [{ id: pair.p3, label: '選手2' }] : []),
                                ...(pair.p5 ? [{ id: pair.p5, label: '3人目' }] : []),
                              ].map(({ id, label }) => {
                                const isPlayerSel = swapMode === 'player' && selectedPlayer === id;
                                const isPlayerTarget = swapMode === 'player' && !!selectedPlayer && selectedPlayer !== id;
                                return (
                                  <div
                                    key={id}
                                    onClick={e => {
                                      if (swapMode !== 'player' || locked || readOnly) return;
                                      e.stopPropagation();
                                      handlePlayerTap(id);
                                    }}
                                    className={[
                                      'rounded px-2 py-1 transition-all',
                                      swapMode === 'player' && !locked && !readOnly
                                        ? isPlayerSel
                                          ? 'bg-sky-100 ring-2 ring-sky-400 cursor-pointer font-bold text-sky-800'
                                          : isPlayerTarget
                                          ? 'bg-indigo-50 hover:bg-indigo-100 cursor-pointer text-indigo-700'
                                          : 'hover:bg-slate-100 cursor-pointer text-slate-700'
                                        : '',
                                    ].join(' ')}
                                  >
                                    <span className={`text-[10px] font-semibold mr-1 ${isPlayerSel ? 'text-sky-600' : 'text-slate-400'}`}>
                                      {label}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-800">{pName(id)}</span>
                                    {isPlayerSel && <span className="ml-1 text-[10px] text-sky-600">（選択中）</span>}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Edit button (only in pair mode, not locked) */}
                            {swapMode === 'pair' && !locked && !readOnly && !isPairSelected && (
                              <button
                                onClick={e => { e.stopPropagation(); openEdit(pair); }}
                                className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600 transition-colors"
                              >
                                <UserCog className="w-3 h-3" />選手を変更
                              </button>
                            )}
                          </div>
                        )}

                        {/* Inline edit panel */}
                        {isEditing && (
                          <div className="rounded-lg border-2 border-indigo-400 bg-indigo-50 p-3 space-y-2">
                            <p className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                              <UserCog className="w-3.5 h-3.5" />選手を変更
                            </p>

                            {[
                              { label: '選手1 *', key: 'p1' as const },
                              ...(isDoubles ? [{ label: 'パートナー *', key: 'p3' as const }] : []),
                              ...(pair.p5 ? [{ label: '3人目', key: 'p5' as const }] : []),
                            ].map(({ label, key }) => (
                              <div key={key} className="space-y-0.5">
                                <p className="text-[10px] font-semibold text-indigo-600">{label}</p>
                                <Select
                                  value={editDraft[key] || '__empty__'}
                                  onValueChange={v => setEditDraft(prev => ({ ...prev, [key]: v === '__empty__' ? '' : v }))}
                                >
                                  <SelectTrigger className="h-9 text-xs w-full">
                                    <SelectValue placeholder="選択してください" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {key !== 'p1' && <SelectItem value="__empty__">（なし）</SelectItem>}
                                    {players
                                      .filter(p => {
                                        if (!p.id) return false;
                                        // Allow current value
                                        if (p.id === editDraft[key]) return true;
                                        // Disallow players used in other pairs
                                        const usedByOtherPair = allUsedPlayerIds.has(p.id) &&
                                          ![pair.p1, pair.p3, pair.p5].includes(p.id);
                                        return !usedByOtherPair;
                                      })
                                      .map(p => (
                                        <SelectItem key={p.id} value={p.id!}>
                                          {p.name}
                                        </SelectItem>
                                      ))
                                    }
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}

                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                onClick={() => handleEditSave(pair)}
                                disabled={saving}
                                className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                              >
                                <Check className="w-3 h-3 mr-1" />保存
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingPairKey(null)}
                                disabled={saving}
                                className="h-8 text-xs"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {saving && (
          <p className="text-center text-sky-600 font-medium py-2 animate-pulse">更新中...</p>
        )}
      </CardContent>
    </Card>
  );
}
