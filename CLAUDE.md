# Obsidian AI Assistant

Obsidian 插件：在笔记中通过 `@ai` 触发 AI 问答，回复以 callout 形式插入。

## 项目结构

```
main.ts              # 插件主入口，注册命令、设置面板、@ai 触发器
src/ai-client.ts     # AI API 客户端，支持多模型
src/insert.ts        # callout 插入逻辑
styles.css           # AI callout 样式
esbuild.config.mjs   # 构建配置
manifest.json        # Obsidian 插件清单
```

## 支持的模型

- OpenAI（及兼容格式，如 CRS 代理）
- Claude (Anthropic)
- Google Gemini
- OpenRouter（聚合多模型）

## 开发

```bash
npm install
npm run build        # 生产构建
npm run dev          # 开发模式（带 sourcemap）
```

构建产物 `main.js` 需要和 `manifest.json`、`styles.css` 一起放到 Obsidian vault 的 `.obsidian/plugins/obsidian-ai-assistant/` 目录。

## Vault 路径

本地测试 vault：`~/Documents/01_Obsidian/xt-main/`

## 注意事项

- 自定义 endpoint 会自动补全路径（OpenAI 补 `/v1/chat/completions`，Claude 补 `/v1/messages`）
- Model ID 和 endpoint 会自动 trim 空格
- Context 限制 8000 字符，避免 token 过多导致超时
- API Key 由用户在插件设置中配置，不硬编码
