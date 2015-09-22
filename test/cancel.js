import Promise from "../lib/promise.js";
import delay from "./helpers/delay.js";
const assert = require("assert");

describe("Basic canceled interaction", () => {
  it("should provide a cancel function in the constructor", () => {
    let cancel;
    new Promise((resolve, reject, c) => {
      cancel = c;
    });

    assert.strictEqual(typeof cancel, "function");
  });

  it("should only call onCanceled if the the promise is canceled", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => cancel());

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, false, "onFulfilled not called");
      assert.strictEqual(onRejectedCalled, false, "onRejected not called");
      assert(onCanceledCalled, "onCanceled called");
    });
  });

  it("should not call the onFulfilled or onRejected handlers for a promise that fulfills after cancelation", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => {
      cancel();
      resolve();
    });

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, false, "onFulfilled not called");
      assert.strictEqual(onRejectedCalled, false, "onRejected not called");
      assert(onCanceledCalled, "onCanceled called");
    });
  });

  it("should not call the onFulfilled or onRejected handlers for a promise that rejects after cancelation", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => {
      cancel();
      reject();
    });

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, false, "onFulfilled not called");
      assert.strictEqual(onRejectedCalled, false, "onRejected not called");
      assert(onCanceledCalled, "onCanceled called");
    });
  });

  it.skip("should propogate cancelation", () => {
    let cancel;
    const p = new Promise((resolve, reject, c) => cancel = c);

    let onFinallyCalled = false;
    let onFulfillCalled = false;
    let onRejectCalled = false;
    let secondOnFinallyCalled = false;

    p.finally(_ => {
      onFinallyCalled = true;
    }).then(_ => {
      onFulfillCalled = true;
    }, _ => {
      onRejectCalled = true;
    }).finally(_ => {
      secondOnFinallyCalled = true;
    });

    cancel();

    return delay().then(_ => {
      assert(onFinallyCalled, "onFinally should be called");
      assert(!onFulfillCalled, "onFulfill should not be called");
      assert(!onRejectCalled, "onReject should not be called");
      assert(secondOnFinallyCalled, "2nd onFinally should be called");
    });
  });
});

describe.skip("Cancelation propagation through non-branching chains", () => {
  it("should call chained finallies", done => {
    const p = new Promise((resolve, reject, cancel) => cancel());

    let callCount = 0;

    p.finally(_ => callCount++).finally(_ => {
      callCount++;
      assert.strictEqual(callCount, 2, "Both finallies called");
      done();
    });
  });
});
