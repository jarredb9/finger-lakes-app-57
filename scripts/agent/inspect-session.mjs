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

const HOME_DIR = os.homedir();
const DEFAULT_BASE_DIR = path.join(HOME_DIR, '.gemini', 'antigravity-cli');
const CHARS_PER_TOKEN = 3.6;
const SYSTEM_PROMPT_CHARS = 35000;
const UUID_RE = new RegExp(
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    'gi',
);
const MODEL_CHANGE_RE =
  /The user changed setting `Model Selection` from .*? to (.+?)\.\s*(?:No need|If reporting|<\/USER_SETTINGS_CHANGE>|$)/;

const FILE_READ_PATH_KEYS = {
  view_file: 'AbsolutePath',
  read_file: 'Path',
};

const FILE_WRITE_SPECS = {
  write_to_file: {
    pathKey: 'TargetFile',
    contentKey: 'CodeContent',
    useDescription: true,
  },
  write_file: {
    pathKey: 'Path',
    contentKey: 'Content',
    useDescription: false,
  },
  edit_file: {
    pathKey: 'Path',
    contentKey: 'Replacement',
    useDescription: false,
  },
};

/**
 * Prints CLI usage instructions and examples to stdout.
 *
 * @return {void}
 */
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

/**
 * Extracts the final UUID present in a string or path.
 *
 * @param {*} value Candidate string containing one or more UUIDs.
 * @return {?string} The last matched UUID, or null if none found.
 */
function extractLastUuid(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const matches = value.match(UUID_RE);
  return matches && matches.length > 0 ? matches[matches.length - 1] : null;
}

/**
 * Removes surrounding JSON string quotes from compact transcript arguments.
 *
 * @param {*} val Raw tool argument value.
 * @return {string} Unquoted string value, or empty string for non-strings.
 */
function unquoteArg(val) {
  if (typeof val !== 'string') {
    return '';
  }
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      return val.slice(1, -1);
    }
  }
  return val;
}

/**
 * Formats a duration in seconds into a concise human-readable string.
 *
 * @param {number} seconds Duration in seconds.
 * @return {string} Formatted duration such as "1h 2m 3s", "4m", or "0s".
 */
