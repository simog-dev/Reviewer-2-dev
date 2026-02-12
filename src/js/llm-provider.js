/**
 * LLM Provider abstraction layer.
 * Add new providers by extending LLMProvider and registering in createLLMProvider().
 */

import { GoogleGenerativeAI } from '../../node_modules/@google/generative-ai/dist/index.mjs';

const DEFAULT_PROMPT = `You are a thorough academic paper reviewer. Based on the annotations below from a paper I'm reviewing, generate a comprehensive written review. Group findings by severity (Critical first, then Major, Minor, Suggestion, Question). For each finding, reference the page number and quoted text. Be specific, constructive, and actionable. End with a brief summary of overall quality. Output plain text, no markdown.`;

const DEFAULT_TEMPERATURE = 0.7;

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
}

/**
 * Google Gemini provider via @google/generative-ai SDK
 */
export class GoogleGeminiProvider extends LLMProvider {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    const genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: this.temperature,
      },
    });
  }

  async generateReview(annotations, pdfTitle) {
    const annotationsText = this._formatAnnotations(annotations);

    const result = await this.model.generateContent({
      systemInstruction: this.prompt,
      contents: [
        {
          role: 'user',
          parts: [{ text: `PDF Title: ${pdfTitle}\n\nAnnotations:\n${annotationsText}` }],
        },
      ],
    });

    return result.response.text();
  }

  _formatAnnotations(annotations) {
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
}

/**
 * Factory: create a provider instance by name.
 * To add a new provider, import its class and add a case here.
 */
export function createLLMProvider(providerName, config) {
  switch (providerName) {
    case 'google':
      return new GoogleGeminiProvider(config.apiKey, {
        model: config.model,
        temperature: config.temperature,
        prompt: config.prompt,
      });
    default:
      throw new Error(`Unknown LLM provider: "${providerName}". Supported: google`);
  }
}
