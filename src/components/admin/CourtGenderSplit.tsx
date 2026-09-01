"use client";

// コートの性別配分をまとめて切り替える。
//
// DAY1 は前半が男女別ダブルス、後半が混合ダブルスと1部男子シングルス。
// 前半はコートを男子用・女子用に分けたいが、後半の混合は男女ペアなので
// 性別指定が邪魔になる。1面ずつ「その他の操作」で外していると、
// 切り替えの瞬間に何度も操作することになり事故のもとだった。
//
// 面数だけ決めて一度に書き換える。番号の若い順に 男子 → 女子 → 指定なし。

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { subscribeToCourts, updateDocument } from "@/lib/firestore-helpers";
import { toastSuccess, toastError } from "@/lib/toast";
import type { Court } from "@/types";
import { Minus, Plus } from "lucide-react";

export default function CourtGenderSplit({
  readOnly = false,
  campId,
}: {
  readOnly?: boolean;
  campId: string;
}) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => subscribeToCourts(setCourts, campId), [campId]);

  const total = courts.length;

  // 触っていないうちは今のコート設定をそのまま映す
  useEffect(() => {
    if (touched || courts.length === 0) return;
    setMale(courts.filter(c => c.preferred_gender === "male").length);
    setFemale(courts.filter(c => c.preferred_gender === "female").length);
  }, [courts, touched]);

  const free = Math.max(0, total - male - female);

  const set = (m: number, f: number) => {
    setTouched(true);
    const mm = Math.max(0, Math.min(total, m));
    const ff = Math.max(0, Math.min(total - mm, f));
    setMale(mm);
    setFemale(ff);
  };

  const apply = async () => {
    setSaving(true);
    try {
      const sorted = [...courts].sort((a, b) => a.number - b.number);
      for (let i = 0; i < sorted.length; i++) {
        const gender = i < male ? "male" : i < male + female ? "female" : null;
        if ((sorted[i].preferred_gender ?? null) === gender) continue;
        // 性別を変えたら、個別に付けていた例外許可は意味がなくなるので一緒に外す
        await updateDocument("courts", sorted[i].id, {
          preferred_gender: gender,
          manual_gender_unlock: false,
        });
      }
      toastSuccess(
        "コートの性別を変更しました",
        `男子${male}面 / 女子${female}面 / 指定なし${free}面`
      );
    } catch {
      toastError("変更に失敗しました", "通信を確認してもう一度お試しください");
    } finally {
      setSaving(false);
    }
  };

  if (total === 0) return <p className="text-slate-500 text-sm">コートがまだ作られていません</p>;

  const half = Math.floor(total / 2);
  const presets: { label: string; note: string; m: number; f: number }[] = [
    { label: "男女半々", note: `男子${half}面 / 女子${total - half}面`, m: half, f: total - half },
    { label: "全面 共用", note: "性別の指定なし（混合ダブルス向け）", m: 0, f: 0 },
  ];

  const Counter = ({ label, value, onChange, color }: {
    label: string; value: number; onChange: (n: number) => void; color: string;
  }) => (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={readOnly}
          onClick={() => onChange(value - 1)}>
          <Minus className="w-3 h-3" />
        </Button>
        <span className="w-10 text-center text-base font-bold tabular-nums">{value}</span>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={readOnly}
          onClick={() => onChange(value + 1)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        番号の若い順に 男子 → 女子 → 指定なし で割り当てます（全{total}面）
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Counter label="男子専用" value={male} color="text-sky-700"
          onChange={n => set(n, female)} />
        <Counter label="女子専用" value={female} color="text-pink-700"
          onChange={n => set(male, n)} />
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-sm font-medium text-slate-600">指定なし</span>
          <span className="w-10 text-center text-base font-bold tabular-nums text-slate-700">{free}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <Button key={p.label} variant="outline" size="sm" disabled={readOnly}
            onClick={() => set(p.m, p.f)} className="h-auto flex-col items-start py-1.5">
            <span className="text-xs font-bold">{p.label}</span>
            <span className="text-[10px] font-normal text-slate-500">{p.note}</span>
          </Button>
        ))}
      </div>

      <div className="text-xs text-slate-500">
        {[...courts].sort((a, b) => a.number - b.number).map((c, i) => {
          const g = i < male ? "男" : i < male + female ? "女" : "—";
          return (
            <span key={c.id} className="inline-block mr-2">
              {c.number}番:{g}
            </span>
          );
        })}
      </div>

      <Button onClick={apply} disabled={readOnly || saving} className="w-full">
        {saving ? "変更中..." : `この配分にする（男子${male} / 女子${female} / 指定なし${free}）`}
      </Button>
    </div>
  );
}
