"use strict";
const assert = require("assert");
const Task = require("../lib/task.js");
const delay = require("./helpers/delay.js");

describe("Task.prototype.then basics", () => {
  it("should return a Task instance", () => {
    const t = new Task(() => {});
    const descendant = t.then();

    assert.ok(descendant instanceof Task, "descendant should be instanceof Task");
    assert.strictEqual(descendant.constructor, Task, "descendant.construct should be Task");
  });
});

describe("Task.prototype.cancel basics", () => {
  it("should cause the task to be canceled with the given reason (subscribe before)", () => {
    const reason = { some: "reason" };

    const t = new Task(() => {});
    const results = getHandlerResultsStore(t);

    t.cancel(reason);

    return delay().then(() => {
      assertCanceledWith(results, reason);
    });
  });

  it("should cause the task to be canceled with the given reason (subscribe after)", () => {
    const reason = { some: "reason" };

    const t = new Task(() => {});
    t.cancel(reason);

    const results = getHandlerResultsStore(t);

    return delay().then(() => {
      assertCanceledWith(results, reason);
    });
  });
});

describe("Task cancelation upward propagation (non-branching chains)", () => {
  it("should cancel an unresolved root task (depth 1 chain)", () => {
    const reason = { some: "reason" };

    const root = new Task(() => {});
    const rootResults = getHandlerResultsStore(root, "root");

    const descendant = root.then();
    const descendantResults = getHandlerResultsStore(descendant, "descendant");

    assert.notEqual(root, descendant, "Sanity check: the descendant should not equal the root");

    descendant.cancel(reason);

    return delay().then(() => {
      assertCanceledWith(rootResults, reason);
      assertCanceledWith(descendantResults, reason);
    });
  });

  it("should cancel an unresolved root task (depth 3 chain)", () => {
    const reason = { some: "reason" };

    const root = new Task(() => {});
    const rootResults = getHandlerResultsStore(root, "root");

    const descendant = root.then().then().catchCancel();
    const descendantResults = getHandlerResultsStore(descendant, "descendant");

    assert.notEqual(root, descendant, "Sanity check: the descendant should not equal the root");

    descendant.cancel(reason);

    return delay().then(() => {
      assertCanceledWith(rootResults, reason);
      assertCanceledWith(descendantResults, reason);
    });
  });

  it("should cancel upward until it reaches a resolved promise", () => {
    const reason = { some: "reason" };

    const root = Task.resolve(5);
    const generation1 = root.then(() => delay(100));
    const generation2 = generation1.then();

    const rootResults = getHandlerResultsStore(root, "root");
    const generation1Results = getHandlerResultsStore(generation1, "generation1");
    const generation2Results = getHandlerResultsStore(generation2, "generation2");

    generation2.cancel(reason);

    // This fails because generation1 isn't resolved by the time generation2.cancel() is called, since
    // `() => delay(100)` only happens after a microtask. That seems bad and error-prone. Is there anything we can do?

    return delay(150).then(() => {
      assertFulfilledWith(rootResults, 5);
      assertFulfilledWith(generation1Results, undefined);
      assertCanceledWith(generation2Results, reason);
    })
  });
});

function getHandlerResultsStore(promise, label) {
  const store = { label: label }; // SweetJS dies on object literal shorthand
  promise.then(
    arg => store.onFulfilledArg = arg,
    arg => store.onRejectedArg = arg,
    arg => store.onCanceledArg = arg
  );
  return store;
}

function assertFulfilledWith(resultsStore, value) {
  const suffix = resultsStore.label === undefined ? "" : " for " + resultsStore.label;

  assert.strictEqual(resultsStore.onFulfilledArg, value,
    "onFulfilled should have been called with the specified value" + suffix);
  assert.strictEqual(resultsStore.hasOwnProperty("onRejectedArg"), false,
    "onRejected should not have been called" + suffix);
  assert.strictEqual(resultsStore.hasOwnProperty("onCanceledArg"), false,
    "onCanceled should not have been called" + suffix);
}

function assertRejectedWith(resultsStore, reason) {
  const suffix = resultsStore.label === undefined ? "" : " for " + resultsStore.label;

  assert.strictEqual(resultsStore.hasOwnProperty("onFulfilledArg"), false,
    "onFulfilled should not have been called" + suffix);
  assert.strictEqual(resultsStore.onRejectedArg, reason,
    "onRejected should have been called with the specified value" + suffix);
  assert.strictEqual(resultsStore.hasOwnProperty("onCanceledArg"), false,
    "onCanceled should not have been called" + suffix);
}

function assertCanceledWith(resultsStore, reason) {
  const suffix = resultsStore.label === undefined ? "" : " for " + resultsStore.label;

  assert.strictEqual(resultsStore.hasOwnProperty("onFulfilledArg"), false,
    "onFulfilled should not have been called" + suffix);
  assert.strictEqual(resultsStore.hasOwnProperty("onRejectedArg"), false,
    "onRejected should not have been called" + suffix);
  assert.strictEqual(resultsStore.onCanceledArg, reason,
    "onCanceled should have been called with the specified reason" + suffix);
}
