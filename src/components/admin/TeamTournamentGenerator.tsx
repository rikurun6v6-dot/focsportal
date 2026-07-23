'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import type { TeamMatchConfig, TeamEncounter, TeamRankEntry } from '@/types';
import {
  buildGameSlots,
  generateTeamPlacementEncounters,
  generateTeamFinalBracket,
  applyTeamAdvancersToFinalBracket,
  rankTeamGroup,
  getNeedJankenPairs,
  advanceTeamWinnerToNextRound,
  generateTeamBronzeEncounter,
  resolveTeamBronzeEncounter,
  recordTeamGameResult,
  generateRoundRobinRounds,
  normalizeTeamRankOrder,
  DEFAULT_TEAM_RANK_ORDER,
  TEAM_RANK_CRITERION_LABEL,
  type TeamRankCriterion,
} from '@/lib/tournament-logic';
import { getDocument, setDocument, deleteDocument } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastError } from '@/lib/toast';
import TeamPreliminaryGroup from './TeamPreliminaryGroup';
import TeamKnockoutTree from './TeamKnockoutTree';
import TeamPlacementView from './TeamPlacementView';
import TeamSetupPanel, { type SimpleTeam, type FinalFormat } from './TeamSetupPanel';
import TeamScheduleView from './TeamScheduleView';
import { ArrowRight, ArrowLeft, Pencil, RotateCcw, ChevronDown, ChevronUp, Check, CloudOff, Loader2 } from 'lucide-react';

const DEFAULT_CONFIG: TeamMatchConfig = {
  games: [
    { type: 'MD', count: 1 },
    { type: 'WD', count: 1 },
    { type: 'XD', count: 1 },
    { type: 'MS', count: 1 },
    { type: 'WS', count: 1 },
  ],
};

const DEFAULT_TEAMS: SimpleTeam[] = [
  { id: 'team_1', name: 'チームA' },
  { id: 'team_2', name: 'チームB' },
  { id: 'team_3', name: 'チームC' },
  { id: 'team_4', name: 'チームD' },
  { id: 'team_5', name: 'チームE' },
  { id: 'team_6', name: 'チームF' },
  { id: 'team_7', name: 'チームG' },
  { id: 'team_8', name: 'チームH' },
];

const DEFAULT_COURT_COUNT = 6;

type Phase = 'setup' | 'preliminary' | 'placement' | 'knockout';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// 合宿ごとにキーを分ける。単一キーだと別の合宿の状態が混ざる
const lsKey = (campId: string) => `ttg_state_v1_${campId}`;
const FS_COLLECTION = 'team_tournament_states';

