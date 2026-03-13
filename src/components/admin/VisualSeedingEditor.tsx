'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMatchesByTournament, getAllPlayers, updateDocument, propagateByePlayerChange } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import type { Match, Player, TournamentType, Division } from '@/types';
import { Shuffle, Save, RefreshCw, GripVertical, X, CornerDownLeft } from 'lucide-react';
import { toastSuccess, toastError } from '@/lib/toast';

// --- Types ---

interface SlotUnit {
  p1Id: string;
  p3Id?: string; // partner (doubles only)
}

type DragKind =
  | { type: 'pool'; playerId: string }
  | { type: 'slot'; matchId: string; side: 'a' | 'b' };

// --- Helpers ---

function getUnit(match: Match, side: 'a' | 'b'): SlotUnit | null {
  const p1 = side === 'a' ? match.player1_id : match.player2_id;
  const p3 = side === 'a' ? match.player3_id : match.player4_id;
  if (!p1) return null;
  return { p1Id: p1, p3Id: p3 || undefined };
}

function applyUnit(match: Match, side: 'a' | 'b', unit: SlotUnit | null): Match {
  return side === 'a'
    ? { ...match, player1_id: unit?.p1Id ?? '', player3_id: unit?.p3Id ?? '' }
    : { ...match, player2_id: unit?.p1Id ?? '', player4_id: unit?.p3Id ?? '' };
}

function dragKey(src: DragKind): string {
  return src.type === 'pool'
    ? `pool:${src.playerId}`
    : `slot:${src.matchId}:${src.side}`;
}

// --- Component ---

