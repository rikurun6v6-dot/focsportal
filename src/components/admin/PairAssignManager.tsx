'use client';

// 当日くじで決まったペアを、番号ごとに流し込む画面。
//
// 「番号だけで形を作る」で生成した表は、各スロットに pair_no_p1 / pair_no_p2 だけが
// 入っている。ここで番号に選手を割り当てると、その番号を持つ全試合に一括で反映する。
// リーグ戦は同じペアが複数試合に出るので、試合ごとに入れ直さずに済む。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMatchesByTournament, getAllPlayers } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import { getDivisionsInUse } from '@/lib/divisions';
import { matchesQuery, matchRank } from '@/lib/kana';
import { toastSuccess, toastError } from '@/lib/toast';
import type { Match, Player, TournamentType, Division } from '@/types';
import { Users, Save, RefreshCw, Check, X } from 'lucide-react';

const TOURNAMENT_LABELS: { value: TournamentType; label: string }[] = [
  { value: 'mens_doubles', label: '男子ダブルス' },
  { value: 'womens_doubles', label: '女子ダブルス' },
  { value: 'mixed_doubles', label: '混合ダブルス' },
  { value: 'mens_singles', label: '男子シングルス' },
  { value: 'womens_singles', label: '女子シングルス' },
];

/** 1ペア分の割り当て内容。シングルスは members が1人 */
type SlotDraft = { pairNumber: number; members: (string | null)[] };

