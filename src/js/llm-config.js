export const DEFAULT_PROMPT = `You are a thorough academic paper reviewer. Based on the annotations below from a paper I'm reviewing, generate a comprehensive written review. Group findings by severity (Critical first, then Major, Minor, Suggestion, Question). For each finding, reference the page number and quoted text. Be specific, constructive, and actionable. End with a brief summary of overall quality. Output plain text, no markdown.`;

export const DEFAULT_TEMPERATURE = 0.7;

export const LLM_PROVIDER_DEFINITIONS = [
  {
    id: 'google',
    label: 'Google Gemini',
    adapter: 'google-gemini',
    defaultModel: 'gemini-2.5-flash',
    apiKeyPlaceholder: 'Enter your Google Gemini API key...',
    modelPlaceholder: 'e.g. gemini-2.5-flash',
    apiKeyHelp: {
      text: 'Get a key at',
      label: 'Google AI Studio',
      url: 'https://aistudio.google.com/app/apikey'
    },
    modelHelp: {
      text: 'See available models at',
      label: 'Google Gemini API docs',
      url: 'https://ai.google.dev/gemini-api/docs/models'
    }
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: 'openai-compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '~openai/gpt-latest',
    apiKeyPlaceholder: 'Enter your OpenRouter API key...',
    modelPlaceholder: 'e.g. ~openai/gpt-latest or anthropic/claude-sonnet-4',
    apiKeyHelp: {
      text: 'Create or manage keys in',
      label: 'OpenRouter settings',
      url: 'https://openrouter.ai/settings/keys'
    },
    modelHelp: {
      text: 'Browse model slugs in',
      label: 'OpenRouter models',
      url: 'https://openrouter.ai/models'
    }
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    adapter: 'openai-compatible',
    supportsCustomBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    apiKeyPlaceholder: 'Enter the API key for your OpenAI-compatible endpoint...',
    modelPlaceholder: 'e.g. gpt-4.1-mini, llama-3.1-8b-instruct, local-model',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    apiKeyHelp: {
      text: 'Use a key from the service behind your OpenAI-compatible endpoint.'
    },
    modelHelp: {
      text: 'Use the exact model ID supported by your endpoint.'
    },
    baseUrlHelp: {
      text: 'Base URL must point to the API root, for example https://api.openai.com/v1 or http://localhost:1234/v1.'
    }
  }
];

export function getLLMProviderDefinition(providerId) {
  return LLM_PROVIDER_DEFINITIONS.find(provider => provider.id === providerId) || null;
}

export function getDefaultLLMProviderId() {
  return LLM_PROVIDER_DEFINITIONS[0].id;
}

export function getSupportedLLMProviderLabels() {
  return LLM_PROVIDER_DEFINITIONS.map(provider => provider.label).join(', ');
}