export function formatDuration(seconds) {
  if (
      typeof seconds !== 'number' ||
      !Number.isFinite(seconds) ||
      seconds <= 0
  ) {
    return '0s';
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    if (s > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    if (m > 0) {
      return `${h}h ${m}m`;
    }
    return `${h}h`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${s}s`;
}

/**
 * Resolves a conversation ID or file path to transcript and database paths.
 *
 * @param {string} target Conversation ID, .jsonl transcript path, or .db path.
 * @param {string=} baseDir Base Antigravity CLI data directory.
 * @return {{convId: string, transcriptPath: string, dbPath: ?string}} Resolved
 *     session paths.
 */
export function resolveTarget(target, baseDir = DEFAULT_BASE_DIR) {
  let convId = target;
  let transcriptPath = null;
  let dbPath = null;

  if (target.endsWith('.jsonl')) {
    transcriptPath = target;
    convId = extractLastUuid(target) || path.basename(target, '.jsonl');
  } else if (target.endsWith('.db')) {
    dbPath = target;
    convId = extractLastUuid(target) || path.basename(target, '.db');
    transcriptPath = path.join(
        baseDir,
        'brain',
        convId,
        '.system_generated',
        'logs',
        'transcript_full.jsonl',
    );
  } else {
    convId = extractLastUuid(target) || target;
    transcriptPath = path.join(
        baseDir,
        'brain',
        convId,
        '.system_generated',
        'logs',
        'transcript_full.jsonl',
    );
    dbPath = path.join(baseDir, 'conversations', `${convId}.db`);
  }

  return { convId, transcriptPath, dbPath };
}

/**
 * Creates the mutable accumulator state used while scanning transcript lines.
 *
 * @return {!Object} Initial transcript parser state.
 */
function createInitialParseState() {
  return {
    stepCount: 0,
    turnCount: 0,
    totalThinkingChars: 0,
    cumulativeProcessedChars: 0,
    currentHistoryChars: 0,
    initialPrompt: '',
    modelSetting: 'Unknown',
    firstTimestamp: null,
    lastTimestamp: null,
    currentTurnStartMs: null,
    currentTurnEndMs: null,
    activeDurationMs: 0,
    activePromptIndex: -1,
    hasTelemetry: false,
    totalInputTokens: 0,
    totalCacheReadTokens: 0,
    totalOutputTokens: 0,
    peakTelemetryContextTokens: 0,
    prompts: [],
    toolCounts: {},
    toolOutputs: [],
    fileViews: {},
    fileViewChars: {},
    commandRuns: {},
    artifactsCreated: [],
    turnMilestones: [],
    pendingToolCalls: [],
  };
}

/**
 * Closes the currently open user turn window and records its active duration.
 *
 * @param {!Object} state Parser state object.
 * @return {void}
 */
function closeActiveTurn(state) {
  if (state.currentTurnStartMs === null || state.currentTurnEndMs === null) {
    return;
  }
  const segMs = Math.max(0, state.currentTurnEndMs - state.currentTurnStartMs);
  state.activeDurationMs += segMs;
  const activePrompt = state.prompts[state.activePromptIndex];
  if (state.activePromptIndex >= 0 && activePrompt) {
    activePrompt.durationSeconds = Math.round(segMs / 1000);
  }
}

/**
 * Processes a user input step, closing the prior turn and recording metadata.
 *
 * @param {!Object} s Parsed JSONL step object.
 * @param {number} stepMs Step timestamp in milliseconds, or NaN.
 * @param {!Object} state Parser state object.
 * @return {void}
 */
function handleUserPromptStep(s, stepMs, state) {
  closeActiveTurn(state);

  const matchRequest = s.content
    ? s.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/)
    : null;
  const promptText = matchRequest
    ? matchRequest[1].trim()
    : (s.content || '').slice(0, 300).trim();
  if (!state.initialPrompt) {
    state.initialPrompt = promptText;
  }

  const matchModel = s.content ? s.content.match(MODEL_CHANGE_RE) : null;
  if (matchModel) {
    state.modelSetting = matchModel[1].trim();
  }

  state.prompts.push({
    step: s.step_index,
    timestamp: s.created_at || null,
    prompt: promptText,
    model: state.modelSetting,
    durationSeconds: 0,
  });
  state.activePromptIndex = state.prompts.length - 1;

  if (Number.isFinite(stepMs)) {
    state.currentTurnStartMs = stepMs;
    state.currentTurnEndMs = stepMs;
  } else {
    state.currentTurnStartMs = null;
    state.currentTurnEndMs = null;
  }
}

/**
 * Extends the active turn timestamp window for non-user steps.
 *
 * @param {number} stepMs Step timestamp in milliseconds.
 * @param {!Object} state Parser state object.
 * @return {void}
 */
function advanceTurnWindow(stepMs, state) {
  if (!Number.isFinite(stepMs)) {
    return;
  }
  if (state.currentTurnStartMs === null) {
    state.currentTurnStartMs = stepMs;
    state.currentTurnEndMs = stepMs;
  } else if (
      state.currentTurnEndMs === null ||
      stepMs >= state.currentTurnEndMs
  ) {
    state.currentTurnEndMs = stepMs;
  }
}

/**
 * Records a file read tool invocation and queues it for output correlation.
 *
 * @param {!Object<string, number>} fileViews Map of file paths to read counts.
 * @param {!Array<!Object>} pendingToolCalls Queue of pending tool calls.
 * @param {string} toolName Name of the read tool.
 * @param {string} rawPath Raw path argument from the tool call.
 * @return {void}
 */
function recordFileRead(fileViews, pendingToolCalls, toolName, rawPath) {
  const filePath = unquoteArg(rawPath).trim();
  fileViews[filePath] = (fileViews[filePath] || 0) + 1;
  pendingToolCalls.push({ name: toolName, readPath: filePath });
}

/**
 * Records a file creation or edit artifact and queues the pending tool call.
 *
 * @param {!Array<!Object>} artifactsCreated List of recorded artifact edits.
 * @param {!Array<!Object>} pendingToolCalls Queue of pending tool calls.
 * @param {number} stepIndex Transcript step index.
 * @param {string} toolName Name of the write/edit tool.
 * @param {string} rawPath Raw file path argument.
 * @param {string} content Raw written or replacement content.
 * @param {string} summary Optional artifact summary or description.
 * @return {void}
 */
function recordFileWrite(
    artifactsCreated,
    pendingToolCalls,
    stepIndex,
    toolName,
    rawPath,
    content,
    summary,
) {
  const file = unquoteArg(rawPath).trim();
  const decodedContent = unquoteArg(content || '');
  const decodedSummary = unquoteArg(summary || '');
  artifactsCreated.push({
    step: stepIndex,
    file,
    chars: decodedContent.length,
    summary: decodedSummary,
  });
  pendingToolCalls.push({ name: toolName });
}

/**
 * Tracks tool call counts, file reads/writes, and command invocations.
 *
 * @param {!Object} s Parsed JSONL step object.
 * @param {!Object} state Parser state object.
 * @return {void}
 */
function processToolCalls(s, state) {
  if (s.source === 'MODEL' && s.type === 'PLANNER_RESPONSE') {
    state.pendingToolCalls = [];
  }

  if (!s.tool_calls || !s.tool_calls.length) {
    return;
  }

  for (const tc of s.tool_calls) {
    state.toolCounts[tc.name] = (state.toolCounts[tc.name] || 0) + 1;

    const readKey = FILE_READ_PATH_KEYS[tc.name];
    if (readKey && tc.args && tc.args[readKey]) {
      recordFileRead(
          state.fileViews,
          state.pendingToolCalls,
          tc.name,
          tc.args[readKey],
      );
      continue;
    }

    if (tc.name === 'run_command' && tc.args && tc.args.CommandLine) {
      const cmd = unquoteArg(tc.args.CommandLine).trim();
      state.commandRuns[cmd] = (state.commandRuns[cmd] || 0) + 1;
      state.pendingToolCalls.push({ name: tc.name });
      continue;
    }

    const writeSpec = FILE_WRITE_SPECS[tc.name];
    if (writeSpec && tc.args && tc.args[writeSpec.pathKey]) {
      const desc = writeSpec.useDescription ? tc.args.Description : '';
      const summary = tc.args.ArtifactMetadata?.Summary || desc || '';
      recordFileWrite(
          state.artifactsCreated,
          state.pendingToolCalls,
          s.step_index,
          tc.name,
          tc.args[writeSpec.pathKey],
          tc.args[writeSpec.contentKey] || '',
          summary,
      );
      continue;
    }

    state.pendingToolCalls.push({ name: tc.name });
  }
}

/**
 * Records GENERIC tool outputs and correlates read lengths to viewed files.
 *
 * @param {!Object} s Parsed JSONL step object.
 * @param {number} contentLen Length of step content in characters.
 * @param {!Object} state Parser state object.
 * @return {void}
 */
function correlateToolOutput(s, contentLen, state) {
  if (s.source !== 'MODEL' || s.type !== 'GENERIC') {
    return;
  }

  state.toolOutputs.push({
    step: s.step_index,
    len: contentLen,
    preview: (s.content || '').slice(0, 150).replace(/\n/g, ' '),
  });

  const pendingCall =
    state.pendingToolCalls.length > 0 ? state.pendingToolCalls.shift() : null;
  const fileMatch = s.content
    ? s.content.match(/File Path:\s*`file:\/\/([^`]+)`/)
    : null;

  if (fileMatch) {
    const filePath = fileMatch[1].trim();
    state.fileViewChars[filePath] =
      (state.fileViewChars[filePath] || 0) + contentLen;
  } else if (pendingCall && pendingCall.readPath) {
    if (s.status !== 'ERROR') {
      state.fileViewChars[pendingCall.readPath] =
        (state.fileViewChars[pendingCall.readPath] || 0) + contentLen;
    } else if (
        !Object.prototype.hasOwnProperty.call(
            state.fileViewChars,
            pendingCall.readPath,
        )
    ) {
      state.fileViewChars[pendingCall.readPath] = 0;
    }
  }
}

/**
 * Records a completed planner turn, token telemetry, and growth milestones.
 *
 * @param {!Object} s Parsed JSONL step object.
 * @param {!Object} state Parser state object.
 * @return {void}
 */
function recordPlannerTurn(s, state) {
  if (s.source !== 'MODEL' || s.type !== 'PLANNER_RESPONSE') {
    return;
  }

  state.turnCount++;
  state.cumulativeProcessedChars += state.currentHistoryChars;

  const hasStepTelemetry =
    typeof s.input_tokens === 'number' ||
    typeof s.output_tokens === 'number' ||
    typeof s.cache_read_tokens === 'number';

  let stepContextTokens = null;
  if (hasStepTelemetry) {
    state.hasTelemetry = true;
    const inp = typeof s.input_tokens === 'number' ? s.input_tokens : 0;
    const cache =
      typeof s.cache_read_tokens === 'number' ? s.cache_read_tokens : 0;
    const out = typeof s.output_tokens === 'number' ? s.output_tokens : 0;
    state.totalInputTokens += inp;
    state.totalCacheReadTokens += cache;
    state.totalOutputTokens += out;
    stepContextTokens = inp + cache;
    if (stepContextTokens > state.peakTelemetryContextTokens) {
      state.peakTelemetryContextTokens = stepContextTokens;
    }
  }

  if (
      state.turnCount === 1 ||
      state.turnCount % 10 === 0 ||
      s.step_index >= 115
  ) {
    const estTokens = hasStepTelemetry
      ? stepContextTokens
      : Math.round(state.currentHistoryChars / CHARS_PER_TOKEN);
    state.turnMilestones.push({
      turn: state.turnCount,
      step: s.step_index,
      historyChars: state.currentHistoryChars,
      estTokens,
      tokensSource: hasStepTelemetry ? 'telemetry' : 'estimated',
    });
  }
}

/**
 * Builds the token usage summary from telemetry or character estimates.
 *
 * @param {!Object} state Completed parser state object.
 * @return {!Object} Token metrics summary.
 */
function buildTokenSummary(state) {
  const peakContextChars = state.currentHistoryChars + SYSTEM_PROMPT_CHARS;
  const thinkingTokens = Math.round(state.totalThinkingChars / CHARS_PER_TOKEN);

  if (state.hasTelemetry) {
    return {
      source: 'telemetry',
      inputTokens: state.totalInputTokens,
      cacheReadTokens: state.totalCacheReadTokens,
      outputTokens: state.totalOutputTokens,
      peakContextChars,
      peakContextTokens: state.peakTelemetryContextTokens,
      cumulativeTokensProcessed:
        state.totalInputTokens +
        state.totalCacheReadTokens +
        state.totalOutputTokens,
      thinkingChars: state.totalThinkingChars,
      thinkingTokens,
    };
  }

  const estPeakContextTokens = Math.round(peakContextChars / CHARS_PER_TOKEN);
  const estTotalCumulativeTokens = Math.round(
      (state.cumulativeProcessedChars + state.turnCount * SYSTEM_PROMPT_CHARS) /
      CHARS_PER_TOKEN,
  );
  return {
    source: 'estimated',
    peakContextChars,
    peakContextTokens: estPeakContextTokens,
    cumulativeTokensProcessed: estTotalCumulativeTokens,
    thinkingChars: state.totalThinkingChars,
    thinkingTokens,
  };
}

/**
 * Computes per-file read counts, sizes, and estimated token totals.
 *
 * @param {!Object<string, number>} fileViews Map of file paths to read counts.
 * @param {!Object<string, number>} fileViewChars Map of file paths to chars.
 * @return {!Array<!Object>} Sorted list of file read metrics.
 */
function buildFileMetrics(fileViews, fileViewChars) {
  const allFiles = Object.entries(fileViews).map(([file, count]) => {
    let size = 0;
    try {
      if (fs.existsSync(file)) {
        size = fs.statSync(file).size;
      }
    } catch {
      // Ignore stat errors for missing or inaccessible files.
    }
    const actualChars = Object.prototype.hasOwnProperty.call(
        fileViewChars,
        file,
    )
      ? fileViewChars[file]
      : size;
    const totalTokens = Math.round(actualChars / CHARS_PER_TOKEN);
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
  return allFiles;
}

/**
 * Computes wall-clock duration in whole seconds between two ISO timestamps.
 *
 * @param {?string} firstTimestamp Earliest step ISO timestamp.
 * @param {?string} lastTimestamp Latest step ISO timestamp.
 * @return {number} Elapsed duration in seconds.
 */
function computeDurationSeconds(firstTimestamp, lastTimestamp) {
  if (!firstTimestamp || !lastTimestamp) {
    return 0;
  }
  const wallMs =
    new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime();
  if (Number.isFinite(wallMs) && wallMs > 0) {
    return Math.round(wallMs / 1000);
  }
  return 0;
}

/**
 * Parses a session JSONL transcript into structured metrics and telemetry.
 *
 * @param {string} transcriptPath Path to the JSONL transcript file.
 * @param {string} convId Conversation UUID or identifier.
 * @param {?string} dbPath Optional path to the conversation SQLite database.
 * @return {!Promise<!Object>} Parsed session statistics object.
 */
export async function parseTranscript(transcriptPath, convId, dbPath) {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  const state = createInitialParseState();

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    let s;
    try {
      s = JSON.parse(line);
    } catch {
      continue;
    }

    state.stepCount++;
    if (!state.firstTimestamp && s.created_at) {
      state.firstTimestamp = s.created_at;
    }
    if (s.created_at) {
      state.lastTimestamp = s.created_at;
    }
    const stepMs = s.created_at ? new Date(s.created_at).getTime() : NaN;

    const contentLen = (s.content || '').length;
    const thinkingLen = (s.thinking || '').length;
    state.totalThinkingChars += thinkingLen;
    state.currentHistoryChars += contentLen;

    if (s.source === 'USER_EXPLICIT' || s.type === 'USER_INPUT') {
      handleUserPromptStep(s, stepMs, state);
    } else {
      advanceTurnWindow(stepMs, state);
    }

    processToolCalls(s, state);
    correlateToolOutput(s, contentLen, state);
    recordPlannerTurn(s, state);
  }

  closeActiveTurn(state);

  const tokens = buildTokenSummary(state);
  const redundantFiles = Object.entries(state.fileViews)
    .filter(([, count]) => count > 1)
    .map(([file, count]) => ({ file, count }));
  const redundantCommands = Object.entries(state.commandRuns)
    .filter(([, count]) => count > 1)
    .map(([cmd, count]) => ({ cmd, count }));

  state.toolOutputs.sort((a, b) => b.len - a.len);
  const topOutputs = state.toolOutputs.slice(0, 10).map((t) => ({
    step: t.step,
    chars: t.len,
    estTokens: Math.round(t.len / CHARS_PER_TOKEN),
    preview: t.preview,
  }));

  const allFiles = buildFileMetrics(state.fileViews, state.fileViewChars);
  const durationSeconds = computeDurationSeconds(
      state.firstTimestamp,
      state.lastTimestamp,
  );
  const activeDurationSeconds = Math.round(state.activeDurationMs / 1000);

  return {
    conversationId: convId,
    dbPath,
    transcriptPath,
    model: state.modelSetting,
    durationSeconds,
    activeDurationSeconds,
    durationMinutes: Math.round(durationSeconds / 60),
    totalSteps: state.stepCount,
    totalTurns: state.turnCount,
    initialPrompt: state.initialPrompt,
    prompts: state.prompts,
    tokens,
    toolDistribution: state.toolCounts,
    topOutputs,
    topFiles: allFiles.slice(0, 8),
    redundancies: {
      files: redundantFiles,
      commands: redundantCommands,
    },
    artifactsCreated: state.artifactsCreated,
    turnMilestones: state.turnMilestones,
  };
}

/**
 * Prints a formatted human-readable session inspection report to stdout.
 *
 * @param {!Object} s Parsed session statistics from parseTranscript.
 * @param {boolean} isSummary Whether to stop after the summary sections.
 * @return {void}
 */
export function printReport(s, isSummary) {
  const line = '─'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ANTIGRAVITY-CLI SESSION REPORT: ${s.conversationId}`);
  console.log(`${line}`);

  const promptsList = Array.isArray(s.prompts) ? s.prompts : [];
  const durationSec =
    typeof s.durationSeconds === 'number'
      ? s.durationSeconds
      : (s.durationMinutes || 0) * 60;
  const activeSec =
    typeof s.activeDurationSeconds === 'number'
      ? s.activeDurationSeconds
      : durationSec;
  const durationLabel =
    promptsList.length > 1
      ? `${formatDuration(durationSec)} wall-clock ` +
        `(${formatDuration(activeSec)} active across ` +
        `${promptsList.length} prompts)`
      : formatDuration(durationSec);

  const initSnippet = (s.initialPrompt || '').slice(0, 90).replace(/\n/g, ' ');
  console.log(`\n• Overview:`);
  console.log(`  - Model:             ${s.model}`);
  console.log(`  - Duration:          ${durationLabel}`);
  console.log(
      `  - Total Steps:       ${s.totalSteps} steps ` +
      `(${s.totalTurns} model turns)`,
  );
  console.log(`  - Initial Request:   "${initSnippet}..."`);

  const tokenSource = s.tokens.source || 'estimated';
  console.log(`\n• Token & Context Metrics (${tokenSource}):`);
  if (tokenSource === 'telemetry') {
    const peakStr = s.tokens.peakContextTokens.toLocaleString();
    const cumStr = s.tokens.cumulativeTokensProcessed.toLocaleString();
    const inpStr = s.tokens.inputTokens.toLocaleString();
    const cacheStr = s.tokens.cacheReadTokens.toLocaleString();
    const outStr = s.tokens.outputTokens.toLocaleString();
    console.log(`  - Peak Context Size: ${peakStr} tokens`);
    console.log(
        `  - Cumulative Billed: ${cumStr} tokens ` +
        `(${inpStr} input + ${cacheStr} cache_read + ${outStr} output)`,
    );
  } else {
    const peakStr = s.tokens.peakContextTokens.toLocaleString();
    const peakKb = (s.tokens.peakContextChars / 1024).toFixed(1);
    const cumStr = s.tokens.cumulativeTokensProcessed.toLocaleString();
    console.log(`  - Peak Context Size: ~${peakStr} tokens (~${peakKb} KB)`);
    console.log(
        `  - Cumulative Billed: ~${cumStr} tokens processed across all turns`,
    );
  }
  const thinkTok = s.tokens.thinkingTokens.toLocaleString();
  const thinkChars = s.tokens.thinkingChars.toLocaleString();
  console.log(
      `  - Thinking / CoT:    ~${thinkTok} tokens (~${thinkChars} chars)`,
  );

  if (promptsList.length > 1) {
    console.log(`\n• User Turns (${promptsList.length} prompts):`);
    promptsList.forEach((p, idx) => {
      const dur =
        typeof p.durationSeconds === 'number'
          ? ` (${formatDuration(p.durationSeconds)})`
          : '';
      const rawPrompt = typeof p.prompt === 'string' ? p.prompt : '';
      const snippet = rawPrompt.slice(0, 70).replace(/\n/g, ' ');
      const suffix = rawPrompt.length > 70 ? '...' : '';
      console.log(
          `  ${idx + 1}. [Step ${p.step}] ${p.model}${dur}: ` +
          `"${snippet}${suffix}"`,
      );
    });
  }

  console.log(`\n• Tool Call Breakdown:`);
  Object.entries(s.toolDistribution).forEach(([tool, count]) => {
    console.log(`  - ${tool.padEnd(20)}: ${count}`);
  });

  if (s.artifactsCreated.length > 0) {
    console.log(`\n• Artifacts Created:`);
    s.artifactsCreated.forEach((a) => {
      const estTokens = Math.round(a.chars / CHARS_PER_TOKEN);
      const base = path.basename(a.file);
      console.log(`  - Step ${a.step}: ${base} (${estTokens} tokens)`);
      if (a.summary) {
        const sumSnippet = a.summary.slice(0, 100).replace(/\n/g, ' ');
        console.log(`    Summary: ${sumSnippet}...`);
      }
    });
  }

  if (isSummary) {
    console.log(`\n${line}\n`);
    return;
  }

  if (s.redundancies.files.length > 0) {
    console.log(`\n• Redundant File Reads (Opportunity for Optimization):`);
    s.redundancies.files.forEach((r) => {
      console.log(`  - ${r.count}x: ${r.file}`);
    });
  }

  console.log(`\n• Top Files Viewed in Context:`);
  s.topFiles.forEach((f, i) => {
    const name = f.file.replace(`${process.cwd()}/`, '');
    const tokensLabel =
      f.count > 1
        ? `~${f.avgTokens} tokens/read, ~${f.totalTokens} total`
        : `~${f.totalTokens} tokens`;
    console.log(`  ${i + 1}. ${name} (${f.count}x, ${tokensLabel})`);
  });

  console.log(`\n• Context Growth Trajectory:`);
  s.turnMilestones.slice(0, 8).forEach((m) => {
    const prefix = m.tokensSource === 'telemetry' ? '' : '~';
    const label =
      m.tokensSource === 'telemetry'
        ? 'context tokens'
        : 'tokens in conversation history';
    const turnPad = String(m.turn).padStart(2);
    const stepPad = String(m.step).padStart(3);
    const tokStr = m.estTokens.toLocaleString();
    console.log(
        `  - Turn ${turnPad} (Step ${stepPad}): ${prefix}${tokStr} ${label}`,
    );
  });

  console.log(`\n${line}\n`);
}

/**
 * CLI entrypoint for resolving, parsing, and reporting a session transcript.
 *
 * @return {!Promise<void>}
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const isJson = args.includes('--json');
  const isSummary = args.includes('--summary');
  const target = args.find((a) => !a.startsWith('--'));

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
      : path.join(
          DEFAULT_BASE_DIR,
          'brain',
          convId,
          '.system_generated',
          'logs',
          'transcript.jsonl',
      );
    const canFallback =
      !target.endsWith('.jsonl') ||
      path.basename(transcriptPath) === 'transcript_full.jsonl';
    if (canFallback && fs.existsSync(compactPath)) {
      transcriptPath = compactPath;
    } else {
      console.error(`Error: Transcript not found for session ${convId}`);
      console.error(`Looked in: ${transcriptPath}`);
      if (compactPath !== transcriptPath) {
        console.error(`Looked in: ${compactPath}`);
      }
      console.error(
          '\nTip: If running inside antigravity-cli sandbox, inspecting ' +
          'external sessions requires \'BypassSandbox: true\' or passing a ' +
          'direct path to the transcript file.',
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

const isDirectExecution = (() => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
  });
}
