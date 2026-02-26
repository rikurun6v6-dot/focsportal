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
  generateTeamFinalBracket,
  applyTeamAdvancersToFinalBracket,
  rankTeamGroup,
  advanceTeamWinnerToNextRound,
  generateTeamBronzeEncounter,
  resolveTeamBronzeEncounter,
} from '@/lib/tournament-logic';
import TeamMatchConfigEditor from './TeamMatchConfigEditor';
import TeamPreliminaryGroup from './TeamPreliminaryGroup';
import TeamKnockoutTree from './TeamKnockoutTree';
import { recordTeamGameResult } from '@/lib/tournament-logic';
import { Trophy, Users, Plus, Trash2 } from 'lucide-react';

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

type Phase = 'setup' | 'preliminary' | 'knockout';

export default function TeamTournamentGenerator() {
  const [teams, setTeams] = useState<SimpleTeam[]>([
    { id: 'team_1', name: 'チームA' },
    { id: 'team_2', name: 'チームB' },
    { id: 'team_3', name: 'チームC' },
    { id: 'team_4', name: 'チームD' },
  ]);
  const [newTeamName, setNewTeamName] = useState('');
  const [config, setConfig] = useState<TeamMatchConfig>(DEFAULT_CONFIG);
  const [groupCount, setGroupCount] = useState(2);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState(2);
  const [phase, setPhase] = useState<Phase>('setup');

  const [prelimEncounters, setPrelimEncounters] = useState<TeamEncounter[]>([]);
  const [knockoutEncounters, setKnockoutEncounters] = useState<TeamEncounter[]>([]);
  const [bronzeEncounter, setBronzeEncounter] = useState<TeamEncounter | null>(null);

  const getTeamName = (id: string) => {
    if (id === 'BYE') return 'BYE';
    if (id.startsWith('winner-of-')) return '勝者待ち';
    if (id.startsWith('loser-of-')) return '敗者待ち';
    if (id.startsWith('team-slot-')) return `待機中(${id.replace('team-slot-', '')})`;
    return teams.find(t => t.id === id)?.name ?? id;
  };

  // グループ別エンカウンター
  const groups = [...new Set(prelimEncounters.map(e => e.group ?? ''))].sort();
  const encountersByGroup: Record<string, TeamEncounter[]> = {};
  const rankingsByGroup: Record<string, TeamRankEntry[]> = {};
  for (const g of groups) {
    encountersByGroup[g] = prelimEncounters.filter(e => e.group === g);
    rankingsByGroup[g] = rankTeamGroup(encountersByGroup[g]);
  }

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

  const handleStartKnockout = () => {
    // 各グループから qualifiersPerGroup チームを抽出
    const advancers: string[] = [];
    for (const g of groups) {
      const ranked = rankTeamGroup(encountersByGroup[g]);
      ranked.slice(0, qualifiersPerGroup).forEach(r => advancers.push(r.teamId));
    }

    let bracket = generateTeamFinalBracket(advancers.length, config);
    bracket = applyTeamAdvancersToFinalBracket(bracket, advancers);
    setKnockoutEncounters(bracket);

    const bronze = generateTeamBronzeEncounter(bracket, config);
    setBronzeEncounter(bronze);
    setPhase('knockout');
  };

  const handlePrelimGameResult = (encounterId: string, slotId: string, winner: 1 | 2) => {
    setPrelimEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      const updated = recordTeamGameResult(enc, slotId, winner);
      return prev.map(e => e.id === encounterId ? updated : e);
    });
  };

  const handleKnockoutGameResult = (encounterId: string, slotId: string, winner: 1 | 2) => {
    // bronze?
    if (bronzeEncounter && bronzeEncounter.id === encounterId) {
      setBronzeEncounter(prev => {
        if (!prev) return prev;
        return recordTeamGameResult(prev, slotId, winner);
      });
      return;
    }

    setKnockoutEncounters(prev => {
      const enc = prev.find(e => e.id === encounterId);
      if (!enc) return prev;
      const updated = recordTeamGameResult(enc, slotId, winner);
      let next = prev.map(e => e.id === encounterId ? updated : e);

      if (updated.completed) {
        next = advanceTeamWinnerToNextRound(next, encounterId);
        // bronze resolve
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

  const allPrelimDone = prelimEncounters.length > 0 && prelimEncounters.every(e => e.completed);

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
            getTeamName={getTeamName}
            onGameResult={handlePrelimGameResult}
          />
          <Button
            onClick={handleStartKnockout}
            disabled={!allPrelimDone}
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
          >
            <Trophy className="w-4 h-4" />
            決勝トーナメントへ進む
          </Button>
          {!allPrelimDone && (
            <p className="text-xs text-center text-slate-400">全予選対戦が完了すると決勝トーナメントに進めます</p>
          )}
        </div>
      )}

      {/* 決勝フェーズ */}
      {phase === 'knockout' && (
        <TeamKnockoutTree
          encounters={knockoutEncounters}
          bronzeEncounter={bronzeEncounter}
          getTeamName={getTeamName}
          onGameResult={handleKnockoutGameResult}
        />
      )}
    </div>
  );
}
