"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getDocument, getActiveCampId } from "@/lib/firestore-helpers";
import type { Camp } from "@/types";

interface CampContextType {
    camp: Camp | null;
    loading: boolean;
    refreshCamp: () => Promise<void>;
    setManualCamp: (camp: Camp) => void; // 管理者用：手動で合宿を切り替える機能
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
    const loadActiveCamp = async () => {
        try {
            setLoading(true);
            // 1. 設定から「現在アクティブな合宿ID」を取得
            const activeId = await getActiveCampId();

            if (activeId) {
                // 2. そのIDの合宿データを取得
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
    };

    useEffect(() => {
        loadActiveCamp();
    }, []);

    // 手動で合宿セット（管理画面でプレビューする時など）
    const setManualCamp = (newCamp: Camp) => {
        setCamp(newCamp);
    };

    return (
        <CampContext.Provider value={{ camp, loading, refreshCamp: loadActiveCamp, setManualCamp }}>
            {children}
        </CampContext.Provider>
    );
}