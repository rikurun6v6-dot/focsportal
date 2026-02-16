'use client';

import { useEffect, useState } from 'react';
import { X, BookOpen, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UserGuideProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean; // 管理者画面かどうか
}

/**
 * ユーザーガイドモーダル
 * - 初回アクセス時に自動表示
 * - localStorage で表示済みフラグを管理
 * - 左下のヘルプボタンからいつでも再表示可能
 */
export default function UserGuide({ isOpen, onClose, isAdmin = false }: UserGuideProps) {
  // ESC キーで閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      // body のスクロールを無効化
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* 背景オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* ダイアログ本体 */}
      <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full animate-in zoom-in-95 duration-200">
        {/* ヘッダー */}
        <div className="flex items-start gap-3 p-6 pb-4 border-b border-slate-200">
          <BookOpen className="w-6 h-6 text-sky-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">
              📖 使い方ガイド
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {isAdmin ? 'Foc\'s Portal 大会運営システムの基本的な使い方' : 'Foc\'s Portal 参加者画面の使い方'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ（スクロール可能） */}
        <div className="p-6 py-5 max-h-[60vh] overflow-y-auto">
          <div className="space-y-6">
            {isAdmin ? (
              // 管理者画面用のガイド
              <>
            {/* ステップ1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">初期設定タブ</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>「コートを初期化」で6面のコートを作成</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>種目・部門・トーナメント形式を設定</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>「トーナメント作成」で試合を自動生成</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">選手タブ</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>CSVインポートで一括登録が可能</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>手動登録で1名ずつ追加も可能</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>選手の有効化/無効化で出場管理</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">ペア・シードタブ</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>ダブルスのペアを組み合わせ</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>シード選手を設定して配置調整</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>トーナメント表に自動反映</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">操作タブ</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>「Auto-Dispatch」をONで自動割当開始</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>種目ごとの進行制御でペース調整</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>順次進行モードで種目を順番に消化</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ5 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                5
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">コート結果タブ</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>コートごとに試合結果を入力</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>スコアまたは不戦勝（WO）を記録</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>結果一覧タブで編集・取消も可能</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ6 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                6
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">トーナメント表タブ</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>リアルタイムで試合結果を確認</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>進行中の試合がハイライト表示</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>参加者ビューで選手に画面共有可能</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Tips */}
            <div className="mt-6 p-4 bg-sky-50 rounded-xl border border-sky-200">
              <h3 className="font-bold text-sky-900 mb-2 flex items-center gap-2">
                <span>💡</span>
                <span>便利な機能</span>
              </h3>
              <ul className="space-y-1.5 text-sm text-sky-800">
                <li>• 右下のステータスバーでシステム稼働状況を確認</li>
                <li>• オフライン時もローカルキャッシュで動作継続</li>
                <li>• 安全タブから誤操作の復旧やリセットが可能</li>
                <li>• 左下の「?」ボタンでいつでもガイドを再表示</li>
              </ul>
            </div>
            </>
            ) : (
              // ユーザー（参加者）画面用のガイド
              <>
            {/* ステップ1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">自分の試合を確認</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>「マイ試合」タブで自分の全試合を確認できます</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>次の試合が赤枠でハイライト表示されます</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>試合のステータス（待機中/進行中/完了）を確認</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">コート状況を見る</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>「コート状況」タブで各コートの試合を確認</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>空きコートや進行中の試合をリアルタイムで表示</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>自分の試合が始まるコートを確認できます</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">トーナメント表で全体を見る</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>「トーナメント表」タブで大会全体の進行状況を確認</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>自分の試合がハイライト表示されます</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>勝ち進んだ場合の次の対戦相手を確認できます</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ステップ4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">次の試合の準備</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>試合が「呼び出し中」になったらコートに向かいましょう</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>対戦相手の名前を確認してください</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>試合開始前に十分な準備運動をしましょう</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Tips */}
            <div className="mt-6 p-4 bg-sky-50 rounded-xl border border-sky-200">
              <h3 className="font-bold text-sky-900 mb-2 flex items-center gap-2">
                <span>💡</span>
                <span>便利な機能</span>
              </h3>
              <ul className="space-y-1.5 text-sm text-sky-800">
                <li>• 画面は自動的に更新されるので、リロード不要です</li>
                <li>• 次の試合まで時間がある場合は、余裕を持って準備できます</li>
                <li>• メッセージ機能が有効な場合、運営からの連絡を受け取れます</li>
                <li>• 左下の「?」ボタンでいつでもガイドを再表示できます</li>
              </ul>
            </div>
            </>
            )}
          </div>
        </div>

        {/* フッター（ボタン） */}
        <div className="flex items-center gap-3 p-6 pt-4 border-t border-slate-200">
          <Button
            onClick={onClose}
            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white"
          >
            了解しました
          </Button>
        </div>
      </div>
    </div>
  );
}
