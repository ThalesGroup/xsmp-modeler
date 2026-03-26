import * as path from 'node:path';
import type { XsmpContributionScaffoldContext } from '../../../contributions/index.js';

export async function scaffoldEsaCdkProject(context: XsmpContributionScaffoldContext): Promise<void> {
    await context.writeFile(path.join(context.projectDir, 'CMakeLists.txt'), `
file(GLOB_RECURSE SRC CONFIGURE_DEPENDS src/*.cpp src-gen/*.cpp)

simulus_library(
    MAIN
    SOURCES
        \${SRC}
    LIBRARIES
        esa.ecss.smp.cdk
)
target_include_directories(${context.projectName} PUBLIC src src-gen)
`.trimStart());
}
