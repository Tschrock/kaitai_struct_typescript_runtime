// Interfaces for optional dependencies
interface Zlib {
    inflateSync(buf: ArrayBuffer | NodeJS.ArrayBufferView): Buffer;
}

interface Pako {
    inflate(data: Uint8Array | number[]): Uint8Array;
}

// When loaded into a web worker, pako gets added to the global scope
declare const pako: Pako | undefined;

interface Sliceable<T> extends ArrayLike<T> {
    slice(start?: number, end?: number): this;
}

/**
 * KaitaiStream is an implementation of Kaitai Struct API for JavaScript.
 * Based on DataStream - https://github.com/kig/DataStream.js .
 */
class KaitaiStream {
    /**
     * @param arrayBuffer ArrayBuffer to read from.
     * @param byteOffset Offset from arrayBuffer beginning for the KaitaiStream.
     */
    public constructor(arrayBuffer: ArrayBuffer | DataView | number, byteOffset?: number) {
        this._byteOffset = byteOffset || 0;
        if (arrayBuffer instanceof ArrayBuffer) {
            this.buffer = arrayBuffer;
        } else if (typeof arrayBuffer == "object") {
            this.dataView = arrayBuffer;
            if (byteOffset) {
                this._byteOffset += byteOffset;
            }
        } else {
            this.buffer = new ArrayBuffer(arrayBuffer || 1);
        }
        this.pos = 0;
        this.alignToByte();
    }

    /**
     * Virtual byte length of the KaitaiStream backing buffer.
     * Updated to be max of original buffer size and last written size.
     * If dynamicSize is false is set to buffer size.
     */
    private _byteLength = 0;
    private _byteOffset = 0;
    private _buffer!: ArrayBuffer;
    private _dataView!: DataView;

    public pos: number;
    public bits = 0;
    public bitsLeft = 0;

    /**
     * Gets the backing ArrayBuffer of the KaitaiStream object.
     *
     * @returns The backing ArrayBuffer.
     */
    public get buffer(): ArrayBuffer {
        this._trimAlloc();
        return this._buffer;
    }

    /**
     * Sets the backing ArrayBuffer of the KaitaiStream object and updates the
     * DataView to point to the new buffer.
     */
    public set buffer(v: ArrayBuffer) {
        this._buffer = v;
        this._dataView = new DataView(this._buffer, this._byteOffset);
        this._byteLength = this._buffer.byteLength;
    }

    /**
     * Gets the byteOffset of the KaitaiStream object.
     *
     * @returns The byteOffset.
     */
    public get byteOffset(): number {
        return this._byteOffset;
    }

    /**
     * Sets the byteOffset of the KaitaiStream object and updates the DataView to
     * point to the new byteOffset.
     */
    public set byteOffset(v: number) {
        this._byteOffset = v;
        this._dataView = new DataView(this._buffer, this._byteOffset);
        this._byteLength = this._buffer.byteLength;
    }

    /**
     * Gets the backing DataView of the KaitaiStream object.
     *
     * @returns The backing DataView.
     */
    public get dataView(): DataView {
        return this._dataView;
    }
    /**
     * Sets the backing DataView of the KaitaiStream object and updates the buffer
     * and byteOffset to point to the DataView values.
     */
    public set dataView(v: DataView) {
        this._byteOffset = v.byteOffset;
        this._buffer = v.buffer;
        this._dataView = new DataView(this._buffer, this._byteOffset);
        this._byteLength = this._byteOffset + v.byteLength;
    }

    /**
     * Internal function to trim the KaitaiStream buffer when required.
     * Used for stripping out the extra bytes from the backing buffer when
     * the virtual byteLength is smaller than the buffer byteLength (happens after
     * growing the buffer with writes and not filling the extra space completely).
     */
    private _trimAlloc(): void {
        if (this._byteLength === this._buffer.byteLength) {
            return;
        }
        const buf = new ArrayBuffer(this._byteLength);
        const dst = new Uint8Array(buf);
        const src = new Uint8Array(this._buffer, 0, dst.length);
        dst.set(src);
        this.buffer = buf;
    }

