/**
 * afterPack hook.
 *
 * 1. Scrub build-machine junk from the bundled backend (venv, __pycache__).
 *    A copied venv is broken on end-user machines and, worse, its presence
 *    makes the app skip its own first-launch environment setup.
 *
 * 2. macOS only: ad-hoc deep-sign the .app so the bundle signature properly
 *    seals all bundled resources (Python runtime, backend, migrations).
 *    Apple Silicon requires every binary to be signed; electron-builder only
 *    applies a partial "linker-signed" signature when real code signing is
 *    skipped (no Developer ID). That partial signature leaves the bundle
 *    incompletely sealed, which can cause Gatekeeper to report the downloaded
 *    app as "damaged". A free ad-hoc deep sign (`codesign -s -`) re-seals the
 *    whole bundle so users only see the milder "unidentified developer" prompt
 *    that right-click → Open bypasses — no $99 Developer ID required.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function scrubBackendJunk(resourcesDir) {
  const backendDir = path.join(resourcesDir, "backend");
  if (!fs.existsSync(backendDir)) return;

  const venvDir = path.join(backendDir, "venv");
  if (fs.existsSync(venvDir)) {
    fs.rmSync(venvDir, { recursive: true, force: true });
    console.log("[afterPack] removed bundled backend/venv");
  }

  const stack = [backendDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === "__pycache__") {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        stack.push(full);
      }
    }
  }
}

exports.default = async function afterPack(context) {
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  const resourcesDir =
    context.electronPlatformName === "darwin"
      ? path.join(appPath, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  scrubBackendJunk(resourcesDir);

  // The signing below only applies to macOS; the scrub must run first so the
  // signature seals the cleaned bundle.
  if (context.electronPlatformName !== "darwin") return;

  try {
    execSync(`codesign --deep --force --timestamp=none -s - "${appPath}"`, {
      stdio: "inherit",
    });
    execSync(`codesign --verify --deep --strict "${appPath}"`, {
      stdio: "inherit",
    });
    console.log(`[afterPack] ad-hoc deep-signed: ${appPath}`);
  } catch (err) {
    console.warn(`[afterPack] ad-hoc sign failed (non-fatal): ${err.message}`);
  }
};
