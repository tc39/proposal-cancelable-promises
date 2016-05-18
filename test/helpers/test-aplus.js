"use strict";
require("./install-syntax.js");

const promisesAplusTests = require("promises-aplus-tests");
const adapter = require("../aplus-adapters/promise.js");

promisesAplusTests(adapter, function (err) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
});