    // ========================================================================
    // Stream positioning
    // ========================================================================

    /**
     * Returns true if the KaitaiStream seek pointer is at the end of buffer and
     * there's no more data to read.
     *
     * @returns True if the seek pointer is at the end of the buffer.
     */
    public isEof(): boolean {
        return this.pos >= this.size && this.bitsLeft === 0;
    }

    /**
     * Sets the KaitaiStream read/write position to given position.
     * Clamps between 0 and KaitaiStream length.
     *
     * @param pos Position to seek to.
     */
    public seek(pos: number): void {
        const npos = Math.max(0, Math.min(this.size, pos));
        this.pos = (isNaN(npos) || !isFinite(npos)) ? 0 : npos;
    }

    /**
     * Returns the byte length of the KaitaiStream object.
     * 
     * @returns The byte length.
     */
    public get size(): number {
        return this._byteLength - this._byteOffset;
    }

    // ========================================================================
    // Integer numbers
    // ========================================================================

    // ------------------------------------------------------------------------
    // Signed
    // ------------------------------------------------------------------------

    /**
     * Reads an 8-bit signed int from the stream.
     *
     * @returns The read number.
     */
    public readS1(): number {
        this.ensureBytesLeft(1);
        const v = this._dataView.getInt8(this.pos);
        this.pos += 1;
        return v;
    }

    // ........................................................................
    // Big-endian
    // ........................................................................

    /**
     * Reads a 16-bit big-endian signed int from the stream.
     *
     * @returns The read number.
     */
    public readS2be(): number {
        this.ensureBytesLeft(2);
        const v = this._dataView.getInt16(this.pos);
        this.pos += 2;
        return v;
    }

    /**
     * Reads a 32-bit big-endian signed int from the stream.
     *
     * @returns The read number.
     */
    public readS4be(): number {
        this.ensureBytesLeft(4);
        const v = this._dataView.getInt32(this.pos);
        this.pos += 4;
        return v;
    }

    /**
     * Reads a 64-bit big-endian unsigned int from the stream. Note that
     * JavaScript does not support 64-bit integers natively, so it will
     * automatically upgrade internal representation to use IEEE 754
     * double precision float.
     *
     * @returns The read number.
     */
    public readS8be(): number {
        this.ensureBytesLeft(8);
        const v1 = this.readU4be();
        const v2 = this.readU4be();

        if ((v1 & 0x80000000) !== 0) {
            // negative number
            return -(0x100000000 * (v1 ^ 0xffffffff) + (v2 ^ 0xffffffff)) - 1;
        } else {
            return 0x100000000 * v1 + v2;
        }
    }

    // ........................................................................
    // Little-endian
    // ........................................................................

    /**
     * Reads a 16-bit little-endian signed int from the stream.
     *
     * @returns The read number.
     */
    public readS2le(): number {
        this.ensureBytesLeft(2);
        const v = this._dataView.getInt16(this.pos, true);
        this.pos += 2;
        return v;
    }

    /**
     * Reads a 32-bit little-endian signed int from the stream.
     *
     * @returns The read number.
     */
    public readS4le(): number {
        this.ensureBytesLeft(4);
        const v = this._dataView.getInt32(this.pos, true);
        this.pos += 4;
        return v;
    }

    /**
     * Reads a 64-bit little-endian unsigned int from the stream. Note that
     * JavaScript does not support 64-bit integers natively, so it will
     * automatically upgrade internal representation to use IEEE 754
     * double precision float.
     *
     * @returns The read number.
     */
    public readS8le(): number {
        this.ensureBytesLeft(8);
        const v1 = this.readU4le();
        const v2 = this.readU4le();

        if ((v2 & 0x80000000) !== 0) {
            // negative number
            return -(0x100000000 * (v2 ^ 0xffffffff) + (v1 ^ 0xffffffff)) - 1;
        } else {
            return 0x100000000 * v2 + v1;
        }
    }

