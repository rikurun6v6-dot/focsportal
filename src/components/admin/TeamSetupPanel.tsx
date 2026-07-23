'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Trophy, Users, Plus, Trash2, AlertTriangle, ListOrdered, CalendarClock } from 'lucide-react';
import TeamRankOrderEditor from './TeamRankOrderEditor';
import type { TeamRankCriterion } from '@/lib/tournament-logic';
import { listConcurrencyOptions } from '@/lib/team-schedule';

export interface SimpleTeam {
  id: string;
  name: string;
}

export type FinalFormat = 'placement' | 'knockout';

interface TeamSetupPanelProps {
  teams: SimpleTeam[];
  newTeamName: string;
  groupCount: number;
  qualifiersPerGroup: number;
  finalFormat: FinalFormat;
  teamGroupAssignments: Record<string, number>;
  rankOrder: TeamRankCriterion[];
  courtCount: number;
  concurrentPerGroup: number;
  /** 1対戦あたりの試合数（男子D・女子D・混合D・男子S・女子S なら5） */
  gamesPerEncounter: number;
  /** 進行中に設定を開いているか。開始ボタンの文言と注意書きを変える */
  isRunning: boolean;
  onNewTeamNameChange: (v: string) => void;
  onAddTeam: () => void;
  onRemoveTeam: (id: string) => void;
  onGroupCountChange: (n: number) => void;
  onQualifiersChange: (n: number) => void;
  onFinalFormatChange: (f: FinalFormat) => void;
  onAssignGroup: (teamId: string, group: number) => void;
  onRankOrderChange: (order: TeamRankCriterion[]) => void;
  onCourtCountChange: (n: number) => void;
  onConcurrentPerGroupChange: (n: number) => void;
  onStartPreliminary: () => void;
}

const GROUP_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-300',
  'bg-green-100 text-green-700 border-green-300',
  'bg-orange-100 text-orange-700 border-orange-300',
  'bg-purple-100 text-purple-700 border-purple-300',
];
const GROUP_LABELS = ['グループ1', 'グループ2', 'グループ3', 'グループ4'];

/**
 * 団体戦の初期設定パネル。
 *
 * ここを TeamTournamentGenerator の中で定義していたときは、レンダーのたびに
 * 別のコンポーネントとして作り直されるため、チーム名を1文字打つたびに
 * 入力欄が作り直されてフォーカスが外れていた。独立したモジュールに出して解消している。
 */
