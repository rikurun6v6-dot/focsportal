"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Users, Trash2, UserMinus, UserPlus, Trophy, AlertCircle } from "lucide-react";
import type { Player } from "@/types";
import { useCamp } from "@/context/CampContext"; // 👈 追加

export default function PlayerManager() {
  const { camp } = useCamp(); // 👈 現在の合宿情報を取得

  const [players, setPlayers] = useState<Player[]>([]);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<"male" | "female">("male");
  const [newDivision, setNewDivision] = useState<"1" | "2">("1");
  const [loading, setLoading] = useState(false);

  // 選手一覧をリアルタイム取得
  useEffect(() => {
    // 合宿が選択されていない場合は何もしない
    if (!camp) return;

    const playersRef = collection(db, 'players');

    // ※ Firestoreの複合インデックスエラーを避けるため、一旦全取得してクライアント側でフィルタリングするか、
    // シンプルなクエリにします。今回は確実性を重視して、campIdでフィルタリングします。
    // もし "The query requires an index" というエラーが出たら、コンソールのリンクから作成してください。
    // 今回は安全のため、並び替えはクライアントで行います。

    // campId があるものだけを取得するクエリ
    const q = query(
      playersRef,
      where("campId", "==", camp.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPlayers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Player));

      // 名前順などでソート
      fetchedPlayers.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

      setPlayers(fetchedPlayers);
    });

    return () => unsubscribe();
  }, [camp]);

  // 選手追加
  const handleAddPlayer = async () => {
    if (!newName.trim() || !camp) return;
    setLoading(true);

    try {
      await addDoc(collection(db, 'players'), {
        campId: camp.id, // 👈 重要: どの合宿の選手か記録する
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

  // 棄権/復帰 切り替え
  const toggleActive = async (player: Player) => {
    try {
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, {
        is_active: !player.is_active
      });
    } catch (error) {
      console.error("Error toggling player status:", error);
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm("本当にこの選手を削除しますか？")) return;
    try {
      await deleteDoc(doc(db, 'players', id));
    } catch (error) {
      console.error("Error deleting player:", error);
    }
  };

  if (!camp) return <div>合宿データを選択してください</div>;

  return (
    <div className="space-y-6">
      {/* 登録フォーム */}
      <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
        <CardHeader>
          <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
            <UserPlus className="w-5 h-5 text-sky-500" /> 選手登録
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
              disabled={loading || !newName}
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
                          {/* スマホ用サブ情報 */}
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
                          className={player.is_active ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" : "text-slate-400"}
                        >
                          {player.is_active ? "参加中" : "棄権"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(player.id)}
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
  );
}