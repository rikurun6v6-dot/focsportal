'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Flag, Tag } from 'lucide-react';
import { resetMatchResult, updateDocument, getAllDocuments } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { Match } from '@/types';
import { where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

/**
 * 安全機能タブ
 * - Undo: 試合結果の取り消し
 * - Walkover: 不戦勝の設定
 * - Subtitle: 試合カードへの補足情報追加
 */
export default function SafetyTab() {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Undo機能
  const [undoMatchId, setUndoMatchId] = useState('');
  const [undoLoading, setUndoLoading] = useState(false);

  // Walkover機能
  const [walkoverMatchId, setWalkoverMatchId] = useState('');
  const [walkoverWinner, setWalkoverWinner] = useState<'1' | '2'>('1');
  const [walkoverLoading, setWalkoverLoading] = useState(false);

  // Subtitle機能
  const [subtitleMatchId, setSubtitleMatchId] = useState('');
  const [subtitleText, setSubtitleText] = useState('');
  const [subtitleLoading, setSubtitleLoading] = useState(false);

  /**
   * Undo: 試合結果の取り消し
   */
  const handleUndo = async () => {
    if (!undoMatchId.trim()) {
      alert('試合IDを入力してください');
      return;
    }

    const confirmed = await confirm({
      title: '試合結果の取り消し',
      message: `試合 ${undoMatchId} の結果を取り消しますか？\n\n次の試合への進出も取り消されます。`,
      confirmText: '取り消す',
      cancelText: 'キャンセル',
      type: 'warning',
    });

    if (!confirmed) return;

    setUndoLoading(true);
    try {
      const success = await resetMatchResult(undoMatchId);
      if (success) {
        alert('試合結果を取り消しました');
        setUndoMatchId('');
      } else {
        alert('試合が見つかりませんでした');
      }
    } catch (error) {
      console.error('Undo error:', error);
      alert('エラーが発生しました');
    }
    setUndoLoading(false);
  };

  /**
   * Walkover: 不戦勝の設定
   */
  const handleWalkover = async () => {
    if (!walkoverMatchId.trim()) {
      alert('試合IDを入力してください');
      return;
    }

    const confirmed = await confirm({
      title: '不戦勝の設定',
      message: `試合 ${walkoverMatchId} でPlayer ${walkoverWinner}を不戦勝とします。\n\nこの操作は取り消せません。`,
      confirmText: '設定',
      cancelText: 'キャンセル',
      type: 'warning',
    });

    if (!confirmed) return;

    setWalkoverLoading(true);
    try {
      // 試合データを取得
      const matches = await getAllDocuments<Match>('matches', [
        where('id', '==', walkoverMatchId),
      ]);

      if (matches.length === 0) {
        alert('試合が見つかりませんでした');
        setWalkoverLoading(false);
        return;
      }

      const match = matches[0];
      const winnerId = walkoverWinner === '1' ? match.player1_id : match.player2_id;

      // 不戦勝として結果を設定（スコアは21-0）
      const matchRef = doc(db, 'matches', walkoverMatchId);
      await updateDoc(matchRef, {
        score_p1: walkoverWinner === '1' ? 21 : 0,
        score_p2: walkoverWinner === '2' ? 21 : 0,
        winner_id: winnerId,
        status: 'completed',
        end_time: Timestamp.now(),
        updated_at: Timestamp.now(),
        subtitle: '不戦勝', // Subtitleを自動設定
      });

      // 次の試合への進出処理（手動で実装）
      if (match.next_match_id) {
        const nextMatchRef = doc(db, 'matches', match.next_match_id);
        const isWinner1 = walkoverWinner === '1';
        const winnerMainId = isWinner1 ? match.player1_id : match.player2_id;
        const winnerPartnerId = isWinner1 ? match.player3_id : match.player4_id;

        let nextPosition = match.next_match_position;
        if (!nextPosition) {
          const matchNumber = match.match_number || 0;
          nextPosition = (matchNumber % 2 === 1) ? 1 : 2;
        }

        const nextMatchUpdate: Record<string, unknown> = {
          updated_at: Timestamp.now(),
        };

        if (nextPosition === 1) {
          nextMatchUpdate.player1_id = winnerMainId;
          if (winnerPartnerId) {
            nextMatchUpdate.player3_id = winnerPartnerId;
          }
        } else if (nextPosition === 2) {
          nextMatchUpdate.player2_id = winnerMainId;
          if (winnerPartnerId) {
            nextMatchUpdate.player4_id = winnerPartnerId;
          }
        }

        await updateDoc(nextMatchRef, nextMatchUpdate);
      }

      alert('不戦勝を設定しました');
      setWalkoverMatchId('');
    } catch (error) {
      console.error('Walkover error:', error);
      alert('エラーが発生しました');
    }
    setWalkoverLoading(false);
  };

  /**
   * Subtitle: 試合カードに補足情報を追加
   */
  const handleSubtitle = async () => {
    if (!subtitleMatchId.trim()) {
      alert('試合IDを入力してください');
      return;
    }

    if (!subtitleText.trim()) {
      alert('補足情報を入力してください');
      return;
    }

    const confirmed = await confirm({
      title: '補足情報の設定',
      message: `試合 ${subtitleMatchId} に「${subtitleText}」を表示します。`,
      confirmText: '設定',
      cancelText: 'キャンセル',
      type: 'info',
    });

    if (!confirmed) return;

    setSubtitleLoading(true);
    try {
      const matchRef = doc(db, 'matches', subtitleMatchId);
      await updateDoc(matchRef, {
        subtitle: subtitleText,
        updated_at: Timestamp.now(),
      });

      alert('補足情報を設定しました');
      setSubtitleMatchId('');
      setSubtitleText('');
    } catch (error) {
      console.error('Subtitle error:', error);
      alert('エラーが発生しました（試合が存在しない可能性があります）');
    }
    setSubtitleLoading(false);
  };

  return (
    <>
      <ConfirmDialog />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Undo機能 */}
        <Card className="border-2 border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-800">
              <RotateCcw className="w-4 h-4" />
              Undo（結果取り消し）
            </CardTitle>
            <CardDescription className="text-xs">
              確定済みの試合結果を取り消し、次戦への進出も取り消します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-slate-700">試合ID</label>
              <Input
                type="text"
                placeholder="例: camp123_MD_1_1_1"
                value={undoMatchId}
                onChange={(e) => setUndoMatchId(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                ※ トーナメント表で確認できます
              </p>
            </div>
            <Button
              onClick={handleUndo}
              disabled={undoLoading || !undoMatchId.trim()}
              className="w-full h-9 bg-blue-600 hover:bg-blue-700"
            >
              {undoLoading ? '処理中...' : '結果を取り消す'}
            </Button>
          </CardContent>
        </Card>

        {/* Walkover機能 */}
        <Card className="border-2 border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <Flag className="w-4 h-4" />
              Walkover（不戦勝）
            </CardTitle>
            <CardDescription className="text-xs">
              試合を行わずに一方を勝者として確定させます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-slate-700">試合ID</label>
              <Input
                type="text"
                placeholder="例: camp123_MD_1_1_1"
                value={walkoverMatchId}
                onChange={(e) => setWalkoverMatchId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-slate-700">勝者</label>
              <Select value={walkoverWinner} onValueChange={(v) => setWalkoverWinner(v as '1' | '2')}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Player 1 (上側)</SelectItem>
                  <SelectItem value="2">Player 2 (下側)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleWalkover}
              disabled={walkoverLoading || !walkoverMatchId.trim()}
              className="w-full h-9 bg-amber-600 hover:bg-amber-700"
            >
              {walkoverLoading ? '処理中...' : '不戦勝を設定'}
            </Button>
          </CardContent>
        </Card>

        {/* Subtitle機能 */}
        <Card className="border-2 border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-purple-800">
              <Tag className="w-4 h-4" />
              Subtitle（補足情報）
            </CardTitle>
            <CardDescription className="text-xs">
              試合カードに補足情報を表示します（例：「敗者復活戦」「1部」）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-slate-700">試合ID</label>
              <Input
                type="text"
                placeholder="例: camp123_MD_1_1_1"
                value={subtitleMatchId}
                onChange={(e) => setSubtitleMatchId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-slate-700">補足情報</label>
              <Input
                type="text"
                placeholder="例: 敗者復活戦、1部決勝"
                value={subtitleText}
                onChange={(e) => setSubtitleText(e.target.value)}
                className="h-8 text-sm"
                maxLength={20}
              />
              <p className="text-xs text-slate-500 mt-1">
                ※ 最大20文字
              </p>
            </div>
            <Button
              onClick={handleSubtitle}
              disabled={subtitleLoading || !subtitleMatchId.trim() || !subtitleText.trim()}
              className="w-full h-9 bg-purple-600 hover:bg-purple-700"
            >
              {subtitleLoading ? '処理中...' : '補足情報を設定'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
