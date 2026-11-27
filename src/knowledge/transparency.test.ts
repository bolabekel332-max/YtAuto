import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_CAPABILITIES } from '../../shared/constants';
import { DEFAULT_KNOWLEDGE } from './blocks';
import { DEFAULT_MODEL_CONFIGS } from '../state/defaults';
import {
  buildKnowledgeTransparencyReport,
  getSearchCapableProviders,
} from './transparency';

test('buildKnowledgeTransparencyReport covers all 8 agents and honest external source status', () => {
  const report = buildKnowledgeTransparencyReport(DEFAULT_KNOWLEDGE, DEFAULT_MODEL_CONFIGS);

  assert.equal(report.agents.length, 8);
  const byId = new Map(report.agents.map((a) => [a.agentId, a]));

  const trends = report.externalSources.find((s) => s.id === 'trends_api');
  const wiki = report.externalSources.find((s) => s.id === 'wikipedia');
  assert.equal(trends?.status, 'not_connected');
  assert.equal(wiki?.status, 'not_connected');

  const researcher = byId.get('researcher');
  assert.ok(researcher);
  assert.deepEqual(
    researcher.injectedBlocks.map((b) => b.id),
    ['yt_surfaces', 'yt_longform', 'yt_shorts', 'tt_fyp']
  );
  assert.equal(researcher.searchStatus, 'active');

  const scriptwriter = byId.get('scriptwriter');
  assert.ok(scriptwriter);
  assert.equal(scriptwriter.searchStatus, 'not_used');
  assert.ok(scriptwriter.injectedBlocks.some((b) => b.id === 'quality_rules'));

  const compliance = byId.get('compliance');
  assert.ok(compliance);
  assert.deepEqual(
    compliance.injectedBlocks.map((b) => b.id),
    ['yt_inauthentic', 'ai_labels', 'monetization', 'quality_rules']
  );
  assert.equal(compliance.searchStatus, 'active');
});

test('buildKnowledgeTransparencyReport reflects live model config and mock/disabled search changes', () => {
  const updatedConfigs = DEFAULT_MODEL_CONFIGS.map((cfg) => {
    if (cfg.agentId === 'researcher') {
      return { ...cfg, providerId: 'mock' as const, model: 'mock-sim-v1' };
    }
    if (cfg.agentId === 'compliance') {
      return { ...cfg, useSearch: false };
    }
    return cfg;
  });

  const report = buildKnowledgeTransparencyReport(DEFAULT_KNOWLEDGE, updatedConfigs);
  const byId = new Map(report.agents.map((a) => [a.agentId, a]));

  assert.equal(byId.get('researcher')?.searchStatus, 'unsupported');
  assert.equal(byId.get('compliance')?.searchStatus, 'disabled');

  const webSearch = report.externalSources.find((s) => s.id === 'web_search');
  assert.equal(webSearch?.status, 'conditional');
});

test('V-08: getSearchCapableProviders dan laporan transparansi mengikuti perubahan PROVIDER_CAPABILITIES secara dinamis', () => {
  const defaultProviders = getSearchCapableProviders();
  assert.equal(defaultProviders.has('nous'), false);

  const augmentedCaps = {
    ...PROVIDER_CAPABILITIES,
    nous: { ...PROVIDER_CAPABILITIES.nous, search: true },
  };
  const augmentedProviders = getSearchCapableProviders(augmentedCaps);
  assert.equal(augmentedProviders.has('nous'), true);

  const configsWithNous = DEFAULT_MODEL_CONFIGS.map((cfg) =>
    cfg.agentId === 'researcher'
      ? { ...cfg, providerId: 'nous' as const, model: 'qwen/qwen4-max:free', useSearch: true }
      : cfg
  );

  const baseReport = buildKnowledgeTransparencyReport(DEFAULT_KNOWLEDGE, configsWithNous);
  assert.equal(
    baseReport.agents.find((a) => a.agentId === 'researcher')?.searchStatus,
    'unsupported'
  );

  const augmentedReport = buildKnowledgeTransparencyReport(
    DEFAULT_KNOWLEDGE,
    configsWithNous,
    augmentedCaps
  );
  assert.equal(
    augmentedReport.agents.find((a) => a.agentId === 'researcher')?.searchStatus,
    'active'
  );
  const webSearch = augmentedReport.externalSources.find((s) => s.id === 'web_search');
  assert.ok(webSearch?.name.includes('Nous Portal'));
});
