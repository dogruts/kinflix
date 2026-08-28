
const fs = require("fs");
const path = require("path");

const version = process.argv[2];

if (!version) {
  console.error("Kullanim: npm run version 0.3.0");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Gecersiz version. Ornek: 0.3.0");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");

const ignoredDirectories = new Set([
  "node_modules",
  ".git",
  "target",
  "dist",
  "dist-ssr"
]);

let changedFiles = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(fullPath);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();

    if (ext !== ".json" && ext !== ".toml") {
      continue;
    }

    updateFile(fullPath);
  }
}

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  if (filePath.endsWith(".json")) {
    try {
      const json = JSON.parse(content);

      if (Object.prototype.hasOwnProperty.call(json, "version")) {
        json.version = version;

        content = JSON.stringify(json, null, 2) + "\n";
      }
    } catch {
      // Geçersiz JSON ise atla
      return;
    }
  }

  if (filePath.endsWith(".toml")) {
    // version = "x.x.x"
    content = content.replace(
      /^(\s*version\s*=\s*)"[^"]+"/gm,
      `$1"${version}"`
    );
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    changedFiles++;

    console.log(
      `Updated: ${path.relative(root, filePath)}`
    );
  }
}

walk(root);

console.log("");
console.log(`Version: ${version}`);
console.log(`Updated files: ${changedFiles}`);
console.log("Done.");
