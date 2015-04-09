import CancelablePromise from "../lib/cancelable-promise";
const assert = require("assert");

describe("Cancelable Promise Tests", () => {
  it("should call the onCanceled handler when canceling a forever-pending promise", () => {
    let called = false;
    const p = new CancelablePromise(() => {}, () => called = true);

    p.cancel();

    assert(called, "onCanceled should be called");
  });

  it("should not call the onCanceled handler when canceling an immediately-fulfilled promise", () => {
    let called = false;
    const p = new CancelablePromise(resolve => resolve(), () => called = true);

    p.cancel();

    assert(!called, "onCanceled should not be called");
  });

  it("should not call the onCanceled handler when canceling an immediately-rejected promise", () => {
    let called = false;
    const p = new CancelablePromise((resolve, reject) => reject(), () => called = true);

    p.cancel();

    assert(!called, "onCanceled should not be called");
  });
});
