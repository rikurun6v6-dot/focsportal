"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Users, Trash2, UserMinus, UserPlus, Upload, Loader2, SlidersHorizontal } from "lucide-react";
import type { Player, TournamentType, Division } from "@/types";
import { useCamp } from "@/context/CampContext";
import { parsePlayersCSV } from "@/lib/csv-parser"; // 👈 修正1: 複数形(Players)でインポート
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toastSuccess, toastError } from "@/lib/toast";

export default function PlayerManager({ readOnly = false }: { readOnly?: boolean }) {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<"male" | "female">("male");
  const [newDivision, setNewDivision] = useState<"1" | "2">("1");
  const [loading, setLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // 種目ごとの部の例外（division_overrides）編集用
  const [overridePlayer, setOverridePlayer] = useState<Player | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<Partial<Record<TournamentType, Division>>>({});

  // 性別に応じた対象種目（団体戦は対象外）
  const eventsForGender = (gender: string): { type: TournamentType; label: string }[] =>
    gender === 'female'
      ? [
          { type: 'womens_singles', label: '女子シングルス' },
          { type: 'womens_doubles', label: '女子ダブルス' },
          { type: 'mixed_doubles', label: '混合ダブルス' },
        ]
      : [
          { type: 'mens_singles', label: '男子シングルス' },
          { type: 'mens_doubles', label: '男子ダブルス' },
          { type: 'mixed_doubles', label: '混合ダブルス' },
        ];

  const openOverride = (player: Player) => {
    setOverridePlayer(player);
    setOverrideDraft({ ...(player.division_overrides ?? {}) });
  };

  const handleSaveOverrides = async () => {
    if (!overridePlayer) return;
    // 既定の部と同じ値は例外として保存しない（クリーンに保つ）
    const cleaned: Partial<Record<TournamentType, Division>> = {};
    (Object.keys(overrideDraft) as TournamentType[]).forEach((t) => {
      const v = overrideDraft[t];
      if ((v === 1 || v === 2) && v !== overridePlayer.division) cleaned[t] = v;
    });
    try {
      await updateDoc(doc(db, 'players', overridePlayer.id!), { division_overrides: cleaned });
      toastSuccess(`${overridePlayer.name} の種目別の部を保存しました`);
      setOverridePlayer(null);
    } catch (e) {
      console.error('Error saving division overrides:', e);
      toastError('保存に失敗しました');
    }
  };

  const overrideCount = (player: Player): number => {
    const ov = player.division_overrides;
    if (!ov) return 0;
    return (Object.keys(ov) as TournamentType[]).filter((t) => {
      const v = ov[t];
      return (v === 1 || v === 2) && v !== player.division;
    }).length;
  };

  // 選手一覧をリアルタイム取得
  useEffect(() => {
    if (!camp) return;

    const playersRef = collection(db, 'players');
    const q = query(
      playersRef,
      where("campId", "==", camp.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPlayers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));

      fetchedPlayers.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      setPlayers(fetchedPlayers);
    });

    return () => unsubscribe();
  }, [camp]);

  // 手動での選手追加
  const handleAddPlayer = async () => {
    if (!newName.trim() || !camp) return;
    setLoading(true);

    try {
      await addDoc(collection(db, 'players'), {
        campId: camp.id,
        name: newName,
        gender: newGender,
        division: parseInt(newDivision),
        team_id: "",
        is_active: true,
        matchHistory: [],
        status: 'idle',
        total_points: 0,
        created_at: serverTimestamp(),
      });
      setNewName("");
    } catch (error) {
      console.error("Error adding player:", error);
      alert("選手の追加に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // CSVインポート処理（writeBatchで一括保存）
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !camp) return;

    setIsImporting(true);
    try {
      const textContent = await file.text();
      const { players: parsedPlayers } = parsePlayersCSV(textContent);

      if (parsedPlayers.length === 0) {
        alert("CSVに有効なデータがありませんでした。");
        return;
      }

      // writeBatchで一括保存（最大500件ずつ）
      const BATCH_SIZE = 500;
      let successCount = 0;
      const timestamp = Date.now();

      for (let i = 0; i < parsedPlayers.length; i += BATCH_SIZE) {
        const chunk = parsedPlayers.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((p, idx) => {
          const safeName = p.name.replace(/\s+/g, '_');
          const docId = `player_${timestamp}_${i + idx}_${safeName}`;
          const docRef = doc(db, 'players', docId);
          batch.set(docRef, {
            campId: camp.id,
            name: p.name,
            gender: p.gender,
            division: p.division,
            team_id: "",
            is_active: true,
            matchHistory: [],
            status: 'idle',
            total_points: 0,
            created_at: serverTimestamp(),
          });
        });

        await batch.commit();
        successCount += chunk.length;
      }

      alert(`${successCount} 名の選手を追加しました。`);
    } catch (error) {
      console.error("CSV Import Error:", error);
      alert("CSVの読み込みに失敗しました。");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 棄権/復帰 切り替え
  const toggleActive = async (player: Player) => {
    try {
      const playerRef = doc(db, 'players', player.id!);
      await updateDoc(playerRef, {
        is_active: !player.is_active
      });
    } catch (error) {
      console.error("Error toggling player status:", error);
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '🗑️ 選手を削除',
      message: '本当にこの選手を削除しますか？',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'players', id));
      toastSuccess('選手を削除しました');
    } catch (error) {
      console.error("Error deleting player:", error);
      toastError('選手の削除に失敗しました');
    }
  };

  if (!camp) return <div className="p-4 text-center text-slate-500">合宿データを選択してください</div>;

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-6">
        {/* 登録フォームエリア */}
        <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
        <CardHeader>
          <CardTitle className="text-slate-800 flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sky-500" /> 選手登録
            </div>
            {/* CSVアップロードボタン */}
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                ref={fileInputRef}
                disabled={isImporting}
              />
              <Button variant="outline" size="sm" disabled={isImporting || readOnly} className="gap-2">
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isImporting ? "読込中..." : "CSVインポート"}
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            合宿「{camp.title}」に参加する選手を追加します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-xs font-bold text-slate-500">氏名</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="名前を入力"
                className="bg-slate-50"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <div className="w-1/2 md:w-28 space-y-2">
                <label className="text-xs font-bold text-slate-500">性別</label>
                <Select value={newGender} onValueChange={(v: any) => setNewGender(v)}>
                  <SelectTrigger className="bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">男性</SelectItem>
                    <SelectItem value="female">女性</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-1/2 md:w-28 space-y-2">
                <label className="text-xs font-bold text-slate-500">レベル</label>
                <Select value={newDivision} onValueChange={(v: any) => setNewDivision(v)}>
                  <SelectTrigger className="bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1部</SelectItem>
                    <SelectItem value="2">2部</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleAddPlayer}
              disabled={loading || !newName || readOnly}
              className="w-full md:w-auto bg-sky-500 hover:bg-sky-600 text-white font-bold"
            >
              追加
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 選手リスト */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-500" /> 参加選手一覧
            </div>
            <Badge variant="secondary" className="text-base px-3 py-1">
              {players.length}名
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px]">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0">
                <TableRow>
                  <TableHead className="w-[40%] min-w-[120px]">氏名</TableHead>
                  <TableHead className="w-[20%] text-center hidden sm:table-cell">性別</TableHead>
                  <TableHead className="w-[15%] text-center hidden sm:table-cell">レベル</TableHead>
                  <TableHead className="w-[15%] text-center">状態</TableHead>
                  <TableHead className="w-[10%] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-slate-400">
                      まだ選手が登録されていません
                    </TableCell>
                  </TableRow>
                ) : (
                  players.map((player) => (
                    <TableRow key={player.id} className={!player.is_active ? "bg-slate-100 opacity-60" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-slate-900">{player.name}</span>
                          <span className="text-xs text-slate-400 sm:hidden">
                            {player.gender === 'male' ? '男性' : '女性'} / {player.division}部
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <Badge variant="outline" className={player.gender === 'male' ? "border-blue-200 text-blue-600 bg-blue-50" : "border-pink-200 text-pink-600 bg-pink-50"}>
                          {player.gender === 'male' ? '男性' : '女性'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <span className="text-slate-600 font-bold">{player.division}部</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(player)}
                          disabled={readOnly}
                          className={player.is_active ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" : "text-slate-400"}
                        >
                          {player.is_active ? <span className="font-bold text-xs">参加中</span> : <UserMinus className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openOverride(player)}
                          disabled={readOnly}
                          className="relative text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="種目別の部（例外）を設定"
                          aria-label="種目別の部（例外）を設定"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                          {overrideCount(player) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-indigo-500 text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center">
                              {overrideCount(player)}
                            </span>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(player.id!)}
                          disabled={readOnly}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* 種目ごとの部の例外（division_overrides）設定ダイアログ */}
      <Dialog open={!!overridePlayer} onOpenChange={(o) => { if (!o) setOverridePlayer(null); }}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>
              種目別の部（例外）— {overridePlayer?.name}
            </DialogTitle>
          </DialogHeader>
          {overridePlayer && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                既定は <span className="font-bold text-slate-700">{overridePlayer.division}部</span>。
                この選手だけ、種目ごとに部を変えたい場合に設定します（変更した種目だけ例外として保存）。
              </p>
              {eventsForGender(overridePlayer.gender).map((ev) => {
                const current = overrideDraft[ev.type]; // 1 | 2 | undefined
                const effective = (current === 1 || current === 2) ? current : overridePlayer.division;
                return (
                  <div key={ev.type} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-slate-700">{ev.label}</span>
                    <div className="flex gap-1">
                      {([['default', '既定'], ['1', '1部'], ['2', '2部']] as const).map(([val, label]) => {
                        const isSel = val === 'default' ? !(current === 1 || current === 2) : Number(val) === current;
                        return (
                          <Button
                            key={val}
                            size="sm"
                            variant={isSel ? 'default' : 'outline'}
                            className={isSel ? 'bg-indigo-500 hover:bg-indigo-600 text-white h-8 px-3' : 'h-8 px-3'}
                            onClick={() => setOverrideDraft((d) => {
                              const next = { ...d };
                              if (val === 'default') delete next[ev.type];
                              else next[ev.type] = Number(val) as Division;
                              return next;
                            })}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-slate-400 w-12 text-right">→ {effective}部</span>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverridePlayer(null)}>キャンセル</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={handleSaveOverrides} disabled={readOnly}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}