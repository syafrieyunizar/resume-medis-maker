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
    doctor: "dr. Risnawati, Sp.KK",
    oralCount: 2,
    parenteralCount: 1,
    medications: [
      { name: "Cetirizine 10 mg Kaplet (EPM)", instruction: "2x1", quantity: "20" },
      { name: "Ibuprofen 400 mg Tablet", instruction: "3x1", quantity: "20" },
      { name: "NaCl 0,9% 500 ml Infus", instruction: "2x1", quantity: "1" },
    ],
  },
  {
    date: "2026-07-30",
    doctor: "dr. Risnawati, Sp.KK",
    oralCount: 1,
    parenteralCount: 0,
    medications: [{ name: "Acyclovir 400 mg Tablet", instruction: "5x2", quantity: "10" }],
  },
  {
    date: "2026-07-30",
    doctor: "dr. Lina Haryati, Sp.JP",
    oralCount: 2,
    parenteralCount: 0,
    medications: [
      { name: "Spironolactone 25 mg Tablet", instruction: "1x1", quantity: "10" },
      { name: "Digoxin 0.25 mg Tablet", instruction: "1x1", quantity: "10" },
    ],
  },
  {
    date: "2026-07-30",
    doctor: "dr. Lina Haryati, Sp.JP",
    oralCount: 2,
    parenteralCount: 5,
    medications: [{ name: "Ceftriaxone 1 gr Injeksi", instruction: "2x1", quantity: "2" }],
  },
];
const prompt = sandbox.buildDischargeMedicationPrompt({ prescriptions });
assert.match(prompt, /pilih SEMUA kandidat/);
assert.match(prompt, /dirawat bersama oleh beberapa DPJP/);
assert.match(prompt, /dr\. Risnawati, Sp\.KK/);
assert.match(prompt, /dr\. Lina Haryati, Sp\.JP/);
assert.equal(
  JSON.stringify(sandbox.normalizeDischargeMedicationResult(
    '{"selected_candidates":[1,2,3],"medications":["Cetirizine 2x10mg","Ibuprofen 3x400mg","Acyclovir 5x400mg","Spironolactone 1x25mg","Digoxin 1x0.25mg","Cetirizine 2x10mg","Ceftriaxone Injeksi"]}',
    prescriptions
  )),
  JSON.stringify({
    date: "2026-07-31, 2026-07-30",
    doctors: ["dr. Risnawati, Sp.KK", "dr. Lina Haryati, Sp.JP"],
    selectedCandidates: [1, 2, 3],
    medications: ["Cetirizine 2x10mg", "Ibuprofen 3x400mg", "Acyclovir 5x400mg", "Spironolactone 1x25mg", "Digoxin 1x0.25mg"],
  })
);
console.log("multi-DPJP discharge medication check passed");