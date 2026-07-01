export {
  COMPRESSION_MODES,
  compressContent,
  detectMode,
  estimateTokens,
  formatCompressionStats,
  isCompressionMode,
} from './engine.js';
export {
  getScannerSuppressionSource,
  getSecretPatternSummaries,
  mergeSecretReports,
  protectSecrets,
  scanSecrets,
  setCustomSecretPatterns,
} from './secret-protection.js';
export {
  protectResultOutput,
} from './safe-output.js';
export {
  buildContextPack,
} from './context-pack.js';
export {
  buildWarnings,
  buildSelectionWarnings,
  buildPromptSkeletonId,
  detectSelectionKind,
  explainSelection,
  EXPLAIN_OUTLINE_THRESHOLD_TOKENS,
  inferResponseShape,
  isBrevitySensitive,
  normalizePrompt,
  optimizePrompt,
  optimizeSelectionText,
  summarizeSelection,
} from './prompt-optimizer.js';