    // ------------------------------------------------------------------------
    // Unsigned
    // ------------------------------------------------------------------------

    /**
     * Reads an 8-bit unsigned int from the stream.
     *
     * @returns The read number.
     */
    public readU1(): number {
        this.ensureBytesLeft(1);
        const v = this._dataView.getUint8(this.pos);
        this.pos += 1;
        return v;
    }

    // ........................................................................
    // Big-endian
    // ........................................................................

    /**
     * Reads a 16-bit big-endian unsigned int from the stream.
     *
     * @returns The read number.
     */
    public readU2be(): number {
        this.ensureBytesLeft(2);
        const v = this._dataView.getUint16(this.pos);
        this.pos += 2;
        return v;
    }

    /**
     * Reads a 32-bit big-endian unsigned int from the stream.
     *
     * @returns The read number.
     */
    public readU4be(): number {
        this.ensureBytesLeft(4);
        const v = this._dataView.getUint32(this.pos);
        this.pos += 4;
        return v;
    }

    /**
     * Reads a 64-bit big-endian unsigned int from the stream. Note that
     * JavaScript does not support 64-bit integers natively, so it will
     * automatically upgrade internal representation to use IEEE 754
     * double precision float.
     *
     * @returns The read number.
     */
    public readU8be(): number {
        this.ensureBytesLeft(8);
        const v1 = this.readU4be();
        const v2 = this.readU4be();
        return 0x100000000 * v1 + v2;
    }

    // ........................................................................
    // Little-endian
    // ........................................................................

    /**
     * Reads a 16-bit little-endian unsigned int from the stream.
     *
     * @returns The read number.
     */
    public readU2le(): number {
        this.ensureBytesLeft(2);
        const v = this._dataView.getUint16(this.pos, true);
        this.pos += 2;
        return v;
    }

    /**
     * Reads a 32-bit little-endian unsigned int from the stream.
     *
     * @returns The read number.
     */
    public readU4le(): number {
        this.ensureBytesLeft(4);
        const v = this._dataView.getUint32(this.pos, true);
        this.pos += 4;
        return v;
    }

    /**
     * Reads a 64-bit little-endian unsigned int from the stream. Note that
     * JavaScript does not support 64-bit integers natively, so it will
     * automatically upgrade internal representation to use IEEE 754
     * double precision float.
     *
     * @returns The read number.
     */
    public readU8le(): number {
        this.ensureBytesLeft(8);
        const v1 = this.readU4le();
        const v2 = this.readU4le();
        return 0x100000000 * v2 + v1;
    }

    // ========================================================================
    // Floating point numbers
    // ========================================================================

    // ------------------------------------------------------------------------
    // Big endian
    // ------------------------------------------------------------------------

    /**
     * Reads a 32-bit big-endian float from the stream.
     *
     * @returns The read number.
     */
    public readF4be(): number {
        this.ensureBytesLeft(4);
        const v = this._dataView.getFloat32(this.pos);
        this.pos += 4;
        return v;
    }

    /**
     * Reads a 64-bit big-endian float from the stream.
     *
     * @returns The read number.
     */
    public readF8be(): number {
        this.ensureBytesLeft(8);
        const v = this._dataView.getFloat64(this.pos);
        this.pos += 8;
        return v;
    }

    // ------------------------------------------------------------------------
    // Little endian
    // ------------------------------------------------------------------------

    /**
     * Reads a 32-bit little-endian float from the stream.
     *
     * @returns The read number.
     */
    public readF4le(): number {
        this.ensureBytesLeft(4);
        const v = this._dataView.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }

    /**
     * Reads a 64-bit little-endian float from the stream.
     *
     * @returns The read number.
     */
    public readF8le(): number {
        this.ensureBytesLeft(8);
        const v = this._dataView.getFloat64(this.pos, true);
        this.pos += 8;
        return v;
    }

