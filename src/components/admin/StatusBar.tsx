"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, Clock, ChevronUp, Database, Activity, Sparkles } from "lucide-react";
import { subscribeToCollection } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Match } from "@/types";
import { where } from "firebase/firestore";
import { calculateTournamentETA, TournamentETAByType } from "@/lib/eta";

interface StatusBarProps {
  isOnline: boolean;
}

export default function StatusBar({ isOnline }: StatusBarProps) {
  const { camp } = useCamp();
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [playingMatchCount, setPlayingMatchCount] = useState(0);
  const [cacheInfo, setCacheInfo] = useState<string>("確認中...");
  const [estimatedEndTime, setEstimatedEndTime] = useState<Date | null>(null);
  const [remainingMatches, setRemainingMatches] = useState(0);
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [etaByType, setEtaByType] = useState<TournamentETAByType[]>([]);

  // 進行中の試合数を監視
  useEffect(() => {
    if (!camp) return;

    const unsubscribe = subscribeToCollection<Match>(
      'matches',
      (matches) => {
        const playingCount = matches.filter(m => m.status === 'playing').length;
        setPlayingMatchCount(playingCount);
      },
      [where('campId', '==', camp.id), where('status', '==', 'playing')]
    );

    return () => unsubscribe();
  }, [camp]);

  useEffect(() => {
    // 10秒ごとに最終更新時刻を更新
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    return `${Math.floor(diff / 3600)}時間前`;
  };

  // キャッシュ情報を取得
  useEffect(() => {
    const fetchCacheInfo = async () => {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usage = estimate.usage || 0;
          const quota = estimate.quota || 0;

          // MB単位で表示
          const usageMB = (usage / (1024 * 1024)).toFixed(2);
          const quotaMB = (quota / (1024 * 1024)).toFixed(0);

          setCacheInfo(`${usageMB} MB / ${quotaMB} MB`);
        } else {
          setCacheInfo("非対応");
        }
      } catch (error) {
        setCacheInfo("取得失敗");
      }
    };

    fetchCacheInfo();

    // ポップオーバーが開かれたときに再取得
    if (isOpen) {
      fetchCacheInfo();
    }
  }, [isOpen]);

  // トーナメント予想終了時刻を取得
  useEffect(() => {
    if (!camp) return;

    const fetchETA = async () => {
      const eta = await calculateTournamentETA(camp.id);
      setEstimatedEndTime(eta.estimatedEndTime);
      setRemainingMatches(eta.remainingMatches);
      setEstimatedMinutes(eta.estimatedMinutesRemaining);
      setEtaByType(eta.byType);
    };

    // 初回取得
    fetchETA();

    // 30秒ごとに更新
    const interval = setInterval(fetchETA, 30000);

    return () => clearInterval(interval);
  }, [camp]);

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      {/* ポップオーバー */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-4 min-w-[280px] animate-in slide-in-from-bottom-2 duration-200">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">
              システム稼働状況
            </h3>

            {/* ネットワーク */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <span className="text-base">📡</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">ネットワーク</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {isOnline ? (
                    <span className="text-emerald-600 font-medium">Firestore 同期中</span>
                  ) : (
                    <span className="text-amber-600 font-medium">オフラインモード</span>
                  )}
                </div>
              </div>
            </div>

            {/* 進行状況 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <span className="text-base">🏸</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">進行状況</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  進行中の試合: <span className="font-bold text-blue-600">{playingMatchCount}</span> 件
                </div>
              </div>
            </div>

            {/* キャッシュ */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <span className="text-base">💾</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">キャッシュ</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  ローカルストレージ: {cacheInfo}
                </div>
              </div>
            </div>

            {/* AI予想終了時刻 */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 -mx-4 -mb-4 p-4 rounded-b-2xl border-t border-purple-100/50 space-y-3">
              {/* 全体の予想 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-md">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <span>AI予想終了時刻（全体）</span>
                  </div>
                  {estimatedEndTime ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="text-sm font-bold text-purple-700">
                        {estimatedEndTime.getHours().toString().padStart(2, '0')}:
                        {estimatedEndTime.getMinutes().toString().padStart(2, '0')}
                      </div>
                      <div className="text-xs text-slate-500">
                        残り約 <span className="font-semibold text-blue-600">{estimatedMinutes}</span> 分
                        （待機 <span className="font-semibold">{remainingMatches}</span> 試合）
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 mt-0.5">
                      全試合終了
                    </div>
                  )}
                </div>
              </div>

              {/* 種目別の予想 */}
              <div className="border-t border-purple-100/50 pt-3">
                <div className="text-xs font-semibold text-slate-700 mb-2">種目別予想</div>
                {etaByType.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {etaByType.map((typeEta) => (
                      <div
                        key={typeEta.tournamentType}
                        className="bg-white/80 backdrop-blur-sm rounded-lg p-2 shadow-sm border border-purple-100/50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700">{typeEta.label}</span>
                          <span className="text-[10px] text-slate-400">
                            {typeEta.remainingMatches + typeEta.activeMatches}試合
                          </span>
                        </div>
                        {typeEta.estimatedEndTime ? (
                          <>
                            <div className="text-xs font-bold text-purple-600">
                              {typeEta.estimatedEndTime.getHours().toString().padStart(2, '0')}:
                              {typeEta.estimatedEndTime.getMinutes().toString().padStart(2, '0')}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              残り{typeEta.estimatedMinutesRemaining}分
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-500">
                            終了
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-2">
                    種目データを読み込み中...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ステータスバー（ピル） */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-slate-100/95 backdrop-blur-sm border border-slate-300 rounded-full px-4 py-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
      >
        <div className="flex items-center gap-3 text-slate-600">
          {/* 接続状況 */}
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-medium">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                <span className="text-xs font-medium">Offline</span>
              </>
            )}
          </div>

          {/* セパレーター */}
          <div className="w-px h-4 bg-slate-300"></div>

          {/* 予想終了時刻 */}
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            {estimatedEndTime ? (
              <span className="text-xs font-bold text-purple-700">
                {estimatedEndTime.getHours().toString().padStart(2, '0')}:
                {estimatedEndTime.getMinutes().toString().padStart(2, '0')} 終了予想
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-500">終了</span>
            )}
          </div>

          {/* 展開アイコン */}
          <ChevronUp
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>
    </div>
  );
}
