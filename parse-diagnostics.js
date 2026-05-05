const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/admin/page.tsx');
const fileContent = fs.readFileSync(filePath, 'utf-8');

// Create a source file
const sourceFile = ts.createSourceFile(
  filePath,
  fileContent,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

// Get line/column utilities
const lines = fileContent.split('\n');

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
    const marker = isHighlight ? '>>> ' : '    ';
    snippet.push(`${marker}${lineNum.toString().padStart(4, ' ')}: ${lines[i]}`);
  }
  
  return snippet.join('\n');
}

// Collect all diagnostics through recursive traversal
const diagnostics = [];

function visit(node) {
  // Check for JSDoc parsing errors
  if (node.kind === ts.SyntaxKind.JSDocComment) {
    diagnostics.push(node);
  }
  
  ts.forEachChild(node, visit);
}

visit(sourceFile);

// Get parse errors/diagnostics
const errors = sourceFile.parseDiagnostics || [];

console.log(`\n📄 File: ${filePath}`);
console.log(`📊 File Size: ${fileContent.length} bytes, ${lines.length} lines`);
console.log(`\n═══════════════════════════════════════════════════\n`);

if (errors.length === 0) {
  console.log('✅ No parse diagnostics found!\n');
} else {
  console.log(`❌ Found ${errors.length} parse diagnostic(s):\n`);
  
  errors.forEach((diag, index) => {
    const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
    const line = pos.line + 1;
    const column = pos.character + 1;
    
    console.log(`Diagnostic #${index + 1}:`);
    console.log(`  Location: Line ${line}, Column ${column}`);
    console.log(`  Category: ${ts.DiagnosticCategory[diag.category]}`);
    console.log(`  Message: ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
    console.log(`  Code: ${diag.code}`);
    console.log(`\n  Context:\n`);
    console.log(getContext(diag.start, diag.start + (diag.length || 1), 2));
    console.log(`\n${'─'.repeat(60)}\n`);
  });
}

// Also print AST structure info
console.log(`\nℹ️  AST Root Kind: ${ts.SyntaxKind[sourceFile.kind]}`);
console.log(`ℹ️  Statements: ${sourceFile.statements.length}`);
