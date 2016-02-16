"use strict";
const Promise = require("../../lib/promise.js");

module.exports = {
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
