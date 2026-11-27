import type { ProviderId } from '../../shared/schemas';
import type { ProviderStatus } from '../../shared/api';
import { getEnv, getProviderModelPolicy } from '../config';
import { apinexProvider } from './apinex';
import { customProvider } from './custom';
import { geminiProvider } from './gemini';
import { mockProvider } from './mock';
import { nousProvider } from './nous';
import { openrouterProvider } from './openrouter';
import type { LLMProvider } from './types';

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  mock: mockProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
  nous: nousProvider,
  apinex: apinexProvider,
  custom: customProvider,
};

export function getProvider(id: ProviderId): LLMProvider | undefined {
  return PROVIDERS[id];
}

export function listStatus(): ProviderStatus[] {
  const env = getEnv();
  return (Object.values(PROVIDERS) as LLMProvider[]).map((provider) => {
    let keyDetected = false;
    if (provider.id === 'mock') keyDetected = true;
    if (provider.id === 'gemini') {
      keyDetected = env.geminiApiKey.length > 0 && env.geminiApiKey !== 'MY_GEMINI_API_KEY';
    }
    if (provider.id === 'openrouter') keyDetected = env.openrouterApiKey.length > 0;
    if (provider.id === 'nous') keyDetected = provider.isAvailable();
    if (provider.id === 'apinex') keyDetected = env.apinexApiKey.length > 0;
    if (provider.id === 'custom') keyDetected = env.customApiKey.length > 0;

    return {
      id: provider.id,
      name: provider.name,
      keyDetected,
      available: provider.isAvailable(),
      tested: provider.isTested(),
      statusNote: provider.statusNote(),
      capabilities: { ...provider.capabilities },
      modelPolicy: getProviderModelPolicy(provider.id, env),
    };
  });
}