export default function TeamTournamentGenerator() {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [teams, setTeams] = useState<SimpleTeam[]>(DEFAULT_TEAMS);
  const [newTeamName, setNewTeamName] = useState('');
  const [config] = useState<TeamMatchConfig>(DEFAULT_CONFIG);
  const [groupCount, setGroupCount] = useState<number>(2);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState<number>(2);
  const [finalFormat, setFinalFormat] = useState<FinalFormat>('placement');
  const [phase, setPhase] = useState<Phase>('setup');
  const [teamGroupAssignments, setTeamGroupAssignments] = useState<Record<string, number>>({});
  const [prelimEncounters, setPrelimEncounters] = useState<TeamEncounter[]>([]);
  const [placementEncounters, setPlacementEncounters] = useState<TeamEncounter[]>([]);
  const [knockoutEncounters, setKnockoutEncounters] = useState<TeamEncounter[]>([]);
  const [bronzeEncounter, setBronzeEncounter] = useState<TeamEncounter | null>(null);
  const [jankenWinners, setJankenWinners] = useState<Record<string, string>>({});
  const [manualRanksByGroup, setManualRanksByGroup] = useState<Record<string, string[]>>({});
  const [rankOrder, setRankOrder] = useState<TeamRankCriterion[]>(DEFAULT_TEAM_RANK_ORDER);
  // 進行の設定。合宿ごとに保存する（面数も同時対戦数も大会によって変わる）
  const [courtCount, setCourtCount] = useState<number>(DEFAULT_COURT_COUNT);
  const [concurrentPerGroup, setConcurrentPerGroup] = useState<number>(1);
  // グループ・ラウンドごとの休みチーム: `${group}_${round}` -> teamId
  const [prelimByes, setPrelimByes] = useState<Record<string, string | null>>({});

  // UI state (not persisted)
  const [showSetupEdit, setShowSetupEdit] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const applyState = (s: Record<string, unknown>) => {
    if (Array.isArray(s.teams)) setTeams(s.teams as SimpleTeam[]);
    if (typeof s.groupCount === 'number') setGroupCount(s.groupCount);
    if (typeof s.qualifiersPerGroup === 'number') setQualifiersPerGroup(s.qualifiersPerGroup);
    if (s.finalFormat) setFinalFormat(s.finalFormat as FinalFormat);
    if (s.phase) setPhase(s.phase as Phase);
    if (s.teamGroupAssignments) setTeamGroupAssignments(s.teamGroupAssignments as Record<string, number>);
    if (Array.isArray(s.prelimEncounters)) setPrelimEncounters(s.prelimEncounters as TeamEncounter[]);
    if (Array.isArray(s.placementEncounters)) setPlacementEncounters(s.placementEncounters as TeamEncounter[]);
    if (Array.isArray(s.knockoutEncounters)) setKnockoutEncounters(s.knockoutEncounters as TeamEncounter[]);
    setBronzeEncounter((s.bronzeEncounter as TeamEncounter | null) ?? null);
    if (s.jankenWinners) setJankenWinners(s.jankenWinners as Record<string, string>);
    if (s.manualRanksByGroup) setManualRanksByGroup(s.manualRanksByGroup as Record<string, string[]>);
    // 未設定・壊れたデータでも必ず全基準がそろった順序にする
    setRankOrder(normalizeTeamRankOrder(s.rankOrder as TeamRankCriterion[] | undefined));
    if (typeof s.courtCount === 'number') setCourtCount(s.courtCount);
    if (typeof s.concurrentPerGroup === 'number') setConcurrentPerGroup(s.concurrentPerGroup);
    setPrelimByes((s.prelimByes as Record<string, string | null>) ?? {});
  };

  // この合宿に団体戦の保存データが無いときの初期化（前の合宿の状態を引き継がない）
  const resetState = () => {
    setTeams(DEFAULT_TEAMS);
    setGroupCount(2);
    setQualifiersPerGroup(2);
    setFinalFormat('placement');
    setPhase('setup');
    setTeamGroupAssignments({});
    setPrelimEncounters([]);
    setPlacementEncounters([]);
    setKnockoutEncounters([]);
    setBronzeEncounter(null);
    setJankenWinners({});
    setManualRanksByGroup({});
    setRankOrder([...DEFAULT_TEAM_RANK_ORDER]);
    setCourtCount(DEFAULT_COURT_COUNT);
    setConcurrentPerGroup(1);
    setPrelimByes({});
  };

  // Firestoreからロード（campが変わるたびに）。失敗時は同じ合宿のlocalStorageで復帰を試みる
  useEffect(() => {
    if (!camp?.id) return;
    const load = async () => {
      setStateLoaded(false);
      setSaveState('idle');
      try {
        const saved = await getDocument<Record<string, unknown>>(FS_COLLECTION, camp.id);
        if (saved) {
          applyState(saved);
        } else {
          resetState();
        }
      } catch {
        // 取得に失敗したら、同じ合宿のローカル控えを使う（無ければ初期化）
        let recovered = false;
        try {
          const local = localStorage.getItem(lsKey(camp.id));
          if (local) {
            applyState(JSON.parse(local));
            recovered = true;
          }
        } catch { /* ignore */ }
        if (!recovered) resetState();
        setSaveState('error');
      }
      setStateLoaded(true);
    };
    load();
  }, [camp?.id]);

  // 状態変化をFirestore+localStorageに保存（ロード完了後のみ）
  useEffect(() => {
    if (!stateLoaded || !camp?.id) return;
    const state = {
      teams, config, groupCount, qualifiersPerGroup, finalFormat, phase,
      teamGroupAssignments, prelimEncounters, placementEncounters,
      knockoutEncounters, bronzeEncounter, jankenWinners, manualRanksByGroup, rankOrder,
      courtCount, concurrentPerGroup, prelimByes,
    };
    // localStorageに即時保存（合宿ごとのキー）
    try { localStorage.setItem(lsKey(camp.id), JSON.stringify(state)); } catch { /* ignore */ }
    // Firestoreにデバウンス保存
    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        await setDocument(FS_COLLECTION, { id: camp.id, campId: camp.id, ...state });
        setSaveState('saved');
      } catch {
        // 黙って落とさない。ここを握りつぶすと入力が消えたことに誰も気づけない
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [stateLoaded, camp?.id, teams, config, groupCount, qualifiersPerGroup, finalFormat, phase,
    teamGroupAssignments, prelimEncounters, placementEncounters,
    knockoutEncounters, bronzeEncounter, jankenWinners, manualRanksByGroup, rankOrder,
    courtCount, concurrentPerGroup, prelimByes]);

  const getTeamName = useCallback((id: string) => {
    if (id === 'BYE') return 'BYE';
    if (id.startsWith('winner-of-')) return '勝者待ち';
    if (id.startsWith('loser-of-')) return '敗者待ち';
    if (id.startsWith('team-slot-')) return `待機中(${id.replace('team-slot-', '')})`;
    return teams.find(t => t.id === id)?.name ?? id;
  }, [teams]);

  // グループ別エンカウンター・順位計算
  const groups = [...new Set(prelimEncounters.map(e => e.group ?? ''))].sort();
  const encountersByGroup: Record<string, TeamEncounter[]> = {};
  const rankingsByGroup: Record<string, TeamRankEntry[]> = {};
  const jankenPairsByGroup: Record<string, [string, string][]> = {};

  for (const g of groups) {
    encountersByGroup[g] = prelimEncounters.filter(e => e.group === g);
    const autoRanked = rankTeamGroup(encountersByGroup[g], jankenWinners, rankOrder);
    const manualOrder = manualRanksByGroup[g] ?? [];
    if (manualOrder.length > 0) {
      const map = new Map(autoRanked.map(r => [r.teamId, r]));
      rankingsByGroup[g] = manualOrder.map(id => map.get(id)).filter(Boolean) as typeof autoRanked;
      // autoRankedにあってmanualOrderにないチームを末尾に追加
      autoRanked.forEach(r => { if (!manualOrder.includes(r.teamId)) rankingsByGroup[g].push(r); });
    } else {
      rankingsByGroup[g] = autoRanked;
    }
    jankenPairsByGroup[g] = getNeedJankenPairs(rankingsByGroup[g], encountersByGroup[g], jankenWinners, rankOrder);
  }

  // 1対戦あたりの試合数（設定は5試合固定だが、config から数えて追従させる）
  const gamesPerEncounter = config.games.reduce((sum, g) => sum + g.count, 0);

  const allPrelimDone = prelimEncounters.length > 0 && prelimEncounters.every(e => e.completed);
  const needJanken = allPrelimDone && groups.some(g => (jankenPairsByGroup[g] ?? []).length > 0);
  const canAdvance = allPrelimDone && !needJanken;
  const prelimHasResults = prelimEncounters.some(e => e.games.some(g => g.winner !== null));

  const handleAddTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    if (teams.some(t => t.name === name)) {
      toastError(`「${name}」は既に登録されています`);
      return;
    }
    const id = `team_${Date.now()}`;
    setTeams(prev => [...prev, { id, name }]);
    setNewTeamName('');
  };

  const handleRemoveTeam = (id: string) => {
    setTeams(prev => prev.filter(t => t.id !== id));
    setTeamGroupAssignments(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  /** チームをグループごとに分けた配列を返す（グループ数1なら全員が1つ目に入る） */
  const groupedTeams = (): SimpleTeam[][] => {
    const buckets: SimpleTeam[][] = Array.from({ length: Math.max(1, groupCount) }, () => []);
    teams.forEach(t => {
      const g = Math.min(teamGroupAssignments[t.id] ?? 0, Math.max(1, groupCount) - 1);
      buckets[g].push(t);
    });
    return buckets;
  };

  /**
   * 予選の対戦を作る。
   * サーキット法で「同時に進められるラウンド」の順に並べるので、
   * 同じチームが連続で試合に入らない＝そのまま進行表として使える。
   */
  const buildPreliminaryEncounters = (): { encounters: TeamEncounter[]; byes: Record<string, string | null> } => {
    const buckets = groupedTeams();
    const encounters: TeamEncounter[] = [];
    const byes: Record<string, string | null> = {};

    buckets.forEach((group, g) => {
      const groupLabel = String.fromCharCode(65 + g);
      const rounds = generateRoundRobinRounds(group.map(t => t.id));
      for (const r of rounds) {
        byes[`${groupLabel}_${r.round}`] = r.byeTeamId;
        for (const [t1, t2] of r.pairs) {
          encounters.push({
            id: `pre_${groupLabel}_${t1}_${t2}`,
            team1_id: t1, team2_id: t2,
            games: buildGameSlots(config),
            team1_wins: 0, team2_wins: 0, winner_id: null,
            phase: 'preliminary', group: groupLabel, round: r.round, completed: false,
          });
        }
      }
    });

    return { encounters, byes };
  };

  const handleStartPreliminary = async () => {
    // 進行中に押された場合は、消えるものを具体的に伝えてから作り直す
    if (prelimHasResults) {
      const doneCount = prelimEncounters.filter(e => e.completed).length;
      const confirmed = await confirm({
        title: '対戦表を作り直しますか？',
        message:
          `入力済みの予選結果がすべて消えます（決着済み ${doneCount} 対戦 / 全 ${prelimEncounters.length} 対戦）。\n` +
          '順位決定戦・決勝トーナメントの結果も一緒に消えます。\n\n' +
          'チーム名や順位の決め方を直しただけなら、この操作は不要です。',
        confirmText: '作り直す',
        cancelText: 'やめる',
        type: 'danger',
      });
      if (!confirmed) return;
    }

    const built = buildPreliminaryEncounters();
    setPrelimEncounters(built.encounters);
    setPrelimByes(built.byes);
    setManualRanksByGroup({});
    setJankenWinners({});
    setPlacementEncounters([]);
    setKnockoutEncounters([]);
    setBronzeEncounter(null);
    setPhase('preliminary');
    setShowSetupEdit(false);
  };

  const handleStartPlacement = async () => {
    // 既に入力済みの順位決定戦があるなら、作り直すか確認する
    if (placementEncounters.some(e => e.games.some(g => g.winner !== null))) {
      const confirmed = await confirm({
        title: '順位決定戦を作り直しますか？',
        message: '入力済みの順位決定戦の結果が消えます。\n続きを入力したいだけなら「順位決定戦を開く」を使ってください。',
        confirmText: '作り直す',
        cancelText: 'やめる',
        type: 'warning',
      });
      if (!confirmed) return;
    }
    setPlacementEncounters(generateTeamPlacementEncounters(rankingsByGroup, groups, config));
    setPhase('placement');
  };

  const handleStartKnockout = async () => {
    if (knockoutEncounters.some(e => e.games.some(g => g.winner !== null))) {
      const confirmed = await confirm({
        title: '決勝トーナメントを作り直しますか？',
        message: '入力済みの決勝トーナメントの結果が消えます。\n続きを入力したいだけなら「決勝トーナメントを開く」を使ってください。',
        confirmText: '作り直す',
        cancelText: 'やめる',
        type: 'warning',
      });
      if (!confirmed) return;
    }
    const advancers: string[] = [];
    for (const g of groups) {
      const ranked = rankingsByGroup[g];
      ranked.slice(0, qualifiersPerGroup).forEach(r => advancers.push(r.teamId));
    }
    let bracket = generateTeamFinalBracket(advancers.length, config);
    bracket = applyTeamAdvancersToFinalBracket(bracket, advancers);
    setKnockoutEncounters(bracket);
    setBronzeEncounter(generateTeamBronzeEncounter(bracket, config));
    setPhase('knockout');
  };

  const handlePrelimGameResult = (encounterId: string, slotId: string, winner: 1 | 2 | null) => {
    setPrelimEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      return prev.map(e => e.id === encounterId ? recordTeamGameResult(enc, slotId, winner) : e);
    });
  };

  const handlePlacementGameResult = (encounterId: string, slotId: string, winner: 1 | 2 | null) => {
    setPlacementEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      return prev.map(e => e.id === encounterId ? recordTeamGameResult(enc, slotId, winner) : e);
    });
  };

  const handleKnockoutGameResult = (encounterId: string, slotId: string, winner: 1 | 2 | null) => {
    if (bronzeEncounter && bronzeEncounter.id === encounterId) {
      setBronzeEncounter(prev => prev ? recordTeamGameResult(prev, slotId, winner) : prev);
      return;
    }
    setKnockoutEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      const updated = recordTeamGameResult(enc, slotId, winner);
      let next = prev.map(e => e.id === encounterId ? updated : e);
      if (updated.completed) {
        next = advanceTeamWinnerToNextRound(next, encounterId);
        if (bronzeEncounter) {
          const completedSemis = next.filter(e =>
            bronzeEncounter.team1_id === `loser-of-${e.id}` ||
            bronzeEncounter.team2_id === `loser-of-${e.id}`
          );
          if (completedSemis.length > 0) {
            setBronzeEncounter(prev2 => prev2 ? resolveTeamBronzeEncounter(prev2, completedSemis) : prev2);
          }
        }
      }
      return next;
    });
  };

  const handleJanken = (team1Id: string, team2Id: string, winnerId: string) => {
    const key = [team1Id, team2Id].sort().join('_');
    setJankenWinners(prev => ({ ...prev, [key]: winnerId }));
  };

  const handleManualRankChange = (group: string, orderedTeamIds: string[]) => {
    setManualRanksByGroup(prev => ({ ...prev, [group]: orderedTeamIds }));
  };

  const handleReset = async () => {
    const first = await confirm({
      title: '団体戦をリセットしますか？',
      message:
        'チーム・組み合わせ・入力済みの全結果が消えて、初期設定からやり直しになります。\n' +
        'この操作は取り消せません。',
      confirmText: '次へ',
      cancelText: 'やめる',
      type: 'danger',
    });
    if (!first) return;
    const second = await confirm({
      title: '本当にリセットしますか？',
      message: `「${camp?.title ?? 'この大会'}」の団体戦データを削除します。元に戻せません。`,
      confirmText: 'リセットする',
      cancelText: 'やめる',
      type: 'danger',
    });
    if (!second) return;

    if (camp?.id) {
      try { localStorage.removeItem(lsKey(camp.id)); } catch { /* ignore */ }
      try {
        await deleteDocument(FS_COLLECTION, camp.id);
      } catch {
        toastError('リセットの保存に失敗しました。通信を確認してもう一度お試しください');
        return;
      }
    }
    resetState();
    setShowSetupEdit(false);
  };

  if (camp?.id && !stateLoaded) {
    return <Loading />;
  }

  const phaseLabel =
    phase === 'preliminary' ? '予選' :
    phase === 'placement' ? '順位決定戦' :
    phase === 'knockout' ? '決勝トーナメント' : '';

  const setupPanel = (
    <TeamSetupPanel
      teams={teams}
      newTeamName={newTeamName}
      groupCount={groupCount}
      qualifiersPerGroup={qualifiersPerGroup}
      finalFormat={finalFormat}
      teamGroupAssignments={teamGroupAssignments}
      rankOrder={rankOrder}
      courtCount={courtCount}
      concurrentPerGroup={concurrentPerGroup}
      gamesPerEncounter={gamesPerEncounter}
      isRunning={phase !== 'setup'}
      onNewTeamNameChange={setNewTeamName}
      onAddTeam={handleAddTeam}
      onRemoveTeam={handleRemoveTeam}
      onGroupCountChange={setGroupCount}
      onQualifiersChange={setQualifiersPerGroup}
      onFinalFormatChange={setFinalFormat}
      onAssignGroup={(teamId, group) => setTeamGroupAssignments(prev => ({ ...prev, [teamId]: group }))}
      onRankOrderChange={setRankOrder}
      onCourtCountChange={setCourtCount}
      onConcurrentPerGroupChange={setConcurrentPerGroup}
      onStartPreliminary={handleStartPreliminary}
    />
  );

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      {/* 大会進行中ヘッダー（setup以外のフェーズで表示） */}
      {phase !== 'setup' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">団体戦進行中</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {teams.length}チーム / {groupCount}グループ / {phaseLabel}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                順位: {rankOrder.map(c => TEAM_RANK_CRITERION_LABEL[c]).join(' → ')}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {/* 保存状態。黙って落ちると入力が消えたことに気づけない */}
              <div className="text-xs flex items-center gap-1">
                {saveState === 'saving' && (
                  <span className="text-slate-500 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />保存中
                  </span>
                )}
                {saveState === 'saved' && (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <Check className="w-3 h-3" />保存済み
                  </span>
                )}
                {saveState === 'error' && (
                  <span className="text-red-600 font-bold flex items-center gap-1">
                    <CloudOff className="w-3 h-3" />保存できていません
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs gap-1"
                onClick={() => setShowSetupEdit(e => !e)}
              >
                <Pencil className="w-3 h-3" />
                {showSetupEdit ? '設定を閉じる' : '設定を編集'}
                {showSetupEdit ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {saveState === 'error' && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              サーバーに保存できていません。この端末には控えが残っているので、
              通信が戻れば次の入力で保存されます。画面を閉じる前に通信を確認してください。
            </p>
          )}

          {showSetupEdit && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              {setupPanel}
              {/* リセットは破壊操作なので、設定を開いたときだけ・いちばん下に置く */}
              <div className="mt-6 pt-4 border-t border-red-100">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                  onClick={handleReset}
                >
                  <RotateCcw className="w-3 h-3" />
                  団体戦をリセット（すべて消す）
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* セットアップ（初回のみ） */}
      {phase === 'setup' && setupPanel}

      {/* 予選フェーズ */}
      {phase === 'preliminary' && (
        <div className="space-y-4">
          <TeamScheduleView
            encounters={prelimEncounters}
            byeByGroupRound={prelimByes}
            concurrentPerGroup={concurrentPerGroup}
            courtCount={courtCount}
            gamesPerEncounter={gamesPerEncounter}
            getTeamName={getTeamName}
          />

          <TeamPreliminaryGroup
            groups={groups}
            encountersByGroup={encountersByGroup}
            rankingsByGroup={rankingsByGroup}
            jankenPairsByGroup={jankenPairsByGroup}
            manualRanksByGroup={manualRanksByGroup}
            rankOrder={rankOrder}
            getTeamName={getTeamName}
            onGameResult={handlePrelimGameResult}
            onJanken={handleJanken}
            onManualRankChange={handleManualRankChange}
          />

          {needJanken && (
            <div className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              順位が並んだチームがあります。じゃんけんの結果を入力してください
            </div>
          )}

          <Button
            onClick={finalFormat === 'placement' ? handleStartPlacement : handleStartKnockout}
            disabled={!canAdvance}
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
          >
            <ArrowRight className="w-4 h-4" />
            {finalFormat === 'placement' ? '順位決定戦へ進む' : '決勝トーナメントへ進む'}
          </Button>
          {!allPrelimDone && (
            <p className="text-xs text-center text-slate-500">全予選対戦が決着すると次のフェーズに進めます</p>
          )}

          {/* 作成済みの次フェーズがあるなら、作り直さずに開けるようにする */}
          {placementEncounters.length > 0 && (
            <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={() => setPhase('placement')}>
              <ArrowRight className="w-3 h-3" />順位決定戦を開く（入力済みの結果はそのまま）
            </Button>
          )}
          {knockoutEncounters.length > 0 && (
            <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={() => setPhase('knockout')}>
              <ArrowRight className="w-3 h-3" />決勝トーナメントを開く（入力済みの結果はそのまま）
            </Button>
          )}
        </div>
      )}

      {/* 順位決定戦フェーズ */}
      {phase === 'placement' && (
        <div className="space-y-4">
          <TeamPlacementView
            encounters={placementEncounters}
            getTeamName={getTeamName}
            onGameResult={handlePlacementGameResult}
          />
          {/* 予選を見に行くだけ。結果は保持する */}
          <Button variant="outline" size="sm" onClick={() => setPhase('preliminary')} className="text-xs gap-1">
            <ArrowLeft className="w-3 h-3" />予選を見る（順位決定戦の結果は残ります）
          </Button>
        </div>
      )}

      {/* 決勝トーナメントフェーズ */}
      {phase === 'knockout' && (
        <div className="space-y-4">
          <TeamKnockoutTree
            encounters={knockoutEncounters}
            bronzeEncounter={bronzeEncounter}
            getTeamName={getTeamName}
            onGameResult={handleKnockoutGameResult}
          />
          <Button variant="outline" size="sm" onClick={() => setPhase('preliminary')} className="text-xs gap-1">
            <ArrowLeft className="w-3 h-3" />予選を見る（決勝トーナメントの結果は残ります）
          </Button>
        </div>
      )}
    </div>
  );
}
