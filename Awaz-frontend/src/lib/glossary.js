function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function prepareGlossaryText(text, entries, sourceLang, targetLang) {
  const sourceCode = sourceLang.toLowerCase().split('-')[0];
  const targetCode = targetLang.toLowerCase().split('-')[0];
  const matchingEntries = entries
    .filter((entry) => entry.sourceLang.toLowerCase().split('-')[0] === sourceCode
      && entry.targetLang.toLowerCase().split('-')[0] === targetCode
      && entry.sourceTerm.trim() && entry.targetTerm.trim())
    .sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);
  if (!matchingEntries.length) return { text, restore: (translatedText) => translatedText };

  const entryByTerm = new Map(matchingEntries.map((entry) => [entry.sourceTerm.trim().toLowerCase(), entry]));
  const pattern = new RegExp(matchingEntries.map((entry) => escapeRegExp(entry.sourceTerm.trim())).join('|'), 'giu');
  const replacements = [];
  const protectedText = text.replace(pattern, (matched, offset, original) => {
    const before = Array.from(original.slice(0, offset)).at(-1);
    const after = Array.from(original.slice(offset + matched.length))[0];
    const isWordCharacter = (character) => Boolean(character && /[\p{L}\p{N}]/u.test(character));
    if (isWordCharacter(before) || isWordCharacter(after)) return matched;
    const entry = entryByTerm.get(matched.toLowerCase());
    if (!entry) return matched;
    const token = `AWAZTERM${replacements.length}ZXQ`;
    replacements.push({ token, translated: entry.targetTerm.trim() });
    return token;
  });

  return {
    text: protectedText,
    restore(translatedText) {
      return replacements.reduce((result, replacement) => result.replace(new RegExp(escapeRegExp(replacement.token), 'gi'), replacement.translated), translatedText);
    },
  };
}
