import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const TOURNAMENT_TYPE_LABELS: Record<string, string> = {
  mens_singles: '男子シングルス',
  womens_singles: '女子シングルス',
  mens_doubles: '男子ダブルス',
  womens_doubles: '女子ダブルス',
  mixed_doubles: '混合ダブルス',
  team_battle: '団体戦',
};

const PLAYER_ID_KEYS = ['player1_id', 'player2_id', 'player3_id', 'player4_id', 'player5_id', 'player6_id'] as const;

export async function POST(req: NextRequest) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  try {
    const { matchId } = await req.json();
    if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

    // 試合データ取得
    const matchSnap = await adminDb.collection('matches').doc(matchId).get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    const match = matchSnap.data()!;

    // player IDs 抽出（最大6名）
    const playerIds: string[] = PLAYER_ID_KEYS
      .map(k => match[k])
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (playerIds.length === 0) return NextResponse.json({ sent: 0 });

    // コート名取得
    let courtLabel = 'コート';
    if (match.court_id) {
      const courtSnap = await adminDb.collection('courts').doc(match.court_id).get();
      if (courtSnap.exists) {
        const courtNumber = courtSnap.data()!.number;
        if (courtNumber) courtLabel = `第${courtNumber}コート`;
      }
    }

    // 種目名
    const typeLabel = TOURNAMENT_TYPE_LABELS[match.tournament_type] ?? match.tournament_type ?? '試合';

    const title = '🏸 試合呼び出し！';
    const body = `${courtLabel}で${typeLabel}が始まります。お越しください！`;
    const tag = 'match-calling';

    // players の pushSubscription を in クエリで一括取得
    const playerSnaps = await adminDb.collection('players')
      .where('__name__', 'in', playerIds)
      .get();

    const subscriptions: { docId: string; sub: object }[] = [];
    playerSnaps.forEach(doc => {
      const sub = doc.data().pushSubscription;
      if (sub && sub.endpoint) {
        subscriptions.push({ docId: doc.id, sub });
      }
    });

    if (subscriptions.length === 0) return NextResponse.json({ sent: 0 });

    // 全サブスクリプションに送信
    const results = await Promise.allSettled(
      subscriptions.map(({ sub }) =>
        webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify({ title, body, tag }))
      )
    );

    // 410/404 Gone → 古いサブスクリプションを削除
    const batch = adminDb.batch();
    let cleanupCount = 0;
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const statusCode = (result.reason as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          batch.update(adminDb.collection('players').doc(subscriptions[i].docId), {
            pushSubscription: FieldValue.delete(),
          });
          cleanupCount++;
        }
      }
    });
    if (cleanupCount > 0) await batch.commit();

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ sent, cleaned: cleanupCount });
  } catch (err) {
    console.error('[push/send]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
