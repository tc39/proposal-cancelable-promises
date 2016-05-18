"use strict";
const Promise = require("./promise.js");

module.exports = class Task extends Promise {
  constructor(executor) {
    let savedCancel;
    super((resolve, reject, cancel) => {
      executor(resolve, reject, cancel);
      savedCancel = cancel;
    });

    this._savedCancel = savedCancel;
  }

  cancel(reason) {
    // Cannot simply use CancelPromise abstract op because it doesn't have already-resolved state.
    // Consider refactoring the spec to store that on the promise? Shouldn't really matter...
    this._savedCancel(reason);
  }
};
