"use strict";
const Task = require("../../lib/task.js");

module.exports = {
  resolved: v => Task.resolve(v),
  rejected: r => Task.reject(r),
  deferred: () => {
    const d = {};
    d.promise = new Task((resolve, reject) => {
      d.resolve = resolve;
      d.reject = reject;
    });
    return d;
  }
};