    // ------------------------------------------------------------------------
    // Unaligned bit values
    // ------------------------------------------------------------------------

    /**
     * Aligns bit reading to the byte boundry.
     */
    public alignToByte(): void {
        this.bits = 0;
        this.bitsLeft = 0;
    }

    /**
     * @param n The number of bits to read.
     * @returns The read bits.
     * @throws {Error}
     */
    public readBitsIntBe(n: number): number {
        // JS only supports bit operations on 32 bits
        if (n > 32) {
            throw new Error(`readBitsIntBe: the maximum supported bit length is 32 (tried to read ${n} bits)`);
        }
        const bitsNeeded = n - this.bitsLeft;
        if (bitsNeeded > 0) {
            // 1 bit  => 1 byte
            // 8 bits => 1 byte
            // 9 bits => 2 bytes
            const bytesNeeded = Math.ceil(bitsNeeded / 8);
            const buf = this.readBytes(bytesNeeded);
            for (let i = 0; i < bytesNeeded; i++) {
                this.bits <<= 8;
                this.bits |= buf[i];
                this.bitsLeft += 8;
            }
        }

        // raw mask with required number of 1s, starting from lowest bit
        let mask = n === 32 ? 0xffffffff : (1 << n) - 1;
        // shift this.bits to align the highest bits with the mask & derive reading result
        const shiftBits = this.bitsLeft - n;
        const res = (this.bits >>> shiftBits) & mask;
        // clear top bits that we've just read => AND with 1s
        this.bitsLeft -= n;
        mask = (1 << this.bitsLeft) - 1;
        this.bits &= mask;

        return res;
    }

    /**
     * Unused since Kaitai Struct Compiler v0.9+
     *
     * @deprecated Use {@link readBitsIntBe} instead.
     * @param n The number of bits to read.
     * @returns The read bits.
     */
    public readBitsInt(n: number): number {
        return this.readBitsIntBe(n);
    }

    /**
     * @param n The number of bits to read.
     * @returns The read bits.
     * @throws {Error}
     */
    public readBitsIntLe(n: number): number {
        // JS only supports bit operations on 32 bits
        if (n > 32) {
            throw new Error(`readBitsIntLe: the maximum supported bit length is 32 (tried to read ${n} bits)`);
        }
        const bitsNeeded = n - this.bitsLeft;
        if (bitsNeeded > 0) {
            // 1 bit  => 1 byte
            // 8 bits => 1 byte
            // 9 bits => 2 bytes
            const bytesNeeded = Math.ceil(bitsNeeded / 8);
            const buf = this.readBytes(bytesNeeded);
            for (let i = 0; i < bytesNeeded; i++) {
                this.bits |= (buf[i] << this.bitsLeft);
                this.bitsLeft += 8;
            }
        }

        // raw mask with required number of 1s, starting from lowest bit
        const mask = n === 32 ? 0xffffffff : (1 << n) - 1;
        // derive reading result
        const res = this.bits & mask;
        // remove bottom bits that we've just read by shifting
        this.bits >>>= n;
        this.bitsLeft -= n;

        return res;
    }

    // ========================================================================
    // Byte arrays
    // ========================================================================

    /**
     * @param len The number of bytes to read.
     * @returns The read bytes.
     */
    public readBytes(len: number): Uint8Array {
        return this.mapUint8Array(len);
    }

    /**
     * @returns The read bytes.
     */
    public readBytesFull(): Uint8Array {
        return this.mapUint8Array(this.size - this.pos);
    }

