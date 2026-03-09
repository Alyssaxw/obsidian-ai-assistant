import { requestUrl } from 'obsidian';

export type AIModel = 'openai' | 'claude' | 'gemini' | 'openrouter' | 'bedrock';

export interface ModelInfo {
  name: string;
  defaultEndpoint: string;
  defaultModel: string;
}

export function getModelInfo(model: AIModel): ModelInfo {
  const models: Record<AIModel, ModelInfo> = {
    openai: {
      name: 'OpenAI',
      defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
      defaultModel: 'gpt-4o',
    },
    claude: {
      name: 'Claude (Anthropic)',
      defaultEndpoint: 'https://api.anthropic.com/v1/messages',
      defaultModel: 'claude-sonnet-4-20250514',
    },
    gemini: {
      name: 'Google Gemini',
      defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      defaultModel: 'gemini-2.0-flash',
    },
    openrouter: {
      name: 'OpenRouter',
      defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      defaultModel: 'openai/gpt-4o',
    },
    bedrock: {
      name: 'AWS Bedrock',
      defaultEndpoint: '',
      defaultModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
    },
  };
  return models[model];
}

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  context: string;
}

interface AIClientOptions {
  model: AIModel;
  apiKey: string;
  apiEndpoint?: string;
  customModelId?: string;
}

export class AIClient {
  private model: AIModel;
  private apiKey: string;
  private apiEndpoint: string;
  private customModelId: string;

  constructor(options: AIClientOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.customModelId = (options.customModelId || getModelInfo(options.model).defaultModel).trim();

    // 如果提供了自定义 endpoint，使用它；否则使用默认
    if (options.apiEndpoint) {
      let endpoint = options.apiEndpoint.replace(/\/+$/, ''); // 去掉末尾斜杠
      // OpenAI 兼容格式：自动补全 /v1/chat/completions 路径
      if (options.model === 'openai' || options.model === 'openrouter') {
        if (!endpoint.endsWith('/chat/completions')) {
          if (!endpoint.endsWith('/v1')) {
            endpoint += '/v1';
          }
          endpoint += '/chat/completions';
        }
      }
      // Claude 格式：自动补全 /v1/messages 路径
      if (options.model === 'claude') {
        if (!endpoint.endsWith('/messages')) {
          if (!endpoint.endsWith('/v1')) {
            endpoint += '/v1';
          }
          endpoint += '/messages';
        }
      }
      this.apiEndpoint = endpoint;
    } else {
      const modelInfo = getModelInfo(options.model);
      this.apiEndpoint = modelInfo.defaultEndpoint;

      // Gemini 需要特殊的端点格式
      if (options.model === 'gemini') {
        this.apiEndpoint = `${modelInfo.defaultEndpoint}/${this.customModelId}:generateContent?key=${this.apiKey}`;
      }
    }
  }

  async chat(request: AIRequest): Promise<string> {
    // 限制 context 长度，避免 token 过多导致超时
    const maxContextLen = 8000;
    const context = request.context.length > maxContextLen
      ? request.context.slice(0, maxContextLen) + '\n\n... (内容已截断)'
      : request.context;
    const combinedPrompt = `以下是笔记的完整内容：\n\n${context}\n\n---\n\n用户的问题：${request.userPrompt}`;

    const systemMessage = request.systemPrompt;

    switch (this.model) {
      case 'openai':
        return this.callOpenAI(systemMessage, combinedPrompt);
      case 'claude':
        return this.callClaude(systemMessage, combinedPrompt);
      case 'gemini':
        return this.callGemini(systemMessage, combinedPrompt);
      case 'openrouter':
        return this.callOpenRouter(systemMessage, combinedPrompt);
      case 'bedrock':
        return this.callBedrock(systemMessage, combinedPrompt);
      default:
        throw new Error(`不支持的模型: ${this.model}`);
    }
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await requestUrl({
      url: this.apiEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.customModelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI API error: ${response.text}`);
    }

    const data = JSON.parse(response.text);
    return data.choices[0]?.message?.content || 'No response';
  }

  private async callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await requestUrl({
      url: this.apiEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.customModelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Claude API error: ${response.text}`);
    }

    const data = JSON.parse(response.text);
    return data.content[0]?.text || 'No response';
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    // Gemini 的 endpoint 已经包含了 API key
    const response = await requestUrl({
      url: this.apiEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `System: ${systemPrompt}\n\nUser: ${userPrompt}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Gemini API error: ${response.text}`);
    }

    const data = JSON.parse(response.text);
    return data.candidates[0]?.content?.parts[0]?.text || 'No response';
  }

  private async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
    const requestBody = {
      model: this.customModelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    console.log('OpenRouter request:', this.apiEndpoint, 'model:', this.customModelId);

    const response = await requestUrl({
      url: this.apiEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://obsidian.md',
        'X-Title': 'Obsidian AI Assistant',
      },
      body: JSON.stringify(requestBody),
      throw: false,
    });

    console.log('OpenRouter response:', response.status, response.text);

    if (response.status !== 200) {
      throw new Error(`OpenRouter API error (${response.status}): ${response.text}`);
    }

    const data = JSON.parse(response.text);
    return data.choices[0]?.message?.content || 'No response';
  }

  private async callBedrock(systemPrompt: string, userPrompt: string): Promise<string> {
    // AWS Bedrock 需要 AWS 签名，这里简化处理
    // 实际使用时需要使用 @aws-sdk/client-bedrock-runtime
    throw new Error('AWS Bedrock 需要额外的 AWS SDK 配置，请使用 OpenRouter 或其他模型');
  }
}