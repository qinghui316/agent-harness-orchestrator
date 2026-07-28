import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import ts from "typescript";

const WEB_SOURCE = "src/web/src";
const USER_PRESENTATION_MODULES = new Set([
  "src/web/src/action-labels.ts",
  "src/web/src/formatters.ts",
  "src/web/src/scheduler-action-labels.ts",
  "src/web/src/panels/workbench/transcriptDisplay.ts",
]);
const DIAGNOSTIC_RAW_EVIDENCE_ATTRIBUTE = "data-diagnostic-raw-evidence";
const USER_VISIBLE_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt", "label", "description", "emptyMessage"]);
const FORBIDDEN_TERMS = [
  /\bWorkpad\b/i,
  /\bTaskGraph\b/i,
  /\bSchedulerRun\b/i,
  /\bProviderAttempt\b/i,
  /\bgraph[ -]?scope\b/i,
  /\bclaim\b/i,
  /\blease\b/i,
  /\bslot\b/i,
  /\bprojection\b/i,
  /\bTopic\b/i,
  /\bChange\b/i,
  /\bTaskRun\b/i,
  /\bWorkerLease\b/i,
  /\bblocked\b/i,
  /\baudit-blocked\b/i,
  /\bqueue blocked\b/i,
  /\bApproval Inbox\b/i,
  /\bPlan mode\b/i,
  /\bTaskQueue\b/i,
  /\bIntegrationCheck\b/i,
  /\bscheduler\b/i,
  /\bworker\b/i,
  /\brework\b/i,
];
const RAW_ID_FIELDS = new Set([
  "changeId", "taskId", "taskRunId", "queueRunId", "runId", "threadId", "turnId",
  "attemptId", "agentSurfaceId", "providerSessionId", "workerLeaseId", "integrationCheckId",
  "recommendedRoleId", "workerId", "nodeId", "unitId",
]);

export async function lintUiLanguage(rootDirectory = process.cwd()) {
  const root = resolve(rootDirectory);
  const sourceRoot = resolve(root, WEB_SOURCE);
  const files = await collectFiles(sourceRoot);
  const violations = [];
  for (const file of files) {
    const relativePath = normalizePath(relative(root, file));
    const content = await readFile(file, "utf8");
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rawAliasesByScope = collectRawIdentifierAliases(source);
    const visit = (node, insideCode = false, insideDiagnosticRawEvidence = false) => {
      const nextInsideCode = insideCode || isCodeElement(node);
      const nextInsideDiagnosticRawEvidence = insideDiagnosticRawEvidence || isDiagnosticRawEvidenceElement(node);
      if (!nextInsideCode && !nextInsideDiagnosticRawEvidence && ts.isJsxText(node)) checkText(node.getText(source), node, source, relativePath, violations);
      if (!nextInsideCode && !nextInsideDiagnosticRawEvidence && ts.isJsxAttribute(node) && USER_VISIBLE_ATTRIBUTES.has(node.name.getText(source))) {
        const expression = attributeExpression(node.initializer);
        for (const value of staticExpressionValues(expression)) checkText(value, node, source, relativePath, violations);
        for (const rawId of rawIdNames(expression, aliasesForNode(rawAliasesByScope, node))) {
          violations.push(`${relativePath}:${lineOf(source, node)} exposes raw identifier ${rawId} outside Diagnostics`);
        }
      }
      if (!nextInsideCode && !nextInsideDiagnosticRawEvidence && ts.isJsxExpression(node) && isVisibleJsxChild(node) && node.expression) {
        for (const value of staticExpressionValues(node.expression)) checkText(value, node, source, relativePath, violations);
        for (const rawId of rawIdNames(node.expression, aliasesForNode(rawAliasesByScope, node))) {
          violations.push(`${relativePath}:${lineOf(source, node)} exposes raw identifier ${rawId} outside Diagnostics`);
        }
      }
      if (USER_PRESENTATION_MODULES.has(relativePath) && ts.isReturnStatement(node) && node.expression) {
        for (const value of returnedStaticValues(node.expression)) checkText(value, node, source, relativePath, violations);
      }
      ts.forEachChild(node, (child) => visit(child, nextInsideCode, nextInsideDiagnosticRawEvidence));
    };
    visit(source);
  }
  return { filesChecked: files.length, violations };
}

