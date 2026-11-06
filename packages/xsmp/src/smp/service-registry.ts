import { DefaultServiceRegistry, type LangiumCoreServices, type URI } from 'langium';
import { smpMirrorScheme } from '../builtins.js';
import { getSmpMirrorLanguageId, isSmpSourceFilePath } from './mirror-uri.js';

export class XsmpServiceRegistry extends DefaultServiceRegistry {
    override getServices(uri: URI): LangiumCoreServices {
        if (uri.scheme === smpMirrorScheme) {
            // A mirror contains XSMP even if the client initially identifies its source suffix as XML.
            const languageId = getSmpMirrorLanguageId(uri);
            const services = languageId && this.languageIdMap.get(languageId);
            if (!services) {
                throw new Error(`Unsupported SMP mirror URI '${uri.toString()}'.`);
            }
            return services;
        }
        if (uri.scheme === 'file' && isSmpSourceFilePath(uri.path)) {
            throw new Error(`SMP XML source '${uri.toString()}' must be accessed through its XSMP mirror.`);
        }
        return super.getServices(uri);
    }
}