export default function TeamSetupPanel({
  teams,
  newTeamName,
  groupCount,
  qualifiersPerGroup,
  finalFormat,
  teamGroupAssignments,
  rankOrder,
  courtCount,
  concurrentPerGroup,
  gamesPerEncounter,
  isRunning,
  onNewTeamNameChange,
  onAddTeam,
  onRemoveTeam,
  onGroupCountChange,
  onQualifiersChange,
  onFinalFormatChange,
  onAssignGroup,
  onRankOrderChange,
  onCourtCountChange,
  onConcurrentPerGroupChange,
  onStartPreliminary,
}: TeamSetupPanelProps) {
  // 開始前のチェック: 空のグループがあると対戦が作られない
  const teamsPerGroup = Array.from({ length: groupCount }, (_, g) =>
    teams.filter(t => (teamGroupAssignments[t.id] ?? 0) === g));
  const emptyGroups = teamsPerGroup
    .map((list, g) => ({ g, count: list.length }))
    .filter(x => x.count === 0);
  const soloGroups = teamsPerGroup
    .map((list, g) => ({ g, count: list.length }))
    .filter(x => x.count === 1);

  // 同時進行の選択肢。1グループの最大同時数は「そのグループで同時に成立する対戦数」
  const minGroupTeams = Math.min(...teamsPerGroup.map(l => l.length));
  const maxConcurrentPerGroup = Math.max(1, Math.floor(minGroupTeams / 2));
  const concurrencyOptions = listConcurrencyOptions(
    Math.max(1, groupCount), maxConcurrentPerGroup, courtCount, gamesPerEncounter);

  // 順位決定戦のラベル例（1位決定戦・3位決定戦・…）を出して、何が起きるか先に見せる
  const placementPairCount = groupCount === 2 ? Math.min(...teamsPerGroup.map(l => l.length)) : 0;
  const placementLabels = placementPairCount > 0
    ? Array.from({ length: placementPairCount }, (_, i) => `${i * 2 + 1}位決定戦`).join('・')
    : '';
  // グループのチーム数が違うと、多い側の下位チームは相手がいない
  const unevenGroupWarning = (() => {
    if (groupCount !== 2) return '';
    const [a, b] = teamsPerGroup.map(l => l.length);
    if (a === b) return '';
    const diff = Math.abs(a - b);
    const bigger = a > b ? 'グループ1' : 'グループ2';
    return `グループのチーム数が違います（${a}対${b}）。${bigger}の下位${diff}チームは相手がいないため順位決定戦に出られません。`;
  })();

  const blockingReasons: string[] = [];
  if (teams.length < 2) blockingReasons.push('チームが2つ以上必要です');
  if (finalFormat === 'placement' && groupCount !== 2) {
    blockingReasons.push('順位決定戦を選ぶ場合、グループ数はちょうど2つにしてください');
  }
  if (groupCount > 1 && emptyGroups.length > 0) {
    blockingReasons.push(`${emptyGroups.map(x => GROUP_LABELS[x.g]).join('・')} にチームが入っていません`);
  }
  if (finalFormat === 'knockout' && teams.length > 0) {
    const minGroupSize = Math.min(...teamsPerGroup.map(l => l.length));
    if (minGroupSize < qualifiersPerGroup) {
      blockingReasons.push(`通過${qualifiersPerGroup}チームに対して、チーム数が足りないグループがあります`);
    }
  }

  const warnings: string[] = [];
  if (soloGroups.length > 0) {
    warnings.push(`${soloGroups.map(x => GROUP_LABELS[x.g]).join('・')} は1チームだけなので対戦が組まれません`);
  }

  const canStart = blockingReasons.length === 0;

  return (
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
              onChange={e => onNewTeamNameChange(e.target.value)}
              placeholder="チーム名を入力"
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && onAddTeam()}
            />
            <Button onClick={onAddTeam} size="sm" className="gap-1 h-10">
              <Plus className="w-3 h-3" /> 追加
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {teams.map(t => (
              <Badge key={t.id} variant="outline" className="flex items-center gap-1 py-1 pl-2 pr-1">
                {t.name}
                <button
                  onClick={() => onRemoveTeam(t.id)}
                  className="ml-0.5 w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                  aria-label={`${t.name} を削除`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Badge>
            ))}
          </div>
          <p className="text-xs text-slate-500">{teams.length}チーム</p>
        </CardContent>
      </Card>

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
                  className="h-9 w-9 p-0 text-xs"
                  onClick={() => onGroupCountChange(n)}
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
                className="h-9 px-3 text-xs"
                onClick={() => onFinalFormatChange('placement')}
              >
                順位決定戦
              </Button>
              <Button
                size="sm"
                variant={finalFormat === 'knockout' ? 'default' : 'outline'}
                className="h-9 px-3 text-xs"
                onClick={() => onFinalFormatChange('knockout')}
              >
                決勝トーナメント
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
                    className="h-9 w-9 p-0 text-xs"
                    onClick={() => onQualifiersChange(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-600 bg-slate-50 rounded p-2">
            {finalFormat === 'placement'
              ? `予選終了後、両グループの同じ順位同士で対戦します（1位決定戦・3位決定戦・5位決定戦…）。${teams.length}チームなら ${placementLabels}`
              : `各グループ上位${qualifiersPerGroup}チームが決勝トーナメントに進出します`}
          </div>
          {finalFormat === 'placement' && groupCount !== 2 && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              順位決定戦は「グループAの1位 vs グループBの1位」の形なので、グループ数はちょうど2つ必要です。
              {groupCount === 1
                ? '1グループなら総当たりの結果がそのまま最終順位になるので、順位決定戦は要りません。'
                : `現在は${groupCount}グループです。`}
            </p>
          )}
          {finalFormat === 'placement' && groupCount === 2 && unevenGroupWarning && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              {unevenGroupWarning}
            </p>
          )}
          <p className="text-xs text-slate-500">
            1対戦は 男子D・女子D・混合D・男子S・女子S の5試合、3本先取で決着します
          </p>
        </CardContent>
      </Card>

      {/* コートと同時進行 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="w-4 h-4 text-sky-600" />
            コートと同時進行
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm w-28">使えるコート面数</label>
            <div className="flex gap-1 flex-wrap">
              {[4, 6, 8, 10, 12, 16].map(n => (
                <Button
                  key={n}
                  size="sm"
                  variant={courtCount === n ? 'default' : 'outline'}
                  className="h-9 w-11 p-0 text-xs"
                  onClick={() => onCourtCountChange(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm block mb-2">同時に進める対戦数（1グループあたり）</label>
            <div className="space-y-1.5">
              {concurrencyOptions.map(opt => {
                const selected = concurrentPerGroup === opt.concurrentPerGroup;
                return (
                  <button
                    key={opt.concurrentPerGroup}
                    onClick={() => onConcurrentPerGroupChange(opt.concurrentPerGroup)}
                    disabled={!opt.enoughCourts}
                    className={`w-full text-left rounded-lg border p-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${selected
                      ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        1グループ {opt.concurrentPerGroup}対戦
                      </span>
                      <span className="text-xs font-bold text-sky-700">
                        {opt.teamsOnCourt}チームが同時にコートへ
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {opt.enoughCourts
                        ? `全体で${opt.concurrentEncounters}対戦を並行。1対戦あたり${opt.courtsPerEncounter}面（${opt.courtsUsed}/${courtCount}面を使用）、5試合を${opt.waves}波で消化`
                        : `${opt.concurrentEncounters}面以上必要です（現在${courtCount}面）`}
                    </p>
                    {opt.enoughCourts && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        1チームが同時に出す試合は最大{opt.simultaneousGamesPerTeam}試合
                        {opt.simultaneousGamesPerTeam >= 5
                          ? '（男女それぞれ4人以上必要）'
                          : opt.simultaneousGamesPerTeam >= 3
                            ? '（男女それぞれ3人以上必要）'
                            : ''}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 順位の決め方 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListOrdered className="w-4 h-4 text-emerald-600" />
            予選順位の決め方
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TeamRankOrderEditor order={rankOrder} onChange={onRankOrderChange} />
        </CardContent>
      </Card>

      {/* グループ割り当て（グループ数 > 1 のとき表示） */}
      {groupCount > 1 && teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-indigo-500" />
              グループ割り当て
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-slate-500 mb-3">各チームをグループに割り当ててください（未選択はグループ1に入ります）</p>
            {teams.map(t => {
              const assigned = teamGroupAssignments[t.id] ?? 0;
              return (
                <div key={t.id} className="flex items-center gap-3 py-1 border-b border-slate-100 last:border-0">
                  <span className="flex-1 text-sm font-medium text-slate-800 truncate">{t.name}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: groupCount }, (_, i) => (
                      <Button
                        key={i}
                        size="sm"
                        variant={assigned === i ? 'default' : 'outline'}
                        className={`h-9 px-2.5 text-xs ${assigned === i ? '' : 'text-slate-500'}`}
                        onClick={() => onAssignGroup(t.id, i)}
                      >
                        {GROUP_LABELS[i]}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* グループ別プレビュー */}
            <div className={`grid gap-2 mt-3 ${groupCount === 2 ? 'grid-cols-2' : groupCount === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
              {teamsPerGroup.map((groupTeams, g) => (
                <div key={g} className={`rounded-lg border p-2 text-xs ${GROUP_COLORS[g] || GROUP_COLORS[0]}`}>
                  <div className="font-bold mb-1">{GROUP_LABELS[g]}（{groupTeams.length}チーム）</div>
                  {groupTeams.map(t => <div key={t.id} className="truncate">{t.name}</div>)}
                  {groupTeams.length === 0 && <div className="italic opacity-70">未割り当て</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 開始前のチェック結果 */}
      {blockingReasons.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-bold text-red-900 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            この設定では開始できません
          </p>
          <ul className="mt-1 space-y-0.5">
            {blockingReasons.map(r => (
              <li key={r} className="text-xs text-red-800">・{r}</li>
            ))}
          </ul>
        </div>
      )}
      {blockingReasons.length === 0 && warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            確認してください
          </p>
          <ul className="mt-1 space-y-0.5">
            {warnings.map(r => (
              <li key={r} className="text-xs text-amber-800">・{r}</li>
            ))}
          </ul>
        </div>
      )}

      {isRunning && (
        <p className="text-xs text-slate-500">
          進行中です。下のボタンを押すと対戦表を作り直すため、入力済みの予選結果は失われます。
          チーム名の変更や順位の決め方だけを直したい場合は、押さずに「設定を閉じる」でこのまま続けられます。
        </p>
      )}

      <Button
        onClick={onStartPreliminary}
        disabled={!canStart}
        className={`w-full gap-2 ${isRunning ? 'bg-red-600 hover:bg-red-700' : ''}`}
      >
        <Trophy className="w-4 h-4" />
        {isRunning ? '対戦表を作り直す（予選結果は消えます）' : '予選グループを開始'}
      </Button>
    </div>
  );
}
