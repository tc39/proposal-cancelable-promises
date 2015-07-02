import Promise from "../lib/Promise.js";
import delay from "./helpers/delay.js";
const assert = require("assert");

describe("Basic canceled interaction", () => {
  it("should provide a cancel function in the constructor", () => {
    let cancel;
    new Promise((resolve, reject, c) => {
      cancel = c;
    });

    assert.strictEqual(typeof cancel, 'function');
  });

  it("should only call finally if promise is canceled", (done) => {
    let onFulfillCalled = false;
    let onRejectCalled = false;

    var p = new Promise((resolve, reject, cancel) => cancel());

    p.then(
      _ => onFulfillCalled = true,
      _ => onRejectCalled = true
    ).finally(_ => {
      assert(!onFulfillCalled, "onFulfill not called");
      assert(!onRejectCalled, "onReject not called");
      done();
    });
  });

  it("should not call the onFulfilled or onRejected handlers for a promise that fulfills after cancelation", () => {
    const p = new Promise((resolve, reject, cancel) => {
      cancel();
      resolve();
    });

    let calledOnFulfilled = false;
    let calledOnRejected = false;
    p.then(() => calledOnFulfilled = true, () => calledOnRejected = true);

    return delay().then(() => {
      assert(!calledOnFulfilled, "onFulfilled should not be called");
      assert(!calledOnRejected, "onRejected should not be called");
    });
  });

  it("should not call the onFulfilled or onRejected handlers for a promise that rejects after cancelation", () => {
    const p = new Promise((resolve, reject, cancel) => {
      cancel();
      reject();
    });

    let calledOnFulfilled = false;
    let calledOnRejected = false;
    p.then(() => calledOnFulfilled = true, () => calledOnRejected = true);

    return delay().then(() => {
      assert(!calledOnFulfilled, "onFulfilled should not be called");
      assert(!calledOnRejected, "onRejected should not be called");
    });
  });

  it("should propogate cancelation", () => {
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

describe("Cancelation propagation through non-branching chains", () => {
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
