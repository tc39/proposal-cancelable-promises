"use strict";
const fs = require("fs");
const sweet = require("sweet.js");

const macros = fs.readFileSync(require.resolve("throw-catch-cancel-syntax"), { encoding: "utf-8" });

require.extensions[".js"] = (module, filename) => {
  const content = fs.readFileSync(filename, { encoding: "utf-8" });

  if (filename.includes("node_modules")) {
    return module._compile(content, filename);
  }

  const compiled = sweet.compile(macros + "\n\n" + content).code;
  return module._compile(compiled, filename);
};
