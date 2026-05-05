#!/usr/bin/env node
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/admin/page.tsx');

console.log(`\n🔍 Parsing: ${filePath}\n`);

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const fileContent = fs.readFileSync(filePath, 'utf-8');
const lines = fileContent.split('\n');

// Create a source file
const sourceFile = ts.createSourceFile(
  filePath,
  fileContent,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

// Function to get context around a position
function getContext(start, end, contextLines = 2) {
  const startPos = sourceFile.getLineAndCharacterOfPosition(start);
  const endPos = sourceFile.getLineAndCharacterOfPosition(end);
  
  const startLine = Math.max(0, startPos.line - contextLines);
  const endLine = Math.min(lines.length - 1, endPos.line + contextLines);
  
  const snippet = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1;
    const isHighlight = i >= startPos.line && i <= endPos.line;
    const marker = isHighlight ? '>>>' : '   ';
    snippet.push(`${marker} ${lineNum.toString().padStart(4, ' ')}: ${lines[i]}`);
  }
  
  return snippet.join('\n');
}

// Get parse errors/diagnostics
const errors = sourceFile.parseDiagnostics || [];

console.log(`📊 File Stats: ${fileContent.length} bytes, ${lines.length} lines`);
console.log(`${'═'.repeat(60)}\n`);

if (errors.length === 0) {
  console.log('✅ No parse diagnostics found!\n');
} else {
  console.log(`❌ Found ${errors.length} parse diagnostic(s):\n`);
  
  errors.forEach((diag, index) => {
    const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
    const line = pos.line + 1;
    const column = pos.character + 1;
    const length = diag.length || 1;
    
    console.log(`\n[Diagnostic ${index + 1}]`);
    console.log(`  Position: Line ${line}, Column ${column}`);
    console.log(`  Span: ${length} character(s)`);
    console.log(`  Severity: ${ts.DiagnosticCategory[diag.category]}`);
    console.log(`  Error Code: TS${diag.code}`);
    console.log(`  Message: ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
    console.log(`\n  ┌─ Context:`);
    console.log(`  │`);
    getContext(diag.start, diag.start + length, 2).split('\n').forEach(l => console.log(`  │ ${l}`));
    console.log(`  └─`);
    console.log();
  });
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`ℹ️  AST Root: ${ts.SyntaxKind[sourceFile.kind]}`);
console.log(`ℹ️  Top-level Statements: ${sourceFile.statements.length}`);
console.log();
