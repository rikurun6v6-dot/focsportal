'use client';

import { useState } from 'react';
import ConfirmDialog, { ConfirmDialogType } from '@/components/common/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmDialogType;
}

/**
 * カスタム確認ダイアログを使用するためのフック
 * window.confirm の代替
 */
export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    message: '',
  });
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);

    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  };

  const handleConfirm = () => {
    if (resolver) {
      resolver(true);
      setResolver(null);
    }
    setIsOpen(false);
  };

  const handleClose = () => {
    if (resolver) {
      resolver(false);
      setResolver(null);
    }
    setIsOpen(false);
  };

  const ConfirmDialogComponent = () => (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={options.title}
      message={options.message}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      type={options.type}
    />
  );

  return { confirm, ConfirmDialog: ConfirmDialogComponent };
}
