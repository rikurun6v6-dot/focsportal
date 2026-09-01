import type { Player, TournamentType, Division, Gender } from '@/types';
import { isValidDivision } from './divisions';

/**
 * ダブルス用のペアをランダムに生成
 */
export function generateRandomPairs(
  players: Player[],
  tournamentType: TournamentType,
  division: Division
): { pairs: ([Player, Player] | [Player, Player, Player])[]; errors: string[] } {
  const errors: string[] = [];
  const pairs: ([Player, Player] | [Player, Player, Player])[] = [];

  // playersは既にフィルタ済みと想定（呼び出し元でフィルタリング済み）
  if (players.length < 2) {
    errors.push(`参加者が不足しています（最低2名必要、現在${players.length}名）`);
    return { pairs, errors };
  }

  // シャッフル
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  // 奇数の場合、最後の3人で1組のペアを作成
  const isOdd = shuffled.length % 2 !== 0;
  const pairCount = isOdd ? Math.floor(shuffled.length / 2) - 1 : Math.floor(shuffled.length / 2);

  // 通常のペアを作成
  for (let i = 0; i < pairCount * 2; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }

  // 奇数の場合、最後の3人を1組にする
  if (isOdd && shuffled.length >= 3) {
    const lastThree: [Player, Player, Player] = [
      shuffled[shuffled.length - 3],
      shuffled[shuffled.length - 2],
      shuffled[shuffled.length - 1]
    ];
    pairs.push(lastThree);
    errors.push(`参加者数が奇数（${shuffled.length}名）のため、最後の3名で1組のペアを作成しました。`);
  }

  return { pairs, errors };
}

/**
 * 混合ダブルス用のペアを生成（男女1名ずつ）
 * 余った同性選手はペア同士で組み、1名余った場合は既存ペアの3人目に追加する
 */
export function generateMixedPairs(
  players: Player[],
  division: Division
): { pairs: ([Player, Player] | [Player, Player, Player])[]; errors: string[] } {
  const errors: string[] = [];
  const pairs: ([Player, Player] | [Player, Player, Player])[] = [];

  // 男女別にフィルタリング（playersは既にdivisionとis_activeでフィルタ済み）
  const males = players.filter(p => p.gender?.toString().toLowerCase().trim() === 'male');
  const females = players.filter(p => p.gender?.toString().toLowerCase().trim() === 'female');
  // 性別不明・未設定の選手を人数が少ない方のグループに振り分ける
  const unknowns = players.filter(p => {
    const g = p.gender?.toString().toLowerCase().trim();
    return g !== 'male' && g !== 'female';
  });

  if (males.length < 1 || females.length < 1) {
    if (unknowns.length === 0) {
      errors.push('男女それぞれ最低1名必要です');
      return { pairs, errors };
    }
  }

  if (unknowns.length > 0) {
    errors.push(`性別不明の選手が${unknowns.length}名います。人数が少ない方のグループに自動振り分けしました。`);
  }

  // シャッフル
  const shuffledMales = [...males].sort(() => Math.random() - 0.5);
  const shuffledFemales = [...females].sort(() => Math.random() - 0.5);

  // 性別不明を人数が少ない側に順番に配分（均等になるよう交互に）
  unknowns.forEach(p => {
    if (shuffledMales.length <= shuffledFemales.length) {
      shuffledMales.push(p);
    } else {
      shuffledFemales.push(p);
    }
  });

  // 配分後も一方が0名の場合は全員同性ペアとして処理
  if (shuffledMales.length < 1 || shuffledFemales.length < 1) {
    errors.push('男女それぞれ最低1名必要です');
    return { pairs, errors };
  }

  const minCount = Math.min(shuffledMales.length, shuffledFemales.length);

  // 混合ペアを作成
  for (let i = 0; i < minCount; i++) {
    pairs.push([shuffledMales[i], shuffledFemales[i]]);
  }

  // 余った選手を処理（多い方の性別が余る）
  const leftoverMales = shuffledMales.slice(minCount);
  const leftoverFemales = shuffledFemales.slice(minCount);
  const leftovers = [...leftoverMales, ...leftoverFemales];

  if (leftovers.length > 0) {
    const genderLabel = leftoverMales.length > 0 ? '男性' : '女性';
    // 2名以上余った場合：同性同士でペアを組む
    for (let i = 0; i + 1 < leftovers.length; i += 2) {
      pairs.push([leftovers[i], leftovers[i + 1]]);
    }
    // 奇数余り（1名残る）: 既存ペアの3人目として追加
    if (leftovers.length % 2 === 1) {
      const solo = leftovers[leftovers.length - 1];
      if (pairs.length > 0) {
        const target = pairs[pairs.length - 1] as [Player, Player];
        pairs[pairs.length - 1] = [target[0], target[1], solo] as [Player, Player, Player];
        console.log(`[generateMixedPairs] 3人目強制合流: ${solo.name} → ${target[0].name}/${target[1].name} (${pairs.length}番目ペアのplayer5)`);
        errors.push(`${genderLabel}が1名余りました。${target[0].name}/${target[1].name} ペアの3人目として ${solo.name} を追加しました。`);
      } else {
        errors.push(`${solo.name} はペアを組める相手がいないため試合に参加できません。`);
      }
    } else if (leftovers.length > 0) {
      errors.push(`${genderLabel}が${leftovers.length}名余りました。同性ペア${Math.floor(leftovers.length / 2)}組を追加しました。`);
    }
    if (males.length !== females.length) {
      errors.push(`男女の人数が異なります（男性${males.length}名、女性${females.length}名）。全員を割り当てました。`);
    }
  }

  // ── 安全網: 全員がペアに組み込まれているか検証し、漏れた選手を最後のペアに強制合流 ──
  const assignedIds = new Set(pairs.flatMap(p => [p[0].id, p[1].id, ...(p.length === 3 ? [p[2].id] : [])]));
  const remainingPlayers = players.filter(p => !assignedIds.has(p.id));
  if (remainingPlayers.length > 0 && pairs.length > 0) {
    const player = remainingPlayers[0];
    console.log("Adding 3rd person:", player.name);
    const lastPair = pairs[pairs.length - 1] as [Player, Player];
    pairs[pairs.length - 1] = [lastPair[0], lastPair[1], player] as [Player, Player, Player];
    errors.push(`【強制追加】${player.name} を ${lastPair[0].name}/${lastPair[1].name} ペアの3人目（player5）に割り当てました。`);
    if (remainingPlayers.length > 1) {
      errors.push(`⚠️ さらに${remainingPlayers.length - 1}名がペア未割り当てです。手動確認が必要です。`);
    }
  }

  return { pairs, errors };
}

