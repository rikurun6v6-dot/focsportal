import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export interface AIDiagnosePayload {
  freeCourts: number;
  totalCourts: number;
  waitingTotal: number;
  assignable: number;
  div1Progress: number;
  div2Progress: number;
  div1Comp: number;
  div1Total: number;
  div2Comp: number;
  div2Total: number;
  blockedMatches: {
    matchNumber: number;
    label: string;
    round: number;
    blockReason: string;
    blockDetail: string;
  }[];
  diagnosisItems: {
    severity: string;
    title: string;
    detail: string;
  }[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "ANTHROPIC_API_KEY が設定されていません。.env.local に設定してください。",
      { status: 500 }
    );
  }

  const data: AIDiagnosePayload = await req.json();

  const contextText = buildContext(data);

  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: `バドミントン大会運営のAIアドバイザー。
結論から箇条書きで答えること。1秒で状況把握できる簡潔さを最優先。
余計な説明・前置き不要。今すぐ取るべき行動のみ述べよ。`,
    messages: [
      {
        role: "user",
        content: contextText,
      },
    ],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function buildContext(d: AIDiagnosePayload): string {
  const lines: string[] = [
    "## 現在の大会状況",
    `- 空きコート: ${d.freeCourts}面 / 総アクティブコート: ${d.totalCourts}面`,
    `- 待機中の試合数: ${d.waitingTotal}試合`,
    `- 即座に割り当て可能な試合: ${d.assignable}試合`,
    "",
    "## 1部/2部 進行状況",
    `- 1部: ${d.div1Comp}/${d.div1Total}完了 (${Math.round(d.div1Progress * 100)}%)`,
    `- 2部: ${d.div2Comp}/${d.div2Total}完了 (${Math.round(d.div2Progress * 100)}%)`,
    "",
  ];

  if (d.diagnosisItems.length > 0) {
    lines.push("## 検出された問題");
    for (const item of d.diagnosisItems) {
      lines.push(`- [${item.severity.toUpperCase()}] ${item.title}`);
      if (item.detail) lines.push(`  詳細: ${item.detail}`);
    }
    lines.push("");
  }

  if (d.blockedMatches.length > 0) {
    lines.push("## ブロックされている試合（上位10件）");
    for (const m of d.blockedMatches.slice(0, 10)) {
      lines.push(`- #${m.matchNumber} ${m.label} ${m.round}回戦`);
      lines.push(`  理由: ${m.blockReason}`);
      if (m.blockDetail) lines.push(`  詳細: ${m.blockDetail}`);
    }
    lines.push("");
  }

  lines.push(
    "根本原因と今すぐ取るべき対処法を箇条書きで。"
  );

  return lines.join("\n");
}
