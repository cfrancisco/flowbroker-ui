interface ErrorConstructor{captureStackTrace(targetObject:object,constructorOpt?:Function):void;prepareStackTrace?:(err:Error,stackTraces:NodeJS.CallSite[])=>any;stackTraceLimit:number;}interface String{trimLeft():string;trimRight():string;trimStart():string;trimEnd():string;}interface ImportMeta{url:string;}interface NodeRequire extends NodeJS.Require{}interface RequireResolve extends NodeJS.RequireResolve{}interface NodeModule extends NodeJS.Module{}declare var process:NodeJS.Process;declare var console:Console;declare var __filename:string;declare var __dirname:string;declare function setTimeout(callback:(...args:any[])=>void,ms?:number,...args:any[]):NodeJS.Timeout;declare namespace setTimeout{function __promisify__(ms:number):Promise<void>;function __promisify__<T>(ms:number,value:T):Promise<T>;}declare function clearTimeout(timeoutId:NodeJS.Timeout):void;declare function setInterval(callback:(...args:any[])=>void,ms?:number,...args:any[]):NodeJS.Timeout;declare function clearInterval(intervalId:NodeJS.Timeout):void;declare function setImmediate(callback:(...args:any[])=>void,...args:any[]):NodeJS.Immediate;declare namespace setImmediate{function __promisify__():Promise<void>;function __promisify__<T>(value:T):Promise<T>;}declare function clearImmediate(immediateId:NodeJS.Immediate):void;declare function queueMicrotask(callback:()=>void):void;declare var require:NodeRequire;declare var module:NodeModule;declare var exports:any;type BufferEncoding="ascii"|"utf8"|"utf-8"|"utf16le"|"ucs2"|"ucs-2"|"base64"|"latin1"|"binary"|"hex";type WithImplicitCoercion<T>=T|{valueOf():T};declare class Buffer extends Uint8Array{constructor(str:string,encoding?:BufferEncoding);constructor(size:number);constructor(array:Uint8Array);constructor(arrayBuffer:ArrayBuffer|SharedArrayBuffer);constructor(array:ReadonlyArray<any>);constructor(buffer:Buffer);static from(arrayBuffer:WithImplicitCoercion<ArrayBuffer|SharedArrayBuffer>,byteOffset?:number,length?:number):Buffer;static from(data:Uint8Array|ReadonlyArray<number>):Buffer;static from(data:WithImplicitCoercion<Uint8Array|ReadonlyArray<number>|string>):Buffer;static from(str:WithImplicitCoercion<string>|{[Symbol.toPrimitive](hint:'string'):string},encoding?:BufferEncoding):Buffer;static of(...items:number[]):Buffer;static isBuffer(obj:any):obj is Buffer;static isEncoding(encoding:string):encoding is BufferEncoding;static byteLength(string:string|NodeJS.ArrayBufferView|ArrayBuffer|SharedArrayBuffer,encoding?:BufferEncoding):number;static concat(list:ReadonlyArray<Uint8Array>,totalLength?:number):Buffer;static compare(buf1:Uint8Array,buf2:Uint8Array):number;static alloc(size:number,fill?:string|Buffer|number,encoding?:BufferEncoding):Buffer;static allocUnsafe(size:number):Buffer;static allocUnsafeSlow(size:number):Buffer;static poolSize:number;write(string:string,encoding?:BufferEncoding):number;write(string:string,offset:number,encoding?:BufferEncoding):number;write(string:string,offset:number,length:number,encoding?:BufferEncoding):number;toString(encoding?:BufferEncoding,start?:number,end?:number):string;toJSON():{type:'Buffer';data:number[]};equals(otherBuffer:Uint8Array):boolean;compare(otherBuffer:Uint8Array,targetStart?:number,targetEnd?:number,sourceStart?:number,sourceEnd?:number):number;copy(targetBuffer:Uint8Array,targetStart?:number,sourceStart?:number,sourceEnd?:number):number;slice(begin?:number,end?:number):Buffer;subarray(begin?:number,end?:number):Buffer;writeBigInt64BE(value:bigint,offset?:number):number;writeBigInt64LE(value:bigint,offset?:number):number;writeBigUInt64BE(value:bigint,offset?:number):number;writeBigUInt64LE(value:bigint,offset?:number):number;writeUIntLE(value:number,offset:number,byteLength:number):number;writeUIntBE(value:number,offset:number,byteLength:number):number;writeIntLE(value:number,offset:number,byteLength:number):number;writeIntBE(value:number,offset:number,byteLength:number):number;readBigUInt64BE(offset?:number):bigint;readBigUInt64LE(offset?:number):bigint;readBigInt64BE(offset?:number):bigint;readBigInt64LE(offset?:number):bigint;readUIntLE(offset:number,byteLength:number):number;readUIntBE(offset:number,byteLength:number):number;readIntLE(offset:number,byteLength:number):number;readIntBE(offset:number,byteLength:number):number;readUInt8(offset?:number):number;readUInt16LE(offset?:number):number;readUInt16BE(offset?:number):number;readUInt32LE(offset?:number):number;readUInt32BE(offset?:number):number;readInt8(offset?:number):number;readInt16LE(offset?:number):number;readInt16BE(offset?:number):number;readInt32LE(offset?:number):number;readInt32BE(offset?:number):number;readFloatLE(offset?:number):number;readFloatBE(offset?:number):number;readDoubleLE(offset?:number):number;readDoubleBE(offset?:number):number;reverse():this;swap16():Buffer;swap32():Buffer;swap64():Buffer;writeUInt8(value:number,offset?:number):number;writeUInt16LE(value:number,offset?:number):number;writeUInt16BE(value:number,offset?:number):number;writeUInt32LE(value:number,offset?:number):number;writeUInt32BE(value:number,offset?:number):number;writeInt8(value:number,offset?:number):number;writeInt16LE(value:number,offset?:number):number;writeInt16BE(value:number,offset?:number):number;writeInt32LE(value:number,offset?:number):number;writeInt32BE(value:number,offset?:number):number;writeFloatLE(value:number,offset?:number):number;writeFloatBE(value:number,offset?:number):number;writeDoubleLE(value:number,offset?:number):number;writeDoubleBE(value:number,offset?:number):number;fill(value:string|Uint8Array|number,offset?:number,end?:number,encoding?:BufferEncoding):this;indexOf(value:string|number|Uint8Array,byteOffset?:number,encoding?:BufferEncoding):number;lastIndexOf(value:string|number|Uint8Array,byteOffset?:number,encoding?:BufferEncoding):number;entries():IterableIterator<[number,number]>;includes(value:string|number|Buffer,byteOffset?:number,encoding?:BufferEncoding):boolean;keys():IterableIterator<number>;values():IterableIterator<number>;}declare namespace NodeJS{interface InspectOptions{getters?:'get'|'set'|boolean;showHidden?:boolean;depth?:number|null;colors?:boolean;customInspect?:boolean;showProxy?:boolean;maxArrayLength?:number|null;maxStringLength?:number|null;breakLength?:number;compact?:boolean|number;sorted?:boolean|((a:string,b:string)=>number);}interface CallSite{getThis():any;getTypeName():string|null;getFunction():Function|undefined;getFunctionName():string|null;getMethodName():string|null;getFileName():string|null;getLineNumber():number|null;getColumnNumber():number|null;getEvalOrigin():string|undefined;isToplevel():boolean;isEval():boolean;isNative():boolean;isConstructor():boolean;}interface ErrnoException extends Error{errno?:number;code?:string;path?:string;syscall?:string;stack?:string;}interface ReadableStream extends EventEmitter{readable:boolean;read(size?:number):string|Buffer;setEncoding(encoding:BufferEncoding):this;pause():this;resume():this;isPaused():boolean;pipe<T extends WritableStream>(destination:T,options?:{end?:boolean;}):T;unpipe(destination?:WritableStream):this;unshift(chunk:string|Uint8Array,encoding?:BufferEncoding):void;wrap(oldStream:ReadableStream):this;[Symbol.asyncIterator]():AsyncIterableIterator<string|Buffer>;}interface WritableStream extends EventEmitter{writable:boolean;write(buffer:Uint8Array|string,cb?:(err?:Error|null)=>void):boolean;write(str:string,encoding?:BufferEncoding,cb?:(err?:Error|null)=>void):boolean;end(cb?:()=>void):void;end(data:string|Uint8Array,cb?:()=>void):void;end(str:string,encoding?:BufferEncoding,cb?:()=>void):void;}interface ReadWriteStream extends ReadableStream,WritableStream{}interface Global{Array:typeof Array;ArrayBuffer:typeof ArrayBuffer;Boolean:typeof Boolean;Buffer:typeof Buffer;DataView:typeof DataView;Date:typeof Date;Error:typeof Error;EvalError:typeof EvalError;Float32Array:typeof Float32Array;Float64Array:typeof Float64Array;Function:typeof Function;Infinity:typeof Infinity;Int16Array:typeof Int16Array;Int32Array:typeof Int32Array;Int8Array:typeof Int8Array;Intl:typeof Intl;JSON:typeof JSON;Map:MapConstructor;Math:typeof Math;NaN:typeof NaN;Number:typeof Number;Object:typeof Object;Promise:typeof Promise;RangeError:typeof RangeError;ReferenceError:typeof ReferenceError;RegExp:typeof RegExp;Set:SetConstructor;String:typeof String;Symbol:Function;SyntaxError:typeof SyntaxError;TypeError:typeof TypeError;URIError:typeof URIError;Uint16Array:typeof Uint16Array;Uint32Array:typeof Uint32Array;Uint8Array:typeof Uint8Array;Uint8ClampedArray:typeof Uint8ClampedArray;WeakMap:WeakMapConstructor;WeakSet:WeakSetConstructor;clearImmediate:(immediateId:Immediate)=>void;clearInterval:(intervalId:Timeout)=>void;clearTimeout:(timeoutId:Timeout)=>void;decodeURI:typeof decodeURI;decodeURIComponent:typeof decodeURIComponent;encodeURI:typeof encodeURI;encodeURIComponent:typeof encodeURIComponent;escape:(str:string)=>string;eval:typeof eval;global:Global;isFinite:typeof isFinite;isNaN:typeof isNaN;parseFloat:typeof parseFloat;parseInt:typeof parseInt;setImmediate:(callback:(...args:any[])=>void,...args:any[])=>Immediate;setInterval:(callback:(...args:any[])=>void,ms?:number,...args:any[])=>Timeout;setTimeout:(callback:(...args:any[])=>void,ms?:number,...args:any[])=>Timeout;queueMicrotask:typeof queueMicrotask;undefined:typeof undefined;unescape:(str:string)=>string;gc:()=>void;v8debug?:any;}interface RefCounted{ref():this;unref():this;}interface Timer extends RefCounted{hasRef():boolean;refresh():this;[Symbol.toPrimitive]():number;}interface Immediate extends RefCounted{hasRef():boolean;_onImmediate:Function;}interface Timeout extends Timer{hasRef():boolean;refresh():this;[Symbol.toPrimitive]():number;}type TypedArray=|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|BigUint64Array|BigInt64Array|Float32Array|Float64Array;type ArrayBufferView=TypedArray|DataView;interface Require{(id:string):any;resolve:RequireResolve;cache:Dict<NodeModule>;extensions:RequireExtensions;main:Module|undefined;}interface RequireResolve{(id:string,options?:{paths?:string[];}):string;paths(request:string):string[]|null;}interface RequireExtensions extends Dict<(m:Module,filename:string)=>any>{'.js':(m:Module,filename:string)=>any;'.json':(m:Module,filename:string)=>any;'.node':(m:Module,filename:string)=>any;}interface Module{exports:any;require:Require;id:string;filename:string;loaded:boolean;parent:Module|null|undefined;children:Module[];path:string;paths:string[];}interface Dict<T>{[key:string]:T|undefined;}interface ReadOnlyDict<T>{readonly[key:string]:T|undefined;}}