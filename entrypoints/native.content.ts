import {defineContentScript} from 'wxt/utils/define-content-script';
import {installNative} from '../src/native-runtime';
export default defineContentScript({matches:['https://vgen.co/*'],runAt:'document_start',world:'MAIN',main:installNative});
