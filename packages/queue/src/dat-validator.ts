// @ts-expect-error — wrangler handles .wasm imports as WebAssembly.Module
import datParserWasm from "@vgskins/dat-parser/dat_parser_bg.wasm";

/** The primitive exports of packages/dat-parser-wasm, plus wasm-bindgen's start hooks. */
interface DatParser {
  memory: WebAssembly.Memory;
  input_buffer(len: number): number;
  validate_input(): number;
  message_ptr(): number;
  message_len(): number;
  __wbindgen_externrefs: WebAssembly.Table;
  __wbindgen_start(): void;
}

function isDatParser(exports: WebAssembly.Exports): exports is WebAssembly.Exports & DatParser {
  return (
    exports.memory instanceof WebAssembly.Memory &&
    exports.__wbindgen_externrefs instanceof WebAssembly.Table &&
    ["input_buffer", "validate_input", "message_ptr", "message_len", "__wbindgen_start"].every(
      (name) => typeof exports[name] === "function"
    )
  );
}

/**
 * A parser instance for one file. The compiled module is shared; the instance
 * and its linear memory are dropped with the file, so a large DAT's memory is
 * returned and a trapped instance is never reused.
 */
function instantiate(): DatParser {
  let parser: DatParser | undefined;
  const instance = new WebAssembly.Instance(datParserWasm as WebAssembly.Module, {
    "./dat_parser_bg.js": {
      // What wasm-bindgen's generated glue does on start: reserve the
      // externref slots its ABI assumes. The parser's exports pass none.
      // It is called only from __wbindgen_start below, once `parser` is set.
      __wbindgen_init_externref_table() {
        const table = parser!.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
      },
    },
  });
  if (!isDatParser(instance.exports)) {
    throw new Error("The DAT parser module does not export the expected functions");
  }
  parser = instance.exports;
  parser.__wbindgen_start();
  return parser;
}

function message(parser: DatParser): string {
  const bytes = new Uint8Array(parser.memory.buffer, parser.message_ptr(), parser.message_len());
  return new TextDecoder().decode(bytes);
}

/**
 * Validate a DAT streamed from storage. The bytes go straight into the
 * parser's memory, with no whole-file copy on the JavaScript heap. Resolves to
 * the parse error, or null for a valid DAT. A parser trap (a Rust panic or an
 * out-of-memory abort) rejects with a WebAssembly.RuntimeError carrying the
 * panic message when there is one.
 */
export async function validateDat(
  body: ReadableStream<Uint8Array>,
  size: number
): Promise<string | null> {
  const parser = instantiate();
  const start = parser.input_buffer(size);
  let written = 0;
  for await (const chunk of body) {
    if (written + chunk.byteLength > size)
      throw new Error("The DAT is larger than its stored size");
    new Uint8Array(parser.memory.buffer, start + written, chunk.byteLength).set(chunk);
    written += chunk.byteLength;
  }
  if (written !== size) throw new Error("The DAT is shorter than its stored size");

  try {
    return parser.validate_input() ? null : message(parser);
  } catch (error) {
    if (!(error instanceof WebAssembly.RuntimeError)) throw error;
    const panic = message(parser);
    throw panic ? new WebAssembly.RuntimeError(`${error.message}: ${panic}`) : error;
  }
}