    /**
     * Reads bytes until the terminator byte is found.
     *
     * @param terminator The terminator byte.
     * @param include True if the terminator should be included with the returned bytes.
     * @param consume True if the terminator should be consumed from the input stream.
     * @param eosError True to throw an error if the end of stream is reached.
     * @returns The read bytes.
     * @throws {Error}
     */
    public readBytesTerm(terminator: number, include: boolean, consume: boolean, eosError: boolean): Uint8Array {
        const blen = this.size - this.pos;
        const u8 = new Uint8Array(this._buffer, this._byteOffset + this.pos);
        let i;
        for (i = 0; i < blen && u8[i] !== terminator; i++); // find first zero byte
        if (i === blen) {
            // we've read all the buffer and haven't found the terminator
            if (eosError) {
                throw new Error("End of stream reached, but no terminator " + terminator + " found");
            } else {
                return this.mapUint8Array(i);
            }
        } else {
            let arr;
            if (include) {
                arr = this.mapUint8Array(i + 1);
            } else {
                arr = this.mapUint8Array(i);
            }
            if (consume) {
                this.pos += 1;
            }
            return arr;
        }
    }

    /**
     * @deprecated Unused since Kaitai Struct Compiler v0.9+
     * 
     * @param expected The expected bytes.
     * @returns The read bytes.
     * @throws {KaitaiStream.UnexpectedDataError}
     */
    public ensureFixedContents(expected: ArrayLike<number>): Uint8Array {
        const actual = this.readBytes(expected.length);
        if (KaitaiStream.byteArrayCompare(actual, expected) !== 0) {
          throw new KaitaiStream.UnexpectedDataError(expected, actual);
        }
        return actual;
    }

    /**
     * Ensures that we have an least `length` bytes left in the stream.
     * If that's not true, throws an EOFError.
     *
     * @param length Number of bytes to require.
     * @throws {KaitaiStream.EOFError}
     */
    private ensureBytesLeft(length: number): void {
        if (this.pos + length > this.size) {
            throw new KaitaiStream.EOFError(length, this.size - this.pos);
        }
    }

    /**
     * Maps a Uint8Array into the KaitaiStream buffer.
     * Nice for quickly reading in data.
     *
     * @param length Number of elements to map.
     * @returns A Uint8Array to the KaitaiStream backing buffer.
     */
    private mapUint8Array(length: number): Uint8Array {
        length |= 0;

        this.ensureBytesLeft(length);

        const arr = new Uint8Array(this._buffer, this.byteOffset + this.pos, length);
        this.pos += length;
        return arr;
    }
}

namespace KaitaiStream {
    /**
     * Dependency configuration data. Holds urls for (optional) dynamic loading
     * of code dependencies from a remote server. For use by (static) processing functions.
     *
     * Caller should the supported keys to the asset urls as needed.
     * NOTE: `depUrls` is a static property of KaitaiStream (the factory), like the various
     * processing functions. It is NOT part of the prototype of instances.
     */
     export let depUrls: Record<string, string | undefined> = {
        // processZlib uses this and expected a link to a copy of pako.
        // specifically the pako_inflate.min.js script at:
        // https://raw.githubusercontent.com/nodeca/pako/master/dist/pako_inflate.min.js
        zlib: undefined
    };

    export let zlib: Pako | Zlib | undefined;

    /**
     * Native endianness. Either KaitaiStream.BIG_ENDIAN or KaitaiStream.LITTLE_ENDIAN
     * depending on the platform endianness.
     */
     export const endianness: boolean = new Int8Array(new Int16Array([1]).buffer)[0] > 0;

    /**
     * @param data The data.
     * @param padByte The byte to strip.
     * @returns The stripped data.
     */
    export function bytesStripRight<T extends Sliceable<number>>(data: T, padByte: number): T {
        let newLen = data.length;
        while (data[newLen - 1] === padByte) {
            newLen--;
        }
        return data.slice(0, newLen);
    }

    /**
     * @param data The data.
     * @param term The terminator.
     * @param include True if the returned bytes should include the terminator.
     * @returns The terminated bytes.
     */
    export function bytesTerminate<T extends Sliceable<number>>(data: T, term: number, include: boolean): T {
        let newLen = 0;
        const maxLen = data.length;
        while (newLen < maxLen && data[newLen] !== term) {
            newLen++;
        }
        if (include && newLen < maxLen)
            newLen++;
        return data.slice(0, newLen);
    }

