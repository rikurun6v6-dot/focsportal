# 割り当てロジック 技術解説

> 対象ファイル: `src/lib/dispatcher.ts` / `src/lib/matchScoring.ts` / `src/lib/eta.ts`
> 最終更新: 2026-03-16

---

## 全体フロー概観

```
AutoDispatchEngine（30秒ごと）
        │
        ▼
autoDispatchAll(campId, defaultRestMinutes)
        │
        ├─ 空きコートを列挙（is_active && !current_match_id && !manually_freed）
        │
        └─ for each 空きコート:
               dispatchToEmptyCourt(court, waitingMatches, ...)
                        │
                        ├─ [予約優先] reserved_court_id が一致する試合があれば即アサイン
                        │
                        ├─ [eligible絞り込み] validMatches を計算
                        │
                        ├─ [ラウンドロック] minRoundByGroup で前ラウンドを守る
                        │
                        ├─ [スコアリング] calcMatchScore で優先度を計算
                        │
                        ├─ [性別ルーティング] コートの preferred_gender に合う試合を選択
                        │
                        └─ [アサイン] matches.status → 'calling', courts.current_match_id を更新
```

---

## 1. スコアリングの全貌

### 計算式

```
priorityScore = waitTime
              + roundScore
              + divisionBonus      ← court-agnostic
              + categoryBoost      ← AIアドバイザーによる一時ブースト
              + groupBalancePenalty
              + matchOrderScore
              [+ courtPenalty]     ← court-specific（dispatcher内のみ）
```

**スコアが高いほど優先して割り当てられる。**

---

### (A) waitTime — 待機時間

```typescript
const effectiveAvailableMs = max(player.last_match_finished_at for each player);
const waitStartMs = effectiveAvailableMs > 0 ? effectiveAvailableMs : match.created_at;
waitTime = max(0, (now - waitStartMs) / 60000);  // 単位: 分
```

- 試合に関わる全選手の「最終試合終了時刻」の最大値を起点とする。
- 全員が初戦なら `created_at`（試合生成時刻）を起点とする。
- 待てば待つほど加点され、自動的に公平になる仕組み。
- 範囲: 0 〜 数百分（試合時間に比例して自然上昇）

---

### (B) roundScore — ラウンド重み

```typescript
const phaseKey = `${tournament_type}_${division}_${phase}`;
const maxRound  = maxRoundByTypeDiv.get(phaseKey) ?? 4;
roundScore = ROUND_COEFFICIENT * (maxRound - match.round + 1);
// ROUND_COEFFICIENT = 100
```

- 早いラウンド（round=1）ほど高スコアになる。
- `maxRound` は **実データから動的に計算**（固定値 4 は廃止済み）。
- 例: 4ラウンド構成で round=1 → `100×4=400`、round=4（決勝）→ `100×1=100`
- ラウンドが1つ違うと waitTime 換算で 100分分 の差がつく（1時間40分相当）。

---

### (C) divisionBonus — 部門バランスボーナス

```typescript
const progressGap    = |div1Progress - div2Progress|;
divisionBonusBase    = min(50, progressGap * 167);   // 最大50点
divisionBonus = (match.division === preferredDivision) ? divisionBonusBase : 0;
```

- 1部/2部の完了試合比率を比較し、遅れている部を優先。
- 最大 50点（waitTime 換算: 約50分分）。意図的に弱く設定し、
  ラウンド順守と待機時間の公平性を崩さないようにしている。

```
隣接コートペナルティ（dispatcher内のみ）:
  divisionBonus -= 30  // 前後のコートが同じ部なら偏りを緩和
```

---

### (D) categoryBoost — AIアドバイザーによる一時ブースト

```typescript
config.temporary_category_boost[tournament_type]           // ブースト値
config.temporary_category_boost[`${tournament_type}_expires_at`]  // 有効期限(ms)
categoryBoost = boostValue if now < expiresAt else 0
```

- 管理者がAIアドバイザーから「男子D が滞留中」と通知を受けて承認した場合に発動。
- 30分間有効。デフォルト値は approx. 600点（ラウンド差6回戦分）。

---

### (E) groupBalancePenalty — 予選グループ平準化

```typescript
const gKey    = `${tournament_type}_${division}_${group}`;
const groupDone = groupProgressMap.get(gKey) || 0;  // 消化済み試合数
groupBalancePenalty = -100 * groupDone;
```

