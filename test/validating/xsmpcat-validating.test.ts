import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import { createXsmpServices } from "../../src/language/xsmp-module.js";
import { Catalogue, isCatalogue, } from "../../src/language/generated/ast.js";
import * as path from 'path';
import * as fs from 'fs';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const doParse = parseHelper<Catalogue>(services.xsmpcat);
    parse = (input: string) => doParse(input, { validation: true });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating Xsmpcat', () => {

    test('check validation issues', async () => {

        document = await parse(fs.readFileSync(path.resolve(__dirname, 'test.xsmpcat')).toString(), { documentUri: 'test.xsmpcat' });

        expect(
            checkDocumentValid(document) ?? document.diagnostics?.map(diagnosticToString)?.join('\n')
            ).toBe(s`
[105:127..105:134]: Could not resolve reference to Type named 'Invalid'.
[9:10..9:15]: An Element Name shall not be an ISO/ANSI C++ keyword.
[26:10..26:13]: An Element Name shall start with a letter.
[52:1..52:19]: Duplicated annotation of a non-repeatable type. Only annotation types marked with '@allowMultiple' can be used multiple times on a single target.
[53:1..53:19]: This annotation is disallowed for element of type PrimitiveType.
[52:1..52:19]: A value is required.
[105:47..105:51]: The PrimitiveType Smp.Bool is not visible.
[105:22..105:32]: A Parameter shall not be both ByPointer and ByReference.
[3:9..3:21]: Invalid date format (e.g: 1970-01-01T00:00:00Z).
[9:0..9:9]: This Catalogue is not contained in a project.
[16:4..16:11]: Missing Type UUID.
[23:4..23:13]: Missing Type UUID.
[23:14..23:18]: Duplicated Type name.
[29:4..29:11]: Missing Type UUID.
[40:19..40:28]: Missing Type UUID.
[48:11..48:20]: Missing Type UUID.
[54:1..54:10]: Missing Type UUID.
[56:21..56:27]: Missing Type UUID.
[58:15..58:23]: A Constant must have an initialization value.
[64:4..66:5]: An Enumeration shall contains at least one literal.
[71:8..71:10]: Duplicated literal name.
[71:13..71:14]: Enumeration Literal Values shall be unique within an Enumeration.
[74:26..74:33]: Expecting an Integral Type.
[77:22..77:23]: Minimum shall be less or equal than Maximum.
[81:26..81:31]: Expecting a Floating Point Type.
[83:22..83:25]: Minimum shall be less or equal than Maximum.
[89:22..89:25]: Minimum shall be less than Maximum.
[91:14..91:50]: Duplicated UUID.
[97:4..97:10]: Missing Type UUID.
[99:4..99:13]: Missing Type UUID.
[102:8..102:15]: An Operation of an Interface shall not be static.
[103:8..103:16]: An Operation shall not be both Static and Virtual.
[104:8..104:17]: An Operation shall not be both Static and Abstract.
[105:83..105:98]: Duplicated parameter name.
[105:153..105:154]: Duplicated parameter name.
[105:145..105:154]: The Parameter requires a default vallue.
[105:74..105:82]: Deprecated.
[105:100..105:110]: A Parameter shall not be both ByPointer and ByReference.
[105:148..105:152]: The PrimitiveType Smp.Bool is not visible.
[111:61..111:65]: Expecting a Field.
[107:8..107:15]: A Property of an Interface shall not be static.
[108:8..108:16]: A Property shall not be both Static and Virtual.
[109:8..109:17]: A Property shall not be both Static and Abstract.
[107:8..107:15]: A Property shall not be Static if the attached field is not Static.
[115:4..115:9]: Missing Type UUID.
[117:39..117:89]: Binary operator '+' is not supported for operands of type 'Float64' and 'String8'.
[118:25..118:34]: Deprecated: do not use
[119:38..119:40]: A 'Char8' shall contain exactly one character.
[120:38..120:45]: A 'Char8' shall contain exactly one character.
[121:38..121:48]: A 'Char8' shall contain exactly one character.
[127:53..127:65]: Duplicated exception.
[128:30..128:34]: The PrimitiveType Smp.Bool is not visible.
[129:30..129:34]: The PrimitiveType Smp.Bool is not visible.
[132:14..132:35]: The Integer hidden.privateInteger is not visible.
[138:137..138:138]: Deprecated: do not use
[138:137..138:138]: The Type of the AttachedField shall match the Type of the Property.
[138:84..138:96]: Duplicated exception.
[138:121..138:133]: Duplicated exception.
[136:8..136:18]: A Property shall not be both ByPointer and ByReference.
[142:11..142:12]: Deprecated: do not use
[142:11..142:12]: Field is not an Input.
[144:11..144:18]: Expecting a Field.
[143:12..143:13]: Deprecated: do not use
[143:12..143:13]: Field is not an Output.
[145:12..145:19]: Expecting a Field.
[151:29..151:31]: Lower bound shall be a positive number or 0.
[153:29..153:31]: Lower bound shall be a positive number or 0.
[153:29..153:31]: Lower bound shall be less or equal to the upper bound, if present.
Upper bound shall be -1 or larger or equal to the lower bound.
[154:29..154:30]: Lower bound shall be less or equal to the upper bound, if present.
Upper bound shall be -1 or larger or equal to the lower bound.
[156:36..156:43]: The default Component shall be a sub type of _ns.MyService
[161:4..161:9]: Missing Type UUID.
[164:36..164:37]: The Field is not visible.
[164:36..164:37]: Deprecated: do not use
[164:36..164:37]: The Type of the AttachedField shall match the Type of the Property.
[165:36..165:38]: Deprecated.
[168:18..168:22]: The type PrimitiveType is not a sub type of EventType.
[169:20..169:24]: The type PrimitiveType is not a sub type of EventType.
[174:4..174:9]: Missing Type UUID.
[178:37..178:41]: The PrimitiveType Smp.Bool is not visible.
[181:17..181:21]: The PrimitiveType Smp.Bool is not visible.
[184:4..184:9]: Missing Type UUID.
[189:4..189:13]: Missing Type UUID.
[192:17..192:21]: The PrimitiveType Smp.Bool is not visible.
[195:4..195:9]: Missing Type UUID.
[197:4..197:9]: Missing Type UUID.
[199:4..199:9]: Missing Type UUID.
[203:4..203:9]: Missing Type UUID.
[205:4..205:9]: Missing Type UUID.
[207:4..207:9]: Missing Type UUID.
[209:4..209:9]: Missing Type UUID.
[211:4..211:10]: Missing Type UUID.
[216:10..216:21]: Duplicated name.
[235:38..235:39]: The array type expect 3 element(s), got 4 element(s).
[237:31..237:35]: An array shall be initialized with a collection.
[238:34..238:35]: Invalid field name, expecting x.
[238:54..238:55]: Invalid field name, expecting z.
[239:32..239:42]: Partial initialization, the structure type expect 3 element(s), got 1 element(s).
[240:39..240:40]: The structure type expect 3 element(s), got 4 element(s).
[241:32..241:36]: A Structure shall be initialized with a collection.
[242:26..242:29]: Int32 cannot be converted to Smp.Int8.
[244:36..244:50]: Int64 cannot be converted to Smp.Int32.
[245:29..245:33]: RangeError: Division by zero
[249:14..249:18]: The PrimitiveType Smp.Bool is not visible.
[250:41..250:44]: Unary operator '-' is not supported for operand of type 'String8'.
[250:47..250:50]: Unary operator '!' is not supported for operand of type 'String8'.
[250:53..250:56]: Unary operator '+' is not supported for operand of type 'String8'.
[250:59..250:62]: Unary operator '~' is not supported for operand of type 'String8'.
[257:10..257:21]: Duplicated name.
[14:4..14:11]: Missing Type UUID.
[29:30..29:38]: The type Structure is not a sub type of Service.
[29:4..29:11]: The Service shall be abstract.
[40:11..40:18]: Illegal modifier.
[40:29..40:33]: The PrimitiveType Smp.Bool is not visible.
[40:34..40:49]: Default value is missing.
[48:21..48:25]: The PrimitiveType Smp.Bool is not visible.
[44:14..44:19]: Duplicated usage.
[45:14..45:21]: Invalid usage.
[54:11..54:16]: Unsupported Primitive Type.
[56:11..56:20]: Illegal modifier.
[58:8..58:14]: Invalid modifier.
[60:36..60:44]: Recursive Field Type.
[64:4..64:8]: Missing Type UUID.
[68:4..68:8]: Missing Type UUID.
[74:4..74:11]: Missing Type UUID.
[77:4..77:11]: Missing Type UUID.
[80:14..80:22]: The UUID is invalid.
[83:4..83:9]: Missing Type UUID.
[83:10..83:18]: Duplicated Type name.
[87:13..87:49]: Duplicated UUID.
[89:10..89:18]: Duplicated Type name.
[92:20..92:22]: The String length shall be a positive number.
[97:4..97:10]: Missing String length.
[99:46..99:56]: Duplicated interface.
[99:58..99:69]: Cyclic dependency detected.
[101:8..101:15]: Invalid modifier.
[105:8..105:17]: Invalid modifier.
[111:24..111:33]: Illegal modifier.
[111:17..111:23]: Invalid modifier.
[115:26..115:33]: Cyclic dependency detected.
[115:58..115:69]: Duplicated interface.
[119:31..119:35]: Duplicated identifier.
[120:31..120:35]: Duplicated identifier.
[121:31..121:35]: Duplicated identifier.
[122:31..122:35]: Duplicated identifier.
[124:36..124:40]: Duplicated identifier.
[129:27..129:29]: Duplicated identifier.
[138:24..138:33]: Illegal modifier.
[115:4..115:9]: The Model shall be abstract.
[147:17..147:24]: The type Model is not a sub type of Interface.
[195:4..195:9]: Missing Array size.
[195:20..195:28]: The type Model is not a sub type of ValueType.
[197:26..197:28]: The Array size shall be a positive number.
[199:27..199:41]: Recursive Array Type.
[203:27..203:35]: An array annotated with '@SimpleArray' requires a SimpleType item type.
[207:28..207:36]: The type Model is not a sub type of SimpleType.
[209:21..209:36]: The type AttributeType is not a sub type of ValueType.
[211:11..211:21]: The javadoc '@type' tag shall be defined with the C++ type name.
[16:12..16:21]: Duplicated Service name.
[29:12..29:21]: Duplicated Service name.
[174:24..174:32]: The type Model is not a sub type of Class.
[179:14..179:19]: Recursive Field Type.
[174:4..174:9]: The Class shall be abstract.
[184:25..184:31]: Cyclic dependency detected.
[189:35..189:41]: The type Class is not a sub type of Exception.
[189:4..189:13]: The Exception shall be abstract.
        `);
    });

});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors: ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isCatalogue(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Catalogue}'.`
        || undefined;
}

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}