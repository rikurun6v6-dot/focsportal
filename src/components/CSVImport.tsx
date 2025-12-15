"use client";

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { parsePlayersCSV, generateSampleCSV } from '@/lib/csv-parser';
import { importPlayers } from '@/lib/firestore-helpers';

interface CSVImportProps {
  onSuccess?: (count: number) => void;
  onError?: (errors: string[]) => void;
}

export default function CSVImport({ onSuccess, onError }: CSVImportProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage('');
    setErrors([]);

    try {
      // ファイルを読み込み
      const text = await file.text();
      
      // CSVを解析
      const { players, errors: parseErrors } = parsePlayersCSV(text);
      
      if (parseErrors.length > 0) {
        setErrors(parseErrors);
        setMessage(`✗ CSVの解析中に${parseErrors.length}件のエラーが発生しました`);
        onError?.(parseErrors);
        setUploading(false);
        return;
      }

      if (players.length === 0) {
        setMessage('✗ 有効なデータが見つかりませんでした');
        setUploading(false);
        return;
      }

      // Firestoreに登録
      setMessage(`${players.length}名のデータを登録中...`);
      const { success, errors: importErrors } = await importPlayers(players);

      if (importErrors.length > 0) {
        setErrors(importErrors);
        setMessage(`⚠ ${success}名を登録しました（${importErrors.length}件のエラー）`);
        onError?.(importErrors);
      } else {
        setMessage(`✓ ${success}名の参加者を登録しました`);
        onSuccess?.(success);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`✗ エラー: ${errorMessage}`);
      setErrors([errorMessage]);
      onError?.([errorMessage]);
    } finally {
      setUploading(false);
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadSample = () => {
    const csvContent = generateSampleCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sample_players.csv';
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          CSVファイルを選択してアップロード
        </p>
        <div className="flex gap-2 justify-center">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'アップロード中...' : 'ファイルを選択'}
          </Button>
          <Button
            onClick={handleDownloadSample}
            variant="outline"
            disabled={uploading}
          >
            サンプルCSVをダウンロード
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.startsWith('✓') 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-100'
            : message.startsWith('⚠')
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-100'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-100'
        }`}>
          <p className="font-semibold">{message}</p>
          {errors.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside max-h-40 overflow-y-auto">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500">
        <p className="font-semibold mb-1">CSV形式:</p>
        <p>必須カラム: name, gender, division</p>
        <p>性別: male/female, M/F, 男/女</p>
        <p>レベル: 1/2, 1部/2部</p>
      </div>
    </div>
  );
}
