# Publishing the Vidu S1 Dify Plugin

This guide reflects the official Dify documentation and the current
`langgenius/dify-plugins` repository as checked on 2026-07-21.

## Release identity

- Author: `shengshu-ai`
- Plugin: `vidu_s1`
- Current version: `0.0.1`
- Source directory: `plugins/dify`
- Package: `vidu_s1-0.0.1.difypkg`

The `author` and `name` values in `manifest.yaml` and
`provider/vidu_s1.yaml` must stay identical. For installation from GitHub,
`author` must also match the GitHub account or organization that owns the
repository. This repository is owned by `shengshu-ai`, so the current values
are suitable.

## Build and validate

Install the [Dify Plugin CLI][cli], then run from the repository root:

```bash
dify version
dify plugin package ./plugins/dify -o vidu_s1-0.0.1.difypkg
PYTHONPATH=plugins/dify uv run --project plugins/dify pytest plugins/dify/tests
```

Before distributing the package, inspect its contents and checksum:

```bash
unzip -l vidu_s1-0.0.1.difypkg
shasum -a 256 vidu_s1-0.0.1.difypkg
```

The package must contain only runtime files. Do not include secrets, `.env`,
`.git`, virtual environments, caches, logs, IDE/OS files, or unexplained
executables. The current Marketplace checks also require a valid
`manifest.yaml`, English `README.md`, non-empty `PRIVACY.md`, a non-template
icon under `_assets/`, installable dependencies, Python 3.12 compatibility,
and `dify_plugin>=0.5.0`. The daemon's documented default package limit is
50 MB.

Dify does not document a required SHA-256 checksum file for local, GitHub, or
Marketplace publication. Publishing a checksum with a GitHub Release is still
a useful integrity aid, but it does not replace Dify's package signature.

## Option 1: Local file

Use this for private testing or direct distribution. In Dify, open
**Plugins > Install Plugin > Via Local File**, upload the `.difypkg`, review
its permissions, and install it. This path has no Marketplace review.

Self-hosted Dify verifies signatures by default. The production-safe path is
to sign the package and give administrators the public key:

```bash
dify signature generate -f shengshu-ai
dify signature sign vidu_s1-0.0.1.difypkg -p shengshu-ai.private.pem
dify signature verify vidu_s1-0.0.1.signed.difypkg -p shengshu-ai.public.pem
```

Never commit the private key. Administrators must explicitly trust the public
key through the plugin daemon's third-party signature configuration. Dify
Cloud manages signatures centrally and does not expose this configuration.
For development-only self-hosted environments, verification can be disabled
with `FORCE_VERIFYING_SIGNATURE=false`, but this permits any unsigned plugin
and is not recommended for production. See [signature verification][signing].

## Option 2: GitHub Release

This is the fastest public path and does not require Marketplace review.

1. Push the plugin source to this public repository.
2. Ensure `manifest.yaml` version is `0.0.1` and package it.
3. Create tag `v0.0.1`; the tag version must match the manifest version.
4. Create a GitHub Release for the tag and attach
   `vidu_s1-0.0.1.difypkg` as a release asset.
5. Optionally attach or publish its SHA-256 checksum.

With GitHub CLI, after the release commit is on the remote:

```bash
git tag v0.0.1
git push origin v0.0.1
gh release create v0.0.1 vidu_s1-0.0.1.difypkg \
  --repo shengshu-ai/vidu-s1-api \
  --title "Vidu S1 Dify Plugin v0.0.1" \
  --notes "Initial Dify plugin release."
```

Users install it through **Plugins > Install Plugin > From GitHub**, enter
`https://github.com/shengshu-ai/vidu-s1-api`, select `v0.0.1`, and confirm.
Dify discovers versions from GitHub Releases containing a `.difypkg` asset;
merely committing the package to the repository is not sufficient for this
installation path. Self-hosted signature rules still apply.

## Option 3: Dify Marketplace

Marketplace publication is performed through a pull request to
[`langgenius/dify-plugins`][plugins-repo]. It includes automated validation and
human review; after merge, Dify publishes the plugin automatically.

1. Fork `langgenius/dify-plugins` to the `shengshu-ai` account.
2. Create `shengshu-ai/vidu_s1/` in that fork.
3. Put exactly one new file in the submission PR:
   `shengshu-ai/vidu_s1/vidu_s1-0.0.1.difypkg`.
4. Open an English-only PR against `langgenius/dify-plugins:main` using its
   current PR template.
5. Select **New plugin** and **Medium risk**. Explain that the plugin performs
   a write action (creates a live session) and transmits prompts, avatar
   URL/base64 data, session identifiers, and credentials to the fixed,
   documented Vidu HTTPS API endpoints. State that it does not execute code,
   access the filesystem, or fetch arbitrary URLs itself.
