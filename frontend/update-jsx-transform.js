#!/usr/bin/env node
/**
 * 更新项目到新的JSX Transform (automatic runtime)
 * 移除不必要的 React imports
 */

const fs = require('fs');
const path = require('path');

// 递归查找所有 .tsx 和 .jsx 文件
function findReactFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // 跳过 node_modules 等目录
      if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(item)) {
        findReactFiles(fullPath, files);
      }
    } else if (item.endsWith('.tsx') || item.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// 更新文件内容
function updateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let changed = false;
  
  // 检查是否需要 React import（如果使用了 React.xxx 或其他React特性）
  const needsReactImport = (
    /React\./g.test(content) || // React.Component, React.Fragment 等
    /React\./.test(content) ||
    /Component|PureComponent|createContext|createRef|forwardRef|memo|useImperativeHandle/.test(content)
  );
  
  // 如果只是用于JSX，移除React import
  if (!needsReactImport) {
    // 移除 import React 行（各种变体）
    const reactImportRegex = /^import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]react['"];?\s*$/gm;
    const reactOnlyImportRegex = /^import\s+React\s+from\s+['"]react['"];?\s*$/gm;
    
    if (reactOnlyImportRegex.test(content)) {
      newContent = newContent.replace(reactOnlyImportRegex, '');
      changed = true;
      console.log(`✅ 移除了 React import: ${filePath}`);
    } else if (reactImportRegex.test(content)) {
      // 保留其他导入，只移除 React
      newContent = newContent.replace(
        /import\s+React\s*,\s*(\{[^}]*\})\s+from\s+['"]react['"];?/gm,
        'import $1 from "react";'
      );
      changed = true;
      console.log(`✅ 修改了 React import: ${filePath}`);
    }
  }
  
  // 清理多余的空行
  if (changed) {
    newContent = newContent.replace(/\n\n\n+/g, '\n\n');
    fs.writeFileSync(filePath, newContent);
  }
  
  return changed;
}

// 主函数
function main() {
  const projectRoot = process.cwd();
  console.log(`🔄 开始更新 JSX Transform 在: ${projectRoot}`);
  
  const reactFiles = findReactFiles(path.join(projectRoot, 'src'));
  console.log(`📁 找到 ${reactFiles.length} 个 React 文件`);
  
  let updatedCount = 0;
  for (const filePath of reactFiles) {
    const relativePath = path.relative(projectRoot, filePath);
    try {
      if (updateFile(filePath)) {
        updatedCount++;
      }
    } catch (error) {
      console.error(`❌ 更新失败 ${relativePath}: ${error.message}`);
    }
  }
  
  console.log(`🎉 更新完成! 共更新 ${updatedCount} 个文件`);
  console.log(`
📝 下一步:
1. 重启开发服务器: npm run dev
2. 检查控制台是否还有 JSX transform 警告
3. 测试应用功能是否正常
  `);
}

if (require.main === module) {
  main();
}