'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { TeamMatchConfig, TeamEncounter, TeamRankEntry } from '@/types';
import {
  buildGameSlots,
  generateTeamPreliminaryEncounters,
  generateTeamPlacementEncounters,
  generateTeamFinalBracket,
  applyTeamAdvancersToFinalBracket,
  rankTeamGroup,
  getNeedJankenPairs,
  advanceTeamWinnerToNextRound,
  generateTeamBronzeEncounter,
  resolveTeamBronzeEncounter,
  recordTeamGameResult,
} from '@/lib/tournament-logic';
import TeamMatchConfigEditor from './TeamMatchConfigEditor';
import TeamPreliminaryGroup from './TeamPreliminaryGroup';
import TeamKnockoutTree from './TeamKnockoutTree';
import TeamPlacementView from './TeamPlacementView';
import { Trophy, Users, Plus, Trash2, ArrowRight } from 'lucide-react';

interface SimpleTeam {
  id: string;
  name: string;
}

const DEFAULT_CONFIG: TeamMatchConfig = {
  games: [
    { type: 'MD', count: 1 },
    { type: 'WD', count: 1 },
    { type: 'XD', count: 1 },
    { type: 'MS', count: 1 },
    { type: 'WS', count: 1 },
  ],
};

type Phase = 'setup' | 'preliminary' | 'placement' | 'knockout';
type FinalFormat = 'placement' | 'knockout';

