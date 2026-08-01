const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sandbox = {
  chrome: {
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
    runtime: { onMessage: { addListener() {} } },
  },
  console,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(fs.readFileSync("background.js", "utf8"), sandbox);

const prescriptions = [
  {
    date: "2026-07-31",
    oralCount: 0,
    parenteralCount: 2,
    medications: [{ name: "Ceftriaxone 1 gr Injeksi", instruction: "2x1", quantity: "2" }],
  },
  {
    date: "2026-07-30",
    oralCount: 2,
    parenteralCount: 0,
    medications: [
      { name: "Asam Mefenamat 500 mg Tablet (EPM)", instruction: "3x1", quantity: "10" },
      { name: "Cefadroxil 500 mg Kapsul (PPG)", instruction: "2x1", quantity: "6" },
    ],
  },
];
const prompt = sandbox.buildDischargeMedicationPrompt({ prescriptions });
assert.match(prompt, /tanggal perawatan terakhir dan satu hari sebelumnya \(H-1\)/);
assert.match(prompt, /paling dominan berisi obat oral/);
assert.match(prompt, /Ceftriaxone 1 gr Injeksi/);
assert.equal(
  JSON.stringify(sandbox.normalizeDischargeMedicationResult(
    '{"source_date":"2026-07-30","medications":["Asam Mefenamat 3x500mg","Cefadroxil 2x500mg","Ceftriaxone Injeksi"]}',
    prescriptions
  )),
  JSON.stringify({ date: "2026-07-30", medications: ["Asam Mefenamat 3x500mg", "Cefadroxil 2x500mg"] })
);
console.log("discharge medication AI prompt check passed");