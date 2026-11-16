const fs = require('fs');
const path = require('path');

const targetFile = require.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js');
let content = fs.readFileSync(targetFile, 'utf8');

const oldPattern = `        else {
            const wineVm = new WineVm_1.WineVmManager((_a = packager.config.toolsets) === null || _a === void 0 ? void 0 : _a.wine);
            await wineVm.exec(installerPath, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`;

const newPattern = `        else {
            try {
                await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
            } catch (uErr) {
                try { await packager.signIf(installerPath); } catch (sErr) {}
                const wineVm = new WineVm_1.WineVmManager((_a = packager.config.toolsets) === null || _a === void 0 ? void 0 : _a.wine);
                await wineVm.exec(installerPath, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('[patch-nsis] Successfully patched NsisTarget.js with UninstallerReader!');
} else if (content.includes('nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath)')) {
  console.log('[patch-nsis] NsisTarget.js is already patched.');
} else {
  console.warn('[patch-nsis] Warning: target pattern not matched.');
}
