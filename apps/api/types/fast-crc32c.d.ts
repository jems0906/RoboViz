declare module 'fast-crc32c' {
  const crc32c: {
    calculate(buffer: Buffer, initialCrc?: number): number;
  };
  export = crc32c;
}
