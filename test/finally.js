import Promise from "../lib/Promise.js";
import CancelablePromise from "../lib/cancelable-promise.js";
import delay from "./helpers/delay.js";
const assert = require("assert");

for (const Constructor of [Promise, CancelablePromise]) {
  describe(`${Constructor.name}.prototype.finally`, () => {
    it("should return the same type of promise as the original", () => {
      assert.strictEqual(Constructor.resolve().finally().constructor, Constructor);
    });

    it("should call onFinally for both fulfilled and rejected promises, with no arguments", () => {
      let fulfilledArgs = null;
      let rejectedArgs = null;

      Constructor.resolve(5).finally((...args) => fulfilledArgs = args);
      Constructor.reject(new Error("boo")).finally((...args) => rejectedArgs = args);

      return delay().then(() => {
        assert.deepEqual(fulfilledArgs, [], "onFinally for the fulfilled promise should be called with no arguments");
        assert.deepEqual(rejectedArgs, [], "onFinally for the rejected promise should be called with no arguments");
      });
    });

    it("should propagate the fulfillment value even if onFinally returns a scalar", () => {
      return Constructor.resolve(5).finally(() => 10).then(v => {
        assert.strictEqual(v, 5);
      });
    });

    it("should propagate the fulfillment value even if onFinally returns a fulfilled promise", () => {
      return Constructor.resolve(5).finally(() => Constructor.resolve(10)).then(v => {
        assert.strictEqual(v, 5);
      });
    });

    it("should ignore the fulfillment value if onFinally throws", () => {
      const error = new Error("boo!");
      return Constructor.resolve(5).finally(() => { throw error; }).catch(r => {
        assert.strictEqual(r, error);
      });
    });

    it("should ignore the fulfillment value if onFinally returns a rejected promise", () => {
      const error = new Error("boo!");
      return Constructor.resolve(5).finally(() => Constructor.reject(error)).catch(r => {
        assert.strictEqual(r, error);
      });
    });

    it("should propagate the rejection reason even if onFinally returns a scalar", () => {
      const error = new Error("boo!");
      return Constructor.reject(error).finally(() => 10).catch(r => {
        assert.strictEqual(r, error);
      });
    });

    it("should propagate the rejection reason even if onFinally returns a fulfilled promise", () => {
      const error = new Error("boo!");
      return Constructor.reject(error).finally(() => Constructor.resolve(10)).catch(r => {
        assert.strictEqual(r, error);
      });
    });

    it("should delay resolving if a promise is returned", () => {
      const vals = [];
      return Constructor.resolve()
        .finally(() => delay().then(() => vals.push(1)))
        .then(() => vals.push(2))
        .then(() => {
          assert.deepEqual(vals, [1, 2]);
        });
    });

    it("should ignore the rejection reason if onFinally throws", () => {
      const error = new Error("boo!");
      const error2 = new Error("boo!");
      return Constructor.reject(error).finally(() => { throw error2; }).catch(r => {
        assert.strictEqual(r, error2);
      });
    });

    it("should ignore the rejection reason if onFinally returns a rejected promise", () => {
      const error = new Error("boo!");
      const error2 = new Error("boo!");
      return Constructor.reject(error).finally(() => Constructor.reject(error2)).catch(r => {
        assert.strictEqual(r, error2);
      });
    });
  });
}
