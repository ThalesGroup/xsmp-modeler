import * as path from 'node:path';
import type { XsmpContributionScaffoldContext } from '../../../contributions/index.js';

export async function scaffoldTasMdkProject(context: XsmpContributionScaffoldContext): Promise<void> {
    context.addDependency('TasMdk');

    await context.writeFile(path.join(context.projectDir, 'Makefile'), `
COMPONENT_NAME=${context.projectName}

ifndef COMPILE_CHAIN
$(error Variable COMPILE_CHAIN is not defined)
endif

-include $(COMPILE_CHAIN)/component_declaration.mk

CXX_STANDARD=11

LIBRARY_NAME=lib${context.projectName.toLowerCase()}.so

include $(COMPILE_CHAIN)/rules_libs.mk

$(COMPONENT_NAME)_tests:
\t$(MAKE) -C tests
\t$(MAKE) -C tests tu
`.trimStart());

    await context.writeFile(path.join(context.projectDir, 'component.conf'), `
__LIBRARIES__=TasMdk
__REFERENCED_LIBRARIES__=
__INCLUDE_FOLDERS__=include,include-gen
__SOURCE_FOLDERS__=src,src-gen
__OPERATIONAL_PYTHON_TOOLS_FOLDER__=helpers
__VERSION__=1
`.trimStart());

    const testsDir = path.join(context.projectDir, 'tests');
    await context.ensureDir(testsDir);

    await context.writeFile(path.join(testsDir, 'Makefile'), `
COMPONENT_NAME=${context.projectName}--tests

ifndef COMPILE_CHAIN
$(error Variable COMPILE_CHAIN is not defined)
endif

-include $(COMPILE_CHAIN)/component_declaration.mk

include $(COMPILE_CHAIN)/rules_variants.mk

$(COMPONENT_NAME)_tests: $(COMPONENT_NAME)_tests_python

$(COMPONENT_NAME)_tests_python:
\tCOMPONENT_NAME=$(COMPONENT_NAME) \\
\tVT_STDOUT=$(VT_STDOUT) \\
\tPATH=\${ROOT_OBJ}/gram_addons--simulator_launcher/BIN:\${PATH} \\
\tPYTHONPATH=\${PYTHONPATH} \\
\tLD_LIBRARY_PATH=\${LD_LIBRARY_PATH} \\
\tpython3 -m gram_addons__python_test_suite.runtests $(TEST_ARGS)
`.trimStart());

    await context.writeFile(path.join(testsDir, 'component.conf'), `
__LIBRARIES__=\\
gram_addons--python_test_suite,\\
gram_addons--simulator_launcher,\\
${context.projectName}
__COMPONENTS_ROOT_PATH__=.
`.trimStart());

    await context.writeFile(path.join(testsDir, `ut_${context.projectName}.py`), `
# Copyright (C) ${new Date().getFullYear()} THALES ALENIA SPACE FRANCE. All rights reserved
 
from gram_addons__python_test_suite.gram_test_case import GramTestCase, SECOND
 
# Import your model(s)
#import ${context.projectName}.builder.${context.projectName}.MyModel as MyModelBuilder
 
 
class MyModelTestCase(GramTestCase):
    '''
    Test case description
    '''
 
    def buildSimulatorData(self, jsim):
        # Model instantiation
        #jsim.create('/MyModel', MyModelBuilder)
        pass 
        # Configuration
        #jsim['/MyModel.fea_debug_level'] = 100

    def test_model_feature1(self):
        '''
        Test description
        ''' 
        self.sim.run_delta(SECOND)
 
        # Do some checks 
        #self.assertEqual(self.sim.get_value('/MyModel', 'field_name'), False)
`.trimStart());
}
