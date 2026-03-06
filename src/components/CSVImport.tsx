"use client";

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { parsePlayersCSV, generateSampleCSV } from '@/lib/csv-parser';
import { importPlayers } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';

interface CSVImportProps {
  onSuccess?: (count: number) => void;
  onError?: (errors: string[]) => void;
  readOnly?: boolean;
}

// ── 文字コード自動判別: UTF-8 → Shift-JIS フォールバック ──────────────────────
async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  // まず UTF-8 (strict) で試みる
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // UTF-8 として無効 → Shift-JIS で再試行
    try {
      return new TextDecoder('shift-jis').decode(buffer);
    } catch {
      // 最後の手段: UTF-8 (非 strict)
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

export default function CSVImport({ onSuccess, onError, readOnly = false }: CSVImportProps) {
  const { camp } = useCamp();
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
      // ── 文字コード自動判別で読み込み ──
      const text = await readFileAsText(file);

      // ── CSV 解析 ──
      const { players, errors: parseErrors } = parsePlayersCSV(text);

      if (parseErrors.length > 0 && players.length === 0) {
        // 全件失敗（ヘッダー不正など）
        setErrors(parseErrors);
        setMessage(`✗ CSVの解析に失敗しました`);
        onError?.(parseErrors);
        setUploading(false);
        return;
      }

      if (parseErrors.length > 0) {
        // 一部失敗
        setErrors(parseErrors);
        // 続行して登録（以下で処理）
      }

      if (players.length === 0) {
        setMessage('✗ 有効なデータが見つかりませんでした');
        setUploading(false);
        return;
      }

      if (!camp) {
        setMessage('✗ 合宿が選択されていません');
        setUploading(false);
        return;
      }

      // campId 付与
      const playersWithCamp = players.map((p) => ({ ...p, campId: camp.id }));

      // ── Firestore 一括登録 ──
      setMessage(`${players.length}名のデータを登録中...`);
      const { success, errors: importErrors } = await importPlayers(playersWithCamp);

      const allErrors = [...parseErrors, ...importErrors];

      if (importErrors.length > 0) {
        setErrors((prev) => [...prev, ...importErrors]);
        setMessage(`⚠ ${success}名を登録しました（${allErrors.length}件のエラー）`);
        onError?.(allErrors);
      } else if (parseErrors.length > 0) {
        setMessage(`⚠ ${success}名を登録しました（解析スキップ: ${parseErrors.length}件）`);
        onError?.(parseErrors);
      } else {
        setMessage(`✓ ${success}名の参加者を登録しました`);
        onSuccess?.(success);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`✗ エラー: ${msg}`);
      setErrors([msg]);
      onError?.([msg]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadSample = () => {
    // サンプルCSVはUTF-8 BOM付きで出力（Excelでの文字化け防止）
    const bom = '\uFEFF';
    const csvContent = bom + generateSampleCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sample_players.csv';
    link.click();
  };

  const statusColor = message.startsWith('✓')
    ? 'bg-green-50 border-green-200 text-green-800'
    : message.startsWith('⚠')
    ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
    : 'bg-red-50 border-red-200 text-red-800';

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <p className="text-gray-600 mb-4">CSVファイルを選択してアップロード</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || readOnly}>
            {uploading ? 'アップロード中...' : 'ファイルを選択'}
          </Button>
          <Button onClick={handleDownloadSample} variant="outline" disabled={uploading || readOnly}>
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
        <div className={`p-4 rounded-lg border ${statusColor}`}>
          <p className="font-semibold whitespace-pre-line">{message}</p>
          {errors.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside max-h-48 overflow-y-auto space-y-0.5">
              {errors.map((e, i) => (
                <li key={i} className="whitespace-pre-line">{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-0.5">
        <p className="font-semibold mb-1">CSV形式（文字コード: UTF-8 または Shift-JIS 自動判別）</p>
        <p>必須列: <code>name</code>, <code>gender</code>, <code>division</code>（日本語ヘッダーも可: 氏名/性別/部門）</p>
        <p>性別: male/female, M/F, 男/女</p>
        <p>部門: 1/2 または 1部/2部</p>
        <p>任意列: <code>team_id</code>（チーム名）, <code>third_member</code>（3人目の氏名）</p>
      </div>
    </div>
  );
}