export default function VisualSeedingEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { camp } = useCamp();
  const [tournamentType, setTournamentType] = useState<TournamentType>('mens_doubles');
  const [division, setDivision] = useState<Division>(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // HTML5 DnD state
  const dragRef = useRef<DragKind | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Tap/click selection mode (for touch/iPad)
  const [tapSelected, setTapSelected] = useState<DragKind | null>(null);

  const isDoubles = tournamentType.includes('doubles');

  useEffect(() => {
    if (!camp) return;
    load();
  }, [tournamentType, division, camp]);

  const load = async () => {
    if (!camp) return;
    setLoading(true);
    setTapSelected(null);
    try {
      const [ml, pl] = await Promise.all([
        getMatchesByTournament(tournamentType, camp.id),
        getAllPlayers(camp.id),
      ]);
      setMatches(
        ml
          .filter(m => m.round === 1 && m.division === division)
          .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
      );
      setPlayers(pl);
    } finally {
      setLoading(false);
    }
  };

  const pName = (id?: string) => players.find(p => p.id === id)?.name ?? '?';

  // Pool = players not assigned to any round-1 slot
  const assigned = new Set(
    matches.flatMap(m =>
      [m.player1_id, m.player2_id, m.player3_id, m.player4_id].filter(Boolean)
    )
  );
  const pool = players.filter(p => p.id && !assigned.has(p.id));

  // --- Core placement logic ---

  const doSwap = (src: DragKind, tgtMatchId: string, tgtSide: 'a' | 'b') => {
    setMatches(prev => {
      const next = prev.map(m => ({ ...m }));
      const ti = next.findIndex(m => m.id === tgtMatchId);
      if (ti < 0) return prev;

      const tgtUnit = getUnit(next[ti], tgtSide);

      if (src.type === 'slot') {
        const si = next.findIndex(m => m.id === src.matchId);
        if (si < 0) return prev;
        const srcUnit = getUnit(next[si], src.side);
        // Swap both sides
        next[si] = applyUnit(next[si], src.side, tgtUnit);
        next[ti] = applyUnit(next[ti], tgtSide, srcUnit);
      } else {
        // Pool player → slot: p1 = pool player, p3 cleared
        // Old occupant automatically returns to pool (derived state)
        next[ti] = applyUnit(next[ti], tgtSide, { p1Id: src.playerId });
      }
      return next;
    });
  };

  const doClear = (matchId: string, side: 'a' | 'b') => {
    setMatches(prev =>
      prev.map(m => m.id === matchId ? applyUnit(m, side, null) : m)
    );
  };

  // --- HTML5 Drag & Drop ---

  const onDragStart = (e: React.DragEvent, src: DragKind) => {
    dragRef.current = src;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = () => {
    dragRef.current = null;
    setDragOverKey(null);
  };

  const onDragOverSlot = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  };

  const onDropSlot = (e: React.DragEvent, matchId: string, side: 'a' | 'b') => {
    e.preventDefault();
    if (!dragRef.current) return;
    doSwap(dragRef.current, matchId, side);
    dragRef.current = null;
    setDragOverKey(null);
  };

  const onDragOverPool = (e: React.DragEvent) => {
    if (dragRef.current?.type !== 'slot') return;
    e.preventDefault();
    setDragOverKey('pool');
  };

  const onDropPool = (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragRef.current;
    if (!src || src.type !== 'slot') return;
    doClear(src.matchId, src.side);
    dragRef.current = null;
    setDragOverKey(null);
  };

  // --- Tap/click mode ---

  const onTapItem = (src: DragKind) => {
    if (readOnly) return;
    if (!tapSelected) {
      setTapSelected(src);
      return;
    }
    // Tapping the same item → deselect
    if (dragKey(tapSelected) === dragKey(src)) {
      setTapSelected(null);
      return;
    }
    // Target is a bracket slot → execute swap/place
    if (src.type === 'slot') {
      doSwap(tapSelected, src.matchId, src.side);
      setTapSelected(null);
      return;
    }
    // Tapping a different pool item while something is selected → change selection
    setTapSelected(src);
  };

  const onTapPool = () => {
    if (readOnly) return;
    if (tapSelected?.type === 'slot') {
      doClear(tapSelected.matchId, tapSelected.side);
    }
    setTapSelected(null);
  };

  const isTapSel = (src: DragKind) =>
    !!tapSelected && dragKey(tapSelected) === dragKey(src);

  // --- Shuffle ---

  const handleShuffle = () => {
    const slots: { matchId: string; side: 'a' | 'b' }[] = [];
    const units: (SlotUnit | null)[] = [];

    for (const m of matches) {
      slots.push({ matchId: m.id, side: 'a' });
      units.push(getUnit(m, 'a'));
      if (!m.is_walkover) {
        slots.push({ matchId: m.id, side: 'b' });
        units.push(getUnit(m, 'b'));
      }
    }

    // Fisher-Yates shuffle
    const sh = [...units];
    for (let i = sh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sh[i], sh[j]] = [sh[j], sh[i]];
    }

    setMatches(prev => {
      const next = prev.map(m => ({ ...m }));
      slots.forEach(({ matchId, side }, i) => {
        const idx = next.findIndex(m => m.id === matchId);
        if (idx >= 0) next[idx] = applyUnit(next[idx], side, sh[i]);
      });
      return next;
    });
    setTapSelected(null);
  };

  // --- Save ---

  const handleSave = async () => {
    if (!camp) return;
    setSaving(true);
    try {
      const allMatches = await getMatchesByTournament(tournamentType, camp.id);
      for (const m of matches) {
        const payload = {
          player1_id: m.player1_id ?? '',
          player2_id: m.player2_id ?? '',
          player3_id: m.player3_id ?? null,
          player4_id: m.player4_id ?? null,
        };
        await updateDocument('matches', m.id, payload);

        const hasP1 = !!m.player1_id;
        const hasP2 = !!m.player2_id;
        if (hasP1 !== hasP2 && (m.next_match_id || m.next_match_number != null)) {
          await propagateByePlayerChange({ ...m, ...payload } as Match, allMatches);
        }
      }
      toastSuccess(`${matches.length}試合の配置を保存しました`);
    } catch {
      toastError('保存に失敗しました');
    }
    setSaving(false);
  };

  // --- Slot renderer ---

  const renderSlot = (match: Match, side: 'a' | 'b', label: string) => {
    const unit = getUnit(match, side);
    const src: DragKind = { type: 'slot', matchId: match.id, side };
    const key = `slot:${match.id}:${side}`;
    const isOver = dragOverKey === key;
    const isSel = isTapSel(src);
    const hasOtherSelected = !!tapSelected && !isSel;

    return (
      <div
        draggable={!readOnly && !!unit}
        onDragStart={e => !readOnly && unit && onDragStart(e, src)}
        onDragEnd={onDragEnd}
        onDragOver={e => !readOnly && onDragOverSlot(e, key)}
        onDragLeave={() => dragOverKey === key && setDragOverKey(null)}
        onDrop={e => !readOnly && onDropSlot(e, match.id, side)}
        onClick={() => !readOnly && onTapItem(src)}
        className={[
          'relative p-3 md:p-4 rounded-lg border-2 transition-all select-none min-h-[56px]',
          isSel
            ? 'bg-sky-100 border-sky-500 ring-2 ring-sky-300 shadow-lg'
            : isOver
            ? 'bg-emerald-50 border-emerald-400 scale-[1.02] shadow-md'
            : hasOtherSelected
            ? unit
              ? 'border-indigo-300 bg-indigo-50 hover:border-indigo-500'
              : 'border-dashed border-indigo-300 bg-indigo-50 hover:border-indigo-500'
            : unit
            ? 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
            : 'bg-slate-50 border-dashed border-slate-300 hover:border-slate-400',
          !readOnly ? 'cursor-pointer' : '',
        ].join(' ')}
      >
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          {label}
        </p>
        {unit ? (
          <div className="flex items-center gap-2">
            {!readOnly && (
              <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {pName(unit.p1Id)}
              </p>
              {isDoubles && unit.p3Id && (
                <p className="text-sm text-slate-600 truncate">/ {pName(unit.p3Id)}</p>
              )}
              {isDoubles && !unit.p3Id && (
                <p className="text-xs text-amber-500 mt-0.5">パートナー未設定</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">空きスロット</p>
        )}
      </div>
    );
  };

  if (!camp) return <p className="text-slate-500">合宿を選択してください</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ビジュアル配置エディター</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Controls row */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={tournamentType} onValueChange={v => setTournamentType(v as TournamentType)}>
            <SelectTrigger className="w-44 h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mens_doubles">男子ダブルス</SelectItem>
              <SelectItem value="womens_doubles">女子ダブルス</SelectItem>
              <SelectItem value="mixed_doubles">混合ダブルス</SelectItem>
              <SelectItem value="mens_singles">男子シングルス</SelectItem>
              <SelectItem value="womens_singles">女子シングルス</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(division)} onValueChange={v => setDivision(parseInt(v) as Division)}>
            <SelectTrigger className="w-24 h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1部</SelectItem>
              <SelectItem value="2">2部</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={load} variant="outline" className="h-11">
            <RefreshCw className="w-4 h-4 mr-1" />再読み込み
          </Button>

          <Button
            onClick={handleShuffle}
            variant="outline"
            disabled={readOnly || matches.length === 0}
            className="h-11"
          >
            <Shuffle className="w-4 h-4 mr-1" />シャッフル
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving || readOnly || matches.length === 0}
            className="h-11 bg-sky-500 hover:bg-sky-600 text-white md:ml-auto"
          >
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : 'この配置で確定'}
          </Button>
        </div>

        {/* Selection indicator */}
        {tapSelected && (
          <div className="flex items-center gap-2 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            <span className="font-bold">選択中:</span>
            <span>
              {tapSelected.type === 'pool'
                ? `未配置: ${pName(tapSelected.playerId)}`
                : (() => {
                    const m = matches.find(x => x.id === tapSelected.matchId);
                    return `試合${m?.match_number ?? '?'} - ${tapSelected.side === 'a' ? 'A側' : 'B側'}`;
                  })()
              }
            </span>
            <button
              onClick={() => setTapSelected(null)}
              className="ml-auto p-0.5 rounded hover:bg-sky-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="text-slate-500">→ 移動先をタップ</span>
          </div>
        )}

        <p className="text-xs text-slate-400">
          マウス: ドラッグ＆ドロップ　|　タッチ/iPad: スロットをタップ → 移動先をタップ
        </p>

        {loading && <p className="text-slate-500 text-center py-8">読み込み中...</p>}

        {!loading && matches.length === 0 && (
          <p className="text-slate-400 text-center py-8">
            1回戦の試合がありません。先にトーナメントを生成してください。
          </p>
        )}

        {!loading && matches.length > 0 && (
          <div className="flex flex-col md:flex-row gap-4 items-start">

            {/* Left pane: pool */}
            <div
              className={[
                'w-full md:w-52 shrink-0 flex flex-col gap-2 rounded-xl border-2 p-3 min-h-[120px] transition-colors',
                dragOverKey === 'pool'
                  ? 'border-rose-400 bg-rose-50'
                  : tapSelected?.type === 'slot'
                  ? 'border-dashed border-rose-300 bg-rose-50 cursor-pointer'
                  : 'border-dashed border-slate-300 bg-slate-50',
              ].join(' ')}
              onDragOver={onDragOverPool}
              onDragLeave={() => dragOverKey === 'pool' && setDragOverKey(null)}
              onDrop={onDropPool}
              onClick={() => tapSelected?.type === 'slot' && onTapPool()}
            >
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <CornerDownLeft className="w-3 h-3" />
                未配置 ({pool.length}名)
              </p>

              {tapSelected?.type === 'slot' && (
                <p className="text-[10px] text-rose-600 font-medium">
                  ここをタップ/ドロップで配置解除
                </p>
              )}

              {pool.length === 0 && !tapSelected && (
                <p className="text-xs text-slate-400 text-center py-4">全選手配置済み</p>
              )}

              {pool.map(player => {
                const src: DragKind = { type: 'pool', playerId: player.id! };
                const isSel = isTapSel(src);
                return (
                  <div
                    key={player.id}
                    draggable={!readOnly}
                    onDragStart={e => { e.stopPropagation(); !readOnly && onDragStart(e, src); }}
                    onDragEnd={onDragEnd}
                    onClick={e => { e.stopPropagation(); !readOnly && onTapItem(src); }}
                    className={[
                      'flex items-center gap-2 p-3 rounded-lg border-2 select-none transition-all',
                      isSel
                        ? 'bg-sky-100 border-sky-500 ring-2 ring-sky-300 shadow-md'
                        : 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-sm',
                      readOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
                    ].join(' ')}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 truncate">{player.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Right pane: bracket */}
            <div className="flex-1 space-y-3 overflow-x-auto pb-2">
              {matches.map((match, idx) => {
                const isBye = !!match.is_walkover;
                return (
                  <div
                    key={match.id}
                    className={`rounded-xl border bg-white shadow-sm p-3 space-y-2 ${isBye ? 'opacity-80' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">
                        試合 {match.match_number ?? idx + 1}
                      </span>
                      {isBye && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          BYE
                        </span>
                      )}
                    </div>

                    {renderSlot(match, 'a', isBye ? '通過選手（BYE）' : '側 A')}

                    {isBye ? (
                      <div className="text-center">
                        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                          不戦勝で次ラウンドへ進出
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="text-center text-[10px] font-bold text-slate-300 tracking-widest">
                          VS
                        </div>
                        {renderSlot(match, 'b', '側 B')}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
