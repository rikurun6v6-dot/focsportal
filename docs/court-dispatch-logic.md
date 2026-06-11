# コート自動割り当てロジック 全貌

対象コード: `src/lib/dispatcher.ts`（割り当て本体）、`src/lib/matchScoring.ts`（優先スコア）、
`src/lib/firestore-helpers.ts`（休息記録 `updatePlayersRestTime` 等）。

最終更新: 2026-06-12（コート稼働優先化・部門バランス整理・決勝遊休回避・休息モデル明確化を反映）

---

## 0. 全体像

```
autoDispatchAll(campId)                      … 空きコートを順に処理するループ（エントリ）
  └─ 各空きコートごとに:
       dispatchToEmptyCourt(court, waiting, …) … 1コートに最適な1試合を選んで割り当て
```

- `autoDispatchAll` は AutoDispatchEngine（一定間隔）や結果入力後などから呼ばれる。
- 「高いスコアほど先に割り当てる」が基本。スコアは `matchScoring.calcMatchScore`。

---

## 1. autoDispatchAll（ループと前処理）

1. **空きコート抽出**: `is_active && !current_match_id && !manually_freed`。
2. **待機試合抽出**: `status === 'waiting'`。さらに `config.enabled_tournaments` で**種目を絶対ブロック**（無効種目は完全除外）。
3. **コート別の部優先（divisionPreference）を決定**: 性別グループ（男子/女子/中立）ごとにコート番号順で
   - 先頭コート → **1部**
   - 末尾コート → **2部**
   - 中間コート → **試合数の多い部（dominant）**
   これを `courtDivisionPreference` マップに格納し、各コートの割り当て時に渡す。
4. 空きコートを順に `dispatchToEmptyCourt` へ。割り当て成功したら:
   - その試合IDを `assignedMatchIds` に記録（同ループ内の二重割り当て防止）。
   - 待機リストから除外（splice）。
   - **団体戦**は同一試合を最大3面に同時割り当て（追加2面）。

---

## 2. dispatchToEmptyCourt（1コートの選定パイプライン）

上から順にフィルタ／選定する。

| 順 | 処理 | 説明 |
|---|---|---|
| 1 | enabled_tournaments 再フィルタ | 予約パス含む全経路で無効種目を排除 |
| 2 | **予約優先** | `reserved_court_id === court.id` かつ `available_at` 到来済みなら最優先で即割り当て |
| 3 | busy 集合の構築 | calling/playing の試合から「出場中の選手ID / チームID / 団体戦グループ」を収集 |
| 4 | **validMatches** | 両選手あり・busy でない・`available_at` 未到来でない・予約コート時間制約・finals_wait_mode を満たす試合 |
| 5 | **restFilteredMatches** | 全員休息完了（Tier1）の試合を優先。全員休息中ならフォールバックで validMatches を使う |
| 6 | **roundFilteredMatches** | グループごとに「今すぐ出せる試合の最小ラウンド」のみ許可（後述・コート稼働優先） |
| 7 | 性別ガード | コートの `preferred_gender` と逆性別の試合を除外（`manual_gender_unlock` 時のみ許可） |
| 8 | **決勝センターコート除外** | finals が優先コート待ちなら、非優先コートの候補から除外（遊休回避） |
| 9 | スコア計算＋選定 | `calcMatchScore` で採点し、性別一致(preferred)→中立(neutral) の順に最高スコアを選ぶ |

選ばれた試合を `status: 'calling'`、コートに `current_match_id` をセットし、Web Push を発火。

---

## 3. スコアリング（matchScoring.ts）

`calcMatchScore` はフェーズを自動判定して式を切り替える。

### フェーズ判定 `detectPhase`
- **preliminary_first**: 予選グループの第1巡目（`round===1` かつそのグループ消化0）
- **preliminary_mid**: 予選グループの中盤以降
- **knockout**: 決勝トーナメント（またはグループなし種目）

### Phase A（予選第1巡目）— リスト順絶対
```
score = (1000 - match_number) * 10
```
→ 作成順（match_number 昇順）を厳守。

### Phase B（予選中盤）`calcPreliminaryMidScore`
```
score = waitTime
      + divisionBonus          // 部門バランス（後述）
      + groupScore             // グループ平準化: (平均消化 - 自グループ消化) * group_penalty
      + consecutivePenalty     // 連戦回避: 直近 restMin*2 以内に試合した選手がいれば -200
      + categoryBoost          // AIアドバイザーの一時ブースト
```

### Phase C（決勝T）`calcKnockoutScore`
```
score = roundScore            // (MAX_ROUND - round + 1) * round_weight … 下位ラウンド優先（水平進行）
      + waitTime
      + divisionBonus
      + categoryBoost
      + matchOrderTiebreak     // 同ラウンド内は match_number 昇順
```

- `waitTime` = （現在 - 待機開始）分 × `wait_factor`。待機開始は「選手の最終試合終了時刻」優先、なければ作成時刻。
- 係数は `config` で調整可: `round_weight`(既定100) / `group_penalty`(既定100) / `wait_factor`(既定1.0) / `division_bonus_max`(既定50)。

---

## 4. 休息モデル（2概念）

