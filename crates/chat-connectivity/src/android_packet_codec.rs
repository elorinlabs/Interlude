//! Byte-only JNI adapter used by Android's combined compression/AEAD worker.
use jni::{
    objects::{JByteArray, JClass},
    sys::jbyteArray,
    JNIEnv,
};

use crate::packet_codec::{decode_packet, encode_packet, MAX_PLAIN_BYTES};

fn transform(env: JNIEnv, input: JByteArray, encode: bool) -> jbyteArray {
    let result = (|| {
        let length = env.get_array_length(&input).ok()?;
        if !(0..=MAX_PLAIN_BYTES as i32).contains(&length) {
            return None;
        }
        let mut bytes = env.convert_byte_array(input).ok()?;
        let result = if encode {
            encode_packet(&bytes).map(|packet| packet.unwrap_or_else(|| std::mem::take(&mut bytes)))
        } else {
            decode_packet(&bytes)
        };
        bytes.fill(0);
        let mut output = result.ok()?;
        let array = env.byte_array_from_slice(&output).ok();
        output.fill(0);
        array
    })();
    result
        .map(|array| array.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

/// Returns the prefixed compressed packet, or the original bytes when compression is not worthwhile.
#[no_mangle]
pub extern "system" fn Java_com_codexswitch_connectivity_NativeConnectivity_encodeChatPacket(
    env: JNIEnv,
    _class: JClass,
    bytes: JByteArray,
) -> jbyteArray {
    transform(env, bytes, true)
}

/// Null indicates malformed compressed input; no partial plaintext is returned.
#[no_mangle]
pub extern "system" fn Java_com_codexswitch_connectivity_NativeConnectivity_decodeChatPacket(
    env: JNIEnv,
    _class: JClass,
    bytes: JByteArray,
) -> jbyteArray {
    transform(env, bytes, false)
}
