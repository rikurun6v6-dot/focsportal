import type { Player, PlayerCSVRow, Gender, Division } from '@/types';

/**
 * CSVテキストを解析してPlayerオブジェクトの配列に変換
 */
export function parsePlayersCSV(csvText: string): { 
  players: Omit<Player, 'id'>[]; 
  errors: string[];
} {
  const errors: string[] = [];
  const players: Omit<Player, 'id'>[] = [];
  
  // 改行で分割
  const lines = csvText.trim().split('\n');
  
  if (lines.length === 0) {
    errors.push('CSVファイルが空です');
    return { players, errors };
  }
  
  // ヘッダー行を解析
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  // 必須カラムのチェック
  const requiredColumns = ['name', 'gender', 'division'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    errors.push(`必須カラムが不足: ${missingColumns.join(', ')}`);
    return { players, errors };
  }
  
  // データ行を解析
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // 空行をスキップ
    
    const values = line.split(',').map(v => v.trim());
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    try {
      const player = parsePlayerRow(row, i + 1);
      players.push(player);
    } catch (error) {
      errors.push(`${i + 1}行目: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return { players, errors };
}

/**
 * CSV行データをPlayerオブジェクトに変換
 */
function parsePlayerRow(row: any, lineNumber: number): Omit<Player, 'id'> {
  // 名前のバリデーション
  if (!row.name || row.name.trim() === '') {
    throw new Error('名前が空です');
  }
  
  // 性別の変換と検証
  const gender = normalizeGender(row.gender);
  if (!gender) {
    throw new Error(`無効な性別: ${row.gender} (male/female, M/F, 男/女 のいずれかを使用)`);
  }
  
  // レベルの変換と検証
  const division = normalizeDivision(row.division);
  if (!division) {
    throw new Error(`無効なレベル: ${row.division} (1, 2, 1部, 2部 のいずれかを使用)`);
  }
  
  return {
    name: row.name.trim(),
    gender,
    division,
    team_id: row.team_id || row.team || '',
    is_active: true,
  };
}

/**
 * 性別の正規化
 */
function normalizeGender(value: string): Gender | null {
  const normalized = value.toLowerCase().trim();
  
  if (normalized === 'male' || normalized === 'm' || normalized === '男') {
    return 'male';
  }
  if (normalized === 'female' || normalized === 'f' || normalized === '女') {
    return 'female';
  }
  
  return null;
}

/**
 * レベルの正規化
 */
function normalizeDivision(value: string): Division | null {
  const normalized = value.trim();
  
  if (normalized === '1' || normalized === '1部') {
    return 1;
  }
  if (normalized === '2' || normalized === '2部') {
    return 2;
  }
  
  return null;
}

/**
 * Playerオブジェクトの配列からCSV文字列を生成（エクスポート用）
 */
export function generatePlayersCSV(players: Player[]): string {
  const headers = ['name', 'gender', 'division', 'team_id'];
  const rows = players.map(p => [
    p.name,
    p.gender === 'male' ? '男' : '女',
    p.division === 1 ? '1部' : '2部',
    p.team_id || ''
  ]);
  
  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ];
  
  return csvLines.join('\n');
}

/**
 * サンプルCSVデータを生成
 */
export function generateSampleCSV(): string {
  return `name,gender,division,team_id
山田太郎,男,1,team_a
佐藤花子,女,1,team_a
鈴木一郎,男,2,team_b
田中美咲,女,2,team_b
高橋健太,男,1,team_c
伊藤さくら,女,1,team_c`;
}