/**
 * トーナメント形式のブラケットを生成
 * 2回戦以降を2のべき乗にするため、シード配置を計算
 */
export function generateTournamentBracket(pairCount: number): {
  rounds: number;
  matchesPerRound: number[];
  totalMatches: number;
  round1Matches: number;
  seedCount: number;
  round2Size: number;
} {
  if (pairCount === 1) {
    return { rounds: 0, matchesPerRound: [], totalMatches: 0, round1Matches: 0, seedCount: 1, round2Size: 0 };
  }

  // M = 2^k where M < pairCount (2回戦のサイズ)
  const round2Size = Math.pow(2, Math.floor(Math.log2(pairCount)));

  // 1回戦の試合数 = N - M
  const round1Matches = pairCount - round2Size;

  // シード数 = 2M - N
  const seedCount = 2 * round2Size - pairCount;

  // 2回戦以降のラウンド数
  const rounds = round1Matches > 0 ? Math.ceil(Math.log2(round2Size)) + 1 : Math.ceil(Math.log2(round2Size));

  const matchesPerRound: number[] = [];

  if (round1Matches > 0) {
    matchesPerRound.push(round1Matches);
  }

  let remainingPairs = round2Size;
  for (let r = 0; r < Math.ceil(Math.log2(round2Size)); r++) {
    matchesPerRound.push(Math.floor(remainingPairs / 2));
    remainingPairs = Math.floor(remainingPairs / 2);
  }

  const totalMatches = matchesPerRound.reduce((sum, count) => sum + count, 0);

  return { rounds, matchesPerRound, totalMatches, round1Matches, seedCount, round2Size };
}

/**
 * シングルス参加者リストを取得
 */
/**
 * 選手の「実効部」を返す。種目ごとの例外（division_overrides）があればそれを優先し、
 * なければ既定の division を使う。
 */
export function getEffectiveDivision(player: Player, tournamentType: TournamentType): Division {
  const ov = player.division_overrides?.[tournamentType];
  // 以前は 1部・2部 しか受け付けておらず、3部への振り替えが黙って無視されていた。
  // 混合ダブルスで「2部男子 × 1,2部女子」のように部をまたいで組むとき、
  // 3部側への振り替えができないと組めない。
  return isValidDivision(ov) ? ov : player.division;
}

export function getEligiblePlayersForSingles(
  players: Player[],
  gender: Gender,
  division: Division
): Player[] {
  return players.filter(p =>
    p.gender?.toString().toLowerCase().trim() === gender &&
    p.division === division &&
    p.is_active
  );
}

/**
 * シングルス用の対戦カードを生成（1対1）
 */
export function generateSinglesMatches(
  players: Player[],
  tournamentType: TournamentType,
  division: Division
): { players: Player[]; errors: string[] } {
  const errors: string[] = [];

  if (players.length < 2) {
    errors.push(`参加者が不足しています（最低2名必要、現在${players.length}名）`);
    return { players: [], errors };
  }

  // シャッフル
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  return { players: shuffled, errors };
}

