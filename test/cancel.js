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
      assert.strictEqual(onCanceledCalled, true, "onCanceled called");
    });
  });

  it("should not call onCanceled if the the promise is fulfilled", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => resolve());

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, true, "onFulfilled called");
      assert.strictEqual(onRejectedCalled, false, "onRejected not called");
      assert.strictEqual(onCanceledCalled, false, "onCanceled not called");
    });
  });

  it("should not call onCanceled if the the promise is rejected", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => reject());

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, false, "onFulfilled not called");
      assert.strictEqual(onRejectedCalled, true, "onRejected called");
      assert.strictEqual(onCanceledCalled, false, "onCanceled not called");
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
      assert.strictEqual(onCanceledCalled, true, "onCanceled called");
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
      assert.strictEqual(onCanceledCalled, true, "onCanceled called");
    });
  });

  it("should not call the onCanceled handler for a promise that cancels after fulfillment", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => {
      resolve();
      cancel();
    });

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, true, "onFulfilled called");
      assert.strictEqual(onRejectedCalled, false, "onRejected not called");
      assert.strictEqual(onCanceledCalled, false, "onCanceled not called");
    });
  });

  it("should not call the onCanceled handler for a promise that cancels after rejection", () => {
    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;

    const p = new Promise((resolve, reject, cancel) => {
      reject();
      cancel();
    });

    p.then(
      () => onFulfilledCalled = true,
      () => onRejectedCalled = true,
      () => onCanceledCalled = true
    );

    return delay().then(() => {
      assert.strictEqual(onFulfilledCalled, false, "onFulfilled not called");
      assert.strictEqual(onRejectedCalled, true, "onRejected called");
      assert.strictEqual(onCanceledCalled, false, "onCanceled not called");
    });
  });
});

describe("Cancelation propagation through non-branching chains", () => {
  it("should call onCanceled for derived promises", () => {
    let cancel;
    const p = new Promise((resolve, reject, c) => cancel = c);

    let onFulfilledCalled = false;
    let onRejectedCalled = false;
    let onCanceledCalled = false;
    let onCanceled2Called = false;

    p
      .then(
        () => onFulfilledCalled = true,
        () => onRejectedCalled = true,
        () => onCanceledCalled = true
      )
      .then(
        () => onFulfilledCalled = true,
        () => onRejectedCalled = true,
        () => onCanceled2Called = true
      );

    cancel();

    return delay().then(_ => {
      assert.strictEqual(onFulfilledCalled, false, "onFulfilled not called");
      assert.strictEqual(onRejectedCalled, false, "onRejected not called");
      assert.strictEqual(onCanceledCalled, true, "onCanceled called");
      assert(onCanceled2Called, "second onCanceled called");
    });
  });
});
