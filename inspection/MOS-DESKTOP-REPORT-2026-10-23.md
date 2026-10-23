# MOS Desktop Installation and Verification Report

**Result: PASS** — the current MOS desktop build is installed and was verified in
the active Ubuntu desktop. At report preparation, the app is open on its Home
screen.

## Source and environment

- Repository: `https://github.com/payswapdotorg/MOS-2.0`
- Branch and source commit: `main`, `c2ffc4582bbf414a303c667062c8329b86e62d37`
- Machine: Ubuntu 25.04, `amd64` / x86_64, GNOME on Wayland. About 93 GiB was
  free on the root filesystem after installation.
- Build runtime: Node.js 24.14.0 and pnpm 10.33.2, matching the repository pins.

The official `v3.14.3-mos.1` Linux package was checksum-verified, but predates
the current `main` MOS Agent Console UI. The current source revision was built
instead; the installed package is a local build, not an official release
artifact.

## Build and installation

Commands used:

```text
npm exec --yes --package=pnpm@10.33.2 -- pnpm install --frozen-lockfile
pnpm --filter @zcode/desktop build:no-runtime-assets
pnpm bundle:desktop -- --skip-prepare --skip-build --os linux --arch x64
pkexec apt install packages/desktop/dist/MOS-3.14.3-linux-amd64.deb
```

The first desktop build attempt exposed missing emitted outputs for current MOS
workspace dependencies. Those workspace outputs were built, after which the
desktop build, package creation, runtime dependency check, and bundle-size audit
passed. The Debian package was 136.6 MiB, below the configured 500 MiB limit.

- Artifact: `packages/desktop/dist/MOS-3.14.3-linux-amd64.deb`
- SHA-256: `be0434648fca83a8ca23a4ce71d52384dfe12660e5e8dd729e2a9cf1c5320774`
- Installed package: `mos`, `install ok installed`, version `3.14.3`, `amd64`
- Executable: `/opt/MOS/mos`; launcher: `/usr/share/applications/mos.desktop`
- Install scope: system package; the user's MOS profile was not reset. Existing
  PaySwap v1.2.0 and its data were left untouched.

APT returned exit status 100 because the pre-existing Falkon configuration
failed: `ln: failed to create symbolic link
'/usr/share/qt5/qtwebengine_dictionaries': No such file or directory`. The
transcript confirms `Setting up mos (3.14.3)` and `dpkg-query` confirms MOS is
installed. Falkon was not modified or repaired.

## Launch and UI verification

Launched as the regular desktop user with:

```text
systemd-run --user --unit=mos-desktop ... /usr/bin/env -u WAYLAND_DISPLAY \
  /opt/MOS/mos --ozone-platform=x11 --enable-logging=stderr
```

The X11 Ozone option was used to permit a native-window screenshot on this
Wayland desktop. This is the packaged Electron application, not a browser or
development server. Its live window is 1200 × 800 and identifies itself as MOS.

- **Home:** visibly displays MOS's marketing-engineering overview and MOS
  navigation. It does not open in the inherited ZCode coding-agent interface.
- **Agent Console:** opened from the app's navigation. The screenshot shows no
  active mission, no selected mission, and zero plans, strategies, runs, or
  authorizations.
- **Research Lab:** opened from the app's navigation. It explicitly labels
  counterfactual output as simulated and not measured; its visible record counts
  are zero.
- Returned the app to Home and left it open there.
- No mission, provider connection, payment, publication, message, or other
  external side effect was initiated.
- The desktop startup log records registration of the inherited `zcode` deep
  link scheme. The inspected application screens themselves show MOS branding.

The application launched and rendered these screens; no full repository test
suite was run as part of this local installation task. Non-fatal graphics and
desktop-schema warnings are retained in the startup evidence.

## Evidence

- [Home screen](mos-home-live.png)
- [Agent Console](mos-agent-console-live.png)
- [Research Lab](mos-research-lab-live.png)
- [Current sanitized desktop startup log](mos-desktop-startup-current.log)
- [APT/dpkg installation evidence](mos-installation-dpkg-evidence.log)
- [Package identity and digest evidence](mos-package-verification.txt)
- [Build logs](build-logs/)

Build and startup logs in this directory have local home-directory paths
redacted. The Debian package itself is not included in the evidence bundle; its
path and digest are recorded above.
