import { App, Plugin, PluginSettingTab, Editor, MarkdownView, Notice, Modal, Setting, setIcon } from 'obsidian';
import { AIClient, AIModel, getModelInfo } from './src/ai-client';
import { insertAICallout } from './src/insert';

interface AIAssistantSettings {
  model: AIModel;
  apiKey: string;
  apiEndpoint: string;
  customModelId: string;
  systemPrompt: string;
}

const DEFAULT_SETTINGS: AIAssistantSettings = {
  model: 'openai',
  apiKey: '',
  apiEndpoint: '',
  customModelId: '',
  systemPrompt: 'You are a helpful AI assistant helping with note-taking. Respond in the same language as the user.',
};

export default class AIAssistantPlugin extends Plugin {
  settings: AIAssistantSettings = DEFAULT_SETTINGS;
  aiClient: AIClient | null = null;

  async onload() {
    await this.loadSettings();

    // 加载样式
    const styleEl = document.createElement('style'); styleEl.textContent = `
      .callout[data-callout="ai"] {
        background-color: rgba(99, 102, 241, 0.1);
        border-left-color: #6366f1;
      }
      .callout[data-callout="ai"] .callout-title {
        color: #6366f1;
        font-weight: 600;
      }
    `; document.head.appendChild(styleEl);

    // 注册设置面板
    this.addSettingTab(new AIAssistantSettingTab(this.app, this));

    // 注册命令
    this.addCommand({
      id: 'ai-assistant-ask',
      name: 'Ask AI',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.handleAICommand(editor, view);
      },
    });

    // 注册 @ai 触发器
    this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor) => {
      this.checkForAITrigger(editor);
    }));

    console.log('AI Assistant plugin loaded');
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
    this.initAIClient();
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.initAIClient();
  }

  initAIClient() {
    if (!this.settings.apiKey) {
      this.aiClient = null;
      return;
    }
    this.aiClient = new AIClient({
      model: this.settings.model,
      apiKey: this.settings.apiKey,
      apiEndpoint: this.settings.apiEndpoint,
      customModelId: this.settings.customModelId,
    });
  }

  private lastCheckedLine = -1;

  checkForAITrigger(editor: Editor) {
    const cursor = editor.getCursor();
    const currentLine = cursor.line;

    // 检测用户是否换行了（意味着上一行写完了）
    if (this.lastCheckedLine >= 0 && currentLine === this.lastCheckedLine + 1) {
      const prevLine = editor.getLine(this.lastCheckedLine);
      const match = prevLine.match(/^@ai\s+(.+)$/);
      if (match) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          this.handleAICommand(editor, view, this.lastCheckedLine);
        }
      }
    }

    this.lastCheckedLine = currentLine;
  }

  async handleAICommand(editor: Editor, view: MarkdownView, triggerLine?: number) {
    const lineNum = triggerLine ?? editor.getCursor().line;
    const line = editor.getLine(lineNum);

    // 提取 prompt
    const promptMatch = line.match(/@ai\s+(.+)$/);
    if (!promptMatch) {
      new Notice('请输入 @ai 后跟你的问题，例如：@ai 帮我总结这篇文章');
      return;
    }

    const prompt = promptMatch[1].trim();

    if (!this.aiClient) {
      new Notice('请先在设置中配置 API Key');
      this.openSettings();
      return;
    }

    // 获取当前文件内容作为 context
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('请先打开一个文件');
      return;
    }

    const content = await this.app.vault.read(file);

    new Notice('AI 正在处理...');

    try {
      const response = await this.aiClient.chat({
        systemPrompt: this.settings.systemPrompt,
        userPrompt: prompt,
        context: content,
      });

      // 在当前行后插入 AI 回复
      insertAICallout(editor, lineNum, response);

      new Notice('AI 回复已插入');
    } catch (error) {
      console.error('AI request failed:', error);
      new Notice(`AI 请求失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  openSettings() {
    // 打开 Obsidian 设置面板并跳转到本插件
    (this.app as any).setting?.open();
    (this.app as any).setting?.openTabById?.(this.manifest.id);
  }

  onunload() {
    console.log('AI Assistant plugin unloaded');
  }
}

class AIAssistantSettingTab extends PluginSettingTab {
  plugin: AIAssistantPlugin;

  constructor(app: App, plugin: AIAssistantPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'AI Assistant 设置' });

    // 模型选择
    new Setting(containerEl)
      .setName('模型')
      .setDesc('选择 AI 模型')
      .addDropdown((dropdown) => {
        const models: AIModel[] = ['openai', 'claude', 'gemini', 'openrouter', 'bedrock'];
        models.forEach((model) => {
          dropdown.addOption(model, getModelInfo(model).name);
        });
        dropdown.setValue(this.plugin.settings.model);
        dropdown.onChange((value) => {
          this.plugin.settings.model = value as AIModel;
          this.plugin.saveSettings();
        });
      });

    // API Key
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('输入你的 API Key')
      .addText((text) => {
        text.setValue(this.plugin.settings.apiKey);
        text.onChange((value) => {
          this.plugin.settings.apiKey = value;
        });
        text.inputEl.type = 'password';
      });

    // API Endpoint (可选)
    new Setting(containerEl)
      .setName('API Endpoint (可选)')
      .setDesc('自定义 API 端点，用于代理或 OpenRouter 等')
      .addText((text) => {
        text.setValue(this.plugin.settings.apiEndpoint);
        text.onChange((value) => {
          this.plugin.settings.apiEndpoint = value;
        });
      });

    // Custom Model ID (可选)
    new Setting(containerEl)
      .setName('Custom Model ID (可选)')
      .setDesc('自定义模型 ID，如 gpt-4o、claude-3-opus 等')
      .addText((text) => {
        text.setValue(this.plugin.settings.customModelId);
        text.onChange((value) => {
          this.plugin.settings.customModelId = value;
        });
      });

    // System Prompt
    new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('设置 AI 的系统提示词')
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.systemPrompt);
        text.onChange((value) => {
          this.plugin.settings.systemPrompt = value;
        });
        text.inputEl.rows = 4;
      });

    // 保存按钮
    new Setting(containerEl)
      .addButton((button) => {
        button.setButtonText('保存设置');
        button.onClick(() => {
          this.plugin.saveSettings();
          new Notice('设置已保存');
        });
      });

    // 使用说明
    containerEl.createEl('h3', { text: '使用说明' });
    const guide = containerEl.createEl('div', { cls: 'setting-item-description' });
    guide.innerHTML = `
      <p><strong>触发方式：</strong>在笔记中输入 <code>@ai 你的问题</code> 然后按空格或 Enter</p>
      <p><strong>示例：</strong></p>
      <pre>@ai 帮我总结这篇文章的核心观点</pre>
      <p>AI 回复会以 callout 块的形式插入，方便区分和折叠。</p>
      <p><strong>支持的模型：</strong></p>
      <ul>
        <li>OpenAI (GPT-4o, GPT-4, GPT-3.5)</li>
        <li>Claude (Claude 4, Claude 3)</li>
        <li>Gemini</li>
        <li>OpenRouter (聚合多个模型)</li>
        <li>AWS Bedrock</li>
      </ul>
    `;
  }
}