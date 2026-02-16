/**
 * トーナメント生成デバッグスクリプト
 * 
 * 使い方：
 * 1. ブラウザのコンソールを開く（F12）
 * 2. このスクリプトをコピー＆ペースト
 * 3. Enterキーで実行
 */

(async () => {
  console.log('=== トーナメント生成デバッグ開始 ===\n');

  // 1. Firebase接続確認
  try {
    const { db } = await import('./src/lib/firebase');
    console.log('✅ Firebase接続: OK');
  } catch (error) {
    console.error('❌ Firebase接続: NG', error);
    return;
  }

  // 2. 合宿情報確認
  const campContext = document.querySelector('[data-camp-id]');
  const campId = campContext?.dataset?.campId;
  console.log(`📍 現在の合宿ID: ${campId || '未選択'}`);

  if (!campId) {
    console.warn('⚠️ 合宿が選択されていません');
    console.log('→ 解決策: 画面右上の「合宿選択へ」から合宿を選択してください');
    return;
  }

  // 3. 選手データ確認
  const { collection, query, where, getDocs } = await import('firebase/firestore');
  const { db } = await import('./src/lib/firebase');

  const playersRef = collection(db, 'players');
  const q = query(
    playersRef,
    where('campId', '==', campId),
    where('is_active', '==', true)
  );

  const snapshot = await getDocs(q);
  console.log(`\n👥 選手データ: ${snapshot.size}名`);

  if (snapshot.size === 0) {
    console.warn('⚠️ 選手が登録されていません');
    console.log('→ 解決策: 「選手」タブから選手を追加してください');
    return;
  }

  // 4. 選手の属性を集計
  const stats = {
    male_div1: 0,
    male_div2: 0,
    female_div1: 0,
    female_div2: 0,
    invalid: []
  };

  snapshot.forEach(doc => {
    const data = doc.data();
    const gender = data.gender?.toString().toLowerCase().trim();
    const division = data.division;

    if (gender === 'male' && division === 1) stats.male_div1++;
    else if (gender === 'male' && division === 2) stats.male_div2++;
    else if (gender === 'female' && division === 1) stats.female_div1++;
    else if (gender === 'female' && division === 2) stats.female_div2++;
    else stats.invalid.push({ name: data.name, gender, division });
  });

  console.log('\n📊 選手の内訳:');
  console.log(`  男性1部: ${stats.male_div1}名 ${stats.male_div1 >= 4 ? '✅' : '❌ 不足'}`);
  console.log(`  男性2部: ${stats.male_div2}名 ${stats.male_div2 >= 4 ? '✅' : '❌ 不足'}`);
  console.log(`  女性1部: ${stats.female_div1}名 ${stats.female_div1 >= 4 ? '✅' : '❌ 不足'}`);
  console.log(`  女性2部: ${stats.female_div2}名 ${stats.female_div2 >= 4 ? '✅' : '❌ 不足'}`);

  if (stats.invalid.length > 0) {
    console.warn('\n⚠️ 属性が不正な選手:');
    stats.invalid.forEach(p => {
      console.log(`  - ${p.name}: gender="${p.gender}", division=${p.division}`);
    });
  }

  // 5. 生成可能な種目を提案
  console.log('\n💡 生成可能な種目:');
  if (stats.male_div1 >= 4) console.log('  ✅ 男子ダブルス/シングルス 1部');
  if (stats.male_div2 >= 4) console.log('  ✅ 男子ダブルス/シングルス 2部');
  if (stats.female_div1 >= 4) console.log('  ✅ 女子ダブルス/シングルス 1部');
  if (stats.female_div2 >= 4) console.log('  ✅ 女子ダブルス/シングルス 2部');
  if (stats.male_div1 >= 2 && stats.female_div1 >= 2) console.log('  ✅ 混合ダブルス 1部');
  if (stats.male_div2 >= 2 && stats.female_div2 >= 2) console.log('  ✅ 混合ダブルス 2部');

  console.log('\n=== デバッグ完了 ===');
})();
