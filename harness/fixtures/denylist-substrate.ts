/**
 * VIOLATION fixture (rule c): engine/provider SDK imports inside a
 * MOS-managed package (the substrate adapters package, adapter root —
 * showing that the adapters root does NOT escape the engine denylist).
 * Covers bare names, scoped names (@aws-sdk/*, @google/*) and subpaths
 * (whisperx/cli -> root whisperx).
 */
import OpenAI from "openai";
import * as livekit from "livekit";
import { S3 } from "@aws-sdk/client-s3";
import { GenerativeModel } from "@google/generative-ai";
import ffmpeg from "fluent-ffmpeg";
import { transcribe } from "whisperx/cli";

export const engines = { OpenAI, livekit, S3, GenerativeModel, ffmpeg, transcribe };
