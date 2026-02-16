"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeBottlenecks, calculateCourtUtilization, applySuggestion, type BottleneckAnalysis, type CourtUtilization } from "@/lib/analyzer";
import { Brain, Sparkles, TrendingUp, AlertTriangle, Info, ChevronRight } from "lucide-react";
import { useCamp } from "@/context/CampContext";
import { toastSuccess, toastError } from "@/lib/toast";

export default function OperationalAdvisor() {
  const { camp } = useCamp();
  const [bottleneckData, setBottleneckData] = useState<BottleneckAnalysis | null>(null);
  const [utilizationData, setUtilizationData] = useState<CourtUtilization | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!camp) return;

    const checkStatus = async () => {
      const bottleneckResult = await analyzeBottlenecks(camp.id);
      setBottleneckData(bottleneckResult);

      const utilization = await calculateCourtUtilization(camp.id);
      setUtilizationData(utilization);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [camp]);

  if (!camp || !utilizationData) return null;

  const hasBottleneck = bottleneckData?.hasBottleneck || false;
  const utilizationRate = utilizationData.utilizationRate;

  // 状態判定
  const getStatus = () => {
    if (hasBottleneck) return { type: 'warning', label: '渋滞検知', color: 'bg-amber-500' };
    if (utilizationRate < 50) return { type: 'info', label: '稼働率低下', color: 'bg-blue-500' };
    if (utilizationRate > 70) return { type: 'success', label: '良好', color: 'bg-emerald-500' };
    return { type: 'normal', label: '通常運転', color: 'bg-slate-400' };
  };

  const status = getStatus();

  const handleApplySuggestion = async () => {
    if (!bottleneckData?.bottleneckCategory) return;

    const success = await applySuggestion(bottleneckData.bottleneckCategory);
    if (success) {
      const categoryLabel = getCategoryLabel(bottleneckData.bottleneckCategory);
      toastSuccess(`提案を適用しました。${categoryLabel}を優先的に割り当てます（30分間有効）`);
      setIsOpen(false);
    } else {
      toastError('提案の適用に失敗しました');
    }
  };

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50 h-9 px-3 text-xs md:text-sm relative ${hasBottleneck ? 'animate-pulse' : ''
          }`}
      >
        <Sparkles className="w-4 h-4 md:mr-1" />
        <span className="hidden md:inline">AI分析</span>
        {hasBottleneck && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        )}
      </Button>

      {/* 展開時オーバーレイ（Glassmorphism） */}
      {isOpen && (
        <div className="fixed top-20 right-4 w-96 max-h-[80vh] overflow-y-auto
                        bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl
                        border border-indigo-200/50 p-6 z-50 animate-in slide-in-from-top-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              運営状況の詳細分析
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-100 rounded transition-colors"
            >
              <span className="sr-only">閉じる</span>
              ×
            </button>
          </div>

          <div className="space-y-4">
            {/* ステータスサマリー */}
            <Card className={`border-2 ${status.type === 'warning' ? 'border-amber-300 bg-amber-50' :
              status.type === 'info' ? 'border-blue-300 bg-blue-50' :
                status.type === 'success' ? 'border-emerald-300 bg-emerald-50' :
                  'border-slate-300 bg-slate-50'
              }`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3 mb-3">
                  {status.type === 'warning' && <AlertTriangle className="w-6 h-6 text-amber-600" />}
                  {status.type === 'info' && <Info className="w-6 h-6 text-blue-600" />}
                  {status.type === 'success' && <TrendingUp className="w-6 h-6 text-emerald-600" />}
                  {status.type === 'normal' && <Info className="w-6 h-6 text-slate-600" />}
                  <h3 className="font-bold text-lg">現在の状況: {status.label}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-600">コート稼働率</p>
                    <p className="font-bold text-2xl">{utilizationRate.toFixed(0)}%</p>
                    <p className="text-xs text-slate-500">
                      {utilizationData.activeCourts}/{utilizationData.totalCourts} コート稼働中
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">男女別稼働率</p>
                    <p className="text-sm">
                      男子: <span className="font-bold">{utilizationData.maleCourtRate.toFixed(0)}%</span>
                    </p>
                    <p className="text-sm">
                      女子: <span className="font-bold">{utilizationData.femaleCourtRate.toFixed(0)}%</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ボトルネック詳細 */}
            {hasBottleneck && bottleneckData && (
              <Card className="border-amber-300 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    待機時間の偏り検知
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-amber-900 font-medium leading-tight">
                    {bottleneckData.suggestedAction}
                  </p>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-amber-800">詳細データ:</p>
                    {bottleneckData.details.map((detail, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-amber-200">
                        <span className="font-medium">{getCategoryLabel(detail.category)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-600">待機: {detail.waitingMatches}試合</span>
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                            約{detail.estimatedWaitMinutes}分
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={handleApplySuggestion}
                    >
                      提案を適用する
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={() => setIsOpen(false)}
                    >
                      後で確認
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 稼働率低下の詳細 */}
            {!hasBottleneck && utilizationRate < 50 && (
              <Card className="border-blue-300 bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-600" />
                    コート稼働率が低下しています
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-blue-900 leading-tight">
                    現在の稼働率は {utilizationRate.toFixed(0)}% です。待機中の試合が少ない、または次の種目の準備中の可能性があります。
                  </p>
                  <p className="text-xs text-blue-700">
                    推定アイドル時間: 約 {utilizationData.estimatedIdleTime} 分
                  </p>
                </CardContent>
              </Card>
            )}

            {/* 良好な運営状況 */}
            {!hasBottleneck && utilizationRate >= 70 && (
              <Card className="border-emerald-300 bg-emerald-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                    順調に進行しています
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-emerald-900 leading-tight">
                    現在、コートは効率的に利用されており、待機時間の偏りも検出されていません。このまま継続してください。
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    'mens_singles': '男子S',
    'womens_singles': '女子S',
    'mens_doubles': '男子D',
    'womens_doubles': '女子D',
    'mixed_doubles': '混合D',
    'team_battle': '団体戦'
  };
  return labels[category] || category;
}
