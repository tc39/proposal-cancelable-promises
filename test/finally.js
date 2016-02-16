"use strict";
const Promise = require("../lib/promise.js");
const delay = require("./helpers/delay.js");
const assert = require("assert");

describe.skip("Promise.prototype.finally", () => {
  it("should call onFinally for both fulfilled and rejected promises, with no arguments", () => {
    let fulfilledArgs = null;
    let rejectedArgs = null;

    Promise.resolve(5).finally(() => fulfilledArgs = [...arguments]);
    Promise.reject(new Error("boo")).finally(() => rejectedArgs = [...arguments]);

    return delay().then(() => {
      assert.deepEqual(fulfilledArgs, [], "onFinally for the fulfilled promise should be called with no arguments");
      assert.deepEqual(rejectedArgs, [], "onFinally for the rejected promise should be called with no arguments");
    });
  });

  it("should propagate the fulfillment value even if onFinally returns a scalar", () => {
    return Promise.resolve(5).finally(() => 10).then(v => {
      assert.strictEqual(v, 5);
    });
  });

  it("should propagate the fulfillment value even if onFinally returns a fulfilled promise", () => {
    return Promise.resolve(5).finally(() => Promise.resolve(10)).then(v => {
      assert.strictEqual(v, 5);
    });
  });

  it("should ignore the fulfillment value if onFinally throws", () => {
    const error = new Error("boo!");
    return Promise.resolve(5).finally(() => { throw error; }).catch(r => {
      assert.strictEqual(r, error);
    });
  });

  it("should ignore the fulfillment value if onFinally returns a rejected promise", () => {
    const error = new Error("boo!");
    return Promise.resolve(5).finally(() => Promise.reject(error)).catch(r => {
      assert.strictEqual(r, error);
    });
  });

  it("should propagate the rejection reason even if onFinally returns a scalar", () => {
    const error = new Error("boo!");
    return Promise.reject(error).finally(() => 10).catch(r => {
      assert.strictEqual(r, error);
    });
  });

  it("should propagate the rejection reason even if onFinally returns a fulfilled promise", () => {
    const error = new Error("boo!");
    return Promise.reject(error).finally(() => Promise.resolve(10)).catch(r => {
      assert.strictEqual(r, error);
    });
  });

  it("should delay resolving if a promise is returned", () => {
    const vals = [];
    return Promise.resolve()
      .finally(() => delay().then(() => vals.push(1)))
      .then(() => vals.push(2))
      .then(() => {
        assert.deepEqual(vals, [1, 2]);
      });
  });

  it("should ignore the rejection reason if onFinally throws", () => {
    const error = new Error("boo!");
    const error2 = new Error("boo!");
    return Promise.reject(error).finally(() => { throw error2; }).catch(r => {
      assert.strictEqual(r, error2);
    });
  });

  it("should ignore the rejection reason if onFinally returns a rejected promise", () => {
    const error = new Error("boo!");
    const error2 = new Error("boo!");
    return Promise.reject(error).finally(() => Promise.reject(error2)).catch(r => {
      assert.strictEqual(r, error2);
    });
  });
});
