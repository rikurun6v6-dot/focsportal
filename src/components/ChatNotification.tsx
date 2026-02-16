"use client";

import { useState, useEffect } from "react";
import { MessageCircle, X } from "lucide-react";
import { subscribeToMessages } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Message, Player } from "@/types";

interface ChatNotificationProps {
  player: Player;
  onOpenChat: () => void;
}

export default function ChatNotification({ player, onOpenChat }: ChatNotificationProps) {
  const { camp } = useCamp();
  const [unreadMessages, setUnreadMessages] = useState<Message[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [latestMessage, setLatestMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (!camp) return;

    const unsubscribe = subscribeToMessages(
      camp.id,
      (messages) => {
        // 自分宛の未読メッセージのみ抽出
        const myUnreadMessages = messages.filter(
          (msg) =>
            !msg.read_by?.includes(player.id) &&
            (msg.type === 'broadcast' || msg.recipient_ids?.includes(player.id))
        );

        setUnreadMessages(myUnreadMessages);

        // 新着メッセージがあれば通知を表示
        if (myUnreadMessages.length > 0 && myUnreadMessages[0].id !== latestMessage?.id) {
          setLatestMessage(myUnreadMessages[0]);
          setShowNotification(true);

          // 10秒後に自動で消す
          setTimeout(() => {
            setShowNotification(false);
          }, 10000);
        }
      },
      player.id
    );

    return () => unsubscribe();
  }, [camp, player.id, latestMessage?.id]);

  const handleOpenChat = () => {
    setShowNotification(false);
    onOpenChat();
  };

  if (!showNotification || !latestMessage) return null;

  const isBroadcast = latestMessage.type === 'broadcast' || latestMessage.is_announcement;

  return (
    <div className="fixed top-20 right-4 z-[150] animate-in slide-in-from-right duration-300">
      <div
        className={`max-w-sm rounded-2xl shadow-2xl border-2 overflow-hidden ${
          isBroadcast
            ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-400'
            : 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-400'
        }`}
      >
        {/* ヘッダー */}
        <div
          className={`px-4 py-2 flex items-center justify-between ${
            isBroadcast ? 'bg-amber-500' : 'bg-sky-500'
          }`}
        >
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="w-4 h-4" />
            <span className="text-sm font-bold">
              {isBroadcast ? '📢 全体アナウンス' : '💬 新着メッセージ'}
            </span>
          </div>
          <button
            onClick={() => setShowNotification(false)}
            className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 本文 */}
        <div className="p-4">
          <p className="text-sm text-slate-800 mb-3 line-clamp-3">
            {latestMessage.content}
          </p>
          <button
            onClick={handleOpenChat}
            className={`w-full py-2 rounded-lg font-bold text-sm transition-colors ${
              isBroadcast
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}
          >
            メッセージを開く
          </button>
          {unreadMessages.length > 1 && (
            <p className="text-xs text-slate-500 mt-2 text-center">
              他に {unreadMessages.length - 1} 件の未読メッセージがあります
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
