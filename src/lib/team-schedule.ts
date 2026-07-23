/**
 * team-schedule.ts
 * 団体戦の予選を「どの順で・何面使って・どれくらいの時間で」回すかを組み立てる。
 *
 * 対戦の組み合わせ自体は tournament-logic の generateRoundRobinRounds（サーキット法）が出す。
 * ここではそれを、同時に進める対戦数とコート面数に合わせてブロックへ切り分ける。
 */

import type { TeamEncounter } from '@/types';

/** 1試合の想定時間（分）。転換込みの目安に使う */
export const GAME_MINUTES = 15;
/** 波と波のあいだの転換時間（分） */
export const TURNOVER_MINUTES = 5;

/** 同時に進む1かたまり。ここに並ぶ対戦はすべて並行して進める */
export interface ScheduleBlock {
  index: number;                    // 1始まりの通し番号
  /** このブロックで同時に進める対戦 */
  encounters: TeamEncounter[];
  /** グループごとの休みチーム（グループラベル → チームID） */
  byeByGroup: Record<string, string | null>;
  /** 1対戦に割り当てる面数 */
  courtsPerEncounter: number;
  /** 1対戦の全試合を消化するのに必要な波の数 */
  waves: number;
  /** このブロックの所要時間の目安（分） */
  minutes: number;
}

export interface TeamScheduleResult {
  blocks: ScheduleBlock[];
  /** 全体の所要時間の目安（分・休憩を除く） */
  totalMinutes: number;
  /** 同時に進む対戦数（全グループ合計） */
  concurrentEncounters: number;
  /** 同時にコートに入るチーム数 */
  teamsOnCourt: number;
  /** 使用する面数 */
  courtsUsed: number;
  /** 面数が足りず1対戦に1面も割り当てられない場合に立つ */
  notEnoughCourts: boolean;
}

interface BuildScheduleParams {
  /** 予選の全対戦（round と group が入っていること） */
  encounters: TeamEncounter[];
  /** グループごとの休みチーム: `${group}_${round}` → チームID */
  byeByGroupRound: Record<string, string | null>;
  /** 1グループあたり同時に進める対戦数 */
  concurrentPerGroup: number;
  /** 使えるコート面数 */
  courtCount: number;
  /** 1対戦あたりの試合数（第1試合〜第5試合の5試合） */
  gamesPerEncounter: number;
}

/**
 * 予選の進行表を組み立てる。
 *
 * 各グループの同じラウンド同士を並べ、1グループあたり concurrentPerGroup 対戦ずつ
 * 取り出して1ブロックにする。グループ間は常に並行（グループAとBは同時に進む）。
 */
export function buildTeamSchedule({
  encounters,
  byeByGroupRound,
  concurrentPerGroup,
  courtCount,
  gamesPerEncounter,
}: BuildScheduleParams): TeamScheduleResult {
  const groups = [...new Set(encounters.map(e => e.group ?? ''))].sort();
  const rounds = [...new Set(encounters.map(e => e.round ?? 0))].sort((a, b) => a - b);

  const concurrentEncounters = Math.max(1, concurrentPerGroup) * Math.max(1, groups.length);
  const courtsPerEncounter = Math.floor(courtCount / concurrentEncounters);
  const notEnoughCourts = courtsPerEncounter < 1;

  // 面数が足りないときも進行表自体は出す（1面ずつの想定で計算し、警告は呼び出し側で出す）
  // 1対戦は5試合しかないので、6面割り当てても実際に使うのは5面。余りは数えない
  const effectiveCourts = Math.min(Math.max(1, courtsPerEncounter), gamesPerEncounter);
  const waves = Math.ceil(gamesPerEncounter / effectiveCourts);
  const blockMinutes = waves * GAME_MINUTES + (waves - 1) * TURNOVER_MINUTES;

  const blocks: ScheduleBlock[] = [];

  for (const round of rounds) {
    // グループごとに、このラウンドの対戦を取り出す
    const byGroup: Record<string, TeamEncounter[]> = {};
    for (const g of groups) {
      byGroup[g] = encounters.filter(e => (e.group ?? '') === g && (e.round ?? 0) === round);
    }
    // このラウンドを何ブロックに割るか（いちばん対戦が多いグループに合わせる）
    const maxInRound = Math.max(0, ...groups.map(g => byGroup[g].length));
    const chunkCount = Math.ceil(maxInRound / Math.max(1, concurrentPerGroup));

    for (let c = 0; c < chunkCount; c++) {
      const picked: TeamEncounter[] = [];
      for (const g of groups) {
        picked.push(...byGroup[g].slice(c * concurrentPerGroup, (c + 1) * concurrentPerGroup));
      }
      if (picked.length === 0) continue;

      const byeByGroup: Record<string, string | null> = {};
      for (const g of groups) byeByGroup[g] = byeByGroupRound[`${g}_${round}`] ?? null;

      blocks.push({
        index: blocks.length + 1,
        encounters: picked,
        // 休みはラウンド単位なので、そのラウンドの先頭ブロックにだけ出す
        byeByGroup: c === 0 ? byeByGroup : {},
        courtsPerEncounter: effectiveCourts,
        waves,
        minutes: blockMinutes,
      });
    }
  }

  return {
    blocks,
    totalMinutes: blocks.reduce((sum, b) => sum + b.minutes, 0) + Math.max(0, blocks.length - 1) * TURNOVER_MINUTES,
    concurrentEncounters,
    teamsOnCourt: concurrentEncounters * 2,
    courtsUsed: concurrentEncounters * effectiveCourts,
    notEnoughCourts,
  };
}

/** 分を「2時間55分」の形にする */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/**
 * 同時進行数の選択肢と、それぞれの見込みを出す。
 * 運営が「4チーム同時か、8チーム同時か」をその場で比べられるようにするための材料。
 */
export interface ConcurrencyOption {
  concurrentPerGroup: number;
  concurrentEncounters: number;
  teamsOnCourt: number;
  courtsPerEncounter: number;
  waves: number;
  courtsUsed: number;
  /** 1チームがそのブロックで同時に出す試合数 = 必要人数の目安に効く */
  simultaneousGamesPerTeam: number;
  enoughCourts: boolean;
}

export function listConcurrencyOptions(
  groupCount: number,
  maxPerGroup: number,
  courtCount: number,
  gamesPerEncounter: number,
): ConcurrencyOption[] {
  const options: ConcurrencyOption[] = [];
  for (let n = 1; n <= Math.max(1, maxPerGroup); n++) {
    const concurrentEncounters = n * Math.max(1, groupCount);
    const rawPerEncounter = Math.floor(courtCount / concurrentEncounters);
    // 1対戦は gamesPerEncounter 試合しかないので、それ以上の面は使わない
    const effective = Math.min(Math.max(1, rawPerEncounter), gamesPerEncounter);
    options.push({
      concurrentPerGroup: n,
      concurrentEncounters,
      teamsOnCourt: concurrentEncounters * 2,
      courtsPerEncounter: effective,
      waves: Math.ceil(gamesPerEncounter / effective),
      courtsUsed: concurrentEncounters * effective,
      simultaneousGamesPerTeam: effective,
      enoughCourts: rawPerEncounter >= 1,
    });
  }
  return options;
}
