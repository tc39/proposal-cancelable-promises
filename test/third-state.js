"use strict";
const assert = require("assert");
const Promise = require("../lib/promise.js");
const delay = require("./helpers/delay.js");

describe("The Promise constructor", () => {
  it("should provide a cancel function to the executor", () => {
    let cancel;
    new Promise((resolve, reject, c) => {
      cancel = c;
    });

    assert.strictEqual(typeof cancel, "function");
  });
});

describe("Promise.prototype.then basics", () => {
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

  it("should call onCanceled with the cancelation reason", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    const p = new Promise((resolve, reject, cancel) => cancel(reason));

    p.then(undefined, undefined, arg => onCanceledArg = arg);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason);
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

  it("should not call the onFulfilled or onRejected handlers for a promise resolve()ed after cancelation", () => {
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

  it("should not call the onFulfilled or onRejected handlers for a promise reject()ed after cancelation", () => {
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

  it("should not call the onCanceled handler for a promise cancel()ed after fulfillment", () => {
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

  it("should not call the onCanceled handler for a promise cancel()ed after rejection", () => {
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

describe("Cancelation state propagation through non-branching chains", () => {
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
      assert.strictEqual(onCanceled2Called, true, "second onCanceled called");
    });
  });

  it("should propagate the cancelation reason to derived promises", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    const p = new Promise((resolve, reject, cancel) => cancel(reason));

    p.then().then(undefined, undefined, arg => onCanceledArg = arg);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason);
    });
  });
});

describe("State transitions in non-branching promise chains", () => {
  specify("throw cancel should give a canceled promise from a fulfilled promise", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    Promise.resolve()
      .then(() => { throw cancel reason; })
      .then(undefined, undefined, arg => onCanceledArg = arg);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason);
    });
  });

  specify("throw cancel should give a canceled promise from a rejected promise", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    Promise.reject()
      .catch(() => { throw cancel reason; })
      .then(undefined, undefined, arg => onCanceledArg = arg);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason);
    });
  });

  specify("catchCancel should be able to transition to a fulfilled state", () => {
    const value = { some: "value" };
    let onFulfilledArg;

    Promise.cancel({ some: "reason" })
      .catchCancel(() => value)
      .then(arg => onFulfilledArg = arg);

    return delay().then(() => {
      assert.strictEqual(onFulfilledArg, value);
    });
  });

  specify("catchCancel should be able to transition to a rejected state", () => {
    const reason = new Error("boo");
    let onRejectedArg;

    Promise.cancel({ some: "reason" })
      .catchCancel(() => { throw reason; })
      .catch(arg => onRejectedArg = arg);

    return delay().then(() => {
      assert.strictEqual(onRejectedArg, reason);
    });
  });

  specify("catchCancel should be able to throw cancel a different reason", () => {
    const reason = { some: "other reason" };
    let onCanceledArg;

    Promise.cancel({ some: "reason" })
      .catchCancel(() => { throw cancel reason; })
      .catchCancel(arg => onCanceledArg = arg);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason);
    });
  });
});