- 予選グループ内の消化試合数が多いほどペナルティを受ける。
- グループ A が先行している場合、グループ B/C を優先して並行進行させる。
- ペナルティは 1試合につき -100点（waitTime 換算: -100分）。

---

### (F) matchOrderScore — ブラケット生成順

```typescript
matchOrderScore = -(match.match_number ?? 0) * 2;
```

- `match_number` が小さい（トーナメント上位のブロック）ほど優先。
- 係数 2 = 試合1枠の差 ≒ 2分待機相当。ラウンドや部門差より遥かに小さい。

---

### (G) courtPenalty — コート固有ペナルティ（dispatcher内のみ）

```typescript
// 混合ダブルスのコート前後半制限
if (mixedCourtRestriction && tournament_type === 'mixed_doubles') {
  if (match.division !== mixedCourtRestriction.allowedDivision) {
    courtPenalty = -1000;  // 事実上除外
  }
}
```

- ETA 計算には含まれない（コートを指定しない計算のため）。

---

## 2. マッチングの制約条件（バリデーション順序）

`dispatchToEmptyCourt` 内の `validMatches` フィルタが以下の順で評価する。

```
┌─ (1) 選手IDが両方揃っているか（player1_id && player2_id）
│
├─ (2) 種目フィルタ: enabled_tournaments に含まれているか
│
├─ (3) 重複チェック (busy判定)
│    ├─ 通常試合: player1〜6 が busyPlayerIds に含まれていないか
│    └─ 団体戦: チームIDが busyTeamIds に含まれていないか
│
├─ (4) 団体戦グループ排他: 同一グループで既に進行中の対戦がないか
│
├─ (5) available_at チェック: 休息時間が完了しているか (now >= available_at)
│
├─ (6) 予約コート時間制限: このコートに近い予約があり、別試合を入れると間に合わない場合
│
├─ (7) 選手個人の休息時間: last_match_finished_at から defaultRestMinutes 経過しているか
│    ※ available_at が null（管理者手動クリア）の場合はスキップ
│
└─ (8) 決勝待機モード: finals_wait_mode=ON かつ決勝戦 かつ他の試合が未完了なら除外
```

すべてのチェックを通過したものだけが候補になる。

---

### ラウンドロック（minRoundByGroup）

```typescript
groupKey = `${tournament_type}_${division}_${phase}_${group}`
```

- **group を含む**ことで、予選グループ A/B/C が独立してラウンドを管理する。
  （以前は `type_div` だけのキーで A 組の2回戦が B 組の1回戦をブロックするバグがあった）
- 各グループキーごとに「現在の最小ラウンド」を記録。
- waiting 試合の中で、そのグループの最小ラウンドと一致するものだけが有効候補になる。
- これにより「準決勝が waiting になっているが1回戦がまだある」状態で準決勝を割り当てるバグを防止する。

```
minRoundByGroup 計算のポイント:
  filteredWaitingMatches（enabled && 選手確定済み）から計算する。
  validMatches（休息チェック後）から計算しないことで、
  「下位ラウンドが全員休息中でも上位ラウンドを先出しする」バグを防ぐ。
```

---

## 3. 性別ルーティング

```
コート.preferred_gender = 'male' | 'female' | undefined

┌─ 候補を3グループに分類
│    preferred  : コートの性別 と 試合の性別が一致
│    neutral    : 混合ダブルス/団体戦など、性別制約なし
│    opposite   : 性別が逆
│
├─ preferred → neutral の順で最高スコアを選択
│
└─ 5分以上コートが空の場合はソフトフォールバック:
     opposite も候補に加えて管理者にトースト通知
```

`preferred_gender` が未設定のコート:
- preferred・neutral・opposite すべてを候補にして最高スコアを選択。

---

## 4. 団体戦 3面展開

```typescript
// autoDispatchAll 内
if (assigned.tournament_type === 'team_battle') {
  let extraCount = 0;
  for (const extraCourt of emptyCourts) {
    if (extraCount >= 2) break;  // 追加は最大2面（合計3面）
    if (claimedCourtIds.has(extraCourt.id)) continue;
    await updateDocument('courts', extraCourt.id, { current_match_id: assigned.id });
    claimedCourtIds.add(extraCourt.id);
    extraCount++;
  }
}
```

