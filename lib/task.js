"use strict";
const Promise = require("./promise.js");

module.exports = class Task extends Promise {
  constructor(executor) {
    let savedCancel;
    super((resolve, reject, cancel) => {
      executor(resolve, reject, cancel);
      savedCancel = cancel;
    });

    this._parent = null; // TODO memory leaks
    this._savedCancel = savedCancel;
  }

  then(onFulfilled, onRejected, onCanceled) {
    // This is probably not how we'd spec it.

    // SweetJS can't do super...
    const returnValue = Promise.prototype.then.call(this, onFulfilled, onRejected, onCanceled);
    returnValue._parent = this;
    return returnValue;
  }

  cancel(reason) {
    // Cannot simply use CancelPromise abstract op because it doesn't have already-resolved state.
    // Consider refactoring the spec to store that on the promise? Shouldn't really matter...
    this._savedCancel(reason);

    if (this._parent !== null) {
      this._parent.cancel(reason);
    }
  }
};
