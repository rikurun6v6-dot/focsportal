'use client';

import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, Check } from 'lucide-react';

export default function QRCodeDisplay() {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // クライアントサイドでURLを取得
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      const userPageUrl = `${baseUrl}/user`;
      setUrl(userPageUrl);
    }
  }, []);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!url) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm md:text-base">
            <QrCode className="w-5 h-5 text-blue-500" />
            参加者用QRコード
          </CardTitle>
          <CardDescription>読み込み中...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm md:text-base">
          <QrCode className="w-5 h-5 text-blue-500" />
          参加者用QRコード
        </CardTitle>
        <CardDescription>
          このQRコードを会場に掲示して、参加者がスマホで試合状況を確認できるようにします
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-white p-6 rounded-lg flex justify-center">
          <QRCode value={url} size={200} />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-600 font-medium">URL:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              readOnly
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded bg-slate-50"
            />
            <Button onClick={handleCopy} variant="outline" size="sm">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-xs text-blue-800">
            💡 ヒント: QRコードを印刷して会場入口に掲示すると、参加者が自分のスマホで試合状況を確認できます
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
