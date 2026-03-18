import { Card, CardContent } from "@/components/ui/card";
import { Trophy, MapPin, Pencil } from "lucide-react";
import type { Match, Court } from "@/types";
import { useState, useEffect, useRef } from "react";
import { subscribeToCollection } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import { getUnifiedRoundName } from "@/lib/tournament-logic";

/**
 * トーナメント表描画コンポーネント（視認性重視・完成版）
 * - 回戦ごとのリセット採番（実戦のみカウント）
 * - 1回戦の Bye は完全に非表示（Render Nothing）
 * - 予選リーグ勝ち上がりの明示的表示
 * - シングルス・ダブルス自動対応
 * - ゆとりのあるカードデザイン（min-w-[260px], p-4, rounded-xl）
 * - バッジ形式の試合番号表示
 * - セパレーター付き次戦案内
 * - 青字のスコア表示
 * - **垂直配置アルゴリズム**: 親カード2つの中間点に配置（Round(n, Match l).y = (Parent1.y + Parent2.y) / 2）
 */
interface KnockoutTreeProps {
  rounds: number[];
  roundGroups: { [round: number]: Match[] };
  hasPreliminary: boolean;
  maxRound: number;
  getNextRoundInfo: (round: number) => string | null;
  getPlayerDisplay: (playerId: string | undefined, match: Match, position: 1 | 2) => string;
  getPlayerName: (playerId?: string) => string;
  editMode?: boolean;
  selectedSlot?: { matchId: string; position: 1 | 2 } | null;
  onSlotClick?: (matchId: string, position: 1 | 2) => void;
  onSlotEditClick?: (matchId: string, position: 1 | 2) => void;
  /** 完了済み試合タップ時のコールバック（結果編集用） */
  onMatchTap?: (match: Match) => void;
}

/**
 * カード配置座標を計算（親カードの中間点ベース）
 * - Round 1: 等間隔で配置
 * - Round 2以降: 前ラウンドの2つのカードの中間点に配置
 */
interface CardPosition {
  top: number;
  height: number;
}

function calculateCardPositions(
  rounds: number[],
  roundGroups: { [round: number]: Match[] }
): Map<string, CardPosition> {
  const CARD_HEIGHT = 240; // 1枚のカードの平均高さ（px）- 0.85倍に縮小
  const INITIAL_GAP = 48;  // 1回戦のカード間隔（px）- カード半分の高さ相当（120pxの約半分）
  const MIN_VERTICAL_GAP = 48; // 最小垂直間隔（カード半分の高さ相当）
  const HEADER_OFFSET = 120; // ラウンドヘッダー用のスペース（ヘッダー高さ + margin + 余裕）

  const positions = new Map<string, CardPosition>();

  rounds.forEach((round, roundIndex) => {
    const matches = roundGroups[round] || [];

    if (roundIndex === 0) {
      // Round 1: 等間隔で上から配置（ヘッダーのスペースを確保）
      matches.forEach((match, matchIndex) => {
        if (match && match.id) {
          positions.set(match.id, {
            top: matchIndex * (CARD_HEIGHT + INITIAL_GAP) + HEADER_OFFSET,
            height: CARD_HEIGHT,
          });
        }
      });
    } else {
      // Round 2以降: 前ラウンドの親カード2つの中間点に配置
      const prevRound = rounds[roundIndex - 1];
      const prevMatches = roundGroups[prevRound] || [];

      matches.forEach((match, matchIndex) => {
        if (match && match.id) {
          // 親カード2つのインデックス
          const parent1Index = matchIndex * 2;
          const parent2Index = matchIndex * 2 + 1;

          const parent1 = prevMatches[parent1Index];
          const parent2 = prevMatches[parent2Index];

          const parent1Pos = parent1 ? positions.get(parent1.id) : null;
          const parent2Pos = parent2 ? positions.get(parent2.id) : null;

          // 親カードの中間点を計算
          let top = 0;
          if (parent1Pos && parent2Pos) {
            // 両方の親が存在する場合: 中間点 = (Parent1.y + Parent2.y) / 2
            const parent1Center = parent1Pos.top + parent1Pos.height / 2;
            const parent2Center = parent2Pos.top + parent2Pos.height / 2;
            const centerY = (parent1Center + parent2Center) / 2;
            top = centerY - CARD_HEIGHT / 2;

            // 最小間隔の確保：前のカードとの距離をチェック
            if (matchIndex > 0) {
              const prevMatch = matches[matchIndex - 1];
              if (prevMatch && prevMatch.id) {
                const prevPos = positions.get(prevMatch.id);
                if (prevPos) {
                  const prevBottom = prevPos.top + prevPos.height;
                  const minTop = prevBottom + MIN_VERTICAL_GAP;
                  if (top < minTop) {
                    top = minTop; // 最小間隔を確保するために下にずらす
                  }
                }
              }
            }
          } else if (parent1Pos) {
            // 親1のみ存在
            top = parent1Pos.top;
          } else if (parent2Pos) {
            // 親2のみ存在
            top = parent2Pos.top;
          } else {
            // 親がいない場合のフォールバック
            top = matchIndex * (CARD_HEIGHT + INITIAL_GAP * 2);
          }

          positions.set(match.id, {
            top,
            height: CARD_HEIGHT,
          });
        }
      });
    }
  });

  return positions;
}

