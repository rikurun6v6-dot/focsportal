"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getDocument, updateDocument } from "@/lib/firestore-helpers";
import type { Config, TournamentType } from "@/types";

const TOURNAMENT_TYPES: { value: TournamentType; label: string }[] = [
  { value: "mens_doubles", label: "男子ダブルス" },
  { value: "womens_doubles", label: "女子ダブルス" },
  { value: "mixed_doubles", label: "混合ダブルス" },
  { value: "mens_singles", label: "男子シングルス" },
  { value: "womens_singles", label: "女子シングルス" },
  { value: "team_battle", label: "団体戦" },
];

export default function TournamentTypeControl({ readOnly = false }: { readOnly?: boolean }) {
  const [enabledTypes, setEnabledTypes] = useState<TournamentType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const config = await getDocument<Config>("config", "system");
    setEnabledTypes(config?.enabled_tournaments || []);
    setLoading(false);
  };

  const toggleType = async (type: TournamentType) => {
    const newEnabled = enabledTypes.includes(type)
      ? enabledTypes.filter(t => t !== type)
      : [...enabledTypes, type];

    setEnabledTypes(newEnabled);
    await updateDocument("config", "system", { enabled_tournaments: newEnabled });
  };

  if (loading) return <p className="text-slate-500">読み込み中...</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {enabledTypes.length === 0
          ? "すべての種目が有効です（フィルタなし）"
          : `${enabledTypes.length}種目が有効です`}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {TOURNAMENT_TYPES.map(({ value, label }) => (
          <Button
            key={value}
            onClick={() => toggleType(value)}
            disabled={readOnly}
            variant={enabledTypes.includes(value) || enabledTypes.length === 0 ? "default" : "outline"}
            className={`text-sm ${
              enabledTypes.includes(value) || enabledTypes.length === 0
                ? "bg-emerald-500 hover:bg-emerald-600"
                : "bg-white border-slate-300 text-slate-600"
            }`}
          >
            {label}
          </Button>
        ))}
      </div>
      {enabledTypes.length > 0 && (
        <Button
          onClick={async () => {
            setEnabledTypes([]);
            await updateDocument("config", "system", { enabled_tournaments: [] });
          }}
          disabled={readOnly}
          variant="ghost"
          size="sm"
          className="w-full text-slate-500"
        >
          すべて有効化（フィルタ解除）
        </Button>
      )}
    </div>
  );
}
