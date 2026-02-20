import type { Player, TournamentType, Division } from '@/types';

/**
 * 2の累乗スロット方式トーナメント生成ロジック
 * 10〜50名以上の可変参加人数に完全対応
 * シード配置：上端と下端に均等分配（標準トーナメント理論に基づく）
 */

export interface TournamentSlot {
  slotId: string;         // 座標ID形式: "1_1", "1_2", "2_1"（round_match）
  roundNumber: number;    // ラウンド番号（1, 2, 3...）
  matchNumber: number;    // そのラウンド内での試合番号（1, 2, 3...）
  player1?: Player;
  player2?: Player;
  player3?: Player;       // ダブルスのペア
  player4?: Player;       // ダブルスのペア
  player5?: Player;       // 3人ペア用（player1チームの3人目）
  player6?: Player;       // 3人ペア用（player2チームの3人目）
  isBye: boolean;         // 不戦勝かどうか
  nextMatchId?: string;   // 次の試合のID（例: "2_1"）
}

export interface TournamentBracket {
  totalSlots: number;           // 総スロット数（16, 32, 64...）
  totalRounds: number;          // 総ラウンド数
  slots: TournamentSlot[];      // 全試合スロット
  participantCount: number;     // 実際の参加者数
}

/**
 * 参加者数に対して最小の2の累乗枠数を計算
 * 例: 10人 → 16, 18人 → 32, 50人 → 64
 */
export function calculateBracketSize(participantCount: number): number {
  if (participantCount <= 0) return 0;
  if (participantCount === 1) return 1;

  let size = 2;
  while (size < participantCount) {
    size *= 2;
  }
  return size;
}

/**
 * ラウンド数を計算
 * 例: 16人 → 4ラウンド, 32人 → 5ラウンド
 */
export function calculateRounds(bracketSize: number): number {
  if (bracketSize <= 1) return 0;
  return Math.ceil(Math.log2(bracketSize));
}

/**
 * 試合IDを生成（座標ベース）
 * 形式: "round_match" 例: "1_1", "1_2", "2_1"
 * 注: Firestoreドキュメントとして保存する際は `${campId}_${tournamentType}_${division}_${round}_${matchNumber}` 形式に拡張される
 */
export function generateMatchId(round: number, matchNumber: number): string {
  return `${round}_${matchNumber}`;
}

/**
 * Firestore用の完全なドキュメントIDを生成（唯一の正解関数）
 * 生成側と表示側の両方で必ずこの関数を使用すること
 * 形式: "${campId}_${tournamentType}_${division}_${round}_${matchNumber}"
 * 例: "camp123_mens_doubles_1_1_1"
 */
export function getFinalMatchId(
  campId: string,
  tournamentType: string,
  division: number,
  round: number,
  matchNumber: number
): string {
  return `${campId}_${tournamentType}_${division}_${round}_${matchNumber}`;
}

/**
 * 次の試合のIDを計算
 * 例: 1_1 と 1_2 の勝者は 2_1 へ
 */
export function calculateNextMatchId(round: number, matchNumber: number, totalRounds: number): string | undefined {
  if (round >= totalRounds) return undefined;

  const nextRound = round + 1;
  const nextMatchNumber = Math.ceil(matchNumber / 2);

  return generateMatchId(nextRound, nextMatchNumber);
}

/**
 * 標準トーナメントシード配置順序を生成
 * 
 * アルゴリズム：上位シードを分散配置し、決勝で1位と2位が当たるようにする
 * 例：
 * - 4枠: [1, 4, 2, 3]
 * - 8枠: [1, 8, 4, 5, 2, 7, 3, 6]
 * - 16枠: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
 * 
 * @param bracketSize 2の累乗の枠数（4, 8, 16, 32, 64...）
 * @returns シード番号の配列（1から始まる）
 */
function generateSeededOrder(bracketSize: number): number[] {
  if (bracketSize <= 1) return [1];
  if (bracketSize === 2) return [1, 2];

  const rounds = Math.log2(bracketSize);
  let order = [1, 2];

  // 各ラウンドごとに配置を拡張
  for (let i = 1; i < rounds; i++) {
    const newOrder: number[] = [];
    const size = order.length * 2 + 1;

    for (const seed of order) {
      newOrder.push(seed);
      newOrder.push(size - seed);
    }

    order = newOrder;
  }

  return order;
}

/**
 * トーナメントブラケットを生成（シングルエリミネーション）
 * 
 * **重要な改善点：**
 * - シード（不戦勝）を上端と下端に均等分配
 * - 標準トーナメント配置により、強いシードを離して配置
 * - 各試合に座標（Round, Index）を明確に割り当て
 *
 * @param participants 参加者リスト（シード順 or 登録順）
 * @param isDoubles ダブルス形式かどうか
 */
