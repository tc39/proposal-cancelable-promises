"use strict";
require("./install-syntax.js");
const Promise = require("../../lib/promise.js");
const promisesAplusTests = require("promises-aplus-tests");

const adapter = {
  resolved: v => Promise.resolve(v),
  rejected: r => Promise.reject(r),
  deferred: () => {
    const d = {};
    d.promise = new Promise((resolve, reject) => {
      d.resolve = resolve;
      d.reject = reject;
    });
    return d;
  }
};

promisesAplusTests(adapter, err => {
  if (err) {
    console.log(err);
    process.exit(1);
  }
});
