import { getAllDocuments, getDocument } from './firestore-helpers';
import type { Match, Court, Config, TournamentType } from '@/types';

export interface BottleneckAnalysis {
  hasBottleneck: boolean;
  bottleneckCategory: TournamentType | null;
  suggestedAction: string | null;
  details: {
    category: TournamentType;
    waitingMatches: number;
    estimatedWaitMinutes: number;
  }[];
}

export interface CourtUtilization {
  totalCourts: number;
  activeCourts: number;
  utilizationRate: number;
  maleCourtRate: number;
  femaleCourtRate: number;
  estimatedIdleTime: number;
}

/**
 * 待機列の監視とボトルネック検知
 */
export async function analyzeBottlenecks(campId: string): Promise<BottleneckAnalysis> {
  try {
    const allMatches = await getAllDocuments<Match>('matches');
    const matches = campId ? allMatches.filter(m => m.campId === campId) : allMatches;
    const waitingMatches = matches.filter(m => m.status === 'waiting');

    // 設定から平均試合時間を取得
    const config = await getDocument<Config>('config', 'system');
    const avgDuration15 = config?.avg_match_duration_15 || 12;
    const avgDuration21 = config?.avg_match_duration_21 || 15;
    const avgDuration11 = config?.avg_match_duration_11 || 8;

    // 種目ごとに待機試合数と推定待ち時間を計算
    const categories: TournamentType[] = [
      'mens_singles',
      'womens_singles',
      'mens_doubles',
      'womens_doubles',
      'mixed_doubles'
    ];

    const details = categories.map(category => {
      const categoryWaiting = waitingMatches.filter(m => m.tournament_type === category);
      // 簡易的に15点マッチと仮定
      const estimatedMinutes = categoryWaiting.length * avgDuration15;

      return {
        category,
        waitingMatches: categoryWaiting.length,
        estimatedWaitMinutes: estimatedMinutes
      };
    }).filter(d => d.waitingMatches > 0);

    // ボトルネック判定: 20分以上の差があるか
    if (details.length < 2) {
      return {
        hasBottleneck: false,
        bottleneckCategory: null,
        suggestedAction: null,
        details
      };
    }

    const maxWait = Math.max(...details.map(d => d.estimatedWaitMinutes));
    const minWait = Math.min(...details.map(d => d.estimatedWaitMinutes));

    if (maxWait - minWait >= 20) {
      const bottleneck = details.find(d => d.estimatedWaitMinutes === maxWait);
      if (bottleneck) {
        return {
          hasBottleneck: true,
          bottleneckCategory: bottleneck.category,
          suggestedAction: `${getCategoryLabel(bottleneck.category)}の待ち時間が他より約${Math.round(maxWait - minWait)}分長くなっています。空きコートをこの種目に優先的に割り当てることを推奨します。`,
          details
        };
      }
    }

    return {
      hasBottleneck: false,
      bottleneckCategory: null,
      suggestedAction: null,
      details
    };

  } catch (error) {
    console.error('Error analyzing bottlenecks:', error);
    return {
      hasBottleneck: false,
      bottleneckCategory: null,
      suggestedAction: null,
      details: []
    };
  }
}

/**
 * コート稼働率の算出
 * 判定しきい値を調整: 空きコートが2面以上かつ待機試合が0の場合のみ稼働率低下を警告
 */
export async function calculateCourtUtilization(campId: string): Promise<CourtUtilization> {
  try {
    const allCourts = await getAllDocuments<Court>('courts');
    const courts = campId ? allCourts.filter(c => c.campId === campId) : allCourts;

    const totalCourts = courts.filter(c => c.is_active).length; // アクティブなコートのみカウント
    const activeCourts = courts.filter(c => c.is_active && c.current_match_id).length;
    const utilizationRate = totalCourts > 0 ? (activeCourts / totalCourts) * 100 : 0;

    const maleCourts = courts.filter(c => c.is_active && c.preferred_gender === 'male');
    const femaleCourts = courts.filter(c => c.is_active && c.preferred_gender === 'female');

    const activeMaleCourts = maleCourts.filter(c => c.current_match_id).length;
    const activeFemaleCourts = femaleCourts.filter(c => c.current_match_id).length;

    const maleCourtRate = maleCourts.length > 0 ? (activeMaleCourts / maleCourts.length) * 100 : 0;
    const femaleCourtRate = femaleCourts.length > 0 ? (activeFemaleCourts / femaleCourts.length) * 100 : 0;

    // 空きコート数を計算
    const idleCourts = totalCourts - activeCourts;

    // 待機試合数を取得して、稼働率低下の判定精度を向上
    const allMatches = await getAllDocuments<Match>('matches');
    const matches = campId ? allMatches.filter(m => m.campId === campId) : allMatches;
    const waitingMatches = matches.filter(m => m.status === 'waiting');

    // 稼働率低下の判定: 空きコートが2面以上 かつ 待機試合が0の場合のみ警告
    // それ以外は通常運転として扱う（誤検知を防ぐ）
    let adjustedUtilizationRate = utilizationRate;
    if (idleCourts >= 2 && waitingMatches.length === 0) {
      // 稼働率低下として明確に判定
      adjustedUtilizationRate = utilizationRate;
    } else if (idleCourts > 0 && waitingMatches.length > 0) {
      // 空きコートがあるが待機試合もある場合は、通常運転として扱う
      // （Auto-Dispatchが動作中の可能性があるため）
      adjustedUtilizationRate = Math.max(utilizationRate, 60); // 最低60%として扱う
    }

    // アイドル時間予測（空きコート数 × 平均試合時間）
    const estimatedIdleTime = idleCourts > 0 && waitingMatches.length === 0 ? idleCourts * 15 : 0;

    return {
      totalCourts,
      activeCourts,
      utilizationRate: adjustedUtilizationRate,
      maleCourtRate,
      femaleCourtRate,
      estimatedIdleTime
    };

  } catch (error) {
    console.error('Error calculating court utilization:', error);
    return {
      totalCourts: 0,
      activeCourts: 0,
      utilizationRate: 0,
      maleCourtRate: 0,
      femaleCourtRate: 0,
      estimatedIdleTime: 0
    };
  }
}

function getCategoryLabel(category: TournamentType): string {
  const labels: Record<TournamentType, string> = {
    'mens_singles': '男子シングルス',
    'womens_singles': '女子シングルス',
    'mens_doubles': '男子ダブルス',
    'womens_doubles': '女子ダブルス',
    'mixed_doubles': 'ミックスダブルス',
    'team_battle': '団体戦'
  };
  return labels[category] || category;
}

/**
 * ボトルネック解消の提案を適用する
 * 対象種目に一時的な優先度ブーストを付与（次回の自動割り当てで最優先される）
 */
export async function applySuggestion(category: TournamentType | null): Promise<boolean> {
  if (!category) return false;

  try {
    const config = await getDocument<Config>('config', 'system');
    const currentBoost = (config?.temporary_category_boost as Record<string, number> | undefined) || {};

    // 対象種目に +200 の優先度ブーストを付与（30分間有効）
    const newBoost = {
      ...currentBoost,
      [category]: 200,
      [`${category}_expires_at`]: Date.now() + 30 * 60 * 1000 // 30分後に期限切れ
    };

    await import('./firestore-helpers').then(({ updateDocument }) =>
      updateDocument('config', 'system', { temporary_category_boost: newBoost })
    );

    console.log(`[Analyzer] 優先度ブーストを適用: ${category} +200`);
    return true;
  } catch (error) {
    console.error('Error applying suggestion:', error);
    return false;
  }
}
