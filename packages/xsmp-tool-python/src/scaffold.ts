import * as path from 'node:path';
import type { XsmpContributionScaffoldContext } from 'xsmp/contributions';

export async function scaffoldPythonProject(context: XsmpContributionScaffoldContext): Promise<void> {
    const pythonDir = path.join(context.projectDir, 'python');
    const projectPackageDir = path.join(pythonDir, context.projectIdentifier);

    await context.ensureDir(projectPackageDir);

    await context.writeFile(path.join(context.projectDir, 'pytest.ini'), `
# pytest.ini
[pytest]
testpaths = python
`.trimStart());

    await context.writeFile(path.join(projectPackageDir, `test_${context.projectIdentifier}.py`), `
import ecss_smp
import xsmp
import ${context.projectIdentifier}

class Test${context.projectIdentifier}(xsmp.unittest.TestCase):
    try:
        sim: ${context.projectIdentifier}._test_${context.projectIdentifier}.Simulator
    except AttributeError:
        pass
    
    def loadAssembly(self, sim: ecss_smp.Smp.ISimulator):
        sim.LoadLibrary("${context.projectIdentifier}")
        # Create instances, configuration, and connections here.

    def test_${context.projectIdentifier}(self):
        # Add project-specific assertions here.
        pass
`.trimStart());
}
