export function containsRetiredProviderSymbol(text, symbol) {
  if (symbol === "child-agent") {
    for (const match of text.matchAll(/child-agent/g)) {
      const childStart = match.index;
      const nativeStart = childStart - "native-".length;
      const nativeEnd = childStart + "child-agent".length;
      const isExactNativeToken = nativeStart >= 0
        && text.slice(nativeStart, nativeEnd) === "native-child-agent"
        && !isProviderSymbolCharacter(text[nativeStart - 1])
        && !isProviderSymbolCharacter(text[nativeEnd]);
      if (!isExactNativeToken) return true;
    }
    return false;
  }
  return text.includes(symbol);
}

function isProviderSymbolCharacter(value) {
  return value !== undefined && /[A-Za-z0-9_-]/.test(value);
}
