import { describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { createXsmpServices } from '@xsmp/core';
import type * as ast from '@xsmp/core/ast-partial';

describe('Project manager', () => {
    test.each(['outer-first', 'inner-first'] as const)(
        'assigns a document to the innermost project with %s insertion order',
        order => {
            const services = createXsmpServices(EmptyFileSystem);
            const documents = services.shared.workspace.LangiumDocuments;
            const documentFactory = services.shared.workspace.LangiumDocumentFactory;

            const outerProject = documentFactory.fromString<ast.Project>(`
project 'outer'
using 'ECSS_SMP_2025'
source 'nested/src'
`, URI.file('/workspace/xsmp.project'));
            const innerProject = documentFactory.fromString<ast.Project>(`
project 'inner'
using 'ECSS_SMP_2025'
source '.'
`, URI.file('/workspace/nested/xsmp.project'));
            const model = documentFactory.fromString(`
catalogue model
`, URI.file('/workspace/nested/src/model.xsmpcat'));

            for (const project of order === 'outer-first'
                ? [outerProject, innerProject]
                : [innerProject, outerProject]) {
                documents.addDocument(project);
            }
            documents.addDocument(model);

            expect(services.shared.workspace.ProjectManager.getProject(model)?.name).toBe('inner');
        },
    );
});
