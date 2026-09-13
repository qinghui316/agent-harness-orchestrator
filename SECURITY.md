# Beaver Code Security

## Reporting a vulnerability

Please do not disclose a suspected security vulnerability in a public issue. Use GitHub's private
vulnerability reporting flow in the repository Security tab. Include the affected version, impact,
reproduction steps, and any relevant sanitized logs. Do not include private signing keys, provider
credentials, access tokens, project contents, or personal data.

## Supported release line

Until Beaver Code reaches public 1.0, only the latest Windows stable release receives security
fixes. Older internal and test builds are unsupported. A withdrawn release must not be installed;
users should move forward to the next higher patch release.

## Update trust

The Windows updater accepts only stable releases from `qinghui316/beaver-code`. It verifies a
repository-pinned Ed25519 signature over the raw update manifest and then verifies release identity,
platform, architecture, artifact names, sizes, and SHA-512 digests. Releases are immutable: a repair
uses a higher version rather than replacing assets under an existing version.

The current Windows package may still show an "Unknown publisher" warning because Authenticode is
not yet required. Ed25519 protects Beaver Code's update channel; it does not remove Windows' publisher
warning. Authenticode will be added as a separate release gate when an appropriate certificate is
available.
