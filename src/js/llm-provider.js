import { GoogleGenerativeAI } from '../vendor/@google/generative-ai/index.mjs';
import {
  DEFAULT_PROMPT,
  DEFAULT_TEMPERATURE,
  getLLMProviderDefinition,
  getSupportedLLMProviderLabels
} from './llm-config.js';

/**
 * Base class for LLM providers.
 * Subclass and implement `generateReview()` for each supported provider.
 */
export class LLMProvider {
  constructor(apiKey, { model, temperature, prompt } = {}) {
    if (!apiKey) throw new Error('API key is required');
    if (!model) throw new Error('Model name is required');
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature !== undefined ? temperature : DEFAULT_TEMPERATURE;
    this.prompt = prompt || DEFAULT_PROMPT;
  }

  async generateReview(annotations, pdfTitle) {
    throw new Error('generateReview() must be implemented by subclass');
  }

  buildReviewUserMessage(annotations, pdfTitle) {
    return `PDF Title: ${pdfTitle}\n\nAnnotations:\n${formatAnnotations(annotations)}`;
  }
}

/**
 * Google Gemini provider via @google/generative-ai SDK
 */
export class GoogleGeminiProvider extends LLMProvider {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    const genAI = new GoogleGenerativeAI(this.apiKey);
    this.client = genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: this.temperature,
      },
    });
  }

  async generateReview(annotations, pdfTitle) {
    const result = await this.client.generateContent({
      systemInstruction: this.prompt,
      contents: [
        {
          role: 'user',
          parts: [{ text: this.buildReviewUserMessage(annotations, pdfTitle) }],
        },
      ],
    });

    return result.response.text();
  }
}

export class OpenAICompatibleProvider extends LLMProvider {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.providerLabel = options.providerLabel || 'OpenAI-compatible provider';
    this.baseUrl = normalizeOpenAICompatibleBaseUrl(options.baseUrl);
    this.extraHeaders = options.extraHeaders || {};
  }

  async generateReview(annotations, pdfTitle) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...this.extraHeaders
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        messages: [
          { role: 'system', content: this.prompt },
          { role: 'user', content: this.buildReviewUserMessage(annotations, pdfTitle) }
        ]
      })
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(`${this.providerLabel} request failed (${response.status}): ${extractErrorMessage(payload)}`);
    }

    const content = extractChatCompletionText(payload);
    if (!content) {
      throw new Error(`${this.providerLabel} returned an empty response`);
    }

    return content;
  }
}

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey, options = {}) {
    super(apiKey, {
      ...options,
      providerLabel: 'OpenRouter',
      baseUrl: options.baseUrl || 'https://openrouter.ai/api/v1',
      extraHeaders: {
        'X-OpenRouter-Title': 'Reviewer 2',
        ...options.extraHeaders
      }
    });
  }
}

export function formatAnnotations(annotations) {
  const grouped = {};
  for (const ann of annotations) {
    const cat = ann.category_name || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ann);
  }

  const categoryOrder = ['Critical', 'Major', 'Minor', 'Suggestion', 'Question'];
  const lines = [];

  for (const cat of categoryOrder) {
    if (!grouped[cat]) continue;
    lines.push(`\n--- ${cat.toUpperCase()} ---`);
    for (const ann of grouped[cat]) {
      lines.push(`[Page ${ann.page_number}]`);
      lines.push(`  Text: "${ann.selected_text}"`);
      if (ann.comment) lines.push(`  Comment: ${ann.comment}`);
    }
  }

  for (const cat of Object.keys(grouped)) {
    if (!categoryOrder.includes(cat)) {
      lines.push(`\n--- ${cat.toUpperCase()} ---`);
      for (const ann of grouped[cat]) {
        lines.push(`[Page ${ann.page_number}]`);
        lines.push(`  Text: "${ann.selected_text}"`);
        if (ann.comment) lines.push(`  Comment: ${ann.comment}`);
      }
    }
  }

  return lines.join('\n');
}

function normalizeOpenAICompatibleBaseUrl(baseUrl) {
  const rawBaseUrl = (baseUrl || '').trim();
  if (!rawBaseUrl) throw new Error('Base URL is required for this provider');

  let parsed;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error('Base URL must be a valid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Base URL must start with http:// or https://');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol === 'http:' && !isLocalhost) {
    throw new Error('HTTP base URLs are only allowed for localhost endpoints');
  }

  parsed.search = '';
  parsed.hash = '';

  const chatCompletionsSuffix = /\/chat\/completions\/?$/;
  if (chatCompletionsSuffix.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(chatCompletionsSuffix, '');
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/+$/, '');
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      return { error: { message: text } };
    }
    throw new Error('Provider returned a non-JSON response');
  }
}

function extractErrorMessage(payload) {
  if (!payload) return 'No error details returned';
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (payload.message) return payload.message;
  return 'Unknown provider error';
}

function extractChatCompletionText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join('')
      .trim();
  }

  if (typeof payload?.choices?.[0]?.text === 'string') {
    return payload.choices[0].text.trim();
  }

  return '';
}

/**
 * Factory: create a provider instance by name.
 */
export function createLLMProvider(providerName, config) {
  const definition = getLLMProviderDefinition(providerName);
  if (!definition) {
    throw new Error(`Unknown LLM provider: "${providerName}". Supported: ${getSupportedLLMProviderLabels()}`);
  }

  const providerConfig = {
    ...config,
    model: config.model || definition.defaultModel
  };

  switch (definition.adapter) {
    case 'google-gemini':
      return new GoogleGeminiProvider(providerConfig.apiKey, {
        model: providerConfig.model,
        temperature: config.temperature,
        prompt: config.prompt,
      });
    case 'openai-compatible':
      if (definition.id === 'openrouter') {
        return new OpenRouterProvider(providerConfig.apiKey, {
          model: providerConfig.model,
          temperature: providerConfig.temperature,
          prompt: providerConfig.prompt,
          baseUrl: definition.defaultBaseUrl
        });
      }

      return new OpenAICompatibleProvider(providerConfig.apiKey, {
        model: providerConfig.model,
        temperature: providerConfig.temperature,
        prompt: providerConfig.prompt,
        baseUrl: providerConfig.baseUrl || definition.defaultBaseUrl,
        providerLabel: definition.label
      });
    default:
      throw new Error(`Unsupported LLM adapter: "${definition.adapter}"`);
  }
}
