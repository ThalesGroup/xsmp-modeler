
import * as fs from 'node:fs'

const INPUT_FILE = "./src/language/generated/ast.ts";
const OUTPUT_FILE = "./src/language/generated/ast-partial.ts";

const content = fs.readFileSync(INPUT_FILE, "utf-8");

const typeRegex = /export\s+(?:interface|type)\s+(\w+)/g;
const functionRegex = /export\s+function\s+(is\w+)\s*\(/g;
const constRegex = /export\s+const\s+(\w+)\s*=/g;

const types = [...content.matchAll(typeRegex)].map(match => match[1]);

const functions = [...content.matchAll(functionRegex)].map(match => match[1]);

const constants = [...content.matchAll(constRegex)].map(match => match[1]);

const output = `import * as ast from './ast.js';
import type { AstUtils } from 'langium';

${types.map(type => `export type ${type} = AstUtils.DeepPartialAstNode<ast.${type}>;`).join("\n")}

${functions.map(fn => `export function ${fn}(item: unknown): item is ${fn.slice(2)} {\n    return ast.${fn}(item);\n}`).join("\n")}

${constants.map(constName => `export const ${constName} = ast.${constName};`).join("\n")}

`;

fs.writeFileSync(OUTPUT_FILE, output, "utf-8");