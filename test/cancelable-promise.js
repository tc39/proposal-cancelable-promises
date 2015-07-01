import CancelablePromise from "../lib/cancelable-promise.js";
import delay from "./helpers/delay.js";

const assert = require("assert");

describe("Basic onCanceled and .cancel() interaction", () => {
  it("should call the onCanceled handler when canceling a forever-pending promise", () => {
    let called = false;
    const p = new CancelablePromise(() => (() => called = true));

    p.cancel();

    assert(called, "onCanceled should be called");
  });

  it("should not call the onCanceled handler when canceling an immediately-fulfilled promise", () => {
    let called = false;
    const p = new CancelablePromise(resolve => {
      resolve();
      return () => called = true;
    });

    p.cancel();

    assert(!called, "onCanceled should not be called");
  });

  it("should not call the onCanceled handler when canceling an immediately-rejected promise", () => {
    let called = false;
    const p = new CancelablePromise((resolve, reject) => {
      reject();
      return () => called = true;
    });

    p.cancel();

    assert(!called, "onCanceled should not be called");
  });

  it("should not call the onFulfilled or onRejected handlers for a promise that fulfills after cancelation", () => {
    let resolve;
    const p = new CancelablePromise(r => {
      resolve = r;
      return () => {};
    });

    let calledOnFulfilled = false;
    let calledOnRejected = false;
    p.then(() => calledOnFulfilled = true, () => calledOnRejected = true);

    p.cancel();
    resolve();

    return delay().then(() => {
      assert(!calledOnFulfilled, "onFulfilled should not be called");
      assert(!calledOnRejected, "onRejected should not be called");
    });
  });

  it("should not call the onFulfilled or onRejected handlers for a promise that rejects after cancelation", () => {
    let reject;
    const p = new CancelablePromise((r, rr) => {
      reject = rr;
      return () => {};
    });

    let calledOnFulfilled = false;
    let calledOnRejected = false;
    p.then(() => calledOnFulfilled = true, () => calledOnRejected = true);

    p.cancel();
    reject();

    return delay().then(() => {
      assert(!calledOnFulfilled, "onFulfilled should not be called");
      assert(!calledOnRejected, "onRejected should not be called");
    });
  });

  it("should call the finally handler once cancelled even if promise is never directly resolved or rejected", done => {
    const p = new CancelablePromise(() => {});
    p.cancel();

    p.finally(_ => {
      assert(true, "finally called");
      done();
    });
  });
});

describe("Cancelation propagation through non-branching chains", () => {
  it("should not allow CancelablePromise.prototype.then to be called on non-CancelablePromises", () => {
    assert.throws(() => CancelablePromise.prototype.then.call(Promise.resolve()), TypeError);
    assert.throws(() => CancelablePromise.prototype.then.call({ then() { } }), TypeError);
  });

  it("should return a CancelablePromise instance from .then", () => {
    const derived = new CancelablePromise(() => {}).then();
    assert.strictEqual(derived.constructor, CancelablePromise);
  });

  it("should call the original onCanceled handler when canceling a derived promise", () => {
    let called = false;
    const p = new CancelablePromise(() => {
      return () => called = true;
    });

    p.then().cancel();

    assert(called, "onCanceled should be called");
  });

  it("should call the original onCanceled handler when canceling a derived promise several levels deep", () => {
    let called = false;
    const p = new CancelablePromise(() => (() => called = true));

    p.then().then(() => {}).then(() => delay(1000)).catch(() => delay(1234)).catch(() => {}).cancel();

    assert(called, "onCanceled should be called");
  });

  it("should not call the onCanceled handler if the original promise in the chain fulfills", () => {
    let resolve;
    const p = new CancelablePromise(r => {
      resolve = r;
      return () => {};
    });

    let calledOnFulfilled = false;
    let calledOnRejected = false;
    p.then(() => calledOnFulfilled = true, () => calledOnRejected = true).cancel();

    resolve();

    return delay().then(() => {
      assert(!calledOnFulfilled, "onFulfilled should not be called");
      assert(!calledOnRejected, "onRejected should not be called");
    });
  });


  it("should not call the onCanceled handler if the original promise in the chain rejects", () => {
    let reject;
    const p = new CancelablePromise((r, rr) => {
      reject = rr;
      return () => {};
    });

    let calledOnFulfilled = false;
    let calledOnRejected = false;
    p.then(() => calledOnFulfilled = true, () => calledOnRejected = true).cancel();

    reject();

    return delay().then(() => {
      assert(!calledOnFulfilled, "onFulfilled should not be called");
      assert(!calledOnRejected, "onRejected should not be called");
    });
  });
});

describe("Cancelation propagation through resolved values", () => {
  it("should call the onCanceled handler of a promise that is the resolved value of a promise", () => {
    let called = false;
    const p = CancelablePromise.resolve(new CancelablePromise(() => {
      return () => called = true;
    }));

    p.cancel();

    assert(called, "onCanceled should be called");
  });

  it("should call onCanceled at the tip of a resolved value chain", () => {
    let called = false;
    const p = CancelablePromise.resolve(
      new CancelablePromise(() => {
        return () => called = true;
      }).then(() => delay(1000)).catch(() => delay(1234)).catch(() => {})
    );

    p.cancel();

    assert(called, "onCanceled should be called");
  });
});

describe("Cancellable promises with multiple children", () => {
  it("should not call cancel if one of two children are cancelled", () => {
    let called = false;

    const p1 = new CancelablePromise((resolve, reject) => {
      return () => called = true;
    });

    const p2 = p1.then(() => {});
    const p3 = p1.then(() => {});

    p3.cancel();
    assert(!called, "onCanceled should not be called");
  });

  it("should call cancel if two of two children are cancelled", () => {
    let called = false;

    const p1 = new CancelablePromise((resolve, reject) => {
      return () => called = true;
    });

    const p2 = p1.then(() => {});
    const p3 = p1.then(() => {});

    p2.cancel();
    p3.cancel();
    assert(called, "onCanceled should be called");
  });

  it("should call cancel if directly cancelled, despite children", () => {
    let called = false;

    const p1 = new CancelablePromise((resolve, reject) => {
      return () => called = true;
    });

    const p2 = p1.then(() => {});
    const p3 = p1.then(() => {});

    p1.cancel();
    assert(called, "onCanceled should be called");
  });

  it("should not affect a cancelled child", () => {
    let called = false;

    const p1 = new CancelablePromise((resolve, reject) => {
      setTimeout(resolve, 0);
      return () => called = true;
    });

    const p2 = p1.then(() => {});
    const p3 = p1.then(() => {});

    p3.cancel();
    assert(!called, "onCanceled should not be called");

    let resolved = false;
    let rejected = false;

    return p3.then(() => resolved = true, () => rejected = true).finally(() => {
      assert(!resolved, "resolved handler should not be called");
      assert(!rejected, "reject handler should not be called");
    });
  });
});