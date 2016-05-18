"use strict";
require("./install-syntax.js");

const promisesAplusTests = require("promises-aplus-tests");
const promiseAdapter = require("../aplus-adapters/promise.js");
const taskAdapter = require("../aplus-adapters/task.js");

promisesAplusTests(promiseAdapter, err => {
  if (err) {
    console.log(err);
    process.exit(1);
    return;
  }

  promisesAplusTests(taskAdapter, err => {
    if (err) {
      console.log(err);
      process.exit(1);
    }
  });
});