export default function PairAssignManager({ readOnly = false }: { readOnly?: boolean }) {
  const { camp } = useCamp();
  const [tournamentType, setTournamentType] = useState<TournamentType>('mens_doubles');
  const [division, setDivision] = useState<Division>(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [drafts, setDrafts] = useState<SlotDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSingles = tournamentType.includes('singles');
  const isMixed = tournamentType === 'mixed_doubles';
  const memberCount = isSingles ? 1 : 2;

  const load = useCallback(async () => {
    if (!camp) return;
    setLoading(true);
    try {
      const [matchList, playerList] = await Promise.all([
        getMatchesByTournament(tournamentType, camp.id),
        getAllPlayers(camp.id),
      ]);
      setMatches(matchList);
      setPlayers(playerList.filter(p => p.is_active));

      // 選んでいる部がこの種目に無い場合は、実際に試合がある部の先頭に寄せる。
      // 寄せないと、既定の1部のまま『試合がありません』と出て、
      // 表が作られていないように見えてしまう。
      const available = getDivisionsInUse(matchList);
      if (!available.includes(division)) {
        setDivision(available[0]);
        setLoading(false);
        return;
      }

      // この種目・部にあるペア番号を集める
      const divisionMatches = matchList.filter(m => m.division === division);
      const numbers = new Set<number>();
      for (const m of divisionMatches) {
        if (m.pair_no_p1) numbers.add(m.pair_no_p1);
        if (m.pair_no_p2) numbers.add(m.pair_no_p2);
      }

      // 既に割り当て済みの選手を拾って初期値にする
      const assigned = new Map<number, string[]>();
      for (const m of divisionMatches) {
        if (m.pair_no_p1 && !assigned.has(m.pair_no_p1)) {
          const members = [m.player1_id, m.player3_id, m.player5_id].filter(Boolean) as string[];
          if (members.length > 0) assigned.set(m.pair_no_p1, members);
        }
        if (m.pair_no_p2 && !assigned.has(m.pair_no_p2)) {
          const members = [m.player2_id, m.player4_id, m.player6_id].filter(Boolean) as string[];
          if (members.length > 0) assigned.set(m.pair_no_p2, members);
        }
      }

      setDrafts(
        [...numbers].sort((a, b) => a - b).map(pairNumber => {
          const existing = assigned.get(pairNumber) ?? [];
          return {
            pairNumber,
            members: Array.from({ length: memberCount }, (_, i) => existing[i] ?? null),
          };
        })
      );
    } catch (e) {
      console.error('[ペア割り当て] 読み込み失敗:', e);
      toastError('読み込みに失敗しました', '通信を確認して、もう一度お試しください');
    }
    setLoading(false);
  }, [camp, tournamentType, division, memberCount]);

  useEffect(() => { load(); }, [load]);

  const divisionOptions = getDivisionsInUse(matches);
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);

  // 同じ選手が複数の番号に入っていないかを数える
  const usedPlayerIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drafts) {
      for (const id of d.members) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [drafts]);

  const setMember = (pairNumber: number, index: number, playerId: string | null) => {
    setDrafts(prev => prev.map(d => {
      if (d.pairNumber !== pairNumber) return d;
      const members = [...d.members];
      members[index] = playerId;
      return { ...d, members };
    }));
  };

  const assignedCount = drafts.filter(d => d.members.every(Boolean)).length;

  const handleSave = async () => {
    if (!camp) return;
    const duplicated = [...usedPlayerIds.entries()].filter(([, n]) => n > 1);
    if (duplicated.length > 0) {
      const names = duplicated.map(([id]) => playerById.get(id)?.name ?? id).join('、');
      toastError('同じ選手が複数の番号に入っています', names);
      return;
    }

    setSaving(true);
    try {
      // 1人でも入っている番号だけを書きに行く。
      // 空の番号まで対象にすると、まだ決めていない枠に空文字を書き込んでしまい、
      // 「1組しか入れていないのに9試合に反映」といった実態と合わない結果になる。
      const filled = drafts.filter(d => d.members.some(Boolean));
      if (filled.length === 0) {
        toastError('反映する組がありません', '番号にひらがなで選手を入れてから押してください');
        setSaving(false);
        return;
      }

      const byNumber = new Map(filled.map(d => [d.pairNumber, d.members]));
      const divisionMatches = matches.filter(m => m.division === division);
      const batch = writeBatch(db);
      let touched = 0;

      for (const m of divisionMatches) {
        const update: Record<string, string> = {};

        if (m.pair_no_p1 && byNumber.has(m.pair_no_p1)) {
          const members = byNumber.get(m.pair_no_p1)!;
          update.player1_id = members[0] ?? '';
          if (!isSingles) update.player3_id = members[1] ?? '';
          if (members[2]) update.player5_id = members[2];
        }
        if (m.pair_no_p2 && byNumber.has(m.pair_no_p2)) {
          const members = byNumber.get(m.pair_no_p2)!;
          update.player2_id = members[0] ?? '';
          if (!isSingles) update.player4_id = members[1] ?? '';
          if (members[2]) update.player6_id = members[2];
        }

        if (Object.keys(update).length > 0) {
          batch.update(doc(db, 'matches', m.id), update);
          touched++;
        }
      }

      if (touched === 0) {
        toastError('反映できる試合がありません', 'この種目・部にペア番号付きの試合がありません');
        setSaving(false);
        return;
      }

      await batch.commit();
      const remaining = drafts.length - filled.length;
      toastSuccess(
        `${filled.length}組を${touched}試合に反映しました`,
        remaining > 0 ? `残り${remaining}組が未入力です` : undefined
      );
      await load();
    } catch (e) {
      console.error('[ペア割り当て] 保存失敗:', e);
      toastError('保存に失敗しました', '通信を確認して、もう一度お試しください');
    }
    setSaving(false);
  };

  if (!camp) return <p className="text-slate-600">大会を選択してください</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            ペア割り当て
          </CardTitle>
          <CardDescription>
            当日くじで決まったペアを番号ごとに入れます。フリガナ（ひらがな）で探せます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={tournamentType} onValueChange={v => setTournamentType(v as TournamentType)}>
              <SelectTrigger className="w-48 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TOURNAMENT_LABELS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(division)} onValueChange={v => setDivision(parseInt(v) as Division)}>
              <SelectTrigger className="w-28 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {divisionOptions.map(d => (
                  <SelectItem key={d} value={String(d)}>{d}部</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={load} variant="outline" className="h-11" disabled={loading || saving}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              再読み込み
            </Button>

            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-slate-600">
                {assignedCount} / {drafts.length} 組 確定
              </span>
              <Button
                onClick={handleSave}
                disabled={readOnly || saving || loading || drafts.length === 0}
                className="h-11 bg-emerald-600 hover:bg-emerald-700"
              >
                <Save className="w-4 h-4 mr-1" />
                {saving ? '反映中...' : '表に反映'}
              </Button>
            </div>
          </div>

          {!loading && drafts.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              この種目・部にペア番号付きの試合がありません。
              「ドロー生成」で <span className="font-bold">番号だけで形を作る</span> を選んで生成してください。
            </div>
          )}
        </CardContent>
      </Card>

      {drafts.map(draft => (
        <PairRow
          key={draft.pairNumber}
          draft={draft}
          players={players}
          playerById={playerById}
          usedPlayerIds={usedPlayerIds}
          isMixed={isMixed}
          isSingles={isSingles}
          readOnly={readOnly}
          onChange={setMember}
        />
      ))}
    </div>
  );
}