/**
 * SVG接続線を描画するためのパスデータを生成
 * - 前ラウンドの2つのカードから次ラウンドのカードへの接続線
 */
interface ConnectionLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  matchId: string;
}

function calculateConnectionLines(
  rounds: number[],
  roundGroups: { [round: number]: Match[] },
  cardPositions: Map<string, CardPosition>
): ConnectionLine[] {
  const CARD_WIDTH = 220; // 0.85倍に縮小（260 * 0.85 ≈ 220）
  const ROUND_GAP = 64; // gap-x-16 = 4rem = 64px
  const CARD_HEIGHT = 240; // 0.85倍に縮小（280 * 0.85 ≈ 240）

  const lines: ConnectionLine[] = [];

  rounds.forEach((round, roundIndex) => {
    if (roundIndex === 0) return; // 1回戦は接続線なし

    const currentMatches = roundGroups[round] || [];
    const prevRound = rounds[roundIndex - 1];
    const prevMatches = roundGroups[prevRound] || [];

    currentMatches.forEach((match, matchIndex) => {
      if (!match || !match.id) return;

      const currentPos = cardPositions.get(match.id);
      if (!currentPos) return;

      const parent1Index = matchIndex * 2;
      const parent2Index = matchIndex * 2 + 1;

      const parent1 = prevMatches[parent1Index];
      const parent2 = prevMatches[parent2Index];

      if (parent1 && parent1.id) {
        const parent1Pos = cardPositions.get(parent1.id);
        if (parent1Pos) {
          // 親1からの接続線
          lines.push({
            x1: CARD_WIDTH, // 親カードの右端
            y1: parent1Pos.top + parent1Pos.height / 2, // 親カードの中心
            x2: 0, // 現在のカードの左端
            y2: currentPos.top + currentPos.height / 2, // 現在のカードの中心
            matchId: `${parent1.id}-${match.id}`,
          });
        }
      }

      if (parent2 && parent2.id) {
        const parent2Pos = cardPositions.get(parent2.id);
        if (parent2Pos) {
          // 親2からの接続線
          lines.push({
            x1: CARD_WIDTH,
            y1: parent2Pos.top + parent2Pos.height / 2,
            x2: 0,
            y2: currentPos.top + currentPos.height / 2,
            matchId: `${parent2.id}-${match.id}`,
          });
        }
      }
    });
  });

  return lines;
}

/**
 * 試合がシード（Bye）かどうかを判定
 * 【重要】Round 1（1回戦）のみ、片方が空のスロットをシード（不戦勝）として扱う
 * Round 2 以降は、全てのスロットを実戦として扱う
 */
