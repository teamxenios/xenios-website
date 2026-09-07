#!/usr/bin/env node
// Remove embedded file attachments from a PDF so it can pass the Resource Hub
// upload scanner, which refuses /EmbeddedFile because attachments are a real
// delivery channel for active content.
//
// The common innocent case is C2PA "Content Credentials" provenance, which
// exporters attach automatically. Stripping it changes nothing a reader sees.
//
// This never writes over its input. Give it an output directory.
//
//   node scripts/resource-hub/strip-embedded-attachments.mjs --out <dir> <pdf...>
//
// Unlinking the name tree is not enough: an unreferenced attachment is still
// written back out and still reads as /EmbeddedFile. The objects themselves
// are deleted from the document.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream } from "pdf-lib";

const argv = process.argv.slice(2);
const outIndex = argv.findIndex((a) => a === "--out");
if (outIndex === -1 || !argv[outIndex + 1]) {
  console.error("usage: strip-embedded-attachments.mjs --out <dir> <pdf...>");
  process.exit(2);
}
const outDir = argv[outIndex + 1];
const inputs = argv.filter((_, i) => i !== outIndex && i !== outIndex + 1);
if (inputs.length === 0) {
  console.error("no input files");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const NAMES = PDFName.of("Names");
const EMBEDDED_FILES = PDFName.of("EmbeddedFiles");
const AF = PDFName.of("AF");

/** Collect every ref reachable from a value, so an attachment's stream goes too. */
function reachable(context, value, seen = new Set()) {
  if (value instanceof PDFRef) {
    if (seen.has(value.tag)) return seen;
    seen.add(value.tag);
    seen.add(value);
    return reachable(context, context.lookup(value), seen);
  }
  if (value instanceof PDFArray) {
    for (let i = 0; i < value.size(); i += 1) reachable(context, value.get(i), seen);
    return seen;
  }
  const dict = value instanceof PDFStream ? value.dict : value;
  if (dict instanceof PDFDict) for (const entry of dict.values()) reachable(context, entry, seen);
  return seen;
}

function strip(bytes) {
  return PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }).then((doc) => {
    const context = doc.context;
    const doomed = new Set();
    const removed = [];

    const names = doc.catalog.lookup(NAMES, PDFDict);
    const tree = names?.get(EMBEDDED_FILES);
    if (tree) {
      for (const ref of reachable(context, tree)) if (ref instanceof PDFRef) doomed.add(ref);
      names.delete(EMBEDDED_FILES);
      removed.push("catalog /Names /EmbeddedFiles");
      if (names.keys().length === 0) doc.catalog.delete(NAMES);
    }

    // /AF associates files with the document or a page; same objects, other door.
    for (const holder of [doc.catalog, ...doc.getPages().map((page) => page.node)]) {
      const af = holder.get(AF);
      if (!af) continue;
      for (const ref of reachable(context, af)) if (ref instanceof PDFRef) doomed.add(ref);
      holder.delete(AF);
      removed.push(holder === doc.catalog ? "catalog /AF" : "page /AF");
    }

    for (const ref of doomed) context.delete(ref);
    return { doc, removed, deletedObjects: doomed.size };
  });
}

const markers = ["/EmbeddedFile", "/EF", "/Filespec"];
const countMarkers = (buf) => {
  const text = buf.toString("latin1");
  return Object.fromEntries(markers.map((m) => [m, text.split(m).length - 1]));
};

let failures = 0;
for (const input of inputs) {
  let original;
  try {
    original = fs.readFileSync(input);
    const { doc, removed, deletedObjects } = await strip(original);
    const pagesBefore = doc.getPageCount();
    const out = Buffer.from(await doc.save({ useObjectStreams: false }));
    const target = path.join(outDir, path.basename(input));
    fs.writeFileSync(target, out);
    const after = countMarkers(out);
    const clean = markers.every((m) => after[m] === 0);
    if (!clean) failures += 1;
    console.log(
      JSON.stringify({
        file: path.basename(input),
        pages: pagesBefore,
        removed,
        deletedObjects,
        before: countMarkers(original),
        after,
        bytes: { before: original.byteLength, after: out.byteLength },
        clean,
        output: target,
      }),
    );
  } catch (error) {
    failures += 1;
    console.log(JSON.stringify({ file: path.basename(input), error: String(error?.message ?? error) }));
  }
}
process.exit(failures === 0 ? 0 : 1);
