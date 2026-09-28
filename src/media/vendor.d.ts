declare module 'assimpjs' { const factory: () => Promise<any>; export default factory; }
declare module 'fontkit' { export function create(buffer: Uint8Array, postscriptName?: string): any; }
declare module 'bidi-js' {const factory:()=>any;export default factory;}
declare module 'hypher' {export default class Hypher {constructor(dictionary:any);hyphenate(word:string):string[];}}
declare module 'hyphenation.en-us' {const dictionary:any;export default dictionary;}
declare module 'hyphenation.pt' {const dictionary:any;export default dictionary;}
