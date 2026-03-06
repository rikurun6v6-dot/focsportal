'use client';

import { useEffect, useState, useRef } from 'react';
import { X, BookOpen, Search, Copy, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface UserGuideProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

// ワンクリックコピーボタン
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // セキュアコンテキスト外は無視
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors shrink-0"
      title="クリップボードにコピー"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'コピー済' : 'コピー'}
    </button>
  );
}

// .env キー名ブロック
function EnvBlock({ keyName }: { keyName: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-900 text-emerald-400 rounded-lg px-3 py-2 text-xs font-mono my-1">
      <span className="flex-1 truncate">{keyName}</span>
      <CopyButton value={keyName} />
    </div>
  );
}

// コマンド表示ブロック
function CmdBlock({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-900 text-yellow-300 rounded-lg px-3 py-2 text-xs font-mono my-1">
      <span className="flex-1 break-all">$ {cmd}</span>
      <CopyButton value={cmd} />
    </div>
  );
}

// URLブロック
function UrlBlock({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-900 text-sky-300 rounded-lg px-3 py-2 text-xs font-mono my-1">
      <span className="flex-1 break-all">{path}</span>
      <CopyButton value={path} />
    </div>
  );
}

interface Section {
  id: string;
  title: string;
  icon: string;
  keywords: string[];
  content: React.ReactNode;
}

