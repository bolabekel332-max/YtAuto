import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

const IMPORT_SPECIFIER_PATTERNS: RegExp[] = [
  /(?:import|export)\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /import\s*['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

export function extractModuleSpecifiers(source: string): string[] {
  const cleaned = stripComments(source);
  const specifiers: string[] = [];
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleaned)) !== null) {
      if (match[1]) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

export function isForbiddenSrcImport(specifier: string, fromFilePath: string): boolean {
  const normalized = specifier.replace(/\\/g, '/');
  if (
    normalized.startsWith('../src/') ||
    normalized === '../src' ||
    normalized.startsWith('./src/') ||
    normalized === './src' ||
    normalized.includes('/src/')
  ) {
    return true;
  }
  if (normalized.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFilePath), normalized);
    return resolved === SRC_DIR || resolved.startsWith(`${SRC_DIR}${path.sep}`);
  }
  return false;
}

export function findServerToClientImportViolations(
  files: Array<{ filePath: string; content: string }>
): Array<{ filePath: string; specifier: string }> {
  const violations: Array<{ filePath: string; specifier: string }> = [];
  for (const { filePath, content } of files) {
    for (const specifier of extractModuleSpecifiers(content)) {
      if (isForbiddenSrcImport(specifier, filePath)) {
        violations.push({ filePath, specifier });
      }
    }
  }
  return violations;
}

function collectNonTestTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectNonTestTsFiles(fullPath));
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|mts|cts)$/.test(entry.name) &&
      !/\.test\.(ts|tsx|mts|cts)$/.test(entry.name)
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

test('server/, server.ts, dan shared/ non-test tidak boleh mengimpor dari src/', () => {
  const targetFiles = [
    path.join(ROOT_DIR, 'server.ts'),
    ...collectNonTestTsFiles(path.join(ROOT_DIR, 'server')),
    ...collectNonTestTsFiles(path.join(ROOT_DIR, 'shared')),
  ].filter((filePath) => fs.existsSync(filePath));

  assert.ok(targetFiles.length > 0, 'Harus memindai berkas TypeScript server/shared.');

  const payload = targetFiles.map((filePath) => ({
    filePath,
    content: fs.readFileSync(filePath, 'utf8'),
  }));

  const violations = findServerToClientImportViolations(payload);
  assert.deepEqual(
    violations,
    [],
    `Ditemukan impor terlarang ke src/ dari server/shared:\n${violations
      .map((v) => `- ${path.relative(ROOT_DIR, v.filePath)} -> "${v.specifier}"`)
      .join('\n')}`
  );
});

test('kontrol negatif: pemindai gagal bila ada impor ../src/ atau ./src/ dan lolos untuk ../shared/', () => {
  const badFiles = [
    {
      filePath: path.join(ROOT_DIR, 'server', 'config.ts'),
      content: "import { DEFAULT_MODEL_CONFIGS } from '../src/state/defaults';\n",
    },
    {
      filePath: path.join(ROOT_DIR, 'server.ts'),
      content: "const mod = await import('./src/state/defaults');\n",
    },
  ];
  const detected = findServerToClientImportViolations(badFiles);
  assert.equal(detected.length, 2);
  assert.equal(detected[0]?.specifier, '../src/state/defaults');
  assert.equal(detected[1]?.specifier, './src/state/defaults');

  const validFiles = [
    {
      filePath: path.join(ROOT_DIR, 'server', 'config.ts'),
      content: "import { DEFAULT_MODEL_CONFIGS } from '../shared/defaults';\n",
    },
  ];
  assert.deepEqual(findServerToClientImportViolations(validFiles), []);
});
