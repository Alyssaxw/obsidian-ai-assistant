import { Editor } from 'obsidian';

/**
 * 在指定行后插入 AI callout 块
 * 格式：> [!ai]+ 可折叠
 *       > AI 回复内容...
 */
export function insertAICallout(editor: Editor, lineNumber: number, content: string) {
  // 转义内容中的 > 符号，防止破坏 callout 格式
  const escapedContent = content
    .split('\n')
    .map(line => line.replace(/^>/, '\\>'))
    .join('\n');

  // 构建 callout 块
  // 使用 > [!ai]+ 表示可折叠的 AI callout
  const calloutBlock = `\n> [!ai]+\n${escapedContent.split('\n').map(line => `> ${line}`).join('\n')}\n`;

  // 在当前行后插入
  const insertPos = {
    line: lineNumber,
    ch: editor.getLine(lineNumber).length,
  };

  editor.replaceRange(calloutBlock, insertPos);
}

/**
 * 简单插入（非折叠式）
 */
export function insertAISimple(editor: Editor, lineNumber: number, content: string) {
  const escapedContent = content
    .split('\n')
    .map(line => line.replace(/^>/, '\\>'))
    .join('\n');

  const calloutBlock = `\n> [!ai]\n${escapedContent.split('\n').map(line => `> ${line}`).join('\n')}\n`;

  const insertPos = {
    line: lineNumber,
    ch: editor.getLine(lineNumber).length,
  };

  editor.replaceRange(calloutBlock, insertPos);
}