/**
 * ラウンド名を取得
 */
export function getRoundName(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  
  return `${round}回戦`;
}

/**
 * 試合のポイント数を取得（仕様書に基づく）
 */
export function getMatchPoints(round: number, totalRounds: number): 15 | 21 {
  const fromFinal = totalRounds - round;
  
  // 準決勝と決勝は21点、それ以外は15点
  if (fromFinal <= 1) {
    return 21;
  }
  return 15;
}

// ── 当日くじ用: 選手未定のペア枠 ──────────────────────────────────────────────
//
// ペアを当日の割り箸くじで決めるため、「人数だけ決まっていて誰が入るかは未定」の
// 状態でトーナメント表・リーグ表を先に作れるようにする。
//
// 既存の生成ロジック（generateGroupStageMatches / generatePowerOf2Bracket）は
// Player の配列を受け取る作りなので、ペア番号を id に埋め込んだダミーの Player を
// 流し、Firestore に書く直前に「空の player_id + pair_no」へ変換する。

const PAIR_SLOT_PREFIX = '__pairslot__';

/** ペア番号を埋め込んだダミー選手の id を作る */
function pairSlotId(pairNumber: number): string {
  return `${PAIR_SLOT_PREFIX}${pairNumber}`;
}

/** ダミー選手の id ならペア番号を、そうでなければ null を返す */
export function parsePairSlotId(id: string | undefined | null): number | null {
  if (!id || !id.startsWith(PAIR_SLOT_PREFIX)) return null;
  const n = parseInt(id.slice(PAIR_SLOT_PREFIX.length), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ダミー選手かどうか */
export function isPairSlotId(id: string | undefined | null): boolean {
  return parsePairSlotId(id) !== null;
}

/**
 * 選手未定のペア枠を pairCount 組ぶん作る。
 * 同じペアの2人は同じ id を持つ（＝同じペア番号）。
 */
export function generateNumberedPairs(
  pairCount: number,
  tournamentType: TournamentType,
  division: Division
): { pairs: [Player, Player][]; errors: string[] } {
  const errors: string[] = [];
  if (pairCount < 2) {
    errors.push(`ペア数が不足しています（最低2組必要、現在${pairCount}組）`);
    return { pairs: [], errors };
  }

  const gender: Gender = tournamentType.includes('womens') ? 'female' : 'male';
  const makeSlot = (pairNumber: number): Player => ({
    id: pairSlotId(pairNumber),
    name: `${pairNumber}番ペア`,
    gender,
    division,
    team_id: '',
    is_active: true,
  });

  const pairs: [Player, Player][] = [];
  for (let n = 1; n <= pairCount; n++) {
    pairs.push([makeSlot(n), makeSlot(n)]);
  }
  return { pairs, errors };
}

/**
 * 選手未定の「個人」枠を playerCount 人ぶん作る（シングルス用）。
 * シングルスは1人=1枠なので、番号がそのまま出場順になる。
 */
export function generateNumberedSingles(
  playerCount: number,
  tournamentType: TournamentType,
  division: Division
): { players: Player[]; errors: string[] } {
  const errors: string[] = [];
  if (playerCount < 2) {
    errors.push(`人数が不足しています（最低2名必要、現在${playerCount}名）`);
    return { players: [], errors };
  }

  const gender: Gender = tournamentType.includes('womens') ? 'female' : 'male';
  const players: Player[] = [];
  for (let n = 1; n <= playerCount; n++) {
    players.push({
      id: pairSlotId(n),
      name: `${n}番`,
      gender,
      division,
      team_id: '',
      is_active: true,
    });
  }
  return { players, errors };
}

/**
 * 試合データの player_id を「空文字 + pair_no」に変換する。
 * ダミー選手が入っていないフィールドはそのまま返す。
 */
export function extractPairSlots(fields: {
  player1_id?: string;
  player2_id?: string;
  player3_id?: string;
  player4_id?: string;
  player5_id?: string;
  player6_id?: string;
}): {
  player1_id?: string; player2_id?: string; player3_id?: string;
  player4_id?: string; player5_id?: string; player6_id?: string;
  pair_no_p1?: number; pair_no_p2?: number;
} {
  const out = { ...fields };
  // player1/3/5 が1組目、player2/4/6 が2組目
  const side1 = parsePairSlotId(fields.player1_id) ?? parsePairSlotId(fields.player3_id);
  const side2 = parsePairSlotId(fields.player2_id) ?? parsePairSlotId(fields.player4_id);

  for (const key of ['player1_id', 'player2_id', 'player3_id', 'player4_id', 'player5_id', 'player6_id'] as const) {
    if (isPairSlotId(out[key])) out[key] = '';
  }

  return {
    ...out,
    ...(side1 !== null ? { pair_no_p1: side1 } : {}),
    ...(side2 !== null ? { pair_no_p2: side2 } : {}),
  };
}