export default function TeamTournamentGenerator() {
  const [teams, setTeams] = useState<SimpleTeam[]>([
    { id: 'team_1', name: 'チームA' },
    { id: 'team_2', name: 'チームB' },
    { id: 'team_3', name: 'チームC' },
    { id: 'team_4', name: 'チームD' },
    { id: 'team_5', name: 'チームE' },
    { id: 'team_6', name: 'チームF' },
    { id: 'team_7', name: 'チームG' },
    { id: 'team_8', name: 'チームH' },
  ]);
  const [newTeamName, setNewTeamName] = useState('');
  const [config, setConfig] = useState<TeamMatchConfig>(DEFAULT_CONFIG);
  const [groupCount, setGroupCount] = useState(2);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState(2);
  const [finalFormat, setFinalFormat] = useState<FinalFormat>('placement');
  const [phase, setPhase] = useState<Phase>('setup');

  const [prelimEncounters, setPrelimEncounters] = useState<TeamEncounter[]>([]);
  const [placementEncounters, setPlacementEncounters] = useState<TeamEncounter[]>([]);
  const [knockoutEncounters, setKnockoutEncounters] = useState<TeamEncounter[]>([]);
  const [bronzeEncounter, setBronzeEncounter] = useState<TeamEncounter | null>(null);
  const [jankenWinners, setJankenWinners] = useState<Record<string, string>>({});

  const getTeamName = (id: string) => {
    if (id === 'BYE') return 'BYE';
    if (id.startsWith('winner-of-')) return '勝者待ち';
    if (id.startsWith('loser-of-')) return '敗者待ち';
    if (id.startsWith('team-slot-')) return `待機中(${id.replace('team-slot-', '')})`;
    return teams.find(t => t.id === id)?.name ?? id;
  };

  // グループ別エンカウンター・順位計算
  const groups = [...new Set(prelimEncounters.map(e => e.group ?? ''))].sort();
  const encountersByGroup: Record<string, TeamEncounter[]> = {};
  const rankingsByGroup: Record<string, TeamRankEntry[]> = {};
  const jankenPairsByGroup: Record<string, [string, string][]> = {};

  for (const g of groups) {
    encountersByGroup[g] = prelimEncounters.filter(e => e.group === g);
    rankingsByGroup[g] = rankTeamGroup(encountersByGroup[g], jankenWinners);
    jankenPairsByGroup[g] = getNeedJankenPairs(rankingsByGroup[g], encountersByGroup[g], jankenWinners);
  }

  const allPrelimDone = prelimEncounters.length > 0 && prelimEncounters.every(e => e.completed);
  const needJanken = allPrelimDone && groups.some(g => (jankenPairsByGroup[g] ?? []).length > 0);
  const canAdvance = allPrelimDone && !needJanken;

  const handleAddTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    const id = `team_${Date.now()}`;
    setTeams(prev => [...prev, { id, name }]);
    setNewTeamName('');
  };

  const handleRemoveTeam = (id: string) => {
    setTeams(prev => prev.filter(t => t.id !== id));
  };

  const handleStartPreliminary = () => {
    const encs = generateTeamPreliminaryEncounters(teams, groupCount, config);
    setPrelimEncounters(encs);
    setPhase('preliminary');
  };

  const handleStartPlacement = () => {
    const encs = generateTeamPlacementEncounters(rankingsByGroup, groups, config);
    setPlacementEncounters(encs);
    setPhase('placement');
  };

  const handleStartKnockout = () => {
    const advancers: string[] = [];
    for (const g of groups) {
      const ranked = rankingsByGroup[g];
      ranked.slice(0, qualifiersPerGroup).forEach(r => advancers.push(r.teamId));
    }
    let bracket = generateTeamFinalBracket(advancers.length, config);
    bracket = applyTeamAdvancersToFinalBracket(bracket, advancers);
    setKnockoutEncounters(bracket);
    const bronze = generateTeamBronzeEncounter(bracket, config);
    setBronzeEncounter(bronze);
    setPhase('knockout');
  };

  const handlePrelimGameResult = (encounterId: string, slotId: string, winner: 1 | 2, score1?: number, score2?: number) => {
    setPrelimEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      const updated = recordTeamGameResult(enc, slotId, winner, score1, score2);
      return prev.map(e => e.id === encounterId ? updated : e);
    });
  };

  const handlePlacementGameResult = (encounterId: string, slotId: string, winner: 1 | 2, score1?: number, score2?: number) => {
    setPlacementEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      const updated = recordTeamGameResult(enc, slotId, winner, score1, score2);
      return prev.map(e => e.id === encounterId ? updated : e);
    });
  };

  const handleKnockoutGameResult = (encounterId: string, slotId: string, winner: 1 | 2, score1?: number, score2?: number) => {
    if (bronzeEncounter && bronzeEncounter.id === encounterId) {
      setBronzeEncounter(prev => {
        if (!prev) return prev;
        return recordTeamGameResult(prev, slotId, winner, score1, score2);
      });
      return;
    }
    setKnockoutEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      const updated = recordTeamGameResult(enc, slotId, winner, score1, score2);
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

  // 予選に戻る
  const handleBackToPrelim = () => {
    setPlacementEncounters([]);
    setKnockoutEncounters([]);
    setBronzeEncounter(null);
    setPhase('preliminary');
  };

  return (
    <div className="space-y-6">

      {/* セットアップ */}
      {phase === 'setup' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-5 h-5 text-blue-500" />
                チーム設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="チーム名を入力"
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleAddTeam()}
                />
                <Button onClick={handleAddTeam} size="sm" className="gap-1">
                  <Plus className="w-3 h-3" /> 追加
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {teams.map(t => (
                  <Badge key={t.id} variant="outline" className="flex items-center gap-1 py-1">
                    {t.name}
                    <button
                      onClick={() => handleRemoveTeam(t.id)}
                      className="ml-1 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-slate-500">{teams.length}チーム</p>
            </CardContent>
          </Card>

          <TeamMatchConfigEditor value={config} onChange={setConfig} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Trophy className="w-4 h-4 text-violet-500" />
                大会形式
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm w-28">グループ数</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(n => (
                    <Button
                      key={n}
                      size="sm"
                      variant={groupCount === n ? 'default' : 'outline'}
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setGroupCount(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm w-28">最終フェーズ</label>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={finalFormat === 'placement' ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => setFinalFormat('placement')}
                  >
                    順位決定戦
                  </Button>
                  <Button
                    size="sm"
                    variant={finalFormat === 'knockout' ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => setFinalFormat('knockout')}
                  >
                    決勝T
                  </Button>
                </div>
              </div>

              {finalFormat === 'knockout' && (
                <div className="flex items-center gap-3">
                  <label className="text-sm w-28">通過チーム数</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(n => (
                      <Button
                        key={n}
                        size="sm"
                        variant={qualifiersPerGroup === n ? 'default' : 'outline'}
                        className="h-7 w-7 p-0 text-xs"
                        onClick={() => setQualifiersPerGroup(n)}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                {finalFormat === 'placement'
                  ? `予選終了後、同順位チーム同士で順位決定戦を行います（1位同士、2位同士、…）`
                  : `各グループ上位${qualifiersPerGroup}チームが決勝トーナメントに進出します`}
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleStartPreliminary}
            disabled={teams.length < 2}
            className="w-full gap-2"
          >
            <Trophy className="w-4 h-4" />
            予選グループを開始
          </Button>
        </div>
      )}

      {/* 予選フェーズ */}
      {phase === 'preliminary' && (
        <div className="space-y-4">
          <TeamPreliminaryGroup
            groups={groups}
            encountersByGroup={encountersByGroup}
            rankingsByGroup={rankingsByGroup}
            jankenPairsByGroup={jankenPairsByGroup}
            getTeamName={getTeamName}
            onGameResult={handlePrelimGameResult}
            onJanken={handleJanken}
          />

          {needJanken && (
            <div className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
              同順位チームのじゃんけん結果を入力してください
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
            <p className="text-xs text-center text-slate-400">全予選対戦が完了すると次のフェーズに進めます</p>
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToPrelim}
            className="text-xs"
          >
            ← 予選に戻る
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToPrelim}
            className="text-xs"
          >
            ← 予選に戻る
          </Button>
        </div>
      )}
    </div>
  );
}
