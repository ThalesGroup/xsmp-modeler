import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..');

export const builtinWorkspacePackages = [
    { name: '@xsmp/tool-smp', shortName: 'tool-smp', dir: path.join(repoRoot, 'packages', 'xsmp-tool-smp') },
    { name: '@xsmp/tool-adoc', shortName: 'tool-adoc', dir: path.join(repoRoot, 'packages', 'xsmp-tool-adoc') },
    { name: '@xsmp/tool-python', shortName: 'tool-python', dir: path.join(repoRoot, 'packages', 'xsmp-tool-python') },
    { name: '@xsmp/profile-xsmp-sdk', shortName: 'profile-xsmp-sdk', dir: path.join(repoRoot, 'packages', 'xsmp-profile-xsmp-sdk') },
    { name: '@xsmp/profile-esa-cdk', shortName: 'profile-esa-cdk', dir: path.join(repoRoot, 'packages', 'xsmp-profile-esa-cdk') },
    { name: '@xsmp/profile-tas-mdk', shortName: 'profile-tas-mdk', dir: path.join(repoRoot, 'packages', 'xsmp-profile-tas-mdk') },
];

export const vscodeBuiltinWorkspacePackages = builtinWorkspacePackages.filter(
    builtinPackage => builtinPackage.name !== '@xsmp/profile-tas-mdk',
);
