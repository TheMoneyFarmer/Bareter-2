// Restores the local GoogleAuthPlugin dependency to CapApp-SPM/Package.swift
// after `npx cap sync` overwrites it. Run automatically as part of build:native.
import fs from 'fs';

const pkgPath = 'ios/App/CapApp-SPM/Package.swift';
let content = fs.readFileSync(pkgPath, 'utf8');

if (content.includes('GoogleAuthPlugin')) {
  console.log('[restore-spm] GoogleAuthPlugin already present — nothing to do.');
  process.exit(0);
}

// Insert local package dependency after CapacitorStatusBar
content = content.replace(
  '.package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar")',
  '.package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar"),\n        .package(name: "GoogleAuthPlugin", path: "../../GoogleAuthPlugin")'
);

// Insert product in target dependencies after CapacitorStatusBar product
content = content.replace(
  '.product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")',
  '.product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),\n                .product(name: "GoogleAuthPlugin", package: "GoogleAuthPlugin")'
);

fs.writeFileSync(pkgPath, content);
console.log('[restore-spm] GoogleAuthPlugin re-added to CapApp-SPM/Package.swift');
