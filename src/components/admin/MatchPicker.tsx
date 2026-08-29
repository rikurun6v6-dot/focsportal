'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { getAllMatches, getAllPlayers } from '@/lib/firestore-helpers';
import { getTournamentTypeName } from '@/lib/tournament-logic';
import type { Match, Player, MatchStatus } from '@/types';
import { useCamp } from '@/context/CampContext';
import { Search, Check, X } from 'lucide-react';

interface MatchPickerProps {
  /** 選ばれた試合ID */
  value: string;
  onChange: (matchId: string) => void;
  /** この状態の試合だけを候補に出す（未指定なら全部） */
  statuses?: MatchStatus[];
  placeholder?: string;
}

const STATUS_LABEL: Record<string, string> = {
  waiting: '待機中',
  calling: '呼出中',
  playing: '試合中',
  completed: '完了',
};

const ROUND_LABEL = (round: number) =>
  round === 100 ? '決勝' : round === 99 ? '準決勝' : `${round}回戦`;

/**
 * 試合を「名前で探して選ぶ」ためのピッカー。
 *
 * SafetyTab では試合IDを手入力させていたが、これは第3回「再認＞再生」に反する
 * （長いIDを覚えて書き写させる＝recall）。ここでは選手名・コート・種目で一覧を出し、
 * 認識（recognition）で選べるようにする。選ぶと親には ID だけを渡す。
 */
export default function MatchPicker({ value, onChange, statuses, placeholder }: MatchPickerProps) {
  const { camp } = useCamp();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!camp?.id) return;
    let alive = true;
    (async () => {
      const [ms, ps] = await Promise.all([getAllMatches(camp.id), getAllPlayers(camp.id)]);
      if (!alive) return;
      setMatches(ms);
      setPlayers(Object.fromEntries(ps.map(p => [p.id, p])));
    })();
    return () => { alive = false; };
  }, [camp?.id]);

  // 外側クリックで閉じる
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const nameOf = (id?: string) => (id && players[id]?.name) || '';

  /** 1試合を1行の説明文にする（検索対象＆表示に使う） */
  const describe = (m: Match) => {
    const p1 = nameOf(m.player1_id);
    const p2 = nameOf(m.player2_id);
    const p3 = nameOf(m.player3_id);
    const p4 = nameOf(m.player4_id);
    const side1 = [p1, p3].filter(Boolean).join('・') || '未定';
    const side2 = [p2, p4].filter(Boolean).join('・') || '未定';
    const court = m.court_id ? `コート${String(m.court_id).replace(/^court_.*_/, '').replace('court_', '')}` : '';
    return {
      title: `${side1} vs ${side2}`,
      meta: [getTournamentTypeName(m.tournament_type), m.division ? `${m.division}部` : '', ROUND_LABEL(m.round), court, STATUS_LABEL[m.status] ?? m.status]
        .filter(Boolean).join(' / '),
      search: `${side1} ${side2} ${m.id} ${getTournamentTypeName(m.tournament_type)}`.toLowerCase(),
    };
  };

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches
      .filter(m => !statuses || statuses.includes(m.status))
      .map(m => ({ m, ...describe(m) }))
      .filter(x => !q || x.search.includes(q))
      .sort((a, b) => (a.m.match_number ?? 0) - (b.m.match_number ?? 0))
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, players, statuses, query]);

  const selected = matches.find(m => m.id === value);
  const selectedDesc = selected ? describe(selected) : null;

  return (
    <div className="relative" ref={boxRef}>
      {selected ? (
        // 選択済み: 誰の試合を選んだかを名前で示す（IDは補助的に小さく）
        <div className="flex items-start gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{selectedDesc?.title}</p>
            <p className="text-xs text-slate-500 truncate">{selectedDesc?.meta}</p>
          </div>
          <button
            onClick={() => { onChange(''); setQuery(''); setOpen(true); }}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="選び直す"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? '選手名で試合を探す'}
            className="h-9 text-sm pl-8"
          />
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl">
          {candidates.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-500 text-center">
              {matches.length === 0 ? '試合を読み込んでいます…' : '該当する試合が見つかりません'}
            </p>
          ) : (
            candidates.map(({ m, title, meta }) => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b border-slate-100 last:border-0"
              >
                <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                  {value === m.id && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                  {title}
                </p>
                <p className="text-xs text-slate-500 truncate">{meta}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
