export const convertFloat32ToInt16 = (buffer: Float32Array<ArrayBufferLike>) => {
    let l = buffer.length;
    const result = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        result[i] = Math.min(1, buffer[i]) * 0x7fff;
    }
    return result;
};