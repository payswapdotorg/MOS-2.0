#!/usr/bin/env bash
# MOS Desktop installer (Ubuntu/Debian amd64) — v3.14.3-mos.1
# Usage: curl -fsSL https://raw.githubusercontent.com/payswapdotorg/MOS-2.0/main/scripts/install-desktop.sh | sudo bash
set -euo pipefail

RELEASE_BASE="https://github.com/payswapdotorg/MOS-2.0/releases/download/v3.14.3-mos.1"
DEB_NAME="MOS-3.14.3-linux-amd64.deb"
DEB_SHA256="5e0575f52045c8f7617f9ef17cd53c4c8510dff27a7419f5584dfc13578a238d"

ARCH="$(dpkg --print-architecture)"
if [ "$ARCH" != "amd64" ]; then
  echo "ERROR: this release is amd64-only; this machine is $ARCH." >&2
  echo "Grab the AppImage instead: ${RELEASE_BASE}/MOS-3.14.3-linux-x86_64.AppImage" >&2
  exit 1
fi

TMP_DEB="$(mktemp --suffix=.deb)"
trap 'rm -f "$TMP_DEB"' EXIT
echo "Downloading MOS Desktop v3.14.3-mos.1 (~144MB)…"
curl -fL --retry 3 -o "$TMP_DEB" "${RELEASE_BASE}/${DEB_NAME}"

echo "Verifying sha256…"
echo "${DEB_SHA256}  ${TMP_DEB}" | sha256sum -c - || { echo "ERROR: checksum mismatch — download corrupted, aborting." >&2; exit 1; }

echo "Installing (dpkg)…"
dpkg -i "$TMP_DEB" || apt-get install -f -y
echo "MOS installed. Launch it as 'MOS' from your desktop launcher, or run: mos"