| 概念 | フィールド | 設定箇所 | 使われ方 |
|---|---|---|---|
| 明示スケジュール | `match.available_at` | 手動休憩 `setMatchBreak` / 予約 | **ハードゲート**（未到来は validMatches で除外） |
| 自動の選手休息 | `player.last_match_finished_at` | 試合完了時 `updatePlayersRestTime` | 2段階で使用 |

`last_match_finished_at` の2段階:
- **Tier1（< defaultRestMinutes）**: `isPlayerResting` で除外（ソフト。全員休息中ならフォールバックで使う）
- **Tier2（< defaultRestMinutes×2）**: スコアで **-200点**（連戦回避。除外はしない）

> ※ `available_at`（明示）と `last_match_finished_at`（自動）は別物・役割分担。重複ではない。
> ※ 2026-06-12: `updatePlayersRestTime` が player5/6（3人組の3人目）を記録していなかったバグを修正。

---

## 5. 部門バランス（1部/2部の散らし）— 2方式を排他に

「綱引き」回避のため、次の2方式を**排他**で使う（2026-06-12整理）:

1. **コート別の部優先 `divisionPreference`**（autoDispatchAll が決定）が**ある**コート
   → その部を **+150** で優先するのみ。隣接ペナルティは適用しない。
2. **ない**コート（単発割り当て・部優先なしコート）
   → `getActiveCourtDivisions`（使用中全コートの部リスト）で隣接ペナルティ
     `-50/件`、同一部が全体の50%超で追加 `-100`。

> ※ 関数 `getActiveCourtDivisions` は旧 `getAdjacentCourtDivisions`。実態は「隣接」でなく全コート対象のため改名。
> ※ 2026-06-12: バッチ割り当て分が「Firestore再取得分」と二重計上されるバグを撤去（Firestore分のみ使用）。

---

## 6. ラウンドロック（コート稼働優先）

`roundFilteredMatches`（パイプライン順6）は、グループごとに「**今すぐ出せる試合（restFilteredMatches）**の最小ラウンド」だけを許可する。

- 2026-06-12変更: 基準を「全待機 `waitingMatches`」→「今すぐ出せる `restFilteredMatches`」に。
- 効果: 最小ラウンドの試合が他コートで試合中／休息中で出せない場合、**出せる次のラウンドを解放**してコートを空けない（水平進行よりコート稼働を優先）。
- 正しさ: 上位ラウンドの試合は選手が確定済みなので、先に走っても対戦の正しさは保たれる。
- グループキー `getGroupKey` = `type_division_phase_group`。予選グループ A/B/C は互いをブロックしない。knockout は group 空のため「種目×部」で1グループ。

---

## 7. 決勝センターコート（遊休回避）

`config.finals_wait_mode[`${type}_${division}`]` が有効なとき:
- 決勝戦（その部の最大ラウンド）は**優先コート（センター）** で行いたい。
- 優先コート番号は `getFinalsPreferredCourts`（面数に応じ算出。男子=前半ブロック、女子=後半ブロック、1部=ブロックのセンター、2部=その隣）。
- 2026-06-12変更: 優先コートが空いている間、**非優先コートでは決勝を「候補から除外」**（以前は `return null` でコートを遊ばせていた）。
  → 非優先コートは別の試合を取れる＝遊休回避。優先コートが埋まっていれば非優先コートでも決勝を出す（フォールバック）。

---

## 8. 団体戦（team_battle）

- **チーム単位ロック**: アクティブな団体戦の `team_id` を busy 扱い（同一チームの複数同時出場を防ぐ）。
- **グループ排他**: 同一 `camp_division_group` に進行中の対戦があれば、そのグループの他対戦は待機。
- **マルチコート**: 1つの団体戦を最大3面に同時割り当て（autoDispatchAll の追加2面ループ）。

---

## 9. 混合ダブルスのコート制限

`getMixedDoublesCourtRestriction`: 1部・2部の混合がどちらも残っている間は、
前半コート＝1部、後半コート＝2部に制限（違反は -1000 で事実上除外）。片方が終われば制限解除。

---

## 10. 既知の調整ポイント / 今後

- 係数（`round_weight` 等）の最適値は大会規模・人数で変わる。Admin の設定で調整可能。
- `finals_wait_mode` はデフォルト無効。決勝をセンターで揃えたい種目だけ有効化する想定。
- 診断: `diagnoseWaitingMatches` が「なぜ割り当てされないか」を理由付きで返す（disabled/busy/resting/round_locked/gender_mismatch）。

---

## 付録: 主要パラメータ（config）
| キー | 既定 | 意味 |
|---|---|---|
| `enabled_tournaments` | 全種目 | 進行を許可する種目（無効種目は絶対ブロック） |
| `round_weight` | 100 | ラウンド優先度係数（決勝T） |
| `group_penalty` | 100 | 予選グループ平準化係数 |
| `wait_factor` | 1.0 | 待機時間の重み |
| `division_bonus_max` | 50 | 部門バランスボーナス上限（進行差ベース） |
| `finals_wait_mode` | {} | 決勝センターコート待ちの有効/無効（種目×部ごと） |
| `temporary_category_boost` | — | AIアドバイザーの一時ブースト |
