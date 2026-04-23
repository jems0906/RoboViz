declare module 'parquetjs-lite' {
  class ParquetSchema {
    constructor(fields: Record<string, { type: string }>);
  }

  class ParquetWriter {
    static openFile(schema: ParquetSchema, path: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }

  const parquet: {
    ParquetSchema: typeof ParquetSchema;
    ParquetWriter: typeof ParquetWriter;
  };

  export = parquet;
}
