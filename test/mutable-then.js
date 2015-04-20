import Promise from "../lib/Promise.js";
const assert = require("assert");

describe("Promise should call overridden `then` methods", () => {
  it("should work when returning from another promise", () => {
    let called = false;

    const p1 = Promise.resolve();
    p1.then = function (onFulfilled, onRejected) {
      called = true;
      onFulfilled(10);
    };

    return Promise.resolve().then(() => p1).then(v => {
      assert(called, "The overridden `then` method should have been called");
      assert.strictEqual(v, 10, "The call to onFulfilled from the overwritten `then` should have propagated");
    });
  });

  it("should work when using Promise.resolve directly", () => {
    let called = false;

    const p1 = Promise.resolve();
    p1.then = function (onFulfilled, onRejected) {
      called = true;
      onFulfilled(10);
    };

    return Promise.resolve(p1).then(v => {
      assert(called, "The overridden `then` method should have been called");
      assert.strictEqual(v, 10, "The call to onFulfilled from the overwritten `then` should have propagated");
    });
  });
});
