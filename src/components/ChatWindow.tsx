"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Send, User as UserIcon } from "lucide-react";
import { subscribeToMessages, sendMessage, markMessageAsRead } from "@/lib/firestore-helpers";
import type { Message, Player } from "@/types";
import { useCamp } from "@/context/CampContext";

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null; // ユーザー用（nullの場合は管理者）
}

export default function ChatWindow({ isOpen, onClose, player }: ChatWindowProps) {
  const { camp } = useCamp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // メッセージをリアルタイム購読
  useEffect(() => {
    if (!camp || !isOpen) return;

    const unsubscribe = subscribeToMessages(
      camp.id,
      (newMessages) => {
        setMessages(newMessages);

        // 自分宛のメッセージを既読にする（ユーザーの場合のみ）
        if (player) {
          newMessages.forEach((msg) => {
            if (
              (msg.type === 'individual' && msg.recipient_ids?.includes(player.id)) ||
              msg.type === 'broadcast'
            ) {
              if (!msg.read_by?.includes(player.id)) {
                markMessageAsRead(msg.id, player.id);
              }
            }
          });
        }
      },
      player?.id
    );

    return () => unsubscribe();
  }, [camp, isOpen, player]);

  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!camp || !inputText.trim()) return;

    setSending(true);

    try {
      await sendMessage(camp.id, {
        type: 'individual', // ユーザーから管理者への個別メッセージ
        sender_type: player ? 'user' : 'admin',
        sender_id: player?.id,
        recipient_ids: player ? ['admin'] : undefined, // ユーザーは管理者宛、管理者は全員宛
        content: inputText,
        campId: camp.id,
      });

      setInputText("");
    } catch (error) {
      console.error('Error sending message:', error);
    }

    setSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl h-[600px] flex flex-col shadow-2xl border-2 border-slate-300 mx-4 bg-white/98">
        <CardHeader className="border-b border-slate-200 pb-4 bg-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2 text-slate-900">
              <span className="text-2xl">💬</span>
              {player ? 'メッセージ' : '全体連絡'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          {player && (
            <p className="text-xs text-slate-500 mt-2">
              管理者とのメッセージと全体アナウンスがここに表示されます
            </p>
          )}
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/95">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <span className="text-4xl mb-2">📭</span>
              <p className="text-sm font-medium">メッセージはまだありません</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isFromAdmin = msg.sender_type === 'admin';
              const isBroadcast = msg.type === 'broadcast';
              const isAnnouncement = msg.is_announcement;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isFromAdmin ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                      isBroadcast || isAnnouncement
                        ? 'bg-gradient-to-r from-amber-100 to-orange-100 border-2 border-amber-400'
                        : isFromAdmin
                        ? 'bg-sky-50 border-2 border-sky-300'
                        : 'bg-slate-100 border-2 border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isFromAdmin && <UserIcon className="w-3 h-3 text-sky-700" />}
                      <span className="text-xs font-bold text-slate-800">
                        {isBroadcast || isAnnouncement ? '📢 全体アナウンス' : isFromAdmin ? '管理者' : player?.name || 'あなた'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-900 font-medium whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {msg.created_at
                        ? new Date((msg.created_at as any).toMillis()).toLocaleTimeString('ja-JP', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '送信中'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* メッセージ入力エリア（ユーザー専用） */}
        {player && (
          <div className="border-t border-slate-200 p-4 bg-white">
            <div className="flex gap-2">
              <Input
                placeholder="メッセージを入力..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 bg-white border-slate-300"
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
                className="bg-sky-500 hover:bg-sky-600 text-white"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              ※ 現在、ユーザーから管理者への返信機能は準備中です
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
