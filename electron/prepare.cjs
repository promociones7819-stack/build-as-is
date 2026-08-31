const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const vendor = path.join(__dirname, "vendor");

const files = [
  ["node_modules/jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
  [
    "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
    "jspdf.plugin.autotable.min.js",
  ],
];

fs.mkdirSync(vendor, { recursive: true });

for (const [source, destination] of files) {
  fs.copyFileSync(path.join(root, source), path.join(vendor, destination));
}

console.log("Dependencias PDF preparadas para la aplicación de escritorio.");
