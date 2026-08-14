#!/bin/bash

set -euo pipefail

archive_path="${1:-}"

if [[ -z "$archive_path" || ! -d "$archive_path" ]]; then
  echo "Usage: $0 /path/to/App.xcarchive" >&2
  exit 2
fi

application_path="$(find "$archive_path/Products/Applications" -maxdepth 1 -name '*.app' -print -quit)"

if [[ -z "$application_path" ]]; then
  echo "FAIL: no app bundle found in $archive_path" >&2
  exit 1
fi

framework_names=(React ReactNativeDependencies hermes)
failed=0

for framework_name in "${framework_names[@]}"; do
  framework_binary="$application_path/Frameworks/$framework_name.framework/$framework_name"
  dsym_binary="$archive_path/dSYMs/$framework_name.framework.dSYM/Contents/Resources/DWARF/$framework_name"

  if [[ ! -f "$framework_binary" ]]; then
    echo "FAIL: missing framework binary: $framework_binary" >&2
    failed=1
    continue
  fi

  if [[ ! -f "$dsym_binary" ]]; then
    echo "FAIL: missing dSYM binary: $dsym_binary" >&2
    failed=1
    continue
  fi

  framework_uuid="$(/usr/bin/dwarfdump --uuid "$framework_binary" | awk '{print $2}')"
  dsym_uuid="$(/usr/bin/dwarfdump --uuid "$dsym_binary" | awk '{print $2}')"

  if [[ "$framework_uuid" != "$dsym_uuid" ]]; then
    echo "FAIL: $framework_name UUID mismatch (framework=$framework_uuid dSYM=$dsym_uuid)" >&2
    failed=1
    continue
  fi

  echo "PASS: $framework_name UUID $framework_uuid"
done

exit "$failed"
