/* eslint-disable @typescript-eslint/no-require-imports */
/* global clearTimeout, console, process, require, setTimeout */

const { app } = require("electron");
const Database = require("better-sqlite3");
const pty = require("node-pty");

app.whenReady().then(async () => {
  const database = new Database(":memory:");
  database.exec("CREATE TABLE smoke (value TEXT NOT NULL)");
  database.prepare("INSERT INTO smoke (value) VALUES (?)").run("sqlite-ok");
  const value = database.prepare("SELECT value FROM smoke").pluck().get();
  database.close();
  if (value !== "sqlite-ok") throw new Error("Electron SQLite smoke failed.");

  const output = await new Promise((resolve, reject) => {
    const terminal = pty.spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "echo pty-ok"], {
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });
    let text = "";
    const timer = setTimeout(() => {
      terminal.kill();
      reject(new Error("Electron PTY smoke timed out."));
    }, 10_000);
    terminal.onData((data) => { text += data; });
    terminal.onExit(() => {
      clearTimeout(timer);
      resolve(text);
    });
  });
  if (!output.includes("pty-ok")) throw new Error("Electron PTY smoke failed.");
  console.log("Electron native SQLite and PTY smoke passed.");
  app.exit(0);
}).catch((cause) => {
  console.error(cause);
  app.exit(1);
});