function isMatchBye(match: Match, round: number): boolean {
  // Round 1 のみ Bye 判定を行う
  if (round === 1) {
    const hasP1 = !!match.player1_id;
    const hasP2 = !!match.player2_id;
    // 両方の選手が揃っている場合は実戦（is_walkoverが設定されていても）
    if (hasP1 && hasP2) return false;
    // is_walkover=true（生成時にマークされたBYE枠）または片方のみ存在（XOR）= シード
    return !!(match.is_walkover) || (hasP1 !== hasP2);
  }
  // Round 2 以降は常に実戦として扱う
  return false;
}

/**
 * ラウンド内の試合番号を計算
 * Round 1: 実戦のみカウント（Bye を除外）
 * Round 2 以降: 全ての試合をカウント（1から始まる連番）
 */
function calculateRoundMatchNumber(
  matches: Match[],
  currentMatch: Match,
  round: number
): number | null {
  if (round === 1) {
    // Round 1 は実戦のみカウント
    const validMatches = matches.filter(m => m && !isMatchBye(m, round));
    const index = validMatches.findIndex(m => m.id === currentMatch.id);
    return index >= 0 ? index + 1 : null;
  } else {
    // Round 2 以降は全ての試合をカウント
    const index = matches.findIndex(m => m && m.id === currentMatch.id);
    return index >= 0 ? index + 1 : null;
  }
}

/**
 * 次戦のラウンド内試合番号を計算
 */
function calculateNextRoundMatchNumber(
  currentRound: number,
  currentMatchIndex: number,
  rounds: number[],
  roundGroups: { [round: number]: Match[] },
  totalRounds: number
): { nextRound: number; nextMatchNumber: number | null; nextRoundName: string } | null {
  if (currentRound >= totalRounds) return null;

  const nextRound = currentRound + 1;
  const nextRoundMatches = roundGroups[nextRound] || [];
  const nextMatchIndexInRound = Math.floor(currentMatchIndex / 2);

  // 次のラウンドの対象試合を取得
  const nextMatch = nextRoundMatches[nextMatchIndexInRound];
  if (!nextMatch) return null;

  // 次のラウンド内での試合番号を計算（ラウンド番号も渡す）
  const nextMatchNumber = calculateRoundMatchNumber(nextRoundMatches, nextMatch, nextRound);

  return {
    nextRound,
    nextMatchNumber,
    nextRoundName: '' // 後で設定
  };
}

