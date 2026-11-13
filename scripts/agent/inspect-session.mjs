#!/usr/bin/env node

/**
 * Session Inspector for Antigravity-CLI
 *
 * Analyzes conversation trajectories, token consumption, context growth,
 * tool distribution, and context bloat for any antigravity-cli session.
 *
 * Usage:
 *   node scripts/agent/inspect-session.mjs <conversation-id> [--json] [--summary]
 *   ./scripts/agent/inspect-session.sh <conversation-id>
 *   npm run session:inspect -- <conversation-id>
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const homeDir = os.homedir();
const defaultBaseDir = path.join(homeDir, '.gemini', 'antigravity-cli');
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MODEL_CHANGE_RE =
  /The user changed setting `Model Selection` from .*? to (.+?)\.\s*(?:No need|If reporting|<\/USER_SETTINGS_CHANGE>|$)/;

function printUsage() {
  console.log(`
Usage:
  node scripts/agent/inspect-session.mjs <conversation-id-or-path> [options]

Options:
  --json       Output raw JSON summary
  --summary    Output a condensed high-level summary
  --help       Show this help message

Examples:
  node scripts/agent/inspect-session.mjs 4de1448f-be55-4c09-bb48-25bf9f1e76d9
  npm run session:inspect -- 4de1448f-be55-4c09-bb48-25bf9f1e76d9
`);
}

function extractLastUuid(value) {
  if (typeof value !== 'string') return null;
  const matches = value.match(UUID_RE);
  return matches && matches.length > 0 ? matches[matches.length - 1] : null;
}

function unquoteArg(val) {
  if (typeof val !== 'string') return '';
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'string') return parsed;
    } catch {
      return val.slice(1, -1);
    }
  }
  return val;
}

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    if (s > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${h}h ${m}m`;
    return `${h}h`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${s}s`;
}

export function resolveTarget(target, baseDir = defaultBaseDir) {
  let convId = target;
  let transcriptPath = null;
  let dbPath = null;

  if (target.endsWith('.jsonl')) {
    transcriptPath = target;
    convId = extractLastUuid(target) || path.basename(target, '.jsonl');
  } else if (target.endsWith('.db')) {
    dbPath = target;
    convId = extractLastUuid(target) || path.basename(target, '.db');
    transcriptPath = path.join(baseDir, 'brain', convId, '.system_generated', 'logs', 'transcript_full.jsonl');
  } else {
    convId = extractLastUuid(target) || target;
    transcriptPath = path.join(baseDir, 'brain', convId, '.system_generated', 'logs', 'transcript_full.jsonl');
    dbPath = path.join(baseDir, 'conversations', `${convId}.db`);
  }

  return { convId, transcriptPath, dbPath };
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

  const resolved = resolveTarget(target);
  const { convId, dbPath } = resolved;
  let { transcriptPath } = resolved;

  // Fallback to compact transcript if full does not exist
  if (!fs.existsSync(transcriptPath)) {
    const compactPath = target.endsWith('.jsonl')
      ? path.join(path.dirname(transcriptPath), 'transcript.jsonl')
      : path.join(defaultBaseDir, 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl');
    if (
      (!target.endsWith('.jsonl') || path.basename(transcriptPath) === 'transcript_full.jsonl') &&
      fs.existsSync(compactPath)
    ) {
      transcriptPath = compactPath;
    } else {
      console.error(`Error: Transcript not found for session ${convId}`);
      console.error(`Looked in: ${transcriptPath}`);
      if (compactPath !== transcriptPath) {
        console.error(`Looked in: ${compactPath}`);
      }
      console.error(
        `\nTip: If running inside antigravity-cli sandbox, inspecting external sessions requires 'BypassSandbox: true' or passing a direct path to the transcript file.`,
      );
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

export async function parseTranscript(transcriptPath, convId, dbPath) {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let stepCount = 0;
  let turnCount = 0;
  let totalThinkingChars = 0;
  let cumulativeProcessedChars = 0;

  let initialPrompt = '';
  let modelSetting = 'Unknown';
  let firstTimestamp = null;
  let lastTimestamp = null;

  let currentTurnStartMs = null;
  let currentTurnEndMs = null;
  let activeDurationMs = 0;
  let activePromptIndex = -1;

  let hasTelemetry = false;
  let totalInputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalOutputTokens = 0;
  let peakTelemetryContextTokens = 0;

  const prompts = [];
  const toolCounts = {};
  const toolOutputs = [];
  const fileViews = {};
  const fileViewChars = {};
  const commandRuns = {};
  const artifactsCreated = [];
  const turnMilestones = [];
  let pendingToolCalls = [];

  let currentHistoryChars = 0;

  const closeActiveTurn = () => {
    if (currentTurnStartMs !== null && currentTurnEndMs !== null) {
      const segMs = Math.max(0, currentTurnEndMs - currentTurnStartMs);
      activeDurationMs += segMs;
      if (activePromptIndex >= 0 && prompts[activePromptIndex]) {
        prompts[activePromptIndex].durationSeconds = Math.round(segMs / 1000);
      }
    }
  };

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
    const stepMs = s.created_at ? new Date(s.created_at).getTime() : NaN;

    const contentLen = (s.content || '').length;
    const thinkingLen = (s.thinking || '').length;

    totalThinkingChars += thinkingLen;
    currentHistoryChars += contentLen;

    // Detect User Prompts & Settings across single or multi-turn resumed sessions
    if (s.source === 'USER_EXPLICIT' || s.type === 'USER_INPUT') {
      closeActiveTurn();

      const matchRequest = s.content ? s.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/) : null;
      const promptText = matchRequest ? matchRequest[1].trim() : (s.content || '').slice(0, 300).trim();
      if (!initialPrompt) initialPrompt = promptText;

      const matchModel = s.content ? s.content.match(MODEL_CHANGE_RE) : null;
      if (matchModel) modelSetting = matchModel[1].trim();

      prompts.push({
        step: s.step_index,
        timestamp: s.created_at || null,
        prompt: promptText,
        model: modelSetting,
        durationSeconds: 0,
      });
      activePromptIndex = prompts.length - 1;

      if (Number.isFinite(stepMs)) {
        currentTurnStartMs = stepMs;
        currentTurnEndMs = stepMs;
      } else {
        currentTurnStartMs = null;
        currentTurnEndMs = null;
      }
    } else if (Number.isFinite(stepMs)) {
      if (currentTurnStartMs === null) {
        currentTurnStartMs = stepMs;
        currentTurnEndMs = stepMs;
      } else if (currentTurnEndMs === null || stepMs >= currentTurnEndMs) {
        currentTurnEndMs = stepMs;
      }
    }

    // Track Tool Calls
    if (s.source === 'MODEL' && s.type === 'PLANNER_RESPONSE') {
      pendingToolCalls = [];
    }

    if (s.tool_calls && s.tool_calls.length) {
      for (const tc of s.tool_calls) {
        toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1;

        if (tc.name === 'view_file' && tc.args && tc.args.AbsolutePath) {
          const p = unquoteArg(tc.args.AbsolutePath).trim();
          fileViews[p] = (fileViews[p] || 0) + 1;
          pendingToolCalls.push({ name: tc.name, readPath: p });
        } else if (tc.name === 'read_file' && tc.args && tc.args.Path) {
          const p = unquoteArg(tc.args.Path).trim();
          fileViews[p] = (fileViews[p] || 0) + 1;
          pendingToolCalls.push({ name: tc.name, readPath: p });
        } else if (tc.name === 'run_command' && tc.args && tc.args.CommandLine) {
          const cmd = unquoteArg(tc.args.CommandLine).trim();
          commandRuns[cmd] = (commandRuns[cmd] || 0) + 1;
          pendingToolCalls.push({ name: tc.name });
        } else if (tc.name === 'write_to_file' && tc.args && tc.args.TargetFile) {
          const targetFile = unquoteArg(tc.args.TargetFile).trim();
          const codeContent = unquoteArg(tc.args.CodeContent || '');
          const summary = unquoteArg(tc.args.ArtifactMetadata?.Summary || tc.args.Description || '');
          artifactsCreated.push({
            step: s.step_index,
            file: targetFile,
            chars: codeContent.length,
            summary,
          });
          pendingToolCalls.push({ name: tc.name });
        } else if (tc.name === 'write_file' && tc.args && tc.args.Path) {
          const targetFile = unquoteArg(tc.args.Path).trim();
          const fileContent = unquoteArg(tc.args.Content || '');
          const summary = unquoteArg(tc.args.ArtifactMetadata?.Summary || '');
          artifactsCreated.push({
            step: s.step_index,
            file: targetFile,
            chars: fileContent.length,
            summary,
          });
          pendingToolCalls.push({ name: tc.name });
        } else if (tc.name === 'edit_file' && tc.args && tc.args.Path) {
          const targetFile = unquoteArg(tc.args.Path).trim();
          const replacement = unquoteArg(tc.args.Replacement || '');
          const summary = unquoteArg(tc.args.ArtifactMetadata?.Summary || '');
          artifactsCreated.push({
            step: s.step_index,
            file: targetFile,
            chars: replacement.length,
            summary,
          });
          pendingToolCalls.push({ name: tc.name });
        } else {
          pendingToolCalls.push({ name: tc.name });
        }
      }
    }

    // Track Tool Outputs (GENERIC)
    if (s.source === 'MODEL' && s.type === 'GENERIC') {
      toolOutputs.push({
        step: s.step_index,
        len: contentLen,
        preview: (s.content || '').slice(0, 150).replace(/\n/g, ' '),
      });

      const pendingCall = pendingToolCalls.length > 0 ? pendingToolCalls.shift() : null;
      const fileMatch = s.content ? s.content.match(/File Path:\s*`file:\/\/([^`]+)`/) : null;
      if (fileMatch) {
        const p = fileMatch[1].trim();
        fileViewChars[p] = (fileViewChars[p] || 0) + contentLen;
      } else if (pendingCall && pendingCall.readPath) {
        if (s.status !== 'ERROR') {
          fileViewChars[pendingCall.readPath] = (fileViewChars[pendingCall.readPath] || 0) + contentLen;
        } else if (!Object.prototype.hasOwnProperty.call(fileViewChars, pendingCall.readPath)) {
          fileViewChars[pendingCall.readPath] = 0;
        }
      }
    }

    // When Model finishes planning/responding, that marks a Turn
    if (s.source === 'MODEL' && s.type === 'PLANNER_RESPONSE') {
      turnCount++;
      cumulativeProcessedChars += currentHistoryChars;

      const hasStepTelemetry =
        typeof s.input_tokens === 'number' ||
        typeof s.output_tokens === 'number' ||
        typeof s.cache_read_tokens === 'number';

      let stepContextTokens = null;
      if (hasStepTelemetry) {
        hasTelemetry = true;
        const inp = typeof s.input_tokens === 'number' ? s.input_tokens : 0;
        const cache = typeof s.cache_read_tokens === 'number' ? s.cache_read_tokens : 0;
        const out = typeof s.output_tokens === 'number' ? s.output_tokens : 0;
        totalInputTokens += inp;
        totalCacheReadTokens += cache;
        totalOutputTokens += out;
        stepContextTokens = inp + cache;
        if (stepContextTokens > peakTelemetryContextTokens) {
          peakTelemetryContextTokens = stepContextTokens;
        }
      }

      // Capture milestone turns
      if (turnCount === 1 || turnCount % 10 === 0 || s.step_index >= 115) {
        turnMilestones.push({
          turn: turnCount,
          step: s.step_index,
          historyChars: currentHistoryChars,
          estTokens: hasStepTelemetry ? stepContextTokens : Math.round(currentHistoryChars / 3.6),
          tokensSource: hasStepTelemetry ? 'telemetry' : 'estimated',
        });
      }
    }
  }

  closeActiveTurn();

  // Estimate baseline system prompt (Identity + Rules + Tools + Env) ~35k chars (~9.5k tokens)
  const systemPromptChars = 35000;
  const peakContextChars = currentHistoryChars + systemPromptChars;
  const estPeakContextTokens = Math.round(peakContextChars / 3.6);
  const estTotalCumulativeTokens = Math.round((cumulativeProcessedChars + turnCount * systemPromptChars) / 3.6);

  const tokens = hasTelemetry
    ? {
        source: 'telemetry',
        inputTokens: totalInputTokens,
        cacheReadTokens: totalCacheReadTokens,
        outputTokens: totalOutputTokens,
        peakContextChars,
        peakContextTokens: peakTelemetryContextTokens,
        cumulativeTokensProcessed: totalInputTokens + totalCacheReadTokens + totalOutputTokens,
        thinkingChars: totalThinkingChars,
        thinkingTokens: Math.round(totalThinkingChars / 3.6),
      }
    : {
        source: 'estimated',
        peakContextChars,
        peakContextTokens: estPeakContextTokens,
        cumulativeTokensProcessed: estTotalCumulativeTokens,
        thinkingChars: totalThinkingChars,
        thinkingTokens: Math.round(totalThinkingChars / 3.6),
      };

  // Redundant file reads
  const redundantFiles = Object.entries(fileViews)
    .filter(([, count]) => count > 1)
    .map(([file, count]) => ({ file, count }));

  // Redundant commands
  const redundantCommands = Object.entries(commandRuns)
    .filter(([, count]) => count > 1)
    .map(([cmd, count]) => ({ cmd, count }));

  // Top tool outputs
  toolOutputs.sort((a, b) => b.len - a.len);
  const topOutputs = toolOutputs.slice(0, 10).map(t => ({
    step: t.step,
    chars: t.len,
    estTokens: Math.round(t.len / 3.6),
    preview: t.preview,
  }));

  // Top files viewed (measuring actual characters ingested into context)
  const allFiles = Object.entries(fileViews).map(([file, count]) => {
    let size = 0;
    try {
      if (fs.existsSync(file)) size = fs.statSync(file).size;
    } catch {}
    const actualChars = Object.prototype.hasOwnProperty.call(fileViewChars, file) ? fileViewChars[file] : size;
    const totalTokens = Math.round(actualChars / 3.6);
    const avgTokens = Math.round(totalTokens / count);
    return {
      file,
      count,
      sizeChars: size,
      totalChars: actualChars,
      totalTokens,
      avgTokens,
      estTokens: totalTokens,
    };
  });
  allFiles.sort((a, b) => b.totalChars - a.totalChars);

  let durationSeconds = 0;
  if (firstTimestamp && lastTimestamp) {
    const wallMs = new Date(lastTimestamp) - new Date(firstTimestamp);
    if (Number.isFinite(wallMs) && wallMs > 0) {
      durationSeconds = Math.round(wallMs / 1000);
    }
  }
  const activeDurationSeconds = Math.round(activeDurationMs / 1000);
  const durationMin = Math.round(durationSeconds / 60);

  return {
    conversationId: convId,
    dbPath,
    transcriptPath,
    model: modelSetting,
    durationSeconds,
    activeDurationSeconds,
    durationMinutes: durationMin,
    totalSteps: stepCount,
    totalTurns: turnCount,
    initialPrompt,
    prompts,
    tokens,
    toolDistribution: toolCounts,
    topOutputs,
    topFiles: allFiles.slice(0, 8),
    redundancies: {
      files: redundantFiles,
      commands: redundantCommands,
    },
    artifactsCreated,
    turnMilestones,
  };
}

export function printReport(s, isSummary) {
  const line = '─'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ANTIGRAVITY-CLI SESSION REPORT: ${s.conversationId}`);
  console.log(`${line}`);

  const promptsList = Array.isArray(s.prompts) ? s.prompts : [];
  const durationSec = typeof s.durationSeconds === 'number' ? s.durationSeconds : (s.durationMinutes || 0) * 60;
  const activeSec = typeof s.activeDurationSeconds === 'number' ? s.activeDurationSeconds : durationSec;
  const durationLabel =
    promptsList.length > 1
      ? `${formatDuration(durationSec)} wall-clock (${formatDuration(activeSec)} active across ${promptsList.length} prompts)`
      : formatDuration(durationSec);

  console.log(`\n• Overview:`);
  console.log(`  - Model:             ${s.model}`);
  console.log(`  - Duration:          ${durationLabel}`);
  console.log(`  - Total Steps:       ${s.totalSteps} steps (${s.totalTurns} model turns)`);
  console.log(`  - Initial Request:   "${(s.initialPrompt || '').slice(0, 90).replace(/\n/g, ' ')}..."`);

  const tokenSource = s.tokens.source || 'estimated';
  console.log(`\n• Token & Context Metrics (${tokenSource}):`);
  if (tokenSource === 'telemetry') {
    console.log(`  - Peak Context Size: ${s.tokens.peakContextTokens.toLocaleString()} tokens`);
    console.log(
      `  - Cumulative Billed: ${s.tokens.cumulativeTokensProcessed.toLocaleString()} tokens (${s.tokens.inputTokens.toLocaleString()} input + ${s.tokens.cacheReadTokens.toLocaleString()} cache_read + ${s.tokens.outputTokens.toLocaleString()} output)`,
    );
  } else {
    console.log(
      `  - Peak Context Size: ~${s.tokens.peakContextTokens.toLocaleString()} tokens (~${(s.tokens.peakContextChars / 1024).toFixed(1)} KB)`,
    );
    console.log(
      `  - Cumulative Billed: ~${s.tokens.cumulativeTokensProcessed.toLocaleString()} tokens processed across all turns`,
    );
  }
  console.log(
    `  - Thinking / CoT:    ~${s.tokens.thinkingTokens.toLocaleString()} tokens (~${s.tokens.thinkingChars.toLocaleString()} chars)`,
  );

  if (promptsList.length > 1) {
    console.log(`\n• User Turns (${promptsList.length} prompts):`);
    promptsList.forEach((p, idx) => {
      const dur = typeof p.durationSeconds === 'number' ? ` (${formatDuration(p.durationSeconds)})` : '';
      const snippet = (p.prompt || '').slice(0, 70).replace(/\n/g, ' ');
      console.log(`  ${idx + 1}. [Step ${p.step}] ${p.model}${dur}: "${snippet}${p.prompt.length > 70 ? '...' : ''}"`);
    });
  }

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
    const tokensLabel = f.count > 1 ? `~${f.avgTokens} tokens/read, ~${f.totalTokens} total` : `~${f.totalTokens} tokens`;
    console.log(`  ${i + 1}. ${name} (${f.count}x, ${tokensLabel})`);
  });

  console.log(`\n• Context Growth Trajectory:`);
  s.turnMilestones.slice(0, 8).forEach(m => {
    const prefix = m.tokensSource === 'telemetry' ? '' : '~';
    const label = m.tokensSource === 'telemetry' ? 'context tokens' : 'tokens in conversation history';
    console.log(
      `  - Turn ${String(m.turn).padStart(2)} (Step ${String(m.step).padStart(3)}): ${prefix}${m.estTokens.toLocaleString()} ${label}`,
    );
  });

  console.log(`\n${line}\n`);
}

const isDirectExecution = (() => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isDirectExecution) {
  main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
  });
}