    /**
     * @param arr The bytes.
     * @param encoding The character encoding.
     * @returns The decoded string.
     * @throws {RangeError}
     */
    export function bytesToStr(arr: Uint8Array, encoding: BufferEncoding): string {
        if (typeof TextDecoder === 'function') {
            let decoder;
            try {
                decoder = new TextDecoder(encoding)
            }
            catch { /* Unsupported encoding */ }
            if (decoder) {
                return decoder.decode(arr);
            }
        }
        if (typeof Buffer === 'function') {
            return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString(encoding)
        }
        throw new RangeError(`Unsupported string encoding '${encoding}'`)
    }

    /**
     * @param data The input bytes.
     * @param key The key byte.
     * @returns The Xor'd bytes.
     */
    export function processXorOne(data: ArrayLike<number>, key: number): Uint8Array {
        const r = new Uint8Array(data.length);
        const dl = data.length;
        for (let i = 0; i < dl; i++)
            r[i] = data[i] ^ key;
        return r;
    }

    /**
     * @param data The input bytes.
     * @param key The key bytes.
     * @returns The Xor'd bytes.
     */
    export function processXorMany(data: ArrayLike<number>, key: ArrayLike<number>): Uint8Array {
        const dl = data.length;
        const r = new Uint8Array(dl);
        const kl = key.length;
        let ki = 0;
        for (let i = 0; i < dl; i++) {
            r[i] = data[i] ^ key[ki];
            ki++;
            if (ki >= kl)
                ki = 0;
        }
        return r;
    }

    /**
     * @param data The input bytes.
     * @param amount The number of bytes to rotate.
     * @param groupSize The number of bytes in each group.
     * @returns The rotated bytes.
     * @throws {RangeError}
     */
    export function processRotateLeft(data: ArrayLike<number>, amount: number, groupSize: number): Uint8Array {
        if (groupSize !== 1)
            throw new RangeError("Unable to rotate group of " + groupSize + " bytes.");

        const mask = groupSize * 8 - 1;
        const antiAmount = -amount & mask;

        const r = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++)
            r[i] = (data[i] << amount) & 0xff | (data[i] >> antiAmount);

