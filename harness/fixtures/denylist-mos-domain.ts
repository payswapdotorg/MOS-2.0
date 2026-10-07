/**
 * VIOLATION fixture (rule c in a MOS domain package): denylisted
 * engine/provider SDK import — reported BOTH as
 * MOS-DOMAIN-IMPORT-BOUNDARY/disallowed-import (not an allowed domain
 * import form) AND MOS-NO-ENGINE-SDK/engine-provider-sdk.
 */
import ffmpeg from "fluent-ffmpeg";

export const engine = { ffmpeg };
