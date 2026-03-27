import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { XsmpStarterFileKind } from './file-wizard-templates.js';
import {
    createXsmpStarterFileTemplate,
    getXsmpStarterFileDefaultStem,
    getXsmpStarterFileKinds,
    getXsmpStarterFileLabel,
} from './file-wizard-templates.js';

interface XsmpStarterFileKindPickItem extends vscode.QuickPickItem {
    readonly xsmpKind: XsmpStarterFileKind;
}

export async function createXsmpStarterFileWizard(
    kind?: XsmpStarterFileKind,
    targetUri?: vscode.Uri,
): Promise<void> {
    const selectedKind = kind ?? await promptStarterFileKind();
    if (!selectedKind) {
        return;
    }

    const targetDirectory = await resolveTargetDirectory(targetUri);
    if (!targetDirectory) {
        return;
    }

    const fileStem = await promptStarterFileName(selectedKind);
    if (!fileStem) {
        return;
    }

    const template = createXsmpStarterFileTemplate(selectedKind, {
        fileStem,
        author: os.userInfo().username,
        date: new Date().toISOString(),
    });
    const content = template.content.replace('${uuid}', crypto.randomUUID());
    const filePath = path.join(targetDirectory, template.fileName);

    if (fs.existsSync(filePath)) {
        void vscode.window.showErrorMessage(`${template.label} file '${filePath}' already exists.`);
        return;
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');

    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
}

async function promptStarterFileKind(): Promise<XsmpStarterFileKind | undefined> {
    const items: XsmpStarterFileKindPickItem[] = getXsmpStarterFileKinds().map(kind => ({
        xsmpKind: kind,
        label: getXsmpStarterFileLabel(kind),
        description: `Create a ${getXsmpStarterFileLabel(kind).toLowerCase()} starter file`,
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select the XSMP file type to create',
    });
    return selection?.xsmpKind;
}

async function resolveTargetDirectory(targetUri?: vscode.Uri): Promise<string | undefined> {
    if (targetUri?.scheme === 'file') {
        return await toDirectoryPath(targetUri.fsPath);
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri?.scheme === 'file') {
        return await toDirectoryPath(activeUri.fsPath);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 1) {
        return workspaceFolders[0].uri.fsPath;
    }

    if (workspaceFolders.length > 1) {
        const selection = await vscode.window.showQuickPick(
            workspaceFolders.map(folder => ({
                label: folder.name,
                description: folder.uri.fsPath,
                folder,
            })),
            { placeHolder: 'Select the folder where the XSMP file should be created' },
        );
        return selection?.folder.uri.fsPath;
    }

    const selectedFolders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select the folder where the XSMP file should be created',
        openLabel: 'Select folder',
    });
    return selectedFolders?.[0]?.fsPath;
}

async function toDirectoryPath(candidatePath: string): Promise<string> {
    try {
        const stat = await fs.promises.stat(candidatePath);
        return stat.isDirectory() ? candidatePath : path.dirname(candidatePath);
    } catch {
        return path.dirname(candidatePath);
    }
}

async function promptStarterFileName(kind: XsmpStarterFileKind): Promise<string | undefined> {
    const defaultValue = getXsmpStarterFileDefaultStem(kind);
    for (;;) {
        const value = await vscode.window.showInputBox({
            prompt: `Enter ${getXsmpStarterFileLabel(kind).toLowerCase()} file name`,
            placeHolder: defaultValue,
            value: defaultValue,
        });

        if (value === undefined) {
            return undefined;
        }

        if (/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value)) {
            return value;
        }

        await vscode.window.showErrorMessage('File name must follow the format [A-Za-z][A-Za-z0-9_.-]*');
    }
}
