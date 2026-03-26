import * as path from 'node:path';
import type { XsmpContributionScaffoldContext } from '../../../contributions/index.js';

export async function scaffoldXsmpSdkProject(context: XsmpContributionScaffoldContext): Promise<void> {
    await context.writeFile(path.join(context.projectDir, 'CMakeLists.txt'), `
cmake_minimum_required(VERSION 3.14)

project(
    ${context.projectName}
#   VERSION 1.0.0
#   DESCRIPTION ""
#   HOMEPAGE_URL ""
    LANGUAGES CXX)

include(FetchContent)
FetchContent_Declare(
    xsmp-sdk
    GIT_REPOSITORY https://github.com/ThalesGroup/xsmp-sdk.git
    GIT_TAG        main # replace with a specific tag
)
FetchContent_MakeAvailable(xsmp-sdk)
list(APPEND CMAKE_MODULE_PATH "\${xsmp-sdk_SOURCE_DIR}/cmake")

# add python directory to PYTHONPATH
include(PathUtils)
python_path_prepend("python")

file(GLOB_RECURSE SRC CONFIGURE_DEPENDS src/*.cpp src-gen/*.cpp)

add_library(${context.projectName} SHARED \${SRC})
target_include_directories(${context.projectName} PUBLIC src src-gen)
target_link_libraries(${context.projectName} PUBLIC Xsmp::Cdk)

# --------------------------------------------------------------------

if(CMAKE_PROJECT_NAME STREQUAL PROJECT_NAME)
    include(CTest)
endif()

if(CMAKE_PROJECT_NAME STREQUAL PROJECT_NAME AND BUILD_TESTING)
    include(Pytest)
    pytest_discover_tests()
endif()
`.trimStart());

    await context.writeFile(path.join(context.projectDir, 'README.md'), `
# ${context.projectName}

Project description.

## System Requirements

Check [xsmp-sdk system requirements](https://thalesgroup.github.io/xsmp-sdk/requirements.html).

## How to Build

\`\`\`bash
cmake -B ./build -DCMAKE_BUILD_TYPE=Release
cmake --build ./build --config Release
\`\`\`

## How to Test

\`\`\`bash
cd build && ctest -C Release --output-on-failure
\`\`\`
`.trimStart());
}
