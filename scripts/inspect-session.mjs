#!/usr/bin/env node

/**
 * Session Inspector for Antigravity-CLI
 * 
 * Analyzes conversation trajectories, token consumption, context growth,
 * tool distribution, and context bloat for any antigravity-cli session.
 * 
 * Usage:
 *   node scripts/inspect-session.mjs <conversation-id> [--json] [--summary]
 *   ./scripts/inspect-session.sh <conversation-id>
 *   npm run session:inspect -- <conversation-id>
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';

const homeDir = os.homedir();
const defaultBaseDir = path.join(homeDir, '.gemini', 'antigravity-cli');

function printUsage() {
  console.log(`
Usage:
  node scripts/inspect-session.mjs <conversation-id-or-path> [options]

Options:
  --json       Output raw JSON summary
  --summary    Output a condensed high-level summary
  --help       Show this help message

Examples:
  node scripts/inspect-session.mjs 4de1448f-be55-4c09-bb48-25bf9f1e76d9
  npm run session:inspect -- 4de1448f-be55-4c09-bb48-25bf9f1e76d9
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const isJson = args.includes('--json');
  const isSummary = args.includes('--summary');
  const target = args.find(a => !a.startsWith('--'));

  if (!target) {
    console.error('Error: No conversation ID or file path provided.');
    printUsage();
    process.exit(1);
  }

  // Resolve target ID or file
  let convId = target;
  let transcriptPath = null;
  let dbPath = null;

  if (target.endsWith('.jsonl')) {
    transcriptPath = target;
    const match = target.match(/([a-f0-9\-]{36})/i);
    convId = match ? match[1] : path.basename(target, '.jsonl');
  } else if (target.endsWith('.db')) {
    dbPath = target;
    const match = target.match(/([a-f0-9\-]{36})/i);
    convId = match ? match[1] : path.basename(target, '.db');
    transcriptPath = path.join(defaultBaseDir, 'brain', convId, '.system_generated', 'logs', 'transcript_full.jsonl');
  } else {
    // Treat as conversation UUID
    transcriptPath = path.join(defaultBaseDir, 'brain', convId, '.system_generated', 'logs', 'transcript_full.jsonl');
    dbPath = path.join(defaultBaseDir, 'conversations', `${convId}.db`);
  }

  // Fallback to compact transcript if full does not exist
  if (!fs.existsSync(transcriptPath)) {
    const compactPath = path.join(defaultBaseDir, 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(compactPath)) {
      transcriptPath = compactPath;
    } else {
      console.error(`Error: Transcript not found for session ${convId}`);
      console.error(`Looked in: ${transcriptPath}`);
      console.error(`Looked in: ${compactPath}`);
      process.exit(1);
    }
  }

  const stats = await parseTranscript(transcriptPath, convId, dbPath);

  if (isJson) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  printReport(stats, isSummary);
}

async function parseTranscript(transcriptPath, convId, dbPath) {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let stepCount = 0;
  let turnCount = 0;
  let totalContentChars = 0;
  let totalThinkingChars = 0;
  let cumulativeProcessedChars = 0;

  let initialPrompt = '';
  let modelSetting = 'Unknown';
  let firstTimestamp = null;
  let lastTimestamp = null;

  const toolCounts = {};
  const toolOutputs = [];
  const fileViews = {};
  const commandRuns = {};
  const artifactsCreated = [];
  const turnMilestones = [];

  let currentHistoryChars = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let s;
    try {
      s = JSON.parse(line);
    } catch {
      continue;
    }

    stepCount++;
    if (!firstTimestamp && s.created_at) firstTimestamp = s.created_at;
    if (s.created_at) lastTimestamp = s.created_at;

    const contentLen = (s.content || '').length;
    const thinkingLen = (s.thinking || '').length;

    totalContentChars += contentLen;
    totalThinkingChars += thinkingLen;
    currentHistoryChars += contentLen;

    // Detect Initial User Prompt and Settings
    if (s.step_index === 0 && (s.source === 'USER_EXPLICIT' || s.type === 'USER_INPUT')) {
      const matchRequest = s.content ? s.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/) : null;
      initialPrompt = matchRequest ? matchRequest[1].trim() : (s.content || '').slice(0, 300).trim();

      const matchModel = s.content ? s.content.match(/The user changed setting `Model Selection` from .*? to (.*?)\.\s*(?:No need|$)/) : null;
      if (matchModel) modelSetting = matchModel[1].trim();
    }

    // Track Tool Calls
    if (s.tool_calls && s.tool_calls.length) {
      for (const tc of s.tool_calls) {
        toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1;

        if (tc.name === 'view_file' && tc.args && tc.args.AbsolutePath) {
          const p = tc.args.AbsolutePath;
          fileViews[p] = (fileViews[p] || 0) + 1;
        } else if (tc.name === 'run_command' && tc.args && tc.args.CommandLine) {
          const cmd = tc.args.CommandLine;
          commandRuns[cmd] = (commandRuns[cmd] || 0) + 1;
        } else if (tc.name === 'write_to_file' && tc.args && tc.args.TargetFile) {
          artifactsCreated.push({
            step: s.step_index,
            file: tc.args.TargetFile,
            chars: (tc.args.CodeContent || '').length,
            summary: tc.args.ArtifactMetadata?.Summary || tc.args.Description || ''
          });
        }
      }
    }

    // Track Tool Outputs (GENERIC)
    if (s.source === 'MODEL' && s.type === 'GENERIC') {
      toolOutputs.push({
        step: s.step_index,
        len: contentLen,
        preview: (s.content || '').slice(0, 150).replace(/\n/g, ' ')
      });
    }

    // When Model finishes planning/responding, that marks a Turn
    if (s.source === 'MODEL' && s.type === 'PLANNER_RESPONSE') {
      turnCount++;
      cumulativeProcessedChars += currentHistoryChars;

      // Capture milestone turns
      if (turnCount === 1 || turnCount % 10 === 0 || s.step_index >= 115) {
        turnMilestones.push({
          turn: turnCount,
          step: s.step_index,
          historyChars: currentHistoryChars,
          estTokens: Math.round(currentHistoryChars / 3.6)
        });
      }
    }
  }

  // Estimate baseline system prompt (Identity + Rules + Tools + Env) ~35k chars (~9.5k tokens)
  const systemPromptChars = 35000;
  const peakContextChars = currentHistoryChars + systemPromptChars;
  const peakContextTokens = Math.round(peakContextChars / 3.6);
  const totalCumulativeTokens = Math.round((cumulativeProcessedChars + (turnCount * systemPromptChars)) / 3.6);

  // Redundant file reads
  const redundantFiles = Object.entries(fileViews)
    .filter(([_, count]) => count > 1)
    .map(([file, count]) => ({ file, count }));

  // Redundant commands
  const redundantCommands = Object.entries(commandRuns)
    .filter(([_, count]) => count > 1)
    .map(([cmd, count]) => ({ cmd, count }));

  // Top tool outputs
  toolOutputs.sort((a, b) => b.len - a.len);
  const topOutputs = toolOutputs.slice(0, 10).map(t => ({
    step: t.step,
    chars: t.len,
    estTokens: Math.round(t.len / 3.6),
    preview: t.preview
  }));

  // Top files viewed
  const allFiles = Object.entries(fileViews).map(([file, count]) => {
    let size = 0;
    try {
      if (fs.existsSync(file)) size = fs.statSync(file).size;
    } catch {}
    return { file, count, sizeChars: size, estTokens: Math.round(size / 3.6) };
  });
  allFiles.sort((a, b) => (b.sizeChars * b.count) - (a.sizeChars * a.count));

  let durationMin = 0;
  if (firstTimestamp && lastTimestamp) {
    durationMin = Math.round((new Date(lastTimestamp) - new Date(firstTimestamp)) / 60000);
  }

  return {
    conversationId: convId,
    dbPath,
    transcriptPath,
    model: modelSetting,
    durationMinutes: durationMin,
    totalSteps: stepCount,
    totalTurns: turnCount,
    initialPrompt,
    tokens: {
      peakContextChars,
      peakContextTokens,
      cumulativeTokensProcessed: totalCumulativeTokens,
      thinkingChars: totalThinkingChars,
      thinkingTokens: Math.round(totalThinkingChars / 3.6)
    },
    toolDistribution: toolCounts,
    topOutputs,
    topFiles: allFiles.slice(0, 8),
    redundancies: {
      files: redundantFiles,
      commands: redundantCommands
    },
    artifactsCreated,
    turnMilestones
  };
}

function printReport(s, isSummary) {
  const line = '─'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ANTIGRAVITY-CLI SESSION REPORT: ${s.conversationId}`);
  console.log(`${line}`);

  console.log(`\n• Overview:`);
  console.log(`  - Model:             ${s.model}`);
  console.log(`  - Duration:          ~${s.durationMinutes} minutes`);
  console.log(`  - Total Steps:       ${s.totalSteps} steps (${s.totalTurns} model turns)`);
  console.log(`  - Initial Request:   "${s.initialPrompt.slice(0, 90).replace(/\n/g, ' ')}..."`);

  console.log(`\n• Token & Context Metrics:`);
  console.log(`  - Peak Context Size: ~${s.tokens.peakContextTokens.toLocaleString()} tokens (~${(s.tokens.peakContextChars / 1024).toFixed(1)} KB)`);
  console.log(`  - Cumulative Billed: ~${s.tokens.cumulativeTokensProcessed.toLocaleString()} tokens processed across all turns`);
  console.log(`  - Thinking / CoT:    ~${s.tokens.thinkingTokens.toLocaleString()} tokens (~${s.tokens.thinkingChars.toLocaleString()} chars)`);

  console.log(`\n• Tool Call Breakdown:`);
  Object.entries(s.toolDistribution).forEach(([tool, count]) => {
    console.log(`  - ${tool.padEnd(20)}: ${count}`);
  });

  if (s.artifactsCreated.length > 0) {
    console.log(`\n• Artifacts Created:`);
    s.artifactsCreated.forEach(a => {
      console.log(`  - Step ${a.step}: ${path.basename(a.file)} (${Math.round(a.chars / 3.6)} tokens)`);
      if (a.summary) console.log(`    Summary: ${a.summary.slice(0, 100).replace(/\n/g, ' ')}...`);
    });
  }

  if (isSummary) {
    console.log(`\n${line}\n`);
    return;
  }

  if (s.redundancies.files.length > 0) {
    console.log(`\n• Redundant File Reads (Opportunity for Optimization):`);
    s.redundancies.files.forEach(r => {
      console.log(`  - ${r.count}x: ${r.file}`);
    });
  }

  console.log(`\n• Top Files Viewed in Context:`);
  s.topFiles.forEach((f, i) => {
    const name = f.file.replace(process.cwd() + '/', '');
    console.log(`  ${i+1}. ${name} (${f.count}x, ~${f.estTokens} tokens per read)`);
  });

  console.log(`\n• Context Growth Trajectory:`);
  s.turnMilestones.slice(0, 8).forEach(m => {
    console.log(`  - Turn ${String(m.turn).padStart(2)} (Step ${String(m.step).padStart(3)}): ~${m.estTokens.toLocaleString()} tokens in conversation history`);
  });

  console.log(`\n${line}\n`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
