const SIGNING_ENVIRONMENT_KEYS = Object.freeze([
  "BEAVER_UPDATE_SIGNING_PRIVATE_KEY",
  "BEAVER_UPDATE_SIGNING_KEY_PASSWORD",
  "BEAVER_UPDATE_SIGNING_KEY_ID",
]);

export function withoutUpdateSigningSecrets(source) {
  const result = { ...source };
  const protectedKeys = new Set(SIGNING_ENVIRONMENT_KEYS.map((key) => key.toUpperCase()));
  for (const key of Object.keys(result)) {
    if (protectedKeys.has(key.toUpperCase())) delete result[key];
  }
  return result;
}
