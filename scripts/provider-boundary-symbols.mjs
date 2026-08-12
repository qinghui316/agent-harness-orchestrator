export function containsRetiredProviderSymbol(text, symbol) {
  if (symbol === "child-agent") return /(?<!native-)child-agent/.test(text);
  return text.includes(symbol);
}