// ── 1ペア分の行 ───────────────────────────────────────────────────────────────

function PairRow({
  draft, players, playerById, usedPlayerIds, isMixed, isSingles, readOnly, onChange,
}: {
  draft: SlotDraft;
  players: Player[];
  playerById: Map<string, Player>;
  usedPlayerIds: Map<string, number>;
  isMixed: boolean;
  isSingles: boolean;
  readOnly: boolean;
  onChange: (pairNumber: number, index: number, playerId: string | null) => void;
}) {
  const complete = draft.members.every(Boolean);

  return (
    <Card className={complete ? 'border-emerald-200 bg-emerald-50/30' : ''}>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-start gap-3">
          <div className="flex items-center gap-2 md:w-32 shrink-0">
            <Badge className={`text-base font-bold px-3 py-1 ${complete ? 'bg-emerald-600' : 'bg-slate-500'}`}>
              {draft.pairNumber}
            </Badge>
            <span className="text-sm text-slate-600">
              {isSingles ? '番' : '番ペア'}
            </span>
            {complete && <Check className="w-4 h-4 text-emerald-600" />}
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {draft.members.map((playerId, i) => (
              <PlayerPicker
                key={i}
                label={isMixed ? (i === 0 ? '男子' : '女子') : undefined}
                players={players}
                selected={playerId ? playerById.get(playerId) ?? null : null}
                duplicated={!!playerId && (usedPlayerIds.get(playerId) ?? 0) > 1}
                readOnly={readOnly}
                onSelect={p => onChange(draft.pairNumber, i, p?.id ?? null)}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── フリガナ検索つきの選手選択 ────────────────────────────────────────────────

function PlayerPicker({
  label, players, selected, duplicated, readOnly, onSelect,
}: {
  label?: string;
  players: Player[];
  selected: Player | null;
  duplicated: boolean;
  readOnly: boolean;
  onSelect: (p: Player | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const candidates = useMemo(() => {
    if (!query.trim()) return [];
    return players
      .filter(p => matchesQuery(query, p.name, p.name_kana))
      .sort((a, b) => {
        const r = matchRank(query, a.name, a.name_kana) - matchRank(query, b.name, b.name_kana);
        return r !== 0 ? r : a.name.localeCompare(b.name, 'ja');
      })
      .slice(0, 8);
  }, [query, players]);

  if (selected) {
    return (
      <div className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        duplicated ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'
      }`}>
        <div className="min-w-0">
          {label && <span className="block text-[10px] font-bold text-slate-400">{label}</span>}
          <span className="block text-sm font-bold text-slate-800 truncate">{selected.name}</span>
          {selected.name_kana && (
            <span className="block text-[10px] text-slate-400 truncate">{selected.name_kana}</span>
          )}
          {duplicated && (
            <span className="block text-[10px] font-bold text-rose-600">他の番号にも入っています</span>
          )}
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            aria-label="選び直す"
            onClick={() => { onSelect(null); setQuery(''); setOpen(true); }}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {label && <span className="block text-[10px] font-bold text-slate-400 mb-0.5">{label}</span>}
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ひらがなで検索"
        disabled={readOnly}
        className="h-10 bg-white"
      />
      {open && candidates.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {candidates.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-sky-50"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelect(p); setQuery(''); setOpen(false); }}
              >
                <span className="block text-sm font-medium text-slate-800">{p.name}</span>
                <span className="block text-[10px] text-slate-400">
                  {p.name_kana ? `${p.name_kana} ・ ` : ''}{p.gender === 'male' ? '男' : '女'} {p.division}部
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && candidates.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
          該当する選手がいません
        </div>
      )}
    </div>
  );
}