function checkText(value, node, source, path, violations) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return;
  for (const pattern of FORBIDDEN_TERMS) {
    const match = pattern.exec(compact);
    if (match) violations.push(`${path}:${lineOf(source, node)} exposes internal term ${JSON.stringify(match[0])} outside Diagnostics`);
  }
}

function attributeExpression(initializer) {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer;
  if (ts.isJsxExpression(initializer)) return initializer.expression ?? null;
  return null;
}

function staticExpressionValues(expression) {
  if (!expression) return [];
  const values = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      values.push(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      values.push(node.head.text);
      for (const span of node.templateSpans) {
        visit(span.expression);
        values.push(span.literal.text);
      }
      return;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return values;
}

function rawIdNames(expression, aliases = new Set()) {
  if (!expression) return [];
  const names = new Set();
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && RAW_ID_FIELDS.has(node.name.text)) names.add(node.name.text);
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) && RAW_ID_FIELDS.has(node.argumentExpression.text)) names.add(node.argumentExpression.text);
    if (ts.isIdentifier(node) && (RAW_ID_FIELDS.has(node.text) || aliases.has(node.text))) names.add(node.text);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return [...names];
}

function collectRawIdentifierAliases(source) {
  const declarations = [];
  const aliasesByScope = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const scope = containingScope(node);
      declarations.push({ name: node.name.text, initializer: node.initializer, scope });
      if (!aliasesByScope.has(scope)) aliasesByScope.set(scope, new Set());
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      const aliases = aliasesByScope.get(declaration.scope);
      if (aliases.has(declaration.name) || !expressionYieldsRawId(declaration.initializer, aliases)) continue;
      aliases.add(declaration.name);
      changed = true;
    }
  }
  return aliasesByScope;
}

function expressionYieldsRawId(expression, aliases) {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)) {
    return expressionYieldsRawId(expression.expression, aliases);
  }
  if (ts.isPropertyAccessExpression(expression)) return RAW_ID_FIELDS.has(expression.name.text);
  if (ts.isElementAccessExpression(expression)) {
    return Boolean(expression.argumentExpression
      && ts.isStringLiteralLike(expression.argumentExpression)
      && RAW_ID_FIELDS.has(expression.argumentExpression.text));
  }
  if (ts.isIdentifier(expression)) return RAW_ID_FIELDS.has(expression.text) || aliases.has(expression.text);
  if (ts.isConditionalExpression(expression)) {
    return expressionYieldsRawId(expression.whenTrue, aliases) || expressionYieldsRawId(expression.whenFalse, aliases);
  }
  if (ts.isTemplateExpression(expression)) {
    return expression.templateSpans.some((span) => expressionYieldsRawId(span.expression, aliases));
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return expressionYieldsRawId(expression.left, aliases) || expressionYieldsRawId(expression.right, aliases);
  }
  return false;
}

function aliasesForNode(aliasesByScope, node) {
  return aliasesByScope.get(containingScope(node)) ?? new Set();
}

function containingScope(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current) && !ts.isFunctionLike(current)) current = current.parent;
  return current;
}

function returnedStaticValues(expression) {
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression)) return returnedStaticValues(expression.expression);
  if (ts.isConditionalExpression(expression)) return [
    ...returnedStaticValues(expression.whenTrue),
    ...returnedStaticValues(expression.whenFalse),
  ];
  return [];
}

function isVisibleJsxChild(node) {
  return ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent);
}

function isCodeElement(node) {
  if (!ts.isJsxElement(node)) return false;
  const name = node.openingElement.tagName.getText().toLowerCase();
  return name === "code" || name === "pre";
}

function isDiagnosticRawEvidenceElement(node) {
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
  return attributes.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === DIAGNOSTIC_RAW_EVIDENCE_ATTRIBUTE);
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

async function collectFiles(directory) {
  if (!await isDirectory(directory)) return [];
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(path));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) result.push(path);
  }
  return result;
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch (cause) {
    if (cause?.code === "ENOENT") return false;
    throw cause;
  }
}

function normalizePath(value) { return value.split(sep).join("/"); }

const isCli = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  const result = await lintUiLanguage(process.cwd());
  if (result.violations.length > 0) {
    process.stderr.write(`UI language lint failed:\n${result.violations.map((item) => `- ${item}`).join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`UI language lint passed (${result.filesChecked} TS/TSX files).\n`);
  }
}