/* eslint-disable react/no-unescaped-entities */
function buildAdminSections(): Section[] {
  return [
    // ─── 1. クイックスタート ───────────────────────────────────
    {
      id: 'quickstart',
      title: 'クイックスタート',
      icon: '🚀',
      keywords: ['初期設定', 'コート', '初回', 'スタート', '始め方', '手順', 'キャンプ', '合宿'],
      content: (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            初めて使う際の最短手順です。この順番通りに進めると確実に動かせます。
          </p>
          <ol className="space-y-3">
            {[
              ['キャンプ管理', '合宿を事前に作成しておく（名前・コート数・日程を設定）。これがないと何もできません。'],
              ['初期設定タブ', '「コートを初期化」でコートを作成。コート数は合宿設定の court_count に従います。'],
              ['選手タブ', 'CSVインポートまたは手動で選手を一括登録します。'],
              ['ペア・シードタブ', 'ダブルス種目のペアを組みます（ランダム / 手動 / ミックス）。'],
              ['初期設定タブ', '「トーナメント作成」で試合を自動生成します。種目・部門・形式を事前に設定してから実行。'],
              ['操作タブ', 'Auto-Dispatch をONにすると空きコートへ自動割り当てが始まります。'],
              ['コート結果タブ', '試合が終わるたびにスコアを入力します。'],
            ].map(([tab, desc], i) => (
              <li key={i} className="flex gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-xs">
                  {i + 1}
                </div>
                <div>
                  <span className="font-semibold text-slate-800 text-sm">「{tab}」</span>
                  <span className="text-slate-600 text-sm ml-1">— {desc}</span>
                </div>
              </li>
            ))}
          </ol>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">アーカイブモードについて</h4>
            <p className="text-sm text-slate-600">
              合宿のステータスが「アーカイブ済」になると、管理画面は<strong>閲覧専用モード</strong>に切り替わります。
              全ての編集ボタンが無効化され、過去大会のデータを誤って書き換えることを防ぎます。
              アーカイブの解除はFirebaseコンソールから直接 <code className="bg-slate-100 px-1 rounded text-xs">status</code> フィールドを変更してください。
            </p>
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
            <strong>注意：</strong> 合宿（キャンプ）が作成されていないとほぼ全ての機能が使えません。必ず最初に作成してください。
          </div>
        </div>
      ),
    },

    // ─── 2. CSVインポート ──────────────────────────────────────
    {
      id: 'csv',
      title: 'CSVインポート',
      icon: '📄',
      keywords: ['CSV', '選手', 'インポート', 'Shift-JIS', '文字コード', 'player5', 'player6', '列', 'カラム', '一括', '登録'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">文字コードは Shift-JIS で保存する</h4>
            <p className="text-sm text-slate-600">
              CSVファイルは <strong>Shift-JIS（CP932）</strong> で保存してください。
              UTF-8で保存すると日本語の氏名が文字化けします。
            </p>
            <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200 text-xs text-slate-600">
              <p><strong>Excelの場合：</strong>「名前を付けて保存」→ ファイル形式「CSV（コンマ区切り）」を選択するとShift-JISになります。</p>
              <p className="mt-1"><strong>メモ帳の場合：</strong>「名前を付けて保存」→ 文字コード「ANSI」を選択するとShift-JISになります。</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">対応カラム一覧</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">カラム名</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">説明</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">必須</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['name', '選手名（氏名）', '◎'],
                    ['furigana', 'ふりがな', ''],
                    ['grade', '学年（例: M2, B3, OB）', ''],
                    ['group', 'グループ・チーム名', ''],
                    ['division', '部門（men / women / mixed）', ''],
                    ['enabled', '出場可否（true / false）', ''],
                    ['player5_name', '3人ペアの3人目 氏名', ''],
                    ['player6_name', '4人ペアの4人目 氏名（拡張）', ''],
                  ].map(([col, desc, req]) => (
                    <tr key={String(col)} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-sky-700">{col}</td>
                      <td className="px-3 py-2 text-slate-600">{desc}</td>
                      <td className="px-3 py-2 text-center text-slate-700 font-bold">{req}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              1行目はヘッダー行として扱われます。列の順番は問いません。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">CSVサンプル（最小構成）</h4>
            <div className="bg-slate-900 text-emerald-400 rounded-lg px-3 py-3 text-xs font-mono space-y-0.5">
              <div>name,furigana,division,enabled</div>
              <div>山田 太郎,やまだたろう,men,true</div>
              <div>鈴木 花子,すずきはなこ,women,true</div>
              <div>田中 次郎,たなかじろう,men,false</div>
            </div>
          </div>
        </div>
      ),
    },

    // ─── 3. 3人ペア ───────────────────────────────────────────
    {
      id: 'triplet',
      title: '3人ペア対応',
      icon: '👥',
      keywords: ['3人', '三人', 'ペア', 'player5', 'player6', '3人組', 'トリオ', '人数合わせ', '奇数'],
      content: (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            参加人数の都合で3人1組になる場合の仕様です。システムは3人ペアを正式サポートしています。
          </p>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">登録方法（2通り）</h4>
            <div className="space-y-2">
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                <p className="font-semibold text-slate-800">① ペア・シードタブから手動登録</p>
                <p className="text-slate-600 text-xs mt-1">
                  「ペア作成」で2人を選択した後、「3人目を追加」ボタンで3人目を選択します。
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                <p className="font-semibold text-slate-800">② CSVで一括登録</p>
                <p className="text-slate-600 text-xs mt-1">
                  <code className="bg-slate-100 px-1 rounded">player5_name</code> 列に3人目の氏名を入力します。
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">データ構造（Firestore上の格納）</h4>
            <p className="text-sm text-slate-600">
              試合データでは 3人目は <code className="bg-slate-100 px-1 rounded text-xs">player5</code>（サイドA）または <code className="bg-slate-100 px-1 rounded text-xs">player6</code>（サイドB）フィールドに格納されます。
              表示は「A選手 / B選手 <span className="text-sky-600">+ C選手</span>」のように3名まとめて表示されます。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">通知は3人全員に届く</h4>
            <p className="text-sm text-slate-600">
              コート呼び出し時のプッシュ通知は <strong>3人全員</strong> の端末に送信されます。
              3人目（player5/player6）も通知登録済みであれば、全員のスマホに通知が届きます。
            </p>
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
            <strong>運営メモ：</strong> 3人ペアで試合中に誰が出るかはルール次第です。システム上は3人全員を「出場者」として扱い、スコア入力はペア単位で行います。
          </div>
        </div>
      ),
    },

    // ─── 4. ペア・シード設定 ──────────────────────────────────
    {
      id: 'pairing',
      title: 'ペア・シード設定',
      icon: '🎯',
      keywords: ['ペア', 'シード', 'ダブルス', 'ミックス', 'ランダム', '手動', '配置', 'スワップ', '入れ替え'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">ペア作成の3つの方法</h4>
            <div className="space-y-2">
              {[
                ['ランダム', '同性・同部門内でランダムにペアを自動生成します。'],
                ['ミックス自動', '男女1名ずつ自動で組み合わせます。余った場合は同性ペアを作ります。'],
                ['手動', 'ドロップダウンで1ペアずつ指定します。3人ペアも手動から作成できます。'],
              ].map(([method, desc]) => (
                <div key={String(method)} className="p-3 rounded-lg border border-slate-200 text-sm">
                  <span className="font-semibold text-sky-700">{method}：</span>
                  <span className="text-slate-600 ml-1">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">シード設定の仕様</h4>
            <p className="text-sm text-slate-600">
              シードを設定すると<strong>標準的な種付け配置</strong>が適用されます。
              第1シードと第2シードは決勝まで当たらないよう対角に配置されます。
              第3・4シードも準決勝まで当たらない位置に入ります。
              シード未設定のペアはランダム配置です。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">ブラケット内の手動スワップ</h4>
            <p className="text-sm text-slate-600">
              「トーナメント表」タブで<strong>編集モードをON</strong>にすると、
              ブラケットのスロットをクリックして選手を入れ替えられます。
              2つのスロットを順番にクリックするとスワップが確定します（確認ダイアログあり）。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 5. トーナメント生成 ──────────────────────────────────
    {
      id: 'tournament',
      title: 'トーナメント生成',
      icon: '🏆',
      keywords: ['トーナメント', '生成', 'ブラケット', 'グループ', '予選', '本戦', 'knockout', 'preliminary', 'BYE', '不戦勝', '種目', '部門'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">2つの生成モード</h4>
            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-sky-200 bg-sky-50">
                <p className="font-semibold text-sm text-sky-900">シンプルブラケット</p>
                <ul className="mt-2 space-y-1 text-xs text-sky-800">
                  <li>• 全員でいきなりトーナメント戦</li>
                  <li>• BYEスロットは生成時に次ラウンドへ自動進出（即時確定）</li>
                  <li>• 少人数向け（〜16名が目安）</li>
                  <li>• 内部: <code className="bg-sky-100 px-1 rounded">next_match_id</code> でラウンド間を接続</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-purple-200 bg-purple-50">
                <p className="font-semibold text-sm text-purple-900">グループ予選 + 本戦ブラケット</p>
                <ul className="mt-2 space-y-1 text-xs text-purple-800">
                  <li>• まず予選リーグ（<code className="bg-purple-100 px-1 rounded">phase: preliminary</code>）</li>
                  <li>• 予選上位者が本戦（<code className="bg-purple-100 px-1 rounded">phase: knockout</code>）に進出</li>
                  <li>• BYEは <code className="bg-purple-100 px-1 rounded">is_walkover: true</code> で管理</li>
                  <li>• BYE伝播が正しく動かない場合は「安全タブ」で修復</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">種目の削除・再生成</h4>
            <p className="text-sm text-slate-600">
              生成後にやり直したい場合は「安全」タブ → 「種目削除」から対象種目・部門の試合を全削除してから再生成できます。
              <strong>選手データは削除されません。</strong>
            </p>
          </div>
        </div>
      ),
    },

    // ─── 6. 予選順位・グループランキング ─────────────────────
    {
      id: 'groupranking',
      title: '予選順位・グループランキング',
      icon: '📊',
      keywords: ['予選', 'グループ', 'ランキング', '順位', '勝点', '同点', '手動', '決定', '本戦'],
      content: (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            「予選順位」タブはグループ予選が設定されている種目でのみ有効です。
            予選リーグの成績を集計し、本戦進出者を決定します。
          </p>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">自動計算ロジック</h4>
            <ol className="space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
              <li>勝点（勝利: 2点、引き分け: 1点、敗北: 0点）</li>
              <li>得失点差（得点 − 失点）</li>
              <li>直接対決の結果</li>
              <li>上記で決まらない場合は手動介入が必要</li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">手動順位調整</h4>
            <p className="text-sm text-slate-600">
              同点などで自動計算が確定できない場合（「手動介入が必要」と表示されるとき）、
              ドロップダウンで順位を手動指定できます。
              指定した順位は本戦ブラケットへの進出判定に使われます。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">本戦への進出確定</h4>
            <p className="text-sm text-slate-600">
              順位が確定したら「本戦進出を確定」ボタンを押します。
              予選上位者の選手IDが本戦の対応スロットに書き込まれます。
              確定後は安全タブのUndoまたは欠場処理でのみ修正できます。
            </p>
          </div>

          <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs text-sky-800">
            種目・部門のドロップダウンで切り替えながら、グループAとグループBをそれぞれ確定してください。
          </div>
        </div>
      ),
    },

    // ─── 7. Auto-Dispatch・操作タブ ───────────────────────────
    {
      id: 'dispatch',
      title: 'Auto-Dispatch・操作タブ',
      icon: '⚡',
      keywords: ['Auto-Dispatch', '自動', '割当', 'コート', '運営', '進行制御', '順次', '休憩', '呼び出し', '強制割当', '手動', '3位', '決勝', '待機', '休息時間'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Auto-Dispatch のON/OFF</h4>
            <p className="text-sm text-slate-600">
              空きコートが発生すると次の試合を自動的に割り当てるエンジンです。
              「操作」タブの <strong>Auto-Dispatch スイッチをON</strong> にするだけで自動運営が始まります。
              OFFにすると新規割り当てが停止し、進行中の試合はそのまま続きます。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">手動割り当て（Manual Trigger）</h4>
            <p className="text-sm text-slate-600">
              Auto-DispatchがOFFのまま、「今すぐ実行」ボタンで1回だけ即座に割り当てを実行できます。
              「待機中の試合がなく自動割り当てができない」状況の確認にも使えます。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">種目完遂型・順次進行モード</h4>
            <p className="text-sm text-slate-600">
              ONにすると、現在の種目が<strong>残り1試合（決勝戦）以下</strong>になるまで次の種目を開始しません。
              「男子→女子→混合」のように種目を完全に1つずつ消化したい場合に使います。
            </p>
            <div className="mt-1 text-xs text-slate-500">
              ※ 男子・女子グループは互いに独立して順次進行します（男子が決勝まで終わるまで女子が止まるわけではない）。
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">デフォルト休息時間</h4>
            <p className="text-sm text-slate-600">
              試合終了後、同じ選手が次の試合に呼び出されるまでの<strong>最低休息時間</strong>を設定します。
              選択肢: 0分（即時）/ 5分 / 10分 / 15分 / 20分。
              体力面を考慮して適切に設定してください。合宿序盤は0〜5分、後半は10〜15分が目安です。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">種目ごとの進行制御</h4>
            <p className="text-sm text-slate-600">
              「種目ごとの進行制御」カードで、特定の種目（例：男子ダブルス）だけをAuto-Dispatch対象から外せます。
              一時停止したい種目のトグルをOFFにするだけです。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">3位決定戦の作成</h4>
            <p className="text-sm text-slate-600">
              準決勝が終わった後、「3位決定戦」カードから種目・部門ごとに3位決定戦を手動作成できます。
              作成された試合はAuto-Dispatchの対象になります。
              トーナメント表（ブラケット）には表示されませんが、コート結果タブで確認できます。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">決勝戦の待機モード（Finals Wait Mode）</h4>
            <p className="text-sm text-slate-600">
              「決勝戦の開始タイミング」カードで種目・部門ごとに<strong>待機モード</strong>をONにできます。
              待機モードがONの場合、種目内の全試合が完了するまで決勝戦はAuto-Dispatch対象になりません。
              会場全員が見守れるよう、センターコートで決勝戦を行いたいときに使います。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 8. コート結果入力 ────────────────────────────────────
    {
      id: 'results',
      title: 'コート結果入力',
      icon: '📋',
      keywords: ['結果', 'コート', 'スコア', 'WO', '不戦勝', '入力', '取消', 'Undo', '編集', '結果一覧'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">コート結果タブ（進行中の試合）</h4>
            <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
              <li>「コート結果」タブを開く</li>
              <li>進行中のコートカードを選択</li>
              <li>スコア（例: 21-15）を入力して勝者を選択</li>
              <li>「確定」で次ラウンドに自動進出</li>
            </ol>
            <p className="text-xs text-slate-500 mt-2">
              不戦勝の場合は「WO（不戦勝）」ボタンを使います。スコア入力は不要です。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">結果一覧タブ（完了試合の管理）</h4>
            <p className="text-sm text-slate-600">
              「結果一覧」タブでは進行中・完了済みの全試合をリスト形式で表示します。
              各試合に「取消」ボタンがあり、押すとその試合の<strong>スコアと次ラウンドへの進出情報</strong>をリセットします。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Undoの注意点</h4>
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-xs text-orange-800">
              次ラウンドがすでに完了している場合は<strong>連鎖的なUndoが必要</strong>です。
              必ず<strong>最終ラウンドから遡る順番</strong>でUndoしてください。
              システムは自動連鎖Undoを行いません。
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">空きコートへの強制割当</h4>
            <p className="text-sm text-slate-600">
              コート結果タブで空きコートが表示されているとき、
              「待機中の試合から割り当て」から手動で試合を選んでコートに割り当てられます。
              Auto-Dispatchが「blocked」状態（全試合が休憩中）のときに特に有用です。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 9. 安全タブの極意 ───────────────────────────────────
    {
      id: 'safety',
      title: '安全タブの極意',
      icon: '🛡️',
      keywords: ['安全', '欠場', 'BYE', '取消', 'Undo', '修復', '削除', '幽霊', 'walkover', 'ブラケット', '欠場処理', '種目削除', 'subtitle', 'サブタイトル', 'クリーンアップ', 'reset', 'リセット', 'キャッシュ'],
      content: (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            「安全」タブは誤操作の修復・緊急対応専用です。基本的に触らないでください。
          </p>

          <div>
            <h4 className="font-semibold text-slate-800 mb-3">機能一覧と使い分け</h4>
            <div className="space-y-3">
              <div className="p-4 rounded-lg border-l-4 border-slate-400 bg-slate-50">
                <p className="font-semibold text-sm text-slate-800">① Undo（試合結果の取り消し）</p>
                <p className="text-xs text-slate-600 mt-1">
                  <strong>使うとき：</strong> 結果の入力ミスに気付いたとき（結果一覧タブの「取消」でも同じ操作）<br />
                  <strong>操作：</strong> match_id を入力して「取り消す」。スコアと次ラウンドへの進出情報がリセットされます。
                </p>
              </div>

              <div className="p-4 rounded-lg border-l-4 border-amber-400 bg-amber-50">
                <p className="font-semibold text-sm text-amber-800">② Walkover（不戦勝の強制設定）</p>
                <p className="text-xs text-amber-700 mt-1">
                  <strong>使うとき：</strong> 通常のWOボタンでは対応できない状況（試合が割り当て前の状態など）<br />
                  <strong>操作：</strong> match_id と勝者サイド（1 または 2）を指定して実行。対象試合を強制的に完了状態にします。
                </p>
              </div>

              <div className="p-4 rounded-lg border-l-4 border-sky-400 bg-sky-50">
                <p className="font-semibold text-sm text-sky-800">③ Subtitle（試合カードへの補足情報追加）</p>
                <p className="text-xs text-sky-700 mt-1">
                  <strong>使うとき：</strong> 試合に「センターコートで実施」「ルール変更あり」などの注記を付けたいとき<br />
                  <strong>操作：</strong> match_id とテキストを入力して設定。選手の試合カードに小さく表示されます。
                </p>
              </div>

              <div className="p-4 rounded-lg border-l-4 border-red-400 bg-red-50">
                <p className="font-semibold text-sm text-red-800">④ 欠場処理（BYE置換）</p>
                <p className="text-xs text-red-700 mt-1">
                  <strong>使うとき：</strong> 試合途中でペアが怪我・体調不良などで欠場する場合<br />
                  <strong>操作：</strong> match_id と position（1 = 上側、2 = 下側）を指定して実行。欠場スロットが空になり、相手が不戦勝で次ラウンドに進出します。
                </p>
              </div>

              <div className="p-4 rounded-lg border-l-4 border-orange-400 bg-orange-50">
                <p className="font-semibold text-sm text-orange-800">⑤ ブラケット修復（幽霊進出クリーンアップ）</p>
                <p className="text-xs text-orange-700 mt-1">
                  <strong>使うとき：</strong> BYE伝播が正しく動かず「選手なしで次ラウンドに進出してしまった」状態<br />
                  <strong>操作：</strong> 種目・部門を指定して「クリーンアップ」を実行。次ラウンドへの誤った参照を一括削除します。グループ予選→本戦移行後に起きやすい問題です。
                </p>
              </div>

              <div className="p-4 rounded-lg border-l-4 border-slate-400 bg-slate-50">
                <p className="font-semibold text-sm text-slate-800">⑥ 種目削除</p>
                <p className="text-xs text-slate-600 mt-1">
                  <strong>使うとき：</strong> トーナメントの組み直しが必要な場合<br />
                  <strong>操作：</strong> 種目（例：男子ダブルス）と部門を選択して全試合を一括削除。選手データは削除されません。
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Hard Reset（全データ削除）</h4>
            <div className="p-3 bg-red-50 rounded-lg border border-red-300 text-xs text-red-800">
              <strong>全ての選手・試合・チーム・トーナメント設定を完全に削除して初期状態に戻します。</strong><br />
              この操作は絶対に取り消せません。テスト後のクリーンアップや合宿終了後の初期化に使います。
              実行前に必ずリクに確認してください。
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">キャッシュクリア（デバッグ）</h4>
            <p className="text-sm text-slate-600">
              オフラインキャッシュ（IndexedDB）をクリアしてページをリロードします。
              「Primary Lease」エラーや古いデータが表示される場合に実行してください。
              データ自体はFirestoreに残っているため消えません。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Undoの影響範囲（重要）</h4>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
              <p>次ラウンドが完了している場合は<strong>連鎖的なUndoが必要</strong>です：</p>
              <p className="mt-1 font-mono text-xs bg-slate-100 p-2 rounded">
                決勝 → Undo → 準決勝 → Undo → 準々決勝 → Undo ...（遡る順番）
              </p>
              <p className="mt-2 text-orange-700">システムは自動連鎖Undoを行いません。必ず手動で順番に実行してください。</p>
            </div>
          </div>
        </div>
      ),
    },

    // ─── 10. メッセージ機能 ───────────────────────────────────
    {
      id: 'messages',
      title: 'メッセージ機能',
      icon: '💬',
      keywords: ['メッセージ', 'チャット', '送信', '一斉', '全体', '個別', '受信', '返信', 'broadcast'],
      content: (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            「メッセージ」タブから運営→選手、選手→運営の双方向通信ができます。
          </p>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">全体一斉送信（Broadcast）</h4>
            <p className="text-sm text-slate-600">
              「全体」モードで入力したメッセージは <strong>全選手の /user 画面</strong> にリアルタイムで届きます。
              「お昼休憩は12:00〜13:00です」などの全体アナウンスに使います。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">個別送信（Individual）</h4>
            <p className="text-sm text-slate-600">
              「個別」モードで送信先の選手を選択するとその選手のみにメッセージが届きます。
              特定の選手へのルール確認や連絡に使います。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">選手からのメッセージ受信・返信</h4>
            <p className="text-sm text-slate-600">
              選手が /user 画面でメッセージを送ると「受信」タブに届きます。
              受信一覧から選手を選んで返信できます。返信は該当選手のみに届きます。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">チャット機能のON/OFF</h4>
            <p className="text-sm text-slate-600">
              設定で選手側からのメッセージ送信機能をON/OFFできます。
              OFFにすると選手は受信のみ可能になります（大会の集中度を上げたい場合などに）。
            </p>
          </div>

          <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs text-sky-800">
            メッセージは Firestore にリアルタイム保存されます。送信済みのメッセージは削除できません（Firebaseコンソールで直接削除は可能）。
          </div>
        </div>
      ),
    },

    // ─── 11. 通知機能 ────────────────────────────────────────
    {
      id: 'notifications',
      title: '通知機能',
      icon: '🔔',
      keywords: ['通知', 'プッシュ', 'Push', 'ベル', 'VAPID', '環境変数', '.env', 'iOS', 'PWA', 'sw.js', 'バックグラウンド', 'サービスアカウント'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">通知の2種類</h4>
            <div className="space-y-2">
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                <p className="font-semibold text-slate-800">フォアグラウンド通知（画面内オーバーレイ）</p>
                <p className="text-xs text-slate-600 mt-1">
                  選手が /user 画面を開いているとき、試合呼び出しでベルが鳴り画面上にオーバーレイが表示されます。
                  スマホが振動します。設定不要で自動で動作します。
                </p>
              </div>
              <div className="p-3 rounded-lg border border-sky-200 bg-sky-50 text-sm">
                <p className="font-semibold text-sky-800">バックグラウンド通知（Web Push）</p>
                <p className="text-xs text-sky-700 mt-1">
                  ブラウザを閉じていてもOSレベルで通知が届きます。
                  選手は /user 画面でベルアイコンをONにしておく必要があります。
                  サーバー側でVAPIDキーとサービスアカウントの設定が必要です。
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">必要な環境変数（.env.local）</h4>
            <p className="text-xs text-slate-500 mb-2">以下のキー名をそのままコピーして .env.local に追記してください。</p>
            <EnvBlock keyName="NEXT_PUBLIC_VAPID_PUBLIC_KEY" />
            <EnvBlock keyName="VAPID_PRIVATE_KEY" />
            <EnvBlock keyName="VAPID_SUBJECT" />
            <EnvBlock keyName="FIREBASE_SERVICE_ACCOUNT_JSON" />
            <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200 text-xs text-slate-600">
              <p><strong>VAPIDキーの生成：</strong></p>
              <CmdBlock cmd="npx web-push generate-vapid-keys" />
              <p className="mt-1"><strong>サービスアカウント：</strong> Firebaseコンソール → プロジェクト設定 → サービスアカウント → 新しい秘密鍵の生成</p>
              <p className="mt-1">取得したJSONファイルの中身をそのまま <code className="bg-slate-100 px-1 rounded">FIREBASE_SERVICE_ACCOUNT_JSON</code> の値にします（1行に圧縮）。</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">iOSの制約</h4>
            <p className="text-sm text-slate-600">
              iOSでのWeb PushはPWA（ホーム画面に追加）としてインストールした場合のみ有効です。
              Safariのブラウザタブ上では通知が届きません。
            </p>
            <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800">
              <strong>選手への案内手順：</strong> SafariでURLを開く → 共有ボタン（四角から矢印が出てるアイコン）→「ホーム画面に追加」→ そこから開いてベルをONにする
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">既読選手の自動クリーンアップ</h4>
            <p className="text-sm text-slate-600">
              プッシュ通知の送信先（subscriptions）のうち、有効期限切れ（HTTP 410 Gone）のものはサーバーが自動的にFirestoreから削除します。
              手動でのクリーンアップは不要です。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 12. AIアドバイザー（OperationalAdvisor） ────────────
    {
      id: 'advisor',
      title: 'AIアドバイザー',
      icon: '🧠',
      keywords: ['AI', 'アドバイザー', '渋滞', '稼働率', 'ボトルネック', '提案', 'advisor', '分析'],
      content: (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            管理画面ヘッダー右上の脳アイコンボタンが「OperationalAdvisor（AI運営アドバイザー）」です。
            60秒ごとに自動でコートの稼働率とボトルネックを分析し、アドバイスを表示します。
          </p>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">ステータス表示</h4>
            <div className="space-y-2">
              {[
                ['bg-emerald-500', '良好', 'コート稼働率 70% 以上。問題なし。'],
                ['bg-slate-400', '通常運転', '稼働率 50〜70%。大きな問題なし。'],
                ['bg-blue-500', '稼働率低下', '稼働率 50% 未満。試合割り当てを見直すと改善できる可能性あり。'],
                ['bg-amber-500', '渋滞検知', '特定種目にボトルネックが発生。「提案を適用」で優先割り当てを30分間有効化できる。'],
              ].map(([color, label, desc]) => (
                <div key={label} className="flex items-start gap-2 text-xs">
                  <div className={`shrink-0 w-3 h-3 rounded-full mt-0.5 ${color}`} />
                  <div>
                    <span className="font-semibold text-slate-700">{label}：</span>
                    <span className="text-slate-600 ml-1">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">「提案を適用」ボタン</h4>
            <p className="text-sm text-slate-600">
              渋滞検知状態で「提案を適用」を押すと、ボトルネックになっている種目のDispatch優先度が
              <strong>30分間だけ上昇</strong>します。
              効果が出なければ手動で種目制御を調整してください。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 13. プレビュー・掲示板 ──────────────────────────────
    {
      id: 'preview',
      title: 'プレビュー・掲示板',
      icon: '📺',
      keywords: ['プレビュー', '掲示板', 'iPad', 'URL', 'campId', 'スクロール', 'オーバーレイ', '投影', '表示', 'display', 'エクスポート'],
      content: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">iPad投影用URL（会場掲示）</h4>
            <p className="text-sm text-slate-600 mb-2">
              <code className="bg-slate-100 px-1 rounded text-xs">campId</code> パラメータを付けると特定の合宿データを自動ロードします。
            </p>
            <UrlBlock path="/display?campId=（合宿ID）" />
            <p className="text-xs text-slate-500 mt-1">
              合宿IDはFirebaseコンソール → Firestore → camps コレクションのドキュメントIDです。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">参加者ビューURL</h4>
            <UrlBlock path="/user" />
            <p className="text-xs text-slate-500 mt-1">
              管理画面ヘッダーの「参加者ビュー」ボタンからも開けます。選手はここから自分の試合を確認します。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">自動スクロールの仕様</h4>
            <p className="text-sm text-slate-600">
              掲示板（/display）は試合が更新されるたびに自動スクロールします。
              一定時間操作がなければ先頭に戻ります。
              iPadを置いたまま放置しても問題ありません。充電しながら常時表示が推奨です。
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">呼び出し時のオーバーレイ通知</h4>
            <p className="text-sm text-slate-600">
              試合がコートに割り当てられると、掲示板画面にフルスクリーンのオーバーレイが表示されます。
            </p>
            <div className="mt-2 p-3 bg-slate-900 rounded-lg text-center text-white text-sm font-bold">
              ○○ペア vs △△ペア<br />
              <span className="text-yellow-300">→ コート 3 へお越しください</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">数秒後に自動消去されます。</p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">トーナメント表のエクスポート</h4>
            <p className="text-sm text-slate-600">
              「トーナメント表」タブの「エクスポート」ボタンでブラケットを画像として保存できます。
              画面外（横スクロールが必要な箇所も含む）まで全て収録した完全な画像が出力されます。印刷・配布用に使えます。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 14. 応用タブ（AdvancedAnalytics） ───────────────────
    {
      id: 'advanced',
      title: '応用タブ（Dispatcher分析）',
      icon: '🔬',
      keywords: ['応用', 'advanced', 'dispatcher', '分析', 'スコア', 'ボトルネック', 'パスワード', '可視化', 'デバッグ'],
      content: (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            「応用」タブはDispatcherの内部スコアリングをリアルタイムで可視化するデバッグ用ツールです。
            開発者・上級スタッフ向けです。
          </p>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">アクセス方法</h4>
            <p className="text-sm text-slate-600">
              「応用」タブを開くとパスワードを求められます。
            </p>
            <div className="flex items-center gap-2 bg-slate-900 text-yellow-300 rounded-lg px-3 py-2 text-xs font-mono my-1">
              <span className="flex-1">パスワードは開発者が管理しています。</span>
              <CopyButton value="1203" />
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">表示内容</h4>
            <ul className="space-y-1.5 text-sm text-slate-700">
              <li>• 各試合のDispatcherスコア（待機時間・ラウンド係数・部門ボーナスなど）</li>
              <li>• blocked状態の試合とブロック理由</li>
              <li>• 部門間の進行バランス（div1 vs div2 の完了数・進行率）</li>
              <li>• コートの稼働率と現在の優先種目</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">使い方のヒント</h4>
            <p className="text-sm text-slate-600">
              「なぜこの試合が割り当てられないのか」を調べるときに使います。
              スコアが高いのにblockedになっている場合は休憩中（available_at が未来）か、
              選手が別の試合に出場中かを確認してください。
            </p>
          </div>
        </div>
      ),
    },

    // ─── 15. トラブルシューティング ──────────────────────────
    {
      id: 'troubleshoot',
      title: 'トラブルシューティング',
      icon: '🔧',
      keywords: ['エラー', 'トラブル', 'オフライン', 'リセット', 'バグ', '壊れた', '動かない', '文字化け', '通知', '届かない', 'Primary Lease'],
      content: (
        <div className="space-y-3">
          {[
            {
              q: 'Auto-Dispatchが動かない',
              a: '①「操作」タブで種目制御が全停止していないか確認。②「コート結果」タブで「blocked match」警告が出ていれば強制割当で解消。③全試合が「休憩中（available_at設定済み）」状態で時間待ちの場合もあります。「応用」タブでスコアを確認するとブロック理由がわかります。',
            },
            {
              q: 'BYEがブラケットに正しく伝播していない',
              a: '安全タブの「ブラケット修復（幽霊進出クリーンアップ）」で手動修正してください。グループ予選→本戦移行後に起きやすい問題です。',
            },
            {
              q: 'CSVインポートで日本語が文字化けする',
              a: 'ファイルをShift-JIS（CP932）で保存してください。Excelなら「CSV（コンマ区切り）」、メモ帳なら文字コード「ANSI」で保存します。UTF-8で保存すると文字化けします。',
            },
            {
              q: '選手にプッシュ通知が届かない',
              a: '①選手が /user 画面でベルアイコンをONにしているか確認。②iOSはPWAとしてホーム画面からアクセスしているか確認（Safariブラウザタブでは届かない）。③.env.localのVAPIDキーとサービスアカウントが正しく設定されているか確認。',
            },
            {
              q: '画面が「オフライン」のまま戻らない',
              a: 'ページをリロードしてください。改善しない場合は安全タブ → 「キャッシュをクリア」を試してください。「Primary Lease」エラーが出ている場合も同様です。',
            },
            {
              q: '予選順位が自動確定できない（同点）',
              a: '「予選順位」タブで対象グループの同点ペアの順位を手動で指定してください。勝点→得失点差→直接対決でも決まらない場合は「手動介入が必要」と表示されます。',
            },
            {
              q: 'トーナメント表のエクスポートが途切れる',
              a: '「トーナメント表」タブで対象の種目・部門を選択した状態でエクスポートしてください。ブラウザの拡張機能がスクロールをブロックしている場合は無効化してみてください。',
            },
            {
              q: 'アーカイブ済み合宿を編集したい',
              a: 'Firebaseコンソール → Firestore → camps → 該当ドキュメント → status フィールドを "active" に変更してください。管理画面からの変更はできません。',
            },
          ].map(({ q, a }) => (
            <div key={q} className="p-3 rounded-lg border border-slate-200">
              <p className="font-semibold text-sm text-slate-800 mb-1.5">Q: {q}</p>
              <p className="text-xs text-slate-600 leading-relaxed">A: {a}</p>
            </div>
          ))}
          <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs text-sky-800">
            解決しない場合は <strong>開発者（4期）</strong> に連絡してください。
            Firestoreのデータを直接確認する場合は Firebase コンソール → Firestore Database を使います。
          </div>
        </div>
      ),
    },
  ];
}

export default function UserGuide({ isOpen, onClose, isAdmin = false }: UserGuideProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // ESCキーで閉じる + bodyスクロール制御
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // モーダルが開くたびに検索をリセット
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setActiveSection('');
    }
  }, [isOpen]);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el && contentRef.current) {
      const containerTop = contentRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      contentRef.current.scrollTop += elTop - containerTop - 16;
      setActiveSection(id);
    }
  };

  if (!isOpen) return null;

  const adminSections = buildAdminSections();

  // 検索フィルタリング
  const q = searchQuery.trim().toLowerCase();
  const filteredSections = q
    ? adminSections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.toLowerCase().includes(q))
    )
    : adminSections;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3">
      {/* 背景オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* ダイアログ本体 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">

        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <BookOpen className="w-6 h-6 text-sky-500 shrink-0" />
          <div className="shrink-0">
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              Foc&apos;s Portal 詳細マニュアル
            </h2>
            <p className="text-xs text-slate-500">
              {isAdmin ? '管理者・スタッフ向け' : '参加者向け'}
            </p>
          </div>

          {/* 検索バー（管理者のみ） */}
          {isAdmin && (
            <div className="relative flex-1 max-w-sm mx-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="例: 3人 / CSV / 安全 / 通知..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          )}

          <button
            onClick={onClose}
            className="ml-auto text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ボディ */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {isAdmin ? (
            <>
              {/* 左サイドバー（目次） */}
              <aside className="w-44 shrink-0 border-r border-slate-100 overflow-y-auto py-2 bg-slate-50/50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 pt-1 pb-2">
                  目次
                </p>
                <nav className="space-y-0.5 px-2">
                  {filteredSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full text-left px-2 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${activeSection === section.id
                        ? 'bg-sky-100 text-sky-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                    >
                      <span className="shrink-0 text-sm leading-none">{section.icon}</span>
                      <span className="leading-tight">{section.title}</span>
                    </button>
                  ))}
                  {filteredSections.length === 0 && (
                    <p className="text-xs text-slate-400 px-2 py-4 text-center">
                      該当なし
                    </p>
                  )}
                </nav>

                {/* 検索ヒット数 */}
                {q && filteredSections.length > 0 && (
                  <p className="text-xs text-slate-400 px-3 pt-3">
                    {filteredSections.length} 件ヒット
                  </p>
                )}
              </aside>

              {/* メインコンテンツ */}
              <div ref={contentRef} className="flex-1 overflow-y-auto py-5 px-6 space-y-10">
                {filteredSections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                    <Search className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">「{searchQuery}」に一致する項目がありません</p>
                    <p className="text-xs mt-1">別のキーワードを試してください</p>
                  </div>
                ) : (
                  filteredSections.map((section) => (
                    <section
                      key={section.id}
                      id={section.id}
                      ref={(el) => { sectionRefs.current[section.id] = el; }}
                    >
                      <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200 flex items-center gap-2">
                        <span className="text-xl">{section.icon}</span>
                        {section.title}
                      </h3>
                      {section.content}
                    </section>
                  ))
                )}
                {/* 末尾スペース */}
                <div className="h-8" />
              </div>
            </>
          ) : (
            // 参加者向けガイド（シンプル版）
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {[
                {
                  num: 1,
                  title: '自分の試合を確認する',
                  items: [
                    '「マイ試合」タブで自分の全試合を確認できます',
                    '次の試合が赤枠でハイライト表示されます',
                    '試合のステータス（待機中 / 呼び出し中 / 完了）を確認してください',
                  ],
                },
                {
                  num: 2,
                  title: 'コート状況を確認する',
                  items: [
                    '「コート状況」タブで各コートの試合をリアルタイム確認',
                    '自分の試合がどのコートに割り当てられたか確認できます',
                    '「呼び出し中」になったらすぐにコートへ向かってください',
                  ],
                },
                {
                  num: 3,
                  title: 'トーナメント表で全体を見る',
                  items: [
                    '「トーナメント表」タブで大会全体の進行状況を確認',
                    '自分の試合が強調表示されます',
                    '勝ち進んだ場合の次の対戦相手を事前に確認できます',
                  ],
                },
                {
                  num: 4,
                  title: '通知を有効にする（推奨）',
                  items: [
                    '画面上部のベルアイコンをタップして通知をONにしてください',
                    '「呼び出し中」になるとスマホに通知が届きます',
                    'iOSの場合はホーム画面に追加（PWAインストール）してからONにしてください',
                  ],
                },
              ].map(({ num, title, items }) => (
                <div key={num} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
                    {num}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      {items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
              <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 text-sm text-sky-800">
                <strong>ヒント：</strong> 画面は自動更新されます。リロード不要です。困ったときはスタッフに声をかけてください。
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 shrink-0">
          <p className="text-xs text-slate-400">
            ESCキーまたは背景クリックで閉じます
          </p>
          <Button
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-700 text-white px-6"
          >
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}
