//! `dat-parser` for hosts without a GPU (the upload queue Worker). Browsers
//! draw through `hsd-render-web` instead.
//!
//! Every export takes and returns plain numbers, so a host can instantiate the
//! module itself, once per file, and drop the instance (and its memory)
//! afterwards. The host asks for an input buffer, writes the DAT into it, calls
//! [`validate_input`], and on failure reads the message at
//! [`message_ptr`]/[`message_len`]. A panic traps; its message is kept there too.

use std::cell::RefCell;

use dat_parser::DatFile;
use wasm_bindgen::prelude::*;

thread_local! {
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static MESSAGE: RefCell<String> = const { RefCell::new(String::new()) };
}

/// Reserve `len` bytes for the DAT and return where to write them.
#[wasm_bindgen]
pub fn input_buffer(len: usize) -> *mut u8 {
    INPUT.with_borrow_mut(|input| {
        *input = vec![0; len];
        input.as_mut_ptr()
    })
}

/// Parse the input buffer. On `false`, the parse error is the message.
#[wasm_bindgen]
pub fn validate_input() -> bool {
    std::panic::set_hook(Box::new(|info| {
        MESSAGE.with_borrow_mut(|message| *message = format!("panic: {info}"));
    }));
    let result = INPUT.with_borrow(|input| DatFile::parse(input).map(|_| ()));
    MESSAGE.with_borrow_mut(|message| {
        *message = result
            .as_ref()
            .err()
            .map(ToString::to_string)
            .unwrap_or_default();
    });
    result.is_ok()
}

/// Where the message's UTF-8 bytes start.
#[wasm_bindgen]
pub fn message_ptr() -> *const u8 {
    MESSAGE.with_borrow(|message| message.as_ptr())
}

/// How many bytes the message has.
#[wasm_bindgen]
pub fn message_len() -> usize {
    MESSAGE.with_borrow(String::len)
}