export default function KnockoutTree({
  rounds,
  roundGroups,
  hasPreliminary,
  maxRound,
  getNextRoundInfo,
  getPlayerDisplay,
  getPlayerName,
  editMode = false,
  selectedSlot = null,
  onSlotClick,
  onSlotEditClick,
  onMatchTap,
}: KnockoutTreeProps) {
  const { camp } = useCamp();
  const totalRounds = rounds.length;
  const [updatedMatchIds, setUpdatedMatchIds] = useState<Set<string>>(new Set());
  const prevMatchesRef = useRef<{ [id: string]: Match }>({});
  const [courts, setCourts] = useState<Court[]>([]);

  // コート情報を購読
  useEffect(() => {
    if (!camp) return;

    const unsubscribe = subscribeToCollection<Court>(
      'courts',
      (courtsList) => {
        setCourts(courtsList);
      }
    );

    return () => unsubscribe();
  }, [camp]);

  // コート番号を取得する関数
  const getCourtNumber = (courtId: string | null): number | null => {
    if (!courtId) return null;
    const court = courts.find(c => c.id === courtId);
    return court ? court.number : null;
  };

  // 試合データの変更を検知して点滅エフェクトを適用
  useEffect(() => {
    const newUpdatedIds = new Set<string>();

    rounds.forEach(round => {
      const matches = roundGroups[round] || [];
      matches.forEach(match => {
        if (!match || !match.id) return;

        const prevMatch = prevMatchesRef.current[match.id];
        if (prevMatch) {
          // スコアまたはステータスが変更された場合
          if (
            prevMatch.score_p1 !== match.score_p1 ||
            prevMatch.score_p2 !== match.score_p2 ||
            prevMatch.status !== match.status
          ) {
            newUpdatedIds.add(match.id);
          }
        }

        // 現在の状態を保存
        prevMatchesRef.current[match.id] = { ...match };
      });
    });

    if (newUpdatedIds.size > 0) {
      setUpdatedMatchIds(prev => new Set([...prev, ...newUpdatedIds]));

      // 3秒後に点滅を解除
      const timer = setTimeout(() => {
        setUpdatedMatchIds(prev => {
          const next = new Set(prev);
          newUpdatedIds.forEach(id => next.delete(id));
          return next;
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [rounds, roundGroups]);

  // カード配置座標を事前計算
  const cardPositions = calculateCardPositions(rounds, roundGroups);

  // 各ラウンドの高さを計算（最も下のカードの bottom 位置）
  const getRoundHeight = (round: number): number => {
    const matches = roundGroups[round] || [];
    let maxBottom = 0;
    matches.forEach(match => {
      if (match && match.id) {
        const pos = cardPositions.get(match.id);
        if (pos) {
          const bottom = pos.top + pos.height;
          if (bottom > maxBottom) maxBottom = bottom;
        }
      }
    });
    return maxBottom + 40; // 下部マージン追加
  };

  const containerHeight = Math.max(...rounds.map(getRoundHeight));

  return (
    <div className="bg-slate-50 min-h-screen p-6">
      {hasPreliminary && (
        <h2 className="text-xl font-bold text-amber-700 mb-6 flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          決勝トーナメント
        </h2>
      )}
      <div className="overflow-x-auto pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-x-16 min-w-max" style={{ position: 'relative' }}>
          {rounds.map((round, roundIndex) => {
            const roundMatches = roundGroups[round] || [];

            return (
              <div key={round} className="min-w-[220px] flex-shrink-0" style={{ position: 'relative', height: `${containerHeight}px`, zIndex: 1 }}>
                {/* ラウンドヘッダー */}
                <div className="text-center mb-16" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
                  <h3 className="inline-block font-bold text-slate-900 text-sm bg-white rounded-lg py-2 px-5 shadow-md border-2 border-slate-200">
                    {getUnifiedRoundName({ round, phase: 'knockout' }, maxRound)}
                  </h3>
                </div>

                {/* 試合カード群（絶対座標配置） */}
                <div style={{ position: 'relative' }}>
                  {roundMatches.map((match, matchIndex) => {
                    // ドキュメント不在時のガード
                    if (!match || !match.id) {
                      return (
                        <div key={`placeholder-${round}-${matchIndex}`} style={{ position: 'absolute', top: `${matchIndex * 288}px`, width: '100%' }}>
                          <Card className="rounded-lg border-2 shadow-md bg-white border-slate-200">
                            <CardContent className="p-3">
                              <p className="text-xs text-slate-500 text-center font-medium">読み込み中...</p>
                            </CardContent>
                          </Card>
                        </div>
                      );
                    }

                    const isDoubles = !!match.player3_id;
                    const isLastRound = roundIndex === rounds.length - 1;
                    const isBye = isMatchBye(match, round);

                    // ラウンド内試合番号を計算（ラウンド番号も渡す）
                    const roundMatchNumber = calculateRoundMatchNumber(roundMatches, match, round);

                    // 次戦情報を計算
                    const nextMatchInfo = calculateNextRoundMatchNumber(
                      round,
                      matchIndex,
                      rounds,
                      roundGroups,
                      totalRounds
                    );
                    if (nextMatchInfo) {
                      nextMatchInfo.nextRoundName = getUnifiedRoundName({ round: nextMatchInfo.nextRound, phase: 'knockout' }, maxRound);
                    }

                    const isUpdated = updatedMatchIds.has(match.id);

                    // このカードの配置座標を取得
                    const position = cardPositions.get(match.id);
                    const cardTop = position ? position.top : matchIndex * 340;

                    return (
                      <div key={match.id} style={{ position: 'absolute', top: `${cardTop}px`, width: '100%', minWidth: '220px', flexShrink: 0 }}>
                      <Card
                        key={match.id}
                        onClick={() => !editMode && !isBye && match.status === 'completed' && onMatchTap?.(match)}
                        className={`rounded-lg shadow-md transition-all ${
                          isBye
                            ? 'bg-slate-100/50 border-2 border-dashed border-slate-300'
                            : match.status === 'completed'
                            ? `bg-white border-2 border-emerald-500${!editMode && onMatchTap ? ' cursor-pointer hover:border-emerald-400 hover:shadow-lg' : ''}`
                            : match.status === 'playing'
                            ? 'bg-white border-2 border-blue-500 ring-2 ring-blue-200'
                            : 'bg-white border-2 border-slate-200'
                        } ${isUpdated ? 'animate-pulse' : ''}`}
                      >
                        <CardContent className="p-3">
                          {/* 上部: バッジ形式の試合番号 */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isBye && round === 1 ? (
                                // Round 1 のシード（不戦勝）のみ「シード」表示
                                <span className="inline-block bg-slate-200 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">
                                  シード
                                </span>
                              ) : roundMatchNumber ? (
                                // Round 2 以降、または Round 1 の実戦は必ず「第○試合」を表示
                                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                  第 {roundMatchNumber} 試合
                                </span>
                              ) : (
                                <span className="inline-block bg-slate-100 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">
                                  試合待ち
                                </span>
                              )}
                              {/* Subtitle（補足情報）の表示 - 最大3行で折り返し */}
                              {match.subtitle && (
                                <span className="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full max-w-[120px] truncate" title={match.subtitle}>
                                  {match.subtitle}
                                </span>
                              )}
                              {/* コート番号表示（進行中または完了時） */}
                              {(match.status === 'playing' || match.status === 'completed') && !isBye && getCourtNumber(match.court_id) && (
                                <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                                  <MapPin className="w-3 h-3" />
                                  {getCourtNumber(match.court_id)}コート
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {match.status === 'playing' && !isBye && (
                                <span className="inline-block bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                  進行中
                                </span>
                              )}
                              {match.status === 'calling' && !isBye && (
                                <span className="inline-block bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                                  呼出中
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 中央: 選手情報 */}
                          <div className="space-y-2">
                            {/* Player 1 */}
                            {(() => {
                              const isSelected = editMode && selectedSlot?.matchId === match.id && selectedSlot?.position === 1;
                              return (
                                <div
                                  onClick={() => editMode && !isBye && onSlotClick?.(match.id, 1)}
                                  className={`flex items-center justify-between p-2 rounded-md transition-all ${
                                    isSelected
                                      ? 'bg-blue-100 border-2 border-blue-500 ring-2 ring-blue-300'
                                      : match.winner_id && (match.winner_id === match.player1_id || match.winner_id === match.player3_id)
                                      ? 'bg-amber-50 border-2 border-amber-400'
                                      : isBye
                                      ? 'bg-slate-50/50'
                                      : editMode && !isBye
                                      ? 'bg-slate-50 border-2 border-dashed border-blue-300 cursor-pointer hover:bg-blue-50'
                                      : 'bg-slate-50'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className={`font-bold text-sm leading-tight break-words ${
                                      isBye ? 'text-slate-400 italic' :
                                      match.player1_id ? 'text-slate-900' : 'text-slate-400'
                                    }`}>
                                      {getPlayerDisplay(match.player1_id, match, 1)}
                                    </div>
                                    {match.seed_p1 && !isBye && (
                                      <span className="inline-block mt-0.5 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                                        第{match.seed_p1}シード
                                      </span>
                                    )}
                                  </div>
                                  {match.status === 'completed' && match.score_p1 !== undefined && !isBye && (
                                    <span className="ml-2 font-bold text-xl text-blue-600 tabular-nums flex-shrink-0">
                                      {match.score_p1}
                                    </span>
                                  )}
                                  {editMode && !isBye && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onSlotEditClick?.(match.id, 1); }}
                                      className="ml-1 flex-shrink-0 p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600"
                                      title="メンバー変更"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* VS */}
                            <div className="text-center">
                              <span className={`text-xs font-bold ${isBye ? 'text-slate-300' : 'text-slate-400'}`}>
                                {editMode && !isBye ? '↕' : 'VS'}
                              </span>
                            </div>

                            {/* Player 2 */}
                            {(() => {
                              const isSelected = editMode && selectedSlot?.matchId === match.id && selectedSlot?.position === 2;
                              return (
                                <div
                                  onClick={() => editMode && !isBye && onSlotClick?.(match.id, 2)}
                                  className={`flex items-center justify-between p-2 rounded-md transition-all ${
                                    isSelected
                                      ? 'bg-blue-100 border-2 border-blue-500 ring-2 ring-blue-300'
                                      : match.winner_id && (match.winner_id === match.player2_id || match.winner_id === match.player4_id)
                                      ? 'bg-amber-50 border-2 border-amber-400'
                                      : isBye
                                      ? 'bg-slate-50/50'
                                      : editMode && !isBye
                                      ? 'bg-slate-50 border-2 border-dashed border-blue-300 cursor-pointer hover:bg-blue-50'
                                      : 'bg-slate-50'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className={`font-bold text-sm leading-tight break-words ${
                                      isBye ? 'text-slate-400 italic' :
                                      match.player2_id ? 'text-slate-900' : 'text-slate-400'
                                    }`}>
                                      {getPlayerDisplay(match.player2_id, match, 2)}
                                    </div>
                                    {match.seed_p2 && !isBye && (
                                      <span className="inline-block mt-0.5 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                                        第{match.seed_p2}シード
                                      </span>
                                    )}
                                  </div>
                                  {match.status === 'completed' && match.score_p2 !== undefined && !isBye && (
                                    <span className="ml-2 font-bold text-xl text-blue-600 tabular-nums flex-shrink-0">
                                      {match.score_p2}
                                    </span>
                                  )}
                                  {editMode && !isBye && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onSlotEditClick?.(match.id, 2); }}
                                      className="ml-1 flex-shrink-0 p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600"
                                      title="メンバー変更"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* 下部: セパレーター + 次戦案内 */}
                          {!isBye && (
                            <div className="mt-3">
                              {/* セパレーター */}
                              <div className="border-t border-slate-200 my-2"></div>

                              {/* 次戦案内 */}
                              <div className="flex items-center justify-center gap-1.5 text-xs">
                                {isLastRound ? (
                                  <>
                                    <Trophy className="w-3.5 h-3.5 text-amber-600" />
                                    <span className="font-bold text-amber-600">
                                      勝者 → 優勝 🎉
                                    </span>
                                  </>
                                ) : nextMatchInfo && nextMatchInfo.nextMatchNumber ? (
                                  <span className="font-bold text-blue-600">
                                    勝者 → {nextMatchInfo.nextRoundName} 第{nextMatchInfo.nextMatchNumber}試合へ
                                  </span>
                                ) : nextMatchInfo ? (
                                  <span className="font-bold text-blue-600">
                                    勝者 → {nextMatchInfo.nextRoundName}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-xs">次戦情報なし</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* シード枠の次戦案内（合流先を表示） */}
                          {isBye && nextMatchInfo && (
                            <div className="mt-2">
                              <div className="border-t border-dashed border-slate-300 my-1.5"></div>
                              <div className="flex items-center justify-center text-xs">
                                <span className="font-medium text-slate-500">
                                  {nextMatchInfo.nextMatchNumber
                                    ? `${nextMatchInfo.nextRoundName} 第${nextMatchInfo.nextMatchNumber}試合へ`
                                    : `${nextMatchInfo.nextRoundName}へ`
                                  }
                                </span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
