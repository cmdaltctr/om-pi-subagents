#!/usr/bin/env bash
# Human-run approval with npm authentication and 2FA. Never invoked by an agent or CI.
# Usage: bun run release:approve [<stage-uuid>]
set -euo pipefail

repo=${OMPS_REPO:-cmdaltctr/om-pi-subagents}
package=om-pi-subagents
poll_seconds=${OMPS_RELEASE_POLL_SECONDS:-5}
uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

for tool in gh npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Install $tool before running bun run release:approve." >&2
    exit 1
  fi
done
if [[ $# -gt 1 || ! $poll_seconds =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "Use bun run release:approve [<stage-uuid>] and a non-negative OMPS_RELEASE_POLL_SECONDS value." >&2
  exit 1
fi

if ! tag=$(gh release view --repo "$repo" --json tagName --jq .tagName); then
  echo "Cannot read the latest release. Run 'gh auth status', then 'gh release view --repo $repo'." >&2
  exit 1
fi
version=${tag#v}
if [[ ! $version =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Invalid stable release tag '$tag'. Check 'gh release view --repo $repo' before approval." >&2
  exit 1
fi
# Prefer the registry over npm's cache so a previous approval cannot be repeated.
if [[ $(npm view "$package" version --prefer-online 2>/dev/null || true) == "$version" ]]; then
  echo "$package@$version is already on npm. Nothing is waiting for approval." >&2
  exit 1
fi

stage_id=${1:-}
if [[ -z $stage_id ]]; then
  if ! body=$(gh release view "$tag" --repo "$repo" --json body --jq .body); then
    echo "Cannot read release notes. Run 'gh release view $tag --repo $repo' or 'npm stage list $package'." >&2
    exit 1
  fi
  stage_id=$(printf '%s\n' "$body" | grep -Eo "npm stage approve $uuid" | tail -1 | cut -d' ' -f4 || true)
fi
if [[ ! $stage_id =~ ^$uuid$ ]]; then
  echo "Missing or invalid stage UUID. Run 'npm stage list $package', then 'bun run release:approve <stage-uuid>'." >&2
  exit 1
fi

echo "Approving $package@$version (stage $stage_id)."
if ! npm stage view "$stage_id"; then
  echo "Cannot display the stage. Check 'npm stage view $stage_id' and 'npm login' before retrying." >&2
  exit 1
fi
if ! npm stage approve "$stage_id"; then
  echo "Approval failed. Run 'npm login', then retry 'bun run release:approve $stage_id' with 2FA." >&2
  exit 1
fi

for ((attempt = 1; attempt <= 30; attempt++)); do
  if [[ $(npm view "$package" version --prefer-online 2>/dev/null || true) == "$version" ]]; then
    echo "Released $package@$version. npm latest is $version."
    echo "Update Pi when ready: pi update npm:$package"
    exit 0
  fi
  if [[ $attempt -lt 30 ]]; then sleep "$poll_seconds"; fi
done
echo "Approval succeeded, but registry visibility is unconfirmed. Check 'npm view $package version --prefer-online' before retrying approval." >&2
exit 1
