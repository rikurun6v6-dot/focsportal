/**
 * モダンなトースト通知システム
 * sonner をベースにカスタマイズした高コントラストなデザイン
 */

import { toast as sonnerToast } from 'sonner';

/**
 * 成功通知（✅ グリーン）
 */
export function toastSuccess(message: string, description?: string) {
  return sonnerToast.success(message, {
    description,
    duration: 4000,
    className: 'toast-success',
  });
}

/**
 * エラー通知（⚠️ レッド）
 */
export function toastError(message: string, description?: string) {
  return sonnerToast.error(message, {
    description,
    duration: 5000,
    className: 'toast-error',
  });
}

/**
 * 情報通知（🏸 ブルー）
 */
export function toastInfo(message: string, description?: string) {
  return sonnerToast.info(message, {
    description,
    duration: 4000,
    className: 'toast-info',
  });
}

/**
 * 進行中通知（🔄 パープル）
 */
export function toastLoading(message: string, description?: string) {
  return sonnerToast.loading(message, {
    description,
    className: 'toast-loading',
  });
}

/**
 * カスタムアイコン付き通知
 */
export function toastCustom(message: string, icon: string, description?: string) {
  return sonnerToast(message, {
    description,
    icon,
    duration: 4000,
    className: 'toast-custom',
  });
}

/**
 * 試合更新通知（🎉 大きめ表示）
 */
export function toastMatchUpdate(matchNumber: number, description?: string) {
  return sonnerToast.success(`🎉 第${matchNumber}試合のスコアを更新しました`, {
    description,
    duration: 5000,
    className: 'toast-match-update',
  });
}

/**
 * 試合開始通知（🏸 エメラルドグリーン）
 */
export function toastMatchStart(
  roundName: string,
  matchNumber: number | undefined,
  players: string,
  description?: string
) {
  const title = matchNumber
    ? `🏸 試合開始 - ${roundName} 第${matchNumber}試合`
    : `🏸 試合開始 - ${roundName}`;

  return sonnerToast.info(title, {
    description: description || players,
    duration: 6000,
    className: 'toast-match-start',
  });
}
