'use client';

import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ConfirmDialogType = 'info' | 'warning' | 'danger' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmDialogType;
}

/**
 * カスタム確認ダイアログ
 * ブラウザ標準の window.confirm を置き換えるモーダル
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '確認',
  cancelText = 'キャンセル',
  type = 'info',
}: ConfirmDialogProps) {
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

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="w-6 h-6 text-amber-500" />;
      case 'danger':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-emerald-500" />;
      default:
        return <Info className="w-6 h-6 text-blue-500" />;
    }
  };

  const getConfirmButtonStyle = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* 背景オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* ダイアログ本体 */}
      <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
        {/* ヘッダー */}
        <div className="flex items-start gap-3 p-6 pb-4 border-b border-slate-200">
          {getIcon()}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* メッセージ本文 */}
        <div className="p-6 py-5">
          <p className="text-slate-700 leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>

        {/* フッター（ボタン） */}
        <div className="flex items-center gap-3 p-6 pt-4 border-t border-slate-200">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
          >
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 ${getConfirmButtonStyle()}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
