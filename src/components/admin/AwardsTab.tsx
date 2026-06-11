"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCamp } from "@/context/CampContext";
import { getAllMatches, getAllPlayers, getAllDocuments } from "@/lib/firestore-helpers";
import {
  computeAllPodiums,
  getCategoryLabel,
  getDivisionLabel,
  type CategoryPodium,
} from "@/lib/awards";
import type { Match, Player, Team } from "@/types";
import { Trophy, Medal, Award, Download, RefreshCw } from "lucide-react";
import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import { toastSuccess, toastError } from "@/lib/toast";

export default function AwardsTab() {
  const { camp } = useCamp();
  const [podiums, setPodiums] = useState<CategoryPodium[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!camp) return;
    setLoading(true);
    try {
      const [matches, players, teams] = await Promise.all([
        getAllMatches(camp.id),
        getAllPlayers(camp.id),
        getAllDocuments<Team>("teams"),
      ]);
      const playersMap = new Map<string, Player>(players.map((p) => [p.id, p]));
      const teamsMap = new Map<string, string>(teams.map((t) => [t.id, t.name]));
      const result = computeAllPodiums(matches as Match[], playersMap, teamsMap);
      setPodiums(result);
    } catch (e) {
      console.error("[AwardsTab] データ取得エラー:", e);
      toastError("表彰データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [camp]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const target = exportRef.current;
      const dataUrl = await toPng(target, {
        quality: 1.0,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width: Math.max(target.scrollWidth, target.offsetWidth),
        height: Math.max(target.scrollHeight, target.offsetHeight),
      });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      saveAs(dataUrl, `表彰結果_${camp?.title ?? ""}_${timestamp}.png`);
      toastSuccess("画像を保存しました");
    } catch (e) {
      console.error("[AwardsTab] 画像保存エラー:", e);
      toastError("画像の保存に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const finalized = podiums.filter((p) => p.finalized);
  const pending = podiums.filter((p) => !p.finalized);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-500" />
          <h2 className="text-xl font-bold text-slate-800">表彰結果</h2>
          <span className="text-sm text-slate-500">優勝・準優勝・3位のまとめ</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            更新
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting || finalized.length === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Download className="w-4 h-4 mr-1" />
            {exporting ? "保存中..." : "画像保存"}
          </Button>
        </div>
      </div>

      {loading && podiums.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">読み込み中...</p>
      ) : finalized.length === 0 ? (
        <Card className="bg-white border-slate-200">
          <CardContent className="py-10 text-center text-slate-500">
            まだ優勝が確定した種目はありません。
            <br />
            決勝戦の結果が入力されると、ここに表彰台が表示されます。
          </CardContent>
        </Card>
      ) : (
        <div ref={exportRef} className="space-y-4 bg-white p-4 rounded-lg">
          <div className="text-center pb-2">
            <h3 className="text-lg font-bold text-slate-800">{camp?.title} 表彰結果</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {finalized.map((p) => (
              <PodiumCard key={`${p.tournamentType}_${p.division}`} podium={p} />
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <Card className="bg-slate-50 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">進行中（未確定）の種目</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <span
                key={`${p.tournamentType}_${p.division}`}
                className="text-xs bg-white border border-slate-200 rounded-full px-3 py-1 text-slate-500"
              >
                {getCategoryLabel(p.tournamentType)} {getDivisionLabel(p.division)}
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PodiumCard({ podium }: { podium: CategoryPodium }) {
  const { tournamentType, division, champion, runnerUp, third, thirdShared } = podium;
  return (
    <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-amber-400 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-800">
          {getCategoryLabel(tournamentType)}
          <span className="ml-2 text-sm font-normal text-slate-500">{getDivisionLabel(division)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 優勝 */}
        <Row
          rank="優勝"
          name={champion?.label ?? "—"}
          icon={<Trophy className="w-5 h-5 text-amber-500" />}
          className="bg-amber-50 border-amber-200"
        />
        {/* 準優勝 */}
        <Row
          rank="準優勝"
          name={runnerUp?.label ?? "—"}
          icon={<Medal className="w-5 h-5 text-slate-400" />}
          className="bg-slate-50 border-slate-200"
        />
        {/* 3位 */}
        {third.length === 0 ? (
          <Row
            rank="第3位"
            name="—"
            icon={<Award className="w-5 h-5 text-orange-400" />}
            className="bg-orange-50 border-orange-200"
          />
        ) : (
          third.map((t, i) => (
            <Row
              key={i}
              rank={thirdShared ? "第3位（同）" : "第3位"}
              name={t.label}
              icon={<Award className="w-5 h-5 text-orange-400" />}
              className="bg-orange-50 border-orange-200"
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  rank,
  name,
  icon,
  className,
}: {
  rank: string;
  name: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${className ?? ""}`}>
      <div className="shrink-0">{icon}</div>
      <div className="text-xs font-bold text-slate-500 w-16 shrink-0">{rank}</div>
      <div className="text-sm font-semibold text-slate-800 break-words">{name}</div>
    </div>
  );
}
