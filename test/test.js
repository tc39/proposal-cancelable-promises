import Promise from "../lib/promise.js";
import CancelablePromise from "../lib/cancelable-promise.js";

describe("Promises/A+ Tests for Promise", () => require("promises-aplus-tests").mocha(makeAdapter(Promise)));

describe("Promises/A+ Tests for CancelablePromise", () => require("promises-aplus-tests").mocha(makeAdapter(CancelablePromise)));

function makeAdapter(Constructor) {
  return {
    resolved: v => Constructor.resolve(v),
    rejected: r => Constructor.reject(r),
    deferred: () => {
      const d = {};
      d.promise = new Constructor((resolve, reject) => {
        d.resolve = resolve;
        d.reject = reject;
      });
      return d;
    }
  };
}

describe("Cancelable Promise Tests", () => {
  // none yet
});
