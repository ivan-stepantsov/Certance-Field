import { estimateTokens } from '../lib/tokens.js';

const FILLER_RE = /\b(?:really|basically|actually|simply|generally|just|quite|very|clearly|obviously|essentially)\b/gi;
const PLEASANTRY_PREFIX_RE = /^(?:please\s+|you\s+should\s+|you\s+can\s+|you\s+may\s+|remember\s+to\s+|make\s+sure\s+to\s+)/i;
const REDUNDANT_PHRASE_PATTERNS = [
  [/\bin order to\b/gi, 'to'],
  [/\bit is important to\b/gi, ''],
  [/\bit is useful to\b/gi, ''],
  [/\bit is recommended to\b/gi, ''],
  [/\bthat you\s+/gi, 'to '],
  [/\bdo not forget to\b/gi, ''],
];
const INLINE_CODE_RE = /`[^`]*`/g;
const URL_RE = /https?:\/\/\S+/g;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\([^)]+\)/g;
const COMMANDISH_RE = /\b(?:npm|pnpm|yarn|node|npx|git|docker|kubectl|python|python3|pip|uv|curl|bash|pwsh|powershell)\b[^\n]*/g;
const PATHISH_RE = /(?:\.{0,2}\/|~\/|\/?[A-Za-z0-9_.-]+\/)[^\s`)]*/g;
const FILEISH_RE = /\b[A-Za-z0-9_.-]+\.(?:md|ts|tsx|js|jsx|json|ya?ml|toml|feature|spec\.ts|instructions\.md|agent\.md)\b/g;
const LEADING_THIS_IS_RE = /^This (?:file|repo|repository|kit|document)\s+/i;
const LEADING_THERE_ARE_RE = /^There are\s+/i;
const LEADING_THIS_REPO_RE = /^This repository\s+/i;
const TARGETED_PHRASE_PATTERNS = [
  [/\bYour sole job is to\b/gi, ''],
  [/\bThis agent is intended for\b/gi, 'Target:'],
  [/\bThis repository already contains\b/gi, 'Repo already has'],
  [/\bThe kit already includes\b/gi, 'Kit includes'],
  [/\bTreat it as the starting point for every run, not as empty space to fill\b/gi, 'Start from existing kit, not blank space'],
  [/\bIf a capability such as web retrieval is unavailable in the current IDE runtime, note that limitation explicitly and continue with the strongest available local and web-accessible evidence path rather than assuming Claude-style tool availability\b/gi, 'If web retrieval is unavailable, note it and continue with the strongest local or web-accessible evidence path available'],
  [/\bOn every run, research\b/gi, 'Research'],
  [/\bTreat lack of change as a finding and record it when relevant\b/gi, 'Record lack of change when relevant'],
  [/\bDo not\s+/gi, 'Do not '],
];

function protectSegments(text) {
  const segments = [];
  const pattern = new RegExp(
    `${INLINE_CODE_RE.source}|${MARKDOWN_LINK_RE.source}|${URL_RE.source}|${COMMANDISH_RE.source}|${PATHISH_RE.source}|${FILEISH_RE.source}`,
    'g'
  );

  const protectedText = text.replace(pattern, match => {
    const token = `__CERTANCE_SEGMENT_${segments.length}__`;
    segments.push(match);
    return token;
  });

  return { protectedText, segments };
}

function restoreSegments(text, segments) {
  return segments.reduce(
    (current, segment, index) => current.replace(`__CERTANCE_SEGMENT_${index}__`, segment),
    text
  );
}

function tightenSentence(text) {
  let next = text;
  const { protectedText, segments } = protectSegments(next);
  next = protectedText;

  next = next.replace(FILLER_RE, '');
  next = next.replace(PLEASANTRY_PREFIX_RE, '');
  for (const [pattern, replacement] of REDUNDANT_PHRASE_PATTERNS) {
    next = next.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of TARGETED_PHRASE_PATTERNS) {
    next = next.replace(pattern, replacement);
  }

  next = next.replace(LEADING_THIS_REPO_RE, 'Repo ');
  next = next.replace(LEADING_THIS_IS_RE, '');
  next = next.replace(LEADING_THERE_ARE_RE, '');

  next = next
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/:\s*$/g, ':')
    .trim();

  next = restoreSegments(next, segments);
  return next;
}

