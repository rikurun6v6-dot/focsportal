"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Send, Users, User, Inbox, Reply } from "lucide-react";
import { sendMessage, getSettings, updateSettings, subscribeToMessages } from "@/lib/firestore-helpers";
import { subscribeToCollection } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import { toastSuccess, toastError } from "@/lib/toast";
import type { Player, Message } from "@/types";
import { where } from "firebase/firestore";

interface MessageManagerProps {
  readOnly?: boolean;
}

export default function MessageManager({ readOnly = false }: MessageManagerProps) {
  const { camp } = useCamp();
  const [messageType, setMessageType] = useState<'broadcast' | 'individual'>('broadcast');
  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);
  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [toggling, setToggling] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPlayerForReply, setSelectedPlayerForReply] = useState<Player | null>(null);
  const [replyContent, setReplyContent] = useState("");

  // プレイヤー一覧を取得
  useEffect(() => {
    if (!camp) return;

    const unsubscribe = subscribeToCollection<Player>(
      'players',
      (playersList) => {
        playersList.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        setPlayers(playersList);
      },
      [where('campId', '==', camp.id)]
    );

    return () => unsubscribe();
  }, [camp]);

  // チャット機能の設定を取得
  useEffect(() => {
    const loadSettings = async () => {
      if (!camp) return;
      const settings = await getSettings(camp.id);
      setIsChatEnabled(settings?.isChatEnabled ?? true);
    };
    loadSettings();
  }, [camp]);

  // メッセージをリアルタイム購読
  useEffect(() => {
    if (!camp) return;

    const unsubscribe = subscribeToMessages(
      camp.id,
      (newMessages) => {
        setMessages(newMessages);
      }
    );

    return () => unsubscribe();
  }, [camp]);

  const handleToggleChat = async () => {
    if (!camp) return;

    setToggling(true);
    const newValue = !isChatEnabled;
    const success = await updateSettings(camp.id, { isChatEnabled: newValue });

    if (success) {
      setIsChatEnabled(newValue);
      toastSuccess(newValue ? "チャット機能を有効にしました" : "チャット機能を無効にしました");
    } else {
      toastError("設定の更新に失敗しました");
    }
    setToggling(false);
  };

  const handleSendMessage = async () => {
    if (!camp || !messageContent.trim()) {
      toastError("メッセージを入力してください");
      return;
    }

    if (messageType === 'individual' && selectedPlayerIds.length === 0) {
      toastError("送信先のプレイヤーを選択してください");
      return;
    }

    setSending(true);

    try {
      const messageId = await sendMessage(camp.id, {
        type: messageType,
        sender_type: 'admin',
        recipient_ids: messageType === 'individual' ? selectedPlayerIds : undefined,
        content: messageContent,
        is_announcement: messageType === 'broadcast',
        campId: camp.id,
      });

      if (messageId) {
        toastSuccess(
          messageType === 'broadcast'
            ? "全体アナウンスを送信しました"
            : `${selectedPlayerIds.length}名にメッセージを送信しました`
        );
        setMessageContent("");
        setSelectedPlayerIds([]);
      } else {
        toastError("メッセージの送信に失敗しました");
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toastError("メッセージの送信に失敗しました");
    }

    setSending(false);
  };

  const handleTogglePlayer = (playerId: string) => {
    if (selectedPlayerIds.includes(playerId)) {
      setSelectedPlayerIds(selectedPlayerIds.filter(id => id !== playerId));
    } else {
      setSelectedPlayerIds([...selectedPlayerIds, playerId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedPlayerIds.length === players.length) {
      setSelectedPlayerIds([]);
    } else {
      setSelectedPlayerIds(players.map(p => p.id));
    }
  };

  const handleReply = async () => {
    if (!camp || !selectedPlayerForReply || !replyContent.trim()) {
      toastError("返信内容を入力してください");
      return;
    }

    setSending(true);

    try {
      const messageId = await sendMessage(camp.id, {
        type: 'individual',
        sender_type: 'admin',
        recipient_ids: [selectedPlayerForReply.id],
        content: replyContent,
        campId: camp.id,
      });

      if (messageId) {
        toastSuccess(`${selectedPlayerForReply.name} さんに返信しました`);
        setReplyContent("");
        setSelectedPlayerForReply(null);
      } else {
        toastError("返信の送信に失敗しました");
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      toastError("返信の送信に失敗しました");
    }

    setSending(false);
  };

  // 選手ごとにメッセージをグループ化
  const messagesByPlayer = messages
    .filter(msg => msg.sender_type === 'user' && msg.sender_id)
    .reduce((acc, msg) => {
      const senderId = msg.sender_id!;
      if (!acc[senderId]) {
        acc[senderId] = [];
      }
      acc[senderId].push(msg);
      return acc;
    }, {} as Record<string, Message[]>);

  // 未読メッセージ数を計算
  const unreadCount = messages.filter(
    msg => msg.sender_type === 'user' && (!msg.read_by || msg.read_by.length === 0)
  ).length;

  return (
    <Tabs defaultValue="send" className="w-full space-y-6">
      <TabsList className="grid w-full grid-cols-2 bg-slate-100">
        <TabsTrigger value="inbox" className="data-[state=active]:bg-white">
          <Inbox className="w-4 h-4 mr-2" />
          受信箱
          {unreadCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="send" className="data-[state=active]:bg-white">
          <Send className="w-4 h-4 mr-2" />
          送信
        </TabsTrigger>
      </TabsList>

      {/* 受信箱タブ */}
      <TabsContent value="inbox" className="space-y-4">
        <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-purple-400">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Inbox className="w-5 h-5 text-purple-500" />
              受信メッセージ
            </CardTitle>
            <CardDescription>ユーザーからのメッセージをスレッド形式で表示</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(messagesByPlayer).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">受信メッセージはありません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(messagesByPlayer).map(([playerId, playerMessages]) => {
                  const player = players.find(p => p.id === playerId);
                  const latestMessage = playerMessages[0];
                  const unreadMessages = playerMessages.filter(msg => !msg.read_by || msg.read_by.length === 0);

                  return (
                    <div
                      key={playerId}
                      className="border-2 border-slate-200 rounded-lg p-4 hover:border-purple-300 transition-colors bg-white"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="w-5 h-5 text-purple-600" />
                          <span className="font-bold text-slate-800">
                            {player?.name || '不明な選手'}
                          </span>
                          {unreadMessages.length > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                              {unreadMessages.length} 件未読
                            </span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPlayerForReply(player || null);
                            setReplyContent("");
                          }}
                          disabled={!player || readOnly}
                          className="text-purple-600 hover:bg-purple-50"
                        >
                          <Reply className="w-4 h-4 mr-1" />
                          返信
                        </Button>
                      </div>

                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {playerMessages.slice(0, 3).map((msg) => (
                          <div key={msg.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                            <p className="text-slate-800 whitespace-pre-wrap">{msg.content}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {msg.created_at
                                ? new Date((msg.created_at as any).toMillis()).toLocaleString('ja-JP')
                                : '送信中'}
                            </p>
                          </div>
                        ))}
                        {playerMessages.length > 3 && (
                          <p className="text-xs text-slate-500 text-center">
                            他 {playerMessages.length - 3} 件のメッセージ
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 返信ダイアログ */}
            {selectedPlayerForReply && (
              <div className="mt-6 border-t-2 border-purple-200 pt-6">
                <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-purple-800 flex items-center gap-2">
                      <Reply className="w-5 h-5" />
                      {selectedPlayerForReply.name} さんに返信
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPlayerForReply(null)}
                      className="text-slate-500"
                    >
                      ✕
                    </Button>
                  </div>
                  <Textarea
                    placeholder="返信内容を入力..."
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    className="mb-3 bg-white"
                    disabled={readOnly}
                  />
                  <Button
                    onClick={handleReply}
                    disabled={!replyContent.trim() || sending || readOnly}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {sending ? "送信中..." : "返信を送信"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 送信タブ */}
      <TabsContent value="send" className="space-y-6">
      {/* チャット機能のオンオフ */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-sky-500" />
            チャット機能の設定
          </CardTitle>
          <CardDescription>ユーザー画面でのチャット機能の有効/無効を切り替えます</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 border rounded-lg transition-colors ${
            isChatEnabled
              ? "bg-sky-50 border-sky-200"
              : "bg-slate-50 border-slate-200"
          }`}>
            <div>
              <p className={`font-bold text-lg ${isChatEnabled ? "text-sky-700" : "text-slate-700"}`}>
                チャット機能: {isChatEnabled ? "有効" : "無効"}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {isChatEnabled
                  ? "ユーザーはメッセージを受信できます"
                  : "ユーザー画面でチャットボタンが非表示になります"}
              </p>
            </div>
            <Button
              onClick={handleToggleChat}
              disabled={toggling || readOnly}
              variant={isChatEnabled ? "destructive" : "default"}
              className={`w-full md:w-auto ${
                isChatEnabled ? "bg-rose-500 hover:bg-rose-600" : "bg-sky-500 hover:bg-sky-600"
              }`}
            >
              {isChatEnabled ? "無効にする" : "有効にする"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* メッセージ送信 */}
      <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-sky-500" />
            メッセージ送信
          </CardTitle>
          <CardDescription>選手に個別メッセージまたは全体アナウンスを送信</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 送信タイプ選択 */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">送信タイプ</label>
            <Select
              value={messageType}
              onValueChange={(value: 'broadcast' | 'individual') => {
                setMessageType(value);
                setSelectedPlayerIds([]);
              }}
              disabled={readOnly}
            >
              <SelectTrigger className="bg-white border-slate-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 shadow-xl z-50">
                <SelectItem value="broadcast" className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    全体アナウンス（全員に送信）
                  </div>
                </SelectItem>
                <SelectItem value="individual" className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    個別メッセージ（特定の選手に送信）
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 個別メッセージの場合: プレイヤー選択 */}
          {messageType === 'individual' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700">
                  送信先選手 ({selectedPlayerIds.length}名選択中)
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={readOnly}
                  className="text-xs"
                >
                  {selectedPlayerIds.length === players.length ? "全解除" : "全選択"}
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50">
                {players.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    選手が登録されていません
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {players.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => handleTogglePlayer(player.id)}
                        disabled={readOnly}
                        className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedPlayerIds.includes(player.id)
                            ? "bg-sky-500 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* メッセージ入力 */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">メッセージ本文</label>
            <Textarea
              placeholder="メッセージを入力してください..."
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              disabled={readOnly}
              className="min-h-[120px] bg-white border-slate-300 resize-none"
            />
          </div>

          {/* 送信ボタン */}
          <Button
            onClick={handleSendMessage}
            disabled={!messageContent.trim() || sending || readOnly}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold"
          >
            {sending ? (
              "送信中..."
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {messageType === 'broadcast' ? '全体アナウンスを送信' : `選択した${selectedPlayerIds.length}名に送信`}
              </>
            )}
          </Button>

          {messageType === 'broadcast' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ⚠️ 全体アナウンスは、すべての参加者の画面にポップアップで表示されます
            </p>
          )}
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