6. Include the source repository, a support contact, local test results,
   privacy notes, and any Cloud/Community Edition testing limitation.
7. Address automated and human review feedback by pushing to the same PR.

Suggested fork workflow:

```bash
gh repo fork langgenius/dify-plugins --clone
cd dify-plugins
git checkout -b add-vidu-s1-0.0.1
mkdir -p shengshu-ai/vidu_s1
cp ../vidu-s1-api/vidu_s1-0.0.1.difypkg shengshu-ai/vidu_s1/
git add shengshu-ai/vidu_s1/vidu_s1-0.0.1.difypkg
git commit -m "add vidu_s1 plugin 0.0.1"
git push -u origin add-vidu-s1-0.0.1
gh pr create --repo langgenius/dify-plugins --base main --fill
```

The Marketplace repository's current CI requires a single `.difypkg` change,
unpacks it, rejects reserved authors or reused versions, checks the icon,
installs dependencies, starts the plugin, and repackages it. Plugin source
remains in this repository; do not add a second source tree to the Marketplace
PR.

Reviewers also check maintenance commitment, uniqueness, intellectual-property
and branding compliance, content quality, dependency scope, security boundary,
and privacy accuracy. `PRIVACY.md` must disclose data handled by both the
plugin and the Vidu API, including where the data is sent and a link to Vidu's
privacy policy. Marketplace currently accepts free plugins only.

## Publishing updates

For every update:

1. Bump `version` in `plugins/dify/manifest.yaml`; never reuse a published
   version.
2. Test and create a new package named for that version.
3. For GitHub distribution, create a matching semantic-version tag and Release
   with the new package asset.
4. For Marketplace distribution, open a new PR that adds only the new
   `.difypkg` under `shengshu-ai/vidu_s1/`. Keep older packages in place.
5. Document breaking changes in the README and release notes. While the
   Marketplace remains in public beta, Dify asks maintainers to avoid breaking
   changes and deprecate before removal.

Dify also documents an optional [auto-publish GitHub Action][auto-pr] for
packaging and opening Marketplace update PRs. Use it only after the manual
`0.0.1` submission succeeds and pin/review third-party Action dependencies
before adding it to this repository.

## Status of the removed release notes

The former `plugins/dify/docs/install-from-github.md` and
`plugins/dify/docs/marketplace-release.md` are no longer present, so their
exact text cannot be audited. Their apparent high-level claims remain valid:
Dify officially supports installation from a GitHub Release and Marketplace
submission by PR. This file replaces them with the current details that matter:
the GitHub Release must contain a `.difypkg` asset, Marketplace PRs should add
exactly one package, self-hosted third-party installs are signature-checked by
default, and privacy/security disclosures are part of review.

## Official sources

- [Dify: Publish Plugins (distribution overview)][overview]
- [Dify: Package as Local File and Share][local-file]
- [Dify: Publish to Individual GitHub Repository][github-release]
- [Dify: Publish to Dify Marketplace][marketplace]
- [Dify: Third-Party Signature Verification][signing]
- [Dify: Privacy Guidelines][privacy]
- [`langgenius/dify-plugins` submission requirements][submission]
- [`langgenius/dify-plugins` PR template][pr-template]
- [`langgenius/dify-plugins` pre-check workflow][precheck]

[cli]: https://docs.dify.ai/en/develop-plugin/getting-started/cli
[overview]: https://docs.dify.ai/en/develop-plugin/publishing/marketplace-listing/release-overview
[local-file]: https://docs.dify.ai/en/develop-plugin/publishing/marketplace-listing/release-by-file
[github-release]: https://docs.dify.ai/en/develop-plugin/publishing/marketplace-listing/release-to-individual-github-repo
[marketplace]: https://docs.dify.ai/en/develop-plugin/publishing/marketplace-listing/release-to-dify-marketplace
[auto-pr]: https://docs.dify.ai/en/develop-plugin/publishing/marketplace-listing/plugin-auto-publish-pr
[signing]: https://docs.dify.ai/en/develop-plugin/publishing/standards/third-party-signature-verification
[privacy]: https://docs.dify.ai/en/develop-plugin/publishing/standards/privacy-protection-guidelines
[plugins-repo]: https://github.com/langgenius/dify-plugins
[submission]: https://github.com/langgenius/dify-plugins/blob/main/docs/plugin-submission-requirements.md
[pr-template]: https://github.com/langgenius/dify-plugins/blob/main/.github/pull_request_template.md
[precheck]: https://github.com/langgenius/dify-plugins/blob/main/.github/workflows/pre-check-plugin.yaml
