import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveTarget,
  parseTranscript,
  formatDuration,
  printReport,
} from '../agent/inspect-session.mjs';

test('resolveTarget extracts last UUID from multi-UUID paths', () => {
  const firstUuid = '11111111-1111-4111-8111-111111111111';
  const lastUuid = '22222222-2222-4222-8222-222222222222';
  const target =
    `/tmp/${firstUuid}/brain/${lastUuid}/.system_generated/logs/` +
    'transcript.jsonl';

  const resolved = resolveTarget(target);
  assert.equal(resolved.convId, lastUuid);
  assert.equal(resolved.transcriptPath, target);
});

test(
    'parseTranscript tracks modern tools, unquotes args, correlates ' +
    'GENERIC reads, accumulates tokens, and captures multi-turn durations',
    async () => {
      const tmpDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'inspect-session-test-'),
      );
      const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
      const convId = '33333333-3333-4333-8333-333333333333';

      const lines = [
        JSON.stringify({
          step_index: 0,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          created_at: '2026-11-13T10:00:00Z',
          content:
            '<USER_REQUEST>\nInitial request\n</USER_REQUEST>\n' +
            '<USER_SETTINGS_CHANGE>\nThe user changed setting ' +
            '`Model Selection` from None to Gemini 4 Hydrogen (Medium). ' +
            'No need to comment.\n</USER_SETTINGS_CHANGE>',
        }),
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-11-13T10:00:05Z',
          input_tokens: 1000,
          cache_read_tokens: 500,
          output_tokens: 50,
          tool_calls: [
            { name: 'read_file', args: { Path: '"/repo/src/a.ts"' } },
            { name: 'run_command', args: { CommandLine: '"npm run lint"' } },
          ],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'GENERIC',
          status: 'DONE',
          created_at: '2026-11-13T10:00:06Z',
          content: 'line 1\nline 2\nline 3',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'GENERIC',
          status: 'DONE',
          created_at: '2026-11-13T10:00:10Z',
          content: 'Command exited with code 0.',
        }),
        // Resumed turn 10 minutes later with model switch and file edits.
        JSON.stringify({
          step_index: 4,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          created_at: '2026-11-13T10:10:00Z',
          content:
            '<USER_REQUEST>\nFollow-up request\n</USER_REQUEST>\n' +
            '<USER_SETTINGS_CHANGE>\nThe user changed setting ' +
            '`Model Selection` from Gemini 4 Hydrogen (Medium) to ' +
            'Gemini 4 Hydrogen (High).\n</USER_SETTINGS_CHANGE>',
        }),
        JSON.stringify({
          step_index: 5,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-11-13T10:10:15Z',
          input_tokens: 400,
          cache_read_tokens: 1500,
          output_tokens: 80,
          tool_calls: [
            {
              name: 'write_file',
              args: {
                Path: '"/repo/src/b.ts"',
                Content: '"export const x = 1;"',
              },
            },
            {
              name: 'edit_file',
              args: {
                Path: '"/repo/src/a.ts"',
                Replacement: '"export const y = 2;"',
              },
            },
          ],
        }),
        JSON.stringify({
          step_index: 6,
          source: 'MODEL',
          type: 'GENERIC',
          status: 'DONE',
          created_at: '2026-11-13T10:10:16Z',
          content: 'Wrote file.',
        }),
        JSON.stringify({
          step_index: 7,
          source: 'MODEL',
          type: 'GENERIC',
          status: 'DONE',
          created_at: '2026-11-13T10:10:20Z',
          content: 'Edited file.',
        }),
      ];

      fs.writeFileSync(transcriptPath, `${lines.join('\n')}\n`, 'utf8');

      try {
        const stats = await parseTranscript(transcriptPath, convId, null);

        // 1. Modern tools, unquoted paths, and correlated read_file chars.
        assert.equal(stats.toolDistribution.read_file, 1);
        assert.equal(stats.toolDistribution.write_file, 1);
        assert.equal(stats.toolDistribution.edit_file, 1);
        assert.equal(stats.topFiles.length, 1);
        assert.equal(stats.topFiles[0].file, '/repo/src/a.ts');
        assert.equal(
            stats.topFiles[0].totalChars,
            'line 1\nline 2\nline 3'.length,
        );

        // 2. Artifacts created from write_file and edit_file.
        assert.equal(stats.artifactsCreated.length, 2);
        assert.equal(stats.artifactsCreated[0].file, '/repo/src/b.ts');
        assert.equal(stats.artifactsCreated[1].file, '/repo/src/a.ts');

        // 3. Real token telemetry.
        assert.equal(stats.tokens.source, 'telemetry');
        assert.equal(stats.tokens.inputTokens, 1400);
        assert.equal(stats.tokens.cacheReadTokens, 2000);
        assert.equal(stats.tokens.outputTokens, 130);
        assert.equal(stats.tokens.peakContextTokens, 1900);
        assert.equal(stats.tokens.cumulativeTokensProcessed, 3530);

        // 4. Multi-turn prompts and durations.
        assert.equal(stats.prompts.length, 2);
        assert.equal(stats.prompts[0].prompt, 'Initial request');
        assert.equal(stats.prompts[0].model, 'Gemini 4 Hydrogen (Medium)');
        assert.equal(stats.prompts[1].prompt, 'Follow-up request');
        assert.equal(stats.prompts[1].model, 'Gemini 4 Hydrogen (High)');
        assert.equal(stats.model, 'Gemini 4 Hydrogen (High)');
        assert.equal(stats.durationSeconds, 620);
        assert.equal(stats.activeDurationSeconds, 30);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
);

