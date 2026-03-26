import chalk from 'chalk';
import { Command } from 'commander';
import { XsmpprojectLanguageMetaData } from 'xsmp';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url)),

 packagePath = path.resolve(__dirname, '..', '..', 'package.json'),
 packageContent = await fs.readFile(packagePath, 'utf-8');

export const generateAction = async (_fileName: string, _opts: GenerateOptions): Promise<void> => {
   // Const services = createXsmpServices(NodeFileSystem).xsmpproject;
   // Const project = await extractAstNode<Project>(fileName, services);
   // Const generatedFilePath = generateJavaScript(project, fileName, opts.destination);
    console.log(chalk.green('Project code generated successfully'));
};

export interface GenerateOptions {
    destination?: string;
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = XsmpprojectLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates JavaScript code that prints "Hello, {name}!" for each greeting in a source file')
        .action(generateAction);

    program.parse(process.argv);
}
