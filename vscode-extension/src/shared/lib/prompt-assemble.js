import { estimateTokens } from './tokens.js';
import { assessCacheStructure, buildWarnings } from './prompt-warnings.js';
import { summarizeSelection } from './prompt-selection.js';
import { inferResponseShape } from './prompt-shape.js';
import {
  detectLanguageTag,
  extractConstraints,
  extractInlinePath,
  normalizePrompt,
} from './prompt-normalize.js';
import { mergeSecretReports, protectSecrets } from './secret-protection.js';

function emptyProtectionReport() {
  return {
    redacted: false,
    totalRedactions: 0,
    findings: [],
  };
}

function protectMetadata(metadata) {
  const fields = ['selection', 'selectionText', 'error', 'output'];
  const next = { ...metadata };
  const findings = [];
  let totalRedactions = 0;

  for (const field of fields) {
    if (!next[field]) continue;
    const result = protectSecrets(next[field], { filename: next.file ?? '' });
    next[field] = result.output;
    totalRedactions += result.totalRedactions;
    findings.push(result.findings);
  }

  const mergedFindings = mergeSecretReports(...findings);
  return {
    metadata: next,
    scan: {
      redacted: totalRedactions > 0,
      totalRedactions,
      findings: mergedFindings,
    },
  };
}

function buildProtectionWarning(protectionReport) {
  if (!protectionReport.redacted) return null;
  const labels = protectionReport.findings.map(item => item.id).join(', ');
  return `High-confidence secret patterns were redacted locally (${protectionReport.totalRedactions} match(es): ${labels}).`;
}

function getSelectionDetails(metadata) {
  if (!metadata.selectionText) return null;
  const filename = metadata.file ? metadata.file : null;
  return summarizeSelection(metadata.selectionText, { filename });
}

function resolveSelection(metadata, selectionDetails) {
  if (metadata.selection) return metadata.selection;
  if (selectionDetails && selectionDetails.summary) return selectionDetails.summary;
  return null;
}

function resolveSelectionKind(selectionDetails) {
  if (selectionDetails && selectionDetails.kind) return selectionDetails.kind;
  return 'prompt-only';
}

function resolveFile(prompt, metadata) {
  if (metadata.file) return metadata.file;
  const inlinePath = extractInlinePath(prompt);
  return inlinePath ? inlinePath : null;
}

function composeSelectionContext(prompt, metadata) {
  const selectionDetails = getSelectionDetails(metadata);
  const selection = resolveSelection(metadata, selectionDetails);
  const selectionKind = resolveSelectionKind(selectionDetails);
  const resolvedFile = resolveFile(prompt, metadata);
  return { selection, selectionKind, resolvedFile };
}

function buildXmlPromptParts(goalWithTag, resolvedFile, selection, metadata, constraints, outputShape) {
  const parts = [`<goal>${goalWithTag}</goal>`];
  if (resolvedFile) parts.push(`<file>${resolvedFile}</file>`);
  if (selection) parts.push(`<context>${selection}</context>`);
  if (metadata.error) parts.push(`<error>${metadata.error}</error>`);
  if (constraints.length > 0) {
    const inner = constraints.map(c => c.replace(/^Constraint:\s*/, '')).join(' ');
    parts.push(`<constraints>${inner}</constraints>`);
  }
  if (outputShape) parts.push(`<format>${outputShape}</format>`);
  return parts;
}

function buildPlainPromptParts(goalWithTag, resolvedFile, selection, metadata, constraints, outputShape) {
  const parts = [goalWithTag];
  if (resolvedFile) parts.push(`File: ${resolvedFile}.`);
  if (selection) parts.push(`Focus: ${selection}`);
  if (metadata.error) parts.push(`Error: ${metadata.error}.`);
  if (constraints.length > 0) parts.push(...constraints);
  if (outputShape) parts.push(outputShape);
  return parts;
}

function buildPromptParts(goalWithTag, resolvedFile, selection, metadata, constraints, outputShape) {
  if (metadata.xml) {
    return buildXmlPromptParts(goalWithTag, resolvedFile, selection, metadata, constraints, outputShape);
  }
  return buildPlainPromptParts(goalWithTag, resolvedFile, selection, metadata, constraints, outputShape);
}

export function optimizePrompt(prompt, metadata = {}) {
  const promptScan = protectSecrets(prompt, { filename: metadata.file ?? '' });
  const metadataSanitization = protectMetadata(metadata);
  const safePrompt = promptScan.output;
  const safeMetadata = metadataSanitization.metadata;
  const protectionReport = {
    ...emptyProtectionReport(),
    redacted: promptScan.redacted || metadataSanitization.scan.redacted,
    totalRedactions: promptScan.totalRedactions + metadataSanitization.scan.totalRedactions,
    findings: mergeSecretReports(promptScan.findings, metadataSanitization.scan.findings),
  };

  const { cleaned: promptText, constraints } = extractConstraints(safePrompt);

  const goal = normalizePrompt(promptText);
  if (!goal) throw new Error('Prompt text is required.');

  const { selection, selectionKind, resolvedFile } = composeSelectionContext(safePrompt, safeMetadata);

  const langTag = detectLanguageTag(resolvedFile);
  const goalWithTag = langTag ? `${langTag} ${goal}` : goal;

  const outputShape = safeMetadata.output || inferResponseShape(safePrompt, { selectionKind, file: resolvedFile });
  const parts = buildPromptParts(goalWithTag, resolvedFile, selection, safeMetadata, constraints, outputShape);

  const optimizedPrompt = parts.join(' ');
  const beforeTokens = estimateTokens(safePrompt);
  const afterTokens = estimateTokens(optimizedPrompt);
  const ratio = beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0;
  const cacheability = assessCacheStructure(safePrompt);
  const warnings = buildWarnings(safePrompt, {
    ...safeMetadata,
    file: resolvedFile,
    selection,
    selectionKind,
  });
  const protectionWarning = buildProtectionWarning(protectionReport);
  if (protectionWarning) warnings.unshift(protectionWarning);

  return {
    optimizedPrompt,
    warnings,
    protectionReport,
    beforeTokens,
    afterTokens,
    ratio,
    cacheability,
    contextType: selectionKind,
  };
}
