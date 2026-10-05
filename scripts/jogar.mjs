// Roda o jogo no seu computador e mostra o link + QR code para abrir no celular (mesmo Wi-Fi).
// Uso: npm run jogar   (ou dois cliques em Jogar.bat no Windows / jogar.sh no Mac e Linux)
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);

/** Data de modificação mais recente dentro de uma pasta. */
function newest(dir) {
  let t = 0;
  if (!fs.existsSync(dir)) return t;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(full) : fs.statSync(full).mtimeMs);
  }
  return t;
}

// compila só quando o código ou a mídia mudaram desde o último build
const built = path.join(root, "dist", "index.html");
const sources = Math.max(newest(path.join(root, "src")), newest(path.join(root, "public")), fs.statSync(path.join(root, "index.html")).mtimeMs);
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < sources || process.argv.includes("--build")) {
  console.log("Preparando o jogo (só demora na primeira vez ou depois de uma atualização)...\n");
  execSync("npx vite build", { cwd: root, stdio: "inherit" });
}

const server = await preview({ root, preview: { host: true, port: PORT, strictPort: false, open: false } });
const port = server.httpServer.address()?.port ?? PORT;

// endereços da rede local (o celular precisa estar no mesmo Wi-Fi)
const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address)
  .sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));

console.log("\n⚽  Lendas da Base está rodando!\n");
console.log(`   Neste computador:  http://localhost:${port}`);
for (const ip of ips) console.log(`   No celular:        http://${ip}:${port}`);
if (ips.length) {
  console.log("\n   Aponte a câmera do celular para o QR code (celular e computador no mesmo Wi-Fi):\n");
  try {
    const { default: qrcode } = await import("qrcode-terminal");
    qrcode.generate(`http://${ips[0]}:${port}`, { small: true });
  } catch {
    console.log(`   (digite no navegador do celular: http://${ips[0]}:${port})`);
  }
  console.log("   Se o Windows perguntar, permita o acesso do Node.js em redes privadas.");
}
console.log("\n   Para fechar o jogo, feche esta janela (ou aperte Ctrl+C).\n");