        return r;
    }

    /**
     * @param buf The input bytes.
     * @returns The uncompressed bytes.
     * @throws {Error} No zlib module was found
     */
    export function processZlib(buf: Uint8Array): Uint8Array | Buffer {
        if (!KaitaiStream.zlib) {
            if (require) {
                try {
                    KaitaiStream.zlib = require('zlib')
                } catch {
                    try {
                        KaitaiStream.zlib = require('pako')
                    } catch { }
                }
            }
            else {
                if (importScripts && KaitaiStream.depUrls.zlib) {
                    importScripts(KaitaiStream.depUrls.zlib);
                }
                KaitaiStream.zlib = pako;
            }
        }

        if(KaitaiStream.zlib) {
            if('inflateSync' in KaitaiStream.zlib) {
                return KaitaiStream.zlib.inflateSync(buf);
            }
            if('inflate' in KaitaiStream.zlib) {
                return KaitaiStream.zlib.inflate(buf);
            }
        }

        throw new Error('No zlib module was found.');
    }

    /**
     * @param a The dividend.
     * @param b The divisor.
     * @returns The result of `a` mod `b`.
     * @throws {RangeError}
     */
    export function mod(a: number, b: number): number {
        if (b <= 0) throw new RangeError("mod divisor <= 0");
        let r = a % b;
        if (r < 0) r += b;
        return r;
    }

    /**
     * Gets the smallest value in an array.
     *
     * @param arr The input array.
     * @returns The smallest value.
     */
    export function arrayMin(arr: ArrayLike<number>): number {
        let min = arr[0];
        let x;
        for (let i = 1, n = arr.length; i < n; ++i) {
            x = arr[i];
            if (x < min) min = x;
        }
        return min;
    }

    /**
     * Gets the largest value in an array.
     *
     * @param arr The input array.
     * @returns The largest value.
     */
    export function arrayMax(arr: ArrayLike<number>): number {
        let max = arr[0];
        let x;
        for (let i = 1, n = arr.length; i < n; ++i) {
            x = arr[i];
            if (x > max) max = x;
        }
        return max;
    }

    /**
     * Compares two arrays of bytes from left to right.
     *
     * @param a The first array.
     * @param b The second array.
     * @returns `0` if the arrays are the equal, a positive number if `a` is greater than `b`, or a negative number if `a` is less than `b`.
     */
    export function byteArrayCompare(a: ArrayLike<number>, b: ArrayLike<number>): number {
        if (a === b) return 0;
        const al = a.length;
        const bl = b.length;
        const minLen = al < bl ? al : bl;
        for (let i = 0; i < minLen; i++) {
            const cmp = a[i] - b[i];
            if (cmp !== 0) return cmp;
        }

        // Reached the end of at least one of the arrays
        if (al === bl) {
            return 0;
        } else {
            return al - bl;
        }
    }

    /**
     * Creates a string from an array of character codes.
     * 
     * @deprecated Use {@link bytesToStr} instead.
     *
     * @param array Array of character codes.
     * @returns String created from the character codes.
     * @throws {RangeError}
     */
    export function createStringFromArray(array: Uint8Array): string {
        return KaitaiStream.bytesToStr(array, 'ascii');
    }

    class KaitaiStructError extends Error {
        get name() { return this.constructor.name }
    }

    export class EOFError extends KaitaiStructError {
        /**
         * @param bytesReq The number of bytes requested.
         * @param bytesAvail The number of bytes available.
         */
        public constructor(public bytesReq: number, public bytesAvail: number) {
            super("requested " + bytesReq + " bytes, but only " + bytesAvail + " bytes available");
        }
    }

    /**
     * @deprecated Unused since Kaitai Struct Compiler v0.9+
     */
    export class UnexpectedDataError<T = any> extends KaitaiStructError {
        /**
         * @param expected The expected value.
         * @param actual The actual value.
         */
        public constructor(public expected: T, public actual: T) {
            super("expected [" + expected + "], but got [" + actual + "]");
        }
    }

    export class UndecidedEndiannessError extends KaitaiStructError {
    }

    export class ValidationNotEqualError<T = any> extends KaitaiStructError {
        /**
         * @param expected The expected value.
         * @param actual The actual value.
         */
        public constructor(public expected: T, public actual: T) {
            super("not equal, expected [" + expected + "], but got [" + actual + "]");
        }
    }

    export class ValidationLessThanError<T = any> extends KaitaiStructError {
        /**
         * @param min The minimum allowed value.
         * @param actual The actual value.
         */
        public constructor(public min: T, public actual: T) {
            super("not in range, min [" + min + "], but got [" + actual + "]");
        }
    }

    export class ValidationGreaterThanError<T = any> extends KaitaiStructError {
        /**
         * @param max The maximum allowed value.
         * @param actual The actual value.
         */
        public constructor(public max: T, public actual: T) {
            super("not in range, max [" + max + "], but got [" + actual + "]");
        }
    }

    export class ValidationNotAnyOfError<T = any> extends KaitaiStructError {
        /**
         * @param actual The actual value.
         */
        public constructor(public actual: T) {
            super("not any of the list, got [" + actual + "]");
        }
    }

    export class ValidationExprError<T = any> extends KaitaiStructError {
        /**
         * @param actual The actual value.
         */
        public constructor(public actual: T) {
            super("not matching the expression, got [" + actual + "]");
        }
    }
}

export = KaitaiStream;
