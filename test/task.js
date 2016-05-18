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
    let onCanceledArg;

    const t = new Task(() => {});
    t.catchCancel(arg => onCanceledArg = arg);

    t.cancel(reason);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason, "onCanceled should be called with the reason");
    });
  });

  it("should cause the task to be canceled with the given reason (subscribe after)", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    const t = new Task(() => {});
    t.catchCancel(arg => onCanceledArg = arg);

    t.cancel(reason);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason, "onCanceled should be called with the reason");
    });
  });
});

describe("Task cancelation upward propagation (non-branching chains)", () => {
  it("should cancel an unresolved root task (depth 1 chain)", () => {
    const reason = { some: "reason X" };
    let onCanceledArg;
    let onCanceled2Arg;

    const root = new Task(() => {});
    root.catchCancel(arg => onCanceledArg = arg);

    const descendant = root.then();
    descendant.catchCancel(arg => onCanceled2Arg = arg);
    assert.notEqual(root, descendant, "Sanity check: the descendant should not equal the root");

    descendant.cancel(reason);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason, "root onCanceled should be called with the reason");
      assert.strictEqual(onCanceled2Arg, reason, "descendant onCanceled should be called with the reason");
    });
  });

  it("should cancel an unresolved root task (depth 3 chain)", () => {
    const reason = { some: "reason X" };
    let onCanceledArg;
    let onCanceled2Arg;

    const root = new Task(() => {});
    root.catchCancel(arg => onCanceledArg = arg);

    const descendant = root.then().then().catchCancel();
    descendant.catchCancel(arg => onCanceled2Arg = arg);
    assert.notEqual(root, descendant, "Sanity check: the descendant should not equal the root");

    descendant.cancel(reason);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason, "root onCanceled should be called with the reason");
      assert.strictEqual(onCanceled2Arg, reason, "descendant onCanceled should be called with the reason");
    });
  });
});