test(
    'formatDuration formats seconds, minutes, hours, and non-positive inputs',
    () => {
      assert.equal(formatDuration(0), '0s');
      assert.equal(formatDuration(-5), '0s');
      assert.equal(formatDuration(45), '45s');
      assert.equal(formatDuration(120), '2m');
      assert.equal(formatDuration(620), '10m 20s');
      assert.equal(formatDuration(3665), '1h 1m 5s');
    },
);

test(
    'parseTranscript falls back to estimated tokens and legacy tools',
    async () => {
      const tmpDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'inspect-session-legacy-'),
      );
      const transcriptPath = path.join(tmpDir, 'transcript_full.jsonl');
      const convId = '44444444-4444-4444-8444-444444444444';

      const lines = [
        JSON.stringify({
          step_index: 0,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          created_at: '2026-11-13T10:00:00Z',
          content: '<USER_REQUEST>\nLegacy session\n</USER_REQUEST>',
        }),
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          created_at: '2026-11-13T10:00:10Z',
          tool_calls: [
            { name: 'view_file', args: { AbsolutePath: '/repo/legacy.ts' } },
            {
              name: 'write_to_file',
              args: { TargetFile: '/repo/out.md', CodeContent: 'hello world' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'GENERIC',
          created_at: '2026-11-13T10:00:12Z',
          content: 'File Path: `file:///repo/legacy.ts`\nconst a = 1;',
        }),
      ];

      fs.writeFileSync(transcriptPath, `${lines.join('\n')}\n`, 'utf8');

      try {
        const stats = await parseTranscript(transcriptPath, convId, null);
        assert.equal(stats.tokens.source, 'estimated');
        assert.ok(stats.tokens.peakContextTokens > 0);
        assert.ok(stats.tokens.cumulativeTokensProcessed > 0);
        assert.equal(stats.toolDistribution.view_file, 1);
        assert.equal(stats.toolDistribution.write_to_file, 1);
        assert.equal(stats.topFiles[0].file, '/repo/legacy.ts');
        assert.equal(stats.artifactsCreated[0].file, '/repo/out.md');
        assert.equal(stats.artifactsCreated[0].chars, 'hello world'.length);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
);

test(
    'printReport renders telemetry metrics and multi-turn breakdown',
    () => {
      const output = [];
      const origLog = console.log;
      console.log = (...args) => output.push(args.join(' '));
      try {
        printReport(
            {
              conversationId: '55555555-5555-4555-8555-555555555555',
              model: 'Gemini 4 Hydrogen (High)',
              durationSeconds: 620,
              activeDurationSeconds: 30,
              durationMinutes: 10,
              totalSteps: 8,
              totalTurns: 2,
              initialPrompt: 'Initial request',
              prompts: [
                {
                  step: 0,
                  prompt: 'Initial request',
                  model: 'Gemini 4 Hydrogen (Medium)',
                  durationSeconds: 10,
                },
                {
                  step: 4,
                  prompt: 'Follow-up request',
                  model: 'Gemini 4 Hydrogen (High)',
                  durationSeconds: 20,
                },
              ],
              tokens: {
                source: 'telemetry',
                inputTokens: 1400,
                cacheReadTokens: 2000,
                outputTokens: 130,
                peakContextTokens: 1900,
                peakContextChars: 40000,
                cumulativeTokensProcessed: 3530,
                thinkingTokens: 100,
                thinkingChars: 360,
              },
              toolDistribution: { read_file: 1 },
              artifactsCreated: [],
              redundancies: { files: [], commands: [] },
              topFiles: [
                {
                  file: '/repo/src/a.ts',
                  count: 1,
                  avgTokens: 10,
                  totalTokens: 10,
                },
              ],
              turnMilestones: [
                {
                  turn: 1,
                  step: 1,
                  estTokens: 1500,
                  tokensSource: 'telemetry',
                },
              ],
            },
            false,
        );
      } finally {
        console.log = origLog;
      }

      const rendered = output.join('\n');
      assert.match(
          rendered,
          /10m 20s wall-clock \(30s active across 2 prompts\)/,
      );
      assert.match(rendered, /Token & Context Metrics \(telemetry\)/);
      assert.match(rendered, /User Turns \(2 prompts\)/);
      assert.match(
          rendered,
          /\[Step 4\] Gemini 4 Hydrogen \(High\) \(20s\)/,
      );
    },
);

test(
    'printReport handles null and undefined prompts without throwing',
    () => {
      const output = [];
      const origLog = console.log;
      console.log = (...args) => output.push(args.join(' '));
      const longPrompt = 'a'.repeat(75);
      const shortPrompt = 'short prompt';
      try {
        printReport(
            {
              conversationId: '66666666-6666-4666-8666-666666666666',
              model: 'Gemini 4 Hydrogen (High)',
              durationSeconds: 40,
              activeDurationSeconds: 40,
              totalSteps: 6,
              totalTurns: 4,
              initialPrompt: null,
              prompts: [
                {
                  step: 0,
                  prompt: null,
                  model: 'Gemini 4 Hydrogen (High)',
                  durationSeconds: 10,
                },
                {
                  step: 2,
                  prompt: undefined,
                  model: 'Gemini 4 Hydrogen (High)',
                  durationSeconds: 10,
                },
                {
                  step: 4,
                  prompt: shortPrompt,
                  model: 'Gemini 4 Hydrogen (High)',
                  durationSeconds: 10,
                },
                {
                  step: 6,
                  prompt: longPrompt,
                  model: 'Gemini 4 Hydrogen (High)',
                  durationSeconds: 10,
                },
              ],
              tokens: {
                source: 'estimated',
                peakContextTokens: 1000,
                peakContextChars: 3600,
                cumulativeTokensProcessed: 2000,
                thinkingTokens: 0,
                thinkingChars: 0,
              },
              toolDistribution: {},
              artifactsCreated: [],
              redundancies: { files: [], commands: [] },
              topFiles: [],
              turnMilestones: [],
            },
            true,
        );
      } finally {
        console.log = origLog;
      }

      const rendered = output.join('\n');
      assert.match(
          rendered,
          /\[Step 0\] Gemini 4 Hydrogen \(High\) \(10s\): ""/,
      );
      assert.match(
          rendered,
          /\[Step 2\] Gemini 4 Hydrogen \(High\) \(10s\): ""/,
      );
      assert.match(
          rendered,
          /\[Step 4\] Gemini 4 Hydrogen \(High\) \(10s\): "short prompt"/,
      );
      assert.match(
          rendered,
          new RegExp(
              `\\[Step 6\\] Gemini 4 Hydrogen \\(High\\) \\(10s\\): ` +
              `"${'a'.repeat(70)}\\.\\.\\."`,
          ),
      );
    },
);
