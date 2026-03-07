"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getDocument, getActiveCampId } from "@/lib/firestore-helpers";
import type { Camp } from "@/types";

const LAST_CAMP_ID_KEY = 'lastCampId';

interface CampContextType {
    camp: Camp | null;
    loading: boolean;
    refreshCamp: () => Promise<void>;
    setManualCamp: (camp: Camp | null) => void; // 管理者用：手動で合宿を切り替える機能
}

const CampContext = createContext<CampContextType>({
    camp: null,
    loading: true,
    refreshCamp: async () => { },
    setManualCamp: () => { },
});

export const useCamp = () => useContext(CampContext);

export function CampProvider({ children }: { children: React.ReactNode }) {
    const [camp, setCamp] = useState<Camp | null>(null);
    const [loading, setLoading] = useState(true);

    // アクティブな合宿を読み込む関数
    const loadActiveCamp = useCallback(async () => {
        try {
            setLoading(true);

            // 1. localStorage の lastCampId を優先チェック
            const lastCampId = typeof window !== 'undefined'
                ? localStorage.getItem(LAST_CAMP_ID_KEY)
                : null;

            if (lastCampId) {
                const campData = await getDocument<Camp>('camps', lastCampId);
                if (campData) {
                    setCamp(campData);
                    return;
                }
                // 削除済み・アクセス不能な場合はキーを消してフォールバック
                localStorage.removeItem(LAST_CAMP_ID_KEY);
            }

            // 2. Firestore のシステムアクティブ合宿にフォールバック
            const activeId = await getActiveCampId();
            if (activeId) {
                const campData = await getDocument<Camp>('camps', activeId);
                if (campData) {
                    setCamp(campData);
                }
            }
        } catch (error) {
            console.error("Failed to load active camp:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadActiveCamp();
    }, [loadActiveCamp]);

    // 手動で合宿セット（管理画面でプレビューする時など）
    // camp を選択したら localStorage に記憶、null なら削除
    const setManualCamp = useCallback((newCamp: Camp | null) => {
        setCamp(newCamp);
        if (typeof window !== 'undefined') {
            if (newCamp) {
                localStorage.setItem(LAST_CAMP_ID_KEY, newCamp.id);
            } else {
                localStorage.removeItem(LAST_CAMP_ID_KEY);
            }
        }
    }, []);

    return (
        <CampContext.Provider value={{ camp, loading, refreshCamp: loadActiveCamp, setManualCamp }}>
            {children}
        </CampContext.Provider>
    );
}