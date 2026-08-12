export function containsRetiredProviderSymbol(text, symbol) {
  if (symbol === "child-agent") {
    for (const match of text.matchAll(/child-agent/g)) {
      const childStart = match.index;
      const nativeStart = childStart - "native-".length;
      const nativeEnd = childStart + "child-agent".length;
      const quote = text[nativeStart - 1];
      const isExactNativeToken = nativeStart >= 0
        && text.slice(nativeStart, nativeEnd) === "native-child-agent"
        && (quote === '"' || quote === "'")
        && text[nativeEnd] === quote;
      if (!isExactNativeToken) return true;
    }
    return false;
  }
  return text.includes(symbol);
}