- 団体戦1試合 = 最大3コートに同一 `matchId` を設定。
- `claimedCourtIds` により同一ループ内での二重確保を防ぐ。
- 結果入力は「主担当コート（最若番）」からのみ可能。他コートには「入力は第X番コートから」と表示。
- 結果確定時は `current_match_id === assigned.id` のコートを**全て**解放する。

```
グループ排他制御:
  activeTeamBattleGroupKeys = 進行中のチーム戦グループキーの集合
  同一グループ（例: 予選Aブロック）の別対戦は、前の対戦が終わるまで待機。
```

---

## 5. ループ構造（全体走査の仕組み）

```
autoDispatchAll
│
├─ getAllDocuments('courts')  ← 全コートを一括取得
├─ getAllDocuments('matches') ← 全試合を一括取得
│
└─ for (const court of emptyCourts):
         │
         ├─ assignedMatchIds.has(court.id) → skip（ループ内二重確保防止）
         │
         └─ dispatchToEmptyCourt(court, waitingMatches, ...)
                  │
                  ├─ getAllDocuments('matches') ← 最新状態を再取得（active状態更新のため）
                  ├─ getAllDocuments('players') ← 休息時間チェック用
                  ├─ getDocument('config')     ← enabled_tournaments, finalsWaitMode
                  │
                  └─ 最高スコアの候補をアサイン
```

**注意**: `dispatchToEmptyCourt` 内で毎回 Firestore を再取得しているため、
コートの数だけ読み取りが発生する。6コートなら最大 6×3=18回の読み取り。

---

## 6. ETA 計算との対応関係

| dispatcher.ts | eta.ts (searchPlayerByName) |
|---|---|
| `filteredWaitingMatches`（enabled絞り込み済み） | `allWaiting`（同一条件） |
| `minRoundByGroup` with `getGroupKey()` | 同一 `getGroupKey()` を使用 |
| `validMatches`（busy/休息チェック後） | `eligibleMatches`（同等チェック） |
| `calcMatchScore(match, { ...scoreCtx, adjacentCourtDivisions })` | `calcMatchScore(match, scoreCtx)`（adjacentCourtDivisions は省略） |
| コート単位の性別ルーティング | `relevantCourts` で性別コート数を参照 |

`adjacentCourtDivisions`（隣接コートペナルティ）と `mixedCourtRestriction`（混合D前後半制限）は
コート固有のパラメータのため、ETA 計算では省略。
これによる誤差は最大 ±30点（waitTime換算 ±30分）だが、試合数に対しては軽微。

---

## 7. 進行制御（enabled_tournaments）の伝播

```
config.enabled_tournaments = ['mens_doubles', 'womens_doubles']  // 例

dispatcher: filteredWaitingMatches = waitingMatches.filter(enabled)
eta (calculateTournamentETA): filterByEnabled で waiting/active を絞り込み
eta (searchPlayerByName):
  ├─ myNextMatch が disabled → paused: true を返す（「進行待ち」表示）
  └─ allWaiting: isEnabledType で絞り込み（matchesBefore の分母を制限）
```

**ユーザー体験の流れ:**

```
管理者: enabled_tournaments から 'mens_doubles' を除外
         ↓
dispatcher: 男子ダブルスは validMatches から外れる → 割り当てされなくなる
         ↓
eta: myNextMatch が男子ダブルス → paused: true
         ↓
user/page.tsx: 「進行待ち（種目が停止中）」を表示
```

---

## 付録: 定数一覧

| 定数 | 値 | 用途 |
|---|---|---|
| `ROUND_COEFFICIENT` | 100 | ラウンドスコアの倍率 |
| `divisionBonusBase` max | 50 | 部門バランスボーナス上限 |
| `groupBalancePenalty` | -100/試合 | グループ平準化ペナルティ |
| `matchOrderScore` 係数 | -2/match_number | ブラケット順序の重み |
| `DEFAULT_DURATION_11` | 8分 | 11点マッチのデフォルト平均時間 |
| `DEFAULT_DURATION_15` | 12.5分 | 15点マッチのデフォルト平均時間 |
| `DEFAULT_DURATION_21` | 15分 | 21点マッチのデフォルト平均時間 |
| `MOVING_AVERAGE_SIZE` | 10試合 | 試合時間学習の移動平均窓 |
| `MIN_DURATION` | 3分 | 学習から除外する試合時間下限 |
| `MAX_DURATION` | 40分 | 学習から除外する試合時間上限 |
| ETA 上限 | 120分 | calculateTournamentETA の安全上限 |