export function generatePowerOf2Bracket(
  participants: (Player | [Player, Player] | [Player, Player, Player])[],
  isDoubles: boolean = false
): TournamentBracket {
  const participantCount = participants.length;
  const bracketSize = calculateBracketSize(participantCount);
  const totalRounds = calculateRounds(bracketSize);

  // 標準トーナメントシード順序を取得
  const seededOrder = generateSeededOrder(bracketSize);

  // 参加者を配置用の配列を作成（シード番号順）
  const participantMap = new Map<number, Player | [Player, Player] | [Player, Player, Player]>();
  for (let i = 0; i < participantCount; i++) {
    participantMap.set(i + 1, participants[i]);
  }

  const slots: TournamentSlot[] = [];

  // 1回戦のスロットを生成（シード順序に基づく）
  const round1Matches = bracketSize / 2;

  for (let matchNum = 1; matchNum <= round1Matches; matchNum++) {
    const slot: TournamentSlot = {
      slotId: generateMatchId(1, matchNum),
      roundNumber: 1,
      matchNumber: matchNum,
      isBye: false,
      nextMatchId: calculateNextMatchId(1, matchNum, totalRounds),
    };

    // シード順序に基づいて参加者を配置
    const seed1Index = (matchNum - 1) * 2;
    const seed2Index = seed1Index + 1;

    const seed1 = seededOrder[seed1Index];
    const seed2 = seededOrder[seed2Index];

    // Player1の配置
    if (seed1 <= participantCount && participantMap.has(seed1)) {
      const p1 = participantMap.get(seed1)!;
      if (isDoubles && Array.isArray(p1)) {
        slot.player1 = p1[0];
        slot.player3 = p1[1];
        if (p1.length === 3) {
          slot.player5 = p1[2];
          console.log(`[3人ペア検出] Slot ${slot.slotId}: ${p1[0].name} / ${p1[1].name} / ${p1[2].name}`);
        }
      } else if (!Array.isArray(p1)) {
        slot.player1 = p1;
      }
    }

    // Player2の配置
    if (seed2 <= participantCount && participantMap.has(seed2)) {
      const p2 = participantMap.get(seed2)!;
      if (isDoubles && Array.isArray(p2)) {
        slot.player2 = p2[0];
        slot.player4 = p2[1];
        if (p2.length === 3) {
          slot.player6 = p2[2];
          console.log(`[3人ペア検出] Slot ${slot.slotId}: ${p2[0].name} / ${p2[1].name} / ${p2[2].name}`);
        }
      } else if (!Array.isArray(p2)) {
        slot.player2 = p2;
      }
    }

    // Byeの判定：両方の参加者が存在しない、または片方のみ存在する
    if ((!slot.player1 && !slot.player2) || (!slot.player1 || !slot.player2)) {
      slot.isBye = true;
    }

    slots.push(slot);
  }

  // 2回戦以降のスロットを生成（プレースホルダー）
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);

    for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
      const slot: TournamentSlot = {
        slotId: generateMatchId(round, matchNum),
        roundNumber: round,
        matchNumber: matchNum,
        isBye: false,
        nextMatchId: calculateNextMatchId(round, matchNum, totalRounds),
      };

      slots.push(slot);
    }
  }

  return {
    totalSlots: bracketSize,
    totalRounds,
    slots,
    participantCount,
  };
}

/**
 * ラウンド名を取得
 */
export function getRoundNameByNumber(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;

  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';

  return `${round}回戦`;
}

/**
 * 統一ラウンド名称取得関数
 * @param match - 試合オブジェクト（または最小限のプロパティ）
 * @param totalRounds - トーナメント全体のラウンド数（ノックアウト用）
 * @returns ラウンド名称（例: "決勝", "予選リーグ Group A", "団体戦 第3試合"）
 */
export function getUnifiedRoundName(
  match: { round: number; phase?: string; tournament_type?: string; group?: string; match_number?: number },
  totalRounds?: number
): string {
  // 予選リーグ
  if (match.phase === 'preliminary') {
    const groupPart = match.group ? ` Group ${match.group}` : '';
    const matchPart = match.match_number ? ` 第${match.match_number}試合` : '';
    return `予選リーグ${groupPart}${matchPart}`;
  }

  // 団体戦
  if (match.tournament_type === 'team_battle' && match.match_number) {
    return `団体戦 第${match.match_number}試合`;
  }

  // ノックアウト（決勝トーナメント）
  if (totalRounds !== undefined) {
    return getRoundNameByNumber(match.round, totalRounds);
  }

  // フォールバック
  return `第${match.round}ラウンド`;
}

/**
 * 種目名の取得
 */
export function getTournamentTypeName(type: string): string {
  const names: Record<string, string> = {
    'mens_singles': '男子シングルス',
    'womens_singles': '女子シングルス',
    'mens_doubles': '男子ダブルス',
    'womens_doubles': '女子ダブルス',
    'mixed_doubles': '混合ダブルス',
    'team_battle': '団体戦',
    'MD': '男子ダブルス',
    'WD': '女子ダブルス',
    'XD': '混合ダブルス',
    'MS': '男子シングルス',
    'WS': '女子シングルス',
  };
  return names[type] || type;
}

/**
 * スロットをラウンドごとにグループ化
 */
export function groupSlotsByRound(slots: TournamentSlot[]): Record<number, TournamentSlot[]> {
  const groups: Record<number, TournamentSlot[]> = {};

  slots.forEach(slot => {
    if (!groups[slot.roundNumber]) {
      groups[slot.roundNumber] = [];
    }
    groups[slot.roundNumber].push(slot);
  });

  return groups;
}
