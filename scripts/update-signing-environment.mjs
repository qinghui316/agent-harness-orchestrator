const SIGNING_ENVIRONMENT_KEYS = Object.freeze([
  "BEAVER_UPDATE_SIGNING_PRIVATE_KEY",
  "BEAVER_UPDATE_SIGNING_KEY_PASSWORD",
  "BEAVER_UPDATE_SIGNING_KEY_ID",
]);

export function withoutUpdateSigningSecrets(source) {
  const result = { ...source };
  for (const key of SIGNING_ENVIRONMENT_KEYS) delete result[key];
  return result;
}
