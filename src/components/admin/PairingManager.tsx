"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllPlayers } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Player, TournamentType, Division } from "@/types";
import { Users, UserPlus, X, Check } from "lucide-react";

interface PairingManagerProps {
  tournamentType: TournamentType;
  division: Division;
  onPairsCreated: (pairs: [Player, Player][]) => void;
}

export default function PairingManager({ tournamentType, division, onPairsCreated }: PairingManagerProps) {
  const { camp } = useCamp();
  const [players, setPlayers] = useState<Player[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [pairs, setPairs] = useState<[Player, Player][]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!camp) return;
    const fetchPlayers = async () => {
      setLoading(true);
      const allPlayers = await getAllPlayers(camp.id);

      const targetGender =
        tournamentType.includes("womens") ? "female" :
        tournamentType.includes("mens") ? "male" :
        "mixed";

      let filtered = allPlayers.filter(p => p.division === division && p.is_active);

      if (targetGender !== "mixed") {
        filtered = filtered.filter(p => {
          const playerGender = p.gender?.toString().toLowerCase().trim();
          return playerGender === targetGender;
        });
      }

      setPlayers(filtered);
      setAvailablePlayers(filtered);
      setLoading(false);
    };
    fetchPlayers();
  }, [camp, tournamentType, division]);

  const handlePlayerClick = (player: Player) => {
    if (tournamentType.includes("singles")) {
      return;
    }

    if (selectedPlayers.find(p => p.id === player.id)) {
      setSelectedPlayers(selectedPlayers.filter(p => p.id !== player.id));
    } else if (selectedPlayers.length < 2) {
      setSelectedPlayers([...selectedPlayers, player]);
    }
  };

  const handleCreatePair = () => {
    if (selectedPlayers.length !== 2) return;

    const newPair: [Player, Player] = [selectedPlayers[0], selectedPlayers[1]];
    setPairs([...pairs, newPair]);
    setAvailablePlayers(availablePlayers.filter(p =>
      p.id !== selectedPlayers[0].id && p.id !== selectedPlayers[1].id
    ));
    setSelectedPlayers([]);
  };

  const handleRemovePair = (index: number) => {
    const removedPair = pairs[index];
    setPairs(pairs.filter((_, i) => i !== index));
    setAvailablePlayers([...availablePlayers, removedPair[0], removedPair[1]]);
  };

  const handleSubmit = () => {
    onPairsCreated(pairs);
  };

  const isDoubles = !tournamentType.includes("singles");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            参加者選択・ペア設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-slate-500">読み込み中...</p>}

          {!loading && players.length === 0 && (
            <p className="text-sm text-amber-600">条件に合う選手がいません</p>
          )}

          {!loading && players.length > 0 && (
            <>
              {isDoubles && (
                <>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-bold text-blue-900 mb-2">未割当の選手 ({availablePlayers.length}名)</h3>
                    <div className="flex flex-wrap gap-2">
                      {availablePlayers.map(player => (
                        <button
                          key={player.id}
                          onClick={() => handlePlayerClick(player)}
                          className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                            selectedPlayers.find(p => p.id === player.id)
                              ? 'bg-blue-500 text-white ring-2 ring-blue-600'
                              : 'bg-white text-slate-700 hover:bg-blue-100 border border-slate-300'
                          }`}
                        >
                          {player.name}
                        </button>
                      ))}
                    </div>
                    {availablePlayers.length === 0 && (
                      <p className="text-xs text-slate-500 mt-2">全ての選手がペアに割り当てられました</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2">
                      {selectedPlayers.map((player, idx) => (
                        <Badge key={player.id} variant="default" className="bg-blue-500 text-white px-3 py-1">
                          {player.name}
                        </Badge>
                      ))}
                      {selectedPlayers.length === 0 && (
                        <span className="text-xs text-slate-400">2名の選手を選択してください</span>
                      )}
                    </div>
                    <Button
                      onClick={handleCreatePair}
                      disabled={selectedPlayers.length !== 2}
                      className="bg-emerald-500 hover:bg-emerald-600"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      ペア確定
                    </Button>
                  </div>
                </>
              )}

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 mb-3">
                  {isDoubles ? `確定したペア (${pairs.length}組)` : `参加選手 (${players.length}名)`}
                </h3>
                {isDoubles ? (
                  <div className="space-y-2">
                    {pairs.map((pair, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-md border border-slate-300">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-500" />
                          <span className="text-sm font-medium">{pair[0].name} / {pair[1].name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemovePair(idx)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {pairs.length === 0 && (
                      <p className="text-xs text-slate-400">まだペアがありません</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {players.map(player => (
                      <div key={player.id} className="bg-white p-3 rounded-md border border-slate-300">
                        <span className="text-sm font-medium">{player.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isDoubles && (
                <Button
                  onClick={handleSubmit}
                  disabled={pairs.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  このペア設定で次へ進む ({pairs.length}組)
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
