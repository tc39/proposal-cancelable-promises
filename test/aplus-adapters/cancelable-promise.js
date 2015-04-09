import CancelablePromise from "../../lib/cancelable-promise.js";

module.exports = {
  resolved: v => CancelablePromise.resolve(v),
  rejected: r => CancelablePromise.reject(r),
  deferred: () => {
    const d = {};
    d.promise = new CancelablePromise((resolve, reject) => {
      d.resolve = resolve;
      d.reject = reject;
    });
    return d;
  }
};