function isProtectedLine(line) {
  const trimmed = line.trim();
  return (
    trimmed === '' ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('---') ||
    trimmed.startsWith('|') ||
    trimmed.startsWith('>') ||
    trimmed.startsWith('```') ||
    trimmed.startsWith('<!--')
  );
}

function compressBullet(line) {
  const match = line.match(/^(\s*[-*]\s+)(.*)$/);
  if (!match) return line;
  const [, prefix, body] = match;
  const tightened = tightenSentence(body);
  return tightened ? `${prefix}${tightened}` : line;
}

function compressParagraphLine(line) {
  const tightened = tightenSentence(line);
  return tightened || line.trim();
}

function flushParagraph(buffer, outputLines) {
  if (buffer.length === 0) return;
  const paragraph = buffer.map(line => line.trim()).join(' ');
  const tightened = compressParagraphLine(paragraph);
  outputLines.push(tightened || paragraph);
  buffer.length = 0;
}

function trimBlankEdges(lines) {
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
}

function classifySpecialLine(trimmed, index, state) {
  if (trimmed === '```') return 'fence';
  if (!state.frontmatterComplete && index === 0 && trimmed === '---') return 'frontmatter-start';
  if (state.inFrontmatter) return 'frontmatter';
  return null;
}

function classifyContentLine(line, trimmed, state) {
  if (state.inFence || isProtectedLine(line)) return 'protected';
  if (/^\s*\d+\.\s+/.test(line)) return 'numbered';
  if (/^\s*[-*]\s+/.test(line)) return 'bullet';
  if (trimmed === '') return 'blank';
  return 'paragraph';
}

function classifyLine(line, trimmed, index, state) {
  return classifySpecialLine(trimmed, index, state) ?? classifyContentLine(line, trimmed, state);
}

function handleFence(line, trimmed, _index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  state.inFence = !state.inFence;
  outputLines.push(line);
  state.previousNonEmpty = trimmed || state.previousNonEmpty;
}

function handleFrontmatterStart(line, trimmed, _index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  state.inFrontmatter = true;
  outputLines.push(line);
  state.previousNonEmpty = trimmed;
}

function handleFrontmatter(line, trimmed, index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  outputLines.push(line);
  if (index > 0 && trimmed === '---') {
    state.inFrontmatter = false;
    state.frontmatterComplete = true;
  }
  state.previousNonEmpty = trimmed || state.previousNonEmpty;
}

function handleProtected(line, trimmed, _index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  outputLines.push(line);
  state.previousNonEmpty = trimmed || state.previousNonEmpty;
}

function handleNumbered(line, trimmed, _index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  const prefix = line.match(/^(\s*\d+\.\s+)/)?.[1] ?? '';
  const tightened = tightenSentence(line.slice(prefix.length));
  outputLines.push(tightened ? `${prefix}${tightened}` : line);
  state.previousNonEmpty = trimmed || state.previousNonEmpty;
}

function handleBullet(line, trimmed, _index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  outputLines.push(compressBullet(line));
  state.previousNonEmpty = trimmed || state.previousNonEmpty;
}

function handleBlank(_line, _trimmed, _index, outputLines, state) {
  flushParagraph(state.paragraphBuffer, outputLines);
  if (state.previousNonEmpty !== '') outputLines.push('');
  state.previousNonEmpty = '';
}

function handleParagraph(line, trimmed, _index, _outputLines, state) {
  state.paragraphBuffer.push(line);
  state.previousNonEmpty = trimmed;
}

const LINE_HANDLERS = {
  fence:             handleFence,
  'frontmatter-start': handleFrontmatterStart,
  frontmatter:       handleFrontmatter,
  protected:         handleProtected,
  numbered:          handleNumbered,
  bullet:            handleBullet,
  blank:             handleBlank,
  paragraph:         handleParagraph,
};

export function compressInstructions(input) {
  const lines = input.split('\n');
  const outputLines = [];
  const state = {
    paragraphBuffer: [],
    inFence: false,
    inFrontmatter: false,
    frontmatterComplete: false,
    previousNonEmpty: '',
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    LINE_HANDLERS[classifyLine(line, trimmed, index, state)](line, trimmed, index, outputLines, state);
  }

  flushParagraph(state.paragraphBuffer, outputLines);
  trimBlankEdges(outputLines);

  const output = outputLines.join('\n');
  const beforeTokens = estimateTokens(input);
  const afterTokens = estimateTokens(output);
  return {
    output,
    beforeTokens,
    afterTokens,
    ratio: beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0,
  };
}