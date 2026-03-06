import type { Player, Gender, Division } from '@/types';

// ── ヘッダー正規化テーブル ─────────────────────────────────────────────────────
// キー: CSVに書かれうる表記（小文字）→ 値: 内部キー名
const HEADER_ALIASES: Record<string, string> = {
  // 氏名
  name: 'name', 氏名: 'name', 名前: 'name',
  // 性別
  gender: 'gender', 性別: 'gender',
  // 部門/レベル
  division: 'division', 部門: 'division', レベル: 'division', 級: 'division', 'div': 'division',
  // チーム
  team_id: 'team', team: 'team', チーム: 'team', チーム名: 'team',
  // 3人目（3-person pair 用オプション列）
  third_member: 'third_member', '3人目': 'third_member', '三人目': 'third_member',
  partner3: 'third_member', player3: 'third_member',
};

// ── CSVの1行をフィールド配列に分割（ダブルクォート対応） ─────────────────────
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // エスケープされた ""
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── ヘッダー行を内部キーに変換 ────────────────────────────────────────────────
function resolveHeader(raw: string): string {
  const trimmed = raw.trim();
  // まず小文字で照合、次に元の表記で照合
  return HEADER_ALIASES[trimmed.toLowerCase()] ?? HEADER_ALIASES[trimmed] ?? trimmed.toLowerCase();
}

// ── メイン解析関数 ────────────────────────────────────────────────────────────

/**
 * CSVテキストを解析してPlayerオブジェクトの配列に変換。
 * - CR+LF / CR 正規化済み
 * - ダブルクォートフィールド対応
 * - 日本語ヘッダー対応（氏名/性別/部門 など）
 * - `third_member`/`3人目` 列がある場合は追加 Player を生成
 */
export function parsePlayersCSV(csvText: string): {
  players: Omit<Player, 'id'>[];
  errors: string[];
} {
  const errors: string[] = [];
  const players: Omit<Player, 'id'>[] = [];

  // 改行コード正規化
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');

  if (lines.length === 0) {
    errors.push('CSVファイルが空です');
    return { players, errors };
  }

  // ヘッダー解析
  const headers = splitCSVLine(lines[0]).map(resolveHeader);

  // ヘッダー重複チェック（デバッグ補助）
  const seen = new Set<string>();
  headers.forEach((h) => {
    if (seen.has(h)) errors.push(`ヘッダーに重複があります: "${h}"`);
    seen.add(h);
  });

  // 必須カラムチェック
  const required = ['name', 'gender', 'division'] as const;
  const missing = required.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    errors.push(
      `必須カラムが見つかりません: ${missing.join(', ')}\n` +
      `（ヘッダー例: name,gender,division  または  氏名,性別,部門）\n` +
      `検出されたヘッダー: ${headers.join(', ')}`
    );
    return { players, errors };
  }

  const hasThirdMember = headers.includes('third_member');

  // データ行
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // 空行スキップ

    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    // メインプレイヤー
    try {
      players.push(parsePlayerRow(row, i + 1));
    } catch (e) {
      errors.push(`${i + 1}行目: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3人目（オプション）
    if (hasThirdMember && row['third_member']?.trim()) {
      try {
        const thirdRow = { ...row, name: row['third_member'].trim() };
        players.push(parsePlayerRow(thirdRow, i + 1, '3人目'));
      } catch (e) {
        errors.push(`${i + 1}行目(3人目): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { players, errors };
}

// ── 1行 → Player オブジェクト ─────────────────────────────────────────────────
function parsePlayerRow(
  row: Record<string, string>,
  lineNumber: number,
  label = '',
): Omit<Player, 'id'> {
  const nameSuffix = label ? `(${label})` : '';

  if (!row['name']?.trim()) {
    throw new Error(`名前${nameSuffix}が空です`);
  }

  const gender = normalizeGender(row['gender'] ?? '');
  if (!gender) {
    throw new Error(
      `無効な性別: "${row['gender']}" — male/female, M/F, 男/女 のいずれかを指定してください`
    );
  }

  const division = normalizeDivision(row['division'] ?? '');
  if (division === null) {
    throw new Error(
      `無効な部門: "${row['division']}" — 1/2 または 1部/2部 を指定してください`
    );
  }

  return {
    name: row['name'].trim(),
    gender,
    division,
    team_id: row['team']?.trim() ?? '',
    is_active: true,
  };
}

// ── 正規化ヘルパー ─────────────────────────────────────────────────────────────
function normalizeGender(v: string): Gender | null {
  const s = v.toLowerCase().trim();
  if (s === 'male' || s === 'm' || s === '男') return 'male';
  if (s === 'female' || s === 'f' || s === '女') return 'female';
  return null;
}

function normalizeDivision(v: string): Division | null {
  const s = v.trim();
  if (s === '1' || s === '1部') return 1;
  if (s === '2' || s === '2部') return 2;
  // カスタム部門（数値 1〜99）
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0 && n <= 99) return n;
  return null;
}

// ── エクスポート用 ─────────────────────────────────────────────────────────────
export function generatePlayersCSV(players: Player[]): string {
  const headers = ['name', 'gender', 'division', 'team_id'];
  const rows = players.map((p) => [
    p.name,
    p.gender === 'male' ? '男' : '女',
    String(p.division),
    p.team_id || '',
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function generateSampleCSV(): string {
  return `name,gender,division,team_id,third_member
山田太郎,男,1,team_a,田中次郎
佐藤花子,女,1,team_a,
鈴木一郎,男,2,team_b,
田中美咲,女,2,team_b,
高橋健太,男,1,team_c,伊藤さくら`;
}
